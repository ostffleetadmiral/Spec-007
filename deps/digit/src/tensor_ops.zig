const std = @import("std");
const builtin = @import("builtin");
const fp = @import("fixed_point");

pub const Shape = struct {
    rows: usize,
    columns: usize,

    pub fn elements(self: Shape) !usize {
        return checkedMul(self.rows, self.columns);
    }
};

fn checkedMul(left: usize, right: usize) !usize {
    return std.math.mul(usize, left, right) catch error.TensorTooLarge;
}

fn checkedAdd(left: usize, right: usize) !usize {
    return std.math.add(usize, left, right) catch error.TensorTooLarge;
}

fn checkedMulAdd(left: usize, right: usize, addend: usize) !usize {
    return checkedAdd(try checkedMul(left, right), addend);
}

pub const AttentionShape = struct {
    heads: usize,
    query_length: usize,
    key_length: usize,
    head_size: usize,

    pub fn queryElements(self: AttentionShape) !usize {
        return checkedMul(try checkedMul(self.heads, self.query_length), self.head_size);
    }

    pub fn keyElements(self: AttentionShape) !usize {
        return checkedMul(try checkedMul(self.heads, self.key_length), self.head_size);
    }
};

/// exp(x) via range reduction: halve until |x| <= 1, Taylor-expand, then
/// square back up. Accurate across the decay/mask range the model uses.
pub fn expApprox(value: fp.Q128_128) !fp.Q128_128 {
    if (value.raw <= -16 * fp.SCALE) return fp.Q128_128.zero;
    if (value.raw >= 8 * fp.SCALE) return error.Overflow;
    var reduced = value;
    var shifts: usize = 0;
    while (reduced.raw > fp.SCALE or reduced.raw < -fp.SCALE) : (shifts += 1) {
        reduced = fp.Q128_128.fromRaw(fp.divTruncPow2I256(reduced.raw, 1));
    }
    var result = fp.Q128_128.one;
    var term = fp.Q128_128.one;
    var factorial: i64 = 1;
    for (1..13) |power| {
        factorial *= @intCast(power);
        term = try term.mul(reduced);
        if (term.raw == 0) break;
        result = try result.add(try term.div(fp.Q128_128.fromInt(factorial)));
    }
    while (shifts > 0) : (shifts -= 1) result = try result.mul(result);
    return result;
}

pub fn scaledDotProductAttention(
    output: []fp.Q128_128,
    query: []const fp.Q128_128,
    key: []const fp.Q128_128,
    value: []const fp.Q128_128,
    scratch: []fp.Q128_128,
    shape: AttentionShape,
    scale: fp.Q128_128,
) !void {
    const query_elements = try shape.queryElements();
    const key_elements = try shape.keyElements();
    if (query.len != query_elements or key.len != key_elements or
        value.len != key_elements or output.len != query_elements or
        scratch.len < shape.key_length) return error.ShapeMismatch;
    for (0..shape.heads) |head| {
        for (0..shape.query_length) |query_index| {
            var max_score: ?fp.Q128_128 = null;
            const query_row = try checkedMulAdd(head, shape.query_length, query_index);
            for (0..shape.key_length) |key_index| {
                var dot = fp.Q128_128.zero;
                const key_row = try checkedMulAdd(head, shape.key_length, key_index);
                for (0..shape.head_size) |dimension| {
                    const q_index = try checkedMulAdd(query_row, shape.head_size, dimension);
                    const k_index = try checkedMulAdd(key_row, shape.head_size, dimension);
                    dot = try dot.add(try query[q_index].mul(key[k_index]));
                }
                const score = try dot.mul(scale);
                scratch[key_index] = score;
                if (max_score == null or score.raw > max_score.?.raw) max_score = score;
            }
            var normalizer = fp.Q128_128.zero;
            for (0..shape.key_length) |key_index| {
                scratch[key_index] = try expApprox(try scratch[key_index].sub(max_score.?));
                normalizer = try normalizer.add(scratch[key_index]);
            }
            for (0..shape.head_size) |dimension| {
                var result = fp.Q128_128.zero;
                for (0..shape.key_length) |key_index| {
                    const value_row = try checkedMulAdd(head, shape.key_length, key_index);
                    const v_index = try checkedMulAdd(value_row, shape.head_size, dimension);
                    result = try result.add(try scratch[key_index].mul(try value[v_index].div(normalizer)));
                }
                const output_index = try checkedMulAdd(query_row, shape.head_size, dimension);
                output[output_index] = result;
            }
        }
    }
}

pub const GroupQueryShape = struct {
    batch: usize,
    query_length: usize,
    past_length: usize,
    query_heads: usize,
    kv_heads: usize,
    head_size: usize,
};

const MAX_GROUP_WORK = 128;
const supports_threads = switch (builtin.target.cpu.arch) {
    .wasm32, .wasm64 => false,
    else => true,
};

const GroupQueryGeometry = struct {
    total_length: usize,
    query_size: usize,
    current_size: usize,
    cache_size: usize,
    present_size: usize,
    mask_size: usize,
    bias_size: usize,
    work_count: usize,
    heads_per_batch: usize,
    head_group: usize,
};

fn groupQueryGeometry(shape: GroupQueryShape) !GroupQueryGeometry {
    if (shape.query_heads == 0 or shape.kv_heads == 0 or shape.query_heads % shape.kv_heads != 0) return error.ShapeMismatch;
    const total_length = try checkedAdd(shape.past_length, shape.query_length);
    const query_size = try checkedMul(try checkedMul(try checkedMul(shape.batch, shape.query_length), shape.query_heads), shape.head_size);
    const current_size = try checkedMul(try checkedMul(try checkedMul(shape.batch, shape.query_length), shape.kv_heads), shape.head_size);
    const cache_size = try checkedMul(try checkedMul(try checkedMul(shape.batch, shape.kv_heads), shape.past_length), shape.head_size);
    const present_size = try checkedMul(try checkedMul(try checkedMul(shape.batch, shape.kv_heads), total_length), shape.head_size);
    const mask_size = try checkedMul(try checkedMul(shape.batch, shape.query_length), total_length);
    const bias_size = try checkedMul(try checkedMul(try checkedMul(shape.batch, shape.query_heads), shape.query_length), total_length);
    const heads_per_batch = try checkedMul(shape.query_heads, shape.query_length);
    return .{
        .total_length = total_length,
        .query_size = query_size,
        .current_size = current_size,
        .cache_size = cache_size,
        .present_size = present_size,
        .mask_size = mask_size,
        .bias_size = bias_size,
        .work_count = try checkedMul(shape.batch, heads_per_batch),
        .heads_per_batch = heads_per_batch,
        .head_group = shape.query_heads / shape.kv_heads,
    };
}

