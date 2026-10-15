//! Target-agnostic decoder session over a serialized `model_package`. Used by
//! the native package driver and the Wasm ABI: seeds recurrent state inputs,
//! runs the graph with demand-pull weight upload (`missing_input` surfaces the
//! next required name), threads `present_*`→`past_*` state between decode
//! steps, and folds a deterministic checkpoint checksum.

const std = @import("std");
const fp = @import("fixed_point");
const exec = @import("graph_exec");
const onnx = @import("onnx_graph");
const package_mod = @import("model_package");
const upload = @import("tensor_upload");
const brain = @import("brain_contracts");
const bridge = @import("onnx_fixed_bridge");

pub const RunStatus = enum { done, waiting };

pub const NamedTensor = struct {
    name: []u8,
    tensor: exec.Tensor,
};

pub const RecurrentSnapshot = struct {
    allocator: std.mem.Allocator,
    batch: usize,
    sequence: usize,
    past: usize,
    tensors: []NamedTensor,

    pub fn deinit(self: *RecurrentSnapshot) void {
        for (self.tensors) |*named| {
            self.allocator.free(named.name);
            named.tensor.deinit(self.allocator);
        }
        self.allocator.free(self.tensors);
        self.tensors = &.{};
    }

    pub fn destroy(self: *RecurrentSnapshot) void {
        const allocator = self.allocator;
        self.deinit();
        allocator.destroy(self);
    }

    pub fn byteSize(self: *const RecurrentSnapshot) usize {
        var total: usize = 0;
        for (self.tensors) |named| {
            const name_bytes = named.name.len;
            const dims_bytes = std.math.mul(usize, named.tensor.dims.len, @sizeOf(usize)) catch return std.math.maxInt(usize);
            const data_bytes = std.math.mul(usize, named.tensor.data.len, @sizeOf(fp.Q128_128)) catch return std.math.maxInt(usize);
            total = std.math.add(usize, total, name_bytes) catch return std.math.maxInt(usize);
            total = std.math.add(usize, total, dims_bytes) catch return std.math.maxInt(usize);
            total = std.math.add(usize, total, data_bytes) catch return std.math.maxInt(usize);
        }
        return total;
    }
};

pub const TopCandidate = struct {
    token: u32,
    value: fp.Q128_128,
};

