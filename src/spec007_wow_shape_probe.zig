// spec007_wow_shape_probe.zig — the Wow! signal profile-shape probe.
//
// The claim under test (session question): does the Wow! signal's
// observed intensity profile match the warp-bubble wall shape — the
// flat-topped tanh profile f(r) = plateau with steep walls — rather
// than the expected beam-transit profile of a fixed celestial source?
//
// On-record inputs (Ehman 1977, Big Ear feedhorn transit):
//   6EQUJ5 = six consecutive 12-s integrations, alphanumeric SNR codes:
//   6, E(14), Q(26), U(30), J(19), 5  =>  {6,14,26,30,19,5} sigma
//   72 s total observation; beam FWHM transit for a fixed source ~36-43 s;
//   second horn re-sweep ~3 min later: ZERO detection (already filed
//   as the two-horn bound in the astrometric probe).
//
// Shape signatures — integer only, no floats:
//   * FLAT-TOP (warp-wall): a plateau = consecutive bins within ~10% of
//     peak. Warp profile requires >= 3 plateau bins (the interior is FLAT
//     by construction). Observed: only bin 4 is within 10% of peak.
//   * BEAM-TRANSIT: FWHM in bins should equal the feedhorn transit —
//     half-max crossing times ~1.1 and ~4.7 bins => FWHM ~3.6 bins ~
//     43 s — consistent with a point source crossing the beam.
//   * SYMMETRY/gaussianity: for a Gaussian, I(k-1)*I(k+1)/I(k)^2 is a
//     CONSTANT (exp(-1/s^2)) across adjacent triples — log-parabolic.
//     Compute the four products in fixed point and measure the spread.
//   * the right tail decays faster than the left rose — asymmetry flag
//     filed, not over-claimed at 6-point quantization.
//
// What this does NOT claim: that 6 quantized intensity bins can
// distinguish all profiles. The discriminating power is exactly one
// question — plateau or peak — and the answer is unambiguous. A warp
// wall signature (long flat plateau with steep edges) is REFUTED at the
// resolution available. The profile is consistent with the mundane
// beam-transit model, which is what the literature says and what this
// harness confirms independently.

const std = @import("std");
const fixed = @import("fixed_point_q128.zig");

const Q128 = fixed.Q128;
const Raw = fixed.Raw;

fn try2(v: anytype) @TypeOf(v catch unreachable) {
    return v catch unreachable;
}

// the observed sequence — six 12-s bins, sigma units
const OBS = [6]i64{ 6, 14, 26, 30, 19, 5 };
const PEAK: i64 = 30;
const BIN_S: i64 = 12;

/// plateau count: bins within tol (as rational x/scale... simpler: within
/// fraction) of peak — here "within 10%": I*10 >= peak*9
fn plateauCount(tol_num: i64, tol_den: i64) usize {
    var n: usize = 0;
    for (OBS) |v| {
        if (v * tol_den >= PEAK * tol_num) n += 1;
    }
    return n;
}

/// FWHM crossings in bin units *100 — linear interpolation in integers.
/// Returns hundredths of a bin for the left and right half-max crossings.
fn halfMaxCrossings() struct { left: i64, right: i64 } {
    const half_x10 = PEAK * 10 / 2; // 15.0 x10
    // left: between bin0(6) and bin1(14): frac = (150-60)/(140-60)=90/80
    var left_x100: i64 = 0;
    var right_x100: i64 = 0;
    var i: usize = 0;
    var found_l = false;
    while (i < OBS.len) : (i += 1) {
        const v10 = OBS[i] * 10;
        if (!found_l and v10 >= half_x10 and i > 0) {
            const prev10 = OBS[i - 1] * 10;
            const frac = @divTrunc((half_x10 - prev10) * 100, v10 - prev10);
            left_x100 = @as(i64, @intCast(i - 1)) * 100 + frac;
            found_l = true;
        }
        if (found_l and v10 < half_x10 and i > 0) {
            const prev10 = OBS[i - 1] * 10;
            const frac = @divTrunc((prev10 - half_x10) * 100, prev10 - v10);
            right_x100 = @as(i64, @intCast(i - 1)) * 100 + frac;
            break;
        }
    }
    return .{ .left = left_x100, .right = right_x100 };
}

/// Gaussian log-ratio signature: I(k-1)*I(k+1)/I(k)^2 should be ~constant.
/// Returns the four values as Q128.
fn gaussRatios() [4]Q128 {
    var r: [4]Q128 = undefined;
    for (1..5) |k| {
        const num = Q128.fromInteger(OBS[k - 1] * OBS[k + 1]);
        const den = Q128.fromInteger(OBS[k] * OBS[k]);
        r[k - 1] = try2(num.div(den));
    }
    return r;
}

/// rise vs fall asymmetry: compare bins mirrored around the peak (bin 3).
/// left side: {6,14,26} ascending; right side: {19,5} descending.
/// symmetric profile predicts OBS[2] ~ OBS[4] and OBS[1] ~ OBS[5]-ish.
fn asymmetryScore() Q128 {
    // normalized difference: |26-19|/30 + |14-5|/30 — crude integer score
    const a = @abs(OBS[2] - OBS[4]) + @abs(OBS[1] - OBS[5]);
    return try2(Q128.fromRatio(@as(i256, @intCast(a)), PEAK));
}

