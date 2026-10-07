// fabric-bridge.mjs — the evidence fabric: the only legal data path
// between the integer-pure core and any UI/agent consumer.
//
// Read path : file-backed, checksum-anchored — findings corpus, audit
//             reports, golden-vector digest. Tailed live over SSE.
// Write path: gated commands ONLY. Whitelisted argv, no shell, no raw
//             args, every invocation appended to a sha256 audit chain
//             (little-endian sequence — same convention as the zig
//             governance.AuditChain, now endian-safe by construction).
//
//   node fabric-bridge.mjs [--port 7741]
//
//   GET  /status          snapshot: digest, descent verdict, team tallies
//   GET  /events          SSE stream: findings + audits on file change
//   POST /command         {cmd:"run-probe"|"run-audit"|"run-seed-drop"|
//                          "gov-index"|"k3-selfcheck"|"k3-cap"|
//                          "emit-vectors"|"emit-lattice",
//                          name:"<whitelisted>"} → result
//   GET  /audit           the fabric's own invocation chain
//   GET  /seed-ledger     hash-only drop ledger (pairs, seed hashes, expiry)
//   GET  /gov             checksum-anchored governance corpus index
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SPEC = path.resolve(HERE, "..");
const THEUE = path.resolve(SPEC, "../TheUE");
const FINDINGS = path.join(SPEC, "site/security/findings.json");
const AUDIT_LOG = process.env.FABRIC_AUDIT_LOG || path.join(HERE, "out", "fabric-audit.jsonl");
const SEED_LEDGER = path.join(HERE, "out", "seed-drops.json");
const SEED_PLAN = path.join(HERE, "seed-pairs.json");
const GOV_INDEX = path.join(HERE, "out", "gov-index.json");
const K3_CHECK = path.join(HERE, "out", "k3-selfcheck.json");
const K3_CAP = path.join(HERE, "out", "k3cap.json");
const LATTICE = path.join(HERE, "out", "ivector-lattice.json");
const PORT = (() => { const i = process.argv.indexOf("--port"); return i > 0 ? +process.argv[i + 1] : 7741; })();

// ---- the gate: name → fixed argv. No free-form commands, ever. ----
const GATES = {
  "emit-vectors": { bin: "zig", cwd: THEUE, argv: ["build", "golden-vectors"] },
  "run-seed-drop": { bin: "node", cwd: HERE, argv: ["seed-drop.mjs"] },
  "gov-index": { bin: "node", cwd: HERE, argv: ["gov-index.mjs"] },
  "k3-selfcheck": { bin: "node", cwd: HERE, argv: ["k3-probe.mjs"] },
  "k3-cap": { bin: "node", cwd: HERE, argv: ["k3-probe.mjs", "--cap"] },
  "emit-lattice": { bin: "node", cwd: HERE, argv: ["lattice-probe.mjs"] },
  "run-audit": {
    descent:    { bin: "python3", cwd: THEUE, argv: ["tools/descent_audit.py"] },
    continuity: { bin: "python3", cwd: THEUE, argv: ["tools/continuity_audit.py", "--output", "context/continuity-audit.json"] },
    "twenty-re": { bin: "python3", cwd: THEUE, argv: ["tools/twenty_re_audit.py", "--output", "context/twenty-re-audit.json"] },
    "cross-target": { bin: "sh", cwd: THEUE, argv: ["tools/cross_target_check.sh"] },
    "seed-coverage": { bin: "node", cwd: HERE, argv: ["seed-drop.mjs", "--audit"] },
  },
  "run-probe": {
    "emergence-watch": { bin: "node", cwd: HERE, argv: ["emergence-watch.mjs", "--local"] },
    "chaos-hammer":    { bin: "node", cwd: HERE, argv: ["chaos-hammer.mjs", "--local"] },
    "fabric-stress":   { bin: "node", cwd: HERE, argv: ["fabric-stress.mjs"] },
  },
};

// ---- fabric audit chain: sha256(prev ‖ seq-LE ‖ event) ----
let seq = 0, prev = Buffer.alloc(32);
try {
  const lines = fs.readFileSync(AUDIT_LOG, "utf8").trim().split("\n").filter(Boolean);
  for (const l of lines) { const e = JSON.parse(l); seq = e.seq + 1; prev = Buffer.from(e.digest, "hex"); }
} catch { /* fresh chain */ }

