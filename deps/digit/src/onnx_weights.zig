const std = @import("std");
const builtin = @import("builtin");

pub const MAX_TENSORS: usize = 1 << 16;
pub const MAX_DIMS: usize = 8;
pub const MAX_DIM_EXTENT: i64 = 1 << 24;
pub const MAX_NAME_LEN: usize = 1024;
pub const MAX_LOCATION_LEN: usize = 4096;
pub const MAX_EXTERNAL_KEY_LEN: usize = 256;
pub const MAX_EXTERNAL_DATA_FIELDS: usize = 64;
pub const MAX_RAW_DATA_BYTES: u64 = 1 << 31;

pub const TensorRef = struct {
    name: []const u8,
    location: []const u8,
    offset: u64,
    length: u64,
    data_type: u64,
    raw_data: []const u8,
    dims: std.ArrayList(i64),
};

pub const WeightIndex = struct {
    allocator: std.mem.Allocator,
    tensors: std.ArrayList(TensorRef),

    pub fn init(allocator: std.mem.Allocator) WeightIndex {
        return .{ .allocator = allocator, .tensors = std.ArrayList(TensorRef).init(allocator) };
    }

    pub fn deinit(self: *WeightIndex) void {
        for (self.tensors.items) |*tensor| {
            self.allocator.free(tensor.name);
            self.allocator.free(tensor.location);
            self.allocator.free(tensor.raw_data);
            tensor.dims.deinit();
        }
        self.tensors.deinit();
    }

    pub fn find(self: *const WeightIndex, name: []const u8) ?*const TensorRef {
        for (self.tensors.items) |*tensor| if (std.mem.eql(u8, tensor.name, name)) return tensor;
        return null;
    }

    pub fn read(self: *const WeightIndex, allocator: std.mem.Allocator, base_dir: []const u8, name: []const u8) ![]u8 {
        const tensor = self.find(name) orelse return error.TensorNotFound;
        return self.readSlice(allocator, base_dir, name, 0, tensor.length);
    }

    pub fn readSlice(self: *const WeightIndex, allocator: std.mem.Allocator, base_dir: []const u8, name: []const u8, relative_offset: u64, length: u64) ![]u8 {
        const tensor = self.find(name) orelse return error.TensorNotFound;
        if (relative_offset > tensor.length or length > tensor.length - relative_offset) return error.ExternalDataOutOfBounds;
        if (tensor.raw_data.len != 0) {
            const start = std.math.cast(usize, relative_offset) orelse return error.ExternalDataOutOfBounds;
            const count = std.math.cast(usize, length) orelse return error.ExternalDataOutOfBounds;
            return try allocator.dupe(u8, tensor.raw_data[start .. start + count]);
        }
        try validateLocation(tensor.location);
        const absolute_offset = std.math.add(u64, tensor.offset, relative_offset) catch return error.ExternalDataOutOfBounds;
        const path = try std.fs.path.join(allocator, &.{ base_dir, tensor.location });
        defer allocator.free(path);
        var file = try std.fs.cwd().openFile(path, .{});
        defer file.close();
        const size = try file.getEndPos();
        return readFileRange(allocator, file, size, absolute_offset, length);
    }

    /// Same bounds/integrity checks as `readSlice`, but external payloads are
    /// served through a `ShardCache` so demand-pull runs skip per-tensor
    /// open/close and directory-lookup cost. Bit-identical bytes.
    pub fn readSliceCached(self: *const WeightIndex, allocator: std.mem.Allocator, cache: *ShardCache, name: []const u8, relative_offset: u64, length: u64) ![]u8 {
        const tensor = self.find(name) orelse return error.TensorNotFound;
        if (relative_offset > tensor.length or length > tensor.length - relative_offset) return error.ExternalDataOutOfBounds;
        if (tensor.raw_data.len != 0) {
            const start = std.math.cast(usize, relative_offset) orelse return error.ExternalDataOutOfBounds;
            const count = std.math.cast(usize, length) orelse return error.ExternalDataOutOfBounds;
            return try allocator.dupe(u8, tensor.raw_data[start .. start + count]);
        }
        const absolute_offset = std.math.add(u64, tensor.offset, relative_offset) catch return error.ExternalDataOutOfBounds;
        return cache.read(allocator, tensor.location, absolute_offset, length);
    }
};

