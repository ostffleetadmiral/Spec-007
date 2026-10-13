//! AIWO FANO adapter over Spec-007's canonical 136-byte seal twin.
const std = @import("std");
const seal = @import("spec008_seal");

pub const Wire = seal.FANO_WIRE;

pub fn heartbeat(cell: [3]u8, sequence: u32, officer: []const u8, digest: [32]u8) [Wire]u8 {
    var payload: [104]u8 = [_]u8{0} ** 104;
    const prefix = "AIWO/1 ";
    @memcpy(payload[0..prefix.len], prefix);
    const max_name = @min(officer.len, 32);
    @memcpy(payload[prefix.len .. prefix.len + max_name], officer[0..max_name]);
    const digest_pos = 48;
    @memcpy(payload[digest_pos .. digest_pos + digest.len], &digest);
    return seal.build(cell[0], cell[1], cell[2], 7, 7, 7, sequence, payload[0 .. digest_pos + digest.len]);
}

pub fn verify(wire: *const [Wire]u8) bool {
    return seal.verify(wire);
}

test "AIWO heartbeat is canonical FANO wire" {
    const w = heartbeat(.{ 1, 2, 3 }, 4, "digit", [_]u8{0xAB} ** 32);
    try std.testing.expect(verify(&w));
    var forged = w;
    forged[50] ^= 0xff;
    try std.testing.expect(!verify(&forged));
}
