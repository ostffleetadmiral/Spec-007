//! Execute real q4 Digit decoder steps through the native AIWO boundary.
const std = @import("std");
const session_mod = @import("digit_model_session");
const weights_mod = @import("digit_onnx_weights");
const embed_mod = @import("digit_qwen_embed");
const fp = @import("digit_fixed_point");
const aiwo_runtime = @import("aiwo_runtime");
const prompt_mod = @import("aiwo_prompt");

fn takeValue(args: anytype, arg: []const u8, name: []const u8, missing: anyerror) !?[]const u8 {
    if (std.mem.eql(u8, arg, name)) return args.next() orelse return missing;
    if (std.mem.startsWith(u8, arg, name) and arg.len > name.len and arg[name.len] == '=') return arg[name.len + 1 ..];
    return null;
}

fn parseProbeArgs(args: anytype) !prompt_mod.Prompt {
    var prompt = try prompt_mod.parse("248044");
    try prompt_mod.addStop(&prompt, 151643);
    var token_text: ?[]const u8 = null;
    while (args.next()) |arg| {
        if (try takeValue(args, arg, "--tokens", error.MissingTokens)) |value| {
            token_text = value;
            continue;
        }
        if (try takeValue(args, arg, "--stop-token", error.MissingStopToken)) |value| {
            const token = try std.fmt.parseInt(usize, value, 10);
            try prompt_mod.addStop(&prompt, token);
            continue;
        }
        return error.UnknownArgument;
    }
    if (token_text) |text| {
        const parsed = try prompt_mod.parse(text);
        prompt.tokens = parsed.tokens;
        prompt.len = parsed.len;
    }
    return prompt;
}

