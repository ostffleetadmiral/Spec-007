const std = @import("std");
const fp = @import("fixed_point");

pub fn simplifiedLayerNorm(
    output: []fp.Q128_128,
    input: []const fp.Q128_128,
    weight: []const fp.Q128_128,
    epsilon: fp.Q128_128,
) !void {
    const zero = [_]fp.Q128_128{fp.Q128_128.zero};
    return skipSimplifiedLayerNorm(output, input, &zero, weight, epsilon);
}

pub fn skipSimplifiedLayerNorm(
    output: []fp.Q128_128,
    hidden: []const fp.Q128_128,
    skip: []const fp.Q128_128,
    weight: []const fp.Q128_128,
    epsilon: fp.Q128_128,
) !void {
    if ((skip.len != hidden.len and skip.len != 1) or output.len != hidden.len or weight.len != hidden.len or hidden.len == 0) return error.ShapeMismatch;
    var mean_square = fp.Q128_128.zero;
    for (0..hidden.len) |i| {
        const sum = try hidden[i].add(skip[if (skip.len == 1) 0 else i]);
        output[i] = sum;
        mean_square = try mean_square.add(try sum.mul(sum));
    }
    mean_square = try mean_square.div(fp.Q128_128.fromInt(@intCast(hidden.len)));
    const inverse_norm = try reciprocalSqrt(try mean_square.add(epsilon));
    for (output, weight) |*value, scale| value.* = try (try value.*.mul(inverse_norm)).mul(scale);
}

/// Fast-tier variant (ADR-0024/0025): same residual-sum + RMS normalize in
/// f64 behind the Q128 boundary. Only the normalized `output` converts back;
/// the caller's `residual` output, when requested, stays exact Q128.
/// `sums` is caller-provided scratch (>= hidden.len) holding the residual
/// sums so the scale pass doesn't re-convert Q128 values it just wrote.
pub fn skipSimplifiedLayerNormF64(
    output: []fp.Q128_128,
    hidden: []const fp.Q128_128,
    skip: []const fp.Q128_128,
    weight: []const f64,
    epsilon: f64,
    sums: []f64,
) !void {
    if ((skip.len != hidden.len and skip.len != 1) or output.len != hidden.len or weight.len != hidden.len or hidden.len == 0 or sums.len < hidden.len) return error.ShapeMismatch;
    const skip_scalar = skip.len == 1;
    var mean_square: f64 = 0;
    for (0..hidden.len) |i| {
        const sum = hidden[i].toF64() + (if (skip_scalar) skip[0].toF64() else skip[i].toF64());
        sums[i] = sum;
        mean_square += sum * sum;
        output[i] = try fp.Q128_128.fromF64Saturating(sum);
    }
    const inverse_norm = 1.0 / @sqrt(mean_square / @as(f64, @floatFromInt(hidden.len)) + epsilon);
    for (output, weight, sums) |*value, scale, sum| value.* = try fp.Q128_128.fromF64Saturating(sum * inverse_norm * scale);
}

fn reciprocalSqrt(value: fp.Q128_128) !fp.Q128_128 {
    if (value.raw <= 0) return error.InvalidValue;
    var guess = fp.Q128_128.one;
    for (0..24) |_| {
        const quotient = try value.div(guess);
        guess = fp.Q128_128{ .raw = fp.divTruncPow2I256(guess.raw + quotient.raw, 1) };
    }
    return fp.Q128_128.one.div(guess);
}

test "skip simplified layer norm normalizes residual" {
    const hidden = [_]fp.Q128_128{ fp.Q128_128.fromInt(1), fp.Q128_128.fromInt(1) };
    const skip = [_]fp.Q128_128{ fp.Q128_128.fromInt(1), fp.Q128_128.fromInt(1) };
    const weight = [_]fp.Q128_128{ fp.Q128_128.one, fp.Q128_128.one };
    var output: [2]fp.Q128_128 = undefined;
    try skipSimplifiedLayerNorm(&output, &hidden, &skip, &weight, fp.Q128_128.fromRaw(1));
    try std.testing.expect(output[0].raw > fp.Q128_128.fromInt(0).raw);
    try std.testing.expect(output[0].raw < fp.Q128_128.fromInt(2).raw);
    try std.testing.expectEqual(output[0].raw, output[1].raw);
}
