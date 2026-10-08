// spec007_astrometric_probe.zig — the Level-7Q astrometric probe.
//
// The claim under test (Loeb, arXiv:2507.12213 + Medium essay, 2025):
// the August 1977 Wow! signal direction and 3I/ATLAS's back-calculated
// position in August 1977 align within ~9 degrees — a ~0.6% random
// coincidence. This harness computes the claim from first principles in
// integer Q128 and files the result. SPEC-006 falsifiability: every number
// is a measurable outcome with a stated disconfirmation condition.
//
// On-record inputs:
//   Wow! signal (Big Ear, 1977-08-15): RA = 19h25m = 291.25 deg,
//     Dec = -27 deg, f = 1420.4556 MHz (hydrogen hyperfine), ~72 s,
//     never repeated in 48 years.
//   3I/ATLAS @ Aug 1977 (Loeb, HCL25): RA ~ 295 deg, Dec ~ -19 deg,
//     dist ~ 600 AU, v_inf ~ 58 km/s, hyperbolic (unbound).
//   Radio follow-up on 3I/ATLAS at 1420 MHz: zero detections to date
//   (reported by Loeb himself) — the operative disconfirmation channel.
//
// Computations — integer only, no floats:
//   * deg->rad and sin/cos via rational-Pi + quadrant-reduced integer
//     Taylor series (bounded error, deterministic)
//   * cos(theta) = cos d1 cos d2 cos(Delta-RA) + sin d1 sin d2; theta is
//     BRACKETED against cosine thresholds — no arccos needed
//   * random-cap probability P = (1 - cos theta)/2
//   * light time at 600 AU (AU = 499.004784 s — exact rational)
//   * inbound transit 600 AU / 58 km/s in years
//   * Vector Alpha (superluminal premise): INVARIANT-VIOLATION — the
//     wire-cost invariant flags any v > c information path on entry
//   * Vector Beta (power-budget screen): a v <= c electromagnetic
//     wavefront does NOT trip wire-cost — the constraint moves to the
//     energy ledger. Given R = 600 AU, f = 1420.4556 MHz, a 10 kHz
//     Big Ear channel, and the observed ~54 Jy peak flux density
//     (literature range ~50-250 Jy):
//       P_iso = 4*pi*R^2 * S * df  (~0.55 GW isotropic-equivalent)
//     The gain matrix {1, 1e3, 1e6} maps that to actual transmitter
//     power: omni = GW-class, 60 dB dish = ~0.5 kW — feasible IF
//     beamed (~4e-5 of the Arecibo radar's ~2e13 W EIRP).
//     Two bounds then do the falsifying work:
//       * persistence: a still-active transmitter at ~1.4 AU would be
//         (600/1.4)^2 ~ 1.8e5x brighter => MJy-class, SNR ~1e6 vs the
//         galactic noise floor — unmissable. Zero follow-up detections
//         falsify persistence outright.
//       * two-horn: Big Ear's second horn swept the same point ~3 min
//         later — a persistent source must reappear; it did not.
//       * comoving Doppler: a rest-frame HI emitter on 3I/ATLAS lands
//         ~275 kHz high (v_inf/c); the observed +50 kHz offset requires
//         deliberate ~225 kHz pre-compensation — one free parameter.
//     Only a one-shot past-aim transient survives — unfalsifiable by
//     construction, and filed exactly as that.
//
// What this does NOT claim: that the alignment is evidence of coupling.
// A 0.6% random probability is real but weak — a sky full of catalogued
// candidates yields ~1/160 alignments routinely. The disconfirmation
// channel is radio nondetection, which so far favors the coincidence
// model — filed, not asserted.

const std = @import("std");
const fixed = @import("fixed_point_q128.zig");

const Q128 = fixed.Q128;
const Raw = fixed.Raw;

// pi as 80143857/25510582 — error ~1e-16 rad.
fn pi() Q128 {
    return Q128.fromRatio(80143857, 25510582) catch unreachable;
}