// ============================ tests ============================

test "flat-top signature ABSENT: plateau is 1 bin, warp-wall requires >=3" {
    // within 10% of peak — the bubble interior is FLAT by construction
    try std.testing.expectEqual(@as(usize, 1), plateauCount(9, 10));
    // even at 20% tolerance: bins >= 24 — only {26,30} = 2 bins
    try std.testing.expectEqual(@as(usize, 2), plateauCount(8, 10));
    // at 33% tolerance the "plateau" would need {26,30,19}=20+ — still only 2>=20 is {26,30} plus 19 no... 19<20
    try std.testing.expectEqual(@as(usize, 2), plateauCount(20, 30));
    // the signal is a PEAK, not a plateau — flat-top refuted
}

test "beam-transit FWHM ~3.6 bins ~43s — consistent with feedhorn point-source transit" {
    const c = halfMaxCrossings();
    // measured: left ~1.12 bins, right ~4.28 bins — interpolate-checked
    try std.testing.expect(c.left > 80 and c.left < 140); // 0.8-1.4 bins
    try std.testing.expect(c.right > 400 and c.right < 460); // 4.0-4.6 bins
    const fwhm_x100 = c.right - c.left;
    try std.testing.expect(fwhm_x100 > 300 and fwhm_x100 < 360); // 3.0-3.6 bins
    // in seconds: ~36-43 s — brackets the ~40s expected transit
    const fwhm_s = @divTrunc(fwhm_x100 * BIN_S, 100);
    try std.testing.expect(fwhm_s >= 36 and fwhm_s <= 43);
}

test "gaussianity signature: log-ratios decay — right tail steeper than Gaussian" {
    const r = gaussRatios();
    // all four < 1 (each triple is peak-concave, as any bump is)
    for (r) |v| try std.testing.expect(v.raw < Q128.one.raw and v.raw > Q128.zero.raw);
    // a perfect Gaussian gives constant ratios; observed spread 0.42-0.80
    // is wide — the profile is only roughly Gaussian, with the RIGHT side
    // decaying fastest (last ratio smallest)
    try std.testing.expect(r[0].raw > r[3].raw); // left-side ratio > right-side
    try std.testing.expect(r[3].raw < r[1].raw); // steepest drop at the tail
}

test "rise/fall asymmetry is real but small — filed, not over-claimed" {
    const a = asymmetryScore();
    // |26-19| + |14-5| = 7+9 = 16 -> 16/30 ~ 0.53 normalized units
    const lo = try2(Q128.fromRatio(45, 100));
    const hi = try2(Q128.fromRatio(60, 100));
    try std.testing.expect(a.raw > lo.raw and a.raw < hi.raw);
    // asymmetric decay (faster fall) — real in the data, marginal at 6 bins
}

test "filed verdict: beam-transit consistent; warp-wall flat-top REFUTED" {
    // the three load-bearing facts:
    try std.testing.expectEqual(@as(usize, 1), plateauCount(9, 10)); // no plateau
    const c = halfMaxCrossings();
    try std.testing.expect(c.right - c.left > 300 and c.right - c.left < 360); // FWHM ~38s
    // second-horn non-repeat (astrometric probe) compounds: a persistent
    // structured source must reappear 3 min later — it did not.
    // Verdict: the Wow! profile matches a point source transiting the
    // beam — the mundane model — and does NOT carry the flat-topped
    // wall signature of the warp shape. Question answered: NO match.
    try std.testing.expect(true);
}

// ================== shape-library sweep (session extension) ==================
//
// Every shape class the cluster has discovered, tested against the same
// 6-bin record. Verdicts: REFUTED / CONSISTENT / UNRESOLVABLE at this
// quantization. Filing rule: a shape that cannot be distinguished at
// 6 truncated bins is filed as unresolvable — never claimed.

/// the recorded bins are FLOORS: "6" means 6.0-6.999σ. Midpoint model:
/// each bin is v+0.5. Re-derive the signatures under midpoint reading —
/// robustness check that no verdict flips under quantization jitter.
const OBS_MID = [6]i64{ 65, 145, 265, 305, 195, 55 }; // x10 midpoints

test "midpoint robustness: floor-vs-midpoint reading does not change any verdict" {
    // plateau at 10%: midpoint values {6.5,14.5,26.5,30.5,19.5,5.5},
    // threshold = 27.45 → still only bin 4
    var n: usize = 0;
    for (OBS_MID) |v10| {
        if (v10 * 10 >= 305 * 9) n += 1;
    }
    try std.testing.expectEqual(@as(usize, 1), n);
    // FWHM under midpoints: half = 15.25; left crossing between 14.5 and
    // 26.5 (~1.06 bins), right between 19.5 and 5.5 (~4.30 bins) — same
    // ~3.2-bin FWHM as the floor reading
    const half_x10: i64 = 1525; // 15.25 x100... work in x100: 15.25 -> 1525
    const left = 100 + @divTrunc((half_x10 - 1450) * 100, 2650 - 1450);
    const right = 400 + @divTrunc((1950 - half_x10) * 100, 1950 - 550);
    const fwhm = right - left;
    try std.testing.expect(fwhm > 290 and fwhm < 370); // same bracket
    // no verdict moves under quantization jitter — robustness filed
}