pub const Session = struct {
    allocator: std.mem.Allocator,
    package: package_mod.Package,
    store: exec.TensorStore,
    weights: *exec.TensorStore,
    runner: exec.Runner,
    batch: usize = 1,
    sequence: usize = 1,
    past: usize = 0,
    run_error: ?anyerror = null,

    const PendingStateMove = struct {
        output_name: []const u8,
        past_name: [160]u8,
        past_len: usize,
        replaces: bool,
    };

    const AppliedStateMove = union(enum) {
        swapped: struct {
            present: *exec.Entry,
            past: *exec.Entry,
        },
        inserted: struct {
            present: *exec.Entry,
            past_name: [160]u8,
            past_len: usize,
            moved: exec.Tensor,
        },
    };

    pub fn load(allocator: std.mem.Allocator, bytes: []const u8) !*Session {
        const session = try allocator.create(Session);
        errdefer allocator.destroy(session);
        session.* = .{
            .allocator = allocator,
            .package = try package_mod.deserialize(allocator, bytes),
            .store = exec.TensorStore.init(allocator),
            .weights = undefined,
            .runner = undefined,
        };
        session.weights = &session.store;
        session.runner = exec.Runner.init(allocator, &session.store, null);
        return session;
    }

    /// Loads a session whose dynamic tensors are isolated while immutable
    /// initializer lookups fall through to `shared_store`. The shared store
    /// must outlive the session and is treated as read-only during execution.
    pub fn loadShared(allocator: std.mem.Allocator, bytes: []const u8, shared_store: *exec.TensorStore) !*Session {
        const session = try load(allocator, bytes);
        session.weights = shared_store;
        session.store.setParent(shared_store);
        return session;
    }

    pub fn setAccelerator(self: *Session, accelerator: ?exec.Accelerator) void {
        self.runner.setAccelerator(accelerator);
    }

    pub fn deinit(self: *Session) void {
        self.runner.deinit();
        self.store.deinit();
        self.package.deinit();
        self.allocator.destroy(self);
    }

    pub fn isInitializer(self: *const Session, name: []const u8) bool {
        for (self.package.inputs.items) |input| {
            if (input.is_initializer and std.mem.eql(u8, input.name, name)) return true;
        }
        return false;
    }

    fn isDynamicInput(self: *const Session, name: []const u8) bool {
        for (self.package.inputs.items) |input| {
            if (!input.is_initializer and std.mem.eql(u8, input.name, name)) return true;
        }
        return false;
    }

    /// Imports a raw initializer payload into the store using the same dtype
    /// conversion policy as the native shard resolver: FLOAT/INT32/INT64
    /// decode into q128 tensors, everything else stays a raw blob for the
    /// quantized kernels. `raw` is copied; the caller retains ownership.
    pub fn uploadWeight(self: *Session, name: []const u8, data_type: u64, dims64: []const i64, raw: []const u8) !void {
        try importWeight(self.weights, self.allocator, name, data_type, dims64, raw);
    }

    /// Zero-copy variant of `uploadWeight` for blob dtypes (all except
    /// FLOAT/INT32/INT64): the store takes ownership of `data`, which must be
    /// allocated by the session allocator (e.g. `digit_alloc`). Used on wasm32
    /// where a 254 MiB payload plus its `dupe` copy would exceed the 4 GiB
    /// linear-memory ceiling.
    pub fn uploadWeightAdopt(self: *Session, name: []const u8, data_type: u64, dims64: []const i64, data: []u8) !void {
        try importWeightAdopt(self.weights, self.allocator, name, data_type, dims64, data);
    }

    /// Imports one little-endian q128 tensor (dynamic inputs such as
    /// `inputs_embeds`) through the shared bounded decode path. Uploads cannot
    /// shadow a declared initializer or publish an undeclared host-controlled
    /// name into the execution store.
    pub fn uploadTensor(self: *Session, name: []const u8, dims64: []const u64, data: []const u8) upload.UploadError!void {
        if (self.isInitializer(name)) return error.InitializerCollision;
        if (!self.isDynamicInput(name)) return error.UndeclaredInput;
        _ = try upload.decodeQ128(&self.store, self.allocator, name, dims64, data);
    }

    /// Seeds every non-initializer graph input: `inputs_embeds` is expected to
    /// be uploaded by the caller; `attention_mask`, `position_ids`, and
    /// `num_logits_to_keep` are generated; remaining inputs (recurrent state)
    /// are zero-filled with symbolic dims mapped to batch/0.
    pub fn seedInputs(self: *Session) !void {
        try self.seedInputsInto(&self.store, self.batch, self.past, self.sequence);
    }

    fn seedInputsInto(self: *Session, store: *exec.TensorStore, batch: usize, past: usize, sequence: usize) !void {
        _ = try validateStepMetadata(batch, past, sequence);
        var needed = std.StringHashMap(void).init(self.allocator);
        defer needed.deinit();
        for (self.package.nodes.items) |node| {
            for (node.inputs.items) |name| try needed.put(name, {});
        }
        for (self.package.inputs.items) |input| {
            if (input.name.len == 0 or input.is_initializer) continue;
            if (!needed.contains(input.name)) continue;
            if (store.contains(input.name)) continue;
            if (std.mem.eql(u8, input.name, "inputs_embeds")) continue;
            if (std.mem.eql(u8, input.name, "attention_mask")) {
                try self.seedAttentionMask(store, batch, past, sequence);
            } else if (std.mem.eql(u8, input.name, "position_ids")) {
                try self.seedPositionIds(store, batch, sequence, past);
            } else if (std.mem.eql(u8, input.name, "num_logits_to_keep")) {
                try self.seedLogitsKeep(store, sequence);
            } else {
                try self.seedZeroState(store, input, batch);
            }
        }
    }

    /// Runs until the graph completes or the first input cannot be satisfied.
    /// On `.waiting`, `runner.missing_input` names the tensor the host must
    /// upload before calling again; the cursor does not advance, so the same
    /// node is retried on resume.
    pub fn runAvailable(self: *Session) !RunStatus {
        self.runner.run(self.package.nodes.items, self.package.order, null) catch |err| {
            self.run_error = err;
            if (err == error.MissingTensor and self.runner.missing_input != null) return .waiting;
            return err;
        };
        return .done;
    }

    /// Threads `present_*` outputs back to `past_*` inputs and re-seeds the
    /// per-step scalar inputs for the next token. `inputs_embeds` is left to
    /// the caller (the host uploads the next token's embedding). Resets the
    /// runner so the next `runAvailable` re-executes the whole graph — without
    /// this the cursor stays at end-of-graph and every later step is a no-op.
    pub fn advanceStep(self: *Session) !void {
        const next_past = try validateStepMetadata(self.batch, self.past, self.sequence);
        var next_attention = try self.makeAttentionMask(self.batch, next_past, 1);
        errdefer next_attention.deinit(self.allocator);
        var next_positions = try self.makePositionIds(self.batch, 1, next_past);
        errdefer next_positions.deinit(self.allocator);
        var next_keep = try self.makeLogitsKeep(1);
        errdefer next_keep.deinit(self.allocator);

        var planned = std.ArrayList(PendingStateMove).init(self.allocator);
        defer planned.deinit();
        for (self.package.outputs.items) |name| {
            var past_name: [160]u8 = undefined;
            const mapped = (try recurrentPastName(name, &past_name)) orelse continue;
            const present_entry = self.store.localSlot(name) orelse return error.StateMissing;
            if (present_entry.* != .tensor) return error.StateMissing;
            const replaces = if (self.store.localSlot(mapped)) |past_entry| blk: {
                if (past_entry.* != .tensor) return error.StateMissing;
                break :blk true;
            } else false;
            for (planned.items) |existing| {
                if (std.mem.eql(u8, existing.past_name[0..existing.past_len], mapped)) return error.DuplicateStateOutput;
            }
            try planned.append(.{
                .output_name = name,
                .past_name = past_name,
                .past_len = mapped.len,
                .replaces = replaces,
            });
        }

        var applied = std.ArrayList(AppliedStateMove).init(self.allocator);
        defer applied.deinit();
        errdefer self.rollbackStateMoves(applied.items);
        for (planned.items) |move| {
            const present_entry = self.store.localSlot(move.output_name).?;
            if (move.replaces) {
                const past_entry = self.store.localSlot(move.past_name[0..move.past_len]).?;
                std.mem.swap(exec.Tensor, &past_entry.tensor, &present_entry.tensor);
                applied.append(.{ .swapped = .{ .present = present_entry, .past = past_entry } }) catch |err| {
                    std.mem.swap(exec.Tensor, &past_entry.tensor, &present_entry.tensor);
                    return err;
                };
            } else {
                const moved = present_entry.tensor;
                present_entry.tensor = try exec.Tensor.init(self.allocator, &.{});
                self.store.putTensor(move.past_name[0..move.past_len], moved) catch |err| {
                    present_entry.tensor.deinit(self.allocator);
                    present_entry.tensor = moved;
                    return err;
                };
                applied.append(.{ .inserted = .{
                    .present = present_entry,
                    .past_name = move.past_name,
                    .past_len = move.past_len,
                    .moved = moved,
                } }) catch |err| {
                    var removed = self.store.takeLocal(move.past_name[0..move.past_len]).?;
                    present_entry.tensor.deinit(self.allocator);
                    switch (removed) {
                        .tensor => |tensor| present_entry.tensor = tensor,
                        else => removed.deinit(self.allocator),
                    }
                    return err;
                };
            }
        }

        try self.store.putTensor("attention_mask", next_attention);
        next_attention = .{ .data = &.{}, .dims = &.{} };
        try self.store.putTensor("position_ids", next_positions);
        next_positions = .{ .data = &.{}, .dims = &.{} };
        try self.store.putTensor("num_logits_to_keep", next_keep);
        next_keep = .{ .data = &.{}, .dims = &.{} };

        self.past = next_past;
        self.sequence = 1;
        self.resetExecution();
    }

    /// Resets runner cursor/checkpoint state so the whole graph re-executes.
    /// Required when a session is pinned and re-bound to a new base snapshot
    /// instead of being recreated per trajectory.
    pub fn resetExecution(self: *Session) void {
        self.runner.cursor = 0;
        self.runner.executed = 0;
        self.runner.missing_input = null;
        self.runner.failed_node = null;
        self.runner.failed_op = null;
        self.runner.checkpoints.clearRetainingCapacity();
        self.runner.pending_checksums.clearRetainingCapacity();
        self.runner.clearStateShadows();
        self.run_error = null;
    }

    /// Re-seeds the per-step scalar inputs unconditionally. `seedInputs` skips
    /// names already present in the store, so a pinned session must call this
    /// after `restoreRecurrentState` to refresh `attention_mask`,
    /// `position_ids`, and `num_logits_to_keep` for the restored metadata.
    pub fn refreshStepInputs(self: *Session) !void {
        try self.seedStepInputsInto(&self.store, self.batch, self.past, self.sequence);
    }

    fn seedStepInputsInto(self: *Session, store: *exec.TensorStore, batch: usize, past: usize, sequence: usize) !void {
        _ = try validateStepMetadata(batch, past, sequence);
        try self.seedAttentionMask(store, batch, past, sequence);
        try self.seedPositionIds(store, batch, sequence, past);
        try self.seedLogitsKeep(store, sequence);
    }

    /// Deep-copies the recurrent `past_*` tensors and sequence metadata needed
    /// to resume this trajectory in a fresh session. Intermediate node outputs
    /// and shared weights are deliberately excluded.
    pub fn captureRecurrentState(self: *Session) !*RecurrentSnapshot {
        return self.captureRecurrentStateUsing(self.allocator);
    }

    /// Captures state with a caller-owned allocator so the snapshot can outlive
    /// a temporary per-trajectory allocation budget.
    pub fn captureRecurrentStateUsing(self: *Session, allocator: std.mem.Allocator) !*RecurrentSnapshot {
        const snapshot = try allocator.create(RecurrentSnapshot);
        errdefer allocator.destroy(snapshot);
        var tensors = std.ArrayList(NamedTensor).init(allocator);
        errdefer {
            for (tensors.items) |*named| {
                allocator.free(named.name);
                named.tensor.deinit(allocator);
            }
            tensors.deinit();
        }
        for (self.store.tensors.items) |named| {
            if (!std.mem.startsWith(u8, named.name, "past_")) continue;
            const source = switch (named.entry) {
                .tensor => |*tensor| tensor,
                .blob => continue,
            };
            try source.validate();
            var copy = try exec.Tensor.init(allocator, source.dims);
            errdefer copy.deinit(allocator);
            @memcpy(copy.data, source.data);
            const name = try allocator.dupe(u8, named.name);
            errdefer allocator.free(name);
            try tensors.append(.{ .name = name, .tensor = copy });
        }
        snapshot.* = .{
            .allocator = allocator,
            .batch = self.batch,
            .sequence = self.sequence,
            .past = self.past,
            .tensors = try tensors.toOwnedSlice(),
        };
        return snapshot;
    }

    /// Restores a recurrent snapshot into this session's local dynamic store,
    /// then regenerates scalar per-step inputs. The caller uploads
    /// `inputs_embeds` for the next branch token.
    pub fn restoreRecurrentState(self: *Session, snapshot: *const RecurrentSnapshot) !void {
        try self.validateSnapshot(snapshot);
        var next_store = try self.cloneLocalStore();
        errdefer next_store.deinit();
        for (snapshot.tensors) |named| {
            var copy = try exec.Tensor.init(self.allocator, named.tensor.dims);
            errdefer copy.deinit(self.allocator);
            @memcpy(copy.data, named.tensor.data);
            try next_store.putTensor(named.name, copy);
        }
        try self.seedInputsInto(&next_store, snapshot.batch, snapshot.past, snapshot.sequence);
        try self.seedStepInputsInto(&next_store, snapshot.batch, snapshot.past, snapshot.sequence);

        var previous_store = self.store;
        self.store = next_store;
        self.batch = snapshot.batch;
        self.sequence = snapshot.sequence;
        self.past = snapshot.past;
        self.runner.clearStateShadows();
        self.run_error = null;
        previous_store.deinit();
    }

    fn validateSnapshot(self: *Session, snapshot: *const RecurrentSnapshot) !void {
        _ = try validateStepMetadata(snapshot.batch, snapshot.past, snapshot.sequence);
        var names = std.StringHashMap(void).init(self.allocator);
        defer names.deinit();
        for (snapshot.tensors) |named| {
            if (named.name.len == 0 or !std.mem.startsWith(u8, named.name, "past_")) return error.InvalidSnapshotState;
            if (names.contains(named.name)) return error.DuplicateSnapshotState;
            try names.put(named.name, {});
            try named.tensor.validate();
        }
    }

    fn cloneLocalStore(self: *Session) !exec.TensorStore {
        var clone = exec.TensorStore.init(self.allocator);
        if (self.store.parent) |parent| clone.setParent(parent);
        errdefer clone.deinit();
        for (self.store.tensors.items) |named| {
            switch (named.entry) {
                .tensor => |*source| {
                    try source.validate();
                    var copy = try exec.Tensor.init(self.allocator, source.dims);
                    errdefer copy.deinit(self.allocator);
                    @memcpy(copy.data, source.data);
                    try clone.putTensor(named.name, copy);
                },
                .blob => |*source| {
                    const data = try self.allocator.dupe(u8, source.data);
                    const dims = self.allocator.dupe(usize, source.dims) catch |err| {
                        self.allocator.free(data);
                        return err;
                    };
                    try clone.putBlob(named.name, .{
                        .data = data,
                        .dims = dims,
                        .data_type = source.data_type,
                    });
                },
            }
        }
        return clone;
    }

    /// Returns the ordered highest-scoring logits. Ties resolve to the lower
    /// token ID because the scan only replaces a candidate on a strict `>`.
    pub fn topLogits(self: *Session, count: usize) ![]TopCandidate {
        const logits = self.store.getTensor("logits") orelse return error.MissingTensor;
        const limit = @min(count, logits.data.len);
        var output = try self.allocator.alloc(TopCandidate, limit);
        for (output) |*candidate| candidate.* = .{ .token = 0, .value = fp.Q128_128.fromRaw(std.math.minInt(i256)) };
        for (logits.data, 0..) |value, index| {
            if (limit == 0 or value.raw <= output[limit - 1].value.raw) continue;
            var slot = limit;
            while (slot > 0 and value.raw > output[slot - 1].value.raw) : (slot -= 1) {}
            if (index > std.math.maxInt(u32)) return error.TokenIdOverflow;
            var shift = limit - 1;
            while (shift > slot) : (shift -= 1) output[shift] = output[shift - 1];
            output[slot] = .{ .token = @intCast(index), .value = value };
        }
        return output;
    }

    pub fn dynamicByteSize(self: *const Session) usize {
        return self.store.localByteSize();
    }

    pub fn sharedWeightByteSize(self: *const Session) usize {
        return self.weights.localByteSize();
    }

    pub fn argmaxLogits(self: *Session) ?usize {
        const logits = self.store.getTensor("logits") orelse return null;
        var best_index: usize = 0;
        var best: i256 = std.math.minInt(i256);
        for (logits.data, 0..) |value, index| {
            if (value.raw > best) {
                best = value.raw;
                best_index = index;
            }
        }
        return best_index;
    }

    /// Converts the current E5 session boundary into a compact two-organ
    /// observation. The E6 fields start neutral; the metacognition organ owns
    /// their later evaluation and must not mutate the model session directly.
    ///
    /// `observed_summary` encodes whole-distribution statistics of the full
    /// logit tensor (mirroring the upstream introspect() contract that consumed
    /// entire lattice activations), not an arbitrary slice:
    ///   [0] top-1 logit      [1] top-2 logit     [2] top-1 − top-2 margin
    ///   [3] argmax id / 4096 [4] mean logit      [5] max − min range
    ///   [6] count above mean (>>11)              [7] mean absolute deviation
    pub fn observation(self: *Session, trajectory_id: brain.TrajectoryId, step: u64) !brain.ModelObservation {
        const logits = self.store.getTensor("logits") orelse return error.MissingTensor;
        const argmax = self.argmaxLogits() orelse return error.MissingTensor;
        if (argmax > std.math.maxInt(u32)) return error.TokenIdOverflow;
        const fold = self.checksumFold();
        const summary = try logitSummary(logits.data, argmax);
        return .{
            .trajectory_id = trajectory_id,
            .step = step,
            .input_token = 0,
            .argmax_token = @intCast(argmax),
            .checkpoint_fold = fold,
            .logits_checksum = logits.checksum(),
            .e5_state_checksum = fold,
            .coherence = fp.Q128_128.zero,
            .uncertainty = fp.Q128_128.zero,
            .recurrent_state_version = self.past,
            .observed_summary = summary,
        };
    }

    /// Returns the 8-channel `logitSummary` contract for the current logits —
    /// the E6 observer-grid input consumed by `e6_channel_grid.analyze`.
    pub fn channelSummary(self: *Session) ![8]fp.Q128_128 {
        const logits = self.store.getTensor("logits") orelse return error.MissingTensor;
        const argmax = self.argmaxLogits() orelse return error.MissingTensor;
        return logitSummary(logits.data, argmax);
    }

    /// Computes the compact E6 channel summary over a full logit tensor.
    /// Deterministic whole-distribution statistics; all arithmetic is integer.
    fn logitSummary(data: []const fp.Q128_128, argmax: usize) ![8]fp.Q128_128 {
        var summary = [_]fp.Q128_128{fp.Q128_128.zero} ** 8;
        const n = data.len;
        if (n == 0) return summary;
        var top1: i256 = std.math.minInt(i256);
        var top2: i256 = std.math.minInt(i256);
        var bottom: i256 = std.math.maxInt(i256);
        var sum: i256 = 0;
        for (data) |value| {
            const raw = value.raw;
            sum = std.math.add(i256, sum, raw) catch return error.IntegerOverflow;
            if (raw < bottom) bottom = raw;
            if (raw > top1) {
                top2 = top1;
                top1 = raw;
            } else if (raw > top2) {
                top2 = raw;
            }
        }
        if (n == 1) top2 = bottom;
        const mean = @divTrunc(sum, @as(i256, @intCast(n)));
        var dev_sum: i256 = 0;
        var above_mean: i256 = 0;
        for (data) |value| {
            const delta = std.math.sub(i256, value.raw, mean) catch return error.IntegerOverflow;
            const magnitude = if (delta < 0) std.math.negate(delta) catch return error.IntegerOverflow else delta;
            dev_sum = std.math.add(i256, dev_sum, magnitude) catch return error.IntegerOverflow;
            if (value.raw > mean) above_mean = std.math.add(i256, above_mean, 1) catch return error.IntegerOverflow;
        }
        summary[0] = fp.Q128_128.fromRaw(top1);
        summary[1] = fp.Q128_128.fromRaw(top2);
        summary[2] = fp.Q128_128.fromRaw(std.math.sub(i256, top1, top2) catch return error.IntegerOverflow);
        summary[3] = fp.Q128_128.fromInt(@intCast(@divTrunc(@as(i256, @intCast(argmax)), 4096)));
        summary[4] = fp.Q128_128.fromRaw(mean);
        summary[5] = fp.Q128_128.fromRaw(std.math.sub(i256, top1, bottom) catch return error.IntegerOverflow);
        summary[6] = fp.Q128_128.fromInt(std.math.cast(i64, above_mean >> 11) orelse return error.IntegerOverflow);
        summary[7] = fp.Q128_128.fromRaw(@divTrunc(dev_sum, @as(i256, @intCast(n))));
        return summary;
    }

    /// Folds all recorded per-node output checksums with the same rule as the
    /// shared graph fixture, for cross-target parity comparison.
    pub fn checksumFold(self: *const Session) u256 {
        var checksum: u256 = 0;
        for (self.runner.checkpoints.items) |checkpoint| {
            checksum = (checksum +% checkpoint.checksum) *% 0x9e3779b97f4a7c15;
        }
        return checksum;
    }

    fn recurrentPastName(name: []const u8, buffer: *[160]u8) !?[]const u8 {
        const len = if (std.mem.startsWith(u8, name, "present_conv."))
            (std.fmt.bufPrint(buffer, "past_conv.{s}", .{name["present_conv.".len..]}) catch return error.NameTooLong).len
        else if (std.mem.startsWith(u8, name, "present_recurrent."))
            (std.fmt.bufPrint(buffer, "past_recurrent.{s}", .{name["present_recurrent.".len..]}) catch return error.NameTooLong).len
        else if (std.mem.startsWith(u8, name, "present."))
            (std.fmt.bufPrint(buffer, "past_key_values.{s}", .{name["present.".len..]}) catch return error.NameTooLong).len
        else
            return null;
        return buffer[0..len];
    }

    fn rollbackStateMoves(self: *Session, moves: []const AppliedStateMove) void {
        var index = moves.len;
        while (index > 0) {
            index -= 1;
            switch (moves[index]) {
                .swapped => |move| std.mem.swap(exec.Tensor, &move.past.tensor, &move.present.tensor),
                .inserted => |move| {
                    move.present.tensor.deinit(self.allocator);
                    if (self.store.takeLocal(move.past_name[0..move.past_len])) |removed_value| {
                        var removed = removed_value;
                        switch (removed) {
                            .tensor => |tensor| move.present.tensor = tensor,
                            else => removed.deinit(self.allocator),
                        }
                    }
                },
            }
        }
    }

    fn validateStepMetadata(batch: usize, past: usize, sequence: usize) !usize {
        if (batch == 0) return error.InvalidBatch;
        if (sequence == 0 or sequence > std.math.maxInt(i64)) return error.InvalidSequence;
        const total = std.math.add(usize, past, sequence) catch return error.StepOverflow;
        if (total > std.math.maxInt(i64)) return error.StepOverflow;
        return total;
    }

    fn makeAttentionMask(self: *Session, batch: usize, past: usize, sequence: usize) !exec.Tensor {
        const total = try validateStepMetadata(batch, past, sequence);
        var tensor = try exec.Tensor.init(self.allocator, &.{ batch, total });
        errdefer tensor.deinit(self.allocator);
        @memset(tensor.data, fp.Q128_128.one);
        return tensor;
    }

    fn seedAttentionMask(self: *Session, store: *exec.TensorStore, batch: usize, past: usize, sequence: usize) !void {
        var tensor = try self.makeAttentionMask(batch, past, sequence);
        errdefer tensor.deinit(self.allocator);
        try store.putTensor("attention_mask", tensor);
    }

    fn makePositionIds(self: *Session, batch: usize, sequence: usize, past: usize) !exec.Tensor {
        _ = try validateStepMetadata(batch, past, sequence);
        var tensor = try exec.Tensor.init(self.allocator, &.{ 3, batch, sequence });
        errdefer tensor.deinit(self.allocator);
        for (tensor.data, 0..) |*value, index| {
            const position = (index % sequence) + past;
            value.* = fp.Q128_128.fromInt(@intCast(position));
        }
        return tensor;
    }

    fn seedPositionIds(self: *Session, store: *exec.TensorStore, batch: usize, sequence: usize, past: usize) !void {
        var tensor = try self.makePositionIds(batch, sequence, past);
        errdefer tensor.deinit(self.allocator);
        try store.putTensor("position_ids", tensor);
    }

    fn makeLogitsKeep(self: *Session, sequence: usize) !exec.Tensor {
        if (sequence == 0 or sequence > std.math.maxInt(i64)) return error.InvalidSequence;
        var tensor = try exec.Tensor.init(self.allocator, &.{});
        errdefer tensor.deinit(self.allocator);
        tensor.data[0] = fp.Q128_128.fromInt(@intCast(sequence));
        return tensor;
    }

    fn seedLogitsKeep(self: *Session, store: *exec.TensorStore, sequence: usize) !void {
        var tensor = try self.makeLogitsKeep(sequence);
        errdefer tensor.deinit(self.allocator);
        try store.putTensor("num_logits_to_keep", tensor);
    }

    fn seedZeroState(self: *Session, store: *exec.TensorStore, input: package_mod.InputInfo, batch: usize) !void {
        var dims_buf: [exec.MAX_RANK]usize = undefined;
        if (input.dims.len > exec.MAX_RANK) return error.UnsupportedShape;
        var unknown_seen: usize = 0;
        for (input.dims, 0..) |dim, index| {
            if (dim >= 0) {
                if (dim > std.math.maxInt(usize)) return error.UnsupportedShape;
                dims_buf[index] = @intCast(dim);
                continue;
            }
            unknown_seen += 1;
            dims_buf[index] = if (unknown_seen == 1) batch else 0;
        }
        var tensor = try exec.Tensor.init(self.allocator, dims_buf[0..input.dims.len]);
        errdefer tensor.deinit(self.allocator);
        @memset(tensor.data, fp.Q128_128.zero);
        try store.putTensor(input.name, tensor);
    }
};

