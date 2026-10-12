//! spec008_seal.zig — integer-only Zig twin of the Fano mesh dialect's
//! seal/verify path (security/fano-mesh-bridge.mjs, firmware
//! fano_packet.c). u256 FNV-1a fold + octonion route signature mixed
//! per-hop — pure integer math, no floats anywhere.
//!
//! Wire: 136 B packets — [0,32) cell word · 32..34 dst · 35..38 seq ·
//! 39 plen · [40,104) payload · [104,136) seal.
//!
//! Golden-vector parity vs the JS twin is the gate: every vector below
//! was machine-extracted from firmware fano_vectors.h PACKET_VECS and
//! verifies under both implementations bit-exact.
//!
//! Integer-only by construction — Zig u256 wrapping ops play the JS
//! `& MASK256` role exactly.

const std = @import("std");

pub const FANO_WIRE: usize = 136;
pub const FANO_CAP: usize = 64;
pub const FANO_CENTER: u8 = 7;

pub const SEAL_IV: u256 = 0xF4A0F4A0F4A0F4A0F4A0F4A0F4A0F4A0F4A0F4A0F4A0F4A0F4A0F4A0F4A0F4A0;
pub const FNV_PRIME: u256 = (@as(u256, 1) << 168) | (@as(u256, 1) << 8) | 0x63;

fn d7(v: u8) u8 {
    return if (v > FANO_CENTER) v - FANO_CENTER else FANO_CENTER - v;
}
fn basisAt(x: u8, y: u8, z: u8) u8 {
    return (d7(x) + d7(y) + d7(z)) & 7;
}
fn phaseAt(y: u8, z: u8) u8 {
    const d = @as(i16, d7(y)) - @as(i16, d7(z));
    return @intCast(@mod(d, 8));
}

/// octonion unit product, generated from the seven Fano lines —
/// returns (sign+2)<<3 | idx, identical encoding to the JS MUL table.
const MUL = blk: {
    var m: [8][8]u8 = undefined;
    for (0..8) |i| {
        m[0][i] = (3 << 3) | @as(u8, @intCast(i));
        m[i][0] = (3 << 3) | @as(u8, @intCast(i));
    }
    for (1..8) |i| m[i][i] = (1 << 3) | 0;
    const LINES = [7][3]u8{
        .{ 1, 2, 3 }, .{ 1, 4, 5 }, .{ 1, 7, 6 }, .{ 2, 4, 6 },
        .{ 2, 5, 7 }, .{ 3, 4, 7 }, .{ 3, 5, 6 },
    };
    for (LINES) |line| {
        const a = line[0];
        const b = line[1];
        const c = line[2];
        const PAIRS = [3][2]u8{ .{ a, b }, .{ b, c }, .{ c, a } };
        for (PAIRS) |p| {
            const x = p[0];
            const y = p[1];
            const z = a + b + c - x - y;
            m[x][y] = (3 << 3) | z;
            m[y][x] = (1 << 3) | z;
        }
    }
    break :blk m;
};

fn unitMul(a: u8, b: u8) u8 {
    return MUL[a & 7][b & 7];
}

pub const Hop = struct { x: u8, y: u8, z: u8, basis: u8, phase: u8 };

// Route coords are u32, not u8 — cell-word coord fields are 12-bit, so a
// hostile wire can claim src coords up to 4095 and the JS twin walks them
// with number semantics (≤12286 hops). u32 mirrors the JS walk exactly;
// u8 wraparound would diverge AND unbounded hops would smash the stack.

fn d7u(v: u32) u32 {
    return if (v > FANO_CENTER) v - FANO_CENTER else FANO_CENTER - v;
}
fn basisAtU(x: u32, y: u32, z: u32) u8 {
    return @intCast((d7u(x) + d7u(y) + d7u(z)) & 7);
}
fn phaseAtU(y: u32, z: u32) u8 {
    const d = @as(i64, d7u(y)) - @as(i64, d7u(z));
    return @intCast(@mod(d, 8));
}

