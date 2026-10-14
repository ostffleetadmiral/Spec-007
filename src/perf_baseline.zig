//! spec007-perf-baseline — integer-only microbenchmarks for the native hot
//! paths. Emits operation counts, nanoseconds, and an integer fold so a run
//! can be checked for both cost and deterministic work actually performed.
const std = @import("std");
const q128_mod = @import("fixed_point_q128.zig");
const cognitive = @import("aiwo_cognitive.zig");
const checkpoint = @import("aiwo_chunk_checkpoint.zig");
const dhtd = @import("dhtd");
const seal = dhtd.seal;

const Q128 = q128_mod.Q128;

const Bench = struct {
    iterations: u64,
    ns: u64,
    ops_per_sec: u64,
    fold: u256,

    fn init(iterations: u64, ns: u64, fold: u256) Bench {
        const ops: u256 = @as(u256, iterations) * 1_000_000_000;
        const rate = @divTrunc(ops, @max(@as(u256, 1), @as(u256, ns)));
        return .{
            .iterations = iterations,
            .ns = ns,
            .ops_per_sec = @intCast(@min(rate, std.math.maxInt(u64))),
            .fold = fold,
        };
    }
};

fn benchQ128Mul(iterations: u64) !Bench {
    var timer = try std.time.Timer.start();
    var fold: i256 = 0;
    const b = Q128.fromRatio(7, 5) catch unreachable;
    for (0..iterations) |i| {
        const x = Q128.fromInteger(@as(i256, @intCast(i % 97)) + 1).add(Q128.one);
        fold +%= x.mul(b).raw;
    }
    return Bench.init(iterations, timer.read(), @as(u256, @intCast(fold & std.math.maxInt(i256))));
}

fn benchQ128Div(iterations: u64) !Bench {
    var timer = try std.time.Timer.start();
    var fold: i256 = 0;
    const divisor = Q128.fromRatio(11, 3) catch unreachable;
    for (0..iterations) |i| {
        const n = try Q128.fromRatio(@as(i256, @intCast(i % 89)) + 1, 7);
        fold +%= (try n.div(divisor)).raw;
    }
    return Bench.init(iterations, timer.read(), @as(u256, @intCast(fold & std.math.maxInt(i256))));
}

fn benchQ128Sqrt(iterations: u64) !Bench {
    var timer = try std.time.Timer.start();
    var fold: u256 = 0;
    for (0..iterations) |i| {
        const x = try Q128.fromRatio(@as(i256, @intCast(i % 997)) + 1, 97);
        fold +%= @as(u256, @intCast((try x.sqrt()).raw));
    }
    return Bench.init(iterations, timer.read(), fold);
}

fn benchFanoSeal(iterations: u64) !Bench {
    var timer = try std.time.Timer.start();
    var fold: u256 = 0;
    var payload: [seal.FANO_CAP]u8 = undefined;
    for (0..iterations) |i| {
        const n: u8 = @truncate(i);
        for (&payload, 0..) |*b, j| b.* = n +% @as(u8, @truncate(j));
        const len = @as(usize, n) % (seal.FANO_CAP + 1);
        const wire = seal.build(1, 2, 3, 4, 5, 6, @as(u32, @truncate(i)), payload[0..len]);
        fold +%= @as(u256, wire[seal.FANO_WIRE - 1]);
        fold +%= if (seal.verify(&wire)) @as(u256, 1) else 0;
    }
    return Bench.init(iterations, timer.read(), fold);
}

fn benchChunkCursor(iterations: u64) !Bench {
    if (iterations > std.math.maxInt(u64) / 512) return error.BenchmarkTooLarge;
    var timer = try std.time.Timer.start();
    var fold: u256 = 0;
    var executed: u256 = 0;
    for (0..iterations) |_| {
        const policy = try cognitive.ScalePolicy.forScale(7);
        var cursor = try cognitive.ChunkCursor.init(policy, 4096, 1024);
        while (cursor.next()) |chunk| {
            executed += 1;
            fold +%= chunk.receipt_fold +% @as(u256, @intCast(chunk.path_count));
        }
    }
    return Bench.init(iterations * 512, timer.read(), fold +% executed);
}

fn benchCheckpoint(iterations: u64) !Bench {
    var timer = try std.time.Timer.start();
    const alloc = std.heap.page_allocator;
    var path_buf: [128]u8 = undefined;
    const path = try std.fmt.bufPrint(&path_buf, "/tmp/spec007-perf-checkpoint-{x}.bin", .{std.crypto.random.int(u64)});
    defer std.fs.deleteFileAbsolute(path) catch {};
    var fold: u256 = 0;
    for (0..iterations) |i| {
        const expected = checkpoint.Checkpoint{
            .scale = 7,
            .chunk_size = 4096,
            .max_chunks = 1024,
            .next_chunk = @intCast(i),
            .receipt_fold = @as(u256, @intCast(i)) *% 0x9e3779b97f4a7c15,
        };
        try checkpoint.saveAtomic(alloc, path, expected);
        const actual = try checkpoint.load(alloc, path);
        if (actual.next_chunk != expected.next_chunk or actual.receipt_fold != expected.receipt_fold) return error.CheckpointMismatch;
        fold +%= actual.receipt_fold +% @as(u256, @intCast(actual.next_chunk));
    }
    return Bench.init(iterations, timer.read(), fold);
}

