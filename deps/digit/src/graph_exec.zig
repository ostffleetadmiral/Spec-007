const std = @import("std");
const builtin = @import("builtin");
const fp = @import("fixed_point");
const ops = @import("tensor_ops");
const shapes = @import("shape_ops");
const norms = @import("skip_layer_norm");
const conv = @import("causal_conv");
const linear_attention = @import("linear_attention");
const worker_pool = @import("worker_pool");
const onnx = @import("onnx_graph");

pub const MAX_RANK = 8;
const supports_timer = switch (builtin.target.cpu.arch) {
    .wasm32, .wasm64 => false,
    else => true,
};
const supports_threads = switch (builtin.target.cpu.arch) {
    .wasm32, .wasm64 => false,
    else => true,
};
const CHECKSUM_WORKERS = 8;

fn saturatingAdd(left: usize, right: usize) usize {
    return std.math.add(usize, left, right) catch std.math.maxInt(usize);
}

fn saturatingMul(left: usize, right: usize) usize {
    return std.math.mul(usize, left, right) catch std.math.maxInt(usize);
}

pub const Tensor = struct {
    data: []fp.Q128_128,
    dims: []usize,

    pub fn elementCount(dims: []const usize) !usize {
        if (dims.len > MAX_RANK) return error.UnsupportedShape;
        var count: usize = 1;
        for (dims) |dim| count = std.math.mul(usize, count, dim) catch return error.TensorTooLarge;
        return count;
    }

    pub fn validate(self: *const Tensor) !void {
        if (self.data.len != try elementCount(self.dims)) return error.InvalidTensorShape;
    }

    pub fn init(allocator: std.mem.Allocator, dims: []const usize) !Tensor {
        const count = try elementCount(dims);
        const data = try allocator.alloc(fp.Q128_128, count);
        errdefer allocator.free(data);
        return .{ .data = data, .dims = try allocator.dupe(usize, dims) };
    }

    pub fn deinit(self: *Tensor, allocator: std.mem.Allocator) void {
        allocator.free(self.data);
        allocator.free(self.dims);
        self.data = &.{};
        self.dims = &.{};
    }

    pub fn elements(self: *const Tensor) usize {
        return self.data.len;
    }

    pub fn rows(self: *const Tensor) usize {
        return if (self.dims.len > 0) self.dims[0] else 1;
    }

    pub fn columns(self: *const Tensor) usize {
        return if (self.dims.len > 1) self.dims[1] else 1;
    }

    pub fn checksum(self: *const Tensor) u256 {
        var result: u256 = self.dims.len;
        for (self.dims) |dim| result = (result +% @as(u256, @intCast(dim))) *% 0x9e3779b97f4a7c15;
        for (self.data, 0..) |value, index| {
            const bits: u256 = @bitCast(value.raw);
            result = (result +% (bits *% @as(u256, @intCast(index + 1)))) ^ (bits +% @as(u256, @intCast(index + 1)));
        }
        return result;
    }

    /// Data-only hash over a contiguous slice; unlike `checksum` it ignores dims,
    /// so a [1,1,C] tensor and one row of a [1,N,C] tensor hash identically when
    /// their values match.
    fn sliceChecksum(data: []const fp.Q128_128) u256 {
        var result: u256 = 0;
        for (data, 0..) |value, index| {
            const bits: u256 = @bitCast(value.raw);
            result = (result +% (bits *% @as(u256, @intCast(index + 1)))) ^ (bits +% @as(u256, @intCast(index + 1)));
        }
        return result;
    }

    /// Position axis for checkpoint row-diffing: the first axis >0 whose size
    /// equals `sequence`, regardless of whether the layout is time-major
    /// [1,N,C] or transposed [1,C,N]. Returns dims.len when no axis matches
    /// (rank<2, states, or shape-independent tensors → compared whole).
    fn positionAxis(self: *const Tensor, sequence: usize) usize {
        if (sequence == 0 or self.dims.len < 2) return self.dims.len;
        for (1..self.dims.len) |axis| {
            if (self.dims[axis] == sequence) return axis;
        }
        return self.dims.len;
    }

    /// Number of sequence-position rows the tensor exposes for `sequence`.
    pub fn positionRows(self: *const Tensor, sequence: usize) usize {
        return if (self.positionAxis(sequence) == self.dims.len) 1 else sequence;
    }

    /// Data-only checksum over one sequence-position slice. Elements are hashed
    /// in canonical flat order (contiguous for axis-1 layouts, strided for
    /// transposed ones), so a [1,1,C] sequential-pass row and the matching
    /// position slice of a [1,N,C] or [1,C,N] batched tensor compare equal when
    /// their values agree.
    pub fn rowChecksum(self: *const Tensor, sequence: usize, row: usize) u256 {
        const axis = self.positionAxis(sequence);
        if (axis == self.dims.len) return sliceChecksum(self.data);
        var strides: [MAX_RANK]usize = undefined;
        var stride: usize = 1;
        var index: usize = self.dims.len;
        while (index > 0) {
            index -= 1;
            strides[index] = stride;
            stride *= self.dims[index];
        }
        var result: u256 = 0;
        var slot: usize = 0;
        for (self.data, 0..) |value, flat| {
            if ((flat / strides[axis]) % self.dims[axis] != row) continue;
            slot += 1;
            const bits: u256 = @bitCast(value.raw);
            result = (result +% (bits *% @as(u256, @intCast(slot)))) ^ (bits +% @as(u256, @intCast(slot)));
        }
        return result;
    }

    /// Elements covered by one sequence-position row (whole tensor when no
    /// position axis exists). Paired with `rowChecksum` so row diffs can skip
    /// structurally incompatible comparisons.
    pub fn rowSize(self: *const Tensor, sequence: usize) usize {
        const axis = self.positionAxis(sequence);
        if (axis == self.dims.len or self.dims[axis] == 0) return self.data.len;
        return self.data.len / self.dims[axis];
    }
};

/// Ref-counted backing shared by byte-identical initializer payloads.
/// Each aliased blob keeps its own dims/dtype view while the payload
/// buffer is allocated once.
pub const SharedBlobData = struct {
    refs: usize,
    data: []u8,

    fn release(self: *SharedBlobData, allocator: std.mem.Allocator) void {
        self.refs -= 1;
        if (self.refs == 0) {
            allocator.free(self.data);
            allocator.destroy(self);
        }
    }
};

/// Raw initializer payload retained for quantized or unsupported dtypes.
pub const Blob = struct {
    data: []u8,
    dims: []usize,
    data_type: u64,
    /// Non-null when `data` is co-owned through `SharedBlobData` instead of
    /// being owned outright by this blob.
    shared: ?*SharedBlobData = null,

    pub fn deinit(self: *Blob, allocator: std.mem.Allocator) void {
        if (self.shared) |shared| shared.release(allocator) else allocator.free(self.data);
        allocator.free(self.dims);
        self.data = &.{};
        self.dims = &.{};
        self.shared = null;
    }

    pub fn checksum(self: *const Blob) u256 {
        var result: u256 = self.data_type +% self.dims.len;
        for (self.dims) |dim| result = (result +% @as(u256, @intCast(dim))) *% 0x9e3779b97f4a7c15;
        for (self.data, 0..) |byte, index| result = (result +% (@as(u256, byte) *% @as(u256, @intCast(index + 1)))) ^ @as(u256, byte);
        return result;
    }

    /// Fold over dtype + raw bytes only, ignoring dims so byte-identical
    /// payloads bound under different views (e.g. [N,1024] vs [N,64,16])
    /// still coalesce to one allocation.
    pub fn dataChecksum(self: *const Blob) u256 {
        var result: u256 = self.data_type;
        for (self.data, 0..) |byte, index| result = (result +% (@as(u256, byte) *% @as(u256, @intCast(index + 1)))) ^ @as(u256, byte);
        return result;
    }
};

pub const Entry = union(enum) {
    tensor: Tensor,
    blob: Blob,

    pub fn deinit(self: *Entry, allocator: std.mem.Allocator) void {
        switch (self.*) {
            .tensor => |*tensor| tensor.deinit(allocator),
            .blob => |*blob| blob.deinit(allocator),
        }
    }

    pub fn checksum(self: *const Entry) u256 {
        return switch (self.*) {
            .tensor => |*tensor| tensor.checksum(),
            .blob => |*blob| blob.checksum() +% 0x51ec0de5,
        };
    }
};

pub const NamedEntry = struct {
    name: []const u8,
    entry: Entry,
};

pub const AcceleratorReport = struct {
    elements: usize = 0,
    dispatches: usize = 0,
    upload_bytes: usize = 0,
    download_bytes: usize = 0,
    elapsed_ns: u64 = 0,
};
/// One member of a MatMulNBits batch: fully resolved operands plus the
/// destination data slice of the output tensor already stored in the graph.
pub const MatMul4Job = struct {
    output: []fp.Q128_128,
    left: []const fp.Q128_128,
    left_shape: ops.Shape,
    packed_values: []const u8,
    scales: []const fp.Q128_128,
    zero_points: []const u8,
    k: usize,
    n: usize,
    block_size: usize,
};

pub const Accelerator = struct {
    context: *anyopaque,
    /// Optional numeric-tier toggle so a session can switch between exact and
    /// approximate kernels mid-request (e.g. an exact decode head before a
    /// fast tail). Null on accelerators without a tier switch.
    set_fast: ?*const fn (context: *anyopaque, enabled: bool) void = null,
    matmul: ?*const fn (
        context: *anyopaque,
        allocator: std.mem.Allocator,
        output: []fp.Q128_128,
        left: []const fp.Q128_128,
        left_shape: ops.Shape,
        right: []const fp.Q128_128,
        right_shape: ops.Shape,
    ) anyerror!AcceleratorReport = null,
    matmul4: ?*const fn (
        context: *anyopaque,
        allocator: std.mem.Allocator,
        output: []fp.Q128_128,
        left: []const fp.Q128_128,
        left_shape: ops.Shape,
        packed_values: []const u8,
        scales: []const fp.Q128_128,
        zero_points: []const u8,
        k: usize,
        n: usize,
        block_size: usize,
    ) anyerror!AcceleratorReport = null,
    /// Optional batch entry point: the runner hands over a run of consecutive
    /// MatMulNBits jobs whose inputs were all materialized before the run
    /// (no intra-run dependencies) so the accelerator can amortize submission
    /// overhead across a single queue submit. Null keeps per-node dispatch.
    matmul4_batch: ?*const fn (
        context: *anyopaque,
        allocator: std.mem.Allocator,
        jobs: []const MatMul4Job,
    ) anyerror!AcceleratorReport = null,
    sigmoid: ?*const fn (
        context: *anyopaque,
        allocator: std.mem.Allocator,
        output: []fp.Q128_128,
        input: []const fp.Q128_128,
    ) anyerror!AcceleratorReport = null,
    causal_conv: ?*const fn (
        context: *anyopaque,
        allocator: std.mem.Allocator,
        output: []fp.Q128_128,
        present: []fp.Q128_128,
        input: []const fp.Q128_128,
        weight: []const fp.Q128_128,
        bias: []const fp.Q128_128,
        past: []const fp.Q128_128,
        batch: usize,
        channels: usize,
        length: usize,
        kernel: usize,
        silu: bool,
    ) anyerror!AcceleratorReport = null,
    linear_attention: ?*const fn (
        context: *anyopaque,
        allocator: std.mem.Allocator,
        output: []fp.Q128_128,
        present: []fp.Q128_128,
        query: []const fp.Q128_128,
        key: []const fp.Q128_128,
        value: []const fp.Q128_128,
        past: []const fp.Q128_128,
        decay: []const fp.Q128_128,
        beta: []const fp.Q128_128,
        batch: usize,
        length: usize,
        query_heads: usize,
        kv_heads: usize,
        key_size: usize,
        value_size: usize,
        scale: fp.Q128_128,
    ) anyerror!AcceleratorReport = null,
};

