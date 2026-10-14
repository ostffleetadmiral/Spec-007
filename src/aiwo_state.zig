//! Durable, versioned AIWO officer state. Policy and cognitive state are separate.
const std = @import("std");
const builtin = @import("builtin");
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

fn syncParent(path: []const u8) !void {
    if (builtin.os.tag == .windows or builtin.os.tag == .wasi) return;
    const parent_path = std.fs.path.dirname(path) orelse ".";
    var parent = try std.fs.cwd().openDir(parent_path, .{ .iterate = true });
    defer parent.close();
    try std.posix.fsync(parent.fd);
}

fn writeAtomic(allocator: std.mem.Allocator, path: []const u8, data: []const u8) !void {
    const parent_path = std.fs.path.dirname(path) orelse ".";
    try std.fs.cwd().makePath(parent_path);
    var attempt: u8 = 0;
    while (attempt < 4) : (attempt += 1) {
        const tmp = try std.fmt.allocPrint(allocator, "{s}.{x:0>16}.tmp", .{ path, std.crypto.random.int(u64) });
        defer allocator.free(tmp);
        var file = std.fs.cwd().createFile(tmp, .{ .exclusive = true, .mode = 0o600 }) catch |err| switch (err) {
            error.PathAlreadyExists => continue,
            else => return err,
        };
        errdefer std.fs.cwd().deleteFile(tmp) catch {};
        {
            defer file.close();
            try file.writeAll(data);
            try file.sync();
        }
        try std.fs.cwd().rename(tmp, path);
        try syncParent(path);
        return;
    }
    return error.PathAlreadyExists;
}

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

    try writeAtomic(allocator, path, bytes);
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
    const lifecycle = std.meta.intToEnum(t.Lifecycle, bytes[28]) catch return error.InvalidState;
    const name = try allocator.dupe(u8, bytes[63..body_end]);
    return .{
        .officer = name,
        .policy_digest = bytes[29..61].*,
        .sequence = std.mem.readInt(u64, bytes[12..20], .little),
        .cycle = std.mem.readInt(u64, bytes[20..28], .little),
        .lifecycle = lifecycle,
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

test "AIWO state leaves no staging file and refuses truncation" {
    const allocator = std.testing.allocator;
    const root = "/tmp/spec007-aiwo-state-durable";
    const path = "/tmp/spec007-aiwo-state-durable/state.bin";
    std.fs.cwd().deleteTree(root) catch {};
    defer std.fs.cwd().deleteTree(root) catch {};
    const p = t.digestBytes("policy");
    try saveAtomic(allocator, path, .{ .officer = "digit", .policy_digest = p, .lifecycle = .active });

    var dir = try std.fs.cwd().openDir(root, .{ .iterate = true });
    defer dir.close();
    var it = dir.iterate();
    while (try it.next()) |entry| try std.testing.expect(!std.mem.endsWith(u8, entry.name, ".tmp"));

    const bytes = try std.fs.cwd().readFileAlloc(allocator, path, 1024 * 1024);
    defer allocator.free(bytes);
    try std.fs.cwd().writeFile(.{ .sub_path = path, .data = bytes[0 .. bytes.len - 1] });
    try std.testing.expectError(error.InvalidState, load(allocator, path));
}

test "AIWO state refuses an invalid lifecycle even with valid checksum" {
    const allocator = std.testing.allocator;
    const root = "/tmp/spec007-aiwo-state-lifecycle";
    const path = "/tmp/spec007-aiwo-state-lifecycle/state.bin";
    std.fs.cwd().deleteTree(root) catch {};
    defer std.fs.cwd().deleteTree(root) catch {};
    const p = t.digestBytes("policy");
    try saveAtomic(allocator, path, .{ .officer = "digit", .policy_digest = p, .lifecycle = .active });
    const bytes = try std.fs.cwd().readFileAlloc(allocator, path, 1024 * 1024);
    defer allocator.free(bytes);
    bytes[28] = 255;
    const body_end = bytes.len - 32;
    const sum = t.digestBytes(bytes[0..body_end]);
    @memcpy(bytes[body_end..], &sum);
    try std.fs.cwd().writeFile(.{ .sub_path = path, .data = bytes });
    try std.testing.expectError(error.InvalidState, load(allocator, path));
}

test "AIWO state bounds serialized officer names" {
    const allocator = std.testing.allocator;
    const officer = try allocator.alloc(u8, std.math.maxInt(u16) + 1);
    defer allocator.free(officer);
    @memset(officer, 'a');
    const p = t.digestBytes("policy");
    try std.testing.expectError(error.OfficerNameTooLong, saveAtomic(allocator, "/tmp/spec007-aiwo-state-large/state.bin", .{ .officer = officer, .policy_digest = p }));
}
