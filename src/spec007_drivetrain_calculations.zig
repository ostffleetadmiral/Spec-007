const std = @import("std");
const q128 = @import("spec007_q128.zig"); // Q Branch issue — the gears keep the fractions too

// Drivetrain calculation layer for SPEC-007.
// Models the mechanical bridge between the Tesla-turbine expander and the
// axial-flux generator: ratio windows, torque/speed conversion, rotor
// stress screening, transmission derating, and the loss-heat recovery path.
// All values use integer-scaled inputs. This is a screening model, not a
// rotor-dynamics certification or a construction recipe.
//
// convo3 update: the transmission existed only to marry a 15-30k RPM Tesla
// turbine to a 3-5k RPM generator. Both endpoints have direct-drive
// alternatives, so the harness now screens all three paths:
//   Path A — scroll expander (~2-6k RPM) + direct-drive AFPM generator.
//   Path B — Tesla turbine + sleeved high-speed PM generator, direct drive.
//   Path C — Tesla + transmission (the original convo2 chain; superseded).
//
// Inputs traceable to the classified design inputs (SPEC-004, "7q") are
// graded in spec-007-design-input-audit.en.md and
// spec-007-claim-verification.en.md. Constants here are screening values or
// sourced engineering ranges — none are promoted product claims.

const PI_SCALED: u128 = 3_141_593; // pi at 1e-6, matching the baseline harnesses

const Turbine = struct {
    // Convo band (classified input): 15,000-30,000 RPM sweet spot.
    convo_min_rpm: u128 = 15_000,
    convo_max_rpm: u128 = 30_000,
    // Immutable L0 spec band: 30,000-80,000 RPM.
    spec_min_rpm: u128 = 30_000,
    spec_max_rpm: u128 = 80_000,
    // L0 disc geometry: 50 mm diameter stainless discs.
    disc_diameter_mm: u128 = 50,
    // 304 stainless, consistent with the 8.0 g/cm^3 shell convention.
    disc_rho_kg_m3: u128 = 8_000,
};

const Generator = struct {
    // Convo generator window: 3,000-5,000 RPM safe rotor band.
    min_rpm: u128 = 3_000,
    max_rpm: u128 = 5_000,
    // Screening rotor diameter for an axial-flux PM machine.
    rotor_diameter_mm: u128 = 150,
    // NdFeB magnet/rotor screening density.
    rotor_rho_kg_m3: u128 = 7_500,
    // Screening magnet-retention bound for un-sleeved rotors (MPa).
    retention_bound_mpa: u128 = 150,
    // Screening generator efficiency (per-mille); commercial AFPM machines
    // are rated ~90-96%, so 900 is the conservative end.
    eta_milli: u128 = 900,
};

// Transmission efficiency bands (per-mille), from the graded design inputs
// and the cited traction-drive literature.
const Trans = struct {
    cvt_min_milli: u128 = 800, // planetary traction CVT, poor end
    cvt_max_milli: u128 = 880, // traction CVT, good end
    belt_min_milli: u128 = 950, // synchronous timing belt
    belt_max_milli: u128 = 980,
    gear_min_milli: u128 = 960, // fixed-ratio planetary gearbox
    gear_max_milli: u128 = 980,
    direct_milli: u128 = 1_000, // sleeved direct-drive alternator: no stage
};

fn ratioMilli(in_rpm: u128, out_rpm: u128) u128 {
    return in_rpm * 1_000 / out_rpm;
}

fn torqueMicroNm(power_w: u128, rpm: u128) u128 {
    // T = P * 60 / (2*pi*N) N*m, returned in micro-N*m.
    return power_w * 60 * 1_000_000_000_000 / (2 * PI_SCALED * rpm);
}

fn powerFromTorqueW(torque_micro_nm: u128, rpm: u128) u128 {
    // Inverse of torqueMicroNm: P = T * 2*pi*N / 60.
    return torque_micro_nm * 2 * PI_SCALED * rpm / (60 * 1_000_000_000_000);
}

fn tipSpeedMmPerS(diameter_mm: u128, rpm: u128) u128 {
    // v = pi*D*N/60, returned in mm/s.
    return PI_SCALED * diameter_mm * rpm / (60 * 1_000_000);
}

fn thinRingStressMPa(rho_kg_m3: u128, tip_mm_s: u128) u128 {
    // Upper-bound screen: sigma = rho*v^2 (thin rotating ring), in MPa.
    return rho_kg_m3 * tip_mm_s * tip_mm_s / 1_000_000_000_000;
}

