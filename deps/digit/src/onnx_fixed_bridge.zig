//! ONNX import boundary for canonical q128.128 values.
//!
//! ONNX FLOAT/INT32/INT64 initializers cross this module into deterministic
//! q128.128 tensors. Quantized/other dtypes remain raw blobs for their native
//! kernels. The conversion is explicit and never uses host floating-point.

const std = @import("std");
const fp = @import("fixed_point");

pub const FLOAT: u64 = 1;
pub const INT32: u64 = 6;
pub const INT64: u64 = 7;

pub const BridgeError = error{ UnsupportedDType, ByteLengthMismatch, InvalidValue };

pub const ImportAudit = struct {
    elements: usize = 0,
    exact: usize = 0,
    saturated: usize = 0,
    truncated: usize = 0,
    invalid: usize = 0,
};

pub fn isCanonicalTensorDType(data_type: u64) bool {
    return data_type == FLOAT or data_type == INT32 or data_type == INT64;
}

pub fn byteWidth(data_type: u64) BridgeError!usize {
    return switch (data_type) {
        FLOAT, INT32 => 4,
        INT64 => 8,
        else => error.UnsupportedDType,
    };
}

pub fn validateLength(data_type: u64, elements: usize, raw: []const u8) BridgeError!void {
    const width = try byteWidth(data_type);
    const expected = std.math.mul(usize, elements, width) catch return error.ByteLengthMismatch;
    if (raw.len != expected) return error.ByteLengthMismatch;
}

pub fn decodeAt(data_type: u64, raw: []const u8, index: usize) BridgeError!fp.Q128_128 {
    const width = try byteWidth(data_type);
    const start = std.math.mul(usize, index, width) catch return error.ByteLengthMismatch;
    const end = std.math.add(usize, start, width) catch return error.ByteLengthMismatch;
    if (end > raw.len) return error.ByteLengthMismatch;
    return switch (data_type) {
        FLOAT => fp.Q128_128.fromF32BitsSaturating(std.mem.readInt(u32, raw[start..][0..4], .little)) catch |err| switch (err) {
            error.InvalidValue => error.InvalidValue,
            error.Overflow => error.InvalidValue,
            error.DivisionByZero => error.InvalidValue,
        },
        INT32 => fp.Q128_128.fromInt(std.mem.readInt(i32, raw[start..][0..4], .little)),
        INT64 => fp.Q128_128.fromInt(std.mem.readInt(i64, raw[start..][0..8], .little)),
        else => error.UnsupportedDType,
    };
}

fn f32ImportTruncates(bits: u32) bool {
    const exponent = (bits >> 23) & 0xff;
    const fraction = bits & 0x7fffff;
    if (exponent == 0 and fraction == 0) return false;
    const mantissa: u64 = if (exponent == 0) fraction else (0x800000 | fraction);
    const binary_exponent: i32 = if (exponent == 0) -149 else @as(i32, @intCast(exponent)) - 127 - 23;
    const shift = binary_exponent + 128;
    if (shift >= 0) return false;
    const discarded: u6 = @intCast(@min(-shift, 63));
    return (mantissa & ((@as(u64, 1) << discarded) - 1)) != 0;
}

/// Classifies the import boundary without using host floating-point values.
/// Saturated values are finite f32 magnitudes outside the q128 integer range;
/// truncated values lose low-order mantissa bits below the 2^-128 q128 quantum.
pub fn audit(data_type: u64, elements: usize, raw: []const u8) BridgeError!ImportAudit {
    try validateLength(data_type, elements, raw);
    var result = ImportAudit{ .elements = elements };
    for (0..elements) |index| {
        switch (data_type) {
            FLOAT => {
                const bits = std.mem.readInt(u32, raw[index * 4 ..][0..4], .little);
                const exponent = (bits >> 23) & 0xff;
                if (exponent == 0xff) {
                    result.invalid += 1;
                    continue;
                }
                _ = fp.Q128_128.fromF32Bits(bits) catch |err| switch (err) {
                    error.Overflow => {
                        result.saturated += 1;
                        continue;
                    },
                    else => {
                        result.invalid += 1;
                        continue;
                    },
                };
                if (f32ImportTruncates(bits)) result.truncated += 1 else result.exact += 1;
            },
            INT32, INT64 => {
                _ = try decodeAt(data_type, raw, index);
                result.exact += 1;
            },
            else => return error.UnsupportedDType,
        }
    }
    return result;
}

test "ONNX bridge converts float32 and integer dtypes without host floats" {
    const one = [_]u8{ 0, 0, 128, 63 };
    try validateLength(FLOAT, 1, &one);
    try std.testing.expectEqual(fp.Q128_128.one.raw, (try decodeAt(FLOAT, &one, 0)).raw);
    const i32_bytes = [_]u8{ 253, 255, 255, 255 };
    try std.testing.expectEqual(fp.Q128_128.fromInt(-3).raw, (try decodeAt(INT32, &i32_bytes, 0)).raw);
    const i64_bytes = [_]u8{ 42, 0, 0, 0, 0, 0, 0, 0 };
    try std.testing.expectEqual(fp.Q128_128.fromInt(42).raw, (try decodeAt(INT64, &i64_bytes, 0)).raw);
}

test "ONNX bridge audit separates exact saturated truncated and invalid imports" {
    const payload = [_]u8{
        0, 0, 128, 63, // 1.0 exact
        255, 255, 127, 127, // max finite f32 saturates
        1, 0, 0, 0, // smallest f32 subnormal truncates below 2^-128
        1, 128, 0, 0, // smallest normal plus one truncates below 2^-128
        0, 0, 192, 127, // NaN invalid
    };
    const result = try audit(FLOAT, 5, &payload);
    try std.testing.expectEqual(@as(usize, 1), result.exact);
    try std.testing.expectEqual(@as(usize, 1), result.saturated);
    try std.testing.expectEqual(@as(usize, 2), result.truncated);
    try std.testing.expectEqual(@as(usize, 1), result.invalid);
}

test "ONNX bridge rejects unsupported or mismatched payloads" {
    try std.testing.expectError(error.UnsupportedDType, byteWidth(2));
    try std.testing.expectError(error.ByteLengthMismatch, validateLength(FLOAT, 2, &[_]u8{ 0, 0, 0, 0 }));
    try std.testing.expectError(error.InvalidValue, decodeAt(FLOAT, &[_]u8{ 0, 0, 128, 127 }, 0));
}
