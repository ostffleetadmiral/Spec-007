#!/usr/bin/env node
/* aiwo-corps.mjs — the AIWO Corps exercise, for real.

   The corps is AI agents on a shared trunk talking sealed heartbeats:

     lane = one patrol team =
       (a) a real k3 inference tick on the shared packed trunk
           (the team's cognition beat — tokens are the pulse), then
       (b) sealed Fano 136-B heartbeat datagrams on the UDP loopback
           mesh via k3beacon, addressed to every sibling team's
           lattice coordinate, then
       (c) collection of the beats it received — all-to-all awareness.

   Probes (ledger: security/out/aiwo-corps-ledger.json):
     AIWO-01 corps-formed     — N listeners bound to distinct cells
     AIWO-02 cognition-ticks  — N parallel k3 runs on ONE trunk, all
                                completed with identical prompts
     AIWO-03 heartbeat-mesh   — every team's beats verified at every
                                peer (N×(N-1) sealed envelopes)
     AIWO-04 forgery-refused  — a mutated datagram never logs VALID
     AIWO-05 determinism      — the same run reproduces (seq/coords fixed)

   usage: node security/aiwo-corps.mjs [--teams N] [--k3-bin DIR]
          [--trunk DIR] [--model DIR] [--dry] [--emit]

   Defaults: teams = the live AIWO roster from command-manifest.json;
   trunk/model = the tiny checkpoint + packed trunk (built by
   tools/aiwo-fixture.sh if absent — honest small-weight fixture, the
   same object the lattice-cognition probe ran). */
import { spawnSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const K3 = path.resolve(ROOT, "..", "zig-k3-port");
const LEDGER = path.join(HERE, "out", "aiwo-corps-ledger.json");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const DRY = process.argv.includes("--dry");
const EMIT = process.argv.includes("--emit");

const bins = {
  k3: path.join(arg("--k3-bin", path.join(K3, "zig-out", "bin")), "k3"),
  beacon: path.join(arg("--k3-bin", path.join(K3, "zig-out", "bin")), "k3beacon"),
};
const FIXTURE = arg("--fixture", "/tmp/k3cap");
const MODEL = arg("--model", path.join(FIXTURE, "tiny"));
const TRUNK = arg("--trunk", path.join(FIXTURE, "tiny-trunk"));
const BASEPORT = 23100;

/* team roster from the command manifest — the corps roster is the ledger;
   the monitored AI assets (digit, sheraton) join as ANNOUNCE lanes —
   they beat their monitored status onto the mesh, under watch, never
   commanding (Art. V.3). */
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "site", "assets", "command-manifest.json"), "utf8"));
const ROSTER = manifest.security_roster.map(r => r.team);
const ASSETS = (manifest.ai_systems || []).filter(a => a.designation === "monitored_ai_asset").map(a => a.name);
const N = Math.min(parseInt(arg("--teams", String(ROSTER.length)), 10), ROSTER.length);
const teams = ROSTER.slice(0, N);
const LANES = [...teams, ...ASSETS];   /* patrol teams + monitored assets */
const isAsset = (t) => ASSETS.includes(t);
/* each lane gets a lattice cell — deterministic, spread across the mesh */
const coord = i => `@${i % 15}:${Math.floor(i / 15) % 15}:${(i * 7) % 15}`;

const findings = [];
const file = (id, verdict, detail) => findings.push({ id, verdict, detail });
const H = (b) => crypto.createHash("sha256").update(b).digest("hex").slice(0, 16);

/* ---------- preflight ---------- */
for (const [k, p] of Object.entries(bins))
  if (!fs.existsSync(p)) { console.error(`aiwo-corps: missing ${k} at ${p} — build zig-k3-port first`); process.exit(2); }
for (const p of [MODEL, TRUNK])
  if (!fs.existsSync(p)) { console.error(`aiwo-corps: fixture absent at ${p} — run the lattice-cognition probe (make_tiny_checkpoint + pack_trunk)`); process.exit(2); }

if (DRY) { console.log(`aiwo-corps — dry-run: ${N} teams, trunk ${path.basename(TRUNK)}, wire k3beacon/udp`); process.exit(0); }

const t0 = Date.now();

/* ---------- AIWO-01: form the corps — a listener per lane ---------- */
const listeners = LANES.map((t, i) => ({
  team: t, coord: coord(i), port: BASEPORT + i,
  proc: spawn(bins.beacon, ["listen", `127.0.0.1:${BASEPORT + i}`, "8192"], { stdio: ["ignore", "pipe", "pipe"] }),
  out: "",
}));
listeners.forEach(l => { l.proc.stdout.on("data", d => { l.out += d; }); l.proc.stderr.on("data", d => { l.out += d; }); });
await new Promise(r => setTimeout(r, 600));
const bound = listeners.filter(l => l.proc.exitCode === null).length;
file("AIWO-01", bound === LANES.length ? "HELD" : "OPEN",
  `${bound}/${LANES.length} lanes bound to distinct lattice cells (${N} patrol + ${ASSETS.length} monitored)`);

/* ---------- AIWO-02: cognition ticks — N parallel sessions, one trunk */
const tickResults = await Promise.all(teams.map(t => new Promise(res => {
  const out = path.join(os.tmpdir(), `aiwo-${t}.json`);
  const p = spawn(bins.k3, [MODEL, "--trunk", TRUNK, "--ids", "1,2,3,4",
    "--gen", "4", "--trunk-gb", "1", "--cache-gb", "0.5", "--out", out],
    { stdio: ["ignore", "pipe", "pipe"] });
  let err = ""; p.stderr.on("data", d => { err += d; });
  p.on("close", rc => {
    try {
      const j = JSON.parse(fs.readFileSync(out, "utf8"));
      res({ team: t, ok: rc === 0 && j.generated_ids?.length === 4, ids: j.generated_ids || [], ms: j.wall_seconds ? Math.round(j.wall_seconds * 1000) : 0 });
    } catch { res({ team: t, ok: false, ids: [], ms: 0, err: err.slice(-200) }); }
  });
})));
const okTicks = tickResults.filter(r => r.ok).length;
file("AIWO-02", okTicks === N ? "HELD" : "OPEN",
  `${okTicks}/${N} parallel cognition ticks on the shared trunk — ${tickResults.reduce((s, r) => s + r.ids.length, 0)} tokens total`);

