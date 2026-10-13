//! Native directive gate. Directives are recommendations until approved by policy.
const std = @import("std");
const t = @import("aiwo_types");
const pmod = @import("aiwo_policy");

pub const Directive = struct {
    id: [64]u8,
    officer: []const u8,
    duty: []const u8,
    action: t.Action,
    issued_sequence: u64,
    policy_digest: t.PolicyDigest,
    approval_nonce: ?[32]u8 = null,
};

pub const Result = struct {
    directive: Directive,
    decision: t.DecisionRecord,
};

pub fn issue(policy: *const pmod.Policy, officer: t.OfficerId, action: t.Action, sequence: u64) Result {
    var id_material: [256]u8 = undefined;
    var stream = std.io.fixedBufferStream(&id_material);
    stream.writer().print("{s}|{s}|{s}|{d}|{d}|{d}", .{ officer.name, officer.duty, action.name, sequence, @intFromBool(action.irreversible), @intFromBool(action.mutates_governance) }) catch unreachable;
    const digest = t.digestBytes(stream.getWritten());
    var id: [64]u8 = undefined;
    t.hexDigest(digest, &id);
    return .{ .directive = .{ .id = id, .officer = officer.name, .duty = officer.duty, .action = action, .issued_sequence = sequence, .policy_digest = policy.digest }, .decision = policy.evaluate(officer, action) };
}

pub fn approve(result: *Result, human_nonce: [32]u8) !void {
    if (result.decision.decision != .requires_human_approval) return error.NotPendingApproval;
    result.directive.approval_nonce = human_nonce;
    result.decision = .{ .decision = .allow, .reason = "human approval token attached", .policy_version = result.decision.policy_version, .policy_digest = result.decision.policy_digest };
}

test "native directive refuses prohibited action and accepts human approval" {
    const policy = pmod.Policy.init();
    const officer = try policy.officer("digit", .wo3, 6, "core_integrity", "aiwo");
    var result = issue(&policy, officer, .{ .name = "quench", .irreversible = true }, 1);
    try std.testing.expectEqual(.requires_human_approval, result.decision.decision);
    try approve(&result, t.digestBytes("human-approval"));
    try std.testing.expectEqual(.allow, result.decision.decision);
    const forbidden = issue(&policy, officer, .{ .name = "edit", .binding_order = true }, 2);
    try std.testing.expectEqual(.deny, forbidden.decision.decision);
}
