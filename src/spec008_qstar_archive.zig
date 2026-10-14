// SPEC-008 qstar archive harness — dossier persistence under collapse.
//
// Bridges qstar-collapse, qstar-compress, and qstar-vfs into the dossier's
// archive doctrine (nothing green is ever deleted; everything survives):
//   * CellAtomizer — blob → per-cell QR portals across the 15^3 lattice
//   * NestTree — recursive QR nesting for dossier-scale payloads
//   * compress — RMSY container round-trip (dedup + lattice transform)
//   * vfs — lattice pages, LRU cache, pinned desk state, agent-state save
//
// Honest notes:
//   * compress's public CompressConfig is {lattice_level, use_dedup,
//     qubit_config, use_turboquant, tq_bits} — the dep README's use_gzip /
//     use_lattice / use_tq fields are stale and do not exist.
//   * atomizeLattice divides the blob evenly over 3375 cells — a blob not
//     divisible by 3375 truncates the tail; callers must pad. Tested.
//   * VFS1 pages are exact-length: truncated or trailing bytes refuse.
//   * Agent state is exact-shape: [421][7] activations and <=417 output
//     tokens refuse rather than panic or silently truncate.
// Integer-only: all payloads u8; LatticePage fields are u32/u8.

const std = @import("std");
const collapse = @import("collapse");
const compress = @import("compress");
const vfs = @import("vfs_bridge");
const vstream = @import("vfs_streaming");
const vdist = @import("vfs_distributed");

const CELL_COUNT: usize = 3375;

fn dossierBlob(a: std.mem.Allocator, len: usize) ![]u8 {
    // Repetitive-but-structured blob resembling desk-state JSON: dedup must
    // find real redundancy, round-trip must stay byte-exact.
    const block = "{\"callsign\":\"RAMSEY 006\",\"role\":\"fleet_admiral\",\"genesis\":\"a1b2c3\"}";
    var out = try a.alloc(u8, len);
    for (0..len) |i| out[i] = block[i % block.len];
    return out;
}

test "archive: cell atomization and reassembly is byte-exact" {
    const a = std.testing.allocator;
    var atomizer = collapse.CellAtomizer.init(a);
    defer atomizer.deinit();

    const cell_data = "SPEC-008 dossier fragment — fleet admiral grant record";
    try atomizer.atomizeCell(7, 3, 11, cell_data);
    try std.testing.expectEqual(@as(usize, 6), atomizer.portalCount());
    try std.testing.expectEqual(@as(usize, 6), atomizer.validateAll());

    var out: [512]u8 = undefined;
    const n = try atomizer.reassembleCell(7, 3, 11, &out);
    try std.testing.expectEqualStrings(cell_data, out[0..n]);
}

test "archive: full-lattice atomization covers 3375 cells / 20250 portals" {
    const a = std.testing.allocator;
    var atomizer = collapse.CellAtomizer.init(a);
    defer atomizer.deinit();

    // One byte per cell: 3375-byte lattice image → 20,250 QR portals.
    var lattice: [CELL_COUNT]u8 = undefined;
    for (&lattice, 0..) |*b, i| b.* = @truncate(i *% 61 +% 5);
    try atomizer.atomizeLattice(&lattice);
    try std.testing.expectEqual(CELL_COUNT * 6, atomizer.portalCount());

    // Spot-check cell (5,9,2) round-trips its byte.
    var out: [64]u8 = undefined;
    const n = try atomizer.reassembleCell(5, 9, 2, &out);
    const idx = (5 * 15 + 9) * 15 + 2;
    try std.testing.expectEqual(lattice[idx], out[0]);
    _ = n;
}

test "archive: non-divisible lattice atomization drops only the tail" {
    const a = std.testing.allocator;
    var atomizer = collapse.CellAtomizer.init(a);
    defer atomizer.deinit();

    var lattice: [CELL_COUNT + 1]u8 = [_]u8{0x5A} ** (CELL_COUNT + 1);
    lattice[CELL_COUNT] = 0xA5; // The one-byte tail must not enter a portal.
    try atomizer.atomizeLattice(&lattice);
    try std.testing.expectEqual(CELL_COUNT * 6, atomizer.portalCount());

    var carried: usize = 0;
    for (atomizer.getPortals()) |*portal| {
        const payload = portal.getPayload();
        carried += payload.len;
        for (payload) |b| try std.testing.expect(b != 0xA5);
    }
    try std.testing.expectEqual(CELL_COUNT, carried);

    var out: [8]u8 = undefined;
    const n = try atomizer.reassembleCell(14, 14, 14, &out);
    try std.testing.expectEqual(@as(usize, 1), n);
    try std.testing.expectEqual(@as(u8, 0x5A), out[0]);
}

