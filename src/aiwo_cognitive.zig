//! Bounded native E5/E6/E7/E0 adaptation for the Spec-007 AIWO lane.
//! The model supplies checksums/tokens; this module owns only compact observer
//! summaries and deterministic branch selection, never model weights.
const std = @import("std");

pub const ReflectionAction = enum { accept, reflect, regenerate, prune, stop };
pub const ScalePolicy = struct {
    scale: u8,
    max_primary_paths: usize,
    reflections_per_path: usize,
    max_total_paths: usize,
    fully_enumerable: bool,

    pub fn forScale(scale: u8) !ScalePolicy {
        if (scale > 7) return error.ScaleUnsupported;
        if (scale == 0) return .{ .scale = 0, .max_primary_paths = 1, .reflections_per_path = 0, .max_total_paths = 1, .fully_enumerable = true };
        const primary: usize = @as(usize, 1) << @intCast(scale * 3 - 3);
        const total: usize = @as(usize, 1) << @intCast(scale * 3);
        return .{ .scale = scale, .max_primary_paths = primary, .reflections_per_path = 7, .max_total_paths = total, .fully_enumerable = scale <= 2 };
    }

    pub fn boundedPrimaryPaths(self: ScalePolicy, budget: usize) usize {
        return @min(self.max_primary_paths, budget);
    }

    fn canonical(self: ScalePolicy) !ScalePolicy {
        const expected = try forScale(self.scale);
        if (self.max_primary_paths != expected.max_primary_paths or
            self.reflections_per_path != expected.reflections_per_path or
            self.max_total_paths != expected.max_total_paths or
            self.fully_enumerable != expected.fully_enumerable) return error.InvalidScalePolicy;
        return expected;
    }
};

pub const ChunkPlan = struct {
    scale: u8,
    theoretical_paths: usize,
    chunk_size: usize,
    chunk_count: usize,
    max_chunks: usize,
    admitted: bool,

    pub fn forPolicy(policy: ScalePolicy, chunk_size: usize, max_chunks: usize) !ChunkPlan {
        if (chunk_size == 0 or max_chunks == 0) return error.InvalidChunkBudget;
        const canonical = try policy.canonical();
        const chunks = try std.math.divCeil(usize, canonical.max_total_paths, chunk_size);
        return .{ .scale = canonical.scale, .theoretical_paths = canonical.max_total_paths, .chunk_size = chunk_size, .chunk_count = chunks, .max_chunks = max_chunks, .admitted = chunks <= max_chunks };
    }
};

pub const Chunk = struct {
    index: usize,
    start_path: usize,
    end_path: usize,
    path_count: usize,
    receipt_fold: u256,
};

pub const ChunkCursor = struct {
    plan: ChunkPlan,
    next_index: usize = 0,
    receipt_fold: u256 = 0,

    pub fn init(policy: ScalePolicy, chunk_size: usize, max_chunks: usize) !ChunkCursor {
        const plan = try ChunkPlan.forPolicy(policy, chunk_size, max_chunks);
        if (!plan.admitted) return error.ChunkPlanRefused;
        return .{ .plan = plan };
    }

    pub fn next(self: *ChunkCursor) ?Chunk {
        if (self.next_index >= self.plan.chunk_count) return null;
        const start = self.next_index * self.plan.chunk_size;
        const end = @min(start + self.plan.chunk_size, self.plan.theoretical_paths);
        const count = end - start;
        self.receipt_fold = (self.receipt_fold +% @as(u256, @intCast(start)) +% count) *% 0x9e3779b97f4a7c15;
        const chunk = Chunk{ .index = self.next_index, .start_path = start, .end_path = end, .path_count = count, .receipt_fold = self.receipt_fold };
        self.next_index += 1;
        return chunk;
    }
};

pub const Observation = struct {
    trajectory: u64,
    step: u64,
    input_token: u32,
    argmax_token: u32,
    model_fold: u256,
    logits_fold: u256,
    state_fold: u256,
    coherence: u16,
    uncertainty: u16,
    summary: [8]u16,
};

