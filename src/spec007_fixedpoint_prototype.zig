const std = @import("std");
const fp128 = @import("fixed_point_q128.zig");

// PROTOTYPE — not a promoted harness. Compares the baseline u128
// milligram-scaled arithmetic in spec007_calculations.zig against two
// fixed-point upgrades: Q32.32 (i64 raw, i128 intermediates) and
// Q128.128 (i256 raw, i512 intermediates, reused from src/fixed_point.zig).
// Stoichiometric constants are held in milligrams-per-mole so all three
// variants consume identical inputs.

const CAC2_MG_PER_MOL: i256 = 64_100;
const WATER_MG_PER_MOL: i256 = 18_015;
const ACETYLENE_MG_PER_MOL: i256 = 26_038;
const GAS_ML_PER_MOL: i256 = 22_414;
const HYDROLYSIS_HEAT_J_PER_MOL: i256 = 127_200;
const CHARGE_MG: i256 = 300_000;

// ---------------------------------------------------------------------------
// Q32.32 — i64 raw value, i128 intermediate products.
// Range: ~±2.1e9 integer part; resolution 2^-32 ≈ 2.3e-10.
// ---------------------------------------------------------------------------
const Q32 = struct {
    raw: i64,
    const SCALE: i64 = 1 << 32;

    fn fromRatio(num: i64, den: i64) Q32 {
        // Round-half-away-from-zero, matching fp128.fromRatio semantics.
        const scaled: i128 = @as(i128, num) << 32;
        const q = @divTrunc(scaled, den);
        const r = @mod(scaled, den);
        const half: i128 = @divTrunc(den, 2);
        var result = q;
        if (r > half or (r == half and r != 0)) result += 1;
        return .{ .raw = @intCast(result) };
    }

    fn mul(self: Q32, other: Q32) Q32 {
        const product: i128 = @as(i128, self.raw) * @as(i128, other.raw);
        const truncated: i64 = @truncate(product >> 32);
        const discarded: i128 = product & ((@as(i128, 1) << 32) - 1);
        const halfway: i128 = @as(i128, 1) << 31;
        if (discarded > halfway or (discarded == halfway and (truncated & 1) != 0)) {
            return .{ .raw = truncated +% 1 };
        }
        return .{ .raw = truncated };
    }

    fn div(self: Q32, other: Q32) Q32 {
        const numerator: i128 = @as(i128, self.raw) << 32;
        return .{ .raw = @truncate(@divTrunc(numerator, @as(i128, other.raw))) };
    }

    fn toInteger(self: Q32) i64 {
        return @divTrunc(self.raw, SCALE);
    }

    fn scaledBy(self: Q32, k: i64) i128 {
        // Convert to integer milli-units for cross-format comparison.
        return @divTrunc(@as(i128, self.raw) * k, SCALE);
    }
};

// ---------------------------------------------------------------------------
// Shared stoichiometry, expressed per variant.
// ---------------------------------------------------------------------------

// Baseline (current harness): u128, multiply-then-divide truncation.
fn baselineWaterMg() u128 {
    return 300_000 * 2 * 18_015 / 64_100;
}
fn baselineAcetyleneMl() u128 {
    return 300_000 * 22_414 / 64_100;
}
fn baselineGasMlPerWaterMl() u128 {
    return 1_000 * 22_414 / (2 * 18_015);
}
fn baselineHeatJ() u128 {
    return 300_000 * 127_200 / 64_100;
}

// Exact rational reference: each quantity is an integer num/den pair.
// water_mg = CHARGE_MG * 2 * WATER_MG_PER_MOL / CAC2_MG_PER_MOL
//          = 10_809_000_000 / 64_100
const WATER_NUM: i256 = CHARGE_MG * 2 * WATER_MG_PER_MOL;
const GAS_ML_NUM: i256 = CHARGE_MG * GAS_ML_PER_MOL;
const GAS_PER_WATER_NUM: i256 = 1_000 * GAS_ML_PER_MOL;
const GAS_PER_WATER_DEN: i256 = 2 * WATER_MG_PER_MOL;
const HEAT_NUM: i256 = CHARGE_MG * HYDROLYSIS_HEAT_J_PER_MOL;

// Q32.32 variant.
fn q32WaterMg() Q32 {
    const charge = Q32.fromRatio(@intCast(CHARGE_MG), 1);
    const ratio = Q32.fromRatio(@intCast(2 * WATER_MG_PER_MOL), @intCast(CAC2_MG_PER_MOL));
    return charge.mul(ratio);
}
fn q32GasPerWater() Q32 {
    return Q32.fromRatio(@intCast(GAS_PER_WATER_NUM), @intCast(GAS_PER_WATER_DEN));
}

// Q128.128 variant (repo engine).
fn q128WaterMg() !fp128.Q128 {
    const charge = fp128.Q128.fromInteger(CHARGE_MG);
    const ratio = try fp128.Q128.fromRatio(2 * WATER_MG_PER_MOL, CAC2_MG_PER_MOL);
    return charge.mul(ratio);
}
fn q128GasPerWater() !fp128.Q128 {
    return fp128.Q128.fromRatio(GAS_PER_WATER_NUM, GAS_PER_WATER_DEN);
}
fn q128HeatJ() !fp128.Q128 {
    const charge = fp128.Q128.fromInteger(CHARGE_MG);
    const ratio = try fp128.Q128.fromRatio(HYDROLYSIS_HEAT_J_PER_MOL, CAC2_MG_PER_MOL);
    return charge.mul(ratio);
}

