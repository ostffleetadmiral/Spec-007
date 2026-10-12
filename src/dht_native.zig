//! dht_native.zig — the Continuity DHT, native. T7 of the retro-dev
//! translation: the manifest's *cited* substrate becomes the *wired* one.
//!
//! Same store, same wire, same verdicts as tools/dht-fs.mjs — a twin, not
//! a fork. Every on-disk byte matches the JS path: sha256 content
//! addressing, XOR-256 Kademlia ordering, ed25519 fleet-service sigs over
//! JSON.stringify-exact canon, indent-2 record files, compact kind-index,
//! JSONL audit. Read side verifies on every read — byte-identical heads
//! reuse a verified verdict; a tampered byte changes the content hash and
//! forces full re-verify (never stale trust).
//!
//! Substrate wiring (deps/qstar-vfs/src/vfs_distributed.zig):
//!   - NodeRegistry        — lane liveness (lane dir probe → heartbeat)
//!   - Placement + quorum  — XOR-closest ordering fills the substrate's
//!                           Placement; checkQuorum(.all) enforces the
//!                           JS write-all-k contract
//!   - findFetchNode       — serving-lane selection inside placement
//! The DHT's declared routing metric stays xor-256 (manifest
//! routing_metric) — the substrate supplies liveness/quorum/fetch
//! selection, not a foreign placement metric.
//!
//! Wire: ops ride the sealed 136-B FANO envelope (src/spec008_seal.zig).
//! Request stream = [op][args], reply stream = [status][data], framed at
//! 63 B/envelope with a more-flag — see dhtd.zig for the socket loop.
//!
//! Integer-only: sha256, XOR, ed25519 and u64 counters — no floats
//! anywhere. JSON floats are transcoded by a V8-shape emitter so canon
//! stays bit-exact with JSON.stringify.

const std = @import("std");
const seal_mod = @import("spec008_seal");
const vfs = @import("vfs_distributed");

const Sha256 = std.crypto.hash.sha2.Sha256;
const Ed25519 = std.crypto.sign.Ed25519;

pub const CHUNK_BYTES: usize = 65536;
pub const K_REPLICAS: u8 = 3;
pub const HEAD_LRU_CAP: usize = 512;
pub const MAX_STREAM: usize = 4 * 1024 * 1024;

pub const SPKI_PREFIX = [12]u8{ 0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00 };
pub const PKCS8_PREFIX = [16]u8{ 0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20 };

pub const Op = enum(u8) {
    ping = 0x00,
    stat = 0x01,
    lanes = 0x02,
    put_file = 0x03,
    get_file = 0x04,
    providers = 0x05,
    record_put = 0x06,
    record_get = 0x07,
    record_query = 0x08,
    heartbeat = 0x09,
    _,
};

pub const Status = enum(u8) {
    ok = 0,
    not_found = 1,
    tampered = 2,
    sig_refused = 3,
    clearance_refused = 4,
    bad_request = 5,
    store_error = 6,
    oversize = 7,
    chunk_missing = 8,
    bad_seal = 9,
};

pub fn shaHex(data: []const u8) [64]u8 {
    var h: [32]u8 = undefined;
    Sha256.hash(data, &h, .{});
    var out: [64]u8 = undefined;
    _ = std.fmt.bufPrint(&out, "{s}", .{std.fmt.fmtSliceHexLower(&h)}) catch unreachable;
    return out;
}

pub fn shaBytes(data: []const u8) [32]u8 {
    var h: [32]u8 = undefined;
    Sha256.hash(data, &h, .{});
    return h;
}

/// XOR distance + big-endian compare — the DHT's declared xor-256 metric
/// (identical to distance()/closest() in dht-fs.mjs). Returns -1/0/1.
fn distCmp(a_id: *const [32]u8, b_id: *const [32]u8, key: *const [32]u8) i8 {
    for (0..32) |i| {
        const da = a_id[i] ^ key[i];
        const db = b_id[i] ^ key[i];
        if (da != db) return if (da < db) -1 else 1;
    }
    return 0;
}

fn nodeId(lane: []const u8) [32]u8 {
    return shaBytes(lane);
}

/// ------------------------------------------------------------------
/// JS-exact JSON emitters. The signature canon is JSON.stringify(rec)
/// over a fixed key order — one byte off and every sig diverges. Zig's
/// std.json.stringify prints floats in exponent form (1.5e0) where V8
/// prints 1.5; number emission is written by hand below. Escapes match
/// JSON.stringify: \b \f \n \r \t, \u00xx lowercase for C0, UTF-8 raw.
/// ------------------------------------------------------------------
pub fn writeJsString(w: anytype, s: []const u8) !void {
    try w.writeByte('"');
    for (s) |c| {
        switch (c) {
            '"' => try w.writeAll("\\\""),
            '\\' => try w.writeAll("\\\\"),
            0x08 => try w.writeAll("\\b"),
            0x09 => try w.writeAll("\\t"),
            0x0a => try w.writeAll("\\n"),
            0x0c => try w.writeAll("\\f"),
            0x0d => try w.writeAll("\\r"),
            else => {
                if (c < 0x20) {
                    try w.print("\\u{x:0>4}", .{c});
                } else {
                    try w.writeByte(c);
                }
            },
        }
    }
    try w.writeByte('"');
}

/// V8 Number::toString shape. Zig `{e}` already emits the shortest
/// round-trip digits; we reparse mantissa+exponent and re-format under
/// the ECMA rules (decimal if -6 < n <= 21, else scientific).
fn writeJsNumber(w: anytype, f: f64) !void {
    if (std.math.isNan(f) or std.math.isInf(f)) return w.writeAll("null");
    if (f == 0) return w.writeAll("0");
    const neg = f < 0;
    const a = @abs(f);
    var buf: [64]u8 = undefined;
    const s = std.fmt.bufPrint(&buf, "{e}", .{a}) catch unreachable;
    // s = D[.DDD]e[-]X — extract digits and decimal exponent n where
    // value = 0.digits * 10^n  (n = sci_exp + 1)
    const epos = std.mem.indexOfScalar(u8, s, 'e').?;
    var digits_buf: [32]u8 = undefined;
    var nd: usize = 0;
    for (s[0..epos]) |c| {
        if (c != '.') {
            digits_buf[nd] = c;
            nd += 1;
        }
    }
    const sci_exp = std.fmt.parseInt(i32, s[epos + 1 ..], 10) catch unreachable;
    const digits = digits_buf[0..nd];
    const n: i32 = sci_exp + 1;
    const k: i32 = @intCast(nd);
    if (neg) try w.writeByte('-');
    if (k <= n and n <= 21) {
        try w.writeAll(digits);
        try w.writeByteNTimes('0', @intCast(n - k));
    } else if (0 < n and n <= 21) {
        const ni: usize = @intCast(n);
        try w.writeAll(digits[0..ni]);
        try w.writeByte('.');
        try w.writeAll(digits[ni..]);
    } else if (-6 < n and n <= 0) {
        try w.writeAll("0.");
        try w.writeByteNTimes('0', @intCast(-n));
        try w.writeAll(digits);
    } else {
        try w.writeByte(digits[0]);
        if (nd > 1) {
            try w.writeByte('.');
            try w.writeAll(digits[1..]);
        }
        try w.writeByte('e');
        const m = n - 1;
        if (m >= 0) try w.writeByte('+');
        try w.print("{d}", .{m});
    }
}

/// Compact JSON.stringify(value) — object key order preserved (parse
/// order in std.json, insertion order in V8 — both keep source order).
pub fn writeJsJson(w: anytype, v: std.json.Value) anyerror!void {
    switch (v) {
        .null => try w.writeAll("null"),
        .bool => |b| try w.writeAll(if (b) "true" else "false"),
        .integer => |i| try w.print("{d}", .{i}),
        .float => |f| try writeJsNumber(w, f),
        .number_string => |s| {
            const f = std.fmt.parseFloat(f64, s) catch return w.writeAll(s);
            try writeJsNumber(w, f);
        },
        .string => |s| try writeJsString(w, s),
        .array => |arr| {
            try w.writeByte('[');
            for (arr.items, 0..) |item, i| {
                if (i > 0) try w.writeByte(',');
                try writeJsJson(w, item);
            }
            try w.writeByte(']');
        },
        .object => |obj| {
            try w.writeByte('{');
            var it = obj.iterator();
            var first = true;
            while (it.next()) |e| {
                if (!first) try w.writeByte(',');
                first = false;
                try writeJsString(w, e.key_ptr.*);
                try w.writeByte(':');
                try writeJsJson(w, e.value_ptr.*);
            }
            try w.writeByte('}');
        },
    }
}

