//! Signed q128.128 fixed-point arithmetic backed by Zig's i256 type.
//! Values are finite dyadic rationals; irrational constants are approximations.

const std = @import("std");
const builtin = @import("builtin");

pub const FRAC_BITS: u8 = 128;
pub const SCALE: i256 = @as(i256, 1) << FRAC_BITS;

pub const Error = error{ DivisionByZero, Overflow, InvalidValue };

pub const DivRem = struct { q: u512, r: u512 };

/// Shift-subtract long division. Freestanding Wasm lowers wide-integer
/// div/rem to unavailable libcalls, so the shared core uses this software
/// path on all targets to stay bit-identical everywhere.
pub fn udiv512(numerator: u512, denominator: u512) DivRem {
    var quotient: u512 = 0;
    var remainder: u512 = 0;
    if (numerator == 0) return .{ .q = 0, .r = 0 };
    var bit_index: u16 = @intCast(511 - @clz(numerator));
    while (true) {
        remainder = (remainder << 1) | ((numerator >> @intCast(bit_index)) & 1);
        if (remainder >= denominator) {
            remainder -= denominator;
            quotient |= @as(u512, 1) << @intCast(bit_index);
        }
        if (bit_index == 0) break;
        bit_index -= 1;
    }
    return .{ .q = quotient, .r = remainder };
}

fn magnitude512(value: i512) u512 {
    const bits: u512 = @bitCast(value);
    return if (value < 0) (~bits +% 1) else bits;
}

/// Truncating signed division over the wide container, matching @divTrunc
/// semantics without relying on wide-integer libcalls.
pub fn divTruncWide(numerator: i512, denominator: i512) Error!i512 {
    if (denominator == 0) return error.DivisionByZero;
    const result = udiv512(magnitude512(numerator), magnitude512(denominator));
    if ((numerator < 0) != (denominator < 0)) {
        if (result.q > @as(u512, 1) << 511) return error.Overflow;
        return @bitCast(~result.q +% 1);
    }
    if (result.q > std.math.maxInt(i512)) return error.Overflow;
    return @bitCast(result.q);
}

/// Truncating signed remainder (sign of the numerator), matching @rem.
pub fn remTruncWide(numerator: i512, denominator: i512) Error!i512 {
    if (denominator == 0) return error.DivisionByZero;
    const result = udiv512(magnitude512(numerator), magnitude512(denominator));
    if (numerator < 0) return @bitCast(~result.r +% 1);
    if (result.r > std.math.maxInt(i512)) return error.Overflow;
    return @bitCast(result.r);
}

pub fn divTruncI256(numerator: i256, denominator: i256) Error!i256 {
    const quotient = try divTruncWide(numerator, denominator);
    if (quotient > std.math.maxInt(i256) or quotient < std.math.minInt(i256)) return error.Overflow;
    return @intCast(quotient);
}

pub fn remTruncI256(numerator: i256, denominator: i256) Error!i256 {
    const remainder = try remTruncWide(numerator, denominator);
    if (remainder > std.math.maxInt(i256) or remainder < std.math.minInt(i256)) return error.Overflow;
    return @intCast(remainder);
}

/// Truncating division by 2^shift (rounds toward zero, matching @divTrunc
/// on a power-of-two divisor).
pub fn divTruncPow2I512(value: i512, shift: u9) i512 {
    const quotient = value >> @intCast(shift);
    if (value < 0 and (value & ((@as(i512, 1) << @intCast(shift)) - 1)) != 0) return quotient + 1;
    return quotient;
}

pub fn divTruncPow2I256(value: i256, shift: u8) i256 {
    const quotient = value >> @intCast(shift);
    if (value < 0 and (value & ((@as(i256, 1) << @intCast(shift)) - 1)) != 0) return quotient + 1;
    return quotient;
}

fn magnitudeI256(value: i256) u256 {
    const bits: u256 = @bitCast(value);
    return if (value < 0) (~bits +% 1) else bits;
}

fn magnitudeI64(value: i64) u256 {
    const bits: u64 = @bitCast(value);
    return @as(u256, if (value < 0) (~bits +% 1) else bits);
}

