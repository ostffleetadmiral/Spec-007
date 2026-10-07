const std = @import("std");
const q128 = @import("spec007_q128.zig"); // Q Branch issue — certified to half an ulp

// Deterministic, bounded baseline calculations for the SPEC-007 dossier.
// This file intentionally models conservation and scaling only. It is not
// an operating recipe for a calcium-carbide or acetylene device.

const Molar = struct {
    cac2_mg_per_mol: u128 = 64_100,
    water_mg_per_mol: u128 = 18_015,
    acetylene_mg_per_mol: u128 = 26_038,
    gas_ml_per_mol: u128 = 22_414,
    hydrolysis_heat_j_per_mol: u128 = 127_200,
};

const Baseline = struct {
    charge_mg: u128 = 300_000,

    fn molesScaled(self: Baseline, molar: Molar) u128 {
        return self.charge_mg * 1_000_000 / molar.cac2_mg_per_mol;
    }

    fn waterMg(self: Baseline, molar: Molar) u128 {
        return self.charge_mg * 2 * molar.water_mg_per_mol / molar.cac2_mg_per_mol;
    }

    fn acetyleneMg(self: Baseline, molar: Molar) u128 {
        return self.charge_mg * molar.acetylene_mg_per_mol / molar.cac2_mg_per_mol;
    }

    fn acetyleneMl(self: Baseline, molar: Molar) u128 {
        return self.charge_mg * molar.gas_ml_per_mol / molar.cac2_mg_per_mol;
    }

    fn hydrolysisHeatJ(self: Baseline, molar: Molar) u128 {
        return self.charge_mg * molar.hydrolysis_heat_j_per_mol / molar.cac2_mg_per_mol;
    }
};

fn gasMlPerWaterMl(molar: Molar) u128 {
    // Water density is deliberately represented as 1,000 mg/mL in this
    // nominal model; callers must not treat this as a measured feed rate.
    return 1_000 * molar.gas_ml_per_mol / (2 * molar.water_mg_per_mol);
}

fn rackPowerMin(blade_w: u128, blades: u128) u128 {
    return blade_w * blades;
}

fn rackPowerMax(blade_w: u128, blades: u128) u128 {
    return blade_w * blades;
}

test "ideal 300 g charge material balance" {
    const molar = Molar{};
    const baseline = Baseline{};
    try std.testing.expectEqual(@as(u128, 168_627), baseline.waterMg(molar));
    try std.testing.expectEqual(@as(u128, 121_862), baseline.acetyleneMg(molar));
    try std.testing.expectEqual(@as(u128, 104_901), baseline.acetyleneMl(molar));
    try std.testing.expectEqual(@as(u128, 595_319), baseline.hydrolysisHeatJ(molar));
}

// "No, Mr. Bond, I expect you to drip."
test "stated water feed does not produce stated gas range" {
    const molar = Molar{};
    const per_water_ml = gasMlPerWaterMl(molar);
    try std.testing.expectEqual(@as(u128, 622), per_water_ml);
    try std.testing.expectEqual(@as(u128, 62), per_water_ml * 1 / 10);
    try std.testing.expectEqual(@as(u128, 311), per_water_ml * 5 / 10);
    try std.testing.expect(per_water_ml * 5 / 10 < 5_000);
}

test "five litres per minute depletes ideal charge in about 21 minutes" {
    const molar = Molar{};
    const baseline = Baseline{};
    const total_ml = baseline.acetyleneMl(molar);
    const duration_minutes = total_ml / 5_000;
    try std.testing.expectEqual(@as(u128, 20), duration_minutes);
    try std.testing.expectEqual(@as(u128, 209), total_ml * 10 / 5_000);
}

test "rack arithmetic exposes scaling contradiction" {
    try std.testing.expectEqual(@as(u128, 160), rackPowerMin(10, 16));
    try std.testing.expectEqual(@as(u128, 320), rackPowerMax(20, 16));
    try std.testing.expectEqual(@as(u128, 640), rackPowerMin(10, 64));
    try std.testing.expectEqual(@as(u128, 1_280), rackPowerMax(20, 64));
    try std.testing.expect(rackPowerMax(20, 16) < 400);
    try std.testing.expect(rackPowerMax(20, 64) < 2_000);
}