fn stepRoute(x: *u32, y: *u32, z: *u32, dx: u32, dy: u32, dz: u32) void {
    const ex = if (dx > x.*) dx - x.* else x.* - dx;
    const ey = if (dy > y.*) dy - y.* else y.* - dy;
    const ez = if (dz > z.*) dz - z.* else z.* - dz;
    if (ex >= ey and ex >= ez) {
        x.* = if (dx > x.*) x.* + 1 else x.* - 1;
    } else if (ey >= ez) {
        y.* = if (dy > y.*) y.* + 1 else y.* - 1;
    } else {
        z.* = if (dz > z.*) z.* + 1 else z.* - 1;
    }
}

/// Manhattan walk src→dst, greatest-remaining-axis first — same semantics
/// as the JS twin: any u32 coord walks to dst by ±1 steps and always
/// terminates (≤ |dx−sx|+|dy−sy|+|dz−sz|+1 hops). hops[] is a bounded
/// diagnostic view: fills until full, still reports the true hop count.
pub fn route(sx: u32, sy: u32, sz: u32, dx: u32, dy: u32, dz: u32, hops: *[64]Hop) usize {
    var n: usize = 0;
    var x = sx;
    var y = sy;
    var z = sz;
    while (true) {
        if (n < hops.len)
            hops[n] = .{ .x = @intCast(x & 0xff), .y = @intCast(y & 0xff), .z = @intCast(z & 0xff), .basis = basisAtU(x, y, z), .phase = phaseAtU(y, z) };
        n += 1;
        if (x == dx and y == dy and z == dz) break;
        stepRoute(&x, &y, &z, dx, dy, dz);
    }
    return n;
}

/// route signature folded in-stream during the walk — identical result to
/// the JS two-pass version, no hops array needed (unbounded for hostile
/// coords).
fn routeSignatureWalk(sx: u32, sy: u32, sz: u32, dx: u32, dy: u32, dz: u32) u8 {
    var sign: i8 = 1;
    var idx: u8 = 0;
    var x = sx;
    var y = sy;
    var z = sz;
    while (true) {
        const p = unitMul(idx, basisAtU(x, y, z));
        sign *= if ((p >> 3) == 3) @as(i8, 1) else -1;
        idx = p & 7;
        if (x == dx and y == dy and z == dz) break;
        stepRoute(&x, &y, &z, dx, dy, dz);
    }
    return (@as(u8, @intCast(sign + 2)) << 3) | idx;
}

pub fn cellWord(x: u8, y: u8, z: u8) [32]u8 {
    var out: [32]u8 = [_]u8{0} ** 32;
    const dist = d7(x) + d7(y) + d7(z);
    const frac: u256 = (@as(u256, dist) << 128) / 21;
    if (frac >= (@as(u256, 1) << 128)) {
        @memset(out[0..16], 0xff);
    } else {
        var f = frac;
        for (0..16) |i| {
            out[i] = @intCast(f & 0xff);
            f >>= 8;
        }
    }
    const top: u64 = (@as(u64, phaseAt(y, z)) << 15) |
        (@as(u64, 1) << @as(u6, @intCast(18 + basisAt(x, y, z)))) |
        (@as(u64, x) << 27) | (@as(u64, y) << 39) | (@as(u64, z) << 51);
    std.mem.writeInt(u64, out[24..32], top, .little);
    return out;
}

