// SPEC-007 convo3 dynamics harness — transient arithmetic, integer-only.
//
// (Easter egg: the first failure of this file was the ledger catching the
//  floor stealing joules it wasn't counting. The floor now carries.
//  Vesper would have called it an honest accounting of a dishonest system.)
// The static screens answered "how much". This file answers "how fast":
// slab heat-up, hydrolysis lag, charge depletion, two-stage ORC response,
// and a per-step energy ledger proving nothing was created along the way.
//
// Conventions: deciKelvin (dK = 0.1 K) temperatures, integer watts,
// joules for energy, 1 s Euler steps. u128 accumulators; q128 shadow
// on the promoted equilibrium. "Goldfinger counted in karats;
// we count in deciKelvin."
//
// Run: zig test spec007_dynamics_calculations.zig

const std = @import("std");
const expect = std.testing.expect;

// ---------- screened constants (audit-traceable) ----------

const T_AMB_DK: u128 = 2981; // 25.0 °C ambient, deciKelvin
const T_SLAB_MAX_DK: u128 = 5731; // 300.0 °C TEG continuous ceiling
const T_NOVEC_GATE_DK: u128 = 4231; // 150.0 °C practical evaporator top

const SLAB_C_JK: u128 = 5000; // effective thermal mass of slab+block, J/K
const SLAB_K_WK: u128 = 20; // lumped loss coefficient, W/K
const P_BURST_W: u128 = 5300; // verified burst thermal input
const P_SUSTAIN_W: u128 = 530; // verified low-duty thermal input

const WATER_ML_X100: u128 = 16860; // 168.6 mL charge (carried water inventory)
const DRIP_MLMIN_X100: u128 = 80; // 0.80 mL/min nominal drip
const GAS_STOICH_NUM: u128 = 5; // gas cL/min = drip(mL/min×100) × 5/8
const GAS_STOICH_DEN: u128 = 8; //   (0.8 mL/min → 0.50 L/min, the lamp knew)

// ---------- helpers ----------

/// Steady-state gas rate in cL/min for a drip given in mL/min ×100.
fn gasTargetCLmin(drip_xmlmin: u128) u128 {
    return drip_xmlmin * GAS_STOICH_NUM / GAS_STOICH_DEN;
}

/// One Euler step of the slab lumped model, 1 s, deciKelvin.
///   dT_dK = (10·P_W − k_WK·(T_dK − T_amb_dK) + rem) / C_JK
/// The remainder carries — the floor drops nothing it can't account for.
fn slabStep(t_dk: u128, p_w: u128, rem: *u128) u128 {
    const drive = p_w * 10;
    const loss = SLAB_K_WK * (t_dk - T_AMB_DK);
    if (drive <= loss) return t_dk; // floor: never below ambient band here
    const num = drive - loss + rem.*;
    rem.* = num % SLAB_C_JK;
    return t_dk + num / SLAB_C_JK;
}

/// One Euler step DOWN: the slab loses heat to ambient when input
/// stops. slabStep floors at "never below ambient band here" — it can
/// only warm. Cooling needs its own step: dT = -k(T-Tamb)/C, with
/// the remainder carried in the same ledger of fractions.
fn slabCoolStep(t_dk: u128, rem: *u128) u128 {
    if (t_dk <= T_AMB_DK) return T_AMB_DK; // floor: ambient
    const num = SLAB_K_WK * (t_dk - T_AMB_DK) + rem.*;
    rem.* = num % SLAB_C_JK;
    return t_dk - num / SLAB_C_JK;
}

/// Simulate cooling to a target temperature; seconds, or max_s+1.
fn coolToTemp(t0_dk: u128, target_dk: u128, max_s: u128) u128 {
    var t = t0_dk;
    var rem: u128 = 0;
    var s: u128 = 0;
    while (s <= max_s) : (s += 1) {
        if (t <= target_dk) return s;
        t = slabCoolStep(t, &rem);
    }
    return max_s + 1;
}

/// Analytic equilibrium temperature in dK for constant input power.
fn slabEquilibrium(p_w: u128) u128 {
    return T_AMB_DK + (p_w * 10) / SLAB_K_WK;
}