/// JSON.stringify(v, null, 2) — the record/providers on-disk form.
fn writeJsJsonPretty(w: anytype, v: std.json.Value, depth: usize) anyerror!void {
    switch (v) {
        .array => |arr| {
            if (arr.items.len == 0) return w.writeAll("[]");
            try w.writeByte('[');
            for (arr.items, 0..) |item, i| {
                if (i > 0) try w.writeByte(',');
                try w.writeByte('\n');
                try w.writeByteNTimes(' ', (depth + 1) * 2);
                try writeJsJsonPretty(w, item, depth + 1);
            }
            try w.writeByte('\n');
            try w.writeByteNTimes(' ', depth * 2);
            try w.writeByte(']');
        },
        .object => |obj| {
            if (obj.count() == 0) return w.writeAll("{}");
            try w.writeByte('{');
            var it = obj.iterator();
            var first = true;
            while (it.next()) |e| {
                if (!first) try w.writeByte(',');
                first = false;
                try w.writeByte('\n');
                try w.writeByteNTimes(' ', (depth + 1) * 2);
                try writeJsString(w, e.key_ptr.*);
                try w.writeAll(": ");
                try writeJsJsonPretty(w, e.value_ptr.*, depth + 1);
            }
            try w.writeByte('\n');
            try w.writeByteNTimes(' ', depth * 2);
            try w.writeByte('}');
        },
        else => try writeJsJson(w, v),
    }
}

/// The signature canon: fixed key order, sig/sig_kid excluded — byte
/// identical to recCanon() in dht-fs.mjs.
pub fn writeCanon(w: anytype, rec: std.json.Value) !void {
    const obj = rec.object;
    try w.writeByte('{');
    const fields = [_][]const u8{ "id", "kind", "name", "version", "prev", "author", "clearance", "body", "sha256" };
    for (fields, 0..) |name, i| {
        if (i > 0) try w.writeByte(',');
        try w.print("\"{s}\":", .{name});
        const v = obj.get(name) orelse std.json.Value.null;
        try writeJsJson(w, v);
    }
    try w.writeByte('}');
}

/// ISO-8601 UTC timestamp for the audit log (YYYY-MM-DDTHH:MM:SS.mmmZ).
fn isoNow(buf: *[32]u8) []const u8 {
    const ms: u64 = @intCast(std.time.milliTimestamp());
    const secs = ms / 1000;
    const rem = ms % 1000;
    const ep = std.time.epoch.EpochSeconds{ .secs = secs };
    const day = ep.getEpochDay();
    const yd = day.calculateYearDay();
    const md = yd.calculateMonthDay();
    const ds = ep.getDaySeconds();
    return std.fmt.bufPrint(buf, "{d:0>4}-{d:0>2}-{d:0>2}T{d:0>2}:{d:0>2}:{d:0>2}.{d:0>3}Z", .{
        yd.year,              md.month.numeric(),      md.day_index + 1,
        ds.getHoursIntoDay(), ds.getMinutesIntoHour(), ds.getSecondsIntoMinute(),
        rem,
    }) catch unreachable;
}

pub const Verdict = enum { ok, unsigned, body_hash, foreign_kid, bad_sig, bad_json };

