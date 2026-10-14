//! spec007-aiwo — native AIWO canary CLI.
const std = @import("std");
const runtime_mod = @import("aiwo_runtime");
const t = @import("aiwo_types");
const cognitive = @import("aiwo_cognitive");
const checkpoint = @import("aiwo_chunk_checkpoint");
const dht = @import("aiwo_dht");

const RunOptions = struct {
    scale: u8 = 1,
    chunk_size: usize = 8,
    max_chunks: usize = 1024,
    execute_chunks: bool = false,
    checkpoint_path: ?[]const u8 = null,
    resume_run: bool = false,
    dht_root: ?[]const u8 = null,
};

fn takeValue(args: anytype, arg: []const u8, name: []const u8, missing: anyerror) !?[]const u8 {
    if (std.mem.eql(u8, arg, name)) return args.next() orelse return missing;
    if (std.mem.startsWith(u8, arg, name) and arg.len > name.len and arg[name.len] == '=') return arg[name.len + 1 ..];
    return null;
}

fn parseRunArgs(args: anytype) !RunOptions {
    var options = RunOptions{};
    while (args.next()) |arg| {
        if (try takeValue(args, arg, "--scale", error.MissingScale)) |value| {
            options.scale = try std.fmt.parseInt(u8, value, 10);
            continue;
        }
        if (try takeValue(args, arg, "--chunk-size", error.MissingChunkSize)) |value| {
            options.chunk_size = try std.fmt.parseInt(usize, value, 10);
            continue;
        }
        if (try takeValue(args, arg, "--max-chunks", error.MissingMaxChunks)) |value| {
            options.max_chunks = try std.fmt.parseInt(usize, value, 10);
            continue;
        }
        if (std.mem.eql(u8, arg, "--execute-chunks")) {
            options.execute_chunks = true;
            continue;
        }
        if (try takeValue(args, arg, "--checkpoint", error.MissingCheckpointPath)) |value| {
            options.checkpoint_path = value;
            continue;
        }
        if (std.mem.eql(u8, arg, "--resume")) {
            options.resume_run = true;
            continue;
        }
        if (try takeValue(args, arg, "--dht-root", error.MissingDhtRoot)) |value| {
            options.dht_root = value;
            continue;
        }
        return error.UnknownArgument;
    }
    return options;
}

pub fn main() !void {
    const alloc = std.heap.page_allocator;
    var args = std.process.args();
    _ = args.next();
    const command = args.next() orelse "status";
    if (std.mem.eql(u8, command, "status")) {
        try std.io.getStdOut().writer().writeAll("{\"schema\":\"AIWO-NATIVE-v1\",\"mode\":\"native-canary\",\"authority\":\"policy-gated\"}\n");
        return;
    }
    if (!std.mem.eql(u8, command, "run")) return error.UnknownCommand;
    const options = try parseRunArgs(&args);
    var h = try runtime_mod.Runtime.initWithScale(alloc, "digit", .wo3, 6, "core_integrity", "aiwo", .{ 1, 2, 3 }, options.scale);
    defer h.deinit();
    h.activate();
    const result = try h.runCycle(.{ .name = "patrol-observation" });
    const p = h.cognitive_engine.policy;
    const plan = try cognitive.ChunkPlan.forPolicy(p, options.chunk_size, options.max_chunks);
    var executed_chunks: usize = 0;
    var receipt_fold: u256 = 0;
    var resumed_from: usize = 0;
    var dht_receipts: usize = 0;
    var receipt_store: ?dht.ReceiptStore = null;
    defer if (receipt_store) |*store| store.deinit();
    if (options.dht_root) |root| {
        receipt_store = try dht.ReceiptStore.init(alloc, root, &.{ "aiwo-corps", "BLUE", "CONT", "GRAY" });
    }
    if (options.execute_chunks) {
        var cursor = try cognitive.ChunkCursor.init(p, options.chunk_size, options.max_chunks);
        if (options.resume_run) {
            const path = options.checkpoint_path orelse return error.CheckpointRequired;
            const saved = try checkpoint.load(alloc, path);
            if (saved.scale != p.scale or saved.chunk_size != options.chunk_size or saved.max_chunks != options.max_chunks) return error.CheckpointPlanMismatch;
            resumed_from = saved.next_chunk;
            while (executed_chunks < resumed_from) : (executed_chunks += 1) _ = cursor.next() orelse return error.CheckpointPastEnd;
            receipt_fold = saved.receipt_fold;
        }
        executed_chunks = resumed_from;
        while (cursor.next()) |chunk| {
            executed_chunks += 1;
            receipt_fold = chunk.receipt_fold;
            if (options.checkpoint_path) |path| try checkpoint.saveAtomic(alloc, path, .{ .scale = p.scale, .chunk_size = options.chunk_size, .max_chunks = options.max_chunks, .next_chunk = executed_chunks, .receipt_fold = receipt_fold });
            if (receipt_store) |*store| {
                const body = try std.fmt.allocPrint(alloc, "{{\"scale\":{d},\"chunk\":{d},\"start\":{d},\"end\":{d},\"paths\":{d},\"receipt_fold\":\"{x}\"}}", .{ p.scale, chunk.index, chunk.start_path, chunk.end_path, chunk.path_count, chunk.receipt_fold });
                defer alloc.free(body);
                const name = try std.fmt.allocPrint(alloc, "chunk-{d}", .{chunk.index});
                defer alloc.free(name);
                _ = try store.put(name, body, 3);
                dht_receipts += 1;
            }
        }
    }
    try std.io.getStdOut().writer().print("{{\"schema\":\"{s}\",\"decision\":\"{s}\",\"sequence\":{d},\"wire_bytes\":{d},\"scale\":{d},\"theoretical_paths\":{d},\"fully_enumerable\":{},\"chunk_size\":{d},\"chunk_count\":{d},\"max_chunks\":{d},\"admitted\":{},\"execute_chunks\":{},\"executed_chunks\":{d},\"resumed_from\":{d},\"checkpoint_path\":\"{s}\",\"dht_root\":\"{s}\",\"dht_receipts\":{d},\"receipt_fold\":\"{x}\"}}\n", .{ t.Schema, @tagName(result.decision), result.sequence, result.wire.len, p.scale, p.max_total_paths, p.fully_enumerable, options.chunk_size, plan.chunk_count, plan.max_chunks, plan.admitted, options.execute_chunks, executed_chunks, resumed_from, options.checkpoint_path orelse "", options.dht_root orelse "", dht_receipts, receipt_fold });
}

