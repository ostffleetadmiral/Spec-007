const std = @import("std");

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

    fn deinit(self: *Attribute) void {
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
        for (self.inputs.items) |value| self.allocator.free(value);
        for (self.outputs.items) |value| self.allocator.free(value);
        for (self.attributes.items) |*attribute| attribute.deinit();
        self.inputs.deinit();
        self.outputs.deinit();
        self.attributes.deinit();
    }
};

pub const ValueInfo = struct {
    allocator: std.mem.Allocator,
    name: []const u8,
    elem_type: u64 = 0,
    dims: []i64 = &.{},

    fn deinit(self: *ValueInfo) void {
        self.allocator.free(self.name);
        self.allocator.free(self.dims);
    }
};

pub const Graph = struct {
    allocator: std.mem.Allocator,
    nodes: std.ArrayList(Node),
    inputs: std.ArrayList(ValueInfo) = undefined,
    outputs: std.ArrayList(ValueInfo) = undefined,

    pub fn deinit(self: *Graph) void {
        for (self.nodes.items) |*node| node.deinit();
        self.nodes.deinit();
        for (self.inputs.items) |*value| value.deinit();
        for (self.outputs.items) |*value| value.deinit();
        self.inputs.deinit();
        self.outputs.deinit();
    }

    pub fn findInput(self: *const Graph, name: []const u8) ?*const ValueInfo {
        for (self.inputs.items) |*value| if (std.mem.eql(u8, value.name, name)) return value;
        return null;
    }

    pub fn topologicalOrder(self: *const Graph, allocator: std.mem.Allocator) ![]usize {
        const count = self.nodes.items.len;
        var remaining = try allocator.alloc(usize, count);
        errdefer allocator.free(remaining);
        var order = try allocator.alloc(usize, count);
        errdefer allocator.free(order);
        for (remaining, 0..) |*value, index| value.* = index;
        var emitted: usize = 0;
        while (emitted < count) {
            var progress = false;
            for (0..count) |candidate| {
                if (remaining[candidate] == count) continue;
                var ready = true;
                for (self.nodes.items[candidate].inputs.items) |input| {
                    if (input.len == 0) continue;
                    if (findProducer(self, input)) |producer| {
                        if (remaining[producer] != count) {
                            ready = false;
                            break;
                        }
                    }
                }
                if (ready) {
                    order[emitted] = candidate;
                    emitted += 1;
                    remaining[candidate] = count;
                    progress = true;
                }
            }
            if (!progress) {
                allocator.free(remaining);
                allocator.free(order);
                return error.DependencyCycle;
            }
        }
        allocator.free(remaining);
        return order;
    }
};

const Reader = struct {
    bytes: []const u8,
    pos: usize = 0,
    fn eof(self: *const Reader) bool {
        return self.pos >= self.bytes.len;
    }
    fn varint(self: *Reader) !u64 {
        var result: u64 = 0;
        var shift: u6 = 0;
        while (true) {
            if (self.pos >= self.bytes.len or shift >= 64) return error.InvalidVarint;
            const byte = self.bytes[self.pos];
            self.pos += 1;
            result |= @as(u64, byte & 0x7f) << shift;
            if (byte & 0x80 == 0) return result;
            shift += 7;
        }
    }
    fn key(self: *Reader) !struct { field: u32, wire: u3 } {
        const value = try self.varint();
        if (value >> 3 == 0) return error.InvalidField;
        return .{ .field = @intCast(value >> 3), .wire = @intCast(value & 7) };
    }
    fn fixed32(self: *Reader) !u32 {
        if (self.bytes.len - self.pos < 4) return error.TruncatedMessage;
        const value = std.mem.readInt(u32, self.bytes[self.pos..][0..4], .little);
        self.pos += 4;
        return value;
    }

    fn bytesField(self: *Reader) ![]const u8 {
        const length = try self.varint();
        if (length > self.bytes.len - self.pos) return error.TruncatedMessage;
        const start = self.pos;
        self.pos += @intCast(length);
        return self.bytes[start..self.pos];
    }
    fn skip(self: *Reader, wire: u3) !void {
        switch (wire) {
            0 => _ = try self.varint(),
            1 => self.pos += 8,
            2 => _ = try self.bytesField(),
            5 => self.pos += 4,
            else => return error.UnsupportedWireType,
        }
        if (self.pos > self.bytes.len) return error.TruncatedMessage;
    }
};