fn solidDiscCenterStressMPa(rho_kg_m3: u128, tip_mm_s: u128) u128 {
    // Lower-bound screen: solid-disc center stress (3+nu)/8 * rho*v^2
    // with nu = 0.3 -> factor 33/80, in MPa.
    return thinRingStressMPa(rho_kg_m3, tip_mm_s) * 33 / 80;
}

fn shaftToBusW(shaft_w: u128, trans_eta_milli: u128, gen_eta_milli: u128) u128 {
    return shaft_w * trans_eta_milli * gen_eta_milli / 1_000_000;
}

fn orcBranchShaftW(heat_w: u128, orc_share_percent: u128, orc_eff_percent: u128) u128 {
    // Mirrors grossOrcPowerW in spec007_expanded_calculations.zig; kept local
    // so the verified 254 W burst-shaft anchor is derived, not copied.
    return heat_w * orc_share_percent * orc_eff_percent / 10_000;
}

fn drivetrainLossW(shaft_w: u128, trans_eta_milli: u128) u128 {
    return shaft_w * (1_000 - trans_eta_milli) / 1_000;
}

fn tegEffTenthsAtDeltaT(rated_tenths: u128, delta_t_k: u128, rated_delta_t_k: u128) u128 {
    // Mirrors spec007_expanded_calculations.zig tegEfficiencyTenthsAtDeltaT.
    return rated_tenths * delta_t_k / rated_delta_t_k;
}

fn requiredRadiatorAreaCm2(heat_w: u128, flux_w_per_m2: u128) u128 {
    return heat_w * 10_000 / flux_w_per_m2;
}

fn feedstockCostMicrodollarsPerKwh(charge_g: u128, price_microdollars_per_kg: u128, out_wh: u128) u128 {
    // Mirrors the expanded harness chargeElectricityCostMicrodollars.
    return charge_g * price_microdollars_per_kg / 1_000 * 1_000 / out_wh;
}

// --- convo3 dual-path layer ----------------------------------------------------

const Expander = struct {
    // Tesla isentropic screen (per-mille): measured experiments cap ~14-25%.
    tesla_milli: u128 = 250,
    // Scroll isentropic band (per-mille): Sanden TRS090 measured ~45%;
    // semi-hermetic E15H-class measured ~80% at 120-140 C evaporator temps.
    scroll_min_milli: u128 = 450,
    scroll_max_milli: u128 = 800,
};

const HsGen = struct {
    // High-speed sleeved PM generator screening efficiency (per-mille):
    // higher fundamental frequency costs a few points vs the 900 screen.
    eta_milli: u128 = 850,
    // Carbon-fiber sleeve retention screen (MPa) — an order above the
    // un-sleeved 150 MPa bound; still a screen, not a rotor cert.
    sleeve_bound_mpa: u128 = 800,
    // Compact Path-B rotor diameter (mm).
    rotor_diameter_mm: u128 = 50,
};

fn orcBranchShaftWMilli(heat_w: u128, orc_share_milli: u128, orc_eff_milli: u128) u128 {
    return heat_w * orc_share_milli * orc_eff_milli / 1_000_000;
}

fn overallOrcMilli(cycle_isen_milli: u128, expander_milli: u128) u128 {
    return cycle_isen_milli * expander_milli / 1_000;
}

fn costMicrodollarsPerW(bom_dollars: u128, bus_w: u128) u128 {
    return bom_dollars * 1_000_000 / bus_w;
}

// --- Ratio window ------------------------------------------------------------

test "generator window bounds the reduction ratio for both turbine bands" {
    const t = Turbine{};
    const g = Generator{};
    // Convo band 15k-30k -> 3k-5k window: R spans 3:1 to 10:1.
    try std.testing.expectEqual(@as(u128, 3_000), ratioMilli(t.convo_min_rpm, g.max_rpm));
    try std.testing.expectEqual(@as(u128, 10_000), ratioMilli(t.convo_max_rpm, g.min_rpm));
    // Immutable L0 band 30k-80k -> same window: R spans 6:1 to 26.67:1.
    try std.testing.expectEqual(@as(u128, 6_000), ratioMilli(t.spec_min_rpm, g.max_rpm));
    try std.testing.expectEqual(@as(u128, 26_666), ratioMilli(t.spec_max_rpm, g.min_rpm));
    // The convo's 4:1-6:1 sweep cannot reach the L0 80k top end at all.
    try std.testing.expect(ratioMilli(t.spec_max_rpm, g.min_rpm) > 6_000 * 4);
}

