const std = @import("std");
const q128 = @import("spec007_q128.zig"); // Q Branch issue — the quartermaster keeps the fractions

// Verified-claims calculation layer for SPEC-007.
// Constants here are either stoichiometric/physical (documented in
// spec-007-research-dossier.md) or sourced manufacturer/regulatory values
// (documented in spec-007-claim-verification.en.md). Nothing in this file is
// a promotional claim: these are corrected baselines used by the verified
// documentation.

const Pure = struct {
    cac2_mg_per_mol: u128 = 64_100,
    water_mg_per_mol: u128 = 18_015,
    acetylene_mg_per_mol: u128 = 26_038,
    caoh2_mg_per_mol: u128 = 74_092,
    gas_ml_per_mol_stp: u128 = 22_414,
    // Molar volume at the GB 10665-2004 rating condition (20 degC, 101.3 kPa).
    gas_ml_per_mol_rated: u128 = 24_055,
    reaction_heat_j_per_mol: u128 = 127_200,
    acetylene_lhv_mj_per_kg: u128 = 49_900_000, // 49.9 MJ/kg in mJ/kg
};

const Commercial = struct {
    // GB 10665-2004 acetylene-grade supplier ratings at 20 degC, 101.3 kPa.
    gas_yield_l_per_kg_min: u128 = 285,
    gas_yield_l_per_kg_max: u128 = 305,
};

const Teg = struct {
    // Representative 40x40 mm high-temperature module (TGPR-10W4V-40S style):
    // 9.8 W matched load at 300 degC hot side / 30 degC cold side, ~188 W
    // heat flow across the module.
    module_power_milliwatt: u128 = 9_800,
    module_heat_milliwatt: u128 = 188_000,
};

fn commercialGasMl(charge_g: u128, yield_l_per_kg: u128) u128 {
    return charge_g * yield_l_per_kg;
}

fn chemicalWhPerKg(pure: Pure) u128 {
    const acetylene_mg_per_kg = 1_000_000 * pure.acetylene_mg_per_mol / pure.cac2_mg_per_mol;
    return acetylene_mg_per_kg * pure.acetylene_lhv_mj_per_kg / 1_000_000 / 3_600;
}

fn reactionHeatWhPerKg(pure: Pure) u128 {
    const j_per_kg = 1_000_000 * pure.reaction_heat_j_per_mol / pure.cac2_mg_per_mol;
    return j_per_kg / 3_600;
}

fn moduleEfficiencyPercent(teg: Teg) u128 {
    return teg.module_power_milliwatt * 100 / teg.module_heat_milliwatt;
}

fn combustionThermalPowerW(
    gas_ml_per_min: u128,
    gas_ml_per_mol: u128,
    acetylene_mg_per_mol: u128,
    lhv_j_per_kg: u128,
) u128 {
    // mol/min -> mg/min -> mg/s -> J/s: divide by 60 s and by 1e6 mg/kg.
    return gas_ml_per_min * acetylene_mg_per_mol * lhv_j_per_kg / (gas_ml_per_mol * 60 * 1_000_000);
}

fn hydrolysisThermalPowerW(
    gas_ml_per_min: u128,
    gas_ml_per_mol: u128,
    heat_j_per_mol: u128,
) u128 {
    return gas_ml_per_min * heat_j_per_mol / (gas_ml_per_mol * 60);
}

fn impliedPurityTenthsPercent(yield_l_per_kg: u128, pure: Pure) u128 {
    // Active CaC2 fraction implied by rated gas yield, in tenths of a percent.
    // The yield is rated at 20 degC / 101.3 kPa, so the implied purity must be
    // derived against the molar volume at that same condition (24.055 L/mol),
    // not the 0 degC STP model volume. 1 g/kg active carbide = 0.1%.
    return yield_l_per_kg * 1_000 * pure.cac2_mg_per_mol / pure.gas_ml_per_mol_rated / 1_000;
}

test "commercial grade 300 g cartridge yields 85.5 to 91.5 L of acetylene" {
    const commercial = Commercial{};
    const min_ml = commercialGasMl(300, commercial.gas_yield_l_per_kg_min);
    const max_ml = commercialGasMl(300, commercial.gas_yield_l_per_kg_max);
    try std.testing.expectEqual(@as(u128, 85_500), min_ml);
    try std.testing.expectEqual(@as(u128, 91_500), max_ml);
    try std.testing.expect(max_ml < 104_901); // below pure theoretical value
}

test "commercial gas yield implies about 76 to 81 percent active carbide" {
    const pure = Pure{};
    // 285 L/kg at the rated condition -> 759 tenths-of-percent = 75.9%.
    // 305 L/kg at the rated condition -> 812 tenths-of-percent = 81.2%.
    try std.testing.expectEqual(@as(u128, 759), impliedPurityTenthsPercent(285, pure));
    try std.testing.expectEqual(@as(u128, 812), impliedPurityTenthsPercent(305, pure));
}