/// Bounded open-shard cache for demand-pull weight reads. Keeps up to
/// `max_open` shard handles resident so repeated `readSlice` calls skip
/// open()+close()+path resolution; POSIX targets use `pread` (no shared seek
/// cursor), other targets serialize seek+read under the same mutex that guards
/// the map. Reads beyond the open cap fall back to a transient handle, so the
/// cache is safe for any shard count. Bytes served are identical to the
/// uncached path — this changes I/O cost, not content.
pub const ShardCache = struct {
    pub const max_open: usize = 16;

    allocator: std.mem.Allocator,
    base_dir: []u8,
    files: std.StringHashMap(Entry),
    mutex: std.Thread.Mutex = .{},

    const Entry = struct {
        file: std.fs.File,
        size: u64,
    };

    pub fn init(allocator: std.mem.Allocator, base_dir: []const u8) !ShardCache {
        return .{
            .allocator = allocator,
            .base_dir = try allocator.dupe(u8, base_dir),
            .files = std.StringHashMap(Entry).init(allocator),
        };
    }

    pub fn deinit(self: *ShardCache) void {
        var iterator = self.files.iterator();
        while (iterator.next()) |entry| {
            entry.value_ptr.file.close();
            self.allocator.free(entry.key_ptr.*);
        }
        self.files.deinit();
        self.allocator.free(self.base_dir);
    }

    /// Read `length` bytes at `absolute_offset` inside `location`, returning an
    /// allocator-owned copy.
    pub fn read(self: *ShardCache, allocator: std.mem.Allocator, location: []const u8, absolute_offset: u64, length: u64) ![]u8 {
        try validateLocation(location);
        self.mutex.lock();
        defer self.mutex.unlock();
        if (self.files.get(location)) |entry| {
            return readFileRange(allocator, entry.file, entry.size, absolute_offset, length);
        }
        const path = try std.fs.path.join(self.allocator, &.{ self.base_dir, location });
        defer self.allocator.free(path);
        if (self.files.count() >= max_open) {
            // Over the cap: serve this shard through a transient handle.
            var file = try std.fs.cwd().openFile(path, .{});
            defer file.close();
            const size = try file.getEndPos();
            return readFileRange(allocator, file, size, absolute_offset, length);
        }
        var file = try std.fs.cwd().openFile(path, .{});
        errdefer file.close();
        const size = try file.getEndPos();
        const data = try readFileRange(allocator, file, size, absolute_offset, length);
        errdefer allocator.free(data);
        const key = try self.allocator.dupe(u8, location);
        self.files.put(key, .{ .file = file, .size = size }) catch |err| {
            self.allocator.free(key);
            return err;
        };
        return data;
    }

    const can_pread = switch (builtin.os.tag) {
        .windows, .wasi, .freestanding, .emscripten => false,
        else => true,
    };

    fn readAt(file: std.fs.File, offset: u64, buffer: []u8) !void {
        if (comptime can_pread) {
            var filled: usize = 0;
            while (filled < buffer.len) {
                const position = std.math.add(u64, offset, @intCast(filled)) catch return error.ExternalDataOutOfBounds;
                const count = try std.posix.pread(file.handle, buffer[filled..], position);
                if (count == 0) return error.EndOfStream;
                filled += count;
            }
            return;
        }
        try file.seekTo(offset);
        try file.reader().readNoEof(buffer);
    }
};

fn readFileRange(allocator: std.mem.Allocator, file: std.fs.File, size: u64, offset: u64, length: u64) ![]u8 {
    if (offset > size or length > size - offset) return error.ExternalDataOutOfBounds;
    const count = std.math.cast(usize, length) orelse return error.ExternalDataOutOfBounds;
    const data = try allocator.alloc(u8, count);
    errdefer allocator.free(data);
    try ShardCache.readAt(file, offset, data);
    return data;
}

