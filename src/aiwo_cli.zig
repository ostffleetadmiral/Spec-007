//! spec007-aiwo — native AIWO canary CLI.
const std = @import("std");
const runtime_mod = @import("aiwo_runtime");
const t = @import("aiwo_types");

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const alloc = gpa.allocator();
    var args = std.process.args();
    _ = args.next();
    const command = args.next() orelse "status";
    if (std.mem.eql(u8, command, "status")) {
        try std.io.getStdOut().writer().writeAll("{\"schema\":\"AIWO-NATIVE-v1\",\"mode\":\"native-canary\",\"authority\":\"policy-gated\"}\n");
        return;
    }
    if (!std.mem.eql(u8, command, "run")) return error.UnknownCommand;
    var h = try runtime_mod.Runtime.init(alloc, "digit", .wo3, 6, "core_integrity", "aiwo", .{ 1, 2, 3 });
    h.activate();
    const result = try h.runCycle(.{ .name = "patrol-observation" });
    try std.io.getStdOut().writer().print("{{\"schema\":\"{s}\",\"decision\":\"{s}\",\"sequence\":{d},\"wire_bytes\":{d}}}\n", .{ t.Schema, @tagName(result.decision), result.sequence, result.wire.len });
}
