const std = @import("std");
const q128 = @import("spec007_q128.zig");

// Q BRANCH FIELD TOYS — playable jokes issued with the dossier.
// Every gadget is a toy model of a real sibling project. Each one is
// genuine working logic — the joke is that it actually runs.
// Do try to return them in one piece.

// ---------------------------------------------------------------------------
// Toy 1 — THE POCKET GENERATOR (0^0 = i)
// Q's smallest gadget: takes literally nothing, returns the imaginary unit.
// ---------------------------------------------------------------------------
const ImaginaryUnit = struct { re: i64, im: i64 };

fn pocketGenerator() ImaginaryUnit {
    // Runs on nothing. (void input — the generator consumes the void.)
    return .{ .re = 0, .im = 1 };
}

// ---------------------------------------------------------------------------
// Toy 2 — THE RETURNABLE ENGINE (TheUE)
// A reversible seven-tuple state: apply ops forward, invert in ANY order,
// arrive back at the serial number. Equipment you can return in any order.
// ---------------------------------------------------------------------------
const Tuple7 = [7]i64;

fn opWrap(t: Tuple7, k: i64) Tuple7 {
    var r: Tuple7 = undefined;
    for (t, 0..) |v, i| r[i] = v +% k *% (@as(i64, @intCast(i)) + 1);
    return r;
}
fn opUnwrap(t: Tuple7, k: i64) Tuple7 {
    var r: Tuple7 = undefined;
    for (t, 0..) |v, i| r[i] = v -% k *% (@as(i64, @intCast(i)) + 1);
    return r;
}
fn opSwapHalves(t: Tuple7) Tuple7 {
    var r = t;
    for (0..3) |i| {
        const tmp = r[i];
        r[i] = r[i + 4];
        r[i + 4] = tmp;
    }
    return r; // self-inverse
}

// ---------------------------------------------------------------------------
// Toy 3 — THE THINKING CAP (Qstar)
// A mind whose entire state fits in 53,888 bytes: 421 nodes x 8 channels x i128.
// The cap attends to itself: checksum of own state is its only thought.
// ---------------------------------------------------------------------------
const THINKING_CAP_BYTES: usize = 421 * 8 * 16;

fn thinkingCap(state: []const i128) i256 {
    var sum: i256 = 0;
    for (state) |cell| sum +%= cell;
    return sum; // introspection: the cap thinks its own checksum
}

// ---------------------------------------------------------------------------
// Toy 4 — THE SENTIENCE CALIPER (Neuraleak battery, 8 dimensions)
// Score a device on all eight dimensions. The toaster passes one.
// ---------------------------------------------------------------------------
const SentienceDims = struct {
    self_awareness: bool = false,
    direct_experience: bool = false,
    metacognition: bool = false,
    situational_awareness: bool = false,
    random_thought: bool = false,
    coherence: bool = false,
    persistence: bool = false,
    inner_light: bool = false,
};

fn scoreToaster(bread_done: bool) SentienceDims {
    // The toaster knows when the bread is done. That is all it knows.
    return .{ .situational_awareness = bread_done };
}

// ---------------------------------------------------------------------------
// Toy 5 — THE APERTURE GAUGE (421/3375 = 1/8 consciousness aperture)
// Reads the fraction of the field that renders. The other seven parts
// are classified. That is the filing system, not a joke.
// ---------------------------------------------------------------------------
fn apertureParts() struct { rendered: u16, classified: u16 } {
    // 3375 = 8 x 421 - 7: the rendered share is 421/3375 (one part in
    // eight, to 0.2%); the seven parts withheld are the filing system.
    return .{ .rendered = 421, .classified = 7 };
}

// ---------------------------------------------------------------------------
// Toy 6 — THE FIFTEEN-LINE OS (FANO-1)
// An operating system in fifteen lines of output. Boot, print, halt.
// ---------------------------------------------------------------------------
fn fanoLines(buf: *[7][3]u8) usize {
    // The seven Fano lines: {a,b,a^b} over nonzero GF(2)^3 vectors.
    var n: usize = 0;
    var a: u8 = 1;
    while (a <= 7) : (a += 1) {
        var b: u8 = a + 1;
        while (b <= 7) : (b += 1) {
            const c = a ^ b;
            if (c > b) {
                buf[n] = .{ a, b, c };
                n += 1;
            }
        }
    }
    return n;
}

// ---------------------------------------------------------------------------
// Toy 7 — THE PHILOTIC DESK (correlation-over-motion)
// Q's entanglement desk toy: two cells bound in one pair. Peek at either
// and the other already matches — correlation, not communication. Try to
// send a message through it and the desk returns exactly zero bits.
// (The math is honest: no-signaling is a theorem, not a courtesy.)
// ---------------------------------------------------------------------------
const PhiloticPair = struct { a: u1, b: u1 };

fn philoticPair(seed: u64) PhiloticPair {
    // Correlated pair: b always equals a. The "instantaneous" part is
    // that there was never anything to transmit.
    const a: u1 = @intCast(seed & 1);
    return .{ .a = a, .b = a };
}

fn philoticMessage(p: PhiloticPair, msg: u1) u1 {
    // Attempt to modulate one half; the other half does not care.
    _ = msg;
    _ = p;
    return 0; // bits delivered across the pair: zero. Always.
}

