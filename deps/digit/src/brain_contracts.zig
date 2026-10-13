//! Stable contracts for the two-organ Digit brain.
//!
//! E5 is the model organ, E6 is the bounded metacognition organ, E7 is the
//! routing/merge boundary, and E0 is the lattice commit plane. These types
//! carry summaries and decisions; they do not duplicate ONNX tensors or claim
//! physical consciousness.

const std = @import("std");
const fp = @import("fixed_point");

pub const TrajectoryId = u64;

pub const ReflectionAction = enum {
    accept,
    reflect,
    regenerate,
    prune,
    stop,
};

pub const ScalePolicy = struct {
    scale: u8 = 0,
    max_primary_paths: usize = 1,
    reflections_per_path: usize = 0,
    max_total_paths: usize = 1,
    max_reflection_depth: u8 = 0,

    pub fn forScale(scale: u8) ScalePolicy {
        const primary = if (scale == 0) @as(usize, 1) else @as(usize, 1) << @intCast(scale * 3 - 3);
        const reflections: usize = if (scale == 0) 0 else 7;
        const total = @as(usize, 1) << @intCast(scale * 3);
        return .{
            .scale = scale,
            .max_primary_paths = primary,
            .reflections_per_path = reflections,
            .max_total_paths = total,
            .max_reflection_depth = if (scale == 0) 0 else 1,
        };
    }
};

pub const ModelObservation = struct {
    trajectory_id: TrajectoryId,
    step: u64,
    input_token: u32,
    argmax_token: u32,
    checkpoint_fold: u256,
    logits_checksum: u256,
    e5_state_checksum: u256,
    coherence: fp.Q128_128,
    uncertainty: fp.Q128_128,
    recurrent_state_version: u64,
    /// Compact E6-visible state summary. `model_session.observation()` fills
    /// this with whole-distribution logit statistics (top-1/top-2 values and
    /// margin, quantized argmax id, mean, range, above-mean count, mean abs
    /// deviation) — see the doc comment there for the channel layout.
    observed_summary: [8]fp.Q128_128 = .{fp.Q128_128.zero} ** 8,
};

pub const ReflectionDecision = struct {
    trajectory_id: TrajectoryId,
    action: ReflectionAction,
    reflection_depth: u8,
    remaining_budget: u8,
    coherence: fp.Q128_128,
    observer_delta: fp.Q128_128,
    reason_code: u16,
    checksum: u256,

    pub fn isTerminal(self: *const ReflectionDecision) bool {
        return self.action == .accept or self.action == .prune or self.action == .stop;
    }
};

pub const CommitDecision = struct {
    trajectory_id: TrajectoryId,
    selected_token: u32,
    model_fold: u256,
    observer_fold: u256,
    routing_fold: u256,
    scale: u8,
    branch_count: u32,
};

pub fn branchCount(policy: ScalePolicy) usize {
    return policy.max_total_paths;
}

test "scale policy matches evidence branch counts" {
    try std.testing.expectEqual(@as(usize, 1), branchCount(ScalePolicy.forScale(0)));
    try std.testing.expectEqual(@as(usize, 8), branchCount(ScalePolicy.forScale(1)));
    try std.testing.expectEqual(@as(usize, 64), branchCount(ScalePolicy.forScale(2)));
    try std.testing.expectEqual(@as(usize, 512), branchCount(ScalePolicy.forScale(3)));
    try std.testing.expectEqual(@as(usize, 7), ScalePolicy.forScale(1).reflections_per_path);
}

test "reflection terminal actions are explicit" {
    var decision = ReflectionDecision{
        .trajectory_id = 1,
        .action = .reflect,
        .reflection_depth = 0,
        .remaining_budget = 1,
        .coherence = fp.Q128_128.zero,
        .observer_delta = fp.Q128_128.zero,
        .reason_code = 0,
        .checksum = 0,
    };
    try std.testing.expect(!decision.isTerminal());
    decision.action = .accept;
    try std.testing.expect(decision.isTerminal());
}
