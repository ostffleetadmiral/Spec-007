//! AIWO receipt adapter over the native Spec-007 DHT store.
const std = @import("std");
const dht = @import("dht_native");

pub const ReceiptStore = struct {
    store: *dht.Store,
    lane: usize = 0,

    pub fn init(allocator: std.mem.Allocator, root: []const u8, lanes: []const []const u8) !ReceiptStore {
        try ensureKeys(root);
        return .{ .store = try dht.Store.init(allocator, root, lanes) };
    }

    fn ensureKeys(root: []const u8) !void {
        const dir = try std.fs.path.join(std.heap.page_allocator, &.{ root, "keys" });
        defer std.heap.page_allocator.free(dir);
        try std.fs.cwd().makePath(dir);
        const sk_path = try std.fs.path.join(std.heap.page_allocator, &.{ dir, "fleet-service.sk" });
        defer std.heap.page_allocator.free(sk_path);
        const pk_path = try std.fs.path.join(std.heap.page_allocator, &.{ dir, "fleet-service.pk" });
        defer std.heap.page_allocator.free(pk_path);
        const have_sk = blk: {
            std.fs.cwd().access(sk_path, .{}) catch break :blk false;
            break :blk true;
        };
        const have_pk = blk: {
            std.fs.cwd().access(pk_path, .{}) catch break :blk false;
            break :blk true;
        };
        if (have_sk and have_pk) return;
        const kp = try std.crypto.sign.Ed25519.KeyPair.create(null);
        var sk_der: [48]u8 = undefined;
        var pk_der: [44]u8 = undefined;
        @memcpy(sk_der[0..16], &dht.PKCS8_PREFIX);
        @memcpy(sk_der[16..48], kp.secret_key.toBytes()[0..32]);
        @memcpy(pk_der[0..12], &dht.SPKI_PREFIX);
        @memcpy(pk_der[12..44], &kp.public_key.toBytes());
        try std.fs.cwd().writeFile(.{ .sub_path = sk_path, .data = &sk_der });
        try std.fs.cwd().writeFile(.{ .sub_path = pk_path, .data = &pk_der });
    }

    pub fn deinit(_: *ReceiptStore) void {
        // Store owns process-lifetime registry/key state; dht_native exposes no deinit.
    }

    pub fn put(self: *ReceiptStore, name: []const u8, body: []const u8, clearance: u8) ![64]u8 {
        const result = try self.store.recordPut(self.lane, "aiwo-event", name, body, clearance);
        if (result.st != .ok) return error.ReceiptRejected;
        return result.id;
    }
};
