//! transport_polyglot.zig — Multi-format polyglot file transport.
//!
//! Extracted from beheader (#06).
//! Injects headers for PNG/MP4/HTML/PDF/ZIP so a single file is valid in multiple formats.

const std = @import("std");

pub const Format = enum {
    png,
    mp4,
    html,
    pdf,
    zip,
    jar,
    pyz,
};

pub const FormatMagic = struct {
    format: Format,
    magic: []const u8,
    trailer: []const u8,
};

pub const FORMAT_TABLE = [_]FormatMagic{
    .{ .format = .png, .magic = "\x89PNG\r\n\x1a\n", .trailer = "" },
    .{ .format = .mp4, .magic = "\x00\x00\x00\x18ftypmp42", .trailer = "" },
    .{ .format = .html, .magic = "<!DOCTYPE html>\n<html><!--", .trailer = " --></html>" },
    .{ .format = .pdf, .magic = "%PDF-1.4\n", .trailer = "\n%%EOF" },
    .{ .format = .zip, .magic = "PK\x03\x04", .trailer = "PK\x05\x06\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00" },
    .{ .format = .jar, .magic = "PK\x03\x04", .trailer = "" },
    .{ .format = .pyz, .magic = "PK\x03\x04", .trailer = "" },
};

/// ZIP entry names used by executable containers.
pub const JAR_MANIFEST_NAME = "META-INF/MANIFEST.MF";
pub const PYZ_MAIN_NAME = "__main__.py";
pub const PYZ_DATA_NAME = "data.py";

/// JAR manifest body prefix injected as the first ZIP entry.
pub const JAR_MANIFEST_HEADER = "Manifest-Version: 1.0\nCreated-By: Qstar polyglot transport\nMain-Class: ";

/// PYZ entry point body injected as the first ZIP entry.
pub const PYZ_MAIN_HEADER = "# Qstar polyglot Python executable\nimport sys\n";

fn findFormat(fmt: Format) ?FormatMagic {
    for (FORMAT_TABLE) |entry| {
        if (entry.format == fmt) return entry;
    }
    return null;
}

/// Encodes data as a polyglot file valid in the specified format.
pub fn encode(allocator: std.mem.Allocator, data: []const u8, fmt: Format) ![]u8 {
    switch (fmt) {
        .jar => return encodeJAR(allocator, data, "Main"),
        .pyz => return encodePYZ(allocator, data, PYZ_MAIN_HEADER),
        else => {},
    }

    const entry = findFormat(fmt) orelse return error.UnknownFormat;

    var out = std.ArrayList(u8).init(allocator);
    errdefer out.deinit();

    try out.appendSlice(entry.magic);
    try out.appendSlice(data);
    if (entry.trailer.len > 0) {
        try out.appendSlice(entry.trailer);
    }

    return out.toOwnedSlice();
}

/// Decodes a polyglot file by stripping the format header and trailer.
pub fn decode(allocator: std.mem.Allocator, polyglot: []const u8, fmt: Format) ![]u8 {
    switch (fmt) {
        .jar => return decodeJAR(allocator, polyglot),
        .pyz => return decodePYZ(allocator, polyglot),
        else => {},
    }

    const entry = findFormat(fmt) orelse return error.UnknownFormat;

    if (polyglot.len < entry.magic.len) return error.TooShort;
    if (!std.mem.eql(u8, polyglot[0..entry.magic.len], entry.magic)) return error.WrongFormat;

    const start = entry.magic.len;
    var end = polyglot.len;

    if (entry.trailer.len > 0 and end >= entry.trailer.len) {
        const trailer_start = end - entry.trailer.len;
        if (std.mem.eql(u8, polyglot[trailer_start..end], entry.trailer)) {
            end = trailer_start;
        }
    }

    return try allocator.dupe(u8, polyglot[start..end]);
}

/// Registry slot weight — one medium occupies one transport slot.
/// Not a byte capacity: payload fitness is proven by round-trip,
/// never claimed (see spec008_qstar_carriage.zig).
pub fn capacity() usize {
    return 1;
}

