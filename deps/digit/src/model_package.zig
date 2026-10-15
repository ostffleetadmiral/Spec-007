//! Compact binary package for the parsed decoder graph. The native side
//! serializes nodes in topological order with attributes, input metadata, and
//! the initializer-name set; the shared session deserializes it identically on
//! native and Wasm, after which weight payloads arrive through the bounded
//! upload path. All integers are little-endian.

const std = @import("std");
const onnx = @import("onnx_graph");

pub const MAGIC: u32 = 0x44514750; // "DQGP"
pub const VERSION: u32 = 1;

pub const InputInfo = struct {
    name: []const u8,
    elem_type: u64,
    dims: []i64,
    is_initializer: bool,
};

pub const Package = struct {
    allocator: std.mem.Allocator,
    nodes: std.ArrayList(onnx.Node),
    inputs: std.ArrayList(InputInfo),
    outputs: std.ArrayList([]const u8),
    order: []usize,

    pub fn deinit(self: *Package) void {
        for (self.nodes.items) |*node| node.deinit();
        self.nodes.deinit();
        for (self.inputs.items) |*input| {
            self.allocator.free(input.name);
            self.allocator.free(input.dims);
        }
        self.inputs.deinit();
        for (self.outputs.items) |name| self.allocator.free(name);
        self.outputs.deinit();
        self.allocator.free(self.order);
    }
};

fn writeU32(writer: anytype, value: usize) !void {
    if (value > std.math.maxInt(u32)) return error.CountTooLarge;
    try writer.writeInt(u32, @intCast(value), .little);
}

fn writeString(writer: anytype, value: []const u8) !void {
    try writeU32(writer, value.len);
    try writer.writeAll(value);
}

fn validateOrder(allocator: std.mem.Allocator, nodes: []const onnx.Node, order: []const usize) !void {
    const count = nodes.len;
    if (order.len != count) return error.InvalidOrder;
    const positions = try allocator.alloc(usize, count);
    defer allocator.free(positions);
    @memset(positions, count);
    for (order, 0..) |node_index, position| {
        if (node_index >= count) return error.InvalidOrder;
        positions[node_index] = position;
    }
    for (positions) |position| if (position == count) return error.InvalidOrder;

    var producers = std.StringHashMap(usize).init(allocator);
    defer producers.deinit();
    for (nodes, 0..) |node, index| {
        for (node.outputs.items) |output| {
            if (output.len == 0) continue;
            if (producers.contains(output)) return error.InvalidOrder;
            try producers.put(output, index);
        }
    }
    for (nodes, 0..) |node, index| {
        for (node.inputs.items) |input| {
            if (input.len == 0) continue;
            if (producers.get(input)) |producer| {
                if (positions[producer] >= positions[index]) return error.InvalidOrder;
            }
        }
    }
}

/// Serializes `graph` nodes in `order` (topological), all input ValueInfos,
/// and the initializer-name set so the receiving session can distinguish
/// weights (uploaded) from seeded inputs.
pub fn serialize(
    allocator: std.mem.Allocator,
    graph: *const onnx.Graph,
    order: []const usize,
    is_initializer: *const std.StringHashMap(void),
) ![]u8 {
    try validateOrder(allocator, graph.nodes.items, order);
    var buffer = std.ArrayList(u8).init(allocator);
    errdefer buffer.deinit();
    const writer = buffer.writer();

    try writer.writeInt(u32, MAGIC, .little);
    try writer.writeInt(u32, VERSION, .little);
    try writeU32(writer, order.len);
    try writeU32(writer, graph.inputs.items.len);
    try writeU32(writer, graph.outputs.items.len);

    for (graph.inputs.items) |input| {
        try writeString(writer, input.name);
        try writer.writeInt(u64, input.elem_type, .little);
        try writeU32(writer, input.dims.len);
        for (input.dims) |dim| try writer.writeInt(i64, dim, .little);
        try writer.writeByte(if (is_initializer.contains(input.name)) 1 else 0);
    }

    for (graph.outputs.items) |output| try writeString(writer, output.name);

    for (order) |node_index| {
        const node = &graph.nodes.items[node_index];
        try writeString(writer, node.name);
        try writeString(writer, node.domain);
        try writeString(writer, node.op_type);
        try writeU32(writer, node.inputs.items.len);
        for (node.inputs.items) |input| try writeString(writer, input);
        try writeU32(writer, node.outputs.items.len);
        for (node.outputs.items) |output| try writeString(writer, output);
        try writeU32(writer, node.attributes.items.len);
        for (node.attributes.items) |attribute| {
            try writeString(writer, attribute.name);
            try writer.writeByte(switch (attribute.kind) {
                .integer => 0,
                .float => 1,
                .string => 2,
                .integers => 3,
                .floats => 4,
            });
            switch (attribute.kind) {
                .integer => try writer.writeInt(i64, attribute.integer, .little),
                .float => try writer.writeInt(u32, @bitCast(attribute.float), .little),
                .string => try writeString(writer, attribute.string),
                .integers => {
                    try writeU32(writer, attribute.ints.len);
                    for (attribute.ints) |value| try writer.writeInt(i64, value, .little);
                },
                .floats => {
                    try writeU32(writer, attribute.floats.len);
                    for (attribute.floats) |value| try writer.writeInt(u32, @bitCast(value), .little);
                },
            }
        }
    }
    return buffer.toOwnedSlice();
}

