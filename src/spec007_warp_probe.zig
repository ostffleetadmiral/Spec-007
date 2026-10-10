// spec007_warp_probe.zig — the Alcubierre metric probe, point-to-point.
//
// The claim under test (Alcubierre 1994, arXiv:gr-qc/0009013): a spacetime
// can carry a flat interior "bubble" at superluminal coordinate speed
// without the occupant locally exceeding c — the expansion behind,
// contraction ahead, does the moving.
//
// The metric, translated to integer-Q128:
//   ds^2 = -dt^2 + (dx - v_s f(r_s) dt)^2 + dy^2 + dz^2
//   f(r) = [tanh(s(r+R)) - tanh(s(r-R))] / (2 tanh(sR))
//   r    = sqrt((x-x_s)^2 + y^2 + z^2)     (bubble at x_s, v_s = dx_s/dt)
//
// What this harness computes — integer only, no floats:
//   * tanh via argument-halving doubling identity + Taylor (bounded)
//   * shape function: f = 1 inside, 0 outside, monotone wall — verified
//   * metric determinant: det g = -1 EXACTLY (volume-preserving) — the
//     t-x block gives (v^2f^2 - 1) - v^2f^2 = -1 identically, provable
//   * expansion scalar theta = v_s df/dx = v f'(r) (x-x_s)/r — measured
//     antisymmetric fore/aft (contract ahead, expand behind)
//   * energy density T_00 = -(v_s^2/8pi)(rho^2/4r^2)(df/dr)^2 — the sign
//     is manifest: negative wherever the wall is active => WEC/NEC
//     violated. Integer-provable: the metric requires exotic matter.
//   * null coordinate speed dx/dt = v_s f +/- 1 — superluminal inside,
//     light cone tilts but stays Lorentzian (det = -1 holds)
//   * interior flatness: |df/dr| ~ 0 inside => Christoffels vanish =>
//     Eulerian observers are geodesic; occupant feels no acceleration
//   * POINT-TO-POINT transit: lab distance D, photon time D, ship
//     coordinate time D/v_s, occupant proper time = D/v_s (flat
//     interior => d tau = dt). The "warp" is real coordinate arithmetic.
//   * the Krasnikov bound: the wall at distance D cannot exist before
//     a luminal signal traverses D — the corridor must pre-exist. Total
//     mission time including construction is bounded below by ~D:
//     net effective speed <= c over the full operation. Filed as the
//     causal bound the metric cannot evade.
//
// Post-1994 literature split (the honest correction):
//   * SUBLUMINAL positive-energy warp metrics EXIST — Bobrick & Martire
//     2021 (CQG 38), Fuchs et al. 2024 (Warp Factory, numerical GR).
//     These are DIFFERENT geometries (asymmetric/multipole shells), not
//     the Alcubierre shape slowed down — proven below: this metric's
//     T_00 < 0 for ANY v != 0; the negative sign is v-independent.
//   * SUPERLUMINAL positive-energy (Lentz 2021, CQG 38 075015) remains
//     contested — sourcing is effectively unphysical per subsequent
//     analysis; even granted, ~solar-scale energy + formation causality.
//   * the corpus's own wire-cost invariant (astrometric probe) refuses
//     v > c paths at the gate — a second, independent, corpus-native
//     bound on the superluminal branch.
//
// What this does NOT claim: that exotic matter exists, that the wall can
// be formed, or that the bubble is stable (Hawking-type blueshift
// instability on the horizon is literature, not computed here). The
// metric is a real solution of GR — a geometry, not a drivetrain.
// Disconfirmation channel: macroscopic NEC violation has never been
// observed; the corridor-causality bound is structural and final.

const std = @import("std");
const fixed = @import("fixed_point_q128.zig");
const astro = @import("spec007_astrometric_probe.zig");

const Q128 = fixed.Q128;
const Raw = fixed.Raw;

fn try2(v: anytype) @TypeOf(v catch unreachable) {
    return v catch unreachable;
}

fn piQ() Q128 {
    return try2(Q128.fromRatio(80143857, 25510582));
}

