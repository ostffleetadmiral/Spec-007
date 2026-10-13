//! Adapter from Digit's native brain_contracts observation to Spec-007 AIWO.
const cognitive = @import("aiwo_cognitive");
const digit = @import("digit_brain");

pub fn adapt(observation: digit.ModelObservation) cognitive.Observation {
    var summary: [8]u16 = [_]u16{0} ** 8;
    for (observation.observed_summary, 0..) |value, index| {
        const whole = @divTrunc(value.raw, @as(@TypeOf(value.raw), 1) << 128);
        summary[index] = @intCast(@max(@as(i256, 0), @min(@as(i256, 1000), whole)));
    }
    const coherence_raw = @divTrunc(observation.coherence.raw, @as(@TypeOf(observation.coherence.raw), 1) << 128);
    const uncertainty_raw = @divTrunc(observation.uncertainty.raw, @as(@TypeOf(observation.uncertainty.raw), 1) << 128);
    return .{
        .trajectory = observation.trajectory_id,
        .step = observation.step,
        .input_token = observation.input_token,
        .argmax_token = observation.argmax_token,
        .model_fold = observation.checkpoint_fold,
        .logits_fold = observation.logits_checksum,
        .state_fold = observation.e5_state_checksum,
        .coherence = @intCast(@max(@as(i256, 0), @min(@as(i256, 1000), coherence_raw))),
        .uncertainty = @intCast(@max(@as(i256, 0), @min(@as(i256, 1000), uncertainty_raw))),
        .summary = summary,
    };
}

test "Digit observation adapts without exposing model tensors" {
    const fp = @import("fixed_point");
    const input = digit.ModelObservation{
        .trajectory_id = 7,
        .step = 2,
        .input_token = 10,
        .argmax_token = 11,
        .checkpoint_fold = 12,
        .logits_checksum = 13,
        .e5_state_checksum = 14,
        .coherence = fp.Q128_128.fromInt(3),
        .uncertainty = fp.Q128_128.fromInt(1),
        .recurrent_state_version = 4,
    };
    const output = adapt(input);
    try @import("std").testing.expectEqual(@as(u32, 11), output.argmax_token);
    try @import("std").testing.expectEqual(@as(u64, 7), output.trajectory);
    try @import("std").testing.expectEqual(@as(u16, 3), output.coherence);
}
