//! Minimal ONNX protobuf parser for the decoder graph.
//!
//! The parser only needs the fields consumed by Digit's bounded execution
//! pipeline: node identities, graph inputs/outputs, tensor shapes, and the
//! integer/float/string attribute subsets encoded by `model_package.zig`.
//! Untrusted ONNX bytes are nevertheless fail-closed: every field validates its
//! protobuf wire type, all nested records are bounded, tensor/value names are
//! canonical, and graph output identity is unique before scheduling.

const std = @import("std");

pub const MAX_NODES: usize = 4096;
pub const MAX_VALUE_INFOS: usize = 1024;
pub const MAX_NODE_IO_NAMES: usize = 128;
pub const MAX_ATTRIBUTES: usize = 256;
pub const MAX_NAME_BYTES: usize = 1024;
pub const MAX_ATTRIBUTE_NAME_BYTES: usize = 256;
pub const MAX_ATTRIBUTE_STRING_BYTES: usize = 4096;
pub const MAX_ATTRIBUTE_VALUES: usize = 1024;
pub const MAX_SHAPE_DIMS: usize = 8;
pub const MAX_DIM_EXTENT: i64 = 1 << 24;

pub const AttributeKind = enum { integer, float, string, integers, floats };

pub const Attribute = struct {
    allocator: std.mem.Allocator,
    name: []const u8,
    kind: AttributeKind,
    integer: i64 = 0,
    float: f32 = 0,
    string: []const u8 = &.{},
    ints: []i64 = &.{},
    floats: []f32 = &.{},

    pub fn deinit(self: *Attribute) void {
        self.allocator.free(self.name);
        self.allocator.free(self.string);
        self.allocator.free(self.ints);
        self.allocator.free(self.floats);
    }
};

pub const Node = struct {
    allocator: std.mem.Allocator,
    name: []const u8,
    domain: []const u8,
    op_type: []const u8,
    inputs: std.ArrayList([]const u8),
    outputs: std.ArrayList([]const u8),
    attributes: std.ArrayList(Attribute),

    pub fn deinit(self: *Node) void {
        self.allocator.free(self.name);
        self.allocator.free(self.domain);
        self.allocator.free(self.op_type);
        for (self.inputs.items) |item| self.allocator.free(item);
        self.inputs.deinit();
        for (self.outputs.items) |item| self.allocator.free(item);
        self.outputs.deinit();
        for (self.attributes.items) |*attribute| attribute.deinit();
        self.attributes.deinit();
    }
};

pub const ValueInfo = struct {
    allocator: std.mem.Allocator,
    name: []const u8,
    elem_type: u64 = 0,
    dims: []i64 = &.{},

    pub fn deinit(self: *ValueInfo) void {
        self.allocator.free(self.name);
        self.allocator.free(self.dims);
    }
};

pub const Graph = struct {
    allocator: std.mem.Allocator,
    nodes: std.ArrayList(Node),
    inputs: std.ArrayList(ValueInfo),
    outputs: std.ArrayList(ValueInfo),

    pub fn deinit(self: *Graph) void {
        for (self.nodes.items) |*node| node.deinit();
        self.nodes.deinit();
        for (self.inputs.items) |*info| info.deinit();
        self.inputs.deinit();
        for (self.outputs.items) |*info| info.deinit();
        self.outputs.deinit();
    }

    pub fn findInput(self: *const Graph, name: []const u8) ?*const ValueInfo {
        for (self.inputs.items) |*info| if (std.mem.eql(u8, info.name, name)) return info;
        return null;
    }

    /// Returns node indices in deterministic dependency order. Ready nodes are
    /// emitted by their original index, matching the historical scan order;
    /// unresolved nodes imply a dependency cycle.
    pub fn topologicalOrder(self: *const Graph, allocator: std.mem.Allocator) ![]usize {
        const count = self.nodes.items.len;
        if (count > MAX_NODES) return error.TooManyNodes;

        var producers = std.StringHashMap(usize).init(allocator);
        defer producers.deinit();
        for (self.nodes.items, 0..) |node, index| {
            for (node.outputs.items) |output| {
                if (output.len == 0) return error.EmptyName;
                if (producers.contains(output)) return error.DuplicateOutput;
                try producers.put(output, index);
            }
        }

        const pending = try allocator.alloc(usize, count);
        defer allocator.free(pending);
        @memset(pending, 0);
        const consumers = try allocator.alloc(std.ArrayList(usize), count);
        defer allocator.free(consumers);
        for (consumers) |*list| list.* = std.ArrayList(usize).init(allocator);
        defer for (consumers) |*list| list.deinit();

        for (self.nodes.items, 0..) |node, index| {
            for (node.inputs.items) |input| {
                if (input.len == 0) continue;
                if (producers.get(input)) |producer| {
                    pending[index] += 1;
                    try consumers[producer].append(index);
                }
            }
        }

        var ready = std.PriorityQueue(usize, void, compareNodeIndex).init(allocator, {});
        defer ready.deinit();
        for (pending, 0..) |dependencies, index| {
            if (dependencies == 0) try ready.add(index);
        }

        const order = try allocator.alloc(usize, count);
        errdefer allocator.free(order);
        var emitted: usize = 0;
        while (ready.removeOrNull()) |node_index| {
            order[emitted] = node_index;
            emitted += 1;
            for (consumers[node_index].items) |consumer| {
                pending[consumer] -= 1;
                if (pending[consumer] == 0) try ready.add(consumer);
            }
        }
        if (emitted != count) return error.DependencyCycle;
        return order;
    }
};

