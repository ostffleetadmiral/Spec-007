// hydra-node.mjs — one Hydra peer: client AND server AND ledger.
//   server side : spawned relay child (family/Rations server.js)
//   client side : this process's WASM node dialing peers' relays
//   ledger side : chain_init(seed) — global identity = sha256(pk)
//
// Env: NAME, RELAY_PORT (0 = no embedded relay), CONTROL_PORT,
//      SEED_HEX (32B hex identity seed; random if absent),
//      RATIONS_DIR (default /rations), WASM (rations.wasm path),
//      PRESENCE_MS (beacon period, default 5000), ID_DIR (drop dir).
import fs from "node:fs";
import http from "node:http";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCore, hex, unhex, enc, dec, sleep } from "./harness.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NAME = process.env.NAME || `node-${process.pid}`;
const RELAY_PORT = parseInt(process.env.RELAY_PORT || "0", 10);
const CONTROL_PORT = parseInt(process.env.CONTROL_PORT || "9090", 10);
const RATIONS_DIR = process.env.RATIONS_DIR || "/rations";
const WASM = process.env.WASM || path.resolve(HERE, "../site/apps/rations/rations.wasm");
const PRESENCE_MS = parseInt(process.env.PRESENCE_MS || "5000", 10);
const ID_DIR = process.env.ID_DIR || "/run/hydra";
/* control-plane gate: when HYDRA_TOKEN is set every endpoint except
   /healthz requires the x-hydra-token header. The lab publishes these
   ports on 0.0.0.0 — the token is the difference between a control API
   and a remote root shell on the node's dial/send surface. */
const CONTROL_TOKEN = process.env.HYDRA_TOKEN || "";

/* identity seed: env override → persisted file → fresh. A Hydra node's
   ledger identity is hash(pk); it must survive restarts, so the seed is
   pinned to ID_DIR (a docker volume in the lab). */
const seedFile = path.join(ID_DIR, `seed-${NAME}.hex`);
let seed;
try { seed = process.env.SEED_HEX ? unhex(process.env.SEED_HEX) : unhex(fs.readFileSync(seedFile, "utf8").trim()); }
catch {
  seed = crypto.getRandomValues(new Uint8Array(32));
  try { fs.mkdirSync(ID_DIR, { recursive: true }); fs.writeFileSync(seedFile, hex(seed)); } catch {}
}
const c = await loadCore(WASM);
const { ex, wr, outBuf, mem, u32, setConnCloseHook } = c;

/* ---------- identity + ledger ---------- */
const sp = wr(seed), pkp = outBuf(32), skp = outBuf(64);
ex.rations_ed25519_keypair_seed(sp, 32, pkp, skp);
const pk = mem(pkp, 32).slice();
ex.rations_free(sp); ex.rations_free(pkp); ex.rations_free(skp);
const sidp = wr(seed); ex.rations_phone_set_identity(sidp); ex.rations_free(sidp);
const peerBuf = outBuf(32); ex.rations_p2p_peer_id(peerBuf);
const peerId = mem(peerBuf, 32).slice(); ex.rations_free(peerBuf);
ex.rations_chain_init(wr(seed), 32);
const ledgerPtr = wr(pk), lidPtr = outBuf(32);
ex.rations_sha256(ledgerPtr, 32, lidPtr);
const ledgerId = mem(lidPtr, 32).slice();
ex.rations_free(ledgerPtr); ex.rations_free(lidPtr);
const phonePkBuf = outBuf(32); ex.rations_phone_pk(phonePkBuf);
const phonePk = mem(phonePkBuf, 32).slice(); ex.rations_free(phonePkBuf);

const info = { name: NAME, peer_id: hex(peerId), phone_pk: hex(phonePk), pk: hex(pk), ledger_id: hex(ledgerId) };

/* ---------- wasm helpers ---------- */
function jread(fn, cap) {
  const op = outBuf(cap), lp = outBuf(4);
  const ok = fn(op, cap, lp);
  const n = u32(lp);
  const out = ok && n ? dec.decode(mem(op, n)) : null;
  ex.rations_free(op); ex.rations_free(lp);
  return out;
}
const peersJson = () => jread((o, cp, l) => ex.rations_p2p_peers_json(o, cp, l), 16384);
const presenceJson = () => jread((o, cp, l) => ex.rations_phone_presence_json(o, cp, l), 16384);
const inboxJson = () => jread((o, cp, l) => ex.rations_phone_inbox_json(o, cp, l), 4 * 1024 * 1024);

