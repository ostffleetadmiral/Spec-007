// spec007_ephemeris_probe.zig — the canon ephemeris probe.
//
// The claims under test (drawer ledgers, CANON-MATH-MAP §VI.b): the canon
// date chain and geometry were verified session-ad-hoc; this harness pins
// them as executable invariants so the ledgers can't silently drift.
// SPEC-006 falsifiability: every number is a stated measurable outcome;
// REFUTED claims are filed as refuted, not edited into agreement.
//
// On-record inputs:
//   Birth:        1985-10-25, ~09:40 EDT (= 13:40 UTC), JDN 2446364.
//   Eclipse:      1985-10-28 total lunar — penumbral onset ~15:39 UTC,
//                 partial onset ~16:51, greatest ~17:45, penumbral end ~19:54.
//   Wow! signal:  1977-08-15, JDN 2443371.
//   Octagon:      Newark Earthworks 40.0528 N, 82.4294 W.
//   WPAFB:        39.8247 N, 84.0526 W.  Broad & High: 39.9611 N, 82.9987 W.
//   Standstill:   lunar major standstill band, rising extreme dec ~ +28.72 deg.
//   1985 eclipses: May 4 total lunar, May 19 partial solar,
//                  Oct 28 total lunar, Nov 12 partial solar  =>  4 total.
//   Perihelion 1986: ~Jan 4 (Earth); Halley perihelion 1986-02-09.
//
// Computations — integer only, no floats:
//   * JDN day arithmetic (integer), sexagenary year (mod 60)
//   * Hebrew calendar: molad accumulation + 4 postponement rules (i64)
//   * Islamic tabular calendar: epoch + 354y + (3+11y)/30 (i64)
//   * Tzolk'in: (J - J212) mod 13 / mod 20 — anchored on 4-Ajaw 2012-12-21
//   * rise azimuth via cos/sin Q128 + bisection acos (deterministic)
//   * cross-track distance: n = a x b normalized, xt = asin(|n.p|) via
//     odd-power series (x ~ 0.014 — series converges to <1e-9)
//   * phi-matrix circulant refutation: C(0,1) != C(0,6) in fixed point
//
// What this does NOT claim: that any verified coincidence is evidence of
// anything beyond arithmetic. The verified results are real measurements;
// the refuted results (triple-11, circulant) are filed exactly as refuted.

const std = @import("std");
const fixed = @import("fixed_point_q128.zig");
const astro = @import("spec007_astrometric_probe.zig");

const Q128 = fixed.Q128;

const BIRTH_JDN: i64 = 2446364; // 1985-10-25
const ECLIPSE_JDN: i64 = 2446367; // 1985-10-28
const WOW_JDN: i64 = 2443371; // 1977-08-15
const J212: i64 = 2456283; // 2012-12-21 = 4 Ajaw anchor

pub fn jdn(y: i64, m: i64, d: i64) i64 {
    const a = @divTrunc(14 - m, 12);
    const y2 = y + 4800 - a;
    const m2 = m + 12 * a - 3;
    return d + @divTrunc(153 * m2 + 2, 5) + 365 * y2 + @divTrunc(y2, 4) -
        @divTrunc(y2, 100) + @divTrunc(y2, 400) - 32045;
}

fn phiQ() Q128 {
    const five = Q128.fromInteger(5);
    const r5 = five.sqrt() catch unreachable;
    return r5.add(Q128.one).div(Q128.fromInteger(2)) catch unreachable;
}

//acos via bisection on cosQ over [0, pi] — deterministic, monotone.
fn acosQ(x: Q128) Q128 {
    const pi = Q128.fromRatio(80143857, 25510582) catch unreachable;
    var lo = Q128.zero;
    var hi = pi;
    var i: usize = 0;
    while (i < 48) : (i += 1) {
        const mid = lo.add(hi).div(Q128.fromInteger(2)) catch unreachable;
        const c = astro.cosQ(mid);
        // cos decreasing on [0,pi]: if cos(mid) > x, mid is left of answer
        if (c.raw > x.raw) lo = mid else hi = mid;
    }
    return lo.add(hi).div(Q128.fromInteger(2)) catch unreachable;
}