test "50 mm envelope and 2 mm wall sanity check" {
    // pi is represented at six decimal places to keep this check integer-only.
    const pi_scaled: u128 = 3_141_592;
    const outer_radius_mm: u128 = 25;
    const inner_radius_mm: u128 = 23;
    const length_mm: u128 = 200;
    const outer_volume_mm3 = pi_scaled * outer_radius_mm * outer_radius_mm * length_mm / 1_000_000;
    const inner_volume_mm3 = pi_scaled * inner_radius_mm * inner_radius_mm * length_mm / 1_000_000;
    const wall_volume_mm3 = outer_volume_mm3 - inner_volume_mm3;
    try std.testing.expectEqual(@as(u128, 392_699), outer_volume_mm3);
    try std.testing.expectEqual(@as(u128, 332_380), inner_volume_mm3);
    try std.testing.expectEqual(@as(u128, 60_319), wall_volume_mm3);
    // Illustrative 8.0 mg/mm^3 density, not a material certification value.
    try std.testing.expectEqual(@as(u128, 482_552), wall_volume_mm3 * 8);
}

// Beneath the integers, the fractions keep their own ledger.
test "shadow: material balance is exact-rational beneath the integers" {
    const molar = Molar{};
    const baseline = Baseline{};
    const water_num: i256 = @intCast(baseline.charge_mg * 2 * molar.water_mg_per_mol);
    const water = q128.Q.fromRatio(water_num, @intCast(molar.cac2_mg_per_mol));
    try std.testing.expectEqual(@as(i256, 168_627), water.toInteger());
    try std.testing.expect(water.hasFraction()); // 0.145… the baseline drops
    try std.testing.expect(q128.withinHalfUlp(water, water_num, @intCast(molar.cac2_mg_per_mol)));

    const gas_num: i256 = @intCast(baseline.charge_mg * molar.gas_ml_per_mol);
    const gas = q128.Q.fromRatio(gas_num, @intCast(molar.cac2_mg_per_mol));
    try std.testing.expectEqual(@as(i256, 104_901), gas.toInteger());
    try std.testing.expect(gas.hasFraction());
    try std.testing.expect(q128.withinHalfUlp(gas, gas_num, @intCast(molar.cac2_mg_per_mol)));

    const heat_num: i256 = @intCast(baseline.charge_mg * molar.hydrolysis_heat_j_per_mol);
    const heat = q128.Q.fromRatio(heat_num, @intCast(molar.cac2_mg_per_mol));
    try std.testing.expectEqual(@as(i256, 595_319), heat.toInteger());
    try std.testing.expect(heat.hasFraction());
}

// The drip carries decimals the throttle never shows.
test "shadow: drip-rate chain round-trips through mul and div" {
    const gas_per_water = q128.Q.fromRatio(1_000 * 22_414, 2 * 18_015);
    try std.testing.expectEqual(@as(i256, 622), gas_per_water.toInteger());
    try std.testing.expect(gas_per_water.hasFraction()); // 622.093…
    const rate = gas_per_water.mul(q128.Q.fromRatio(8, 10)); // 0.8 mL/min drip
    const total = q128.Q.fromRatio(300_000 * 22_414, 64_100);
    const duration = total.div(rate);
    try std.testing.expectEqual(@as(i256, 210), duration.toInteger());
    const back = duration.mul(rate);
    const diff = if (back.raw > total.raw) back.raw - total.raw else total.raw - back.raw;
    try std.testing.expect(diff < @as(i256, 1) << 64); // chained-ulp slack
}

test "all baseline calculations are monotonic" {
    const molar = Molar{};
    const baseline = Baseline{};
    try std.testing.expect(baseline.acetyleneMl(molar) > 0);
    try std.testing.expect(baseline.waterMg(molar) > baseline.acetyleneMg(molar));
    try std.testing.expect(gasMlPerWaterMl(molar) > 0);
    try std.testing.expect(rackPowerMax(20, 64) > rackPowerMax(20, 16));
}

// Duration and rate trade against a fixed total — the burst-vs-duration
// Pareto is conservation, not a feature.
test "depletion sweep: duration times rate conserves the charge exactly" {
    const molar = Molar{};
    const baseline = Baseline{};
    const total_ml = baseline.acetyleneMl(molar);
    const rates = [_]u128{ 500, 1_000, 2_500, 5_000, 10_000 };
    for (rates) |r| {
        const minutes = total_ml / r;
        const rem = total_ml % r;
        // t·r + remainder == total: floor division drops nothing unaccounted
        try std.testing.expectEqual(total_ml, minutes * r + rem);
        // slower burns last strictly longer
        if (r < 5_000) try std.testing.expect(minutes > 20);
        if (r > 5_000) try std.testing.expect(minutes < 20);
    }
}