function presenceWire(status, text) {
  const t = enc.encode(text || "");
  const w = new Uint8Array(33 + t.length);
  w[0] = status; w.set(phonePk, 1); w.set(t, 33);
  return w;
}
function publishPresence(status, text) {
  const t = enc.encode(text || NAME);
  const p = wr(t);
  return ex.rations_phone_presence_publish(status, p, t.length);
}
/* directed presence — crosses segments via relay_route */
function sendPresenceTo(targetHex, status, text) {
  const wire = presenceWire(status, text || NAME);
  const tp = wr(unhex(targetHex)), pp = wr(wire);
  const ok = ex.rations_p2p_relay_send(tp, 32, 17, pp, wire.length);
  ex.rations_free(tp); ex.rations_free(pp);
  return !!ok;
}
function lastErr() {
  const code = ex.rations_last_error ? ex.rations_last_error() : 0;
  let msg = "";
  if (ex.rations_last_error_msg) { const p = outBuf(256); const n = ex.rations_last_error_msg(p, 256); msg = dec.decode(mem(p, n).slice()); ex.rations_free(p); }
  return { code, msg };
}
function phoneSend(targetHex, body) {
  const tp = wr(unhex(targetHex)), bp = wr(enc.encode(body));
  const ok = ex.rations_phone_send(tp, 0, bp, body.length);
  const err = ok ? null : lastErr();
  ex.rations_free(tp); ex.rations_free(bp);
  return { ok: !!ok, err };
}
/* identity announce: a .connect frame (msg_type 0) carrying our 16-byte
   location — receivers register our REAL peer_id on their conn, which is
   what routeToPeer needs for multi-hop relay_route. No upstream sender
   existed, so without this every table holds only the dial sentinel. */
function announce() {
  const lp = wr(peerId.slice(0, 16));
  const ok = ex.rations_p2p_broadcast(0, lp, 16);
  ex.rations_free(lp);
  return !!ok;
}
/* persistent dials: a Hydra node re-dials lost links — relay heartbeat
   kills and impairment drops must not strand the node. Backoff 1s→15s. */
const dials = new Map(); /* conn_id → {url, remote, tries} */
function dial(url, remoteHex) {
  const up = wr(enc.encode(url)), rp = wr(unhex(remoteHex || "00".repeat(32)));
  const id = ex.rations_p2p_connect(up, url.length, rp, 32);
  ex.rations_free(up); ex.rations_free(rp);
  if (id) dials.set(id, { url, remote: remoteHex || "00".repeat(32), tries: 0 });
  /* the ws connect is async — announce once open-ish, again later to
     cover slow WAN edges */
  setTimeout(announce, 400).unref();
  setTimeout(announce, 2000).unref();
  return id;
}
setConnCloseHook((id) => {
  const d = dials.get(id);
  if (!d) return;
  dials.delete(id);
  const wait = Math.min(1000 * 2 ** d.tries, 15000);
  setTimeout(() => { try { dial(d.url, d.remote); } catch {} }, wait).unref();
});
function chainTip() { const p = outBuf(32); ex.rations_chain_tip_hash(p); const h = mem(p, 32).slice(); ex.rations_free(p); return hex(h); }
function addTx(action, payload, ts, nonce) {
  const pp = wr(payload), ss = wr(seed);
  const ok = ex.rations_chain_add_tx(action, pp, payload.length, ss, 32, BigInt(ts || Date.now()), BigInt(nonce || 0));
  ex.rations_free(pp); ex.rations_free(ss);
  return !!ok;
}
function proposalHash(type, payload, ts) {
  const pp = wr(payload), pr = wr(pk), op = outBuf(32);
  const ok = ex.rations_consensus_proposal_hash(type, pp, payload.length, pr, BigInt(ts || Date.now()), op);
  const h = ok ? mem(op, 32).slice() : null;
  ex.rations_free(pp); ex.rations_free(pr); ex.rations_free(op);
  return h ? hex(h) : null;
}
function createVote(propHex, approve) {
  const ph = wr(unhex(propHex)), ss = wr(seed), vo = outBuf(32), so = outBuf(64);
  const ok = ex.rations_consensus_create_vote(ph, approve ? 1 : 0, ss, vo, so);
  const r = ok ? { voter: hex(mem(vo, 32).slice()), sig: hex(mem(so, 64).slice()) } : null;
  [ph, ss, vo, so].forEach((p) => ex.rations_free(p));
  return r;
}
function verifyVote(propHex, voterHex, approve, sigHex) {
  const ph = wr(unhex(propHex)), vp = wr(unhex(voterHex)), sp2 = wr(unhex(sigHex));
  const ok = ex.rations_consensus_verify_vote(ph, vp, approve ? 1 : 0, sp2);
  [ph, vp, sp2].forEach((p) => ex.rations_free(p));
  return !!ok;
}

/* ---------- embedded relay (the server half) ---------- */
let relayProc = null;
if (RELAY_PORT > 0) {
  relayProc = spawn(process.execPath, [path.join(RATIONS_DIR, "src/relay/server.js")], {
    env: { ...process.env, RATIONS_PORT: String(RELAY_PORT), RATIONS_STATIC_ROOT: path.join(RATIONS_DIR, "src") },
    stdio: ["ignore", "pipe", "pipe"],
  });
  relayProc.stdout.on("data", () => {});
  relayProc.stderr.on("data", (d) => console.error(`[${NAME}/relay]`, String(d).trim()));
  relayProc.on("exit", (code) => console.error(`[${NAME}] relay exited ${code}`));
}