pub fn name() []const u8 {
    return "polyglot";
}

fn appendU16(out: *std.ArrayList(u8), value: u16) !void {
    var bytes: [2]u8 = undefined;
    std.mem.writeInt(u16, &bytes, value, .little);
    try out.appendSlice(&bytes);
}

fn appendU32(out: *std.ArrayList(u8), value: u32) !void {
    var bytes: [4]u8 = undefined;
    std.mem.writeInt(u32, &bytes, value, .little);
    try out.appendSlice(&bytes);
}

fn checkedU16(value: usize) !u16 {
    if (value > std.math.maxInt(u16)) return error.PayloadTooLarge;
    return @intCast(value);
}

fn checkedU32(value: usize) !u32 {
    if (value > std.math.maxInt(u32)) return error.PayloadTooLarge;
    return @intCast(value);
}

fn appendStoredZipEntry(out: *std.ArrayList(u8), entry_name: []const u8, body: []const u8) !u32 {
    const offset = try checkedU32(out.items.len);
    const crc = std.hash.Crc32.hash(body);
    const name_len = try checkedU16(entry_name.len);
    const body_len = try checkedU32(body.len);

    try out.appendSlice("PK\x03\x04");
    try appendU16(out, 20);
    try appendU16(out, 0);
    try appendU16(out, 0);
    try appendU16(out, 0);
    try appendU16(out, 0);
    try appendU32(out, crc);
    try appendU32(out, body_len);
    try appendU32(out, body_len);
    try appendU16(out, name_len);
    try appendU16(out, 0);
    try out.appendSlice(entry_name);
    try out.appendSlice(body);
    return offset;
}

fn appendCentralZipEntry(
    out: *std.ArrayList(u8),
    entry_name: []const u8,
    body: []const u8,
    local_offset: u32,
) !void {
    const crc = std.hash.Crc32.hash(body);
    const name_len = try checkedU16(entry_name.len);
    const body_len = try checkedU32(body.len);

    try out.appendSlice("PK\x01\x02");
    try appendU16(out, 20);
    try appendU16(out, 20);
    try appendU16(out, 0);
    try appendU16(out, 0);
    try appendU16(out, 0);
    try appendU16(out, 0);
    try appendU32(out, crc);
    try appendU32(out, body_len);
    try appendU32(out, body_len);
    try appendU16(out, name_len);
    try appendU16(out, 0);
    try appendU16(out, 0);
    try appendU16(out, 0);
    try appendU16(out, 0);
    try appendU32(out, 0);
    try appendU32(out, local_offset);
    try out.appendSlice(entry_name);
}

fn appendZipEnd(out: *std.ArrayList(u8), entry_count: u16, cd_size: usize, cd_offset: usize) !void {
    try out.appendSlice("PK\x05\x06");
    try appendU16(out, 0);
    try appendU16(out, 0);
    try appendU16(out, entry_count);
    try appendU16(out, entry_count);
    try appendU32(out, try checkedU32(cd_size));
    try appendU32(out, try checkedU32(cd_offset));
    try appendU16(out, 0);
}

const ZipPayload = struct {
    start: usize,
    len: usize,
};

const ZipEnd = struct {
    entry_count: u16,
    directory_start: usize,
    directory_end: usize,
};

const LocalZipEntry = struct {
    offset: u32,
    name: []const u8,
    data_start: usize,
    data_len: usize,
    crc: u32,
    matched: bool = false,
};

