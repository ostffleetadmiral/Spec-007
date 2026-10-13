//! Inspect and bind the native Digit decoder package + external q4 weights.
//! Full execution remains a separate step because inputs_embeds/tokenization
//! must be supplied by the host; this probe proves the native load boundary.
const std = @import("std");
const session_mod = @import("digit_model_session");
const weights_mod = @import("digit_onnx_weights");

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
    var session = try session_mod.Session.load(alloc, package_bytes);
    defer session.deinit();
    try std.io.getStdOut().writer().print("{{\"schema\":\"AIWO-DIGIT-MODEL-v1\",\"package_bytes\":{d},\"indexed_tensors\":{d},\"model_state\":\"native-session-loaded\",\"execution\":\"awaiting-inputs-embeds\"}}\n", .{ package_bytes.len, index.tensors.items.len });
}
