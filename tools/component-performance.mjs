#!/usr/bin/env node
// component-performance.mjs — reproducible workstream baselines for the
// component-retrograde campaign. --emit runs the gates and records integer
// timings; --verify proves the emitted ledger is still bound to the same
// source surface, command set, component bindings, and green result class.
// Timings are measurements, not frozen constants — verify checks coverage
// and outcome, not nanosecond equality.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const OUT_DIR = path.join(ROOT, "security", "out");
const OUT = path.join(OUT_DIR, "component-performance.json");
const DEBRIEF = path.join(OUT_DIR, "component-performance.md");
const RUN_DIR = path.join(OUT_DIR, "component-performance");
const EMIT = process.argv.includes("--emit");
const VERIFY = process.argv.includes("--verify");

const sha256 = rel => crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, rel))).digest("hex");
const SOURCE_PINS = [
  "build.zig",
  "src/perf_baseline.zig",
  "src/aiwo_cli.zig",
  "src/aiwo_chunk_checkpoint.zig",
  "src/aiwo_digit_model_probe.zig",
  "src/aiwo_prompt.zig",
  "src/dht_native.zig",
  "src/dhtd.zig",
  "tools/component-census.mjs",
  "tools/component-retrograde.mjs",
  "tools/component-performance.mjs",
  "tools/gov-map.mjs",
  "tools/vision-audit.mjs",
  "tools/academy-harvest.mjs",
  "tools/repo-corpus.json",
  "tools/publish-check.sh",
  "tools/d12-sdk-audit.mjs",
  "security/aiwo-native-parity.mjs",
  "security/aiwo-digit-model-parity.mjs",
  "site/build.py",
];