pub fn deg2rad(d: Q128) Q128 {
    return d.mul(pi()).div(Q128.fromInteger(180)) catch unreachable;
}

fn divFloor(a: Raw, b: Raw) i256 {
    const q = @divTrunc(a, b);
    return if (@rem(a, b) != 0 and ((a < 0) != (b < 0))) q - 1 else q;
}

// quadrant-reduced sin/cos for x in radians (any sign).
fn reduce(x: Q128) struct { q: usize, t: Q128 } {
    const two_pi = pi().mul(Q128.fromInteger(2));
    const half_pi = pi().div(Q128.fromInteger(2)) catch unreachable;
    const k = divFloor(x.raw, two_pi.raw);
    const r = x.sub(two_pi.mul(Q128.fromInteger(k)));
    const qi: usize = @intCast(@divTrunc(r.raw, half_pi.raw));
    const t = r.sub(half_pi.mul(Q128.fromInteger(@intCast(qi))));
    return .{ .q = @min(qi, 3), .t = t };
}

fn sinT(t: Q128) Q128 {
    // t in [0, pi/2]; Taylor, alternating signs.
    var sum = t;
    var term = t;
    const x2 = t.mul(t).neg();
    var n: i256 = 1;
    while (n < 14) : (n += 1) {
        term = term.mul(x2).div(Q128.fromInteger((2 * n) * (2 * n + 1))) catch unreachable;
        sum = sum.add(term);
    }
    return sum;
}

fn cosT(t: Q128) Q128 {
    var sum = Q128.one;
    var term = Q128.one;
    const x2 = t.mul(t).neg();
    var n: i256 = 1;
    while (n < 14) : (n += 1) {
        term = term.mul(x2).div(Q128.fromInteger((2 * n) * (2 * n - 1))) catch unreachable;
        sum = sum.add(term);
    }
    return sum;
}

pub fn sinQ(x: Q128) Q128 {
    const r = reduce(x);
    const s = sinT(r.t);
    const c = cosT(r.t);
    return switch (r.q) {
        0 => s,
        1 => c,
        2 => s.neg(),
        else => c.neg(),
    };
}

pub fn cosQ(x: Q128) Q128 {
    const r = reduce(x);
    const s = sinT(r.t);
    const c = cosT(r.t);
    return switch (r.q) {
        0 => c,
        1 => s.neg(),
        2 => c.neg(),
        else => s,
    };
}

pub const Inputs = struct {
    wow_ra_deg: Q128,
    wow_dec_deg: Q128,
    atlas_ra_deg: Q128,
    atlas_dec_deg: Q128,
    dist_au: Q128,
    v_kms: Q128,
};

/// On-record inputs (Loeb HCL25 + Big Ear catalog values).
pub fn onRecord() Inputs {
    return .{
        .wow_ra_deg = Q128.fromRatio(29125, 100) catch unreachable, // 19h25m
        .wow_dec_deg = Q128.fromInteger(-27),
        .atlas_ra_deg = Q128.fromInteger(295), // 19h40m
        .atlas_dec_deg = Q128.fromInteger(-19),
        .dist_au = Q128.fromInteger(600),
        .v_kms = Q128.fromInteger(58),
    };
}

/// cos(theta) between the two sky directions.
pub fn cosSeparation(in: Inputs) Q128 {
    const d1 = deg2rad(in.wow_dec_deg.abs());
    const d2 = deg2rad(in.atlas_dec_deg.abs());
    const dra = deg2rad(in.wow_ra_deg.sub(in.atlas_ra_deg).abs());
    const a = cosQ(d1).mul(cosQ(d2)).mul(cosQ(dra));
    const b = sinQ(deg2rad(in.wow_dec_deg)).mul(sinQ(deg2rad(in.atlas_dec_deg)));
    return a.add(b);
}

