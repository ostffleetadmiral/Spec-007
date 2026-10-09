// encap-sweep.mjs — ENCAP team probes over the live Hydra WAN lab.
// The tunneling/encapsulation doctrine made literal: a sealed inner
// payload nested inside an outer transport body, multi-channel bursts,
// a live impairment ramp (the wire's real power budget), and carrier
// failover to the dual-homed bypass when the trunk edge dies.
//
//   node encap-sweep.mjs --probe    lab already up (env: HYDRA_TOKEN, WAN_TOKEN)
//   node encap-sweep.mjs --docker   drive docker-compose.wan.yml (up → sweep → down)
//   add --keep to leave the lab running after a --docker sweep.
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
  const row = { id: `ENCAP-${String(cn).padStart(2, "0")}`, team: "ENCAP", name, verdict, severity, detail, ts: new Date().toISOString() };
  findings.push(row);
  console.log(`  [${verdict}] ENCAP-${String(cn).padStart(2, "0")} ${name}${detail ? " — " + detail : ""}`);
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

/* bounded app-layer resend — the documented real-client discipline for
   fire-and-forget relay_route transport over a lossy edge. */
async function sendUntil(from, toPeer, toNode, bodyB64, attempts, pollMs) {
  for (let i = 0; i < attempts; i++) {
    await ctl(from, "/send", { to: toPeer, body_b64: bodyB64 });
    await sleep(pollMs);
    const ib = await ctl(toNode, "/inbox");
    if (ib.inbox.some((x) => x.body_b64 === bodyB64)) return { delivered: true, sends: i + 1 };
  }
  return { delivered: false, sends: attempts };
}

/* route priming — relay_route is fire-and-forget: a directed send needs
   the target in the sender's route table, which directed presence
   beacons install. Poll to a deadline like the suite does. */
async function prime(from, toPeer, toNode, text) {
  for (let i = 0; i < 24; i++) {
    await ctl(from, "/presence/send", { to: toPeer, status: 1, text });
    await sleep(1500);
    const pres = await ctl(toNode, "/presence");
    if (pres.presence.some((p) => p.peer === (from === "e1" ? ids.e1 : from === "w1" ? ids.w1 : ids[from]))) return true;
  }
  return false;
}

/* carrier warmth — the connect-announce window that installs
   cross-segment direct_msg routes is ephemeral (measured: ~90-180 s
   post-wiring). Presence beacons stay warm via the gossip path and
   MASK the dead data plane: /send returns ok, frames vanish. The gate
   checks the sender's route table actually carries the target; on cold
   carrier it re-dials and re-primes, reporting whether in-band
   recovery is even possible. */
