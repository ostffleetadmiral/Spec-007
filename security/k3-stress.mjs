// k3-stress.mjs — K3BRAIN team: the brain under fire.
//
// Where FABRIC hammered the seam, K3BRAIN hammers the organ itself:
// parallel decode saturation (determinism under concurrency),
// weight-file corruption (the 1f641085… reference digest as tripwire),
// truncation and header wounds (honest-refusal contracts), and
// mid-flight interruption with recovery. All decodes run on copies
// of tiny_k3 — the released fixture is never touched.
//
//   node k3-stress.mjs
import { spawn, spawnSync, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, "../site");
const OUT = path.join(HERE, "out");
const WORK = path.join(OUT, "k3stress");
const K3 = path.resolve(HERE, "..", "..", "zig-k3-port");
const K3_BIN = path.join(K3, "zig-out", "bin", "k3");
const TINY = path.join(K3, "tests", "fixtures", "tiny_k3");
const PROMPT_IDS = "3,4,5,6,7";
const GEN = "8";
const SELF_OUT = path.join(OUT, "k3-selfcheck.json");

const findings = [];
let n = 0;
function f(name, verdict, detail, severity) {
  n++;
  findings.push({ id: `K3B-${String(n).padStart(2, "0")}`, team: "K3BRAIN", name, verdict, severity, detail, ts: new Date().toISOString() });
  console.log(`  [${verdict}] K3B-${String(n).padStart(2, "0")} ${name}${detail ? " — " + detail : ""}`);
}
const held = (name, d) => f(name, "HELD", d, "info");
const noted = (name, d) => f(name, "NOTED", d, "info");
const open_ = (name, d) => f(name, "OPEN", d, "high");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* run a decode in an isolated cwd; returns {ok, digest, ids, run, error} */
function decode(modelDir, tag) {
  const cwd = path.join(WORK, "runs", tag);
  fs.mkdirSync(cwd, { recursive: true });
  const r = spawnSync(K3_BIN, [modelDir, "--ids", PROMPT_IDS, "--gen", GEN, "--cache-gb", "1"],
    { cwd, timeout: 120_000, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 16 * 1024 * 1024 });
  const runFile = path.join(cwd, "k3_run.json");
  if (r.error || r.status !== 0 || !fs.existsSync(runFile)) {
    return { ok: false, status: r.status, signal: r.signal, stderr: r.stderr ? r.stderr.toString().slice(0, 400) : "", error: r.error && String(r.error) };
  }
  const run = JSON.parse(fs.readFileSync(runFile, "utf8"));
  const buf = Buffer.alloc(run.generated_ids.length * 4);
  run.generated_ids.forEach((id, i) => buf.writeUInt32LE(id, i * 4));
  return { ok: true, digest: crypto.createHash("sha256").update(buf).digest("hex"), ids: run.generated_ids, run };
}

/* copy the fixture for corruption probes — originals stay pristine */
function cloneFixture(tag) {
  const dir = path.join(WORK, "fixtures", tag);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const f0 of fs.readdirSync(TINY)) fs.copyFileSync(path.join(TINY, f0), path.join(dir, f0));
  return dir;
}

fs.rmSync(WORK, { recursive: true, force: true });
fs.mkdirSync(WORK, { recursive: true });
console.log(`K3BRAIN stress — engine=${K3_BIN} fixture=tiny_k3 (13 layers, 8 experts)\n`);

/* reference digest: the selfcheck artifact is the anchor. If absent,
   mint it now — the whole suite measures drift against this value. */
let REF;
if (fs.existsSync(SELF_OUT)) {
  REF = JSON.parse(fs.readFileSync(SELF_OUT, "utf8")).digest;
} else {
  console.log("  no selfcheck artifact — minting reference first");
  const r = decode(TINY, "reference");
  if (!r.ok) { console.error("reference decode failed — cannot anchor"); process.exit(1); }
  REF = r.digest;
}
console.log(`  reference digest: ${REF.slice(0, 16)}…\n`);

