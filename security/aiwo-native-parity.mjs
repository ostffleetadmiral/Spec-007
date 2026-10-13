#!/usr/bin/env node
// Native AIWO canary parity gate. The first graft slice verifies that the
// Spec-007 binary owns policy-gated execution and emits the canonical wire.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const BIN = path.join(ROOT, "zig-out", "bin", "spec007-aiwo");
const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok });
  console.log(`  [${ok ? "HELD" : "OPEN"}] AIWO-NATIVE ${name}${detail ? ` — ${detail}` : ""}`);
};

check("binary-present", fs.existsSync(BIN), BIN);
if (!fs.existsSync(BIN)) process.exit(1);
const status = JSON.parse(execFileSync(BIN, ["status"], { encoding: "utf8" }));
check("schema", status.schema === "AIWO-NATIVE-v1", status.schema);
check("policy-gated", status.authority === "policy-gated", status.authority);
const run = JSON.parse(execFileSync(BIN, ["run"], { encoding: "utf8" }));
check("cycle-allow", run.decision === "allow", run.decision);
check("canonical-wire", run.wire_bytes === 136, `${run.wire_bytes} bytes`);
check("sequence", run.sequence === 1, `sequence=${run.sequence}`);
const theoretical = [1, 8, 64, 512, 4096, 32768, 262144, 2097152];
for (let scale = 0; scale <= 7; scale++) {
  const result = JSON.parse(execFileSync(BIN, ["run", "--scale", String(scale)], { encoding: "utf8" }));
  check(`scale-${scale}`, result.scale === scale && result.theoretical_paths === theoretical[scale] && result.wire_bytes === 136, `${result.theoretical_paths} paths, enumerable=${result.fully_enumerable}`);
}
const rejected = JSON.parse(execFileSync(BIN, ["run", "--scale", "7", "--chunk-size", "8", "--max-chunks", "1024"], { encoding: "utf8" }));
const admitted = JSON.parse(execFileSync(BIN, ["run", "--scale", "7", "--chunk-size", "4096", "--max-chunks", "1024"], { encoding: "utf8" }));
check("scale-7-admission-refusal", rejected.chunk_count === 262144 && !rejected.admitted, `${rejected.chunk_count} chunks refused`);
check("scale-7-admission", admitted.chunk_count === 512 && admitted.admitted, `${admitted.chunk_count} chunks admitted`);

const failed = checks.filter(c => !c.ok).length;
console.log(`AIWO native parity: ${checks.length - failed}/${checks.length} held`);
process.exit(failed ? 1 : 0);
