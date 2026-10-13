//! Bounded tensor-upload session shared by the native CLI and the Wasm ABI.
//! Hosts push little-endian q128 tensors one at a time through pointer/length
//! buffers; the session validates bounds, decodes into the shared tensor store,
//! and folds a deterministic checksum so both targets can verify bit-identical
//! arrival without exposing the store itself.

const std = @import("std");
const fp = @import("fixed_point");
const exec = @import("graph_exec");

pub const MAX_NAME_LEN: usize = 256;
pub const MAX_ELEMENTS: usize = 1 << 24;
pub const MAX_TOTAL_BYTES: usize = 1 << 31;

pub const UploadError = error{
    NotInitialized,
    EmptyName,
    NameTooLong,
    TooManyDims,
    MisalignedData,
    ElementMismatch,
    TensorTooLarge,
    TotalTooLarge,
    UnsupportedShape,
    OutOfMemory,
};

pub const VerifyResult = struct {
    checksum: u256,
    count: u32,
};

pub const Session = struct {
    allocator: std.mem.Allocator,
    store: exec.TensorStore,
    checksum: u256 = 0,
    count: u32 = 0,
    total_bytes: usize = 0,

    pub fn init(allocator: std.mem.Allocator) Session {
        return .{
            .allocator = allocator,
            .store = exec.TensorStore.init(allocator),
        };
    }

    pub fn deinit(self: *Session) void {
        self.store.deinit();
    }

    /// Uploads one little-endian q128 tensor. `dims64` are the tensor extents
    /// (rank <= MAX_RANK) and `data` must be exactly product(dims)*32 bytes.
    pub fn upload(self: *Session, name: []const u8, dims64: []const u64, data: []const u8) UploadError!void {
        if (self.total_bytes + data.len > MAX_TOTAL_BYTES) return error.TotalTooLarge;
        const tensor = try decodeQ128(&self.store, self.allocator, name, dims64, data);
        self.total_bytes += data.len;
        self.count += 1;
        self.checksum = (self.checksum +% nameFold(name) +% tensor.checksum()) *% 0x9e3779b97f4a7c15;
    }

    fn nameFold(name: []const u8) u256 {
        var result: u256 = name.len;
        for (name) |byte| result = (result +% @as(u256, byte)) *% 0x9e3779b97f4a7c15;
        return result;
    }
};

/// Validates bounds and decodes one little-endian q128 tensor into `store`.
/// Returns a shallow copy of the stored tensor for checksum purposes.
pub fn decodeQ128(
    store: *exec.TensorStore,
    allocator: std.mem.Allocator,
    name: []const u8,
    dims64: []const u64,
    data: []const u8,
) UploadError!exec.Tensor {
    if (name.len == 0) return error.EmptyName;
    if (name.len > MAX_NAME_LEN) return error.NameTooLong;
    if (dims64.len > exec.MAX_RANK) return error.TooManyDims;
    if (data.len % 32 != 0) return error.MisalignedData;

    var count: usize = 1;
    var dims_buf: [exec.MAX_RANK]usize = undefined;
    for (dims64, 0..) |dim, index| {
        if (dim > std.math.maxInt(usize)) return error.UnsupportedShape;
        dims_buf[index] = @intCast(dim);
        count = std.math.mul(usize, count, dims_buf[index]) catch return error.TensorTooLarge;
    }
    if (count > MAX_ELEMENTS) return error.TensorTooLarge;
    if (count != data.len / 32) return error.ElementMismatch;

    var tensor = exec.Tensor.init(allocator, dims_buf[0..dims64.len]) catch |err| switch (err) {
        error.OutOfMemory => return error.OutOfMemory,
        error.UnsupportedShape => return error.UnsupportedShape,
    };
    errdefer tensor.deinit(allocator);
    for (tensor.data, 0..) |*value, index| {
        var encoded: [32]u8 = undefined;
        @memcpy(&encoded, data[index * 32 .. (index + 1) * 32]);
        value.* = fp.Q128_128.fromLittleEndian(encoded);
    }
    store.putTensor(name, tensor) catch return error.OutOfMemory;
    return tensor;
}

/// Deterministic upload sequence used to verify the bounded upload path is
/// bit-identical on native and Wasm. Uploads three q128 tensors of differing
/// rank through the real `Session.upload` validation path.
pub fn runVerifySequence(allocator: std.mem.Allocator) !VerifyResult {
    var session = Session.init(allocator);
    defer session.deinit();

    const scalar_dims = [_]u64{};
    const scalar_data = fp.Q128_128.fromInt(7).toLittleEndian();
    try session.upload("scalar", &scalar_dims, &scalar_data);

    const vector_dims = [_]u64{4};
    var vector_data: [4 * 32]u8 = undefined;
    const vector_values = [_]fp.Q128_128{
        fp.Q128_128.fromInt(-3),
        try fp.Q128_128.fromInt(1).div(fp.Q128_128.fromInt(16)),
        fp.Q128_128.fromInt(1024),
        try fp.Q128_128.fromInt(-5).div(fp.Q128_128.fromInt(7)),
    };
    for (vector_values, 0..) |value, index| {
        @memcpy(vector_data[index * 32 ..][0..32], &value.toLittleEndian());
    }
    try session.upload("vector", &vector_dims, &vector_data);

    const matrix_dims = [_]u64{ 2, 3 };
    var matrix_data: [6 * 32]u8 = undefined;
    for (0..6) |index| {
        const numerator = fp.Q128_128.fromInt(@intCast(@as(i64, @intCast(index)) - 2));
        const value = try numerator.div(fp.Q128_128.fromInt(@intCast(index + 3)));
        @memcpy(matrix_data[index * 32 ..][0..32], &value.toLittleEndian());
    }
    try session.upload("matrix", &matrix_dims, &matrix_data);

    return .{ .checksum = session.checksum, .count = session.count };
}

test "upload validates bounds and folds a deterministic checksum" {
    const allocator = std.testing.allocator;
    var session = Session.init(allocator);
    defer session.deinit();

    const dims = [_]u64{2};
    var data: [64]u8 = undefined;
    @memcpy(data[0..32], &fp.Q128_128.fromInt(1).toLittleEndian());
    @memcpy(data[32..64], &fp.Q128_128.fromInt(-2).toLittleEndian());
    try session.upload("ok", &dims, &data);
    try std.testing.expectEqual(@as(u32, 1), session.count);

    try std.testing.expectError(error.MisalignedData, session.upload("bad", &dims, data[0..33]));
    try std.testing.expectError(error.ElementMismatch, session.upload("bad", &dims, data[0..32]));
    const too_many = [_]u64{1} ** (exec.MAX_RANK + 1);
    try std.testing.expectError(error.TooManyDims, session.upload("bad", &too_many, &.{}));
    const huge = [_]u64{MAX_ELEMENTS + 1};
    try std.testing.expectError(error.TensorTooLarge, session.upload("bad", &huge, &.{}));
}

test "verify sequence is deterministic" {
    const allocator = std.testing.allocator;
    const first = try runVerifySequence(allocator);
    const second = try runVerifySequence(allocator);
    try std.testing.expectEqual(@as(u32, 3), first.count);
    try std.testing.expectEqual(first.checksum, second.checksum);
}