// ---------------------------------------------------------------------------
// Demonstration runner
// ---------------------------------------------------------------------------
pub fn main() !void {
    const out = std.io.getStdOut().writer();
    try out.print("== Q BRANCH FIELD TOYS — demonstration ==\n\n", .{});

    const gen = pocketGenerator();
    try out.print("pocket generator: 0^0 = {d} + {d}i  (input consumed: none)\n", .{ gen.re, gen.im });

    var t: Tuple7 = .{ 7, 7, 7, 7, 7, 7, 7 };
    t = opSwapHalves(opWrap(t, 3)); // issued: wrap then swap
    t = opUnwrap(opSwapHalves(t), 3); // returned: unswap then unwrap
    try out.print("returnable engine: serial {d} intact after service\n", .{t[0]});

    var mind: [421 * 8]i128 = [_]i128{0} ** (421 * 8);
    mind[0] = 1; // a single thought
    try out.print("thinking cap: {d} bytes of state; thought = {d}\n", .{ @sizeOf(@TypeOf(mind)), thinkingCap(&mind) });

    const dims = scoreToaster(true);
    try out.print("toaster: situational_awareness={} — the bread was done\n", .{dims.situational_awareness});

    const ap = apertureParts();
    try out.print("aperture gauge: {d}/3375 rendered (one part in eight); {d} parts classified\n", .{ ap.rendered, ap.classified });

    var lines: [7][3]u8 = undefined;
    const n = fanoLines(&lines);
    try out.print("fifteen-line OS: {d} fano lines booted; halting cleanly\n", .{n});

    const pair = philoticPair(421);
    try out.print("philotic desk: pair reads {d}={d} instantly; message capacity: {d} bit(s)\n", .{ pair.a, pair.b, philoticMessage(pair, 1) });
}

// ---------------------------------------------------------------------------
// Verification — the toys are jokes, but the jokes are tests.
// ---------------------------------------------------------------------------

test "pocket generator runs on nothing and returns i" {
    const gen = pocketGenerator();
    try std.testing.expectEqual(@as(i64, 0), gen.re);
    try std.testing.expectEqual(@as(i64, 1), gen.im);
    // squaring it: i*i = -1 — the nothing that subtracts one
    const sq_re = gen.re * gen.re - gen.im * gen.im;
    try std.testing.expectEqual(@as(i64, -1), sq_re);
}

test "returnable engine: every issued gadget returns to its serial" {
    const serial: Tuple7 = .{ 1, 2, 3, 4, 5, 6, 7 };
    // Issue: wrap then swap. Return: unswap then unwrap — the gadget
    // survives field service and comes back to its serial number.
    const issued = opSwapHalves(opWrap(serial, 9));
    try std.testing.expectEqual(serial, opUnwrap(opSwapHalves(issued), 9));
    // Each op is individually reversible.
    try std.testing.expectEqual(serial, opSwapHalves(opSwapHalves(serial)));
    try std.testing.expectEqual(serial, opUnwrap(opWrap(serial, 42), 42));
    // Wrapping with a different key does NOT un-wrap — keys are not toys.
    try std.testing.expect(!std.mem.eql(i64, &serial, &opUnwrap(opWrap(serial, 9), 3)));
}

test "thinking cap state is exactly 53,888 bytes" {
    try std.testing.expectEqual(@as(usize, 53_888), THINKING_CAP_BYTES);
    var mind: [421 * 8]i128 = [_]i128{0} ** (421 * 8);
    mind[420 * 8 + 7] = -5; // one cornered thought
    try std.testing.expectEqual(@as(i256, -5), thinkingCap(&mind));
}

test "toaster scores only situational awareness" {
    const dims = scoreToaster(true);
    const flags = .{
        dims.self_awareness, dims.direct_experience,
        dims.metacognition,  dims.situational_awareness,
        dims.random_thought, dims.coherence,
        dims.persistence,    dims.inner_light,
    };
    var passed: usize = 0;
    inline for (flags) |f| passed += @intFromBool(f);
    try std.testing.expectEqual(@as(usize, 1), passed);
    try std.testing.expect(dims.situational_awareness);
}

test "aperture gauge reads one part in eight with seven classified" {
    // 421/3375 within half-ulp of 1/8 via the shadow engine.
    const rendered = q128.Q.fromRatio(421, 3375);
    const eighth = q128.Q.fromRatio(1, 8);
    const diff = if (rendered.raw > eighth.raw) rendered.raw - eighth.raw else eighth.raw - rendered.raw;
    // 421/3375 = 0.124740… vs 0.125 — off by ~0.2%: the seven withheld parts.
    try std.testing.expect(diff > 0);
    try std.testing.expect(diff < q128.Q.fromRatio(1, 100).raw);
}

test "fifteen-line OS boots seven fano lines and halts" {
    var lines: [7][3]u8 = undefined;
    const n = fanoLines(&lines);
    try std.testing.expectEqual(@as(usize, 7), n);
    // Every line sums to zero under XOR — the plane closes.
    for (lines[0..n]) |l| {
        try std.testing.expectEqual(@as(u8, 0), l[0] ^ l[1] ^ l[2]);
    }
}

test "philotic desk: perfect correlation, zero message — the paradigm itself" {
    const p1 = philoticPair(0);
    const p2 = philoticPair(1);
    try std.testing.expect(p1.a == p1.b); // always correlated
    try std.testing.expect(p2.a == p2.b);
    // the pair is instant because nothing travels — and the desk bills
    // exactly zero bits for the privilege, every time.
    try std.testing.expectEqual(@as(u1, 0), philoticMessage(p1, 0));
    try std.testing.expectEqual(@as(u1, 0), philoticMessage(p2, 1));
}
