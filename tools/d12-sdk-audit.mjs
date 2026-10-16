#!/usr/bin/env node
/* d12-sdk-audit.mjs — fail-closed upstream gate for the sibling
   d12-wasmrt-sdk release. This proves that the exact archived SDK state is
   present, that its release manifest still covers the shipped source/docs,
   that the standard and experimental paths remain isolated, and that the
   SDK's own verification battery runs green against Spec-007's Fano artifact.

   Modes:
     node tools/d12-sdk-audit.mjs           # execute checks, print summary
     node tools/d12-sdk-audit.mjs --verify  # execute + byte-compare evidence
     node tools/d12-sdk-audit.mjs --emit    # execute + write evidence artifact

   The evidence artifact is intentionally path-sanitized: it records sibling
   provenance, hashes, command outcomes, and explicit limitations — never the
   operator's home path or drawer contents. */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const SDK_ROOT = path.resolve(ROOT, "..", "D12", "d12-wasmrt-sdk");
const SDK_LABEL = "../D12/d12-wasmrt-sdk";
const ARCHIVE_NAME = "d12-wasmrt-sdk-20261016";
const ARCHIVE_DIR = path.join(os.homedir(), ".archives", ARCHIVE_NAME);
const ARCHIVE_TAR = path.join(ARCHIVE_DIR, "source.tar");
const ARCHIVE_SHA = `${ARCHIVE_TAR}.sha256`;
const FANO_WASM = path.join(ROOT, "apps", "fano", "fano.wasm");
const OUT = path.join(ROOT, "site", "assets", "d12-sdk-audit.json");
const EMIT = process.argv.includes("--emit");
const VERIFY = process.argv.includes("--verify");

const RELEASE = "experimental-width-feasibility-2026-10-16";
const EXPECTED_FIXTURE_SHA =
  "d207446ed7260de487dd442d8a2c7c3ff27052d8177925ffce51389acbf84dfa";
const RELEASE_MACHINERY = new Set(["build.zig", "release-manifest.json"]);
const SKIP_DIRS = new Set([".git", ".zig-cache", "zig-cache", "zig-out"]);
const STANDARD_FILES = [
  "src/decode.zig", "src/module.zig", "src/vm.zig", "src/wasi.zig",
  "src/env.zig", "src/builtins.zig", "src/instr.zig", "src/leb.zig",
  "src/simd.zig", "src/trap.zig", "src/main.zig",
];
const WIDE_FILES = [
  "src/profile.zig", "src/wide_int.zig", "src/wide_memory.zig",
  "src/wide_decode.zig", "src/wide_module.zig", "src/wide_exec.zig",
  "src/wide_bytecode.zig",
];

const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const sha256File = file => sha256(fs.readFileSync(file));
const readRel = (root, rel) => fs.readFileSync(path.join(root, rel), "utf8");
const posixRel = rel => rel.split(path.sep).join("/");

function listFiles(root) {
  const out = [];
  const walk = (dir, rel) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = path.join(dir, ent.name);
      const child = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) {
        if (!SKIP_DIRS.has(ent.name)) walk(abs, child);
      } else if (ent.isFile()) out.push(child);
    }
  };
  walk(root, "");
  return out;
}

function run(command, args, options = {}) {
  const started = process.hrtime.bigint();
  const result = spawnSync(command, args, {
    cwd: SDK_ROOT,
    encoding: "utf8",
    timeout: options.timeout ?? 300_000,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, ...(options.env || {}) },
  });
  return {
    status: result.status,
    signal: result.signal || null,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    duration_ms: Number((process.hrtime.bigint() - started) / 1_000_000n),
    error: result.error ? String(result.error.message || result.error) : null,
  };
}