pub const TensorStore = struct {
    allocator: std.mem.Allocator,
    /// Entries are individually heap-allocated so `get`/`getTensor`/`getBlob`
    /// pointers stay valid while `put` grows the list. This matters because
    /// multi-output kernels hold an output `*Tensor` across subsequent `put`
    /// calls, and growth must not invalidate them.
    tensors: std.ArrayList(*NamedEntry),
    /// Optional immutable backend for shared initializer state. Dynamic writes
    /// always remain local; only lookups fall through to the parent chain.
    parent: ?*const TensorStore = null,
    /// Name → entry index mirroring `tensors` for O(1) `get`/`put`.
    index: std.StringHashMap(*NamedEntry),
    /// dataChecksum → first blob entry, for payload sharing in `putBlob`.
    blob_shares: std.AutoHashMap(u256, *NamedEntry),
    /// Number of `putBlob` calls that aliased an existing payload.
    blobs_shared: usize = 0,

    pub fn init(allocator: std.mem.Allocator) TensorStore {
        return .{
            .allocator = allocator,
            .tensors = std.ArrayList(*NamedEntry).init(allocator),
            .index = std.StringHashMap(*NamedEntry).init(allocator),
            .blob_shares = std.AutoHashMap(u256, *NamedEntry).init(allocator),
        };
    }

    pub fn setParent(self: *TensorStore, parent: *const TensorStore) void {
        self.parent = parent;
    }

    pub fn deinit(self: *TensorStore) void {
        for (self.tensors.items) |named| {
            self.allocator.free(named.name);
            named.entry.deinit(self.allocator);
            self.allocator.destroy(named);
        }
        self.tensors.deinit();
        self.index.deinit();
        self.blob_shares.deinit();
    }

    /// O(1) local lookup. `tensors` retains insertion order for iteration;
    /// `index` mirrors it for name-based access — the previous linear scans
    /// cost ~7M string comparisons per graph execution. Public so
    /// `Session.advanceStep` can swap `present_*`/`past_*` entries in place.
    pub fn localSlot(self: *TensorStore, name: []const u8) ?*Entry {
        const named = self.index.get(name) orelse return null;
        return &named.entry;
    }

    /// Removes a local entry without destroying the payload; the caller owns
    /// the returned entry. Used to roll back a committed state move after a
    /// later step in the same transaction fails.
    pub fn takeLocal(self: *TensorStore, name: []const u8) ?Entry {
        const named = self.index.get(name) orelse return null;
        _ = self.index.remove(name);
        for (self.tensors.items, 0..) |candidate, index| {
            if (candidate == named) {
                _ = self.tensors.orderedRemove(index);
                break;
            }
        }
        var share_iter = self.blob_shares.iterator();
        while (share_iter.next()) |entry| {
            if (entry.value_ptr.* == named) {
                _ = self.blob_shares.remove(entry.key_ptr.*);
                break;
            }
        }
        const entry = named.entry;
        self.allocator.free(named.name);
        self.allocator.destroy(named);
        return entry;
    }

    fn lookup(self: *const TensorStore, name: []const u8) ?*const Entry {
        if (self.index.get(name)) |named| return &named.entry;
        if (self.parent) |parent| return parent.lookup(name);
        return null;
    }

    pub fn contains(self: *const TensorStore, name: []const u8) bool {
        return self.lookup(name) != null;
    }

    pub fn put(self: *TensorStore, name: []const u8, entry: Entry) !void {
        if (self.index.get(name)) |existing_named| {
            existing_named.entry.deinit(self.allocator);
            existing_named.entry = entry;
            return;
        }
        const named = try self.allocator.create(NamedEntry);
        errdefer self.allocator.destroy(named);
        named.* = .{ .name = try self.allocator.dupe(u8, name), .entry = entry };
        errdefer self.allocator.free(named.name);
        try self.index.put(named.name, named);
        errdefer _ = self.index.remove(named.name);
        try self.tensors.append(named);
    }

    pub fn putTensor(self: *TensorStore, name: []const u8, tensor: Tensor) !void {
        try tensor.validate();
        try self.put(name, .{ .tensor = tensor });
    }

    /// Stores an initializer blob, sharing the payload buffer when a
    /// byte-identical blob was already bound — tied-weight exports like
    /// `embed_tokens ≡ lm_head` arrive as separate initializers whose
    /// quantized bytes are identical even when the dims views differ.
    /// The check is dtype + length + full byte compare on a u256 fold
    /// shortlist, so sharing is exact, not probabilistic.
    /// Takes ownership of `blob` on success and releases it if insertion fails.
    pub fn putBlob(self: *TensorStore, name: []const u8, blob: Blob) !void {
        var incoming = blob;
        errdefer incoming.deinit(self.allocator);
        const fold = incoming.dataChecksum();
        if (self.blob_shares.get(fold)) |shared_named| {
            if (shared_named.entry == .blob) {
                const existing = &shared_named.entry.blob;
                if (existing.data_type == incoming.data_type and
                    existing.data.len == incoming.data.len and
                    std.mem.eql(u8, existing.data, incoming.data))
                {
                    if (existing.shared == null) {
                        const backing = self.allocator.create(SharedBlobData) catch {
                            try self.put(name, .{ .blob = incoming });
                            incoming = .{ .data = &.{}, .dims = &.{}, .data_type = incoming.data_type };
                            if (self.index.get(name)) |named| {
                                if (named.entry == .blob) self.blob_shares.put(fold, named) catch {};
                            }
                            return;
                        };
                        backing.* = .{ .refs = 1, .data = existing.data };
                        existing.shared = backing;
                    }
                    const backing = existing.shared.?;
                    const alias_dims = try self.allocator.dupe(usize, incoming.dims);
                    backing.refs = std.math.add(usize, backing.refs, 1) catch {
                        self.allocator.free(alias_dims);
                        return error.TooManyBlobShares;
                    };
                    self.put(name, .{ .blob = .{
                        .data = backing.data,
                        .dims = alias_dims,
                        .data_type = incoming.data_type,
                        .shared = backing,
                    } }) catch |err| {
                        backing.refs -= 1;
                        self.allocator.free(alias_dims);
                        return err;
                    };
                    if (incoming.data.ptr != backing.data.ptr) self.allocator.free(incoming.data);
                    self.allocator.free(incoming.dims);
                    incoming = .{ .data = &.{}, .dims = &.{}, .data_type = incoming.data_type };
                    self.blobs_shared = std.math.add(usize, self.blobs_shared, 1) catch std.math.maxInt(usize);
                    return;
                }
            }
        }
        try self.put(name, .{ .blob = incoming });
        incoming = .{ .data = &.{}, .dims = &.{}, .data_type = incoming.data_type };
        if (self.index.get(name)) |named| {
            if (named.entry == .blob) self.blob_shares.put(fold, named) catch {};
        }
    }

    pub fn get(self: *const TensorStore, name: []const u8) ?*const Entry {
        return self.lookup(name);
    }

    pub fn getTensor(self: *const TensorStore, name: []const u8) ?*const Tensor {
        const entry = self.lookup(name) orelse return null;
        return switch (entry.*) {
            .tensor => |*tensor| tensor,
            .blob => null,
        };
    }

    pub fn getBlob(self: *const TensorStore, name: []const u8) ?*const Blob {
        const entry = self.lookup(name) orelse return null;
        return switch (entry.*) {
            .blob => |*blob| blob,
            .tensor => null,
        };
    }

    /// Returns a mutable tensor only when it is owned by this store. Parent
    /// lookups are deliberately excluded so shared weights remain immutable.
    pub fn getLocalTensor(self: *TensorStore, name: []const u8) ?*Tensor {
        const entry = self.localSlot(name) orelse return null;
        return switch (entry.*) {
            .tensor => |*tensor| tensor,
            .blob => null,
        };
    }

    /// Returns the owned bytes in this store, excluding any parent backend.
    /// This is an accounting estimate for budgets and reports, not an RSS value.
    pub fn localByteSize(self: *const TensorStore) usize {
        var total: usize = 0;
        var seen = std.AutoHashMap(*SharedBlobData, void).init(self.allocator);
        defer seen.deinit();
        for (self.tensors.items) |named| {
            total = saturatingAdd(total, named.name.len);
            switch (named.entry) {
                .tensor => |tensor| {
                    const data_bytes = saturatingMul(tensor.data.len, @sizeOf(fp.Q128_128));
                    const dims_bytes = saturatingMul(tensor.dims.len, @sizeOf(usize));
                    total = saturatingAdd(total, saturatingAdd(data_bytes, dims_bytes));
                },
                .blob => |blob| {
                    total = saturatingAdd(total, saturatingMul(blob.dims.len, @sizeOf(usize)));
                    if (blob.shared) |shared| {
                        if (seen.contains(shared)) continue;
                        seen.put(shared, {}) catch {};
                        total = saturatingAdd(total, blob.data.len);
                    } else {
                        total = saturatingAdd(total, blob.data.len);
                    }
                },
            }
        }
        return total;
    }
};

pub const Resolver = struct {
    context: *anyopaque,
    resolve: *const fn (context: *anyopaque, store: *TensorStore, name: []const u8) anyerror!bool,
};

pub const Checkpoint = struct {
    node_index: usize,
    output_checksum: u256,
};

pub const NodeCheckpoint = struct {
    node_index: usize,
    node_name: []const u8,
    op_type: []const u8,
    output_name: []const u8,
    checksum: u256,
    /// Per-leading-row data checksums; allocated only when `Runner.row_checksums`
    /// is set, freed by `freeCheckpointRows`.
    row_checksums: []u256 = &.{},
    /// Elements per emitted row (0 when row_checksums absent).
    row_size: usize = 0,
    /// Tensor dims snapshot for the row dump comparer (empty for non-tensors).
    dims: []usize = &.{},
};

// Legacy indexed-node fixture executor -------------------------------------------------------------

pub const NodeKind = enum { add, sub, mul, mat_mul };

pub const Node = struct {
    kind: NodeKind,
    left: usize,
    right: usize,
    output: usize,
};

pub const Executor = struct {
    allocator: std.mem.Allocator,
    tensors: []Tensor,
    nodes: []const Node,

    pub fn init(allocator: std.mem.Allocator, tensors: []Tensor, nodes: []const Node) Executor {
        return .{ .allocator = allocator, .tensors = tensors, .nodes = nodes };
    }

    pub fn execute(self: *Executor) !void {
        const checkpoints = try self.executeWithCheckpoints(self.allocator);
        self.allocator.free(checkpoints);
    }

    pub fn executeWithCheckpoints(self: *Executor, allocator: std.mem.Allocator) ![]Checkpoint {
        var checkpoints = try allocator.alloc(Checkpoint, self.nodes.len);
        errdefer allocator.free(checkpoints);
        for (self.nodes, 0..) |node, node_index| {
            if (node.left >= self.tensors.len or node.right >= self.tensors.len or node.output >= self.tensors.len) return error.TensorIndexOutOfRange;
            const left = &self.tensors[node.left];
            const right = &self.tensors[node.right];
            const output = &self.tensors[node.output];
            if (left.dims.len != 2 or right.dims.len != 2 or output.dims.len != 2) return error.ShapeMismatch;
            if (node.kind != .mat_mul and (left.dims[0] != right.dims[0] or left.dims[1] != right.dims[1])) return error.ShapeMismatch;
            switch (node.kind) {
                .add => try ops.add(output.data, left.data, right.data),
                .sub => try ops.sub(output.data, left.data, right.data),
                .mul => try ops.mul(output.data, left.data, right.data),
                .mat_mul => {
                    if (left.dims[1] != right.dims[0] or output.dims[0] != left.dims[0] or output.dims[1] != right.dims[1]) return error.ShapeMismatch;
                    try ops.matMul(output.data, left.data, .{ .rows = left.dims[0], .columns = left.dims[1] }, right.data, .{ .rows = right.dims[0], .columns = right.dims[1] });
                },
            }
            checkpoints[node_index] = .{ .node_index = node_index, .output_checksum = output.checksum() };
        }
        return checkpoints;
    }
};

// Parsed-graph runner ------------------------------------------------------------------------------

pub const OpTiming = struct {
    calls: usize = 0,
    elapsed_ns: u64 = 0,
};

const PendingChecksum = struct {
    checkpoint_index: usize,
    output_name: []const u8,
};

const ChecksumContext = struct {
    runner: *Runner,
    failed: std.atomic.Value(bool) = std.atomic.Value(bool).init(false),
};

fn checksumItem(context: *ChecksumContext, index: usize) void {
    const item = context.runner.pending_checksums.items[index];
    const entry = context.runner.store.get(item.output_name) orelse {
        context.failed.store(true, .release);
        return;
    };
    context.runner.checkpoints.items[item.checkpoint_index].checksum = entry.checksum();
}

fn checksumEntry(job_context: *anyopaque, index: usize) void {
    checksumItem(@ptrCast(@alignCast(job_context)), index);
}

fn checksumWorker(context: *ChecksumContext, worker: usize, worker_count: usize) void {
    const items = context.runner.pending_checksums.items;
    var index = worker;
    while (index < items.len) : (index += worker_count) {
        checksumItem(context, index);
        if (context.failed.load(.acquire)) return;
    }
}