fn compareNodeIndex(_: void, lhs: usize, rhs: usize) std.math.Order {
    return std.math.order(lhs, rhs);
}

fn valueInfoExists(values: []const ValueInfo, name: []const u8) bool {
    for (values) |existing| if (std.mem.eql(u8, existing.name, name)) return true;
    return false;
}

fn dupeBounded(allocator: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.NameTooLong;
    return try allocator.dupe(u8, bytes);
}

fn replaceOwned(
    allocator: std.mem.Allocator,
    target: *[]const u8,
    bytes: []const u8,
    limit: usize,
) !void {
    const replacement = try dupeBounded(allocator, bytes, limit);
    allocator.free(target.*);
    target.* = replacement;
}

fn appendOwned(
    allocator: std.mem.Allocator,
    list: *std.ArrayList([]const u8),
    bytes: []const u8,
    limit: usize,
) !void {
    if (list.items.len >= MAX_NODE_IO_NAMES) return error.TooManyNames;
    const owned = try dupeBounded(allocator, bytes, limit);
    errdefer allocator.free(owned);
    try list.append(owned);
}

const Reader = struct {
    bytes: []const u8,
    pos: usize = 0,

    fn remaining(self: *const Reader) usize {
        return self.bytes.len - self.pos;
    }

    fn varint(self: *Reader) !u64 {
        var result: u64 = 0;
        var shift: u6 = 0;
        while (true) {
            if (self.pos >= self.bytes.len) return error.Truncated;
            const byte = self.bytes[self.pos];
            self.pos += 1;
            if (shift == 63 and (byte & 0x7f) > 1) return error.VarintOverflow;
            result |= @as(u64, byte & 0x7f) << shift;
            if ((byte & 0x80) == 0) return result;
            if (shift >= 63) return error.VarintOverflow;
            shift = if (shift == 0) 7 else shift + 7;
        }
    }

    fn key(self: *Reader) !struct { field: u32, wire: u3 } {
        const value = try self.varint();
        if (value == 0 or value > std.math.maxInt(u32) or (value >> 3) == 0) {
            return error.InvalidField;
        }
        return .{
            .field = @intCast(value >> 3),
            .wire = @intCast(value & 0x7),
        };
    }

    fn fixed32(self: *Reader) !u32 {
        if (self.remaining() < 4) return error.Truncated;
        defer self.pos += 4;
        return std.mem.readInt(u32, self.bytes[self.pos..][0..4], .little);
    }

    fn bytesField(self: *Reader) ![]const u8 {
        const len64 = try self.varint();
        if (len64 > self.remaining()) return error.Truncated;
        const len: usize = @intCast(len64);
        defer self.pos += len;
        return self.bytes[self.pos .. self.pos + len];
    }

    fn skip(self: *Reader, wire: u3) !void {
        switch (wire) {
            0 => _ = try self.varint(),
            1 => try self.skipBytes(8),
            2 => _ = try self.bytesField(),
            5 => try self.skipBytes(4),
            else => return error.UnsupportedWireType,
        }
    }

    fn skipBytes(self: *Reader, count: usize) !void {
        if (count > self.remaining()) return error.Truncated;
        self.pos += count;
    }
};

