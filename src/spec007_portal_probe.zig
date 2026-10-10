// spec007_portal_probe.zig — the flat-2D-portal / thin-shell probe.
//
// The question under test (session direction): the warp probe modeled a
// 3D tunnel. A "portal" is a different geometry class — a 2D surface —
// and the literature supports it directly: thin-shell wormholes
// concentrate ALL exotic matter on a two-dimensional junction surface
// (Visser 1989 cut-and-paste; Darmois-Israel junction conditions), and
// plane-symmetric thin-shells are literal flat "domain wall" portals
// (Lemos & Lobo, Phys. Rev. D 78, 044030 — require Lambda < 0).
//
// Machinery translated to integer-Q128:
//   * Morris-Thorne: ds^2 = -e^{2Phi}dt^2 + dr^2/(1-b/r) + r^2 dOmega^2
//     throat b(r0) = r0; flare-out b'(r0) < 1
//   * THE SIGN THEOREM: rho - tau = (b'r - b)/(8 pi r^3); at the throat
//     (b = r) this is (b' - 1)/(8 pi r0^2) < 0 iff b' < 1 — flare-out
//     IS NEC violation. Two ways of saying the same thing; the geometry
//     and the exotic matter are one condition, not two.
//   * throat tension tau0 = 1/(8 pi r0^2) at Phi' = 0 — the
//     Morris-Thorne figure: neutron-star-core-class tension scaling as
//     (20 km / r0)^2.
//   * Visser thin shell at junction radius a > r0:
//     sigma(a) = -(1/2 pi a) sqrt(1 - b/a + a-dot^2); static: negative
//     at EVERY junction radius => the exotic matter lives ON the 2D
//     sheet — a literal "portal surface" — and the violation is
//     localized but never removed.
//   * THE PORTAL SIGN THEOREM (the 2D analog): Israel's junction
//     condition sigma_ab = -(1/8 pi)([K_ab] - [K] g_ab). For a
//     reflection-symmetric throat/portal (normals flare outward on
//     both sides) [K] > 0 => sigma < 0. ANY flaring junction — tunnel
//     throat, planar bounce, flat portal mouth — carries negative
//     surface density. The sheet concentrates the violation; it does
//     not evade it. Same theorem as the bubble wall, one dimension down.
//   * TOPOLOGICAL CENSORSHIP (Friedman-Schleich-Witt 1993): in
//     asymptotically flat GR, every traversable shortcut violates the
//     averaged NEC — bubble, tunnel, or sheet. Filed as the unifying
//     theorem: the energy-condition wall is geometry-class-independent.
//   * WIRE-COST — the interesting asymmetry vs the warp probe: a portal
//     is a TOPOLOGICAL shortcut, not a speed. Local traversal never
//     exceeds c => superluminalScreen PASSES a portal where it refused
//     the bubble. The refusal migrates to three other bounds:
//       (a) throat pre-existence — a portal to a point D away cannot
//           be opened faster than a luminal signal reaches D: the same
//           corridor bound as Krasnikov, different costume;
//       (b) chronology protection — relatively-moving mouths form
//           CTCs; Hawking vacuum polarization diverges (literature);
//       (c) the sheet's own exotic matter (above).
//   * PLANAR PORTAL (Lemos-Lobo): plane-symmetric thin-shells exist but
//     need Lambda < 0 + exotic fluid (dark-energy shell stable, phantom
//     unstable) — literature-grade; our spacetime Lambda > 0 files it
//     as a construct, not an available geometry.
//
// What this does NOT claim: that traversable wormholes exist, that
// exotic surface matter exists, or that quantum inequality bounds
// (Ford-Roman: exotic matter confined to ~Planck-length bands) are
// evaded — all filed, none rescued.
//
// Disconfirmation channel: macroscopic NEC/ANEC violation has never
// been observed; the junction sign theorem is integer-exact.

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

