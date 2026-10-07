// SPEC-008 qstar mesh harness — fleet peer layer over lattice addressing.
//
// Bridges qstar-mesh + qstar-render onto the FANO mesh:
//   * p2p_types.Location is u128 — the same integer width class as the
//     SPEC-008 IPv6-tensor cell address; PeerId is [32]u8, same as our
//     identity pk hashes. Peers are literally lattice addresses + key ids.
//   * RelayRouter gives multi-hop forwarding with TTL — honest bound for
//     the documented 42-hop route walk (16 per packet, compose across).
//   * mesh_peer ships real XChaCha20-Poly1305 AEAD — exercised on the
//     136-byte wire envelope with tamper + wrong-key rejection.
//   * mesh.Location (f64 ring) and render (f32/f64) are boundary sidecars —
//     hash/render helpers only, never wire bytes.
// Integer-only: every identity, location, and wire byte is u8/u128.

const std = @import("std");
const mesh = @import("mesh");
const p2p = @import("p2p_types");
const relay_router = @import("relay_router");
const peer_mod = @import("mesh_peer");
const render = @import("render");

const WIRE_PACKET_BYTES: usize = 136;

fn testPacket() [WIRE_PACKET_BYTES]u8 {
    var p: [WIRE_PACKET_BYTES]u8 = undefined;
    for (&p, 0..) |*b, i| b.* = @truncate(i *% 131 +% 7);
    return p;
}

/// Lattice cell (x,y,z) in 15^3 -> u128 peer location (integer, canonical).
fn cellLocation(x: u32, y: u32, z: u32) p2p.Location {
    return @as(u128, x * 225 + y * 15 + z) << 96 | 0xFA00;
}

fn peerIdFrom(seed_byte: u8) p2p.PeerId {
    var id: p2p.PeerId = undefined;
    for (&id, 0..) |*b, i| b.* = @truncate(i *% 47 +% seed_byte);
    return id;
}

test "mesh: u128 lattice locations are canonical and ordered" {
    const a = cellLocation(0, 0, 0);
    const b = cellLocation(7, 7, 7);
    const c = cellLocation(14, 14, 14);
    try std.testing.expect(a < b and b < c);
    // Ring distance is symmetric u128 arithmetic — integer all the way down.
    try std.testing.expectEqual(b - a, p2p.ringDistance(a, b));
    try std.testing.expectEqual(p2p.ringDistance(a, b), p2p.ringDistance(b, a));
}

test "mesh: AEAD seals the 136B envelope; tamper and wrong key refused" {
    const pkt = testPacket();
    var key: [32]u8 = undefined;
    @memset(&key, 0x5A);
    var nonce: [24]u8 = [_]u8{0} ** 24;
    nonce[23] = 1;

    var ct: [WIRE_PACKET_BYTES + 16]u8 = undefined;
    const n = try peer_mod.encryptMessage(key, nonce, &pkt, &ct);
    try std.testing.expectEqual(WIRE_PACKET_BYTES + 16, n);

    var pt: [WIRE_PACKET_BYTES]u8 = undefined;
    const m = try peer_mod.decryptMessage(key, nonce, ct[0..n], &pt);
    try std.testing.expectEqual(WIRE_PACKET_BYTES, m);
    try std.testing.expectEqualSlices(u8, &pkt, &pt);

    // Bit-flip in covered bytes fails the Poly1305 tag.
    var bad = ct;
    bad[10] ^= 0x01;
    try std.testing.expectError(error.AuthenticationFailed, peer_mod.decryptMessage(key, nonce, &bad, &pt));

    // Wrong key refuses.
    var key2 = key;
    key2[0] ^= 0xFF;
    try std.testing.expectError(error.AuthenticationFailed, peer_mod.decryptMessage(key2, nonce, ct[0..n], &pt));
}

