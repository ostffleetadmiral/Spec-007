//! AIWO FANO adapter over Spec-007's canonical 136-byte seal twin.
const std = @import("std");
const seal = @import("spec008_seal");

pub const Wire = seal.FANO_WIRE;

fn officerDigest(officer: []const u8) [32]u8 {
    var h = std.crypto.hash.sha2.Sha256.init(.{});
    h.update("AIWO-OFFICER-v1|");
    h.update(officer);
    var digest: [32]u8 = undefined;
    h.final(&digest);
    return digest;
}

pub fn heartbeat(cell: [3]u8, sequence: u64, officer: []const u8, digest: [32]u8) ![Wire]u8 {
    if (sequence > std.math.maxInt(u32)) return error.SequenceExceedsWire;
    var payload: [104]u8 = [_]u8{0} ** 104;
    const prefix = "AIWO/1 ";
    @memcpy(payload[0..prefix.len], prefix);
    const officer_digest = officerDigest(officer);
    @memcpy(payload[prefix.len .. prefix.len + officer_digest.len], &officer_digest);
    const digest_pos = 48;
    @memcpy(payload[digest_pos .. digest_pos + digest.len], &digest);
    return seal.build(cell[0], cell[1], cell[2], 7, 7, 7, @intCast(sequence), payload[0 .. digest_pos + digest.len]);
}

pub fn verify(wire: *const [Wire]u8) bool {
    return seal.verify(wire);
}

test "AIWO heartbeat is canonical FANO wire" {
    const w = try heartbeat(.{ 1, 2, 3 }, 4, "digit", [_]u8{0xAB} ** 32);
    try std.testing.expect(verify(&w));
    var forged = w;
    forged[50] ^= 0xff;
    try std.testing.expect(!verify(&forged));
}

test "AIWO heartbeat binds complete long officer identities" {
    const prefix = "officer-name-that-exceeds-thirty-two-";
    const a = try std.fmt.allocPrint(std.testing.allocator, "{s}a", .{prefix});
    defer std.testing.allocator.free(a);
    const b = try std.fmt.allocPrint(std.testing.allocator, "{s}b", .{prefix});
    defer std.testing.allocator.free(b);
    const wa = try heartbeat(.{ 1, 2, 3 }, 4, a, [_]u8{0xAB} ** 32);
    const wb = try heartbeat(.{ 1, 2, 3 }, 4, b, [_]u8{0xAB} ** 32);
    try std.testing.expect(!std.mem.eql(u8, &wa, &wb));
    try std.testing.expect(verify(&wa));
    try std.testing.expect(verify(&wb));
}

test "AIWO heartbeat refuses sequence values outside the wire field" {
    _ = try heartbeat(.{ 1, 2, 3 }, std.math.maxInt(u32), "digit", [_]u8{0xAB} ** 32);
    try std.testing.expectError(error.SequenceExceedsWire, heartbeat(.{ 1, 2, 3 }, @as(u64, std.math.maxInt(u32)) + 1, "digit", [_]u8{0xAB} ** 32));
}