const MEASUREMENTS = [
  {
    id: "zig-build-test",
    argv: ["zig", "build", "test"],
    timeout_ms: 300_000,
    bindings: { workstreams: ["all"], components: ["build.zig"], selector: "unit-tested-zig" },
  },
  {
    id: "zig-build-releasefast",
    argv: ["zig", "build", "-Doptimize=ReleaseFast"],
    timeout_ms: 300_000,
    bindings: { workstreams: ["all"], components: ["build.zig"], selector: "release-artifacts" },
  },
  {
    id: "native-microbench",
    argv: ["./zig-out/bin/spec007-perf-baseline"],
    timeout_ms: 120_000,
    parser: "json",
    bindings: {
      workstreams: ["q128-arithmetic", "spec008-wire", "native-aiwo-dht"],
      components: [
        "src/perf_baseline.zig",
        "src/fixed_point_q128.zig",
        "src/spec007_q128.zig",
        "src/spec008_seal.zig",
        "src/spec008_seal_cli.zig",
        "src/aiwo_cognitive.zig",
        "src/aiwo_chunk_checkpoint.zig",
        "src/dhtd.zig",
      ],
    },
  },
  {
    id: "aiwo-scale7-chunk-dht",
    argv: [
      "./zig-out/bin/spec007-aiwo", "run", "--scale", "7",
      "--chunk-size", "4096", "--max-chunks", "1024", "--execute-chunks",
      "--checkpoint", "security/out/component-performance/scale7.chk",
      "--dht-root", "security/out/component-performance/dht",
    ],
    timeout_ms: 120_000,
    parser: "json",
    prepare: () => fs.rmSync(RUN_DIR, { recursive: true, force: true }),
    bindings: {
      workstreams: ["native-aiwo-dht", "security-lab"],
      components: [
        "src/aiwo_cli.zig",
        "src/aiwo_cognitive.zig",
        "src/aiwo_chunk_checkpoint.zig",
        "src/aiwo_dht.zig",
        "src/dht_native.zig",
        "src/aiwo_runtime.zig",
      ],
    },
  },
  {
    id: "digit-model-probe",
    argv: ["./zig-out/bin/spec007-digit-model-probe", "--tokens", "248044,248044", "--stop-token", "510"],
    timeout_ms: 240_000,
    parser: "json",
    bindings: {
      workstreams: ["native-aiwo-dht", "digit-model-donor"],
      components: [
        "src/aiwo_digit_model_probe.zig",
        "src/aiwo_digit_bridge.zig",
        "src/aiwo_model_observation.zig",
        "src/aiwo_prompt.zig",
        "src/aiwo_runtime.zig",
        "deps/digit/model_session.zig",
        "deps/digit/graph_exec.zig",
        "deps/digit/onnx_graph.zig",
        "deps/digit/qwen_embed.zig",
      ],
    },
  },
  {
    id: "component-census-verify",
    argv: ["node", "tools/component-census.mjs", "--verify"],
    timeout_ms: 120_000,
    bindings: { workstreams: ["governance-tools"], components: ["tools/component-census.mjs"] },
  },
  {
    id: "component-retrograde-verify",
    argv: ["node", "tools/component-retrograde.mjs", "--verify"],
    timeout_ms: 120_000,
    bindings: { workstreams: ["governance-tools"], components: ["tools/component-retrograde.mjs"] },
  },
  {
    id: "d12-sdk-audit-verify",
    argv: ["node", "tools/d12-sdk-audit.mjs", "--verify"],
    timeout_ms: 480_000,
    bindings: {
      workstreams: ["governance-tools", "published-surface"],
      components: ["tools/d12-sdk-audit.mjs", "site/assets/d12-sdk-audit.json"],
    },
  },
  {
    id: "gov-map-verify",
    argv: ["node", "tools/gov-map.mjs", "--verify"],
    timeout_ms: 120_000,
    bindings: { workstreams: ["governance-tools"], components: ["tools/gov-map.mjs", "site/assets/gov-ledger.json"] },
  },
  {
    id: "academy-harvest-verify",
    argv: ["node", "tools/academy-harvest.mjs", "--verify"],
    timeout_ms: 180_000,
    bindings: {
      workstreams: ["governance-tools", "published-surface"],
      components: ["tools/academy-harvest.mjs", "site/assets/academy-manifest.json"],
      selector: "site-academy-generated",
    },
  },
  {
    id: "site-build",
    argv: ["python3", "build.py"],
    cwd: "site",
    timeout_ms: 180_000,
    bindings: { workstreams: ["published-surface", "desk-shell"], components: ["site/build.py", "tools/publish-check.sh"] },
  },
];

const sanitize = text => String(text || "").split(ROOT).join("<repo>").trim().split("\n").pop() ?? "";
const digest = text => crypto.createHash("sha256").update(String(text || "")).digest("hex");

function metricFields(spec, stdout) {
  if (spec.parser !== "json") return {};
  const parsed = JSON.parse(stdout);
  return { parsed };
}

function runMeasurement(spec) {
  if (spec.prepare) spec.prepare();
  const started = process.hrtime.bigint();
  const result = spawnSync(spec.argv[0], spec.argv.slice(1), {
    cwd: path.join(ROOT, spec.cwd || "."),
    encoding: "utf8",
    timeout: spec.timeout_ms,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, ...(spec.env || {}) },
  });
  const duration_ms = Number((process.hrtime.bigint() - started) / 1_000_000n);
  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  let metrics = {};
  try { metrics = metricFields(spec, stdout); } catch (error) {
    return { status: "FAIL", exit_code: result.status, signal: result.signal || null, duration_ms, last_line: sanitize(stderr || stdout), error: String(error.message || error) };
  }
  return {
    status: result.status === 0 ? "PASS" : "FAIL",
    exit_code: result.status,
    signal: result.signal || null,
    duration_ms,
    stdout_bytes: Buffer.byteLength(stdout),
    stdout_sha256: digest(stdout),
    last_line: sanitize(stdout || stderr),
    metrics,
  };
}

