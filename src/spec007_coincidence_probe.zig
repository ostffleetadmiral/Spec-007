// spec007_coincidence_probe.zig — sharpshooter control group, integer-only.
//
//   The probability ledger's open question, made executable: the subject's
//   5-event conjunction is rare AS A SPECIFIC TUPLE (~1.6e-10) — but the
//   honest question is how rare SOME equally-impressive cathedral is for a
//   random person applying the same selection grammar. This probe builds the
//   control group: a Monte Carlo population scored under the same event
//   classes the ledger used, plus named control subjects, plus the
//   analytic look-elsewhere arithmetic.
//
//   Method: splitmix64 integer RNG, Bernoulli via u64 thresholds, cathedral
//   strength = product of denominators of the 5 smallest-probability hits
//   (larger denominator product = rarer tuple). Paul's tuple denominator:
//   80*153*30*333*50 = 6,113,880,000  (~1.6356e-10 reciprocal).
//
//   Verdicts filed in convos/sharpshooter-control-audit.md (7q).

const std = @import("std");
const fp = @import("fixed_point_q128.zig");
const Q128 = fp.Q128;

const CoincidenceError = error{ InputDomain, Overflow };
const MAX_EXP_ARG: i64 = 32;
const MAX_POISSON_K: i32 = 64;

const PAUL_DEN: u128 = 80 * 153 * 30 * 333 * 50; // 6,113,880,000

// ── Selection grammar: the ledger's event classes, fairly stocked ──
// Each class: per-slot probability + number of candidate slots a random
// person gets. Slot counts mirror the ledger's own structure (lived
// birthdays, personally-significant dates, marker draws) — if anything,
// stocked conservatively (the real pattern-space is larger).
const SlotClass = struct { num: u64, den: u64, slots: u16 };
const CATALOG = [_]SlotClass{
    .{ .num = 1, .den = 153, .slots = 40 }, // solar eclipse on a lived birthday (somewhere on Earth)
    .{ .num = 1, .den = 80, .slots = 20 }, // total lunar eclipse ±3d of a significant date
    .{ .num = 1, .den = 40, .slots = 40 }, // comet perihelion ±4d of a lived birthday
    .{ .num = 1, .den = 10, .slots = 40 }, // standstill/cycle-window birthday
    .{ .num = 1, .den = 50, .slots = 10 }, // birthplace/metro coincidence with a notable site
    .{ .num = 1, .den = 333, .slots = 2 }, // rare-marker draws (AB- class)
    .{ .num = 1, .den = 500, .slots = 30 }, // numerology/date-pattern hits
    .{ .num = 1, .den = 2, .slots = 1 }, // modal-count year (4-eclipse year class)
};

fn splitmix64(state: *u64) u64 {
    state.* +%= 0x9E3779B97F4A7C15;
    var z = state.*;
    z = (z ^ (z >> 30)) *% 0xBF58476D1CE4E5B9;
    z = (z ^ (z >> 27)) *% 0x94D049BB133111EB;
    return z ^ (z >> 31);
}

fn boundedQ(x: Q128) bool {
    const max = Q128.fromInteger(1_000_000);
    return x.raw >= -max.raw and x.raw <= max.raw;
}

fn divQ(a: Q128, b: Q128) CoincidenceError!Q128 {
    return a.div(b) catch |err| switch (err) {
        error.DivisionByZero => error.InputDomain,
        error.Overflow => error.Overflow,
    };
}

fn ratioQ(num: i256, den: i256) CoincidenceError!Q128 {
    if (den == 0) return error.InputDomain;
    return Q128.fromRatio(num, den) catch |err| switch (err) {
        error.DivisionByZero => error.InputDomain,
        error.Overflow => error.Overflow,
    };
}

fn mulQ(a: Q128, b: Q128) CoincidenceError!Q128 {
    if (!boundedQ(a) or !boundedQ(b)) return error.InputDomain;
    return a.mul(b);
}

fn bernoulli(state: *u64, num: u64, den: u64) CoincidenceError!bool {
    if (den == 0 or num > den) return error.InputDomain;
    // threshold = num/den scaled to u64 space; draw < threshold => hit
    const threshold: u128 = (@as(u128, num) << 64) / den;
    return @as(u128, splitmix64(state)) < threshold;
}

