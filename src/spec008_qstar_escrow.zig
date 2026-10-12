// SPEC-008 qstar escrow harness — Fleet Admiral key escrow + wire erasure.
//
// Bridges qstar-quantum/entangle onto FANO-1 artifacts:
//   * Shamir secret sharing over the flag's 32-byte ed25519 seed: the
//     unanimous Admiralty reset vote becomes a 3-of-3 reconstruction, and
//     2-of-3 quorum covers disaster recovery when one seat is dark.
//   * Shard striping + parity on the canonical 136-byte FANO wire envelope.
//
// Honest capability notes (verified by test below, not assumed):
//   * Dep API convention: shamirSplit(secret, n=THRESHOLD, k=SHARE_COUNT).
//   * entangle.rsEncode is now a true systematic Vandermonde RS code —
//     parity_p = Σ_d data_d·α^{d·p}, so up to parity_shards erasures
//     recover. (Was: rank-1 scalar-XOR parity — remediated in the
//     vendored dep, delta filed in deps/VENDORED.md.)
//   * entangle.rsReconstruct now does real erasure decode — a t×t
//     GF(2⁸) Gauss-Jordan solve over the surviving parity rows.
//     (Was: ignored parity entirely, concatenated present shards only.)
//   * Shamir shares carry no integrity tag — a substituted share silently
//     corrupts the secret. The escrow wrapper therefore commits sha256(seed)
//     so a corrupt reconstruction is detected, never accepted.
// Integer-only: every byte on the wire is u8; GF(256) arithmetic is integer.

const std = @import("std");
const ent = @import("qentangle");

const WIRE_PACKET_BYTES: usize = 136; // FANO sealed envelope (canon)
const FLAG_SEED_BYTES: usize = 32; // ed25519 seed length

/// Deterministic test flag seed (fixture, not a real key).
fn testSeed() [FLAG_SEED_BYTES]u8 {
    var s: [FLAG_SEED_BYTES]u8 = undefined;
    for (&s, 0..) |*b, i| b.* = @truncate(i *% 97 +% 13);
    return s;
}

/// Deterministic test FANO envelope (fixture exercising the 136B canon).
fn testPacket() [WIRE_PACKET_BYTES]u8 {
    var p: [WIRE_PACKET_BYTES]u8 = undefined;
    for (&p, 0..) |*b, i| b.* = @truncate(i *% 131 +% 7);
    return p;
}

/// sha256 commitment over a recovered secret — the integrity layer Shamir
/// lacks. Escrow callers must check this before trusting a reconstruction.
fn commit(secret: []const u8) [32]u8 {
    var h: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(secret, &h, .{});
    return h;
}

test "shamir: 3-of-3 unanimous escrow reconstructs flag seed byte-exact" {
    const a = std.testing.allocator;
    const seed = testSeed();
    var list = try ent.shamirSplit(a, &seed, 3, 3); // n=threshold, k=shares
    defer list.deinit();
    try std.testing.expectEqual(@as(usize, 3), list.shares.len);

    const rec = try ent.shamirRecover(a, list.shares, 3);
    defer a.free(rec);
    try std.testing.expectEqualSlices(u8, &seed, rec);
    try std.testing.expectEqualSlices(u8, &commit(&seed), &commit(rec));
}

test "shamir: threshold enforced — two shares refuse unanimous recovery" {
    const a = std.testing.allocator;
    const seed = testSeed();
    var list = try ent.shamirSplit(a, &seed, 3, 3);
    defer list.deinit();
    try std.testing.expectError(
        ent.ShamirError.InsufficientShares,
        ent.shamirRecover(a, list.shares[0..2], 3),
    );
}

test "shamir: 2-of-3 quorum — every pair reconstructs (seat-dark recovery)" {
    const a = std.testing.allocator;
    const seed = testSeed();
    var list = try ent.shamirSplit(a, &seed, 2, 3);
    defer list.deinit();
    const pairs = [3][2]usize{ .{ 0, 1 }, .{ 0, 2 }, .{ 1, 2 } };
    for (pairs) |pr| {
        const two = [2]ent.Share{ list.shares[pr[0]], list.shares[pr[1]] };
        const rec = try ent.shamirRecover(a, &two, 2);
        defer a.free(rec);
        try std.testing.expectEqualSlices(u8, &seed, rec);
    }
    // a lone share can never reconstruct
    try std.testing.expectError(
        ent.ShamirError.InsufficientShares,
        ent.shamirRecover(a, list.shares[0..1], 2),
    );
}