pub fn parse(allocator: std.mem.Allocator, bytes: []const u8) !Graph {
    var reader = Reader{ .bytes = bytes };
    var graph = Graph{
        .allocator = allocator,
        .nodes = std.ArrayList(Node).init(allocator),
        .inputs = std.ArrayList(ValueInfo).init(allocator),
        .outputs = std.ArrayList(ValueInfo).init(allocator),
    };
    errdefer graph.deinit();

    var graph_seen = false;
    while (reader.remaining() > 0) {
        const field = try reader.key();
        if (field.field == 7) {
            if (graph_seen) return error.DuplicateGraph;
            graph_seen = true;
            if (field.wire != 2) return error.InvalidWireType;
            const body = try reader.bytesField();
            var graph_reader = Reader{ .bytes = body };
            try parseGraph(&graph_reader, &graph);
        } else {
            try reader.skip(field.wire);
        }
    }
    return graph;
}

fn parseGraph(reader: *Reader, graph: *Graph) !void {
    var produced_names = std.StringHashMap(void).init(graph.allocator);
    defer produced_names.deinit();

    while (reader.remaining() > 0) {
        const field = try reader.key();
        switch (field.field) {
            1 => {
                if (graph.nodes.items.len >= MAX_NODES) return error.TooManyNodes;
                if (field.wire != 2) return error.InvalidWireType;
                const body = try reader.bytesField();
                var node = try parseNode(graph.allocator, body);
                errdefer node.deinit();
                for (node.outputs.items) |output| {
                    if (produced_names.contains(output)) return error.DuplicateOutput;
                    try produced_names.put(output, {});
                }
                try graph.nodes.append(node);
            },
            11, 12 => {
                const list = if (field.field == 11) &graph.inputs else &graph.outputs;
                if (list.items.len >= MAX_VALUE_INFOS) return error.TooManyValueInfos;
                if (field.wire != 2) return error.InvalidWireType;
                const body = try reader.bytesField();
                var info = try parseValueInfo(graph.allocator, body);
                errdefer info.deinit();
                if (valueInfoExists(list.items, info.name)) return error.DuplicateValueInfo;
                try list.append(info);
            },
            else => try reader.skip(field.wire),
        }
    }
}

fn parseNode(allocator: std.mem.Allocator, body: []const u8) !Node {
    var reader = Reader{ .bytes = body };
    var node = Node{
        .allocator = allocator,
        .name = &.{},
        .domain = &.{},
        .op_type = &.{},
        .inputs = std.ArrayList([]const u8).init(allocator),
        .outputs = std.ArrayList([]const u8).init(allocator),
        .attributes = std.ArrayList(Attribute).init(allocator),
    };
    errdefer node.deinit();

    var op_type_seen = false;
    while (reader.remaining() > 0) {
        const field = try reader.key();
        switch (field.field) {
            1 => {
                if (field.wire != 2) return error.InvalidWireType;
                const input = try reader.bytesField();
                try appendOwned(allocator, &node.inputs, input, MAX_NAME_BYTES);
            },
            2 => {
                if (field.wire != 2) return error.InvalidWireType;
                const output = try reader.bytesField();
                if (output.len == 0) return error.EmptyName;
                try appendOwned(allocator, &node.outputs, output, MAX_NAME_BYTES);
            },
            3 => {
                if (field.wire != 2) return error.InvalidWireType;
                try replaceOwned(allocator, &node.name, try reader.bytesField(), MAX_NAME_BYTES);
            },
            4 => {
                if (field.wire != 2) return error.InvalidWireType;
                try replaceOwned(allocator, &node.op_type, try reader.bytesField(), MAX_NAME_BYTES);
                if (node.op_type.len == 0) return error.EmptyOpType;
                op_type_seen = true;
            },
            5 => {
                if (node.attributes.items.len >= MAX_ATTRIBUTES) return error.TooManyAttributes;
                if (field.wire != 2) return error.InvalidWireType;
                const attr_body = try reader.bytesField();
                var attribute = try parseAttribute(allocator, attr_body);
                errdefer attribute.deinit();
                try node.attributes.append(attribute);
            },
            7 => {
                if (field.wire != 2) return error.InvalidWireType;
                try replaceOwned(allocator, &node.domain, try reader.bytesField(), MAX_NAME_BYTES);
            },
            else => try reader.skip(field.wire),
        }
    }
    if (!op_type_seen) return error.MissingOpType;
    if (node.outputs.items.len == 0) return error.MissingOutput;
    return node;
}