/// Simulate to a target temperature; returns seconds, or max_s+1 if never.
fn timeToTemp(t0_dk: u128, target_dk: u128, p_w: u128, max_s: u128) u128 {
    var t = t0_dk;
    var rem: u128 = 0;
    var s: u128 = 0;
    while (s <= max_s) : (s += 1) {
        if (t >= target_dk) return s;
        t = slabStep(t, p_w, &rem);
    }
    return max_s + 1;
}

// ---------- tests ----------

test "stoichiometric drip: 0.80 mL/min buys exactly 0.50 L/min" {
    // The drip is the throttle — the lamp already knew the ratio.
    try expect(gasTargetCLmin(DRIP_MLMIN_X100) == 50);
    try expect(gasTargetCLmin(160) == 100); // double the drip, double the fire
    try expect(gasTargetCLmin(0) == 0);
}

test "hydrolysis lag converges within five tau to ±1%" {
    // First-order response at 1/64 resolution: coarse integers stall at
    // diff < tau, so we carry the lag in sixty-fourths and floor only
    // at presentation — the fraction keeps living underneath.
    const tau: u128 = 8;
    const target64 = gasTargetCLmin(DRIP_MLMIN_X100) * 64; // 3200 = 50 cL/min
    var g64: u128 = 0;
    var i: u128 = 0;
    while (i < tau * 5) : (i += 1) g64 += (target64 - g64) / tau;
    try expect(g64 <= target64); // never overshoots the setpoint
    try expect(target64 - g64 <= target64 / 100 + 64); // within ~1% + residue
}

test "gas rate is monotonically non-decreasing from cold" {
    const target = gasTargetCLmin(120);
    var g: u128 = 0;
    var prev: u128 = 0;
    var i: u128 = 0;
    while (i < 60) : (i += 1) {
        g += (target - g) / 8;
        try expect(g >= prev);
        prev = g;
    }
}

test "charge lifetime lands in the carbide-lamp band" {
    // 168.6 mL at 0.80 mL/min → ~210 minutes: the 2–5 h lamp window.
    const minutes = WATER_ML_X100 / DRIP_MLMIN_X100;
    try expect(minutes >= 200 and minutes <= 215);
    // and the lamp's own history bounds it the other way:
    try expect(minutes >= 120 and minutes <= 300);
}

test "burst slab equilibrium stays under the TEG ceiling" {
    // k=20 W/K → 265 K rise → ~290 °C: under 300 °C, over Novec's band.
    const eq = slabEquilibrium(P_BURST_W);
    try expect(eq < T_SLAB_MAX_DK);
    try expect(eq > T_NOVEC_GATE_DK); // headroom above the 150 °C gate
}

test "sustained duty cannot hold the hot bus alone" {
    // 530 W → ~52 °C equilibrium: the honest reason the architecture
    // stores heat in the block instead of pretending sustained is burst.
    const eq = slabEquilibrium(P_SUSTAIN_W);
    try expect(eq < 3500); // under 76.9 °C — far below the 150 °C gate
}

test "burst reaches the Novec gate in minutes, not hours" {
    const s = timeToTemp(T_AMB_DK, T_NOVEC_GATE_DK, P_BURST_W, 7200);
    try expect(s > 0 and s <= 1200); // under 20 min from cold slab
    // and it actually crosses, not plateaus below:
    const eq = slabEquilibrium(P_BURST_W);
    try expect(eq > T_NOVEC_GATE_DK);
}

test "energy ledger: input equals stored plus lost within 1%" {
    // Every joule is accounted for — the desk audits its own Euler steps.
    var t = T_AMB_DK;
    var rem: u128 = 0;
    var e_in: u128 = 0;
    var e_lost: u128 = 0;
    var s: u128 = 0;
    while (s < 600) : (s += 1) {
        e_in += P_BURST_W; // joules this second
        e_lost += SLAB_K_WK * (t - T_AMB_DK) / 10;
        t = slabStep(t, P_BURST_W, &rem);
    }
    const stored = SLAB_C_JK * (t - T_AMB_DK) / 10;
    const accounted = stored + e_lost;
    // Euler undershoots the loss integral slightly; demand ≤1% drift.
    try expect(accounted <= e_in);
    try expect(e_in - accounted <= e_in / 100);
}