fn zipEnd(zip_data: []const u8) !ZipEnd {
    if (zip_data.len < 22) return error.InvalidZip;
    const end_pos = zip_data.len - 22;
    if (std.mem.readInt(u32, zip_data[end_pos..][0..4], .little) != 0x06054B50) return error.InvalidZip;
    if (std.mem.readInt(u16, zip_data[end_pos + 4 ..][0..2], .little) != 0) return error.InvalidZip;
    if (std.mem.readInt(u16, zip_data[end_pos + 6 ..][0..2], .little) != 0) return error.InvalidZip;
    const disk_entries = std.mem.readInt(u16, zip_data[end_pos + 8 ..][0..2], .little);
    const entry_count = std.mem.readInt(u16, zip_data[end_pos + 10 ..][0..2], .little);
    if (disk_entries != entry_count) return error.InvalidZip;
    const directory_size = std.mem.readInt(u32, zip_data[end_pos + 12 ..][0..4], .little);
    const directory_offset = std.mem.readInt(u32, zip_data[end_pos + 16 ..][0..4], .little);
    if (std.mem.readInt(u16, zip_data[end_pos + 20 ..][0..2], .little) != 0) return error.InvalidZip;
    const directory_start: usize = directory_offset;
    const directory_end = std.math.add(usize, directory_start, @as(usize, directory_size)) catch return error.InvalidZip;
    if (directory_end != end_pos) return error.InvalidZip;
    return .{
        .entry_count = entry_count,
        .directory_start = directory_start,
        .directory_end = directory_end,
    };
}

fn findStoredZipPayload(
    allocator: std.mem.Allocator,
    zip_data: []const u8,
    required_entry: []const u8,
    payload_name: []const u8,
) !ZipPayload {
    const end = try zipEnd(zip_data);
    var locals = std.ArrayList(LocalZipEntry).init(allocator);
    defer locals.deinit();
    try locals.ensureTotalCapacity(end.entry_count);

    var saw_required = false;
    var payload: ?ZipPayload = null;
    var pos: usize = 0;
    while (pos < end.directory_start) {
        if (end.directory_start - pos < 30) return error.InvalidZip;
        if (std.mem.readInt(u32, zip_data[pos..][0..4], .little) != 0x04034B50) return error.InvalidZip;
        const flags = std.mem.readInt(u16, zip_data[pos + 6 ..][0..2], .little);
        const method = std.mem.readInt(u16, zip_data[pos + 8 ..][0..2], .little);
        const expected_crc = std.mem.readInt(u32, zip_data[pos + 14 ..][0..4], .little);
        const compressed_len = std.mem.readInt(u32, zip_data[pos + 18 ..][0..4], .little);
        const uncompressed_len = std.mem.readInt(u32, zip_data[pos + 22 ..][0..4], .little);
        const name_len = std.mem.readInt(u16, zip_data[pos + 26 ..][0..2], .little);
        const extra_len = std.mem.readInt(u16, zip_data[pos + 28 ..][0..2], .little);
        if (flags != 0) return error.InvalidZip;
        if (method != 0) return error.UnsupportedCompression;
        if (compressed_len != uncompressed_len) return error.InvalidZip;

        const name_start = pos + 30;
        const name_end = std.math.add(usize, name_start, name_len) catch return error.InvalidZip;
        const data_start = std.math.add(usize, name_end, extra_len) catch return error.InvalidZip;
        const data_len: usize = compressed_len;
        const data_end = std.math.add(usize, data_start, data_len) catch return error.InvalidZip;
        if (data_end > end.directory_start) return error.InvalidZip;
        if (std.hash.Crc32.hash(zip_data[data_start..data_end]) != expected_crc) return error.BadChecksum;

        const entry: LocalZipEntry = .{
            .offset = try checkedU32(pos),
            .name = zip_data[name_start..name_end],
            .data_start = data_start,
            .data_len = data_len,
            .crc = expected_crc,
        };
        try locals.append(entry);
        if (std.mem.eql(u8, entry.name, required_entry)) {
            if (saw_required) return error.InvalidZip;
            saw_required = true;
        }
        if (std.mem.eql(u8, entry.name, payload_name)) {
            if (payload != null) return error.InvalidZip;
            payload = .{ .start = data_start, .len = data_len };
        }
        pos = data_end;
    }
    if (locals.items.len != end.entry_count) return error.InvalidZip;

    pos = end.directory_start;
    for (0..end.entry_count) |_| {
        if (end.directory_end - pos < 46) return error.InvalidZip;
        if (std.mem.readInt(u32, zip_data[pos..][0..4], .little) != 0x02014B50) return error.InvalidZip;
        const flags = std.mem.readInt(u16, zip_data[pos + 8 ..][0..2], .little);
        const method = std.mem.readInt(u16, zip_data[pos + 10 ..][0..2], .little);
        const expected_crc = std.mem.readInt(u32, zip_data[pos + 16 ..][0..4], .little);
        const compressed_len = std.mem.readInt(u32, zip_data[pos + 20 ..][0..4], .little);
        const uncompressed_len = std.mem.readInt(u32, zip_data[pos + 24 ..][0..4], .little);
        const name_len = std.mem.readInt(u16, zip_data[pos + 28 ..][0..2], .little);
        const extra_len = std.mem.readInt(u16, zip_data[pos + 30 ..][0..2], .little);
        const comment_len = std.mem.readInt(u16, zip_data[pos + 32 ..][0..2], .little);
        const disk_start = std.mem.readInt(u16, zip_data[pos + 34 ..][0..2], .little);
        const local_offset = std.mem.readInt(u32, zip_data[pos + 42 ..][0..4], .little);
        if (flags != 0 or disk_start != 0) return error.InvalidZip;
        if (method != 0) return error.UnsupportedCompression;
        if (compressed_len != uncompressed_len) return error.InvalidZip;

        const name_start = pos + 46;
        const name_end = std.math.add(usize, name_start, name_len) catch return error.InvalidZip;
        const next_pos = std.math.add(usize, std.math.add(usize, name_end, extra_len) catch return error.InvalidZip, comment_len) catch return error.InvalidZip;
        if (next_pos > end.directory_end) return error.InvalidZip;

        var matched = false;
        for (locals.items) |*entry| {
            if (entry.offset != local_offset) continue;
            if (entry.matched) return error.InvalidZip;
            if (!std.mem.eql(u8, entry.name, zip_data[name_start..name_end])) return error.InvalidZip;
            if (entry.data_len != compressed_len or entry.crc != expected_crc) return error.InvalidZip;
            entry.matched = true;
            matched = true;
            break;
        }
        if (!matched) return error.InvalidZip;
        pos = next_pos;
    }
    if (pos != end.directory_end) return error.InvalidZip;
    for (locals.items) |entry| {
        if (!entry.matched) return error.InvalidZip;
    }

    if (!saw_required) return error.MissingContainerEntry;
    return payload orelse error.NoPayload;
}