/// Converts a raw external-initializer payload into a store entry using the
/// same dtype policy as the native shard resolver. `raw` is copied.
pub fn importWeight(
    store: *exec.TensorStore,
    allocator: std.mem.Allocator,
    name: []const u8,
    data_type: u64,
    dims64: []const i64,
    raw: []const u8,
) !void {
    var dims_buf: [exec.MAX_RANK]usize = undefined;
    if (dims64.len > exec.MAX_RANK) return error.UnsupportedShape;
    for (dims64, 0..) |dim, index| {
        if (dim < 0) return error.InvalidDimension;
        if (dim > std.math.maxInt(usize)) return error.UnsupportedShape;
        dims_buf[index] = @intCast(dim);
    }
    const dims = dims_buf[0..dims64.len];
    const elements = try exec.Tensor.elementCount(dims);
    if (bridge.isCanonicalTensorDType(data_type)) {
        bridge.validateLength(data_type, elements, raw) catch return error.ExternalDataOutOfBounds;
        var tensor = try exec.Tensor.init(allocator, dims);
        errdefer tensor.deinit(allocator);
        for (tensor.data, 0..) |*destination, index| {
            destination.* = bridge.decodeAt(data_type, raw, index) catch return error.ExternalDataOutOfBounds;
        }
        try store.putTensor(name, tensor);
    } else {
        // Quantized and other dtypes remain raw blobs for their native kernels.
        std.mem.doNotOptimizeAway(elements);
        const data = try allocator.dupe(u8, raw);
        const dims_copy = allocator.dupe(usize, dims) catch |err| {
            allocator.free(data);
            return err;
        };
        try store.putBlob(name, .{
            .data = data,
            .dims = dims_copy,
            .data_type = data_type,
        });
    }
}