const ParseContext = struct {
    index: *WeightIndex,
    names: *std.StringHashMap(void),
    records: usize = 0,
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
        for (0..10) |index| {
            if (self.pos >= self.bytes.len) return error.InvalidVarint;
            const byte = self.bytes[self.pos];
            self.pos += 1;
            if (index == 9 and byte > 1) return error.InvalidVarint;
            result |= @as(u64, byte & 0x7f) << shift;
            if (byte & 0x80 == 0) return result;
            shift += 7;
        }
        return error.InvalidVarint;
    }
    fn key(self: *Reader) !struct { field: u32, wire: u3 } {
        const value = try self.varint();
        const field = value >> 3;
        if (field == 0 or field > std.math.maxInt(u32)) return error.InvalidField;
        return .{ .field = @intCast(field), .wire = @intCast(value & 7) };
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
            1 => try self.skipBytes(8),
            2 => _ = try self.bytesField(),
            5 => try self.skipBytes(4),
            else => return error.UnsupportedWireType,
        }
    }
    fn skipBytes(self: *Reader, length: usize) !void {
        if (length > self.bytes.len - self.pos) return error.TruncatedMessage;
        self.pos += length;
    }
};

pub fn indexModel(allocator: std.mem.Allocator, bytes: []const u8) !WeightIndex {
    var index = WeightIndex.init(allocator);
    errdefer index.deinit();
    var names = std.StringHashMap(void).init(allocator);
    defer names.deinit();
    var context = ParseContext{ .index = &index, .names = &names };
    var reader = Reader{ .bytes = bytes };
    var saw_graph = false;
    while (!reader.eof()) {
        const field = try reader.key();
        if (field.field == 7) {
            if (field.wire != 2) return error.InvalidWireType;
            if (saw_graph) return error.DuplicateGraph;
            saw_graph = true;
            try parseGraph(&context, try reader.bytesField());
        } else try reader.skip(field.wire);
    }
    return index;
}

fn parseGraph(context: *ParseContext, bytes: []const u8) !void {
    var reader = Reader{ .bytes = bytes };
    while (!reader.eof()) {
        const field = try reader.key();
        if (field.field == 5) {
            if (field.wire != 2) return error.InvalidWireType;
            if (context.records >= MAX_TENSORS) return error.TooManyTensors;
            context.records += 1;
            try parseTensor(context, try reader.bytesField());
        } else try reader.skip(field.wire);
    }
}

fn appendDim(dims: *std.ArrayList(i64), reader: *Reader) !void {
    if (dims.items.len >= MAX_DIMS) return error.TooManyDims;
    const dim: i64 = @bitCast(try reader.varint());
    if (dim < 0 or dim > MAX_DIM_EXTENT) return error.UnsupportedShape;
    try dims.append(dim);
}