fn parseValueInfo(allocator: std.mem.Allocator, body: []const u8) !ValueInfo {
    var reader = Reader{ .bytes = body };
    var info = ValueInfo{
        .allocator = allocator,
        .name = &.{},
    };
    errdefer info.deinit();

    while (reader.remaining() > 0) {
        const field = try reader.key();
        switch (field.field) {
            1 => {
                if (field.wire != 2) return error.InvalidWireType;
                try replaceOwned(allocator, &info.name, try reader.bytesField(), MAX_NAME_BYTES);
            },
            2 => {
                if (field.wire != 2) return error.InvalidWireType;
                try parseTypeProto(try reader.bytesField(), &info);
            },
            else => try reader.skip(field.wire),
        }
    }
    if (info.name.len == 0) return error.MissingName;
    return info;
}

fn parseTypeProto(body: []const u8, info: *ValueInfo) !void {
    var reader = Reader{ .bytes = body };
    while (reader.remaining() > 0) {
        const field = try reader.key();
        if (field.field == 1) {
            if (field.wire != 2) return error.InvalidWireType;
            try parseTensorType(try reader.bytesField(), info);
        } else {
            try reader.skip(field.wire);
        }
    }
}

fn parseTensorType(body: []const u8, info: *ValueInfo) !void {
    var reader = Reader{ .bytes = body };
    while (reader.remaining() > 0) {
        const field = try reader.key();
        switch (field.field) {
            1 => {
                if (field.wire != 0) return error.InvalidWireType;
                const value = try reader.varint();
                if (value > std.math.maxInt(u32)) return error.InvalidElementType;
                info.elem_type = value;
            },
            2 => {
                if (field.wire != 2) return error.InvalidWireType;
                try parseShape(try reader.bytesField(), info);
            },
            else => try reader.skip(field.wire),
        }
    }
}

fn parseShape(body: []const u8, info: *ValueInfo) !void {
    var reader = Reader{ .bytes = body };
    var dims = std.ArrayList(i64).init(info.allocator);
    defer dims.deinit();

    while (reader.remaining() > 0) {
        const field = try reader.key();
        if (field.field != 1) {
            try reader.skip(field.wire);
            continue;
        }
        if (dims.items.len >= MAX_SHAPE_DIMS) return error.TooManyDims;
        if (field.wire != 2) return error.InvalidWireType;
        const dim_body = try reader.bytesField();
        try dims.append(try parseDim(dim_body));
    }

    const replacement = try dims.toOwnedSlice();
    info.allocator.free(info.dims);
    info.dims = replacement;
}

fn parseDim(body: []const u8) !i64 {
    var reader = Reader{ .bytes = body };
    var value: i64 = -1;
    while (reader.remaining() > 0) {
        const field = try reader.key();
        switch (field.field) {
            1 => {
                if (field.wire != 0) return error.InvalidWireType;
                const raw = try reader.varint();
                if (raw > @as(u64, @intCast(std.math.maxInt(i64)))) {
                    return error.InvalidDim;
                }
                const signed: i64 = @intCast(raw);
                if (signed < 0 or signed > MAX_DIM_EXTENT) return error.InvalidDim;
                value = signed;
            },
            2 => {
                if (field.wire != 2) return error.InvalidWireType;
                const param = try reader.bytesField();
                if (param.len > MAX_NAME_BYTES) return error.NameTooLong;
                value = -1;
            },
            else => try reader.skip(field.wire),
        }
    }
    return value;
}

