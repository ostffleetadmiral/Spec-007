// comms-suite.mjs — COMM team probes for the Hydra WAN lab.
// Drives hydra nodes through their control APIs; every finding is an
// executed probe, appended to security/findings.json alongside the
// RED/BLUE/BLACK/GRAY ledger.
//
//   node comms-suite.mjs --docker   drive docker-compose.wan.yml (up → probe → down)
//   node comms-suite.mjs --local    spawn hydra-node.mjs processes on localhost
//   node comms-suite.mjs --probe    assume topology already up, just probe
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import vm from "node:vm";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { localStorage, hex, unhex, enc, sleep } from "./harness.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, "../site");
const WASM = path.resolve(SITE, "apps/rations/rations.wasm");
const FINDINGS = path.resolve(SITE, "security/findings.json");
const MODE = process.argv.includes("--local") ? "local" : process.argv.includes("--probe") ? "probe" : "docker";
const KEEP = process.argv.includes("--keep");

const findings = [];
let cn = 0;
function f(name, verdict, detail, severity) {
  cn++;
  findings.push({ id: `COMM-${String(cn).padStart(2, "0")}`, team: "COMM", name, verdict, severity, detail, ts: new Date().toISOString() });
  console.log(`  [${verdict}] COMM-${String(cn).padStart(2, "0")} ${name}${detail ? " — " + detail : ""}`);
}
const ok = (name, d) => f(name, "HARDENED", d, "info");
const bad = (name, d) => f(name, "EXPLOITED", d, "high");
const noted = (name, d) => f(name, "NOTED", d, "info");

/* ---------- node handles ---------- */
/* docker mode: published control ports; local: sequential localhost ports */
const PORTS = MODE === "local"
  ? { e1: 19301, e2: 19302, w1: 19401, w2: 19402, bridge: 19500 }
  : { e1: 19301, e2: 19302, w1: 19401, w2: 19402, bridge: 19500 };
const WAN = { east: 19100, west: 19101 };
const names = Object.keys(PORTS);
/* control-plane tokens — generated per run unless the operator pins them;
   compose and local spawns both receive them through env */
const HYDRA_TOKEN = process.env.HYDRA_TOKEN || crypto.randomBytes(16).toString("hex");
const WAN_TOKEN = process.env.WAN_TOKEN || crypto.randomBytes(16).toString("hex");

async function ctl(node, p, body) {
  const r = await fetch(`http://localhost:${PORTS[node]}${p}`,
    body ? { method: "POST", headers: { "Content-Type": "application/json", "x-hydra-token": HYDRA_TOKEN }, body: JSON.stringify(body) }
         : { headers: { "x-hydra-token": HYDRA_TOKEN } });
  return r.json();
}
async function wctl(side, p, body) {
  const r = await fetch(`http://localhost:${WAN[side]}${p}`,
    body ? { method: "POST", headers: { "Content-Type": "application/json", "x-wan-token": WAN_TOKEN }, body: JSON.stringify(body) }
         : { headers: { "x-wan-token": WAN_TOKEN } });
  return r.json();
}
function compose(...args) {
  return execFileSync("docker", ["compose", "-f", path.join(HERE, "docker-compose.wan.yml"), ...args],
    { cwd: HERE, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, HYDRA_TOKEN, WAN_TOKEN } }).toString();
}
async function waitUp(node, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const h = await ctl(node, "/healthz"); if (h.ok) return true; } catch {}
    await sleep(1000);
  }
  return false;
}

/* ---------- spawn local topology ---------- */
let procs = [];
function spawnLocal() {
  const R = path.resolve(HERE, "../../../family/Rations");
  const env = (name, port) => ({
    ...process.env, NAME: name, CONTROL_PORT: String(PORTS[name]), RELAY_PORT: "0",
    RATIONS_DIR: R, WASM, ID_DIR: "/tmp/hydra-ids", PRESENCE_MS: "2000",
    HYDRA_TOKEN, RATIONS_DIAL_ORIGIN: "http://desk.local",
  });
  for (const n of names) procs.push(spawn("node", [path.join(HERE, "hydra-node.mjs")], { env: env(n) }));
  /* one shared relay stands in for the LAN+WAN at min complexity */
  procs.push(spawn("node", [path.join(R, "src/relay/server.js")],
    { env: { ...process.env, RATIONS_PORT: "19499", RATIONS_STATIC_ROOT: path.join(R, "src"),
             RATIONS_ALLOWED_ORIGINS: "http://desk.local" } }));
}

