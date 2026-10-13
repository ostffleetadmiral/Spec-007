//! Execute one real q4 Digit decoder step through the native session boundary.
const std = @import("std");
const session_mod = @import("digit_model_session");
const weights_mod = @import("digit_onnx_weights");
const embed_mod = @import("digit_qwen_embed");
const fp = @import("digit_fixed_point");
const aiwo_runtime = @import("aiwo_runtime");
const aiwo_types = @import("aiwo_types");

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const alloc = gpa.allocator();
    const root = "models/digit-qwen3.5-2b-onnx-opt/onnx";
    const package_bytes = try std.fs.cwd().readFileAlloc(alloc, "deps/digit/decoder_q4.dgqp", 8 * 1024 * 1024);
    defer alloc.free(package_bytes);
    const decoder_path = "models/digit-qwen3.5-2b-onnx-opt/onnx/decoder_model_merged_q4.onnx";
    const model_bytes = try std.fs.cwd().readFileAlloc(alloc, decoder_path, 16 * 1024 * 1024);
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
    const token: usize = 248044;
    const values = try alloc.alloc(fp.Q128_128, embedding.embedding_dim);
    defer alloc.free(values);
    try embedding.embed(values, token);
    const raw = try alloc.alloc(u8, values.len * 32);
    defer alloc.free(raw);
    for (values, 0..) |value, i| @memcpy(raw[i * 32 ..][0..32], &value.toLittleEndian());
    const dims = [_]u64{ 1, 1, @intCast(embedding.embedding_dim) };
    try session.uploadTensor("inputs_embeds", &dims, raw);
    var uploads: usize = 0;
    while (true) {
        const status = try session.runAvailable();
        if (status == .done) break;
        const missing = session.runner.missing_input orelse return error.MissingTensor;
        const reference = index.find(missing) orelse return error.MissingInitializer;
        const bytes = try index.readSliceCached(alloc, &embed_cache, missing, 0, reference.length);
        defer alloc.free(bytes);
        try session.uploadWeight(missing, reference.data_type, reference.dims.items, bytes);
        uploads += 1;
    }
    const observation = try session.observation(1, 0);
    var officer = try aiwo_runtime.Runtime.init(alloc, "digit", .wo3, 6, "core_integrity", "aiwo", .{ 1, 2, 3 });
    officer.activate();
    const aiwo = try officer.runDigitObservedCycle(observation, .{ .name = "native-model-observation" });
    _ = root;
    try std.io.getStdOut().writer().print("{{\"schema\":\"AIWO-DIGIT-MODEL-v3\",\"package_bytes\":{d},\"indexed_tensors\":{d},\"weights_uploaded\":{d},\"input_token\":{d},\"argmax_token\":{d},\"checkpoint_fold\":\"{x}\",\"logits_checksum\":\"{x}\",\"aiwo_decision\":\"{s}\",\"aiwo_sequence\":{d},\"aiwo_trajectory\":{d},\"wire_bytes\":{d},\"execution\":\"one-token-native-aiwo\"}}\n", .{ package_bytes.len, index.tensors.items.len, uploads, token, observation.argmax_token, observation.checkpoint_fold, observation.logits_checksum, @tagName(aiwo.decision), aiwo.sequence, aiwo.commit.trajectory, aiwo.wire.len });
}