/// u256 FNV-1a over cell word + dst + seq + plen + payload, then the
/// octonion route signature and per-hop phases folded in. Returns the
/// 32-byte seal (little-endian limbs, matching the JS Buffer layout).
pub fn seal(wire: *const [FANO_WIRE]u8) [32]u8 {
    const top = std.mem.readInt(u64, wire[24..32], .little);
    // 12-bit cell-word coord fields — up to 4095 on hostile wires; the JS
    // twin walks them with number semantics, so u32 mirrors it exactly.
    const sx: u32 = @intCast((top >> 27) & 0xfff);
    const sy: u32 = @intCast((top >> 39) & 0xfff);
    const sz: u32 = @intCast((top >> 51) & 0xfff);
    const dx: u32 = wire[32];
    const dy: u32 = wire[33];
    const dz: u32 = wire[34];

    var h: u256 = SEAL_IV;
    for (0..40) |i| h = (h ^ @as(u256, wire[i])) *% FNV_PRIME;
    const plen = @min(@as(usize, wire[39]), FANO_CAP);
    for (0..plen) |i| h = (h ^ @as(u256, wire[40 + i])) *% FNV_PRIME;

    h = std.math.rotl(u256, h, 5);
    h ^= @as(u256, routeSignatureWalk(sx, sy, sz, dx, dy, dz));

    // per-hop phase fold — hops[0] is the start cell, so the fold touches
    // the current coord BEFORE stepping (JS pushes start, then walks).
    var x = sx;
    var y = sy;
    var z = sz;
    while (true) {
        h = std.math.rotl(u256, h, 3);
        h ^= @as(u256, phaseAtU(y, z));
        if (x == dx and y == dy and z == dz) break;
        stepRoute(&x, &y, &z, dx, dy, dz);
    }

    var out: [32]u8 = undefined;
    var v = h;
    for (0..32) |i| {
        out[i] = @intCast(v & 0xff);
        v >>= 8;
    }
    return out;
}

pub fn verify(wire: *const [FANO_WIRE]u8) bool {
    // Canonical form: bytes past plen inside the payload area ride the
    // wire outside the seal's coverage. Refusing any nonzero byte there
    // keeps the scratch region from smuggling data under a valid seal.
    const plen = @min(@as(usize, wire[39]), FANO_CAP);
    for (wire[40 + plen .. 104]) |b| if (b != 0) return false;
    const s = seal(wire);
    return std.mem.eql(u8, &s, wire[104..136]);
}

pub fn build(sx: u8, sy: u8, sz: u8, dx: u8, dy: u8, dz: u8, seq: u32, payload: []const u8) [FANO_WIRE]u8 {
    var wire: [FANO_WIRE]u8 = [_]u8{0} ** FANO_WIRE;
    const cw = cellWord(sx, sy, sz);
    @memcpy(wire[0..32], &cw);
    wire[32] = dx;
    wire[33] = dy;
    wire[34] = dz;
    std.mem.writeInt(u32, wire[35..39], seq, .little);
    const len = @min(payload.len, FANO_CAP);
    wire[39] = @intCast(len);
    @memcpy(wire[40 .. 40 + len], payload[0..len]);
    const s = seal(&wire);
    @memcpy(wire[104..136], &s);
    return wire;
}

// ---------- wasm C-ABI surface — in-process native seal/verify for the
// JS hot paths. security/fano-mesh-bridge.mjs loads the wasm artifact
// when present and falls back to the BigInt twin otherwise. ----------

export fn fano_verify(wire: [*]const u8) u8 {
    const w: *const [FANO_WIRE]u8 = wire[0..FANO_WIRE];
    return if (verify(w)) 1 else 0;
}

export fn fano_seal(wire: [*]const u8, out: [*]u8) void {
    const w: *const [FANO_WIRE]u8 = wire[0..FANO_WIRE];
    const s = seal(w);
    @memcpy(out[0..32], &s);
}

// scratch region inside the module's data segment — JS writes the wire
// at fano_buf() and reads the 32-byte seal at fano_buf()+FANO_WIRE.
var wasm_buf: [FANO_WIRE + 32]u8 = undefined;
export fn fano_buf() [*]u8 {
    return &wasm_buf;
}

// ---------- golden vectors — machine-extracted from firmware
// fano_vectors.h PACKET_VECS (identical set to fano-mesh-bridge.mjs)

const VECS = [3][]const u8{
    "b66ddbb66ddbb66ddbb66ddbb66ddbb600000000000000000080000a00011800" ++
        "0d0e0e0700000006676f6c64656e000000000000000000000000000000000000" ++
        "0000000000000000000000000000000000000000000000000000000000000000" ++
        "0000000000000000a4649b12e03ffd2ea096201660fbd5280c44d799fb143b0a" ++
        "9fe3549a9caa2975",
    "ffffffffffffffffffffffffffffffff00000000000000000000800000000000" ++
        "0e0e0e0100000010636f726e65722d746f2d636f726e65720000000000000000" ++
        "0000000000000000000000000000000000000000000000000000000000000000" ++
        "0000000000000000898d1118492535ef2457478731b0e91e1c1a7059ac05352e" ++
        "99841ffb8445f419",
    "0000000000000000000000000000000000000000000000000000043880033800" ++
        "0707070000000000000000000000000000000000000000000000000000000000" ++
        "0000000000000000000000000000000000000000000000000000000000000000" ++
        "0000000000000000b064aed5cda83e14d7939401ee8a9e2b155ff08dc1294afc" ++
        "f07091cdd5fed08e",
};