const GroupQueryContext = struct {
    output: []fp.Q128_128,
    present_key: []const fp.Q128_128,
    present_value: []const fp.Q128_128,
    query: []const fp.Q128_128,
    additive_mask: []const fp.Q128_128,
    attention_bias: []const fp.Q128_128,
    scratch: []fp.Q128_128,
    scratch_per_work: bool,
    shape: GroupQueryShape,
    geometry: GroupQueryGeometry,
    scale: fp.Q128_128,
    errors: *[MAX_GROUP_WORK]?anyerror,
};

fn groupQueryWorker(context: *const GroupQueryContext, work_index: usize) !void {
    const shape = context.shape;
    const geometry = context.geometry;
    const batch = work_index / geometry.heads_per_batch;
    const remainder = work_index % geometry.heads_per_batch;
    const query_head = remainder / shape.query_length;
    const query_position = remainder % shape.query_length;
    const total_length = geometry.total_length;
    const kv_head = query_head / geometry.head_group;
    const batch_query = try checkedMulAdd(batch, shape.query_length, query_position);
    const query_base = try checkedMul(try checkedMulAdd(batch_query, shape.query_heads, query_head), shape.head_size);
    const scratch_index = if (context.scratch_per_work) work_index else 0;
    const scratch_base = try checkedMul(scratch_index, total_length);
    const scratch = context.scratch[scratch_base..][0..total_length];

    var max_score: ?fp.Q128_128 = null;
    for (0..total_length) |key_position| {
        var dot = fp.Q128_128.zero;
        const batch_key = try checkedMulAdd(batch, shape.kv_heads, kv_head);
        const key_base = try checkedMul(try checkedMulAdd(batch_key, total_length, key_position), shape.head_size);
        for (0..shape.head_size) |dimension| dot = try dot.add(try context.query[query_base + dimension].mul(context.present_key[key_base + dimension]));
        var score = try dot.mul(context.scale);
        if (context.additive_mask.len != 0) {
            const mask_index = try checkedMulAdd(batch_query, total_length, key_position);
            score = try score.add(context.additive_mask[mask_index]);
        }
        if (context.attention_bias.len != 0) {
            const batch_head = try checkedMulAdd(batch, shape.query_heads, query_head);
            const bias_index = try checkedMulAdd(try checkedMulAdd(batch_head, shape.query_length, query_position), total_length, key_position);
            score = try score.add(context.attention_bias[bias_index]);
        }
        scratch[key_position] = score;
        if (max_score == null or score.raw > max_score.?.raw) max_score = score;
    }
    var normalizer = fp.Q128_128.zero;
    for (0..total_length) |key_position| {
        scratch[key_position] = try expApprox(try scratch[key_position].sub(max_score.?));
        normalizer = try normalizer.add(scratch[key_position]);
    }
    for (0..shape.head_size) |dimension| {
        var result = fp.Q128_128.zero;
        for (0..total_length) |key_position| {
            const batch_key = try checkedMulAdd(batch, shape.kv_heads, kv_head);
            const value_base = try checkedMul(try checkedMulAdd(batch_key, total_length, key_position), shape.head_size);
            result = try result.add(try scratch[key_position].mul(try context.present_value[value_base + dimension].div(normalizer)));
        }
        context.output[query_base + dimension] = result;
    }
}

fn groupQueryParallelWorker(context: *GroupQueryContext, work_index: usize) void {
    groupQueryWorker(context, work_index) catch |err| {
        context.errors[work_index] = err;
    };
}

pub fn groupQueryAttention(
    output: []fp.Q128_128,
    present_key: []fp.Q128_128,
    present_value: []fp.Q128_128,
    query: []const fp.Q128_128,
    key: []const fp.Q128_128,
    value: []const fp.Q128_128,
    past_key: []const fp.Q128_128,
    past_value: []const fp.Q128_128,
    additive_mask: []const fp.Q128_128,
    attention_bias: []const fp.Q128_128,
    scratch: []fp.Q128_128,
    shape: GroupQueryShape,
    scale: fp.Q128_128,
) !void {
    const geometry = try groupQueryGeometry(shape);
    const total_length = geometry.total_length;
    if (output.len != geometry.query_size or query.len != geometry.query_size or
        key.len != geometry.current_size or value.len != geometry.current_size or
        past_key.len != geometry.cache_size or past_value.len != geometry.cache_size or
        present_key.len != geometry.present_size or present_value.len != geometry.present_size or
        scratch.len < total_length or
        (additive_mask.len != 0 and additive_mask.len != geometry.mask_size) or
        (attention_bias.len != 0 and attention_bias.len != geometry.bias_size)) return error.ShapeMismatch;
    for (0..shape.batch) |batch| {
        for (0..shape.kv_heads) |kv_head| {
            for (0..total_length) |position| {
                const batch_cache = try checkedMulAdd(batch, shape.kv_heads, kv_head);
                const present_base = try checkedMul(try checkedMulAdd(batch_cache, total_length, position), shape.head_size);
                if (position < shape.past_length) {
                    const past_base = try checkedMul(try checkedMulAdd(batch_cache, shape.past_length, position), shape.head_size);
                    @memcpy(present_key[present_base .. present_base + shape.head_size], past_key[past_base .. past_base + shape.head_size]);
                    @memcpy(present_value[present_base .. present_base + shape.head_size], past_value[past_base .. past_base + shape.head_size]);
                } else {
                    const current_position = position - shape.past_length;
                    const batch_query = try checkedMulAdd(batch, shape.query_length, current_position);
                    const current_base = try checkedMulAdd(try checkedMul(batch_query, shape.kv_heads), shape.head_size, try checkedMul(kv_head, shape.head_size));
                    @memcpy(present_key[present_base .. present_base + shape.head_size], key[current_base .. current_base + shape.head_size]);
                    @memcpy(present_value[present_base .. present_base + shape.head_size], value[current_base .. current_base + shape.head_size]);
                }
            }
        }
    }
    const work_count = geometry.work_count;
    const parallel = supports_threads and work_count > 1 and work_count <= MAX_GROUP_WORK;
    const scratch_count = if (parallel) work_count else 1;
    if (scratch.len < try checkedMul(total_length, scratch_count)) return error.ShapeMismatch;
    var errors: [MAX_GROUP_WORK]?anyerror = .{null} ** MAX_GROUP_WORK;
    var context = GroupQueryContext{
        .output = output,
        .present_key = present_key,
        .present_value = present_value,
        .query = query,
        .additive_mask = additive_mask,
        .attention_bias = attention_bias,
        .scratch = scratch,
        .scratch_per_work = parallel,
        .shape = shape,
        .geometry = geometry,
        .scale = scale,
        .errors = &errors,
    };
    if (comptime supports_threads) {
        if (!parallel) {
            for (0..work_count) |work_index| try groupQueryWorker(&context, work_index);
            return;
        }
        var threads: [MAX_GROUP_WORK]?std.Thread = .{null} ** MAX_GROUP_WORK;
        for (0..work_count) |work_index| {
            context.errors[work_index] = null;
            threads[work_index] = std.Thread.spawn(.{}, groupQueryParallelWorker, .{ &context, work_index }) catch null;
            if (threads[work_index] == null) groupQueryParallelWorker(&context, work_index);
        }
        for (threads[0..work_count]) |thread| if (thread) |thread_handle| thread_handle.join();
        for (context.errors[0..work_count]) |err| if (err) |failure| return failure;
        return;
    }
    for (0..work_count) |work_index| try groupQueryWorker(&context, work_index);
}

