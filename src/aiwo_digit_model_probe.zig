//! Execute real q4 Digit decoder steps through the native AIWO boundary.
const std = @import("std");
const session_mod = @import("digit_model_session");
const weights_mod = @import("digit_onnx_weights");
const embed_mod = @import("digit_qwen_embed");
const fp = @import("digit_fixed_point");
const aiwo_runtime = @import("aiwo_runtime");

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
    officer.activate();
    const steps: usize = if (std.posix.getenv("AIWO_DIGIT_STEPS")) |value| std.fmt.parseInt(usize, value, 10) catch 1 else 1;
    if (steps == 0 or steps > 3) return error.InvalidStepCount;
    var token: usize = 248044;
    var total_uploads: usize = 0;
    var outputs: [3]u32 = .{ 0, 0, 0 };
    var folds: [3]u256 = .{ 0, 0, 0 };
    var aiwo_sequences: [3]u64 = .{ 0, 0, 0 };
    var aiwo_decisions: [3][]const u8 = .{ "", "", "" };
    for (0..steps) |step| {
        if (step > 0) try session.advanceStep();
        total_uploads += try feed(alloc, session, &embedding, &index, &embed_cache, token);
        const observation = try session.observation(@intCast(step + 1), step);
        const aiwo = try officer.runDigitObservedCycle(observation, .{ .name = "native-model-observation" });
        outputs[step] = observation.argmax_token;
        folds[step] = observation.checkpoint_fold;
        aiwo_sequences[step] = aiwo.sequence;
        aiwo_decisions[step] = @tagName(aiwo.decision);
        token = observation.argmax_token;
    }
    try std.io.getStdOut().writer().print("{{\"schema\":\"AIWO-DIGIT-MODEL-v4\",\"steps\":{d},\"package_bytes\":{d},\"indexed_tensors\":{d},\"weights_uploaded\":{d},\"input_token\":248044,\"generated_ids\":[{d},{d},{d}],\"checkpoint_folds\":[\"{x}\",\"{x}\",\"{x}\"],\"aiwo_sequences\":[{d},{d},{d}],\"aiwo_decisions\":[\"{s}\",\"{s}\",\"{s}\"],\"wire_bytes\":136,\"execution\":\"native-aiwo\"}}\n", .{ steps, package_bytes.len, index.tensors.items.len, total_uploads, outputs[0], outputs[1], outputs[2], folds[0], folds[1], folds[2], aiwo_sequences[0], aiwo_sequences[1], aiwo_sequences[2], aiwo_decisions[0], aiwo_decisions[1], aiwo_decisions[2] });
}