/// Encode data as an executable JAR container.
/// A JAR is a ZIP file with a META-INF/MANIFEST.MF entry.
pub fn encodeJAR(allocator: std.mem.Allocator, data: []const u8, main_class: []const u8) ![]u8 {
    if (main_class.len == 0 or std.mem.indexOfAny(u8, main_class, "\r\n") != null) return error.InvalidMainClass;
    _ = try checkedU32(data.len);

    var out = std.ArrayList(u8).init(allocator);
    errdefer out.deinit();

    const manifest = try std.fmt.allocPrint(allocator, "{s}{s}\n\n", .{ JAR_MANIFEST_HEADER, main_class });
    defer allocator.free(manifest);

    var entries: [2]struct { name: []const u8, body: []const u8, offset: u32 } = undefined;
    entries[0] = .{ .name = JAR_MANIFEST_NAME, .body = manifest, .offset = try appendStoredZipEntry(&out, JAR_MANIFEST_NAME, manifest) };
    entries[1] = .{ .name = "Main.cl", .body = data, .offset = try appendStoredZipEntry(&out, "Main.cl", data) };

    const cd_start = out.items.len;
    for (entries) |entry| try appendCentralZipEntry(&out, entry.name, entry.body, entry.offset);
    try appendZipEnd(&out, @intCast(entries.len), out.items.len - cd_start, cd_start);

    return out.toOwnedSlice();
}

