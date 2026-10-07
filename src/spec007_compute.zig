// SPEC-007 compute core — the dossier's arithmetic as an exported ABI.
// Compiled to wasm32-freestanding for the FANO-1 workstation; the same
// functions link natively for tests. Every value is u32 — deciKelvin,
// watts, centilitres — because the desktop doesn't need more than that
// and the integer layer doesn't accept less.
//
// Build (site): zig build-exe spec007_compute.zig -target wasm32-freestanding \
//   -fno-entry -rdynamic -O ReleaseSmall -femit-bin=site/assets/spec007.wasm
// Verify:      zig test spec007_compute.zig

const std = @import("std");

// ---- cartridge / hydrolysis ----

export fn drip_to_gas_clmin(drip_mlmin_x100: u32) u32 {
    // gas cL/min = drip(mL/min×100) × 5/8 — 0.80 mL/min → 50 cL/min
    return drip_mlmin_x100 * 5 / 8;
}

export fn charge_minutes(drip_mlmin_x100: u32) u32 {
    // 168.6 mL inventory ÷ drip rate → minutes of flame
    if (drip_mlmin_x100 == 0) return 0;
    return 16860 / drip_mlmin_x100;
}

export fn gas_total_cl(drip_mlmin_x100: u32) u32 {
    // total charge gas in cL ≈ 10,490 cL (104.9 L) independent of rate —
    // rate only decides when it arrives. The lamp taught us that too.
    _ = drip_mlmin_x100;
    return 10490;
}

// ---- slab thermal bus ----

export fn slab_equilibrium_dk(p_w: u32) u32 {
    // T_amb 2981 dK + P×10 / k(20 W/K)
    return 2981 + p_w * 10 / 20;
}

export fn slab_step(t_dk: u32, p_w: u32, rem: u32) u32 {
    // One 1 s Euler step, packed return: hi16 = new T_dK, lo16 = new rem.
    const drive = p_w * 10;
    const loss = 20 * (t_dk - 2981);
    if (drive <= loss) return (@as(u32, t_dk) << 16) | rem;
    const num = drive - loss + rem;
    const new_t = t_dk + num / 5000;
    const new_rem = num % 5000;
    return (@as(u32, new_t) << 16) | @as(u32, @intCast(new_rem));
}

export fn slab_cool_step(t_dk: u32, rem: u32) u32 {
    // Cooling twin of slab_step: dT = -k(T-Tamb)/C, packed hi16/lo16.
    if (t_dk <= 2981) return (@as(u32, 2981) << 16);
    const num = 20 * (t_dk - 2981) + rem;
    const new_t = t_dk - num / 5000;
    const new_rem = num % 5000;
    return (@as(u32, new_t) << 16) | @as(u32, @intCast(new_rem));
}

// ---- powertrain ----

export fn bus_power_w(shaft_w: u32, expander_pm: u32, gen_pm: u32, trans_pm: u32) u32 {
    // shaft × expander‰ × generator‰ × transmission‰
    return shaft_w * expander_pm / 1000 * gen_pm / 1000 * trans_pm / 1000;
}

export fn per_charge_wh_x10(bus_w: u32, duty_pm: u32) u32 {
    // screened charge energy: ~3.5 h at bus×duty — return Wh×10
    return bus_w * duty_pm * 35 / 1000 / 10; // bus·duty·3.5h → Wh×10
}

// ---- manifold ----

export fn economizer_accept_w(ext_w: u32, cap_w: u32) u32 {
    return @min(ext_w, cap_w);
}

export fn cartridge_headspace_ml(carbide_g: u32, water_ml: u32, cao_ml: u32) u32 {
    // 332 mL interior; carbide ~0.454 mL/g bulk
    const used = carbide_g * 454 / 1000 + water_ml + cao_ml;
    if (used >= 332) return 0;
    return 332 - used;
}

// ---- canary: the desk can always ask if the module is alive ----

// ---- residue + air: the verified layer, re-derived in-browser ----

export fn residue_mg(charge_g: u32) u32 {
    // CaC2 + 2 H2O -> C2H2 + Ca(OH)2: 74,093 mg Ca(OH)2 per 64,100 mg CaC2.
    // 300 g charge -> ~346,764 mg residue — the disposal ledger.
    return charge_g * 74_093 / 64_100;
}

export fn air_lpm_x10(gas_lmin_x10: u32) u32 {
    // 2.5 mol O2 per mol C2H2, ~21% O2 in air: air = gas x 2.5 x 4.76.
    // Input gas rate in tenths L/min -> air in tenths L/min.
    // 5.0 L/min gas -> ~59.5 L/min air.
    return gas_lmin_x10 * 25 * 476 / 1_000;
}

export fn fano_alive() u32 {
    return 421; // the lattice answers for itself
}

test "compute core mirrors the harness arithmetic" {
    const expect = std.testing.expect;
    try expect(drip_to_gas_clmin(80) == 50);
    try expect(charge_minutes(80) == 210);
    try expect(slab_equilibrium_dk(5300) == 5631);
    const step = slab_step(2981, 5300, 0);
    try expect(step >> 16 == 2991); // first second: ~10.6 dK → 10 carried
    try expect(bus_power_w(254, 250, 900, 1000) == 56); // path-B-ish screen
    try expect(cartridge_headspace_ml(300, 169, 15) == 12); // the tight room
    try expect(fano_alive() == 421);
    // the verified layer, re-derived in-browser
    try expect(residue_mg(300) == 346); // ~347 g hydroxide disposal
    try expect(air_lpm_x10(50) == 595); // 5.0 L/min gas -> ~59.5 L/min air
    // the cooldown twin: hot slab at 5631 dK, zero power, first step down
    const cool = slab_cool_step(5631, 0);
    try expect(cool >> 16 == 5621); // 53000/5000 = 10.6 -> 10 dK drop
    try expect((slab_cool_step(2981, 0) >> 16) == 2981); // ambient floor
}