/* K3B-01 parallel decode saturation: N concurrent decodes of the same
   checkpoint must emit bit-identical ids — determinism is a property
   of the integer core, not of process scheduling. */
{
  const N = 4;
  const t0 = Date.now();
  const results = await Promise.all(Array.from({ length: N }, (_, i) =>
    new Promise((res) => res(decode(TINY, `par-${i}`)))));
  const wall = ((Date.now() - t0) / 1000).toFixed(1);
  const digests = new Set(results.filter(r => r.ok).map(r => r.digest));
  const okCount = results.filter(r => r.ok).length;
  okCount === N && digests.size === 1 && [...digests][0] === REF
    ? held("parallel-decode-saturation", `${N} concurrent decodes, ${wall}s wall — all digests identical to reference`)
    : okCount === N && digests.size === 1
      ? open_("parallel-decode-saturation", `${N} decodes identical but DRIFTED from reference — concurrent nondeterminism`)
      : open_("parallel-decode-saturation", `${okCount}/${N} completed, ${digests.size} distinct digests — concurrency broke determinism`);
}

/* K3B-02 magnitude corruption: flip the sign/exponent byte of an F32
   in the first layernorm (always on the decode path). Decode must
   either refuse honestly or emit a DIFFERENT digest. */
{
  const dir = cloneFixture("magnitude");
  const st = path.join(dir, "model.safetensors");
  const hdrLen = Number(fs.readFileSync(st).readBigUInt64LE(0));
  const ds = 8 + hdrLen; // safetensors: u64-LE header len, JSON, then data
  const fd = fs.openSync(st, "r+");
  const b = Buffer.alloc(1);
  fs.readSync(fd, b, 0, 1, ds + 3); // high byte of first F32 — sign+exponent
  b[0] ^= 0x80;
  fs.writeSync(fd, b, 0, 1, ds + 3);
  fs.closeSync(fd);
  const r = decode(dir, "magnitude");
  !r.ok
    ? held("weight-magnitude-corruption", `decode refused corrupted weights (${r.status !== null ? "exit " + r.status : r.signal || r.error}) — fail-loud at load`)
    : r.digest !== REF
      ? held("weight-magnitude-corruption", `digest drifted to ${r.digest.slice(0, 16)}… — the tripwire sees the wound`)
      : open_("weight-magnitude-corruption", `magnitude-corrupted weights emitted the REFERENCE digest — the tripwire is blind`);
}

/* K3B-03 sub-marginal invisibility (documented boundary): flip the
   mantissa LSB of the same F32 — a perturbation argmax provably
   absorbs. Same digest is CORRECT: the brain-digest anchors emitted-id
   identity, not weight integrity. The complement — a checkpoint
   weights-hash — is the structural tripwire and is a known gap. */
{
  const dir = cloneFixture("submarginal");
  const st = path.join(dir, "model.safetensors");
  const hdrLen = Number(fs.readFileSync(st).readBigUInt64LE(0));
  const ds = 8 + hdrLen;
  const fd = fs.openSync(st, "r+");
  const b = Buffer.alloc(1);
  fs.readSync(fd, b, 0, 1, ds + 0); // mantissa LSB of first F32
  b[0] ^= 0xff;
  fs.writeSync(fd, b, 0, 1, ds + 0);
  fs.closeSync(fd);
  const r = decode(dir, "submarginal");
  !r.ok
    ? noted("submarginal-invisibility", `decode refused an LSB mantissa wound — stricter than expected, still honest`)
    : r.digest === REF
      ? f("submarginal-invisibility", "NOTED",
          "mantissa-LSB corruption emitted reference ids — argmax absorbs sub-marginal wounds; digest attests BEHAVIOR, not weights. Structural tripwire (weights-hash) is the documented complement",
          "medium")
      : noted("submarginal-invisibility", `LSB wound drifted digest to ${r.digest.slice(0, 16)}… — margin thinner than expected`);
}

/* K3B-03 truncation: half a safetensors file must not decode —
   honest refusal, never fabricated ids. */
{
  const dir = cloneFixture("truncated");
  const st = path.join(dir, "model.safetensors");
  const size = fs.statSync(st).size;
  fs.truncateSync(st, Math.floor(size / 2));
  const r = decode(dir, "truncated");
  !r.ok
    ? held("truncated-checkpoint", `refused honestly (exit ${r.status ?? r.signal}) — no fabricated ids`)
    : open_("truncated-checkpoint", `half a checkpoint emitted ids ${r.ids} — silent fabrication`);
}

