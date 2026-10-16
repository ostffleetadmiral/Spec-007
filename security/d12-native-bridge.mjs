#!/usr/bin/env node
/* d12-native-bridge.mjs — controlled native sidecar for the D12 experimental
   adapter. The bridge boundary is process IPC: this module spawns the audited
   native adapter, captures stdout/stderr, parses the canonical D12R report,
   and never fabricates execution results. */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const SDK_ROOT = path.resolve(ROOT, "..", "D12", "d12-wasmrt-sdk");
const DEFAULT_ADAPTER = path.join(
  ROOT, "security", "out", "d12-dual", "d12-native-adapter");
const DEFAULT_MODULE = path.join(
  SDK_ROOT, "tests", "fixtures", "wide_sample.wasm");

function usage() {
  return "usage: node security/d12-native-bridge.mjs --module PATH --profile 128|256 --fuel N [--adapter PATH]";
}

export function execute({ adapterPath = DEFAULT_ADAPTER,
                          modulePath = DEFAULT_MODULE,
                          profile = 128,
                          fuel = 1024 } = {}) {
  if (!fs.existsSync(adapterPath)) throw new Error(`native adapter absent: ${adapterPath}`);
  if (!fs.existsSync(modulePath)) throw new Error(`module absent: ${modulePath}`);
  const r = spawnSync(adapterPath, [
    "--module", modulePath,
    "--profile", String(profile),
    "--fuel", String(fuel),
  ], { cwd: ROOT, encoding: "utf8", timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
  if (r.error) throw r.error;
  if (r.status !== 0)
    throw new Error(`native adapter refused rc=${r.status}: ${(r.stderr || r.stdout).trim()}`);
  const m = (r.stdout || "").match(/^status=(\d+)\nreport=([0-9a-f]+)\s*$/m);
  if (!m) throw new Error("native adapter emitted no canonical D12R report");
  const report = Buffer.from(m[2], "hex");
  if (report.length !== 704) throw new Error(`D12R report length drifted: ${report.length}`);
  if (Number(m[1]) !== report[5]) throw new Error("D12R status field mismatch");
  return {
    status: Number(m[1]),
    report,
    report_sha256: crypto.createHash("sha256").update(report).digest("hex"),
    stdout: r.stdout,
    stderr: r.stderr,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opts = { adapterPath: DEFAULT_ADAPTER, modulePath: DEFAULT_MODULE, profile: 128, fuel: 1024 };
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    const next = () => process.argv[++i];
    if (arg === "--module") opts.modulePath = next();
    else if (arg === "--profile") opts.profile = Number(next());
    else if (arg === "--fuel") opts.fuel = next();
    else if (arg === "--adapter") opts.adapterPath = next();
    else if (arg === "--help") { console.log(usage()); process.exit(0); }
    else { console.error(usage()); process.exit(2); }
  }
  try {
    const result = execute(opts);
    console.log(`status=${result.status}`);
    console.log(`report_sha256=${result.report_sha256}`);
    console.log(`report=${result.report.toString("hex")}`);
  } catch (e) {
    console.error(`d12-native-bridge: ${e.message || e}`);
    process.exit(1);
  }
}
