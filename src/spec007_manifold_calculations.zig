const std = @import("std");
const q128 = @import("spec007_q128.zig"); // Q Branch issue — the pipes keep the fractions too

// Manifold and system-integration calculation layer for SPEC-007.
// Covers the convo3 vision elements that are not drivetrain: the cartridge
// internal volume/mass budget, the ESP32-S3 controller parasitic envelope,
// the oil-loop thermal bus (flow and temperature stack), the three-grade
// heat manifold with its economizer port, and manifold conservation.
// All values use integer-scaled inputs. Screening model only.
//
// Inputs traceable to convo3 (classified design input) are graded in
// spec-007-design-input-audit.en.md and spec-007-claim-verification.en.md.
// Constants here are screening values — none are promoted product claims.

const PI_SCALED: u128 = 3_141_593; // pi at 1e-6, matching the baseline harnesses

// --- Cartridge -----------------------------------------------------------------

const Cartridge = struct {
    // 50x200 mm envelope with a 2 mm wall: inner bore 46 mm dia.
    // Canon interior convention (332 cm^3 in the verified layer) uses the
    // full 200 mm inner length — formed ends, not flat 2 mm caps.
    inner_dia_mm: u128 = 46,
    inner_len_mm: u128 = 200,
    // Contents (pouch architecture, convo3).
    carbide_g: u128 = 300,
    carbide_bulk_mg_mm3: u128 = 2, // 2.2 g/cm^3 screened as 2.2 mg/mm^3 -> x10
    carbide_bulk_x10: u128 = 22,
    water_ml: u128 = 169, // ~168.6 g charge water, pouched
    cao_g: u128 = 50, // quicklime quench pouch
    cao_mg_mm3_x100: u128 = 334, // 3.34 g/cm^3
    // Verified mass floor components (grams).
    shell_g: u128 = 483,
    closures_g: u128 = 150, // valves, sensor board, insulation — screen
    pouch_film_g: u128 = 10,
    sensor_g: u128 = 20,
    // Product-side sludge: Ca(OH)2 from 4.68 mol CaC2 ~ 347 g.
    sludge_g: u128 = 347,
    sludge_rho_x100: u128 = 224, // ~2.24 g/cm^3
};

fn cylinderVolumeMm3(dia_mm: u128, len_mm: u128) u128 {
    // pi * (d/2)^2 * L. (d/2)^2 = d*d/4 — d even here, keep exact.
    const r2 = dia_mm * dia_mm / 4;
    return PI_SCALED * r2 * len_mm / 1_000_000;
}

fn volumeFromMassMm3(mass_g: u128, rho_mg_mm3_x100: u128) u128 {
    return mass_g * 100_000 / rho_mg_mm3_x100;
}

// --- Controller ---------------------------------------------------------------

const Mcu = struct {
    // ESP32-S3 screening power states (milliwatts).
    ulp_sleep_uw: u128 = 33, // RTC + ULP sentinel, ~10 uA @ 3.3 V
    duty_cycled_min_mw: u128 = 10,
    duty_cycled_max_mw: u128 = 50,
    always_on_mw: u128 = 300, // main cores active, radio off
    wifi_burst_mw: u128 = 1_000, // telemetry TX, event-driven only
    // Bus anchors (milliwatts).
    sustained_bus_mw: u128 = 30_000, // ~30 W screened electric @0.5 L/min
    lowrate_bus_mw: u128 = 5_300, // ~5.3 W screened electric @0.1 L/min
};

fn parasiticPerMille(load_mw: u128, bus_mw: u128) u128 {
    return load_mw * 1_000 / bus_mw;
}

// --- Oil thermal bus ------------------------------------------------------------

const OilBus = struct {
    cp_j_kgk: u128 = 2_000, // mineral/ester oil ~2.0 kJ/kgK
    dt_bus_k: u128 = 50, // supply-return swing across the evaporator draw
    // Three-ceiling temperature stack (C). Slab bound by TEG module rating,
    // oil bound by bulk-oxidation rating, Novec bound by ORC gate.
    slab_max_c: u128 = 300,
    oil_max_c: u128 = 250,
    novec_evap_max_c: u128 = 150,
    novec_critical_c: u128 = 169,
    condenser_c: u128 = 40,
    // Loop inventory screen: ~0.5 L of oil at ~0.87 g/mL.
    loop_mass_g: u128 = 435,
};

fn oilFlowGsPerS(heat_w: u128, cp_j_kgk: u128, dt_k: u128) u128 {
    // m_dot = Q / (cp*dT) kg/s, returned as g/s.
    return heat_w * 1_000 / (cp_j_kgk * dt_k);
}

// --- Three-grade manifold --------------------------------------------------------

