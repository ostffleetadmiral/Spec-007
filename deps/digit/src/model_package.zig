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

fn writeU32(writer: anytype, value: u64) !void {
    try writer.writeInt(u32, @intCast(value), .little);
}

fn writeString(writer: anytype, value: []const u8) !void {
    try writeU32(writer, value.len);
    try writer.writeAll(value);
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

    fn u32v(self: *Reader) !u32 {
        if (self.pos + 4 > self.bytes.len) return error.TruncatedPackage;
        defer self.pos += 4;
        return std.mem.readInt(u32, self.bytes[self.pos..][0..4], .little);
    }

    fn u64v(self: *Reader) !u64 {
        if (self.pos + 8 > self.bytes.len) return error.TruncatedPackage;
        defer self.pos += 8;
        return std.mem.readInt(u64, self.bytes[self.pos..][0..8], .little);
    }

    fn i64v(self: *Reader) !i64 {
        return @bitCast(try self.u64v());
    }

    fn byte(self: *Reader) !u8 {
        if (self.pos + 1 > self.bytes.len) return error.TruncatedPackage;
        defer self.pos += 1;
        return self.bytes[self.pos];
    }

    fn string(self: *Reader, allocator: std.mem.Allocator) ![]u8 {
        const len = try self.u32v();
        if (len > self.bytes.len - self.pos) return error.TruncatedPackage;
        defer self.pos += len;
        return try allocator.dupe(u8, self.bytes[self.pos .. self.pos + len]);
    }
};

/// Deserializes a package into owned nodes/inputs. The emitted node order is
/// the serialized order — already topological — so `order` is the identity.
pub fn deserialize(allocator: std.mem.Allocator, bytes: []const u8) !Package {
    var reader = Reader{ .bytes = bytes };
    if (try reader.u32v() != MAGIC) return error.BadMagic;
    if (try reader.u32v() != VERSION) return error.BadVersion;
    const node_count = try reader.u32v();
    const input_count = try reader.u32v();
    const output_count = try reader.u32v();

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
        const dims = try allocator.alloc(i64, dim_count);
        errdefer allocator.free(dims);
        for (dims) |*dim| dim.* = try reader.i64v();
        const flags = try reader.byte();
        try package.inputs.append(.{
            .name = name,
            .elem_type = elem_type,
            .dims = dims,
            .is_initializer = flags & 1 != 0,
        });
    }

    for (0..output_count) |_| {
        try package.outputs.append(try reader.string(allocator));
    }

    try package.nodes.ensureTotalCapacity(node_count);
    for (0..node_count) |_| {
        var node = onnx.Node{
            .allocator = allocator,
            .name = try reader.string(allocator),
            .domain = try reader.string(allocator),
            .op_type = try reader.string(allocator),
            .inputs = std.ArrayList([]const u8).init(allocator),
            .outputs = std.ArrayList([]const u8).init(allocator),
            .attributes = std.ArrayList(onnx.Attribute).init(allocator),
        };
        errdefer node.deinit();
        const in_count = try reader.u32v();
        for (0..in_count) |_| try node.inputs.append(try reader.string(allocator));
        const out_count = try reader.u32v();
        for (0..out_count) |_| try node.outputs.append(try reader.string(allocator));
        const attr_count = try reader.u32v();
        for (0..attr_count) |_| {
            var attribute = onnx.Attribute{
                .allocator = allocator,
                .name = try reader.string(allocator),
                .kind = .integer,
            };
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
                    attribute.ints = try allocator.alloc(i64, count);
                    for (attribute.ints) |*value| value.* = try reader.i64v();
                },
                4 => {
                    attribute.kind = .floats;
                    const count = try reader.u32v();
                    attribute.floats = try allocator.alloc(f32, count);
                    for (attribute.floats) |*value| value.* = @bitCast(try reader.u32v());
                },
                else => return error.BadAttributeKind,
            }
            try node.attributes.append(attribute);
        }
        try package.nodes.append(node);
    }

    const order = try allocator.alloc(usize, package.nodes.items.len);
    for (order, 0..) |*slot, index| slot.* = index;
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
