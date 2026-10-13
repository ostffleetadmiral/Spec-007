//! Durable, versioned AIWO officer state. Policy and cognitive state are separate.
const std = @import("std");
const t = @import("aiwo_types");

pub const State = struct {
    schema: []const u8 = t.Schema,
    officer: []const u8,
    policy_digest: t.PolicyDigest,
    sequence: u64 = 0,
    cycle: u64 = 0,
    lifecycle: t.Lifecycle = .uninitialized,
};

const MAGIC = "AIWOST01";
const VERSION: u32 = 1;
const HEADER = 8 + 4 + 8 + 8 + 1 + 32 + 2;

pub fn saveAtomic(allocator: std.mem.Allocator, path: []const u8, state: State) !void {
    if (state.officer.len > std.math.maxInt(u16)) return error.OfficerNameTooLong;
    var bytes = try allocator.alloc(u8, HEADER + state.officer.len + 32);
    defer allocator.free(bytes);
    @memcpy(bytes[0..8], MAGIC);
    std.mem.writeInt(u32, bytes[8..12], VERSION, .little);
    std.mem.writeInt(u64, bytes[12..20], state.sequence, .little);
    std.mem.writeInt(u64, bytes[20..28], state.cycle, .little);
    bytes[28] = @intFromEnum(state.lifecycle);
    @memcpy(bytes[29..61], &state.policy_digest);
    std.mem.writeInt(u16, bytes[61..63], @intCast(state.officer.len), .little);
    @memcpy(bytes[63 .. 63 + state.officer.len], state.officer);
    const body_end = 63 + state.officer.len;
    const checksum = t.digestBytes(bytes[0..body_end]);
    @memcpy(bytes[body_end .. body_end + 32], &checksum);

    const dir = std.fs.path.dirname(path);
    if (dir) |d| try std.fs.cwd().makePath(d);
    const tmp = try std.fmt.allocPrint(allocator, "{s}.tmp", .{path});
    defer allocator.free(tmp);
    {
        var file = try std.fs.cwd().createFile(tmp, .{ .truncate = true, .mode = 0o600 });
        defer file.close();
        try file.writeAll(bytes);
        try file.sync();
    }
    try std.fs.cwd().rename(tmp, path);
}

pub fn load(allocator: std.mem.Allocator, path: []const u8) !State {
    const bytes = try std.fs.cwd().readFileAlloc(allocator, path, 1024 * 1024);
    defer allocator.free(bytes);
    if (bytes.len < HEADER + 32 or !std.mem.eql(u8, bytes[0..8], MAGIC)) return error.InvalidState;
    if (std.mem.readInt(u32, bytes[8..12], .little) != VERSION) return error.VersionMismatch;
    const name_len = std.mem.readInt(u16, bytes[61..63], .little);
    const body_end = 63 + @as(usize, name_len);
    if (body_end + 32 != bytes.len) return error.InvalidState;
    const checksum = t.digestBytes(bytes[0..body_end]);
    if (!std.mem.eql(u8, &checksum, bytes[body_end..])) return error.ChecksumMismatch;
    const name = try allocator.dupe(u8, bytes[63..body_end]);
    return .{
        .officer = name,
        .policy_digest = bytes[29..61].*,
        .sequence = std.mem.readInt(u64, bytes[12..20], .little),
        .cycle = std.mem.readInt(u64, bytes[20..28], .little),
        .lifecycle = std.meta.intToEnum(t.Lifecycle, bytes[28]) catch return error.InvalidState,
    };
}

test "AIWO state atomic round-trip and tamper detection" {
    const path = "/tmp/spec007-aiwo-state-test/state.bin";
    const p = t.digestBytes("policy");
    try saveAtomic(std.testing.allocator, path, .{ .officer = "digit", .policy_digest = p, .sequence = 7, .cycle = 3, .lifecycle = .active });
    const loaded = try load(std.testing.allocator, path);
    defer std.testing.allocator.free(loaded.officer);
    try std.testing.expectEqualStrings("digit", loaded.officer);
    try std.testing.expectEqual(@as(u64, 7), loaded.sequence);
    try std.testing.expectEqual(.active, loaded.lifecycle);
    var f = try std.fs.cwd().openFile(path, .{ .mode = .read_write });
    defer f.close();
    try f.seekTo(20);
    try f.writeAll(&[_]u8{0xff});
    try std.testing.expectError(error.ChecksumMismatch, load(std.testing.allocator, path));
}
