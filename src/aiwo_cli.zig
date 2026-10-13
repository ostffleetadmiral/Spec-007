//! spec007-aiwo — native AIWO canary CLI.
const std = @import("std");
const runtime_mod = @import("aiwo_runtime");
const t = @import("aiwo_types");
const cognitive = @import("aiwo_cognitive");
const checkpoint = @import("aiwo_chunk_checkpoint");

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
    var execute_chunks = false;
    var checkpoint_path: ?[]const u8 = null;
    var resume_run = false;
    while (args.next()) |arg| {
        if (std.mem.eql(u8, arg, "--scale")) scale = try std.fmt.parseInt(u8, args.next() orelse return error.MissingScale, 10);
        if (std.mem.eql(u8, arg, "--chunk-size")) chunk_size = try std.fmt.parseInt(usize, args.next() orelse return error.MissingChunkSize, 10);
        if (std.mem.eql(u8, arg, "--max-chunks")) max_chunks = try std.fmt.parseInt(usize, args.next() orelse return error.MissingMaxChunks, 10);
        if (std.mem.eql(u8, arg, "--execute-chunks")) execute_chunks = true;
        if (std.mem.eql(u8, arg, "--checkpoint")) checkpoint_path = args.next() orelse return error.MissingCheckpointPath;
        if (std.mem.eql(u8, arg, "--resume")) resume_run = true;
    }
    var h = try runtime_mod.Runtime.initWithScale(alloc, "digit", .wo3, 6, "core_integrity", "aiwo", .{ 1, 2, 3 }, scale);
    h.activate();
    const result = try h.runCycle(.{ .name = "patrol-observation" });
    const p = h.cognitive_engine.policy;
    const plan = try cognitive.ChunkPlan.forPolicy(p, chunk_size, max_chunks);
    var executed_chunks: usize = 0;
    var receipt_fold: u256 = 0;
    var resumed_from: usize = 0;
    if (execute_chunks) {
        var cursor = try cognitive.ChunkCursor.init(p, chunk_size, max_chunks);
        if (resume_run) {
            const path = checkpoint_path orelse return error.CheckpointRequired;
            const saved = try checkpoint.load(alloc, path);
            if (saved.scale != p.scale or saved.chunk_size != chunk_size or saved.max_chunks != max_chunks) return error.CheckpointPlanMismatch;
            resumed_from = saved.next_chunk;
            while (executed_chunks < resumed_from) : (executed_chunks += 1) _ = cursor.next() orelse return error.CheckpointPastEnd;
            receipt_fold = saved.receipt_fold;
        }
        executed_chunks = resumed_from;
        while (cursor.next()) |chunk| {
            executed_chunks += 1;
            receipt_fold = chunk.receipt_fold;
            if (checkpoint_path) |path| try checkpoint.saveAtomic(alloc, path, .{ .scale = p.scale, .chunk_size = chunk_size, .max_chunks = max_chunks, .next_chunk = executed_chunks, .receipt_fold = receipt_fold });
        }
    }
    try std.io.getStdOut().writer().print("{{\"schema\":\"{s}\",\"decision\":\"{s}\",\"sequence\":{d},\"wire_bytes\":{d},\"scale\":{d},\"theoretical_paths\":{d},\"fully_enumerable\":{},\"chunk_size\":{d},\"chunk_count\":{d},\"max_chunks\":{d},\"admitted\":{},\"execute_chunks\":{},\"executed_chunks\":{d},\"resumed_from\":{d},\"checkpoint_path\":\"{s}\",\"receipt_fold\":\"{x}\"}}\n", .{ t.Schema, @tagName(result.decision), result.sequence, result.wire.len, p.scale, p.max_total_paths, p.fully_enumerable, plan.chunk_size, plan.chunk_count, plan.max_chunks, plan.admitted, execute_chunks, executed_chunks, resumed_from, checkpoint_path orelse "", receipt_fold });
}