/// ------------------------------------------------------------------
/// Store — mirrors dht-fs.mjs layout exactly.
/// ------------------------------------------------------------------
pub const Store = struct {
    alloc: std.mem.Allocator,
    root: []const u8,
    lanes: [][]const u8,
    lane_ids: []const [32]u8, // nodeId per lane (sha256 of name)
    registry: vfs.NodeRegistry,
    sk: ?Ed25519.KeyPair = null,
    pk: ?Ed25519.PublicKey = null,
    pk_b64: ?[]const u8 = null,
    last_probe_ms: u64 = 0,
    lru_map: std.StringHashMap(*LruNode),
    lru_list: std.DoublyLinkedList(HeadEntry),
    lru_arena: std.heap.ArenaAllocator,

    // verified-head residency — the JS LRU twin (M4). Key: head path.
    const HeadEntry = struct {
        bytes_hash: [32]u8,
        verdict: Verdict,
        // parsed record kept as arena'd bytes + extracted fields
        rec_json: ?[]const u8, // raw head bytes (reply needs them verbatim)
        rec: ?std.json.Value, // parsed value for canon/meta
        arena_state: ?*std.heap.ArenaAllocator,
    };
    const LruNode = std.DoublyLinkedList(HeadEntry).Node;

    pub fn init(alloc: std.mem.Allocator, root: []const u8, lanes: []const []const u8) !*Store {
        const s = try alloc.create(Store);
        errdefer alloc.destroy(s);
        const lanes_copy = try alloc.alloc([]const u8, lanes.len);
        const ids = try alloc.alloc([32]u8, lanes.len);
        for (lanes, 0..) |l, i| {
            lanes_copy[i] = try alloc.dupe(u8, l);
            ids[i] = nodeId(l);
        }
        // registry: node 0 = the daemon itself; lanes are nodes 1..N
        var reg = vfs.NodeRegistry.init(alloc, 0);
        for (lanes, 0..) |l, i| {
            try reg.addNode(@intCast(i + 1), l);
        }
        s.* = .{
            .alloc = alloc,
            .root = try alloc.dupe(u8, root),
            .lanes = lanes_copy,
            .lane_ids = ids,
            .registry = reg,
            .lru_map = std.StringHashMap(*LruNode).init(alloc),
            .lru_list = .{},
            .lru_arena = std.heap.ArenaAllocator.init(alloc),
        };
        s.loadKeys() catch {};
        return s;
    }

    fn join(self: *Store, parts: []const []const u8) ![]const u8 {
        return std.fs.path.join(self.alloc, parts);
    }

    fn laneDir(self: *Store, lane: []const u8) ![]const u8 {
        return self.join(&.{ self.root, "lanes", lane });
    }

    /// Lane liveness probe → substrate heartbeat. A lane is online iff its
    /// store dir exists (the JS sweep marks churn by renaming the dir —
    /// same observable). Called once per request batch, not per file.
    pub fn probeLiveness(self: *Store) void {
        const now: u64 = @intCast(@max(0, std.time.milliTimestamp()));
        const dt = now -| self.last_probe_ms;
        self.registry.tick(dt);
        self.last_probe_ms = now;
        for (self.lanes, 0..) |l, i| {
            const d = self.laneDir(l) catch continue;
            defer self.alloc.free(d);
            if (std.fs.cwd().access(d, .{})) |_| {
                self.registry.heartbeat(@intCast(i + 1));
            } else |_| {}
        }
    }

    fn laneIndex(self: *Store, lane: []const u8) ?usize {
        for (self.lanes, 0..) |l, i| if (std.mem.eql(u8, l, lane)) return i;
        return null;
    }

    /// XOR-closest lanes for key — full ordered index list (JS sorts all
    /// lanes then slices). Skips offline lanes when `online_only`.
    fn closestIdx(self: *Store, key: *const [32]u8, online_only: bool, buf: []usize) []usize {
        var n: usize = 0;
        for (0..self.lanes.len) |i| {
            if (online_only and !self.registry.isOnline(@intCast(i + 1))) continue;
            buf[n] = i;
            n += 1;
        }
        const Ctx = struct { key: [32]u8, ids: []const [32]u8 };
        const ctx = Ctx{ .key = key.*, .ids = self.lane_ids };
        std.mem.sort(usize, buf[0..n], ctx, struct {
            fn lessThan(c: Ctx, a: usize, b: usize) bool {
                return distCmp(&c.ids[a], &c.ids[b], &c.key) < 0;
            }
        }.lessThan);
        return buf[0..n];
    }

    /// Build the substrate Placement from the XOR-ordered lane list —
    /// primary = closest, replicas = next k-1. This is the wiring point:
    /// the DHT's xor-256 metric fills the substrate's placement struct.
    fn placementFor(self: *Store, key: *const [32]u8) vfs.Placement {
        var buf: [vfs.MAX_NODES]usize = undefined;
        const order = self.closestIdx(key, true, &buf);
        var p = vfs.Placement{
            .primary = self.registry.self_id,
            .replicas = [_]vfs.NodeId{0} ** vfs.MAX_REPLICAS,
            .replica_count = 0,
        };
        if (order.len == 0) return p;
        p.primary = @intCast(order[0] + 1);
        var rc: u8 = 0;
        for (order[1..]) |li| {
            if (rc >= @min(K_REPLICAS - 1, vfs.MAX_REPLICAS)) break;
            p.replicas[rc] = @intCast(li + 1);
            rc += 1;
        }
        p.replica_count = rc;
        return p;
    }

    fn loadKeys(self: *Store) !void {
        const skp = try self.join(&.{ self.root, "keys", "fleet-service.sk" });
        defer self.alloc.free(skp);
        const pkp = try self.join(&.{ self.root, "keys", "fleet-service.pk" });
        defer self.alloc.free(pkp);
        const pk_der = std.fs.cwd().readFileAlloc(self.alloc, pkp, 1 << 16) catch return;
        defer self.alloc.free(pk_der);
        if (pk_der.len != 44 or !std.mem.eql(u8, pk_der[0..12], &SPKI_PREFIX)) return;
        self.pk = Ed25519.PublicKey.fromBytes(pk_der[12..44].*) catch null;
        const b64 = try self.alloc.alloc(u8, std.base64.standard.Encoder.calcSize(pk_der.len));
        _ = std.base64.standard.Encoder.encode(b64, pk_der);
        self.pk_b64 = b64;
        const sk_der = std.fs.cwd().readFileAlloc(self.alloc, skp, 1 << 16) catch return;
        defer self.alloc.free(sk_der);
        if (sk_der.len != 48 or !std.mem.eql(u8, sk_der[0..16], &PKCS8_PREFIX)) return;
        self.sk = Ed25519.KeyPair.create(sk_der[16..48].*) catch null;
    }

    /// ---- audit.log — identical JSONL row shape to the JS twin ----
    fn audit(self: *Store, lane: []const u8, op: []const u8, key: []const u8, result: []const u8, extra: []const u8) void {
        const d = self.laneDir(lane) catch return;
        defer self.alloc.free(d);
        std.fs.cwd().makePath(d) catch return;
        const p = self.join(&.{ d, "audit.log" }) catch return;
        defer self.alloc.free(p);
        const f = std.fs.cwd().createFile(p, .{ .mode = 0o666, .truncate = false }) catch return;
        defer f.close();
        f.seekFromEnd(0) catch return;
        var ts: [32]u8 = undefined;
        var line = std.ArrayList(u8).init(self.alloc);
        defer line.deinit();
        const w = line.writer();
        w.writeAll("{\"ts\":") catch return;
        writeJsString(w, isoNow(&ts)) catch return;
        w.print(",\"op\":", .{}) catch return;
        writeJsString(w, op) catch return;
        w.print(",\"key\":", .{}) catch return;
        writeJsString(w, key) catch return;
        w.print(",\"result\":", .{}) catch return;
        writeJsString(w, result) catch return;
        if (extra.len > 0) w.writeAll(extra) catch return;
        w.writeAll("}\n") catch return;
        f.writeAll(line.items) catch return;
    }

    /// ---- block layer ----
    fn blockPath(self: *Store, lane: []const u8, cid: []const u8) ![]const u8 {
        return self.join(&.{ self.root, "lanes", lane, "blocks", cid[0..2], cid[2..4], cid });
    }

    fn pinProvider(self: *Store, lane: []const u8, cid_hex: []const u8) !void {
        const d = try self.laneDir(lane);
        defer self.alloc.free(d);
        try std.fs.cwd().makePath(d);
        const p = try self.join(&.{ d, "providers.json" });
        defer self.alloc.free(p);
        var pinned = std.ArrayList([]const u8).init(self.alloc);
        defer pinned.deinit();
        if (std.fs.cwd().readFileAlloc(self.alloc, p, 1 << 20)) |raw| {
            defer self.alloc.free(raw);
            var parsed = std.json.parseFromSlice(std.json.Value, self.alloc, raw, .{}) catch null;
            if (parsed) |*pv| {
                defer pv.deinit();
                if (pv.value.object.get("pinned")) |arr| {
                    for (arr.array.items) |item| {
                        try pinned.append(try self.alloc.dupe(u8, item.string));
                    }
                }
            }
        } else |_| {}
        for (pinned.items) |c| if (std.mem.eql(u8, c, cid_hex)) return;
        try pinned.append(cid_hex);
        var out = std.ArrayList(u8).init(self.alloc);
        defer out.deinit();
        try out.writer().writeAll("{\n  \"pinned\": [");
        for (pinned.items, 0..) |c, i| {
            if (i > 0) try out.writer().writeAll(",");
            try out.writer().writeAll("\n    ");
            try writeJsString(out.writer(), c);
        }
        try out.writer().writeAll("\n  ]\n}\n");
        try std.fs.cwd().writeFile(.{ .sub_path = p, .data = out.items });
    }

    fn storeBlock(self: *Store, lane: []const u8, data: []const u8) ![64]u8 {
        const cid = shaHex(data);
        const p = try self.blockPath(lane, &cid);
        defer self.alloc.free(p);
        if (std.fs.cwd().access(p, .{})) |_| {
            return cid; // content-addressed: write-once
        } else |_| {}
        try std.fs.cwd().makePath(std.fs.path.dirname(p).?);
        try std.fs.cwd().writeFile(.{ .sub_path = p, .data = data });
        return cid;
    }

    const ReadBlock = union(enum) { data: []u8, tampered, missing };

    fn readBlock(self: *Store, lane: []const u8, cid_hex: []const u8) !ReadBlock {
        const p = try self.blockPath(lane, cid_hex);
        defer self.alloc.free(p);
        const data = std.fs.cwd().readFileAlloc(self.alloc, p, MAX_STREAM) catch return .missing;
        if (!std.mem.eql(u8, &shaHex(data), cid_hex)) {
            self.alloc.free(data);
            return .tampered;
        }
        return .{ .data = data };
    }

    /// put() — chunk, sha256-address, replicate to k XOR-closest lanes.
    /// Identical semantics to dht-fs.mjs: manifest object stored under its
    /// own hash; audit on each storing lane + the origin lane.
    pub fn putFile(self: *Store, origin: usize, data: []const u8) !struct { cid: [64]u8, size: usize, chunks: usize, acks: u8 } {
        var chunks = std.ArrayList([]const u8).init(self.alloc);
        defer chunks.deinit();
        if (data.len == 0) {
            try chunks.append(data[0..0]);
        } else {
            var off: usize = 0;
            while (off < data.len) : (off += CHUNK_BYTES)
                try chunks.append(data[off..@min(off + CHUNK_BYTES, data.len)]);
        }
        var mb = std.ArrayList(u8).init(self.alloc);
        defer mb.deinit();
        const mw = mb.writer();
        try mw.writeAll("{\"kind\":\"dht-file\",\"size\":");
        try mw.print("{d}", .{data.len});
        try mw.writeAll(",\"chunks\":[");
        var cids = try self.alloc.alloc([64]u8, chunks.items.len);
        defer self.alloc.free(cids);
        for (chunks.items, 0..) |c, i| {
            cids[i] = shaHex(c);
            if (i > 0) try mw.writeByte(',');
            try mw.writeByte('"');
            try mw.writeAll(&cids[i]);
            try mw.writeByte('"');
        }
        try mw.writeAll("]}");
        const file_cid = shaHex(mb.items);

        var sbuf: [vfs.MAX_NODES]usize = undefined;
        var acks: u8 = 0;
        for (chunks.items, 0..) |c, i| {
            var cid_bytes: [32]u8 = undefined;
            _ = try std.fmt.hexToBytes(&cid_bytes, &cids[i]);
            const order = self.closestIdx(&cid_bytes, false, &sbuf);
            var placed: u8 = 0;
            for (order) |li| {
                if (placed >= K_REPLICAS) break;
                const lane = self.lanes[li];
                _ = try self.storeBlock(lane, c);
                try self.pinProvider(lane, &cids[i]);
                self.audit(lane, "put-block", cids[i][0..16], "stored", try self.auditExtra("{s}", self.lanes[origin]));
                placed += 1;
            }
            acks += placed;
        }
        var fid_bytes: [32]u8 = undefined;
        _ = try std.fmt.hexToBytes(&fid_bytes, &file_cid);
        const morder = self.closestIdx(&fid_bytes, false, &sbuf);
        var macks: u8 = 0;
        for (morder) |li| {
            if (macks >= K_REPLICAS) break;
            const lane = self.lanes[li];
            _ = try self.storeBlock(lane, mb.items);
            try self.pinProvider(lane, &file_cid);
            self.audit(lane, "put-manifest", file_cid[0..16], "stored", try self.auditExtra("{s}", self.lanes[origin]));
            macks += 1;
        }
        self.audit(self.lanes[origin], "put", file_cid[0..16], "accepted", try std.fmt.allocPrint(self.alloc, ",\"size\":{d},\"chunks\":{d},\"replicas\":{d}", .{ data.len, chunks.items.len, K_REPLICAS }));
        return .{ .cid = file_cid, .size = data.len, .chunks = chunks.items.len, .acks = macks };
    }

    fn auditExtra(self: *Store, comptime fmt: []const u8, lane: []const u8) ![]const u8 {
        const s = try std.fmt.allocPrint(self.alloc, ",\"from\":\"" ++ fmt ++ "\"", .{lane});
        return s;
    }

    /// get() — walk lanes in XOR order, hash-verify every block; a
    /// tampered replica is refused + audited and the next replica serves.
    pub fn getFile(self: *Store, cid_hex: []const u8) !struct { st: Status, data: ?[]u8, served_by: ?usize, replicas: usize, tampered: u8, size: usize } {
        var cid_bytes: [32]u8 = undefined;
        _ = try std.fmt.hexToBytes(&cid_bytes, cid_hex);
        var sbuf: [vfs.MAX_NODES]usize = undefined;
        self.probeLiveness();
        const order = self.closestIdx(&cid_bytes, true, &sbuf);
        var tampered: u8 = 0;
        var manifest_bytes: ?[]u8 = null;
        var served_by: ?usize = null;
        for (order) |li| {
            const rb = try self.readBlock(self.lanes[li], cid_hex);
            switch (rb) {
                .tampered => {
                    tampered += 1;
                    self.audit(self.lanes[li], "get-block", cid_hex[0..16], "integrity-refused", "");
                    continue;
                },
                .data => |b| {
                    manifest_bytes = b;
                    served_by = li;
                    break;
                },
                .missing => continue,
            }
        }
        if (manifest_bytes == null) return .{ .st = .not_found, .data = null, .served_by = null, .replicas = 0, .tampered = tampered, .size = 0 };
        defer self.alloc.free(manifest_bytes.?);
        var parsed = std.json.parseFromSlice(std.json.Value, self.alloc, manifest_bytes.?, .{}) catch
            return .{ .st = .store_error, .data = null, .served_by = null, .replicas = 0, .tampered = tampered, .size = 0 };
        defer parsed.deinit();
        const chunks_v = parsed.value.object.get("chunks") orelse
            return .{ .st = .store_error, .data = null, .served_by = null, .replicas = 0, .tampered = tampered, .size = 0 };
        const size_v = parsed.value.object.get("size") orelse std.json.Value{ .integer = 0 };
        var out = std.ArrayList(u8).init(self.alloc);
        var served = std.AutoHashMap(usize, void).init(self.alloc);
        defer served.deinit();
        for (chunks_v.array.items) |cv| {
            const ccid = cv.string;
            var got = false;
            for (order) |li| {
                const rb = try self.readBlock(self.lanes[li], ccid);
                switch (rb) {
                    .tampered => {
                        tampered += 1;
                        self.audit(self.lanes[li], "get-block", ccid[0..16], "integrity-refused", "");
                        continue;
                    },
                    .data => |b| {
                        try out.appendSlice(b);
                        self.alloc.free(b);
                        try served.put(li, {});
                        got = true;
                        break;
                    },
                    .missing => continue,
                }
            }
            if (!got) {
                out.deinit();
                return .{ .st = .chunk_missing, .data = null, .served_by = null, .replicas = 0, .tampered = tampered, .size = 0 };
            }
        }
        if (served_by) |sb|
            self.audit(self.lanes[sb], "get", cid_hex[0..16], "resolved", try std.fmt.allocPrint(self.alloc, ",\"blocks\":{d}", .{served.count()}));
        return .{ .st = .ok, .data = try out.toOwnedSlice(), .served_by = served_by, .replicas = served.count(), .tampered = tampered, .size = @intCast(size_v.integer) };
    }

    /// providers(cid) — lanes pinning a cid, manifest order.
    pub fn providersList(self: *Store, cid_hex: []const u8, out: *std.ArrayList(usize)) !void {
        for (self.lanes, 0..) |l, i| {
            const d = try self.laneDir(l);
            defer self.alloc.free(d);
            const p = try self.join(&.{ d, "providers.json" });
            defer self.alloc.free(p);
            const raw = std.fs.cwd().readFileAlloc(self.alloc, p, 1 << 20) catch continue;
            defer self.alloc.free(raw);
            var parsed = std.json.parseFromSlice(std.json.Value, self.alloc, raw, .{}) catch continue;
            defer parsed.deinit();
            if (parsed.value.object.get("pinned")) |arr| {
                for (arr.array.items) |item| {
                    if (std.mem.eql(u8, item.string, cid_hex)) {
                        try out.append(i);
                        break;
                    }
                }
            }
        }
    }

    /// ---- record layer (IDaaS) ----
    fn recordDir(self: *Store, lane: []const u8, id: []const u8) ![]const u8 {
        return self.join(&.{ self.root, "lanes", lane, "records", id });
    }

    /// Latest version filename in a record dir (lexicographic max —
    /// matches JS .sort().pop() on zero-padded names).
    fn headName(self: *Store, rd: []const u8) !?[]const u8 {
        var dir = std.fs.cwd().openDir(rd, .{ .iterate = true }) catch return null;
        defer dir.close();
        var best: ?[]const u8 = null;
        var it = dir.iterate();
        while (try it.next()) |e| {
            if (e.kind != .file or !std.mem.endsWith(u8, e.name, ".json")) continue;
            if (best == null or std.mem.order(u8, e.name, best.?) == .gt)
                best = try self.alloc.dupe(u8, e.name);
        }
        return best;
    }

    /// verifyRecord — identical verdict classes to the JS twin.
    fn verifyRecord(self: *Store, rec: std.json.Value) Verdict {
        const obj = rec.object;
        if (obj.get("sig") == null or obj.get("sig_kid") == null) return .unsigned;
        const body = obj.get("body") orelse return .bad_json;
        var canon_body = std.ArrayList(u8).init(self.alloc);
        defer canon_body.deinit();
        writeJsJson(canon_body.writer(), body) catch return .bad_json;
        const bh = shaHex(canon_body.items);
        const declared = (obj.get("sha256") orelse return .bad_json).string;
        if (!std.mem.eql(u8, &bh, declared)) return .body_hash;
        if (!std.mem.eql(u8, (obj.get("sig_kid") orelse unreachable).string, "fleet-service")) return .foreign_kid;
        if (self.pk == null) return .bad_sig;
        var canon = std.ArrayList(u8).init(self.alloc);
        defer canon.deinit();
        writeCanon(canon.writer(), rec) catch return .bad_json;
        const sig_b64 = (obj.get("sig") orelse unreachable).string;
        var sig_bytes: [Ed25519.Signature.encoded_length]u8 = undefined;
        std.base64.standard.Decoder.decode(&sig_bytes, sig_b64) catch return .bad_sig;
        const sig = Ed25519.Signature.fromBytes(sig_bytes);
        sig.verify(canon.items, self.pk.?) catch return .bad_sig;
        return .ok;
    }

    /// loadVerifiedHead — content-hash-keyed residency, byte-exact twin
    /// of the JS loadVerifiedHead. Disk read stays (verify-on-read);
    /// identical bytes reuse the verdict + parse, changed bytes re-verify.
    const HeadResult = struct { rec: ?std.json.Value, verdict: Verdict, raw: ?[]const u8, name: []const u8 };

    fn loadVerifiedHead(self: *Store, fp: []const u8, name: []const u8) !HeadResult {
        const bytes = try std.fs.cwd().readFileAlloc(self.alloc, fp, MAX_STREAM);
        const bh = shaBytes(bytes);
        if (self.lru_map.get(fp)) |node| {
            if (std.mem.eql(u8, &node.data.bytes_hash, &bh)) {
                self.lru_list.remove(node);
                self.lru_list.append(node); // MRU
                self.alloc.free(bytes);
                return .{ .rec = node.data.rec, .verdict = node.data.verdict, .raw = node.data.rec_json, .name = name };
            }
            _ = self.lru_map.remove(fp);
            self.lru_list.remove(node);
            if (node.data.arena_state) |a| {
                a.deinit();
                self.alloc.destroy(a);
            }
            self.alloc.destroy(node);
        }
        var verdict: Verdict = .bad_json;
        var rec: ?std.json.Value = null;
        var rec_arena: ?*std.heap.ArenaAllocator = null;
        blk: {
            rec_arena = try self.alloc.create(std.heap.ArenaAllocator);
            rec_arena.?.* = std.heap.ArenaAllocator.init(self.alloc);
            const parsed = std.json.parseFromSlice(std.json.Value, rec_arena.?.allocator(), bytes, .{}) catch break :blk;
            if (parsed.value != .object) break :blk;
            rec = parsed.value;
            verdict = self.verifyRecord(rec.?);
        }
        const node = try self.alloc.create(LruNode);
        node.* = .{ .data = .{ .bytes_hash = bh, .verdict = verdict, .rec_json = bytes, .rec = rec, .arena_state = rec_arena } };
        const key = try self.alloc.dupe(u8, fp);
        try self.lru_map.put(key, node);
        self.lru_list.append(node);
        if (self.lru_map.count() > HEAD_LRU_CAP) {
            const victim = self.lru_list.first.?;
            self.lru_list.remove(victim);
            // find + drop its map key
            var it = self.lru_map.iterator();
            while (it.next()) |e| {
                if (e.value_ptr.* == victim) {
                    self.alloc.free(e.key_ptr.*);
                    _ = self.lru_map.remove(e.key_ptr.*);
                    break;
                }
            }
            if (victim.data.arena_state) |a| {
                a.deinit();
                self.alloc.destroy(a);
            }
            self.alloc.free(victim.data.rec_json.?);
            self.alloc.destroy(victim);
        }
        return .{ .rec = rec, .verdict = verdict, .raw = bytes, .name = name };
    }

    /// recordPut — version chain + ed25519 sign + k-replicate + kind-index.
    /// Byte-exact with the JS twin's record file shape (indent-2 JSON).
    pub fn recordPut(self: *Store, author_lane: usize, kind: []const u8, name: []const u8, body_text: []const u8, clearance: u8) !struct { st: Status, id: [64]u8, version: u32 } {
        if (self.sk == null) return .{ .st = .store_error, .id = undefined, .version = 0 };
        var id_src = std.ArrayList(u8).init(self.alloc);
        defer id_src.deinit();
        try id_src.appendSlice(kind);
        try id_src.append(':');
        try id_src.appendSlice(name);
        const id = shaHex(id_src.items);
        var id_bytes: [32]u8 = undefined;
        _ = try std.fmt.hexToBytes(&id_bytes, &id);
        var sbuf: [vfs.MAX_NODES]usize = undefined;
        const order = self.closestIdx(&id_bytes, false, &sbuf);

        var body_arena = std.heap.ArenaAllocator.init(self.alloc);
        defer body_arena.deinit();
        const body_parsed = std.json.parseFromSlice(std.json.Value, body_arena.allocator(), body_text, .{}) catch
            return .{ .st = .bad_request, .id = id, .version = 0 };
        var body_canon = std.ArrayList(u8).init(self.alloc);
        defer body_canon.deinit();
        try writeJsJson(body_canon.writer(), body_parsed.value);
        const body_hash = shaHex(body_canon.items);

        var last_version: u32 = 0;
        var placed: u8 = 0;
        for (order) |li| {
            if (placed >= K_REPLICAS) break;
            const lane = self.lanes[li];
            const rd = try self.recordDir(lane, &id);
            defer self.alloc.free(rd);
            try std.fs.cwd().makePath(rd);
            // next version = max existing + 1 (numeric, like JS parseInt sort)
            var v: u32 = 1;
            {
                var dir = try std.fs.cwd().openDir(rd, .{ .iterate = true });
                defer dir.close();
                var it = dir.iterate();
                var maxv: u32 = 0;
                while (try it.next()) |e| {
                    if (!std.mem.endsWith(u8, e.name, ".json")) continue;
                    const stem = e.name[0 .. e.name.len - 5];
                    const n = std.fmt.parseInt(u32, stem, 10) catch continue;
                    if (n > maxv) maxv = n;
                }
                v = if (maxv > 0) maxv + 1 else 1;
            }
            if (v > last_version) last_version = v;
            // build the record object — field order fixed
            var recmap = std.json.ObjectMap.init(body_arena.allocator());
            try recmap.put("id", .{ .string = &id });
            try recmap.put("kind", .{ .string = kind });
            try recmap.put("name", .{ .string = name });
            try recmap.put("version", .{ .integer = @intCast(v) });
            try recmap.put("prev", if (v > 1) std.json.Value{ .integer = @intCast(v - 1) } else .null);
            try recmap.put("author", .{ .string = self.lanes[author_lane] });
            try recmap.put("clearance", .{ .integer = clearance });
            try recmap.put("body", body_parsed.value);
            try recmap.put("sha256", .{ .string = &body_hash });
            try recmap.put("sig_kid", .{ .string = "fleet-service" });
            var rec_v = std.json.Value{ .object = recmap };
            var canon = std.ArrayList(u8).init(self.alloc);
            defer canon.deinit();
            try writeCanon(canon.writer(), rec_v);
            const sig = try self.sk.?.sign(canon.items, null);
            const sig_bytes = sig.toBytes();
            var sig_b64: [std.base64.standard.Encoder.calcSize(64)]u8 = undefined;
            _ = std.base64.standard.Encoder.encode(&sig_b64, &sig_bytes);
            try rec_v.object.put("sig", .{ .string = &sig_b64 });
            // emit indent-2 identical to JSON.stringify(rec, null, 2)+"\n"
            var out = std.ArrayList(u8).init(self.alloc);
            defer out.deinit();
            try writeJsJsonPretty(out.writer(), rec_v, 0);
            try out.append('\n');
            const fp = try std.fmt.allocPrint(self.alloc, "{s}/{d:0>4}.json", .{ rd, v });
            defer self.alloc.free(fp);
            try std.fs.cwd().writeFile(.{ .sub_path = fp, .data = out.items });
            try self.kindIndexAdd(lane, kind, &id);
            placed += 1;
        }
        self.audit(self.lanes[author_lane], "record-put", id[0..16], "accepted", try std.fmt.allocPrint(self.alloc, ",\"kind\":{s},\"clearance\":{d}", .{ try self.jsonStr(kind), clearance }));
        return .{ .st = .ok, .id = id, .version = last_version };
    }

    fn jsonStr(self: *Store, s: []const u8) ![]const u8 {
        var b = std.ArrayList(u8).init(self.alloc);
        try writeJsString(b.writer(), s);
        return b.toOwnedSlice();
    }

    /// recordGet — walk lanes XOR-closest-first; sig-gate then
    /// clearance-gate, both audited. Identical verdict semantics.
    pub fn recordGet(self: *Store, id_hex: []const u8, reader: u8) !struct { st: Status, rec: ?std.json.Value, raw: ?[]const u8, versions: usize, lane: ?usize, detail: Verdict, need: u8 } {
        var id_bytes: [32]u8 = undefined;
        _ = try std.fmt.hexToBytes(&id_bytes, id_hex);
        var sbuf: [vfs.MAX_NODES]usize = undefined;
        self.probeLiveness();
        const order = self.closestIdx(&id_bytes, false, &sbuf);
        for (order) |li| {
            const lane = self.lanes[li];
            const rd = try self.recordDir(lane, id_hex);
            defer self.alloc.free(rd);
            const hn = (try self.headName(rd)) orelse continue;
            defer self.alloc.free(hn);
            const fp = try self.join(&.{ rd, hn });
            defer self.alloc.free(fp);
            var versions: usize = 0;
            {
                var dir = try std.fs.cwd().openDir(rd, .{ .iterate = true });
                defer dir.close();
                var it = dir.iterate();
                while (try it.next()) |e| {
                    if (std.mem.endsWith(u8, e.name, ".json")) versions += 1;
                }
            }
            const h = try self.loadVerifiedHead(fp, hn);
            if (h.rec == null or h.verdict != .ok) {
                self.audit(lane, "record-get", id_hex[0..16], "sig-refused", try std.fmt.allocPrint(self.alloc, ",\"reason\":\"{s}\"", .{@tagName(h.verdict)}));
                return .{ .st = .sig_refused, .rec = null, .raw = null, .versions = 0, .lane = null, .detail = h.verdict, .need = 0 };
            }
            const clearance: u8 = @intCast((h.rec.?.object.get("clearance") orelse continue).integer);
            if (clearance > reader) {
                self.audit(lane, "record-get", id_hex[0..16], "clearance-refused", try std.fmt.allocPrint(self.alloc, ",\"need\":{d},\"reader\":{d}", .{ clearance, reader }));
                return .{ .st = .clearance_refused, .rec = null, .raw = null, .versions = 0, .lane = null, .detail = .ok, .need = clearance };
            }
            const ver: u32 = @intCast((h.rec.?.object.get("version") orelse continue).integer);
            self.audit(lane, "record-get", id_hex[0..16], "resolved", try std.fmt.allocPrint(self.alloc, ",\"version\":{d}", .{ver}));
            return .{ .st = .ok, .rec = h.rec, .raw = h.raw, .versions = versions, .lane = li, .detail = .ok, .need = 0 };
        }
        return .{ .st = .not_found, .rec = null, .raw = null, .versions = 0, .lane = null, .detail = .ok, .need = 0 };
    }

    /// recordQuery — kind index when complete, else full scan + backfill
    /// (the JS accelerator contract: index answers ⊆ scan answers).
    pub fn recordQuery(self: *Store, kind: []const u8, reader: u8, results: *std.ArrayList(QueryRow)) !void {
        var seen = std.StringHashMap(void).init(self.alloc);
        defer seen.deinit();
        self.probeLiveness();
        for (self.lanes) |lane| {
            const ld = try self.laneDir(lane);
            defer self.alloc.free(ld);
            const rdir = try self.join(&.{ ld, "records" });
            defer self.alloc.free(rdir);
            const indexed = try self.kindIndexRead(lane, kind);
            if (indexed) |ids| {
                defer {
                    for (ids) |s| self.alloc.free(s);
                    self.alloc.free(ids);
                }
                for (ids) |id| {
                    if (seen.contains(id)) continue;
                    const rd = try self.join(&.{ rdir, id });
                    defer self.alloc.free(rd);
                    const hn = (try self.headName(rd)) orelse continue;
                    defer self.alloc.free(hn);
                    const fp = try self.join(&.{ rd, hn });
                    defer self.alloc.free(fp);
                    const h = self.loadVerifiedHead(fp, hn) catch continue;
                    try self.admitRow(lane, id, h, kind, reader, results, &seen);
                }
                continue;
            }
            // full scan + backfill complete index
            var dir = std.fs.cwd().openDir(rdir, .{ .iterate = true }) catch continue;
            defer dir.close();
            var kinds = std.StringArrayHashMap(std.ArrayList([]const u8)).init(self.alloc);
            defer {
                var it = kinds.iterator();
                while (it.next()) |e| {
                    for (e.value_ptr.items) |s| self.alloc.free(s);
                    e.value_ptr.deinit();
                }
                kinds.deinit();
            }
            var it = dir.iterate();
            while (try it.next()) |e| {
                if (e.kind != .directory) continue;
                const id = e.name;
                const rd = try self.join(&.{ rdir, id });
                defer self.alloc.free(rd);
                const hn = (try self.headName(rd)) orelse continue;
                defer self.alloc.free(hn);
                const fp = try self.join(&.{ rd, hn });
                defer self.alloc.free(fp);
                const h = self.loadVerifiedHead(fp, hn) catch continue;
                if (h.rec) |r| {
                    const rk = (r.object.get("kind") orelse continue).string;
                    const g = try kinds.getOrPut(rk);
                    if (!g.found_existing) g.value_ptr.* = std.ArrayList([]const u8).init(self.alloc);
                    try g.value_ptr.append(try self.alloc.dupe(u8, id));
                }
                try self.admitRow(lane, id, h, kind, reader, results, &seen);
            }
            self.kindIndexWriteAll(lane, &kinds) catch {};
        }
    }

    pub const QueryRow = struct { id: []const u8, kind: []const u8, name: []const u8, version: u32, author: []const u8, clearance: u8 };

    fn admitRow(self: *Store, lane: []const u8, id: []const u8, h: HeadResult, kind: []const u8, reader: u8, results: *std.ArrayList(QueryRow), seen: *std.StringHashMap(void)) !void {
        if (seen.contains(id)) return;
        if (h.verdict != .ok or h.rec == null) {
            try seen.put(try self.alloc.dupe(u8, id), {});
            self.audit(lane, "record-query", id[0..16], "sig-refused", "");
            return;
        }
        const r = h.rec.?.object;
        const rk = (r.get("kind") orelse return).string;
        const clearance: u8 = @intCast((r.get("clearance") orelse return).integer);
        if (!std.mem.eql(u8, rk, kind) or clearance > reader) return;
        try seen.put(try self.alloc.dupe(u8, id), {});
        try results.append(.{
            .id = try self.alloc.dupe(u8, id),
            .kind = try self.alloc.dupe(u8, rk),
            .name = try self.alloc.dupe(u8, (r.get("name") orelse return).string),
            .version = @intCast((r.get("version") orelse return).integer),
            .author = try self.alloc.dupe(u8, (r.get("author") orelse return).string),
            .clearance = clearance,
        });
    }

    /// ---- kind index — identical file + fallback semantics ----
    fn kindIndexPath(self: *Store, lane: []const u8) ![]const u8 {
        const d = try self.laneDir(lane);
        defer self.alloc.free(d);
        return self.join(&.{ d, "kind-index.json" });
    }

    fn kindIndexRead(self: *Store, lane: []const u8, kind: []const u8) !?[][]const u8 {
        const p = try self.kindIndexPath(lane);
        defer self.alloc.free(p);
        const raw = std.fs.cwd().readFileAlloc(self.alloc, p, 1 << 20) catch return null;
        defer self.alloc.free(raw);
        var parsed = std.json.parseFromSlice(std.json.Value, self.alloc, raw, .{}) catch return null;
        defer parsed.deinit();
        const complete_v = parsed.value.object.get("complete") orelse return null;
        if (!complete_v.bool) return null;
        const kinds_v = parsed.value.object.get("kinds") orelse return null;
        const arr = kinds_v.object.get(kind) orelse {
            const empty = try self.alloc.alloc([]const u8, 0);
            return empty;
        };
        var out = try self.alloc.alloc([]const u8, arr.array.items.len);
        for (arr.array.items, 0..) |item, i| out[i] = try self.alloc.dupe(u8, item.string);
        return out;
    }

    fn kindIndexAdd(self: *Store, lane: []const u8, kind: []const u8, id: []const u8) !void {
        const p = try self.kindIndexPath(lane);
        defer self.alloc.free(p);
        var kinds = std.StringArrayHashMap(std.ArrayList([]const u8)).init(self.alloc);
        defer {
            var it = kinds.iterator();
            while (it.next()) |e| {
                for (e.value_ptr.items) |s| self.alloc.free(s);
                e.value_ptr.deinit();
            }
            kinds.deinit();
        }
        if (std.fs.cwd().readFileAlloc(self.alloc, p, 1 << 20)) |raw| {
            defer self.alloc.free(raw);
            if (std.json.parseFromSlice(std.json.Value, self.alloc, raw, .{})) |*parsed| {
                defer parsed.deinit();
                if (parsed.value.object.get("kinds")) |kv| {
                    var it = kv.object.iterator();
                    while (it.next()) |e| {
                        const g = try kinds.getOrPut(try self.alloc.dupe(u8, e.key_ptr.*));
                        g.value_ptr.* = std.ArrayList([]const u8).init(self.alloc);
                        for (e.value_ptr.array.items) |item|
                            try g.value_ptr.append(try self.alloc.dupe(u8, item.string));
                    }
                }
            } else |_| {}
        } else |_| {}
        const g = try kinds.getOrPut(try self.alloc.dupe(u8, kind));
        if (!g.found_existing) g.value_ptr.* = std.ArrayList([]const u8).init(self.alloc);
        var present = false;
        for (g.value_ptr.items) |s| {
            if (std.mem.eql(u8, s, id)) present = true;
        }
        if (!present) try g.value_ptr.append(try self.alloc.dupe(u8, id));
        try self.kindIndexWriteAll(lane, &kinds);
    }

    fn kindIndexWriteAll(self: *Store, lane: []const u8, kinds: *std.StringArrayHashMap(std.ArrayList([]const u8))) !void {
        const p = try self.kindIndexPath(lane);
        defer self.alloc.free(p);
        const d = try self.laneDir(lane);
        defer self.alloc.free(d);
        try std.fs.cwd().makePath(d);
        var out = std.ArrayList(u8).init(self.alloc);
        defer out.deinit();
        const w = out.writer();
        try w.writeAll("{\"complete\":true,\"kinds\":{");
        var it = kinds.iterator();
        var first = true;
        while (it.next()) |e| {
            if (!first) try w.writeByte(',');
            first = false;
            try writeJsString(w, e.key_ptr.*);
            try w.writeAll(":[");
            for (e.value_ptr.items, 0..) |id, i| {
                if (i > 0) try w.writeByte(',');
                try writeJsString(w, id);
            }
            try w.writeByte(']');
        }
        try w.writeAll("}}\n");
        const tmp = try std.fmt.allocPrint(self.alloc, "{s}.tmp", .{p});
        defer self.alloc.free(tmp);
        try std.fs.cwd().writeFile(.{ .sub_path = tmp, .data = out.items });
        try std.fs.cwd().rename(tmp, p);
    }
};

