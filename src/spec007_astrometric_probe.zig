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
