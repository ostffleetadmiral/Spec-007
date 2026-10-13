const std = @import("std");
const fp = @import("fixed_point");

pub const Shape = struct {
    dims: []const usize,

    pub fn elements(self: Shape) usize {
        var count: usize = 1;
        for (self.dims) |dim| count *= dim;
        return count;
    }
};

pub fn castIdentity(output: []fp.Q128_128, input: []const fp.Q128_128) !void {
    if (output.len != input.len) return error.ShapeMismatch;
    @memcpy(output, input);
}

pub fn reshapeCopy(output: []fp.Q128_128, input: []const fp.Q128_128, from: Shape, to: Shape) !void {
    if (from.elements() != to.elements() or input.len != from.elements() or output.len != to.elements()) return error.ShapeMismatch;
    @memcpy(output, input);
}

pub fn transpose(
    output: []fp.Q128_128,
    input: []const fp.Q128_128,
    shape: Shape,
    permutation: []const usize,
) !void {
    if (permutation.len != shape.dims.len or input.len != shape.elements() or output.len != input.len) return error.ShapeMismatch;
    var seen = [_]bool{false} ** 8;
    if (permutation.len > seen.len) return error.ShapeMismatch;
    for (permutation) |axis| {
        if (axis >= permutation.len or seen[axis]) return error.ShapeMismatch;
        seen[axis] = true;
    }
    var input_strides: [8]usize = undefined;
    var output_strides: [8]usize = undefined;
    input_strides[shape.dims.len - 1] = 1;
    for (0..shape.dims.len - 1) |reverse| {
        const axis = shape.dims.len - 2 - reverse;
        input_strides[axis] = input_strides[axis + 1] * shape.dims[axis + 1];
    }
    for (0..shape.dims.len) |axis| output_strides[axis] = if (axis + 1 == shape.dims.len) 1 else blk: {
        var stride: usize = 1;
        for (axis + 1..shape.dims.len) |next| stride *= shape.dims[permutation[next]];
        break :blk stride;
    };
    for (0..output.len) |flat| {
        var remaining = flat;
        var source_index: usize = 0;
        for (0..permutation.len) |axis| {
            const coordinate = remaining / output_strides[axis];
            remaining %= output_strides[axis];
            source_index += coordinate * input_strides[permutation[axis]];
        }
        output[flat] = input[source_index];
    }
}

pub fn gatherRows(
    output: []fp.Q128_128,
    table: []const fp.Q128_128,
    row_width: usize,
    indices: []const usize,
) !void {
    if (row_width == 0 or table.len % row_width != 0 or output.len != indices.len * row_width) return error.ShapeMismatch;
    const rows = table.len / row_width;
    for (indices, 0..) |index, destination_row| {
        if (index >= rows) return error.IndexOutOfRange;
        @memcpy(output[destination_row * row_width ..][0..row_width], table[index * row_width ..][0..row_width]);
    }
}

pub fn range(output: []fp.Q128_128, start: fp.Q128_128, delta: fp.Q128_128) !void {
    var value = start;
    for (output) |*destination| {
        destination.* = value;
        value = try value.add(delta);
    }
}

pub fn reduceSum(input: []const fp.Q128_128) !fp.Q128_128 {
    var result = fp.Q128_128.zero;
    for (input) |value| result = try result.add(value);
    return result;
}

pub fn reduceMean(input: []const fp.Q128_128) !fp.Q128_128 {
    if (input.len == 0) return error.EmptyInput;
    return (try reduceSum(input)).div(fp.Q128_128.fromInt(@intCast(input.len)));
}

pub fn slice1d(output: []fp.Q128_128, input: []const fp.Q128_128, start: usize, end: usize, step: usize) !void {
    if (step == 0 or start > end or end > input.len) return error.ShapeMismatch;
    var count: usize = 0;
    var index = start;
    while (index < end) : (index += step) count += 1;
    if (output.len != count) return error.ShapeMismatch;
    index = start;
    var destination: usize = 0;
    while (index < end) : (index += step) {
        output[destination] = input[index];
        destination += 1;
    }
}

pub fn writeShape(output: []usize, dims: []const usize) !void {
    if (output.len != dims.len) return error.ShapeMismatch;
    @memcpy(output, dims);
}

pub fn unsqueezeCopy(output: []fp.Q128_128, input: []const fp.Q128_128) !void {
    if (output.len != input.len) return error.ShapeMismatch;
    @memcpy(output, input);
}