pub const Reflection = struct {
    trajectory: u64,
    action: ReflectionAction,
    branch: u8,
    coherence: u16,
    checksum: u256,
};

pub const Commit = struct {
    selected_token: u32,
    trajectory: u64,
    routing_fold: u256,
    branch_count: u32,
    scale: u8,
};

pub const Engine = struct {
    policy: ScalePolicy,

    pub fn init(scale: u8) !Engine {
        return .{ .policy = try ScalePolicy.forScale(scale) };
    }

    pub fn observe(self: *const Engine, input_token: u32, argmax_token: u32, model_fold: u256, logits_fold: u256, state_fold: u256, step: u64) Observation {
        _ = self;
        const spread = @as(u16, @intCast((model_fold ^ logits_fold ^ state_fold) % 1001));
        const certainty = if (argmax_token == input_token) @as(u16, 750) else @as(u16, 500);
        var summary = [_]u16{0} ** 8;
        summary[0] = certainty;
        summary[1] = spread;
        summary[2] = @intCast(@min(@as(u256, 1000), @as(u256, step % 1001)));
        return .{ .trajectory = step +| 1, .step = step, .input_token = input_token, .argmax_token = argmax_token, .model_fold = model_fold, .logits_fold = logits_fold, .state_fold = state_fold, .coherence = certainty, .uncertainty = 1000 - certainty, .summary = summary };
    }

    pub fn commit(self: *const Engine, observation: Observation) Commit {
        const routing = observation.model_fold ^ observation.logits_fold ^ observation.state_fold;
        return .{ .selected_token = observation.argmax_token, .trajectory = observation.trajectory, .routing_fold = routing, .branch_count = @intCast(self.policy.max_total_paths), .scale = self.policy.scale };
    }

    pub fn reflect(self: *const Engine, observation: Observation, out: []Reflection) !Commit {
        if (out.len < self.policy.reflections_per_path) return error.ReflectionBufferTooSmall;
        if (observation.trajectory == 0) return error.InvalidTrajectory;
        if (observation.trajectory > (std.math.maxInt(u64) - 7) / 8) return error.TrajectoryOverflow;
        if (self.policy.scale == 0) return self.commit(observation);
        var winner: Reflection = .{ .trajectory = observation.trajectory, .action = .prune, .branch = 0, .coherence = 0, .checksum = 0 };
        for (0..self.policy.reflections_per_path) |i| {
            const score: u16 = @intCast(@min(@as(u256, 1000), @as(u256, observation.coherence) + @as(u256, i * 17)));
            const checksum = observation.model_fold ^ observation.logits_fold ^ @as(u256, @intCast(i + 1));
            out[i] = .{ .trajectory = observation.trajectory * 8 + i + 1, .action = if (score >= 400) .accept else .regenerate, .branch = @intCast(i), .coherence = score, .checksum = checksum };
            if (out[i].action != .prune and (out[i].coherence > winner.coherence or (out[i].coherence == winner.coherence and out[i].trajectory < winner.trajectory))) winner = out[i];
        }
        if (winner.action == .prune) return error.AllReflectionsPruned;
        return .{ .selected_token = observation.argmax_token, .trajectory = winner.trajectory, .routing_fold = winner.checksum ^ observation.state_fold, .branch_count = @intCast(self.policy.max_total_paths), .scale = self.policy.scale };
    }
};

test "Digit-shaped scale policy has bounded E7 branch counts" {
    try std.testing.expectEqual(@as(usize, 1), (try ScalePolicy.forScale(0)).max_total_paths);
    try std.testing.expectEqual(@as(usize, 8), (try ScalePolicy.forScale(1)).max_total_paths);
    try std.testing.expectEqual(@as(usize, 64), (try ScalePolicy.forScale(2)).max_total_paths);
    try std.testing.expectEqual(@as(usize, 512), (try ScalePolicy.forScale(3)).max_total_paths);
    try std.testing.expectEqual(@as(usize, 4096), (try ScalePolicy.forScale(4)).max_total_paths);
    try std.testing.expectEqual(@as(usize, 32768), (try ScalePolicy.forScale(5)).max_total_paths);
    try std.testing.expectEqual(@as(usize, 262144), (try ScalePolicy.forScale(6)).max_total_paths);
    const scale7 = try ScalePolicy.forScale(7);
    try std.testing.expectEqual(@as(usize, 2097152), scale7.max_total_paths);
    try std.testing.expect(!scale7.fully_enumerable);
    try std.testing.expectEqual(@as(usize, 8), scale7.boundedPrimaryPaths(8));
}