/// Fast-tier variant (ADR-0024): identical dataflow in deterministic
/// single-threaded f64, with Q128 values only at the tensor boundary.
/// `present_key`/`present_value` remain exact Q128 copies of the recurrent
/// inputs so the KV cache loses no precision from the conversion.
pub fn groupQueryAttentionF64(
    allocator: std.mem.Allocator,
    output: []fp.Q128_128,
    present_key: []fp.Q128_128,
    present_value: []fp.Q128_128,
    query: []const fp.Q128_128,
    key: []const fp.Q128_128,
    value: []const fp.Q128_128,
    past_key: []const fp.Q128_128,
    past_value: []const fp.Q128_128,
    additive_mask: []const fp.Q128_128,
    attention_bias: []const fp.Q128_128,
    shape: GroupQueryShape,
    scale: fp.Q128_128,
) !void {
    const geometry = try groupQueryGeometry(shape);
    const total_length = geometry.total_length;
    if (output.len != geometry.query_size or query.len != geometry.query_size or
        key.len != geometry.current_size or value.len != geometry.current_size or
        past_key.len != geometry.cache_size or past_value.len != geometry.cache_size or
        present_key.len != geometry.present_size or present_value.len != geometry.present_size or
        (additive_mask.len != 0 and additive_mask.len != geometry.mask_size) or
        (attention_bias.len != 0 and attention_bias.len != geometry.bias_size)) return error.ShapeMismatch;
    for (0..shape.batch) |batch| {
        for (0..shape.kv_heads) |kv_head| {
            for (0..total_length) |position| {
                const batch_cache = try checkedMulAdd(batch, shape.kv_heads, kv_head);
                const present_base = try checkedMul(try checkedMulAdd(batch_cache, total_length, position), shape.head_size);
                if (position < shape.past_length) {
                    const past_base = try checkedMul(try checkedMulAdd(batch_cache, shape.past_length, position), shape.head_size);
                    @memcpy(present_key[present_base .. present_base + shape.head_size], past_key[past_base .. past_base + shape.head_size]);
                    @memcpy(present_value[present_base .. present_base + shape.head_size], past_value[past_base .. past_base + shape.head_size]);
                } else {
                    const current_position = position - shape.past_length;
                    const batch_query = try checkedMulAdd(batch, shape.query_length, current_position);
                    const current_base = try checkedMulAdd(try checkedMul(batch_query, shape.kv_heads), shape.head_size, try checkedMul(kv_head, shape.head_size));
                    @memcpy(present_key[present_base .. present_base + shape.head_size], key[current_base .. current_base + shape.head_size]);
                    @memcpy(present_value[present_base .. present_base + shape.head_size], value[current_base .. current_base + shape.head_size]);
                }
            }
        }
    }
    const keys_f64 = try allocator.alloc(f64, geometry.present_size);
    defer allocator.free(keys_f64);
    const values_f64 = try allocator.alloc(f64, geometry.present_size);
    defer allocator.free(values_f64);
    const queries_f64 = try allocator.alloc(f64, geometry.query_size);
    defer allocator.free(queries_f64);
    const scratch = try allocator.alloc(f64, total_length);
    defer allocator.free(scratch);
    for (keys_f64, present_key) |*slot, element| slot.* = element.toF64();
    for (values_f64, present_value) |*slot, element| slot.* = element.toF64();
    for (queries_f64, query) |*slot, element| slot.* = element.toF64();
    const scale_f64 = scale.toF64();
    const head_group = geometry.head_group;
    for (0..shape.batch) |batch| {
        for (0..shape.query_heads) |query_head| {
            const kv_head = query_head / head_group;
            for (0..shape.query_length) |query_position| {
                const batch_query = try checkedMulAdd(batch, shape.query_length, query_position);
                const query_base = try checkedMul(try checkedMulAdd(batch_query, shape.query_heads, query_head), shape.head_size);
                var max_score: f64 = -std.math.inf(f64);
                for (0..total_length) |key_position| {
                    const batch_key = try checkedMulAdd(batch, shape.kv_heads, kv_head);
                    const key_base = try checkedMul(try checkedMulAdd(batch_key, total_length, key_position), shape.head_size);
                    var dot: f64 = 0;
                    for (0..shape.head_size) |dimension| dot += queries_f64[query_base + dimension] * keys_f64[key_base + dimension];
                    var score = dot * scale_f64;
                    if (additive_mask.len != 0) score += additive_mask[try checkedMulAdd(batch_query, total_length, key_position)].toF64();
                    if (attention_bias.len != 0) {
                        const batch_head = try checkedMulAdd(batch, shape.query_heads, query_head);
                        const bias_index = try checkedMulAdd(try checkedMulAdd(batch_head, shape.query_length, query_position), total_length, key_position);
                        score += attention_bias[bias_index].toF64();
                    }
                    scratch[key_position] = score;
                    if (score > max_score) max_score = score;
                }
                var normalizer: f64 = 0;
                for (0..total_length) |key_position| {
                    scratch[key_position] = @exp(scratch[key_position] - max_score);
                    normalizer += scratch[key_position];
                }
                for (0..shape.head_size) |dimension| {
                    var result: f64 = 0;
                    for (0..total_length) |key_position| {
                        const batch_key = try checkedMulAdd(batch, shape.kv_heads, kv_head);
                        const value_base = try checkedMul(try checkedMulAdd(batch_key, total_length, key_position), shape.head_size);
                        result += scratch[key_position] * (values_f64[value_base + dimension] / normalizer);
                    }
                    output[query_base + dimension] = try fp.Q128_128.fromF64Saturating(result);
                }
            }
        }
    }
}

