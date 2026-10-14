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
//
// LAWB-09 remediation (D12): the XOR check is now explicitly layered.
//   Layer 1 — frameCheck: unkeyed XOR, error DETECTION only (noise).
//             Forgeable by an adversary (payload^delta + check^delta);
//             that bound stays on record, tested and labeled.
//   Layer 2 — frameTag + packetTag: keyed HMAC-SHA256 tags truncated to 8
//             bytes. Each data frame tag covers its raw frame
//             (magic|seq|len|payload|check); a packet terminator commits to
//             the complete decoded envelope so a valid frame from another
//             same-key packet cannot be spliced in. Any modification to a
//             covered byte fails authentication without the channel key —
//             the adversary wall below the envelope seal.
//             frameAuth/unframeAuth are the authenticated channel;
//             frame/unframe remain the inner detection layer.

const std = @import("std");

const WIRE_PACKET_BYTES: usize = 136;
const FRAME_PAYLOAD: usize = 56; // chunk size on the wire
const TAG_BYTES: usize = 8; // truncated HMAC-SHA256 — 2^64 forgery space
const MAGIC0: u8 = 0xF0;
const MAGIC1: u8 = 0xA0;
const END_MAGIC1: u8 = 0xA1;
const END_FRAME_BYTES: usize = 2 + TAG_BYTES;
const PACKET_TAG_DOMAIN = "spec008-qstar-parity-packet-v1";

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
    const frame_count = (packet.len + FRAME_PAYLOAD - 1) / FRAME_PAYLOAD;
    const required = packet.len + frame_count * 5;
    if (required > out.len) return error.OutputOverflow;
    var n: usize = 0;
    var seq: u8 = 0;
    var off: usize = 0;
    while (off < packet.len) : (seq += 1) {
        const len: u8 = @intCast(@min(FRAME_PAYLOAD, packet.len - off));
        const payload = packet[off .. off + len];
        const frame_len = 5 + @as(usize, len);
        const end = std.math.add(usize, n, frame_len) catch return error.OutputOverflow;
        if (end > out.len) return error.OutputOverflow;
        out[n] = MAGIC0;
        out[n + 1] = MAGIC1;
        out[n + 2] = seq;
        out[n + 3] = len;
        @memcpy(out[n + 4 .. n + 4 + len], payload);
        out[n + 4 + len] = frameCheck(seq, len, payload);
        n = end;
        off += len;
    }
    return n;
}

/// Decode a framed transport stream back into the envelope.
/// Refuses: non-frame bytes, non-canonical/zero lengths, out-of-order
/// sequence, truncation, corruption (check), and — the pigeonhole —
/// more than 136 total payload bytes.
fn unframe(stream: []const u8, out: []u8) !usize {
    var decoded: [WIRE_PACKET_BYTES]u8 = undefined;
    var n: usize = 0;
    var i: usize = 0;
    var expect_seq: u8 = 0;
    while (i < stream.len) {
        const remaining = stream.len - i;
        if (remaining < 5) return error.Truncated;
        if (stream[i] != MAGIC0 or stream[i + 1] != MAGIC1)
            return error.BadMagic;
        const seq = stream[i + 2];
        const len: usize = stream[i + 3];
        if (len == 0 or len > FRAME_PAYLOAD) return error.InvalidLength;
        if (seq != expect_seq) return error.OutOfOrder;
        const frame_len = 5 + len;
        if (remaining < frame_len) return error.Truncated;
        const payload = stream[i + 4 .. i + 4 + len];
        const check = stream[i + 4 + len];
        if (check != frameCheck(seq, @intCast(len), payload))
            return error.Corrupt;
        if (len > decoded.len - n) return error.OverCapacity;
        @memcpy(decoded[n .. n + len], payload);
        n += len;
        i += frame_len;
        expect_seq += 1;
    }
    if (n > out.len) return error.OutputOverflow;
    @memcpy(out[0..n], decoded[0..n]);
    return n;
}

/// XOR-parity over fixed-size cells of the stream — one erased frame
/// recovers, two are underdetermined. Mirrors the escrow harness's
/// honest capacity note.
fn streamParity(cells: []const []const u8, cell_size: usize, out: []u8) !void {
    if (cell_size == 0) return error.InvalidCellSize;
    if (out.len < cell_size) return error.OutputOverflow;
    for (cells) |cell| if (cell.len != cell_size) return error.MismatchedCell;
    @memset(out[0..cell_size], 0);
    for (cells) |cell| {
        for (cell, 0..) |b, j| out[j] ^= b;
    }
}

