// agent-capacity-sweep.mjs — REAL measured agent capacity of the k3 trunk.
//
//   node tools/agent-capacity-sweep.mjs            # run the sweep → artifact
//   node tools/agent-capacity-sweep.mjs --verify   # artifact consistency
//   node tools/agent-capacity-sweep.mjs --emit     # re-emit artifact only
//
//   Prediction under test (pre-registered, convos/agent-capacity-test-plan.md):
//   the crew+staff decomposition needs ~118,760 concurrent agents. Derived
//   bounds said ~10²–10⁴. This tool measures the true curve: N concurrent
//   k3 decodes spawned ASYNC (k3-stress's spawnSync runs serially — this
//   sweep's concurrency is real), digest-determinism verified per lane.
//
//   max_verified_N = largest N with 100% completion, 0 expert drops,
//   every lane emitting the reference digest. Anything less than the
//   needed figure is REFUTED-by-measurement; meeting it upgrades the claim.
//
//   Artifact: security/out/agent-capacity.json (gitignored evidence).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const OUT = path.join(ROOT, "security", "out");
const WORK = path.join(OUT, "agent-capacity");
const K3 = path.resolve(ROOT, "..", "zig-k3-port");
const K3_BIN = path.join(K3, "zig-out", "bin", "k3");
const TINY = path.join(K3, "tests", "fixtures", "tiny_k3");
const SELF_OUT = path.join(OUT, "k3-selfcheck.json");
const ART = path.join(OUT, "agent-capacity.json");

const PROMPT_IDS = "3,4,5,6,7";
const GEN = "8";
const NEEDED = 118_760;               // the prediction's required staff
const SWEEP = [4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096];
const PER_LANE_MS = 120_000;          // per-lane timeout
const PER_N_MS = 600_000;             // wall-clock cap per sweep point

