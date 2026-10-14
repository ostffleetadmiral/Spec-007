//! Sanitized command-manifest loader for the native AIWO policy boundary.
const std = @import("std");
const t = @import("aiwo_types");

pub const Manifest = struct {
    raw_digest: t.PolicyDigest,
    has_aiwo: bool,
    has_prohibited: bool,
    monitored_assets: usize,
    max_monitored_clearance: u8,
};

fn object(value: std.json.Value) !std.json.ObjectMap {
    return switch (value) {
        .object => |obj| obj,
        else => error.InvalidManifestType,
    };
}

fn array(value: std.json.Value) !std.json.Array {
    return switch (value) {
        .array => |items| items,
        else => error.InvalidManifestType,
    };
}

pub fn load(allocator: std.mem.Allocator, path: []const u8) !Manifest {
    const raw = try std.fs.cwd().readFileAlloc(allocator, path, 4 * 1024 * 1024);
    defer allocator.free(raw);
    return parse(allocator, raw);
}

pub fn parse(allocator: std.mem.Allocator, raw: []const u8) !Manifest {
    var parsed = try std.json.parseFromSlice(std.json.Value, allocator, raw, .{});
    defer parsed.deinit();
    const root = try object(parsed.value);
    const aiwo = try object(root.get("aiwo") orelse return error.MissingAIWO);
    const prohibited = try array(aiwo.get("prohibited") orelse return error.MissingProhibited);
    if (prohibited.items.len < 5) return error.InsufficientProhibitedActions;
    for (prohibited.items) |item| {
        if (item != .string) return error.InvalidProhibitedAction;
    }
    const systems = try array(root.get("ai_systems") orelse return error.MissingAISystems);
    var assets: usize = 0;
    var max_cap: u8 = 0;
    for (systems.items) |item| {
        const obj = try object(item);
        if (obj.get("designation")) |designation| {
            if (designation != .string) return error.InvalidDesignation;
            if (std.mem.eql(u8, designation.string, "monitored_ai_asset")) {
                assets += 1;
                const cap = obj.get("clearance_cap") orelse return error.MissingClearanceCap;
                if (cap != .integer) return error.InvalidClearanceCap;
                if (cap.integer < 0 or cap.integer > std.math.maxInt(u8)) return error.InvalidClearanceCap;
                const cap_u: u8 = @intCast(cap.integer);
                max_cap = @max(max_cap, cap_u);
                if (cap_u > 6) return error.MonitoredAssetOverL6;
            }
        }
    }
    if (assets == 0) return error.NoMonitoredAssets;
    return .{ .raw_digest = t.digestBytes(raw), .has_aiwo = true, .has_prohibited = true, .monitored_assets = assets, .max_monitored_clearance = max_cap };
}

test "sanitized command manifest binds AIWO assets below L7" {
    const raw = "{\"aiwo\":{\"prohibited\":[\"a\",\"b\",\"c\",\"d\",\"e\"]},\"ai_systems\":[{\"designation\":\"monitored_ai_asset\",\"clearance_cap\":6}]}";
    const m = try parse(std.testing.allocator, raw);
    try std.testing.expect(m.has_aiwo);
    try std.testing.expectEqual(@as(usize, 1), m.monitored_assets);
    try std.testing.expectEqual(@as(u8, 6), m.max_monitored_clearance);
}

test "manifest rejects malformed JSON types without panicking" {
    try std.testing.expectError(error.InvalidManifestType, parse(std.testing.allocator, "[]"));
    try std.testing.expectError(error.InvalidManifestType, parse(std.testing.allocator, "{\"aiwo\":[],\"ai_systems\":[]}"));
    try std.testing.expectError(error.InvalidManifestType, parse(std.testing.allocator, "{\"aiwo\":{\"prohibited\":{}},\"ai_systems\":[]}"));
    try std.testing.expectError(error.InvalidProhibitedAction, parse(std.testing.allocator, "{\"aiwo\":{\"prohibited\":[\"a\",\"b\",\"c\",\"d\",1]},\"ai_systems\":[{\"designation\":\"monitored_ai_asset\",\"clearance_cap\":6}]}"));
}

test "manifest rejects malformed clearance caps" {
    const prefix = "{\"aiwo\":{\"prohibited\":[\"a\",\"b\",\"c\",\"d\",\"e\"]},\"ai_systems\":[{\"designation\":\"monitored_ai_asset\",\"clearance_cap\":";
    const suffix = "}]}";
    const negative = try std.fmt.allocPrint(std.testing.allocator, "{s}-1{s}", .{ prefix, suffix });
    defer std.testing.allocator.free(negative);
    const fractional = try std.fmt.allocPrint(std.testing.allocator, "{s}1.5{s}", .{ prefix, suffix });
    defer std.testing.allocator.free(fractional);
    const over_l6 = try std.fmt.allocPrint(std.testing.allocator, "{s}7{s}", .{ prefix, suffix });
    defer std.testing.allocator.free(over_l6);
    try std.testing.expectError(error.InvalidClearanceCap, parse(std.testing.allocator, negative));
    try std.testing.expectError(error.InvalidClearanceCap, parse(std.testing.allocator, fractional));
    try std.testing.expectError(error.MonitoredAssetOverL6, parse(std.testing.allocator, over_l6));
}