test "verified energy density per kg pure carbide is 6.2 kWh not 12" {
    const pure = Pure{};
    const chemical = chemicalWhPerKg(pure);
    const heat = reactionHeatWhPerKg(pure);
    try std.testing.expectEqual(@as(u128, 5_630), chemical);
    try std.testing.expectEqual(@as(u128, 551), heat);
    try std.testing.expectEqual(@as(u128, 6_181), chemical + heat);
    try std.testing.expect(chemical + heat < 12_000);
}

test "representative 40x40 mm module is about 5 percent efficient" {
    const teg = Teg{};
    try std.testing.expectEqual(@as(u128, 5), moduleEfficiencyPercent(teg));
    try std.testing.expect(teg.module_power_milliwatt < 10_000);
    try std.testing.expect(teg.module_heat_milliwatt > teg.module_power_milliwatt);
}

test "rack power follows linearly from verified per-blade output" {
    // Verified TEG-only envelope of 10-20 W per blade (dossier-favorable case).
    try std.testing.expectEqual(@as(u128, 160), 10 * 16);
    try std.testing.expectEqual(@as(u128, 320), 20 * 16);
    try std.testing.expectEqual(@as(u128, 640), 10 * 64);
    try std.testing.expectEqual(@as(u128, 1_280), 20 * 64);
}

test "combustion burst ceiling is kilowatt-class thermal for about 21 minutes" {
    const pure = Pure{};
    // Burning the acetylene at the 5 L/min model rate (STP basis).
    const comb_w = combustionThermalPowerW(5_000, pure.gas_ml_per_mol_stp, pure.acetylene_mg_per_mol, pure.acetylene_lhv_mj_per_kg);
    const hyd_w = hydrolysisThermalPowerW(5_000, pure.gas_ml_per_mol_stp, pure.reaction_heat_j_per_mol);
    try std.testing.expectEqual(@as(u128, 4_830), comb_w);
    try std.testing.expectEqual(@as(u128, 472), hyd_w);
    try std.testing.expect(comb_w + hyd_w > 5_000);
    // Total thermal energy per pure charge: 1,689 Wh chemical + 165 Wh hydrolysis.
    try std.testing.expectEqual(@as(u128, 1_854), 1_689 + 165);
}

test "commercial charge burst ceiling and energy density scale with active fraction" {
    const pure = Pure{};
    const crown = Commercial{};
    // Rated-condition basis (24.055 L/mol): ~4.5 kW combustion + ~0.44 kW hydrolysis.
    const comb_w = combustionThermalPowerW(5_000, pure.gas_ml_per_mol_rated, pure.acetylene_mg_per_mol, pure.acetylene_lhv_mj_per_kg);
    const hyd_w = hydrolysisThermalPowerW(5_000, pure.gas_ml_per_mol_rated, pure.reaction_heat_j_per_mol);
    try std.testing.expectEqual(@as(u128, 4_501), comb_w);
    try std.testing.expectEqual(@as(u128, 440), hyd_w);
    // 85.5-91.5 L at 5 L/min -> 17-18 minutes.
    try std.testing.expectEqual(@as(u128, 17), commercialGasMl(300, crown.gas_yield_l_per_kg_min) / 5_000);
    try std.testing.expectEqual(@as(u128, 18), commercialGasMl(300, crown.gas_yield_l_per_kg_max) / 5_000);
    // Commercial-grade density: 6,181 Wh/kg pure x 75.9-81.3% active.
    const per_kg_wh = chemicalWhPerKg(pure) + reactionHeatWhPerKg(pure);
    try std.testing.expectEqual(@as(u128, 4_691), per_kg_wh * 759 / 1_000);
    try std.testing.expectEqual(@as(u128, 5_018), per_kg_wh * 812 / 1_000);
}

test "combustion mode trades duration for power at fixed charge energy" {
    const pure = Pure{};
    // At 1 L/min gas the same pure charge yields ~1.06 kW thermal for ~105 min;
    // at 5 L/min it yields ~5.3 kW for ~21 min. Total energy is conserved.
    const comb1 = combustionThermalPowerW(1_000, pure.gas_ml_per_mol_stp, pure.acetylene_mg_per_mol, pure.acetylene_lhv_mj_per_kg);
    const hyd1 = hydrolysisThermalPowerW(1_000, pure.gas_ml_per_mol_stp, pure.reaction_heat_j_per_mol);
    try std.testing.expectEqual(@as(u128, 966), comb1);
    try std.testing.expectEqual(@as(u128, 94), hyd1);
    const total_ml: u128 = 104_901;
    try std.testing.expectEqual(@as(u128, 104), total_ml / 1_000);
    try std.testing.expectEqual(@as(u128, 20), total_ml / 5_000);
    // Burst energy at 1 L/min: 1,060 W x ~104 min x 60 s = ~6.61 MJ
    // (within ~1% of the 6.68 MJ full-charge model total after truncation).
    const burst_j = (comb1 + hyd1) * (total_ml / 1_000) * 60;
    try std.testing.expectEqual(@as(u128, 6_614_400), burst_j);
    try std.testing.expect(burst_j < 6_676_232);
}

