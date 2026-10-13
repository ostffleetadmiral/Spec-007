//! Model-session observation adapter. A real K3/Digit host supplies logits and
//! recurrent fold; AIWO consumes only this compact, deterministic summary.
const std = @import("std");
const cognitive = @import("aiwo_cognitive");

pub const Input = struct {
    trajectory: u64,
    step: u64,
    input_token: u32,
    recurrent_fold: u256,
    recurrent_version: u64,
    logits: []const i128,
};

pub fn observe(input: Input) !cognitive.Observation {
    if (input.logits.len == 0) return error.EmptyLogits;
    var argmax: usize = 0;
    var max = input.logits[0];
    var min = input.logits[0];
    var sum: i256 = 0;
    for (input.logits, 0..) |value, index| {
        if (value > max) {
            max = value;
            argmax = index;
        }
        min = @min(min, value);
        sum += value;
    }
    const mean: i128 = @intCast(@divTrunc(sum, @as(i256, @intCast(input.logits.len))));
    const range: u128 = @intCast(@as(i256, max) - @as(i256, min));
    const margin: u128 = if (input.logits.len > 1) secondMargin(input.logits, argmax, max) else 0;
    const logits_fold = fold(input.logits);
    const coherence: u16 = @intCast(@min(@as(u128, 1000), @as(u128, @intCast(@max(@as(i128, 0), max - mean)))));
    return .{
        .trajectory = input.trajectory,
        .step = input.step,
        .input_token = input.input_token,
        .argmax_token = @intCast(argmax),
        .model_fold = input.recurrent_fold,
        .logits_fold = logits_fold,
        .state_fold = input.recurrent_fold ^ logits_fold,
        .coherence = coherence,
        .uncertainty = @intCast(1000 - coherence),
        .summary = .{ @intCast(@min(@as(u128, 1000), @as(u128, @intCast(@max(@as(i128, 0), max))))), @intCast(@min(@as(u128, 1000), @as(u128, @intCast(@max(@as(i128, 0), mean))))), @intCast(@min(@as(u128, 1000), margin)), @intCast(@min(@as(usize, 1000), argmax)), @intCast(@min(@as(u128, 1000), @as(u128, @intCast(@max(@as(i128, 0), mean))))), @intCast(@min(@as(u128, 1000), range)), 0, @intCast(input.recurrent_version % 1001) },
    };
}

fn secondMargin(logits: []const i128, argmax: usize, max: i128) u128 {
    var second: i128 = std.math.minInt(i128);
    for (logits, 0..) |value, index| {
        if (index != argmax) second = @max(second, value);
    }
    return @intCast(@max(@as(i256, 0), @as(i256, max) - @as(i256, second)));
}

fn fold(logits: []const i128) u256 {
    var result: u256 = 0;
    for (logits, 0..) |value, index| result = (result +% @as(u256, @bitCast(@as(i256, value))) +% index) *% 0x9e3779b97f4a7c15;
    return result;
}

test "model observation adapter selects argmax and folds recurrent state" {
    const logits = [_]i128{ 2, 11, 7 };
    const obs = try observe(.{ .trajectory = 1, .step = 0, .input_token = 9, .recurrent_fold = 42, .recurrent_version = 3, .logits = &logits });
    try std.testing.expectEqual(@as(u32, 1), obs.argmax_token);
    try std.testing.expectEqual(@as(u32, 9), obs.input_token);
    try std.testing.expect(obs.logits_fold != 0);
    try std.testing.expect(obs.state_fold != obs.logits_fold);
}
