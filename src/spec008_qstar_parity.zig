// SPEC-008 wire parity harness — channel-transform round-trip on the
// canonical 136-byte FANO envelope (D11/P3, Mosi LVCE pattern ported).
//
// The LVCE discipline: encode → channel (frame/stuff/slice) → decode →
// re-seal must be *bit-exact*, and capacity is a hard bound. This harness
// frames the sealed packet into a transport stream, walks it back, and
// proves:
//   * round-trip parity — framed bytes decode to the identical envelope;
//   * single-byte corruption at ANY offset is detected (frame structure
//     + per-frame XOR check together cover the whole stream);
//   * pigeonhole — >136 payload can never decode (capacity is enforced,
//     not advisory);
//   * truncation and frame-splicing refuse cleanly, never panic;
//   * XOR parity over the stream recovers exactly one erased frame —
//     matching the dep's real semantics (escrow harness proved the
//     "Reed-Solomon" parity is an XOR-sum, one erasure max).
// Integer-only: u8 everywhere, GF arithmetic is integer.
//
// Honest notes: a single-byte change is always caught — the XOR check
// differs whenever any frame byte differs. Two coordinated bytes in the
// same frame can evade XOR; that is a stated bound, not a defect, and
// the outer envelope's own seal is the second wall (tested elsewhere).

const std = @import("std");

const WIRE_PACKET_BYTES: usize = 136;
const FRAME_PAYLOAD: usize = 56; // chunk size on the wire
const FRAME_OVERHEAD: usize = 4; // magic(2) + seq + len + check(1) → 5? see below
const MAGIC0: u8 = 0xF0;
const MAGIC1: u8 = 0xA0;

// frame layout: [MAGIC0, MAGIC1, seq, len, payload[len], check]
//   check = XOR of seq ^ len ^ every payload byte — single-byte
//   corruption anywhere in the frame always flips the check.
fn frameCheck(seq: u8, len: u8, payload: []const u8) u8 {
    var c: u8 = seq ^ len;
    for (payload) |b| c ^= b;
    return c;
}

/// Encode a ≤136-byte envelope into a framed transport stream.
/// Returns the number of bytes written, or an error if input exceeds
/// the envelope capacity (pigeonhole: the bound is enforced at encode).
fn frame(packet: []const u8, out: []u8) !usize {
    if (packet.len > WIRE_PACKET_BYTES) return error.OverCapacity;
    var n: usize = 0;
    var seq: u8 = 0;
    var off: usize = 0;
    while (off < packet.len) : (seq += 1) {
        const len: u8 = @intCast(@min(FRAME_PAYLOAD, packet.len - off));
        const payload = packet[off .. off + len];
        if (n + 5 + len > out.len) return error.OutputOverflow;
        out[n] = MAGIC0;
        out[n + 1] = MAGIC1;
        out[n + 2] = seq;
        out[n + 3] = len;
        @memcpy(out[n + 4 .. n + 4 + len], payload);
        out[n + 4 + len] = frameCheck(seq, len, payload);
        n += 5 + len;
        off += len;
    }
    return n;
}

/// Decode a framed transport stream back into the envelope.
/// Refuses: non-frame bytes, out-of-order sequence, declared-len
//   mismatch, truncation, corruption (check), and — the pigeonhole —
/// more than 136 total payload bytes.
fn unframe(stream: []const u8, out: []u8) !usize {
    var n: usize = 0;
    var i: usize = 0;
    var expect_seq: u8 = 0;
    while (i < stream.len) {
        if (i + 5 > stream.len) return error.Truncated;
        if (stream[i] != MAGIC0 or stream[i + 1] != MAGIC1)
            return error.BadMagic;
        const seq = stream[i + 2];
        const len: usize = stream[i + 3];
        if (seq != expect_seq) return error.OutOfOrder;
        if (i + 5 + len > stream.len) return error.Truncated;
        const payload = stream[i + 4 .. i + 4 + len];
        const check = stream[i + 4 + len];
        if (check != frameCheck(seq, @intCast(len), payload))
            return error.Corrupt;
        if (n + len > WIRE_PACKET_BYTES) return error.OverCapacity;
        if (n + len > out.len) return error.OutputOverflow;
        @memcpy(out[n .. n + len], payload);
        n += len;
        i += 5 + len;
        expect_seq += 1;
    }
    return n;
}

/// XOR-parity over fixed-size cells of the stream — one erased frame
/// recovers, two are underdetermined. Mirrors the escrow harness's
/// honest capacity note.
fn streamParity(cells: []const []const u8, cell_size: usize, out: []u8) void {
    @memset(out[0..cell_size], 0);
    for (cells) |cell| {
        std.debug.assert(cell.len == cell_size);
        for (cell, 0..) |b, j| out[j] ^= b;
    }
}

// ─────────────────────────────── tests ───────────────────────────────

fn testPacket() [WIRE_PACKET_BYTES]u8 {
    var p: [WIRE_PACKET_BYTES]u8 = undefined;
    for (&p, 0..) |*b, i| b.* = @truncate(i *% 131 +% 7);
    return p;
}

test "parity: framed round-trip on the 136B envelope is bit-exact" {
    const pkt = testPacket();
    var stream: [512]u8 = undefined;
    const n = try frame(&pkt, &stream);
    // 136 = 56+56+24 → 3 frames, 5-byte overhead each
    try std.testing.expectEqual(@as(usize, 3 * 5 + 136), n);
    var back: [WIRE_PACKET_BYTES]u8 = undefined;
    const m = try unframe(stream[0..n], &back);
    try std.testing.expectEqual(WIRE_PACKET_BYTES, m);
    try std.testing.expectEqualSlices(u8, &pkt, &back);
}

