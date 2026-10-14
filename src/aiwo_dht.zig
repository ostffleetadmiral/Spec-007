//! AIWO receipt adapter over the native Spec-007 DHT store.
const std = @import("std");
const builtin = @import("builtin");
const dht = @import("dht_native");

const Ed25519 = std.crypto.sign.Ed25519;

pub const ReceiptStore = struct {
    store: *dht.Store,
    lane: usize = 0,

    pub fn init(allocator: std.mem.Allocator, root: []const u8, lanes: []const []const u8) !ReceiptStore {
        try ensureKeys(allocator, root);
        return .{ .store = try dht.Store.init(allocator, root, lanes) };
    }

    fn readOptional(allocator: std.mem.Allocator, path: []const u8) !?[]u8 {
        return std.fs.cwd().readFileAlloc(allocator, path, 1 << 16) catch |err| switch (err) {
            error.FileNotFound => null,
            else => return err,
        };
    }

    fn validSecretKey(bytes: []const u8) bool {
        if (bytes.len != 48 or !std.mem.eql(u8, bytes[0..16], &dht.PKCS8_PREFIX)) return false;
        _ = Ed25519.KeyPair.create(bytes[16..48].*) catch return false;
        return true;
    }

    fn validPublicKey(bytes: []const u8) bool {
        if (bytes.len != 44 or !std.mem.eql(u8, bytes[0..12], &dht.SPKI_PREFIX)) return false;
        _ = Ed25519.PublicKey.fromBytes(bytes[12..44].*) catch return false;
        return true;
    }

    fn keyPairMatches(sk_der: []const u8, pk_der: []const u8) bool {
        if (!validSecretKey(sk_der) or !validPublicKey(pk_der)) return false;
        const kp = Ed25519.KeyPair.create(sk_der[16..48].*) catch return false;
        return std.mem.eql(u8, &kp.public_key.toBytes(), pk_der[12..44]);
    }

    fn syncParent(path: []const u8) !void {
        if (builtin.os.tag == .windows or builtin.os.tag == .wasi) return;
        const parent_path = std.fs.path.dirname(path) orelse ".";
        var parent = try std.fs.cwd().openDir(parent_path, .{ .iterate = true });
        defer parent.close();
        try std.posix.fsync(parent.fd);
    }

    fn writeAtomic(allocator: std.mem.Allocator, path: []const u8, data: []const u8, mode: std.fs.File.Mode) !void {
        var attempt: u8 = 0;
        while (attempt < 4) : (attempt += 1) {
            const tmp = try std.fmt.allocPrint(allocator, "{s}.{x:0>16}.tmp", .{ path, std.crypto.random.int(u64) });
            defer allocator.free(tmp);
            var file = std.fs.cwd().createFile(tmp, .{ .exclusive = true, .mode = mode }) catch |err| switch (err) {
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

    fn enforceSecretMode(path: []const u8) !void {
        if (builtin.os.tag == .windows or builtin.os.tag == .wasi) return;
        const stat = try std.fs.cwd().statFile(path);
        if (stat.mode & 0o077 == 0) return;
        var file = try std.fs.cwd().openFile(path, .{ .mode = .read_write });
        defer file.close();
        try file.chmod(0o600);
    }

    fn enforceKeyDirMode(path: []const u8) !void {
        if (builtin.os.tag == .windows or builtin.os.tag == .wasi) return;
        var dir = try std.fs.cwd().openDir(path, .{ .iterate = true });
        defer dir.close();
        try dir.chmod(0o700);
    }

    fn ensureKeys(allocator: std.mem.Allocator, root: []const u8) !void {
        const dir = try std.fs.path.join(allocator, &.{ root, "keys" });
        defer allocator.free(dir);
        try std.fs.cwd().makePath(dir);
        try enforceKeyDirMode(dir);
        const sk_path = try std.fs.path.join(allocator, &.{ dir, "fleet-service.sk" });
        defer allocator.free(sk_path);
        const pk_path = try std.fs.path.join(allocator, &.{ dir, "fleet-service.pk" });
        defer allocator.free(pk_path);
        const sk_der = try readOptional(allocator, sk_path);
        defer if (sk_der) |bytes| allocator.free(bytes);
        const pk_der = try readOptional(allocator, pk_path);
        defer if (pk_der) |bytes| allocator.free(bytes);
        if (sk_der) |bytes| if (!validSecretKey(bytes)) return error.InvalidKeyPair;
        if (pk_der) |bytes| if (!validPublicKey(bytes)) return error.InvalidKeyPair;
        if (sk_der != null and pk_der != null) {
            if (!keyPairMatches(sk_der.?, pk_der.?)) return error.InvalidKeyPair;
            try enforceSecretMode(sk_path);
            return;
        }

        const kp = try Ed25519.KeyPair.create(null);
        var new_sk: [48]u8 = undefined;
        var new_pk: [44]u8 = undefined;
        @memcpy(new_sk[0..16], &dht.PKCS8_PREFIX);
        @memcpy(new_sk[16..48], kp.secret_key.toBytes()[0..32]);
        @memcpy(new_pk[0..12], &dht.SPKI_PREFIX);
        @memcpy(new_pk[12..44], &kp.public_key.toBytes());
        try writeAtomic(allocator, sk_path, &new_sk, 0o600);
        try writeAtomic(allocator, pk_path, &new_pk, 0o644);
    }

    pub fn deinit(self: *ReceiptStore) void {
        self.store.deinit();
    }

    pub fn put(self: *ReceiptStore, name: []const u8, body: []const u8, clearance: u8) ![64]u8 {
        const result = try self.store.recordPut(self.lane, "aiwo-event", name, body, clearance);
        if (result.st != .ok) return error.ReceiptRejected;
        return result.id;
    }
};

fn testPath(allocator: std.mem.Allocator, parts: []const []const u8) ![]u8 {
    return std.fs.path.join(allocator, parts);
}

test "receipt key bootstrap uses owner-only secret storage" {
    const allocator = std.testing.allocator;
    const root = "/tmp/spec007-aiwo-dht-keys";
    std.fs.cwd().deleteTree(root) catch {};
    defer std.fs.cwd().deleteTree(root) catch {};
    try ReceiptStore.ensureKeys(allocator, root);
    const dir = try testPath(allocator, &.{ root, "keys" });
    defer allocator.free(dir);
    const sk_path = try testPath(allocator, &.{ dir, "fleet-service.sk" });
    defer allocator.free(sk_path);
    const pk_path = try testPath(allocator, &.{ dir, "fleet-service.pk" });
    defer allocator.free(pk_path);

    const dir_stat = try std.fs.cwd().statFile(dir);
    const sk_stat = try std.fs.cwd().statFile(sk_path);
    try std.testing.expectEqual(@as(std.fs.File.Mode, 0o700), dir_stat.mode & 0o777);
    try std.testing.expectEqual(@as(std.fs.File.Mode, 0o600), sk_stat.mode & 0o777);
    const sk = try ReceiptStore.readOptional(allocator, sk_path);
    defer if (sk) |bytes| allocator.free(bytes);
    const pk = try ReceiptStore.readOptional(allocator, pk_path);
    defer if (pk) |bytes| allocator.free(bytes);
    try std.testing.expect(ReceiptStore.keyPairMatches(sk.?, pk.?));
}

test "receipt key bootstrap preserves an existing valid pair" {
    const allocator = std.testing.allocator;
    const root = "/tmp/spec007-aiwo-dht-preserve";
    std.fs.cwd().deleteTree(root) catch {};
    defer std.fs.cwd().deleteTree(root) catch {};
    try ReceiptStore.ensureKeys(allocator, root);
    const sk_path = try testPath(allocator, &.{ root, "keys", "fleet-service.sk" });
    defer allocator.free(sk_path);
    const first = try std.fs.cwd().readFileAlloc(allocator, sk_path, 1 << 16);
    defer allocator.free(first);
    try ReceiptStore.ensureKeys(allocator, root);
    const second = try std.fs.cwd().readFileAlloc(allocator, sk_path, 1 << 16);
    defer allocator.free(second);
    try std.testing.expectEqualSlices(u8, first, second);
}

test "receipt key bootstrap refuses a mismatched pair" {
    const allocator = std.testing.allocator;
    const root = "/tmp/spec007-aiwo-dht-mismatch";
    std.fs.cwd().deleteTree(root) catch {};
    defer std.fs.cwd().deleteTree(root) catch {};
    try ReceiptStore.ensureKeys(allocator, root);
    const other = try Ed25519.KeyPair.create(null);
    var pk_der: [44]u8 = undefined;
    @memcpy(pk_der[0..12], &dht.SPKI_PREFIX);
    @memcpy(pk_der[12..44], &other.public_key.toBytes());
    const pk_path = try testPath(allocator, &.{ root, "keys", "fleet-service.pk" });
    defer allocator.free(pk_path);
    try std.fs.cwd().writeFile(.{ .sub_path = pk_path, .data = &pk_der });
    try std.testing.expectError(error.InvalidKeyPair, ReceiptStore.ensureKeys(allocator, root));
}

test "receipt store writes a signed aiwo event" {
    const allocator = std.testing.allocator;
    const root = "/tmp/spec007-aiwo-dht-receipt";
    std.fs.cwd().deleteTree(root) catch {};
    defer std.fs.cwd().deleteTree(root) catch {};
    const lanes = [_][]const u8{ "aiwo-corps", "BLUE", "CONT", "GRAY" };
    var store = try ReceiptStore.init(allocator, root, &lanes);
    defer store.deinit();
    const id = try store.put("retrograde-check", "{\"component\":\"aiwo_dht\",\"held\":true}", 7);
    const got = try store.store.recordGet(&id, 7);
    try std.testing.expectEqual(dht.Status.ok, got.st);
    try std.testing.expectEqual(@as(usize, 1), got.versions);
}