pub fn parse(allocator: std.mem.Allocator, bytes: []const u8) !Graph {
    var graph = Graph{
        .allocator = allocator,
        .nodes = std.ArrayList(Node).init(allocator),
        .inputs = std.ArrayList(ValueInfo).init(allocator),
        .outputs = std.ArrayList(ValueInfo).init(allocator),
    };
    errdefer graph.deinit();
    var reader = Reader{ .bytes = bytes };
    while (!reader.eof()) {
        const field = try reader.key();
        if (field.field == 7) {
            if (field.wire != 2) return error.InvalidWireType;
            try parseGraph(&graph, try reader.bytesField());
        } else try reader.skip(field.wire);
    }
    return graph;
}

fn parseGraph(graph: *Graph, bytes: []const u8) !void {
    var reader = Reader{ .bytes = bytes };
    while (!reader.eof()) {
        const field = try reader.key();
        if (field.field == 1) {
            if (field.wire != 2) return error.InvalidWireType;
            try parseNode(graph, try reader.bytesField());
        } else if (field.field == 11 or field.field == 12) {
            if (field.wire != 2) return error.InvalidWireType;
            const list = if (field.field == 11) &graph.inputs else &graph.outputs;
            try list.append(try parseValueInfo(graph.allocator, try reader.bytesField()));
        } else try reader.skip(field.wire);
    }
}

fn parseNode(graph: *Graph, bytes: []const u8) !void {
    var reader = Reader{ .bytes = bytes };
    var node = Node{
        .allocator = graph.allocator,
        .name = &.{},
        .domain = try graph.allocator.dupe(u8, "ai.onnx"),
        .op_type = &.{},
        .inputs = std.ArrayList([]const u8).init(graph.allocator),
        .outputs = std.ArrayList([]const u8).init(graph.allocator),
        .attributes = std.ArrayList(Attribute).init(graph.allocator),
    };
    errdefer node.deinit();
    while (!reader.eof()) {
        const field = try reader.key();
        switch (field.field) {
            1 => try node.inputs.append(try graph.allocator.dupe(u8, try reader.bytesField())),
            2 => try node.outputs.append(try graph.allocator.dupe(u8, try reader.bytesField())),
            3 => {
                graph.allocator.free(node.name);
                node.name = try graph.allocator.dupe(u8, try reader.bytesField());
            },
            4 => {
                graph.allocator.free(node.op_type);
                node.op_type = try graph.allocator.dupe(u8, try reader.bytesField());
            },
            5 => try node.attributes.append(try parseAttribute(graph.allocator, try reader.bytesField())),
            7 => {
                graph.allocator.free(node.domain);
                node.domain = try graph.allocator.dupe(u8, try reader.bytesField());
            },
            else => try reader.skip(field.wire),
        }
    }
    try graph.nodes.append(node);
}

fn parseAttribute(allocator: std.mem.Allocator, bytes: []const u8) !Attribute {
    var reader = Reader{ .bytes = bytes };
    var name: []const u8 = "";
    var kind: AttributeKind = .integer;
    var integer: i64 = 0;
    var float: f32 = 0;
    var string: []const u8 = &.{};
    var ints = std.ArrayList(i64).init(allocator);
    defer ints.deinit();
    var floats = std.ArrayList(f32).init(allocator);
    defer floats.deinit();
    while (!reader.eof()) {
        const field = try reader.key();
        switch (field.field) {
            1 => name = try reader.bytesField(),
            2 => {
                if (field.wire != 5) return error.InvalidWireType;
                float = @bitCast(try reader.fixed32());
                kind = .float;
            },
            3 => {
                integer = @bitCast(try reader.varint());
                kind = .integer;
            },
            4 => {
                string = try reader.bytesField();
                kind = .string;
            },
            7 => {
                if (field.wire == 5) {
                    try floats.append(@bitCast(try reader.fixed32()));
                } else {
                    const packed_values = try reader.bytesField();
                    var packed_reader = Reader{ .bytes = packed_values };
                    while (!packed_reader.eof()) {
                        if (packed_reader.bytes.len - packed_reader.pos < 4) return error.TruncatedMessage;
                        try floats.append(@bitCast(try packed_reader.fixed32()));
                    }
                }
                kind = .floats;
            },
            8 => {
                if (field.wire == 0) {
                    try ints.append(@bitCast(try reader.varint()));
                } else {
                    const packed_values = try reader.bytesField();
                    var packed_reader = Reader{ .bytes = packed_values };
                    while (!packed_reader.eof()) try ints.append(@bitCast(try packed_reader.varint()));
                }
                kind = .integers;
            },
            else => try reader.skip(field.wire),
        }
    }
    if (name.len == 0) return error.InvalidAttribute;
    return .{
        .allocator = allocator,
        .name = try allocator.dupe(u8, name),
        .kind = kind,
        .integer = integer,
        .float = float,
        .string = try allocator.dupe(u8, string),
        .ints = try ints.toOwnedSlice(),
        .floats = try floats.toOwnedSlice(),
    };
}