const Reader = struct {
    bytes: []const u8,
    pos: usize = 0,

    fn remaining(self: *const Reader) usize {
        return self.bytes.len - self.pos;
    }

    fn u32v(self: *Reader) !u32 {
        if (self.remaining() < 4) return error.TruncatedPackage;
        defer self.pos += 4;
        return std.mem.readInt(u32, self.bytes[self.pos..][0..4], .little);
    }

    fn u64v(self: *Reader) !u64 {
        if (self.remaining() < 8) return error.TruncatedPackage;
        defer self.pos += 8;
        return std.mem.readInt(u64, self.bytes[self.pos..][0..8], .little);
    }

    fn i64v(self: *Reader) !i64 {
        return @bitCast(try self.u64v());
    }

    fn byte(self: *Reader) !u8 {
        if (self.remaining() < 1) return error.TruncatedPackage;
        defer self.pos += 1;
        return self.bytes[self.pos];
    }

    fn string(self: *Reader, allocator: std.mem.Allocator) ![]u8 {
        const len = try self.u32v();
        if (len > self.remaining()) return error.TruncatedPackage;
        defer self.pos += len;
        return try allocator.dupe(u8, self.bytes[self.pos .. self.pos + len]);
    }
};

fn minimumRecordBytes(input_count: u32, output_count: u32, node_count: u32) !usize {
    const input_bytes = std.math.mul(usize, input_count, 17) catch return error.TruncatedPackage;
    const output_bytes = std.math.mul(usize, output_count, 4) catch return error.TruncatedPackage;
    const node_bytes = std.math.mul(usize, node_count, 24) catch return error.TruncatedPackage;
    const io_bytes = std.math.add(usize, input_bytes, output_bytes) catch return error.TruncatedPackage;
    return std.math.add(usize, io_bytes, node_bytes) catch return error.TruncatedPackage;
}

