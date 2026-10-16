//! Shared D12 experimental execution core for native and wasm32-freestanding
//! bridge lanes. This imports the upstream sibling SDK in place; it does not
//! vendor or modify the SDK source.

const std = @import("std");
const d12 = @import("d12");
const profile_mod = d12.profile;
const wide_module = d12.wide_module;
const wide_bytecode = d12.wide_bytecode;
const wide_exec = d12.wide_exec;
const wide_memory = d12.wide_memory;

pub const MAX_STACK = 16;
pub const REPORT_BYTES = 704;
pub const REPORT_MAGIC = "D12R";
pub const REPORT_VERSION: u8 = 1;

pub const Status = enum(u8) {
    ok = 0,
    bad_profile = 1,
    malformed_module = 2,
    profile_metadata = 3,
    malformed_bytecode = 4,
    execution = 5,
    resource = 6,
    out_of_memory = 7,
    report_overflow = 8,
    input_overflow = 255,
};

pub fn execute(
    allocator: std.mem.Allocator,
    wasm_bytes: []const u8,
    profile_id: u16,
    fuel: u64,
) [REPORT_BYTES]u8 {
    var report = std.mem.zeroes([REPORT_BYTES]u8);
    @memcpy(report[0..4], REPORT_MAGIC);
    report[4] = REPORT_VERSION;
    std.mem.writeInt(u16, report[6..8], profile_id, .little);
    std.crypto.hash.sha2.Sha256.hash(wasm_bytes, report[672..704], .{});

    const enabled = profileForId(profile_id) catch |err|
        return finishError(&report, err);
    var module = wide_module.parse(allocator, wasm_bytes, enabled) catch |err|
        return finishError(&report, err);
    defer module.deinit();

    const program = wide_bytecode.decodeModule(allocator, wasm_bytes, enabled) catch |err|
        return finishError(&report, err);
    defer allocator.free(program);

    var executor = wide_exec.Executor.init(allocator, &module, .{
        .fuel = fuel,
        .stack_cells = 1024,
        .memory = .{
            .segment_bytes = 64,
            .max_resident_bytes = 1 << 16,
            .max_segments = 256,
        },
    }) catch |err| return finishError(&report, err);
    defer executor.deinit();

    executor.run(program) catch |err| return finishError(&report, err);
    return finishSuccess(&report, &executor);
}

fn profileForId(profile_id: u16) !profile_mod.Profile {
    return switch (profile_id) {
        128 => profile_mod.Profile.experimental128(),
        256 => profile_mod.Profile.experimental256(),
        else => error.InvalidProfile,
    };
}

fn finishSuccess(report: *[REPORT_BYTES]u8, executor: *const wide_exec.Executor) [REPORT_BYTES]u8 {
    const stack_count = executor.stack.items.len;
    if (stack_count > MAX_STACK) {
        return finishError(report, error.ReportOverflow);
    }

    report[5] = @intFromEnum(Status.ok);
    std.mem.writeInt(u64, report[8..16], executor.fuel_left, .little);
    std.mem.writeInt(u32, report[16..20], @intCast(stack_count), .little);
    std.mem.writeInt(u32, report[20..24], @intCast(executor.memory.segments.items.len), .little);
    std.mem.writeInt(u64, report[24..32], executor.memory.resident_bytes, .little);
    std.mem.writeInt(u256, report[32..64], executor.memory.logical_size, .little);
    std.mem.writeInt(u256, report[64..96], executor.memory.logical_limit, .little);

    for (executor.stack.items, 0..) |value, i| {
        const start = 96 + i * 32;
        std.mem.writeInt(u256, report[start..][0..32], value, .little);
    }

    report[640..672].* = sparseDigest(&executor.memory);
    return report.*;
}

fn finishError(report: *[REPORT_BYTES]u8, err: anyerror) [REPORT_BYTES]u8 {
    const status = statusFor(err);
    report[5] = @intFromEnum(status);
    std.crypto.hash.sha2.Sha256.hash(@errorName(err), report[608..640], .{});
    return report.*;
}

fn statusFor(err: anyerror) Status {
    return switch (err) {
        error.InvalidProfile,
        error.ProfileMismatch,
        error.UnsupportedProfile,
        error.ExperimentalProfileRequiresSdkMetadata,
        error.MissingProfileMetadata,
        error.MalformedProfileMetadata,
        => .profile_metadata,
        error.MalformedModule,
        error.Truncated,
        => .malformed_module,
        error.MissingCodeSection,
        error.MalformedCode,
        error.UnsupportedVersion,
        error.UnknownOpcode,
        error.DuplicateCodeSection,
        error.InvalidBranchTarget,
        => .malformed_bytecode,
        error.FuelExhausted,
        error.StackOverflow,
        error.StackUnderflow,
        error.InvalidOperation,
        error.StandardVmPathRefused,
        error.WideProfileRequired,
        => .execution,
        error.InvalidSegmentSize,
        error.EmptyRange,
        error.MisalignedBase,
        error.AddressOverflow,
        error.OutOfBounds,
        error.Overlap,
        error.Unmapped,
        error.HostAllocationCap,
        error.SegmentLimit,
        error.AddressWidthOverflow,
        error.NarrowingOverflow,
        => .resource,
        error.OutOfMemory => .out_of_memory,
        error.ReportOverflow => .report_overflow,
        else => .execution,
    };
}

fn sparseDigest(memory: *const wide_memory.SparseMemory) [32]u8 {
    var out: [32]u8 = undefined;
    var h = std.crypto.hash.sha2.Sha256.init(.{});
    var buf: [32]u8 = undefined;
    h.update("D12SPARSE1");
    std.mem.writeInt(u32, buf[0..4], @intCast(memory.segments.items.len), .little);
    h.update(buf[0..4]);
    std.mem.writeInt(u64, buf[0..8], memory.resident_bytes, .little);
    h.update(buf[0..8]);
    std.mem.writeInt(u256, &buf, memory.logical_size, .little);
    h.update(&buf);
    std.mem.writeInt(u256, &buf, memory.logical_limit, .little);
    h.update(&buf);
    for (memory.segments.items) |segment| {
        std.mem.writeInt(u256, &buf, segment.base, .little);
        h.update(&buf);
        std.mem.writeInt(u64, buf[0..8], @intCast(segment.bytes.len), .little);
        h.update(buf[0..8]);
        h.update(segment.bytes);
    }
    h.final(&out);
    return out;
}

test "canonical report executes the upstream wide fixture deterministically" {
    const wasm = try std.fs.cwd().readFileAlloc(
        std.testing.allocator,
        "../D12/d12-wasmrt-sdk/tests/fixtures/wide_sample.wasm",
        1 << 20,
    );
    defer std.testing.allocator.free(wasm);
    const a = execute(std.testing.allocator, wasm, 128, 1024);
    const b = execute(std.testing.allocator, wasm, 128, 1024);
    try std.testing.expectEqual(Status.ok, @as(Status, @enumFromInt(a[5])));
    try std.testing.expectEqualSlices(u8, &a, &b);
}
