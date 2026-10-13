//! spec007-aiwo — native AIWO canary CLI.
const std = @import("std");
const runtime_mod = @import("aiwo_runtime");
const t = @import("aiwo_types");
const cognitive = @import("aiwo_cognitive");

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
    var scale: u8 = 1;
    var chunk_size: usize = 8;
    var max_chunks: usize = 1024;
    while (args.next()) |arg| {
        if (std.mem.eql(u8, arg, "--scale")) scale = try std.fmt.parseInt(u8, args.next() orelse return error.MissingScale, 10);
        if (std.mem.eql(u8, arg, "--chunk-size")) chunk_size = try std.fmt.parseInt(usize, args.next() orelse return error.MissingChunkSize, 10);
        if (std.mem.eql(u8, arg, "--max-chunks")) max_chunks = try std.fmt.parseInt(usize, args.next() orelse return error.MissingMaxChunks, 10);
    }
    var h = try runtime_mod.Runtime.initWithScale(alloc, "digit", .wo3, 6, "core_integrity", "aiwo", .{ 1, 2, 3 }, scale);
    h.activate();
    const result = try h.runCycle(.{ .name = "patrol-observation" });
    const p = h.cognitive_engine.policy;
    const plan = try cognitive.ChunkPlan.forPolicy(p, chunk_size, max_chunks);
    try std.io.getStdOut().writer().print("{{\"schema\":\"{s}\",\"decision\":\"{s}\",\"sequence\":{d},\"wire_bytes\":{d},\"scale\":{d},\"theoretical_paths\":{d},\"fully_enumerable\":{},\"chunk_size\":{d},\"chunk_count\":{d},\"max_chunks\":{d},\"admitted\":{}}}\n", .{ t.Schema, @tagName(result.decision), result.sequence, result.wire.len, p.scale, p.max_total_paths, p.fully_enumerable, plan.chunk_size, plan.chunk_count, plan.max_chunks, plan.admitted });
}
