#!/usr/bin/env node
// relay-isolation-audit.mjs — deterministic v2 relay subscription gate.
// Spins the real Rations relay, authenticates disposable Ed25519 peers,
// and measures recipient/router/broadcast scope boundaries on the wire.

import net from "node:net";
import crypto from "node:crypto";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { wsConnect, sleep } from "../security/harness.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(HERE, "../../../family/Rations/src/relay/server.js");
const RELAY_TOKEN = `relay-${process.pid.toString(16)}`;
const ROUTER_TOKEN = `router-${process.pid.toString(16)}`;
const AUTH_DOMAIN = "rations-relay-auth-v1";

async function freePort() {
  const srv = net.createServer();
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const port = srv.address().port;
  await new Promise((r) => srv.close(r));
  return port;
}

function frame(type, sender, payload) {
  const h = Buffer.alloc(41);
  h[0] = type;
  Buffer.from(sender).copy(h, 1);
  h.writeUInt32LE(payload.length, 33);
  return Buffer.concat([h, payload]);
}
function route(target, origin, innerType, inner) {
  const h = Buffer.alloc(71);
  Buffer.from(target).copy(h, 0);
  Buffer.from(origin).copy(h, 32);
  h[64] = 8;
  h[66] = innerType;
  h.writeUInt32LE(inner.length, 67);
  return Buffer.concat([h, inner]);
}

async function peer(url, name, router = false) {
  const kp = crypto.generateKeyPairSync("ed25519");
  const pub = Buffer.from(kp.publicKey.export({ format: "der", type: "spki" }).subarray(-32));
  let done;
  const authed = new Promise((r) => { done = r; });
  const protocols = ["rations-relay-v2", `rations-relay-token.${RELAY_TOKEN}`];
  if (router) protocols.push(`rations-router-token.${ROUTER_TOKEN}`);
  const ws = await wsConnect(url, {
    origin: "http://desk.local",
    protocols,
    onText: (text, sock) => {
      let msg = null;
      try { msg = JSON.parse(text); } catch { return; }
      if (!msg || msg.v !== AUTH_DOMAIN) return;
      if (msg.challenge) {
        const challenge = Buffer.from(String(msg.challenge), "hex");
        const pre = Buffer.concat([Buffer.from(AUTH_DOMAIN), challenge, pub]);
        sock.send(JSON.stringify({
          v: AUTH_DOMAIN,
          peer_id: pub.toString("hex"),
          sig: crypto.sign(null, pre, kp.privateKey).toString("hex"),
        }), 0x1);
      } else if (msg.ok) done();
    },
  });
  await authed;
  const frames = [];
  ws.onData = (buf) => frames.push(Buffer.from(buf));
  return { name, ws, frames, peer: pub };
}

const port = await freePort();
const relay = spawn(process.execPath, [SERVER], {
  env: {
    ...process.env,
    RATIONS_PORT: String(port),
    RATIONS_RELAY_TOKEN: RELAY_TOKEN,
    RATIONS_ROUTER_TOKEN: ROUTER_TOKEN,
    RATIONS_RELAY_MODE: "isolated",
    RATIONS_ALLOWED_ORIGINS: "http://desk.local",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let relayLog = "";
relay.stdout.on("data", (d) => { relayLog += d; });
relay.stderr.on("data", (d) => { relayLog += d; });

try {
  const url = `ws://127.0.0.1:${port}/ws`;
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (r.ok) break;
    } catch {}
    await sleep(100);
    if (i === 39) throw new Error("relay never became healthy");
  }

  let anonymousRefused = false;
  try { await wsConnect(url, { origin: "http://desk.local", protocols: ["rations-relay-v2"] }); }
  catch { anonymousRefused = true; }

  const [a, b, c, r] = await Promise.all([
    peer(url, "sender"), peer(url, "target"), peer(url, "observer"), peer(url, "router", true),
  ]);
  a.ws.send(frame(9, a.peer, Buffer.from("bcast")));
  a.ws.send(frame(11, a.peer, route(b.peer, a.peer, 0, Buffer.from("targeted"))));
  a.ws.send(frame(15, a.peer, Buffer.from("unscoped")));
  await sleep(700);

  const has = (p, tail) => p.frames.some((f) => f.subarray(-tail.length).equals(tail));
  const result = {
    anonymousRefused,
    targetReceived: has(b, Buffer.from("targeted")),
    observerRouteIsolated: !has(c, Buffer.from("targeted")),
    routerReceived: has(r, Buffer.from("targeted")),
    broadcastScoped: has(b, Buffer.from("bcast")) && has(c, Buffer.from("bcast")) && has(r, Buffer.from("bcast")),
    unscopedDirectDropped: !has(b, Buffer.from("unscoped")) && !has(c, Buffer.from("unscoped")) && !has(r, Buffer.from("unscoped")),
  };
  for (const p of [a, b, c, r]) p.ws.close();
  console.log(JSON.stringify(result));
  const ok = Object.values(result).every(Boolean);
  if (!ok) {
    console.error(relayLog.trim());
    process.exit(1);
  }
} finally {
  relay.kill("SIGTERM");
}
