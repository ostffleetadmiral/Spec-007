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

pub fn load(allocator: std.mem.Allocator, path: []const u8) !Manifest {
    const raw = try std.fs.cwd().readFileAlloc(allocator, path, 4 * 1024 * 1024);
    defer allocator.free(raw);
    return parse(raw);
}

pub fn parse(raw: []const u8) !Manifest {
    var parsed = try std.json.parseFromSlice(std.json.Value, std.heap.page_allocator, raw, .{});
    defer parsed.deinit();
    const root = parsed.value.object;
    const aiwo = root.get("aiwo") orelse return error.MissingAIWO;
    const aiwo_obj = aiwo.object;
    const prohibited = aiwo_obj.get("prohibited") orelse return error.MissingProhibited;
    if (prohibited.array.items.len < 5) return error.InsufficientProhibitedActions;
    const systems = root.get("ai_systems") orelse return error.MissingAISystems;
    var assets: usize = 0;
    var max_cap: u8 = 0;
    for (systems.array.items) |item| {
        const obj = item.object;
        if (obj.get("designation")) |designation| {
            if (std.mem.eql(u8, designation.string, "monitored_ai_asset")) {
                assets += 1;
                const cap = obj.get("clearance_cap") orelse return error.MissingClearanceCap;
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
    const m = try parse(raw);
    try std.testing.expect(m.has_aiwo);
    try std.testing.expectEqual(@as(usize, 1), m.monitored_assets);
    try std.testing.expectEqual(@as(u8, 6), m.max_monitored_clearance);
}