fn parseAttribute(allocator: std.mem.Allocator, body: []const u8) !Attribute {
    var reader = Reader{ .bytes = body };
    var name: []const u8 = &.{};
    var string: []const u8 = &.{};
    var integer: i64 = 0;
    var float: f32 = 0;
    var kind: AttributeKind = .integer;
    var ints = std.ArrayList(i64).init(allocator);
    defer ints.deinit();
    var floats = std.ArrayList(f32).init(allocator);
    defer floats.deinit();
    errdefer allocator.free(name);
    errdefer allocator.free(string);
    var value_kind: ?AttributeKind = null;

    while (reader.remaining() > 0) {
        const field = try reader.key();
        switch (field.field) {
            1 => {
                if (field.wire != 2) return error.InvalidWireType;
                const raw = try reader.bytesField();
                const replacement = try dupeBounded(allocator, raw, MAX_ATTRIBUTE_NAME_BYTES);
                allocator.free(name);
                name = replacement;
            },
            2 => {
                if (field.wire != 5) return error.InvalidWireType;
                if (value_kind != null) return error.AmbiguousAttribute;
                float = @bitCast(try reader.fixed32());
                kind = .float;
                value_kind = .float;
            },
            3 => {
                if (field.wire != 0) return error.InvalidWireType;
                if (value_kind != null) return error.AmbiguousAttribute;
                integer = @bitCast(try reader.varint());
                kind = .integer;
                value_kind = .integer;
            },
            4 => {
                if (field.wire != 2) return error.InvalidWireType;
                if (value_kind != null) return error.AmbiguousAttribute;
                const raw = try reader.bytesField();
                const replacement = try dupeBounded(allocator, raw, MAX_ATTRIBUTE_STRING_BYTES);
                allocator.free(string);
                string = replacement;
                kind = .string;
                value_kind = .string;
            },
            7 => {
                if (value_kind != null and value_kind != .floats) return error.AmbiguousAttribute;
                switch (field.wire) {
                    5 => {
                        if (floats.items.len >= MAX_ATTRIBUTE_VALUES) return error.TooManyAttributeValues;
                        try floats.append(@bitCast(try reader.fixed32()));
                    },
                    2 => {
                        const packed_body = try reader.bytesField();
                        if (packed_body.len % 4 != 0) return error.Truncated;
                        if (packed_body.len / 4 > MAX_ATTRIBUTE_VALUES - floats.items.len) {
                            return error.TooManyAttributeValues;
                        }
                        var packed_reader = Reader{ .bytes = packed_body };
                        while (packed_reader.remaining() > 0) {
                            try floats.append(@bitCast(try packed_reader.fixed32()));
                        }
                    },
                    else => return error.InvalidWireType,
                }
                kind = .floats;
                value_kind = .floats;
            },
            8 => {
                if (value_kind != null and value_kind != .integers) return error.AmbiguousAttribute;
                switch (field.wire) {
                    0 => {
                        if (ints.items.len >= MAX_ATTRIBUTE_VALUES) return error.TooManyAttributeValues;
                        try ints.append(@bitCast(try reader.varint()));
                    },
                    2 => {
                        const packed_body = try reader.bytesField();
                        var packed_reader = Reader{ .bytes = packed_body };
                        while (packed_reader.remaining() > 0) {
                            if (ints.items.len >= MAX_ATTRIBUTE_VALUES) return error.TooManyAttributeValues;
                            try ints.append(@bitCast(try packed_reader.varint()));
                        }
                    },
                    else => return error.InvalidWireType,
                }
                kind = .integers;
                value_kind = .integers;
            },
            else => try reader.skip(field.wire),
        }
    }

    if (name.len == 0) return error.MissingName;
    if (value_kind == null) return error.MissingAttributeValue;
    const owned_ints = try ints.toOwnedSlice();
    errdefer allocator.free(owned_ints);
    const owned_floats = try floats.toOwnedSlice();
    errdefer allocator.free(owned_floats);
    return .{
        .allocator = allocator,
        .name = name,
        .kind = kind,
        .integer = integer,
        .float = float,
        .string = string,
        .ints = owned_ints,
        .floats = owned_floats,
    };
}

fn appendNode(
    graph: *Graph,
    name: []const u8,
    op_type: []const u8,
    inputs: []const []const u8,
    outputs: []const []const u8,
) !void {
    const allocator = graph.allocator;
    var node = Node{
        .allocator = allocator,
        .name = &.{},
        .domain = &.{},
        .op_type = &.{},
        .inputs = std.ArrayList([]const u8).init(allocator),
        .outputs = std.ArrayList([]const u8).init(allocator),
        .attributes = std.ArrayList(Attribute).init(allocator),
    };
    errdefer node.deinit();
    try replaceOwned(allocator, &node.name, name, MAX_NAME_BYTES);
    try replaceOwned(allocator, &node.domain, "ai.onnx", MAX_NAME_BYTES);
    try replaceOwned(allocator, &node.op_type, op_type, MAX_NAME_BYTES);
    for (inputs) |input| try appendOwned(allocator, &node.inputs, input, MAX_NAME_BYTES);
    for (outputs) |output| try appendOwned(allocator, &node.outputs, output, MAX_NAME_BYTES);
    try graph.nodes.append(node);
}