/// ------------------------------------------------------------------
/// Wire op dispatcher — request stream in ([op][args]), reply stream
/// out ([status][data]). All ops act on the shared store; the socket
/// framing lives in dhtd.zig.
/// ------------------------------------------------------------------
pub fn dispatch(st: *Store, req: []const u8, out: *std.ArrayList(u8)) !void {
    if (req.len == 0) {
        try out.append(@intFromEnum(Status.bad_request));
        return;
    }
    const op: Op = @enumFromInt(req[0]);
    const args = req[1..];
    const w = out.writer();
    switch (op) {
        .ping => {
            try out.append(@intFromEnum(Status.ok));
            try w.writeInt(u32, 0x4448_5401, .little); // "DHT\x01" magic
        },
        .lanes => {
            try out.append(@intFromEnum(Status.ok));
            try w.writeInt(u16, @intCast(st.lanes.len), .little);
            for (st.lanes) |l| {
                try w.writeInt(u8, @intCast(l.len), .little);
                try w.writeAll(l);
            }
        },
        .stat => {
            try out.append(@intFromEnum(Status.ok));
            try w.writeInt(u16, @intCast(st.lanes.len), .little);
            try w.writeInt(u16, @intCast(st.registry.onlineCount()), .little);
        },
        .put_file => {
            if (args.len < 2) return out.append(@intFromEnum(Status.bad_request));
            const lane = std.mem.readInt(u16, args[0..2], .little);
            if (lane >= st.lanes.len) return out.append(@intFromEnum(Status.bad_request));
            const r = st.putFile(lane, args[2..]) catch return out.append(@intFromEnum(Status.store_error));
            try out.append(@intFromEnum(Status.ok));
            try w.writeAll(&r.cid);
            try w.writeInt(u16, @intCast(r.chunks), .little);
            try w.writeInt(u8, r.acks, .little);
        },
        .get_file => {
            if (args.len < 64) return out.append(@intFromEnum(Status.bad_request));
            const cid = args[0..64];
            const r = st.getFile(cid) catch return out.append(@intFromEnum(Status.store_error));
            try out.append(@intFromEnum(r.st));
            if (r.st == .ok) {
                try w.writeInt(u16, @intCast(r.served_by.?), .little);
                try w.writeInt(u16, @intCast(r.replicas), .little);
                try w.writeInt(u8, r.tampered, .little);
                try w.writeInt(u64, @intCast(r.size), .little);
                try w.writeAll(r.data.?);
            }
        },
        .providers => {
            if (args.len < 64) return out.append(@intFromEnum(Status.bad_request));
            var list = std.ArrayList(usize).init(st.alloc);
            defer list.deinit();
            try st.providersList(args[0..64], &list);
            try out.append(@intFromEnum(Status.ok));
            try w.writeInt(u16, @intCast(list.items.len), .little);
            for (list.items) |li| try w.writeInt(u16, @intCast(li), .little);
        },
        .record_put => {
            if (args.len < 4) return out.append(@intFromEnum(Status.bad_request));
            const lane = std.mem.readInt(u16, args[0..2], .little);
            const clearance = args[2];
            const klen = args[3];
            if (args.len < 4 + klen + 1) return out.append(@intFromEnum(Status.bad_request));
            const kind = args[4 .. 4 + klen];
            const nlen = args[4 + klen];
            if (args.len < 5 + klen + nlen + 4) return out.append(@intFromEnum(Status.bad_request));
            const name = args[5 + klen .. 5 + klen + nlen];
            const blen = std.mem.readInt(u32, args[5 + klen + nlen ..][0..4], .little);
            if (args.len < 9 + klen + nlen + blen) return out.append(@intFromEnum(Status.bad_request));
            const body = args[9 + klen + nlen .. 9 + klen + nlen + blen];
            if (lane >= st.lanes.len) return out.append(@intFromEnum(Status.bad_request));
            const r = st.recordPut(lane, kind, name, body, clearance) catch return out.append(@intFromEnum(Status.store_error));
            try out.append(@intFromEnum(r.st));
            if (r.st == .ok) {
                try w.writeAll(&r.id);
                try w.writeInt(u32, r.version, .little);
            }
        },
        .record_get => {
            if (args.len < 65) return out.append(@intFromEnum(Status.bad_request));
            const id = args[0..64];
            const reader = args[64];
            const r = st.recordGet(id, reader) catch return out.append(@intFromEnum(Status.store_error));
            try out.append(@intFromEnum(r.st));
            switch (r.st) {
                .ok => {
                    try w.writeInt(u8, @intCast(r.versions), .little);
                    try w.writeInt(u16, @intCast(r.lane.?), .little);
                    try w.writeAll(r.raw.?);
                },
                .sig_refused => try w.print("{{\"reason\":\"{s}\"}}", .{@tagName(r.detail)}),
                .clearance_refused => try w.print("{{\"need\":{d}}}", .{r.need}),
                else => {},
            }
        },
        .record_query => {
            if (args.len < 2) return out.append(@intFromEnum(Status.bad_request));
            const reader = args[0];
            const klen = args[1];
            if (args.len < 2 + klen) return out.append(@intFromEnum(Status.bad_request));
            var rows = std.ArrayList(Store.QueryRow).init(st.alloc);
            defer {
                for (rows.items) |*r| {
                    st.alloc.free(r.id);
                    st.alloc.free(r.kind);
                    st.alloc.free(r.name);
                    st.alloc.free(r.author);
                }
                rows.deinit();
            }
            st.recordQuery(args[2 .. 2 + klen], reader, &rows) catch return out.append(@intFromEnum(Status.store_error));
            try out.append(@intFromEnum(Status.ok));
            try w.writeByte('[');
            for (rows.items, 0..) |r, i| {
                if (i > 0) try w.writeByte(',');
                try w.writeAll("{\"id\":");
                try writeJsString(w, r.id);
                try w.writeAll(",\"kind\":");
                try writeJsString(w, r.kind);
                try w.writeAll(",\"name\":");
                try writeJsString(w, r.name);
                try w.print(",\"version\":{d},\"author\":", .{r.version});
                try writeJsString(w, r.author);
                try w.print(",\"clearance\":{d}}}", .{r.clearance});
            }
            try w.writeByte(']');
        },
        .heartbeat => {
            if (args.len < 2) return out.append(@intFromEnum(Status.bad_request));
            const lane = std.mem.readInt(u16, args[0..2], .little);
            if (lane >= st.lanes.len) return out.append(@intFromEnum(Status.bad_request));
            st.registry.heartbeat(@intCast(lane + 1));
            try out.append(@intFromEnum(Status.ok));
        },
        _ => try out.append(@intFromEnum(Status.bad_request)),
    }
}

