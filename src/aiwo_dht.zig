//! AIWO receipt adapter over the native Spec-007 DHT store.
const std = @import("std");
const dht = @import("dht_native");

pub const ReceiptStore = struct {
    store: *dht.Store,
    lane: usize = 0,

    pub fn init(allocator: std.mem.Allocator, root: []const u8, lanes: []const []const u8) !ReceiptStore {
        return .{ .store = try dht.Store.init(allocator, root, lanes) };
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
