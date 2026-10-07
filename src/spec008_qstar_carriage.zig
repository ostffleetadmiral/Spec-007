// SPEC-008 qstar carriage harness — FANO artifacts over exotic transports.
//
// Carries the canonical 136-byte FANO sealed envelope (and larger desk
// artifacts where the medium admits it) through every qstar-transport
// medium: QR, optical OPTAR, audio, cassette, paperback Shamir pages,
// LSB steganography, polyglot executables, LoRa radio, and the ESP32
// maypole WiFi↔LoRa bridge already fielded in Fano_V1_6 hardware.
//
// Honest notes:
//   * capacity() in these modules is a registry slot (returns 1), not a
//     byte capacity — payload fitness is proven by round-trip, not claimed.
//   * paperback encodes 2-of-3 Shamir shares (its own gf256 impl), so a
//     printed artifact is itself threshold-resilient.
//   * LORA_MTU = 255 bytes: the 136B envelope fits one LoRa frame; larger
//     desk tokens must fragment (tested honestly below — oversize refuses).
// Integer-only: all payloads are u8 slices; no float enters the wire.

const std = @import("std");
const qr = @import("transport_qr");
const optar = @import("transport_optar");
const paper = @import("transport_paperback");
const audio = @import("transport_audio");
const cassette = @import("transport_cassette");
const poly = @import("transport_polyglot");
const stega = @import("transport_stega");
const lora = @import("transport_lora");
const maypole = @import("maypole_bridge");

const WIRE_PACKET_BYTES: usize = 136; // FANO sealed envelope (canon)

fn testPacket() [WIRE_PACKET_BYTES]u8 {
    var p: [WIRE_PACKET_BYTES]u8 = undefined;
    for (&p, 0..) |*b, i| b.* = @truncate(i *% 131 +% 7);
    return p;
}

fn expectRoundTrip(
    a: std.mem.Allocator,
    comptime encode: anytype,
    comptime decode: anytype,
    payload: []const u8,
) !void {
    const enc = try encode(a, payload);
    defer a.free(enc);
    const dec = try decode(a, enc);
    defer a.free(dec);
    try std.testing.expectEqualSlices(u8, payload, dec);
}

test "carriage: QR medium carries the 136B envelope byte-exact" {
    try expectRoundTrip(std.testing.allocator, qr.encode, qr.decode, &testPacket());
}

test "carriage: OPTAR optical page carries the envelope byte-exact" {
    const a = std.testing.allocator;
    const pkt = testPacket();
    const enc = try optar.encode(a, &pkt);
    defer a.free(enc);
    const dec = try optar.decode(a, enc, pkt.len);
    defer a.free(dec);
    try std.testing.expectEqualSlices(u8, &pkt, dec);
}

test "carriage: audio channel carries the envelope byte-exact" {
    try expectRoundTrip(std.testing.allocator, audio.encode, audio.decode, &testPacket());
}

test "carriage: cassette channel carries the envelope byte-exact" {
    try expectRoundTrip(std.testing.allocator, cassette.encode, cassette.decode, &testPacket());
}

test "carriage: paperback pages are 2-of-3 Shamir — survive a lost share" {
    const a = std.testing.allocator;
    const pkt = testPacket();
    const enc = try paper.encode(a, &pkt);
    defer a.free(enc);
    // Layout: 3 shares of (1 + data_len) bytes each.
    const share_span = enc.len / 3;
    try std.testing.expectEqual(@as(usize, 0), enc.len % 3);
    // Full decode works.
    const full = try paper.decode(a, enc);
    defer a.free(full);
    try std.testing.expectEqualSlices(u8, &pkt, full);
    // paper.decode demands the full container — the 2-of-3 threshold is
    // latent in the share layout, not exposed by decode. Prove the layout
    // is genuine: drop share 0, parse shares 1+2, recover via the dep's
    // own public shamirReconstruct.
    var shares: [2]paper.Share = undefined;
    for (0..2) |i| {
        const off = (i + 1) * share_span;
        shares[i] = .{ .x = enc[off], .y = enc[off + 1 .. off + share_span] };
    }
    const two = try paper.shamirReconstruct(a, &shares);
    defer a.free(two);
    try std.testing.expectEqualSlices(u8, &pkt, two);
    // And the container decoder honestly refuses a truncated blob.
    try std.testing.expectError(error.InvalidEncoding, paper.decode(a, enc[share_span..]));
}

