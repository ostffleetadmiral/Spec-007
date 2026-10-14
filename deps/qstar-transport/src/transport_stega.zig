//! transport_stega.zig — LSB steganography transport.
//!
//! Extracted from StegaShare (#11).
//! LSB bit replacement in pixel channels. This boundary carries bytes only;
//! confidentiality belongs to the sealed payload, not this module.

const std = @import("std");

pub const PIXEL_BYTES: usize = 3;
pub const HEADER_BITS: usize = 64;
pub const HEADER_MAGIC: [4]u8 = .{ 'S', 'T', 'G', '1' };

/// Embeds data into image pixels using LSB steganography.
/// Format: [magic 4B][data_len 4B][data bytes LSB-encoded in pixels]
pub fn encode(allocator: std.mem.Allocator, data: []const u8, pixels: []u8) ![]u8 {
    if (data.len > std.math.maxInt(u32)) return error.PayloadTooLarge;
    const data_bits = std.math.mul(usize, data.len, 8) catch return error.PayloadTooLarge;
    const total_bits = std.math.add(usize, data_bits, HEADER_BITS) catch return error.PayloadTooLarge;
    const padded_bits = std.math.add(usize, total_bits, PIXEL_BYTES - 1) catch return error.PayloadTooLarge;
    const required_pixels = padded_bits / PIXEL_BYTES;
    const required_bytes = std.math.mul(usize, required_pixels, PIXEL_BYTES) catch return error.PayloadTooLarge;
    if (pixels.len < required_bytes) return error.ImageTooSmall;

    const out = try allocator.dupe(u8, pixels);
    errdefer allocator.free(out);

    var bit_stream = std.ArrayList(bool).init(allocator);
    defer bit_stream.deinit();

    for (HEADER_MAGIC) |b| {
        var bit: u8 = 0;
        while (bit < 8) : (bit += 1) {
            try bit_stream.append((b >> @intCast(bit)) & 1 == 1);
        }
    }

    const data_len: u32 = @intCast(data.len);
    var byte_idx: u8 = 0;
    while (byte_idx < 4) : (byte_idx += 1) {
        const len_byte: u8 = @intCast((data_len >> @intCast(byte_idx * 8)) & 0xFF);
        var bit: u8 = 0;
        while (bit < 8) : (bit += 1) {
            try bit_stream.append((len_byte >> @intCast(bit)) & 1 == 1);
        }
    }

    for (data) |byte| {
        var b: u8 = 0;
        while (b < 8) : (b += 1) {
            try bit_stream.append((byte >> @intCast(b)) & 1 == 1);
        }
    }

    for (bit_stream.items, 0..) |bit_val, i| {
        const pixel_idx = (i / PIXEL_BYTES) * PIXEL_BYTES + (i % PIXEL_BYTES);
        if (pixel_idx >= out.len) break;
        out[pixel_idx] = (out[pixel_idx] & 0xFE) | (@as(u8, if (bit_val) 1 else 0));
    }

    return out;
}

/// Extracts data from stego image pixels.
pub fn decode(allocator: std.mem.Allocator, pixels: []const u8) ![]u8 {
    if (pixels.len < HEADER_BITS) return error.ImageTooSmall;

    var bit_idx: usize = 0;
    var magic: [4]u8 = undefined;
    for (0..4) |b_idx| {
        var byte: u8 = 0;
        var bit: u8 = 0;
        while (bit < 8) : (bit += 1) {
            const pixel_idx = (bit_idx / PIXEL_BYTES) * PIXEL_BYTES + (bit_idx % PIXEL_BYTES);
            if (pixel_idx >= pixels.len) return error.TruncatedData;
            byte |= (pixels[pixel_idx] & 1) << @intCast(bit);
            bit_idx += 1;
        }
        magic[b_idx] = byte;
    }

    if (!std.mem.eql(u8, &magic, &HEADER_MAGIC)) return error.InvalidStegoMagic;

    var data_len: u32 = 0;
    {
        var byte_idx: u8 = 0;
        while (byte_idx < 4) : (byte_idx += 1) {
            var byte: u8 = 0;
            var bit: u8 = 0;
            while (bit < 8) : (bit += 1) {
                const pixel_idx = (bit_idx / PIXEL_BYTES) * PIXEL_BYTES + (bit_idx % PIXEL_BYTES);
                if (pixel_idx >= pixels.len) return error.TruncatedData;
                byte |= (pixels[pixel_idx] & 1) << @intCast(bit);
                bit_idx += 1;
            }
            data_len |= @as(u32, byte) << @intCast(byte_idx * 8);
        }
    }

    const declared_bits = std.math.mul(usize, @as(usize, data_len), 8) catch return error.InvalidDataLength;
    if (declared_bits > pixels.len - bit_idx) return error.InvalidDataLength;

    const out = try allocator.alloc(u8, data_len);
    errdefer allocator.free(out);

    for (0..data_len) |b_idx| {
        var byte: u8 = 0;
        var bit: u8 = 0;
        while (bit < 8) : (bit += 1) {
            const pixel_idx = (bit_idx / PIXEL_BYTES) * PIXEL_BYTES + (bit_idx % PIXEL_BYTES);
            if (pixel_idx >= pixels.len) return error.TruncatedData;
            byte |= (pixels[pixel_idx] & 1) << @intCast(bit);
            bit_idx += 1;
        }
        out[b_idx] = byte;
    }

    return out;
}

/// Computes the maximum data capacity for a given image size.
pub fn maxCapacity(pixel_count: usize) usize {
    const cover_bits = std.math.mul(usize, pixel_count, PIXEL_BYTES) catch return std.math.maxInt(usize);
    if (cover_bits <= HEADER_BITS) return 0;
    return (cover_bits - HEADER_BITS) / 8;
}

/// Registry slot weight — one medium occupies one transport slot.
/// Not a byte capacity: payload fitness is proven by round-trip,
/// never claimed (see spec008_qstar_carriage.zig).
pub fn capacity() usize {
    return 1;
}

pub fn name() []const u8 {
    return "stega";
}

// Tests

test "stega encode/decode round trip" {
    const allocator = std.testing.allocator;
    const data = "Stega test!";
    const pixels = try allocator.alloc(u8, 1024);
    defer allocator.free(pixels);
    @memset(pixels, 128);

    const encoded = try encode(allocator, data, pixels);
    defer allocator.free(encoded);

    const decoded = try decode(allocator, encoded);
    defer allocator.free(decoded);

    try std.testing.expectEqualSlices(u8, data, decoded);
}

test "stega image too small" {
    const allocator = std.testing.allocator;
    const data = "too long for tiny image";
    const pixels = try allocator.alloc(u8, 10);
    defer allocator.free(pixels);

    try std.testing.expectError(error.ImageTooSmall, encode(allocator, data, pixels));
}

test "stega max capacity" {
    try std.testing.expectEqual(@as(usize, 0), maxCapacity(10));
    try std.testing.expect(maxCapacity(1000) > 0);
}

test "stega name" {
    try std.testing.expectEqualStrings("stega", name());
}
