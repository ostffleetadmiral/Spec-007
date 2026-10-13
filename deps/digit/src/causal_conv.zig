const std = @import("std");
const fp = @import("fixed_point");
const ops = @import("tensor_ops");

fn copyPresentState(
    present_state: []fp.Q128_128,
    input: []const fp.Q128_128,
    past_state: []const fp.Q128_128,
    batch: usize,
    channels: usize,
    length: usize,
    kernel: usize,
) void {
    for (0..batch) |b| {
        for (0..channels) |channel| {
            for (0..kernel - 1) |offset| {
                // Present state is the last kernel-1 elements of the
                // concatenated [past_state, input] sequence; when the input
                // is shorter than the state, the tail comes from past_state.
                const combined_position = length + offset;
                const value = if (combined_position < kernel - 1)
                    if (past_state.len == 0) fp.Q128_128.zero else past_state[(b * channels + channel) * (kernel - 1) + combined_position]
                else
                    input[(b * length + combined_position - (kernel - 1)) * channels + channel];
                present_state[(b * channels + channel) * (kernel - 1) + offset] = value;
            }
        }
    }
}

pub fn causalDepthwise(
    output: []fp.Q128_128,
    present_state: []fp.Q128_128,
    input: []const fp.Q128_128,
    weight: []const fp.Q128_128,
    bias: []const fp.Q128_128,
    past_state: []const fp.Q128_128,
    batch: usize,
    channels: usize,
    length: usize,
    kernel: usize,
    silu: bool,
) !void {
    if (weight.len != channels * kernel or output.len != batch * channels * length or
        present_state.len != batch * channels * (kernel - 1) or
        (bias.len != 0 and bias.len != channels) or
        (past_state.len != 0 and past_state.len != present_state.len)) return error.ShapeMismatch;
    if (kernel == 0) return error.ShapeMismatch;
    for (0..batch) |b| {
        for (0..channels) |channel| {
            for (0..length) |time| {
                var sum = if (bias.len == 0) fp.Q128_128.zero else bias[channel];
                for (0..kernel) |tap| {
                    const source_time: isize = @as(isize, @intCast(time)) - @as(isize, @intCast(kernel - 1 - tap));
                    const source = if (source_time < 0)
                        if (past_state.len == 0) fp.Q128_128.zero else past_state[(b * channels + channel) * (kernel - 1) + @as(usize, @intCast(source_time + @as(isize, @intCast(kernel - 1))))]
                    else
                        input[(b * length + @as(usize, @intCast(source_time))) * channels + channel];
                    sum = try sum.add(try source.mul(weight[channel * kernel + tap]));
                }
                if (silu) sum = try sum.mul(try ops.sigmoidScalar(sum));
                output[(b * length + time) * channels + channel] = sum;
            }
        }
    }
    copyPresentState(present_state, input, past_state, batch, channels, length, kernel);
}

/// Fast-tier variant (ADR-0024): channel-last f64 buffers in/out with the
/// same tap order and silu activation. `present_state` stays an exact Q128
/// copy of the recurrent inputs — only the convolution math is approximate.
pub fn causalDepthwiseF64(
    output: []f64,
    present_state: []fp.Q128_128,
    input_q128: []const fp.Q128_128,
    input: []const f64,
    weight: []const f64,
    bias: []const f64,
    past_state: []const fp.Q128_128,
    batch: usize,
    channels: usize,
    length: usize,
    kernel: usize,
    silu: bool,
) !void {
    if (weight.len != channels * kernel or output.len != batch * channels * length or
        input.len != output.len or input_q128.len != output.len or
        present_state.len != batch * channels * (kernel - 1) or
        (bias.len != 0 and bias.len != channels) or
        (past_state.len != 0 and past_state.len != present_state.len)) return error.ShapeMismatch;
    if (kernel == 0) return error.ShapeMismatch;
    for (0..batch) |b| {
        for (0..channels) |channel| {
            for (0..length) |time| {
                var sum: f64 = if (bias.len == 0) 0 else bias[channel];
                for (0..kernel) |tap| {
                    const source_time: isize = @as(isize, @intCast(time)) - @as(isize, @intCast(kernel - 1 - tap));
                    const source: f64 = if (source_time < 0)
                        if (past_state.len == 0) 0 else past_state[(b * channels + channel) * (kernel - 1) + @as(usize, @intCast(source_time + @as(isize, @intCast(kernel - 1))))].toF64()
                    else
                        input[(b * length + @as(usize, @intCast(source_time))) * channels + channel];
                    sum += source * weight[channel * kernel + tap];
                }
                if (silu) sum *= 1 / (1 + @exp(-sum));
                output[(b * length + time) * channels + channel] = sum;
            }
        }
    }
    copyPresentState(present_state, input_q128, past_state, batch, channels, length, kernel);
}

/// Single decode step (batch=1, length=1) of the fast-tier convolution.
/// Element `channel` of `output`/`present_state` depends only on that
/// channel's weight taps and state column, so callers may invoke this per
/// channel across worker threads — disjoint writes keep it deterministic.
/// Tap order and silu evaluation are identical to `causalDepthwiseF64`;
/// weight/bias convert inline so no materialized f64 arrays are needed.
pub fn causalDecodeChannelF64(
    output: []fp.Q128_128,
    present_state: []fp.Q128_128,
    input: []const fp.Q128_128,
    weight: []const fp.Q128_128,
    bias: []const fp.Q128_128,
    past_state: []const fp.Q128_128,
    kernel: usize,
    silu: bool,
    channel: usize,
) fp.Error!void {
    var sum: f64 = if (bias.len == 0) 0 else bias[channel].toF64();
    for (0..kernel) |tap| {
        const source: f64 = if (tap + 1 < kernel)
            if (past_state.len == 0) 0 else past_state[channel * (kernel - 1) + tap].toF64()
        else
            input[channel].toF64();
        sum += source * weight[channel * kernel + tap].toF64();
    }
    if (silu) sum *= 1 / (1 + @exp(-sum));
    output[channel] = try fp.Q128_128.fromF64Saturating(sum);
    for (0..kernel - 1) |offset| {
        const combined_position = 1 + offset;
        present_state[channel * (kernel - 1) + offset] = if (combined_position < kernel - 1)
            if (past_state.len == 0) fp.Q128_128.zero else past_state[channel * (kernel - 1) + combined_position]
        else
            input[channel];
    }
}

test "causal depthwise convolution carries state" {
    const input = [_]fp.Q128_128{ fp.Q128_128.fromInt(2), fp.Q128_128.fromInt(3) };
    const weight = [_]fp.Q128_128{ fp.Q128_128.one, fp.Q128_128.one };
    const past = [_]fp.Q128_128{fp.Q128_128.fromInt(1)};
    var output: [2]fp.Q128_128 = undefined;
    var present: [1]fp.Q128_128 = undefined;
    try causalDepthwise(&output, &present, &input, &weight, &.{}, &past, 1, 1, 2, 2, false);
    try std.testing.expectEqual(fp.Q128_128.fromInt(3).raw, output[0].raw);
    try std.testing.expectEqual(fp.Q128_128.fromInt(5).raw, output[1].raw);
    try std.testing.expectEqual(input[1].raw, present[0].raw);
}
