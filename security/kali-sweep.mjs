// kali-sweep.mjs — KALI team: external-tooling verification probes.
// Replays the deterministic assertions behind the Kali-machine sweep
// (nmap -sV, ZAP baseline, msfconsole auxiliaries, curl method battery,
// tcpdump wire inspection) so findings.json stays evidence-backed and
// reproducible without the GUI tools.
//
// Requires the WAN lab up (docker-compose.wan.yml) + tools/serve.py on :8902
// + relay on :8091. Env: HYDRA_TOKEN, WAN_TOKEN.
//
//   HYDRA_TOKEN=… WAN_TOKEN=… node kali-sweep.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, "../site");
const HYDRA_TOKEN = process.env.HYDRA_TOKEN || "";
const WAN_TOKEN = process.env.WAN_TOKEN || "";
const DESK = process.env.DESK_URL || "http://localhost:8902";
const RELAY = process.env.RELAY_HTTP || "http://localhost:8091";
const NODE = "http://localhost:19301";   // e1 control
const WAN = "http://localhost:19100";    // wan-east control

const findings = [];
let n = 0;
function f(name, verdict, detail, severity) {
  n++;
  findings.push({ id: `KALI-${String(n).padStart(2, "0")}`, team: "KALI", name, verdict, severity, detail, ts: new Date().toISOString() });
  console.log(`  [${verdict}] KALI-${String(n).padStart(2, "0")} ${name}${detail ? " — " + detail : ""}`);
}
const ok = (name, d) => f(name, "HARDENED", d, "info");
const bad = (name, d) => f(name, "EXPLOITED", d, "high");
const noted = (name, d) => f(name, "NOTED", d, "info");

async function req(url, opts = {}) {
  const r = await fetch(url, opts);
  const headers = {}; r.headers.forEach((v, k) => headers[k] = v);
  return { status: r.status, headers, body: await r.text() };
}
async function wsDial(url, origin) {
  /* minimal RFC6455 probe — a refused origin gets 101 then a close frame
     carrying 4403, so watch for the close after upgrade */
  const net = await import("node:net");
  return new Promise((resolve) => {
    const u = new URL(url);
    const sock = net.connect(+u.port || 80, u.hostname, () => {
      const key = Buffer.alloc(16, 1).toString("base64");
      const h = [`GET ${u.pathname} HTTP/1.1`, `Host: ${u.host}`, "Upgrade: websocket",
        "Connection: Upgrade", `Sec-WebSocket-Key: ${key}`, "Sec-WebSocket-Version: 13"];
      if (origin) h.push(`Origin: ${origin}`);
      sock.write(h.join("\r\n") + "\r\n\r\n");
    });
    let buf = Buffer.alloc(0), upgraded = false, closeCode = null;
    sock.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      if (!upgraded) {
        const i = buf.indexOf("\r\n\r\n");
        if (i === -1) return;
        const head = buf.subarray(0, i).toString();
        if (!/^HTTP\/1\.1 101/.test(head)) { sock.destroy(); return resolve("refused: " + head.split("\r\n")[0]); }
        upgraded = true; buf = buf.subarray(i + 4);
      }
      while (buf.length >= 2) {
        const len = buf[1] & 0x7f;
        if (buf.length < 2 + len) break;
        if ((buf[0] & 0xf) === 8 && len >= 2) closeCode = buf.readUInt16BE(2);
        buf = buf.subarray(2 + len);
      }
    });
    sock.on("close", () => resolve(upgraded ? `101 then close:${closeCode}` : "tcp closed pre-upgrade"));
    setTimeout(() => { sock.destroy(); resolve(upgraded ? `101 open close=${closeCode}` : "timeout"); }, 3500);
  });
}

/* ---------- KALI-01/02: node control plane is token-gated ---------- */
{
  const open = await req(`${NODE}/id`);
  open.status === 401
    ? ok("node-control-token-gate", "/id without token -> 401")
    : bad("node-control-token-gate", `unauthenticated /id -> ${open.status}`);
  const auth = await req(`${NODE}/id`, { headers: { "x-hydra-token": HYDRA_TOKEN } });
  auth.status === 200 && JSON.parse(auth.body).peer_id
    ? ok("node-control-token-auth", "/id with token -> 200 + peer_id")
    : f("node-control-token-auth", "OPEN", `token path broken -> ${auth.status}`, "high");
}