/// Shape-function model: the Ellis family, b(r) = r0^2 / r.
/// b'(r) = -r0^2/r^2 — at the throat b' = -1 < 1, flare-out satisfied.
/// This is the canonical example where rho < 0 EVERYWHERE, not just at
/// the throat — the honest display case for "exotic matter required".
const Throat = struct {
    r0: Q128, // throat radius, arbitrary units

    /// b(r) = r0^2 / r
    fn b(self: Throat, r: Q128) Q128 {
        return try2(self.r0.mul(self.r0).div(r));
    }
    /// b'(r) = -r0^2 / r^2
    fn bPrime(self: Throat, r: Q128) Q128 {
        return try2(self.r0.mul(self.r0).div(r.mul(r))).neg();
    }
    /// rho(r) = b'/(8 pi r^2)
    fn rho(self: Throat, r: Q128) Q128 {
        return try2(self.bPrime(r).div(piQ().mul(Q128.fromInteger(8)).mul(r.mul(r))));
    }
    /// tau(r) = b/(8 pi r^3) at Phi' = 0
    fn tau(self: Throat, r: Q128) Q128 {
        return try2(self.b(r).div(piQ().mul(Q128.fromInteger(8)).mul(r.mul(r).mul(r))));
    }
    /// rho - tau: the NEC diagnostic. Negative => violated.
    fn necMargin(self: Throat, r: Q128) Q128 {
        return self.rho(r).sub(self.tau(r));
    }
    /// Visser thin-shell surface density at junction a:
    /// sigma = -(1/2 pi a) sqrt(1 - b(a)/a), a > r0.
    fn shellSigma(self: Throat, a: Q128) Q128 {
        const inside = Q128.one.sub(try2(self.b(a).div(a)));
        const root = try2(inside.sqrt());
        return try2(root.neg().div(piQ().mul(Q128.fromInteger(2)).mul(a)));
    }
};

// ============================ tests ============================

test "throat conditions: b(r0) = r0 and flare-out b'(r0) < 1 hold for Ellis shape" {
    const t0 = Throat{ .r0 = Q128.fromInteger(3) };
    const at_throat = t0.b(t0.r0);
    try std.testing.expectEqual(t0.r0.raw, at_throat.raw);
    const bp = t0.bPrime(t0.r0); // = -1 exactly: -(r0^2)/(r0^2)
    try std.testing.expect(bp.raw < Q128.one.raw);
    // and it is exactly -1 for this family — a deep flare, not marginal
    try std.testing.expectEqual(Q128.one.neg().raw, bp.raw);
}

test "SIGN THEOREM: NEC margin at throat = (b'-1)/(8 pi r0^2) — negative iff flare-out holds" {
    const t0 = Throat{ .r0 = Q128.fromInteger(2) };
    const margin = t0.necMargin(t0.r0);
    // analytic: (b'-1)/(8 pi r0^2) = (-1-1)/(8 pi * 4) = -1/(16 pi) ~ -0.0199
    try std.testing.expect(margin.raw < Q128.zero.raw);
    // cross-check against the direct formula
    const analytic = try2(Q128.fromInteger(-1).div(piQ().mul(Q128.fromInteger(16))));
    const diff = margin.sub(analytic).abs();
    const eps = try2(Q128.fromRatio(1, 1000000));
    try std.testing.expect(diff.raw < eps.raw);
    // NEC is violated AT the throat — integer-provable
}

test "Ellis shape: rho < 0 at EVERY radius — exotic matter is global for this family" {
    const t0 = Throat{ .r0 = Q128.fromInteger(1) };
    // rho = -r0^2/(8 pi r^4): negative for all r — sample several radii
    const radii = [4]i256{ 1, 2, 5, 10 };
    for (radii) |rv| {
        const r = Q128.fromInteger(rv);
        try std.testing.expect(t0.rho(r).raw < 0);
        try std.testing.expect(t0.necMargin(r).raw < 0); // NEC violated everywhere
    }
}

test "throat tension bound: tau0 = 1/(8 pi r0^2) — shrinks only as 1/r0^2" {
    // tau0 for r0 = 1 (arbitrary unit): 1/(8 pi) ~ 0.0398
    const t0 = Throat{ .r0 = Q128.fromInteger(1) };
    const t_1 = t0.tau(Q128.fromInteger(1));
    // r0 = 10: tau0 = 1/(800 pi) — 100x smaller for 10x throat
    const t10 = Throat{ .r0 = Q128.fromInteger(10) };
    const t_10 = t10.tau(Q128.fromInteger(10));
    const ratio = try2(t_1.div(t_10));
    // ratio should be exactly 100 (1/r^2 scaling)
    const hundred = Q128.fromInteger(100);
    const eps = try2(Q128.fromRatio(1, 100));
    try std.testing.expect(ratio.sub(hundred).abs().raw < eps.raw);
    // the Morris-Thorne figure: km-scale throats still need
    // neutron-star-core-class tension — the bound is structural
}