function chainAppend(event) {
  const seqbuf = Buffer.alloc(8);
  seqbuf.writeBigUInt64LE(BigInt(seq));
  const h = crypto.createHash("sha256");
  h.update(prev); h.update(seqbuf); h.update(event);
  const digest = h.digest();
  const entry = { seq, digest: digest.toString("hex"), ts: new Date().toISOString(), event };
  fs.mkdirSync(path.dirname(AUDIT_LOG), { recursive: true });
  fs.appendFileSync(AUDIT_LOG, JSON.stringify(entry) + "\n");
  seq++; prev = digest;
  return entry;
}

function readJSON(p) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } }

function snapshot() {
  const findings = (readJSON(FINDINGS)?.findings) ?? [];
  const descent = readJSON(path.join(THEUE, "context/descent-audit.json"));
  const vectors = (() => { try { const t = fs.readFileSync(path.join(THEUE, "context/golden-vectors.txt"), "utf8"); return t.match(/digest\|sha256\|([0-9a-f]+)/)?.[1] ?? null; } catch { return null; } })();
  const teams = {}, verdicts = {};
  let open = 0;
  for (const f of findings) {
    teams[f.team] = (teams[f.team] ?? 0) + 1;
    verdicts[f.verdict] = (verdicts[f.verdict] ?? 0) + 1;
    if (f.verdict === "OPEN") open++;
  }
  // seed coverage: declared pairs vs unexpired drops in the hash-only ledger
  const plan = readJSON(SEED_PLAN);
  const seedLedger = readJSON(SEED_LEDGER);
  let seeds = null;
  if (plan?.pairs?.length) {
    const now = Math.floor(Date.now() / 1000);
    const covered = plan.pairs.filter(([a, b]) =>
      seedLedger?.drops?.some((d) => [d.pair[0], d.pair[1]].sort().join() === [a, b].sort().join() && d.expiry > now)).length;
    seeds = { pairs: plan.pairs.length, covered, drops: seedLedger?.drops?.length ?? 0 };
  }
  const govIdx = readJSON(GOV_INDEX);
  const gov = govIdx ? { docs: govIdx.totals.docs, sections: govIdx.totals.sections, bytes: govIdx.totals.bytes, generated: govIdx.generated } : null;
  const lat = readJSON(LATTICE);
  const lattice = lat ? { edge: lat.edge, cells: lat.cells.length, census: lat.census, digest: lat.digest } : null;
  const chk = readJSON(K3_CHECK), cap = readJSON(K3_CAP);
  const k3 = chk ? {
    digest: chk.digest, layers: chk.layers_completed, ts: chk.ts,
    cores: cap?.cpu?.cores ?? null, ramGiB: cap ? +(cap.memory.ram_bytes / 2 ** 30).toFixed(0) : null,
  } : null;
  return {
    ts: new Date().toISOString(),
    findings: findings.length, teams, verdicts, openFractures: open,
    descent: descent ? { verdict: descent.verdict, modules: descent.modules, cycles: descent.cycles?.length ?? 0 } : null,
    vectorDigest: vectors,
    seeds, gov, k3, lattice,
    fabricSeq: seq,
  };
}

