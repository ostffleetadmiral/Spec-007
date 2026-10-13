#!/usr/bin/env node
// Native Digit model-session boundary check. Large model weights are local,
// ignored deployment assets; absent assets are reported honestly as deferred.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const model = path.join(ROOT, "models", "digit-qwen3.5-2b-onnx-opt", "onnx");
const required = ["decoder_model_merged_q4.onnx", "decoder_model_merged_q4.onnx_data", "embed_tokens_q4.onnx", "embed_tokens_q4.onnx_data"];
const missing = required.filter(f => !fs.existsSync(path.join(model, f)));
if (missing.length) {
  console.log(`[NOTED] AIWO-DIGIT-MODEL model weights absent — ${missing.join(", ")}`);
  process.exit(process.env.AIWO_REQUIRE_MODEL === "1" ? 1 : 0);
}
const bin = path.join(ROOT, "zig-out", "bin", "spec007-digit-model-probe");
const out = execFileSync(bin, { encoding: "utf8" });
const result = JSON.parse(out);
const ok = result.schema === "AIWO-DIGIT-MODEL-v4" && result.steps >= 1 && result.indexed_tensors === 750 && result.weights_uploaded >= 750 && result.generated_ids?.length >= result.steps && result.aiwo_decisions?.slice(0, result.steps).every(d => d === "allow") && result.wire_bytes === 136;
console.log(`[${ok ? "HELD" : "OPEN"}] AIWO-DIGIT-MODEL steps=${result.steps} package=${result.package_bytes} tensors=${result.indexed_tensors} uploaded=${result.weights_uploaded} ids=${result.generated_ids?.slice(0, result.steps).join(",")} execution=${result.execution}`);
process.exit(ok ? 0 : 1);