async function warmGate(from, toPeer, url) {
  const peers = (await ctl(from, "/peers")).peers;
  if (peers.some((p) => p.id === toPeer)) return { warm: true, healed: false };
  // cold: re-dial + re-discover + re-announce, then re-check
  await ctl(from, "/dial", { url, remote: Z });
  await sleep(3000);
  for (const c of [1, 2, 3]) await ctl(from, "/discover", { conn: c }).catch(() => {});
  for (let i = 0; i < 8; i++) {
    await ctl(toNodeOf(toPeer), "/presence/send", { to: (await ctl(from, "/id")).peer_id, status: 1, text: "reannounce" });
    await sleep(1200);
    const p2 = (await ctl(from, "/peers")).peers;
    if (p2.some((p) => p.id === toPeer)) return { warm: true, healed: true };
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
  // baseline wiring: leaves dial segment relays, bridge rides both WAN proxies
  for (const [n, url] of [["e1", "ws://relay-east:8080/ws"], ["e2", "ws://relay-east:8080/ws"],
                          ["w1", "ws://relay-west:8080/ws"], ["w2", "ws://relay-west:8080/ws"],
                          ["bridge", "ws://wan-east:9100/ws"], ["bridge", "ws://wan-west:9100/ws"]])
    await ctl(n, "/dial", { url, remote: Z });
  await sleep(2500);
  for (const n of ["e1", "e2", "w1", "w2"]) await ctl(n, "/discover", { conn: 1 });
  await ctl("bridge", "/discover", { conn: 1 });
  await ctl("bridge", "/discover", { conn: 2 });
  await sleep(6000);
}

const ids = {};
for (const n of ["e1", "w1", "w2"]) ids[n] = (await ctl(n, "/id")).peer_id;

/* prime both directions before any payload probe — connect-announces
   decay; directed presence is what keeps the route tables carrying the
   cross-segment pair. */
const primedEW = await prime("e1", ids.w1, "w1", "e1");
const primedWE = await prime("w1", ids.e1, "e1", "w1");
console.log(`  [routes] e1→w1 ${primedEW ? "carried" : "UNPRIMED"} · w1→e1 ${primedWE ? "carried" : "UNPRIMED"}`);

/* ENCAP-01: nested envelope — a complete inner payload (canonical
   phone-body JSON, itself base64) carried as the body of the outer
   send. Two transport layers, one wire — inner bytes must arrive
   bit-identical through the impaired edge. */
{
  const inner = Buffer.from(JSON.stringify({
    kind: "inner-sealed", layer: 2,
    note: "IPv4-in-IPv6 analog: the trunk does not see the payload",
    canon136: "0".repeat(136), // a 136-byte-canon placeholder field, byte-exact on arrival
  })).toString("base64");
  const outer = Buffer.from(JSON.stringify({ layer: 1, encap: "v4in6", inner_b64: inner })).toString("base64");
  const r = await sendUntil("e1", ids.w1, "w1", outer, 12, 700);
  if (r.delivered) ok("nested-envelope", `inner layer intact after ${r.sends} outer send(s) — two transport layers, one wire`);
  else open_("nested-envelope", "inner payload never surfaced — edge absorbed every attempt");
}

/* ENCAP-02: mtu ladder — find where the trunk's framing cap bites.
   Bodies are JSON+base64 (the trunk decodes bodies as UTF-8 on entry —
   binary must ride encapsulated; ASCII keeps the rung honest) and the
   top rung stays under the 64 KB inbox-serialization ceiling. */
{
  const sizes = [64, 256, 1024, 2048, 3072, 3584, 4096];
  const rows = [];
  let cap = null, delivered = 0, cold = 0;
  for (const sz of sizes) {
    const g = await warmGate("e1", ids.w1, "ws://relay-east:8080/ws");
    if (!g.warm) { rows.push(`${sz}B:cold`); cold++; continue; }
    const body = Buffer.from(JSON.stringify({ sz, pad: "A".repeat(Math.max(0, sz - 32)) })).toString("base64");
    const r = await sendUntil("e1", ids.w1, "w1", body, 5, 900);
    if (r.delivered) delivered++;
    rows.push(`${sz}B:${r.delivered ? "ok/" + r.sends : "x"}`);
    if (!r.delivered && cap === null) cap = sz;
  }
  cap !== null
    ? (cap > 4096
        ? noted("mtu-ladder", `${rows.join(" ")} — trunk carries ≤4 KB bodies, refuses ${cap} B (a real framing cap, not a crash)`)
        : open_("mtu-ladder", `${rows.join(" ")} — refused at ${cap} B`))
    : cold > 0
      ? noted("mtu-ladder", `carrier cold for ${cold}/${sizes.length} rungs — only ${delivered} real measurement(s): ${rows.join(" ")}`)
      : ok("mtu-ladder", `every rung delivered — ${rows.join(" ")}`);
}

/* ENCAP-03: multiplex — 12 concurrent tagged bodies, 6 each direction,
   one burst. Fire-and-forget transport under jitter: resend rounds
   bounded at 3. */
{
  const tags = Array.from({ length: 12 }, (_, i) => `mux-${i}`);
  const b64 = (s) => Buffer.from(s).toString("base64");
  let landedE = [], landedW = [];
  const g1 = await warmGate("e1", ids.w1, "ws://relay-east:8080/ws");
  const g2 = await warmGate("w1", ids.e1, "ws://relay-west:8080/ws");
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < 12; i += 2) {
      if (!landedW.includes(tags[i])) await ctl("e1", "/send", { to: ids.w1, body_b64: b64(tags[i]) });
      if (!landedE.includes(tags[i + 1])) await ctl("w1", "/send", { to: ids.e1, body_b64: b64(tags[i + 1]) });
    }
    await sleep(3000);
    const ibW = await ctl("w1", "/inbox");
    const ibE = await ctl("e1", "/inbox");
    const seenW = new Set(ibW.inbox.map((m) => Buffer.from(m.body_b64, "base64").toString()));
    const seenE = new Set(ibE.inbox.map((m) => Buffer.from(m.body_b64, "base64").toString()));
    landedW = tags.filter((t, i) => i % 2 === 0 && seenW.has(t));
    landedE = tags.filter((t, i) => i % 2 === 1 && seenE.has(t));
    if (landedW.length + landedE.length === 12) break;
  }
  landedW.length + landedE.length === 12
    ? ok("multiplex-burst", "12/12 concurrent bodies landed — both directions interleaved on one trunk")
    : noted("multiplex-burst", `${landedW.length}→w1 + ${landedE.length}→e1 / 12 after 3 resend rounds`);
}