pub const Runner = struct {
    allocator: std.mem.Allocator,
    store: *TensorStore,
    resolver: ?Resolver = null,
    executed: usize = 0,
    cursor: usize = 0,
    failed_node: ?[]const u8 = null,
    failed_op: ?[]const u8 = null,
    missing_input: ?[]const u8 = null,
    checkpoints: std.ArrayList(NodeCheckpoint),
    op_timings: std.StringHashMap(OpTiming),
    profile_enabled: bool = false,
    row_checksums: bool = false,
    /// Sequence length used for position-axis row checksums; callers set it per
    /// pass (1 for sequential prefill/decode, N for a batched prefill pass).
    row_sequence: usize = 1,
    /// Node names skipped entirely during `run` — neither executed nor
    /// checkpointed. Used to bypass the terminal logits projection during
    /// prefill passes, whose logits are never consumed.
    skip_nodes: ?[]const []const u8 = null,
    /// Opt-in approximate tier (ADR-0023, `DIGIT_FAST_Q4`): eligible operators
    /// run deterministic f32 kernels behind the Q128 tensor boundary. The
    /// default `false` keeps every op in exact Q128 arithmetic.
    fast_numerics: bool = false,
    accelerator: ?Accelerator = null,
    accelerated_matmul_calls: usize = 0,
    accelerated_matmul4_calls: usize = 0,
    accelerated_unary_calls: usize = 0,
    accelerated_elements: usize = 0,
    accelerated_dispatches: usize = 0,
    accelerated_upload_bytes: usize = 0,
    accelerated_download_bytes: usize = 0,
    accelerated_elapsed_ns: u64 = 0,
    checkpoint_elapsed_ns: u64 = 0,
    /// Whole-pass wall time and the `ensureInputs` share of it — the two
    /// spans outside the per-op timers; populated under DIGIT_PROFILE.
    run_wall_ns: u64 = 0,
    ensure_ns: u64 = 0,
    matmul4_scratch: std.ArrayList(fp.Q128_128),
    /// Deferred output-checksum work: each emitted checkpoint records its
    /// index here with the output name; `flushPendingChecksums` resolves the
    /// names and hashes the tensors in parallel at the end of a run pass.
    /// Entries are tuples (checkpoints index, output name) — pointers are
    /// not held because `checkpoints` may grow between emission and flush.
    pending_checksums: std.ArrayList(PendingChecksum),
    /// Lazily-created persistent worker pool shared by the fast-tier
    /// parallel kernels (linear attention) and the checksum flush — avoids
    /// ~860 spawn/join pairs per execution.
    pool: ?*worker_pool.Pool = null,
    /// Fast-tier f64 shadows of recurrent state tensors, keyed by the
    /// `past_*` input name with its `past_` prefix stripped (the same suffix
    /// `present_*` outputs carry). Lets LinearAttention reuse the previous
    /// step's f64 state instead of re-converting the full Q128 tensor every
    /// call. Must be cleared whenever `past_*` tensors are replaced from
    /// outside the graph (snapshot restore, session reseed); `advanceStep`
    /// copies `present_*` we wrote ourselves, so shadows stay valid there.
    state_shadows: std.StringHashMap([]f64),

    pub fn init(allocator: std.mem.Allocator, store: *TensorStore, resolver: ?Resolver) Runner {
        return .{
            .allocator = allocator,
            .store = store,
            .resolver = resolver,
            .checkpoints = std.ArrayList(NodeCheckpoint).init(allocator),
            .op_timings = std.StringHashMap(OpTiming).init(allocator),
            .matmul4_scratch = std.ArrayList(fp.Q128_128).init(allocator),
            .state_shadows = std.StringHashMap([]f64).init(allocator),
            .pending_checksums = std.ArrayList(PendingChecksum).init(allocator),
        };
    }

    /// Drops all cached f64 recurrent-state shadows. Required whenever
    /// `past_*` tensors are replaced from outside a graph execution
    /// (snapshot restore, session reseed) so stale shadows cannot feed the
    /// next run.
    pub fn clearStateShadows(self: *Runner) void {
        var iter = self.state_shadows.iterator();
        while (iter.next()) |entry| {
            self.allocator.free(entry.key_ptr.*);
            self.allocator.free(entry.value_ptr.*);
        }
        self.state_shadows.clearRetainingCapacity();
    }

    pub fn deinit(self: *Runner) void {
        self.freeCheckpointRows();
        self.pending_checksums.deinit();
        self.clearStateShadows();
        self.state_shadows.deinit();
        self.matmul4_scratch.deinit();
        self.op_timings.deinit();
        self.checkpoints.deinit();
        if (self.pool) |pool_instance| pool_instance.destroy();
    }

    /// Returns the shared worker pool, creating it on first use. Falls back
    /// to `null` — callers then use their spawn-per-phase or sequential
    /// path — when threads are unavailable or pool creation fails.
    fn workerPool(self: *Runner) ?*worker_pool.Pool {
        if (comptime !supports_threads) return null;
        if (self.pool == null) {
            const cores = std.Thread.getCpuCount() catch CHECKSUM_WORKERS;
            self.pool = worker_pool.Pool.create(self.allocator, @max(CHECKSUM_WORKERS, @min(cores, worker_pool.MAX_WORKERS))) catch null;
        }
        return self.pool;
    }

    /// Release any per-row checksum slices recorded in `checkpoints`. Callers that
    /// dump and clear checkpoints between passes must invoke this first.
    pub fn freeCheckpointRows(self: *Runner) void {
        for (self.checkpoints.items) |*checkpoint| {
            if (checkpoint.row_checksums.len > 0) self.allocator.free(checkpoint.row_checksums);
            checkpoint.row_checksums = &.{};
            if (checkpoint.dims.len > 0) self.allocator.free(checkpoint.dims);
            checkpoint.dims = &.{};
        }
    }

    pub fn setAccelerator(self: *Runner, accelerator: ?Accelerator) void {
        self.accelerator = accelerator;
    }

    fn recordAccelerator(self: *Runner, report: AcceleratorReport, matmul4: bool) void {
        if (matmul4) self.accelerated_matmul4_calls += 1 else self.accelerated_matmul_calls += 1;
        self.accelerated_elements += report.elements;
        self.accelerated_dispatches += report.dispatches;
        self.accelerated_upload_bytes += report.upload_bytes;
        self.accelerated_download_bytes += report.download_bytes;
        self.accelerated_elapsed_ns += report.elapsed_ns;
    }

    fn recordUnaryAccelerator(self: *Runner, report: AcceleratorReport) void {
        self.accelerated_unary_calls += 1;
        self.accelerated_elements += report.elements;
        self.accelerated_dispatches += report.dispatches;
        self.accelerated_upload_bytes += report.upload_bytes;
        self.accelerated_download_bytes += report.download_bytes;
        self.accelerated_elapsed_ns += report.elapsed_ns;
    }

    fn recordOpTiming(self: *Runner, op_type: []const u8, elapsed_ns: u64) !void {
        const entry = try self.op_timings.getOrPut(op_type);
        if (!entry.found_existing) entry.value_ptr.* = .{};
        entry.value_ptr.calls += 1;
        entry.value_ptr.elapsed_ns += elapsed_ns;
    }

    /// Executes parsed nodes in topological order until `limit` total nodes or
    /// the first unsupported/missing dependency. Resumable: `cursor` persists
    /// across calls, so after a `MissingTensor` failure the caller may satisfy
    /// the store and call again to continue. On error, `executed` records how
    /// many nodes completed, `checkpoints` retains partial progress, and
    /// `failed_node`/`failed_op`/`missing_input` identify the blocker.
    pub fn run(self: *Runner, nodes: []const onnx.Node, order: []const usize, limit: ?usize) !void {
        const max_nodes = @min(limit orelse order.len, order.len);
        const Timer = if (comptime supports_timer) std.time.Timer else void;
        var wall_timer: ?Timer = if (comptime supports_timer) (if (self.profile_enabled) try Timer.start() else null) else null;
        defer if (comptime supports_timer) {
            if (wall_timer) |*timer| self.run_wall_ns += timer.read();
        };
        while (self.cursor < max_nodes) {
            const node_index = order[self.cursor];
            const node = &nodes[node_index];
            if (self.skip_nodes) |names| {
                var skipped = false;
                for (names) |name| {
                    if (std.mem.eql(u8, node.name, name)) {
                        skipped = true;
                        break;
                    }
                }
                if (skipped) {
                    self.cursor += 1;
                    continue;
                }
            }
            var ensure_timer: ?Timer = if (comptime supports_timer) (if (self.profile_enabled) try Timer.start() else null) else null;
            self.ensureInputs(node) catch |err| {
                self.failed_node = node.name;
                self.failed_op = node.op_type;
                return err;
            };
            if (comptime supports_timer) {
                if (ensure_timer) |*timer| self.ensure_ns += timer.read();
            }
            var node_timer: ?Timer = if (comptime supports_timer) (if (self.profile_enabled) try Timer.start() else null) else null;
            var consumed: usize = 0;
            if (self.accelerator) |accelerator| {
                if (accelerator.matmul4_batch != null and std.mem.eql(u8, node.op_type, "MatMulNBits")) {
                    consumed = self.execMatMulNBitsRun(order, nodes, max_nodes) catch |err| {
                        self.failed_node = node.name;
                        self.failed_op = node.op_type;
                        return err;
                    };
                }
            }
            if (consumed != 0) {
                self.cursor += consumed;
                self.executed += consumed;
                continue;
            }
            self.executeNode(node) catch |err| {
                self.failed_node = node.name;
                self.failed_op = node.op_type;
                return err;
            };
            var checkpoint_timer: ?Timer = if (comptime supports_timer) (if (self.profile_enabled) try Timer.start() else null) else null;
            try self.emitNodeCheckpoints(node, node_index);
            if (comptime supports_timer) {
                if (checkpoint_timer) |*timer| self.checkpoint_elapsed_ns += timer.read();
                if (node_timer) |*timer| try self.recordOpTiming(node.op_type, timer.read());
            }
            self.cursor += 1;
            self.executed += 1;
        }
        try self.flushPendingChecksums();
    }

    /// Computes every deferred output checksum. Checksums are independent
    /// per tensor, so large batches are split across worker threads —
    /// each pending entry is hashed exactly once in its own slot, keeping
    /// the result identical to the previous sequential order.
    fn flushPendingChecksums(self: *Runner) !void {
        const items = self.pending_checksums.items;
        defer self.pending_checksums.clearRetainingCapacity();
        if (comptime supports_threads) {
            if (items.len > 64) {
                var context = ChecksumContext{ .runner = self };
                if (self.workerPool()) |pool_instance| {
                    pool_instance.run(&context, checksumEntry, items.len);
                } else {
                    const worker_count = @min(CHECKSUM_WORKERS, items.len);
                    var threads: [CHECKSUM_WORKERS]?std.Thread = .{null} ** CHECKSUM_WORKERS;
                    for (0..worker_count) |worker| {
                        threads[worker] = std.Thread.spawn(.{}, checksumWorker, .{ &context, worker, worker_count }) catch null;
                        if (threads[worker] == null) checksumWorker(&context, worker, worker_count);
                    }
                    for (threads[0..worker_count]) |thread| if (thread) |value| value.join();
                }
                if (context.failed.load(.acquire)) return error.MissingTensor;
                return;
            }
        }
        for (items) |item| {
            const entry = self.store.get(item.output_name) orelse return error.MissingTensor;
            self.checkpoints.items[item.checkpoint_index].checksum = entry.checksum();
        }
    }

    fn emitNodeCheckpoints(self: *Runner, node: *const onnx.Node, node_index: usize) !void {
        for (node.outputs.items) |output_name| {
            if (output_name.len == 0) continue;
            const entry = self.store.get(output_name) orelse {
                self.failed_node = node.name;
                self.failed_op = node.op_type;
                return error.MissingTensor;
            };
            var row_checksums: []u256 = &.{};
            var row_size: usize = 0;
            var dims: []usize = &.{};
            if (self.row_checksums) {
                if (entry.* == .tensor) {
                    const tensor = &entry.tensor;
                    const rows = tensor.positionRows(self.row_sequence);
                    const allocated = try self.allocator.alloc(u256, rows);
                    for (allocated, 0..) |*slot, row| slot.* = tensor.rowChecksum(self.row_sequence, row);
                    row_checksums = allocated;
                    row_size = tensor.rowSize(self.row_sequence);
                    dims = try self.allocator.dupe(usize, tensor.dims);
                }
            }
            try self.checkpoints.append(.{
                .node_index = node_index,
                .node_name = node.name,
                .op_type = node.op_type,
                .output_name = output_name,
                .checksum = 0,
                .row_checksums = row_checksums,
                .row_size = row_size,
                .dims = dims,
            });
            try self.pending_checksums.append(.{
                .checkpoint_index = self.checkpoints.items.len - 1,
                .output_name = output_name,
            });
        }
    }

    /// Collects a run of consecutive MatMulNBits nodes whose inputs were all
    /// materialized before the run (a member may not consume an earlier
    /// member's output), executes them through `accelerator.matmul4_batch`,
    /// and emits the usual per-node checkpoints. Returns the number of
    /// consumed nodes, or zero when fewer than two qualify.
    fn execMatMulNBitsRun(self: *Runner, order: []const usize, nodes: []const onnx.Node, max_nodes: usize) !usize {
        const accelerator = self.accelerator orelse return 0;
        const batch = accelerator.matmul4_batch orelse return 0;
        var members = std.ArrayList(*const onnx.Node).init(self.allocator);
        defer members.deinit();
        var member_indices = std.ArrayList(usize).init(self.allocator);
        defer member_indices.deinit();
        var produced = std.StringHashMap(void).init(self.allocator);
        defer produced.deinit();
        while (self.cursor + members.items.len < max_nodes and members.items.len < 16) {
            const candidate_index = order[self.cursor + members.items.len];
            const candidate = &nodes[candidate_index];
            if (!std.mem.eql(u8, candidate.op_type, "MatMulNBits")) break;
            if (self.skip_nodes) |names| {
                var skipped = false;
                for (names) |name| {
                    if (std.mem.eql(u8, candidate.name, name)) {
                        skipped = true;
                        break;
                    }
                }
                if (skipped) break;
            }
            var depends_on_run = false;
            for (candidate.inputs.items) |name| {
                if (name.len != 0 and produced.contains(name)) depends_on_run = true;
            }
            if (depends_on_run) break;
            if (attrInt(candidate, "bits", 4) != 4 or @mod(attrInt(candidate, "block_size", 32), 8) != 0) break;
            self.ensureInputs(candidate) catch break;
            try members.append(candidate);
            try member_indices.append(candidate_index);
            for (candidate.outputs.items) |name| {
                if (name.len != 0) try produced.put(name, {});
            }
        }
        if (members.items.len < 2) return 0;
        var jobs = std.ArrayList(MatMul4Job).init(self.allocator);
        defer jobs.deinit();
        var zp_keepalive = std.ArrayList([]u8).init(self.allocator);
        defer {
            for (zp_keepalive.items) |slice| self.allocator.free(slice);
            zp_keepalive.deinit();
        }
        for (members.items) |member| {
            const left = try self.needTensor(member, 0);
            const quant = try self.needBlob(member, 1);
            const scales = try self.needTensor(member, 2);
            const k_attr = attrInt(member, "K", -1);
            const n_attr = attrInt(member, "N", -1);
            const bits = attrInt(member, "bits", 4);
            const block_size = attrInt(member, "block_size", 32);
            if (k_attr <= 0 or n_attr <= 0 or bits != 4 or block_size <= 0) return error.UnsupportedOperator;
            const k: usize = @intCast(k_attr);
            const n: usize = @intCast(n_attr);
            const block: usize = @intCast(block_size);
            if (left.dims.len == 0 or left.dims[left.dims.len - 1] != k) return error.ShapeMismatch;
            const rows = left.data.len / k;
            var out_dims: [MAX_RANK]usize = undefined;
            @memcpy(out_dims[0 .. left.dims.len - 1], left.dims[0 .. left.dims.len - 1]);
            out_dims[left.dims.len - 1] = n;
            const output = try self.makeOutput(member, 0, out_dims[0..left.dims.len]);
            var zp_data: []const u8 = &.{};
            if (member.inputs.items.len > 3 and inputName(member, 3).len != 0) {
                const zp = try self.needBlob(member, 3);
                zp_data = zp.data;
            } else {
                const block_count = k / block;
                const storage = try self.allocator.alloc(u8, n * ((block_count + 1) / 2));
                @memset(storage, 0x88);
                try zp_keepalive.append(storage);
                zp_data = storage;
            }
            try jobs.append(.{
                .output = output.data,
                .left = left.data,
                .left_shape = .{ .rows = rows, .columns = k },
                .packed_values = quant.data,
                .scales = scales.data,
                .zero_points = zp_data,
                .k = k,
                .n = n,
                .block_size = block,
            });
        }
        const Timer = if (comptime supports_timer) std.time.Timer else void;
        var node_timer: ?Timer = if (comptime supports_timer) (if (self.profile_enabled) try Timer.start() else null) else null;
        const report = try batch(accelerator.context, self.allocator, jobs.items);
        self.recordAccelerator(report, true);
        if (comptime supports_timer) {
            if (node_timer) |*timer| {
                const share = timer.read() / members.items.len;
                for (members.items) |_| try self.recordOpTiming("MatMulNBits", share);
            }
        }
        for (members.items, member_indices.items) |member, node_index| {
            try self.emitNodeCheckpoints(member, node_index);
        }
        return members.items.len;
    }

    fn ensureInputs(self: *Runner, node: *const onnx.Node) !void {
        self.missing_input = null;
        for (node.inputs.items) |name| {
            if (name.len == 0 or self.store.contains(name)) continue;
            if (self.resolver) |resolver| {
                if (try resolver.resolve(resolver.context, self.store, name)) continue;
            }
            self.missing_input = name;
            return error.MissingTensor;
        }
    }

    fn attrInt(node: *const onnx.Node, name: []const u8, default: i64) i64 {
        for (node.attributes.items) |attribute| {
            if (std.mem.eql(u8, attribute.name, name)) return switch (attribute.kind) {
                .integer => attribute.integer,
                .integers => if (attribute.ints.len > 0) attribute.ints[0] else default,
                else => default,
            };
        }
        return default;
    }

    fn attrInts(node: *const onnx.Node, name: []const u8) ?[]const i64 {
        for (node.attributes.items) |attribute| {
            if (std.mem.eql(u8, attribute.name, name)) return switch (attribute.kind) {
                .integer => null,
                .integers => attribute.ints,
                else => null,
            };
        }
        return null;
    }

    fn attrFloat(node: *const onnx.Node, name: []const u8, default: f32) f32 {
        for (node.attributes.items) |attribute| {
            if (std.mem.eql(u8, attribute.name, name)) return switch (attribute.kind) {
                .float => attribute.float,
                .floats => if (attribute.floats.len > 0) attribute.floats[0] else default,
                else => default,
            };
        }
        return default;
    }

    fn attrString(node: *const onnx.Node, name: []const u8) ?[]const u8 {
        for (node.attributes.items) |attribute| {
            if (std.mem.eql(u8, attribute.name, name) and attribute.kind == .string) return attribute.string;
        }
        return null;
    }

    /// Returns a shallow copy of the stored tensor. Copies are intentional:
    /// `makeOutput` may grow the store's ArrayList and invalidate pointers
    /// into it, while the heap-owned data/dims slices remain valid.
    fn needTensor(self: *Runner, node: *const onnx.Node, index: usize) !Tensor {
        if (index >= node.inputs.items.len) return error.MissingTensor;
        const name = node.inputs.items[index];
        if (name.len == 0) return error.MissingTensor;
        const tensor = self.store.getTensor(name) orelse return error.MissingTensor;
        return tensor.*;
    }

    fn needBlob(self: *Runner, node: *const onnx.Node, index: usize) !Blob {
        if (index >= node.inputs.items.len) return error.MissingTensor;
        const name = node.inputs.items[index];
        if (name.len == 0) return error.MissingTensor;
        const blob = self.store.getBlob(name) orelse return error.MissingTensor;
        return blob.*;
    }

    fn inputName(node: *const onnx.Node, index: usize) []const u8 {
        return if (index < node.inputs.items.len) node.inputs.items[index] else "";
    }

    fn tensorToI64(value: fp.Q128_128) i64 {
        return @intCast(fp.divTruncPow2I256(value.raw, fp.FRAC_BITS));
    }

    fn intTensorValues(self: *Runner, tensor: Tensor) ![]i64 {
        const values = try self.allocator.alloc(i64, tensor.data.len);
        for (tensor.data, 0..) |value, index| values[index] = tensorToI64(value);
        return values;
    }

    fn makeOutput(self: *Runner, node: *const onnx.Node, index: usize, dims: []const usize) !*Tensor {
        if (index >= node.outputs.items.len) return error.MissingTensor;
        const tensor = try Tensor.init(self.allocator, dims);
        errdefer {
            var dropped = tensor;
            dropped.deinit(self.allocator);
        }
        try self.store.putTensor(node.outputs.items[index], tensor);
        return self.store.getLocalTensor(node.outputs.items[index]).?;
    }

    fn normalizeAxis(axis: i64, rank: usize) !usize {
        const adjusted = if (axis < 0) axis + @as(i64, @intCast(rank)) else axis;
        if (adjusted < 0 or adjusted >= @as(i64, @intCast(rank))) return error.ShapeMismatch;
        return @intCast(adjusted);
    }

    fn stridesOf(dims: []const usize, strides: *[MAX_RANK]usize) void {
        if (dims.len == 0) return;
        strides[dims.len - 1] = 1;
        var axis: usize = dims.len - 1;
        while (axis > 0) {
            axis -= 1;
            strides[axis] = strides[axis + 1] * dims[axis + 1];
        }
    }

    fn flatIndex(coords: []const usize, dims: []const usize, strides: *const [MAX_RANK]usize) usize {
        var index: usize = 0;
        for (0..dims.len) |axis| {
            const coord = if (dims[axis] == 1) 0 else coords[axis];
            index += coord * strides[axis];
        }
        return index;
    }

    /// Returns the contiguous trailing span `N` when `dims` right-aligned
    /// against `out_dims` broadcasts purely over its leading 1-axes and a
    /// matching contiguous suffix — i.e. when the operand's flat index is
    /// simply `flat % N`. Returns null for any interleaved/mixed broadcast
    /// (a 1-axis after a non-trivial axis, or a mismatched axis), where the
    /// general coordinate path is required.
    fn suffixBroadcastLen(dims: []const usize, out_dims: []const usize, offset: usize) ?usize {
        var span: usize = 1;
        var suffix = false;
        var axis = dims.len;
        while (axis > 0) {
            axis -= 1;
            const dim = dims[axis];
            if (dim == 1) {
                if (suffix) return null;
                continue;
            }
            if (dim != out_dims[offset + axis]) return null;
            suffix = true;
            span *= dim;
        }
        return span;
    }

    fn broadcastDims(self: *Runner, left: []const usize, right: []const usize) ![]usize {
        const rank = @max(left.len, right.len);
        const dims = try self.allocator.alloc(usize, rank);
        for (dims, 0..) |*dim, axis| {
            const left_dim = if (axis + left.len >= rank) left[axis + left.len - rank] else 1;
            const right_dim = if (axis + right.len >= rank) right[axis + right.len - rank] else 1;
            if (left_dim != right_dim and left_dim != 1 and right_dim != 1) return error.ShapeMismatch;
            dim.* = @max(left_dim, right_dim);
        }
        return dims;
    }

    fn broadcastBinary(self: *Runner, node: *const onnx.Node, comptime apply: fn (fp.Q128_128, fp.Q128_128) fp.Error!fp.Q128_128) !void {
        const left = try self.needTensor(node, 0);
        const right = try self.needTensor(node, 1);
        const out_dims = try self.broadcastDims(left.dims, right.dims);
        defer self.allocator.free(out_dims);
        const output = try self.makeOutput(node, 0, out_dims);
        var left_strides: [MAX_RANK]usize = undefined;
        var right_strides: [MAX_RANK]usize = undefined;
        stridesOf(left.dims, &left_strides);
        stridesOf(right.dims, &right_strides);
        const left_offset = out_dims.len - left.dims.len;
        const right_offset = out_dims.len - right.dims.len;
        // Flat fast paths that skip the per-element coordinate walk: equal
        // shapes zip directly, scalars broadcast freely, and an operand
        // broadcast over a contiguous trailing suffix reduces to a modulo.
        if (std.mem.eql(usize, left.dims, right.dims)) {
            for (output.data, left.data, right.data) |*destination, l, r| destination.* = try apply(l, r);
            return;
        }
        if (right.data.len == 1) {
            const r = right.data[0];
            for (output.data, left.data) |*destination, l| destination.* = try apply(l, r);
            return;
        }
        if (left.data.len == 1) {
            const l = left.data[0];
            for (output.data, right.data) |*destination, r| destination.* = try apply(l, r);
            return;
        }
        if (std.mem.eql(usize, left.dims, out_dims)) {
            if (suffixBroadcastLen(right.dims, out_dims, right_offset)) |span| {
                for (output.data, left.data, 0..) |*destination, l, flat| destination.* = try apply(l, right.data[flat % span]);
                return;
            }
        }
        if (std.mem.eql(usize, right.dims, out_dims)) {
            if (suffixBroadcastLen(left.dims, out_dims, left_offset)) |span| {
                for (output.data, right.data, 0..) |*destination, r, flat| destination.* = try apply(left.data[flat % span], r);
                return;
            }
        }
        for (output.data, 0..) |*destination, flat| {
            var remaining = flat;
            var coords: [MAX_RANK]usize = undefined;
            var axis: usize = out_dims.len;
            while (axis > 0) {
                axis -= 1;
                coords[axis] = remaining % out_dims[axis];
                remaining /= out_dims[axis];
            }
            const left_index = flatIndex(coords[left_offset..][0..left.dims.len], left.dims, &left_strides);
            const right_index = flatIndex(coords[right_offset..][0..right.dims.len], right.dims, &right_strides);
            destination.* = try apply(left.data[left_index], right.data[right_index]);
        }
    }

    /// Minimum element count before a unary elementwise op is worth a pool
    /// dispatch — below this the wake/drain overhead exceeds the work.
    /// (Measured: pooling the exact-Q128 binary ops like Mul regressed —
    /// their per-element cost is a single i256 op, smaller than the
    /// dispatch overhead at this model's tensor sizes.)
    const UNARY_PARALLEL_MIN: usize = 1 << 12;

    /// Elementwise payload for the unary loops — element writes are
    /// independent, so pooled execution is bit-identical in both tiers.
    const UnaryElementContext = struct {
        output: []fp.Q128_128,
        input: []const fp.Q128_128,
        apply: *const fn (fp.Q128_128) fp.Error!fp.Q128_128,
        failure: std.atomic.Value(usize) = std.atomic.Value(usize).init(0),
    };

    fn unaryElement(context: *anyopaque, index: usize) void {
        const ctx: *UnaryElementContext = @ptrCast(@alignCast(context));
        ctx.output[index] = ctx.apply(ctx.input[index]) catch |err| {
            ctx.failure.store(@as(usize, @intFromError(err)), .release);
            return;
        };
    }

    fn runUnaryElements(self: *Runner, context: *UnaryElementContext) fp.Error!void {
        const count = context.output.len;
        if (comptime worker_pool.supports_threads) {
            if (count >= UNARY_PARALLEL_MIN) {
                if (self.workerPool()) |pool_instance| {
                    pool_instance.run(context, unaryElement, count);
                    const failure = context.failure.load(.acquire);
                    if (failure != 0) return elementFailure(failure);
                    return;
                }
            }
        }
        for (0..count) |index| unaryElement(context, index);
        const failure = context.failure.load(.acquire);
        if (failure != 0) return elementFailure(failure);
    }

    /// f64 unary variant used by the fast tier — conversion happens per
    /// element inside the worker, identical to the sequential loop.
    const UnaryF64Context = struct {
        output: []fp.Q128_128,
        input: []const fp.Q128_128,
        apply: *const fn (f64) f64,
        failure: std.atomic.Value(usize) = std.atomic.Value(usize).init(0),
    };

    fn unaryF64Element(context: *anyopaque, index: usize) void {
        const ctx: *UnaryF64Context = @ptrCast(@alignCast(context));
        ctx.output[index] = fp.Q128_128.fromF64Saturating(ctx.apply(ctx.input[index].toF64())) catch |err| {
            ctx.failure.store(@as(usize, @intFromError(err)), .release);
            return;
        };
    }

    fn runUnaryF64Elements(self: *Runner, context: *UnaryF64Context) fp.Error!void {
        const count = context.output.len;
        if (comptime worker_pool.supports_threads) {
            if (count >= UNARY_PARALLEL_MIN) {
                if (self.workerPool()) |pool_instance| {
                    pool_instance.run(context, unaryF64Element, count);
                    const failure = context.failure.load(.acquire);
                    if (failure != 0) return elementFailure(failure);
                    return;
                }
            }
        }
        for (0..count) |index| unaryF64Element(context, index);
        const failure = context.failure.load(.acquire);
        if (failure != 0) return elementFailure(failure);
    }

    /// Rebuilds the fp.Error a pool worker stored as an integer — error
    /// identity is preserved for callers that distinguish failure kinds.
    fn elementFailure(code: usize) fp.Error {
        return switch (code) {
            @intFromError(fp.Error.DivisionByZero) => fp.Error.DivisionByZero,
            @intFromError(fp.Error.Overflow) => fp.Error.Overflow,
            else => fp.Error.InvalidValue,
        };
    }

    fn sigmoidF64(value: f64) f64 {
        return 1 / (1 + @exp(-value));
    }

    /// Per-channel work payload for the decode-step causal convolution —
    /// one item per channel, disjoint output and state columns.
    const ConvChannelContext = struct {
        output: []fp.Q128_128,
        present: []fp.Q128_128,
        input: []const fp.Q128_128,
        weight: []const fp.Q128_128,
        bias: []const fp.Q128_128,
        past: []const fp.Q128_128,
        kernel: usize,
        silu: bool,
        failure: std.atomic.Value(usize) = std.atomic.Value(usize).init(0),
    };

    fn convChannel(context: *anyopaque, index: usize) void {
        const ctx: *ConvChannelContext = @ptrCast(@alignCast(context));
        conv.causalDecodeChannelF64(ctx.output, ctx.present, ctx.input, ctx.weight, ctx.bias, ctx.past, ctx.kernel, ctx.silu, index) catch |err| {
            ctx.failure.store(@as(usize, @intFromError(err)), .release);
        };
    }

    /// Fast-tier elementwise unary op in f64 behind the Q128 boundary
    /// (ADR-0023/0025) — used for transcendentals where the exact Q128
    /// implementation is orders of magnitude slower than the boundary
    /// conversions. Exact-tier Add/Sub/Mul/Neg stay in Q128: measured
    /// f64 conversion overhead outweighed the wide-arithmetic saving.
    fn unaryElementwiseF64(self: *Runner, node: *const onnx.Node, comptime apply: fn (f64) f64) !void {
        const input = try self.needTensor(node, 0);
        const output = try self.makeOutput(node, 0, input.dims);
        var context = UnaryF64Context{ .output = output.data, .input = input.data, .apply = apply };
        try self.runUnaryF64Elements(&context);
    }

    fn unaryElementwise(self: *Runner, node: *const onnx.Node, comptime apply: fn (fp.Q128_128) fp.Error!fp.Q128_128) !void {
        const input = try self.needTensor(node, 0);
        const output = try self.makeOutput(node, 0, input.dims);
        var context = UnaryElementContext{ .output = output.data, .input = input.data, .apply = apply };
        try self.runUnaryElements(&context);
    }

    fn execSigmoid(self: *Runner, node: *const onnx.Node) !void {
        const input = try self.needTensor(node, 0);
        const output = try self.makeOutput(node, 0, input.dims);
        if (self.fast_numerics) {
            var context = UnaryF64Context{ .output = output.data, .input = input.data, .apply = sigmoidF64 };
            try self.runUnaryF64Elements(&context);
            return;
        }
        if (self.accelerator) |accelerator| {
            if (accelerator.sigmoid) |apply| {
                if (input.data.len > 64) {
                    const report = try apply(accelerator.context, self.allocator, output.data, input.data);
                    self.recordUnaryAccelerator(report);
                    return;
                }
            }
        }
        var context = UnaryElementContext{ .output = output.data, .input = input.data, .apply = sigmoidValue };
        try self.runUnaryElements(&context);
    }

    fn executeNode(self: *Runner, node: *const onnx.Node) !void {
        const custom = std.mem.eql(u8, node.domain, "com.microsoft");
        const name = node.op_type;
        if (!custom) {
            if (std.mem.eql(u8, name, "Shape")) return self.execShape(node);
            if (std.mem.eql(u8, name, "Gather")) return self.execGather(node);
            if (std.mem.eql(u8, name, "Add")) return self.broadcastBinary(node, addValues);
            if (std.mem.eql(u8, name, "Sub")) return self.broadcastBinary(node, subValues);
            if (std.mem.eql(u8, name, "Mul")) return self.broadcastBinary(node, mulValues);
            if (std.mem.eql(u8, name, "Neg")) return self.unaryElementwise(node, negValue);
            if (std.mem.eql(u8, name, "Sqrt")) return if (self.fast_numerics) self.unaryElementwiseF64(node, sqrtF64) else self.unaryElementwise(node, ops.sqrt);
            if (std.mem.eql(u8, name, "Reciprocal")) return if (self.fast_numerics) self.unaryElementwiseF64(node, reciprocalF64) else self.unaryElementwise(node, ops.reciprocal);
            if (std.mem.eql(u8, name, "Sigmoid")) return self.execSigmoid(node);
            if (std.mem.eql(u8, name, "Softplus")) return if (self.fast_numerics) self.unaryElementwiseF64(node, softplusF64) else self.unaryElementwise(node, softplusValue);
            if (std.mem.eql(u8, name, "Sin")) return if (self.fast_numerics) self.unaryElementwiseF64(node, sinF64) else self.unaryElementwise(node, ops.sin);
            if (std.mem.eql(u8, name, "Cos")) return if (self.fast_numerics) self.unaryElementwiseF64(node, cosF64) else self.unaryElementwise(node, ops.cos);
            if (std.mem.eql(u8, name, "Unsqueeze")) return self.execUnsqueeze(node);
            if (std.mem.eql(u8, name, "Squeeze")) return self.execSqueeze(node);
            if (std.mem.eql(u8, name, "Expand")) return self.execExpand(node);
            if (std.mem.eql(u8, name, "Reshape")) return self.execReshape(node);
            if (std.mem.eql(u8, name, "Transpose")) return self.execTranspose(node);
            if (std.mem.eql(u8, name, "Split")) return self.execSplit(node);
            if (std.mem.eql(u8, name, "Slice")) return self.execSlice(node);
            if (std.mem.eql(u8, name, "Concat")) return self.execConcat(node);
            if (std.mem.eql(u8, name, "ReduceSum")) return self.execReduce(node, false);
            if (std.mem.eql(u8, name, "ReduceMean")) return self.execReduce(node, true);
            if (std.mem.eql(u8, name, "Range")) return self.execRange(node);
            if (std.mem.eql(u8, name, "Cast")) return self.execCast(node);
            if (std.mem.eql(u8, name, "MatMul")) return self.execMatMul(node);
            if (std.mem.eql(u8, name, "SimplifiedLayerNormalization")) return self.execLayerNorm(node, false);
            if (std.mem.eql(u8, name, "SkipSimplifiedLayerNormalization")) return self.execLayerNorm(node, true);
        } else {
            if (std.mem.eql(u8, name, "MatMulNBits")) return self.execMatMulNBits(node);
            if (std.mem.eql(u8, name, "CausalConvWithState")) return self.execCausalConv(node);
            if (std.mem.eql(u8, name, "RotaryEmbedding")) return self.execRotary(node);
            if (std.mem.eql(u8, name, "SkipSimplifiedLayerNormalization")) return self.execLayerNorm(node, true);
            if (std.mem.eql(u8, name, "GatherBlockQuantized")) return self.execGatherBlockQuantized(node);
            if (std.mem.eql(u8, name, "LinearAttention")) return self.execLinearAttention(node);
            if (std.mem.eql(u8, name, "GroupQueryAttention")) return self.execGroupQueryAttention(node);
        }
        return error.UnsupportedOperator;
    }

    fn execShape(self: *Runner, node: *const onnx.Node) !void {
        const entry = self.store.get(inputName(node, 0)) orelse return error.MissingTensor;
        const dims = switch (entry.*) {
            .tensor => |*tensor| tensor.dims,
            .blob => |*blob| blob.dims,
        };
        const output = try self.makeOutput(node, 0, &.{dims.len});
        for (dims, 0..) |dim, index| output.data[index] = fp.Q128_128.fromInt(@intCast(dim));
    }

    fn execGather(self: *Runner, node: *const onnx.Node) !void {
        const data = try self.needTensor(node, 0);
        const indices = try self.needTensor(node, 1);
        const axis = try normalizeAxis(attrInt(node, "axis", 0), data.dims.len);
        var inner: usize = 1;
        for (axis + 1..data.dims.len) |dim_axis| inner *= data.dims[dim_axis];
        var out_dims = std.ArrayList(usize).init(self.allocator);
        defer out_dims.deinit();
        try out_dims.appendSlice(data.dims[0..axis]);
        try out_dims.appendSlice(indices.dims);
        try out_dims.appendSlice(data.dims[axis + 1 ..]);
        const output = try self.makeOutput(node, 0, out_dims.items);
        const outer: usize = if (axis == 0) 1 else blk: {
            var count: usize = 1;
            for (0..axis) |dim_axis| count *= data.dims[dim_axis];
            break :blk count;
        };
        const axis_size = data.dims[axis];
        for (0..outer) |outer_index| {
            for (indices.data, 0..) |index_value, slot| {
                var index = tensorToI64(index_value);
                if (index < 0) index += @intCast(axis_size);
                if (index < 0 or index >= @as(i64, @intCast(axis_size))) return error.IndexOutOfRange;
                const source = (outer_index * axis_size + @as(usize, @intCast(index))) * inner;
                const destination = (outer_index * indices.data.len + slot) * inner;
                @memcpy(output.data[destination..][0..inner], data.data[source..][0..inner]);
            }
        }
    }

    fn execUnsqueeze(self: *Runner, node: *const onnx.Node) !void {
        const input = try self.needTensor(node, 0);
        const axes_tensor = try self.needTensor(node, 1);
        const axes = try self.intTensorValues(axes_tensor);
        defer self.allocator.free(axes);
        const out_rank = input.dims.len + axes.len;
        if (out_rank > MAX_RANK) return error.UnsupportedShape;
        var insert = [_]bool{false} ** MAX_RANK;
        for (axes) |axis| {
            var normalized = axis;
            if (normalized < 0) normalized += @intCast(out_rank);
            if (normalized < 0 or normalized >= @as(i64, @intCast(out_rank))) return error.ShapeMismatch;
            insert[@intCast(normalized)] = true;
        }
        var dims: [MAX_RANK]usize = undefined;
        var source: usize = 0;
        for (0..out_rank) |axis| {
            if (insert[axis]) {
                dims[axis] = 1;
            } else {
                dims[axis] = input.dims[source];
                source += 1;
            }
        }
        const output = try self.makeOutput(node, 0, dims[0..out_rank]);
        @memcpy(output.data, input.data);
    }

    fn execSqueeze(self: *Runner, node: *const onnx.Node) !void {
        const input = try self.needTensor(node, 0);
        var remove = [_]bool{false} ** MAX_RANK;
        var explicit = false;
        if (node.inputs.items.len > 1 and inputName(node, 1).len != 0) {
            const axes_tensor = try self.needTensor(node, 1);
            const axes = try self.intTensorValues(axes_tensor);
            defer self.allocator.free(axes);
            explicit = true;
            for (axes) |axis| remove[try normalizeAxis(axis, input.dims.len)] = true;
        }
        var dims = std.ArrayList(usize).init(self.allocator);
        defer dims.deinit();
        for (input.dims, 0..) |dim, axis| {
            const drop = if (explicit) remove[axis] else dim == 1;
            if (drop and dim != 1) return error.ShapeMismatch;
            if (!drop) try dims.append(dim);
        }
        const output = try self.makeOutput(node, 0, dims.items);
        @memcpy(output.data, input.data);
    }

    fn execExpand(self: *Runner, node: *const onnx.Node) !void {
        const input = try self.needTensor(node, 0);
        const target_tensor = try self.needTensor(node, 1);
        const target = try self.intTensorValues(target_tensor);
        defer self.allocator.free(target);
        if (target.len > MAX_RANK or target.len < input.dims.len) return error.UnsupportedShape;
        var out_dims: [MAX_RANK]usize = undefined;
        const offset = target.len - input.dims.len;
        for (target, 0..) |dim_value, axis| {
            if (dim_value < 0) return error.ShapeMismatch;
            out_dims[axis] = @intCast(dim_value);
        }
        for (input.dims, 0..) |dim, axis| {
            const target_dim = out_dims[offset + axis];
            if (dim != 1 and dim != target_dim) return error.ShapeMismatch;
        }
        const output = try self.makeOutput(node, 0, out_dims[0..target.len]);
        var input_strides: [MAX_RANK]usize = undefined;
        stridesOf(input.dims, &input_strides);
        for (output.data, 0..) |*destination, flat| {
            var remaining = flat;
            var source_index: usize = 0;
            var axis: usize = out_dims[0..target.len].len;
            while (axis > 0) {
                axis -= 1;
                const coord = remaining % out_dims[axis];
                remaining /= out_dims[axis];
                if (axis >= offset) {
                    const input_axis = axis - offset;
                    source_index += (if (input.dims[input_axis] == 1) 0 else coord) * input_strides[input_axis];
                }
            }
            destination.* = input.data[source_index];
        }
    }

    fn execReshape(self: *Runner, node: *const onnx.Node) !void {
        const input = try self.needTensor(node, 0);
        const shape_tensor = try self.needTensor(node, 1);
        const requested = try self.intTensorValues(shape_tensor);
        defer self.allocator.free(requested);
        if (requested.len > MAX_RANK) return error.UnsupportedShape;
        const allow_zero = attrInt(node, "allowzero", 0) != 0;
        var dims: [MAX_RANK]usize = undefined;
        var known: usize = 1;
        var inferred: ?usize = null;
        for (requested, 0..) |dim_value, axis| {
            if (dim_value == -1) {
                if (inferred != null) return error.ShapeMismatch;
                inferred = axis;
                dims[axis] = 1;
            } else if (dim_value == 0 and !allow_zero) {
                if (axis >= input.dims.len) return error.ShapeMismatch;
                dims[axis] = input.dims[axis];
                known *= dims[axis];
            } else if (dim_value >= 0) {
                dims[axis] = @intCast(dim_value);
                known *= dims[axis];
            } else return error.ShapeMismatch;
        }
        if (inferred) |axis| {
            if (known == 0 or input.data.len % known != 0) return error.ShapeMismatch;
            dims[axis] = input.data.len / known;
        } else if (known != input.data.len) return error.ShapeMismatch;
        const output = try self.makeOutput(node, 0, dims[0..requested.len]);
        @memcpy(output.data, input.data);
    }

    fn execTranspose(self: *Runner, node: *const onnx.Node) !void {
        const input = try self.needTensor(node, 0);
        var perm: [MAX_RANK]usize = undefined;
        if (attrInts(node, "perm")) |permutation| {
            if (permutation.len != input.dims.len) return error.ShapeMismatch;
            for (permutation, 0..) |axis, index| perm[index] = try normalizeAxis(axis, input.dims.len);
        } else {
            for (0..input.dims.len) |index| perm[index] = input.dims.len - 1 - index;
        }
        var out_dims: [MAX_RANK]usize = undefined;
        for (0..input.dims.len) |axis| out_dims[axis] = input.dims[perm[axis]];
        const output = try self.makeOutput(node, 0, out_dims[0..input.dims.len]);
        try shapes.transpose(output.data, input.data, .{ .dims = input.dims }, perm[0..input.dims.len]);
    }

    fn execSplit(self: *Runner, node: *const onnx.Node) !void {
        const input = try self.needTensor(node, 0);
        const axis = try normalizeAxis(attrInt(node, "axis", 0), input.dims.len);
        var sizes = std.ArrayList(usize).init(self.allocator);
        defer sizes.deinit();
        if (node.inputs.items.len > 1 and inputName(node, 1).len != 0) {
            const split_tensor = try self.needTensor(node, 1);
            const values = try self.intTensorValues(split_tensor);
            defer self.allocator.free(values);
            for (values) |value| {
                if (value < 0) return error.ShapeMismatch;
                try sizes.append(@intCast(value));
            }
        } else {
            const count = node.outputs.items.len;
            if (count == 0 or input.dims[axis] % count != 0) return error.ShapeMismatch;
            for (0..count) |_| try sizes.append(input.dims[axis] / count);
        }
        if (sizes.items.len != node.outputs.items.len) return error.ShapeMismatch;
        var total: usize = 0;
        for (sizes.items) |size| total += size;
        if (total != input.dims[axis]) return error.ShapeMismatch;
        var inner: usize = 1;
        for (axis + 1..input.dims.len) |dim_axis| inner *= input.dims[dim_axis];
        var outer: usize = 1;
        for (0..axis) |dim_axis| outer *= input.dims[dim_axis];
        var offset: usize = 0;
        for (sizes.items, 0..) |size, output_index| {
            var out_dims = std.ArrayList(usize).init(self.allocator);
            defer out_dims.deinit();
            try out_dims.appendSlice(input.dims);
            out_dims.items[axis] = size;
            const output = try self.makeOutput(node, output_index, out_dims.items);
            for (0..outer) |outer_index| {
                const source = (outer_index * input.dims[axis] + offset) * inner;
                const destination = outer_index * size * inner;
                @memcpy(output.data[destination..][0 .. size * inner], input.data[source..][0 .. size * inner]);
            }
            offset += size;
        }
    }

    fn execSlice(self: *Runner, node: *const onnx.Node) !void {
        const input = try self.needTensor(node, 0);
        const starts_tensor = try self.needTensor(node, 1);
        const ends_tensor = try self.needTensor(node, 2);
        const starts = try self.intTensorValues(starts_tensor);
        defer self.allocator.free(starts);
        const ends = try self.intTensorValues(ends_tensor);
        defer self.allocator.free(ends);
        if (starts.len != ends.len) return error.ShapeMismatch;
        var axes_buf: [MAX_RANK]i64 = undefined;
        const axes: []i64 = axes_buf[0..starts.len];
        if (node.inputs.items.len > 3 and inputName(node, 3).len != 0) {
            const axes_tensor = try self.needTensor(node, 3);
            const parsed = try self.intTensorValues(axes_tensor);
            defer self.allocator.free(parsed);
            if (parsed.len != starts.len) return error.ShapeMismatch;
            @memcpy(axes, parsed);
        } else for (axes, 0..) |*axis, index| axis.* = @intCast(index);
        var steps_buf: [MAX_RANK]i64 = undefined;
        const steps: []i64 = steps_buf[0..starts.len];
        if (node.inputs.items.len > 4 and inputName(node, 4).len != 0) {
            const steps_tensor = try self.needTensor(node, 4);
            const parsed = try self.intTensorValues(steps_tensor);
            defer self.allocator.free(parsed);
            if (parsed.len != starts.len) return error.ShapeMismatch;
            @memcpy(steps, parsed);
        } else @memset(steps, 1);
        var out_dims: [MAX_RANK]usize = undefined;
        @memcpy(out_dims[0..input.dims.len], input.dims);
        var ranges = [_]struct { start: usize, step: usize }{.{ .start = 0, .step = 1 }} ** MAX_RANK;
        for (starts, 0..) |raw_start, range_index| {
            const axis = try normalizeAxis(axes[range_index], input.dims.len);
            const step = steps[range_index];
            if (step <= 0) return error.UnsupportedOperator;
            const dim: i64 = @intCast(input.dims[axis]);
            var start = raw_start;
            var end = ends[range_index];
            if (start < 0) start += dim;
            if (end < 0) end += dim;
            start = std.math.clamp(start, 0, dim);
            end = std.math.clamp(end, 0, dim);
            if (end < start) end = start;
            ranges[axis] = .{ .start = @intCast(start), .step = @intCast(step) };
            out_dims[axis] = @intCast(@divTrunc(end - start + step - 1, step));
        }
        const output = try self.makeOutput(node, 0, out_dims[0..input.dims.len]);
        var input_strides: [MAX_RANK]usize = undefined;
        stridesOf(input.dims, &input_strides);
        for (output.data, 0..) |*destination, flat| {
            var remaining = flat;
            var source_index: usize = 0;
            var axis: usize = input.dims.len;
            while (axis > 0) {
                axis -= 1;
                const coord = remaining % out_dims[axis];
                remaining /= out_dims[axis];
                source_index += (ranges[axis].start + coord * ranges[axis].step) * input_strides[axis];
            }
            destination.* = input.data[source_index];
        }
    }

    fn execConcat(self: *Runner, node: *const onnx.Node) !void {
        const first = try self.needTensor(node, 0);
        const axis = try normalizeAxis(attrInt(node, "axis", 0), first.dims.len);
        var out_dims: [MAX_RANK]usize = undefined;
        @memcpy(out_dims[0..first.dims.len], first.dims);
        var input_count: usize = 0;
        for (node.inputs.items) |name| {
            if (name.len == 0) continue;
            const tensor = self.store.getTensor(name) orelse return error.MissingTensor;
            if (tensor.dims.len != first.dims.len) return error.ShapeMismatch;
            for (tensor.dims, 0..) |dim, dim_axis| {
                if (dim_axis != axis and dim != first.dims[dim_axis]) return error.ShapeMismatch;
            }
            if (input_count > 0) out_dims[axis] += tensor.dims[axis];
            input_count += 1;
        }
        const output = try self.makeOutput(node, 0, out_dims[0..first.dims.len]);
        var out_strides: [MAX_RANK]usize = undefined;
        stridesOf(out_dims[0..first.dims.len], &out_strides);
        var axis_offset: usize = 0;
        for (node.inputs.items) |name| {
            if (name.len == 0) continue;
            const tensor = self.store.getTensor(name).?;
            var in_strides: [MAX_RANK]usize = undefined;
            stridesOf(tensor.dims, &in_strides);
            for (tensor.data, 0..) |value, flat| {
                var remaining = flat;
                var destination: usize = 0;
                var dim_axis: usize = tensor.dims.len;
                while (dim_axis > 0) {
                    dim_axis -= 1;
                    var coord = remaining % tensor.dims[dim_axis];
                    remaining /= tensor.dims[dim_axis];
                    if (dim_axis == axis) coord += axis_offset;
                    destination += coord * out_strides[dim_axis];
                }
                output.data[destination] = value;
            }
            axis_offset += tensor.dims[axis];
        }
    }

    fn execReduce(self: *Runner, node: *const onnx.Node, mean: bool) !void {
        const input = try self.needTensor(node, 0);
        var reduce_axes = [_]bool{false} ** MAX_RANK;
        var any_axes = false;
        if (node.inputs.items.len > 1 and inputName(node, 1).len != 0) {
            const axes_tensor = try self.needTensor(node, 1);
            const axes = try self.intTensorValues(axes_tensor);
            defer self.allocator.free(axes);
            for (axes) |axis| {
                reduce_axes[try normalizeAxis(axis, input.dims.len)] = true;
                any_axes = true;
            }
        }
        const keepdims = attrInt(node, "keepdims", 1) != 0;
        if (!any_axes and attrInt(node, "noop_with_empty_axes", 0) != 0) {
            const output = try self.makeOutput(node, 0, input.dims);
            @memcpy(output.data, input.data);
            return;
        }
        if (!any_axes) for (0..input.dims.len) |axis| {
            reduce_axes[axis] = true;
        };
        var out_dims = std.ArrayList(usize).init(self.allocator);
        defer out_dims.deinit();
        var out_axis_of: [MAX_RANK]usize = undefined;
        var out_axis: usize = 0;
        for (input.dims, 0..) |dim, axis| {
            if (reduce_axes[axis]) {
                if (keepdims) {
                    try out_dims.append(1);
                    out_axis += 1;
                }
            } else {
                try out_dims.append(dim);
                out_axis_of[axis] = out_axis;
                out_axis += 1;
            }
        }
        const output = try self.makeOutput(node, 0, out_dims.items);
        @memset(output.data, fp.Q128_128.zero);
        var in_strides: [MAX_RANK]usize = undefined;
        var out_strides: [MAX_RANK]usize = undefined;
        stridesOf(input.dims, &in_strides);
        if (out_dims.items.len > 0) stridesOf(out_dims.items, &out_strides);
        var counts: usize = 1;
        for (0..input.dims.len) |axis| {
            if (reduce_axes[axis]) counts *= input.dims[axis];
        }
        for (input.data, 0..) |value, flat| {
            var remaining = flat;
            var out_index: usize = 0;
            var axis: usize = input.dims.len;
            while (axis > 0) {
                axis -= 1;
                const coord = remaining % input.dims[axis];
                remaining /= input.dims[axis];
                if (!reduce_axes[axis]) out_index += coord * out_strides[out_axis_of[axis]];
            }
            output.data[out_index] = try output.data[out_index].add(value);
        }
        if (mean and counts > 1) {
            const divisor = fp.Q128_128.fromInt(@intCast(counts));
            for (output.data) |*value| value.* = try value.*.div(divisor);
        }
    }

    fn execRange(self: *Runner, node: *const onnx.Node) !void {
        const start = try self.needTensor(node, 0);
        const limit = try self.needTensor(node, 1);
        const delta = try self.needTensor(node, 2);
        if (start.data.len != 1 or limit.data.len != 1 or delta.data.len != 1) return error.ShapeMismatch;
        const count_raw = try (try limit.data[0].sub(start.data[0])).div(delta.data[0]);
        const count_i64 = tensorToI64(count_raw);
        const count: usize = if (count_i64 <= 0) 0 else @intCast(count_i64);
        const output = try self.makeOutput(node, 0, &.{count});
        try shapes.range(output.data, start.data[0], delta.data[0]);
    }

    fn execCast(self: *Runner, node: *const onnx.Node) !void {
        // q128 representation boundary: supported casts preserve the raw value.
        const entry = (self.store.get(inputName(node, 0)) orelse return error.MissingTensor).*;
        switch (entry) {
            .tensor => |tensor| {
                const output = try self.makeOutput(node, 0, tensor.dims);
                @memcpy(output.data, tensor.data);
            },
            .blob => |blob| {
                const output = try self.makeOutput(node, 0, blob.dims);
                if (blob.data_type == 7) {
                    if (blob.data.len != output.data.len * 8) return error.ShapeMismatch;
                    for (output.data, 0..) |*destination, index| {
                        destination.* = fp.Q128_128.fromInt(std.mem.readInt(i64, blob.data[index * 8 ..][0..8], .little));
                    }
                } else if (blob.data_type == 1) {
                    if (blob.data.len != output.data.len * 4) return error.ShapeMismatch;
                    for (output.data, 0..) |*destination, index| {
                        destination.* = try fp.Q128_128.fromF32BitsSaturating(std.mem.readInt(u32, blob.data[index * 4 ..][0..4], .little));
                    }
                } else return error.UnsupportedOperator;
            },
        }
    }

    fn execMatMul(self: *Runner, node: *const onnx.Node) !void {
        const left = try self.needTensor(node, 0);
        const right = try self.needTensor(node, 1);
        if (left.dims.len < 2 or right.dims.len < 2) return error.ShapeMismatch;
        const m = left.dims[left.dims.len - 2];
        const k = left.dims[left.dims.len - 1];
        const n = right.dims[right.dims.len - 1];
        if (k != right.dims[right.dims.len - 2]) return error.ShapeMismatch;
        const left_batch = left.data.len / (m * k);
        const right_batch = right.data.len / (right.dims[right.dims.len - 2] * n);
        if (left_batch != right_batch and left_batch != 1 and right_batch != 1) return error.ShapeMismatch;
        const batch = @max(left_batch, right_batch);
        var out_dims = std.ArrayList(usize).init(self.allocator);
        defer out_dims.deinit();
        const batch_dims = try self.broadcastDims(left.dims[0 .. left.dims.len - 2], right.dims[0 .. right.dims.len - 2]);
        defer self.allocator.free(batch_dims);
        try out_dims.appendSlice(batch_dims);
        try out_dims.append(m);
        try out_dims.append(n);
        const output = try self.makeOutput(node, 0, out_dims.items);
        for (0..batch) |batch_index| {
            const left_base = (if (left_batch == 1) 0 else batch_index) * m * k;
            const right_base = (if (right_batch == 1) 0 else batch_index) * right.dims[right.dims.len - 2] * n;
            const output_slice = output.data[batch_index * m * n ..][0 .. m * n];
            const left_slice = left.data[left_base..][0 .. m * k];
            const right_slice = right.data[right_base..][0 .. right.dims[right.dims.len - 2] * n];
            const left_shape = ops.Shape{ .rows = m, .columns = k };
            const right_shape = ops.Shape{ .rows = right.dims[right.dims.len - 2], .columns = n };
            if (self.accelerator) |accelerator| {
                if (accelerator.matmul) |matmul| {
                    const report = try matmul(accelerator.context, self.allocator, output_slice, left_slice, left_shape, right_slice, right_shape);
                    self.recordAccelerator(report, false);
                    continue;
                }
            }
            try ops.matMul(output_slice, left_slice, left_shape, right_slice, right_shape);
        }
    }

    fn execLayerNorm(self: *Runner, node: *const onnx.Node, skip: bool) !void {
        const input = try self.needTensor(node, 0);
        if (input.dims.len == 0) return error.ShapeMismatch;
        const hidden = input.dims[input.dims.len - 1];
        const rows = input.data.len / hidden;
        const epsilon = try fp.Q128_128.fromF32Bits(@bitCast(attrFloat(node, "epsilon", 0.0)));
        var weight_index: usize = 1;
        var skip_tensor: ?Tensor = null;
        if (skip) {
            skip_tensor = try self.needTensor(node, 1);
            weight_index = 2;
        }
        const weight = try self.needTensor(node, weight_index);
        if (weight.data.len != hidden) return error.ShapeMismatch;
        const output = try self.makeOutput(node, 0, input.dims);
        var residual: ?*Tensor = null;
        if (node.outputs.items.len > 3 and node.outputs.items[3].len != 0) {
            residual = try self.makeOutput(node, 3, input.dims);
        }
        const zeros = [_]fp.Q128_128{fp.Q128_128.zero};
        var weight_f64: ?[]f64 = null;
        defer if (weight_f64) |buffer| self.allocator.free(buffer);
        var sums_f64: ?[]f64 = null;
        defer if (sums_f64) |buffer| self.allocator.free(buffer);
        var epsilon_f64: f64 = 0;
        if (self.fast_numerics) {
            weight_f64 = try self.allocator.alloc(f64, weight.data.len);
            for (weight_f64.?, weight.data) |*slot, element| slot.* = element.toF64();
            sums_f64 = try self.allocator.alloc(f64, hidden);
            epsilon_f64 = epsilon.toF64();
        }
        for (0..rows) |row| {
            const hidden_row = input.data[row * hidden ..][0..hidden];
            const skip_row = if (skip_tensor) |tensor| blk: {
                if (tensor.data.len == input.data.len) break :blk tensor.data[row * hidden ..][0..hidden];
                if (tensor.data.len == hidden) break :blk tensor.data;
                return error.ShapeMismatch;
            } else zeros[0..];
            if (residual) |res| {
                for (res.data[row * hidden ..][0..hidden], hidden_row, 0..) |*destination, hidden_value, index| {
                    destination.* = try hidden_value.add(skip_row[if (skip_row.len == 1) 0 else index]);
                }
            }
            if (weight_f64) |wf| {
                try norms.skipSimplifiedLayerNormF64(output.data[row * hidden ..][0..hidden], hidden_row, skip_row, wf, epsilon_f64, sums_f64.?);
            } else {
                try norms.skipSimplifiedLayerNorm(output.data[row * hidden ..][0..hidden], hidden_row, skip_row, weight.data, epsilon);
            }
        }
    }

    fn execMatMulNBits(self: *Runner, node: *const onnx.Node) !void {
        const left = try self.needTensor(node, 0);
        const quant = try self.needBlob(node, 1);
        const scales = try self.needTensor(node, 2);
        const k_attr = attrInt(node, "K", -1);
        const n_attr = attrInt(node, "N", -1);
        const bits = attrInt(node, "bits", 4);
        const block_size = attrInt(node, "block_size", 32);
        if (k_attr <= 0 or n_attr <= 0 or bits != 4 or block_size <= 0) return error.UnsupportedOperator;
        const k: usize = @intCast(k_attr);
        const n: usize = @intCast(n_attr);
        const block: usize = @intCast(block_size);
        if (left.dims.len == 0 or left.dims[left.dims.len - 1] != k) return error.ShapeMismatch;
        const rows = left.data.len / k;
        var out_dims: [MAX_RANK]usize = undefined;
        @memcpy(out_dims[0 .. left.dims.len - 1], left.dims[0 .. left.dims.len - 1]);
        out_dims[left.dims.len - 1] = n;
        const output = try self.makeOutput(node, 0, out_dims[0..left.dims.len]);
        var zp_data: []const u8 = &.{};
        var zp_storage: []u8 = &.{};
        defer self.allocator.free(zp_storage);
        if (node.inputs.items.len > 3 and inputName(node, 3).len != 0) {
            const zp = try self.needBlob(node, 3);
            zp_data = zp.data;
        } else {
            const block_count = k / block;
            zp_storage = try self.allocator.alloc(u8, n * ((block_count + 1) / 2));
            @memset(zp_storage, 0x88);
            zp_data = zp_storage;
        }
        if (self.accelerator) |accelerator| {
            if (accelerator.matmul4) |matmul4| {
                const report = matmul4(accelerator.context, self.allocator, output.data, left.data, .{ .rows = rows, .columns = k }, quant.data, scales.data, zp_data, k, n, block) catch |err| switch (err) {
                    // The tiled fast shader requires 8-element-aligned quant
                    // blocks; anything else keeps the exact CPU kernel.
                    error.UnsupportedLayout => null,
                    else => return err,
                };
                if (report) |value| {
                    self.recordAccelerator(value, true);
                    return;
                }
            }
        }
        try self.matmul4_scratch.resize(k);
        try ops.matMul4Bit(output.data, left.data, .{ .rows = rows, .columns = k }, quant.data, scales.data, zp_data, k, n, block, self.matmul4_scratch.items);
    }

    fn execCausalConv(self: *Runner, node: *const onnx.Node) !void {
        const input = try self.needTensor(node, 0);
        var weight: Tensor = undefined;
        if (self.store.getTensor(inputName(node, 1))) |tensor| {
            weight = tensor.*;
        } else if (self.store.getBlob(inputName(node, 1))) |blob| {
            weight = try self.blobToTensor(blob);
            try self.store.putTensor(node.inputs.items[1], weight);
        } else return error.MissingTensor;
        if (input.dims.len != 3) return error.ShapeMismatch;
        const batch = input.dims[0];
        const channels = input.dims[1];
        const length = input.dims[2];
        if (weight.dims.len < 2 or weight.dims[0] != channels) return error.ShapeMismatch;
        const kernel = weight.dims[weight.dims.len - 1];
        var bias_data: []const fp.Q128_128 = &.{};
        if (node.inputs.items.len > 2 and inputName(node, 2).len != 0) {
            const bias = try self.needTensor(node, 2);
            bias_data = bias.data;
        }
        var past_data: []const fp.Q128_128 = &.{};
        if (node.inputs.items.len > 3 and inputName(node, 3).len != 0) {
            const past = try self.needTensor(node, 3);
            past_data = past.data;
        }
        const activation = attrString(node, "activation");
        const silu = activation != null and std.mem.eql(u8, activation.?, "silu");
        const output = try self.makeOutput(node, 0, &.{ batch, channels, length });
        const present = try self.makeOutput(node, 1, &.{ batch, channels, kernel - 1 });
        if (self.fast_numerics and batch == 1 and length == 1) {
            // Decode-step specialization: at L=1 the channel-last and
            // channel-first layouts coincide, so the transposes and f64
            // staging buffers vanish — each channel is an independent work
            // item (deterministic: disjoint output/state columns).
            var context = ConvChannelContext{
                .output = output.data,
                .present = present.data,
                .input = input.data,
                .weight = weight.data,
                .bias = bias_data,
                .past = past_data,
                .kernel = kernel,
                .silu = silu,
            };
            if (comptime worker_pool.supports_threads) {
                if (channels >= UNARY_PARALLEL_MIN) {
                    if (self.workerPool()) |pool_instance| {
                        pool_instance.run(&context, convChannel, channels);
                        const failure = context.failure.load(.acquire);
                        if (failure != 0) return elementFailure(failure);
                        return;
                    }
                }
            }
            for (0..channels) |channel| try conv.causalDecodeChannelF64(output.data, present.data, input.data, weight.data, bias_data, past_data, kernel, silu, channel);
            return;
        }
        if (self.fast_numerics) {
            // Fast tier (ADR-0023): f32 channel-last convolution; `present`
            // remains an exact Q128 copy of the recurrent state inputs.
            const input_f64 = try self.allocator.alloc(f64, input.data.len);
            defer self.allocator.free(input_f64);
            const conv_f64 = try self.allocator.alloc(f64, input.data.len);
            defer self.allocator.free(conv_f64);
            const weight_f64 = try self.allocator.alloc(f64, weight.data.len);
            defer self.allocator.free(weight_f64);
            const bias_f64 = try self.allocator.alloc(f64, bias_data.len);
            defer self.allocator.free(bias_f64);
            for (0..batch) |b| {
                for (0..length) |time| {
                    for (0..channels) |channel| {
                        input_f64[(b * length + time) * channels + channel] = input.data[(b * channels + channel) * length + time].toF64();
                    }
                }
            }
            for (weight_f64, weight.data) |*slot, element| slot.* = element.toF64();
            for (bias_f64, bias_data) |*slot, element| slot.* = element.toF64();
            try conv.causalDepthwiseF64(conv_f64, present.data, input.data, input_f64, weight_f64, bias_f64, past_data, batch, channels, length, kernel, silu);
            for (0..batch) |b| {
                for (0..length) |time| {
                    for (0..channels) |channel| {
                        output.data[(b * channels + channel) * length + time] = try fp.Q128_128.fromF64Saturating(conv_f64[(b * length + time) * channels + channel]);
                    }
                }
            }
            return;
        }
        if (self.accelerator) |accelerator| {
            if (accelerator.causal_conv) |causal_conv| {
                if (batch == 1 and length == 1) {
                    const report = try causal_conv(accelerator.context, self.allocator, output.data, present.data, input.data, weight.data, bias_data, past_data, batch, channels, length, kernel, silu);
                    self.recordUnaryAccelerator(report);
                    return;
                }
            }
        }
        // Kernel consumes channel-last layout; transpose [B,C,L] -> [B,L,C].
        const channel_last = try self.allocator.alloc(fp.Q128_128, input.data.len);
        defer self.allocator.free(channel_last);
        const conv_out = try self.allocator.alloc(fp.Q128_128, input.data.len);
        defer self.allocator.free(conv_out);
        for (0..batch) |b| {
            for (0..length) |time| {
                for (0..channels) |channel| {
                    channel_last[(b * length + time) * channels + channel] = input.data[(b * channels + channel) * length + time];
                }
            }
        }
        try conv.causalDepthwise(conv_out, present.data, channel_last, weight.data, bias_data, past_data, batch, channels, length, kernel, silu);
        for (0..batch) |b| {
            for (0..length) |time| {
                for (0..channels) |channel| {
                    output.data[(b * channels + channel) * length + time] = conv_out[(b * length + time) * channels + channel];
                }
            }
        }
    }

    fn execRotary(self: *Runner, node: *const onnx.Node) !void {
        // Qwen contrib contract: (input[B,H,S,HS], position_ids[B,S],
        // cos_cache[P,rotary_dim/2], sin_cache[P,rotary_dim/2]).
        const input = try self.needTensor(node, 0);
        const cos_cache = try self.needTensor(node, 2);
        const sin_cache = try self.needTensor(node, 3);
        if (input.dims.len != 4) return error.ShapeMismatch;
        const rotary_dim: usize = @intCast(@max(0, attrInt(node, "rotary_embedding_dim", @intCast(input.dims[3]))));
        const interleaved = attrInt(node, "interleaved", 0) != 0;
        const batch = input.dims[0];
        const heads = input.dims[1];
        const sequence = input.dims[2];
        const head_size = input.dims[3];
        const positions_buf = try self.allocator.alloc(usize, batch * sequence);
        defer self.allocator.free(positions_buf);
        if (node.inputs.items.len > 1 and inputName(node, 1).len != 0) {
            const position_tensor = try self.needTensor(node, 1);
            if (position_tensor.data.len != batch * sequence) return error.ShapeMismatch;
            for (position_tensor.data, 0..) |value, index| {
                const position = tensorToI64(value);
                if (position < 0) return error.ShapeMismatch;
                positions_buf[index] = @intCast(position);
            }
        } else {
            for (0..batch * sequence) |index| positions_buf[index] = index % sequence;
        }
        // The kernel consumes [B,S,H,HS]; transpose in and out.
        const bshs = try self.allocator.alloc(fp.Q128_128, input.data.len);
        defer self.allocator.free(bshs);
        const rotated = try self.allocator.alloc(fp.Q128_128, input.data.len);
        defer self.allocator.free(rotated);
        for (0..batch) |b| {
            for (0..sequence) |s| {
                for (0..heads) |h| {
                    const source = ((b * heads + h) * sequence + s) * head_size;
                    const destination = ((b * sequence + s) * heads + h) * head_size;
                    @memcpy(bshs[destination..][0..head_size], input.data[source..][0..head_size]);
                }
            }
        }
        try ops.rotaryEmbedding(rotated, bshs, .{
            .batch = batch,
            .sequence = sequence,
            .heads = heads,
            .head_size = head_size,
        }, cos_cache.data, sin_cache.data, positions_buf, rotary_dim, interleaved);
        const output = try self.makeOutput(node, 0, input.dims);
        for (0..batch) |b| {
            for (0..sequence) |s| {
                for (0..heads) |h| {
                    const destination = ((b * heads + h) * sequence + s) * head_size;
                    const source = ((b * sequence + s) * heads + h) * head_size;
                    @memcpy(output.data[destination..][0..head_size], rotated[source..][0..head_size]);
                }
            }
        }
    }

    fn execGatherBlockQuantized(self: *Runner, node: *const onnx.Node) !void {
        const data = try self.needBlob(node, 0);
        const scales = try self.needTensor(node, 1);
        const zp = try self.needBlob(node, 2);
        const indices = try self.needTensor(node, 3);
        const bits = attrInt(node, "bits", 4);
        const block_size = attrInt(node, "block_size", 32);
        const gather_axis = attrInt(node, "gather_axis", 0);
        if (bits != 4 or gather_axis != 0 or data.dims.len != 2) return error.UnsupportedOperator;
        const row_packed = data.dims[1];
        const row_width = row_packed * 2;
        const blocks_per_row = row_width / @as(usize, @intCast(block_size));
        if (scales.dims.len != 2 or scales.dims[1] != blocks_per_row) return error.ShapeMismatch;
        var out_dims = std.ArrayList(usize).init(self.allocator);
        defer out_dims.deinit();
        try out_dims.appendSlice(indices.dims);
        try out_dims.append(row_width);
        const output = try self.makeOutput(node, 0, out_dims.items);
        for (indices.data, 0..) |index_value, row| {
            const index = tensorToI64(index_value);
            if (index < 0 or index >= @as(i64, @intCast(data.dims[0]))) return error.IndexOutOfRange;
            const row_index: usize = @intCast(index);
            try ops.decode4BitRow(
                output.data[row * row_width ..][0..row_width],
                data.data[row_index * row_packed ..][0..row_packed],
                scales.data[row_index * blocks_per_row ..][0..blocks_per_row],
                zp.data[row_index * ((blocks_per_row + 1) / 2) ..][0 .. (blocks_per_row + 1) / 2],
                @intCast(block_size),
            );
        }
    }

    fn execLinearAttention(self: *Runner, node: *const onnx.Node) !void {
        const rule = attrString(node, "update_rule") orelse "gated_delta";
        if (!std.mem.eql(u8, rule, "gated_delta")) return error.UnsupportedOperator;
        const query = try self.needTensor(node, 0);
        const key = try self.needTensor(node, 1);
        const value = try self.needTensor(node, 2);
        const past = try self.needTensor(node, 3);
        const decay = try self.needTensor(node, 4);
        const beta = try self.needTensor(node, 5);
        const query_heads: usize = @intCast(@max(1, attrInt(node, "q_num_heads", 1)));
        const kv_heads: usize = @intCast(@max(1, attrInt(node, "kv_num_heads", 1)));
        if (query.dims.len < 2 or past.dims.len != 4) return error.ShapeMismatch;
        const batch = query.dims[0];
        const length = query.dims[1];
        const key_size = past.dims[2];
        const value_size = past.dims[3];
        if (past.dims[0] != batch or past.dims[1] != kv_heads) return error.ShapeMismatch;
        if (query.dims[query.dims.len - 1] != query_heads * key_size or
            key.dims[key.dims.len - 1] != kv_heads * key_size or
            value.dims[value.dims.len - 1] != kv_heads * value_size or
            decay.data.len != batch * length * kv_heads or
            beta.data.len != batch * length * kv_heads) return error.ShapeMismatch;
        var out_dims = std.ArrayList(usize).init(self.allocator);
        defer out_dims.deinit();
        try out_dims.appendSlice(query.dims[0 .. query.dims.len - 1]);
        try out_dims.append(query_heads * value_size);
        const output = try self.makeOutput(node, 0, out_dims.items);
        const present = try self.makeOutput(node, 1, past.dims);
        const scale = try fp.Q128_128.one.div(try ops.sqrt(fp.Q128_128.fromInt(@intCast(key_size))));
        if (self.fast_numerics) {
            // Fast tier (ADR-0023/0025): gated delta scan in f64. The
            // recurrent state lives in a persistent f64 shadow keyed by the
            // `past_*` input's normalized name, so decode steps skip the
            // Q128→f64 state conversion entirely; `present_state` is still
            // written back in Q128 as the canonical stored value.
            const query_f64 = try self.allocator.alloc(f64, query.data.len);
            defer self.allocator.free(query_f64);
            const key_f64 = try self.allocator.alloc(f64, key.data.len);
            defer self.allocator.free(key_f64);
            const value_f64 = try self.allocator.alloc(f64, value.data.len);
            defer self.allocator.free(value_f64);
            const decay_f64 = try self.allocator.alloc(f64, decay.data.len);
            defer self.allocator.free(decay_f64);
            const beta_f64 = try self.allocator.alloc(f64, beta.data.len);
            defer self.allocator.free(beta_f64);
            for (query_f64, query.data) |*slot, element| slot.* = element.toF64();
            for (key_f64, key.data) |*slot, element| slot.* = element.toF64();
            for (value_f64, value.data) |*slot, element| slot.* = element.toF64();
            for (decay_f64, decay.data) |*slot, element| slot.* = element.toF64();
            for (beta_f64, beta.data) |*slot, element| slot.* = element.toF64();
            const past_name = node.inputs.items[3];
            const shadow_key = if (std.mem.startsWith(u8, past_name, "past_")) past_name["past_".len..] else past_name;
            const key_copy = try self.allocator.dupe(u8, shadow_key);
            const gop = try self.state_shadows.getOrPut(key_copy);
            if (gop.found_existing) {
                self.allocator.free(key_copy);
            } else {
                gop.value_ptr.* = &.{};
            }
            var state_f64 = gop.value_ptr.*;
            var converted = false;
            if (state_f64.len != present.data.len) {
                self.allocator.free(state_f64);
                gop.value_ptr.* = &.{};
                state_f64 = try self.allocator.alloc(f64, present.data.len);
                gop.value_ptr.* = state_f64;
                converted = true;
            }
            if (past.data.len == 0) {
                @memset(state_f64, 0);
            } else if (converted) {
                for (state_f64, past.data) |*slot, element| slot.* = element.toF64();
            }
            try linear_attention.gatedDeltaF64(output.data, present.data, query_f64, key_f64, value_f64, state_f64, decay_f64, beta_f64, batch, length, query_heads, kv_heads, key_size, value_size, scale.toF64(), self.workerPool());
            return;
        }
        if (self.accelerator) |accelerator| {
            if (accelerator.linear_attention) |apply| {
                if (batch == 1 and length == 1) {
                    const report = try apply(
                        accelerator.context,
                        self.allocator,
                        output.data,
                        present.data,
                        query.data,
                        key.data,
                        value.data,
                        past.data,
                        decay.data,
                        beta.data,
                        batch,
                        length,
                        query_heads,
                        kv_heads,
                        key_size,
                        value_size,
                        scale,
                    );
                    self.recordUnaryAccelerator(report);
                    return;
                }
            }
        }
        try linear_attention.gatedDelta(
            output.data,
            present.data,
            query.data,
            key.data,
            value.data,
            past.data,
            decay.data,
            beta.data,
            batch,
            length,
            query_heads,
            kv_heads,
            key_size,
            value_size,
            scale,
        );
    }

    fn execGroupQueryAttention(self: *Runner, node: *const onnx.Node) !void {
        const query = try self.needTensor(node, 0);
        const key = try self.needTensor(node, 1);
        const value = try self.needTensor(node, 2);
        const past_key = try self.needTensor(node, 3);
        const past_value = try self.needTensor(node, 4);
        const query_heads: usize = @intCast(@max(1, attrInt(node, "num_heads", 1)));
        const kv_heads: usize = @intCast(@max(1, attrInt(node, "kv_num_heads", 1)));
        const scale = try fp.Q128_128.fromF32Bits(@bitCast(attrFloat(node, "scale", 1.0)));
        if (attrInt(node, "local_window_size", -1) != -1 or
            attrFloat(node, "softcap", 0) != 0 or
            attrInt(node, "do_rotary", 0) != 0) return error.UnsupportedOperator;
        if (query.dims.len != 3 or key.dims.len != 3 or value.dims.len != 3 or
            past_key.dims.len != 4 or past_value.dims.len != 4) return error.ShapeMismatch;
        const batch = query.dims[0];
        const query_length = query.dims[1];
        const head_size = query.dims[2] / query_heads;
        const past_length = past_key.dims[2];
        if (query.dims[2] != query_heads * head_size or
            key.dims[0] != batch or key.dims[1] != query_length or
            key.dims[2] != kv_heads * head_size or
            value.dims[2] != kv_heads * head_size or
            past_key.dims[0] != batch or past_key.dims[1] != kv_heads or
            past_key.dims[3] != head_size or past_value.dims[2] != past_length) return error.ShapeMismatch;
        const total_length = past_length + query_length;
        var mask: []fp.Q128_128 = &.{};
        // The Qwen graph passes sequence-length metadata, not an additive
        // mask; causal masking is enforced from the past/query geometry.
        const causal = try self.allocator.alloc(fp.Q128_128, batch * query_length * total_length);
        defer self.allocator.free(causal);
        for (0..batch) |b| {
            for (0..query_length) |q| {
                for (0..total_length) |k| {
                    const allowed = k <= past_length + q;
                    causal[(b * query_length + q) * total_length + k] = if (allowed) fp.Q128_128.zero else fp.Q128_128.fromInt(-1_000_000);
                }
            }
        }
        mask = causal;
        var bias_storage: ?[]fp.Q128_128 = null;
        defer if (bias_storage) |allocated| self.allocator.free(allocated);
        var bias: []const fp.Q128_128 = &.{};
        if (node.inputs.items.len > 10 and inputName(node, 10).len != 0) {
            const bias_tensor = try self.needTensor(node, 10);
            const target = [_]usize{ batch, query_heads, query_length, total_length };
            bias_storage = try self.broadcastMaterialize(bias_tensor, &target);
            bias = bias_storage.?;
        }
        const output = try self.makeOutput(node, 0, query.dims);
        const present_key = try self.makeOutput(node, 1, &.{ batch, kv_heads, total_length, head_size });
        const present_value = try self.makeOutput(node, 2, &.{ batch, kv_heads, total_length, head_size });
        const scratch = try self.allocator.alloc(fp.Q128_128, total_length * @min(batch * query_heads * query_length, 128));
        defer self.allocator.free(scratch);
        if (self.fast_numerics) {
            // Fast tier (ADR-0023): deterministic single-threaded f32 attention
            // with exact Q128 KV-cache copies at the boundary.
            try ops.groupQueryAttentionF64(
                self.allocator,
                output.data,
                present_key.data,
                present_value.data,
                query.data,
                key.data,
                value.data,
                past_key.data,
                past_value.data,
                mask,
                bias,
                .{
                    .batch = batch,
                    .query_length = query_length,
                    .past_length = past_length,
                    .query_heads = query_heads,
                    .kv_heads = kv_heads,
                    .head_size = head_size,
                },
                scale,
            );
            return;
        }
        try ops.groupQueryAttention(
            output.data,
            present_key.data,
            present_value.data,
            query.data,
            key.data,
            value.data,
            past_key.data,
            past_value.data,
            mask,
            bias,
            scratch,
            .{
                .batch = batch,
                .query_length = query_length,
                .past_length = past_length,
                .query_heads = query_heads,
                .kv_heads = kv_heads,
                .head_size = head_size,
            },
            scale,
        );
    }

    /// Materializes a tensor broadcast to `target` dims (right-aligned,
    /// dim-1 expansion), returning an owned buffer for the caller to free.
    fn broadcastMaterialize(self: *Runner, input: Tensor, target: []const usize) ![]fp.Q128_128 {
        if (input.dims.len > target.len) return error.ShapeMismatch;
        const offset = target.len - input.dims.len;
        for (input.dims, 0..) |dim, axis| {
            const target_dim = target[offset + axis];
            if (dim != 1 and dim != target_dim) return error.ShapeMismatch;
        }
        var count: usize = 1;
        for (target) |dim| count *= dim;
        const output = try self.allocator.alloc(fp.Q128_128, count);
        errdefer self.allocator.free(output);
        var in_strides: [MAX_RANK]usize = undefined;
        stridesOf(input.dims, &in_strides);
        for (output, 0..) |*destination, flat| {
            var remaining = flat;
            var source_index: usize = 0;
            var axis: usize = target.len;
            while (axis > 0) {
                axis -= 1;
                const coord = remaining % target[axis];
                remaining /= target[axis];
                if (axis >= offset) {
                    const input_axis = axis - offset;
                    source_index += (if (input.dims[input_axis] == 1) 0 else coord) * in_strides[input_axis];
                }
            }
            destination.* = input.data[source_index];
        }
        return output;
    }

    fn blobToTensor(self: *Runner, blob: *const Blob) !Tensor {
        const tensor = try Tensor.init(self.allocator, blob.dims);
        errdefer {
            var dropped = tensor;
            dropped.deinit(self.allocator);
        }
        if (blob.data_type == 1) {
            const expected = std.math.mul(usize, tensor.data.len, 4) catch return error.ShapeMismatch;
            if (blob.data.len != expected) return error.ShapeMismatch;
            for (tensor.data, 0..) |*destination, index| {
                destination.* = try fp.Q128_128.fromF32BitsSaturating(std.mem.readInt(u32, blob.data[index * 4 ..][0..4], .little));
            }
        } else if (blob.data_type == 7) {
            const expected = std.math.mul(usize, tensor.data.len, 8) catch return error.ShapeMismatch;
            if (blob.data.len != expected) return error.ShapeMismatch;
            for (tensor.data, 0..) |*destination, index| {
                destination.* = fp.Q128_128.fromInt(std.mem.readInt(i64, blob.data[index * 8 ..][0..8], .little));
            }
        } else return error.UnsupportedOperator;
        return tensor;
    }
};