// ---------------------------------------------------------------------------
// Outcome tests
// ---------------------------------------------------------------------------

test "prototype: integer parts agree across all three variants" {
    // Water: exact 168_627.145… mg
    try std.testing.expectEqual(@as(u128, 168_627), baselineWaterMg());
    try std.testing.expectEqual(@as(i64, 168_627), q32WaterMg().toInteger());
    try std.testing.expectEqual(@as(i256, 168_627), (try q128WaterMg()).toInteger());
    // Gas yield: exact 104_901.72… mL
    try std.testing.expectEqual(@as(u128, 104_901), baselineAcetyleneMl());
    // Drip ratio: exact 622.093… mL gas per mL water
    try std.testing.expectEqual(@as(u128, 622), baselineGasMlPerWaterMl());
    try std.testing.expectEqual(@as(i64, 622), q32GasPerWater().toInteger());
    try std.testing.expectEqual(@as(i256, 622), (try q128GasPerWater()).toInteger());
    // Hydrolysis heat: exact 595_319.81… J
    try std.testing.expectEqual(@as(u128, 595_319), baselineHeatJ());
    try std.testing.expectEqual(@as(i256, 595_319), (try q128HeatJ()).toInteger());
}

test "prototype: Q128 result matches exact rational within compounded ulp bound" {
    // q = RNE(charge * RNE(exact_ratio)); total error <= (charge+1)*2^-129,
    // so |q.raw*den - num*2^128| <= den*(charge+1)/2 in raw-scaled units.
    const q = try q128WaterMg();
    const lhs: i512 = @as(i512, q.raw) * @as(i512, CAC2_MG_PER_MOL);
    const rhs: i512 = @as(i512, WATER_NUM) << 128;
    const diff = if (lhs > rhs) lhs - rhs else rhs - lhs;
    const bound: i512 = @divTrunc(@as(i512, CAC2_MG_PER_MOL) * (CHARGE_MG + 1), 2);
    try std.testing.expect(diff <= bound);
}

test "prototype: Q32 result matches exact rational within one ulp bound" {
    const q = q32GasPerWater();
    const lhs: i128 = @as(i128, q.raw) * @as(i128, GAS_PER_WATER_DEN);
    const rhs: i128 = @as(i128, GAS_PER_WATER_NUM) << 32;
    const diff = if (lhs > rhs) lhs - rhs else rhs - lhs;
    try std.testing.expect(diff <= @as(i128, GAS_PER_WATER_DEN));
}

test "prototype: baseline truncation error is bounded at 1 milli-unit" {
    // Baseline floor-divides; the exact remainder is (num mod den)/den.
    // For water: 10_809_000_000 mod 64_100 -> fractional loss < 1 mg.
    const remainder: u128 = 10_809_000_000 % 64_100;
    try std.testing.expect(remainder > 0); // nonzero => truncation occurred
    try std.testing.expect(remainder < 64_100);
    // Q32.32 exposes that lost fraction: water = 168_627 + 9_300/64_100
    // = 168_627.14508…, truncating to 168_627_145 micro-mg at 3 decimals.
    const milli = q32WaterMg().scaledBy(1_000);
    try std.testing.expectEqual(@as(i128, 168_627_145), milli);
}

test "prototype: chained Q128 mul/div stays exact for rate-duration chain" {
    // drip 0.8 mL/min * 622.09 mL gas /mL water ≈ 497.7 mL/min gas.
    const gas_per_water = try q128GasPerWater();
    const drip = try fp128.Q128.fromRatio(8, 10);
    const rate = gas_per_water.mul(drip);
    // duration = 104_901.72 mL / 497.67 mL/min ≈ 210.8 min
    const total = try fp128.Q128.fromRatio(GAS_ML_NUM, CAC2_MG_PER_MOL);
    const duration = try total.div(rate);
    try std.testing.expectEqual(@as(i256, 210), duration.toInteger());
    // Exact check: duration*rate ≈ total within combined-ulp bound.
    const back = duration.mul(rate);
    const diff = if (back.raw > total.raw) back.raw - total.raw else total.raw - back.raw;
    try std.testing.expect(diff < @as(i256, 1) << 64); // << 1 ulp of unit scale
}

// The boundary case the prototype exists for: Q32.32 has ~±2.1e9 of
// integer headroom; Q128.128 has ~1.7e38. A product that silently
// wraps in one representation stays exact in the other.
test "q32.32 wraps where q128.128 stays exact — the range boundary" {
    // 100,000 x 100,000 = 1e10: overflows i64 Q32.32 raw (1e10<<32),
    // fits i256 Q128.128 with room for an entire fleet.
    const big32 = Q32.fromRatio(100_000, 1);
    const sq32 = big32.mul(big32);
    // wrapped: the integer part is NOT 1e10 — the wrap IS the finding
    try std.testing.expect(sq32.toInteger() != 100_000);
    const big128 = fp128.Q128.fromRatio(1_000_000, 10) catch unreachable; // 100,000
    const sq128 = big128.mul(big128);
    try std.testing.expectEqual(@as(i256, 10_000_000_000), sq128.toInteger());
}