fn graphFixture(allocator: std.mem.Allocator) !Graph {
    var graph = Graph{
        .allocator = allocator,
        .nodes = std.ArrayList(Node).init(allocator),
        .inputs = std.ArrayList(ValueInfo).init(allocator),
        .outputs = std.ArrayList(ValueInfo).init(allocator),
    };
    errdefer graph.deinit();

    var input = ValueInfo{ .allocator = allocator, .name = try allocator.dupe(u8, "input") };
    var input_owned = true;
    errdefer if (input_owned) input.deinit();
    input.elem_type = 1;
    input.dims = try allocator.dupe(i64, &.{ 1, 4 });
    try graph.inputs.append(input);
    input_owned = false;

    var output = ValueInfo{ .allocator = allocator, .name = try allocator.dupe(u8, "final") };
    var output_owned = true;
    errdefer if (output_owned) output.deinit();
    output.elem_type = 1;
    output.dims = try allocator.dupe(i64, &.{1});
    try graph.outputs.append(output);
    output_owned = false;

    try appendNode(&graph, "a", "Identity", &.{"input"}, &.{"a"});
    try appendNode(&graph, "b", "Relu", &.{"a"}, &.{"b"});
    try appendNode(&graph, "c", "Add", &.{ "b", "a" }, &.{"c"});
    try appendNode(&graph, "d", "Identity", &.{"c"}, &.{"final"});
    return graph;
}

fn appendVarint(bytes: *std.ArrayList(u8), value: u64) !void {
    var current = value;
    while (true) {
        const byte: u8 = @intCast(current & 0x7f);
        current >>= 7;
        if (current == 0) {
            try bytes.append(byte);
            return;
        }
        try bytes.append(byte | 0x80);
    }
}

fn appendKey(bytes: *std.ArrayList(u8), field: u32, wire: u3) !void {
    try appendVarint(bytes, (@as(u64, field) << 3) | wire);
}

fn appendBytesField(bytes: *std.ArrayList(u8), field: u32, value: []const u8) !void {
    try appendKey(bytes, field, 2);
    try appendVarint(bytes, value.len);
    try bytes.appendSlice(value);
}

test "graph parser orders dependent nodes" {
    const allocator = std.testing.allocator;
    var graph = try graphFixture(allocator);
    defer graph.deinit();

    const order = try graph.topologicalOrder(allocator);
    defer allocator.free(order);
    try std.testing.expectEqualSlices(usize, &.{ 0, 1, 2, 3 }, order);
}

test "topological order preserves earliest ready node when dependencies resolve" {
    const allocator = std.testing.allocator;
    var graph = Graph{
        .allocator = allocator,
        .nodes = std.ArrayList(Node).init(allocator),
        .inputs = std.ArrayList(ValueInfo).init(allocator),
        .outputs = std.ArrayList(ValueInfo).init(allocator),
    };
    defer graph.deinit();
    try appendNode(&graph, "tail", "Identity", &.{"x"}, &.{"tail"});
    try appendNode(&graph, "dependent", "Identity", &.{"tail"}, &.{"dep"});
    try appendNode(&graph, "external", "Identity", &.{"external_in"}, &.{"ext"});

    const order = try graph.topologicalOrder(allocator);
    defer allocator.free(order);
    try std.testing.expectEqualSlices(usize, &.{ 0, 1, 2 }, order);
}

test "topological order rejects duplicate outputs and cycles" {
    const allocator = std.testing.allocator;
    var graph = Graph{
        .allocator = allocator,
        .nodes = std.ArrayList(Node).init(allocator),
        .inputs = std.ArrayList(ValueInfo).init(allocator),
        .outputs = std.ArrayList(ValueInfo).init(allocator),
    };
    defer graph.deinit();
    try appendNode(&graph, "first", "Identity", &.{"x"}, &.{"dup"});
    try appendNode(&graph, "second", "Identity", &.{"y"}, &.{"dup"});
    try std.testing.expectError(error.DuplicateOutput, graph.topologicalOrder(allocator));

    const cycle_b_out = try allocator.dupe(u8, "cycle_b");
    errdefer allocator.free(cycle_b_out);
    const cycle_a_in = try allocator.dupe(u8, "cycle_a");
    errdefer allocator.free(cycle_a_in);
    const cycle_a_out = try allocator.dupe(u8, "cycle_a");
    errdefer allocator.free(cycle_a_out);
    const cycle_b_in = try allocator.dupe(u8, "cycle_b");
    errdefer allocator.free(cycle_b_in);
    allocator.free(graph.nodes.items[1].outputs.items[0]);
    allocator.free(graph.nodes.items[1].inputs.items[0]);
    allocator.free(graph.nodes.items[0].outputs.items[0]);
    allocator.free(graph.nodes.items[0].inputs.items[0]);
    graph.nodes.items[1].outputs.items[0] = cycle_b_out;
    graph.nodes.items[1].inputs.items[0] = cycle_a_in;
    graph.nodes.items[0].outputs.items[0] = cycle_a_out;
    graph.nodes.items[0].inputs.items[0] = cycle_b_in;
    try std.testing.expectError(error.DependencyCycle, graph.topologicalOrder(allocator));
}

