//! Native D12 bridge adapter. Reads a profile-marked module, executes the
//! upstream D12 experimental adapter, and emits a canonical D12R report.

const std = @import("std");
const core = @import("d12_dual_core.zig");

fn usage(w: anytype) !void {
    try w.print(
        "usage: d12_native_adapter --module PATH --profile 128|256 --fuel N\n",
        .{},
    );
}

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();
    const args = try std.process.argsAlloc(allocator);
    defer std.process.argsFree(allocator, args);
    const stdout = std.io.getStdOut().writer();

    var module_path: ?[]const u8 = null;
    var profile_id: u16 = 0;
    var fuel: u64 = 1024;
    var i: usize = 1;
    while (i < args.len) : (i += 1) {
        const arg = args[i];
        if (std.mem.eql(u8, arg, "--module") and i + 1 < args.len) {
            i += 1;
            module_path = args[i];
        } else if (std.mem.eql(u8, arg, "--profile") and i + 1 < args.len) {
            i += 1;
            profile_id = try std.fmt.parseInt(u16, args[i], 10);
        } else if (std.mem.eql(u8, arg, "--fuel") and i + 1 < args.len) {
            i += 1;
            fuel = try std.fmt.parseInt(u64, args[i], 10);
        } else if (std.mem.eql(u8, arg, "--help")) {
            try usage(stdout);
            return;
        } else {
            try usage(stdout);
            return error.InvalidArguments;
        }
    }
    const path = module_path orelse {
        try usage(stdout);
        return error.MissingModule;
    };

    const wasm = try std.fs.cwd().readFileAlloc(allocator, path, 1 << 20);
    defer allocator.free(wasm);
    const report = core.execute(allocator, wasm, profile_id, fuel);
    try stdout.print(
        "status={d}\nreport={s}\n",
        .{ report[5], std.fmt.fmtSliceHexLower(&report) },
    );
}