/// Deserializes a package into owned nodes/inputs. The emitted node order is
/// the serialized order — already topological — so `order` is the identity.
pub fn deserialize(allocator: std.mem.Allocator, bytes: []const u8) !Package {
    var reader = Reader{ .bytes = bytes };
    if (try reader.u32v() != MAGIC) return error.BadMagic;
    if (try reader.u32v() != VERSION) return error.BadVersion;
    const node_count = try reader.u32v();
    const input_count = try reader.u32v();
    const output_count = try reader.u32v();
    if (try minimumRecordBytes(input_count, output_count, node_count) > reader.remaining()) {
        return error.TruncatedPackage;
    }

    var package = Package{
        .allocator = allocator,
        .nodes = std.ArrayList(onnx.Node).init(allocator),
        .inputs = std.ArrayList(InputInfo).init(allocator),
        .outputs = std.ArrayList([]const u8).init(allocator),
        .order = &.{},
    };
    errdefer package.deinit();

    for (0..input_count) |_| {
        const name = try reader.string(allocator);
        errdefer allocator.free(name);
        const elem_type = try reader.u64v();
        const dim_count = try reader.u32v();
        if (dim_count > reader.remaining() / 8) return error.TruncatedPackage;
        const dims = try allocator.alloc(i64, dim_count);
        errdefer allocator.free(dims);
        for (dims) |*dim| dim.* = try reader.i64v();
        const flags = try reader.byte();
        if (flags > 1) return error.BadInputFlags;
        try package.inputs.append(.{
            .name = name,
            .elem_type = elem_type,
            .dims = dims,
            .is_initializer = flags == 1,
        });
    }

    for (0..output_count) |_| {
        const name = try reader.string(allocator);
        errdefer allocator.free(name);
        try package.outputs.append(name);
    }

    try package.nodes.ensureTotalCapacity(node_count);
    for (0..node_count) |_| {
        var node = onnx.Node{
            .allocator = allocator,
            .name = &.{},
            .domain = &.{},
            .op_type = &.{},
            .inputs = std.ArrayList([]const u8).init(allocator),
            .outputs = std.ArrayList([]const u8).init(allocator),
            .attributes = std.ArrayList(onnx.Attribute).init(allocator),
        };
        errdefer node.deinit();
        node.name = try reader.string(allocator);
        node.domain = try reader.string(allocator);
        node.op_type = try reader.string(allocator);
        const in_count = try reader.u32v();
        if (in_count > reader.remaining() / 4) return error.TruncatedPackage;
        for (0..in_count) |_| {
            const input = try reader.string(allocator);
            errdefer allocator.free(input);
            try node.inputs.append(input);
        }
        const out_count = try reader.u32v();
        if (out_count > reader.remaining() / 4) return error.TruncatedPackage;
        for (0..out_count) |_| {
            const output = try reader.string(allocator);
            errdefer allocator.free(output);
            try node.outputs.append(output);
        }
        const attr_count = try reader.u32v();
        if (attr_count > reader.remaining() / 5) return error.TruncatedPackage;
        for (0..attr_count) |_| {
            var attribute = onnx.Attribute{
                .allocator = allocator,
                .name = &.{},
                .kind = .integer,
            };
            errdefer {
                allocator.free(attribute.name);
                allocator.free(attribute.string);
                allocator.free(attribute.ints);
                allocator.free(attribute.floats);
            }
            attribute.name = try reader.string(allocator);
            const kind = try reader.byte();
            switch (kind) {
                0 => {
                    attribute.kind = .integer;
                    attribute.integer = try reader.i64v();
                },
                1 => {
                    attribute.kind = .float;
                    attribute.float = @bitCast(try reader.u32v());
                },
                2 => {
                    attribute.kind = .string;
                    attribute.string = try reader.string(allocator);
                },
                3 => {
                    attribute.kind = .integers;
                    const count = try reader.u32v();
                    if (count > reader.remaining() / 8) return error.TruncatedPackage;
                    attribute.ints = try allocator.alloc(i64, count);
                    for (attribute.ints) |*value| value.* = try reader.i64v();
                },
                4 => {
                    attribute.kind = .floats;
                    const count = try reader.u32v();
                    if (count > reader.remaining() / 4) return error.TruncatedPackage;
                    attribute.floats = try allocator.alloc(f32, count);
                    for (attribute.floats) |*value| value.* = @bitCast(try reader.u32v());
                },
                else => return error.BadAttributeKind,
            }
            try node.attributes.append(attribute);
        }
        try package.nodes.append(node);
    }
    if (reader.pos != bytes.len) return error.TrailingPackageBytes;

    const order = try allocator.alloc(usize, package.nodes.items.len);
    errdefer allocator.free(order);
    for (order, 0..) |*slot, index| slot.* = index;
    try validateOrder(allocator, package.nodes.items, order);
    package.order = order;
    return package;
}