pub const RotaryShape = struct {
    batch: usize,
    sequence: usize,
    heads: usize,
    head_size: usize,

    pub fn elements(self: RotaryShape) !usize {
        return checkedMul(try checkedMul(try checkedMul(self.batch, self.sequence), self.heads), self.head_size);
    }
};

pub fn rotaryEmbedding(
    output: []fp.Q128_128,
    input: []const fp.Q128_128,
    shape: RotaryShape,
    cos_cache: []const fp.Q128_128,
    sin_cache: []const fp.Q128_128,
    position_ids: []const usize,
    rotary_dimension: usize,
    interleaved: bool,
) !void {
    const elements = try shape.elements();
    const position_count = try checkedMul(shape.batch, shape.sequence);
    if (rotary_dimension == 0 or rotary_dimension > shape.head_size or rotary_dimension % 2 != 0 or
        input.len != elements or output.len != elements or
        position_ids.len != position_count or
        cos_cache.len % (rotary_dimension / 2) != 0 or
        sin_cache.len != cos_cache.len) return error.ShapeMismatch;
    const rotary_half = rotary_dimension / 2;
    const cache_positions = cos_cache.len / rotary_half;
    for (0..shape.batch) |batch| {
        for (0..shape.sequence) |sequence| {
            const position_index = try checkedMulAdd(batch, shape.sequence, sequence);
            const position = position_ids[position_index];
            if (position >= cache_positions) return error.PositionOutOfRange;
            for (0..shape.heads) |head| {
                const base = try checkedMul(try checkedMulAdd(try checkedMulAdd(batch, shape.sequence, sequence), shape.heads, head), shape.head_size);
                const cache_base = try checkedMul(position, rotary_half);
                if (interleaved) {
                    for (0..rotary_half) |pair| {
                        const x = input[base + pair * 2];
                        const y = input[base + pair * 2 + 1];
                        const c = cos_cache[cache_base + pair];
                        const s = sin_cache[cache_base + pair];
                        output[base + pair * 2] = try (try x.mul(c)).sub(try y.mul(s));
                        output[base + pair * 2 + 1] = try (try x.mul(s)).add(try y.mul(c));
                    }
                } else {
                    for (0..rotary_half) |pair| {
                        const x = input[base + pair];
                        const y = input[base + rotary_half + pair];
                        const c = cos_cache[cache_base + pair];
                        const s = sin_cache[cache_base + pair];
                        output[base + pair] = try (try x.mul(c)).sub(try y.mul(s));
                        output[base + rotary_half + pair] = try (try x.mul(s)).add(try y.mul(c));
                    }
                }
                for (rotary_dimension..shape.head_size) |offset| output[base + offset] = input[base + offset];
            }
        }
    }
}

pub fn neg(output: []fp.Q128_128, input: []const fp.Q128_128) !void {
    if (output.len != input.len) return error.ShapeMismatch;
    for (output, input) |*destination, value| destination.* = try value.neg();
}

pub fn sub(output: []fp.Q128_128, left: []const fp.Q128_128, right: []const fp.Q128_128) !void {
    if (left.len != right.len or output.len != left.len) return error.ShapeMismatch;
    for (output, left, right) |*destination, lhs, rhs| destination.* = try lhs.sub(rhs);
}

pub fn mul(output: []fp.Q128_128, left: []const fp.Q128_128, right: []const fp.Q128_128) !void {
    if (left.len != right.len or output.len != left.len) return error.ShapeMismatch;
    for (output, left, right) |*destination, lhs, rhs| destination.* = try lhs.mul(rhs);
}

pub fn exp(output: []fp.Q128_128, input: []const fp.Q128_128) !void {
    if (output.len != input.len) return error.ShapeMismatch;
    for (output, input) |*destination, value| destination.* = try expApprox(value);
}

/// Scalar sigmoid with saturation: sigmoid(x) -> 0/1 outside the exp
/// approximation range instead of overflowing.
pub fn sigmoidScalar(value: fp.Q128_128) !fp.Q128_128 {
    if (value.raw >= 8 * fp.SCALE) return fp.Q128_128.one;
    if (value.raw <= -8 * fp.SCALE) return fp.Q128_128.zero;
    return try fp.Q128_128.one.div(try fp.Q128_128.one.add(try expApprox(try value.neg())));
}

pub fn sigmoid(output: []fp.Q128_128, input: []const fp.Q128_128) !void {
    if (output.len != input.len) return error.ShapeMismatch;
    for (output, input) |*destination, value| destination.* = try sigmoidScalar(value);
}

pub fn softplus(output: []fp.Q128_128, input: []const fp.Q128_128) !void {
    if (output.len != input.len) return error.ShapeMismatch;
    for (output, input) |*destination, value| {
        const absolute = if (value.raw < 0) try value.neg() else value;
        const correction = try logApprox(try fp.Q128_128.one.add(try expApprox(try absolute.neg())));
        destination.* = if (value.raw < 0) correction else try absolute.add(correction);
    }
}

fn logApprox(value: fp.Q128_128) !fp.Q128_128 {
    if (value.raw <= 0) return error.InvalidValue;
    const numerator = try value.sub(fp.Q128_128.one);
    const denominator = try value.add(fp.Q128_128.one);
    var z = try numerator.div(denominator);
    const z2 = try z.mul(z);
    var power = z;
    var result = z;
    var divisor: i64 = 3;
    for (0..15) |_| {
        power = try power.mul(z2);
        if (power.raw == 0) break;
        result = try result.add(try power.div(fp.Q128_128.fromInt(divisor)));
        divisor += 2;
    }
    return result.mul(fp.Q128_128.fromInt(2));
}

