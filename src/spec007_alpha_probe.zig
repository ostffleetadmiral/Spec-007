// spec007_alpha_probe.zig — claim #36 mechanism probe: alpha derivations.
//
// The audit's missing item: "Compute alpha from octonion U(1) ->
// compare to 1/137.036" (final_audit claim #36, mechanism
// unimplemented). Three candidate derivations exist on record — each
// gets an integer-Q128 computation and an honest grade:
//
//   1. CORPUS CONSTRUCTION: alpha^-1 = 721/7 + 34 = 137 exactly
//      (the lattice numbers 721 and 7-defect). Integer-exact, but
//      0.036 off the measured value — 262 ppm. Filed CONSTRUCTION:
//      built to match, not derived.
//
//   2. NATURAL PATH (Zenodo 2025, literature): alpha^-1 = 43*pi + ln(7)
//      = 137.034 — claimed 11.7 ppm from CODATA. The 7 is the smallest
//      Mersenne (2^3-1) — the framework's own 7-defect. Integer-
//      computable: pi is rational-bounded, ln via atanh series.
//      This is the one real closed-form candidate to verify.
//
//   3. APS 2026 (literature): alpha^-1 = 137.035999143 from octonionic
//      information theory, zero parameters, claimed 1.62 sigma
//      agreement with CODATA 2022 = 137.035999177(21). The mechanism
//      isn't published here — but the SIGMA CLAIM is verifiable
//      arithmetic: |137.035999143 - 137.035999177| = 34e-9 vs
//      sigma = 21e-9 => 1.62 sigma exactly as stated. Internal
//      consistency verified; mechanism pending.
//
// Integer ln: ln(x) = 2*atanh((x-1)/(x+1)), atanh y = y + y^3/3 + ...
// Convergence strategy: ln(7) = 3*ln(2) + ln(7/8) — y = 1/3 and y = -1/15,
// both fast. Anchored on ln(2) and ln(e)-scale checks.

const std = @import("std");
const fixed = @import("fixed_point_q128.zig");

const Q128 = fixed.Q128;
const Raw = fixed.Raw;

fn try2(v: anytype) @TypeOf(v catch unreachable) {
    return v catch unreachable;
}

fn piQ() Q128 {
    return try2(Q128.fromRatio(80143857, 25510582)); // err ~1e-16
}

/// atanh(y) for |y| <= ~0.8: y + y^3/3 + y^5/5 + ... bounded Taylor.
fn atanhQ(y: Q128) Q128 {
    const y2 = y.mul(y);
    var sum = y;
    var term = y;
    var k: i256 = 3;
    while (k <= 41) : (k += 2) {
        term = term.mul(y2);
        sum = sum.add(try2(term.div(Q128.fromInteger(k))));
    }
    return sum;
}

/// ln(x) = 2*atanh((x-1)/(x+1)).
fn lnQ(x: Q128) Q128 {
    const y = try2(x.sub(Q128.one).div(x.add(Q128.one)));
    return atanhQ(y).mul(Q128.fromInteger(2));
}

/// ln(7) via decomposition: ln(7) = 3*ln(2) + ln(7/8).
/// y(2) = 1/3, y(7/8) = -1/15 — both converge fast.
fn ln7() Q128 {
    const ln2 = lnQ(Q128.fromInteger(2));
    const ln78 = lnQ(try2(Q128.fromRatio(7, 8)));
    return ln2.mul(Q128.fromInteger(3)).add(ln78);
}

// CODATA 2022: alpha^-1 = 137.035999177 +/- 0.000000021
// represented scaled x1e9 as integers where needed.
const CODATA = 137_035_999_177; // x1e-9
const CODATA_SIGMA = 21; // x1e-9

// ============================ tests ============================

test "integer ln: ln(2) and ln(7) land on known values" {
    const ln2 = lnQ(Q128.fromInteger(2));
    // ln 2 = 0.693147...
    const lo = try2(Q128.fromRatio(69314, 100000));
    const hi = try2(Q128.fromRatio(69315, 100000));
    try std.testing.expect(ln2.raw > lo.raw and ln2.raw < hi.raw);
    const l7 = ln7();
    // ln 7 = 1.945910...
    const lo7 = try2(Q128.fromRatio(19459, 10000));
    const hi7 = try2(Q128.fromRatio(19460, 10000));
    try std.testing.expect(l7.raw > lo7.raw and l7.raw < hi7.raw);
}

test "corpus construction: 721/7 + 34 = 137 — 262 ppm off, CONSTRUCTION" {
    const val = Q128.fromInteger(721 / 7 + 34); // integer-exact = 137
    try std.testing.expectEqual(Q128.fromInteger(137).raw, val.raw);
    // ppm distance from CODATA: |137 - 137.035999177| / 137.036 ~ 262.7 ppm
    // scaled x1e9: |137e9 - 137035999177| = 35999177 -> 35999177/137035999 ~ 0.000263
    const diff: i256 = @abs(137_000_000_000 - CODATA);
    const ppm = @divTrunc(diff * 1_000_000, CODATA); // ~262
    try std.testing.expect(ppm > 250 and ppm < 275);
    // integer-exact AND wrong: the construction hits 137.000, nature
    // sits at 137.036 — filed CONSTRUCTION, as the audit already held.
}

test "Natural Path: 43*pi + ln(7) ~ 137.034 — the ~12 ppm claim verified" {
    const val = piQ().mul(Q128.fromInteger(43)).add(ln7());
    // 43*pi = 135.0884..., +1.945910 = 137.0343
    // ppm from CODATA: |137.0343 - 137.035999| ~ 0.0017 -> ~12 ppm
    const scaled: i256 = @intCast(val.mul(Q128.fromInteger(1_000_000_000)).toInteger());
    const diff: i256 = @intCast(@abs(scaled - CODATA));
    const ppm = @divTrunc(diff * 1_000_000, CODATA);
    try std.testing.expect(ppm >= 10 and ppm <= 15);
    // the literature's ~11.7 ppm claim is arithmetically real —
    // verified against CODATA 2022 in integer. Grade: the closed form
    // is 12-ppm-close but remains a fitted formula (no derivation of
    // WHY 43*pi + ln(7)) — LITERATURE-VERIFIED numerically,
    // mechanism-free.
}

test "APS sigma claim: |137.035999143 - 137.035999177| = 34e-9 = 1.62 sigma — verified" {
    const aps: i256 = 137_035_999_143;
    const diff: i256 = @abs(aps - CODATA); // 34e-9
    try std.testing.expectEqual(@as(i256, 34), diff);
    // sigma units: 34/21 = 1.619 -> their stated 1.62 sigma is EXACT
    const sigma_x100 = @divTrunc(diff * 100, CODATA_SIGMA);
    try std.testing.expect(sigma_x100 == 161 or sigma_x100 == 162);
    // the internal consistency of their claim checks arithmetically —
    // filed LITERATURE, mechanism not implemented (conference result).
}

test "filed verdict: three derivations, three grades — no free promotion" {
    // construction: exact-and-wrong (262 ppm) — CONSTRUCTION
    // Natural Path: 12-ppm closed form — LITERATURE-VERIFIED numerically
    // APS: 1.62-sigma claim arithmetic-verified — LITERATURE, pending mechanism
    // claim #36 stays PARTIAL: the candidates are catalogued and each
    // graded; none is a corpus-derived mechanism. The honest state.
    try std.testing.expect(true);
}
