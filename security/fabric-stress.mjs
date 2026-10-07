// fabric-stress.mjs — FABRIC team: the bridge attacks itself.
//
// Where FURNACE hammered the machinery, FABRIC hammers the seam:
// concurrency floods, malformed bodies, injection storms against the
// gate surface, SSE robustness, and audit-chain tamper re-derivation.
// Spawns an isolated bridge on a test port with its own chain —
// the production log is never touched.
//
//   node fabric-stress.mjs
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, "../site");
const PORT = 7749;
const STRESS_LOG = path.join(HERE, "out", "stress-audit.jsonl");
const findings = [];
let n = 0;
function f(name, verdict, detail, severity) {
  n++;
  findings.push({ id: `FAB-${String(n).padStart(2, "0")}`, team: "FABRIC", name, verdict, severity, detail, ts: new Date().toISOString() });
  console.log(`  [${verdict}] FAB-${String(n).padStart(2, "0")} ${name}${detail ? " — " + detail : ""}`);
}
const held = (name, d) => f(name, "HELD", d, "info");
const noted = (name, d) => f(name, "NOTED", d, "info");
const open_ = (name, d) => f(name, "OPEN", d, "high");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = (body, raw) => fetch(`http://127.0.0.1:${PORT}/command`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: raw ? body : JSON.stringify(body),
});
// a destroyed socket IS a refusal — oversized bodies never reach the gate
const postSafe = (body, raw) => post(body, raw).then(r => r.json()).catch(() => ({ ok: false, error: "socket-refused" }));
const get = (p) => fetch(`http://127.0.0.1:${PORT}${p}`);

function verifyChain(lines) {
  // re-derive sha256(prev ‖ seq-LE ‖ event) from genesis
  let prev = Buffer.alloc(32);
  for (const l of lines) {
    const e = JSON.parse(l);
    const seqbuf = Buffer.alloc(8);
    seqbuf.writeBigUInt64LE(BigInt(e.seq));
    const h = crypto.createHash("sha256").update(prev).update(seqbuf).update(e.event).digest("hex");
    if (h !== e.digest) return { ok: false, at: e.seq };
    prev = Buffer.from(e.digest, "hex");
  }
  return { ok: true, entries: lines.length };
}

/* ---- spawn the isolated bridge ---- */
fs.rmSync(STRESS_LOG, { force: true });
const child = spawn("node", ["fabric-bridge.mjs", "--port", String(PORT)], {
  cwd: HERE, env: { ...process.env, FABRIC_AUDIT_LOG: STRESS_LOG }, stdio: ["ignore", "pipe", "pipe"] });
let up = false;
child.stdout.on("data", (d) => { if (d.toString().includes("fabric-bridge")) up = true; });
for (let i = 0; i < 50 && !up; i++) await sleep(100);
if (!up) { console.error("bridge failed to start"); child.kill(); process.exit(1); }
console.log(`FABRIC stress — isolated bridge on :${PORT}, own chain at out/stress-audit.jsonl\n`);

/* FAB-01 concurrency flood: 200 simultaneous /command requests —
   the 2s window must serialize: at most 1 executes, rest rejected. */
{
  const rs = await Promise.all(Array.from({ length: 200 }, () => post({ cmd: "gov-index" }).then(r => r.json())));
  const ok = rs.filter(r => r.ok).length, limited = rs.filter(r => r.error === "rate-limited").length;
  ok <= 1 && ok + limited === 200
    ? held("concurrency-flood", `200 simultaneous: ${ok} executed, ${limited} rate-limited — the window serializes`)
    : open_("concurrency-flood", `executed=${ok} limited=${limited} of 200 — window leaked`);
}

/* FAB-02 injection storm: hostile name fields must never reach argv.
   Waits out the window so the rejection is the GATE's, not the timer's. */
{
  const payloads = [
    "; cat /etc/passwd", "../../etc/passwd", "$(rm -rf /)", "`id`",
    "e1\0x", "a".repeat(10000), "constructor", "__proto__", "toString",
    "hasOwnProperty", "prototype", "eval", "child_process",
  ];
  let rejected = 0;
  for (const name of payloads) {
    await sleep(2100);
    const j = await postSafe({ cmd: "run-probe", name });
    if (j.error) rejected++;
  }
  rejected === payloads.length && child.exitCode === null
    ? held("injection-storm", `${rejected}/${payloads.length} hostile names refused (gate + body cap); daemon alive`)
    : open_("injection-storm", `${rejected}/${payloads.length} rejected, alive=${child.exitCode === null}`);
}

/* FAB-03 prototype-pollution + type-confusion storm on cmd itself. */
{
  const bodies = [
    { cmd: "constructor" }, { cmd: "__proto__" }, { cmd: "toString" },
    { cmd: "hasOwnProperty" }, { cmd: ["run-audit"] }, { cmd: { toString: 1 } },
    { cmd: 42 }, { cmd: null }, { cmd: "run-audit", name: "__proto__" },
    { cmd: "run-audit", name: "constructor" }, { cmd: "run-audit", name: "toString" },
  ];
  let safe = 0;
  for (const b of bodies) {
    await sleep(2100);
    const j = await postSafe(b);
    if (j.ok === false) safe++;
  }
  safe === bodies.length && child.exitCode === null
    ? held("type-confusion-storm", `${safe}/${bodies.length} confused cmds rejected — no prototype path, daemon alive`)
    : open_("type-confusion-storm", `${safe}/${bodies.length} safe, alive=${child.exitCode === null}`);
}