fn feed(
    allocator: std.mem.Allocator,
    session: *session_mod.Session,
    embedding: *embed_mod.QwenEmbedding,
    index: *const weights_mod.WeightIndex,
    cache: *weights_mod.ShardCache,
    token: usize,
) !usize {
    const values = try allocator.alloc(fp.Q128_128, embedding.embedding_dim);
    defer allocator.free(values);
    try embedding.embed(values, token);
    const raw = try allocator.alloc(u8, values.len * 32);
    defer allocator.free(raw);
    for (values, 0..) |value, i| @memcpy(raw[i * 32 ..][0..32], &value.toLittleEndian());
    const dims = [_]u64{ 1, 1, @intCast(embedding.embedding_dim) };
    try session.uploadTensor("inputs_embeds", &dims, raw);
    var uploads: usize = 0;
    while (true) {
        const status = try session.runAvailable();
        if (status == .done) break;
        const missing = session.runner.missing_input orelse return error.MissingTensor;
        const reference = index.find(missing) orelse return error.MissingInitializer;
        const bytes = try index.readSliceCached(allocator, cache, missing, 0, reference.length);
        defer allocator.free(bytes);
        try session.uploadWeight(missing, reference.data_type, reference.dims.items, bytes);
        uploads += 1;
    }
    return uploads;
}

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const alloc = gpa.allocator();
    var args = std.process.args();
    _ = args.next();
    const prompt = try parseProbeArgs(&args);
    const package_bytes = try std.fs.cwd().readFileAlloc(alloc, "deps/digit/decoder_q4.dgqp", 8 * 1024 * 1024);
    defer alloc.free(package_bytes);
    const model_bytes = try std.fs.cwd().readFileAlloc(alloc, "models/digit-qwen3.5-2b-onnx-opt/onnx/decoder_model_merged_q4.onnx", 16 * 1024 * 1024);
    defer alloc.free(model_bytes);
    var index = try weights_mod.indexModel(alloc, model_bytes);
    defer index.deinit();
    var embedding = try embed_mod.QwenEmbedding.init(alloc, "models/digit-qwen3.5-2b-onnx-opt/onnx/embed_tokens_q4.onnx");
    defer embedding.deinit();
    var embed_cache = try weights_mod.ShardCache.init(alloc, embedding.base_dir);
    defer embed_cache.deinit();
    embedding.shards = &embed_cache;
    var session = try session_mod.Session.load(alloc, package_bytes);
    defer session.deinit();
    try session.seedInputs();
    var officer = try aiwo_runtime.Runtime.init(alloc, "digit", .wo3, 6, "core_integrity", "aiwo", .{ 1, 2, 3 });
    defer officer.deinit();
    officer.activate();
    const steps_requested: usize = if (std.posix.getenv("AIWO_DIGIT_STEPS")) |value| try std.fmt.parseInt(usize, value, 10) else @max(prompt.len, 1);
    if (steps_requested == 0 or steps_requested > 6) return error.InvalidStepCount;
    var steps: usize = 0;
    var token: usize = prompt.tokens[0];
    var stop_reason: []const u8 = "step-limit";
    var total_uploads: usize = 0;
    var outputs: [6]u32 = .{ 0, 0, 0, 0, 0, 0 };
    var folds: [6]u256 = .{ 0, 0, 0, 0, 0, 0 };
    var aiwo_sequences: [6]u64 = .{ 0, 0, 0, 0, 0, 0 };
    var aiwo_decisions: [6][]const u8 = .{ "", "", "", "", "", "" };
    for (0..steps_requested) |step| {
        if (step > 0) try session.advanceStep();
        const current = if (step < prompt.len) prompt.tokens[step] else token;
        total_uploads += try feed(alloc, session, &embedding, &index, &embed_cache, current);
        const observation = try session.observation(@intCast(step + 1), step);
        const aiwo = try officer.runDigitObservedCycle(observation, .{ .name = "native-model-observation" });
        outputs[step] = observation.argmax_token;
        folds[step] = observation.checkpoint_fold;
        aiwo_sequences[step] = aiwo.sequence;
        aiwo_decisions[step] = @tagName(aiwo.decision);
        token = observation.argmax_token;
        steps += 1;
        if (prompt.containsStop(token)) {
            stop_reason = "stop-token";
            break;
        }
    }
    try std.io.getStdOut().writer().print("{{\"schema\":\"AIWO-DIGIT-MODEL-v4\",\"steps\":{d},\"package_bytes\":{d},\"indexed_tensors\":{d},\"weights_uploaded\":{d},\"input_token\":{d},\"prompt_tokens\":{d},\"stop_reason\":\"{s}\",\"generated_ids\":[{d},{d},{d},{d},{d},{d}],\"checkpoint_folds\":[\"{x}\",\"{x}\",\"{x}\",\"{x}\",\"{x}\",\"{x}\"],\"aiwo_sequences\":[{d},{d},{d},{d},{d},{d}],\"aiwo_decisions\":[\"{s}\",\"{s}\",\"{s}\",\"{s}\",\"{s}\",\"{s}\"],\"wire_bytes\":136,\"execution\":\"native-aiwo\"}}\n", .{ steps, package_bytes.len, index.tensors.items.len, total_uploads, prompt.tokens[0], prompt.len, stop_reason, outputs[0], outputs[1], outputs[2], outputs[3], outputs[4], outputs[5], folds[0], folds[1], folds[2], folds[3], folds[4], folds[5], aiwo_sequences[0], aiwo_sequences[1], aiwo_sequences[2], aiwo_sequences[3], aiwo_sequences[4], aiwo_sequences[5], aiwo_decisions[0], aiwo_decisions[1], aiwo_decisions[2], aiwo_decisions[3], aiwo_decisions[4], aiwo_decisions[5] });
}

const TestArgs = struct {
    items: []const []const u8,
    index: usize = 0,

    fn next(self: *TestArgs) ?[]const u8 {
        if (self.index >= self.items.len) return null;
        defer self.index += 1;
        return self.items[self.index];
    }
};

fn parseTest(items: []const []const u8) !prompt_mod.Prompt {
    var args = TestArgs{ .items = items };
    return parseProbeArgs(&args);
}

test "digit probe parses separated and equals-style prompt options" {
    const separated = [_][]const u8{ "--tokens", "248044,248044", "--stop-token", "510" };
    const a = try parseTest(&separated);
    try std.testing.expectEqual(@as(usize, 2), a.len);
    try std.testing.expect(a.containsStop(510));
    try std.testing.expect(a.containsStop(151643));

    const equals = [_][]const u8{ "--stop-token=81", "--tokens=248044" };
    const b = try parseTest(&equals);
    try std.testing.expectEqual(@as(usize, 1), b.len);
    try std.testing.expect(b.containsStop(81));
}

test "digit probe rejects unknown and missing arguments" {
    const unknown = [_][]const u8{"--bogus"};
    try std.testing.expectError(error.UnknownArgument, parseTest(&unknown));
    const missing_tokens = [_][]const u8{"--tokens"};
    try std.testing.expectError(error.MissingTokens, parseTest(&missing_tokens));
    const missing_stop = [_][]const u8{"--stop-token"};
    try std.testing.expectError(error.MissingStopToken, parseTest(&missing_stop));
}