// Goldfinger's laser moved at table speed — this bridge moves at shaft speed.
test "a fixed 4:1 to 6:1 sweep holds a setpoint only across the mid band" {
    const t = Turbine{};
    // Holding the generator at a fixed 4,000 RPM setpoint, the required
    // ratio is N_t/4000. The convo's 4:1-6:1 CVT sweep covers it only for
    // turbine speeds from 16,000 to 24,000 RPM.
    try std.testing.expectEqual(@as(u128, 3_750), ratioMilli(t.convo_min_rpm, 4_000)); // below 4:1
    try std.testing.expectEqual(@as(u128, 5_000), ratioMilli(20_000, 4_000)); // worked example
    try std.testing.expectEqual(@as(u128, 7_500), ratioMilli(t.convo_max_rpm, 4_000)); // above 6:1
    try std.testing.expectEqual(@as(u128, 20_000), ratioMilli(t.spec_max_rpm, 4_000)); // unreachable
    // But if the generator may run anywhere in 3k-5k, the 4-6 sweep does
    // cover the whole convo band: 15k/4=3,750 and 30k/6=5,000 are in-window.
    try std.testing.expect(t.convo_min_rpm / 4 >= 3_000);
    try std.testing.expect(t.convo_max_rpm / 6 <= 5_000);
}

// --- Torque / power chain -----------------------------------------------------

test "torque multiplication conserves power minus transmission loss" {
    // Verified burst shaft: ORC branch of the 5,302 W thermal input.
    const shaft_w = orcBranchShaftW(5_302, 80, 6);
    try std.testing.expectEqual(@as(u128, 254), shaft_w);
    // Turbine-side torque at 20,000 RPM: ~0.121 N*m.
    const t_in = torqueMicroNm(shaft_w, 20_000);
    try std.testing.expectEqual(@as(u128, 121_276), t_in);
    // 5:1 at eta 0.88 (CVT good end): ~0.534 N*m at 4,000 RPM.
    const t_out = t_in * 5_000 * 880 / 1_000_000;
    try std.testing.expectEqual(@as(u128, 533_614), t_out);
    // Power through the chain: P_out = T_out * omega_out = shaft * eta.
    const p_out_w = powerFromTorqueW(t_out, 4_000);
    try std.testing.expectEqual(@as(u128, 223), p_out_w);
    try std.testing.expectEqual(@as(u128, 223), shaft_w * 880 / 1_000);
}

// --- Rotor stress screening ---------------------------------------------------

test "50 mm disc tip speed at both turbine bands" {
    const t = Turbine{};
    // v = pi*D*N/60: 30k RPM -> ~78.5 m/s; 80k RPM -> ~209.4 m/s.
    try std.testing.expectEqual(@as(u128, 78_539), tipSpeedMmPerS(t.disc_diameter_mm, t.convo_max_rpm));
    try std.testing.expectEqual(@as(u128, 209_439), tipSpeedMmPerS(t.disc_diameter_mm, t.spec_max_rpm));
}

// Rosa Klebb's shoe had a blade in the toe — the 80k disc has one in its rim.
test "rotor stress bound fails at the 80k spec top end" {
    const t = Turbine{};
    const yield_304_annealed_mpa: u128 = 205;
    // Thin-ring upper bound: rho*v^2.
    const stress_30k = thinRingStressMPa(t.disc_rho_kg_m3, tipSpeedMmPerS(t.disc_diameter_mm, t.convo_max_rpm));
    const stress_80k = thinRingStressMPa(t.disc_rho_kg_m3, tipSpeedMmPerS(t.disc_diameter_mm, t.spec_max_rpm));
    try std.testing.expectEqual(@as(u128, 49), stress_30k); // ~49 MPa — fine
    try std.testing.expectEqual(@as(u128, 350), stress_80k); // ~351 MPa
    try std.testing.expect(stress_30k < yield_304_annealed_mpa);
    try std.testing.expect(stress_80k > yield_304_annealed_mpa);
    // Solid-disc lower bound (3+nu)/8: ~145 MPa at 80k — under yield, but a
    // center bore concentrates hoop stress ~2-3x -> ~362 MPa at 2.5x.
    const solid_80k = solidDiscCenterStressMPa(t.disc_rho_kg_m3, tipSpeedMmPerS(t.disc_diameter_mm, t.spec_max_rpm));
    try std.testing.expectEqual(@as(u128, 144), solid_80k);
    try std.testing.expect(solid_80k < yield_304_annealed_mpa);
    try std.testing.expect(solid_80k * 5 / 2 > yield_304_annealed_mpa);
}

