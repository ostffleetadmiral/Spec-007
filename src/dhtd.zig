//! dhtd.zig — the native Continuity DHT daemon. Answers record/block ops
//! over the sealed 136-byte FANO wire on loopback TCP, backed by
//! dht_native.zig on the vfs_distributed substrate.
//!
//! Framing: a request is a stream of sealed 136-B envelopes; payload byte
//! [0] is a more-flag, bytes [1..64) are stream data (63 B/envelope).
//! Request stream = [op][args], reply stream = [status][data] — see
//! Op/Status in dht_native.zig. Replies are sealed with src = daemon
//! cell (7,7,7 center), dst = the requester's src cell. Envelopes whose
//! src cell is off the 15³ lattice (12-bit hostile coords) can't be
//! addressed — dropped unsealed, same as the mesh.
//!
//! Integer-only end to end: sha256 ids, XOR-256 routing, ed25519 sigs,
//! u64 counters. The wire seal covers payload + route — a mangled frame
//! fails verify() before dispatch ever sees it.
//!
//! usage: dhtd --root <store> --lanes a,b,c [--listen 127.0.0.1:14661]

const std = @import("std");
const dht = @import("dht_native");
const seal_mod = @import("spec008_seal");
const vfs = @import("vfs_distributed");
pub const seal = seal_mod;

const FANO_WIRE = seal_mod.FANO_WIRE;
const FRAME_DATA: usize = 63; // 64B payload − 1B more-flag
const MAX_ACCEPTED_FRAMES: usize = (dht.MAX_STREAM + FRAME_DATA - 1) / FRAME_DATA + 1;
const MAX_DROPPED_FRAMES: usize = 64;

pub const FrameVerdict = enum { dropped, more, complete };

pub const RequestAssembler = struct {
    src: [3]u32 = .{ 7, 7, 7 },
    got_first: bool = false,
    accepted: usize = 0,
    dropped: usize = 0,

    fn drop(self: *RequestAssembler) !FrameVerdict {
        self.dropped += 1;
        if (self.dropped > MAX_DROPPED_FRAMES) return error.DroppedFrameStorm;
        return .dropped;
    }

    pub fn accept(self: *RequestAssembler, req: *std.ArrayList(u8), frame: *const [FANO_WIRE]u8) !FrameVerdict {
        if (!seal_mod.verify(frame)) return self.drop();
        // requester cell from the cell-word (12-bit fields; must be a
        // lattice point 0..14 to be addressable)
        const top = std.mem.readInt(u64, frame[24..32], .little);
        const sx: u32 = @intCast((top >> 27) & 0xfff);
        const sy: u32 = @intCast((top >> 39) & 0xfff);
        const sz: u32 = @intCast((top >> 51) & 0xfff);
        if (sx > 14 or sy > 14 or sz > 14) return self.drop(); // unroutable src
        // a request stream belongs to one requester — pin src on the
        // first verified frame, drop frames sealed from elsewhere.
        if (self.got_first and (self.src[0] != sx or self.src[1] != sy or self.src[2] != sz)) return self.drop();
        if (!self.got_first) {
            self.src = .{ sx, sy, sz };
            self.got_first = true;
        }
        self.accepted += 1;
        if (self.accepted > MAX_ACCEPTED_FRAMES) return error.AcceptedFrameBudget;
        const more = frame[40] != 0;
        const plen = @min(@as(usize, frame[39]), seal_mod.FANO_CAP);
        if (plen > 1) try req.appendSlice(frame[41 .. 40 + plen]);
        if (req.items.len > dht.MAX_STREAM) return error.Oversize;
        return if (more) .more else .complete;
    }
};

fn usage() noreturn {
    std.debug.print("usage: dhtd --root <store> --lanes a,b,c [--listen ip:port]\n", .{});
    std.process.exit(2);
}

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const alloc = gpa.allocator();

    var root: ?[]const u8 = null;
    var lanes_arg: ?[]const u8 = null;
    var listen: []const u8 = "127.0.0.1:14661";
    var it = try std.process.argsWithAllocator(alloc);
    _ = it.next();
    while (it.next()) |a| {
        if (std.mem.eql(u8, a, "--root")) {
            root = it.next() orelse usage();
        } else if (std.mem.eql(u8, a, "--lanes")) {
            lanes_arg = it.next() orelse usage();
        } else if (std.mem.eql(u8, a, "--listen")) {
            listen = it.next() orelse usage();
        } else usage();
    }
    if (root == null or lanes_arg == null) usage();

    var lanes = std.ArrayList([]const u8).init(alloc);
    var lit = std.mem.splitScalar(u8, lanes_arg.?, ',');
    while (lit.next()) |l| {
        if (l.len > 0) try lanes.append(try alloc.dupe(u8, l));
    }
    if (lanes.items.len == 0) usage();

    const st = try dht.Store.init(alloc, root.?, lanes.items);
    std.debug.print("dhtd: root={s} lanes={d} pk={s}\n", .{ root.?, lanes.items.len, if (st.pk != null) "loaded" else "absent" });

    const colon = std.mem.lastIndexOfScalar(u8, listen, ':') orelse usage();
    const port = try std.fmt.parseInt(u16, listen[colon + 1 ..], 10);
    const addr = try std.net.Address.parseIp4(listen[0..colon], port);
    var server = try addr.listen(.{ .reuse_address = true });
    std.debug.print("dhtd: sealed-wire ops on {s}\n", .{listen});

    while (true) {
        const conn = server.accept() catch continue;
        handleConn(alloc, st, conn.stream) catch |e| {
            std.debug.print("dhtd: conn error {s}\n", .{@errorName(e)});
        };
        conn.stream.close();
    }
}