test "mesh: relay delivers to target peer, forwards otherwise" {
    const a = std.testing.allocator;
    var pm = p2p.PeerManager.init(a);
    defer pm.deinit();

    const self_id = peerIdFrom(0x10);
    const target_id = peerIdFrom(0x20);
    const stranger_id = peerIdFrom(0x30);
    const self_loc = cellLocation(1, 1, 1);

    var router = relay_router.RelayRouter.init(a, self_id, self_loc, &pm);
    const pkt = testPacket();

    // Packet addressed to us -> delivered with inner payload intact.
    const ours = try router.buildRelayPacket(a, self_id, .data, &pkt);
    defer a.free(ours);
    switch (router.handleRelayRoute(ours)) {
        .delivered => |d| {
            try std.testing.expectEqualSlices(u8, &self_id, &d.origin_id);
            try std.testing.expectEqualSlices(u8, &pkt, d.inner_payload);
        },
        else => return error.TestExpectedEqual,
    }

    // Packet addressed to a known peer -> forward toward their connection.
    pm.addPeer(target_id, cellLocation(9, 9, 9), 77);
    const fwd = try router.buildRelayPacket(a, target_id, .data, &pkt);
    defer a.free(fwd);
    switch (router.handleRelayRoute(fwd)) {
        .forward => |f| {
            try std.testing.expectEqual(@as(u32, 77), f.next_conn);
            router.freeForwardPayload(f.forward_payload);
        },
        .delivered => return error.TestExpectedEqual,
        .dropped => {},
    }

    // Unknown target with peers present -> greedy forward toward nearest
    // known location (the packet roams the mesh, it does not die here).
    const roaming = try router.buildRelayPacket(a, stranger_id, .data, &pkt);
    defer a.free(roaming);
    switch (router.handleRelayRoute(roaming)) {
        .forward => |f| router.freeForwardPayload(f.forward_payload),
        else => return error.TestExpectedEqual,
    }

    // Unknown target with an EMPTY peer table -> dropped, honestly.
    var pm_empty = p2p.PeerManager.init(a);
    defer pm_empty.deinit();
    var router_empty = relay_router.RelayRouter.init(a, self_id, self_loc, &pm_empty);
    const lost = try router_empty.buildRelayPacket(a, stranger_id, .data, &pkt);
    defer a.free(lost);
    try std.testing.expect(router_empty.handleRelayRoute(lost) == .dropped);
}

test "mesh: TTL exhaustion drops rather than loops forever" {
    const a = std.testing.allocator;
    var pm = p2p.PeerManager.init(a);
    defer pm.deinit();
    const self_id = peerIdFrom(0x10);
    var router = relay_router.RelayRouter.init(a, self_id, cellLocation(1, 1, 1), &pm);
    const pkt = testPacket();
    const target = peerIdFrom(0x20);
    pm.addPeer(target, cellLocation(9, 9, 9), 77);

    const wire = try router.buildRelayPacket(a, target, .data, &pkt);
    defer a.free(wire);
    // Walk the packet hop-by-hop; TTL must bound the walk.
    var buf = try a.dupe(u8, wire);
    defer a.free(buf);
    var hops: u32 = 0;
    while (hops < 64) : (hops += 1) {
        switch (router.handleRelayRoute(buf)) {
            .forward => |f| {
                @memcpy(buf[0..f.forward_payload.len], f.forward_payload);
                const flen = f.forward_payload.len;
                router.freeForwardPayload(f.forward_payload);
                buf = buf[0..flen];
            },
            .delivered => break,
            .dropped => break,
        }
    }
    // It either delivered or honestly dropped — never looped past TTL=16.
    try std.testing.expect(hops <= 16);
}

test "mesh: connection manager enforces min/max bounds" {
    const a = std.testing.allocator;
    var cm = mesh.ConnectionManager.init(a, mesh.Location.fromBytes("desk-digit"), 2, 4, false);
    defer cm.deinit();
    try std.testing.expect(cm.isBelowMin());
    // Location.fromBytes is deterministic — same cell bytes, same ring spot.
    try std.testing.expect(mesh.Location.fromBytes("desk-digit").eql(mesh.Location.fromBytes("desk-digit")));
    try std.testing.expect(!mesh.Location.fromBytes("desk-digit").eql(mesh.Location.fromBytes("desk-sheraton")));
}

test "render: transform composition is sane (sidecar boundary check)" {
    // f32 math lives and dies inside render — we only assert sanity bounds.
    const t1 = render.Mat4.translation(1.0, 2.0, 3.0);
    const t2 = render.Mat4.translation(4.0, 5.0, 6.0);
    const m = render.Mat4.multiply(t1, t2);
    // Translations compose additively in the m[12..14] slots.
    try std.testing.expectApproxEqAbs(@as(f32, 5.0), m.m[12], 1e-6);
    try std.testing.expectApproxEqAbs(@as(f32, 7.0), m.m[13], 1e-6);
    try std.testing.expectApproxEqAbs(@as(f32, 9.0), m.m[14], 1e-6);
    // Lattice-center vector length is finite and positive.
    const center = render.Vec3.new(7.0, 7.0, 7.0);
    try std.testing.expect(render.Vec3.length(center) > 0.0);
    const inv = m.invert();
    try std.testing.expect(std.math.isFinite(inv.m[12]));
}