// ---------- tests ----------

test "shaHex + XOR distance ordering" {
    const a = shaHex("LANE-A");
    const b = shaHex("LANE-B");
    var av: [32]u8 = undefined;
    var bv: [32]u8 = undefined;
    var kv: [32]u8 = undefined;
    _ = try std.fmt.hexToBytes(&av, &a);
    _ = try std.fmt.hexToBytes(&bv, &b);
    _ = try std.fmt.hexToBytes(&kv, &shaHex("key"));
    const c1 = distCmp(&av, &bv, &kv);
    const c2 = distCmp(&bv, &av, &kv);
    try std.testing.expect(c1 == -c2);
    try std.testing.expectEqual(@as(i8, 0), distCmp(&av, &av, &kv));
}

test "writeJsString escapes like JSON.stringify" {
    var buf = std.ArrayList(u8).init(std.testing.allocator);
    defer buf.deinit();
    try writeJsString(buf.writer(), "a\nb\tc\\d\"e\x01f\xc3\xa9");
    try std.testing.expectEqualStrings("\"a\\nb\\tc\\\\d\\\"e\\u0001f\xc3\xa9\"", buf.items);
}

test "writeJsNumber matches V8 Number::toString" {
    var buf = std.ArrayList(u8).init(std.testing.allocator);
    defer buf.deinit();
    const cases = [_]struct { f: f64, s: []const u8 }{
        .{ .f = 1.5, .s = "1.5" },
        .{ .f = 0.1, .s = "0.1" },
        .{ .f = 1e21, .s = "1e+21" },
        .{ .f = 1e-7, .s = "1e-7" },
        .{ .f = 100.0, .s = "100" },
        .{ .f = 3.14159, .s = "3.14159" },
        .{ .f = 1e-6, .s = "0.000001" },
        .{ .f = 123456789.0, .s = "123456789" },
        .{ .f = -0.5, .s = "-0.5" },
        .{ .f = 1e20, .s = "100000000000000000000" },
    };
    for (cases) |c| {
        buf.clearRetainingCapacity();
        try writeJsNumber(buf.writer(), c.f);
        try std.testing.expectEqualStrings(c.s, buf.items);
    }
}