function sourcePins() {
  return Object.fromEntries(SOURCE_PINS.filter(rel => fs.existsSync(path.join(ROOT, rel))).map(rel => [rel, sha256(rel)]));
}

function definition() {
  return MEASUREMENTS.map(m => ({
    id: m.id,
    argv: m.argv,
    cwd: m.cwd || null,
    timeout_ms: m.timeout_ms,
    parser: m.parser || "text",
    bindings: m.bindings,
  }));
}

function emit() {
  fs.mkdirSync(RUN_DIR, { recursive: true });
  const measurements = MEASUREMENTS.map(spec => ({ ...definition().find(d => d.id === spec.id), ...runMeasurement(spec) }));
  const boundComponents = new Set();
  const boundWorkstreams = new Set();
  for (const m of measurements) {
    for (const rel of m.bindings.components || []) boundComponents.add(rel);
    for (const ws of m.bindings.workstreams || []) boundWorkstreams.add(ws);
  }
  const report = {
    schema: "SPEC007-COMPONENT-PERFORMANCE-v1",
    generated: new Date().toISOString(),
    note: "integer millisecond timings; --verify binds the same source/command/component surface and requires every recorded run green",
    source_pins: sourcePins(),
    summary: {
      measurements: measurements.length,
      green: measurements.filter(m => m.status === "PASS").length,
      duration_ms_total: measurements.reduce((n, m) => n + m.duration_ms, 0),
      bound_components: boundComponents.size,
      bound_workstreams: [...boundWorkstreams].sort(),
      selectors: [...new Set(measurements.map(m => m.bindings.selector).filter(Boolean))].sort(),
    },
    measurements,
  };
  const md = ["# Spec-007 component performance baseline", "",
    `- Measurements: ${report.summary.measurements}`,
    `- Green: ${report.summary.green}`,
    `- Total wall time: ${report.summary.duration_ms_total} ms`,
    `- Explicitly bound components: ${report.summary.bound_components}`,
    "", "| Measurement | Status | Time | Binding |", "|---|---|---:|---|",
    ...measurements.map(m => `| \`${m.id}\` | ${m.status} | ${m.duration_ms} ms | ${(m.bindings.workstreams || []).join(", ")} |`),
    "", "Timings are baselines for optimization decisions, not immutable proof constants.",
  ].join("\n");
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
  fs.writeFileSync(DEBRIEF, md + "\n");
  console.log(`component performance → ${OUT} (${report.summary.green}/${report.summary.measurements} green)`);
  if (report.summary.green !== report.summary.measurements) process.exit(1);
}

function verify() {
  if (!fs.existsSync(OUT)) { console.error("component performance verify FAIL — emit first"); process.exit(1); }
  const old = JSON.parse(fs.readFileSync(OUT, "utf8"));
  const pins = sourcePins();
  const samePins = JSON.stringify(old.source_pins) === JSON.stringify(pins);
  const defs = definition();
  const sameDefs = JSON.stringify((old.measurements || []).map(m => ({
    id: m.id, argv: m.argv, cwd: m.cwd, timeout_ms: m.timeout_ms, parser: m.parser, bindings: m.bindings,
  }))) === JSON.stringify(defs);
  const green = (old.measurements || []).every(m => m.status === "PASS" && m.exit_code === 0) && old.summary?.green === old.summary?.measurements;
  if (!samePins || !sameDefs || !green) {
    console.error(`component performance verify FAIL — ${!samePins ? "source drift " : ""}${!sameDefs ? "measurement drift " : ""}${!green ? "failed baseline" : ""}`.trim());
    process.exit(1);
  }
  console.log(`component performance verify GREEN — ${old.summary.measurements} baselines bound to ${old.summary.bound_components} components`);
}

if (EMIT) emit();
else if (VERIFY) verify();
else console.log(JSON.stringify({ schema: "SPEC007-COMPONENT-PERFORMANCE-v1", measurements: definition(), source_pins: sourcePins() }, null, 2));