/// Adopt variant of `importWeight`: for blob dtypes the store takes ownership
/// of `data` (no copy); `data` must have been allocated by `allocator` and the
/// caller must not free it. Tensor dtypes (FLOAT/INT32/INT64) need a decode
/// step and are rejected — callers must use `importWeight` for those.
pub fn importWeightAdopt(
    store: *exec.TensorStore,
    allocator: std.mem.Allocator,
    name: []const u8,
    data_type: u64,
    dims64: []const i64,
    data: []u8,
) !void {
    var dims_buf: [exec.MAX_RANK]usize = undefined;
    if (dims64.len > exec.MAX_RANK) return error.UnsupportedShape;
    for (dims64, 0..) |dim, index| {
        if (dim < 0) return error.InvalidDimension;
        if (dim > std.math.maxInt(usize)) return error.UnsupportedShape;
        dims_buf[index] = @intCast(dim);
    }
    switch (data_type) {
        1, 6, 7 => return error.AdoptUnsupportedDtype,
        else => {
            const elements = try exec.Tensor.elementCount(dims_buf[0..dims64.len]);
            std.mem.doNotOptimizeAway(elements);
            const dims = allocator.dupe(usize, dims_buf[0..dims64.len]) catch |err| {
                allocator.free(data);
                return err;
            };
            try store.putBlob(name, .{
                .data = data,
                .dims = dims,
                .data_type = data_type,
            });
        },
    }
}