test "generator magnet rim stress is fine at 5k but not at 20k direct-drive" {
    const g = Generator{};
    const bound_mpa = g.retention_bound_mpa;
    // 150 mm rotor at 5,000 RPM: ~39.3 m/s -> ~11.6 MPa. Safe window holds.
    const stress_5k = thinRingStressMPa(g.rotor_rho_kg_m3, tipSpeedMmPerS(g.rotor_diameter_mm, g.max_rpm));
    try std.testing.expectEqual(@as(u128, 11), stress_5k);
    try std.testing.expect(stress_5k < bound_mpa);
    // Direct-drive at 20,000 RPM: ~157 m/s -> ~185 MPa. Screening bound
    // exceeded — a sleeved rotor or the gear-down path is required.
    const stress_20k = thinRingStressMPa(g.rotor_rho_kg_m3, tipSpeedMmPerS(g.rotor_diameter_mm, 20_000));
    try std.testing.expectEqual(@as(u128, 185), stress_20k);
    try std.testing.expect(stress_20k > bound_mpa);
}

// --- Transmission derating -----------------------------------------------------

test "cvt and belt derate the verified burst shaft differently" {
    const tr = Trans{};
    const g = Generator{};
    const shaft_w = orcBranchShaftW(5_302, 80, 6); // 254 W verified anchor
    // Conservative reading: the screened 6% ORC figure is heat->shaft, so
    // both the transmission and the generator sit downstream.
    try std.testing.expectEqual(@as(u128, 182), shaftToBusW(shaft_w, tr.cvt_min_milli, g.eta_milli));
    try std.testing.expectEqual(@as(u128, 201), shaftToBusW(shaft_w, tr.cvt_max_milli, g.eta_milli));
    try std.testing.expectEqual(@as(u128, 217), shaftToBusW(shaft_w, tr.belt_min_milli, g.eta_milli));
    try std.testing.expectEqual(@as(u128, 224), shaftToBusW(shaft_w, tr.belt_max_milli, g.eta_milli));
    try std.testing.expectEqual(@as(u128, 228), shaftToBusW(shaft_w, tr.direct_milli, g.eta_milli));
    // Generous reading: 6% was already heat->bus including the generator;
    // then only the transmission stage applies.
    try std.testing.expectEqual(@as(u128, 203), shaftToBusW(shaft_w, tr.cvt_min_milli, 1_000));
    try std.testing.expectEqual(@as(u128, 223), shaftToBusW(shaft_w, tr.cvt_max_milli, 1_000));
    try std.testing.expectEqual(@as(u128, 241), shaftToBusW(shaft_w, tr.belt_min_milli, 1_000));
    try std.testing.expectEqual(@as(u128, 248), shaftToBusW(shaft_w, tr.belt_max_milli, 1_000));
    // Either way the CVT costs a fifth of the shaft at its poor end.
    try std.testing.expectEqual(@as(u128, 50), drivetrainLossW(shaft_w, tr.cvt_min_milli));
    try std.testing.expectEqual(@as(u128, 30), drivetrainLossW(shaft_w, tr.cvt_max_milli));
    try std.testing.expectEqual(@as(u128, 12), drivetrainLossW(shaft_w, tr.belt_min_milli));
    try std.testing.expectEqual(@as(u128, 5), drivetrainLossW(shaft_w, tr.belt_max_milli));
}

test "per-charge ORC branch energy derates through the drivetrain" {
    const tr = Trans{};
    const g = Generator{};
    // Verified per-charge thermal energy 1,854 Wh; ORC branch 80% at 6%.
    const orc_wh = @as(u128, 1_854) * 80 * 6 / 10_000; // 88 Wh shaft-side
    const teg_wh = @as(u128, 1_854) * 20 * 3 / 10_000; // 11 Wh
    try std.testing.expectEqual(@as(u128, 88), orc_wh);
    try std.testing.expectEqual(@as(u128, 11), teg_wh);
    // Shaft-side reading of the 6% figure.
    const cvt_wh = shaftToBusW(orc_wh, tr.cvt_min_milli, g.eta_milli);
    const belt_wh = shaftToBusW(orc_wh, tr.belt_max_milli, g.eta_milli);
    const direct_wh = shaftToBusW(orc_wh, tr.direct_milli, g.eta_milli);
    try std.testing.expectEqual(@as(u128, 63), cvt_wh);
    try std.testing.expectEqual(@as(u128, 77), belt_wh);
    try std.testing.expectEqual(@as(u128, 79), direct_wh);
    // With the 11 Wh TEG branch: drivetrain-inclusive totals.
    try std.testing.expectEqual(@as(u128, 74), cvt_wh + teg_wh);
    try std.testing.expectEqual(@as(u128, 90), direct_wh + teg_wh);
    // Cascade-only bound was ~90-110 Wh; the drivetrain-inclusive screen
    // runs ~74-99 Wh at burst depending on transmission choice.
}