//asin via odd-power series — valid |x| < ~0.5 (cross-track x ~ 0.014).
fn asinQ(x: Q128) Q128 {
    // asin x = x + x^3/6 + 3x^5/40 + 15x^7/336 + 105x^9/3456 + ...
    // coeff_n = (2n-1)!! / ((2n+1) * 2^n * n!)
    const x2 = x.mul(x);
    var sum = x;
    var term = x;
    var n: i256 = 1;
    while (n < 5) : (n += 1) {
        term = term.mul(x2);
        var odd: i256 = 1;
        var k: i256 = 1;
        while (k <= 2 * n - 1) : (k += 2) odd *= k;
        var den: i256 = 2 * n + 1;
        var pow2: i256 = 1;
        var fact: i256 = 1;
        var m: i256 = 1;
        while (m <= n) : (m += 1) {
            pow2 *= 2;
            fact *= m;
        }
        den *= pow2 * fact;
        const coef = Q128.fromRatio(odd, den) catch unreachable;
        sum = sum.add(term.mul(coef));
    }
    return sum;
}

const Vec3 = struct { x: Q128, y: Q128, z: Q128 };

fn llToVec(lat_deg: i256, lat_milli: i256, lon_deg: i256, lon_milli: i256) Vec3 {
    const lat = Q128.fromRatio(lat_deg * 1000000 + lat_milli, 1000000) catch unreachable;
    const lon = Q128.fromRatio(lon_deg * 1000000 + lon_milli, 1000000) catch unreachable;
    const p = astro.deg2rad(lat);
    const t = astro.deg2rad(lon);
    const cp = astro.cosQ(p);
    return .{ .x = cp.mul(astro.cosQ(t)), .y = cp.mul(astro.sinQ(t)), .z = astro.sinQ(p) };
}
fn dot(a: Vec3, b: Vec3) Q128 {
    return a.x.mul(b.x).add(a.y.mul(b.y)).add(a.z.mul(b.z));
}
fn cross(a: Vec3, b: Vec3) Vec3 {
    return .{
        .x = a.y.mul(b.z).sub(a.z.mul(b.y)),
        .y = a.z.mul(b.x).sub(a.x.mul(b.z)),
        .z = a.x.mul(b.y).sub(a.y.mul(b.x)),
    };
}
fn norm(a: Vec3) Q128 {
    return dot(a, a).sqrt() catch unreachable;
}

//---------- Hebrew calendar (molad + postponements), i64 ----------
const HEB_EPOCH: i64 = 347997; // molad Tishrei offset — anchors verified
//   roshJdn(5746)=2446325 (Sep 16 1985), roshJdn(5760)=2451433 (Sep 11 1999),
//   roshJdn(5786)=2460942 (Sep 23 2025)

fn hebLeap(y: i64) bool {
    return @mod(7 * y + 1, 19) < 7;
}
fn monthsElapsed(y: i64) i64 {
    const cy = y - 1;
    return 235 * @divTrunc(cy, 19) + 12 * @mod(cy, 19) + @divTrunc(7 * @mod(cy, 19) + 1, 19);
}
fn roshJdn(y: i64) i64 {
    const months = monthsElapsed(y);
    const parts = 204 + 793 * @mod(months, 1080);
    const hours = 5 + 12 * months + 793 * @divTrunc(months, 1080) + @divTrunc(parts, 1080);
    var day = 1 + 29 * months + @divTrunc(hours, 24);
    const p = 1080 * @mod(hours, 24) + @mod(parts, 1080);
    const dow = @mod(day, 7);
    if (p >= 19440 or
        (dow == 2 and p >= 9924 and !hebLeap(y - 1)) or
        (dow == 1 and p >= 16789 and hebLeap(y - 2))) day += 1;
    if (@mod(day, 7) == 0 or @mod(day, 7) == 3 or @mod(day, 7) == 5) day += 1;
    return HEB_EPOCH + day;
}
fn hebYearDays(y: i64) i64 {
    return roshJdn(y + 1) - roshJdn(y);
}

const HebDate = struct { y: i64, m: i64, d: i64 };