// ─────────── Layer 2: authenticated channel (LAWB-09 remediation) ───────────

/// Keyed tag over one raw frame: HMAC-SHA256(key, frame_bytes)[0..8].
/// Covers magic, seq, len, payload AND the detection check byte — an
/// adversary cannot update the tag without the key, so the payload^delta
/// + check^delta forge from LAWB-09 dies here.
fn frameTag(key: []const u8, raw_frame: []const u8) [TAG_BYTES]u8 {
    var mac: [32]u8 = undefined;
    std.crypto.auth.hmac.sha2.HmacSha256.create(&mac, raw_frame, key);
    var tag: [TAG_BYTES]u8 = undefined;
    @memcpy(&tag, mac[0..TAG_BYTES]);
    return tag;
}

/// Keyed tag over the complete decoded packet. The terminator makes the
/// authenticated lane packet-bound rather than only frame-bound: a valid
/// frame from another stream keyed by the same secret cannot be spliced in
/// without changing the packet commitment.
fn packetTag(key: []const u8, packet: []const u8) [TAG_BYTES]u8 {
    var mac: [32]u8 = undefined;
    var hmac = std.crypto.auth.hmac.sha2.HmacSha256.init(key);
    hmac.update(PACKET_TAG_DOMAIN);
    hmac.update(packet);
    hmac.final(&mac);
    var tag: [TAG_BYTES]u8 = undefined;
    @memcpy(&tag, mac[0..TAG_BYTES]);
    return tag;
}

fn tagEql(got: []const u8, want: [TAG_BYTES]u8) bool {
    if (got.len != TAG_BYTES) return false;
    var got_array: [TAG_BYTES]u8 = undefined;
    @memcpy(&got_array, got[0..TAG_BYTES]);
    return std.crypto.utils.timingSafeEql([TAG_BYTES]u8, got_array, want);
}

/// Authenticated encode: same frames as `frame`, plus a keyed tag per
/// frame and a packet terminator. Data layout:
/// [magic magic seq len payload[len] check tag[8]] ... [magic end tag[8]].
fn frameAuth(key: []const u8, packet: []const u8, out: []u8) !usize {
    if (packet.len > WIRE_PACKET_BYTES) return error.OverCapacity;
    const frame_count = (packet.len + FRAME_PAYLOAD - 1) / FRAME_PAYLOAD;
    const required = packet.len + frame_count * (5 + TAG_BYTES) + END_FRAME_BYTES;
    if (required > out.len) return error.OutputOverflow;
    var n: usize = 0;
    var seq: u8 = 0;
    var off: usize = 0;
    while (off < packet.len) : (seq += 1) {
        const len: u8 = @intCast(@min(FRAME_PAYLOAD, packet.len - off));
        const payload = packet[off .. off + len];
        const frame_len = 5 + TAG_BYTES + @as(usize, len);
        const end = std.math.add(usize, n, frame_len) catch return error.OutputOverflow;
        if (end > out.len) return error.OutputOverflow;
        out[n] = MAGIC0;
        out[n + 1] = MAGIC1;
        out[n + 2] = seq;
        out[n + 3] = len;
        @memcpy(out[n + 4 .. n + 4 + len], payload);
        out[n + 4 + len] = frameCheck(seq, len, payload);
        const tag = frameTag(key, out[n .. n + 5 + len]);
        @memcpy(out[n + 5 + len .. n + 5 + TAG_BYTES + len], &tag);
        n = end;
        off += len;
    }
    const end = std.math.add(usize, n, END_FRAME_BYTES) catch return error.OutputOverflow;
    if (end > out.len) return error.OutputOverflow;
    out[n] = MAGIC0;
    out[n + 1] = END_MAGIC1;
    const packet_tag = packetTag(key, packet);
    @memcpy(out[n + 2 .. end], &packet_tag);
    return end;
}