test "importWeightAdopt stores the caller buffer zero-copy and frees it" {
    const allocator = std.testing.allocator;
    var store = exec.TensorStore.init(allocator);
    defer store.deinit();

    const data = try allocator.alloc(u8, 6);
    @memcpy(data, &[_]u8{ 1, 2, 3, 4, 5, 6 });
    try importWeightAdopt(&store, allocator, "w_quant", 2, &.{ 2, 3 }, data);
    const blob = store.getBlob("w_quant").?;
    // Zero-copy: the stored slice IS the caller's buffer, not a dupe.
    try std.testing.expectEqual(@intFromPtr(data.ptr), @intFromPtr(blob.data.ptr));
    try std.testing.expectEqualSlices(u8, data, blob.data);
    try std.testing.expectEqualSlices(usize, &.{ 2, 3 }, blob.dims);
    try std.testing.expectEqual(@as(u64, 2), blob.data_type);
    // store.deinit frees the adopted buffer — testing.allocator flags any leak.
}

test "importWeightAdopt rejects tensor dtypes and bad dims" {
    const allocator = std.testing.allocator;
    var store = exec.TensorStore.init(allocator);
    defer store.deinit();

    const data = try allocator.alloc(u8, 8);
    defer allocator.free(data);
    try std.testing.expectError(
        error.AdoptUnsupportedDtype,
        importWeightAdopt(&store, allocator, "scales", 1, &.{2}, data),
    );
    try std.testing.expectError(
        error.InvalidDimension,
        importWeightAdopt(&store, allocator, "neg", 2, &.{-1}, data),
    );
    const too_many = [_]i64{1} ** (exec.MAX_RANK + 1);
    try std.testing.expectError(
        error.UnsupportedShape,
        importWeightAdopt(&store, allocator, "rank", 2, &too_many, data),
    );
    try std.testing.expect(!store.contains("scales"));
}