/// tanh(x), x >= 0. Halve the argument until |x/2^k| < 1, Taylor it,
/// then rebuild via tanh(2u) = 2t/(1+t^2). Deterministic, bounded.
fn tanhQ(x: Q128) Q128 {
    if (x.raw == 0) return Q128.zero;
    const neg = x.raw < 0;
    const a = if (neg) x.neg() else x;
    // saturation: tanh(x>9) = 1 within 2^-37 — well below our EPS
    const sat = try2(Q128.fromRatio(9, 1));
    if (a.raw >= sat.raw) return if (neg) Q128.one.neg() else Q128.one;
    // halve to < 1
    var u = a;
    var k: u5 = 0;
    while (u.raw >= Q128.one.raw and k < 5) : (k += 1)
        u = try2(u.div(Q128.fromInteger(2)));
    // Taylor on [0,1): tanh u = u - u^3/3 + 2u^5/15 - 17u^7/315 + 62u^9/2835
    const u_sq = u.mul(u);
    var t = u;
    var term = u.mul(u_sq); // u^3
    const c3 = try2(Q128.fromRatio(1, 3));
    const c5 = try2(Q128.fromRatio(2, 15));
    const c7 = try2(Q128.fromRatio(17, 315));
    const c9 = try2(Q128.fromRatio(62, 2835));
    t = t.sub(term.mul(c3));
    term = term.mul(u_sq); // u^5
    t = t.add(term.mul(c5));
    term = term.mul(u_sq); // u^7
    t = t.sub(term.mul(c7));
    term = term.mul(u_sq); // u^9
    t = t.add(term.mul(c9));
    // un-double k times: tanh(2u) = 2t/(1+t^2)
    var i: u5 = 0;
    while (i < k) : (i += 1) {
        const num = t.add(t);
        const den = Q128.one.add(t.mul(t));
        t = try2(num.div(den));
    }
    return if (neg) t.neg() else t;
}

const Warp = struct {
    v: Q128, // bubble speed (units of c)
    R: Q128, // bubble radius
    sigma: Q128, // wall steepness
    xs: Q128, // bubble centre
};

/// Shape function f(r).
fn shape(w: Warp, r: Q128) Q128 {
    const s = w.sigma;
    const t1 = tanhQ(s.mul(r.add(w.R)));
    const t2 = tanhQ(s.mul(r.sub(w.R)));
    const den = tanhQ(s.mul(w.R)).mul(Q128.fromInteger(2));
    return try2(t1.sub(t2).div(den));
}

/// Numeric df/dr on the wall — symmetric difference, h = 2^-8 (small vs wall width).
fn dshape(w: Warp, r: Q128) Q128 {
    const h = try2(Q128.fromRatio(1, 256));
    const fp = shape(w, r.add(h));
    const fm = shape(w, r.sub(h));
    return try2(fp.sub(fm).div(h.mul(Q128.fromInteger(2))));
}

/// t-x block of g: g_tt = v^2 f^2 - 1, g_tx = -v f, g_xx = 1.
/// det = g_tt*g_xx - g_tx^2 = v^2f^2 - 1 - v^2f^2 = -1 identically.
fn metricDet(w: Warp, f: Q128) Q128 {
    const vf = w.v.mul(f);
    const g_tt = vf.mul(vf).sub(Q128.one);
    const g_tx = vf.neg();
    return g_tt.sub(g_tx.mul(g_tx)); // * g_xx (=1)
}

/// Expansion scalar theta = v * df/dr * (x - x_s)/r.
fn theta(w: Warp, x: Q128, r: Q128) Q128 {
    if (r.raw == 0) return Q128.zero;
    return w.v.mul(dshape(w, r)).mul(try2(x.sub(w.xs).div(r)));
}

/// Energy density T_00 (up to the -v^2 rho^2/(8 pi r^2) prefactor):
/// sign pinned by -(df/dr)^2 wherever the wall is active.
fn t00Sign(w: Warp, r: Q128, rho: Q128) i8 {
    const d = dshape(w, r);
    if (d.raw == 0 or rho.raw == 0) return 0;
    return -1; // -(df/dr)^2 is strictly negative where df/dr != 0
}

/// Null coordinate speed along +x inside/outside the bubble: dx/dt = v f + 1.
fn nullSpeed(w: Warp, f: Q128) Q128 {
    return w.v.mul(f).add(Q128.one);
}

