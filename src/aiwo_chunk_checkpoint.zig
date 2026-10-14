//! Atomic, checksummed checkpoint for deterministic AIWO chunk execution.
const std = @import("std");

pub const Checkpoint = struct {
    scale: u8,
    chunk_size: usize,
    max_chunks: usize,
    next_chunk: usize,
    receipt_fold: u256,
};

const MAGIC_V1 = "AIOC001";
const MAGIC_V2 = "AIOC002";
const BYTES = 72;
const CHECKSUM_OFFSET = 64;

fn checksum(payload: []const u8) u64 {
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(payload, &digest, .{});
    return std.mem.readInt(u64, digest[0..8], .little);
}

pub fn saveAtomic(allocator: std.mem.Allocator, path: []const u8, checkpoint: Checkpoint) !void {
    var bytes: [BYTES]u8 = undefined;
    @memcpy(bytes[0..7], MAGIC_V2);
    bytes[7] = checkpoint.scale;
    std.mem.writeInt(u64, bytes[8..16], @intCast(checkpoint.chunk_size), .little);
    std.mem.writeInt(u64, bytes[16..24], @intCast(checkpoint.max_chunks), .little);
    std.mem.writeInt(u64, bytes[24..32], @intCast(checkpoint.next_chunk), .little);
    std.mem.writeInt(u256, bytes[32..64], checkpoint.receipt_fold, .little);
    std.mem.writeInt(u64, bytes[CHECKSUM_OFFSET..BYTES], checksum(bytes[0..CHECKSUM_OFFSET]), .little);

    const tmp = try std.fmt.allocPrint(allocator, "{s}.tmp", .{path});
    defer allocator.free(tmp);
    errdefer std.fs.cwd().deleteFile(tmp) catch {};
    const parent_path = std.fs.path.dirname(path) orelse ".";
    try std.fs.cwd().makePath(parent_path);
    {
        var file = try std.fs.cwd().createFile(tmp, .{ .truncate = true, .mode = 0o600 });
        defer file.close();
        try file.writeAll(&bytes);
        try file.sync();
    }
    try std.fs.cwd().rename(tmp, path);
    var parent = try std.fs.cwd().openDir(parent_path, .{ .iterate = true });
    defer parent.close();
    try std.posix.fsync(parent.fd);
}

pub fn load(allocator: std.mem.Allocator, path: []const u8) !Checkpoint {
    const bytes = try std.fs.cwd().readFileAlloc(allocator, path, BYTES + 1);
    defer allocator.free(bytes);
    if (bytes.len != BYTES) return error.InvalidCheckpoint;
    if (std.mem.eql(u8, bytes[0..7], MAGIC_V2)) {
        const expected = std.mem.readInt(u64, bytes[CHECKSUM_OFFSET..BYTES], .little);
        if (expected != checksum(bytes[0..CHECKSUM_OFFSET])) return error.InvalidCheckpoint;
        return .{
            .scale = bytes[7],
            .chunk_size = std.mem.readInt(u64, bytes[8..16], .little),
            .max_chunks = std.mem.readInt(u64, bytes[16..24], .little),
            .next_chunk = std.mem.readInt(u64, bytes[24..32], .little),
            .receipt_fold = std.mem.readInt(u256, bytes[32..64], .little),
        };
    }
    if (std.mem.eql(u8, bytes[0..7], MAGIC_V1)) {
        const receipt_fold = std.mem.readInt(u256, bytes[40..72], .little);
        const low_fold = std.mem.readInt(u64, bytes[32..40], .little);
        if (low_fold != receipt_fold & std.math.maxInt(u64)) return error.InvalidCheckpoint;
        return .{
            .scale = bytes[7],
            .chunk_size = std.mem.readInt(u64, bytes[8..16], .little),
            .max_chunks = std.mem.readInt(u64, bytes[16..24], .little),
            .next_chunk = std.mem.readInt(u64, bytes[24..32], .little),
            .receipt_fold = receipt_fold,
        };
    }
    return error.InvalidCheckpoint;
}

test "chunk checkpoint atomic roundtrip" {
    const path = "/tmp/spec007-aiwo-checkpoint/state.bin";
    const expected = Checkpoint{ .scale = 7, .chunk_size = 4096, .max_chunks = 1024, .next_chunk = 512, .receipt_fold = 12345 };
    try saveAtomic(std.testing.allocator, path, expected);
    const actual = try load(std.testing.allocator, path);
    try std.testing.expectEqual(expected.scale, actual.scale);
    try std.testing.expectEqual(expected.chunk_size, actual.chunk_size);
    try std.testing.expectEqual(expected.max_chunks, actual.max_chunks);
    try std.testing.expectEqual(expected.next_chunk, actual.next_chunk);
    try std.testing.expectEqual(expected.receipt_fold, actual.receipt_fold);
    try std.testing.expectError(error.FileNotFound, std.fs.cwd().access("/tmp/spec007-aiwo-checkpoint/state.bin.tmp", .{}));
}

test "chunk checkpoint rejects checksum corruption" {
    const path = "/tmp/spec007-aiwo-checkpoint/corrupt.bin";
    const checkpoint = Checkpoint{ .scale = 3, .chunk_size = 64, .max_chunks = 16, .next_chunk = 8, .receipt_fold = 0xABCDEF };
    try saveAtomic(std.testing.allocator, path, checkpoint);
    const bytes = try std.fs.cwd().readFileAlloc(std.testing.allocator, path, BYTES + 1);
    defer std.testing.allocator.free(bytes);
    bytes[10] ^= 0x55;
    try std.fs.cwd().writeFile(.{ .sub_path = path, .data = bytes });
    try std.testing.expectError(error.InvalidCheckpoint, load(std.testing.allocator, path));
}

test "chunk checkpoint rejects truncated format" {
    const path = "/tmp/spec007-aiwo-checkpoint/truncated.bin";
    const checkpoint = Checkpoint{ .scale = 4, .chunk_size = 128, .max_chunks = 32, .next_chunk = 7, .receipt_fold = 99 };
    try saveAtomic(std.testing.allocator, path, checkpoint);
    const bytes = try std.fs.cwd().readFileAlloc(std.testing.allocator, path, BYTES + 1);
    defer std.testing.allocator.free(bytes);
    try std.fs.cwd().writeFile(.{ .sub_path = path, .data = bytes[0 .. BYTES - 1] });
    try std.testing.expectError(error.InvalidCheckpoint, load(std.testing.allocator, path));
}

test "chunk checkpoint resumes legacy v1 state" {
    const path = "/tmp/spec007-aiwo-checkpoint/legacy.bin";
    var bytes: [BYTES]u8 = undefined;
    const receipt_fold: u256 = 0x123456789ABCDEF;
    @memcpy(bytes[0..7], MAGIC_V1);
    bytes[7] = 7;
    std.mem.writeInt(u64, bytes[8..16], 4096, .little);
    std.mem.writeInt(u64, bytes[16..24], 1024, .little);
    std.mem.writeInt(u64, bytes[24..32], 512, .little);
    std.mem.writeInt(u64, bytes[32..40], receipt_fold & std.math.maxInt(u64), .little);
    std.mem.writeInt(u256, bytes[40..72], receipt_fold, .little);
    try std.fs.cwd().writeFile(.{ .sub_path = path, .data = &bytes });
    const actual = try load(std.testing.allocator, path);
    try std.testing.expectEqual(@as(u8, 7), actual.scale);
    try std.testing.expectEqual(@as(usize, 512), actual.next_chunk);
    try std.testing.expectEqual(receipt_fold, actual.receipt_fold);
}