test "graph protobuf parser preserves value info and attributes" {
    const allocator = std.testing.allocator;

    var shape = std.ArrayList(u8).init(allocator);
    defer shape.deinit();
    var dim = std.ArrayList(u8).init(allocator);
    defer dim.deinit();
    try appendKey(&dim, 1, 0);
    try appendVarint(&dim, 4);
    try appendBytesField(&shape, 1, dim.items);
    dim.clearRetainingCapacity();
    try appendKey(&dim, 2, 2);
    try appendVarint(&dim, 6);
    try dim.appendSlice("tokens");
    try appendBytesField(&shape, 1, dim.items);

    var tensor_type = std.ArrayList(u8).init(allocator);
    defer tensor_type.deinit();
    try appendKey(&tensor_type, 1, 0);
    try appendVarint(&tensor_type, 1);
    try appendBytesField(&tensor_type, 2, shape.items);

    var type_proto = std.ArrayList(u8).init(allocator);
    defer type_proto.deinit();
    try appendBytesField(&type_proto, 1, tensor_type.items);

    var input_info = std.ArrayList(u8).init(allocator);
    defer input_info.deinit();
    try appendBytesField(&input_info, 1, "input");
    try appendBytesField(&input_info, 2, type_proto.items);

    var attr = std.ArrayList(u8).init(allocator);
    defer attr.deinit();
    try appendBytesField(&attr, 1, "axis");
    var packed_ints = std.ArrayList(u8).init(allocator);
    defer packed_ints.deinit();
    try appendVarint(&packed_ints, 1);
    try appendVarint(&packed_ints, 2);
    try appendBytesField(&attr, 8, packed_ints.items);
    try appendKey(&attr, 8, 0);
    try appendVarint(&attr, 3);

    var node = std.ArrayList(u8).init(allocator);
    defer node.deinit();
    try appendBytesField(&node, 1, "input");
    try appendBytesField(&node, 2, "output");
    try appendBytesField(&node, 4, "Identity");
    try appendBytesField(&node, 5, attr.items);

    var graph_body = std.ArrayList(u8).init(allocator);
    defer graph_body.deinit();
    try appendBytesField(&graph_body, 1, node.items);
    try appendBytesField(&graph_body, 11, input_info.items);

    var model = std.ArrayList(u8).init(allocator);
    defer model.deinit();
    try appendBytesField(&model, 7, graph_body.items);

    var graph = try parse(allocator, model.items);
    defer graph.deinit();
    try std.testing.expectEqual(@as(usize, 1), graph.nodes.items.len);
    try std.testing.expectEqual(@as(usize, 1), graph.inputs.items.len);
    try std.testing.expectEqualStrings("input", graph.inputs.items[0].name);
    try std.testing.expectEqualSlices(i64, &.{ 4, -1 }, graph.inputs.items[0].dims);
    try std.testing.expectEqualSlices(i64, &.{ 1, 2, 3 }, graph.nodes.items[0].attributes.items[0].ints);
}