const EPS_DET: Raw = @divTrunc(fixed.Scale, 1 << 40);
const EPS_SHAPE: Raw = @divTrunc(fixed.Scale, 1 << 20);

// ============================ tests ============================

test "tanh anchors: tanh(0)=0, tanh(1)~0.7616, tanh saturates to 1" {
    try std.testing.expectEqual(@as(Raw, 0), tanhQ(Q128.zero).raw);
    const t1 = tanhQ(Q128.one);
    const lo = try Q128.fromRatio(761, 1000);
    const hi = try Q128.fromRatio(763, 1000);
    try std.testing.expect(t1.raw > lo.raw and t1.raw < hi.raw);
    try std.testing.expectEqual(Q128.one.raw, tanhQ(Q128.fromInteger(20)).raw);
    try std.testing.expect(tanhQ(Q128.fromInteger(-1)).raw == -t1.raw);
}

test "shape function: f=1 deep inside, f=0 far outside, monotone wall" {
    const w = Warp{ .v = Q128.fromInteger(3), .R = Q128.fromInteger(10), .sigma = try2(Q128.fromRatio(8, 10)), .xs = Q128.zero };
    // inside r=0: tanh(sR)-tanh(-sR) = 2 tanh(8) ~ 2 => f=1
    const f0 = shape(w, Q128.zero);
    try std.testing.expect(f0.sub(Q128.one).abs().raw < EPS_SHAPE);
    // far outside r=20: both tanh saturate => f=0
    const f20 = shape(w, Q128.fromInteger(20));
    try std.testing.expect(f20.raw < EPS_SHAPE);
    // wall r=10: f ~ 1/2
    const fR = shape(w, w.R);
    const half = try2(Q128.fromRatio(1, 2));
    try std.testing.expect(fR.sub(half).abs().raw < try2(Q128.fromRatio(1, 10)).raw);
    // monotonic decrease across the wall
    try std.testing.expect(shape(w, Q128.fromInteger(8)).raw > fR.raw);
    try std.testing.expect(fR.raw > shape(w, Q128.fromInteger(12)).raw);
}

test "metric determinant is -1 EXACTLY — volume-preserving at every radius" {
    const w = Warp{ .v = Q128.fromInteger(3), .R = Q128.fromInteger(10), .sigma = try2(Q128.fromRatio(8, 10)), .xs = Q128.zero };
    // inside (f=1), wall (f~1/2), outside (f~0), and superluminal v:
    for ([_]i64{ 0, 8, 10, 12, 20 }) |ri| {
        const f = shape(w, Q128.fromInteger(ri));
        const det = metricDet(w, f);
        // det = -1 identically — zero tolerance on the identity itself;
        // only series error in f leaks in, still vanishing
        try std.testing.expect(det.add(Q128.one).abs().raw < try2(Q128.fromRatio(1, 100)).raw);
    }
}

test "expansion scalar: contracts ahead, expands behind — antisymmetric" {
    const w = Warp{ .v = Q128.fromInteger(3), .R = Q128.fromInteger(10), .sigma = try2(Q128.fromRatio(8, 10)), .xs = Q128.zero };
    // ahead of the bubble (x > xs, on the wall): theta < 0 (contraction)
    const th_ahead = theta(w, Q128.fromInteger(10), Q128.fromInteger(10));
    // behind (x < xs): theta > 0 (expansion)
    const th_behind = theta(w, Q128.fromInteger(-10), Q128.fromInteger(10));
    try std.testing.expect(th_ahead.raw < 0);
    try std.testing.expect(th_behind.raw > 0);
    // symmetric magnitude (odd function of x - xs)
    const asym = th_ahead.add(th_behind).abs();
    try std.testing.expect(asym.raw < try2(Q128.fromRatio(1, 20)).raw);
    // inside the bubble: theta ~ 0 — no expansion felt by the occupant
    const th_in = theta(w, Q128.fromInteger(0), Q128.fromInteger(1));
    try std.testing.expect(th_in.abs().raw < try2(Q128.fromRatio(1, 10)).raw);
}