fn handleConn(alloc: std.mem.Allocator, st: *dht.Store, stream: std.net.Stream) !void {
    // persistent connection — request/dispatch/reply cycles until EOF.
    var req = std.ArrayList(u8).init(alloc);
    defer req.deinit();
    var reply = std.ArrayList(u8).init(alloc);
    defer reply.deinit();
    var frame: [FANO_WIRE]u8 = undefined;
    while (true) {
        req.clearRetainingCapacity();
        reply.clearRetainingCapacity();
        var assembler = RequestAssembler{};
        while (true) {
            readExact(stream, &frame) catch |e| switch (e) {
                error.Eof => return, // clean close between requests
                else => return e,
            };
            const verdict = try assembler.accept(&req, &frame);
            switch (verdict) {
                .dropped => std.debug.print("dhtd: dropped frame ({d} req bytes, {d} dropped)\n", .{ req.items.len, assembler.dropped }),
                .more => continue,
                .complete => break,
            }
        }
        try dht.dispatch(st, req.items, &reply);
        // seal the reply back to the requester's cell — 63 B per frame
        const seq: u32 = std.mem.readInt(u32, frame[35..39], .little);
        var off: usize = 0;
        var fseq: u32 = seq +% 1; // replies continue the requester's sequence
        while (true) {
            const n: usize = @min(FRAME_DATA, reply.items.len - off);
            const more = off + n < reply.items.len;
            const plen: usize = n + 1;
            var payload: [seal_mod.FANO_CAP]u8 = [_]u8{0} ** seal_mod.FANO_CAP;
            payload[0] = if (more) 1 else 0;
            @memcpy(payload[1..plen], reply.items[off .. off + n]);
            const w = try seal_mod.build(7, 7, 7, @intCast(assembler.src[0]), @intCast(assembler.src[1]), @intCast(assembler.src[2]), fseq, payload[0..plen]);
            try stream.writeAll(&w);
            off += n;
            fseq +%= 1;
            if (!more) break;
        }
    }
}

fn readExact(stream: std.net.Stream, buf: []u8) !void {
    var off: usize = 0;
    while (off < buf.len) {
        const n = try stream.read(buf[off..]);
        if (n == 0) return error.Eof;
        off += n;
    }
}

fn requestFrame(sx: u8, sy: u8, sz: u8, seq: u32, more: bool, data: []const u8) ![FANO_WIRE]u8 {
    var payload: [seal_mod.FANO_CAP]u8 = [_]u8{0} ** seal_mod.FANO_CAP;
    payload[0] = if (more) 1 else 0;
    @memcpy(payload[1 .. data.len + 1], data);
    return seal_mod.build(sx, sy, sz, 7, 7, 7, seq, payload[0 .. data.len + 1]);
}

test "dhtd request assembler reassembles a multi-frame stream" {
    var req = std.ArrayList(u8).init(std.testing.allocator);
    defer req.deinit();
    var assembler = RequestAssembler{};

    var f1 = try requestFrame(1, 2, 3, 40, true, "abc");
    var f2 = try requestFrame(1, 2, 3, 41, false, "def");
    try std.testing.expect((try assembler.accept(&req, &f1)) == .more);
    try std.testing.expect((try assembler.accept(&req, &f2)) == .complete);
    try std.testing.expectEqualStrings("abcdef", req.items);
    try std.testing.expectEqualSlices(u32, &.{ 1, 2, 3 }, &assembler.src);
}

test "dhtd request assembler pins a request to its first source" {
    var req = std.ArrayList(u8).init(std.testing.allocator);
    defer req.deinit();
    var assembler = RequestAssembler{};

    var first = try requestFrame(1, 2, 3, 40, true, "own");
    var foreign = try requestFrame(2, 3, 4, 41, false, "foreign");
    var last = try requestFrame(1, 2, 3, 42, false, "er");
    try std.testing.expect((try assembler.accept(&req, &first)) == .more);
    try std.testing.expect((try assembler.accept(&req, &foreign)) == .dropped);
    try std.testing.expect((try assembler.accept(&req, &last)) == .complete);
    try std.testing.expectEqualStrings("owner", req.items);
    try std.testing.expectEqual(@as(usize, 1), assembler.dropped);
}

test "dhtd request assembler bounds dropped-frame storms" {
    var req = std.ArrayList(u8).init(std.testing.allocator);
    defer req.deinit();
    var assembler = RequestAssembler{};
    var bad = try requestFrame(1, 2, 3, 40, false, "x");
    bad[104] ^= 1;

    for (0..MAX_DROPPED_FRAMES) |_| {
        try std.testing.expect((try assembler.accept(&req, &bad)) == .dropped);
    }
    try std.testing.expectError(error.DroppedFrameStorm, assembler.accept(&req, &bad));
}

test "dhtd request assembler enforces the accepted-frame budget" {
    var req = std.ArrayList(u8).init(std.testing.allocator);
    defer req.deinit();
    var assembler = RequestAssembler{ .accepted = MAX_ACCEPTED_FRAMES };
    var frame = try requestFrame(1, 2, 3, 40, false, "x");

    try std.testing.expectError(error.AcceptedFrameBudget, assembler.accept(&req, &frame));
}