fn parseTensor(context: *ParseContext, bytes: []const u8) !void {
    var reader = Reader{ .bytes = bytes };
    var name: []const u8 = "";
    var location: []const u8 = "";
    var offset: u64 = 0;
    var length: u64 = 0;
    var data_type: u64 = 0;
    var raw_data: []const u8 = &.{};
    var external = false;
    var external_metadata = false;
    var external_entries: usize = 0;
    var saw_length = false;
    var dims = std.ArrayList(i64).init(context.index.allocator);
    errdefer dims.deinit();
    while (!reader.eof()) {
        const field = try reader.key();
        switch (field.field) {
            1 => switch (field.wire) {
                0 => try appendDim(&dims, &reader),
                2 => {
                    var packed_reader = Reader{ .bytes = try reader.bytesField() };
                    while (!packed_reader.eof()) try appendDim(&dims, &packed_reader);
                },
                else => return error.InvalidWireType,
            },
            2 => {
                if (field.wire != 0) return error.InvalidWireType;
                data_type = try reader.varint();
            },
            8 => {
                if (field.wire != 2) return error.InvalidWireType;
                name = try reader.bytesField();
                if (name.len > MAX_NAME_LEN) return error.NameTooLong;
            },
            9 => {
                if (field.wire != 2) return error.InvalidWireType;
                raw_data = try reader.bytesField();
                if (raw_data.len > MAX_RAW_DATA_BYTES) return error.TensorTooLarge;
            },
            14 => {
                if (field.wire != 0) return error.InvalidWireType;
                const data_location = try reader.varint();
                if (data_location > 1) return error.InvalidExternalTensor;
                external = data_location == 1;
            },
            13 => {
                if (field.wire != 2) return error.InvalidWireType;
                if (external_entries >= MAX_EXTERNAL_DATA_FIELDS) return error.TooManyExternalFields;
                external_entries += 1;
                external_metadata = true;
                var entry = Reader{ .bytes = try reader.bytesField() };
                var entry_fields: usize = 0;
                var key: []const u8 = "";
                var value: []const u8 = "";
                while (!entry.eof()) {
                    if (entry_fields >= MAX_EXTERNAL_DATA_FIELDS) return error.TooManyExternalFields;
                    entry_fields += 1;
                    const entry_field = try entry.key();
                    if (entry_field.field == 1) {
                        if (entry_field.wire != 2) return error.InvalidWireType;
                        key = try entry.bytesField();
                    } else if (entry_field.field == 2) {
                        if (entry_field.wire != 2) return error.InvalidWireType;
                        value = try entry.bytesField();
                    } else try entry.skip(entry_field.wire);
                }
                if (key.len > MAX_EXTERNAL_KEY_LEN or value.len > MAX_LOCATION_LEN) return error.ExternalFieldTooLarge;
                if (std.mem.eql(u8, key, "location")) {
                    if (value.len > MAX_LOCATION_LEN) return error.LocationTooLong;
                    location = value;
                } else if (std.mem.eql(u8, key, "offset")) {
                    offset = std.fmt.parseInt(u64, value, 10) catch return error.InvalidExternalTensor;
                } else if (std.mem.eql(u8, key, "length")) {
                    length = std.fmt.parseInt(u64, value, 10) catch return error.InvalidExternalTensor;
                    saw_length = true;
                }
            },
            else => try reader.skip(field.wire),
        }
    }
    if (name.len == 0) {
        dims.deinit();
        return;
    }
    if (data_type == 0 or data_type > std.math.maxInt(i32)) return error.InvalidTensorDataType;
    if (context.index.tensors.items.len >= MAX_TENSORS) return error.TooManyTensors;
    if (external) {
        if (location.len == 0 or raw_data.len != 0 or !saw_length) return error.InvalidExternalTensor;
        try validateLocation(location);
        _ = std.math.add(u64, offset, length) catch return error.ExternalDataOutOfBounds;
    } else {
        if (external_metadata) return error.InvalidExternalTensor;
        if (raw_data.len == 0) {
            dims.deinit();
            return;
        }
        length = raw_data.len;
    }
    if (context.names.contains(name)) return error.DuplicateTensorName;
    try context.names.put(name, {});

    const owned_name = try context.index.allocator.dupe(u8, name);
    errdefer context.index.allocator.free(owned_name);
    const owned_location = try context.index.allocator.dupe(u8, location);
    errdefer context.index.allocator.free(owned_location);
    const owned_raw = try context.index.allocator.dupe(u8, raw_data);
    errdefer context.index.allocator.free(owned_raw);
    try context.index.tensors.append(.{
        .name = owned_name,
        .location = owned_location,
        .offset = offset,
        .length = length,
        .data_type = data_type,
        .raw_data = owned_raw,
        .dims = dims,
    });
}

fn validateLocation(location: []const u8) !void {
    if (location.len == 0 or location.len > MAX_LOCATION_LEN or std.fs.path.isAbsolute(location)) return error.InvalidExternalLocation;
    if (std.mem.indexOfScalar(u8, location, 0) != null or std.mem.indexOfScalar(u8, location, '\\') != null or std.mem.indexOfScalar(u8, location, ':') != null) return error.InvalidExternalLocation;
    var components = std.mem.splitScalar(u8, location, '/');
    while (components.next()) |component| {
        if (component.len == 0 or std.mem.eql(u8, component, ".") or std.mem.eql(u8, component, "..")) return error.InvalidExternalLocation;
    }
}

fn appendVarint(out: *std.ArrayList(u8), value: u64) !void {
    var remaining = value;
    while (true) {
        const byte: u8 = @intCast(remaining & 0x7f);
        remaining >>= 7;
        if (remaining == 0) {
            try out.append(byte);
            return;
        }
        try out.append(byte | 0x80);
    }
}

fn appendKey(out: *std.ArrayList(u8), field: u32, wire: u3) !void {
    try appendVarint(out, (@as(u64, field) << 3) | wire);
}