fn sqrtFloorWide(value: u512) u512 {
    if (value == 0) return 0;
    var remainder = value;
    var result: u512 = 0;
    var shift: u16 = @intCast((((512 - @as(u16, @intCast(@clz(value)))) - 1) / 2) * 2);
    while (true) {
        const bit = @as(u512, 1) << @intCast(shift);
        const candidate = result + bit;
        if (remainder >= candidate) {
            remainder -= candidate;
            result = (result >> 1) + bit;
        } else {
            result >>= 1;
        }
        if (shift == 0) break;
        shift -= 2;
    }
    return result;
}

pub fn sqrt(value: fp.Q128_128) !fp.Q128_128 {
    if (value.raw < 0) return error.InvalidValue;
    if (value.raw == 0) return fp.Q128_128.zero;
    const wide = @as(u512, @intCast(value.raw)) << fp.FRAC_BITS;
    return fp.Q128_128.fromRaw(@intCast(sqrtFloorWide(wide)));
}

test "q128 basic elementwise and nonlinear fixtures" {
    var output: [2]fp.Q128_128 = undefined;
    const values = [_]fp.Q128_128{ fp.Q128_128.fromInt(1), fp.Q128_128.fromInt(-1) };
    try neg(&output, &values);
    try std.testing.expectEqual(fp.Q128_128.fromInt(-1).raw, output[0].raw);
    try sub(&output, &values, &.{ fp.Q128_128.fromInt(1), fp.Q128_128.fromInt(1) });
    try std.testing.expectEqual(fp.Q128_128.fromInt(0).raw, output[0].raw);
    try mul(&output, &values, &.{ fp.Q128_128.fromInt(2), fp.Q128_128.fromInt(2) });
    try std.testing.expectEqual(fp.Q128_128.fromInt(2).raw, output[0].raw);
    try sigmoid(&output, &.{ fp.Q128_128.zero, fp.Q128_128.fromInt(1) });
    try std.testing.expect(output[0].raw > fp.SCALE / 2 - 2 and output[0].raw < fp.SCALE / 2 + 2);
    try std.testing.expect((try sqrt(fp.Q128_128.fromInt(4))).raw == fp.Q128_128.fromInt(2).raw);
    try softplus(&output, &.{ fp.Q128_128.zero, fp.Q128_128.fromInt(1) });
    try std.testing.expect(output[0].raw > (fp.SCALE * 69) / 100);
    try std.testing.expect(output[0].raw < (fp.SCALE * 70) / 100);
}

pub fn add(output: []fp.Q128_128, left: []const fp.Q128_128, right: []const fp.Q128_128) !void {
    if (left.len != right.len or output.len != left.len) return error.ShapeMismatch;
    for (output, left, right) |*destination, lhs, rhs| destination.* = try lhs.add(rhs);
}

pub fn matMul(
    output: []fp.Q128_128,
    left: []const fp.Q128_128,
    left_shape: Shape,
    right: []const fp.Q128_128,
    right_shape: Shape,
) !void {
    const left_elements = try left_shape.elements();
    const right_elements = try right_shape.elements();
    const output_elements = try checkedMul(left_shape.rows, right_shape.columns);
    if (left_shape.columns != right_shape.rows or
        left.len != left_elements or
        right.len != right_elements or
        output.len != output_elements) return error.ShapeMismatch;

    // k-outer accumulation: `right` rows are read contiguously and each output
    // row is written contiguously. Per-element accumulation order (k ascending)
    // is identical to the naive triple loop — the results are bit-identical.
    for (output) |*cell| cell.* = fp.Q128_128.zero;
    for (0..left_shape.rows) |row| {
        const orow = output[row * right_shape.columns ..][0..right_shape.columns];
        for (0..left_shape.columns) |inner| {
            const lhs = left[row * left_shape.columns + inner];
            const rrow = right[inner * right_shape.columns ..][0..right_shape.columns];
            for (0..right_shape.columns) |column| {
                orow[column] = try orow[column].add(try lhs.mul(rrow[column]));
            }
        }
    }
}

pub fn reciprocal(value: fp.Q128_128) !fp.Q128_128 {
    return fp.Q128_128.one.div(value);
}

fn reduceAngle(value: fp.Q128_128) fp.Q128_128 {
    var raw = (fp.remTruncI256(value.raw, fp.TWO_PI.raw) catch unreachable);
    if (raw > fp.PI.raw) raw -= fp.TWO_PI.raw;
    if (raw < -fp.PI.raw) raw += fp.TWO_PI.raw;
    return fp.Q128_128.fromRaw(raw);
}

pub fn sin(value: fp.Q128_128) !fp.Q128_128 {
    const x = reduceAngle(value);
    const x2 = try x.mul(x);
    var term = x;
    var result = x;
    const coefficients = [_]struct { denominator: i64, subtract: bool }{
        .{ .denominator = 6, .subtract = true },
        .{ .denominator = 120, .subtract = false },
        .{ .denominator = 5040, .subtract = true },
        .{ .denominator = 362880, .subtract = false },
        .{ .denominator = 39916800, .subtract = true },
    };
    for (coefficients) |coefficient| {
        term = try term.mul(x2);
        const fraction = try term.div(fp.Q128_128.fromInt(coefficient.denominator));
        result = if (coefficient.subtract) try result.sub(fraction) else try result.add(fraction);
    }
    return result;
}

pub fn cos(value: fp.Q128_128) !fp.Q128_128 {
    const x = reduceAngle(value);
    const x2 = try x.mul(x);
    var term = fp.Q128_128.one;
    var result = term;
    const coefficients = [_]struct { denominator: i64, subtract: bool }{
        .{ .denominator = 2, .subtract = true },
        .{ .denominator = 24, .subtract = false },
        .{ .denominator = 720, .subtract = true },
        .{ .denominator = 40320, .subtract = false },
        .{ .denominator = 3628800, .subtract = true },
    };
    for (coefficients) |coefficient| {
        term = try term.mul(x2);
        const fraction = try term.div(fp.Q128_128.fromInt(coefficient.denominator));
        result = if (coefficient.subtract) try result.sub(fraction) else try result.add(fraction);
    }
    return result;
}