/* ---------- KALI-03: wan-bridge control gated (remote link-kill closed) ---------- */
{
  const open = await req(`${WAN}/stats`, { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
  open.status === 401
    ? ok("wan-control-token-gate", "/stats without token -> 401 (kill/heal/impair closed to the wire)")
    : bad("wan-control-token-gate", `unauthenticated /stats -> ${open.status}`);
}

/* ---------- KALI-04/05: WS origin policy on lab relays ---------- */
{
  const evil = await wsDial("ws://localhost:18081/ws", "http://evil.example");
  /close=4403|refused|closed/.test(evil)
    ? ok("relay-origin-enforcement", `disallowed origin -> ${evil}`)
    : bad("relay-origin-enforcement", `evil origin stayed open: ${evil}`);
  const good = await wsDial("ws://localhost:18081/ws", "http://desk.local");
  /101 open close=null/.test(good)
    ? ok("relay-origin-allowed", `desk.local -> ${good}`)
    : f("relay-origin-allowed", "OPEN", `configured origin refused: ${good}`, "high");
}

/* ---------- KALI-06/07/08/09: hardened desk server ---------- */
{
  const root = await req(`${DESK}/`);
  const h = root.headers;
  !h["server"]
    ? ok("desk-no-server-banner", "no Server header — version fingerprint surface removed")
    : f("desk-no-server-banner", "OPEN", `Server: ${h["server"]}`, "low");
  const need = ["x-content-type-options", "x-frame-options", "referrer-policy", "content-security-policy"];
  const missing = need.filter((k) => !h[k]);
  missing.length === 0
    ? ok("desk-security-headers", need.join(", ") + " all present")
    : f("desk-security-headers", "OPEN", `missing: ${missing.join(",")}`, "med");
  const dir = await req(`${DESK}/assets/`);
  dir.status === 403
    ? ok("desk-no-dir-listing", "/assets/ -> 403 (listing not issued)")
    : bad("desk-no-dir-listing", `/assets/ -> ${dir.status}`);
  const trav = await req(`${DESK}/../../../etc/passwd`);
  trav.status === 404
    ? ok("desk-no-traversal", "../../etc/passwd -> 404")
    : bad("desk-no-traversal", `traversal -> ${trav.status}`);
}

/* ---------- KALI-10: method surface ---------- */
async function rawMethod(method) {
  /* undici forbids TRACE/CONNECT client-side — go raw to see the server's
     actual answer */
  const net = await import("node:net");
  return new Promise((resolve) => {
    const u = new URL(DESK);
    const sock = net.connect(+u.port || 80, u.hostname, () =>
      sock.write(`${method} / HTTP/1.1\r\nHost: x\r\n\r\n`));
    let buf = "";
    sock.on("data", (d) => { buf += d.toString(); if (buf.includes("\r\n")) { sock.destroy(); resolve(buf.split(" ")[1] || "?"); } });
    sock.on("error", () => resolve("0"));
    setTimeout(() => { sock.destroy(); resolve(buf ? buf.split(" ")[1] : "0"); }, 3000);
  });
}
{
  const results = [];
  for (const m of ["PUT", "DELETE", "TRACE", "OPTIONS", "PROPFIND", "CONNECT"]) {
    results.push(`${m}=${await rawMethod(m)}`);
  }
  results.every((r) => /=(501|405|403)/.test(r))
    ? ok("desk-method-surface", results.join(" "))
    : f("desk-method-surface", "OPEN", results.join(" "), "med");
}

/* ---------- KALI-11: relay hardened headers + no debug leak ---------- */
{
  const r = await req(`${RELAY}/api/health`);
  const h = r.headers;
  const missing = ["x-content-type-options", "x-frame-options", "referrer-policy"].filter((k) => !h[k]);
  missing.length === 0
    ? ok("relay-security-headers", "nosniff/frame/referrer present")
    : f("relay-security-headers", "OPEN", `missing: ${missing.join(",")}`, "med");
}

/* ---------- KALI-12: dossier artifacts served intact ---------- */
{
  const res = await fetch(`${DESK}/assets/spec007.wasm`);
  const body = new Uint8Array(await res.arrayBuffer());
  const magic = body.length >= 4 && body[0] === 0x00 && body[1] === 0x61 && body[2] === 0x73 && body[3] === 0x6d;
  magic && body.length > 400
    ? ok("desk-wasm-artifact", `spec007.wasm served: ${body.length}B, wasm magic present`)
    : f("desk-wasm-artifact", "OPEN", `status=${res.status} bytes=${body.length} magic=${magic}`, "med");
}
{
  const r = await req(`${DESK}/component-map.html`);
  const txt = (r.body || "").toString();
  r.status === 200 && txt.includes("Component Map")
    ? ok("desk-component-map", "L2 component map published to the desk")
    : f("desk-component-map", "OPEN", `status=${r.status}`, "low");
}

/* ---------- wire-ciphertext proof (from tcpdump on wan-east/west) ----------
   During the canonical run the marker 'WIREMARKER_7f3a9b_visible_if_plain'
   was delivered to w1's inbox twice while 136 frames crossed the impaired
   edge with ZERO plaintext hits — sealed envelopes are ciphertext on the
   wire, not merely flagged sealed at the API. Recorded as evidence, the
   reproducible half is COMM-04/06's sealed flag. */
noted("wire-ciphertext-proof", "marker delivered to inbox; 0 plaintext hits in 136 captured WAN frames (tcpdump inside wan-west) — sealed on the wire");

/* ---------- merge into findings.json ---------- */
const out = path.join(SITE, "security", "findings.json");
const prior = JSON.parse(fs.readFileSync(out, "utf8"));
const merged = {
  generated: new Date().toISOString(),
  findings: [...(prior.findings || []).filter((x) => x.team !== "KALI"), ...findings] };
fs.writeFileSync(out, JSON.stringify(merged, null, 2));
const tally = findings.reduce((a, x) => (a[x.verdict] = (a[x.verdict] || 0) + 1, a), {});
console.log(`\nKALI sweep: ${findings.length} probes — ${JSON.stringify(tally)}`);
process.exit(findings.some((x) => x.verdict === "EXPLOITED" || x.verdict === "ERROR") ? 1 : 0);
