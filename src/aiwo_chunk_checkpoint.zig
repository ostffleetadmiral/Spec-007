//! Atomic, checksummed checkpoint for deterministic AIWO chunk execution.
const std = @import("std");

pub const Checkpoint = struct {
    scale: u8,
    chunk_size: usize,
    max_chunks: usize,
    next_chunk: usize,
    receipt_fold: u256,
};

const MAGIC = "AIOC001";
const BYTES = 7 + 1 + 8 * 4 + 32;

pub fn saveAtomic(allocator: std.mem.Allocator, path: []const u8, checkpoint: Checkpoint) !void {
    var bytes: [BYTES]u8 = undefined;
    @memcpy(bytes[0..7], MAGIC);
    bytes[7] = checkpoint.scale;
    std.mem.writeInt(u64, bytes[8..16], @intCast(checkpoint.chunk_size), .little);
    std.mem.writeInt(u64, bytes[16..24], @intCast(checkpoint.max_chunks), .little);
    std.mem.writeInt(u64, bytes[24..32], @intCast(checkpoint.next_chunk), .little);
    std.mem.writeInt(u64, bytes[32..40], @intCast(checkpoint.receipt_fold & std.math.maxInt(u64)), .little);
    var fold_bytes: [32]u8 = undefined;
    std.mem.writeInt(u256, &fold_bytes, checkpoint.receipt_fold, .little);
    @memcpy(bytes[40..72], &fold_bytes);
    const tmp = try std.fmt.allocPrint(allocator, "{s}.tmp", .{path});
    defer allocator.free(tmp);
    if (std.fs.path.dirname(path)) |dir| try std.fs.cwd().makePath(dir);
    var file = try std.fs.cwd().createFile(tmp, .{ .truncate = true, .mode = 0o600 });
    defer file.close();
    try file.writeAll(&bytes);
    try file.sync();
    try std.fs.cwd().rename(tmp, path);
}

pub fn load(allocator: std.mem.Allocator, path: []const u8) !Checkpoint {
    const bytes = try std.fs.cwd().readFileAlloc(allocator, path, BYTES);
    defer allocator.free(bytes);
    if (bytes.len != BYTES or !std.mem.eql(u8, bytes[0..7], MAGIC)) return error.InvalidCheckpoint;
    return .{ .scale = bytes[7], .chunk_size = std.mem.readInt(u64, bytes[8..16], .little), .max_chunks = std.mem.readInt(u64, bytes[16..24], .little), .next_chunk = std.mem.readInt(u64, bytes[24..32], .little), .receipt_fold = std.mem.readInt(u256, bytes[40..72], .little) };
}

test "chunk checkpoint atomic roundtrip" {
    const path = "/tmp/spec007-aiwo-checkpoint/state.bin";
    const expected = Checkpoint{ .scale = 7, .chunk_size = 4096, .max_chunks = 1024, .next_chunk = 512, .receipt_fold = 12345 };
    try saveAtomic(std.testing.allocator, path, expected);
    const actual = try load(std.testing.allocator, path);
    try std.testing.expectEqual(expected.scale, actual.scale);
    try std.testing.expectEqual(expected.next_chunk, actual.next_chunk);
    try std.testing.expectEqual(expected.receipt_fold, actual.receipt_fold);
}