test "q128 GroupQueryAttention repeats KV heads and appends cache" {
    const query = [_]fp.Q128_128{
        fp.Q128_128.one,  fp.Q128_128.zero,
        fp.Q128_128.zero, fp.Q128_128.one,
    };
    const key = [_]fp.Q128_128{ fp.Q128_128.one, fp.Q128_128.zero };
    const value = [_]fp.Q128_128{ fp.Q128_128.fromInt(10), fp.Q128_128.fromInt(20) };
    const past_key = [_]fp.Q128_128{ fp.Q128_128.zero, fp.Q128_128.one };
    const past_value = [_]fp.Q128_128{ fp.Q128_128.fromInt(30), fp.Q128_128.fromInt(40) };
    var output: [4]fp.Q128_128 = undefined;
    var present_key: [4]fp.Q128_128 = undefined;
    var present_value: [4]fp.Q128_128 = undefined;
    var scratch: [4]fp.Q128_128 = undefined;
    try groupQueryAttention(&output, &present_key, &present_value, &query, &key, &value, &past_key, &past_value, &.{}, &.{}, &scratch, .{ .batch = 1, .query_length = 1, .past_length = 1, .query_heads = 2, .kv_heads = 1, .head_size = 2 }, fp.Q128_128.one);
    try std.testing.expectEqual(past_key[0].raw, present_key[0].raw);
    try std.testing.expectEqual(key[0].raw, present_key[2].raw);
    try std.testing.expect(output[0].raw > fp.Q128_128.fromInt(10).raw);
    try std.testing.expect(output[0].raw < fp.Q128_128.fromInt(20).raw);
}

test "q128 scaled dot product attention fixture" {
    const query = [_]fp.Q128_128{ fp.Q128_128.one, fp.Q128_128.zero };
    const key = [_]fp.Q128_128{
        fp.Q128_128.one,  fp.Q128_128.zero,
        fp.Q128_128.zero, fp.Q128_128.one,
    };
    const value = [_]fp.Q128_128{
        fp.Q128_128.fromInt(10), fp.Q128_128.fromInt(20),
        fp.Q128_128.fromInt(30), fp.Q128_128.fromInt(40),
    };
    var output: [2]fp.Q128_128 = undefined;
    var scratch: [2]fp.Q128_128 = undefined;
    try scaledDotProductAttention(&output, &query, &key, &value, &scratch, .{ .heads = 1, .query_length = 1, .key_length = 2, .head_size = 2 }, fp.Q128_128.one);
    try std.testing.expect(output[0].raw > fp.Q128_128.fromInt(15).raw);
    try std.testing.expect(output[0].raw < fp.Q128_128.fromInt(16).raw);
    try std.testing.expect(output[1].raw > fp.Q128_128.fromInt(25).raw);
    try std.testing.expect(output[1].raw < fp.Q128_128.fromInt(26).raw);
}

test "q128 rotary embedding fixture" {
    const input = [_]fp.Q128_128{
        fp.Q128_128.fromInt(1), fp.Q128_128.fromInt(2), fp.Q128_128.fromInt(3), fp.Q128_128.fromInt(4),
    };
    const cos_cache = [_]fp.Q128_128{ fp.Q128_128.zero, fp.Q128_128.zero };
    const sin_cache = [_]fp.Q128_128{ fp.Q128_128.one, fp.Q128_128.one };
    var output: [4]fp.Q128_128 = undefined;
    try rotaryEmbedding(&output, &input, .{ .batch = 1, .sequence = 1, .heads = 1, .head_size = 4 }, &cos_cache, &sin_cache, &[_]usize{0}, 4, false);
    try std.testing.expectEqual(fp.Q128_128.fromInt(-3).raw, output[0].raw);
    try std.testing.expectEqual(fp.Q128_128.fromInt(-4).raw, output[1].raw);
    try std.testing.expectEqual(fp.Q128_128.fromInt(1).raw, output[2].raw);
    try std.testing.expectEqual(fp.Q128_128.fromInt(2).raw, output[3].raw);
}

test "q128 reciprocal and trigonometry fixtures" {
    const half = try reciprocal(fp.Q128_128.fromInt(2));
    try std.testing.expectEqual(fp.SCALE / 2, half.raw);
    const sin_zero = try sin(fp.Q128_128.zero);
    try std.testing.expectEqual(@as(i256, 0), sin_zero.raw);
    const cos_zero = try cos(fp.Q128_128.zero);
    try std.testing.expectEqual(fp.SCALE, cos_zero.raw);
    const half_pi = fp.Q128_128.fromRaw(fp.PI.raw / 2);
    const sin_half_pi = try sin(half_pi);
    const error_bound = fp.SCALE / 1_000_000;
    const difference = if (sin_half_pi.raw >= fp.SCALE) sin_half_pi.raw - fp.SCALE else fp.SCALE - sin_half_pi.raw;
    try std.testing.expect(difference < error_bound);
}

pub fn decode4BitRow(
    output: []fp.Q128_128,
    packed_values: []const u8,
    scales: []const fp.Q128_128,
    zero_points: []const u8,
    block_size: usize,
) !void {
    if (block_size == 0 or block_size % 2 != 0 or output.len % block_size != 0) return error.ShapeMismatch;
    const block_count = output.len / block_size;
    const packed_size = try checkedMul(block_count, block_size / 2);
    const zero_point_size = try checkedAdd(block_count, 1) / 2;
    if (packed_values.len != packed_size or zero_points.len != zero_point_size or scales.len != block_count) return error.ShapeMismatch;
    for (0..block_count) |block| {
        const packed_values_zero = zero_points[block / 2];
        const zero_point: i64 = @intCast((packed_values_zero >> @intCast((block % 2) * 4)) & 0x0f);
        const zero = fp.Q128_128.fromInt(zero_point);
        for (0..block_size) |index| {
            const packed_values_value = packed_values[block * (block_size / 2) + index / 2];
            const nibble: i64 = @intCast(if (index % 2 == 0) packed_values_value & 0x0f else packed_values_value >> 4);
            const quantized = fp.Q128_128.fromInt(nibble);
            const centered = try quantized.sub(zero);
            output[block * block_size + index] = try centered.mul(scales[block]);
        }
    }
}

