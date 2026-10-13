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

    pub fn forScale(scale: u8) !ScalePolicy {
        if (scale > 2) return error.ScaleUnsupported;
        return switch (scale) {
            0 => .{ .scale = 0, .max_primary_paths = 1, .reflections_per_path = 0, .max_total_paths = 1 },
            1 => .{ .scale = 1, .max_primary_paths = 1, .reflections_per_path = 7, .max_total_paths = 8 },
            else => .{ .scale = 2, .max_primary_paths = 8, .reflections_per_path = 7, .max_total_paths = 64 },
        };
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
        return .{ .trajectory = step + 1, .step = step, .input_token = input_token, .argmax_token = argmax_token, .model_fold = model_fold, .logits_fold = logits_fold, .state_fold = state_fold, .coherence = certainty, .uncertainty = 1000 - certainty, .summary = summary };
    }

    pub fn commit(self: *const Engine, observation: Observation) Commit {
        const routing = observation.model_fold ^ observation.logits_fold ^ observation.state_fold;
        return .{ .selected_token = observation.argmax_token, .trajectory = observation.trajectory, .routing_fold = routing, .branch_count = @intCast(self.policy.max_total_paths), .scale = self.policy.scale };
    }

    pub fn reflect(self: *const Engine, observation: Observation, out: []Reflection) !Commit {
        if (out.len < self.policy.reflections_per_path) return error.ReflectionBufferTooSmall;
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