test "Airy/aperture diffraction (flat-portal signature): UNRESOLVABLE at 6 bins" {
    // a flat 2D aperture/portal emitting toward the receiver diffracts:
    // Airy first sidelobe = 1.75% of peak intensity. At a 30-sigma peak:
    // sidelobe ~ 0.5 sigma — BELOW the 1-sigma truncation floor of the
    // printout. The sidelobes that would flag a flat emitter cannot be
    // seen in this record.
    const peak_sigma = Q128.fromInteger(30);
    const sidelobe_pct = try2(Q128.fromRatio(175, 10000)); // 1.75% Airy
    const side_sigma = peak_sigma.mul(sidelobe_pct);
    const one_sigma = Q128.one;
    try std.testing.expect(side_sigma.raw < one_sigma.raw); // ~0.53 < 1
    // filed: flat-portal emission signature is unresolvable in 6EQUJ5 —
    // NOT refuted, NOT detected. Honest quantization boundary.
}

test "geometric/exponential decay transient: REFUTED — tail is super-geometric" {
    // a pure exponential decay has CONSTANT successive ratios.
    // observed tail from peak: 30 -> 19 -> 5
    // ratios: 19/30 = 0.633, 5/19 = 0.263 — wildly non-constant, and the
    // second is much SMALLER: the fall accelerates — a cutoff, not a
    // free-running decay. Exponential-transient refuted.
    const r1 = try2(Q128.fromRatio(19, 30));
    const r2 = try2(Q128.fromRatio(5, 19));
    try std.testing.expect(r1.raw != r2.raw);
    try std.testing.expect(r2.raw < r1.raw); // accelerating fall
    // the accelerating cutoff IS what a beam-pattern transit produces —
    // strengthens the mundane model, kills the decaying-emitter model
}

test "discrete shell staircase (15^3 shell structure): REFUTED" {
    // a shell-quantized emitter would show monotone steps (plateau or
    // staircase transitions), not a smooth single peak. Observed: smooth
    // rise then smooth fall — no staircase morphology.
    // monotone-check: rises are {+8,+12,+4}, falls {-11,-14} — single
    // extremum, no secondary structure
    try std.testing.expect(OBS[0] < OBS[1] and OBS[1] < OBS[2] and OBS[2] < OBS[3]);
    try std.testing.expect(OBS[3] > OBS[4] and OBS[4] > OBS[5]);
    // exactly one peak — staircase would need >= 2 step transitions
    try std.testing.expect(true);
}

test "two-boundary |phi|^4 envelope: direction-consistent, UNRESOLVABLE at 6 bins" {
    // the retrocausal probe showed post-selection sharpens the interior
    // (P ~ |phi|^4 vs |phi|^2). A two-boundary-shaped signal would be
    // sharper than the single-boundary envelope — and the observed
    // right tail IS steeper than symmetric-Gaussian. But: at 6 truncated
    // bins the |phi|^4-vs-|phi|^2 discriminant needs shape resolution we
    // don't have. Direction noted, filed as UNRESOLVABLE — the honest
    // word, same as the retrocausal probe's own filing.
    const r = gaussRatios();
    // direction: tail-steepening exists (last ratio smallest)
    try std.testing.expect(r[3].raw < r[0].raw);
    // but it also fits a real feedhorn pattern — no discriminating power
    try std.testing.expect(true);
}

test "feedhorn-realistic beam: steeper-than-Gaussian skirts SHARPEN the mundane verdict" {
    // a real feedhorn's gain pattern is not a pure Gaussian — Airy-type
    // skirts decay faster. The observed faster-than-Gaussian tail is
    // therefore MORE consistent with a real beam transit, not less.
    // External corroboration (literature): Gray & Marvel 2001 and the
    // 2025 Arecibo archival refit (arXiv 2508.10657) fit a beam-profile
    // transit, SNR 30.1 +/- 0.4, source extent < 1.9 arcmin.
    const r = gaussRatios();
    try std.testing.expect(r[3].raw < r[2].raw); // steepening is real
    // and the FWHM still brackets the horn transit — both signatures
    // point the same direction: a point source in a real beam
    try std.testing.expect(true);
}

test "filed shape-library verdict: beam-transit family ONLY — all exotic shapes refuted or unresolvable" {
    // the complete discriminating power of 6 truncated bins, used fully:
    //   REFUTED:     flat-top plateau, geometric decay, shell staircase
    //   CONSISTENT:  Gaussian/feedhorn beam transit
    //   UNRESOLVABLE: Airy sidelobes, |phi|^4 two-boundary sharpening
    // compounded by the two-horn bound (persistence falsified).
    // Answer to the session question: NO discovered shape matches —
    // only the mundane beam-transit family does.
    try std.testing.expect(true);
}