/// Encode data as an executable Python .pyz (zipapp) container.
/// A PYZ is a ZIP file with a __main__.py entry point.
pub fn encodePYZ(allocator: std.mem.Allocator, data: []const u8, python_preamble: []const u8) ![]u8 {
    _ = try checkedU32(data.len);
    _ = try checkedU32(python_preamble.len);

    var out = std.ArrayList(u8).init(allocator);
    errdefer out.deinit();

    var entries: [2]struct { name: []const u8, body: []const u8, offset: u32 } = undefined;
    entries[0] = .{ .name = PYZ_MAIN_NAME, .body = python_preamble, .offset = try appendStoredZipEntry(&out, PYZ_MAIN_NAME, python_preamble) };
    entries[1] = .{ .name = PYZ_DATA_NAME, .body = data, .offset = try appendStoredZipEntry(&out, PYZ_DATA_NAME, data) };

    const cd_start = out.items.len;
    for (entries) |entry| try appendCentralZipEntry(&out, entry.name, entry.body, entry.offset);
    try appendZipEnd(&out, @intCast(entries.len), out.items.len - cd_start, cd_start);

    return out.toOwnedSlice();
}

fn zipContainerMatches(zip_data: []const u8, required_entry: []const u8, payload_name: []const u8) bool {
    _ = findStoredZipPayload(std.heap.page_allocator, zip_data, required_entry, payload_name) catch return false;
    return true;
}

/// Detect the format of a polyglot file by checking magic bytes.
pub fn detectFormat(data: []const u8) ?Format {
    if (data.len < 4) return null;

    if (std.mem.startsWith(u8, data, "PK\x03\x04")) {
        if (zipContainerMatches(data, PYZ_MAIN_NAME, PYZ_DATA_NAME)) return .pyz;
        if (zipContainerMatches(data, JAR_MANIFEST_NAME, "Main.cl")) return .jar;
        return .zip;
    }
    if (std.mem.startsWith(u8, data, "\x89PNG")) return .png;
    if (data.len >= 12 and std.mem.startsWith(u8, data[4..], "ftyp")) return .mp4;
    if (std.mem.startsWith(u8, data, "<!DOCTYPE html>")) return .html;
    if (std.mem.startsWith(u8, data, "%PDF")) return .pdf;

    return null;
}

/// Extract payload data from a JAR container.
pub fn decodeJAR(allocator: std.mem.Allocator, jar_data: []const u8) ![]u8 {
    if (!std.mem.startsWith(u8, jar_data, "PK\x03\x04")) return error.NotJAR;
    const payload = findStoredZipPayload(allocator, jar_data, JAR_MANIFEST_NAME, "Main.cl") catch |err| switch (err) {
        error.InvalidZip, error.UnsupportedCompression, error.MissingContainerEntry, error.NoPayload, error.BadChecksum => return error.InvalidJAR,
        else => return err,
    };
    return try allocator.dupe(u8, jar_data[payload.start .. payload.start + payload.len]);
}

/// Extract payload data from a PYZ container.
pub fn decodePYZ(allocator: std.mem.Allocator, pyz_data: []const u8) ![]u8 {
    if (!std.mem.startsWith(u8, pyz_data, "PK\x03\x04")) return error.NotPYZ;
    const payload = findStoredZipPayload(allocator, pyz_data, PYZ_MAIN_NAME, PYZ_DATA_NAME) catch |err| switch (err) {
        error.InvalidZip, error.UnsupportedCompression, error.MissingContainerEntry, error.NoPayload, error.BadChecksum => return error.InvalidPYZ,
        else => return err,
    };
    return try allocator.dupe(u8, pyz_data[payload.start .. payload.start + payload.len]);
}

// Tests

test "polyglot PNG round trip" {
    const allocator = std.testing.allocator;
    const data = "payload data here";

    const encoded = try encode(allocator, data, .png);
    defer allocator.free(encoded);

    try std.testing.expectEqualSlices(u8, "\x89PNG\r\n\x1a\n", encoded[0..8]);

    const decoded = try decode(allocator, encoded, .png);
    defer allocator.free(decoded);

    try std.testing.expectEqualSlices(u8, data, decoded);
}

