// officer-mesh.mjs — OFFR team probes: second-officer fleet operation.
// The thing that never ran before: a second real officer desk —
// commissioned by carried paper, speaking sealed traffic on a live
// wire. Two tiers, both real:
//
//   auth tier — vm-sandboxed copies of the shipped fano-auth.js with
//     independent localStorage: desk-transfer founding, fleet-anchored
//     commissioning, branch request→assignment round trip, roaming
//     flag credential verified cross-desk.
//   wire tier — two hydra WASM peers over a shared Rations relay:
//     sealed exchange both directions + partition honesty.
//
//   node officer-mesh.mjs          spawn relay + nodes, probe, tear down
//   node officer-mesh.mjs --keep   leave the topology running
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import vm from "node:vm";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { hex, unhex, enc, sleep } from "./harness.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, "../site");
const WASM = path.resolve(SITE, "apps/rations/rations.wasm");
const FINDINGS = path.resolve(SITE, "security/findings.json");
const KEEP = process.argv.includes("--keep");

const findings = [];
let cn = 0;
function f(name, verdict, detail, severity) {
  cn++;
  findings.push({ id: `OFFR-${String(cn).padStart(2, "0")}`, team: "OFFR", name, verdict, severity, detail, ts: new Date().toISOString() });
  console.log(`  [${verdict}] OFFR-${String(cn).padStart(2, "0")} ${name}${detail ? " — " + detail : ""}`);
}
const ok = (name, d) => f(name, "HARDENED", d, "info");
const bad = (name, d) => f(name, "EXPLOITED", d, "high");
const noted = (name, d) => f(name, "NOTED", d, "info");

/* ---------- locate the Rations sibling (relay + WASM chain) ---------- */
const R_CANDIDATES = [
  process.env.RATIONS_DIR,
  path.resolve(HERE, "../../../family/Rations"),
  path.resolve(HERE, "../../../../Rations"),
  path.resolve(HERE, "../../Rations"),
];
const R = R_CANDIDATES.find(p => p && fs.existsSync(path.join(p, "src/relay/server.js")));
if (!R) { console.log("officer-mesh: no Rations sibling found — set RATIONS_DIR"); process.exit(2); }

/* ---------- desk sandbox (same shim as comms-suite) ---------- */
function mkDesk() {
  const store = new Map();
  const ls = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => void store.set(k, String(v)),
    removeItem: (k) => void store.delete(k),
    clear: () => store.clear(),
  };
  const sandbox = {
    window: {}, localStorage: ls, crypto, TextEncoder, TextDecoder,
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
  return { auth, store, ls };
}

/* a fleet-genesis-shaped doc binding pkHex to the flag seat — the same
   shape the real canon pair carries; the suite mints the mesh's own
   fleet board rather than borrowing the flagship's */
function genesisDocFor(pkHex) {
  const pk = Buffer.from(pkHex, "hex");
  const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), pk]);
  const pem = "-----BEGIN PUBLIC KEY-----\n" + spki.toString("base64") + "\n-----END PUBLIC KEY-----\n";
  return { payload: { members: [
    { name: "admiral", role: "flag-seat", pubkey_pem_b64: Buffer.from(pem).toString("base64") } ] } };
}

/* ---------- live wire: relay + two seeded hydra peers ---------- */
const PORTS = { a: 19601, b: 19602 };
const RELAY_PORT = 19699;
const HYDRA_TOKEN = crypto.randomBytes(16).toString("hex");
const procs = [];
async function ctl(node, p, body) {
  const r = await fetch(`http://localhost:${PORTS[node]}${p}`,
    body ? { method: "POST", headers: { "Content-Type": "application/json", "x-hydra-token": HYDRA_TOKEN }, body: JSON.stringify(body) }
         : { headers: { "x-hydra-token": HYDRA_TOKEN } });
  return r.json();
}
async function waitUp(node, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const h = await ctl(node, "/healthz"); if (h.ok) return true; } catch {}
    await sleep(1000);
  }
  return false;
}
function spawnRelay() {
  const p = spawn("node", [path.join(R, "src/relay/server.js")],
    { env: { ...process.env, RATIONS_PORT: String(RELAY_PORT), RATIONS_STATIC_ROOT: path.join(R, "src"),
             RATIONS_ALLOWED_ORIGINS: "http://desk.local" } });
  procs.push(p);
  return p;
}
async function waitRelay(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const s = await fetch(`http://localhost:${RELAY_PORT}/`); if (s.status) return true; } catch {}
    await sleep(500);
  }
  return false;
}
const Z = "00".repeat(32);

