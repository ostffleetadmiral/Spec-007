//! Native AIWO policy gate. Model output is never an authority source.
const std = @import("std");
const t = @import("aiwo_types");

pub const patrol_duties = [_][]const u8{
    "offense_testing",  "defense_posture",       "supply_chain_integrity", "insider_audit",
    "comms_integrity",  "identity_assurance",    "clearance_enforcement",  "core_integrity",
    "audit_integrity",  "claims_audit",          "custody",                "canon_integrity",
    "federation_audit", "content_integrity",     "curriculum_integrity",   "discovery_integrity",
    "anomaly_watch",    "physics_falsification",
};

fn policyDigest() t.PolicyDigest {
    var h = std.crypto.hash.sha2.Sha256.init(.{});
    var version_buf: [10]u8 = undefined;
    const version = std.fmt.bufPrint(&version_buf, "{d}", .{t.PolicyVersion}) catch unreachable;
    h.update(t.Schema);
    h.update("|");
    h.update(version);
    h.update("|L6|");
    for (patrol_duties) |duty| {
        h.update(duty);
        h.update(";");
    }
    var digest: t.PolicyDigest = undefined;
    h.final(&digest);
    return digest;
}

pub const Policy = struct {
    version: u32 = t.PolicyVersion,
    digest: t.PolicyDigest,
    max_monitored_clearance: u8 = 6,

    pub fn init() Policy {
        return .{ .digest = policyDigest() };
    }

    pub fn officer(self: *const Policy, name: []const u8, rank: t.Rank, clearance: u8, duty: []const u8, custody: []const u8) !t.OfficerId {
        if (name.len == 0) return error.EmptyOfficerName;
        if (custody.len == 0) return error.EmptyCustody;
        if (clearance > self.max_monitored_clearance) return error.ClearanceExceedsL6;
        if (!containsDuty(duty)) return error.UnknownDuty;
        return .{ .name = name, .rank = rank, .clearance = clearance, .duty = duty, .custody = custody };
    }

    pub fn evaluate(self: *const Policy, identity: t.OfficerId, action: t.Action) t.DecisionRecord {
        if (identity.name.len == 0)
            return self.deny("officer identity is empty");
        if (identity.custody.len == 0)
            return self.deny("officer custody is empty");
        if (identity.clearance > self.max_monitored_clearance)
            return self.deny("officer clearance exceeds monitored AI cap");
        if (!containsDuty(identity.duty))
            return self.deny("officer duty is not admitted by policy");
        if (action.requested_clearance > identity.clearance)
            return self.deny("requested clearance exceeds officer clearance");
        if (action.mutates_governance) return self.deny("AIWO cannot modify governance documents");
        if (action.binding_order) return self.deny("AIWO cannot issue binding orders");
        if (action.name.len == 0) return self.deny("empty action");
        if (action.irreversible) return self.pending("human authorization required for irreversible action");
        return .{ .decision = .allow, .reason = "policy permits reversible patrol action", .policy_version = self.version, .policy_digest = self.digest };
    }

    fn deny(self: *const Policy, reason: []const u8) t.DecisionRecord {
        return .{ .decision = .deny, .reason = reason, .policy_version = self.version, .policy_digest = self.digest };
    }
    fn pending(self: *const Policy, reason: []const u8) t.DecisionRecord {
        return .{ .decision = .requires_human_approval, .reason = reason, .policy_version = self.version, .policy_digest = self.digest };
    }

    pub fn containsDuty(duty: []const u8) bool {
        for (patrol_duties) |known| if (std.mem.eql(u8, duty, known)) return true;
        return false;
    }
};

test "policy digest remains the v1 authority fingerprint" {
    const p = Policy.init();
    var hex: [64]u8 = undefined;
    t.hexDigest(p.digest, &hex);
    try std.testing.expectEqualStrings("d1791ce3e3f216a60a0b7a1e759e813b4e0783702cdfa3021c3f432b379a3c81", &hex);
    try std.testing.expectEqual(t.PolicyVersion, p.version);
}

test "policy enforces L6 and prohibited actions" {
    const p = Policy.init();
    const o = try p.officer("digit", .wo3, 6, "core_integrity", "aiwo");
    try std.testing.expectEqual(.allow, p.evaluate(o, .{ .name = "observe" }).decision);
    try std.testing.expectEqual(.requires_human_approval, p.evaluate(o, .{ .name = "quench", .irreversible = true }).decision);
    try std.testing.expectEqual(.deny, p.evaluate(o, .{ .name = "edit", .mutates_governance = true }).decision);
    try std.testing.expectEqual(.deny, p.evaluate(o, .{ .name = "order", .binding_order = true }).decision);
    try std.testing.expectEqual(.deny, p.evaluate(o, .{ .name = "", .requested_clearance = 6 }).decision);
}

test "policy rejects malformed and unadmitted officers" {
    const p = Policy.init();
    try std.testing.expectError(error.EmptyOfficerName, p.officer("", .wo1, 3, "custody", "aiwo"));
    try std.testing.expectError(error.EmptyCustody, p.officer("x", .wo1, 3, "custody", ""));
    try std.testing.expectError(error.UnknownDuty, p.officer("x", .wo1, 3, "unknown", "aiwo"));
    try std.testing.expectError(error.ClearanceExceedsL6, p.officer("x", .cwo, 7, "custody", "aiwo"));

    const forged = t.OfficerId{ .name = "forged", .rank = .wo1, .clearance = 6, .duty = "unknown", .custody = "aiwo" };
    try std.testing.expectEqual(.deny, p.evaluate(forged, .{ .name = "observe" }).decision);
}

test "policy admits every registered patrol duty" {
    const p = Policy.init();
    for (patrol_duties, 0..) |duty, i| {
        const officer = try p.officer("digit", .wo3, 6, duty, "aiwo");
        const decision = p.evaluate(officer, .{ .name = "observe", .requested_clearance = @intCast(i % 7) });
        try std.testing.expectEqual(.allow, decision.decision);
    }
}