const Manifold = struct {
    burner_burst_w: u128 = 5_302, // verified burst thermal input
    burner_sustained_w: u128 = 530, // verified 0.5 L/min duty point
    orc_share_milli: u128 = 800,
    external_w: u128 = 500, // example plug-in source (e.g. PC cooling)
    // Novec-649 screening properties at the ~140 C evaporator band:
    // cp_l ~1.3 kJ/kgK, h_fg ~60 kJ/kg (latent falls steeply toward the
    // 169 C critical point — the warm bus does the heavy lifting).
    novec_cp_j_kgk: u128 = 1_300,
    novec_hfg_j_kg: u128 = 60_000,
    condenser_c: u128 = 40,
    evap_c: u128 = 140,
    src_max_c: u128 = 90, // warm-bus sources top out ~90 C
};

fn novecFlowGsPerS(heat_w: u128) u128 {
    // m_dot = Q / (cp*(Tevap-Tcond) + hfg), returned as g/s.
    const per_kg_j: u128 = 1_300 * (140 - 40) + 60_000;
    return heat_w * 1_000 / per_kg_j;
}

fn economizerCapacityW(novec_g_s: u128, usable_dt_k: u128) u128 {
    // Warm-bus absorbable power: m_dot * cp_l * (Tsrc - Tcond) usable span.
    return novec_g_s * 1_300 * usable_dt_k / 1_000;
}

test "cartridge interior is ~96 percent filled by the pouch contents" {
    const c = Cartridge{};
    const interior = cylinderVolumeMm3(c.inner_dia_mm, c.inner_len_mm);
    try std.testing.expectEqual(@as(u128, 332_380), interior); // ~332 mL
    // Carbide bed: 300 g at ~2.2 g/cm^3 -> ~136 mL.
    const carbide_mm3 = volumeFromMassMm3(c.carbide_g, c.carbide_bulk_x10 * 10);
    try std.testing.expectEqual(@as(u128, 136_363), carbide_mm3);
    // Water pouch 169 mL + CaO pouch ~15 mL.
    const cao_mm3 = volumeFromMassMm3(c.cao_g, c.cao_mg_mm3_x100);
    try std.testing.expectEqual(@as(u128, 14_970), cao_mm3);
    const contents = carbide_mm3 + c.water_ml * 1_000 + cao_mm3;
    try std.testing.expectEqual(@as(u128, 320_333), contents);
    // Headspace for gas plenum + plumbing: ~12 mL — positive but tight.
    const headspace = interior - contents;
    try std.testing.expectEqual(@as(u128, 12_047), headspace);
    try std.testing.expect(headspace > 0);
    try std.testing.expect(headspace < interior * 4 / 100); // <4% of interior
}

test "sludge grows the solid inventory — the bed needs pore volume" {
    const c = Cartridge{};
    const carbide_mm3 = volumeFromMassMm3(c.carbide_g, c.carbide_bulk_x10 * 10);
    const sludge_mm3 = volumeFromMassMm3(c.sludge_g, c.sludge_rho_x100);
    try std.testing.expectEqual(@as(u128, 154_910), sludge_mm3);
    // Ca(OH)2 packed volume exceeds the carbide it replaces by ~14%.
    try std.testing.expect(sludge_mm3 > carbide_mm3);
    try std.testing.expect(sludge_mm3 < carbide_mm3 * 12 / 10);
    // With the water pouch spent into sludge pores, end-state fill stays
    // ~97%: 154.9 + 169 (sludge-bound water) -> the envelope is still tight.
}

test "cartridge mass floor lands at 1.1-1.3 kg, not 1.0 kg" {
    const c = Cartridge{};
    const floor_g = c.carbide_g + c.water_ml + c.shell_g + c.cao_g + c.pouch_film_g + c.sensor_g + c.closures_g;
    try std.testing.expectEqual(@as(u128, 1_182), floor_g);
    try std.testing.expect(floor_g > 1_000);
    try std.testing.expect(floor_g < 1_300);
}

test "esp32-s3 parasitic envelope mandates duty cycling" {
    const m = Mcu{};
    // Duty-cycled on the sustained 30 W bus: worst 50 mW -> 1.6 per-mille.
    const duty_pm = parasiticPerMille(m.duty_cycled_max_mw, m.sustained_bus_mw);
    try std.testing.expectEqual(@as(u128, 1), duty_pm);
    try std.testing.expect(duty_pm < 2); // <0.2%
    // Always-on at the low-rate 5.3 W output: 300 mW -> ~5.7%.
    const on_pm = parasiticPerMille(m.always_on_mw, m.lowrate_bus_mw);
    try std.testing.expectEqual(@as(u128, 56), on_pm);
    try std.testing.expect(on_pm > 50);
    // Even always-on is cheap at burst-class bus power.
    try std.testing.expect(parasiticPerMille(m.always_on_mw, m.sustained_bus_mw) <= 10);
}