/* ================= auth tier ================= */
const A = mkDesk(), B = mkDesk(), A2 = mkDesk(), C = mkDesk();
await A.auth.load(); await B.auth.load(); await A2.auth.load(); await C.auth.load();

/* founding the flag desk: pinned callsign → genesis + fleet_admiral */
const aPin = A.auth.enroll("Ramsey 006", "flag-passphrase");
aPin && !aPin.error && aPin.cert.role === 5 && A.auth.genesis()
  ? ok("flag-desk-founded", "pinned callsign → FLEET-ADMIRAL · genesis bound to founding pk")
  : bad("flag-desk-founded", JSON.stringify(aPin && aPin.error));
const aPk = aPin && aPin.pk;

/* OFFR — the desk is its key, not its machine: export carries record +
   genesis + issuers + grants signed by the desk's own key */
const dtok = A.auth.exportDesk();
const di = A2.auth.importDesk(dtok);
const a2rec = A2.auth.loadRecord();
dtok && di && di.ok === true && di.founded === true && a2rec && a2rec.pk === aPk
  ? ok("desk-transfer-founding", "FANO-DESK-v1 carried the founding — same pk, wrapped keystore, roster+grants along")
  : bad("desk-transfer-founding", `export=${!!dtok} import=${JSON.stringify(di)} pk=${a2rec && a2rec.pk}`);

/* refusals: tampered bundle, founded desk, non-token */
{
  const tam = JSON.parse(Buffer.from(dtok, "base64").toString());
  tam.record.user = "mallory";
  const tamTok = Buffer.from(JSON.stringify(tam)).toString("base64");
  const t1 = C.auth.importDesk(tamTok);
  const t2 = A2.auth.importDesk(dtok);           /* A2 is already founded */
  const t3 = C.auth.importDesk("not-a-token");
  t1 && t1.error === "sig_invalid" && t2 && t2.error === "desk_founded" && t3 && t3.error === "not_desk_token"
    ? ok("desk-token-refusals", "tampered→sig_invalid · founded→desk_founded · garbage→not_desk_token")
    : bad("desk-token-refusals", `t1=${JSON.stringify(t1)} t2=${JSON.stringify(t2)} t3=${JSON.stringify(t3)}`);
}

/* second-officer commissioning: B joins A's fleet board (binds the
   flag-seat genesis), claims an unclaimed roaming grant for the
   restricted callsign — first enrollment binds it to B's own pk */
await B.auth.bindFleetFlag(genesisDocFor(aPk));
const anchored = B.auth.flagAnchored(aPk);
const g = A.auth.grantCallsign("m", null, 90);
const gTok = g && A.auth.exportGrant("m");
const bEnroll = gTok ? B.auth.enroll("M", "officer-passphrase", gTok) : null;
anchored && gTok && bEnroll && !bEnroll.error && bEnroll.user === "m" && B.auth.loadRecord()
  ? ok("second-officer-commission", "fleet-anchored grant → M commissioned on a second desk — _fleet binding, no roster carry")
  : bad("second-officer-commission", `anchored=${anchored} enroll=${JSON.stringify(bEnroll && (bEnroll.error || bEnroll.user))}`);

/* a tampered grant imports as paper but dies at the claim boundary */
{
  const tamG = JSON.parse(Buffer.from(gTok, "base64").toString());
  tamG.callsign = "q";
  const cEnroll = C.auth.enroll("Q", "pw", Buffer.from(JSON.stringify(tamG)).toString("base64"));
  cEnroll && cEnroll.error === "restricted"
    ? ok("grant-tamper-refused", "rewritten grant token imports but fails verifyGrant at the claim boundary")
    : f("grant-tamper-refused", "OPEN", JSON.stringify(cEnroll), "medium");
}