fn appendVarintField(out: *std.ArrayList(u8), field: u32, value: u64) !void {
    try appendKey(out, field, 0);
    try appendVarint(out, value);
}

fn appendBytesField(out: *std.ArrayList(u8), field: u32, bytes: []const u8) !void {
    try appendKey(out, field, 2);
    try appendVarint(out, bytes.len);
    try out.appendSlice(bytes);
}

fn externalEntry(allocator: std.mem.Allocator, key: []const u8, value: []const u8) ![]u8 {
    var entry = std.ArrayList(u8).init(allocator);
    errdefer entry.deinit();
    try appendBytesField(&entry, 1, key);
    try appendBytesField(&entry, 2, value);
    return entry.toOwnedSlice();
}

fn modelWithTensors(allocator: std.mem.Allocator, tensors: []const []const u8) ![]u8 {
    var graph = std.ArrayList(u8).init(allocator);
    defer graph.deinit();
    for (tensors) |tensor| try appendBytesField(&graph, 5, tensor);
    var model = std.ArrayList(u8).init(allocator);
    errdefer model.deinit();
    try appendBytesField(&model, 7, graph.items);
    return model.toOwnedSlice();
}

fn inlineTensor(allocator: std.mem.Allocator, name: []const u8, dims: []const u64, raw_data: []const u8) ![]u8 {
    var tensor = std.ArrayList(u8).init(allocator);
    errdefer tensor.deinit();
    for (dims) |dim| try appendVarintField(&tensor, 1, dim);
    try appendVarintField(&tensor, 2, 7);
    try appendBytesField(&tensor, 8, name);
    try appendBytesField(&tensor, 9, raw_data);
    return tensor.toOwnedSlice();
}

fn externalTensor(
    allocator: std.mem.Allocator,
    name: []const u8,
    location: []const u8,
    offset_text: []const u8,
    length_text: ?[]const u8,
) ![]u8 {
    var tensor = std.ArrayList(u8).init(allocator);
    errdefer tensor.deinit();
    try appendVarintField(&tensor, 1, 4);
    try appendVarintField(&tensor, 2, 7);
    try appendBytesField(&tensor, 8, name);
    const location_entry = try externalEntry(allocator, "location", location);
    defer allocator.free(location_entry);
    try appendBytesField(&tensor, 13, location_entry);
    const offset_entry = try externalEntry(allocator, "offset", offset_text);
    defer allocator.free(offset_entry);
    try appendBytesField(&tensor, 13, offset_entry);
    if (length_text) |text| {
        const length_entry = try externalEntry(allocator, "length", text);
        defer allocator.free(length_entry);
        try appendBytesField(&tensor, 13, length_entry);
    }
    try appendVarintField(&tensor, 14, 1);
    return tensor.toOwnedSlice();
}

test "external location validation" {
    try validateLocation("weights/data.bin");
    try std.testing.expectError(error.InvalidExternalLocation, validateLocation("../outside.bin"));
    try std.testing.expectError(error.InvalidExternalLocation, validateLocation("/absolute.bin"));
    try std.testing.expectError(error.InvalidExternalLocation, validateLocation("weights//data.bin"));
    try std.testing.expectError(error.InvalidExternalLocation, validateLocation("weights/./data.bin"));
    try std.testing.expectError(error.InvalidExternalLocation, validateLocation("weights\\..\\data.bin"));
    try std.testing.expectError(error.InvalidExternalLocation, validateLocation("C:\\weights.bin"));
    try std.testing.expectError(error.InvalidExternalLocation, validateLocation("weights\x00data.bin"));
}

test "index parses inline and external tensors with canonical bounds" {
    const allocator = std.testing.allocator;
    const inline_record = try inlineTensor(allocator, "inline", &.{ 2, 2 }, &.{ 1, 2, 3, 4 });
    defer allocator.free(inline_record);
    const external_record = try externalTensor(allocator, "external", "shards/a.bin", "3", "5");
    defer allocator.free(external_record);
    const model = try modelWithTensors(allocator, &.{ inline_record, external_record });
    defer allocator.free(model);

    var index = try indexModel(allocator, model);
    defer index.deinit();
    const inline_tensor = index.find("inline").?;
    try std.testing.expectEqual(@as(u64, 4), inline_tensor.length);
    try std.testing.expectEqualSlices(i64, &.{ 2, 2 }, inline_tensor.dims.items);
    const external_tensor = index.find("external").?;
    try std.testing.expectEqual(@as(u64, 3), external_tensor.offset);
    try std.testing.expectEqual(@as(u64, 5), external_tensor.length);
    try std.testing.expectEqualStrings("shards/a.bin", external_tensor.location);
}