/* one lane: async spawn, isolated cwd, k3_run.json verdict */
function lane(modelDir, tag) {
  const cwd = path.join(WORK, "runs", tag);
  fs.mkdirSync(cwd, { recursive: true });
  return new Promise((res) => {
    const t0 = process.hrtime.bigint();
    const child = spawn(K3_BIN, [modelDir, "--ids", PROMPT_IDS, "--gen", GEN, "--cache-gb", "1"],
      { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let timedOut = false;
    const to = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, PER_LANE_MS);
    child.on("error", (e) => { clearTimeout(to); res({ ok: false, error: String(e) }); });
    child.on("close", (code) => {
      clearTimeout(to);
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      const runFile = path.join(cwd, "k3_run.json");
      if (timedOut) return res({ ok: false, error: "timeout", ms });
      if (code !== 0 || !fs.existsSync(runFile))
        return res({ ok: false, error: `exit=${code}`, ms });
      try {
        const run = JSON.parse(fs.readFileSync(runFile, "utf8"));
        const buf = Buffer.alloc(run.generated_ids.length * 4);
        run.generated_ids.forEach((id, i) => buf.writeUInt32LE(id, i * 4));
        res({ ok: true, digest: crypto.createHash("sha256").update(buf).digest("hex"),
              rss: run.peak_rss_bytes, drops: run.expert_drops, wall: run.wall_seconds, ms });
      } catch (e) { res({ ok: false, error: `parse:${e}`, ms }); }
    });
  });
}

async function sweepN(n, ref) {
  const t0 = Date.now();
  const results = await Promise.all(Array.from({ length: n }, (_, i) => lane(TINY, `n${n}-lane${i}`)));
  const wallMs = Date.now() - t0;
  const ok = results.filter(r => r.ok);
  const digests = new Set(ok.map(r => r.digest));
  const drops = ok.reduce((a, r) => a + (r.drops || 0), 0);
  const rss = ok.reduce((a, r) => a + (r.rss || 0), 0);
  const fails = results.filter(r => !r.ok);
  return {
    n, ok: ok.length, failed: fails.length,
    fail_kinds: [...new Set(fails.map(f => (f.error || "exit").split(":")[0]))],
    distinct_digests: digests.size,
    digest_matches_ref: digests.size === 1 && [...digests][0] === ref,
    expert_drops: drops, rss_bytes_total: rss, wall_ms: wallMs,
    verified: fails.length === 0 && drops === 0 && digests.size === 1 && [...digests][0] === ref,
  };
}

async function run() {
  fs.rmSync(path.join(WORK, "runs"), { recursive: true, force: true });
  fs.mkdirSync(WORK, { recursive: true });

  /* Phase 0 — node inventory */
  const mem = os.totalmem(), free = os.freemem();
  const inventory = {
    host: os.hostname(), platform: `${os.type()} ${os.release()}`,
    cpus: os.cpus().length, mem_total_bytes: mem, mem_free_bytes: free,
    ulimit_u: Number(execFileSync("bash", ["-c", "ulimit -u"], { encoding: "utf8" }).trim()),
    declared_node_budget_bytes: 14_900_000_000,
    note: "7q: github-pages contributes ZERO cluster agents — static host; wasm lanes run on the visitor's hardware, not ours",
  };
  console.log(`agent-capacity sweep — ${inventory.host}: ${inventory.cpus} cores, ` +
    `${(mem / 1e9).toFixed(1)}GB total, ${(free / 1e9).toFixed(1)}GB free, ulimit-u=${inventory.ulimit_u}`);
  console.log(`prediction under test: staff >= ${NEEDED} concurrent agents\n`);

  /* reference digest */
  let ref;
  if (fs.existsSync(SELF_OUT)) ref = JSON.parse(fs.readFileSync(SELF_OUT, "utf8")).digest;
  else {
    const r = await lane(TINY, "reference");
    if (!r.ok) { console.error("reference decode failed"); process.exit(1); }
    ref = r.digest;
  }
  console.log(`reference digest: ${ref.slice(0, 16)}…\n`);

  /* Phase 1 — geometric sweep, stop at the failure boundary */
  const points = [];
  let maxVerified = 0;
  for (const n of SWEEP) {
    const t0 = Date.now();
    const p = await sweepN(n, ref);
    points.push(p);
    console.log(`  N=${String(n).padStart(4)}  ok=${p.ok}/${n}  drops=${p.expert_drops}  ` +
      `digests=${p.distinct_digests}  rss=${(p.rss_bytes_total / 1e9).toFixed(2)}GB  ` +
      `wall=${(p.wall_ms / 1000).toFixed(1)}s  ${p.verified ? "VERIFIED" : `FAIL(${p.fail_kinds.join(",")})`}`);
    if (p.verified) maxVerified = n;
    else break;                        // the boundary is the answer — stop there
    if (Date.now() - t0 > PER_N_MS) { console.log("  wall-clock cap — stopping"); break; }
  }

  const verdict = maxVerified >= NEEDED ? "UPGRADED-coherence-measured" : "REFUTED-by-measurement";
  const rec = {
    ts: new Date().toISOString(), tool: "agent-capacity-sweep",
    prediction: { needed_concurrent: NEEDED, registered: "convos/agent-capacity-test-plan.md" },
    inventory, fixture: "tiny_k3", prompt_ids: PROMPT_IDS, gen: Number(GEN),
    sweep: points, max_verified_N: maxVerified, verdict,
    doctrine_note: "dedicated-process lanes measured; shared-trunk carried-state is the"
      + " second doctrine — if k3 exposes no state save/restore interface, its branch"
      + " capacity is process-bound and this number stands for both",
  };
  fs.writeFileSync(ART, JSON.stringify(rec, null, 2));
  console.log(`\nmax_verified_N = ${maxVerified}  (needed ${NEEDED})  → ${verdict}`);
  console.log(`artifact → ${path.relative(ROOT, ART)}`);
}

function verify() {
  if (!fs.existsSync(ART)) { console.error("artifact absent — run the sweep"); process.exit(1); }
  const d = JSON.parse(fs.readFileSync(ART, "utf8"));
  const recomputed = d.sweep.filter(p => p.verified).reduce((a, p) => Math.max(a, p.n), 0);
  const ok = recomputed === d.max_verified_N && d.sweep.every(p => p.n > 0 && typeof p.verified === "boolean");
  if (!ok) { console.error("agent-capacity verify: DRIFT — artifact inconsistent"); process.exit(1); }
  console.log(`agent-capacity verify: GREEN — max_verified_N=${d.max_verified_N}, verdict=${d.verdict}`);
}

const mode = process.argv[2];
if (mode === "--verify") verify();
else if (mode === "--emit") {
  if (!fs.existsSync(ART)) { console.error("nothing to emit — run the sweep"); process.exit(1); }
  verify();
} else await run();