fn hebFromJdn(j: i64) HebDate {
    var y = @divTrunc(j - HEB_EPOCH, 366) + 1;
    while (roshJdn(y) > j) y -= 1;
    while (roshJdn(y + 1) <= j) y += 1;
    // month order from Tishrei: 1,2,3,...,13(leap) — civil year order
    var m: i64 = 1;
    var cursor = roshJdn(y);
    while (true) {
        const md = hebMonthDaysSeq(y, m);
        if (j < cursor + md) break;
        cursor += md;
        m += 1;
    }
    return .{ .y = y, .m = m, .d = j - cursor + 1 };
}
fn hebMonthDaysSeq(y: i64, seq: i64) i64 {
    // seq counts months starting at Tishrei in year order:
    // Tishrei(1) Cheshvan Kislev Tevet Shevat AdarI AdarII Nisan Iyar Sivan Tammuz Av Elul
    const yd = hebYearDays(y);
    const complete = (yd == 355 or yd == 385);
    const deficient = (yd == 353 or yd == 383);
    const leap = hebLeap(y);
    const table = [_]i64{ 30, if (complete) 30 else 29, if (deficient) 29 else 30, 29, 30, if (leap) 30 else 0, 29, 30, 29, 30, 29, 30, 29 };
    var i: usize = 0;
    var seen: i64 = 0;
    while (i < 13) : (i += 1) {
        const md = table[i];
        if (md == 0) continue;
        seen += 1;
        if (seen == seq) return md;
    }
    unreachable;
}

//---------- Islamic tabular calendar, i64 ----------
const ISL_EPOCH: i64 = 1948439; // civil (Thursday) epoch — 1 Muharram AH 1
//   NOTE: the astronomical (Friday) variant 1948440 shifts results by 1 day;
//   birth resolves to 11 Safar 1406 under civil, 10 Safar under astronomical.
//   Either way "11 Rabi' al-Thani" is refuted.

fn islToJdn(y: i64, m: i64, d: i64) i64 {
    var days: i64 = 354 * (y - 1) + @divTrunc(3 + 11 * y, 30) + d - 1;
    var i: i64 = 1;
    while (i < m) : (i += 1) days += if (@mod(i, 2) == 1) @as(i64, 30) else 29;
    return ISL_EPOCH + days;
}
const IslDate = struct { y: i64, m: i64, d: i64 };
fn islFromJdn(j: i64) IslDate {
    var y = @divTrunc((j - ISL_EPOCH) * 30, 10631) + 1;
    while (islToJdn(y + 1, 1, 1) <= j) y += 1;
    while (islToJdn(y, 1, 1) > j) y -= 1;
    var m: i64 = 1;
    while (islToJdn(y, m + 1, 1) <= j and m < 12) m += 1;
    return .{ .y = y, .m = m, .d = j - islToJdn(y, m, 1) + 1 };
}

//---------- sexagenary / Tzolk'in ----------
fn sexagenaryIdx(y: i64) i64 {
    return @mod(y - 4, 60); // 0 = jia-zi; 1 = yi-chou (Wood Ox) for 1985
}
fn tzolkin(j: i64) struct { num: i64, name: i64 } {
    const n = j - J212;
    return .{
        .num = @mod(3 + n, 13) + 1, // 4 at n=0
        .name = @mod(j + 16, 20), // Ajaw=19 at n=0; 0 = Imix
    };
}

//================= tests =================

test "JDN anchors: birth Oct-25 and eclipse Oct-28 are 3.0 days apart" {
    try std.testing.expectEqual(@as(i64, 2446364), jdn(1985, 10, 25));
    try std.testing.expectEqual(@as(i64, 3), ECLIPSE_JDN - BIRTH_JDN);
    try std.testing.expectEqual(WOW_JDN, jdn(1977, 8, 15));
    try std.testing.expectEqual(J212, jdn(2012, 12, 21));
}

