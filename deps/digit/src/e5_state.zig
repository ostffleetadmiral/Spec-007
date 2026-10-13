//! E5 model-state boundary. This stores deterministic fixed-point values only.

const std = @import("std");
const fp = @import("fixed_point");

pub const E5State = struct {
    allocator: std.mem.Allocator,
    values_buf: []fp.Q128_128,

    pub fn init(allocator: std.mem.Allocator, length: usize) !E5State {
        const allocated = try allocator.alloc(fp.Q128_128, length);
        @memset(allocated, fp.Q128_128.zero);
        return .{ .allocator = allocator, .values_buf = allocated };
    }

    pub fn deinit(self: *E5State) void {
        self.allocator.free(self.values_buf);
        self.values_buf = &.{};
    }

    pub fn values(self: *const E5State) []const fp.Q128_128 {
        return self.values_buf;
    }

    pub fn load(self: *E5State, input: []const fp.Q128_128) !void {
        if (input.len != self.values_buf.len) return error.LengthMismatch;
        @memcpy(self.values_buf, input);
    }

    pub fn reset(self: *E5State) void {
        @memset(self.values_buf, fp.Q128_128.zero);
    }
};

test "E5 state loads and resets" {
    var state = try E5State.init(std.testing.allocator, 2);
    defer state.deinit();
    const input = [_]fp.Q128_128{ fp.Q128_128.fromInt(3), fp.Q128_128.fromInt(-2) };
    try state.load(&input);
    try std.testing.expectEqual(input[0].raw, state.values()[0].raw);
    state.reset();
    try std.testing.expectEqual(@as(i256, 0), state.values()[1].raw);
}