test "serialize/deserialize round-trips nodes, inputs, and attributes" {
    const allocator = std.testing.allocator;
    var graph = onnx.Graph{
        .allocator = allocator,
        .nodes = std.ArrayList(onnx.Node).init(allocator),
        .inputs = std.ArrayList(onnx.ValueInfo).init(allocator),
        .outputs = std.ArrayList(onnx.ValueInfo).init(allocator),
    };
    defer graph.deinit();

    var node = onnx.Node{
        .allocator = allocator,
        .name = try allocator.dupe(u8, "n0"),
        .domain = try allocator.dupe(u8, "com.microsoft"),
        .op_type = try allocator.dupe(u8, "MatMulNBits"),
        .inputs = std.ArrayList([]const u8).init(allocator),
        .outputs = std.ArrayList([]const u8).init(allocator),
        .attributes = std.ArrayList(onnx.Attribute).init(allocator),
    };
    try node.inputs.append(try allocator.dupe(u8, "x"));
    try node.inputs.append(try allocator.dupe(u8, ""));
    try node.outputs.append(try allocator.dupe(u8, "y"));
    const attr_int = onnx.Attribute{ .allocator = allocator, .name = try allocator.dupe(u8, "K"), .kind = .integer, .integer = 2048 };
    var attr_ints = onnx.Attribute{ .allocator = allocator, .name = try allocator.dupe(u8, "perm"), .kind = .integers };
    attr_ints.ints = try allocator.dupe(i64, &.{ 0, 2, 1 });
    var attr_str = onnx.Attribute{ .allocator = allocator, .name = try allocator.dupe(u8, "activation"), .kind = .string };
    attr_str.string = try allocator.dupe(u8, "silu");
    const attr_float = onnx.Attribute{ .allocator = allocator, .name = try allocator.dupe(u8, "eps"), .kind = .float, .float = 1e-5 };
    var attr_floats = onnx.Attribute{ .allocator = allocator, .name = try allocator.dupe(u8, "scales"), .kind = .floats };
    attr_floats.floats = try allocator.dupe(f32, &.{ 0.5, -1.25 });
    try node.attributes.append(attr_int);
    try node.attributes.append(attr_ints);
    try node.attributes.append(attr_str);
    try node.attributes.append(attr_float);
    try node.attributes.append(attr_floats);
    try graph.nodes.append(node);

    var input = onnx.ValueInfo{
        .allocator = allocator,
        .name = try allocator.dupe(u8, "past_conv.0"),
        .elem_type = 1,
    };
    input.dims = try allocator.dupe(i64, &.{ -1, 6144, 3 });
    try graph.inputs.append(input);

    var output = onnx.ValueInfo{
        .allocator = allocator,
        .name = try allocator.dupe(u8, "logits"),
        .elem_type = 1,
    };
    output.dims = try allocator.dupe(i64, &.{ -1, -1, 248320 });
    try graph.outputs.append(output);

    var initializers = std.StringHashMap(void).init(allocator);
    defer initializers.deinit();
    try initializers.put("w", {});

    const order = [_]usize{0};
    const bytes = try serialize(allocator, &graph, &order, &initializers);
    defer allocator.free(bytes);

    var package = try deserialize(allocator, bytes);
    defer package.deinit();
    try std.testing.expectEqual(@as(usize, 1), package.nodes.items.len);
    try std.testing.expectEqual(@as(usize, 1), package.inputs.items.len);
    try std.testing.expectEqual(@as(usize, 1), package.outputs.items.len);
    try std.testing.expectEqualStrings("logits", package.outputs.items[0]);
    try std.testing.expectEqual(@as(usize, 1), package.order.len);
    const parsed = &package.nodes.items[0];
    try std.testing.expectEqualStrings("MatMulNBits", parsed.op_type);
    try std.testing.expectEqualStrings("com.microsoft", parsed.domain);
    try std.testing.expectEqual(@as(usize, 2), parsed.inputs.items.len);
    try std.testing.expectEqual(@as(usize, 5), parsed.attributes.items.len);
    try std.testing.expectEqual(@as(i64, 2048), parsed.attributes.items[0].integer);
    try std.testing.expectEqual(@as(usize, 3), parsed.attributes.items[1].ints.len);
    try std.testing.expectEqualStrings("silu", parsed.attributes.items[2].string);
    try std.testing.expectApproxEqAbs(@as(f32, 1e-5), parsed.attributes.items[3].float, 1e-12);
    try std.testing.expectEqual(@as(f32, -1.25), parsed.attributes.items[4].floats[1]);
    try std.testing.expectEqual(@as(i64, -1), package.inputs.items[0].dims[0]);
}