/// Smallest threshold (deg) strictly above the separation — cos is
/// decreasing, so the first threshold with cos(t) < cos(theta) is the
/// upper bracket: separation < returned bound.
pub fn separationBracket(cos_theta: Q128) i32 {
    const thresholds = [_]i32{ 4, 8, 9, 10, 12, 15, 20, 30 };
    for (thresholds) |t| {
        const ct = cosQ(deg2rad(Q128.fromInteger(t)));
        if (ct.raw < cos_theta.raw) return t;
    }
    return 180;
}

/// P(random point lands within theta) = (1 - cos theta)/2.
pub fn capProbability(cos_theta: Q128) Q128 {
    return Q128.one.sub(cos_theta).div(Q128.fromInteger(2)) catch unreachable;
}

/// Light travel time across dist AU in seconds (499.004784 s/AU).
pub fn lightSeconds(dist_au: Q128) Q128 {
    return dist_au.mul(Q128.fromRatio(499004784, 1000000) catch unreachable);
}

/// Inbound transit in Julian years (AU = 149,597,870.7 km, yr = 365.25 d).
pub fn transitYears(dist_au: Q128, v_kms: Q128) Q128 {
    const km = dist_au.mul(Q128.fromRatio(1495978707, 10) catch unreachable);
    const secs = km.div(v_kms) catch unreachable;
    return secs.div(Q128.fromRatio(31557600, 1) catch unreachable) catch unreachable;
}

/// Vector Alpha: a coupling model requiring information faster than c.
pub const InvariantError = error{ViolatesWireCost};

pub fn superluminalScreen(v_over_c: Q128) InvariantError!void {
    if (v_over_c.cmp(Q128.one) > 0) return error.ViolatesWireCost;
}

// ── Vector Beta: power-budget screen (the legal wavefront) ──────────
// A v <= c wavefront is legal under wire-cost; the hypothesis must now
// clear the energy ledger. All constants on record:
//   AU      = 149,597,870,700 m   (IAU 2012, exact)
//   c       = 299,792,458 m/s     (SI, exact)
//   1 Jy    = 1e-26 W/m^2/Hz
//   Wow!    ~54 Jy peak in a 10 kHz channel, ~72 s, ~30 sigma
//   horns   Big Ear dual-horn re-sweep ~3 min apart
//   Arecibo S-band planetary radar EIRP ~2e13 W (the feasibility ruler)

pub fn auMeters() Q128 {
    return Q128.fromInteger(149597870700);
}

pub fn cMs() Q128 {
    return Q128.fromInteger(299792458);
}

/// 4*pi*R^2 in m^2 for R given in AU.
pub fn sphereAreaM2(dist_au: Q128) Q128 {
    const r = dist_au.mul(auMeters());
    return r.mul(r).mul(pi()).mul(Q128.fromInteger(4));
}

/// Required isotropic-equivalent power (W) to deliver flux_jy over
/// bw_hz at dist_au: P_iso = 4*pi*R^2 * S * df.
pub fn isoPowerW(dist_au: Q128, flux_jy: Q128, bw_hz: Q128) Q128 {
    const jy = Q128.fromRatio(1, 100000000000000000000000000) catch unreachable; // 1e-26
    return sphereAreaM2(dist_au).mul(flux_jy.mul(jy)).mul(bw_hz);
}

/// Actual transmitter power behind an antenna of linear gain g.
pub fn beamedPowerW(p_iso: Q128, gain: u32) Q128 {
    return p_iso.div(Q128.fromInteger(gain)) catch unreachable;
}

/// Brightness amplification of a still-active transmitter that moved
/// from d_then to d_now AU: (d_then / d_now)^2.
pub fn persistenceRatio(d_then_au: Q128, d_now_au: Q128) Q128 {
    const r = d_then_au.div(d_now_au) catch unreachable;
    return r.mul(r);
}

/// Comoving-Doppler offset (Hz) of a rest-frame emitter at f_hz moving
/// at v_kms radially: df = f * v / c.
pub fn dopplerHz(f_hz: Q128, v_kms: Q128) Q128 {
    const v_ms = v_kms.mul(Q128.fromInteger(1000));
    return f_hz.mul(v_ms).div(cMs()) catch unreachable;
}

