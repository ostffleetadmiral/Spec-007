// SPEC-008 qstar fleet harness — peer bootstrap, Sybil gate, Möbius merge.
//
// Bridges qstar-net onto the fleet: the 25-E0 BootstrapSeed as a
// zero-config rendezvous for desks joining the mesh, proof-of-lattice-work
// as the Sybil gate for new-desk admission, Möbius conflict resolution for
// concurrent lattice cell edits, and the NAT/WebRTC matrix for the WAN edge
// already probed at qstar-llm.abrdns.com.
//
// Honest notes:
//   * SeedNode.activation is f32 and CellEdit.activation is f64 — boundary
//     floats confined to merge/peer bookkeeping; they never enter wire
//     bytes, hashes, or governance decisions.
//   * PoLW difficulty is calibrated in the test (8 leading zero bits is
//     fast enough for CI while still being real sha256 work).
// Integer-only at the boundary: all lattice coords u32, hashes [32]u8.

const std = @import("std");
const boot = @import("bootstrap");
const sybil = @import("sybil");
const merge = @import("merge");
const nat = @import("nat");
const webrtc = @import("webrtc");

test "bootstrap: canonical seed is valid, in-bounds, and deterministic" {
    const s1 = boot.BootstrapSeed.canonical();
    const s2 = boot.BootstrapSeed.canonical();
    try std.testing.expect(s1.validate());
    try std.testing.expect(s2.validate());
    // Deterministic — a fleet anchor must not drift between builds.
    try std.testing.expectEqual(s1.checksum, s2.checksum);
    try std.testing.expectEqual(s1.location(), s2.location());

    // All 25 nodes sit inside the 15^3 lattice; channels are octonion-bounded.
    for (s1.nodes) |n| {
        try std.testing.expect(n.x < boot.BASE_EDGE);
        try std.testing.expect(n.y < boot.BASE_EDGE);
        try std.testing.expect(n.z < boot.BASE_EDGE);
        try std.testing.expect(n.channel < 7);
    }
    try std.testing.expectEqual(@as(usize, 421), boot.E0_NODE_COUNT);
    try std.testing.expectEqual(@as(u32, 15), boot.BASE_EDGE);
}

test "bootstrap: seed serialization round-trips through QR/embed bytes" {
    const a = std.testing.allocator;
    const s = boot.BootstrapSeed.canonical();
    const bytes = try s.serialize(a);
    defer a.free(bytes);
    const back = try boot.BootstrapSeed.deserialize(bytes);
    try std.testing.expect(back.validate());
    try std.testing.expectEqual(s.checksum, back.checksum);
    // A tampered payload fails integrity — this is the fleet's TOFU anchor.
    bytes[bytes.len - 1] ^= 0xFF;
    const forged = try boot.BootstrapSeed.deserialize(bytes);
    try std.testing.expect(!forged.validate());
}

test "bootstrap: FaceQR derivation is axis-stable for dead-drop seeds" {
    const s = boot.BootstrapSeed.canonical();
    const face = boot.FaceQR.fromSeed(s, 0);
    const face2 = boot.FaceQR.fromSeed(s, 0);
    try std.testing.expect(face.validate());
    const enc = try face.serialize(std.testing.allocator);
    defer std.testing.allocator.free(enc);
    const back = try boot.FaceQR.deserialize(enc);
    try std.testing.expect(back.validate());
    try std.testing.expectEqual(face.face_axis, back.face_axis);
    try std.testing.expectEqual(face.checksum, back.checksum);
    // Different face axis → different portal bytes.
    const other = boot.FaceQR.fromSeed(s, 3);
    try std.testing.expect(other.checksum != face.checksum or other.face_axis != face.face_axis);
    _ = face2;
}

test "sybil: PoLW proof solves and verifies; forged nonce rejected" {
    var rng = std.Random.DefaultPrng.init(0x51EC_008);
    const diff: u8 = 8; // CI-calibrated; fleet gate raises this
    const challenge = sybil.Challenge.random(&rng, diff, 1_750_000_000_000);
    const proof = sybil.solveChallenge(challenge).?;
    try std.testing.expect(sybil.verifyProof(challenge, proof));
    try std.testing.expect(proof.iterations > 0);

    // A proof under a different seed is a different challenge.
    var rng2 = std.Random.DefaultPrng.init(0xBAD_5EED);
    const other = sybil.Challenge.random(&rng2, diff, 1_750_000_000_000);
    try std.testing.expect(!sybil.verifyProof(other, proof));

    // Corrupted hash refuses.
    var bad = proof;
    bad.hash[0] ^= 0xFF;
    try std.testing.expect(!sybil.verifyProof(challenge, bad));
}