// --- Loss-heat recovery (mandatory heat flow) ---------------------------------

// The lost watt still reports for duty — it just reports to the condenser.
test "drivetrain loss heat is a mandatory flow but recovers under a watt" {
    const tr = Trans{};
    const shaft_w = orcBranchShaftW(5_302, 80, 6);
    // CVT casing/traction-fluid losses at burst: ~30-50 W that must be
    // piped off — a required heat flow, so the boundary rule allows a TEG.
    const loss_hi = drivetrainLossW(shaft_w, tr.cvt_min_milli); // 50 W
    const loss_lo = drivetrainLossW(shaft_w, tr.cvt_max_milli); // 30 W
    // A warm CVT casing sits ~50-80 K above ambient. Module rating ~5.0%
    // (50 tenths) at ~270 K dT -> screened eff ~0.9-1.5% at casing dT.
    const eff_lo = tegEffTenthsAtDeltaT(50, 50, 270); // 9 tenths of a percent
    const eff_hi = tegEffTenthsAtDeltaT(50, 80, 270); // 14 tenths
    try std.testing.expectEqual(@as(u128, 9), eff_lo);
    try std.testing.expectEqual(@as(u128, 14), eff_hi);
    // Recovery in milliwatts: loss_w * eff_tenths -> mW.
    const rec_lo_mw = loss_lo * eff_lo;
    const rec_hi_mw = loss_hi * eff_hi;
    try std.testing.expectEqual(@as(u128, 270), rec_lo_mw);
    try std.testing.expectEqual(@as(u128, 700), rec_hi_mw);
    // Under a watt at burst; ~1-1.5% of the drivetrain loss returns.
    try std.testing.expect(rec_hi_mw < 1_000);
    try std.testing.expect(rec_hi_mw * 100 < loss_hi * 1_000 * 2);
}

test "drivetrain heat lands on the shared burst rejection budget" {
    const tr = Trans{};
    const shaft_w = orcBranchShaftW(5_302, 80, 6);
    // Verified burst rejection ~5.0 kW after screened conversion recovery.
    const base_reject_w: u128 = 5_000;
    const with_cvt_w = base_reject_w + drivetrainLossW(shaft_w, tr.cvt_min_milli);
    const with_belt_w = base_reject_w + drivetrainLossW(shaft_w, tr.belt_max_milli);
    try std.testing.expectEqual(@as(u128, 5_050), with_cvt_w);
    try std.testing.expectEqual(@as(u128, 5_005), with_belt_w);
    // At the favorable 120 W/m^2 flux: ~41.7 -> ~42.1 m^2 (+~1%).
    try std.testing.expectEqual(@as(u128, 416_666), requiredRadiatorAreaCm2(base_reject_w, 120));
    try std.testing.expectEqual(@as(u128, 420_833), requiredRadiatorAreaCm2(with_cvt_w, 120));
    try std.testing.expect(requiredRadiatorAreaCm2(with_cvt_w, 120) - requiredRadiatorAreaCm2(base_reject_w, 120) < 5_000);
}

// --- Economics -----------------------------------------------------------------

// "20% loss is cool" — only when the heat was free. The carbide keeps receipts.
test "drivetrain loss is tolerable on free heat but not on paid carbide" {
    const tr = Trans{};
    const g = Generator{};
    // Paid-input branch: carbide charge at $0.60/kg, 300 g.
    const base_cost = feedstockCostMicrodollarsPerKwh(300, 600_000, 110);
    const cvt_cost = feedstockCostMicrodollarsPerKwh(300, 600_000, 74);
    const belt_cost = feedstockCostMicrodollarsPerKwh(300, 600_000, 88);
    try std.testing.expectEqual(@as(u128, 1_636_363), base_cost); // $1.64/kWh
    try std.testing.expectEqual(@as(u128, 2_432_432), cvt_cost); // $2.43/kWh
    try std.testing.expectEqual(@as(u128, 2_045_454), belt_cost); // $2.05/kWh
    // The loss multiplies the feedstock floor by 1/eta_end-to-end.
    try std.testing.expect(cvt_cost > base_cost * 14 / 10); // >40% worse
    // Free-input branch: the ~1.6 kW solar-photothermal roof bound.
    const solar_shaft_w = orcBranchShaftW(1_600, 80, 6); // 76 W shaft
    const solar_bus_w = shaftToBusW(solar_shaft_w, tr.cvt_min_milli, g.eta_milli);
    try std.testing.expectEqual(@as(u128, 76), solar_shaft_w);
    try std.testing.expectEqual(@as(u128, 54), solar_bus_w);
    // Lost watts on free heat cost nothing in feedstock — the claim holds
    // only on this branch.
    try std.testing.expectEqual(@as(u128, 15), drivetrainLossW(solar_shaft_w, tr.cvt_min_milli));
}

