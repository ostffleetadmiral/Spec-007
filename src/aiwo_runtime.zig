//! Native AIWO runtime: policy -> observation -> decision -> FANO -> state.
const std = @import("std");
const t = @import("aiwo_types");
const policy_mod = @import("aiwo_policy");
const state_mod = @import("aiwo_state");
const directive = @import("aiwo_directive");
const fano = @import("aiwo_fano");
const cognitive = @import("aiwo_cognitive");
const digit_bridge = @import("aiwo_digit_bridge");
const digit_brain = @import("digit_brain");

pub const ObservedCycleResult = struct {
    decision: t.Decision,
    commit: cognitive.Commit,
    wire: [fano.Wire]u8,
    sequence: u64,
};

pub const Runtime = struct {
    allocator: std.mem.Allocator,
    policy: policy_mod.Policy,
    officer: t.OfficerId,
    state: state_mod.State,
    cognitive_engine: cognitive.Engine,
    cell: [3]u8,

    pub fn init(allocator: std.mem.Allocator, name: []const u8, rank: t.Rank, clearance: u8, duty: []const u8, custody: []const u8, cell: [3]u8) !Runtime {
        return initWithScale(allocator, name, rank, clearance, duty, custody, cell, 1);
    }

    pub fn initWithScale(allocator: std.mem.Allocator, name: []const u8, rank: t.Rank, clearance: u8, duty: []const u8, custody: []const u8, cell: [3]u8, scale: u8) !Runtime {
        const policy = policy_mod.Policy.init();
        _ = try policy.officer(name, rank, clearance, duty, custody);
        const owned_name = try allocator.dupe(u8, name);
        errdefer allocator.free(owned_name);
        const owned_duty = try allocator.dupe(u8, duty);
        errdefer allocator.free(owned_duty);
        const owned_custody = try allocator.dupe(u8, custody);
        errdefer allocator.free(owned_custody);
        const officer = t.OfficerId{ .name = owned_name, .rank = rank, .clearance = clearance, .duty = owned_duty, .custody = owned_custody };
        return .{ .allocator = allocator, .policy = policy, .officer = officer, .state = .{ .officer = owned_name, .policy_digest = policy.digest, .lifecycle = .commissioned }, .cognitive_engine = try cognitive.Engine.init(scale), .cell = cell };
    }

    pub fn deinit(self: *Runtime) void {
        self.allocator.free(self.officer.name);
        self.allocator.free(self.officer.duty);
        self.allocator.free(self.officer.custody);
        self.* = undefined;
    }

    pub fn activate(self: *Runtime) void {
        self.state.lifecycle = .active;
    }

    fn advance(self: *Runtime) !void {
        if (self.state.cycle == std.math.maxInt(u64) or self.state.sequence == std.math.maxInt(u64)) return error.StateSequenceExhausted;
        self.state.cycle += 1;
        self.state.sequence += 1;
    }

    pub fn runCycle(self: *Runtime, action: t.Action) !struct { decision: t.Decision, wire: [fano.Wire]u8, sequence: u64 } {
        if (self.state.lifecycle != .active) return error.NotActive;
        try self.advance();
        const result = directive.issue(&self.policy, self.officer, action, self.state.sequence);
        const action_digest = t.digestBytes(action.name);
        const observation = self.cognitive_engine.observe(0, 0, @as(u256, @bitCast(action_digest)), @as(u256, @bitCast(self.policy.digest)), @as(u256, self.state.sequence), self.state.cycle);
        var reflections: [7]cognitive.Reflection = undefined;
        const commit = try self.cognitive_engine.reflect(observation, &reflections);
        const digest = t.digestBytes(std.mem.asBytes(&commit.routing_fold));
        const wire = try fano.heartbeat(self.cell, self.state.sequence, self.officer.name, digest);
        if (!fano.verify(&wire)) return error.SealFailure;
        return .{ .decision = result.decision.decision, .wire = wire, .sequence = self.state.sequence };
    }

    /// Runs an AIWO cycle over a real compact model observation supplied by a
    /// Digit/K3 session adapter. The runtime never receives model tensors.
    pub fn runObservedCycle(self: *Runtime, observation: cognitive.Observation, action: t.Action) !ObservedCycleResult {
        if (self.state.lifecycle != .active) return error.NotActive;
        try self.advance();
        const result = directive.issue(&self.policy, self.officer, action, self.state.sequence);
        var reflections: [7]cognitive.Reflection = undefined;
        const commit = try self.cognitive_engine.reflect(observation, &reflections);
        const digest = t.digestBytes(std.mem.asBytes(&commit.routing_fold));
        const wire = try fano.heartbeat(self.cell, self.state.sequence, self.officer.name, digest);
        if (!fano.verify(&wire)) return error.SealFailure;
        return .{ .decision = result.decision.decision, .commit = commit, .wire = wire, .sequence = self.state.sequence };
    }

    pub fn runDigitObservedCycle(self: *Runtime, observation: digit_brain.ModelObservation, action: t.Action) !ObservedCycleResult {
        return self.runObservedCycle(try digit_bridge.adapt(observation), action);
    }

    pub fn save(self: *Runtime, path: []const u8) !void {
        try state_mod.saveAtomic(self.allocator, path, self.state);
    }
};

test "AIWO runtime is deny-by-default and emits sealed heartbeats" {
    var runtime = try Runtime.init(std.testing.allocator, "digit", .wo3, 6, "core_integrity", "aiwo", .{ 1, 2, 3 });
    defer runtime.deinit();
    runtime.activate();
    const observation = try runtime.runCycle(.{ .name = "observe" });
    try std.testing.expectEqual(.allow, observation.decision);
    try std.testing.expectEqual(@as(u64, 1), observation.sequence);
    const blocked = try runtime.runCycle(.{ .name = "governance-edit", .mutates_governance = true });
    try std.testing.expectEqual(.deny, blocked.decision);
}

test "AIWO runtime owns mutable caller-provided identity strings" {
    var name = [_]u8{ 'd', 'i', 'g', 'i', 't' };
    var custody = [_]u8{ 'a', 'i', 'w', 'o' };
    var runtime = try Runtime.init(std.testing.allocator, &name, .wo3, 6, "core_integrity", &custody, .{ 1, 2, 3 });
    defer runtime.deinit();
    @memset(&name, 'x');
    @memset(&custody, 'x');
    try std.testing.expectEqualStrings("digit", runtime.officer.name);
    try std.testing.expectEqualStrings("aiwo", runtime.officer.custody);
    try std.testing.expectEqualStrings("digit", runtime.state.officer);
}

test "AIWO runtime refuses sequence exhaustion without advancing" {
    var runtime = try Runtime.init(std.testing.allocator, "digit", .wo3, 6, "core_integrity", "aiwo", .{ 1, 2, 3 });
    defer runtime.deinit();
    runtime.activate();
    runtime.state.sequence = std.math.maxInt(u64);
    runtime.state.cycle = std.math.maxInt(u64);
    try std.testing.expectError(error.StateSequenceExhausted, runtime.runCycle(.{ .name = "observe" }));
    try std.testing.expectEqual(std.math.maxInt(u64), runtime.state.sequence);
    try std.testing.expectEqual(std.math.maxInt(u64), runtime.state.cycle);
}