fn divTruncI256ByI64(numerator: i256, denominator: i64) Error!i256 {
    if (denominator == 0) return error.DivisionByZero;
    if (numerator == std.math.minInt(i256) and denominator == -1) return error.Overflow;
    switch (builtin.target.cpu.arch) {
        .wasm32, .wasm64 => {
            const negative = (numerator < 0) != (denominator < 0);
            const dividend = magnitudeI256(numerator);
            const divisor = magnitudeI64(denominator);
            var quotient: u256 = 0;
            var remainder: u256 = 0;
            var bit_index: u16 = @intCast(255 - @clz(dividend));
            while (true) {
                remainder = (remainder << 1) | ((dividend >> @intCast(bit_index)) & 1);
                if (remainder >= divisor) {
                    remainder -= divisor;
                    quotient |= @as(u256, 1) << @intCast(bit_index);
                }
                if (bit_index == 0) break;
                bit_index -= 1;
            }
            if (!negative and quotient > std.math.maxInt(i256)) return error.Overflow;
            if (negative and quotient > (@as(u256, 1) << 255)) return error.Overflow;
            const signed_bits = if (negative) (~quotient +% 1) else quotient;
            return @bitCast(signed_bits);
        },
        else => return @divTrunc(numerator, @as(i256, denominator)),
    }
}