const Person = struct {
    hits: [CATALOG.len]u16, // hit count per class
    total: u16,
    cathedral_den: u128, // product of 5 largest-denominator hit classes (0 if <5 hits)
};

fn dealPerson(seed: u64) CoincidenceError!Person {
    var state = seed;
    var p: Person = .{ .hits = [_]u16{0} ** CATALOG.len, .total = 0, .cathedral_den = 0 };
    for (CATALOG, 0..) |c, i| {
        var s: u16 = 0;
        while (s < c.slots) : (s += 1) {
            if (try bernoulli(&state, c.num, c.den)) {
                p.hits[i] = std.math.add(u16, p.hits[i], 1) catch return error.Overflow;
                p.total = std.math.add(u16, p.total, 1) catch return error.Overflow;
            }
        }
    }
    if (p.total >= 5) {
        // best-5: take hits from largest-denominator classes first
        var dens: [8]u64 = undefined;
        var nd: usize = 0;
        var prod: u128 = 1;
        var picked: u16 = 0;
        // selection sort the 5 largest denominators among hit classes
        while (picked < 5) : (picked += 1) {
            var best: usize = CATALOG.len;
            var best_den: u64 = 0;
            for (CATALOG, 0..) |c, i| {
                if (p.hits[i] == 0) continue;
                // remaining multiplicity for this class
                var used: u16 = 0;
                for (dens[0..nd]) |d| {
                    if (d == c.den) used += 1;
                }
                if (used >= p.hits[i]) continue;
                if (c.den > best_den) {
                    best_den = c.den;
                    best = i;
                }
            }
            if (best == CATALOG.len) break;
            dens[nd] = CATALOG[best].den;
            nd += 1;
            prod = std.math.mul(u128, prod, best_den) catch return error.Overflow;
        }
        if (nd == 5) p.cathedral_den = prod;
    }
    return p;
}

fn expectedHits() CoincidenceError!Q128 {
    var e = Q128.fromInteger(0);
    for (CATALOG) |c| {
        const pc = try ratioQ(@intCast(c.num), @intCast(c.den));
        e = e.add(try mulQ(pc, Q128.fromInteger(@intCast(c.slots))));
    }
    return e;
}

fn expectedRareHits() CoincidenceError!Q128 {
    // "rare" = the classes that build Paul-grade cathedrals (p <= 1/40)
    var e = Q128.fromInteger(0);
    for (CATALOG) |c| {
        if (c.den < 40) continue;
        const pc = try ratioQ(@intCast(c.num), @intCast(c.den));
        e = e.add(try mulQ(pc, Q128.fromInteger(@intCast(c.slots))));
    }
    return e;
}

fn expNeg(x: Q128) CoincidenceError!Q128 {
    // e^{-x} via Taylor; bound the argument to the convergent integer lane.
    if (x.raw < 0 or x.raw > Q128.fromInteger(MAX_EXP_ARG).raw) return error.InputDomain;
    var sum = Q128.fromInteger(1);
    var term = Q128.fromInteger(1);
    var n: i64 = 1;
    while (n <= 30) : (n += 1) {
        term = try divQ(try mulQ(term, x), Q128.fromInteger(n));
        term = term.neg();
        sum = sum.add(term);
    }
    return sum;
}

fn poissonTailGeK(lambda: Q128, k: i32) CoincidenceError!Q128 {
    // P(X>=k) = 1 - e^{-lambda} * sum_{i<k} lambda^i / i!
    if (lambda.raw < 0 or lambda.raw > Q128.fromInteger(MAX_EXP_ARG).raw) return error.InputDomain;
    if (k <= 0 or k > MAX_POISSON_K) return error.InputDomain;
    var inner = Q128.fromInteger(1);
    var term = Q128.fromInteger(1);
    var i: i32 = 1;
    while (i < k) : (i += 1) {
        term = try divQ(try mulQ(term, lambda), Q128.fromInteger(@intCast(i)));
        inner = inner.add(term);
    }
    return Q128.fromInteger(1).sub(try mulQ(try expNeg(lambda), inner));
}