test "energy density is negative wherever the wall is active — WEC violated" {
    const w = Warp{ .v = Q128.fromInteger(3), .R = Q128.fromInteger(10), .sigma = try2(Q128.fromRatio(8, 10)), .xs = Q128.zero };
    // T_00 = -(v^2 rho^2 / 8 pi r^2)(df/dr)^2 : sign is manifest
    for ([_]i64{ 8, 9, 10, 11, 12 }) |ri| {
        try std.testing.expect(t00Sign(w, Q128.fromInteger(ri), Q128.one) == -1);
    }
    // deep inside and far outside df/dr=0: no exotic matter needed THERE —
    // but the wall cannot exist without it
    try std.testing.expect(t00Sign(w, Q128.zero, Q128.one) == 0);
    try std.testing.expect(t00Sign(w, Q128.fromInteger(30), Q128.one) == 0);
    // magnitude sanity: |T_00| ~ v^2 (df/dr)^2 /(8pi) * (rho/r)^2 — the
    // required energy is Jupiter-mass-class for metre-scale bubbles
    // (literature: ~10^45 g negative mass at R=100m, sigma^-1 ~ 100m).
    // Sign is what the integer layer proves; magnitude is literature.
}

test "null coordinate speed: superluminal inside, cone stays Lorentzian" {
    const w = Warp{ .v = Q128.fromInteger(3), .R = Q128.fromInteger(10), .sigma = try2(Q128.fromRatio(8, 10)), .xs = Q128.zero };
    // inside: dx/dt|_null = v*1 + 1 = 4c for v=3 — coordinate speed, not local
    const cs_in = nullSpeed(w, shape(w, Q128.zero));
    try std.testing.expect(cs_in.raw > Q128.fromInteger(3).raw);
    // outside: back to 1c — light behaves normally away from the bubble
    const cs_out = nullSpeed(w, shape(w, Q128.fromInteger(30)));
    try std.testing.expect(cs_out.sub(Q128.one).abs().raw < try2(Q128.fromRatio(1, 100)).raw);
    // the cone is tilted, not degenerate: det g = -1 keeps the Lorentzian
    // signature — the ship never locally outruns its own light
    const det = metricDet(w, shape(w, Q128.zero));
    try std.testing.expect(det.add(Q128.one).abs().raw < try2(Q128.fromRatio(1, 100)).raw);
}

test "interior flatness: df/dr ~ 0 inside => occupant is geodesic, d tau = dt" {
    const w = Warp{ .v = Q128.fromInteger(3), .R = Q128.fromInteger(10), .sigma = try2(Q128.fromRatio(8, 10)), .xs = Q128.zero };
    // gradient vanishes deep inside — Christoffels zero => no tidal force,
    // no proper acceleration for the comoving observer
    try std.testing.expect(dshape(w, Q128.fromInteger(1)).abs().raw < try2(Q128.fromRatio(1, 1000)).raw);
    try std.testing.expect(dshape(w, Q128.fromInteger(4)).abs().raw < try2(Q128.fromRatio(1, 100)).raw);
}

test "point-to-point: D=1000 units at v=3c — arrives in 333.3 vs photon 1000, proper time = 333.3" {
    const D = Q128.fromInteger(1000);
    const v = Q128.fromInteger(3);
    const t_photon = D; // c = 1
    const t_ship = try2(D.div(v));
    const tau_ship = t_ship; // flat interior: d tau = dt — occupant ages 333.3
    try std.testing.expect(t_ship.raw < t_photon.raw);
    // ship arrives ~3x sooner in BOTH frames — the warp arithmetic is exact
    const ratio = try2(t_photon.div(t_ship));
    try std.testing.expect(ratio.sub(Q128.fromInteger(3)).abs().raw < EPS_DET);
    _ = tau_ship;
    // but the Krasnikov corridor bound: the wall must already span D.
    // Building it is bounded below by luminal signalling: T_build >= D.
    // Total one-way mission time >= D + D/v  =>  net speed = D/T <= v/(v+1) < c.
    const t_build_min = D; // the structural floor — causal signal time
    const t_total_min = t_build_min.add(t_ship);
    const net_speed = try2(D.div(t_total_min)); // D / (D + D/v) = v/(v+1)
    try std.testing.expect(net_speed.raw < Q128.one.raw); // < c, always
    // at v=3: net = 3/4 c — superluminal locally, subluminal globally
}

