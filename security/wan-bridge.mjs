// wan-bridge.mjs — deterministic WAN impairment proxy for WebSocket links.
// Sits between Hydra nodes and relays: accept ws on LISTEN_PORT, open the
// upstream ws, and forward frames both ways through a seeded impairment
// profile: delay/jitter/loss/duplication/reorder/rate-cap, one-way modes,
// kill/heal for partition tests. Live-tunable via HTTP control.
//
// Env: LISTEN_PORT, UPSTREAM (ws://host:port — path preserved from client),
//      DELAY_MS JITTER_MS DROP_PCT DUP_PCT REORDER_PCT RATE_BPS DIR SEED
// Control: GET /stats · POST /impair {…} · POST /kill · POST /heal
import http from "node:http";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RATIONS_DIR = process.env.RATIONS_DIR || path.resolve(HERE, "../../../family/Rations");
const require = createRequire(path.join(RATIONS_DIR, "src/relay/server.js"));
const { WebSocketServer, WebSocket } = require("ws");

const LISTEN_PORT = parseInt(process.env.LISTEN_PORT || "9100", 10);
const UPSTREAM = process.env.UPSTREAM || "ws://localhost:8080";
/* control-plane gate: when WAN_TOKEN is set the HTTP control endpoints
   require x-wan-token. The WS data plane (upgrade handler) stays open —
   it is a wire, not a control surface. */
const CONTROL_TOKEN = process.env.WAN_TOKEN || "";

/* seeded RNG (mulberry32) — same seed → same impairment sequence */
let _s = parseInt(process.env.SEED || "1337", 10);
function rng() {
  _s |= 0; _s = (_s + 0x6D2B79F5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const prof = {
  delay: +process.env.DELAY_MS || 0,
  jitter: +process.env.JITTER_MS || 0,
  drop: +process.env.DROP_PCT || 0,        // percent 0-100
  dup: +process.env.DUP_PCT || 0,
  reorder: +process.env.REORDER_PCT || 0,
  rate: +process.env.RATE_BPS || 0,        // bytes/sec cap, 0=uncapped
  dir: process.env.DIR || "both",          // both|in (client→up)|out (up→client)
  dead: false,
};
const stats = { rx: 0, tx: 0, dropped: 0, duped: 0, delayed: 0, conns: 0, killed: 0 };

/* token bucket for the rate cap */
let bucket = prof.rate, bucketTs = Date.now();
function rateDelay(n) {
  if (!prof.rate) return 0;
  const now = Date.now();
  bucket = Math.min(prof.rate, bucket + (now - bucketTs) * prof.rate / 1000);
  bucketTs = now;
  if (bucket >= n) { bucket -= n; return 0; }
  const wait = (n - bucket) / prof.rate * 1000;
  bucket = 0;
  return wait;
}

function impairThen(data, isBinary, forward, dir) {
  if (prof.dir !== "both" && prof.dir !== dir) { forward(data, isBinary); return; }
  if (prof.dead) { stats.dropped++; return; }
  stats.rx++;
  if (rng() * 100 < prof.drop) { stats.dropped++; return; }
  const dup = rng() * 100 < prof.dup;
  let wait = prof.delay + (prof.jitter ? Math.floor(rng() * prof.jitter) : 0);
  wait += rateDelay(data.length);
  const reorder = rng() * 100 < prof.reorder;
  if (reorder) wait += Math.floor(rng() * 60) + 1; // push back a packet-time
  if (wait > 0) stats.delayed++;
  const deliver = () => { forward(data, isBinary); stats.tx++; if (dup) { forward(data, isBinary); stats.duped++; } };
  if (wait > 0) setTimeout(deliver, wait); else deliver();
}

const wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 * 1024 });
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  const send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
  let body = "";
  req.on("data", (d) => body += d);
  await new Promise((r) => req.on("end", r));
  if (CONTROL_TOKEN && req.headers["x-wan-token"] !== CONTROL_TOKEN)
    return send(401, { error: "unauthorized" });
  switch (u.pathname) {
    case "/stats": return send(200, { ...stats, prof });
    case "/impair": {
      const j = JSON.parse(body || "{}");
      for (const k of ["delay", "jitter", "drop", "dup", "reorder", "rate", "dir"])
        if (j[k] !== undefined) prof[k] = j[k];
      return send(200, { prof });
    }
    case "/kill": prof.dead = true; stats.killed++; return send(200, { dead: true });
    case "/heal": prof.dead = false; return send(200, { dead: false });
    default: return send(404, { error: "unknown" });
  }
});

server.on("upgrade", (req, sock, head) => {
  if (prof.dead) { sock.destroy(); stats.killed++; return; }
  /* the upstream relay enforces an origin allowlist — the bridge is a
     WS client like any node and must present a configured origin */
  const upOpts = { maxPayload: 8 * 1024 * 1024 };
  if (process.env.RATIONS_DIAL_ORIGIN) upOpts.headers = { origin: process.env.RATIONS_DIAL_ORIGIN };
  const up = new WebSocket(UPSTREAM + req.url, upOpts);
  up.on("error", () => { try { sock.destroy(); } catch {} });
  up.on("open", () => {
    wss.handleUpgrade(req, sock, head, (client) => {
      stats.conns++;
      client.on("message", (data, isBinary) =>
        impairThen(data, isBinary, (d, b) => { if (up.readyState === 1) up.send(d, { binary: b }); }, "in"));
      up.on("message", (data, isBinary) =>
        impairThen(data, isBinary, (d, b) => { if (client.readyState === 1) client.send(d, { binary: b }); }, "out"));
      client.on("close", () => up.close());
      up.on("close", () => client.close());
      up.on("error", () => client.close());
      client.on("error", () => up.close());
    });
  });
});

server.listen(LISTEN_PORT, "0.0.0.0", () =>
  console.log(`[wan-bridge] :${LISTEN_PORT} → ${UPSTREAM} | prof ${JSON.stringify(prof)}`));
void crypto; void fs;