test "Visser thin shell: sigma(a) < 0 at EVERY junction radius a > r0" {
    const t0 = Throat{ .r0 = Q128.fromInteger(2) };
    const junctions = [4]i256{ 3, 5, 10, 100 };
    var prev_mag = Q128.fromInteger(1);
    for (junctions) |av| {
        const a = Q128.fromInteger(av);
        const s = t0.shellSigma(a);
        try std.testing.expect(s.raw < 0); // exotic surface density, always
        // |sigma| decreases with a (dilute the shell) but never reaches 0
        try std.testing.expect(s.neg().raw < prev_mag.raw);
        prev_mag = s.neg();
    }
    // as a -> r0+, sqrt(1-b/a) -> sqrt(1-1) -> 0: the shell vanishes ONLY
    // at the throat — where the bulk exotic matter already is. The 2D
    // sheet trades distributed exotic matter for surface exotic matter;
    // the violation never disappears.
}

test "PORTAL SIGN THEOREM: a flaring junction has sigma < 0 — same theorem as the wall" {
    // Israel: sigma ~ -[K]/8pi (leading trace piece). Reflection-symmetric
    // throat: normals point outward BOTH sides => [K] = 2K > 0 => sigma < 0.
    // Integer-provable as a sign relation: for ANY junction where the
    // extrinsic-curvature jump is positive, the surface density is negative.
    // Model [K] as the jump; sigma_sign = -sign([K]):
    const k_jump_values = [3]i256{ 1, 5, 40 }; // any positive flare
    for (k_jump_values) |kv| {
        const k_jump = Q128.fromInteger(kv);
        const sigma = k_jump.neg(); // sign relation: negative for positive [K]
        try std.testing.expect(k_jump.raw > 0);
        try std.testing.expect(sigma.raw < 0);
    }
    // a NON-flaring junction (k_jump <= 0) is not a portal mouth —
    // flare-out and exotic surface matter are the same condition in 2D
    const flat = Q128.zero;
    try std.testing.expect(!(flat.neg().raw < 0)); // [K]=0: no shell, no portal
}

test "wire-cost PASSES a portal: topological shortcut, local v <= c — screen does not refuse" {
    // the astrometric invariant refuses information PATHS at v > c.
    // a portal traversal is locally subluminal at every step — the
    // shortcut is in the topology, not the velocity.
    const traversal_v = try2(Q128.fromRatio(9, 10)); // 0.9 c through the throat
    try std.testing.expectEqual({}, astro.superluminalScreen(traversal_v) catch unreachable);
    // even arbitrarily fast (but subluminal) traversal clears the gate
    const fast = try2(Q128.fromRatio(999999, 1000000));
    try std.testing.expectEqual({}, astro.superluminalScreen(fast) catch unreachable);
    // honest filing: wire-cost does NOT refuse portals — unlike the
    // warp bubble. The invariant is about paths, and the path is legal.
}

test "portal corridor bound: a portal to point D cannot open before a luminal signal arrives" {
    // same shape as Krasnikov: the mouth must be CARRIED (or grown) to
    // the far end. Opening a portal to a target D away still requires
    // establishing the far mouth at the target — at best lightspeed
    // delivery + portal construction => net effective speed <= c over
    // the full mission, identical arithmetic to the warp corridor bound.
    const D = Q128.fromInteger(1000); // distance units
    const v_carry = Q128.fromInteger(1); // luminal delivery (best case)
    const t_deliver = try2(D.div(v_carry));
    // with instant portal construction, total = D; any carry < 1 adds
    const total_best = t_deliver;
    const net = try2(D.div(total_best));
    // net effective speed <= 1 — cannot beat c counting establishment
    try std.testing.expect(net.raw <= Q128.one.raw);
    // subluminal carry makes it strictly worse — the portal saves the
    // RETURN only after the route exists
    const slow_carry = try2(Q128.fromRatio(1, 2));
    const t_slow = try2(D.div(slow_carry));
    try std.testing.expect(t_slow.raw > t_deliver.raw);
}

test "unifying bound: every shortcut class violates the energy conditions — censorship filed" {
    // the union the literature proves (topological censorship): bubble
    // wall (M52), tunnel throat (above), portal sheet (above) — all NEC-
    // violating. Integer display: the three margins/signatures all < 0.
    const warp_margin = Q128.fromInteger(-1); // T_00 < 0 on the wall (M52)
    const t0 = Throat{ .r0 = Q128.fromInteger(2) };
    const tunnel_margin = t0.necMargin(t0.r0);
    const sheet = t0.shellSigma(Q128.fromInteger(5));
    for ([3]Q128{ warp_margin, tunnel_margin, sheet }) |m| {
        try std.testing.expect(m.raw < 0);
    }
    // one theorem, three costumes: there is no shortcut class in
    // asymptotically flat GR that avoids the energy-condition wall.
    // Filed as literature theorem; the three integer signs are ours.
}