/* branch grant transfer: B requests, token crosses to A, A assigns,
   the signed assignment crosses back — B verifies via fleet anchor,
   no shared storage, no roster carry */
{
  const brq = B.auth.requestBranch("admiralty");
  const brTok = brq && B.auth.exportRequest(brq.pk);
  const aImp = brTok && A.auth.importRequest(brTok);
  const aAsg = aImp ? A.auth.assignBranch(brq.pk, "admiralty") : null;
  const aTok = aAsg && A.auth.exportAssignment(brq.pk);
  const bImp = aTok ? B.auth.importAssignment(aTok) : false;
  const bOf = bImp ? B.auth.branchOf(brq.pk) : null;
  brq && aImp && aAsg && aAsg.sig && bImp && bOf && bOf.branch === "admiralty" && bOf.iss === aPk
    ? ok("branch-request-transfer", "request→assign→import round trip — flag's assignment verifies on B via fleet anchor")
    : bad("branch-request-transfer", `brq=${!!brq} aImp=${aImp} asg=${!!aAsg} bImp=${bImp} branchOf=${JSON.stringify(bOf)}`);

  /* forgery: a non-flag signature must not verify even with the paper filed */
  const fAsg = aAsg ? Object.assign({}, aAsg, { iss: "ab".repeat(32), sig: "00".repeat(64) }) : null;
  const fImp = fAsg ? C.auth.importAssignment(Buffer.from(JSON.stringify(fAsg)).toString("base64")) : null;
  (fImp === false || fImp === null)
    ? ok("branch-assignment-forgery", "forged issuer+sig refused at import — dead paper never files")
    : f("branch-assignment-forgery", "OPEN", `import=${fImp}`, "medium");
}

/* roaming flag: A mints FANO-ROOT-v1 — B verifies the paper on the
   fleet anchor alone; B's own mint refuses (not the flag seat) */
{
  const roamTok = A.auth.issueRoaming(30);
  const presented = roamTok ? B.auth.authenticate(roamTok) : null;
  const bMint = B.auth.issueCredential(null, 365);
  /* refusal is honest either way: a field-agent session hits the role
     gate (null); a flag-rank session on a non-flag desk gets the
     not_flag_seat object — both mean the second desk cannot mint */
  const refused = bMint == null || bMint.error === "not_flag_seat";
  roamTok && presented && presented.ok && !presented.same_founding && refused
    ? ok("roaming-flag-cross-desk", "flag paper verifies on the foreign desk — anchor, not local state; second desk can't mint")
    : bad("roaming-flag-cross-desk", `roam=${!!roamTok} presented=${JSON.stringify(presented)} bMint=${JSON.stringify(bMint)}`);
}

/* ================= wire tier ================= */
console.log("\n[wire] spawning shared relay + two seeded peers…");
let relayProc = spawnRelay();
for (const n of ["a", "b"]) {
  const seedHex = crypto.createHash("sha256").update(`offr-${n}-seed`).digest("hex");
  procs.push(spawn("node", [path.join(HERE, "hydra-node.mjs")], {
    env: { ...process.env, NAME: `offr-${n}`, CONTROL_PORT: String(PORTS[n]), RELAY_PORT: "0",
           SEED_HEX: seedHex, RATIONS_DIR: R, WASM, ID_DIR: "/tmp/offr-ids",
           PRESENCE_MS: "1500", HYDRA_TOKEN, RATIONS_DIAL_ORIGIN: "http://desk.local" } }));
}
const relayUp = await waitRelay();
/* a listener without a live child means a foreign process holds the port —
   killing it later wouldn't be a partition, so refuse to probe that topology */
if (relayUp && relayProc.exitCode !== null)
  console.error(`relay spawn exited early (code ${relayProc.exitCode}) — port ${RELAY_PORT} held by a foreign listener; aborting wire tier`);