test "carriage: steganographic cover carries the envelope byte-exact" {
    const a = std.testing.allocator;
    const pkt = testPacket();
    // LSB embedding needs ~(len*8 + 64)/3 pixel bytes of cover.
    var cover: [4096]u8 = undefined;
    for (&cover, 0..) |*b, i| b.* = @truncate(i *% 53 +% 200);
    const steg = try stega.encode(a, &pkt, &cover);
    defer a.free(steg);
    const dec = try stega.decode(a, steg);
    defer a.free(dec);
    try std.testing.expectEqualSlices(u8, &pkt, dec);
}

test "carriage: polyglot JAR container round-trips a desk-token artifact" {
    const a = std.testing.allocator;
    // A FANO-DESK-v1 / FANO-ROOT-v1 token is ~1-2 KB — exercise a real size.
    var token: [2048]u8 = undefined;
    for (&token, 0..) |*b, i| b.* = @truncate(i *% 89 +% 33);
    const enc = try poly.encode(a, &token, .jar);
    defer a.free(enc);
    const dec = try poly.decode(a, enc, .jar);
    defer a.free(dec);
    try std.testing.expectEqualSlices(u8, &token, dec);
}

test "carriage: LoRa frame carries the envelope; oversize refuses honestly" {
    const a = std.testing.allocator;
    const pkt = testPacket();
    const lp = lora.LoRaPacket{
        .sender = 0x0000_F001,
        .receiver = 0x0000_F002,
        .msg_id = 42,
        .flags = lora.FLAG_RELIABLE,
        .spreading_factor = .sf9,
        .payload = &pkt,
    };
    const enc = try lora.encodePacket(a, lp);
    defer a.free(enc);
    const dec = (try lora.decodePacket(a, enc)).?;
    defer a.free(dec.payload);
    try std.testing.expectEqualSlices(u8, &pkt, dec.payload);
    try std.testing.expect(dec.isReliable());

    // A desk token exceeds LORA_MTU — refused, not truncated.
    const big = [_]u8{0xAA} ** (lora.LORA_MTU + 1);
    const oversize = lora.LoRaPacket{
        .sender = 1,
        .receiver = 2,
        .msg_id = 1,
        .flags = 0,
        .spreading_factor = .sf7,
        .payload = &big,
    };
    try std.testing.expectError(error.PayloadTooLarge, lora.encodePacket(a, oversize));
}

test "carriage: maypole bridge forwards WiFi->LoRa->WiFi byte-exact" {
    const a = std.testing.allocator;
    const pkt = testPacket();
    var edge = maypole.MaypoleBridge.init(a, 0x0000_0001); // WiFi-side node
    defer edge.deinit();
    var field = maypole.MaypoleBridge.init(a, 0x0000_0002); // LoRa-side node
    defer field.deinit();
    edge.enableBridge();
    field.enableBridge();

    // Disabled bridge refuses before enabling — verify gate order.
    var cold = maypole.MaypoleBridge.init(a, 9);
    defer cold.deinit();
    try std.testing.expectError(error.BridgeNotEnabled, cold.wifiToLoRa(&pkt, 2));

    const on_wire = try edge.wifiToLoRa(&pkt, field.node_id);
    defer a.free(on_wire);
    const got = try field.loRaToWiFi(on_wire);
    defer a.free(got);
    try std.testing.expectEqualSlices(u8, &pkt, got);

    // Addressing honesty: a packet for node 3 is not forwarded by node 2.
    const stray = try edge.wifiToLoRa(&pkt, 0x0000_0003);
    defer a.free(stray);
    try std.testing.expectError(error.NotForUs, field.loRaToWiFi(stray));
}