fn addValues(left: fp.Q128_128, right: fp.Q128_128) fp.Error!fp.Q128_128 {
    return left.add(right);
}

fn subValues(left: fp.Q128_128, right: fp.Q128_128) fp.Error!fp.Q128_128 {
    return left.sub(right);
}

fn mulValues(left: fp.Q128_128, right: fp.Q128_128) fp.Error!fp.Q128_128 {
    return left.mul(right);
}

fn sqrtF64(value: f64) f64 {
    return @sqrt(value);
}

fn reciprocalF64(value: f64) f64 {
    return 1.0 / value;
}

fn softplusF64(value: f64) f64 {
    if (value > 0) return value + std.math.log1p(@exp(-value));
    return std.math.log1p(@exp(value));
}

fn sinF64(value: f64) f64 {
    return @sin(value);
}

fn cosF64(value: f64) f64 {
    return @cos(value);
}

fn negValue(value: fp.Q128_128) fp.Error!fp.Q128_128 {
    return value.neg();
}

fn sigmoidValue(value: fp.Q128_128) fp.Error!fp.Q128_128 {
    var output: [1]fp.Q128_128 = undefined;
    ops.sigmoid(&output, &.{value}) catch |err| switch (err) {
        error.ShapeMismatch => return error.InvalidValue,
        else => |inner| return inner,
    };
    return output[0];
}