fn packageWithInputs(
    allocator: std.mem.Allocator,
    dynamic_inputs: []const []const u8,
    initializer_names: []const []const u8,
) ![]u8 {
    var graph = onnx.Graph{
        .allocator = allocator,
        .nodes = std.ArrayList(onnx.Node).init(allocator),
        .inputs = std.ArrayList(onnx.ValueInfo).init(allocator),
        .outputs = std.ArrayList(onnx.ValueInfo).init(allocator),
    };
    defer graph.deinit();
    var initializers = std.StringHashMap(void).init(allocator);
    defer initializers.deinit();
    for (dynamic_inputs) |name| {
        const copy = try allocator.dupe(u8, name);
        errdefer allocator.free(copy);
        try graph.inputs.append(.{ .allocator = allocator, .name = copy });
    }
    for (initializer_names) |name| {
        const copy = try allocator.dupe(u8, name);
        errdefer allocator.free(copy);
        try graph.inputs.append(.{ .allocator = allocator, .name = copy });
        try initializers.put(name, {});
    }
    return package_mod.serialize(allocator, &graph, &.{}, &initializers);
}

fn packageWithOutputs(allocator: std.mem.Allocator, outputs: []const []const u8) ![]u8 {
    var graph = onnx.Graph{
        .allocator = allocator,
        .nodes = std.ArrayList(onnx.Node).init(allocator),
        .inputs = std.ArrayList(onnx.ValueInfo).init(allocator),
        .outputs = std.ArrayList(onnx.ValueInfo).init(allocator),
    };
    defer graph.deinit();
    for (outputs) |name| {
        try graph.outputs.append(.{
            .allocator = allocator,
            .name = try allocator.dupe(u8, name),
        });
    }
    var initializers = std.StringHashMap(void).init(allocator);
    defer initializers.deinit();
    return package_mod.serialize(allocator, &graph, &.{}, &initializers);
}

