const std = @import("std");
const builtin = @import("builtin");

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
            const start: usize = @intCast(relative_offset);
            const count: usize = @intCast(length);
            return try allocator.dupe(u8, tensor.raw_data[start .. start + count]);
        }
        try validateLocation(tensor.location);
        const path = try std.fs.path.join(allocator, &.{ base_dir, tensor.location });
        defer allocator.free(path);
        var file = try std.fs.cwd().openFile(path, .{});
        defer file.close();
        const size = try file.getEndPos();
        const absolute_offset = tensor.offset + relative_offset;
        if (absolute_offset > size or length > size - absolute_offset) return error.ExternalDataOutOfBounds;
        try file.seekTo(absolute_offset);
        const data = try allocator.alloc(u8, @intCast(length));
        errdefer allocator.free(data);
        try file.reader().readNoEof(data);
        return data;
    }

    /// Same bounds/integrity checks as `readSlice`, but external payloads are
    /// served through a `ShardCache` so demand-pull runs skip per-tensor
    /// open/close and directory-lookup cost. Bit-identical bytes.
    pub fn readSliceCached(self: *const WeightIndex, allocator: std.mem.Allocator, cache: *ShardCache, name: []const u8, relative_offset: u64, length: u64) ![]u8 {
        const tensor = self.find(name) orelse return error.TensorNotFound;
        if (relative_offset > tensor.length or length > tensor.length - relative_offset) return error.ExternalDataOutOfBounds;
        if (tensor.raw_data.len != 0) {
            const start: usize = @intCast(relative_offset);
            const count: usize = @intCast(length);
            return try allocator.dupe(u8, tensor.raw_data[start .. start + count]);
        }
        try validateLocation(tensor.location);
        return cache.read(allocator, tensor.location, tensor.offset + relative_offset, length);
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
        const data = try allocator.alloc(u8, @intCast(length));
        errdefer allocator.free(data);
        self.mutex.lock();
        defer self.mutex.unlock();
        if (self.files.get(location)) |entry| {
            if (absolute_offset > entry.size or length > entry.size - absolute_offset) return error.ExternalDataOutOfBounds;
            try readAt(entry.file, absolute_offset, data);
            return data;
        }
        const path = try std.fs.path.join(self.allocator, &.{ self.base_dir, location });
        defer self.allocator.free(path);
        if (self.files.count() >= max_open) {
            // Over the cap: serve this shard through a transient handle.
            const file = try std.fs.cwd().openFile(path, .{});
            defer file.close();
            const size = try file.getEndPos();
            if (absolute_offset > size or length > size - absolute_offset) return error.ExternalDataOutOfBounds;
            try readAt(file, absolute_offset, data);
            return data;
        }
        const file = try std.fs.cwd().openFile(path, .{});
        errdefer file.close();
        const size = try file.getEndPos();
        if (absolute_offset > size or length > size - absolute_offset) return error.ExternalDataOutOfBounds;
        try readAt(file, absolute_offset, data);
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
                const count = try std.posix.pread(file.handle, buffer[filled..], offset + filled);
                if (count == 0) return error.EndOfStream;
                filled += count;
            }
            return;
        }
        try file.seekTo(offset);
        try file.reader().readNoEof(buffer);
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
    var reader = Reader{ .bytes = bytes };
    while (!reader.eof()) {
        const field = try reader.key();
        if (field.field == 7) {
            if (field.wire != 2) return error.InvalidWireType;
            try parseGraph(&index, try reader.bytesField());
        } else try reader.skip(field.wire);
    }
    return index;
}

fn parseGraph(index: *WeightIndex, bytes: []const u8) !void {
    var reader = Reader{ .bytes = bytes };
    while (!reader.eof()) {
        const field = try reader.key();
        if (field.field == 5) {
            if (field.wire != 2) return error.InvalidWireType;
            try parseTensor(index, try reader.bytesField());
        } else try reader.skip(field.wire);
    }
}

fn parseTensor(index: *WeightIndex, bytes: []const u8) !void {
    var reader = Reader{ .bytes = bytes };
    var name: []const u8 = "";
    var location: []const u8 = "";
    var offset: u64 = 0;
    var length: u64 = 0;
    var data_type: u64 = 0;
    var raw_data: []const u8 = &.{};
    var external = false;
    var dims = std.ArrayList(i64).init(index.allocator);
    errdefer dims.deinit();
    while (!reader.eof()) {
        const field = try reader.key();
        switch (field.field) {
            1 => try dims.append(@bitCast(try reader.varint())),
            2 => data_type = try reader.varint(),
            8 => name = try reader.bytesField(),
            9 => raw_data = try reader.bytesField(),
            14 => external = (try reader.varint()) == 1,
            13 => {
                var entry = Reader{ .bytes = try reader.bytesField() };
                var key: []const u8 = "";
                var value: []const u8 = "";
                while (!entry.eof()) {
                    const entry_field = try entry.key();
                    if (entry_field.field == 1) key = try entry.bytesField() else if (entry_field.field == 2) value = try entry.bytesField() else try entry.skip(entry_field.wire);
                }
                if (std.mem.eql(u8, key, "location")) location = value else if (std.mem.eql(u8, key, "offset")) offset = try std.fmt.parseInt(u64, value, 10) else if (std.mem.eql(u8, key, "length")) length = try std.fmt.parseInt(u64, value, 10);
            },
            else => try reader.skip(field.wire),
        }
    }
    if (name.len == 0) {
        dims.deinit();
        return;
    }
    if (external) {
        if (location.len == 0) return error.InvalidExternalTensor;
        try validateLocation(location);
    } else {
        if (raw_data.len == 0) {
            dims.deinit();
            return;
        }
        length = raw_data.len;
    }
    try index.tensors.append(.{
        .name = try index.allocator.dupe(u8, name),
        .location = try index.allocator.dupe(u8, location),
        .offset = offset,
        .length = length,
        .data_type = data_type,
        .raw_data = try index.allocator.dupe(u8, raw_data),
        .dims = dims,
    });
}

fn validateLocation(location: []const u8) !void {
    if (location.len == 0 or std.fs.path.isAbsolute(location) or std.mem.indexOf(u8, location, "..") != null) return error.InvalidExternalLocation;
}

test "external location validation" {
    try validateLocation("weights/data.bin");
    try std.testing.expectError(error.InvalidExternalLocation, validateLocation("../outside.bin"));
    try std.testing.expectError(error.InvalidExternalLocation, validateLocation("/absolute.bin"));
}