test "scale seven chunk plan refuses an undersized admission budget" {
    const policy = try ScalePolicy.forScale(7);
    const plan = try ChunkPlan.forPolicy(policy, 8, 1024);
    try std.testing.expectEqual(@as(usize, 262144), plan.chunk_count);
    try std.testing.expect(!plan.admitted);
    const admitted = try ChunkPlan.forPolicy(policy, 4096, 1024);
    try std.testing.expectEqual(@as(usize, 512), admitted.chunk_count);
    try std.testing.expect(admitted.admitted);
}

test "admitted scale seven plan emits deterministic chunk receipts" {
    const policy = try ScalePolicy.forScale(7);
    var cursor = try ChunkCursor.init(policy, 4096, 1024);
    var count: usize = 0;
    var last_fold: u256 = 0;
    while (cursor.next()) |chunk| {
        count += 1;
        last_fold = chunk.receipt_fold;
        try std.testing.expect(chunk.path_count > 0);
    }
    try std.testing.expectEqual(@as(usize, 512), count);
    try std.testing.expectEqual(last_fold, cursor.receipt_fold);
    try std.testing.expectEqual(try std.fmt.parseInt(u256, "38be4934c1497b339147bf2b5d7d2f7e9b36e7596c65ba07d9f74e0a06100000", 16), last_fold);
    try std.testing.expect(cursor.next() == null);
}

test "chunk planning rejects forged policy and oversized-budget overflow" {
    const canonical = try ScalePolicy.forScale(7);
    var forged = canonical;
    forged.max_total_paths = std.math.maxInt(usize);
    try std.testing.expectError(error.InvalidScalePolicy, ChunkPlan.forPolicy(forged, 4096, 1024));
    try std.testing.expectError(error.InvalidScalePolicy, ChunkCursor.init(forged, 4096, 1024));

    const huge_chunk = try ChunkPlan.forPolicy(canonical, std.math.maxInt(usize), 1);
    try std.testing.expectEqual(@as(usize, 1), huge_chunk.chunk_count);
    try std.testing.expect(huge_chunk.admitted);
    try std.testing.expectError(error.ScaleUnsupported, ScalePolicy.forScale(8));
}

test "reflection rejects invalid trajectories before branch generation" {
    var engine = try Engine.init(1);
    var obs = engine.observe(1, 2, 3, 4, 5, 0);
    var out: [7]Reflection = undefined;
    obs.trajectory = 0;
    try std.testing.expectError(error.InvalidTrajectory, engine.reflect(obs, &out));

    obs.trajectory = (std.math.maxInt(u64) - 7) / 8 + 1;
    try std.testing.expectError(error.TrajectoryOverflow, engine.reflect(obs, &out));

    obs.trajectory = (std.math.maxInt(u64) - 7) / 8;
    _ = try engine.reflect(obs, &out);
}

test "observation trajectory saturates at the u64 boundary" {
    const engine = try Engine.init(0);
    const obs = engine.observe(1, 2, 3, 4, 5, std.math.maxInt(u64));
    try std.testing.expectEqual(std.math.maxInt(u64), obs.trajectory);
}

test "E5 observation and E6 reflection are deterministic" {
    var engine = try Engine.init(1);
    const obs = engine.observe(1, 2, 3, 4, 5, 0);
    var a: [7]Reflection = undefined;
    var b: [7]Reflection = undefined;
    const ca = try engine.reflect(obs, &a);
    const cb = try engine.reflect(obs, &b);
    try std.testing.expectEqual(ca.routing_fold, cb.routing_fold);
    try std.testing.expectEqualDeep(a, b);
}