pub fn squeezeCopy(output: []fp.Q128_128, input: []const fp.Q128_128) !void {
    if (output.len != input.len) return error.ShapeMismatch;
    @memcpy(output, input);
}

pub fn expandScalar(output: []fp.Q128_128, input: []const fp.Q128_128) !void {
    if (input.len == 0 or output.len % input.len != 0) return error.ShapeMismatch;
    for (output, 0..) |*destination, index| destination.* = input[index % input.len];
}

pub fn splitEqualLast(
    left: []fp.Q128_128,
    right: []fp.Q128_128,
    input: []const fp.Q128_128,
    rows: usize,
    columns: usize,
) !void {
    if (columns % 2 != 0 or input.len != rows * columns or left.len != rows * (columns / 2) or right.len != left.len) return error.ShapeMismatch;
    for (0..rows) |row| {
        @memcpy(left[row * (columns / 2) ..][0 .. columns / 2], input[row * columns ..][0 .. columns / 2]);
        @memcpy(right[row * (columns / 2) ..][0 .. columns / 2], input[row * columns + columns / 2 ..][0 .. columns / 2]);
    }
}

test "cast identity preserves q128 boundary values" {
    const input = [_]fp.Q128_128{fp.Q128_128.fromInt(-7)};
    var output: [1]fp.Q128_128 = undefined;
    try castIdentity(&output, &input);
    try std.testing.expectEqual(input[0].raw, output[0].raw);
}

test "shape-only and split contracts" {
    var output: [4]fp.Q128_128 = undefined;
    try expandScalar(&output, &.{fp.Q128_128.one});
    try std.testing.expectEqual(fp.Q128_128.one.raw, output[3].raw);
    var left: [2]fp.Q128_128 = undefined;
    var right: [2]fp.Q128_128 = undefined;
    try splitEqualLast(&left, &right, &.{ fp.Q128_128.one, fp.Q128_128.fromInt(2), fp.Q128_128.fromInt(3), fp.Q128_128.fromInt(4) }, 1, 4);
    try std.testing.expectEqual(fp.Q128_128.fromInt(3).raw, right[0].raw);
}

pub fn concatLast2d(
    output: []fp.Q128_128,
    left: []const fp.Q128_128,
    left_shape: [2]usize,
    right: []const fp.Q128_128,
    right_shape: [2]usize,
) !void {
    if (left_shape[0] != right_shape[0] or left.len != left_shape[0] * left_shape[1] or
        right.len != right_shape[0] * right_shape[1] or output.len != left_shape[0] * (left_shape[1] + right_shape[1])) return error.ShapeMismatch;
    for (0..left_shape[0]) |row| {
        const output_base = row * (left_shape[1] + right_shape[1]);
        @memcpy(output[output_base..][0..left_shape[1]], left[row * left_shape[1] ..][0..left_shape[1]]);
        @memcpy(output[output_base + left_shape[1] ..][0..right_shape[1]], right[row * right_shape[1] ..][0..right_shape[1]]);
    }
}

test "shape operations preserve deterministic data" {
    const input = [_]fp.Q128_128{ fp.Q128_128.fromInt(1), fp.Q128_128.fromInt(2), fp.Q128_128.fromInt(3), fp.Q128_128.fromInt(4) };
    var transposed: [4]fp.Q128_128 = undefined;
    try transpose(&transposed, &input, .{ .dims = &.{ 2, 2 } }, &.{ 1, 0 });
    try std.testing.expectEqual(fp.Q128_128.fromInt(1).raw, transposed[0].raw);
    try std.testing.expectEqual(fp.Q128_128.fromInt(3).raw, transposed[1].raw);
    var gathered: [4]fp.Q128_128 = undefined;
    try gatherRows(&gathered, &input, 2, &.{ 1, 0 });
    try std.testing.expectEqual(fp.Q128_128.fromInt(3).raw, gathered[0].raw);
    var sliced: [2]fp.Q128_128 = undefined;
    try slice1d(&sliced, &input, 0, 4, 2);
    try std.testing.expectEqual(fp.Q128_128.fromInt(4).raw, (try reduceSum(&sliced)).raw);
}

test "range and mean" {
    var values: [3]fp.Q128_128 = undefined;
    try range(&values, fp.Q128_128.fromInt(2), fp.Q128_128.one);
    try std.testing.expectEqual(fp.Q128_128.fromInt(3).raw, values[1].raw);
    try std.testing.expectEqual(fp.Q128_128.fromInt(3).raw, (try reduceMean(&values)).raw);
}