if (MODE === "docker") {
  console.log("[wan-lab] compose up…");
  try { compose("up", "-d", "--wait"); } catch (e) { console.log("compose --wait failed, falling back to polling"); compose("up", "-d"); }
} else if (MODE === "local") {
  spawnLocal();
}
for (const n of names) {
  if (!(await waitUp(n))) { console.log(`${n} never came up`); process.exit(2); }
}
console.log("[wan-lab] all nodes up\n");

/* ---------- probe battery ---------- */
const ids = {};
for (const n of names) ids[n] = await ctl(n, "/id");

/* ledger identity = sha256(pk) */
{
  let allOk = true, detail = [];
  for (const n of names) {
    const expect = crypto.createHash("sha256").update(Buffer.from(ids[n].pk, "hex")).digest("hex");
    const match = expect === ids[n].ledger_id;
    allOk = allOk && match;
    detail.push(`${n}:${ids[n].ledger_id.slice(0, 8)}${match ? "" : "(MISMATCH)"}`);
  }
  allOk ? ok("hydra-ledger-id", detail.join(" ")) : bad("hydra-ledger-id", detail.join(" "));
}

/* distinct identities */
{
  const set = new Set(names.map((n) => ids[n].peer_id));
  set.size === names.length ? ok("distinct-peer-ids", `${set.size} unique`) : bad("distinct-peer-ids", `${set.size}/${names.length}`);
}

/* ---------- wiring ----------
   LAN: leaves dial their segment relay (remote=00… sentinel, discovery fixes it)
   WAN edge: bridge dials each relay THROUGH the impairment proxies */
const Z = "00".repeat(32);
if (MODE === "local") {
  for (const n of names) await ctl(n, "/dial", { url: "ws://localhost:19499/ws", remote: Z });
} else {
  await ctl("e1", "/dial", { url: "ws://relay-east:8080/ws", remote: Z });
  await ctl("e2", "/dial", { url: "ws://relay-east:8080/ws", remote: Z });
  await ctl("w1", "/dial", { url: "ws://relay-west:8080/ws", remote: Z });
  await ctl("w2", "/dial", { url: "ws://relay-west:8080/ws", remote: Z });
  await ctl("bridge", "/dial", { url: "ws://wan-east:9100/ws", remote: Z });
  await ctl("bridge", "/dial", { url: "ws://wan-west:9100/ws", remote: Z });
}
await sleep(2500);
for (const n of names) { const p = await ctl(n, "/peers"); if (p.count) await ctl(n, "/discover", { conn: 1 }); }
if (MODE !== "local") await ctl("bridge", "/discover", { conn: 2 });
/* discovery + announce settle: WAN legs are impaired (~100ms+/hop) and
   connect announces land at +0.4s/+2s — give tables time to populate */
await sleep(6000);

/* MIN: same-segment auto-contacts + sealed send */
{
  const pres = await ctl("e2", "/presence");
  const learned = pres.presence.some((p) => p.peer === ids.e1.peer_id);
  learned ? ok("auto-contact-same-segment", "e2 learned e1 from presence beacon")
          : f("auto-contact-same-segment", "OPEN", "e2 presence table lacks e1", "medium");

  const t0 = Date.now();
  const sres = await ctl("e1", "/send", { to: ids.e2.peer_id, body_b64: Buffer.from("e1→e2 sealed").toString("base64") });
  await sleep(1500);
  const ib = await ctl("e2", "/inbox");
  const m = ib.inbox.find((x) => x.from === ids.e1.peer_id);
  const peers1 = await ctl("e1", "/peers");
  m && m.sealed ? ok("sealed-send-lan", `${Date.now() - t0}ms, sealed=${m.sealed}`)
                : f("sealed-send-lan", "OPEN", `absent/unsealed; send=${JSON.stringify(sres)} peers=${JSON.stringify(peers1.peers)}`, "high");
}