test "graph parser rejects malformed wire types and duplicate graph fields" {
    const allocator = std.testing.allocator;

    var malformed_node = std.ArrayList(u8).init(allocator);
    defer malformed_node.deinit();
    try appendKey(&malformed_node, 1, 0);
    try appendVarint(&malformed_node, 0);
    try appendBytesField(&malformed_node, 2, "output");
    try appendBytesField(&malformed_node, 4, "Identity");

    var malformed_graph = std.ArrayList(u8).init(allocator);
    defer malformed_graph.deinit();
    try appendBytesField(&malformed_graph, 1, malformed_node.items);

    var malformed_model = std.ArrayList(u8).init(allocator);
    defer malformed_model.deinit();
    try appendBytesField(&malformed_model, 7, malformed_graph.items);
    try std.testing.expectError(error.InvalidWireType, parse(allocator, malformed_model.items));

    var valid_node = std.ArrayList(u8).init(allocator);
    defer valid_node.deinit();
    try appendBytesField(&valid_node, 2, "output");
    try appendBytesField(&valid_node, 4, "Identity");
    var valid_graph = std.ArrayList(u8).init(allocator);
    defer valid_graph.deinit();
    try appendBytesField(&valid_graph, 1, valid_node.items);

    var model = std.ArrayList(u8).init(allocator);
    defer model.deinit();
    try appendBytesField(&model, 7, valid_graph.items);
    try appendBytesField(&model, 7, valid_graph.items);
    try std.testing.expectError(error.DuplicateGraph, parse(allocator, model.items));

    var duplicate_node = std.ArrayList(u8).init(allocator);
    defer duplicate_node.deinit();
    try appendBytesField(&duplicate_node, 2, "output");
    try appendBytesField(&duplicate_node, 4, "Identity");
    var duplicate_graph = std.ArrayList(u8).init(allocator);
    defer duplicate_graph.deinit();
    try appendBytesField(&duplicate_graph, 1, valid_node.items);
    try appendBytesField(&duplicate_graph, 1, duplicate_node.items);
    var duplicate_model = std.ArrayList(u8).init(allocator);
    defer duplicate_model.deinit();
    try appendBytesField(&duplicate_model, 7, duplicate_graph.items);
    try std.testing.expectError(error.DuplicateOutput, parse(allocator, duplicate_model.items));
}

test "node parser rejects missing op type, empty outputs, and value-less attributes" {
    const allocator = std.testing.allocator;
    var node = std.ArrayList(u8).init(allocator);
    defer node.deinit();
    try appendBytesField(&node, 2, "output");
    try std.testing.expectError(error.MissingOpType, parseNode(allocator, node.items));

    node.clearRetainingCapacity();
    try appendBytesField(&node, 4, "Identity");
    try appendBytesField(&node, 2, "");
    try std.testing.expectError(error.EmptyName, parseNode(allocator, node.items));

    var attribute = std.ArrayList(u8).init(allocator);
    defer attribute.deinit();
    try appendBytesField(&attribute, 1, "axis");
    node.clearRetainingCapacity();
    try appendBytesField(&node, 4, "Identity");
    try appendBytesField(&node, 2, "output");
    try appendBytesField(&node, 5, attribute.items);
    try std.testing.expectError(error.MissingAttributeValue, parseNode(allocator, node.items));
}

test "value-info parser bounds rank and rejects duplicate names" {
    const allocator = std.testing.allocator;
    var info_body = std.ArrayList(u8).init(allocator);
    defer info_body.deinit();
    try appendBytesField(&info_body, 1, "x");

    var tensor_type = std.ArrayList(u8).init(allocator);
    defer tensor_type.deinit();
    var shape = std.ArrayList(u8).init(allocator);
    defer shape.deinit();
    for (0..MAX_SHAPE_DIMS + 1) |_| {
        var dim = std.ArrayList(u8).init(allocator);
        defer dim.deinit();
        try appendKey(&dim, 1, 0);
        try appendVarint(&dim, 1);
        try appendBytesField(&shape, 1, dim.items);
    }
    try appendBytesField(&tensor_type, 2, shape.items);
    var type_proto = std.ArrayList(u8).init(allocator);
    defer type_proto.deinit();
    try appendBytesField(&type_proto, 1, tensor_type.items);
    try appendBytesField(&info_body, 2, type_proto.items);
    try std.testing.expectError(error.TooManyDims, parseValueInfo(allocator, info_body.items));

    var named_info = std.ArrayList(u8).init(allocator);
    defer named_info.deinit();
    try appendBytesField(&named_info, 1, "duplicate");
    var duplicate_graph = std.ArrayList(u8).init(allocator);
    defer duplicate_graph.deinit();
    try appendBytesField(&duplicate_graph, 11, named_info.items);
    try appendBytesField(&duplicate_graph, 11, named_info.items);
    var model = std.ArrayList(u8).init(allocator);
    defer model.deinit();
    try appendBytesField(&model, 7, duplicate_graph.items);
    try std.testing.expectError(error.DuplicateValueInfo, parse(allocator, model.items));
}

test "varint parser rejects tenth-byte overflow" {
    var reader = Reader{ .bytes = &.{ 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x02 } };
    try std.testing.expectError(error.VarintOverflow, reader.varint());
}