test "archive: recursive QR nest round-trips a dossier-scale payload" {
    const a = std.testing.allocator;
    const blob = try dossierBlob(a, 8192); // forces subtree levels
    defer a.free(blob);
    var tree = collapse.qr_nest.NestTree.init(a);
    defer tree.deinit();
    try tree.build(blob);
    const got = try tree.extract(a);
    defer a.free(got);
    try std.testing.expectEqualSlices(u8, blob, got);
}

test "archive: RMSY container round-trips desk state byte-exact" {
    const a = std.testing.allocator;
    const blob = try dossierBlob(a, 4096);
    defer a.free(blob);
    const container = try compress.compress(a, blob, .{
        .lattice_level = 5,
        .use_dedup = true,
        .qubit_config = 1,
        .use_turboquant = false,
        .tq_bits = 4,
    });
    defer container.deinit();
    const got = try compress.decompress(a, container);
    defer a.free(got);
    try std.testing.expectEqualSlices(u8, blob, got);
}

test "archive: lattice page serialize/deserialize preserves the e0 map" {
    const a = std.testing.allocator;
    const key = vfs.PageKey.init(5, 2, 9, 14);
    var page = vfs.LatticePage.init(key, 1_750_000_000_000);
    // Stamp deterministic node values.
    for (&page.nodes, 0..) |*n, i| {
        n.* = .{ .x = @intCast(i), .y = @intCast(i * 3), .z = @intCast(i % 15), .activation = @intCast(i % 256) };
    }
    const bytes = try page.serialize(a);
    defer a.free(bytes);
    const back = try vfs.LatticePage.deserialize(bytes, 1_750_000_000_000);
    try std.testing.expect(back.key.eql(page.key));
    try std.testing.expectEqualSlices(vfs.E0Node, &page.nodes, &back.nodes);

    const malformed = try a.alloc(u8, bytes.len + 1);
    defer a.free(malformed);
    @memcpy(malformed[0..bytes.len], bytes);
    malformed[bytes.len] = 0xFF;
    try std.testing.expectError(error.VFSTrailingBytes, vfs.LatticePage.deserialize(malformed, 1_750_000_000_000));
}

test "archive: VFS cache pins the flag page and evicts cold pages" {
    const a = std.testing.allocator;
    var cache = vfs.VFSCache.init(a, 4);
    defer cache.deinit();
    const flag_key = vfs.PageKey.init(5, 0, 0, 0);
    try cache.put(vfs.LatticePage.init(flag_key, 1));
    try std.testing.expect(cache.pin(flag_key));
    // Flood beyond capacity — the pinned page must survive.
    for (1..8) |i| {
        const k = vfs.PageKey.init(5, @intCast(i), 0, 0);
        try cache.put(vfs.LatticePage.init(k, @intCast(i + 1)));
    }
    try std.testing.expect(cache.get(flag_key, 100) != null);
}

test "archive: streaming ring pins hot levels and rings the rest" {
    const a = std.testing.allocator;
    var ring = try vstream.StreamingRing.init(a, 4, 8);
    defer ring.deinit();
    // Pin slots only cover levels < pin_count.
    const key = vfs.PageKey.init(2, 1, 1, 1);
    try ring.loadPinned(2, vfs.LatticePage.init(key, 0));
    try std.testing.expect(ring.get(2) != null);
    // Level beyond the pin set must load into the rolling ring instead.
    try std.testing.expectError(error.LevelNotPinned, ring.loadPinned(9, vfs.LatticePage.init(key, 0)));
    try ring.loadIntoRing(9, vfs.LatticePage.init(vfs.PageKey.init(9, 1, 1, 1), 0));
    try std.testing.expect(ring.get(9) != null);
    _ = ring.hitRate(); // f64 stat — boundary readout only
}