fn softplusValue(value: fp.Q128_128) fp.Error!fp.Q128_128 {
    var output: [1]fp.Q128_128 = undefined;
    ops.softplus(&output, &.{value}) catch |err| switch (err) {
        error.ShapeMismatch => return error.InvalidValue,
        else => |inner| return inner,
    };
    return output[0];
}

test "tensor store and checkpoints are deterministic" {
    const allocator = std.testing.allocator;
    var store = TensorStore.init(allocator);
    defer store.deinit();
    const tensor = try Tensor.init(allocator, &.{ 1, 1 });
    tensor.data[0] = fp.Q128_128.fromInt(7);
    try store.putTensor("state", tensor);
    try std.testing.expect(store.getTensor("state") != null);
    const checksum = store.getTensor("state").?.checksum();
    try std.testing.expect(checksum != 0);
}

test "tensor store shares byte-identical blob payloads across dims views" {
    const allocator = std.testing.allocator;
    var store = TensorStore.init(allocator);
    defer store.deinit();

    // Same payload bound twice under different dims views — the
    // embed_tokens ≡ lm_head tied-weight pattern.
    const payload: []const u8 = &.{ 0xAB, 0xCD, 0xEF, 0x12, 0x34, 0x56 };
    try store.putBlob("embed.weight_quant", .{
        .data = try allocator.dupe(u8, payload),
        .dims = try allocator.dupe(usize, &.{ 3, 2 }),
        .data_type = 4,
    });
    try store.putBlob("lm_head.weight_quant", .{
        .data = try allocator.dupe(u8, payload),
        .dims = try allocator.dupe(usize, &.{ 3, 1, 2 }),
        .data_type = 4,
    });

    const embed = store.getBlob("embed.weight_quant").?;
    const lm_head = store.getBlob("lm_head.weight_quant").?;
    try std.testing.expectEqual(@as(usize, 1), store.blobs_shared);
    try std.testing.expectEqual(embed.data.ptr, lm_head.data.ptr);
    try std.testing.expectEqualSlices(usize, &.{ 3, 2 }, embed.dims);
    try std.testing.expectEqualSlices(usize, &.{ 3, 1, 2 }, lm_head.dims);
    try std.testing.expect(embed.shared != null and lm_head.shared != null);
    try std.testing.expectEqual(@as(usize, 2), embed.shared.?.refs);

    // Distinct payloads must not coalesce.
    try store.putBlob("other.weight_quant", .{
        .data = try allocator.dupe(u8, &.{ 0x00, 0x11, 0x22, 0x33, 0x44, 0x55 }),
        .dims = try allocator.dupe(usize, &.{ 3, 2 }),
        .data_type = 4,
    });
    try std.testing.expectEqual(@as(usize, 1), store.blobs_shared);
    try std.testing.expect(store.getBlob("other.weight_quant").?.data.ptr != embed.data.ptr);

    // Rebinding an aliased name releases its share without corrupting the
    // surviving alias.
    try store.putBlob("lm_head.weight_quant", .{
        .data = try allocator.dupe(u8, &.{0xFF}),
        .dims = try allocator.dupe(usize, &.{1}),
        .data_type = 4,
    });
    try std.testing.expectEqualSlices(u8, payload, store.getBlob("embed.weight_quant").?.data);
    try std.testing.expectEqualSlices(u8, &.{0xFF}, store.getBlob("lm_head.weight_quant").?.data);
    try std.testing.expectEqual(@as(usize, 1), embed.shared.?.refs);
}

