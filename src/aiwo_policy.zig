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

pub const Policy = struct {
    version: u32 = t.PolicyVersion,
    digest: t.PolicyDigest,
    max_monitored_clearance: u8 = 6,

    pub fn init() Policy {
        var bytes: [2048]u8 = undefined;
        var stream = std.io.fixedBufferStream(&bytes);
        const w = stream.writer();
        w.writeAll(t.Schema) catch unreachable;
        w.print("|{d}|L6|", .{t.PolicyVersion}) catch unreachable;
        for (patrol_duties) |d| w.print("{s};", .{d}) catch unreachable;
        return .{ .digest = t.digestBytes(stream.getWritten()) };
    }

    pub fn officer(self: *const Policy, name: []const u8, rank: t.Rank, clearance: u8, duty: []const u8, custody: []const u8) !t.OfficerId {
        if (clearance > self.max_monitored_clearance) return error.ClearanceExceedsL6;
        if (!containsDuty(duty)) return error.UnknownDuty;
        return .{ .name = name, .rank = rank, .clearance = clearance, .duty = duty, .custody = custody };
    }

    pub fn evaluate(self: *const Policy, identity: t.OfficerId, action: t.Action) t.DecisionRecord {
        if (identity.clearance > self.max_monitored_clearance)
            return self.deny("officer clearance exceeds monitored AI cap");
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

test "policy enforces L6 and prohibited actions" {
    const p = Policy.init();
    const o = try p.officer("digit", .wo3, 6, "core_integrity", "aiwo");
    try std.testing.expectEqual(.allow, p.evaluate(o, .{ .name = "observe" }).decision);
    try std.testing.expectEqual(.requires_human_approval, p.evaluate(o, .{ .name = "quench", .irreversible = true }).decision);
    try std.testing.expectEqual(.deny, p.evaluate(o, .{ .name = "edit", .mutates_governance = true }).decision);
}

test "policy rejects unknown duties and over-cap officers" {
    const p = Policy.init();
    try std.testing.expectError(error.UnknownDuty, p.officer("x", .wo1, 3, "unknown", "aiwo"));
    try std.testing.expectError(error.ClearanceExceedsL6, p.officer("x", .cwo, 7, "custody", "aiwo"));
}