/// Authenticated decode: bound each frame's extents, verify its keyed tag
/// before copying payload, then enforce sequence/check/capacity. The packet
/// terminator refuses truncation, trailing bytes, and cross-packet splices;
/// forgery and tag replay refuse at BadTag/BadPacketTag.
fn unframeAuth(key: []const u8, stream: []const u8, out: []u8) !usize {
    var decoded: [WIRE_PACKET_BYTES]u8 = undefined;
    var n: usize = 0;
    var i: usize = 0;
    var expect_seq: u8 = 0;
    while (i < stream.len) {
        const remaining = stream.len - i;
        if (remaining < 2) return error.Truncated;
        if (stream[i] != MAGIC0) return error.BadMagic;
        if (stream[i + 1] == END_MAGIC1) {
            if (remaining < END_FRAME_BYTES) return error.Truncated;
            if (remaining > END_FRAME_BYTES) return error.TrailingBytes;
            const tag = stream[i + 2 .. i + END_FRAME_BYTES];
            if (!tagEql(tag, packetTag(key, decoded[0..n]))) return error.BadPacketTag;
            if (n > out.len) return error.OutputOverflow;
            @memcpy(out[0..n], decoded[0..n]);
            return n;
        }
        if (stream[i + 1] != MAGIC1) return error.BadMagic;
        if (remaining < 5 + TAG_BYTES) return error.Truncated;
        const seq = stream[i + 2];
        const len: usize = stream[i + 3];
        if (len == 0 or len > FRAME_PAYLOAD) return error.InvalidLength;
        const frame_len = 5 + len;
        const wire_len = frame_len + TAG_BYTES;
        if (remaining < wire_len) return error.Truncated;
        const raw = stream[i .. i + frame_len];
        const tag = stream[i + frame_len .. i + wire_len];
        if (!tagEql(tag, frameTag(key, raw))) return error.BadTag;
        const payload = stream[i + 4 .. i + 4 + len];
        if (seq != expect_seq) return error.OutOfOrder;
        if (raw[4 + len] != frameCheck(seq, @intCast(len), payload))
            return error.Corrupt;
        if (len > decoded.len - n) return error.OverCapacity;
        @memcpy(decoded[n .. n + len], payload);
        n += len;
        i += wire_len;
        expect_seq += 1;
    }
    return error.Truncated;
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
    try std.testing.expectError(error.BadMagic, unframe(bad[0..n], &back));
    // swap seq order: duplicate frame 0's seq into frame 1
    var reseq: [512]u8 = undefined;
    @memcpy(reseq[0..n], stream[0..n]);
    reseq[5 + 56 + 2] = 0; // frame 1 seq field → 0, out of order
    try std.testing.expectError(error.OutOfOrder, unframe(reseq[0..n], &back));
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
    try streamParity(&refs, cell, &parity);
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

test "parity: non-canonical frames and parity domains refuse cleanly" {
    var back: [WIRE_PACKET_BYTES]u8 = undefined;

    // The encoder never emits a zero-length frame. Accepting one lets an
    // attacker drive the u8 sequence cursor without consuming capacity.
    const empty_frame = [_]u8{ MAGIC0, MAGIC1, 0, 0, frameCheck(0, 0, &[_]u8{}) };
    try std.testing.expectError(error.InvalidLength, unframe(&empty_frame, &back));

    // Canonical transport chunks are 1..56 bytes. A single 136-byte frame
    // may fit the aggregate cap, but it is not this wire format.
    var oversized: [5 + 57]u8 = undefined;
    oversized[0] = MAGIC0;
    oversized[1] = MAGIC1;
    oversized[2] = 0;
    oversized[3] = 57;
    @memset(oversized[4 .. 4 + 57], 0x22);
    oversized[4 + 57] = frameCheck(0, 57, oversized[4 .. 4 + 57]);
    try std.testing.expectError(error.InvalidLength, unframe(&oversized, &back));

    var auth_frame: [5 + 57 + TAG_BYTES]u8 = undefined;
    const auth_raw_len = 5 + 57;
    @memcpy(auth_frame[0..auth_raw_len], &oversized);
    const auth_tag = frameTag(TEST_KEY, auth_frame[0..auth_raw_len]);
    @memcpy(auth_frame[auth_raw_len..], &auth_tag);
    try std.testing.expectError(error.InvalidLength, unframeAuth(TEST_KEY, &auth_frame, &back));

    const c0 = [_]u8{ 1, 2 };
    const c1 = [_]u8{3};
    var parity: [2]u8 = undefined;
    @memset(&parity, 0xAA);
    try std.testing.expectError(error.InvalidCellSize, streamParity(&.{}, 0, &parity));
    try std.testing.expectError(error.MismatchedCell, streamParity(&.{ &c0, &c1 }, 2, &parity));
    try std.testing.expectError(error.OutputOverflow, streamParity(&.{&c0}, 2, parity[0..1]));
    for (parity) |b| try std.testing.expectEqual(@as(u8, 0xAA), b);

    const pkt = testPacket();
    var encoded: [512]u8 = undefined;
    const encoded_n = try frame(&pkt, &encoded);
    var short_sink: [WIRE_PACKET_BYTES - 1]u8 = undefined;
    @memset(&short_sink, 0xAA);
    try std.testing.expectError(error.OutputOverflow, unframe(encoded[0..encoded_n], &short_sink));
    for (short_sink) |b| try std.testing.expectEqual(@as(u8, 0xAA), b);

    var encoded_auth: [640]u8 = undefined;
    const auth_n = try frameAuth(TEST_KEY, &pkt, &encoded_auth);
    var corrupt_auth: [640]u8 = undefined;
    @memcpy(corrupt_auth[0..auth_n], encoded_auth[0..auth_n]);
    corrupt_auth[auth_n - 1] ^= 0x01;
    var sink: [WIRE_PACKET_BYTES]u8 = undefined;
    @memset(&sink, 0xAA);
    try std.testing.expectError(error.BadPacketTag, unframeAuth(TEST_KEY, corrupt_auth[0..auth_n], &sink));
    for (sink) |b| try std.testing.expectEqual(@as(u8, 0xAA), b);
}

// ─── LAWB-09 remediation tests — the keyed layer is the adversary wall ───

const TEST_KEY = "spec008-parity-channel-key-d12";

test "auth: keyed round-trip on the 136B envelope is bit-exact" {
    const pkt = testPacket();
    var stream: [640]u8 = undefined;
    const n = try frameAuth(TEST_KEY, &pkt, &stream);
    // 3 frames × (5 + 8 tag) overhead + 136 payload + terminator tag
    try std.testing.expectEqual(@as(usize, 3 * 13 + 136 + END_FRAME_BYTES), n);
    var back: [WIRE_PACKET_BYTES]u8 = undefined;
    const m = try unframeAuth(TEST_KEY, stream[0..n], &back);
    try std.testing.expectEqual(WIRE_PACKET_BYTES, m);
    try std.testing.expectEqualSlices(u8, &pkt, &back);
}

test "auth: packet terminator binds frames and authenticates empty packets" {
    const pkt = testPacket();
    var stream: [640]u8 = undefined;
    const n = try frameAuth(TEST_KEY, &pkt, &stream);
    var back: [WIRE_PACKET_BYTES]u8 = undefined;

    // Same-key cross-packet splice: every per-frame tag verifies, but the
    // packet terminator commits to the complete decoded envelope.
    var other = testPacket();
    other[60] ^= 0x5A;
    var foreign: [640]u8 = undefined;
    _ = try frameAuth(TEST_KEY, &other, &foreign);
    var spliced: [640]u8 = undefined;
    @memcpy(spliced[0..n], stream[0..n]);
    const f1 = 13 + 56;
    @memcpy(spliced[f1 .. f1 + f1], foreign[f1 .. f1 + f1]);
    try std.testing.expectError(error.BadPacketTag, unframeAuth(TEST_KEY, spliced[0..n], &back));

    try std.testing.expectError(error.Truncated, unframeAuth(TEST_KEY, stream[0 .. n - 1], &back));
    var trailing: [641]u8 = undefined;
    @memcpy(trailing[0..n], stream[0..n]);
    trailing[n] = 0x00;
    try std.testing.expectError(error.TrailingBytes, unframeAuth(TEST_KEY, trailing[0 .. n + 1], &back));

    var empty_stream: [END_FRAME_BYTES]u8 = undefined;
    const empty_n = try frameAuth(TEST_KEY, &[_]u8{}, &empty_stream);
    try std.testing.expectEqual(END_FRAME_BYTES, empty_n);
    const empty_m = try unframeAuth(TEST_KEY, &empty_stream, &back);
    try std.testing.expectEqual(@as(usize, 0), empty_m);
    try std.testing.expectError(error.Truncated, unframeAuth(TEST_KEY, empty_stream[0 .. empty_n - 1], &back));
}

test "auth: the LAWB-09 forge dies at the tag — payload^delta+check^delta" {
    const pkt = testPacket();
    var stream: [640]u8 = undefined;
    const n = try frameAuth(TEST_KEY, &pkt, &stream);
    // replay the documented forge on frame 0: corrupt one payload byte by
    // delta and the detection check by the same delta — the XOR equation
    // still balances (inner layer stays forgeable: the bound stands),
    // but the keyed tag now refuses it.
    var forged: [640]u8 = undefined;
    @memcpy(forged[0..n], stream[0..n]);
    forged[4] ^= 0xA5; // payload byte
    forged[4 + 56] ^= 0xA5; // frame 0 check byte (same delta → check holds)
    var back: [WIRE_PACKET_BYTES]u8 = undefined;
    // inner detection layer: documented bound — the forge still verifies.
    // (Demonstrated on the unkeyed wire format, where the XOR equation
    // balances; the bound stays on record, it is not removed.)
    var inner_stream: [512]u8 = undefined;
    const ni = try frame(&pkt, &inner_stream);
    var inner_forged: [512]u8 = undefined;
    @memcpy(inner_forged[0..ni], inner_stream[0..ni]);
    inner_forged[4] ^= 0xA5;
    inner_forged[4 + 56] ^= 0xA5;
    _ = try unframe(inner_forged[0..ni], &back); // verifies — bound stands
    // authenticated channel: the same bytes refuse at BadTag
    try std.testing.expectError(error.BadTag, unframeAuth(TEST_KEY, forged[0..n], &back));
}

test "auth: wrong key, foreign-stream splice, and tag truncation refuse" {
    const pkt = testPacket();
    var stream: [640]u8 = undefined;
    const n = try frameAuth(TEST_KEY, &pkt, &stream);
    var back: [WIRE_PACKET_BYTES]u8 = undefined;
    // wrong key → first tag mismatch
    try std.testing.expectError(error.BadTag, unframeAuth("attacker-key", stream[0..n], &back));
    // splice a valid frame from a different-key stream — tag won't match
    var foreign: [640]u8 = undefined;
    const nf = try frameAuth("other-channel", &pkt, &foreign);
    var spliced: [640]u8 = undefined;
    @memcpy(spliced[0..n], stream[0..n]);
    // replace frame 1 (offset 13+56=69, len 13+56) with foreign frame 1
    const f1 = 13 + 56;
    @memcpy(spliced[f1 .. f1 + f1], foreign[f1 .. f1 + f1]);
    try std.testing.expectError(error.BadTag, unframeAuth(TEST_KEY, spliced[0..n], &back));
    // truncated tag at end of stream
    try std.testing.expectError(error.Truncated, unframeAuth(TEST_KEY, stream[0 .. n - 4], &back));
    _ = nf;
}

test "auth: 100-iteration adversary loop — every forged mutation refuses" {
    // deterministic attacker: 100 coordinated forgery attempts — single
    // flips, XOR-balanced check forges, seq edits, tag replays. Every
    // single one must refuse; zero may slip through.
    const pkt = testPacket();
    var stream: [640]u8 = undefined;
    const n = try frameAuth(TEST_KEY, &pkt, &stream);
    var back: [WIRE_PACKET_BYTES]u8 = undefined;
    var refused: usize = 0;
    var iter: usize = 0;
    while (iter < 100) : (iter += 1) {
        var attack: [640]u8 = undefined;
        @memcpy(attack[0..n], stream[0..n]);
        switch (iter % 4) {
            0 => { // single-byte corruption at rotating offset
                attack[(iter *% 37) % n] ^= @truncate(1 +% iter);
            },
            1 => { // XOR-balanced forge: payload^delta + check^delta
                const frame_len = 5 + TAG_BYTES + 56;
                const frame_idx = (iter / 4) % 3;
                const base = frame_idx * frame_len;
                const delta: u8 = @truncate(0x10 +% iter);
                attack[base + 4] ^= delta;
                attack[base + 4 + 56] ^= delta;
            },
            2 => { // seq edit — structural AND tag covered
                const frame_len = 5 + TAG_BYTES + 56;
                const frame_idx = (iter / 4) % 3;
                attack[frame_idx * frame_len + 2] ^= 0x7;
            },
            else => { // tag replay: stamp frame 0's tag onto frame 1
                const frame_len = 5 + TAG_BYTES + 56;
                @memcpy(
                    attack[frame_len + 5 + 56 .. frame_len + 5 + 56 + TAG_BYTES],
                    attack[5 + 56 .. 5 + 56 + TAG_BYTES],
                );
            },
        }
        if (unframeAuth(TEST_KEY, attack[0..n], &back)) |_| {} else |_| {
            refused += 1;
        }
    }
    try std.testing.expectEqual(@as(usize, 100), refused);
}