test "tensor store parent supplies shared weights while writes stay isolated" {
    const allocator = std.testing.allocator;
    var shared = TensorStore.init(allocator);
    defer shared.deinit();
    var child = TensorStore.init(allocator);
    defer child.deinit();

    const shared_tensor = try Tensor.init(allocator, &.{ 1, 1 });
    shared_tensor.data[0] = fp.Q128_128.fromInt(3);
    try shared.putTensor("weight", shared_tensor);
    const shared_bytes = shared.localByteSize();

    child.setParent(&shared);
    try std.testing.expectEqual(fp.Q128_128.fromInt(3).raw, child.getTensor("weight").?.data[0].raw);
    try std.testing.expectEqual(@as(usize, 0), child.localByteSize());

    const local_tensor = try Tensor.init(allocator, &.{ 1, 1 });
    local_tensor.data[0] = fp.Q128_128.fromInt(9);
    try child.putTensor("weight", local_tensor);
    try std.testing.expectEqual(fp.Q128_128.fromInt(9).raw, child.getTensor("weight").?.data[0].raw);
    try std.testing.expectEqual(fp.Q128_128.fromInt(3).raw, shared.getTensor("weight").?.data[0].raw);
    try std.testing.expectEqual(shared_bytes, shared.localByteSize());
    try std.testing.expect(child.localByteSize() > 0);
}

