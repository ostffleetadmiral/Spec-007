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

fn updateInt(h: *std.crypto.hash.sha2.Sha256, value: anytype) void {
    var buf: [20]u8 = undefined;
    const text = std.fmt.bufPrint(&buf, "{d}", .{value}) catch unreachable;
    h.update(text);
}

fn updateField(h: *std.crypto.hash.sha2.Sha256, bytes: []const u8) void {
    h.update(bytes);
    h.update("|");
}

fn directiveDigest(policy: *const pmod.Policy, officer: t.OfficerId, action: t.Action, sequence: u64) [32]u8 {
    var h = std.crypto.hash.sha2.Sha256.init(.{});
    h.update("AIWO-DIRECTIVE-v1|");
    updateField(&h, officer.name);
    updateInt(&h, @intFromEnum(officer.rank));
    h.update("|");
    updateInt(&h, officer.clearance);
    h.update("|");
    updateField(&h, officer.duty);
    updateField(&h, officer.custody);
    updateField(&h, action.name);
    updateInt(&h, sequence);
    h.update("|");
    updateInt(&h, @intFromBool(action.irreversible));
    h.update("|");
    updateInt(&h, @intFromBool(action.mutates_governance));
    h.update("|");
    updateInt(&h, @intFromBool(action.binding_order));
    h.update("|");
    updateInt(&h, action.requested_clearance);
    h.update("|");
    h.update(&policy.digest);
    var digest: [32]u8 = undefined;
    h.final(&digest);
    return digest;
}

pub fn issue(policy: *const pmod.Policy, officer: t.OfficerId, action: t.Action, sequence: u64) Result {
    const digest = directiveDigest(policy, officer, action, sequence);
    var id: [64]u8 = undefined;
    t.hexDigest(digest, &id);
    return .{ .directive = .{ .id = id, .officer = officer.name, .duty = officer.duty, .action = action, .issued_sequence = sequence, .policy_digest = policy.digest }, .decision = policy.evaluate(officer, action) };
}

pub fn approve(result: *Result, human_nonce: [32]u8) !void {
    if (result.decision.decision != .requires_human_approval) return error.NotPendingApproval;
    if (std.mem.eql(u8, &human_nonce, &[_]u8{0} ** 32)) return error.EmptyApprovalNonce;
    result.directive.approval_nonce = human_nonce;
    result.decision = .{ .decision = .allow, .reason = "human approval token attached", .policy_version = result.decision.policy_version, .policy_digest = result.decision.policy_digest };
}

test "native directive refuses prohibited action and accepts human approval" {
    const policy = pmod.Policy.init();
    const officer = try policy.officer("digit", .wo3, 6, "core_integrity", "aiwo");
    var result = issue(&policy, officer, .{ .name = "quench", .irreversible = true }, 1);
    try std.testing.expectEqual(.requires_human_approval, result.decision.decision);
    try std.testing.expectError(error.EmptyApprovalNonce, approve(&result, [_]u8{0} ** 32));
    try approve(&result, t.digestBytes("human-approval"));
    try std.testing.expectEqual(.allow, result.decision.decision);
    const forbidden = issue(&policy, officer, .{ .name = "edit", .binding_order = true }, 2);
    try std.testing.expectEqual(.deny, forbidden.decision.decision);
}

test "directive ids bind the complete authority context" {
    const policy = pmod.Policy.init();
    const officer = try policy.officer("digit", .wo3, 6, "core_integrity", "aiwo");
    const lower = try policy.officer("digit", .wo3, 5, "core_integrity", "aiwo");
    const base = issue(&policy, officer, .{ .name = "observe", .requested_clearance = 1 }, 7);
    const same = issue(&policy, officer, .{ .name = "observe", .requested_clearance = 1 }, 7);
    const higher_clearance = issue(&policy, officer, .{ .name = "observe", .requested_clearance = 2 }, 7);
    const binding_order = issue(&policy, officer, .{ .name = "observe", .binding_order = true }, 7);
    const different_officer = issue(&policy, lower, .{ .name = "observe", .requested_clearance = 1 }, 7);

    try std.testing.expectEqualStrings(&base.directive.id, &same.directive.id);
    try std.testing.expect(!std.mem.eql(u8, &base.directive.id, &higher_clearance.directive.id));
    try std.testing.expect(!std.mem.eql(u8, &base.directive.id, &binding_order.directive.id));
    try std.testing.expect(!std.mem.eql(u8, &base.directive.id, &different_officer.directive.id));
}

test "directive ids stream unbounded names without a fixed staging buffer" {
    const policy = pmod.Policy.init();
    var long_name: [1024]u8 = [_]u8{'x'} ** 1024;
    var long_action: [1024]u8 = [_]u8{'y'} ** 1024;
    const officer = try policy.officer(&long_name, .wo3, 6, "core_integrity", "aiwo");
    const result = issue(&policy, officer, .{ .name = &long_action }, 1);
    try std.testing.expectEqual(.allow, result.decision.decision);
    try std.testing.expect(std.mem.indexOfScalar(u8, &result.directive.id, 0) == null);
}