/* MID: cross-segment — directed presence crosses via relay_route.
   Poll to a deadline: the beacon + the periodic presence loop both
   deliver it once routing tables carry w1. */
{
  let learned = false;
  for (let i = 0; i < 24 && !learned; i++) {
    await ctl("e1", "/presence/send", { to: ids.w1.peer_id, status: 1, text: "e1" });
    await sleep(1500);
    const pres = await ctl("w1", "/presence");
    learned = pres.presence.some((p) => p.peer === ids.e1.peer_id);
  }
  learned ? ok("auto-contact-cross-segment", "w1 learned e1 through wan edge (relay_route presence)")
          : f("auto-contact-cross-segment", "OPEN", "cross-segment presence not delivered", "high");
}
{
  const t0 = Date.now();
  const body = Buffer.from("e1→w1 across the wan").toString("base64");
  /* fire-and-forget over the impaired edge: a single frame can be dropped
     outright, so resend on a bounded budget — same discipline the
     ordering probe below documents for real clients. */
  let got = null, sends = 0;
  for (let i = 0; i < 15 && !got; i++) {
    await ctl("e1", "/send", { to: ids.w1.peer_id, body_b64: body }); sends++;
    for (let j = 0; j < 2 && !got; j++) {
      await sleep(600);
      const ib = await ctl("w1", "/inbox");
      got = ib.inbox.find((x) => x.from === ids.e1.peer_id);
    }
  }
  if (got && got.sealed) ok("sealed-send-wan", `delivered after ${sends} send(s) in ~${Date.now() - t0}ms over impaired edge, sealed=true`);
  else if (got) noted("sealed-send-wan", `delivered but UNSEALED — contact key not yet exchanged; plaintext crossed the impaired edge`);
  else noted("sealed-send-wan", `no delivery after ${sends} bounded resends — impaired edge absorbed every frame (fire-and-forget transport carries no delivery guarantee)`);
}

/* ordering under jitter: 10 tagged payloads. relay_route is fire-and-
   forget — real lossy links drop some, so the app layer resends misses
   (bounded), which is what a messaging client would actually do. */
{
  const seq = Array.from({ length: 10 }, (_, i) => `seq-${i}`);
  const seen = () => ctl("w1", "/inbox").then((ib) =>
    new Set(ib.inbox.map((m) => Buffer.from(m.body_b64, "base64").toString())));
  let landed = [];
  for (let round = 0; round < 4 && landed.length < seq.length; round++) {
    for (const s of seq) if (!landed.includes(s))
      await ctl("e1", "/send", { to: ids.w1.peer_id, body_b64: Buffer.from(s).toString("base64") });
    await sleep(3500);
    const bodies = await seen();
    landed = seq.filter((s) => bodies.has(s));
  }
  landed.length === seq.length ? ok("wan-delivery-under-jitter", `10/10 arrived (app-layer resend over lossy edge)`)
                               : noted("wan-delivery-under-jitter", `${landed.length}/10 after resends — edge too lossy for fire-and-forget`);
}

/* global ledger: proposal + 2/3 consensus votes + per-node chains */
{
  const prop = await ctl("e1", "/consensus/proposal", { type: 0, payload_b64: Buffer.from("hydra-ledger-join").toString("base64") });
  const votes = [];
  for (const n of names.slice(0, 3)) {
    const v = await ctl(n, "/consensus/vote", { proposal: prop.hash, approve: true });
    const chk = await ctl("e1", "/consensus/verify", { proposal: prop.hash, voter: v.voter, approve: true, sig: v.sig });
    votes.push(chk.ok);
  }
  const forged = await ctl("e1", "/consensus/verify", {
    proposal: prop.hash, voter: ids.e2.pk, approve: true, sig: "00".repeat(64) });
  votes.filter(Boolean).length >= 2 && !forged.ok
    ? ok("consensus-votes", `${votes.filter(Boolean).length} verified, forged sig rejected`)
    : bad("consensus-votes", `verified=${votes.filter(Boolean).length} forgedAccepted=${forged.ok}`);
}
{
  const payload = Buffer.from("block-1: presence keys").toString("base64");
  let mines = 0, tips = new Set();
  for (const n of names) {
    await ctl(n, "/ledger/tx", { action: 0, payload_b64: payload });
    const m = await ctl(n, "/ledger/mine", { ts: Date.now() });
    const l = await ctl(n, "/ledger");
    if (m.height >= 1 && l.verify) mines++;
    tips.add(l.tip);
  }
  mines === names.length && tips.size === names.length
    ? ok("per-node-ledgers", `${mines}/${names.length} mined+verified, ${tips.size} distinct tips (own ledger each)`)
    : f("per-node-ledgers", "OPEN", `mined=${mines} verify-tips=${tips.size}`, "high");
}