function audit() {
  const checks = [];
  const failures = [];
  const check = (id, ok, detail = "") => {
    checks.push({ id, status: ok ? "PASS" : "FAIL", detail });
    if (!ok) failures.push(`${id}: ${detail || "failed"}`);
  };

  check("sdk-root", fs.existsSync(SDK_ROOT) && fs.statSync(SDK_ROOT).isDirectory(),
    SDK_LABEL);
  if (failures.length) return { checks, failures, report: null };

  const manifestPath = path.join(SDK_ROOT, "release-manifest.json");
  check("release-manifest-present", fs.existsSync(manifestPath), "release-manifest.json");
  if (failures.length) return { checks, failures, report: null };

  const manifestBytes = fs.readFileSync(manifestPath);
  const manifestSha = sha256(manifestBytes);
  let manifest = null;
  try { manifest = JSON.parse(manifestBytes.toString("utf8")); }
  catch { check("release-manifest-json", false, "release-manifest.json is not valid JSON"); }
  if (failures.length) return { checks, failures, report: null };
  check("release-manifest-schema",
    manifest && typeof manifest === "object" &&
    manifest.schema === "D12-WASMRT-SDK-RELEASE-v1" &&
    manifest.release === RELEASE &&
    manifest.standard_path === "native wasm32/wasm64 guest interpreter" &&
    manifest.experimental_path === "profile -> wide_decode -> wide_module -> wide_bytecode -> wide_exec -> wide_memory" &&
    manifest.standard_compatibility_unchanged === true &&
    manifest.wasm128_wasm256_standard_claim === false,
    RELEASE);
  if (!manifest || typeof manifest !== "object") return { checks, failures, report: null };

  const liveFiles = listFiles(SDK_ROOT);
  const declared = [
    ...(manifest.files || []).map(f => ({ ...f, class: "files" })),
    ...(manifest.documentation || []).map(f => ({ ...f, class: "documentation" })),
  ];
  const declaredPaths = declared.map(f => f.path);
  const declaredSet = new Set(declaredPaths);
  check("release-manifest-unique-paths", declaredSet.size === declaredPaths.length,
    `${declaredPaths.length} declared paths`);
  const missingDeclared = declaredPaths.filter(rel => !liveFiles.includes(rel));
  const undeclared = liveFiles.filter(rel => !declaredSet.has(rel) && !RELEASE_MACHINERY.has(rel));
  check("release-manifest-hash-scope", missingDeclared.length === 0 && undeclared.length === 0,
    `${declaredPaths.length}/${liveFiles.length} release files declared; build.zig and release-manifest.json are archive-sealed machinery`);

  const hashBad = [];
  for (const ent of declared) {
    if (typeof ent.path !== "string" || !/^[0-9a-f]{64}$/.test(ent.sha256 || "")) {
      hashBad.push(`${ent.path || "?"}:shape`);
      continue;
    }
    const file = path.join(SDK_ROOT, ent.path);
    if (!fs.existsSync(file) || sha256File(file) !== ent.sha256) hashBad.push(ent.path);
  }
  check("release-manifest-hashes", hashBad.length === 0,
    `${declared.length - hashBad.length}/${declared.length} declared hashes held`);

  const required = [
    "src/sdk.zig", "src/profile.zig", "src/wide_int.zig", "src/wide_memory.zig",
    "src/wide_decode.zig", "src/wide_module.zig", "src/wide_exec.zig",
    "src/wide_bytecode.zig", "src/all_tests.zig", "src/stress.zig",
    "examples/fano_verify.zig", "tests/fixtures/wide_sample.wasm",
  ];
  check("required-boundary-files", required.every(rel => declaredSet.has(rel)),
    `${required.length} boundary files are manifest-covered`);

  const fixtureSha = sha256File(path.join(SDK_ROOT, "tests/fixtures/wide_sample.wasm"));
  check("wide-fixture-hash", fixtureSha === EXPECTED_FIXTURE_SHA,
    `tests/fixtures/wide_sample.wasm sha256=${fixtureSha}`);

  const archiveTarExists = fs.existsSync(ARCHIVE_TAR);
  const archiveShaExists = fs.existsSync(ARCHIVE_SHA);
  check("release-archive-present", archiveTarExists && archiveShaExists,
    `${ARCHIVE_NAME}/source.tar + sha256 sidecar`);
  let archiveFileSet = [];
  let archiveBytesOk = false;
  if (archiveTarExists && archiveShaExists) {
    const tarSha = sha256File(ARCHIVE_TAR);
    const sidecar = fs.readFileSync(ARCHIVE_SHA, "utf8").trim().split(/\s+/);
    check("release-archive-sha256", sidecar[0] === tarSha && /(^|\/)source\.tar$/.test(sidecar[1] || ""),
      `source.tar sha256=${tarSha}`);
    const listing = run("tar", ["-tf", ARCHIVE_TAR]);
    archiveFileSet = (listing.stdout || "").split("\n")
      .filter(line => line.startsWith("d12-wasmrt-sdk/") && !line.endsWith("/"))
      .map(line => line.slice("d12-wasmrt-sdk/".length))
      .filter(Boolean)
      .sort();
    check("release-archive-file-set", listing.status === 0 &&
      JSON.stringify(archiveFileSet) === JSON.stringify([...liveFiles].sort()),
      `${archiveFileSet.length} archived release files`);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "d12-sdk-audit-"));
    try {
      const unpack = run("tar", ["-xf", ARCHIVE_TAR, "-C", tmp]);
      const extractRoot = path.join(tmp, "d12-wasmrt-sdk");
      archiveBytesOk = unpack.status === 0 && archiveFileSet.every(rel =>
        fs.readFileSync(path.join(extractRoot, rel)).equals(fs.readFileSync(path.join(SDK_ROOT, rel))));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
    check("release-archive-byte-parity", archiveBytesOk,
      "live sibling tree is byte-identical to the sealed release payload");
  }

  const standardBad = STANDARD_FILES.filter(rel =>
    /@import\("(?:profile|wide_[a-z_]+)\.zig"\)/.test(readRel(SDK_ROOT, rel)));
  check("standard-path-isolation", standardBad.length === 0,
    `${STANDARD_FILES.length} standard-path modules import no experimental width modules`);

  const FLOAT_RE = /\bf(?:16|32|64|80|128)\b|@float|@sqrt|@sin|@cos|@exp|@tan/;
  const wideFloatBad = WIDE_FILES.filter(rel => FLOAT_RE.test(readRel(SDK_ROOT, rel)));
  check("experimental-integer-only", wideFloatBad.length === 0,
    `${WIDE_FILES.length} experimental modules carry no float op/type tokens`);

  const allTests = readRel(SDK_ROOT, "src/all_tests.zig");
  const testBearing = liveFiles.filter(rel => rel.startsWith("src/") && rel.endsWith(".zig") &&
    rel !== "src/all_tests.zig" && /\btest\s*(?:\"|\{)/.test(readRel(SDK_ROOT, rel)));
  const importedModules = [...allTests.matchAll(/const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*@import\("([^"]+\.zig)"\)/g)]
    .map(m => ({ binding: m[1], file: `src/${m[2]}` }))
    .filter(m => testBearing.includes(m.file));
  const missingAggregate = importedModules.filter(m =>
    !new RegExp(`_\\s*=\\s*${m.binding}\\s*;`, "m").test(allTests));
  const importedFiles = new Set(importedModules.map(m => m.file));
  const unaggregatedTests = testBearing.filter(rel => !importedFiles.has(rel));
  check("aggregate-test-forcing", missingAggregate.length === 0,
    `${importedModules.length} aggregate imports are referenced; unaggregated test-bearing modules: ${unaggregatedTests.join(", ") || "none"}`);

  const sdkSource = readRel(SDK_ROOT, "src/sdk.zig");
  check("sdk-facades", /pub const Runtime = struct/.test(sdkSource) &&
    /pub const ExperimentalRuntime = struct/.test(sdkSource),
    "sdk.Runtime and sdk.ExperimentalRuntime are separate facades");
  const exampleSource = readRel(SDK_ROOT, "examples/fano_verify.zig");
  check("fano-example-surface",
    ["fano_packet_verify", "fano_basis_at", "fano_packet_build", "forged"].every(m => exampleSource.includes(m)),
    "golden, basis, round-trip, and forgery probes are present");

  const fanoWasmPresent = fs.existsSync(FANO_WASM);
  check("spec007-fano-artifact", fanoWasmPresent, "apps/fano/fano.wasm");
  const fanoSha = fanoWasmPresent ? sha256File(FANO_WASM) : null;

  const fmtFiles = ["build.zig",
    ...liveFiles.filter(rel => rel.startsWith("src/") && rel.endsWith(".zig")).sort(),
    ...liveFiles.filter(rel => rel.startsWith("examples/") && rel.endsWith(".zig")).sort(),
  ];
  const commands = [
    { id: "zig-build-test", argv: ["zig", ["build", "test"]], display: "zig build test" },
    { id: "zig-build-test-debug", argv: ["zig", ["build", "test", "-Doptimize=Debug"]], display: "zig build test -Doptimize=Debug" },
    { id: "zig-build-test-releasesafe", argv: ["zig", ["build", "test", "-Doptimize=ReleaseSafe"]], display: "zig build test -Doptimize=ReleaseSafe" },
    { id: "zig-build-test-releasefast", argv: ["zig", ["build", "test", "-Doptimize=ReleaseFast"]], display: "zig build test -Doptimize=ReleaseFast" },
    { id: "zig-test-all-tests", argv: ["zig", ["test", "src/all_tests.zig"]], display: "zig test src/all_tests.zig" },
    { id: "zig-build", argv: ["zig", ["build"]], display: "zig build" },
    { id: "fano-example", argv: ["zig", ["build", "run-fano-example", "--", FANO_WASM]], display: "zig build run-fano-example -- <spec007>/apps/fano/fano.wasm" },
    { id: "zig-fmt-check", argv: ["zig", ["fmt", "--check", ...fmtFiles]], display: `zig fmt --check (${fmtFiles.length} Zig files)` },
  ];
  const commandEvidence = [];
  for (const spec of commands) {
    const r = run(spec.argv[0], spec.argv[1], { timeout: 420_000 });
    let detail = r.status === 0 ? "exit 0" : `exit ${r.status ?? "null"}${r.signal ? ` signal=${r.signal}` : ""}`;
    if (spec.id === "zig-test-all-tests") {
      const m = (r.stdout + r.stderr).match(/All (\d+) tests passed\./);
      detail += m ? ` · ${m[1]} tests` : " · test count marker missing";
      if (!m || m[1] !== "39") r.status = 1;
    }
    if (spec.id === "fano-example") {
      const out = r.stdout + r.stderr;
      const ok = ["golden=PASS", "basis=PASS", "build=136B", "forged=REJECTED"].every(m => out.includes(m));
      detail += ok ? " · golden+basis+roundtrip+forgery markers held" : " · expected output markers missing";
      if (!ok) r.status = 1;
    }
    commandEvidence.push({ id: spec.id, command: spec.display, status: r.status === 0 ? "PASS" : "FAIL" });
    check(`command:${spec.id}`, r.status === 0, detail);
  }

  const report = {
    schema: "SPEC007-D12-SDK-AUDIT-v1",
    boundary: {
      sdk_root: SDK_LABEL,
      archive: `${ARCHIVE_NAME}/source.tar`,
      integration: "upstream sibling verified by Spec-007; source is not vendored into this tree",
      standard_path: "native wasm32/wasm64 guest interpreter",
      experimental_path: "profile -> wide_decode -> wide_module -> wide_bytecode -> wide_exec -> wide_memory",
      wasm128_wasm256_standard_claim: false,
      browser_runtime_bridge: "D12 execution bridge not implemented — a static page cannot spawn the native Zig host; a future bridge requires an explicit WASM build or authenticated host bridge",
      fano_wire_scope: "sealed canonical integrity datagram; not encryption and not Ed25519 authentication",
    },
    provenance: {
      release: RELEASE,
      release_manifest_sha256: manifestSha,
      live_release_files: liveFiles.length,
      manifest_declared_files: declared.length,
      archive_files: archiveFileSet.length,
      archive_sha256: archiveTarExists ? sha256File(ARCHIVE_TAR) : null,
      wide_fixture_sha256: fixtureSha,
      spec007_fano_wasm_sha256: fanoSha,
    },
    verification: {
      checks: checks.map(c => ({ id: c.id, status: c.status })),
      commands: commandEvidence,
      test_count: 39,
      aggregate_scope: "the declared 39-test battery covers modules imported by src/all_tests.zig",
      unaggregated_test_bearing_modules: unaggregatedTests,
    },
  };
  return { checks, failures, report };
}

const { checks, failures, report } = audit();
const pretty = report ? JSON.stringify(report, null, 2) + "\n" : null;
const green = failures.length === 0 && report && checks.every(c => c.status === "PASS");

for (const c of checks)
  console.log(`  [${c.status}] ${c.id}${c.detail ? ` — ${c.detail}` : ""}`);

if (!green) {
  console.error(`d12-sdk-audit: FAIL — ${failures.join("; ")}`);
  process.exit(1);
}

if (EMIT) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, pretty);
  console.log(`d12-sdk-audit: ${checks.length} checks green → site/assets/d12-sdk-audit.json`);
} else if (VERIFY) {
  const same = fs.existsSync(OUT) && fs.readFileSync(OUT, "utf8") === pretty;
  if (!same) {
    console.error("d12-sdk-audit: evidence drift — run --emit after upstream release refresh");
    process.exit(1);
  }
  console.log(`d12-sdk-audit: ${checks.length} checks green; evidence byte-exact`);
} else {
  console.log(`d12-sdk-audit: ${checks.length} checks green; --emit to write evidence`);
}
