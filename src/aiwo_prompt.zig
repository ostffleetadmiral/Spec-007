//! Token-id prompt and stop-token parsing for the native Digit probe.
const std = @import("std");

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
    var prompt = Prompt{};
    var parts = std.mem.splitScalar(u8, text, ',');
    while (parts.next()) |part| {
        const trimmed = std.mem.trim(u8, part, " \t\r\n");
        if (trimmed.len == 0) continue;
        if (prompt.len == prompt.tokens.len) return error.PromptTooLong;
        prompt.tokens[prompt.len] = try std.fmt.parseInt(usize, trimmed, 10);
        prompt.len += 1;
    }
    if (prompt.len == 0) return error.EmptyPrompt;
    return prompt;
}

pub fn addStop(prompt: *Prompt, token: usize) !void {
    if (prompt.stop_len == prompt.stop_tokens.len) return error.TooManyStopTokens;
    prompt.stop_tokens[prompt.stop_len] = token;
    prompt.stop_len += 1;
}

test "prompt parser accepts arbitrary token ids and stop tokens" {
    var p = try parse("248044, 510, 510");
    try addStop(&p, 151643);
    try std.testing.expectEqual(@as(usize, 3), p.len);
    try std.testing.expect(p.containsStop(151643));
}