test "economizer preheat shortens time-to-gate" {
    // 60 °C warm-bus start vs 25 °C cold start: free degrees are free seconds.
    const cold = timeToTemp(T_AMB_DK, T_NOVEC_GATE_DK, P_BURST_W, 7200);
    const warm = timeToTemp(3331, T_NOVEC_GATE_DK, P_BURST_W, 7200);
    try expect(warm < cold);
    try expect(cold - warm >= 30); // at least half a minute saved at burst
}

test "two-stage ORC response is slower than single-stage" {
    // Cascade the lag: oil bus → Novec loop doubles the time constant feel.
    const tau: u128 = 8;
    const target = gasTargetCLmin(DRIP_MLMIN_X100);
    var single: u128 = 0;
    var stage1: u128 = 0;
    var stage2: u128 = 0;
    var s_half_single: u128 = 0;
    var s_half_double: u128 = 0;
    var s: u128 = 0;
    while (s < 200) : (s += 1) {
        single += (target - single) / tau;
        stage1 += (target - stage1) / tau;
        stage2 += (stage1 - stage2) / tau;
        if (s_half_single == 0 and single * 2 >= target) s_half_single = s;
        if (s_half_double == 0 and stage2 * 2 >= target) s_half_double = s;
    }
    try expect(s_half_double > s_half_single);
    try expect(s_half_double >= 2 * s_half_single); // at least twice the wait
}

test "charge depletion ends gas production on schedule" {
    // Integrate the drip; when the water is gone the flame is done.
    var remaining = WATER_ML_X100;
    var minutes: u128 = 0;
    while (remaining >= DRIP_MLMIN_X100) : (minutes += 1) remaining -= DRIP_MLMIN_X100;
    try expect(minutes == WATER_ML_X100 / DRIP_MLMIN_X100);
    try expect(remaining < DRIP_MLMIN_X100); // dregs, not a reservoir
    // post-charge gas target is zero — no water, no fire.
    try expect(gasTargetCLmin(0) == 0);
}

test "q128 shadow: burst equilibrium to the half-ulp" {
    const q128 = @import("spec007_q128.zig");
    const eq_int = slabEquilibrium(P_BURST_W); // 2981 + 2650 = 5631 dK
    const rise = q128.Q.fromRatio(P_BURST_W * 10, SLAB_K_WK);
    const amb = q128.Q.fromRatio(T_AMB_DK, 1);
    const eq_q = amb.add(rise);
    try expect(q128.withinHalfUlp(eq_q, @intCast(eq_int), 1));
    // exact rational: 5631.000… dK — the fraction kept its head
    try expect(!eq_q.hasFraction());
}

test "post-charge cooldown: the slab gives the energy back" {
    // Burst equilibrium ~5,300 W -> 2,931 + (5,300*10)/20 = 5,631 dK...
    const hot = slabEquilibrium(5_300);
    try std.testing.expectEqual(@as(u128, 5_631), hot);
    // Charge depleted, drip cut: cool toward ambient on the same k/C.
    // Time constant C/k = 5000/20 = 250 s — ~five tau to within 1%.
    const s95 = coolToTemp(hot, T_AMB_DK + 133, 120_000); // 5% band
    try std.testing.expect(s95 < 800); // ~3 tau: honest ballpark
    // monotonic descent — every step is strictly cooler until ambient
    var t = hot;
    var rem: u128 = 0;
    var i: u32 = 0;
    while (i < 64 and t > T_AMB_DK) : (i += 1) {
        const next = slabCoolStep(t, &rem);
        try std.testing.expect(next <= t);
        t = next;
    }
    // and the floor holds: never below ambient
    t = T_AMB_DK;
    try std.testing.expectEqual(T_AMB_DK, slabCoolStep(t, &rem));
}
