//! Token-id prompt and stop-token parsing for the native Digit probe.
const std = @import("std");

pub const MAX_TOKEN_ID = std.math.maxInt(u32);

pub const Prompt = struct {
    tokens: [16]usize = [_]usize{0} ** 16,
    len: usize = 0,
    stop_tokens: [16]usize = [_]usize{0} ** 16,
    stop_len: usize = 0,

    pub fn containsStop(self: *const Prompt, token: usize) bool {
        for (self.stop_tokens[0..self.stop_len]) |stop| if (stop == token) return true;
        return false;
    }
};

pub fn parse(text: []const u8) !Prompt {
    if (std.mem.trim(u8, text, " \t\r\n").len == 0) return error.EmptyPrompt;
    var prompt = Prompt{};
    var parts = std.mem.splitScalar(u8, text, ',');
    while (parts.next()) |part| {
        const trimmed = std.mem.trim(u8, part, " \t\r\n");
        if (trimmed.len == 0) return error.EmptyToken;
        if (prompt.len == prompt.tokens.len) return error.PromptTooLong;
        const token = try std.fmt.parseInt(usize, trimmed, 10);
        if (token > MAX_TOKEN_ID) return error.TokenIdTooLarge;
        prompt.tokens[prompt.len] = token;
        prompt.len += 1;
    }
    if (prompt.len == 0) return error.EmptyPrompt;
    return prompt;
}

pub fn addStop(prompt: *Prompt, token: usize) !void {
    if (token > MAX_TOKEN_ID) return error.TokenIdTooLarge;
    if (prompt.stop_len == prompt.stop_tokens.len) return error.TooManyStopTokens;
    if (prompt.containsStop(token)) return error.DuplicateStopToken;
    prompt.stop_tokens[prompt.stop_len] = token;
    prompt.stop_len += 1;
}

test "prompt parser accepts arbitrary token ids and stop tokens" {
    var p = try parse("248044, 510, 510");
    try addStop(&p, 151643);
    try std.testing.expectEqual(@as(usize, 3), p.len);
    try std.testing.expect(p.containsStop(151643));
}

test "prompt parser rejects malformed comma fields and oversized ids" {
    try std.testing.expectError(error.EmptyToken, parse("248044,,510"));
    try std.testing.expectError(error.EmptyToken, parse("248044,"));
    try std.testing.expectError(error.EmptyPrompt, parse("   "));
    const oversized = try std.fmt.allocPrint(std.testing.allocator, "{d}", .{@as(u64, MAX_TOKEN_ID) + 1});
    defer std.testing.allocator.free(oversized);
    try std.testing.expectError(error.TokenIdTooLarge, parse(oversized));
}

test "stop tokens are bounded and deduplicated" {
    var p = try parse("248044");
    try addStop(&p, 510);
    try std.testing.expectError(error.DuplicateStopToken, addStop(&p, 510));
    try std.testing.expectError(error.TokenIdTooLarge, addStop(&p, @as(usize, MAX_TOKEN_ID) + 1));
}