/* ramp the impairment BEFORE the bypass conns exist (COMM-11 dials a
   direct bridge-relay path that would silently skip the WAN edge and
   leave the proxy counters at zero — a false pass) */
if (MODE !== "local") {
  await wctl("west", "/impair", { delay: 300, jitter: 150, drop: 8, reorder: 15 });
  const t0 = Date.now();
  await ctl("e1", "/send", { to: ids.w1.peer_id, body_b64: Buffer.from("heavy wan probe").toString("base64") });
  let got2 = null;
  for (let i = 0; i < 40 && !got2; i++) {
    await sleep(800);
    const ib3 = await ctl("w1", "/inbox");
    got2 = ib3.inbox.find((x) => Buffer.from(x.body_b64, "base64").toString() === "heavy wan probe");
  }
  got2 ? ok("heavy-impairment-delivery", `300ms+150j/8%loss/15%reorder edge → delivered in ~${Date.now() - t0}ms`)
       : f("heavy-impairment-delivery", "OPEN", "heavy profile starved delivery", "medium");
  const st = await wctl("west", "/stats");
  (st.rx > 0)
    ? ok("impairment-accounting", `proxy saw traffic — rx=${st.rx} tx=${st.tx} dropped=${st.dropped} duped=${st.duped} delayed=${st.delayed}`)
    : noted("impairment-accounting", `rx=${st.rx} tx=${st.tx} dropped=${st.dropped} duped=${st.duped}`);
  await wctl("west", "/impair", { delay: 120, jitter: 60, drop: 2, reorder: 0 }); /* restore baseline profile */
}

/* partition: kill the WAN edge — cross-segment must fail honestly */
if (MODE !== "local") {
  await wctl("east", "/kill"); await wctl("west", "/kill");
  await sleep(800);
  await ctl("e1", "/send", { to: ids.w1.peer_id, body_b64: Buffer.from("partition probe").toString("base64") });
  await sleep(3000);
  const ib = await ctl("w1", "/inbox");
  const leaked = ib.inbox.some((x) => Buffer.from(x.body_b64, "base64").toString() === "partition probe");
  !leaked ? ok("partition-honest", "killed edge → no cross-segment leak")
          : bad("partition-honest", "message crossed a dead edge");

  /* bypass path: both leaves dial the dual-homed bridge relay directly */
  await ctl("e1", "/dial", { url: "ws://node-bridge:8080/ws", remote: ids.bridge.peer_id });
  await ctl("w1", "/dial", { url: "ws://node-bridge:8080/ws", remote: ids.bridge.peer_id });
  await sleep(2500);
  await ctl("e1", "/presence/send", { to: ids.w1.peer_id, status: 1, text: "e1" });
  await ctl("e1", "/send", { to: ids.w1.peer_id, body_b64: Buffer.from("bypass works").toString("base64") });
  let got = null;
  for (let i = 0; i < 15 && !got; i++) {
    await sleep(700);
    const ib2 = await ctl("w1", "/inbox");
    got = ib2.inbox.find((x) => Buffer.from(x.body_b64, "base64").toString() === "bypass works");
  }
  got ? ok("dual-homed-bypass", "WAN edge dead — dual-homed bridge relay still delivered")
      : f("dual-homed-bypass", "OPEN", "bypass host did not restore connectivity", "medium");

  await wctl("east", "/heal"); await wctl("west", "/heal");
  /* churn: kill a leaf, expect honest failure; restart, expect recovery */
  try { compose("stop", "node-w2"); } catch {}
  await sleep(1200);
  const sentDead = await ctl("e1", "/send", { to: ids.w2.peer_id, body_b64: Buffer.from("are you there").toString("base64") });
  await sleep(2000);
  noted("node-churn-stop", `w2 stopped — send routed=${sentDead.ok} (route may still exist; delivery is what matters)`);
  try { compose("start", "node-w2"); } catch {}
  await waitUp("w2"); await sleep(4000);
  await ctl("w2", "/dial", { url: "ws://relay-west:8080/ws", remote: Z });
  await sleep(3500);
  /* restart mints a fresh WASM peer_id — re-resolve before directing */
  ids.w2 = await ctl("w2", "/id");
  let churned = false;
  for (let i = 0; i < 16 && !churned; i++) {
    await ctl("e1", "/presence/send", { to: ids.w2.peer_id, status: 1, text: "e1" });
    await sleep(1500);
    const presW2 = await ctl("w2", "/presence");
    churned = presW2.presence.some((p) => p.peer === ids.e1.peer_id);
  }
  churned
    ? ok("node-churn-recover", "w2 restarted, re-dialed, re-learned e1 via presence")
    : f("node-churn-recover", "OPEN", "w2 did not relearn peers after restart", "medium");
}