test "parity: single-byte corruption at every offset is detected" {
    const pkt = testPacket();
    var stream: [512]u8 = undefined;
    const n = try frame(&pkt, &stream);
    var detected: usize = 0;
    var back: [WIRE_PACKET_BYTES]u8 = undefined;
    for (0..n) |pos| {
        var corrupted: [512]u8 = undefined;
        @memcpy(corrupted[0..n], stream[0..n]);
        corrupted[pos] ^= 0xA5;
        if (unframe(corrupted[0..n], &back)) |_| {} else |_| {
            detected += 1;
        }
    }
    // every single-byte corruption must be caught — magic, seq, len,
    // payload, or check bytes all feed the check or the structure
    try std.testing.expectEqual(n, detected);
}

test "parity: pigeonhole — >136B payload can never decode" {
    var pkt: [WIRE_PACKET_BYTES + 8]u8 = undefined;
    @memset(&pkt, 0x5A);
    var stream: [512]u8 = undefined;
    try std.testing.expectError(error.OverCapacity, frame(&pkt, &stream));
    // and a stream carrying 137+ payload bytes is refused at decode:
    // hand-splice a fourth frame claiming capacity beyond the envelope
    const good = testPacket();
    const n = try frame(&good, &stream);
    // append one more frame with 8 payload bytes (would total 144)
    var tail: [512]u8 = undefined;
    @memcpy(tail[0..n], stream[0..n]);
    tail[n] = MAGIC0;
    tail[n + 1] = MAGIC1;
    tail[n + 2] = 3; // next seq
    tail[n + 3] = 8;
    @memset(tail[n + 4 .. n + 12], 0x11);
    tail[n + 12] = frameCheck(3, 8, tail[n + 4 .. n + 12]);
    var back: [200]u8 = undefined;
    try std.testing.expectError(error.OverCapacity, unframe(tail[0 .. n + 13], &back));
}

test "parity: truncation and splice refuse cleanly" {
    const pkt = testPacket();
    var stream: [512]u8 = undefined;
    const n = try frame(&pkt, &stream);
    var back: [WIRE_PACKET_BYTES]u8 = undefined;
    // cut mid-frame
    try std.testing.expectError(error.Truncated, unframe(stream[0 .. n - 3], &back));
    // wrong leading byte
    var bad: [512]u8 = undefined;
    @memcpy(bad[0..n], stream[0..n]);
    bad[0] = 0x00;
    try std.testing.expectError(error.BadMagic, unframe(bad[0..], &back));
    // swap seq order: duplicate frame 0's seq into frame 1
    var reseq: [512]u8 = undefined;
    @memcpy(reseq[0..n], stream[0..n]);
    reseq[5 + 56 + 2] = 0; // frame 1 seq field → 0, out of order
    try std.testing.expectError(error.OutOfOrder, unframe(reseq[0..], &back));
}

test "parity: one erased frame recovers via XOR; two are underdetermined" {
    const pkt = testPacket();
    var stream: [512]u8 = undefined;
    const n = try frame(&pkt, &stream);
    // treat each frame as a fixed-size cell padded to FRAME_PAYLOAD+5
    const cell = FRAME_PAYLOAD + 5;
    const cells_n = (n + cell - 1) / cell;
    var cells: [8][61]u8 = undefined;
    for (0..cells_n) |c| {
        @memset(&cells[c], 0);
        const start = c * cell;
        const end = @min(start + cell, n);
        @memcpy(cells[c][0 .. end - start], stream[start..end]);
    }
    var parity: [61]u8 = undefined;
    const refs = [_][]const u8{ &cells[0], &cells[1], &cells[2] };
    streamParity(&refs, cell, &parity);
    // erase cell 1 → recover via XOR of parity ^ others
    var recovered: [61]u8 = undefined;
    for (0..cell) |j| recovered[j] = parity[j] ^ cells[0][j] ^ cells[2][j];
    try std.testing.expectEqualSlices(u8, &cells[1], &recovered);
    // re-run the frame layer on the recovered stream — bit-exact holds
    var rebuilt: [512]u8 = undefined;
    @memcpy(rebuilt[0..cell], &cells[0]);
    @memcpy(rebuilt[cell .. 2 * cell], &recovered);
    @memcpy(rebuilt[2 * cell .. 3 * cell], &cells[2]);
    var back: [WIRE_PACKET_BYTES]u8 = undefined;
    const m = try unframe(rebuilt[0..n], &back);
    try std.testing.expectEqual(WIRE_PACKET_BYTES, m);
    try std.testing.expectEqualSlices(u8, &pkt, &back);
    // two erasures: parity is one equation — refuse, don't fake
    var two: [61]u8 = undefined;
    for (0..cell) |j| two[j] = parity[j] ^ cells[0][j];
    // with cells[1] AND cells[2] erased the XOR is unknowable — the
    // decode must fail somewhere (structure or check), never succeed
    var rebuilt2: [512]u8 = undefined;
    @memcpy(rebuilt2[0..cell], &cells[0]);
    @memset(rebuilt2[cell .. 3 * cell], 0);
    _ = unframe(rebuilt2[0..n], &back) catch |e| {
        try std.testing.expect(e == error.Corrupt or e == error.BadMagic or
            e == error.Truncated or e == error.OutOfOrder);
        return;
    };
    return error.TestUnexpectedResult; // silence means two-erasure decoded
}

test "parity: empty envelope frames to zero-length stream" {
    var stream: [64]u8 = undefined;
    const n = try frame(&[_]u8{}, &stream);
    try std.testing.expectEqual(@as(usize, 0), n);
    var back: [WIRE_PACKET_BYTES]u8 = undefined;
    const m = try unframe(stream[0..0], &back);
    try std.testing.expectEqual(@as(usize, 0), m);
}