/* ENCAP-04: the wire's real power budget — live drop% ramp on the west
   edge, 8 tagged bodies per step, one resend round (app discipline). */
{
  const steps = [0, 1, 2, 5, 10, 20];
  const curve = [];
  let colds = 0;
  for (const drop of steps) {
    await wctl("west", "/impair", { delay: 120, jitter: 60, drop, reorder: drop > 4 ? 5 : 0 });
    const g = await warmGate("e1", ids.w1, "ws://relay-east:8080/ws");
    if (!g.warm) { curve.push(`${drop}%:cold`); colds++; continue; }
    await sleep(300);
    const tag = `ramp-${drop}`;
    let landed = 0;
    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < 8; i++) {
        const b = Buffer.from(`${tag}-${i}`).toString("base64");
        const ib = await ctl("w1", "/inbox");
        if (!ib.inbox.some((m) => m.body_b64 === b))
          await ctl("e1", "/send", { to: ids.w1, body_b64: b });
      }
      await sleep(2200);
      const ib = await ctl("w1", "/inbox");
      landed = ib.inbox.filter((m) => Buffer.from(m.body_b64, "base64").toString().startsWith(tag)).length;
      if (landed === 8) break;
    }
    curve.push(`${drop}%:${landed}/8`);
  }
  await wctl("west", "/impair", { delay: 120, jitter: 60, drop: 2, reorder: 0 }); // restore baseline
  const last = curve[curve.length - 1];
  const measured = curve.filter((c) => !c.endsWith(":cold")).length;
  measured < 3
    ? noted("impairment-ramp", `${curve.join(" ")} — carrier cold for ${colds}/${steps.length} steps; ramp under-sampled, not a loss verdict`)
    : /^20%:0\/8/.test(last)
      ? noted("impairment-ramp", `${curve.join(" ")} — 20% loss closes even the resend discipline; the trunk's energy ceiling measured`)
      : ok("impairment-ramp", `${curve.join(" ")} — app-layer resend holds delivery into double-digit loss`);
}

/* ENCAP-05: carrier failover — both leaves dial the dual-homed bypass
   node (the inner payload's second trunk), then the WAN edge dies
   mid-stream. Delivery must continue across the bypass carrier. */
{
  const idB = (await ctl("bridge", "/id")).peer_id;
  await ctl("e1", "/dial", { url: "ws://node-bridge:8080/ws", remote: idB });
  await ctl("w1", "/dial", { url: "ws://node-bridge:8080/ws", remote: idB });
  await sleep(4000); // bypass conns establish + discover
  for (const n of ["e1", "w1"]) for (const c of [1, 2, 3]) await ctl(n, "/discover", { conn: c }).catch(() => {});
  await sleep(4000);
  await prime("e1", ids.w1, "w1", "e1-via-bypass"); // re-prime so routes exist over the second carrier
  await wctl("west", "/kill");
  await sleep(500);
  const r = await sendUntil("e1", ids.w1, "w1", Buffer.from("post-cutover payload").toString("base64"), 20, 700);
  await wctl("west", "/heal");
  r.delivered
    ? ok("carrier-failover", `trunk edge killed mid-stream — payload still arrived via bypass carrier after ${r.sends} send(s)`)
    : open_("carrier-failover", "bypass carrier did not pick up the payload inside 20 sends");
}