const up = relayUp && relayProc.exitCode === null && (await waitUp("a")) && (await waitUp("b"));
if (!up) {
  bad("wire-topology-up", "relay or peer never came up");
} else {
  const ids = { a: await ctl("a", "/id"), b: await ctl("b", "/id") };
  await ctl("a", "/dial", { url: `ws://localhost:${RELAY_PORT}/ws`, remote: Z });
  await ctl("b", "/dial", { url: `ws://localhost:${RELAY_PORT}/ws`, remote: Z });
  await sleep(1500);
  for (const n of ["a", "b"]) { const p = await ctl(n, "/peers"); if (p.count) await ctl(n, "/discover", { conn: 1 }); }
  /* peer-table learning: /send routes through the p2p table (peer bound
     to a conn), not the presence table — wait until each node holds the
     other's peer_id on a live conn before directing traffic */
  let learnedA = false, learnedB = false;
  for (let i = 0; i < 30 && !(learnedA && learnedB); i++) {
    if (!learnedB) await ctl("a", "/presence/send", { to: ids.b.peer_id, status: 1, text: "a" }).catch(() => {});
    if (!learnedA) await ctl("b", "/presence/send", { to: ids.a.peer_id, status: 1, text: "b" }).catch(() => {});
    await sleep(700);
    const pa = await ctl("a", "/peers").catch(() => ({ peers: [] }));
    const pb = await ctl("b", "/peers").catch(() => ({ peers: [] }));
    /* the phone route needs more than a peer row: state≥2 conn AND a real
       loc (the .connect announce lands only after conn-up; early announces
       are dropped) AND the counterpart's presence contact — check all three */
    const locOf = x => (x.loc || "").replace(/^0+$/, "");
    const paPres = await ctl("a", "/presence").catch(() => ({ presence: [] }));
    const pbPres = await ctl("b", "/presence").catch(() => ({ presence: [] }));
    learnedA = (pa.peers || []).some(x => (x.id || x.peer) === ids.b.peer_id && (x.state || 0) >= 2 && locOf(x))
            && (paPres.presence || []).some(x => (x.peer || x.peer_id || x.id) === ids.b.peer_id);
    learnedB = (pb.peers || []).some(x => (x.id || x.peer) === ids.a.peer_id && (x.state || 0) >= 2 && locOf(x))
            && (pbPres.presence || []).some(x => (x.peer || x.peer_id || x.id) === ids.a.peer_id);
    if (!learnedA || !learnedB) for (const n of ["a", "b"]) await ctl(n, "/discover", { conn: 1 }).catch(() => {});
  }
  learnedA && learnedB
    ? ok("wire-peer-table", "peers bound to live conns through the shared relay — routes exist")
    : noted("wire-peer-table", `a→b=${learnedB} b→a=${learnedA} — sends below exercise the real route state`);
  await sleep(2000); /* settle: presence beacons finish contact registration */

  ids.a.peer_id !== ids.b.peer_id
    ? ok("wire-distinct-peers", `a=${ids.a.peer_id.slice(0, 10)}… b=${ids.b.peer_id.slice(0, 10)}…`)
    : bad("wire-distinct-peers", "peers share identity");

  /* sealed exchange both directions — the mesh's first real traffic */
  const tagA = `officer-a→b ${Date.now()}`;
  const sA = await ctl("a", "/send", { to: ids.b.peer_id, body_b64: Buffer.from(tagA).toString("base64") });
  let got = null;
  /* phone-layer delivery runs ~10s end-to-end (sender tick → relay →
     receiver tick) — poll well past that before filing a miss */
  for (let i = 0; i < 45 && !got; i++) {
    await sleep(700);
    const ib = await ctl("b", "/inbox");
    got = ib.inbox.find(x => Buffer.from(x.body_b64, "base64").toString() === tagA);
  }
  if (!(got && got.from === ids.a.peer_id)) {
    const [ca, cb, ibDump] = [await ctl("a", "/counters").catch(() => ({})), await ctl("b", "/counters").catch(() => ({})),
                              await ctl("b", "/inbox").catch(() => ({ inbox: [] }))];
    f("wire-sealed-exchange", "OPEN", `send=${JSON.stringify(sA).slice(0, 90)} delivery=${!!got} `
      + `a.fwd=${ca.forwarded}/rcv=${ca.received} b.fwd=${cb.forwarded}/rcv=${cb.received} `
      + `a.drops=${ca.dmsg_dropped}/${ca.route_nohop}nh b.drops=${cb.dmsg_dropped}/${cb.route_nohop}nh `
      + `b.inbox=[${(ibDump.inbox || []).map(x => (x.body_b64 || "").slice(0, 24)).join(",")}]`, "high");
  } else ok("wire-sealed-exchange", "sealed envelope A→B through live relay — sender verified");

  const tagB = `officer-b→a ${Date.now()}`;
  const sB = await ctl("b", "/send", { to: ids.a.peer_id, body_b64: Buffer.from(tagB).toString("base64") });
  let got2 = null;
  for (let i = 0; i < 45 && !got2; i++) {
    await sleep(700);
    const ib = await ctl("a", "/inbox");
    got2 = ib.inbox.find(x => Buffer.from(x.body_b64, "base64").toString() === tagB);
  }
  got2 && got2.from === ids.b.peer_id
    ? ok("wire-sealed-reply", "sealed reply B→A — bidirectional mesh live")
    : f("wire-sealed-reply", "OPEN", `send=${JSON.stringify(sB).slice(0, 90)} delivery=${!!got2}`, "high");

  /* partition honesty: kill the shared relay — traffic must not leak
     through a dead path; restore → re-dial → delivery resumes */
  try { relayProc.kill("SIGKILL"); } catch {}
  await sleep(500);
  await sleep(1500);
  const tagP = `partition ${Date.now()}`;
  let sendRes = null;
  try { sendRes = await ctl("a", "/send", { to: ids.b.peer_id, body_b64: Buffer.from(tagP).toString("base64") }); }
  catch (e) { sendRes = { error: String(e) }; }
  await sleep(2500);
  const ibDead = await ctl("b", "/inbox").catch(() => ({ inbox: [] }));
  const leaked = (ibDead.inbox || []).some(x => Buffer.from(x.body_b64, "base64").toString() === tagP);
  !leaked
    ? ok("partition-honest", `relay dead → no silent leak (send=${JSON.stringify(sendRes).slice(0, 80)})`)
    : bad("partition-honest", "message crossed a dead relay");

  relayProc = spawnRelay();
  const relayBack = await waitRelay();
  if (!relayBack || relayProc.exitCode !== null)
    f("partition-recover", "OPEN", "relay did not come back under our handle — cannot verify recovery honestly", "medium");
  else {
  await ctl("a", "/dial", { url: `ws://localhost:${RELAY_PORT}/ws`, remote: Z });
  await ctl("b", "/dial", { url: `ws://localhost:${RELAY_PORT}/ws`, remote: Z });
  await sleep(2500);
  const tagR = `restored ${Date.now()}`;
  await ctl("a", "/send", { to: ids.b.peer_id, body_b64: Buffer.from(tagR).toString("base64") });
  let got3 = null;
  for (let i = 0; i < 25 && !got3; i++) {
    await sleep(600);
    const ib = await ctl("b", "/inbox").catch(() => ({ inbox: [] }));
    got3 = (ib.inbox || []).find(x => Buffer.from(x.body_b64, "base64").toString() === tagR);
  }
  got3
    ? ok("partition-recover", "relay restored + re-dialed → sealed delivery resumed")
    : f("partition-recover", "OPEN", "delivery did not resume after relay restore", "medium");
  }
}

/* ---------- emit ---------- */
const prior = fs.existsSync(FINDINGS) ? JSON.parse(fs.readFileSync(FINDINGS, "utf8")) : { findings: [] };
const merged = { generated: new Date().toISOString(),
  findings: [...(prior.findings || []).filter((x) => x.team !== "OFFR"), ...findings] };
fs.mkdirSync(path.dirname(FINDINGS), { recursive: true });
fs.writeFileSync(FINDINGS, JSON.stringify(merged, null, 2));

const tally = findings.reduce((a, x) => (a[x.verdict] = (a[x.verdict] || 0) + 1, a), {});
console.log(`\nOFFR sweep: ${findings.length} probes — ${JSON.stringify(tally)}`);

if (!KEEP) procs.forEach((p) => { try { p.kill(); } catch {} });
process.exit(findings.some((x) => x.verdict === "EXPLOITED" || x.verdict === "ERROR") ? 1 : 0);