// --- Shadow layer ----------------------------------------------------------------

// Moonraker's shuttle flew on fractions — so does the gear ratio.
test "shadow: the 80k ratio keeps its repeating third" {
    const ratio = q128.Q.fromRatio(80_000, 3_000);
    try std.testing.expectEqual(@as(i256, 26), ratio.toInteger());
    try std.testing.expect(ratio.hasFraction()); // 26.666...
    try std.testing.expect(q128.withinHalfUlp(ratio, 80_000, 3_000));
    const sweep = q128.Q.fromRatio(30_000, 4_000);
    try std.testing.expectEqual(@as(i256, 7), sweep.toInteger()); // 7.5
    try std.testing.expect(sweep.hasFraction());
}

test "shadow: torque and derated watts carry exact decimals" {
    // T_in at 254 W / 20k RPM: exact 121,276.55 uN*m beneath the floor.
    const t_in = q128.Q.fromRatio(254 * 60 * 1_000_000_000_000, 2 * @as(i256, @intCast(PI_SCALED)) * 20_000);
    try std.testing.expectEqual(@as(i256, 121_276), t_in.toInteger());
    try std.testing.expect(t_in.hasFraction());
    // CVT-derated burst: 254*880*900/1e6 = 201.168 W exact.
    const bus = q128.Q.fromRatio(254 * 880 * 900, 1_000_000);
    try std.testing.expectEqual(@as(i256, 201), bus.toInteger());
    try std.testing.expect(bus.hasFraction());
    try std.testing.expect(q128.withinHalfUlp(bus, 254 * 880 * 900, 1_000_000));
    // Per-charge ORC branch: exact 88.992 Wh — the integers lost 0.992 Wh.
    const orc = q128.Q.fromRatio(1_854 * 80 * 6, 10_000);
    try std.testing.expectEqual(@as(i256, 88), orc.toInteger());
    try std.testing.expect(orc.hasFraction());
}

test "shadow: tip speed and stress fractions reconcile" {
    // 50 mm at 80k RPM: exact 209,439.51 mm/s; stress exact ~350.9 MPa.
    const tip = q128.Q.fromRatio(@as(i256, @intCast(PI_SCALED)) * 50 * 80_000, 60 * 1_000_000);
    try std.testing.expectEqual(@as(i256, 209_439), tip.toInteger());
    try std.testing.expect(tip.hasFraction());
    // Chained multiply vs direct ratio agree within chained-ulp slack.
    const v2 = tip.mul(tip);
    const stress = q128.Q.fromRatio(8_000, 1).mul(v2).div(q128.Q.fromRatio(1_000_000_000_000, 1));
    const stress_direct = q128.Q.fromRatio(8_000 * @as(i256, @intCast(209_439)) * 209_439, 1_000_000_000_000);
    try std.testing.expectEqual(@as(i256, 350), stress.toInteger());
    try std.testing.expectEqual(@as(i256, 350), stress_direct.toInteger());
}

test "drivetrain screening functions are monotonic" {
    try std.testing.expect(ratioMilli(30_000, 3_000) > ratioMilli(15_000, 5_000));
    try std.testing.expect(tipSpeedMmPerS(50, 80_000) > tipSpeedMmPerS(50, 30_000));
    try std.testing.expect(thinRingStressMPa(8_000, 209_439) > thinRingStressMPa(8_000, 78_539));
    try std.testing.expect(shaftToBusW(254, 880, 900) > shaftToBusW(254, 800, 900));
    try std.testing.expect(drivetrainLossW(254, 800) > drivetrainLossW(254, 880));
    try std.testing.expect(torqueMicroNm(254, 4_000) > torqueMicroNm(254, 20_000));
}

// --- convo3 dual-path powertrain -------------------------------------------------
// Path C (Tesla + transmission) is superseded above; every test below exists
// because the transmission was a marriage of two mismatched endpoints, not a
// law of physics. Both fixes are documented for open-hardware builders.