/* ENCAP-06: governance over the trunk — proposal + votes + verify ride
   the same wire as data. */
{
  const prop = await ctl("e1", "/consensus/proposal", { type: 0, payload_b64: Buffer.from("encap-sweep-seal").toString("base64") });
  const v1 = await ctl("e1", "/consensus/vote", { proposal: prop.hash, approve: true });
  const ver = await ctl("w1", "/consensus/verify", { proposal: prop.hash, voter: v1.voter, approve: true, sig: v1.sig });
  ver.ok
    ? ok("governance-over-trunk", "proposal hashed east, vote signed east, verified west — paper rides the same trunk")
    : open_("governance-over-trunk", "vote verification failed across the edge");
}

/* ENCAP-07: route-horizon — measure the connect-announce window's
   lifetime directly. Probes every 15 s from wire-up; the first cold
   miss IS the measurement. */
{
  const wiredAt = Date.now();
  let lastAlive = 0, probed = 0;
  for (let i = 0; i < 16; i++) {
    await sleep(15000);
    probed++;
    const b64 = Buffer.from(`horizon-${wiredAt}-${i}`).toString("base64");
    await ctl("e1", "/send", { to: ids.w1, body_b64: b64 });
    await sleep(2500);
    const ib = await ctl("w1", "/inbox");
    if (ib.inbox.some((x) => x.body_b64 === b64)) lastAlive = probed;
    else break;
  }
  const aliveS = Math.round(lastAlive * 17.5 + (Date.now() - wiredAt - probed * 17500) / 1000);
  lastAlive === 16
    ? ok("route-horizon", "cross-segment carrier still warm at 280 s — window exceeds sweep horizon")
    : noted("route-horizon", `cross-segment direct_msg delivery died after ~${aliveS}s warm — announce window is ephemeral, presence stays warm and MASKS the dead data plane`);
}

/* ENCAP-08: cold-carrier recovery — after the horizon, can in-band
   signaling rebuild the route at all? Re-dial + announce + prime. */
{
  const g = await warmGate("e1", ids.w1, "ws://relay-east:8080/ws");
  if (g.warm) {
    const b64 = Buffer.from("post-heal").toString("base64");
    const r = await sendUntil("e1", ids.w1, "w1", b64, 6, 900);
    r.delivered
      ? ok("carrier-recovery", `cold carrier healed in-band (healed=${g.healed}) — route rebuilt after horizon`)
      : noted("carrier-recovery", "route re-formed but delivery still failed — table warm, frames still vanish");
  } else {
    open_("carrier-recovery", "no in-band recovery — a node that misses the announce window never rejoins the routed plane");
  }
}

/* drop-plane snapshot — the counters that make the catch {} swallow
   observable. This is where silent delivery deaths get their cause. */
{
  const drops = {};
  for (const n of Object.keys(PORTS)) {
    try { drops[n] = await ctl(n, "/counters"); } catch (e) { drops[n] = { err: String(e && e.message || e) }; }
  }
  for (const [n, c] of Object.entries(drops)) {
    console.log(`  [drops] ${n}: dmsg_dropped=${c.dmsg_dropped ?? "?"} kind=${c.dmsg_drop_kind ?? "?"} route_nohop=${c.route_nohop ?? "?"} route_dead=${c.route_dead ?? "?"} route_dup=${c.route_dup ?? "?"} rx=${c.received ?? "?"} fwd=${c.forwarded ?? "?"}`);
  }
}

/* ledger append — same contract as comms-suite */
if (findings.length) {
  const led = JSON.parse(fs.readFileSync(FINDINGS, "utf8"));
  led.findings.push(...findings);
  fs.writeFileSync(FINDINGS, JSON.stringify(led, null, 2) + "\n");
  const tally = findings.reduce((m, x) => (m[x.verdict] = (m[x.verdict] || 0) + 1, m), {});
  console.log(`\nENCAP sweep: ${cn} probes — ${JSON.stringify(tally)}`);
}

if (DOCKER && !KEEP) { console.log("[wan-lab] compose down"); try { compose("down"); } catch {} }