/* ---------- presence loop: broadcast + directed beacons ---------- */
setInterval(() => {
  try {
    ex.rations_phone_tick(BigInt(PRESENCE_MS));
    if (!ex.rations_p2p_peer_count()) return;
    announce();
    publishPresence(1, NAME);
    let peers; try { peers = JSON.parse(peersJson() || "[]"); } catch { return; }
    for (const p of peers) {
      const pid = p.peer_id || p.id || p.peer;
      if (pid && pid !== info.peer_id && !/^0+$/.test(pid)) sendPresenceTo(pid, 1, NAME);
    }
  } catch { /* beacon failure is not fatal */ }
}, PRESENCE_MS).unref();

/* ---------- identity drop file (bootstrap discovery) ---------- */
try { fs.mkdirSync(ID_DIR, { recursive: true }); fs.writeFileSync(path.join(ID_DIR, `id-${NAME}.json`), JSON.stringify(info)); } catch {}

/* ---------- control API ---------- */
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  const send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
  let body = "";
  req.on("data", (d) => body += d);
  await new Promise((r) => req.on("end", r));
  const j = body ? JSON.parse(body) : {};
  try {
    if (CONTROL_TOKEN && u.pathname !== "/healthz" && req.headers["x-hydra-token"] !== CONTROL_TOKEN)
      return send(401, { error: "unauthorized" });
    switch (u.pathname) {
      case "/healthz": return send(200, { ok: true, name: NAME });
      case "/id": return send(200, info);
      case "/peers": return send(200, { peers: JSON.parse(peersJson() || "[]"), count: ex.rations_p2p_peer_count() });
      case "/presence": return send(200, { presence: JSON.parse(presenceJson() || "[]") });
      case "/inbox": { ex.rations_phone_tick(1000n);
        const raw = inboxJson();
        if (raw === null) {
          // serialize overflowed the read buffer — surface it instead of
          // silently presenting an empty inbox
          return send(200, { inbox: [], inbox_overflow: true, count: Number(ex.rations_phone_inbox_count ? ex.rations_phone_inbox_count() : -1) });
        }
        return send(200, { inbox: JSON.parse(raw) }); }
      case "/counters": return send(200, {
        forwarded: Number(ex.rations_p2p_relayed_forwarded()),
        received: Number(ex.rations_p2p_relayed_received()),
        peers: ex.rations_p2p_peer_count(),
        /* drop-plane counters (R-lab): frames that arrived but died
           inbound — previously invisible behind catch {}. */
        dmsg_dropped: Number(ex.rations_p2p_dmsg_dropped ? ex.rations_p2p_dmsg_dropped() : 0),
        dmsg_drop_kind: ex.rations_p2p_dmsg_drop_kind ? ex.rations_p2p_dmsg_drop_kind() : 0,
        route_nohop: Number(ex.rations_p2p_route_nohop ? ex.rations_p2p_route_nohop() : 0),
        route_dead: Number(ex.rations_p2p_route_dead ? ex.rations_p2p_route_dead() : 0),
        route_dup: Number(ex.rations_p2p_route_dup ? ex.rations_p2p_route_dup() : 0),
      });
      case "/dial": return send(200, { conn: dial(j.url, j.remote) });
      case "/discover": return send(200, { ok: ex.rations_p2p_discover_peers(j.conn || 1) });
      case "/presence/publish": return send(200, { ok: publishPresence(j.status ?? 1, j.text) });
      case "/presence/send": return send(200, { ok: sendPresenceTo(j.to, j.status ?? 1, j.text) });
      case "/send": return send(200, phoneSend(j.to, Buffer.from(j.body_b64, "base64").toString()));
      case "/ledger": return send(200, { height: Number(ex.rations_chain_height()), tip: chainTip(), verify: !!ex.rations_chain_verify(), ledger_id: info.ledger_id });
      case "/ledger/tx": return send(200, { ok: addTx(j.action ?? 0, Buffer.from(j.payload_b64 || "", "base64"), j.ts, j.nonce) });
      case "/ledger/mine": { const h = ex.rations_chain_mine_block(BigInt(j.ts || Date.now())); return send(200, { height: Number(h), tip: chainTip() }); }
      case "/consensus/proposal": return send(200, { hash: proposalHash(j.type ?? 0, Buffer.from(j.payload_b64 || "", "base64"), j.ts) });
      case "/consensus/vote": return send(200, createVote(j.proposal, j.approve) || { error: "vote failed" });
      case "/consensus/verify": return send(200, { ok: verifyVote(j.proposal, j.voter, j.approve, j.sig) });
      default: return send(404, { error: "unknown" });
    }
  } catch (e) { return send(500, { error: String(e && e.message || e) }); }
});
server.listen(CONTROL_PORT, "0.0.0.0", () => {
  console.log(`[hydra:${NAME}] control :${CONTROL_PORT} relay :${RELAY_PORT || "off"} peer ${info.peer_id.slice(0, 12)}… ledger ${info.ledger_id.slice(0, 12)}…`);
});
