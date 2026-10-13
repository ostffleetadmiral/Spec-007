//! Native AIWO runtime: policy -> observation -> decision -> FANO -> state.
const std = @import("std");
const t = @import("aiwo_types");
const policy_mod = @import("aiwo_policy");
const state_mod = @import("aiwo_state");
const directive = @import("aiwo_directive");
const fano = @import("aiwo_fano");

pub const Runtime = struct {
    allocator: std.mem.Allocator,
    policy: policy_mod.Policy,
    officer: t.OfficerId,
    state: state_mod.State,
    cell: [3]u8,

    pub fn init(allocator: std.mem.Allocator, name: []const u8, rank: t.Rank, clearance: u8, duty: []const u8, custody: []const u8, cell: [3]u8) !Runtime {
        const policy = policy_mod.Policy.init();
        const officer = try policy.officer(name, rank, clearance, duty, custody);
        return .{ .allocator = allocator, .policy = policy, .officer = officer, .state = .{ .officer = name, .policy_digest = policy.digest, .lifecycle = .commissioned }, .cell = cell };
    }

    pub fn activate(self: *Runtime) void {
        self.state.lifecycle = .active;
    }

    pub fn runCycle(self: *Runtime, action: t.Action) !struct { decision: t.Decision, wire: [fano.Wire]u8, sequence: u64 } {
        if (self.state.lifecycle != .active) return error.NotActive;
        self.state.cycle += 1;
        self.state.sequence += 1;
        const result = directive.issue(&self.policy, self.officer, action, self.state.sequence);
        const digest = t.digestBytes(result.decision.reason);
        const wire = fano.heartbeat(self.cell, @intCast(self.state.sequence), self.officer.name, digest);
        if (!fano.verify(&wire)) return error.SealFailure;
        return .{ .decision = result.decision.decision, .wire = wire, .sequence = self.state.sequence };
    }

    pub fn save(self: *Runtime, path: []const u8) !void {
        try state_mod.saveAtomic(self.allocator, path, self.state);
    }
};

test "AIWO runtime is deny-by-default and emits sealed heartbeats" {
    var runtime = try Runtime.init(std.testing.allocator, "digit", .wo3, 6, "core_integrity", "aiwo", .{ 1, 2, 3 });
    runtime.activate();
    const observation = try runtime.runCycle(.{ .name = "observe" });
    try std.testing.expectEqual(.allow, observation.decision);
    try std.testing.expectEqual(@as(u64, 1), observation.sequence);
    const blocked = try runtime.runCycle(.{ .name = "governance-edit", .mutates_governance = true });
    try std.testing.expectEqual(.deny, blocked.decision);
}