const TestArgs = struct {
    items: []const []const u8,
    index: usize = 0,

    fn next(self: *TestArgs) ?[]const u8 {
        if (self.index >= self.items.len) return null;
        defer self.index += 1;
        return self.items[self.index];
    }
};

fn parseTest(items: []const []const u8) !RunOptions {
    var args = TestArgs{ .items = items };
    return parseRunArgs(&args);
}

test "aiwo cli parses separated run options" {
    const items = [_][]const u8{ "--scale", "7", "--chunk-size", "4096", "--max-chunks", "1024", "--execute-chunks", "--checkpoint", "/tmp/aiwo.chk", "--resume", "--dht-root", "/tmp/aiwo-dht" };
    const options = try parseTest(&items);
    try std.testing.expectEqual(@as(u8, 7), options.scale);
    try std.testing.expectEqual(@as(usize, 4096), options.chunk_size);
    try std.testing.expectEqual(@as(usize, 1024), options.max_chunks);
    try std.testing.expect(options.execute_chunks);
    try std.testing.expectEqualStrings("/tmp/aiwo.chk", options.checkpoint_path.?);
    try std.testing.expect(options.resume_run);
    try std.testing.expectEqualStrings("/tmp/aiwo-dht", options.dht_root.?);
}

test "aiwo cli parses equals-style run options" {
    const items = [_][]const u8{ "--scale=3", "--chunk-size=64", "--max-chunks=16", "--checkpoint=/tmp/scale3.chk", "--dht-root=/tmp/scale3-dht" };
    const options = try parseTest(&items);
    try std.testing.expectEqual(@as(u8, 3), options.scale);
    try std.testing.expectEqual(@as(usize, 64), options.chunk_size);
    try std.testing.expectEqual(@as(usize, 16), options.max_chunks);
    try std.testing.expectEqualStrings("/tmp/scale3.chk", options.checkpoint_path.?);
    try std.testing.expectEqualStrings("/tmp/scale3-dht", options.dht_root.?);
}

test "aiwo cli rejects unknown and missing arguments" {
    const unknown = [_][]const u8{"--bogus"};
    try std.testing.expectError(error.UnknownArgument, parseTest(&unknown));
    const missing_scale = [_][]const u8{"--scale"};
    try std.testing.expectError(error.MissingScale, parseTest(&missing_scale));
    const missing_dht = [_][]const u8{"--dht-root"};
    try std.testing.expectError(error.MissingDhtRoot, parseTest(&missing_dht));
}

test "aiwo cli keeps bounded run defaults" {
    const items = [_][]const u8{};
    const options = try parseTest(&items);
    try std.testing.expectEqual(@as(u8, 1), options.scale);
    try std.testing.expectEqual(@as(usize, 8), options.chunk_size);
    try std.testing.expectEqual(@as(usize, 1024), options.max_chunks);
    try std.testing.expect(!options.execute_chunks);
    try std.testing.expect(options.checkpoint_path == null);
    try std.testing.expect(options.dht_root == null);
}
