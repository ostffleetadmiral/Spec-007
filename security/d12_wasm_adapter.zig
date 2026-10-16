//! Freestanding WASM adapter for the upstream D12 experimental path. The
//! browser lane uses a bounded input window and a fixed canonical D12R report;
//! no host imports, DOM, storage, or network calls exist inside the artifact.

const std = @import("std");
const core = @import("d12_dual_core.zig");

var input: [1 << 20]u8 = undefined;
var report: [core.REPORT_BYTES]u8 = std.mem.zeroes([core.REPORT_BYTES]u8);

export fn d12_input_ptr() [*]u8 {
    return &input;
}

export fn d12_input_capacity() usize {
    return input.len;
}

export fn d12_report_ptr() [*]const u8 {
    return &report;
}

export fn d12_report_len() usize {
    return report.len;
}

export fn d12_exec(input_len: usize, profile_id: u16, fuel: u64) u8 {
    if (input_len > input.len) {
        report = std.mem.zeroes([core.REPORT_BYTES]u8);
        @memcpy(report[0..4], core.REPORT_MAGIC);
        report[4] = core.REPORT_VERSION;
        report[5] = @intFromEnum(core.Status.input_overflow);
        std.mem.writeInt(u16, report[6..8], profile_id, .little);
        return report[5];
    }
    report = core.execute(std.heap.wasm_allocator, input[0..input_len], profile_id, fuel);
    return report[5];
}