test "archive: agent state round-trips through lattice pages" {
    const a = std.testing.allocator;
    var bridge = vfs.VFSBridge.init(a);
    defer bridge.deinit();

    var acts: [421][7]i64 = undefined;
    for (&acts, 0..) |*row, i| {
        for (row, 0..) |*v, ch| v.* = @as(i64, @intCast(i)) * 7 + @as(i64, @intCast(ch));
    }
    const tokens = [_]u32{ 11, 22, 33 };
    try bridge.saveAgentState(&acts, 0xDEAD_BEEF, 300, 290, &tokens);

    var out: [421][7]i64 = undefined;
    const state = (try bridge.loadAgentState(&out)).?;
    defer a.free(state.output_tokens);
    try std.testing.expectEqual(@as(u64, 0xDEAD_BEEF), state.cycle);
    try std.testing.expectEqual(@as(i64, 300), state.temperature);
    try std.testing.expectEqual(@as(i64, 290), state.base_temp);
    try std.testing.expectEqualSlices(i64, &acts[100], &out[100]);
}

test "archive: agent state validates shape and refuses forged token count" {
    const a = std.testing.allocator;
    var bridge = vfs.VFSBridge.init(a);
    defer bridge.deinit();

    var acts: [vfs.E0_NODE_COUNT][7]i64 = [_][7]i64{[_]i64{0} ** 7} ** vfs.E0_NODE_COUNT;
    var short_acts: [vfs.E0_NODE_COUNT - 1][7]i64 = [_][7]i64{[_]i64{0} ** 7} ** (vfs.E0_NODE_COUNT - 1);
    var too_many_tokens: [vfs.E0_NODE_COUNT - 3]u32 = [_]u32{0} ** (vfs.E0_NODE_COUNT - 3);

    try std.testing.expectError(error.VFSInvalidAgentState, bridge.saveAgentState(&short_acts, 1, 300, 290, &.{}));
    try std.testing.expectError(error.VFSTooManyOutputTokens, bridge.saveAgentState(&acts, 1, 300, 290, &too_many_tokens));
    try std.testing.expectEqual(@as(usize, 0), bridge.store.pageCount());

    var max_tokens: [vfs.E0_NODE_COUNT - 4]u32 = undefined;
    for (&max_tokens, 0..) |*t, i| t.* = @intCast(i);
    try bridge.saveAgentState(&acts, 7, 300, 290, &max_tokens);
    const first_stats = bridge.cacheStats();
    try std.testing.expectEqual(@as(usize, 8), first_stats.stored);

    // Replacing all eight pages must not double-count stored bytes.
    try bridge.saveAgentState(&acts, 7, 300, 290, &max_tokens);
    const second_stats = bridge.cacheStats();
    try std.testing.expectEqual(first_stats.stored, second_stats.stored);
    try std.testing.expectEqual(first_stats.stored_bytes, second_stats.stored_bytes);

    var out: [vfs.E0_NODE_COUNT][7]i64 = undefined;
    const state = (try bridge.loadAgentState(&out)).?;
    defer a.free(state.output_tokens);
    try std.testing.expectEqualSlices(u32, &max_tokens, state.output_tokens);

    const meta_key = vfs.PageKey.init(vfs.VFSBridge.AGENT_STATE_LEVEL, 7, 0, 0);
    var forged = (try bridge.readDirect(meta_key)).?;
    forged.nodes[3].x = vfs.E0_NODE_COUNT - 3;
    try bridge.writeDirect(meta_key, forged);
    try std.testing.expectError(error.VFSInvalidAgentState, bridge.loadAgentState(&out));

    bridge.clearAgentState();
    const cleared_stats = bridge.cacheStats();
    try std.testing.expectEqual(@as(usize, 0), cleared_stats.stored);
    try std.testing.expectEqual(@as(usize, 0), cleared_stats.stored_bytes);
}

test "archive: node registry tracks fleet peers with heartbeat liveness" {
    const a = std.testing.allocator;
    var reg = vdist.NodeRegistry.init(a, 1);
    defer reg.deinit();
    try reg.addNode(2, "sheraton");
    try reg.addNode(3, "fano001");
    reg.tick(1000);
    reg.heartbeat(2); // node 2 checks in at clock 1000
    // Node 3 goes silent: at clock 3000 it is 3000ms stale (degraded band)
    // while node 2 is only 2000ms stale (still online).
    reg.tick(2000);
    try std.testing.expect(reg.isOnline(2));
    try std.testing.expect(!reg.isOnline(3));
}