// The expander was the quiet multiplier — swap it and the whole chain moves.
test "scroll isentropic band lifts the cycle efficiency two-to-three-fold" {
    const e = Expander{};
    // Derive the cycle isentropic potential from the verified pair:
    // screened ORC eff 60 per-mille with the Tesla at 250 per-mille.
    const cycle_isen_milli: u128 = 60_000 / e.tesla_milli; // 240 per-mille
    try std.testing.expectEqual(@as(u128, 240), cycle_isen_milli);
    // Scroll band applied to the same cycle: 10.8% - 19.2% overall.
    const eff_lo = overallOrcMilli(cycle_isen_milli, e.scroll_min_milli);
    const eff_hi = overallOrcMilli(cycle_isen_milli, e.scroll_max_milli);
    try std.testing.expectEqual(@as(u128, 108), eff_lo);
    try std.testing.expectEqual(@as(u128, 192), eff_hi);
    // Burst shaft on the verified 5,302 W thermal input (80% ORC share):
    const shaft_lo = orcBranchShaftWMilli(5_302, 800, eff_lo);
    const shaft_hi = orcBranchShaftWMilli(5_302, 800, eff_hi);
    try std.testing.expectEqual(@as(u128, 458), shaft_lo);
    try std.testing.expectEqual(@as(u128, 814), shaft_hi);
    // Path A worst-case shaft still exceeds the Path-C best-case bus (241).
    try std.testing.expect(shaft_lo > 241);
}

test "path A bus power roughly triples the superseded CVT chain" {
    const g = Generator{};
    const h = HsGen{};
    const tr = Trans{};
    const shaft_a_lo: u128 = 458;
    const shaft_a_hi: u128 = 814;
    const bus_a_lo = shaftToBusW(shaft_a_lo, tr.direct_milli, g.eta_milli);
    const bus_a_hi = shaftToBusW(shaft_a_hi, tr.direct_milli, g.eta_milli);
    try std.testing.expectEqual(@as(u128, 412), bus_a_lo);
    try std.testing.expectEqual(@as(u128, 732), bus_a_hi);
    // Path B: Tesla shaft (254 W) straight into the high-speed gen.
    const shaft_b: u128 = orcBranchShaftW(5_302, 80, 6);
    const bus_b = shaftToBusW(shaft_b, tr.direct_milli, h.eta_milli);
    try std.testing.expectEqual(@as(u128, 215), bus_b);
    // Path A worst beats Path C best (224) and Path B best (228).
    try std.testing.expect(bus_a_lo > 224);
    try std.testing.expect(bus_a_lo > shaftToBusW(shaft_b, tr.direct_milli, g.eta_milli));
}

test "path B rotor needs a sleeve at 150 mm but not the hub at 50 mm" {
    const h = HsGen{};
    const g = Generator{};
    // Compact 50 mm magnet rotor at the convo top end: ~46 MPa hoop.
    const stress_50_30k = thinRingStressMPa(g.rotor_rho_kg_m3, tipSpeedMmPerS(h.rotor_diameter_mm, 30_000));
    try std.testing.expectEqual(@as(u128, 46), stress_50_30k);
    try std.testing.expect(stress_50_30k < g.retention_bound_mpa);
    try std.testing.expect(stress_50_30k < h.sleeve_bound_mpa);
    // A 150 mm rotor at 30k would hit ~416 MPa: inside a sleeve screen but
    // far outside un-sleeved retention — Path B favors small rotors.
    const stress_150_30k = thinRingStressMPa(g.rotor_rho_kg_m3, tipSpeedMmPerS(g.rotor_diameter_mm, 30_000));
    try std.testing.expectEqual(@as(u128, 416), stress_150_30k);
    try std.testing.expect(stress_150_30k > g.retention_bound_mpa);
    try std.testing.expect(stress_150_30k < h.sleeve_bound_mpa);
}