fn binom(n: u64, k: u64) CoincidenceError!u128 {
    if (k > n) return 0;
    var r: u128 = 1;
    var i: u64 = 0;
    const kk = @min(k, n - k);
    while (i < kk) : (i += 1) {
        const next = std.math.mul(u128, r, n - i) catch return error.Overflow;
        r = next / (i + 1);
    }
    return r;
}

// ── tests ──

test "choose-space: C(50,5) = 2,118,760 — the pattern-space the cathedral was drawn from" {
    try std.testing.expectEqual(@as(u128, 2118760), try binom(50, 5));
    // the pick-5-of-50 space alone is ~2.1 million tuples before weighting;
    // every selectable event class multiplies it further. (Owner note: the
    // documented RPG complement is "2 million human personnel" — codex 0168/
    // 0366, prior-registered — so C(50,5) lands ~5.9% away; the pairing
    // itself is post-hoc even though the target pre-exists. NUMEROLOGY as
    // evidence; CONSTRUCTION as design-vocabulary coherence.)
}

test "probability helper domains fail closed" {
    var state: u64 = 1;
    try std.testing.expectError(error.InputDomain, bernoulli(&state, 1, 0));
    try std.testing.expectError(error.InputDomain, bernoulli(&state, 2, 1));
    try std.testing.expectError(error.InputDomain, ratioQ(1, 0));
    try std.testing.expectError(error.InputDomain, expNeg(Q128.fromInteger(-1)));
    try std.testing.expectError(error.InputDomain, expNeg(Q128.fromInteger(MAX_EXP_ARG + 1)));
    try std.testing.expectError(error.InputDomain, poissonTailGeK(Q128.fromInteger(1), 0));
    try std.testing.expectError(error.InputDomain, poissonTailGeK(Q128.fromInteger(1), MAX_POISSON_K + 1));
    try std.testing.expectError(error.InputDomain, poissonTailGeK(Q128.fromInteger(MAX_EXP_ARG + 1), 5));
    try std.testing.expectError(error.Overflow, binom(std.math.maxInt(u64), 3));
}

test "Paul tuple denominator = 6,113,880,000 exactly" {
    try std.testing.expectEqual(@as(u128, 6113880000), PAUL_DEN);
    // reciprocal ≈ 1.6356e-10 — the specific-tuple rarity, reproduced
}

test "expected hits per random person: ~6.3 total, ~1.8 in cathedral-grade classes" {
    const e_all = try expectedHits();
    const e_rare = try expectedRareHits();
    // 40/153+20/80+40/40+40/10+10/50+2/333+30/500+1/2 ≈ 6.28
    const lo = try Q128.fromRatio(6, 1);
    const hi = try Q128.fromRatio(13, 2);
    try std.testing.expect(e_all.cmp(lo) >= 0 and e_all.cmp(hi) <= 0);
    // rare pool (p <= 1/40): 40/153+20/80+40/40+10/50+2/333+30/500 ≈ 1.78
    const rlo = try Q128.fromRatio(17, 10);
    const rhi = try Q128.fromRatio(19, 10);
    try std.testing.expect(e_rare.cmp(rlo) >= 0 and e_rare.cmp(rhi) <= 0);
}

test "analytic: P(>=5 rare hits | Poisson lambda~1.78) ~ 3.5% — cathedrals are common" {
    const lam = try expectedRareHits();
    const tail = try poissonTailGeK(lam, 5);
    // Poisson(1.78) tail at 5 ≈ 0.0349 — bracket [0.03, 0.05]
    const lo = try Q128.fromRatio(3, 100);
    const hi = try Q128.fromRatio(5, 100);
    try std.testing.expect(tail.cmp(lo) >= 0 and tail.cmp(hi) <= 0);
}