fn appendHeader(bytes: *std.ArrayList(u8), node_count: u32, input_count: u32, output_count: u32) !void {
    const writer = bytes.writer();
    try writer.writeInt(u32, MAGIC, .little);
    try writer.writeInt(u32, VERSION, .little);
    try writer.writeInt(u32, node_count, .little);
    try writer.writeInt(u32, input_count, .little);
    try writer.writeInt(u32, output_count, .little);
}

fn packageHeader(allocator: std.mem.Allocator, node_count: u32, input_count: u32, output_count: u32) ![]u8 {
    var bytes = std.ArrayList(u8).init(allocator);
    errdefer bytes.deinit();
    try appendHeader(&bytes, node_count, input_count, output_count);
    return bytes.toOwnedSlice();
}

fn expectPackageError(expected: anyerror, allocator: std.mem.Allocator, bytes: []const u8) !void {
    var package = deserialize(allocator, bytes) catch |err| {
        try std.testing.expectEqual(expected, err);
        return;
    };
    package.deinit();
    return error.TestUnexpectedResult;
}

fn emptyGraph(allocator: std.mem.Allocator) onnx.Graph {
    return .{
        .allocator = allocator,
        .nodes = std.ArrayList(onnx.Node).init(allocator),
        .inputs = std.ArrayList(onnx.ValueInfo).init(allocator),
        .outputs = std.ArrayList(onnx.ValueInfo).init(allocator),
    };
}

fn appendNode(
    graph: *onnx.Graph,
    name: []const u8,
    op_type: []const u8,
    inputs: []const []const u8,
    outputs: []const []const u8,
) !void {
    var node = onnx.Node{
        .allocator = graph.allocator,
        .name = &.{},
        .domain = &.{},
        .op_type = &.{},
        .inputs = std.ArrayList([]const u8).init(graph.allocator),
        .outputs = std.ArrayList([]const u8).init(graph.allocator),
        .attributes = std.ArrayList(onnx.Attribute).init(graph.allocator),
    };
    errdefer node.deinit();
    node.name = try graph.allocator.dupe(u8, name);
    node.domain = try graph.allocator.dupe(u8, "ai.onnx");
    node.op_type = try graph.allocator.dupe(u8, op_type);
    for (inputs) |input| {
        const owned = try graph.allocator.dupe(u8, input);
        errdefer graph.allocator.free(owned);
        try node.inputs.append(owned);
    }
    for (outputs) |output| {
        const owned = try graph.allocator.dupe(u8, output);
        errdefer graph.allocator.free(owned);
        try node.outputs.append(owned);
    }
    try graph.nodes.append(node);
}

fn appendSerializedNode(
    bytes: *std.ArrayList(u8),
    name: []const u8,
    inputs: []const []const u8,
    outputs: []const []const u8,
    attribute_count: u32,
) !void {
    const writer = bytes.writer();
    try writeString(writer, name);
    try writeString(writer, "ai.onnx");
    try writeString(writer, "Op");
    try writeU32(writer, inputs.len);
    for (inputs) |input| try writeString(writer, input);
    try writeU32(writer, outputs.len);
    for (outputs) |output| try writeString(writer, output);
    try writeU32(writer, attribute_count);
}