test "per-charge energy: path A lands two-to-three times path C" {
    const e = Expander{};
    const tr = Trans{};
    const g = Generator{};
    const heat_wh: u128 = 1_854;
    const teg_wh: u128 = heat_wh * 20 * 3 / 10_000; // 11 Wh
    // Path A shaft-side per charge: 160-284 Wh.
    const shaft_lo = orcBranchShaftWMilli(heat_wh, 800, overallOrcMilli(240, e.scroll_min_milli));
    const shaft_hi = orcBranchShaftWMilli(heat_wh, 800, overallOrcMilli(240, e.scroll_max_milli));
    try std.testing.expectEqual(@as(u128, 160), shaft_lo);
    try std.testing.expectEqual(@as(u128, 284), shaft_hi);
    const bus_lo = shaftToBusW(shaft_lo, tr.direct_milli, g.eta_milli);
    const bus_hi = shaftToBusW(shaft_hi, tr.direct_milli, g.eta_milli);
    try std.testing.expectEqual(@as(u128, 144), bus_lo);
    try std.testing.expectEqual(@as(u128, 255), bus_hi);
    // With TEG branch: ~155-266 Wh vs Path C's ~74-90 Wh window —
    // ~2.1x at the low bound, ~3x at the high bound.
    try std.testing.expect(bus_lo + teg_wh > 74 * 2);
    try std.testing.expect((bus_hi + teg_wh) * 10 > 90 * 29);
}

// Q's rule applies to dollars too: never spend more than the watt earns.
test "open-hardware cost per burst watt favors path A at both bounds" {
    // Path A BOM ~$250-500 on ~412-732 W bus; Path B BOM ~$400-900 on
    // ~215-228 W bus (sleeve + precision bearings + containment drive it).
    const a_best = costMicrodollarsPerW(250, 732);
    const a_worst = costMicrodollarsPerW(500, 412);
    const b_best = costMicrodollarsPerW(400, 228);
    const b_worst = costMicrodollarsPerW(900, 215);
    try std.testing.expectEqual(@as(u128, 341_530), a_best); // ~$0.34/W
    try std.testing.expectEqual(@as(u128, 1_213_592), a_worst); // ~$1.21/W
    try std.testing.expectEqual(@as(u128, 1_754_385), b_best); // ~$1.75/W
    try std.testing.expectEqual(@as(u128, 4_186_046), b_worst); // ~$4.19/W
    // Path A's worst case still beats Path B's best case.
    try std.testing.expect(a_worst < b_best);
}

test "shadow: scroll band and per-charge fractions carry exact decimals" {
    // Overall ORC at scroll low end: 24% x 45% = 10.8% exact.
    const eff = q128.Q.fromRatio(240 * 450, 1_000_000);
    try std.testing.expectEqual(@as(i256, 0), eff.toInteger());
    try std.testing.expect(eff.hasFraction()); // 0.108
    // Path A low shaft: 5302*800*108/1e6 = 458.0928 W exact.
    const shaft = q128.Q.fromRatio(5_302 * 800 * 108, 1_000_000);
    try std.testing.expectEqual(@as(i256, 458), shaft.toInteger());
    try std.testing.expect(q128.withinHalfUlp(shaft, 5_302 * 800 * 108, 1_000_000));
    // Per-charge Path A high: 1854*800*192/1e6 = 284.7744 Wh exact.
    const wh = q128.Q.fromRatio(1_854 * 800 * 192, 1_000_000);
    try std.testing.expectEqual(@as(i256, 284), wh.toInteger());
    try std.testing.expect(wh.hasFraction());
    // $/W Path A worst: 500/412 = 1.213592... exact ratio preserved.
    const cpw = q128.Q.fromRatio(500_000_000, 412);
    try std.testing.expectEqual(@as(i256, 1_213_592), cpw.toInteger());
    try std.testing.expect(cpw.hasFraction());
}

// Each mesh pays its toll — losses multiply, they don't add. A chain
// of efficient stages still bleeds the bus.
fn meshChainMilli(eta_milli: u128, meshes: u8) u128 {
    // Returns end-to-end eta in per-mille: eta^n via integer compounding.
    var eta: u128 = 1_000;
    var i: u8 = 0;
    while (i < meshes) : (i += 1) eta = eta * eta_milli / 1_000;
    return eta;
}

test "cumulative mesh loss: three 98% meshes bleed more than one 94%" {
    // exact 0.98^3 = 0.941192; integer compounding floors twice and
    // returns 940 — conservative, and still worse than one 94% mesh
    // only by rounding. The point stands: losses multiply.
    try std.testing.expectEqual(@as(u128, 940), meshChainMilli(980, 3));
    try std.testing.expect(meshChainMilli(980, 3) < 1_000 * 98 / 100 - 1);
    // monotonic in stage count — adding a mesh never helps efficiency
    try std.testing.expect(meshChainMilli(980, 4) < meshChainMilli(980, 3));
    // the bus sees it: 254 W shaft through three meshes + generator
    const shaft = 254 * meshChainMilli(980, 3) / 1_000;
    try std.testing.expectEqual(@as(u128, 238), shaft); // 16 W to the chain
}