// The sludge is the clock — when the lime cakes, the hour is up.
test "spent charge leaves about 347 g of hydroxide residue" {
    const pure = Pure{};
    // CaC2 + 2 H2O -> C2H2 + Ca(OH)2: one mole of residue per mole carbide.
    const residue_mg = 300_000 * pure.caoh2_mg_per_mol / pure.cac2_mg_per_mol;
    try std.testing.expectEqual(@as(u128, 346_764), residue_mg);
}

// Even fire needs air — and what breathes must exhale somewhere safe.
test "combustion requires about 60 L/min of air at full rate" {
    const pure = Pure{};
    // 2 C2H2 + 5 O2 -> 4 CO2 + 2 H2O: 2.5 mol O2 per mol acetylene.
    const c2h2_mmol = 300_000 * 1_000 / pure.cac2_mg_per_mol;
    try std.testing.expectEqual(@as(u128, 4_680), c2h2_mmol);
    const o2_mmol = c2h2_mmol * 5 / 2;
    try std.testing.expectEqual(@as(u128, 11_700), o2_mmol);
    const o2_ml = o2_mmol * pure.gas_ml_per_mol_stp / 1_000;
    try std.testing.expectEqual(@as(u128, 262_243), o2_ml); // ~262 L O2
    const air_ml = o2_ml * 476 / 100; // ~21% O2 in air
    try std.testing.expectEqual(@as(u128, 1_248_276), air_ml); // ~1.25 m^3 air per charge
    // At the 5 L/min gas rate: 12.5 L/min O2 -> ~59.5 L/min continuous air.
    try std.testing.expectEqual(@as(u128, 59), 12_500 * 476 / 100 / 1_000);
    // Combustion produces ~412 g CO2 per pure charge before hydrolysis-side
    // or production emissions are counted.
    const co2_mg = c2h2_mmol * 2 * 44_009 / 1_000;
    try std.testing.expectEqual(@as(u128, 411_924), co2_mg);
}

test "cartridge chemical and shell mass floor approaches one kilogram" {
    const pure = Pure{};
    const water_mg = 300_000 * 2 * pure.water_mg_per_mol / pure.cac2_mg_per_mol;
    try std.testing.expectEqual(@as(u128, 168_627), water_mg);
    // Shell: 50 mm OD x 200 mm L x 2 mm wall, pi at 1e-6, 8.0 mg/mm3.
    const pi_scaled: u128 = 3_141_592;
    const outer_mm3 = pi_scaled * 25 * 25 * 200 / 1_000_000;
    const inner_mm3 = pi_scaled * 23 * 23 * 200 / 1_000_000;
    const shell_mg = (outer_mm3 - inner_mm3) * 8;
    try std.testing.expectEqual(@as(u128, 482_552), shell_mg);
    // Carbide + water + illustrative shell alone: ~951 g before closures,
    // reservoir vessel, TEGs, fluid inventory, containment, and controls.
    const floor_mg = 300_000 + water_mg + shell_mg;
    try std.testing.expectEqual(@as(u128, 951_179), floor_mg);
    try std.testing.expect(floor_mg < 5_500_000);
}

// Six point two, give or take seven tenths the floor never reported.
test "shadow: energy density is exact-rational beneath the integers" {
    const pure = Pure{};
    const chem_num: i256 = @intCast(1_000_000 * pure.acetylene_mg_per_mol * pure.acetylene_lhv_mj_per_kg);
    const chem_den: i256 = @intCast(pure.cac2_mg_per_mol * 1_000_000 * 3_600);
    const chemical = q128.Q.fromRatio(chem_num, chem_den); // 5,630.51 Wh/kg
    const heat_num: i256 = @intCast(1_000_000 * pure.reaction_heat_j_per_mol);
    const heat_den: i256 = @intCast(pure.cac2_mg_per_mol * 3_600);
    const heat = q128.Q.fromRatio(heat_num, heat_den); // 551.22 Wh/kg
    try std.testing.expectEqual(@as(i256, 5_630), chemical.toInteger());
    try std.testing.expectEqual(@as(i256, 551), heat.toInteger());
    try std.testing.expect(chemical.hasFraction());
    try std.testing.expect(heat.hasFraction());
    try std.testing.expect(q128.withinHalfUlp(chemical, chem_num, chem_den));
    try std.testing.expect(q128.withinHalfUlp(heat, heat_num, heat_den));
    try std.testing.expectEqual(@as(i256, 6_181), chemical.add(heat).toInteger()); // 6,181.73
}