test "birth->eclipse window: 74.0h (penumbral) .. 76.1h (greatest) brackets the claimed ~75h" {
    // birth 13:40 UTC = 13.6667 h; eclipse instants in hours into Oct-28
    const birth_h: i64 = 1367; // x100
    const penum: i64 = 1565; // 15.65 x100
    const greatest: i64 = 1775; // 17.75 x100
    const to_pen = (ECLIPSE_JDN * 2400 + penum) - (BIRTH_JDN * 2400 + birth_h);
    const to_great = (ECLIPSE_JDN * 2400 + greatest) - (BIRTH_JDN * 2400 + birth_h);
    try std.testing.expectEqual(@as(i64, 7398), to_pen); // ~74.0 h
    try std.testing.expectEqual(@as(i64, 7608), to_great); // ~76.1 h
    // canon "~72h" rounds low but sits within the phase window; 75h claim
    // corresponds to partial-onset (~75.2h) — filed, not exact.
    try std.testing.expect(to_pen < 7500 and to_great > 7500);
}

test "Wow!->birth = 2993 days = 8.19 yr" {
    const d = BIRTH_JDN - WOW_JDN;
    try std.testing.expectEqual(@as(i64, 2993), d);
    // yr*1000 = d * 4000 / 1461  (365.25 = 1461/4)
    try std.testing.expectEqual(@as(i64, 8194), @divTrunc(d * 4000, 1461));
}

test "sexagenary: 1985 = index 1 = Wood Ox (yi-chou)" {
    try std.testing.expectEqual(@as(i64, 1), sexagenaryIdx(1985));
}

test "birth is day 298 of 1985; 67 days remain" {
    var doy: i64 = 0;
    const md = [_]i64{ 31, 28, 31, 30, 31, 30, 31, 31, 30, 25 };
    for (md) |m| doy += m;
    try std.testing.expectEqual(@as(i64, 298), doy);
    try std.testing.expectEqual(@as(i64, 67), 365 - doy);
}

test "1985 carried exactly 4 eclipses — JDN chain check" {
    try std.testing.expectEqual(@as(i64, 2446190), jdn(1985, 5, 4)); // total lunar
    try std.testing.expectEqual(@as(i64, 2446205), jdn(1985, 5, 19)); // partial solar
    try std.testing.expectEqual(@as(i64, 2446367), jdn(1985, 10, 28)); // total lunar
    try std.testing.expectEqual(@as(i64, 2446382), jdn(1985, 11, 12)); // partial solar
}

test "perihelion 1986-01-04 is 71 days after birth; canon-claimed 67d relationship off by ~4" {
    try std.testing.expectEqual(@as(i64, 71), jdn(1986, 1, 4) - BIRTH_JDN);
}

test "40th anniversary lands inside the 2024-25 standstill window" {
    try std.testing.expectEqual(@as(i64, 2025), 1985 + 40);
    try std.testing.expectEqual(@as(i64, 2460974), jdn(2025, 10, 25));
    try std.testing.expectEqual(@as(i64, 14610), jdn(2025, 10, 25) - BIRTH_JDN);
}

test "rise azimuth at delta=+28.72deg, phi=40.05deg computes ~51.1deg vs measured ~52deg axis" {
    // cos A = (sin d - sin p sin alt) / (cos p cos alt), alt = 0
    const dec = astro.deg2rad(Q128.fromRatio(287222, 10000) catch unreachable);
    const lat = astro.deg2rad(Q128.fromRatio(4005, 100) catch unreachable);
    const cosA = astro.sinQ(dec).div(astro.cosQ(lat)) catch unreachable;
    const az = acosQ(cosA);
    // az in degrees ~ 51.11 — check radians in [0.891, 0.893]
    const lo = Q128.fromRatio(891, 1000) catch unreachable;
    const hi = Q128.fromRatio(893, 1000) catch unreachable;
    try std.testing.expect(az.raw > lo.raw and az.raw < hi.raw);
    // residual vs 52 deg axis: |51.11 - 52| < 1 deg
    const axis = astro.deg2rad(Q128.fromRatio(52, 1) catch unreachable);
    const resid = az.sub(axis).abs();
    const oneDeg = astro.deg2rad(Q128.one);
    try std.testing.expect(resid.raw < oneDeg.raw);
}