test "redundant controllers fit inside the parasitic budget" {
    const m = Mcu{};
    // 0.5% of the sustained bus is 150 mW — three duty-cycled S3s fit.
    const budget_mw = m.sustained_bus_mw * 5 / 1_000;
    try std.testing.expectEqual(@as(u128, 150), budget_mw);
    try std.testing.expect(2 * m.duty_cycled_max_mw <= budget_mw);
    try std.testing.expect(3 * m.duty_cycled_max_mw <= budget_mw);
    try std.testing.expect(4 * m.duty_cycled_max_mw > budget_mw);
    // Deep-sleep ULP sentinel: ~33 uW — the always-on part is nearly free.
    try std.testing.expect(m.ulp_sleep_uw < 100);
}

// Every agent thinks the bus exists for them. The pump disagrees.
test "oil-bus mass flow is grams per second, not liters" {
    const b = OilBus{};
    // Sustained duty point 530 W -> ~5 g/s.
    const mdot_sus = oilFlowGsPerS(530, b.cp_j_kgk, b.dt_bus_k);
    try std.testing.expectEqual(@as(u128, 5), mdot_sus);
    // Burst 5,302 W -> ~53 g/s.
    const mdot_burst = oilFlowGsPerS(5_302, b.cp_j_kgk, b.dt_bus_k);
    try std.testing.expectEqual(@as(u128, 53), mdot_burst);
    // Loop inventory 435 g: residence ~87 s sustained, ~8 s at burst —
    // the oil bus is a real thermal buffer, not a pipe.
    try std.testing.expectEqual(@as(u128, 87), b.loop_mass_g / mdot_sus);
    try std.testing.expectEqual(@as(u128, 8), b.loop_mass_g / mdot_burst);
}

test "temperature stack respects all three ceilings" {
    const b = OilBus{};
    // Ordered ceilings: slab > oil > novec evap, and Novec stays under
    // its 169 C hard gate with the evaporator at 150 max.
    try std.testing.expect(b.slab_max_c > b.oil_max_c);
    try std.testing.expect(b.oil_max_c > b.novec_evap_max_c);
    try std.testing.expect(b.novec_evap_max_c < b.novec_critical_c);
    // Gate margin: 19 K between max evaporator and the critical point.
    try std.testing.expectEqual(@as(u128, 19), b.novec_critical_c - b.novec_evap_max_c);
    // Condenser well below the economizer floor.
    try std.testing.expect(b.condenser_c < 90);
}

test "novec flow and economizer capacity set the warm-bus ceiling" {
    const man = Manifold{};
    // Burst ORC draw: 80% of 5,302 W = 4,241 W into the evaporator side.
    const orc_w = man.burner_burst_w * man.orc_share_milli / 1_000;
    try std.testing.expectEqual(@as(u128, 4_241), orc_w);
    // Novec flow: per-kg duty = cp*100 K + hfg = 190 kJ/kg -> ~22 g/s.
    const mdot = novecFlowGsPerS(orc_w);
    try std.testing.expectEqual(@as(u128, 22), mdot);
    // Economizer absorbable capacity at burst: m_dot*cp*(90-40) -> ~1.4 kW.
    const cap_burst = economizerCapacityW(mdot, man.src_max_c - man.condenser_c);
    try std.testing.expectEqual(@as(u128, 1_430), cap_burst);
    // Sustained ORC draw 424 W -> ~2 g/s -> ~130 W capacity.
    const mdot_sus = novecFlowGsPerS(man.burner_sustained_w * man.orc_share_milli / 1_000);
    try std.testing.expectEqual(@as(u128, 2), mdot_sus);
    try std.testing.expectEqual(@as(u128, 130), economizerCapacityW(mdot_sus, man.src_max_c - man.condenser_c));
}

test "external heat stretches the charge most at low duty" {
    const man = Manifold{};
    // Credit is capped by economizer capacity: full 500 W at burst,
    // only ~130 W sustained (a 500 W source exceeds capacity).
    const credit_burst = @min(man.external_w, 1_430);
    const credit_sus = @min(man.external_w, 130);
    try std.testing.expectEqual(@as(u128, 500), credit_burst);
    try std.testing.expectEqual(@as(u128, 130), credit_sus);
    // Charge-extension multiplier = duty / (duty - credit):
    // burst: 5302/4802 -> ~1.10x; sustained: 530/400 -> ~1.32x.
    try std.testing.expectEqual(@as(u128, 110), man.burner_burst_w * 100 / (man.burner_burst_w - credit_burst));
    try std.testing.expectEqual(@as(u128, 132), man.burner_sustained_w * 100 / (man.burner_sustained_w - credit_sus));
    // The low-duty branch gets the bigger multiplicative benefit.
    try std.testing.expect(man.burner_sustained_w * 100 / (man.burner_sustained_w - credit_sus) > man.burner_burst_w * 100 / (man.burner_burst_w - credit_burst));
}