test "canon byte-parity — fixed field order, sig excluded" {
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    const src =
        \\{"id":"abc","kind":"k","name":"n","version":2,"prev":1,"author":"lane","clearance":4,"body":{"x":1,"s":"t"},"sha256":"deadbeef","sig_kid":"fleet-service","sig":"AAAA"}
    ;
    const v = try std.json.parseFromSlice(std.json.Value, arena.allocator(), src, .{});
    var buf = std.ArrayList(u8).init(std.testing.allocator);
    defer buf.deinit();
    try writeCanon(buf.writer(), v.value);
    try std.testing.expectEqualStrings("{\"id\":\"abc\",\"kind\":\"k\",\"name\":\"n\",\"version\":2,\"prev\":1,\"author\":\"lane\",\"clearance\":4,\"body\":{\"x\":1,\"s\":\"t\"},\"sha256\":\"deadbeef\"}", buf.items);
}

test "pretty emitter matches JSON.stringify(v,null,2)" {
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    const src = "{\"a\":1,\"o\":{\"x\":2,\"e\":{}},\"arr\":[1,[]],\"s\":\"hi\"}";
    const v = try std.json.parseFromSlice(std.json.Value, arena.allocator(), src, .{});
    var buf = std.ArrayList(u8).init(std.testing.allocator);
    defer buf.deinit();
    try writeJsJsonPretty(buf.writer(), v.value, 0);
    const expected =
        \\{
        \\  "a": 1,
        \\  "o": {
        \\    "x": 2,
        \\    "e": {}
        \\  },
        \\  "arr": [
        \\    1,
        \\    []
        \\  ],
        \\  "s": "hi"
        \\}
    ;
    try std.testing.expectEqualStrings(expected, buf.items);
}

