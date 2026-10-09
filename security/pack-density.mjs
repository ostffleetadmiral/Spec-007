// pack-density.mjs — PACK team probes over the live Hydra WAN lab.
// The IPv4-in-IPv6 packing question, made measurable: N fixed-size inner
// envelopes inside ONE trunk body vs N separate sends. Measures the real
// ceiling, the all-or-nothing drop signature, per-stream overhead in
// delivered frames (rx-delta, metered not modeled), and resend cost.
//
//   node pack-density.mjs --probe    lab already up (env: HYDRA_TOKEN, WAN_TOKEN)
//   node pack-density.mjs --docker   drive docker-compose.wan.yml
//   add --keep to leave the lab running.
//
// Findings append to site/security/findings.json alongside the fleet ledger.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { sleep } from "./harness.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, "../site");
const FINDINGS = path.resolve(SITE, "security/findings.json");
const DOCKER = process.argv.includes("--docker");
const KEEP = process.argv.includes("--keep");

const findings = [];
let cn = 0;
function f(name, verdict, detail, severity) {
  cn++;
  const row = { id: `PACK-${String(cn).padStart(2, "0")}`, team: "PACK", name, verdict, severity, detail, ts: new Date().toISOString() };
  findings.push(row);
  console.log(`  [${verdict}] PACK-${String(cn).padStart(2, "0")} ${name}${detail ? " — " + detail : ""}`);
}
const ok = (n, d) => f(n, "HARDENED", d, "info");
const open_ = (n, d) => f(n, "OPEN", d, "medium");
const noted = (n, d) => f(n, "NOTED", d, "info");

const HYDRA_TOKEN = process.env.HYDRA_TOKEN || crypto.randomBytes(16).toString("hex");
const WAN_TOKEN = process.env.WAN_TOKEN || crypto.randomBytes(16).toString("hex");
const PORTS = { e1: 19301, e2: 19302, w1: 19401, w2: 19402, bridge: 19500 };
const WAN = { east: 19100, west: 19101 };
const Z = "00".repeat(32);