fn hexVec(hex: []const u8) [FANO_WIRE]u8 {
    var w: [FANO_WIRE]u8 = undefined;
    var i: usize = 0;
    while (i < FANO_WIRE) : (i += 1) {
        w[i] = std.fmt.parseInt(u8, hex[i * 2 .. i * 2 + 2], 16) catch unreachable;
    }
    return w;
}

test "golden vectors: all 3 firmware seals verify bit-exact" {
    for (VECS) |hex| {
        const w = hexVec(hex);
        try std.testing.expect(verify(&w));
    }
}

test "build → verify round-trip across lattice corners" {
    const payload = "golden";
    const w = build(0x0d, 0x0e, 0x0e, 0x0d, 0x0e, 0x0e, 6, payload);
    try std.testing.expect(verify(&w));
    const corner = build(14, 14, 14, 0, 0, 0, 16, "corner-to-corner");
    try std.testing.expect(verify(&corner));
    const same = build(7, 7, 7, 7, 7, 7, 1, "zero-hop");
    try std.testing.expect(verify(&same));
}

test "hostile cell-word coords: 12-bit fields → bounded u32 walk" {
    // A wire whose cell-word coord fields are 0xfff (4095) — outside the
    // 15³ grid. The JS twin walks this with number semantics (~12286
    // hops); u32 mirror + in-stream fold reproduces the seal bit-exact.
    // Guards the stack-smash class found by capstone B1b.
    const hex =
        "ffffffffffffffffffffffffffffffff0000000000000000ffffffffffffffff0e0e0e2a0000000e686f7374696c652d636f6f726473000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000062667845f7731cd07bcfd6d858f5f03f6a976210e3283f05ef2016c20b616f96";
    var wire: [FANO_WIRE]u8 = undefined;
    for (0..FANO_WIRE) |i|
        wire[i] = try std.fmt.parseInt(u8, hex[i * 2 .. i * 2 + 2], 16);
    try std.testing.expect(verify(&wire));
}

test "seal forgery: one flipped payload byte fails verification" {
    var w = build(1, 2, 3, 4, 5, 6, 9, "forgery-probe");
    try std.testing.expect(verify(&w));
    w[50] ^= 0xff;
    try std.testing.expect(!verify(&w));
}

test "canonical tail: nonzero scratch byte refused under a valid seal" {
    var w = build(1, 2, 3, 4, 5, 6, 9, "tail-probe");
    try std.testing.expect(verify(&w));
    w[103] = 0xaa; // beyond plen — seal does not cover it
    try std.testing.expect(!verify(&w));
    w[103] = 0;
    try std.testing.expect(verify(&w));
}

test "plen clamp: oversized declared length reads ≤64 payload bytes" {
    var w = build(3, 3, 3, 9, 9, 9, 2, "cap-check");
    w[39] = 200; // declared plen beyond cap — seal covers only [40,104)
    const s = seal(&w);
    try std.testing.expect(std.mem.eql(u8, &s, w[104..136]) == false); // seal changed vs built
}

test "octonion table matches Fano-line construction" {
    // identity row
    for (0..8) |i| try std.testing.expectEqual(@as(u8, (3 << 3) | @as(u8, @intCast(i))), unitMul(0, @intCast(i)));
    // imaginary units square to -1
    for (1..8) |i| try std.testing.expectEqual(@as(u8, 8), unitMul(@intCast(i), @intCast(i)));
    // e1*e2 = +e3, e2*e1 = -e3 (line [1,2,3])
    try std.testing.expectEqual(@as(u8, (3 << 3) | 3), unitMul(1, 2));
    try std.testing.expectEqual(@as(u8, (1 << 3) | 3), unitMul(2, 1));
}