pub const Q128_128 = struct {
    raw: i256,

    pub const zero = Q128_128{ .raw = 0 };
    pub const one = Q128_128{ .raw = SCALE };

    pub fn fromInt(value: i64) Q128_128 {
        return .{ .raw = @as(i256, value) << FRAC_BITS };
    }

    pub fn fromRaw(raw: i256) Q128_128 {
        return .{ .raw = raw };
    }

    pub fn fromF32Bits(bits: u32) Error!Q128_128 {
        const sign: i256 = if ((bits >> 31) != 0) -1 else 1;
        const exponent = (bits >> 23) & 0xff;
        const fraction = bits & 0x7fffff;
        if (exponent == 0xff) return error.InvalidValue;
        if (exponent == 0 and fraction == 0) return .{ .raw = 0 };
        const mantissa: i512 = if (exponent == 0) fraction else (0x800000 | fraction);
        const binary_exponent: i32 = if (exponent == 0) -149 else @as(i32, @intCast(exponent)) - 127 - 23;
        const shift: i32 = binary_exponent + FRAC_BITS;
        const signed_mantissa: i512 = @as(i512, sign) * mantissa;
        const raw: i512 = if (shift >= 0)
            signed_mantissa << @intCast(shift)
        else
            divTruncPow2I512(signed_mantissa, @intCast(-shift));
        if (raw > std.math.maxInt(i256) or raw < std.math.minInt(i256)) return error.Overflow;
        return .{ .raw = @intCast(raw) };
    }

    /// Saturating variant of `fromF32Bits` used at the model import boundary:
    /// float magnitudes beyond the q128.128 range clamp to min/max rather than
    /// failing. This preserves semantics for values that act as +/-infinity
    /// downstream (e.g. additive attention-mask bias), and is documented as a
    /// deliberate quantization-boundary policy.
    pub fn fromF32BitsSaturating(bits: u32) Error!Q128_128 {
        const exponent = (bits >> 23) & 0xff;
        const fraction = bits & 0x7fffff;
        if (exponent == 0xff) return error.InvalidValue;
        if (exponent == 0 and fraction == 0) return .{ .raw = 0 };
        const sign: i512 = if ((bits >> 31) != 0) -1 else 1;
        const mantissa: i512 = if (exponent == 0) fraction else (0x800000 | fraction);
        const binary_exponent: i32 = if (exponent == 0) -149 else @as(i32, @intCast(exponent)) - 127 - 23;
        const shift: i32 = binary_exponent + FRAC_BITS;
        const signed_mantissa: i512 = sign * mantissa;
        const raw: i512 = if (shift >= 0)
            signed_mantissa << @intCast(shift)
        else
            divTruncPow2I512(signed_mantissa, @intCast(-shift));
        if (raw > std.math.maxInt(i256)) return .{ .raw = std.math.maxInt(i256) };
        if (raw < std.math.minInt(i256)) return .{ .raw = std.math.minInt(i256) };
        return .{ .raw = @intCast(raw) };
    }

    pub fn add(self: Q128_128, other: Q128_128) Error!Q128_128 {
        const result = self.raw +% other.raw;
        if ((self.raw >= 0 and other.raw >= 0 and result < 0) or
            (self.raw < 0 and other.raw < 0 and result >= 0)) return error.Overflow;
        return .{ .raw = result };
    }

    pub fn sub(self: Q128_128, other: Q128_128) Error!Q128_128 {
        const result = self.raw -% other.raw;
        if ((self.raw >= 0 and other.raw < 0 and result < 0) or
            (self.raw < 0 and other.raw >= 0 and result >= 0)) return error.Overflow;
        return .{ .raw = result };
    }

    pub fn mul(self: Q128_128, other: Q128_128) Error!Q128_128 {
        const wide: i512 = @as(i512, self.raw) * @as(i512, other.raw);
        const scaled = wide >> FRAC_BITS;
        if (scaled > std.math.maxInt(i256) or scaled < std.math.minInt(i256)) return error.Overflow;
        return .{ .raw = @intCast(scaled) };
    }

    pub fn div(self: Q128_128, other: Q128_128) Error!Q128_128 {
        if (other.raw == 0) return error.DivisionByZero;
        if ((other.raw & (SCALE - 1)) == 0) {
            const factor_raw = other.raw >> FRAC_BITS;
            if (factor_raw >= std.math.minInt(i64) and factor_raw <= std.math.maxInt(i64)) {
                return .{ .raw = try divTruncI256ByI64(self.raw, @intCast(factor_raw)) };
            }
        }
        const wide: i512 = @as(i512, self.raw) << FRAC_BITS;
        const quotient = try divTruncWide(wide, @as(i512, other.raw));
        if (quotient > std.math.maxInt(i256) or quotient < std.math.minInt(i256)) return error.Overflow;
        return .{ .raw = @intCast(quotient) };
    }

    pub fn neg(self: Q128_128) Error!Q128_128 {
        if (self.raw == std.math.minInt(i256)) return error.Overflow;
        return .{ .raw = -self.raw };
    }

    /// Lossy export for reporting/comparison only. Never used inside the
    /// deterministic arithmetic path; parity harnesses may use it to compare
    /// against float references.
    pub fn toF64(self: Q128_128) f64 {
        // Zig 0.13 lacks the i256->f64 libcall on wasm*-freestanding, so the
        // magnitude is decomposed into u64 words (f64.convert is a native wasm
        // op) and recombined. Wrapping negation maps minInt to the correct
        // 2^255 magnitude.
        if (comptime builtin.target.cpu.arch == .wasm32 or builtin.target.cpu.arch == .wasm64) {
            const negative = self.raw < 0;
            const mag: u256 = @bitCast(if (negative) -%self.raw else self.raw);
            const w0: u64 = @truncate(mag);
            const w1: u64 = @truncate(mag >> 64);
            const w2: u64 = @truncate(mag >> 128);
            const w3: u64 = @truncate(mag >> 192);
            const hi = ((@as(f64, @floatFromInt(w3)) * 0x1p64 + @as(f64, @floatFromInt(w2))) * 0x1p64 + @as(f64, @floatFromInt(w1))) * 0x1p64 + @as(f64, @floatFromInt(w0));
            return (if (negative) -hi else hi) / 0x1p128;
        }
        return @as(f64, @floatFromInt(self.raw)) / @as(f64, @floatFromInt(SCALE));
    }

    /// Lossy conversion for the opt-in fast numeric tier (ADR-0023). Only
    /// used where an operator explicitly runs approximate f32 math behind the
    /// Q128 tensor boundary.
    pub fn toF32(self: Q128_128) f32 {
        return @floatCast(self.toF64());
    }

    /// f32 -> Q128 at the fast-tier output boundary; saturates like the model
    /// import path so extreme activations clamp instead of failing.
    pub fn fromF32Saturating(value: f32) Error!Q128_128 {
        return fromF32BitsSaturating(@bitCast(value));
    }

    /// f64 -> Q128 at the fast-tier output boundary; saturates on overflow and
    /// maps NaN/infinity to zero so a degenerate fast-kernel result cannot
    /// poison the recurrent state.
    pub fn fromF64Saturating(value: f64) Error!Q128_128 {
        // `value * 2^128` is exact in f64 (pure exponent bump) for every
        // finite input below 2^896, and `@intFromFloat` truncates toward
        // zero — identical semantics to the previous i512 shift/divTrunc
        // path, at a fraction of the cost. NaN and infinities map to zero so
        // a degenerate fast-kernel result cannot poison the recurrent state.
        if (!std.math.isFinite(value)) return .{ .raw = 0 };
        const scaled = value * 0x1p128;
        if (scaled >= 0x1p255) return .{ .raw = std.math.maxInt(i256) };
        if (scaled <= -0x1p255) return .{ .raw = std.math.minInt(i256) };
        // The f64->i256 libcall is likewise missing on wasm*-freestanding:
        // extract each u64 word of the magnitude (f64->u64 truncates toward
        // zero natively) and recompose. f64 inputs carry at most 53 mantissa
        // bits, so word extraction loses nothing the input had.
        if (comptime builtin.target.cpu.arch == .wasm32 or builtin.target.cpu.arch == .wasm64) {
            const negative = scaled < 0;
            var rem = @abs(scaled);
            const w3: u64 = @intFromFloat(@floor(rem / 0x1p192));
            rem -= @as(f64, @floatFromInt(w3)) * 0x1p192;
            const w2: u64 = @intFromFloat(@floor(rem / 0x1p128));
            rem -= @as(f64, @floatFromInt(w2)) * 0x1p128;
            const w1: u64 = @intFromFloat(@floor(rem / 0x1p64));
            rem -= @as(f64, @floatFromInt(w1)) * 0x1p64;
            const w0: u64 = @intFromFloat(@floor(rem));
            const mag: u256 = (@as(u256, w3) << 192) | (@as(u256, w2) << 128) | (@as(u256, w1) << 64) | @as(u256, w0);
            return .{ .raw = if (negative) -@as(i256, @bitCast(mag)) else @as(i256, @bitCast(mag)) };
        }
        return .{ .raw = @intFromFloat(scaled) };
    }

    pub fn toLittleEndian(self: Q128_128) [32]u8 {
        const bits: u256 = @bitCast(self.raw);
        var output: [32]u8 = undefined;
        var i: usize = 0;
        while (i < output.len) : (i += 1) output[i] = @truncate(bits >> @as(u8, @intCast(i * 8)));
        return output;
    }

    pub fn fromLittleEndian(bytes: [32]u8) Q128_128 {
        var bits: u256 = 0;
        for (bytes, 0..) |byte, i| bits |= @as(u256, byte) << @as(u8, @intCast(i * 8));
        return .{ .raw = @bitCast(bits) };
    }
};

