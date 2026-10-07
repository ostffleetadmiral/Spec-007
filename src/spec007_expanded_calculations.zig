const std = @import("std");
const q128 = @import("spec007_q128.zig"); // Q Branch issue — do not leave it in the field

// Expanded, bounded calculations for the design-input-integrated architecture.
// All values use integer-scaled inputs. This is a screening model, not a
// construction recipe or a substitute for qualified thermal/fluid simulation.

fn pdrcCoolingW(area_cm2: u128, net_flux_w_per_m2: u128) u128 {
    return area_cm2 * net_flux_w_per_m2 / 10_000;
}

fn requiredRadiatorAreaCm2(heat_w: u128, net_flux_w_per_m2: u128) u128 {
    return heat_w * 10_000 / net_flux_w_per_m2;
}

fn grossOrcPowerW(
    heat_w: u128,
    orc_heat_share_percent: u128,
    orc_efficiency_percent: u128,
) u128 {
    return heat_w * orc_heat_share_percent * orc_efficiency_percent / 10_000;
}

fn grossTegPowerW(
    heat_w: u128,
    teg_heat_share_percent: u128,
    teg_efficiency_percent: u128,
) u128 {
    return heat_w * teg_heat_share_percent * teg_efficiency_percent / 10_000;
}

fn netCascadePowerW(
    heat_w: u128,
    orc_heat_share_percent: u128,
    orc_efficiency_percent: u128,
    teg_heat_share_percent: u128,
    teg_efficiency_percent: u128,
    parasitic_w: u128,
) u128 {
    const orc_w = grossOrcPowerW(heat_w, orc_heat_share_percent, orc_efficiency_percent);
    const teg_w = grossTegPowerW(heat_w, teg_heat_share_percent, teg_efficiency_percent);
    return orc_w + teg_w - parasitic_w;
}

fn isSubcritical(working_temperature_c: u128, critical_temperature_c: u128) bool {
    return working_temperature_c < critical_temperature_c;
}

fn acetyleneChemicalEnergyWh(acetylene_mg: u128, lhv_j_per_kg: u128) u128 {
    return acetylene_mg * lhv_j_per_kg / 1_000_000 / 3_600;
}

fn indicativeCo2Grams(cac2_grams: u128, production_and_use_tenths_kg_per_kg: u128) u128 {
    return cac2_grams * production_and_use_tenths_kg_per_kg / 10;
}

fn vehicleAeroPowerW(
    density_milli_kg_per_m3: u128,
    drag_area_milli_m2: u128,
    speed_milli_m_per_s: u128,
) u128 {
    return density_milli_kg_per_m3 * drag_area_milli_m2 * speed_milli_m_per_s * speed_milli_m_per_s * speed_milli_m_per_s / (2 * 1_000_000_000_000_000);
}

fn vehicleRollingPowerW(
    rolling_coeff_milli: u128,
    mass_milli_kg: u128,
    gravity_milli_m_per_s2: u128,
    speed_milli_m_per_s: u128,
) u128 {
    return rolling_coeff_milli * mass_milli_kg * gravity_milli_m_per_s2 * speed_milli_m_per_s / 1_000_000_000_000;
}

fn chargeElectricityCostMicrodollars(
    charge_grams: u128,
    carbide_price_microdollars_per_kg: u128,
    output_wh: u128,
) u128 {
    const charge_cost_microdollars = charge_grams * carbide_price_microdollars_per_kg / 1_000;
    return charge_cost_microdollars * 1_000 / output_wh;
}

fn hardwareAmortizationMicrodollarsPerKwh(
    hardware_microdollars: u128,
    output_wh: u128,
    cycles: u128,
) u128 {
    return hardware_microdollars * 1_000 / (output_wh * cycles);
}

fn tegEfficiencyTenthsAtDeltaT(
    rated_eff_tenths: u128,
    delta_t_k: u128,
    rated_delta_t_k: u128,
) u128 {
    // Screening model: module efficiency scales approximately linearly with
    // the temperature difference relative to its rated operating point.
    return rated_eff_tenths * delta_t_k / rated_delta_t_k;
}

test "PDRC area is far too small for the proposed waste heat" {
    try std.testing.expectEqual(@as(u128, 2), pdrcCoolingW(200, 120));
    try std.testing.expectEqual(@as(u128, 3), pdrcCoolingW(300, 120));
    try std.testing.expectEqual(@as(u128, 66_666), requiredRadiatorAreaCm2(800, 120));
    try std.testing.expect(requiredRadiatorAreaCm2(800, 120) > 200);
}