fn buildReduceNode(allocator: std.mem.Allocator, keepdims: ?i64) !onnx.Node {
    var node = onnx.Node{
        .allocator = allocator,
        .name = try allocator.dupe(u8, "test/reduce"),
        .domain = try allocator.dupe(u8, ""),
        .op_type = try allocator.dupe(u8, "ReduceSum"),
        .inputs = std.ArrayList([]const u8).init(allocator),
        .outputs = std.ArrayList([]const u8).init(allocator),
        .attributes = std.ArrayList(onnx.Attribute).init(allocator),
    };
    errdefer node.deinit();
    try node.inputs.append(try allocator.dupe(u8, "x"));
    try node.inputs.append(try allocator.dupe(u8, "axes"));
    try node.outputs.append(try allocator.dupe(u8, "y"));
    if (keepdims) |flag| {
        try node.attributes.append(.{
            .allocator = allocator,
            .name = try allocator.dupe(u8, "keepdims"),
            .kind = .integer,
            .integer = flag,
        });
    }
    return node;
}

fn expectReduceKeepdims(allocator: std.mem.Allocator, keepdims: ?i64, want_dims: []const usize) !void {
    var store = TensorStore.init(allocator);
    defer store.deinit();

    // [1,2,2,2]: two sequence positions, two heads, last-dim reduction pairs.
    const input = try Tensor.init(allocator, &.{ 1, 2, 2, 2 });
    for (input.data, 0..) |*value, index| value.* = fp.Q128_128.fromInt(@intCast(index + 1));
    try store.putTensor("x", input);
    const axes = try Tensor.init(allocator, &.{1});
    axes.data[0] = fp.Q128_128.fromInt(-1);
    try store.putTensor("axes", axes);

    var node = try buildReduceNode(allocator, keepdims);
    defer node.deinit();
    var runner = Runner.init(allocator, &store, null);
    defer runner.deinit();
    var nodes = [_]onnx.Node{node};
    const order = [_]usize{0};
    try runner.run(&nodes, &order, null);
    const output = store.getTensor("y") orelse return error.MissingTensor;
    try std.testing.expectEqualSlices(usize, want_dims, output.dims);
    const expected = [_]i64{ 3, 7, 11, 15 };
    for (expected, 0..) |want, index| {
        try std.testing.expectEqual(fp.Q128_128.fromInt(want).raw, output.data[index].raw);
    }
}

