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

const FANO_WIRE = seal_mod.FANO_WIRE;
const FRAME_DATA: usize = 63; // 64B payload − 1B more-flag

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
        var src: [3]u32 = .{ 7, 7, 7 };
        var got_first = false;
        while (true) {
            readExact(stream, &frame) catch |e| switch (e) {
                error.Eof => return, // clean close between requests
                else => return e,
            };
            if (!seal_mod.verify(&frame)) {
                std.debug.print("dhtd: dropped unsealed frame ({d} req bytes so far)\n", .{req.items.len});
                continue;
            }
            // requester cell from the cell-word (12-bit fields; must be a
            // lattice point 0..14 to be addressable)
            const top = std.mem.readInt(u64, frame[24..32], .little);
            const sx: u32 = @intCast((top >> 27) & 0xfff);
            const sy: u32 = @intCast((top >> 39) & 0xfff);
            const sz: u32 = @intCast((top >> 51) & 0xfff);
            if (sx > 14 or sy > 14 or sz > 14) continue; // unroutable src
            // a request stream belongs to one requester — pin src on the
            // first verified frame, drop frames sealed from elsewhere.
            if (got_first and (src[0] != sx or src[1] != sy or src[2] != sz)) continue;
            src = .{ sx, sy, sz };
            got_first = true;
            const more = frame[40] != 0;
            const plen = @min(@as(usize, frame[39]), seal_mod.FANO_CAP);
            if (plen > 1) try req.appendSlice(frame[41 .. 40 + plen]);
            if (req.items.len > dht.MAX_STREAM) return error.Oversize;
            if (!more) break;
        }
        if (!got_first) return;
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
            const w = seal_mod.build(7, 7, 7, @intCast(src[0]), @intCast(src[1]), @intCast(src[2]), fseq, payload[0..plen]);
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