async function ctl(node, p, body) {
  const r = await fetch(`http://localhost:${PORTS[node]}${p}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", "x-hydra-token": HYDRA_TOKEN },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
}
async function wctl(side, p, body) {
  const r = await fetch(`http://localhost:${WAN[side]}${p}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", "x-wan-token": WAN_TOKEN },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
}
const compose = (...args) =>
  execFileSync("docker", ["compose", "-f", path.join(HERE, "docker-compose.wan.yml"), ...args],
    { env: { ...process.env, HYDRA_TOKEN, WAN_TOKEN }, stdio: "inherit" });

const UNIT = 64; // inner envelope size — echoes the frozen 64B FANO_CAP payload canon
function packed(run, n) {
  // N inner "IPv4" units, each a fixed 64-byte framed record:
  //   PK | run(4 hex) | idx(8 hex) | crc-tag(8 hex) | pad → 64 bytes, ASCII-safe
  const parts = [];
  for (let i = 0; i < n; i++) {
    const tag = crypto.createHash("sha256").update(`${run}/${i}`).digest("hex").slice(0, 8);
    const rec = `PK${run}${String(i).padStart(8, "0")}${tag}`;
    parts.push(rec + "0".repeat(UNIT - rec.length));
  }
  return Buffer.from(parts.join("")).toString("base64");
}
async function deliveredUnits(node, run, n) {
  const ib = await ctl(node, "/inbox");
  if (ib.inbox_overflow) return { overflow: true, count: -1, copies: 0 };
  const marker = `PK${run}`;
  const seen = new Set();
  let copies = 0;
  for (const m of ib.inbox) {
    const txt = Buffer.from(m.body_b64, "base64").toString();
    if (!txt.includes(marker)) continue;
    copies++;
    for (let i = 0; i < n; i++) {
      const tag = crypto.createHash("sha256").update(`${run}/${i}`).digest("hex").slice(0, 8);
      if (txt.includes(`PK${run}${String(i).padStart(8, "0")}${tag}`)) seen.add(i);
    }
  }
  return { overflow: false, count: seen.size, copies };
}
async function rxOf(node) {
  const c = await ctl(node, "/counters");
  return c.received ?? -1;
}
async function sendUntilPacked(from, toPeer, toNode, run, n, attempts, pollMs) {
  const body = packed(run, n);
  for (let i = 0; i < attempts; i++) {
    await ctl(from, "/send", { to: toPeer, body_b64: body });
    await sleep(pollMs);
    const d = await deliveredUnits(toNode, run, n);
    if (d.count === n) return { delivered: true, sends: i + 1 };
  }
  const d = await deliveredUnits(toNode, run, n);
  return { delivered: false, sends: attempts, partial: d.count };
}

async function prime(from, toPeer, toNode, text) {
  for (let i = 0; i < 24; i++) {
    await ctl(from, "/presence/send", { to: toPeer, status: 1, text });
    await sleep(1500);
    const pres = await ctl(toNode, "/presence");
    if (pres.presence.some((p) => p.peer === ids[from])) return true;
  }
  return false;
}
async function warmGate(from, toPeer, url) {
  const peers = (await ctl(from, "/peers")).peers;
  if (peers.some((p) => p.id === toPeer)) return { warm: true, healed: false };
  await ctl(from, "/dial", { url, remote: Z });
  await sleep(3000);
  for (const c of [1, 2, 3]) await ctl(from, "/discover", { conn: c }).catch(() => {});
  for (let i = 0; i < 8; i++) {
    await ctl(toNodeOf(toPeer), "/presence/send", { to: (await ctl(from, "/id")).peer_id, status: 1, text: "reannounce" });
    await sleep(1200);
    if ((await ctl(from, "/peers")).peers.some((p) => p.id === toPeer)) return { warm: true, healed: true };
  }
  return { warm: false, healed: false };
}
function toNodeOf(peer) {
  for (const n of Object.keys(ids)) if (ids[n] === peer) return n;
  return "w1";
}

if (DOCKER) {
  console.log("[wan-lab] compose up…");
  compose("up", "-d", "--wait");
  console.log("[wan-lab] nodes up — wiring");
  for (const [n, url] of [["e1", "ws://relay-east:8080/ws"], ["e2", "ws://relay-east:8080/ws"],
                          ["w1", "ws://relay-west:8080/ws"], ["w2", "ws://relay-west:8080/ws"],
                          ["bridge", "ws://wan-east:9100/ws"], ["bridge", "ws://wan-west:9100/ws"]])
    await ctl(n, "/dial", { url, remote: Z });
  await sleep(2500);
  for (const n of ["e1", "e2", "w1", "w2"]) await ctl(n, "/discover", { conn: 1 });
  await ctl("bridge", "/discover", { conn: 1 });
  await ctl("bridge", "/discover", { conn: 2 });
  await sleep(6000);
  await wctl("west", "/impair", { delay: 120, jitter: 60, drop: 0, reorder: 0 });
}

const ids = {};
for (const n of ["e1", "w1"]) ids[n] = (await ctl(n, "/id")).peer_id;
console.log(`  [routes] priming e1↔w1…`);
const primedEW = await prime("e1", ids.w1, "w1", "e1");
const primedWE = await prime("w1", ids.e1, "e1", "w1");
console.log(`  [routes] e1→w1 ${primedEW ? "carried" : "UNPRIMED"} · w1→e1 ${primedWE ? "carried" : "UNPRIMED"}`);

/* PACK-01: trunk ceiling ladder — N inner units per body, N doubling.
   The "as many as fit" question answered on the wire: the ceiling is
   wherever delivery stops, observed per-unit (all N tags must be present
   in ONE delivered body — partial counts would mean inner framing
   corruption, a finding in itself). */
{
  const ladder = [8, 32, 128, 512, 2048, 4096]; // units ×64B = 512B … 256KB bodies
  const rows = [];
  let ceiling = null;
  for (const n of ladder) {
    const g = await warmGate("e1", ids.w1, "ws://relay-east:8080/ws");
    if (!g.warm) { rows.push(`${n}u:cold`); continue; }
    const run = `L${n}x${Date.now().toString(36)}`;
    const r = await sendUntilPacked("e1", ids.w1, "w1", run, n, 3, 1200);
    if (r.delivered) rows.push(`${n}u:${r.sends}s`);
    else {
      rows.push(`${n}u:x${r.partial != null ? `(partial=${r.partial})` : ""}`);
      ceiling = ceiling ?? n;
    }
  }
  const maxOk = ladder.filter((n, i) => rows[i] && !rows[i].endsWith("x") && !rows[i].endsWith("cold")).pop();
  ceiling === null
    ? ok("trunk-ceiling", `every rung delivered intact — ${rows.join(" ")} — ceiling beyond 256 KB body (relay WS cap is 4 MiB)`)
    : maxOk
      ? noted("trunk-ceiling", `${rows.join(" ")} — delivered through ${maxOk} units (${maxOk * UNIT}B body), failed at ${ceiling}u`)
      : open_("trunk-ceiling", `${rows.join(" ")} — no packed trunk delivered`);
}

/* PACK-02: blast radius — the all-or-nothing signature. At 15% drop on
   the west edge, fire 6 packed trunks of 32 units each. Per-trunk inner
   unit counts must be bimodal (0 or 32): a dropped outer frame kills
   every inner stream at once. Then fire 192 separate units to show the
   independent-loss contrast. */
{
  await wctl("west", "/impair", { delay: 120, jitter: 60, drop: 15, reorder: 0 });
  await sleep(400);
  const g = await warmGate("e1", ids.w1, "ws://relay-east:8080/ws");
  if (!g.warm) {
    noted("blast-radius", "carrier cold — cannot measure");
  } else {
    const N = 32, TRUNKS = 6;
    const trunkCounts = [];
    for (let t = 0; t < TRUNKS; t++) {
      const run = `B${t}x${Date.now().toString(36)}`;
      await ctl("e1", "/send", { to: ids.w1, body_b64: packed(run, N) });
      await sleep(900);
      const d = await deliveredUnits("w1", run, N);
      trunkCounts.push(d.count);
    }
    // separate sends — one resend round for missing units
    const runS = `S${Date.now().toString(36)}`;
    const S = 64;
    for (let round = 0; round < 2; round++) {
      const d = await deliveredUnits("w1", runS, S);
      const missing = d.overflow ? S : S - (d.count === -1 ? 0 : d.count);
      for (let i = 0; i < S; i++) {
        if (round === 0 || true) {
          // send each unit as its own body; second round only sends still-missing
          const tag = crypto.createHash("sha256").update(`${runS}/${i}`).digest("hex").slice(0, 8);
          const rec = `PK${runS}${String(i).padStart(8, "0")}${tag}`;
          const body = Buffer.from(rec + "0".repeat(UNIT - rec.length)).toString("base64");
          const ib = await ctl("w1", "/inbox");
          const have = !ib.inbox_overflow && ib.inbox.some((m) => Buffer.from(m.body_b64, "base64").toString().includes(rec));
          if (!have) await ctl("e1", "/send", { to: ids.w1, body_b64: body });
        }
      }
      if (missing === 0) break;
      await sleep(1500);
    }
    const sep = await deliveredUnits("w1", runS, S);
    const bimodal = trunkCounts.every((c) => c === 0 || c === N);
    const landed = trunkCounts.filter((c) => c === N).length;
    bimodal && landed >= 3
      ? ok("blast-radius", `packed trunks: ${JSON.stringify(trunkCounts)} — strictly 0-or-${N} per trunk (all-or-nothing confirmed, ${landed}/${TRUNKS} through at 15% drop); separate sends: ${sep.count}/${S} units landed — independent loss spreads damage`)
      : bimodal
        ? noted("blast-radius", `packed: ${JSON.stringify(trunkCounts)} all-or-nothing but only ${landed}/${TRUNKS} landed; separate: ${sep.count}/${S}`)
        : open_("blast-radius", `packed trunk unit counts ${JSON.stringify(trunkCounts)} — PARTIAL inner delivery means the trunk disintegrated mid-wire, worse than loss`);
  }
  await wctl("west", "/impair", { delay: 120, jitter: 60, drop: 0, reorder: 0 });
}

/* PACK-03: header amortization, metered — rx-delta on w1 per delivered
   inner unit, packed vs unpacked at zero drop. One trunk frame carries
   all N; N separate frames carry one each. */
{
  const g = await warmGate("e1", ids.w1, "ws://relay-east:8080/ws");
  if (!g.warm) {
    noted("amortization-metered", "carrier cold — cannot measure");
  } else {
    const N = 48;
    // packed: one send, count w1 rx delta for the trunk frame
    const rx0 = await rxOf("w1");
    const runP = `A${Date.now().toString(36)}`;
    const rp = await sendUntilPacked("e1", ids.w1, "w1", runP, N, 4, 900);
    const rx1 = await rxOf("w1");
    // unpacked: N sends, each resend until landed — count rx delta
    const runU = `U${Date.now().toString(36)}`;
    let uSends = 0;
    for (let i = 0; i < N; i++) {
      const tag = crypto.createHash("sha256").update(`${runU}/${i}`).digest("hex").slice(0, 8);
      const rec = `PK${runU}${String(i).padStart(8, "0")}${tag}`;
      const body = Buffer.from(rec + "0".repeat(UNIT - rec.length)).toString("base64");
      for (let a = 0; a < 4; a++) {
        await ctl("e1", "/send", { to: ids.w1, body_b64: body });
        uSends++;
        await sleep(500);
        const ib = await ctl("w1", "/inbox");
        if (!ib.inbox_overflow && ib.inbox.some((m) => Buffer.from(m.body_b64, "base64").toString().includes(rec))) break;
      }
    }
    await sleep(800);
    const rx2 = await rxOf("w1");
    const pkFrames = rx1 - rx0, unFrames = rx2 - rx1;
    rp.delivered && pkFrames > 0 && unFrames > 0
      ? ok("amortization-metered", `${N} units: packed = ${pkFrames} rx-frames @ w1 (${rp.sends} sends); unpacked = ${unFrames} rx-frames (${uSends} sends) — ${(unFrames / Math.max(1, pkFrames)).toFixed(1)}× frame reduction metered on the wire`)
      : noted("amortization-metered", `packed delivered=${rp.delivered} frames=${pkFrames}; unpacked frames=${unFrames} sends=${uSends} — metering incomplete`);
  }
}

/* PACK-04: resend cost of a trunk drop — at 15% loss, sends-to-full-
   delivery for one 48-unit trunk vs 48 separate units. The packed
   trunk's geometric retry count is the blast-radius invoice. */
{
  await wctl("west", "/impair", { delay: 120, jitter: 60, drop: 15, reorder: 0 });
  await sleep(400);
  const g = await warmGate("e1", ids.w1, "ws://relay-east:8080/ws");
  if (!g.warm) {
    noted("resend-cost", "carrier cold — cannot measure");
  } else {
    const N = 48;
    const runP = `R${Date.now().toString(36)}`;
    const rp = await sendUntilPacked("e1", ids.w1, "w1", runP, N, 10, 900);
    const runU = `V${Date.now().toString(36)}`;
    let uSends = 0, uLanded = 0;
    for (let round = 0; round < 4; round++) {
      for (let i = 0; i < N; i++) {
        const tag = crypto.createHash("sha256").update(`${runU}/${i}`).digest("hex").slice(0, 8);
        const rec = `PK${runU}${String(i).padStart(8, "0")}${tag}`;
        const ib = await ctl("w1", "/inbox");
        const have = !ib.inbox_overflow && ib.inbox.some((m) => Buffer.from(m.body_b64, "base64").toString().includes(rec));
        if (!have) {
          await ctl("e1", "/send", { to: ids.w1, body_b64: Buffer.from(rec + "0".repeat(UNIT - rec.length)).toString("base64") });
          uSends++;
          await sleep(350);
        }
      }
      const d = await deliveredUnits("w1", runU, N);
      uLanded = d.count;
      if (uLanded === N) break;
    }
    await wctl("west", "/impair", { delay: 120, jitter: 60, drop: 0, reorder: 0 });
    rp.delivered
      ? ok("resend-cost", `at 15% drop: packed trunk needed ${rp.sends} send(s) to deliver all ${N} units; unpacked needed ${uSends} sends for ${uLanded}/${N} — one retry re-ships the whole batch but the batch IS the retry unit`)
      : noted("resend-cost", `packed trunk never delivered in 10 sends at 15% drop (partial=${rp.partial ?? "?"}); unpacked: ${uSends} sends → ${uLanded}/${N}`);
  }
}

/* drop-plane snapshot */
{
  for (const n of Object.keys(PORTS)) {
    try {
      const c = await ctl(n, "/counters");
      console.log(`  [drops] ${n}: dmsg_dropped=${c.dmsg_dropped ?? "?"} route_nohop=${c.route_nohop ?? "?"} route_dead=${c.route_dead ?? "?"} route_dup=${c.route_dup ?? "?"} rx=${c.received ?? "?"} fwd=${c.forwarded ?? "?"}`);
    } catch (e) { console.log(`  [drops] ${n}: ${e.message}`); }
  }
}

/* ledger append — same contract as comms-suite */
if (findings.length) {
  const led = JSON.parse(fs.readFileSync(FINDINGS, "utf8"));
  led.findings.push(...findings);
  fs.writeFileSync(FINDINGS, JSON.stringify(led, null, 2) + "\n");
  const tally = findings.reduce((m, x) => (m[x.verdict] = (m[x.verdict] || 0) + 1, m), {});
  console.log(`\nPACK sweep: ${cn} probes — ${JSON.stringify(tally)}`);
}

if (DOCKER && !KEEP) { console.log("[wan-lab] compose down"); try { compose("down"); } catch {} }