test "shamir: foreign share silently corrupts — commitment catches it" {
    const a = std.testing.allocator;
    const seed = testSeed();
    var other: [32]u8 = undefined;
    @memcpy(&other, &seed);
    other[0] ^= 0xFF;
    var list_a = try ent.shamirSplit(a, &seed, 3, 3);
    defer list_a.deinit();
    var list_b = try ent.shamirSplit(a, &other, 3, 3);
    defer list_b.deinit();

    // swap in a share from the foreign split (x values differ: a uses 1..3,
    // b uses 1..3 — same x, wrong y) -> DuplicateXValue is the dep's only
    // guard; a real forgery keeps distinct x. Use shares {a1, a2, b3-at-x3}
    // -> same x3 collides with a3? No: we take a's x1,x2 and b's x3.
    const forged = [3]ent.Share{ list_a.shares[0], list_a.shares[1], list_b.shares[2] };
    const rec = try ent.shamirRecover(a, &forged, 3);
    defer a.free(rec);
    // Shamir math itself does not reject the wrong share...
    try std.testing.expect(!std.mem.eql(u8, &seed, rec));
    // ...but the sha256 commitment exposes the forgery.
    try std.testing.expect(!std.mem.eql(u8, &commit(&seed), &commit(rec)));
}

test "wire shards: all-present reconstruction is byte-exact over 136B envelope" {
    const a = std.testing.allocator;
    const pkt = testPacket();
    const cfg = ent.RsConfig.init(8, 4); // 8 data + 4 parity, shard = 17B
    const shards = try ent.rsEncode(a, cfg, &pkt);
    defer ent.freeShards(a, shards);
    try std.testing.expectEqual(@as(usize, 12), shards.len);
    try std.testing.expectEqual(@as(usize, 17), shards[0].len);

    const present = [_]bool{true} ** 12;
    const const_shards: [][]const u8 = shards;
    const rec = try ent.rsReconstruct(a, cfg, const_shards, &present);
    defer a.free(rec);
    try std.testing.expectEqualSlices(u8, &pkt, rec[0..WIRE_PACKET_BYTES]);
}

test "wire erasure: single data-shard loss recovers byte-exact via parity" {
    const a = std.testing.allocator;
    const pkt = testPacket();
    const cfg = ent.RsConfig.init(8, 4);
    const shards = try ent.rsEncode(a, cfg, &pkt);
    defer ent.freeShards(a, shards);

    var present = [_]bool{true} ** 12;
    present[3] = false;
    const const_shards: [][]const u8 = shards;
    const rec = try ent.rsReconstruct(a, cfg, const_shards, &present);
    defer a.free(rec);
    try std.testing.expectEqualSlices(u8, &pkt, rec[0..WIRE_PACKET_BYTES]);
}

test "wire erasure: multi-erasure recovery — up to parity_shards data losses" {
    const a = std.testing.allocator;
    const pkt = testPacket();
    const cfg = ent.RsConfig.init(8, 4);
    const shards = try ent.rsEncode(a, cfg, &pkt);
    defer ent.freeShards(a, shards);

    // 2 data erasures recover — the bound the rank-1 parity could not reach.
    var present = [_]bool{true} ** 12;
    present[1] = false;
    present[5] = false;
    const const_shards: [][]const u8 = shards;
    const rec = try ent.rsReconstruct(a, cfg, const_shards, &present);
    defer a.free(rec);
    try std.testing.expectEqualSlices(u8, &pkt, rec[0..WIRE_PACKET_BYTES]);

    // mixed loss: 2 data + 1 parity shard gone → still inside the bound.
    var present2 = [_]bool{true} ** 12;
    present2[0] = false;
    present2[6] = false;
    present2[10] = false; // a parity shard
    const rec2 = try ent.rsReconstruct(a, cfg, const_shards, &present2);
    defer a.free(rec2);
    try std.testing.expectEqualSlices(u8, &pkt, rec2[0..WIRE_PACKET_BYTES]);
}

test "wire erasure: beyond the parity bound refuses honestly" {
    const a = std.testing.allocator;
    const pkt = testPacket();
    const cfg = ent.RsConfig.init(8, 4);
    const shards = try ent.rsEncode(a, cfg, &pkt);
    defer ent.freeShards(a, shards);
    // 5 data shards lost > 4 parity rows — underdetermined, must refuse.
    var present = [_]bool{false} ** 12;
    present[5] = true;
    present[6] = true;
    present[7] = true;
    const const_shards: [][]const u8 = shards;
    try std.testing.expectError(
        error.InsufficientShards,
        ent.rsReconstruct(a, cfg, const_shards, &present),
    );
}
