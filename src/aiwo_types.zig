//! Native AIWO records and authority-safe state types.
const std = @import("std");

pub const Schema = "AIWO-NATIVE-v1";
pub const PolicyVersion: u32 = 1;

pub const Rank = enum(u8) { wo1 = 1, wo2 = 2, wo3 = 3, cwo = 4 };
pub const Lifecycle = enum { uninitialized, commissioned, active, suspended, awaiting_human, revoked };
pub const Decision = enum { allow, deny, requires_human_approval };
pub const EventClass = enum { observation, recommendation, refusal, approval_request, approval, heartbeat, health };

pub const OfficerId = struct {
    name: []const u8,
    rank: Rank,
    clearance: u8,
    duty: []const u8,
    custody: []const u8,
};

pub const PolicyDigest = [32]u8;

pub const Action = struct {
    name: []const u8,
    irreversible: bool = false,
    mutates_governance: bool = false,
    binding_order: bool = false,
    requested_clearance: u8 = 0,
};

pub const DecisionRecord = struct {
    decision: Decision,
    reason: []const u8,
    policy_version: u32,
    policy_digest: PolicyDigest,
};

pub const Event = struct {
    schema: []const u8 = Schema,
    officer: []const u8,
    sequence: u64,
    event_class: EventClass,
    decision: Decision,
    policy_version: u32,
    policy_digest: PolicyDigest,
    body_digest: [32]u8,
};

pub fn digestBytes(bytes: []const u8) [32]u8 {
    var out: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(bytes, &out, .{});
    return out;
}

pub fn hexDigest(digest: [32]u8, out: *[64]u8) void {
    _ = std.fmt.bufPrint(out, "{s}", .{std.fmt.fmtSliceHexLower(&digest)}) catch unreachable;
}

test "AIWO digest is deterministic" {
    const a = digestBytes("aiwo");
    const b = digestBytes("aiwo");
    try std.testing.expectEqual(a, b);
}

test "AIWO digest and hex encoding match SHA-256 golden vectors" {
    const digest = digestBytes("abc");
    var hex: [64]u8 = undefined;
    hexDigest(digest, &hex);
    try std.testing.expectEqualStrings("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", &hex);

    const aiwo = digestBytes("aiwo");
    hexDigest(aiwo, &hex);
    try std.testing.expectEqualStrings("d2b18adb5de9a93c15928bd3bc1e4c8d9f2df4b9f10b46a79b619cb70b1c8c55", &hex);
}