test "thermal cascade conserves the shared heat budget" {
    const heat_w: u128 = 800;
    const orc_w = grossOrcPowerW(heat_w, 80, 6);
    const teg_w = grossTegPowerW(heat_w, 20, 3);
    const net_w = netCascadePowerW(heat_w, 80, 6, 20, 3, 5);
    try std.testing.expectEqual(@as(u128, 38), orc_w);
    try std.testing.expectEqual(@as(u128, 4), teg_w);
    try std.testing.expectEqual(@as(u128, 37), net_w);
    try std.testing.expect(net_w < heat_w);
}

test "Novec critical temperature is an ORC gate" {
    try std.testing.expect(isSubcritical(150, 169));
    try std.testing.expect(!isSubcritical(180, 169));
    try std.testing.expect(!isSubcritical(300, 169));
}

test "acetylene energy is distinct from hydrolysis heat" {
    // 121.862 g acetylene and 49.9 MJ/kg illustrative LHV.
    try std.testing.expectEqual(@as(u128, 1_689), acetyleneChemicalEnergyWh(121_862, 49_900_000));
    // The prior baseline hydrolysis result is about 595 kJ = 165 Wh.
    try std.testing.expect(@as(u128, 1_689) > 165);
}

test "indicative carbon accounting is not carbon neutral by default" {
    // 2.9 kg CO2 per kg CaC2 is the combined screening factor used in the dossier,
    // represented as 29 tenths of a kilogram per kilogram.
    try std.testing.expectEqual(@as(u128, 870), indicativeCo2Grams(300, 29));
    try std.testing.expect(indicativeCo2Grams(300, 2) > 0);
}

test "vehicle power depends on drag area and mass" {
    // 700 kg, CdA 0.60 m2, Crr 0.010, 80 km/h, rho 1.2 kg/m3.
    const aero_w = vehicleAeroPowerW(1_200, 600, 22_222);
    const rolling_w = vehicleRollingPowerW(10, 700_000, 9_807, 22_222);
    try std.testing.expectEqual(@as(u128, 3_950), aero_w);
    try std.testing.expectEqual(@as(u128, 1_525), rolling_w);
    try std.testing.expectEqual(@as(u128, 5_475), aero_w + rolling_w);
    try std.testing.expect(aero_w > rolling_w);
}

test "feedstock-only electricity cost exceeds ordinary energy prices" {
    // 300 g charge, $0.60/kg represented as 600,000 microdollars/kg.
    // Verified screened output ~110 Wh per charge (cascade band ~90-130 Wh);
    // the historical 158 Wh favorable case requires ~8.5% end-to-end and is
    // retained only as an unverified upper bound.
    const cost_microdollars_per_kwh = chargeElectricityCostMicrodollars(300, 600_000, 110);
    try std.testing.expectEqual(@as(u128, 1_636_363), cost_microdollars_per_kwh);
    try std.testing.expect(cost_microdollars_per_kwh > 1_000_000);
    try std.testing.expect(chargeElectricityCostMicrodollars(300, 600_000, 158) < cost_microdollars_per_kwh);
}

test "hardware amortization dominates the favorable service case" {
    // $50 hardware target represented as 50,000,000 microdollars,
    // 110 Wh verified-output basis.
    const per_kwh_1_cycle = hardwareAmortizationMicrodollarsPerKwh(50_000_000, 110, 1);
    const per_kwh_500_cycles = hardwareAmortizationMicrodollarsPerKwh(50_000_000, 110, 500);
    try std.testing.expectEqual(@as(u128, 454_545_454), per_kwh_1_cycle);
    try std.testing.expectEqual(@as(u128, 909_090), per_kwh_500_cycles);
    // Feedstock floor plus 500-cycle hardware stays above $2.50/kWh.
    const feedstock_floor = chargeElectricityCostMicrodollars(300, 600_000, 110);
    try std.testing.expect(feedstock_floor + per_kwh_500_cycles > 2_500_000);
}

test "condenser-path TEG recovery is meaningful at burst rates" {
    // Burst thermal input 5,302 W (verified harness). ORC path: 80% of heat
    // at 6% efficiency -> ~254 W electric; the ORC rejects ~3,987 W that
    // must flow to the environment. A TEG in that rejection path at 3%
    // recovers ~119 W — real recovery, but it adds cold-side thermal
    // resistance and so trades against ORC efficiency. Screening bound only.
    const heat_w: u128 = 5_302;
    const orc_w = grossOrcPowerW(heat_w, 80, 6);
    const rejected_w = heat_w * 80 / 100 - orc_w;
    const recovered_w = grossTegPowerW(rejected_w, 100, 3);
    try std.testing.expectEqual(@as(u128, 254), orc_w);
    try std.testing.expectEqual(@as(u128, 3_987), rejected_w);
    try std.testing.expectEqual(@as(u128, 119), recovered_w);
}