/// `scratch` must hold at least `k` elements; it is used to pre-decode each
/// output column's weights via `decode4BitRow` — bit-identical to the inline
/// per-element decode, at ~half the Q128 ops per MAC (and amortized over rows).
pub fn matMul4Bit(
    output: []fp.Q128_128,
    left: []const fp.Q128_128,
    left_shape: Shape,
    packed_values: []const u8,
    scales: []const fp.Q128_128,
    zero_points: []const u8,
    k: usize,
    n: usize,
    block_size: usize,
    scratch: []fp.Q128_128,
) !void {
    if (block_size == 0 or block_size % 2 != 0 or left_shape.columns != k or k % block_size != 0) return error.ShapeMismatch;
    const left_elements = try left_shape.elements();
    const output_elements = try checkedMul(left_shape.rows, n);
    const block_count = k / block_size;
    const packed_values_per_row = try checkedMul(block_count, block_size / 2);
    const zero_points_per_row = (try checkedAdd(block_count, 1)) / 2;
    if (left.len != left_elements or output.len != output_elements or
        packed_values.len != try checkedMul(n, packed_values_per_row) or
        scales.len != try checkedMul(n, block_count) or
        zero_points.len != try checkedMul(n, zero_points_per_row)) return error.ShapeMismatch;
    if (scratch.len < k) return error.ScratchTooSmall;
    const weights = scratch[0..k];
    for (0..n) |column| {
        try decode4BitRow(
            weights,
            packed_values[column * packed_values_per_row ..][0..packed_values_per_row],
            scales[column * block_count ..][0..block_count],
            zero_points[column * zero_points_per_row ..][0..zero_points_per_row],
            block_size,
        );
        for (0..left_shape.rows) |row| {
            var sum = fp.Q128_128.zero;
            for (0..k) |inner| {
                sum = try sum.add(try left[row * k + inner].mul(weights[inner]));
            }
            output[row * n + column] = sum;
        }
    }
}

test "q128 4-bit row decoding fixture" {
    const packed_values = [_]u8{ 0x21, 0x43 };
    const scales = [_]fp.Q128_128{fp.Q128_128.one};
    const zero_points = [_]u8{0x00};
    var output: [4]fp.Q128_128 = undefined;
    try decode4BitRow(&output, &packed_values, &scales, &zero_points, 4);
    try std.testing.expectEqual(fp.Q128_128.fromInt(1).raw, output[0].raw);
    try std.testing.expectEqual(fp.Q128_128.fromInt(2).raw, output[1].raw);
    try std.testing.expectEqual(fp.Q128_128.fromInt(3).raw, output[2].raw);
    try std.testing.expectEqual(fp.Q128_128.fromInt(4).raw, output[3].raw);
}

test "q128 4-bit MatMul fixture" {
    const left = [_]fp.Q128_128{ fp.Q128_128.fromInt(2), fp.Q128_128.fromInt(3), fp.Q128_128.fromInt(4), fp.Q128_128.fromInt(5) };
    const packed_values = [_]u8{ 0x21, 0x43, 0x11, 0x11 };
    const scales = [_]fp.Q128_128{ fp.Q128_128.one, fp.Q128_128.one };
    const zero_points = [_]u8{ 0, 0 };
    var output: [2]fp.Q128_128 = undefined;
    var scratch: [4]fp.Q128_128 = undefined;
    try matMul4Bit(&output, &left, .{ .rows = 1, .columns = 4 }, &packed_values, &scales, &zero_points, 4, 2, 4, &scratch);
    try std.testing.expectEqual(fp.Q128_128.fromInt(40).raw, output[0].raw);
    try std.testing.expectEqual(fp.Q128_128.fromInt(14).raw, output[1].raw);
}

test "matMul k-outer order is bit-identical to the naive triple loop" {
    // Reference: original per-column accumulation.
    const rows = 5;
    const cols = 7;
    const inner = 9;
    var left_buf: [rows * inner]fp.Q128_128 = undefined;
    var right_buf: [inner * cols]fp.Q128_128 = undefined;
    var seed: u64 = 0x12345;
    for (&left_buf) |*v| {
        seed = seed *% 6364136223846793005 +% 1442695040888963407;
        v.* = fp.Q128_128.fromRaw(@as(i256, @intCast(seed)) *% 0x9E3779B97F4A7C15 -% fp.SCALE);
    }
    for (&right_buf) |*v| {
        seed = seed *% 6364136223846793005 +% 1442695040888963407;
        v.* = fp.Q128_128.fromRaw(@as(i256, @intCast(seed)) *% 0x9E3779B97F4A7C15 -% fp.SCALE);
    }
    var expect: [rows * cols]fp.Q128_128 = undefined;
    var actual: [rows * cols]fp.Q128_128 = undefined;
    for (0..rows) |r| {
        for (0..cols) |c| {
            var sum = fp.Q128_128.zero;
            for (0..inner) |k| {
                sum = try sum.add(try left_buf[r * inner + k].mul(right_buf[k * cols + c]));
            }
            expect[r * cols + c] = sum;
        }
    }
    try matMul(&actual, &left_buf, .{ .rows = rows, .columns = inner }, &right_buf, .{ .rows = inner, .columns = cols });
    for (expect, actual) |e, a| try std.testing.expectEqual(e.raw, a.raw);
}

test "matMul4Bit pre-decode is bit-identical to inline decode" {
    // Reference: original per-element nibble decode + MAC.
    const rows = 3;
    const k = 16;
    const n = 4;
    const block_size = 8;
    const block_count = k / block_size;
    var left_buf: [rows * k]fp.Q128_128 = undefined;
    var packed_buf: [n * block_count * (block_size / 2)]u8 = undefined;
    var scales_buf: [n * block_count]fp.Q128_128 = undefined;
    var zp_buf: [n * ((block_count + 1) / 2)]u8 = undefined;
    var seed: u64 = 0x9e3779b9;
    for (&left_buf) |*v| {
        seed = seed *% 6364136223846793005 +% 1442695040888963407;
        v.* = fp.Q128_128.fromRaw(@as(i256, @intCast(seed)) *% 0x9E3779B97F4A7C15 -% fp.SCALE);
    }
    for (&packed_buf) |*v| {
        seed = seed *% 6364136223846793005 +% 1442695040888963407;
        v.* = @intCast(seed & 0xff);
    }
    for (&scales_buf) |*v| {
        seed = seed *% 6364136223846793005 +% 1442695040888963407;
        v.* = fp.Q128_128.fromRaw(fp.SCALE / 16 + @as(i256, @intCast(seed & 0x3ff)));
    }
    for (&zp_buf) |*v| {
        seed = seed *% 6364136223846793005 +% 1442695040888963407;
        v.* = @intCast(seed & 0xff);
    }
    var expect: [rows * n]fp.Q128_128 = undefined;
    var actual: [rows * n]fp.Q128_128 = undefined;
    const packed_per_row = block_count * (block_size / 2);
    const zp_per_row = (block_count + 1) / 2;
    for (0..rows) |r| {
        for (0..n) |c| {
            var sum = fp.Q128_128.zero;
            for (0..k) |i| {
                const block = i / block_size;
                const offset = i % block_size;
                const pv = packed_buf[c * packed_per_row + block * (block_size / 2) + offset / 2];
                const nibble: i64 = @intCast(if (offset % 2 == 0) pv & 0x0f else pv >> 4);
                const zb = zp_buf[c * zp_per_row + block / 2];
                const zp: i64 = @intCast((zb >> @intCast((block % 2) * 4)) & 0x0f);
                const centered = try fp.Q128_128.fromInt(nibble).sub(fp.Q128_128.fromInt(zp));
                const weight = try centered.mul(scales_buf[c * block_count + block]);
                sum = try sum.add(try left_buf[r * k + i].mul(weight));
            }
            expect[r * n + c] = sum;
        }
    }
    var scratch: [k]fp.Q128_128 = undefined;
    try matMul4Bit(&actual, &left_buf, .{ .rows = rows, .columns = k }, &packed_buf, &scales_buf, &zp_buf, k, n, block_size, &scratch);
    for (expect, actual) |e, a| try std.testing.expectEqual(e.raw, a.raw);
}

