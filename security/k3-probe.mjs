// k3-probe.mjs — gated probes into the zig-k3-port integer brain.
//
//   node k3-probe.mjs          # selfcheck: fixed-ids decode on the tiny
//                              # checkpoint → sha256 brain digest artifact
//   node k3-probe.mjs --cap    # k3cap: node capability manifest → artifact
//
// Discipline:
//   - The gate owns argv entirely: fixed prompt ids, fixed --gen, fixed
//     cache budget. No free-form prompts through the command surface —
//     open inference is a host process (k3serve), not a gate; the bridge
//     observes brains, it does not host them.
//   - Sampling is argmax-deterministic (no seed): same engine + same
//     checkpoint + same ids → same emitted ids, on any platform. The
//     digest is sha256 over the emitted ids as u32-LE — same endian
//     convention as the fabric chain.
//   - Artifacts land in security/out/k3-*.{json}: digest + run record.
//     k3 writes k3_run.json into its cwd, so the probe runs it inside
//     out/k3run/ — the k3 tree is not littered.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "out");
const K3 = path.resolve(HERE, "..", "..", "zig-k3-port");
const K3_BIN = path.join(K3, "zig-out", "bin", "k3");
const K3CAP_BIN = path.join(K3, "zig-out", "bin", "k3cap");
const TINY = path.join(K3, "tests", "fixtures", "tiny_k3");
const RUN_DIR = path.join(OUT, "k3run");
const SELFCHECK_OUT = path.join(OUT, "k3-selfcheck.json");
const CAP_OUT = path.join(OUT, "k3cap.json");

const PROMPT_IDS = [3, 4, 5, 6, 7]; // the released-weights golden-gate prompt
const GEN = 8;

function selfcheck() {
  fs.mkdirSync(RUN_DIR, { recursive: true });
  const t0 = Date.now();
  execFileSync(K3_BIN, [TINY, "--ids", PROMPT_IDS.join(","), "--gen", String(GEN), "--cache-gb", "1"],
    { cwd: RUN_DIR, timeout: 120_000, stdio: ["ignore", "pipe", "pipe"] });
  const run = JSON.parse(fs.readFileSync(path.join(RUN_DIR, "k3_run.json"), "utf8"));
  const idsBuf = Buffer.alloc(run.generated_ids.length * 4);
  run.generated_ids.forEach((id, i) => idsBuf.writeUInt32LE(id, i * 4));
  const digest = crypto.createHash("sha256").update(idsBuf).digest("hex");
  const rec = {
    ts: new Date().toISOString(),
    prompt_ids: run.prompt_ids,
    generated_ids: run.generated_ids,
    digest, layers_completed: run.layers_completed,
    expert_drops: run.expert_drops,
    wall_seconds: run.wall_seconds,
    peak_rss_bytes: run.peak_rss_bytes,
  };
  fs.writeFileSync(SELFCHECK_OUT, JSON.stringify(rec, null, 2));
  console.log(`k3-selfcheck: ids=[${run.generated_ids}] layers=${run.layers_completed} digest=${digest.slice(0, 16)}… in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

function cap() {
  const out = execFileSync(K3CAP_BIN, [], { timeout: 30_000 });
  const manifest = JSON.parse(out.toString("utf8"));
  manifest.probed_at = new Date().toISOString();
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(CAP_OUT, JSON.stringify(manifest, null, 2));
  const c = manifest.cpu, m = manifest.memory, q = manifest.compute;
  console.log(`k3-cap: ${c.model} · ${c.cores} cores · ${(m.ram_bytes / 2 ** 30).toFixed(0)} GiB · q128_native=${q.q128_native} · gpu_compiled=${manifest.gpu.compiled}`);
}

process.argv.includes("--cap") ? cap() : selfcheck();