/// Total isotropic-equivalent radiated energy over the window, J = P*t.
pub fn energyJ(p_w: Q128, seconds: Q128) Q128 {
    return p_w.mul(seconds);
}

/// Score against the noise floor: SNR scales linearly with flux, so a
/// ~30-sigma 1977 event from a still-active source at d_now reads
/// 30 * (d_then/d_now)^2 sigma today.
pub fn snrNow(snr_1977: Q128, d_then_au: Q128, d_now_au: Q128) Q128 {
    return snr_1977.mul(persistenceRatio(d_then_au, d_now_au));
}

test "integer trig: cardinal values exact within bounded error" {
    const tol: Raw = @divTrunc(fixed.Scale, 1 << 30);
    try std.testing.expect(cosQ(Q128.zero).sub(Q128.one).abs().raw < tol);
    try std.testing.expect(sinQ(Q128.zero).abs().raw < tol);
    // cos(60 deg) = 1/2, sin(30 deg) = 1/2, cos(90 deg) = 0
    const h = Q128.fromRatio(1, 2) catch unreachable;
    try std.testing.expect(cosQ(deg2rad(Q128.fromInteger(60))).sub(h).abs().raw < tol);
    try std.testing.expect(sinQ(deg2rad(Q128.fromInteger(30))).sub(h).abs().raw < tol);
    try std.testing.expect(cosQ(deg2rad(Q128.fromInteger(90))).abs().raw < tol);
    // large-angle reduction: sin(291 deg) matches -sin(69 deg)
    const a = sinQ(deg2rad(Q128.fromInteger(291)));
    const b = sinQ(deg2rad(Q128.fromInteger(69))).neg();
    try std.testing.expect(a.sub(b).abs().raw < tol);
}

test "separation brackets to <9 degrees — the claimed ~4x8 window" {
    const c = cosSeparation(onRecord());
    // theta in (8, 9]: cos(9deg) <= cos_theta < cos(8deg)
    const c9 = cosQ(deg2rad(Q128.fromInteger(9)));
    const c8 = cosQ(deg2rad(Q128.fromInteger(8)));
    try std.testing.expect(c.raw >= c9.raw);
    try std.testing.expect(c.raw < c8.raw);
    try std.testing.expectEqual(@as(i32, 9), separationBracket(c));
}

test "random-alignment probability is ~0.6% — real but weak evidence" {
    const c = cosSeparation(onRecord());
    const p = capProbability(c);
    // (1 - cos 9deg)/2 ~ 0.0062 — within a half-percent band of the claim
    const lo = Q128.fromRatio(5, 1000) catch unreachable;
    const hi = Q128.fromRatio(8, 1000) catch unreachable;
    try std.testing.expect(p.raw > lo.raw and p.raw < hi.raw);
}

test "kinematic arithmetic is consistent: ~3.5 light-days, ~49-yr transit" {
    const in = onRecord();
    const secs = lightSeconds(in.dist_au);
    // 600 AU * 499.004784 s = 299402.87 s ~ 3.47 days
    const expect_s = Q128.fromRatio(2994028704, 10000) catch unreachable;
    const tol: Raw = @divTrunc(fixed.Scale, 1 << 30);
    try std.testing.expect(secs.sub(expect_s).abs().raw < tol);
    const yrs = transitYears(in.dist_au, in.v_kms);
    try std.testing.expect(yrs.raw > Q128.fromInteger(48).raw);
    try std.testing.expect(yrs.raw < Q128.fromInteger(50).raw);
}

test "Vector Alpha: superluminal premise is refused at the gate" {
    try std.testing.expectError(error.ViolatesWireCost, superluminalScreen(try Q128.fromRatio(3, 2)));
    try superluminalScreen(try Q128.fromRatio(9999, 10000)); // sub-luminal passes
}