// ---- SSE hub ----
const clients = new Set();
function broadcast(ev, data) {
  const msg = `event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) { try { res.write(msg); } catch { clients.delete(res); } }
}

const WATCHED = [
  [FINDINGS, "findings"],
  [path.join(THEUE, "context/descent-audit.json"), "descent"],
  [path.join(THEUE, "context/continuity-audit.json"), "continuity"],
  [path.join(THEUE, "context/twenty-re-audit.json"), "twenty-re"],
  [path.join(THEUE, "context/golden-vectors.txt"), "vectors"],
  [GOV_INDEX, "gov"],
  [K3_CHECK, "k3"],
  [LATTICE, "lattice"],
];
for (const [file, ev] of WATCHED) {
  try {
    fs.watch(path.dirname(file), (event, name) => {
      if (name === path.basename(file)) broadcast(ev, snapshot());
    });
  } catch { /* dir may not exist yet — snapshot still serves */ }
}

// ---- gated command runner ----
const RATE_MS = 2000;
let lastRun = 0;
function runGated(cmd, name) {
  return new Promise((resolve) => {
    const now = Date.now();
    if (now - lastRun < RATE_MS) return resolve({ ok: false, error: "rate-limited", retryMs: RATE_MS - (now - lastRun) });
    // strict string typing + own-keys only — ["run-audit"] coerces to
    // "run-audit" under property lookup but must never pass; likewise
    // "constructor"/"__proto__"/"toString" aren't gates (FAB-03 kill
    // shot: non-string cmd crashed execFile on spec.bin === undefined)
    if (typeof cmd !== "string") return resolve({ ok: false, error: "unknown command", allowed: Object.keys(GATES) });
    const gate = Object.hasOwn(GATES, cmd) ? GATES[cmd] : null;
    if (!gate || typeof gate !== "object") return resolve({ ok: false, error: "unknown command", allowed: Object.keys(GATES) });
    let spec = gate;
    if (cmd === "run-audit" || cmd === "run-probe") {
      spec = typeof name === "string" && Object.hasOwn(gate, name) ? gate[name] : null;
      if (!spec) return resolve({ ok: false, error: "name not whitelisted", allowed: Object.keys(gate) });
    }
    if (typeof spec.bin !== "string" || !Array.isArray(spec.argv))
      return resolve({ ok: false, error: "malformed gate spec" });
    lastRun = now;
    execFile(spec.bin, spec.argv, { cwd: spec.cwd, timeout: 120_000, maxBuffer: 4 << 20 }, (err, stdout, stderr) => {
      const entry = chainAppend(JSON.stringify({ cmd, name, ok: !err }));
      resolve({
        ok: !err, cmd, name, seq: entry.seq, chainDigest: entry.digest,
        stdout: stdout.slice(-4000), stderr: stderr.slice(-2000),
        error: err ? (err.killed ? "timeout" : err.code ?? "failed") : null,
      });
      broadcast("command", { cmd, name, ok: !err, seq: entry.seq });
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");

  if (url.pathname === "/events") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    res.write(`event: hello\ndata: ${JSON.stringify(snapshot())}\n\n`);
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }
  if (url.pathname === "/status") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(snapshot()));
    return;
  }
  if (url.pathname === "/audit") {
    res.writeHead(200, { "content-type": "application/x-ndjson" });
    try { res.end(fs.readFileSync(AUDIT_LOG, "utf8")); } catch { res.end(""); }
    return;
  }
  if (url.pathname === "/seed-ledger") {
    res.writeHead(200, { "content-type": "application/json" });
    try { res.end(fs.readFileSync(SEED_LEDGER, "utf8")); } catch { res.end("null"); }
    return;
  }
  if (url.pathname === "/gov") {
    res.writeHead(200, { "content-type": "application/json" });
    try { res.end(fs.readFileSync(GOV_INDEX, "utf8")); } catch { res.end("null"); }
    return;
  }
  if (url.pathname === "/lattice") {
    res.writeHead(200, { "content-type": "application/json" });
    try { res.end(fs.readFileSync(LATTICE, "utf8")); } catch { res.end("null"); }
    return;
  }
  if (url.pathname === "/command" && req.method === "POST") {
    let body = "";
    req.on("data", c => { body += c; if (body.length > 4096) req.destroy(); });
    req.on("end", async () => {
      let req_; try { req_ = JSON.parse(body); } catch { req_ = {}; }
      const result = await runGated(req_.cmd, req_.name);
      res.writeHead(result.ok ? 200 : 400, { "content-type": "application/json" });
      res.end(JSON.stringify(result));
    });
    return;
  }
  res.writeHead(404); res.end("no such surface\n");
});

server.listen(PORT, "127.0.0.1", () => {
  const s = snapshot();
  console.log(`fabric-bridge :127.0.0.1:${PORT} — findings=${s.findings} open=${s.openFractures} descent=${s.descent?.verdict} seq=${s.fabricSeq}`);
});