fn benchDhtdAssembler(iterations: u64) !Bench {
    var payload: [seal.FANO_CAP]u8 = [_]u8{0} ** seal.FANO_CAP;
    const data = "dhtd-request-assembler";
    payload[0] = 0;
    @memcpy(payload[1 .. data.len + 1], data);
    const frame = seal.build(1, 1, 1, 7, 7, 7, 17, payload[0 .. data.len + 1]);
    var req = std.ArrayList(u8).init(std.heap.page_allocator);
    defer req.deinit();
    var fold: u256 = 0;

    var timer = try std.time.Timer.start();
    for (0..iterations) |_| {
        var assembler = dhtd.RequestAssembler{};
        const verdict = try assembler.accept(&req, &frame);
        fold +%= @as(u256, @intCast(req.items.len + assembler.accepted + assembler.dropped + @intFromEnum(verdict)));
        req.clearRetainingCapacity();
    }
    return Bench.init(iterations, timer.read(), fold);
}

pub fn main() !void {
    const stdout = std.io.getStdOut().writer();
    const qmul = try benchQ128Mul(20_000);
    const qdiv = try benchQ128Div(2_000);
    const qsqrt = try benchQ128Sqrt(200);
    const fano = try benchFanoSeal(10_000);
    const chunks = try benchChunkCursor(8);
    const ckpt = try benchCheckpoint(16);
    const assembler = try benchDhtdAssembler(10_000);
    try stdout.print(
        "{{\"schema\":\"SPEC007-PERF-BENCH-v1\",\"q128_mul\":{{\"iterations\":{d},\"ns\":{d},\"ops_per_sec\":{d},\"fold\":\"{x}\"}},\"q128_div\":{{\"iterations\":{d},\"ns\":{d},\"ops_per_sec\":{d},\"fold\":\"{x}\"}},\"q128_sqrt\":{{\"iterations\":{d},\"ns\":{d},\"ops_per_sec\":{d},\"fold\":\"{x}\"}},\"fano_seal_verify\":{{\"iterations\":{d},\"ns\":{d},\"ops_per_sec\":{d},\"fold\":\"{x}\"}},\"aiwo_scale7_chunk_cursor\":{{\"iterations\":{d},\"ns\":{d},\"ops_per_sec\":{d},\"fold\":\"{x}\"}},\"aiwo_checkpoint_roundtrip\":{{\"iterations\":{d},\"ns\":{d},\"ops_per_sec\":{d},\"fold\":\"{x}\"}},\"dhtd_request_assembler\":{{\"iterations\":{d},\"ns\":{d},\"ops_per_sec\":{d},\"fold\":\"{x}\"}}}}\n",
        .{
            qmul.iterations,      qmul.ns,      qmul.ops_per_sec,      qmul.fold,
            qdiv.iterations,      qdiv.ns,      qdiv.ops_per_sec,      qdiv.fold,
            qsqrt.iterations,     qsqrt.ns,     qsqrt.ops_per_sec,     qsqrt.fold,
            fano.iterations,      fano.ns,      fano.ops_per_sec,      fano.fold,
            chunks.iterations,    chunks.ns,    chunks.ops_per_sec,    chunks.fold,
            ckpt.iterations,      ckpt.ns,      ckpt.ops_per_sec,      ckpt.fold,
            assembler.iterations, assembler.ns, assembler.ops_per_sec, assembler.fold,
        },
    );
}

test "performance benches produce deterministic nonzero folds" {
    const qmul = try benchQ128Mul(8);
    const fano = try benchFanoSeal(8);
    const assembler = try benchDhtdAssembler(8);
    try std.testing.expect(qmul.iterations == 8 and qmul.fold != 0);
    try std.testing.expect(fano.iterations == 8 and fano.fold != 0);
    try std.testing.expect(assembler.iterations == 8 and assembler.fold != 0);
}

test "performance boundaries saturate rates, sequence, and chunk totals" {
    const instant = Bench.init(std.math.maxInt(u64), 0, 0);
    try std.testing.expectEqual(std.math.maxInt(u64), instant.ops_per_sec);

    const full_cap = try benchFanoSeal(65);
    const short_cap = try benchFanoSeal(64);
    try std.testing.expect(full_cap.fold != short_cap.fold);

    try std.testing.expectError(error.BenchmarkTooLarge, benchChunkCursor(std.math.maxInt(u64)));

    const checkpoint_run = try benchCheckpoint(2);
    try std.testing.expectEqual(@as(u64, 2), checkpoint_run.iterations);
    try std.testing.expect(checkpoint_run.fold != 0);
}
