const std = @import("std");
const fp = @import("fixed_point");
const ops = @import("tensor_ops");
const weights = @import("onnx_weights");

pub const QwenEmbedding = struct {
    allocator: std.mem.Allocator,
    base_dir: []u8,
    index: weights.WeightIndex,
    /// Optional shared-shard cache; when set, embed() skips per-token
    /// open/seek/close on the embedding shards. Bytes are identical.
    shards: ?*weights.ShardCache = null,
    row_count: usize,
    embedding_dim: usize,
    scale_count: usize,
    zero_count: usize,

    pub fn init(allocator: std.mem.Allocator, model_path: []const u8) !QwenEmbedding {
        const bytes = try std.fs.cwd().readFileAlloc(allocator, model_path, 1 << 34);
        defer allocator.free(bytes);
        var index = try weights.indexModel(allocator, bytes);
        errdefer index.deinit();
        const quant = index.find("model_embed_tokens_weight_quant") orelse return error.TensorNotFound;
        const scales = index.find("model_embed_tokens_weight_scales") orelse return error.TensorNotFound;
        const zeros = index.find("model_embed_tokens_weight_zp") orelse return error.TensorNotFound;
        if (quant.dims.items.len != 2 or scales.dims.items.len != 2 or zeros.dims.items.len != 2) return error.UnsupportedShape;
        const base = std.fs.path.dirname(model_path) orelse ".";
        return .{
            .allocator = allocator,
            .base_dir = try allocator.dupe(u8, base),
            .index = index,
            .row_count = @intCast(quant.dims.items[0]),
            .embedding_dim = @intCast(quant.dims.items[1] * 2),
            .scale_count = @intCast(scales.dims.items[1]),
            .zero_count = @intCast(zeros.dims.items[1]),
        };
    }

    pub fn deinit(self: *QwenEmbedding) void {
        self.allocator.free(self.base_dir);
        self.index.deinit();
    }

    pub fn embed(self: *const QwenEmbedding, output: []fp.Q128_128, row: usize) !void {
        if (row >= self.row_count or output.len != self.embedding_dim or self.scale_count * 32 != self.embedding_dim or self.zero_count * 2 != self.scale_count) return error.InvalidRow;
        const packed_values = try self.readShard("model_embed_tokens_weight_quant", @intCast(row * (self.embedding_dim / 2)), @intCast(self.embedding_dim / 2));
        defer self.allocator.free(packed_values);
        const scale_bytes = try self.readShard("model_embed_tokens_weight_scales", @intCast(row * self.scale_count * 4), @intCast(self.scale_count * 4));
        defer self.allocator.free(scale_bytes);
        const zero_bytes = try self.readShard("model_embed_tokens_weight_zp", @intCast(row * self.zero_count), @intCast(self.zero_count));
        defer self.allocator.free(zero_bytes);
        const scales = try self.allocator.alloc(fp.Q128_128, self.scale_count);
        defer self.allocator.free(scales);
        for (scales, 0..) |*scale, index| scale.* = try fp.Q128_128.fromF32Bits(std.mem.readInt(u32, scale_bytes[index * 4 ..][0..4], .little));
        try ops.decode4BitRow(output, packed_values, scales, zero_bytes, 32);
    }

    fn readShard(self: *const QwenEmbedding, name: []const u8, offset: u64, length: u64) ![]u8 {
        if (self.shards) |cache| {
            return self.index.readSliceCached(self.allocator, cache, name, offset, length);
        }
        return self.index.readSlice(self.allocator, self.base_dir, name, offset, length);
    }
};

test "embedding session validates missing model" {
    try std.testing.expectError(error.FileNotFound, QwenEmbedding.init(std.testing.allocator, "missing-qwen-model.onnx"));
}