test "serialize requires a topological node permutation" {
    const allocator = std.testing.allocator;
    var graph = emptyGraph(allocator);
    defer graph.deinit();
    try appendNode(&graph, "consumer", "Consume", &.{"mid"}, &.{"out"});
    try appendNode(&graph, "producer", "Produce", &.{}, &.{"mid"});

    var initializers = std.StringHashMap(void).init(allocator);
    defer initializers.deinit();

    const topological = [_]usize{ 1, 0 };
    const bytes = try serialize(allocator, &graph, &topological, &initializers);
    defer allocator.free(bytes);
    try std.testing.expect(bytes.len > 0);

    const short_order = [_]usize{1};
    try std.testing.expectError(error.InvalidOrder, serialize(allocator, &graph, &short_order, &initializers));
    const out_of_range = [_]usize{ 1, 2 };
    try std.testing.expectError(error.InvalidOrder, serialize(allocator, &graph, &out_of_range, &initializers));
    const duplicate = [_]usize{ 1, 1 };
    try std.testing.expectError(error.InvalidOrder, serialize(allocator, &graph, &duplicate, &initializers));
    const dependency_first = [_]usize{ 0, 1 };
    try std.testing.expectError(error.InvalidOrder, serialize(allocator, &graph, &dependency_first, &initializers));

    try appendNode(&graph, "shadow", "Produce", &.{}, &.{"mid"});
    const duplicate_output = [_]usize{ 1, 0, 2 };
    try std.testing.expectError(error.InvalidOrder, serialize(allocator, &graph, &duplicate_output, &initializers));
}

test "deserialize enforces canonical package boundaries" {
    const allocator = std.testing.allocator;

    try expectPackageError(error.TruncatedPackage, allocator, &.{});

    const bad_magic = try packageHeader(allocator, 0, 0, 0);
    defer allocator.free(bad_magic);
    bad_magic[0] ^= 0xff;
    try expectPackageError(error.BadMagic, allocator, bad_magic);

    const bad_version = try packageHeader(allocator, 0, 0, 0);
    defer allocator.free(bad_version);
    bad_version[4] ^= 0xff;
    try expectPackageError(error.BadVersion, allocator, bad_version);

    const empty_bytes = try packageHeader(allocator, 0, 0, 0);
    defer allocator.free(empty_bytes);
    var empty = try deserialize(allocator, empty_bytes);
    defer empty.deinit();
    try std.testing.expectEqual(@as(usize, 0), empty.nodes.items.len);
    try std.testing.expectEqual(@as(usize, 0), empty.order.len);

    var trailing = std.ArrayList(u8).init(allocator);
    defer trailing.deinit();
    try trailing.appendSlice(empty_bytes);
    try trailing.append(0);
    try expectPackageError(error.TrailingPackageBytes, allocator, trailing.items);

    const huge_nodes = try packageHeader(allocator, std.math.maxInt(u32), 0, 0);
    defer allocator.free(huge_nodes);
    try expectPackageError(error.TruncatedPackage, allocator, huge_nodes);
    const huge_inputs = try packageHeader(allocator, 0, std.math.maxInt(u32), 0);
    defer allocator.free(huge_inputs);
    try expectPackageError(error.TruncatedPackage, allocator, huge_inputs);
    const huge_outputs = try packageHeader(allocator, 0, 0, std.math.maxInt(u32));
    defer allocator.free(huge_outputs);
    try expectPackageError(error.TruncatedPackage, allocator, huge_outputs);
}