fn parseValueInfo(allocator: std.mem.Allocator, bytes: []const u8) !ValueInfo {
    var info = ValueInfo{ .allocator = allocator, .name = &.{} };
    errdefer info.deinit();
    var reader = Reader{ .bytes = bytes };
    while (!reader.eof()) {
        const field = try reader.key();
        if (field.field == 1) {
            allocator.free(info.name);
            info.name = try allocator.dupe(u8, try reader.bytesField());
        } else if (field.field == 2) {
            try parseTypeProto(&info, try reader.bytesField());
        } else try reader.skip(field.wire);
    }
    return info;
}

fn parseTypeProto(info: *ValueInfo, bytes: []const u8) !void {
    var reader = Reader{ .bytes = bytes };
    while (!reader.eof()) {
        const field = try reader.key();
        if (field.field == 1) {
            try parseTensorType(info, try reader.bytesField());
        } else try reader.skip(field.wire);
    }
}

fn parseTensorType(info: *ValueInfo, bytes: []const u8) !void {
    var reader = Reader{ .bytes = bytes };
    while (!reader.eof()) {
        const field = try reader.key();
        if (field.field == 1) {
            info.elem_type = try reader.varint();
        } else if (field.field == 2) {
            try parseShape(info, try reader.bytesField());
        } else try reader.skip(field.wire);
    }
}

fn parseShape(info: *ValueInfo, bytes: []const u8) !void {
    var dims = std.ArrayList(i64).init(info.allocator);
    defer dims.deinit();
    var reader = Reader{ .bytes = bytes };
    while (!reader.eof()) {
        const field = try reader.key();
        if (field.field == 1) {
            var dim_reader = Reader{ .bytes = try reader.bytesField() };
            var dim_value: i64 = -1;
            while (!dim_reader.eof()) {
                const dim_field = try dim_reader.key();
                if (dim_field.field == 1) {
                    dim_value = @bitCast(try dim_reader.varint());
                } else try dim_reader.skip(dim_field.wire);
            }
            try dims.append(dim_value);
        } else try reader.skip(field.wire);
    }
    info.dims = try dims.toOwnedSlice();
}

fn findProducer(graph: *const Graph, input: []const u8) ?usize {
    for (graph.nodes.items, 0..) |node, index| {
        for (node.outputs.items) |output| if (std.mem.eql(u8, output, input)) return index;
    }
    return null;
}

test "graph parser orders dependent nodes" {
    const node_a = [_]u8{ 0x22, 0x03, 'A', 'd', 'd', 0x1a, 0x01, 'a', 0x12, 0x01, 'x' };
    const node_b = [_]u8{ 0x22, 0x03, 'M', 'u', 'l', 0x0a, 0x01, 'x', 0x12, 0x01, 'y' };
    const graph = [_]u8{ 0x0a, node_a.len, node_a[0], node_a[1], node_a[2], node_a[3], node_a[4], node_a[5], node_a[6], node_a[7], node_a[8], node_a[9], node_a[10], 0x0a, node_b.len, node_b[0], node_b[1], node_b[2], node_b[3], node_b[4], node_b[5], node_b[6], node_b[7], node_b[8], node_b[9], node_b[10] };
    const model = [_]u8{ 0x3a, graph.len, graph[0], graph[1], graph[2], graph[3], graph[4], graph[5], graph[6], graph[7], graph[8], graph[9], graph[10], graph[11], graph[12], graph[13], graph[14], graph[15], graph[16], graph[17], graph[18], graph[19], graph[20], graph[21], graph[22], graph[23], graph[24], graph[25] };
    var parsed = try parse(std.testing.allocator, &model);
    defer parsed.deinit();
    const order = try parsed.topologicalOrder(std.testing.allocator);
    defer std.testing.allocator.free(order);
    try std.testing.expectEqual(@as(usize, 2), order.len);
    try std.testing.expectEqual(@as(usize, 0), order[0]);
    try std.testing.expectEqual(@as(usize, 1), order[1]);
}