test "q128 Add fixture" {
    const left = [_]fp.Q128_128{ fp.Q128_128.fromInt(1), fp.Q128_128.fromInt(2) };
    const right = [_]fp.Q128_128{ fp.Q128_128.fromInt(3), fp.Q128_128.fromInt(4) };
    var output: [2]fp.Q128_128 = undefined;
    try add(&output, &left, &right);
    try std.testing.expectEqual(fp.Q128_128.fromInt(4).raw, output[0].raw);
    try std.testing.expectEqual(fp.Q128_128.fromInt(6).raw, output[1].raw);
}

test "q128 MatMul fixture" {
    const left = [_]fp.Q128_128{
        fp.Q128_128.fromInt(1), fp.Q128_128.fromInt(2),
        fp.Q128_128.fromInt(3), fp.Q128_128.fromInt(4),
    };
    const right = [_]fp.Q128_128{
        fp.Q128_128.fromInt(5), fp.Q128_128.fromInt(6),
        fp.Q128_128.fromInt(7), fp.Q128_128.fromInt(8),
    };
    var output: [4]fp.Q128_128 = undefined;
    try matMul(&output, &left, .{ .rows = 2, .columns = 2 }, &right, .{ .rows = 2, .columns = 2 });
    try std.testing.expectEqual(fp.Q128_128.fromInt(19).raw, output[0].raw);
    try std.testing.expectEqual(fp.Q128_128.fromInt(22).raw, output[1].raw);
    try std.testing.expectEqual(fp.Q128_128.fromInt(43).raw, output[2].raw);
    try std.testing.expectEqual(fp.Q128_128.fromInt(50).raw, output[3].raw);
}

test "tensor kernels reject incompatible shapes" {
    const left = [_]fp.Q128_128{fp.Q128_128.one};
    var output: [1]fp.Q128_128 = undefined;
    try std.testing.expectError(error.ShapeMismatch, add(&output, &left, &.{}));
    try std.testing.expectError(error.ShapeMismatch, matMul(&output, &left, .{ .rows = 1, .columns = 1 }, &left, .{ .rows = 2, .columns = 1 }));
}

test "tensor shape domains reject overflowing element products" {
    const one = [_]fp.Q128_128{fp.Q128_128.one};
    var output: [1]fp.Q128_128 = undefined;
    var scratch: [1]fp.Q128_128 = undefined;
    const huge = std.math.maxInt(usize);
    try std.testing.expectError(error.TensorTooLarge, matMul(
        &output,
        &one,
        .{ .rows = huge, .columns = huge },
        &one,
        .{ .rows = 1, .columns = 1 },
    ));
    try std.testing.expectError(error.TensorTooLarge, scaledDotProductAttention(
        &output,
        &one,
        &one,
        &one,
        &scratch,
        .{ .heads = huge, .query_length = huge, .key_length = 1, .head_size = huge },
        fp.Q128_128.one,
    ));
    try std.testing.expectError(error.TensorTooLarge, rotaryEmbedding(
        &output,
        &one,
        .{ .batch = huge, .sequence = huge, .heads = 1, .head_size = 2 },
        &one,
        &one,
        &[_]usize{0},
        2,
        false,
    ));
}

test "group query attention rejects overflowing geometry before indexing" {
    const one = [_]fp.Q128_128{fp.Q128_128.one};
    var output: [1]fp.Q128_128 = undefined;
    var present_key: [1]fp.Q128_128 = undefined;
    var present_value: [1]fp.Q128_128 = undefined;
    var scratch: [1]fp.Q128_128 = undefined;
    const huge = std.math.maxInt(usize);
    const shape = GroupQueryShape{
        .batch = huge,
        .query_length = huge,
        .past_length = 0,
        .query_heads = 1,
        .kv_heads = 1,
        .head_size = 1,
    };
    try std.testing.expectError(error.TensorTooLarge, groupQueryAttention(
        &output,
        &present_key,
        &present_value,
        &one,
        &one,
        &one,
        &one,
        &one,
        &.{},
        &.{},
        &scratch,
        shape,
        fp.Q128_128.one,
    ));
    try std.testing.expectError(error.TensorTooLarge, groupQueryAttentionF64(
        std.testing.allocator,
        &output,
        &present_key,
        &present_value,
        &one,
        &one,
        &one,
        &one,
        &one,
        &.{},
        &.{},
        shape,
        fp.Q128_128.one,
    ));
}

test "quantized kernels reject invalid domains before indexing" {
    const left = [_]fp.Q128_128{fp.Q128_128.one};
    const packed_values = [_]u8{0x21};
    const scales = [_]fp.Q128_128{fp.Q128_128.one};
    const zero_points = [_]u8{0};
    var output: [2]fp.Q128_128 = undefined;
    var scratch: [2]fp.Q128_128 = undefined;
    try std.testing.expectError(error.ShapeMismatch, decode4BitRow(&output, &packed_values, &scales, &zero_points, 0));
    try std.testing.expectError(error.ShapeMismatch, matMul4Bit(
        &output,
        &left,
        .{ .rows = 1, .columns = 2 },
        &packed_values,
        &scales,
        &zero_points,
        2,
        1,
        0,
        &scratch,
    ));
    try std.testing.expectError(error.ShapeMismatch, matMul4Bit(
        &output,
        &left,
        .{ .rows = 1, .columns = 2 },
        &packed_values,
        &scales,
        &zero_points,
        2,
        1,
        2,
        &scratch,
    ));
}