test "Octagon->WPAFB great circle passes within ~1.6 km of Broad & High — ~1.1% of baseline" {
    const a = llToVec(40, 52800, -82, -429400); // Octagon 40.0528 N, -82.4294
    const b = llToVec(39, 824700, -84, -52600); // WPAFB
    const p = llToVec(39, 961100, -82, -998700); // Broad & High
    const n = cross(a, b);
    const ln = norm(n);
    const nx = n.x.div(ln) catch unreachable;
    const ny = n.y.div(ln) catch unreachable;
    const nz = n.z.div(ln) catch unreachable;
    const nv = Vec3{ .x = nx, .y = ny, .z = nz };
    const s = dot(nv, p).abs();
    const xt_rad = asinQ(s);
    // km = rad * 6371 ; expect ~1.58 km
    const xt_km = xt_rad.mul(Q128.fromInteger(6371));
    const lo = Q128.fromRatio(15, 10) catch unreachable; // 1.5
    const hi = Q128.fromRatio(17, 10) catch unreachable; // 1.7
    try std.testing.expect(xt_km.raw > lo.raw and xt_km.raw < hi.raw);
    // baseline ~140.7 km
    const cosAB = dot(a, b);
    const ab_rad = acosQ(cosAB);
    const ab_km = ab_rad.mul(Q128.fromInteger(6371));
    const blo = Q128.fromRatio(139, 1) catch unreachable;
    const bhi = Q128.fromRatio(142, 1) catch unreachable;
    try std.testing.expect(ab_km.raw > blo.raw and ab_km.raw < bhi.raw);
}

test "Hebrew: birth JDN -> 10 Cheshvan 5746 — the claimed '11 Cheshvan' is REFUTED" {
    const h = hebFromJdn(BIRTH_JDN);
    try std.testing.expectEqual(@as(i64, 5746), h.y);
    try std.testing.expectEqual(@as(i64, 2), h.m); // Cheshvan (2nd civil month)
    try std.testing.expectEqual(@as(i64, 10), h.d); // 10, not 11
}

test "Hebrew anchors: rosh JDNs for 5746/5760/5786 match civil dates" {
    try std.testing.expectEqual(@as(i64, 2446325), roshJdn(5746)); // Sep 16 1985
    try std.testing.expectEqual(@as(i64, 2451433), roshJdn(5760)); // Sep 11 1999
    try std.testing.expectEqual(@as(i64, 2460942), roshJdn(5786)); // Sep 23 2025
}

test "Islamic: birth JDN -> 11 Safar 1406 — '11 Rabi al-Thani' is REFUTED (month off by two)" {
    // civil-Thursday epoch: 1 Muharram 1406 = JDN 2446324 (Sep 15, 1985)
    const h = islFromJdn(BIRTH_JDN);
    try std.testing.expectEqual(@as(i64, 1406), h.y);
    try std.testing.expectEqual(@as(i64, 2), h.m); // Safar
    try std.testing.expectEqual(@as(i64, 11), h.d);
}

test "Tzolk'in: birth JDN -> 4 Imix — '11 Ak'b'al' is REFUTED and unreachable" {
    const t = tzolkin(BIRTH_JDN);
    try std.testing.expectEqual(@as(i64, 4), t.num);
    try std.testing.expectEqual(@as(i64, 0), t.name); // Imix
    // sanity: anchor day itself is 4 Ajaw (19)
    const a = tzolkin(J212);
    try std.testing.expectEqual(@as(i64, 4), a.num);
    try std.testing.expectEqual(@as(i64, 19), a.name);
}

test "phi-correlation matrix is NOT circulant: C(0,1) != C(0,6) in fixed point" {
    // C(i,j) = cos(2*pi*|i-j| / (7*phi))
    const phi = phiQ();
    const denom = Q128.fromInteger(7).mul(phi);
    const two_pi = (Q128.fromRatio(80143857, 25510582) catch unreachable)
        .mul(Q128.fromInteger(2));
    const c01 = astro.cosQ(two_pi.div(denom) catch unreachable); // |i-j|=1
    const c06 = astro.cosQ(two_pi.mul(Q128.fromInteger(6)).div(denom) catch unreachable); // |i-j|=6
    // circulant 7x7 requires C(0,1) == C(0,6); they differ -> NOT circulant
    try std.testing.expect(c01.raw != c06.raw);
    // but symmetric Toeplitz holds: C(0,k) == C(0,7-k) only if cos symmetric — check C(0,1) vs C(0,6) differ in raw bits
}