test "deserialize refuses malformed input and attribute records" {
    const allocator = std.testing.allocator;

    var bad_flags = std.ArrayList(u8).init(allocator);
    defer bad_flags.deinit();
    try appendHeader(&bad_flags, 0, 1, 0);
    var writer = bad_flags.writer();
    try writer.writeInt(u32, 0, .little);
    try writer.writeInt(u64, 1, .little);
    try writer.writeInt(u32, 0, .little);
    try writer.writeByte(2);
    try expectPackageError(error.BadInputFlags, allocator, bad_flags.items);

    var huge_dims = std.ArrayList(u8).init(allocator);
    defer huge_dims.deinit();
    try appendHeader(&huge_dims, 0, 1, 0);
    writer = huge_dims.writer();
    try writer.writeInt(u32, 0, .little);
    try writer.writeInt(u64, 1, .little);
    try writer.writeInt(u32, std.math.maxInt(u32), .little);
    try expectPackageError(error.TruncatedPackage, allocator, huge_dims.items);

    var truncated_input_name = std.ArrayList(u8).init(allocator);
    defer truncated_input_name.deinit();
    try appendHeader(&truncated_input_name, 0, 1, 0);
    writer = truncated_input_name.writer();
    try writer.writeInt(u32, 1, .little);
    try expectPackageError(error.TruncatedPackage, allocator, truncated_input_name.items);

    var huge_node_inputs = std.ArrayList(u8).init(allocator);
    defer huge_node_inputs.deinit();
    try appendHeader(&huge_node_inputs, 1, 0, 0);
    writer = huge_node_inputs.writer();
    try writer.writeInt(u32, 0, .little);
    try writer.writeInt(u32, 0, .little);
    try writer.writeInt(u32, 0, .little);
    try writer.writeInt(u32, std.math.maxInt(u32), .little);
    try expectPackageError(error.TruncatedPackage, allocator, huge_node_inputs.items);

    var huge_node_outputs = std.ArrayList(u8).init(allocator);
    defer huge_node_outputs.deinit();
    try appendHeader(&huge_node_outputs, 1, 0, 0);
    writer = huge_node_outputs.writer();
    try writer.writeInt(u32, 0, .little);
    try writer.writeInt(u32, 0, .little);
    try writer.writeInt(u32, 0, .little);
    try writer.writeInt(u32, 0, .little);
    try writer.writeInt(u32, std.math.maxInt(u32), .little);
    try expectPackageError(error.TruncatedPackage, allocator, huge_node_outputs.items);

    var huge_attributes = std.ArrayList(u8).init(allocator);
    defer huge_attributes.deinit();
    try appendHeader(&huge_attributes, 1, 0, 0);
    writer = huge_attributes.writer();
    try writer.writeInt(u32, 0, .little);
    try writer.writeInt(u32, 0, .little);
    try writer.writeInt(u32, 0, .little);
    try writer.writeInt(u32, 0, .little);
    try writer.writeInt(u32, 0, .little);
    try writer.writeInt(u32, std.math.maxInt(u32), .little);
    try expectPackageError(error.TruncatedPackage, allocator, huge_attributes.items);

    var inverted_order = std.ArrayList(u8).init(allocator);
    defer inverted_order.deinit();
    try appendHeader(&inverted_order, 2, 0, 0);
    try appendSerializedNode(&inverted_order, "consumer", &.{"mid"}, &.{"out"}, 0);
    try appendSerializedNode(&inverted_order, "producer", &.{}, &.{"mid"}, 0);
    try expectPackageError(error.InvalidOrder, allocator, inverted_order.items);

    var duplicate_outputs = std.ArrayList(u8).init(allocator);
    defer duplicate_outputs.deinit();
    try appendHeader(&duplicate_outputs, 2, 0, 0);
    try appendSerializedNode(&duplicate_outputs, "first", &.{}, &.{"mid"}, 0);
    try appendSerializedNode(&duplicate_outputs, "second", &.{}, &.{"mid"}, 0);
    try expectPackageError(error.InvalidOrder, allocator, duplicate_outputs.items);

    var bad_kind = std.ArrayList(u8).init(allocator);
    defer bad_kind.deinit();
    try appendHeader(&bad_kind, 1, 0, 0);
    writer = bad_kind.writer();
    try writer.writeInt(u32, 0, .little);
    try writer.writeInt(u32, 0, .little);
    try writer.writeInt(u32, 0, .little);
    try writer.writeInt(u32, 0, .little);
    try writer.writeInt(u32, 0, .little);
    try writer.writeInt(u32, 1, .little);
    try writer.writeInt(u32, 0, .little);
    try writer.writeByte(255);
    try expectPackageError(error.BadAttributeKind, allocator, bad_kind.items);

    var truncated_ints = std.ArrayList(u8).init(allocator);
    defer truncated_ints.deinit();
    try appendHeader(&truncated_ints, 1, 0, 0);
    writer = truncated_ints.writer();
    try writer.writeInt(u32, 0, .little);
    try writer.writeInt(u32, 0, .little);
    try writer.writeInt(u32, 0, .little);
    try writer.writeInt(u32, 0, .little);
    try writer.writeInt(u32, 0, .little);
    try writer.writeInt(u32, 1, .little);
    try writer.writeInt(u32, 0, .little);
    try writer.writeByte(3);
    try writer.writeInt(u32, 1, .little);
    try expectPackageError(error.TruncatedPackage, allocator, truncated_ints.items);
}