test "index rejects duplicate names and malformed wire domains" {
    const allocator = std.testing.allocator;
    const first = try inlineTensor(allocator, "weight", &.{1}, &.{1});
    defer allocator.free(first);
    const second = try inlineTensor(allocator, "weight", &.{1}, &.{2});
    defer allocator.free(second);
    const duplicate_model = try modelWithTensors(allocator, &.{ first, second });
    defer allocator.free(duplicate_model);
    try std.testing.expectError(error.DuplicateTensorName, indexModel(allocator, duplicate_model));

    var malformed = std.ArrayList(u8).init(allocator);
    defer malformed.deinit();
    try appendVarintField(&malformed, 8, 1);
    const malformed_model = try modelWithTensors(allocator, &.{malformed.items});
    defer allocator.free(malformed_model);
    try std.testing.expectError(error.InvalidWireType, indexModel(allocator, malformed_model));

    var bad_varint = std.ArrayList(u8).init(allocator);
    defer bad_varint.deinit();
    try bad_varint.appendSlice(&.{ 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x02 });
    try std.testing.expectError(error.InvalidVarint, indexModel(allocator, bad_varint.items));

    var graph = std.ArrayList(u8).init(allocator);
    defer graph.deinit();
    try appendBytesField(&graph, 5, first);
    var repeated_graph = std.ArrayList(u8).init(allocator);
    defer repeated_graph.deinit();
    try appendBytesField(&repeated_graph, 7, graph.items);
    try appendBytesField(&repeated_graph, 7, graph.items);
    try std.testing.expectError(error.DuplicateGraph, indexModel(allocator, repeated_graph.items));

    var missing_type = std.ArrayList(u8).init(allocator);
    defer missing_type.deinit();
    try appendVarintField(&missing_type, 1, 1);
    try appendBytesField(&missing_type, 8, "missing-type");
    try appendBytesField(&missing_type, 9, &.{1});
    const missing_type_model = try modelWithTensors(allocator, &.{missing_type.items});
    defer allocator.free(missing_type_model);
    try std.testing.expectError(error.InvalidTensorDataType, indexModel(allocator, missing_type_model));
}

test "index rejects ambiguous external tensors and overflowing shape metadata" {
    const allocator = std.testing.allocator;
    const missing_length = try externalTensor(allocator, "external", "shard.bin", "0", null);
    defer allocator.free(missing_length);
    const missing_model = try modelWithTensors(allocator, &.{missing_length});
    defer allocator.free(missing_model);
    try std.testing.expectError(error.InvalidExternalTensor, indexModel(allocator, missing_model));

    const overflow_range = try externalTensor(allocator, "external", "shard.bin", "18446744073709551615", "1");
    defer allocator.free(overflow_range);
    const overflow_model = try modelWithTensors(allocator, &.{overflow_range});
    defer allocator.free(overflow_model);
    try std.testing.expectError(error.ExternalDataOutOfBounds, indexModel(allocator, overflow_model));

    var negative = std.ArrayList(u8).init(allocator);
    defer negative.deinit();
    try appendVarintField(&negative, 1, std.math.maxInt(u64));
    try appendVarintField(&negative, 2, 7);
    try appendBytesField(&negative, 8, "negative");
    try appendBytesField(&negative, 9, &.{1});
    const negative_model = try modelWithTensors(allocator, &.{negative.items});
    defer allocator.free(negative_model);
    try std.testing.expectError(error.UnsupportedShape, indexModel(allocator, negative_model));

    var too_many = std.ArrayList(u8).init(allocator);
    defer too_many.deinit();
    for (0..MAX_DIMS + 1) |_| try appendVarintField(&too_many, 1, 1);
    try appendVarintField(&too_many, 2, 7);
    try appendBytesField(&too_many, 8, "too-many-dims");
    try appendBytesField(&too_many, 9, &.{1});
    const too_many_model = try modelWithTensors(allocator, &.{too_many.items});
    defer allocator.free(too_many_model);
    try std.testing.expectError(error.TooManyDims, indexModel(allocator, too_many_model));

    var conflict = std.ArrayList(u8).init(allocator);
    defer conflict.deinit();
    try appendVarintField(&conflict, 1, 1);
    try appendVarintField(&conflict, 2, 7);
    try appendBytesField(&conflict, 8, "conflict");
    try appendBytesField(&conflict, 9, &.{1});
    const location = try externalEntry(allocator, "location", "shard.bin");
    defer allocator.free(location);
    const length = try externalEntry(allocator, "length", "1");
    defer allocator.free(length);
    try appendBytesField(&conflict, 13, location);
    try appendBytesField(&conflict, 13, length);
    try appendVarintField(&conflict, 14, 1);
    const conflict_model = try modelWithTensors(allocator, &.{conflict.items});
    defer allocator.free(conflict_model);
    try std.testing.expectError(error.InvalidExternalTensor, indexModel(allocator, conflict_model));
}