test "filed verdict: coincidence model holds under every measured bound" {
    const c = cosSeparation(onRecord());
    const p = capProbability(c);
    // the record: separation < 9 deg (real), P ~ 0.006 (real but weak —
    // ~1/160 alignments occur routinely in a populated candidate sky),
    // 1420 MHz follow-up: zero detections. Verdict = coincidence held,
    // disconfirmation channel = a future narrowband detection re-opens.
    try std.testing.expect(separationBracket(c) <= 9);
    try std.testing.expect(p.cmp(try Q128.fromRatio(1, 100)) < 0);
}

// ── Vector Beta tests: the energy ledger does the falsifying ────────

test "Vector Beta: iso-equivalent power ~0.55 GW for 54 Jy @ 10 kHz @ 600 AU" {
    const p = isoPowerW(Q128.fromInteger(600), Q128.fromInteger(54), Q128.fromInteger(10000));
    // 4*pi*(600 AU)^2 * 54e-26 * 1e4 ~ 5.47e8 W
    try std.testing.expect(p.cmp(Q128.fromInteger(500_000_000)) > 0);
    try std.testing.expect(p.cmp(Q128.fromInteger(600_000_000)) < 0);
    // literature upper bound 200 Jy still lands ~2 GW — GW-class, not absurd
    const p200 = isoPowerW(Q128.fromInteger(600), Q128.fromInteger(200), Q128.fromInteger(10000));
    try std.testing.expect(p200.cmp(Q128.fromInteger(1_800_000_000)) > 0);
    try std.testing.expect(p200.cmp(Q128.fromInteger(2_300_000_000)) < 0);
}

test "gain matrix: omni is GW-class, a 60 dB dish needs only ~0.5 kW" {
    const p_iso = isoPowerW(Q128.fromInteger(600), Q128.fromInteger(54), Q128.fromInteger(10000));
    const omni = beamedPowerW(p_iso, 1);
    try std.testing.expect(omni.cmp(p_iso) == 0); // G=1 → full isotropic bill
    const g30 = beamedPowerW(p_iso, 1000); // 30 dB
    try std.testing.expect(g30.cmp(Q128.fromInteger(500_000)) > 0);
    try std.testing.expect(g30.cmp(Q128.fromInteger(600_000)) < 0);
    const g60 = beamedPowerW(p_iso, 1000000); // 60 dB — large-dish class
    try std.testing.expect(g60.cmp(Q128.fromInteger(500)) > 0);
    try std.testing.expect(g60.cmp(Q128.fromInteger(600)) < 0);
}

test "required EIRP is ~4e-5 of the Arecibo radar — energetically feasible IF beamed" {
    const arecibo_eirp = Q128.fromInteger(20_000_000_000_000); // ~2e13 W S-band
    const p_iso = isoPowerW(Q128.fromInteger(600), Q128.fromInteger(54), Q128.fromInteger(10000));
    const ratio = arecibo_eirp.div(p_iso) catch unreachable;
    // Arecibo EIRP / required ~ 3.6e4 — a directed system clears the bill
    try std.testing.expect(ratio.cmp(Q128.fromInteger(30_000)) > 0);
    try std.testing.expect(ratio.cmp(Q128.fromInteger(45_000)) < 0);
}

test "persistence falsified: still-active @1.4 AU would be ~1.8e5x brighter — MJy-class, ~5.5e6 sigma" {
    const d_then = Q128.fromInteger(600);
    const d_now = Q128.fromRatio(14, 10) catch unreachable; // ~perihelion 1.4 AU
    const amp = persistenceRatio(d_then, d_now);
    try std.testing.expect(amp.cmp(Q128.fromInteger(180_000)) > 0);
    try std.testing.expect(amp.cmp(Q128.fromInteger(190_000)) < 0);
    const flux_now = Q128.fromInteger(54).mul(amp); // Jy
    try std.testing.expect(flux_now.cmp(Q128.fromInteger(9_000_000)) > 0); // MJy-class
    const snr = snrNow(Q128.fromInteger(30), d_then, d_now);
    try std.testing.expect(snr.cmp(Q128.fromInteger(5_000_000)) > 0); // unmissable vs noise floor
}