fn emptyPackage(allocator: std.mem.Allocator) ![]u8 {
    return packageWithOutputs(allocator, &.{});
}

test "uploadTensor admits only declared dynamic inputs" {
    const allocator = std.testing.allocator;
    const package = try packageWithInputs(allocator, &.{"inputs_embeds"}, &.{"model.weight"});
    defer allocator.free(package);
    const session = try Session.load(allocator, package);
    defer session.deinit();

    const dims = [_]u64{1};
    var data: [32]u8 = undefined;
    @memcpy(&data, &fp.Q128_128.fromInt(3).toLittleEndian());
    try session.uploadTensor("inputs_embeds", &dims, &data);
    try std.testing.expectEqual(fp.Q128_128.fromInt(3).raw, session.store.getTensor("inputs_embeds").?.data[0].raw);
    try std.testing.expectError(
        error.InitializerCollision,
        session.uploadTensor("model.weight", &dims, &data),
    );
    try std.testing.expectError(
        error.UndeclaredInput,
        session.uploadTensor("host.control", &dims, &data),
    );
    try std.testing.expect(!session.store.contains("model.weight"));
    try std.testing.expect(!session.store.contains("host.control"));
}

test "advanceStep validates the full recurrent output domain before moving state" {
    const allocator = std.testing.allocator;
    const package = try packageWithOutputs(allocator, &.{ "present.a", "present.b" });
    defer allocator.free(package);
    const session = try Session.load(allocator, package);
    defer session.deinit();

    const first = try exec.Tensor.init(allocator, &.{1});
    first.data[0] = fp.Q128_128.fromInt(11);
    try session.store.putTensor("present.a", first);
    try std.testing.expectError(error.StateMissing, session.advanceStep());
    try std.testing.expectEqual(@as(usize, 0), session.past);
    try std.testing.expectEqual(@as(usize, 1), session.sequence);
    try std.testing.expectEqual(fp.Q128_128.fromInt(11).raw, session.store.getTensor("present.a").?.data[0].raw);
    try std.testing.expect(session.store.getTensor("past_key_values.a") == null);

    const second = try exec.Tensor.init(allocator, &.{1});
    second.data[0] = fp.Q128_128.fromInt(22);
    try session.store.putTensor("present.b", second);
    try session.advanceStep();
    try std.testing.expectEqual(@as(usize, 1), session.past);
    try std.testing.expectEqual(@as(usize, 1), session.sequence);
    try std.testing.expectEqual(fp.Q128_128.fromInt(11).raw, session.store.getTensor("past_key_values.a").?.data[0].raw);
    try std.testing.expectEqual(fp.Q128_128.fromInt(22).raw, session.store.getTensor("past_key_values.b").?.data[0].raw);
    try std.testing.expectEqualSlices(usize, &.{ 1, 2 }, session.store.getTensor("attention_mask").?.dims);
}

test "advanceStep rejects duplicate recurrent output names before moving state" {
    const allocator = std.testing.allocator;
    const package = try packageWithOutputs(allocator, &.{ "present.a", "present.a" });
    defer allocator.free(package);
    const session = try Session.load(allocator, package);
    defer session.deinit();

    const state = try exec.Tensor.init(allocator, &.{1});
    state.data[0] = fp.Q128_128.fromInt(17);
    try session.store.putTensor("present.a", state);
    try std.testing.expectError(error.DuplicateStateOutput, session.advanceStep());
    try std.testing.expectEqual(@as(usize, 0), session.past);
    try std.testing.expectEqual(fp.Q128_128.fromInt(17).raw, session.store.getTensor("present.a").?.data[0].raw);
    try std.testing.expect(session.store.getTensor("past_key_values.a") == null);
}

test "restoreRecurrentState validates snapshots and refreshes stale step inputs" {
    const allocator = std.testing.allocator;
    const package = try emptyPackage(allocator);
    defer allocator.free(package);
    const source = try Session.load(allocator, package);
    source.sequence = 7;
    source.past = 11;
    const state = try exec.Tensor.init(allocator, &.{ 1, 2 });
    state.data[0] = fp.Q128_128.fromInt(42);
    state.data[1] = fp.Q128_128.fromInt(-7);
    try source.store.putTensor("past_recurrent.0", state);
    const snapshot = try source.captureRecurrentState();
    defer snapshot.destroy();
    source.deinit();

    const branch = try Session.load(allocator, package);
    defer branch.deinit();
    const stale_mask = try exec.Tensor.init(allocator, &.{ 1, 1 });
    try branch.store.putTensor("attention_mask", stale_mask);
    try branch.restoreRecurrentState(snapshot);
    try std.testing.expectEqualSlices(usize, &.{ 1, 18 }, branch.store.getTensor("attention_mask").?.dims);
    try std.testing.expectEqual(fp.Q128_128.fromInt(7).raw, branch.store.getTensor("num_logits_to_keep").?.data[0].raw);

    const old_sequence = snapshot.sequence;
    snapshot.sequence = 0;
    try std.testing.expectError(error.InvalidSequence, branch.restoreRecurrentState(snapshot));
    snapshot.sequence = old_sequence;
    const original_data = snapshot.tensors[0].tensor.data;
    snapshot.tensors[0].tensor.data = original_data[0..1];
    try std.testing.expectError(error.InvalidTensorShape, branch.restoreRecurrentState(snapshot));
    snapshot.tensors[0].tensor.data = original_data;
    try std.testing.expectEqual(@as(usize, 11), branch.past);
}