test "tensor reads are bounds checked before allocation or offset arithmetic" {
    const allocator = std.testing.allocator;
    var index = WeightIndex.init(allocator);
    defer index.deinit();
    var dims = std.ArrayList(i64).init(allocator);
    try dims.append(4);
    const name = try allocator.dupe(u8, "external");
    const location = try allocator.dupe(u8, "shard.bin");
    try index.tensors.append(.{
        .name = name,
        .location = location,
        .offset = std.math.maxInt(u64) - 4,
        .length = 10,
        .data_type = 7,
        .raw_data = &.{},
        .dims = dims,
    });
    try std.testing.expectError(
        error.ExternalDataOutOfBounds,
        index.readSlice(allocator, ".", "external", 5, 1),
    );
}

test "external reads and cached reads return identical bounded bytes" {
    const allocator = std.testing.allocator;
    var tmp = std.testing.tmpDir(.{});
    defer tmp.cleanup();
    try tmp.dir.writeFile(.{ .sub_path = "shard.bin", .data = "abcdef" });
    const base = try tmp.dir.realpathAlloc(allocator, ".");
    defer allocator.free(base);

    var index = WeightIndex.init(allocator);
    defer index.deinit();
    var dims = std.ArrayList(i64).init(allocator);
    try dims.append(3);
    try index.tensors.append(.{
        .name = try allocator.dupe(u8, "external"),
        .location = try allocator.dupe(u8, "shard.bin"),
        .offset = 1,
        .length = 4,
        .data_type = 7,
        .raw_data = try allocator.dupe(u8, &.{}),
        .dims = dims,
    });

    const direct = try index.readSlice(allocator, base, "external", 1, 2);
    defer allocator.free(direct);
    try std.testing.expectEqualStrings("cd", direct);
    var cache = try ShardCache.init(allocator, base);
    defer cache.deinit();
    const cached = try index.readSliceCached(allocator, &cache, "external", 1, 2);
    defer allocator.free(cached);
    try std.testing.expectEqualStrings("cd", cached);
    try std.testing.expectError(
        error.ExternalDataOutOfBounds,
        index.readSliceCached(allocator, &cache, "external", 3, 2),
    );
}

test "shard cache validates locations and bounded ranges" {
    const allocator = std.testing.allocator;
    var tmp = std.testing.tmpDir(.{});
    defer tmp.cleanup();
    try tmp.dir.writeFile(.{ .sub_path = "shard.bin", .data = "abcdef" });
    const base = try tmp.dir.realpathAlloc(allocator, ".");
    defer allocator.free(base);
    var cache = try ShardCache.init(allocator, base);
    defer cache.deinit();

    const slice = try cache.read(allocator, "shard.bin", 2, 3);
    defer allocator.free(slice);
    try std.testing.expectEqualStrings("cde", slice);
    try std.testing.expectError(error.InvalidExternalLocation, cache.read(allocator, "../outside", 0, 1));
    try std.testing.expectError(error.ExternalDataOutOfBounds, cache.read(allocator, "shard.bin", 4, 3));
    try std.testing.expectError(error.ExternalDataOutOfBounds, cache.read(allocator, "shard.bin", std.math.maxInt(u64), 1));
}