test "reduce maps non-reduced axes to their output positions at sequence>1" {
    const allocator = std.testing.allocator;
    // keepdims=1 -> [1,2,2,1]; keepdims=0 -> [1,2,2]. Per-position sums must
    // land in their own cells — the prior mapping folded position 1 into
    // position 0's cells (invisible at sequence=1).
    try expectReduceKeepdims(allocator, 1, &.{ 1, 2, 2, 1 });
    try expectReduceKeepdims(allocator, 0, &.{ 1, 2, 2 });
}

test "native q128 graph executor runs arithmetic fixture" {
    const allocator = std.testing.allocator;
    var left_tensor = try Tensor.init(allocator, &.{ 1, 2 });
    var right_tensor = try Tensor.init(allocator, &.{ 1, 2 });
    const output_tensor = try Tensor.init(allocator, &.{ 1, 2 });
    left_tensor.data[0] = fp.Q128_128.fromInt(1);
    left_tensor.data[1] = fp.Q128_128.fromInt(2);
    right_tensor.data[0] = fp.Q128_128.fromInt(3);
    right_tensor.data[1] = fp.Q128_128.fromInt(4);
    var tensors = [_]Tensor{ left_tensor, right_tensor, output_tensor };
    defer for (&tensors) |*tensor| tensor.deinit(allocator);
    const nodes = [_]Node{.{ .kind = .add, .left = 0, .right = 1, .output = 2 }};
    var executor = Executor.init(allocator, &tensors, &nodes);
    try executor.execute();
    try std.testing.expectEqual(fp.Q128_128.fromInt(4).raw, tensors[2].data[0].raw);
    try std.testing.expectEqual(fp.Q128_128.fromInt(6).raw, tensors[2].data[1].raw);
}