fn tmpStore(alloc: std.mem.Allocator, root: []const u8, lanes: []const []const u8) !*Store {
    try std.fs.cwd().makePath(root);
    return Store.init(alloc, root, lanes);
}

test "store: put/get roundtrip + tamper refusal + churn" {
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    const alloc = arena.allocator();
    const root = "/tmp/dht-native-test";
    std.fs.cwd().deleteTree(root) catch {};
    defer std.fs.cwd().deleteTree(root) catch {};
    const lanes = [_][]const u8{ "alpha", "bravo", "charlie", "delta", "echo", "foxtrot" };
    const st = try tmpStore(alloc, root, &lanes);
    const data = "continuity-probe — native twin roundtrip " ** 4000; // ~160KB → 3 chunks
    const r = try st.putFile(0, data);
    try std.testing.expect(r.chunks >= 3);
    var prov = std.ArrayList(usize).init(alloc);
    try st.providersList(&r.cid, &prov);
    try std.testing.expect(prov.items.len >= K_REPLICAS);
    const g = try st.getFile(&r.cid);
    try std.testing.expectEqual(Status.ok, g.st);
    try std.testing.expectEqualStrings(data, g.data.?);
    // tamper the manifest on the FIRST lane in the XOR walk → the
    // integrity refusal is exercised deterministically, replica serves
    var cid_bytes: [32]u8 = undefined;
    _ = try std.fmt.hexToBytes(&cid_bytes, &r.cid);
    var obuf: [vfs.MAX_NODES]usize = undefined;
    st.probeLiveness();
    const order = st.closestIdx(&cid_bytes, true, &obuf);
    const victim = st.lanes[order[0]];
    const bp = try st.blockPath(victim, &r.cid);
    try std.fs.cwd().writeFile(.{ .sub_path = bp, .data = "forged" });
    const g2 = try st.getFile(&r.cid);
    try std.testing.expectEqual(Status.ok, g2.st);
    try std.testing.expect(g2.tampered >= 1);
    try std.testing.expectEqualStrings(data, g2.data.?);
}