/// Rounded q128.128 approximation of pi.
pub const PI = Q128_128{ .raw = 1069028584064966747859680373161870783300 };
/// Rounded q128.128 approximation of phi.
pub const PHI = Q128_128{ .raw = 550588435450341336629110977315780544564 };
pub const TWO_PI = Q128_128{ .raw = PI.raw * 2 };

fn expectNear(actual: Q128_128, expected: i256, tolerance: i256) !void {
    const difference = if (actual.raw >= expected) actual.raw - expected else expected - actual.raw;
    try std.testing.expect(difference <= tolerance);
}

test "float32 bit import is exact at q128 boundary" {
    try std.testing.expectEqual(SCALE / 2, (try Q128_128.fromF32Bits(0x3f000000)).raw);
    try std.testing.expectEqual(SCALE, (try Q128_128.fromF32Bits(0x3f800000)).raw);
    try std.testing.expectEqual(-SCALE, (try Q128_128.fromF32Bits(0xbf800000)).raw);
}

test "integer round trip" {
    try std.testing.expectEqual(@as(i256, 42) << FRAC_BITS, Q128_128.fromInt(42).raw);
}

test "fractional multiplication and division" {
    const half = Q128_128{ .raw = SCALE / 2 };
    const quarter = try half.mul(half);
    try std.testing.expectEqual(SCALE / 4, quarter.raw);
    const third = try Q128_128.fromInt(1).div(Q128_128.fromInt(3));
    try std.testing.expect(third.raw > SCALE / 3 - 2);
    try std.testing.expect(third.raw < SCALE / 3 + 2);
}

test "division by zero is reported" {
    try std.testing.expectError(error.DivisionByZero, Q128_128.one.div(Q128_128.zero));
}

test "little endian serialization round trip" {
    const value = Q128_128{ .raw = -(@as(i256, 17) * SCALE + SCALE / 3) };
    try std.testing.expectEqual(value.raw, Q128_128.fromLittleEndian(value.toLittleEndian()).raw);
}

test "constants are positive and close to documented values" {
    try std.testing.expect(PI.raw > 3 * SCALE);
    try std.testing.expect(PHI.raw > SCALE);
    try std.testing.expect(PHI.raw > (SCALE * 16) / 10);
    try std.testing.expect(PHI.raw < (SCALE * 17) / 10);
}