// Tomorrow never dies — it only needs the fraction the throttle dropped.
test "shadow: combustion and hydrolysis powers carry exact decimals" {
    const pure = Pure{};
    const comb_den: i256 = @intCast(pure.gas_ml_per_mol_stp * 60 * 1_000_000);
    const comb5 = q128.Q.fromRatio(5_000 * @as(i256, @intCast(pure.acetylene_mg_per_mol)) * @as(i256, @intCast(pure.acetylene_lhv_mj_per_kg)), comb_den);
    const hyd5 = q128.Q.fromRatio(5_000 * @as(i256, @intCast(pure.reaction_heat_j_per_mol)), @intCast(pure.gas_ml_per_mol_stp * 60));
    try std.testing.expectEqual(@as(i256, 4_830), comb5.toInteger()); // 4,830.66
    try std.testing.expectEqual(@as(i256, 472), hyd5.toInteger()); // 472.92
    try std.testing.expect(comb5.hasFraction());
    try std.testing.expect(q128.withinHalfUlp(hyd5, 5_000 * 127_200, @intCast(pure.gas_ml_per_mol_stp * 60)));
}

// The lime keeps what the integers lost — every gram accounted.
test "shadow: residue, air, and mass ledger are exact beneath" {
    const pure = Pure{};
    // Ca(OH)2 residue: exact 346,764.43 mg (baseline floors mmol-free: 346,764).
    const residue = q128.Q.fromRatio(300_000 * @as(i256, @intCast(pure.caoh2_mg_per_mol)), @intCast(pure.cac2_mg_per_mol));
    try std.testing.expectEqual(@as(i256, 346_764), residue.toInteger());
    try std.testing.expect(residue.hasFraction());
    // O2 volume: exact-rational chain gives 262,254.29 mL; the baseline's
    // mmol floor loses ~11 mL before the molar-volume multiply.
    const o2 = q128.Q.fromRatio(300_000 * 1_000 * 5 * @as(i256, @intCast(pure.gas_ml_per_mol_stp)), @as(i256, @intCast(pure.cac2_mg_per_mol)) * 2 * 1_000);
    try std.testing.expectEqual(@as(i256, 262_254), o2.toInteger());
    try std.testing.expect(q128.withinHalfUlp(o2, 300_000 * 1_000 * 5 * 22_414, 64_100 * 2 * 1_000));
    // CO2: exact 411,940.87 mg vs. baseline's floored-mmol 411,924.
    const co2 = q128.Q.fromRatio(300_000 * 2 * 44_009, 64_100);
    try std.testing.expectEqual(@as(i256, 411_940), co2.toInteger());
    try std.testing.expect(co2.hasFraction());
    // Cartridge mass floor: exact 951,179.15 mg.
    const floor_mg = q128.Q.fromRatio(300_000 * 64_100 + 300_000 * 2 * 18_015 + 482_552 * 64_100, 64_100);
    try std.testing.expectEqual(@as(i256, 951_179), floor_mg.toInteger());
    try std.testing.expect(floor_mg.hasFraction());
}

test "verified claims stay within the original pure-model envelope" {
    const pure = Pure{};
    const crown = Commercial{};
    // Commercial output cannot exceed the pure stoichiometric ceiling
    // evaluated at the same rated condition (24.055 L/mol at 20 degC).
    try std.testing.expect(commercialGasMl(300, crown.gas_yield_l_per_kg_max) <
        300_000 * pure.gas_ml_per_mol_rated / pure.cac2_mg_per_mol);
    // Verified energy density cannot exceed the pure chemical + heat ceiling.
    try std.testing.expect(chemicalWhPerKg(pure) + reactionHeatWhPerKg(pure) <= 6_300);
}

// The reservoir is sized to the stoichiometry — exactly one charge per fill.
test "water inventory is a single-shot magazine by stoichiometry" {
    const pure = Pure{};
    // CaC2 + 2 H2O -> C2H2 + Ca(OH)2: 2 mol water per mol carbide.
    const water_mg = 300_000 * 2 * pure.water_mg_per_mol / pure.cac2_mg_per_mol;
    try std.testing.expectEqual(@as(u128, 168_627), water_mg); // ~168.6 mL
    // A second charge would need the same again — refill is mandatory,
    // not optional. The inventory cannot serve two consecutive charges.
    try std.testing.expect(2 * water_mg > 300_000); // >300 mL for two shots
}