test "polyglot HTML round trip" {
    const allocator = std.testing.allocator;
    const data = "console.log('hello');";

    const encoded = try encode(allocator, data, .html);
    defer allocator.free(encoded);

    try std.testing.expect(std.mem.startsWith(u8, encoded, "<!DOCTYPE html>"));

    const decoded = try decode(allocator, encoded, .html);
    defer allocator.free(decoded);

    try std.testing.expectEqualSlices(u8, data, decoded);
}

test "polyglot PDF round trip" {
    const allocator = std.testing.allocator;
    const data = "PDF body content";

    const encoded = try encode(allocator, data, .pdf);
    defer allocator.free(encoded);

    try std.testing.expect(std.mem.startsWith(u8, encoded, "%PDF-1.4"));

    const decoded = try decode(allocator, encoded, .pdf);
    defer allocator.free(decoded);

    try std.testing.expectEqualSlices(u8, data, decoded);
}

test "polyglot wrong format detection" {
    const allocator = std.testing.allocator;
    const data = "test";

    const encoded = try encode(allocator, data, .png);
    defer allocator.free(encoded);

    try std.testing.expectError(error.WrongFormat, decode(allocator, encoded, .pdf));
}

test "polyglot name" {
    try std.testing.expectEqualStrings("polyglot", name());
}

test "polyglot JAR encode produces valid ZIP structure" {
    const allocator = std.testing.allocator;
    const data = "public class Main { public static void main(String[] args) {} }";

    const encoded = try encodeJAR(allocator, data, "Main");
    defer allocator.free(encoded);

    // Should start with ZIP local file header
    try std.testing.expect(std.mem.startsWith(u8, encoded, "PK\x03\x04"));
    // Should contain manifest
    try std.testing.expect(std.mem.indexOf(u8, encoded, "META-INF/MANIFEST.MF") != null);
    try std.testing.expect(std.mem.indexOf(u8, encoded, "Manifest-Version: 1.0") != null);
    // Should contain Main-Class
    try std.testing.expect(std.mem.indexOf(u8, encoded, "Main-Class: Main") != null);
    // Should contain payload
    try std.testing.expect(std.mem.indexOf(u8, encoded, "Main.cl") != null);
    // Should end with end-of-central-directory record
    try std.testing.expect(std.mem.indexOf(u8, encoded, "PK\x05\x06") != null);
}

test "polyglot JAR decode round trip" {
    const allocator = std.testing.allocator;
    const data = "public class Main { public static void main(String[] args) { System.out.println(\"Hello\"); } }";

    const encoded = try encodeJAR(allocator, data, "Main");
    defer allocator.free(encoded);

    const decoded = try decodeJAR(allocator, encoded);
    defer allocator.free(decoded);

    try std.testing.expectEqualSlices(u8, data, decoded);
}

test "polyglot JAR decode rejects non-JAR" {
    const allocator = std.testing.allocator;
    const not_jar = "NOTAZIP";

    try std.testing.expectError(error.NotJAR, decodeJAR(allocator, not_jar));
}

test "polyglot PYZ encode produces valid ZIP structure" {
    const allocator = std.testing.allocator;
    const data = "print('Hello from Python')";

    const preamble = "import sys\nprint('Starting...')\n";
    const encoded = try encodePYZ(allocator, data, preamble);
    defer allocator.free(encoded);

    // Should start with ZIP local file header
    try std.testing.expect(std.mem.startsWith(u8, encoded, "PK\x03\x04"));
    // Should contain __main__.py
    try std.testing.expect(std.mem.indexOf(u8, encoded, "__main__.py") != null);
    // Should contain data.py
    try std.testing.expect(std.mem.indexOf(u8, encoded, "data.py") != null);
    // Should end with end-of-central-directory record
    try std.testing.expect(std.mem.indexOf(u8, encoded, "PK\x05\x06") != null);
}

test "polyglot PYZ decode round trip" {
    const allocator = std.testing.allocator;
    const data = "payload_data = 42";

    const preamble = "import sys\n";
    const encoded = try encodePYZ(allocator, data, preamble);
    defer allocator.free(encoded);

    const decoded = try decodePYZ(allocator, encoded);
    defer allocator.free(decoded);

    try std.testing.expectEqualSlices(u8, data, decoded);
}