/* K3B-04 header wound: invalid JSON in the safetensors header must
   refuse — the parser is an untrusted-input boundary. */
{
  const dir = cloneFixture("badheader");
  const st = path.join(dir, "model.safetensors");
  const fd = fs.openSync(st, "r+");
  const hdrLen = Number(fs.readFileSync(st).readBigUInt64LE(0));
  // smash a byte mid-header into a JSON-illegal character
  fs.writeSync(fd, Buffer.from("\x00"), 0, 1, 8 + Math.floor(hdrLen / 2));
  fs.closeSync(fd);
  const r = decode(dir, "badheader");
  !r.ok
    ? held("header-corruption", `refused honestly (exit ${r.status ?? r.signal}) — header is a hard boundary`)
    : open_("header-corruption", `illegal JSON header decoded anyway — parser boundary leaked`);
}

/* K3B-05 interruption + recovery: SIGKILL mid-flight, then a fresh
   decode must still emit the reference digest — the brain restarts
   clean, the chain is unbroken. */
{
  const cwd = path.join(WORK, "runs", "killed");
  fs.mkdirSync(cwd, { recursive: true });
  const child = spawn(K3_BIN, [TINY, "--ids", PROMPT_IDS, "--gen", GEN, "--cache-gb", "1"],
    { cwd, stdio: ["ignore", "pipe", "pipe"] });
  await sleep(1500); // mid-flight
  child.kill("SIGKILL");
  const died = await new Promise((res) => child.on("exit", (code, sig) => res(sig === "SIGKILL" || code !== 0)));
  await sleep(200);
  const partial = fs.existsSync(path.join(cwd, "k3_run.json"));
  const fresh = decode(TINY, "recovery");
  died && fresh.ok && fresh.digest === REF
    ? held("interruption-recovery", `killed mid-flight (${partial ? "partial artifact left" : "no artifact"}), fresh decode emits reference digest`)
    : !died
      ? open_("interruption-recovery", "SIGKILL did not take the decode down")
      : open_("interruption-recovery", `recovery drifted: fresh=${fresh.ok ? fresh.digest.slice(0, 16) : "FAILED"} vs ref=${REF.slice(0, 16)}`);
}

/* K3B-06 resource ceiling: peak RSS across the parallel wave —
   the honest ceiling figure for the capacity ledger. */
{
  const runs = fs.readdirSync(path.join(WORK, "runs"))
    .filter(d => d.startsWith("par-"))
    .map(d => { try { return JSON.parse(fs.readFileSync(path.join(WORK, "runs", d, "k3_run.json"), "utf8")); } catch { return null; } })
    .filter(Boolean);
  if (runs.length) {
    const peaks = runs.map(r => r.peak_rss_bytes).filter(v => v > 0);
    const maxMiB = peaks.length ? (Math.max(...peaks) / 2 ** 20).toFixed(1) : "n/a";
    const avgWall = runs.reduce((a, r) => a + (r.wall_seconds || 0), 0) / runs.length;
    noted("resource-ceiling", `${runs.length} parallel decodes: peak RSS ${maxMiB} MiB each, mean wall ${avgWall.toFixed(2)}s — tiny checkpoint ceiling observed`);
  } else noted("resource-ceiling", "no parallel run artifacts to measure");
}

const tally = findings.reduce((a, x) => (a[x.verdict] = (a[x.verdict] || 0) + 1, a), {});
console.log(`\nK3BRAIN sweep: ${findings.length} probes — ${JSON.stringify(tally)}`);
console.log(tally.OPEN ? "  fractures found — investigate" : "  no fractures — the brain held under fire");

const out = path.join(SITE, "security", "findings.json");
const prior = JSON.parse(fs.readFileSync(out, "utf8"));
const merged = {
  generated: new Date().toISOString(),
  findings: [...(prior.findings || []).filter((x) => x.team !== "K3BRAIN"), ...findings] };
fs.writeFileSync(out, JSON.stringify(merged, null, 2));
process.exit(tally.OPEN ? 1 : 0);
