//! golden_emit.zig — canonical vector emitter (D11/P2, Ark golden-master port).
//!
//! Prints the deterministic outputs the golden-master harness byte-compares:
//! raw i256 results for the Q128.128 primitive set — RNE multiply, division,
//! ratio construction, powers, square roots — so the cross-run and
//! cross-implementation parity checks have a fixed reference surface.
//! Integer-only; no floats anywhere in the emission path.

const std = @import("std");
const q = @import("fixed_point_q128.zig");
const Q128 = q.Q128;

pub fn main() !void {
    var bw = std.io.bufferedWriter(std.io.getStdOut().writer());
    const out = bw.writer();
    defer bw.flush() catch {};

    try out.print("spec=GOLDENV1\n", .{});

    // RNE multiply — raw products pinned, not floats
    const pairs = [_][2]i256{
        .{ 7, 3 },     .{ 15, 15 },    .{ 421, 8 },   .{ -6, 7 }, .{ 3375, 15 },
        .{ 240, 721 }, .{ 1548, 421 }, .{ -136, 64 },
    };
    for (pairs) |p| {
        const a = Q128.fromInteger(p[0]);
        const b = Q128.fromInteger(p[1]);
        try out.print("mul[{d},{d}].raw={d}\n", .{ p[0], p[1], a.mul(b).raw });
    }

    // division
    const divs = [_][2]i256{ .{ 22, 7 }, .{ 421, 8 }, .{ 355, 113 }, .{ -15, 4 } };
    for (divs) |p| {
        const a = Q128.fromInteger(p[0]);
        const b = Q128.fromInteger(p[1]);
        if (a.div(b)) |v|
            try out.print("div[{d},{d}].raw={d}\n", .{ p[0], p[1], v.raw })
        else |_|
            try out.print("div[{d},{d}].error\n", .{ p[0], p[1] });
    }

    // fromRatio — round-half-away-from-zero construction
    const ratios = [_][2]i256{
        .{ 1, 3 }, .{ 2, 3 }, .{ 1, 8 }, .{ 421, 3375 }, .{ 7, 225 }, .{ -5, 8 },
    };
    for (ratios) |p| {
        if (Q128.fromRatio(p[0], p[1])) |v|
            try out.print("ratio[{d},{d}].raw={d}\n", .{ p[0], p[1], v.raw })
        else |_|
            try out.print("ratio[{d},{d}].error\n", .{ p[0], p[1] });
    }

    // powers
    const pows = [_]struct { b: i256, e: i32 }{
        .{ .b = 2, .e = 10 }, .{ .b = 15, .e = 3 }, .{ .b = 3, .e = -2 },
        .{ .b = 16, .e = 3 }, .{ .b = -2, .e = 5 },
    };
    for (pows) |p| {
        const base = Q128.fromInteger(p.b);
        if (base.pow(p.e)) |v|
            try out.print("pow[{d},{d}].raw={d}\n", .{ p.b, p.e, v.raw })
        else |_|
            try out.print("pow[{d},{d}].error\n", .{ p.b, p.e });
    }

    // square roots — Newton iteration at fixed point
    const sqrts = [_]i256{ 2, 3, 15, 421, 225, 10000 };
    for (sqrts) |s| {
        const v = Q128.fromInteger(s);
        if (v.sqrt()) |r|
            try out.print("sqrt[{d}].raw={d}\n", .{ s, r.raw })
        else |_|
            try out.print("sqrt[{d}].error\n", .{s});
    }

    // pow2 oracle — the scale ladder itself
    const exps = [_]u16{ 0, 8, 64, 128, 129, 240, 255 };
    for (exps) |e|
        try out.print("pow2[{d}]={d}\n", .{ e, q.exactPow2(e) });
}
