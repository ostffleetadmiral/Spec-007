//! Bounded native AIWO heartbeat scheduler. Separate from training heartbeat.
const std = @import("std");
const runtime = @import("aiwo_runtime");
const t = @import("aiwo_types");

pub const Heartbeat = struct {
    officer: runtime.Runtime,
    interval_ms: u64 = 77_000,

    pub fn init(allocator: std.mem.Allocator, name: []const u8, rank: t.Rank, clearance: u8, duty: []const u8, custody: []const u8, cell: [3]u8) !Heartbeat {
        return .{ .officer = try runtime.Runtime.init(allocator, name, rank, clearance, duty, custody, cell) };
    }

    pub fn deinit(self: *Heartbeat) void {
        self.officer.deinit();
    }

    pub fn cycle(self: *Heartbeat) !struct { decision: t.Decision, sequence: u64, elapsed_ms: u64 } {
        self.officer.activate();
        const start = std.time.milliTimestamp();
        const result = try self.officer.runCycle(.{ .name = "patrol-observation" });
        return .{ .decision = result.decision, .sequence = result.sequence, .elapsed_ms = @intCast(std.time.milliTimestamp() - start) };
    }
};

test "native heartbeat cycle is bounded and sequenced" {
    var h = try Heartbeat.init(std.testing.allocator, "sheraton", .wo3, 6, "audit_integrity", "aiwo", .{ 2, 3, 4 });
    defer h.deinit();
    const first = try h.cycle();
    const second = try h.cycle();
    try std.testing.expectEqual(@as(u64, 1), first.sequence);
    try std.testing.expectEqual(@as(u64, 2), second.sequence);
    try std.testing.expectEqual(.allow, first.decision);
}
