//! spec008_seal_cli.zig — hex CLI over the spec008_seal core for
//! JS↔Zig differential probing (fano-wan-gateway staged consumption).
//! The core stays host-dependency-free so it also builds as a
//! wasm32-freestanding lib for in-process verify.

const std = @import("std");
const seal_core = @import("spec008_seal.zig");

const FANO_WIRE = seal_core.FANO_WIRE;
const FANO_CAP = seal_core.FANO_CAP;

fn hexNibble(c: u8) ?u4 {
    return switch (c) {
        '0'...'9' => @intCast(c - '0'),
        'a'...'f' => @intCast(c - 'a' + 10),
        'A'...'F' => @intCast(c - 'A' + 10),
        else => null,
    };
}

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const alloc = gpa.allocator();
    const args = try std.process.argsAlloc(alloc);
    defer std.process.argsFree(alloc, args);
    const stdout = std.io.getStdOut().writer();
    const stderr = std.io.getStdErr().writer();

    if (args.len < 3) {
        try stderr.print("usage: spec008_seal verify-hex <wire272> | seal-hex <wire272> | build-hex <sx> <sy> <sz> <dx> <dy> <dz> <seq> <payloadhex>\n", .{});
        return error.Usage;
    }
    const hex = args[2];
    if (std.mem.eql(u8, args[1], "build-hex")) {
        if (args.len < 9) return error.Usage;
        const c = [6]u8{
            try std.fmt.parseInt(u8, args[2], 10), try std.fmt.parseInt(u8, args[3], 10),
            try std.fmt.parseInt(u8, args[4], 10), try std.fmt.parseInt(u8, args[5], 10),
            try std.fmt.parseInt(u8, args[6], 10), try std.fmt.parseInt(u8, args[7], 10),
        };
        const seq = try std.fmt.parseInt(u32, args[8], 10);
        const phex = if (args.len > 9) args[9] else "";
        var payload: [FANO_CAP]u8 = undefined;
        var plen: usize = 0;
        while (plen * 2 + 1 < phex.len and plen < FANO_CAP) : (plen += 1)
            payload[plen] = @as(u8, hexNibble(phex[plen * 2]) orelse return error.BadHex) << 4 |
                (hexNibble(phex[plen * 2 + 1]) orelse return error.BadHex);
        const w = seal_core.build(c[0], c[1], c[2], c[3], c[4], c[5], seq, payload[0..plen]);
        for (w) |b| try stdout.print("{x:0>2}", .{b});
        try stdout.print("\n", .{});
        return;
    }
    if (hex.len != FANO_WIRE * 2) {
        try stderr.print("wire must be {d} hex chars, got {d}\n", .{ FANO_WIRE * 2, hex.len });
        return error.BadWire;
    }
    var wire: [FANO_WIRE]u8 = undefined;
    for (0..FANO_WIRE) |i|
        wire[i] = @as(u8, hexNibble(hex[i * 2]) orelse return error.BadHex) << 4 |
            (hexNibble(hex[i * 2 + 1]) orelse return error.BadHex);

    if (std.mem.eql(u8, args[1], "seal-hex")) {
        const s = seal_core.seal(&wire);
        for (s) |b| try stdout.print("{x:0>2}", .{b});
        try stdout.print("\n", .{});
    } else if (std.mem.eql(u8, args[1], "verify-hex")) {
        const ok = seal_core.verify(&wire);
        try stdout.print("{s}\n", .{if (ok) "valid" else "invalid"});
        if (!ok) return error.InvalidSeal;
    } else return error.Usage;
}