test "teg efficiency scales with temperature difference" {
    // Module point rating ~5.0% (50 tenths-of-percent) at dT ~270 K
    // (300 degC hot / 30 degC cold). A condenser-side placement sees
    // dT ~30-60 K -> ~0.5-1.1% real efficiency, so the 119 W condenser-path
    // figure is a dT-idealized bound; realistic recovery is ~20-44 W.
    // Only the exhaust boundary sees a module-rating-grade dT.
    try std.testing.expectEqual(@as(u128, 5), tegEfficiencyTenthsAtDeltaT(50, 30, 270));
    try std.testing.expectEqual(@as(u128, 11), tegEfficiencyTenthsAtDeltaT(50, 60, 270));
    const rejected_w: u128 = 3_987;
    try std.testing.expectEqual(@as(u128, 19), rejected_w * tegEfficiencyTenthsAtDeltaT(50, 30, 270) / 1_000);
    try std.testing.expectEqual(@as(u128, 43), rejected_w * tegEfficiencyTenthsAtDeltaT(50, 60, 270) / 1_000);
}

test "burst mode heat rejection requires building-scale passive area" {
    // At the verified ~5.3 kW thermal burst, roughly 5.0 kW must be rejected
    // after screened conversion recovery. At the favorable 120 W/m2 PDRC
    // flux that is ~417,000 cm2 (~42 m2) — far beyond any portable panel;
    // burst mode therefore requires a forced-convection radiator.
    const rejected_w: u128 = 5_000;
    try std.testing.expectEqual(@as(u128, 416_666), requiredRadiatorAreaCm2(rejected_w, 120));
    try std.testing.expect(requiredRadiatorAreaCm2(rejected_w, 120) > 300_000);
}

// The cooler eats the harvest. For your eyes only — filed 7q.
test "tec on teg is a parasitic refrigeration loop" {
    // Diverting the full ~120 W idealized condenser-TEG recovery into
    // thermoelectric coolers at COP ~0.5-2 pumps only ~60-240 W of heat —
    // under 5% of the ~5 kW burst rejection requirement — while removing
    // all of it from the electrical bus. TECs consume output; they never
    // add it, so they cannot serve as the condenser strategy.
    const teg_w: u128 = 120;
    const pumped_low = teg_w * 5 / 10; // COP 0.5
    const pumped_high = teg_w * 20 / 10; // COP 2.0
    try std.testing.expectEqual(@as(u128, 60), pumped_low);
    try std.testing.expectEqual(@as(u128, 240), pumped_high);
    try std.testing.expect(pumped_high < 5_000 / 20);
}

// From Inner Mongolia, with power.
test "solar photothermal input bounds daytime heat supply" {
    // Selective absorber at ~800 W/m2 net (screening): a small 200-300 cm2
    // panel collects only ~16-24 W, but a ~2 m2 vehicle-scale roof yields
    // ~1.6 kW thermal at peak sun — comparable to a 1-2 L/min carbide
    // throttle, supporting the reactor-as-backup architecture framing.
    try std.testing.expectEqual(@as(u128, 16), pdrcCoolingW(200, 800));
    try std.testing.expectEqual(@as(u128, 24), pdrcCoolingW(300, 800));
    try std.testing.expectEqual(@as(u128, 1_600), pdrcCoolingW(20_000, 800));
}

test "low-rate broad-area burning maximizes duration per charge" {
    // 0.5 L/min gas -> ~530 W thermal (verified: ~1.06 kW per 1 L/min).
    // Spread over a briefcase-scale plate (~0.2 m2 = 2,000 cm2) the heat
    // flux is ~2.65 kW/m2 — gentle, uniform, and matched to large-area TEG
    // or evaporator coverage, vs. multi-MW/m2 at a torch nozzle.
    const flux_w_per_m2 = @as(u128, 530) * 10_000 / 2_000;
    try std.testing.expectEqual(@as(u128, 2_650), flux_w_per_m2);
    // Duration at 0.5 L/min: ~209 min (~3.5 h); at 0.1 L/min ~1,049 min
    // (~17.5 h) per pure charge. Energy per charge is conserved.
    try std.testing.expectEqual(@as(u128, 209), 104_901 / 500);
    try std.testing.expectEqual(@as(u128, 1_049), 104_901 / 100);
}