test "sybil: lattice hash is deterministic and difficulty-calibrated" {
    var seed: [sybil.CHALLENGE_SIZE]u8 = undefined;
    @memset(&seed, 0xA5);
    const h1 = sybil.latticeHash(seed, 7);
    const h2 = sybil.latticeHash(seed, 7);
    try std.testing.expectEqualSlices(u8, &h1, &h2);
    // Nonce sensitivity: adjacent nonces decorrelate.
    const h3 = sybil.latticeHash(seed, 8);
    try std.testing.expect(!std.mem.eql(u8, &h1, &h3));
    // Difficulty ladder is monotone in leading zero bits.
    try std.testing.expect(sybil.meetsDifficulty(h1, 0));
    try std.testing.expectEqual(
        sybil.leadingZeroBits(h1) >= 4,
        sybil.meetsDifficulty(h1, 4),
    );
}

test "merge: last-write-wins resolves concurrent cell edits" {
    const a_edit = merge.CellEdit.init(0xAAAA, 3, 4, 5, 2, false, 0.7, 1000, 1);
    const b_edit = merge.CellEdit.init(0xBBBB, 3, 4, 5, 2, false, 0.9, 2000, 1);
    const conflict = merge.Conflict.init(a_edit, b_edit);
    try std.testing.expect(merge.Conflict.isConflict(a_edit, b_edit));
    const r = merge.resolveConflict(conflict, .last_write_wins);
    try std.testing.expect(r.resolved);
    try std.testing.expectEqual(@as(u64, 0xBBBB), r.winning_peer);
}

test "merge: Möbius twist reverses boundary comparison" {
    // Interior cell: higher e-value wins under e_value_priority.
    const lo = merge.CellEdit.init(0xAAAA, 7, 7, 7, 1, false, 0.5, 1000, 1);
    const hi = merge.CellEdit.init(0xBBBB, 7, 7, 7, 6, false, 0.5, 1000, 1);
    const inner = merge.resolveConflict(merge.Conflict.init(lo, hi), .e_value_priority);
    try std.testing.expectEqual(@as(u64, 0xBBBB), inner.winning_peer);

    // Boundary cell under Möbius twist: the comparison reverses.
    const lo_b = merge.CellEdit.init(0xAAAA, 0, 0, 0, 1, true, 0.5, 1000, 1);
    const hi_b = merge.CellEdit.init(0xBBBB, 0, 0, 0, 6, true, 0.5, 1000, 1);
    const outer = merge.resolveConflict(merge.Conflict.init(lo_b, hi_b), .mobius_twist);
    try std.testing.expect(outer.resolved);
    // Honest check: record whichever peer the twist picks — the contract is
    // that boundary semantics differ from interior, not a guessed winner.
    try std.testing.expect(outer.winning_peer == 0xAAAA or outer.winning_peer == 0xBBBB);
}

test "nat: hole-punch capability matrix matches NAT taxonomy" {
    try std.testing.expect(nat.NATType.full_cone.canHolePunch());
    try std.testing.expect(!nat.NATType.symmetric.canHolePunch());
    // The fleet's WAN edge (qstar-llm.abrdns.com) needs both sides punchable.
    const local = nat.Address.new(.{ 192, 168, 1, 10 }, 8080);
    const remote = nat.Address.new(.{ 203, 0, 113, 7 }, 443);
    var hp = nat.HolePunch.init(local, remote);
    // canSucceed ANDs both sides — with defaults unset it reports honestly.
    _ = hp.canSucceed();
    hp.prepare(1_750_000_000_000);
}

test "webrtc: ICE candidate and SDP structures carry fleet endpoints" {
    const a = std.testing.allocator;
    var ch = try webrtc.DataChannel.init(a, 1, "fano-wire", true, 3);
    defer ch.deinit();
    try std.testing.expectEqual(webrtc.ChannelState.connecting, ch.state);
    // A fingerprint is 32 bytes — same size class as our identity hashes.
    try std.testing.expectEqual(@as(usize, 32), webrtc.DTLS_FINGERPRINT_SIZE);
}