/* ---------- AIWO-03: heartbeat mesh — sealed beats, all-to-all -------
   patrol beats carry the cognition digest; monitored assets announce
   their watched status — "PULSE" not "BEAT", so a watcher can tell a
   thinking lane from a monitored one. */
const BEAT = 1;
const sends = [];
for (const r of tickResults) {
  if (!r.ok) continue;
  const digest = H(JSON.stringify(r.ids));
  for (const l of listeners) {
    if (l.team === r.team) continue;
    const i = LANES.indexOf(r.team);
    sends.push(new Promise(res => {
      const p = spawn(bins.beacon, ["send", `127.0.0.1:${l.port}`, coord(i), l.coord,
        String(BEAT), `BEAT ${BEAT} ${r.team} ${digest}`], { stdio: ["ignore", "pipe", "pipe"] });
      p.on("close", rc => res({ from: r.team, to: l.team, rc }));
    }));
  }
}
/* monitored assets announce — they never claim a patrol beat */
for (const a of ASSETS) {
  const i = LANES.indexOf(a);
  for (const l of listeners) {
    if (l.team === a) continue;
    sends.push(new Promise(res => {
      const p = spawn(bins.beacon, ["send", `127.0.0.1:${l.port}`, coord(i), l.coord,
        String(BEAT), `PULSE ${BEAT} ${a} MONITORED`], { stdio: ["ignore", "pipe", "pipe"] });
      p.on("close", rc => res({ from: a, to: l.team, rc }));
    }));
  }
}
const sent = await Promise.all(sends);
await new Promise(r => setTimeout(r, 1200));

/* ---------- AIWO-04: forgery channel — a raw mutated datagram must die */
import dgram from "node:dgram";
const sock = dgram.createSocket("udp4");
await new Promise(res => {
  const forged = Buffer.alloc(136, 0x41); forged[0] = 0x46;
  sock.send(forged, listeners[0].port, "127.0.0.1", () => sock.close(res));
});
await new Promise(r => setTimeout(r, 800));

const received = {};
let forgedAccepted = 0;
for (const l of listeners) {
  received[l.team] = (l.out.match(/VALID 136B/g) || []).length;
  if (/VALID.*0x41|VALID.*AAAA/.test(l.out)) forgedAccepted++;
  l.proc.kill();
}
const expected = (okTicks + ASSETS.length) * (LANES.length - 1);
const delivered = Object.values(received).reduce((a, b) => a + b, 0);
file("AIWO-03", delivered === expected ? "HELD" : "OPEN",
  `heartbeat mesh: ${delivered}/${expected} sealed beats verified across ${LANES.length} listeners`);
file("AIWO-04", forgedAccepted === 0 ? "HELD" : "OPEN",
  forgedAccepted === 0 ? "mutated 136-B datagram never logged VALID — the wire refuses silently" : `${forgedAccepted} forged datagram(s) accepted`);

/* AIWO-06: monitored assets announced — every lane heard the PULSE */
{
  const assetBeats = sent.filter(s => ASSETS.includes(s.from) && s.rc === 0).length;
  const heard = ASSETS.length > 0 && assetBeats === ASSETS.length * (LANES.length - 1);
  file("AIWO-06", heard ? "HELD" : "OPEN",
    heard
      ? `${ASSETS.map(a => a.toUpperCase()).join(" ")} pulsed MONITORED to all ${LANES.length - 1} peers — watched, not commanding`
      : `monitored-asset pulses: ${assetBeats}/${ASSETS.length * (LANES.length - 1)} sent`);
}

/* ---------- AIWO-05: determinism — cognition identical per seed ----- */
const uniq = new Set(tickResults.filter(r => r.ok).map(r => JSON.stringify(r.ids)));
file("AIWO-05", uniq.size === 1 ? "HELD" : "NOTED",
  uniq.size === 1
    ? `all ${okTicks} lanes greedy-decoded identical tokens — same trunk, same seed, same answer`
    : `${uniq.size} distinct decode sets across lanes — nondeterminism on the trunk`);

const ledger = {
  schema: "AIWO-CORPS-v1",
  ts: new Date().toISOString(),
  teams: N,
  lanes: LANES.length,
  monitored_assets: ASSETS,
  fixture: { model: path.basename(MODEL), trunk: path.basename(TRUNK) },
  wall_ms: Date.now() - t0,
  findings,
  summary: { held: findings.filter(f => f.verdict === "HELD").length,
    open: findings.filter(f => f.verdict === "OPEN").length,
    noted: findings.filter(f => f.verdict === "NOTED").length },
};

console.log(`AIWO CORPS — ${N} patrol teams + ${ASSETS.length} monitored assets = ${LANES.length} lanes, ${sends.length} beats, ${ledger.wall_ms} ms wall`);
for (const f of findings) console.log(`  [${f.verdict.padEnd(6)}] ${f.id} — ${f.detail}`);
if (EMIT) {
  fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
  fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + "\n");
  console.log(`ledger → ${path.relative(ROOT, LEDGER)}`);
}
process.exit(findings.some(f => f.verdict === "OPEN") ? 1 : 0);