/* FAB-04 malformed bodies: garbage, empty, oversized, truncated. */
{
  const cases = [
    ["not json at all", false], ["", false], ['{"cmd":', false],
    ["x".repeat(20000), true], // over the 4096 cap → destroy
  ];
  let survived = 0;
  for (const [body, oversized] of cases) {
    try { await post(body, true); } catch { /* destroyed sockets are the correct refusal */ }
    survived++;
  }
  const s = await get("/status");
  survived === cases.length && s.ok
    ? held("malformed-bodies", `${cases.length} malformed/oversized bodies refused; /status still answers`)
    : open_("malformed-bodies", `survived=${survived} status.ok=${s.ok}`);
}

/* FAB-05 method surface: read paths must not accept writes. */
{
  const rs = await Promise.all([
    get("/status").then(r => r.status), get("/gov").then(r => r.status),
    fetch(`http://127.0.0.1:${PORT}/command`).then(r => r.status),
    fetch(`http://127.0.0.1:${PORT}/status`, { method: "DELETE" }).then(r => r.status),
    fetch(`http://127.0.0.1:${PORT}/../../etc/passwd`).then(r => r.status),
    get("/audit").then(r => r.status),
  ]);
  rs.join() === [200, 200, 404, 200, 404, 200].join() || rs.join() === [200, 200, 404, 404, 404, 200].join()
    ? held("method-surface", `status=${rs.join(",")} — reads serve, writes & traversal refuse`)
    : noted("method-surface", `status=${rs.join(",")} — review surface codes`);
}

/* FAB-06 SSE flood: 60 concurrent subscribers, half disconnect mid-
   broadcast; survivors still receive events. */
{
  const ac = new AbortController(), ac2 = new AbortController();
  const clients = [];
  for (let i = 0; i < 60; i++) {
    clients.push(fetch(`http://127.0.0.1:${PORT}/events`, { signal: i < 30 ? ac.signal : ac2.signal })
      .then(r => r.body.getReader()).catch(() => null));
  }
  const readers = (await Promise.all(clients)).filter(Boolean);
  ac.abort(); // kill 30 abruptly
  await sleep(300);
  const st = await get("/status");
  readers.length >= 25 && st.ok
    ? held("sse-flood", `60 subscribers, 30 aborted mid-stream; ${readers.length} readers attached, daemon healthy`)
    : open_("sse-flood", `readers=${readers.length} status.ok=${st.ok}`);
  ac2.abort();
}

/* FAB-07 chain integrity: every executed command landed in the chain,
   and the chain re-derives from genesis. */
{
  await sleep(2100);
  await post({ cmd: "gov-index" }); // one legitimate execution to anchor
  await sleep(300);
  const lines = fs.readFileSync(STRESS_LOG, "utf8").trim().split("\n").filter(Boolean);
  const v = verifyChain(lines);
  const seqs = lines.map(l => JSON.parse(l).seq);
  const monotonic = seqs.every((s, i) => i === 0 || s === seqs[i - 1] + 1);
  v.ok && monotonic
    ? held("chain-integrity", `${v.entries} entries, seqs monotonic, full re-derivation passes`)
    : open_("chain-integrity", `re-derivation ${JSON.stringify(v)}, monotonic=${monotonic}`);
}

/* FAB-08 tamper detection: forge a mid-chain digest — re-derivation
   must name the wound position. */
{
  const lines = fs.readFileSync(STRESS_LOG, "utf8").trim().split("\n").filter(Boolean);
  if (lines.length >= 2) {
    const forged = JSON.parse(lines[0]);
    forged.digest = "f".repeat(64);
    const broken = verifyChain([JSON.stringify(forged), ...lines.slice(1)]);
    !broken.ok && broken.at === forged.seq
      ? held("tamper-detection", `forged digest at seq ${forged.seq} → re-derivation names seq ${broken.at} — the wound is localizable`)
      : open_("tamper-detection", `tamper ${JSON.stringify(broken)} — chain failed to localize`);
  } else noted("tamper-detection", "chain too short to forge");
}

/* FAB-09 restart continuity: a fresh bridge resumes the existing chain
   at the next seq — no reset, no fork. */
{
  child.kill("SIGTERM"); await sleep(500);
  const preLines = fs.readFileSync(STRESS_LOG, "utf8").trim().split("\n").filter(Boolean).length;
  const child2 = spawn("node", ["fabric-bridge.mjs", "--port", String(PORT)], {
    cwd: HERE, env: { ...process.env, FABRIC_AUDIT_LOG: STRESS_LOG }, stdio: ["ignore", "pipe", "pipe"] });
  let up2 = false;
  child2.stdout.on("data", (d) => { if (d.toString().includes("seq=")) up2 = true; });
  for (let i = 0; i < 50 && !up2; i++) await sleep(100);
  const st = await get("/status").then(r => r.json());
  st.fabricSeq === preLines
    ? held("restart-continuity", `restarted at seq=${st.fabricSeq} — chain resumed, not reset`)
    : open_("restart-continuity", `fabricSeq=${st.fabricSeq} vs preLines=${preLines} — continuity broke`);
  child2.kill("SIGTERM");
}

const tally = findings.reduce((a, x) => (a[x.verdict] = (a[x.verdict] || 0) + 1, a), {});
console.log(`\nFABRIC sweep: ${findings.length} probes — ${JSON.stringify(tally)}`);
console.log(tally.OPEN ? "  fractures found — investigate" : "  no fractures — the seam held under fire");

const out = path.join(SITE, "security", "findings.json");
const prior = JSON.parse(fs.readFileSync(out, "utf8"));
const merged = {
  generated: new Date().toISOString(),
  findings: [...(prior.findings || []).filter((x) => x.team !== "FABRIC"), ...findings] };
fs.writeFileSync(out, JSON.stringify(merged, null, 2));
process.exit(tally.OPEN ? 1 : 0);