test "session boundaries reject overflowing shapes and inconsistent tensors" {
    const allocator = std.testing.allocator;
    var store = exec.TensorStore.init(allocator);
    defer store.deinit();

    try std.testing.expectError(error.TensorTooLarge, exec.Tensor.init(allocator, &.{ std.math.maxInt(usize), 2 }));
    try std.testing.expectError(
        error.TensorTooLarge,
        importWeight(&store, allocator, "overflow", 2, &.{ std.math.maxInt(i64), 3 }, &.{}),
    );

    var malformed = exec.Tensor{
        .data = try allocator.alloc(fp.Q128_128, 1),
        .dims = try allocator.dupe(usize, &.{2}),
    };
    defer malformed.deinit(allocator);
    try std.testing.expectError(error.InvalidTensorShape, store.putTensor("malformed", malformed));
    try std.testing.expect(!store.contains("malformed"));

    const extremes = [_]fp.Q128_128{
        fp.Q128_128.fromRaw(std.math.maxInt(i256)),
        fp.Q128_128.fromRaw(std.math.maxInt(i256)),
    };
    try std.testing.expectError(error.IntegerOverflow, Session.logitSummary(&extremes, 0));
}

test "shared sessions isolate dynamic state and snapshots survive session teardown" {
    const allocator = std.testing.allocator;
    const package = try emptyPackage(allocator);
    defer allocator.free(package);

    var shared = exec.TensorStore.init(allocator);
    defer shared.deinit();
    const source = try Session.loadShared(allocator, package, &shared);
    source.sequence = 7;
    source.past = 11;
    const state = try exec.Tensor.init(allocator, &.{ 1, 2 });
    state.data[0] = fp.Q128_128.fromInt(42);
    state.data[1] = fp.Q128_128.fromInt(-7);
    try source.store.putTensor("past_recurrent.0", state);
    const logits = try exec.Tensor.init(allocator, &.{4});
    logits.data[0] = fp.Q128_128.fromInt(1);
    logits.data[1] = fp.Q128_128.fromInt(9);
    logits.data[2] = fp.Q128_128.fromInt(4);
    logits.data[3] = fp.Q128_128.fromInt(9);
    try source.store.putTensor("logits", logits);
    const top = try source.topLogits(2);
    defer allocator.free(top);
    try std.testing.expectEqual(@as(u32, 1), top[0].token);
    try std.testing.expectEqual(@as(u32, 3), top[1].token);
    const snapshot = try source.captureRecurrentState();
    defer snapshot.destroy();
    source.deinit();

    const branch = try Session.loadShared(allocator, package, &shared);
    defer branch.deinit();
    try std.testing.expect(branch.store.parent == &shared);
    try branch.restoreRecurrentState(snapshot);
    try std.testing.expectEqual(@as(usize, 7), branch.sequence);
    try std.testing.expectEqual(@as(usize, 11), branch.past);
    const restored = branch.store.getTensor("past_recurrent.0").?;
    try std.testing.expectEqual(fp.Q128_128.fromInt(42).raw, restored.data[0].raw);
    restored.data[0] = fp.Q128_128.fromInt(5);
    try std.testing.expectEqual(fp.Q128_128.fromInt(42).raw, snapshot.tensors[0].tensor.data[0].raw);
    try std.testing.expect(branch.dynamicByteSize() > 0);
}

test "logitSummary encodes whole-distribution statistics" {
    // Vocabulary of 5: values {10, 8, -2, 0, 4}; argmax index 0.
    const data = [_]fp.Q128_128{
        fp.Q128_128.fromInt(10),
        fp.Q128_128.fromInt(8),
        fp.Q128_128.fromInt(-2),
        fp.Q128_128.fromInt(0),
        fp.Q128_128.fromInt(4),
    };
    const summary = try Session.logitSummary(&data, 0);
    try std.testing.expectEqual(fp.Q128_128.fromInt(10).raw, summary[0].raw); // top1
    try std.testing.expectEqual(fp.Q128_128.fromInt(8).raw, summary[1].raw); // top2
    try std.testing.expectEqual(fp.Q128_128.fromInt(2).raw, summary[2].raw); // margin
    try std.testing.expectEqual(fp.Q128_128.fromInt(0).raw, summary[3].raw); // argmax/4096
    try std.testing.expectEqual(fp.Q128_128.fromInt(4).raw, summary[4].raw); // mean = 20/5
    try std.testing.expectEqual(fp.Q128_128.fromInt(12).raw, summary[5].raw); // range 10-(-2)
    try std.testing.expectEqual(fp.Q128_128.fromInt(0).raw, summary[6].raw); // 2 above-mean >> 11
    // mean abs deviation = (6+4+6+4+0)/5 = 4
    try std.testing.expectEqual(fp.Q128_128.fromInt(4).raw, summary[7].raw);
}

test "logitSummary empty and singleton inputs" {
    const empty = try Session.logitSummary(&.{}, 0);
    for (empty) |v| try std.testing.expectEqual(@as(i256, 0), v.raw);
    const one = [_]fp.Q128_128{fp.Q128_128.fromInt(7)};
    const s = try Session.logitSummary(&one, 0);
    try std.testing.expectEqual(fp.Q128_128.fromInt(7).raw, s[0].raw);
    try std.testing.expectEqual(fp.Q128_128.fromInt(7).raw, s[1].raw); // top2 falls back
    try std.testing.expectEqual(fp.Q128_128.fromInt(0).raw, s[2].raw);
}