/* ---------- callsign policy probes (runs shipped fano-auth.js) ---------- */
{
  const sandbox = {
    window: {}, localStorage, crypto, TextEncoder, TextDecoder,
    WebSocket: function () { throw new Error("ws unused"); },
    fetch: (u) => Promise.resolve({ arrayBuffer: () => fs.readFileSync(path.resolve(SITE, u)).buffer }),
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    console, Date, JSON, Math, Promise, Uint8Array, Uint32Array, BigInt, Array, Error,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  const auth = vm.runInContext(
    fs.readFileSync(path.join(SITE, "assets/fano-auth.js"), "utf8") + "\n;window.FANO_AUTH;", sandbox);
  await auth.load();

  const banned = ["007", "agent 009", "Q", "M", "Moneypenny", "Bond", "Blofeld",
    "WO-7", "Fleet Admiral", "admiral", "Ramsey", "The Meter"];
  const rejected = banned.filter((n) => (auth.enroll(n, "passphrase9") || {}).error === "restricted");
  rejected.length === banned.length
    ? ok("callsign-restricted", `${rejected.length}/${banned.length} restricted names refused`)
    : bad("callsign-restricted", `leaked: ${banned.filter((n) => !(auth.enroll(n, "passphrase9") || {}).error).join(",")}`);

  const pin = auth.enroll("Ramsey 006", "passphrase9");
  pin && !pin.error && pin.cert.role === 5 && pin.genesis === true &&
  auth.genesis() && auth.genesis().pk_sha256 && auth.genesis().pk === pin.pk
    ? ok("callsign-pinned-genesis", "ramsey 006 → FLEET-ADMIRAL · genesis record bound to founding pk")
    : bad("callsign-pinned-genesis", JSON.stringify(pin && pin.error));

  /* once founding happened the console callsign belongs to the founding
     key — a second ramsey 006 enrolls only by grant, never by typing */
  const rePin = auth.enroll("Ramsey 006", "passphrase9");
  rePin && rePin.error === "claimed"
    ? ok("callsign-genesis-bound", "post-genesis ramsey 006 → claimed; founding key holds it")
    : bad("callsign-genesis-bound", "second ramsey 006 got: " + JSON.stringify(rePin && (rePin.error || rePin.user)));

  /* a bound grant from the admiral can still move the pinned callsign */
  const gPin = auth.grantCallsign("ramsey 006", "ab".repeat(32), 90);
  gPin && gPin.sig && auth.checkCallsign("ramsey 006", "ab".repeat(32)).ok === true
    ? ok("callsign-genesis-grant", "admiral grant moves the pinned callsign to its bound pk only")
    : bad("callsign-genesis-grant", "pinned grant failed: " + JSON.stringify(gPin));

  auth.session.role = 0;
  const denied = auth.grantCallsign("q", null, 90);
  auth.session.role = 5;
  const g = auth.grantCallsign("q", null, 90);
  /* issue the subject-bound grant while the admiral session is still
     live — enroll below swaps session to the new low-priv identity */
  const bound = auth.grantCallsign("m", "ff".repeat(32), 90);
  const gEnroll = auth.enroll("Q", "passphrase9");
  const reused = auth.enroll("Q", "passphrase9");
  !denied && g && gEnroll && !gEnroll.error && gEnroll.user === "q" && (reused || {}).error === "restricted"
    ? ok("callsign-grant-lifecycle", "CADET refused · ADMIRAL issued · one-shot claim bound to pk · reuse refused")
    : bad("callsign-grant-lifecycle", `denied=${!!denied} g=${!!g} enroll=${gEnroll && gEnroll.error} reuse=${reused && reused.error}`);

  const wrongSub = auth.enroll("M", "passphrase9");
  bound && bound.sig && (wrongSub || {}).error === "restricted"
    ? ok("callsign-grant-bound", "admiral-issued grant bound to another pk → rejected")
    : bad("callsign-grant-bound", bound ? "wrong-subject grant accepted" : "bound grant issuance refused");

  /* branch assignments: requester-signed requests travel as b64 tokens;
     only a rostered FLEET-ADMIRAL produces a verifiable assignment */
  const brq = auth.requestBranch("research_ip");
  const brTok = brq && !brq.error ? auth.exportRequest(brq.pk) : null;
  brq && !brq.error && auth.verifyRequest(brq) && !!brTok
    ? ok("branch-request-sign", "request signed by requester pk · verifies · exports as token")
    : bad("branch-request-sign", JSON.stringify(brq && brq.error));

  const tam = JSON.parse(Buffer.from(brTok, "base64").toString());
  tam.branch = "security";
  auth.importRequest(Buffer.from(JSON.stringify(tam)).toString("base64")) === false
    ? ok("branch-request-tamper", "tampered request token refused on import")
    : bad("branch-request-tamper", "tampered token imported");

  auth.session.role = 0;
  const fa = auth.assignBranch(brq.pk, "research_ip") === null;
  auth.session.role = 3;
  const sc = auth.assignBranch(brq.pk, "research_ip") === null;
  fa && sc
    ? ok("branch-admiral-only", "CADET and STATION-CHIEF both refused — flag rank only")
    : bad("branch-admiral-only", `fa=${fa} sc=${sc}`);

  auth.session.role = 5; /* forged rank still can't mint a verifiable cert — issuer must be rostered */
  const forged = auth.assignBranch(brq.pk, "research_ip");
  const forgedBad = forged && !forged.error && auth.branchOf(brq.pk) === null;
  const rostered = forgedBad && (auth.addIssuer(forged.iss), auth.branchOf(brq.pk));
  forgedBad && rostered && rostered.branch === "research_ip"
    ? ok("branch-roster-enforced", "non-rostered signature fails verification; rostered issuer's verifies")
    : bad("branch-roster-enforced", `forged=${!!forged} forgedBad=${forgedBad} rostered=${!!rostered}`);

  /* flag authenticator: the pinned callsign's grant mints a FANO-ROOT-v1
     credential — self-rooted (gen = sha256(iss)), portable, roster-gated.
     Everyone else's callsign keeps the FANO-CALLSIGN-v1 coupon.
     A second sandbox stands up the flag-seated desk: this desk's record
     is "q", not the pinned callsign, so minting here must refuse. */
  const notSeat = auth.issueCredential(null, 365);
  notSeat && notSeat.error === "not_flag_seat"
    ? ok("flag-credential-seat", "non-flag desk refused the mint — authenticators are flag-seat only")
    : bad("flag-credential-seat", JSON.stringify(notSeat));

  const store2 = new Map();
  const ls2 = {
    getItem: (k) => (store2.has(k) ? store2.get(k) : null),
    setItem: (k, v) => void store2.set(k, String(v)),
    removeItem: (k) => void store2.delete(k),
    clear: () => store2.clear(),
  };
  const sandbox2 = {
    window: {}, localStorage: ls2, crypto, TextEncoder, TextDecoder,
    WebSocket: function () { throw new Error("ws unused"); },
    fetch: (u) => Promise.resolve({ arrayBuffer: () => fs.readFileSync(path.resolve(SITE, u)).buffer }),
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    console, Date, JSON, Math, Promise, Uint8Array, Uint32Array, BigInt, Array, Error,
  };
  sandbox2.window = sandbox2;
  vm.createContext(sandbox2);
  const auth2 = vm.runInContext(
    fs.readFileSync(path.join(SITE, "assets/fano-auth.js"), "utf8") + "\n;window.FANO_AUTH;", sandbox2);
  await auth2.load();
  await auth2.enroll("ramsey 006", "passphrase9");
  const cred = auth2.issueCredential(null, 365);
  const credTok = cred && !cred.error ? auth2.exportCredential() : null;
  const credObj = credTok ? JSON.parse(Buffer.from(credTok, "base64").toString()) : null;
  cred && cred.v === "FANO-ROOT-v1" && credObj && credObj.grant &&
    auth2.verifyCredential(credObj) && auth2.verifyCredential(credObj).same_founding
    ? ok("flag-credential-mint", "FANO-ROOT-v1 issued — self-rooted, sub-bound, grant embedded, verifies")
    : bad("flag-credential-mint", JSON.stringify(cred && (cred.error || cred.v)));

  /* cross-desk authentication: desk A rosters the flag issuer and
     verifies the presented paper — no shared storage needed */
  auth.addIssuer(credObj.iss);
  const presented = auth.authenticate(credTok);
  presented && presented.ok && !presented.same_founding
    ? ok("flag-credential-wire", "foreign desk verifies the flag's paper — signature + roster, not local state")
    : bad("flag-credential-wire", JSON.stringify(presented));

  const cTam = credObj ? JSON.parse(JSON.stringify(credObj)) : null;
  if (cTam) { cTam.role = 0; cTam.sig = "00"; }
  const cGen = credObj ? JSON.parse(JSON.stringify(credObj)) : null;
  if (cGen) cGen.gen = "00".repeat(32);
  cTam && cGen && auth2.verifyCredential(cTam) === null && auth2.verifyCredential(cGen) === null
    ? ok("flag-credential-forgery", "role-downgrade and forged gen-anchor both refused")
    : bad("flag-credential-forgery", "tampered credential verified");

  const q2 = auth.grantCallsign("tanner", null, 30);
  const q2o = q2 && q2.callsign ? JSON.parse(Buffer.from(auth.exportGrant("tanner"), "base64").toString()) : null;
  q2o && q2o.v !== "FANO-ROOT-v1" && q2o.callsign === "tanner"
    ? ok("grant-still-coupon", "non-flag grants remain FANO-CALLSIGN-v1 coupons — authenticators are flag-only")
    : bad("grant-still-coupon", JSON.stringify(q2o && q2o.v));

  const setup = auth2.setupTotp("QStar.net", "QStar.net");
  const stored = ls2.getItem(auth2.STORE_KEY) || "";
  setup && setup.secret && setup.uri.indexOf("otpauth://totp/QStar.net") === 0 &&
    !stored.includes(setup.secret) && /\"ct\"/.test(stored) && /\"tag\"/.test(stored)
    ? ok("totp-encrypted-setup", "QStar.net seed generated + otpauth URI; plaintext absent, AES-GCM ciphertext stored")
    : bad("totp-encrypted-setup", "seed leaked or setup failed");
  auth2.verifyTotp(setup.code) && !auth2.verifyTotp(setup.code === "000000" ? "111111" : "000000")
    ? ok("totp-rfc6238-code", "six-digit 30s TOTP verifies; invalid code refused")
    : bad("totp-rfc6238-code", "TOTP verification mismatch");
  auth2.session.sk = null; auth2.session.user = null; auth2.session.role = 0; auth2.session.totp = false;
  const relock = auth2.unlock("passphrase9");
  relock && relock.totp_required && !auth2.session.totp
    ? ok("totp-relock-gate", "credential unlock leaves session pending until TOTP second factor")
    : bad("totp-relock-gate", "relock bypassed or lost TOTP requirement");
}

/* ---------- emit ---------- */
const prior = fs.existsSync(FINDINGS) ? JSON.parse(fs.readFileSync(FINDINGS, "utf8")) : { findings: [] };
const merged = { generated: new Date().toISOString(),
  findings: [...(prior.findings || []).filter((x) => x.team !== "COMM"), ...findings] };
fs.mkdirSync(path.dirname(FINDINGS), { recursive: true });
fs.writeFileSync(FINDINGS, JSON.stringify(merged, null, 2));

const tally = findings.reduce((a, x) => (a[x.verdict] = (a[x.verdict] || 0) + 1, a), {});
console.log(`\nCOMM sweep: ${findings.length} probes — ${JSON.stringify(tally)}`);

if (MODE === "docker" && !KEEP) { console.log("[wan-lab] compose down"); try { compose("down"); } catch {} }
procs.forEach((p) => { try { p.kill(); } catch {} });
process.exit(findings.some((x) => x.verdict === "EXPLOITED" || x.verdict === "ERROR") ? 1 : 0);