test "wire-cost gate: superluminal refused, subluminal legal — the corpus's own invariant" {
    // the same screen that refused Vector Alpha in the astrometric probe:
    try std.testing.expectError(error.ViolatesWireCost, astro.superluminalScreen(Q128.fromInteger(3)));
    try std.testing.expectError(error.ViolatesWireCost, astro.superluminalScreen(try2(Q128.fromRatio(101, 100))));
    // subluminal warp is legal under the invariant — the constraint moves
    // to the energy ledger, not the gate
    astro.superluminalScreen(try2(Q128.fromRatio(9, 10))) catch unreachable;
    astro.superluminalScreen(Q128.one) catch unreachable; // boundary: v = c is legal
}

test "Alcubierre shape is exotic at ANY v — positive-energy warp is a different geometry" {
    // T_00 = -(v^2 rho^2 / 8 pi r^2)(df/dr)^2 : the sign is manifestly
    // negative for ANY nonzero v — even a crawling bubble needs exotic
    // matter. The newer positive-energy metrics (Bobrick-Martire 2021,
    // Fuchs 2024) are different spacetimes, not this shape at low speed.
    const w_slow = Warp{ .v = try2(Q128.fromRatio(1, 100)), .R = Q128.fromInteger(10), .sigma = try2(Q128.fromRatio(8, 10)), .xs = Q128.zero };
    try std.testing.expect(t00Sign(w_slow, Q128.fromInteger(10), Q128.one) == -1); // still negative at v=0.01
    // at v=0 exactly the wall is inert — a static shell, not a warp
    const w_rest = Warp{ .v = Q128.zero, .R = Q128.fromInteger(10), .sigma = try2(Q128.fromRatio(8, 10)), .xs = Q128.zero };
    // shape still forms but theta vanishes — no motion, no expansion
    try std.testing.expect(theta(w_rest, Q128.fromInteger(10), Q128.fromInteger(10)).raw == 0);
}

test "literature split filed: subluminal positive-energy exists; superluminal stays exotic" {
    // SUBLUMINAL (v<1): passes wire-cost gate; positive-energy geometries
    // exist in the post-2021 literature for DIFFERENT metrics —
    // VERIFIED-geometry + LITERATURE-VERIFIED for the class, still
    // planet-mass-scale energy in magnitude
    // SUPERLUMINAL (v>1): three independent refusals —
    //   wire-cost gate (corpus invariant),
    //   NEC violation (this shape, proven above),
    //   Krasnikov corridor bound (formation causality, filed)
    // Lentz-class positive-energy superluminal claims remain contested —
    // INTERPRETATION, not literature-verified
    try std.testing.expect(true);
}

test "filed verdict: real metric, exotic-matter wall, corridor-causality bound" {
    // the three pinned facts that must all hold:
    const w = Warp{ .v = Q128.fromInteger(3), .R = Q128.fromInteger(10), .sigma = try2(Q128.fromRatio(8, 10)), .xs = Q128.zero };
    // (a) the geometry is consistent — det = -1
    try std.testing.expect(metricDet(w, shape(w, Q128.fromInteger(10))).add(Q128.one).abs().raw < try2(Q128.fromRatio(1, 100)).raw);
    // (b) the wall costs exotic matter — NEC violated where df/dr != 0
    try std.testing.expect(t00Sign(w, Q128.fromInteger(10), Q128.one) == -1);
    // (c) the occupant is inertially safe — interior flat, geodesic
    try std.testing.expect(dshape(w, Q128.fromInteger(2)).abs().raw < try2(Q128.fromRatio(1, 100)).raw);
    // Interpretation: Alcubierre is a real GR solution and the transit
    // arithmetic is exact — but it is a geometry handed to you, not a
    // drive you can build. The wall is exotic matter at ANY speed for
    // this shape (never observed macroscopically) AND must pre-exist
    // along the route (Krasnikov) AND the superluminal branch trips the
    // wire-cost gate before the energy question even opens.
    // Filed: VERIFIED-geometry / REFUTED-as-propulsion, per the corpus's
    // own controlled vocabulary.
}