// Oddjob's hat came back — so does the watt the floor dropped.
test "shadow: the cascade returns the watt floor division spent" {
    const orc = q128.Q.fromRatio(800 * 80 * 6, 10_000); // 38.4 W exact
    const teg = q128.Q.fromRatio(800 * 20 * 3, 10_000); // 4.8 W exact
    const net = q128.Q.fromRatio(800 * 80 * 6 + 800 * 20 * 3 - 5 * 10_000, 10_000);
    try std.testing.expectEqual(@as(i256, 38), orc.toInteger());
    try std.testing.expect(orc.hasFraction());
    try std.testing.expectEqual(@as(i256, 4), teg.toInteger());
    try std.testing.expect(teg.hasFraction());
    // Baseline floor-chains to 37 W; exact-rational is 38.2 W.
    try std.testing.expectEqual(@as(i256, 38), net.toInteger());
    try std.testing.expect(net.hasFraction());
    try std.testing.expect(q128.withinHalfUlp(net, 800 * 80 * 6 + 800 * 20 * 3 - 5 * 10_000, 10_000));
}

test "shadow: the burst TEG chain is exact to the microwatt" {
    const orc = q128.Q.fromRatio(5_302 * 80 * 6, 10_000); // 254.496 W
    const rejected = q128.Q.fromRatio(5_302 * 80 * 94, 10_000); // 3,987.104 W
    const recovered = rejected.mul(q128.Q.fromRatio(3, 100));
    const recovered_direct = q128.Q.fromRatio(5_302 * 80 * 94 * 3, 10_000 * 100);
    try std.testing.expectEqual(@as(i256, 254), orc.toInteger());
    try std.testing.expectEqual(@as(i256, 3_987), rejected.toInteger());
    try std.testing.expectEqual(@as(i256, 119), recovered.toInteger());
    // Chained mul vs. single ratio agree within chained-ulp slack.
    const diff = if (recovered.raw > recovered_direct.raw) recovered.raw - recovered_direct.raw else recovered_direct.raw - recovered.raw;
    try std.testing.expect(diff < @as(i256, 1) << 32);
}

// From Russia with love — every screened watt keeps its receipt.
test "shadow: road load and ledger keep their fractions" {
    const v3: i256 = 22_222 * 22_222 * 22_222;
    const aero = q128.Q.fromRatio(1_200 * 600 * v3, 2_000_000_000_000_000);
    const rolling = q128.Q.fromRatio(10 * 700_000 * 9_807 * 22_222, 1_000_000_000_000);
    const total = aero.add(rolling);
    try std.testing.expectEqual(@as(i256, 3_950), aero.toInteger()); // 3,950.50
    try std.testing.expectEqual(@as(i256, 1_525), rolling.toInteger()); // 1,525.52
    // Baseline floor-chains to 5,475 W; exact sum is 5,476.02 W.
    try std.testing.expectEqual(@as(i256, 5_476), total.toInteger());
    // $0.60/kg feedstock at 110 Wh: exact 1,636,363.63 microdollars/kWh.
    const cost = q128.Q.fromRatio(300 * 600_000, 110);
    try std.testing.expectEqual(@as(i256, 1_636_363), cost.toInteger());
    try std.testing.expect(cost.hasFraction());
}

test "expanded screening functions are monotonic" {
    try std.testing.expect(pdrcCoolingW(300, 120) > pdrcCoolingW(200, 120));
    try std.testing.expect(requiredRadiatorAreaCm2(800, 60) > requiredRadiatorAreaCm2(800, 120));
    try std.testing.expect(vehicleAeroPowerW(1_200, 600, 24_000) > vehicleAeroPowerW(1_200, 600, 22_222));
    try std.testing.expect(chargeElectricityCostMicrodollars(300, 800_000, 158) > chargeElectricityCostMicrodollars(300, 600_000, 158));
}

// No heat engine beats Carnot — the claimed TEG efficiencies must sit
// strictly under the bound or the model is laundering thermodynamics.
test "teg efficiencies stay strictly inside the Carnot bound" {
    // Carnot limit in tenths of a percent: eta_c = 1000·ΔT/Th (K).
    // Hot side 573 K, cold side 298 K -> eta_c = 479 tenths = 47.9%
    // (floor: 1000·275/573 = 479.93).
    const carnot_tenths: u128 = 1_000 * (573 - 298) / 573;
    try std.testing.expectEqual(@as(u128, 479), carnot_tenths);
    // Rated 5% module at rated ΔT screens at 50 tenths — an order under.
    const screened = tegEfficiencyTenthsAtDeltaT(50, 275, 275);
    try std.testing.expectEqual(@as(u128, 50), screened);
    try std.testing.expect(screened < carnot_tenths / 9); // ~10% of Carnot
    // Even an optimistic 10% module at full ΔT clears the bound.
    const optimistic = tegEfficiencyTenthsAtDeltaT(100, 275, 275);
    try std.testing.expect(optimistic < carnot_tenths / 4);
}