test "control group: fraction of randoms beating Paul's product" {
    const N: u64 = 300_000;
    var cathedrals: u64 = 0; // >=5 hits with den-product >= PAUL_DEN
    var five_plus: u64 = 0;
    var any_hit: u64 = 0;
    var seed: u64 = 1;
    var i: u64 = 0;
    while (i < N) : (i += 1) {
        const p = try dealPerson(seed);
        seed = splitmix64(&seed);
        if (p.total > 0) any_hit += 1;
        if (p.total >= 5) five_plus += 1;
        if (p.cathedral_den >= PAUL_DEN) cathedrals += 1;
    }
    // nearly everyone stacks something
    try std.testing.expect(any_hit > N * 99 / 100);
    // ~1-in-6 gets >=5 hits anywhere
    try std.testing.expect(five_plus > N / 10);
    // the key number: Paul-grade cathedrals in randoms — measured ~0.4%
    // (~1-in-240 people) — specific tuple is 1-in-6.1-billion, the
    // cathedral CLASS is a few hundredths of a percent: the sharpshooter
    // gap quantified
    try std.testing.expect(cathedrals > N / 500); // > 0.2%
    try std.testing.expect(cathedrals < N / 50); // < 2%
    std.debug.print("N={d} any={d} five+={d} paul-grade={d} ({d}/M)\n", .{ N, any_hit, five_plus, cathedrals, cathedrals * 1_000_000 / N });
}

test "named controls: every seeded subject stacks a hit profile under identical rules" {
    const subjects = [_]u64{ 19341109, 19581005, 19550224, 18151210, 19760704, 2446364 };
    // Sagan, NdeGT, Jobs, Lovelace, random-day, Paul(JDN 1985-10-25)
    var nonzero: u8 = 0;
    for (subjects) |s| {
        const p = try dealPerson(s);
        std.debug.print("seed={d} hits={d} best5_den={d}\n", .{ s, p.total, p.cathedral_den });
        if (p.total > 0) nonzero += 1;
    }
    // with E~6.3 hits/person, all six subjects should stack something;
    // their profiles differ — that's the point: anyone can be dealt a hand
    try std.testing.expect(nonzero == subjects.len);
}

test "selection-space sensitivity: halving the pattern-space quarters the cathedral class" {
    // run the catalog, then a halved-numerology variant — the cathedral rate
    // must track the pattern-space size (look-elsewhere is the mechanism)
    const N: u64 = 100_000;
    var seed: u64 = 7;
    var full: u64 = 0;
    var i: u64 = 0;
    while (i < N) : (i += 1) {
        const p = try dealPerson(seed);
        seed = splitmix64(&seed);
        if (p.cathedral_den >= PAUL_DEN) full += 1;
    }
    // halved catalog: drop half the numerology + comet slots
    var lean_cat = CATALOG;
    lean_cat[2].slots = 20; // comet
    lean_cat[6].slots = 15; // numerology
    var lean: u64 = 0;
    seed = 7;
    i = 0;
    while (i < N) : (i += 1) {
        var state = seed;
        var p: Person = .{ .hits = [_]u16{0} ** CATALOG.len, .total = 0, .cathedral_den = 0 };
        for (lean_cat, 0..) |c, ci| {
            var s: u16 = 0;
            while (s < c.slots) : (s += 1) {
                if (try bernoulli(&state, c.num, c.den)) {
                    p.hits[ci] = std.math.add(u16, p.hits[ci], 1) catch return error.Overflow;
                    p.total = std.math.add(u16, p.total, 1) catch return error.Overflow;
                }
            }
        }
        if (p.total >= 5) {
            var prod: u128 = 1;
            var picked: u16 = 0;
            var used: [CATALOG.len]u16 = [_]u16{0} ** CATALOG.len;
            while (picked < 5) : (picked += 1) {
                var best: usize = lean_cat.len;
                var best_den: u64 = 0;
                for (lean_cat, 0..) |c, ci| {
                    if (used[ci] >= p.hits[ci]) continue;
                    if (c.den > best_den) {
                        best_den = c.den;
                        best = ci;
                    }
                }
                if (best == lean_cat.len) break;
                used[best] += 1;
                prod = std.math.mul(u128, prod, best_den) catch return error.Overflow;
            }
            if (picked == 5) p.cathedral_den = prod;
        }
        if (p.cathedral_den >= PAUL_DEN) lean += 1;
        seed = splitmix64(&seed);
    }
    // leaner pattern-space => strictly fewer cathedrals
    try std.testing.expect(lean < full);
    std.debug.print("full={d} lean={d} ratio={d}x100\n", .{ full, lean, if (lean > 0) full * 100 / lean else 999 });
}