test "store: records — sign, verify, version, clearance, query, forgery" {
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    const alloc = arena.allocator();
    const root = "/tmp/dht-native-test2";
    std.fs.cwd().deleteTree(root) catch {};
    defer std.fs.cwd().deleteTree(root) catch {};
    const lanes = [_][]const u8{ "alpha", "bravo", "charlie", "delta", "echo", "foxtrot" };
    const st = try tmpStore(alloc, root, &lanes);
    // forge a service key where the store expects it
    const kp = try Ed25519.KeyPair.create(null);
    var kdir = std.ArrayList(u8).init(alloc);
    try kdir.writer().print("{s}/keys", .{root});
    try std.fs.cwd().makePath(kdir.items);
    var pk_der: [44]u8 = undefined;
    @memcpy(pk_der[0..12], &SPKI_PREFIX);
    @memcpy(pk_der[12..44], &kp.public_key.toBytes());
    var sk_der: [48]u8 = undefined;
    @memcpy(sk_der[0..16], &PKCS8_PREFIX);
    const sk_bytes = kp.secret_key.toBytes();
    @memcpy(sk_der[16..48], sk_bytes[0..32]);
    try std.fs.cwd().writeFile(.{ .sub_path = try std.fmt.allocPrint(alloc, "{s}/fleet-service.pk", .{kdir.items}), .data = &pk_der });
    try std.fs.cwd().writeFile(.{ .sub_path = try std.fmt.allocPrint(alloc, "{s}/fleet-service.sk", .{kdir.items}), .data = &sk_der });
    try st.loadKeys();

    const rp = try st.recordPut(0, "patrol-order", "alpha-watch", "{\"duty\":\"watch\",\"shift\":1}", 4);
    try std.testing.expectEqual(Status.ok, rp.st);
    try std.testing.expectEqual(@as(u32, 1), rp.version);
    const rp2 = try st.recordPut(0, "patrol-order", "alpha-watch", "{\"duty\":\"watch\",\"shift\":2}", 4);
    try std.testing.expectEqual(@as(u32, 2), rp2.version);

    const g = try st.recordGet(&rp.id, 7);
    try std.testing.expectEqual(Status.ok, g.st);
    try std.testing.expectEqual(@as(usize, 2), g.versions);
    const body = g.rec.?.object.get("body").?.object;
    try std.testing.expectEqual(@as(i64, 2), body.get("shift").?.integer);

    // clearance gate — below level refused
    const low = try st.recordGet(&rp.id, 2);
    try std.testing.expectEqual(Status.clearance_refused, low.st);
    try std.testing.expectEqual(@as(u8, 4), low.need);

    // query returns the head only
    var rows = std.ArrayList(Store.QueryRow).init(alloc);
    try st.recordQuery("patrol-order", 7, &rows);
    try std.testing.expect(rows.items.len >= 1);
    var found = false;
    for (rows.items) |r| {
        if (std.mem.eql(u8, r.id, &rp.id) and r.version == 2) found = true;
    }
    try std.testing.expect(found);

    // forgery: unsigned + bad-sig + foreign-kid all refuse
    const ForgeTail = struct { kid: []const u8, sig_b64: []const u8 };
    const plant = struct {
        fn go(s: *Store, lane: []const u8, tag: []const u8, tail: ?ForgeTail) ![64]u8 {
            var idsrc = std.ArrayList(u8).init(s.alloc);
            try idsrc.writer().print("forged:{s}", .{tag});
            const id = shaHex(idsrc.items);
            const body_json = "{\"claim\":\"planted\"}";
            var rec = std.ArrayList(u8).init(s.alloc);
            try rec.writer().print("{{\"id\":\"{s}\",\"kind\":\"forged-claim\",\"name\":\"{s}\",\"version\":1,\"prev\":null,\"author\":\"FLEET-ADMIRAL\",\"clearance\":0,\"body\":{s},\"sha256\":\"{s}\"", .{ id, tag, body_json, shaHex(body_json) });
            if (tail) |t| try rec.writer().print(",\"sig_kid\":\"{s}\",\"sig\":\"{s}\"", .{ t.kid, t.sig_b64 });
            try rec.append('}');
            const rd = try s.join(&.{ s.root, "lanes", lane, "records", &id });
            try std.fs.cwd().makePath(rd);
            const fp = try std.fmt.allocPrint(s.alloc, "{s}/0001.json", .{rd});
            try std.fs.cwd().writeFile(.{ .sub_path = fp, .data = rec.items });
            return id;
        }
    }.go;
    const b64_64 = std.base64.standard.Encoder.calcSize(64);
    var fake_sig: [128]u8 = undefined;
    const fake_sig_b64 = fake_sig[0..std.base64.standard.Encoder.encode(fake_sig[0..b64_64], &([_]u8{7} ** 64)).len];
    const f1 = try plant(st, lanes[0], "unsigned", null);
    const f2 = try plant(st, lanes[0], "badsig", .{ .kid = "fleet-service", .sig_b64 = fake_sig_b64 });
    const f3 = try plant(st, lanes[0], "foreign", .{ .kid = "rogue-lane", .sig_b64 = fake_sig_b64 });
    for ([_][64]u8{ f1, f2, f3 }) |fid| {
        const r = try st.recordGet(&fid, 7);
        try std.testing.expectEqual(Status.sig_refused, r.st);
    }
}

test "ed25519 fleet-service DER keys parse" {
    const kp = try Ed25519.KeyPair.create(null);
    var pk_der: [44]u8 = undefined;
    @memcpy(pk_der[0..12], &SPKI_PREFIX);
    @memcpy(pk_der[12..44], &kp.public_key.toBytes());
    const pk = try Ed25519.PublicKey.fromBytes(pk_der[12..44].*);
    const sig = try kp.sign("canon", null);
    try sig.verify("canon", pk);
    // roundtrip: seed → same keypair → same signature path
    const kp2 = try Ed25519.KeyPair.create(kp.secret_key.toBytes()[0..32].*);
    const sig2 = try kp2.sign("canon", null);
    try sig2.verify("canon", pk);
}