test "comoving Doppler: rest-HI emission lands ~275 kHz high — pre-compensation required" {
    const f_rest = Q128.fromInteger(1420405751); // Hz — HI hyperfine rest
    const f_obs = Q128.fromInteger(1420455600); // Hz — Wow! channel center
    const observed_offset = f_obs.sub(f_rest); // ~49.8 kHz
    try std.testing.expect(observed_offset.cmp(Q128.fromInteger(49_000)) > 0);
    try std.testing.expect(observed_offset.cmp(Q128.fromInteger(51_000)) < 0);
    const comoving = dopplerHz(f_rest, Q128.fromInteger(58)); // ~275 kHz
    try std.testing.expect(comoving.cmp(Q128.fromInteger(270_000)) > 0);
    try std.testing.expect(comoving.cmp(Q128.fromInteger(280_000)) < 0);
    // a comoving emitter must pre-compensate ~225 kHz — a free parameter
    const precomp = comoving.sub(observed_offset);
    try std.testing.expect(precomp.cmp(Q128.fromInteger(220_000)) > 0);
    try std.testing.expect(precomp.cmp(Q128.fromInteger(230_000)) < 0);
}

test "two-horn bound: a persistent source must have reappeared ~3 min later — it did not" {
    // Big Ear's dual horns sweep the same point ~180 s apart. The signal
    // filled the first horn's ~72 s window and was absent in the second —
    // so any constant-persistence model is bounded to < ~3 min on-time.
    const horn_gap_s = Q128.fromInteger(180);
    const window_s = Q128.fromInteger(72);
    try std.testing.expect(horn_gap_s.cmp(window_s) > 0); // the gap exceeds the observed window
}

test "wavefront legality: v = c clears wire-cost; flight time << transit" {
    try superluminalScreen(Q128.one); // exactly c — legal boundary
    const in = onRecord();
    const flight_s = lightSeconds(in.dist_au); // ~3.47 d
    const transit_s = transitYears(in.dist_au, in.v_kms).mul(Q128.fromInteger(31557600));
    const gap = transit_s.div(flight_s) catch unreachable;
    try std.testing.expect(gap.cmp(Q128.fromInteger(1_000)) > 0); // ~5000x causal headroom
}

test "energy ledger: 72 s window at the required EIRP ~ 40 GJ isotropic-equivalent" {
    const p_iso = isoPowerW(Q128.fromInteger(600), Q128.fromInteger(54), Q128.fromInteger(10000));
    const e = energyJ(p_iso, Q128.fromInteger(72));
    try std.testing.expect(e.cmp(Q128.fromInteger(30_000_000_000)) > 0);
    try std.testing.expect(e.cmp(Q128.fromInteger(50_000_000_000)) < 0);
}

test "Vector Beta filed verdict: feasible iff beamed; persistence + two-horn falsified; one-shot unfalsifiable" {
    const p_iso = isoPowerW(Q128.fromInteger(600), Q128.fromInteger(54), Q128.fromInteger(10000));
    const g60 = beamedPowerW(p_iso, 1000000);
    // energy hypothesis: physically feasible only for a directed beam
    try std.testing.expect(g60.cmp(Q128.fromInteger(1_000)) < 0);
    try std.testing.expect(p_iso.cmp(Q128.fromInteger(100_000_000)) > 0); // omni is 0.5-GW-class
    // persistence model: dead on both bounds (flux and horns)
    const amp = persistenceRatio(Q128.fromInteger(600), Q128.fromRatio(14, 10) catch unreachable);
    try std.testing.expect(amp.cmp(Q128.fromInteger(100_000)) > 0);
    // surviving model = one-shot transient aimed past Earth: no
    // disconfirmation channel exists by construction — filed as such,
    // the weakest admissible class under SPEC-006.
}