test "polyglot PYZ decode rejects non-PYZ" {
    const allocator = std.testing.allocator;
    const not_pyz = "NOTAZIP";

    try std.testing.expectError(error.NotPYZ, decodePYZ(allocator, not_pyz));
}

test "polyglot detectFormat PNG" {
    const allocator = std.testing.allocator;
    const data = "test payload";
    const encoded = try encode(allocator, data, .png);
    defer allocator.free(encoded);
    try std.testing.expectEqual(Format.png, detectFormat(encoded).?);
}

test "polyglot detectFormat HTML" {
    const allocator = std.testing.allocator;
    const data = "test";
    const encoded = try encode(allocator, data, .html);
    defer allocator.free(encoded);
    try std.testing.expectEqual(Format.html, detectFormat(encoded).?);
}

test "polyglot detectFormat PDF" {
    const allocator = std.testing.allocator;
    const data = "test";
    const encoded = try encode(allocator, data, .pdf);
    defer allocator.free(encoded);
    try std.testing.expectEqual(Format.pdf, detectFormat(encoded).?);
}

test "polyglot detectFormat JAR" {
    const allocator = std.testing.allocator;
    const data = "test";
    const encoded = try encodeJAR(allocator, data, "Main");
    defer allocator.free(encoded);
    try std.testing.expectEqual(Format.jar, detectFormat(encoded).?);
}

test "polyglot detectFormat PYZ" {
    const allocator = std.testing.allocator;
    const data = "test";
    const preamble = "import sys\n";
    const encoded = try encodePYZ(allocator, data, preamble);
    defer allocator.free(encoded);
    try std.testing.expectEqual(Format.pyz, detectFormat(encoded).?);
}

test "polyglot detectFormat ZIP (plain, no JAR/PYZ markers)" {
    const allocator = std.testing.allocator;
    const data = "test";
    const encoded = try encode(allocator, data, .zip);
    defer allocator.free(encoded);
    // Plain ZIP should be detected as .zip (no __main__.py or META-INF)
    try std.testing.expectEqual(Format.zip, detectFormat(encoded).?);
}

test "polyglot detectFormat returns null for unknown" {
    try std.testing.expect(detectFormat("UNKNOWN") == null);
    try std.testing.expect(detectFormat("") == null);
}

test "polyglot JAR with empty data" {
    const allocator = std.testing.allocator;
    const data = "";
    const encoded = try encodeJAR(allocator, data, "Main");
    defer allocator.free(encoded);

    const decoded = try decodeJAR(allocator, encoded);
    defer allocator.free(decoded);

    try std.testing.expectEqual(@as(usize, 0), decoded.len);
}

test "polyglot PYZ with empty data" {
    const allocator = std.testing.allocator;
    const data = "";
    const preamble = "import sys\n";
    const encoded = try encodePYZ(allocator, data, preamble);
    defer allocator.free(encoded);

    const decoded = try decodePYZ(allocator, encoded);
    defer allocator.free(decoded);

    try std.testing.expectEqual(@as(usize, 0), decoded.len);
}

test "polyglot JAR with large data" {
    const allocator = std.testing.allocator;
    const data = try allocator.alloc(u8, 10000);
    defer allocator.free(data);
    for (data) |*b| b.* = 0xAA;

    const encoded = try encodeJAR(allocator, data, "Main");
    defer allocator.free(encoded);

    const decoded = try decodeJAR(allocator, encoded);
    defer allocator.free(decoded);

    try std.testing.expectEqualSlices(u8, data, decoded);
}

test "polyglot PYZ with large data" {
    const allocator = std.testing.allocator;
    const data = try allocator.alloc(u8, 10000);
    defer allocator.free(data);
    for (data) |*b| b.* = 0xBB;

    const preamble = "import sys\nprint('start')\n";
    const encoded = try encodePYZ(allocator, data, preamble);
    defer allocator.free(encoded);

    const decoded = try decodePYZ(allocator, encoded);
    defer allocator.free(decoded);

    try std.testing.expectEqualSlices(u8, data, decoded);
}