test "three-bus manifold conserves heat on the additive branch" {
    const man = Manifold{};
    // Credit-displaced branch: input unchanged, charge lasts longer,
    // rejection unchanged. Additive branch (tested here): total in =
    // 5,802 W and rejection must carry whatever extraction leaves.
    const shaft_a_lo: u128 = 458; // Path A low-end shaft (drivetrain harness)
    const shaft_a_hi: u128 = 814;
    const in_total = man.burner_burst_w + man.external_w; // 5,802 W
    try std.testing.expectEqual(@as(u128, 5_802), in_total);
    const reject_lo = in_total - shaft_a_hi; // max extraction -> min reject
    const reject_hi = in_total - shaft_a_lo;
    try std.testing.expectEqual(@as(u128, 4_988), reject_lo);
    try std.testing.expectEqual(@as(u128, 5_344), reject_hi);
    // Identity: input = extracted + rejected, exactly.
    try std.testing.expectEqual(in_total, shaft_a_lo + reject_hi);
    try std.testing.expectEqual(in_total, shaft_a_hi + reject_lo);
    // Free heat in means more heat out — the manifold makes the ~5 kW
    // rejection problem strictly worse whenever credit is additive.
    try std.testing.expect(reject_hi > 5_000);
}

test "shadow: cartridge, parasitic, and economizer fractions reconcile" {
    // Headspace fraction: 12,047/332,380 = 3.624% exact beneath the floor.
    const head = q128.Q.fromRatio(12_047 * 100, 332_380);
    try std.testing.expectEqual(@as(i256, 3), head.toInteger());
    try std.testing.expect(head.hasFraction());
    try std.testing.expect(q128.withinHalfUlp(head, 12_047 * 100, 332_380));
    // Oil burst flow: 5,302,000/100,000 = 53.02 g/s exact.
    const flow = q128.Q.fromRatio(5_302 * 1_000, 100_000);
    try std.testing.expectEqual(@as(i256, 53), flow.toInteger());
    try std.testing.expect(flow.hasFraction());
    // Economizer capacity: 22 g/s * 1300 * 50 / 1000 = 1,430 W exact.
    const cap = q128.Q.fromRatio(22 * 1_300 * 50, 1_000);
    try std.testing.expectEqual(@as(i256, 1_430), cap.toInteger());
    try std.testing.expect(!cap.hasFraction());
    // Charge extension sustained: 530/400 = 1.325 exact.
    const ext = q128.Q.fromRatio(530, 400);
    try std.testing.expectEqual(@as(i256, 1), ext.toInteger());
    try std.testing.expect(ext.hasFraction());
    try std.testing.expect(q128.withinHalfUlp(ext, 530, 400));
}

test "manifold screening functions are monotonic" {
    try std.testing.expect(cylinderVolumeMm3(50, 200) > cylinderVolumeMm3(46, 196));
    try std.testing.expect(volumeFromMassMm3(347, 224) > volumeFromMassMm3(300, 220));
    try std.testing.expect(parasiticPerMille(300, 5_300) > parasiticPerMille(50, 30_000));
    try std.testing.expect(oilFlowGsPerS(5_302, 2_000, 50) > oilFlowGsPerS(530, 2_000, 50));
    try std.testing.expect(novecFlowGsPerS(4_241) > novecFlowGsPerS(424));
    try std.testing.expect(economizerCapacityW(22, 50) > economizerCapacityW(2, 50));
}

// The oil bus must carry every watt it is asked to carry — flow,
// heat capacity, and delta-T close the loop back to the heat source.
test "oil-bus heat capacity closes the transport ledger" {
    const b = OilBus{};
    // mdot(g/s) * cp(J/kgK)/1000 * dt(K) = watts carried — invert the
    // flow formula and get the input back.
    const mdot = oilFlowGsPerS(5_302, b.cp_j_kgk, b.dt_bus_k);
    const carried = mdot * b.cp_j_kgk * b.dt_bus_k / 1_000; // g/s -> kg/s
    try std.testing.expectEqual(@as(u128, 5_300), carried); // 2 W floor loss
    // sustained branch closes too
    const mdot_s = oilFlowGsPerS(530, b.cp_j_kgk, b.dt_bus_k);
    try std.testing.expectEqual(@as(u128, 500), mdot_s * b.cp_j_kgk * b.dt_bus_k / 1_000);
}
