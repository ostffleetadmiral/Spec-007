#!/usr/bin/env node
// fano-wan-gateway.mjs — sealed WAN edge for the Fano mesh.
//
// Binds a UDP socket on the host's global IPv6 (qstar-llm.abrdns.com AAAA)
// and admits ONLY packets that pass fano_verify under the frozen 136-B wire
// dialect — verify-at-the-boundary, then forward into the mesh node.
// Unverified datagrams are dropped and counted; nothing unsigned ever
// reaches the ESP32 radios through this edge.
//
// Env: GATE_PORT=9779   — external listen port (UDP, bound to ::)
//      MESH_NODE=192.168.4.1 — inward delivery target
//      MESH_PORT=7777
//      VERBOSE=1
import dgram from "node:dgram";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verify, build, FANO_WIRE } from "./fano-mesh-bridge.mjs";
const PLEN = 39;   /* wire byte 39 = payload length (frozen contract) */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const RENDEZVOUS = path.join(HERE, "out", "rendezvous.json");

const GATE_PORT = +(process.env.GATE_PORT ?? 9779);
const MESH_NODE = process.env.MESH_NODE ?? "192.168.4.1";
const MESH_PORT = +(process.env.MESH_PORT ?? 7777);
const V         = !!process.env.VERBOSE;

const sock = dgram.createSocket({ type: "udp6", reuseAddr: true });
const fwd  = dgram.createSocket("udp4");   /* inward hop is IPv4 mesh */
const stats = { rx: 0, verified: 0, forwarded: 0, dropped: 0, fwd_err: 0, beacons: 0 };
const peers = {};   /* name → {addr, port, firstSeen, lastSeen, count} */
try { Object.assign(peers, JSON.parse(fs.readFileSync(RENDEZVOUS, "utf8"))); } catch {}

sock.on("message", (msg, rinfo) => {
  stats.rx++;
  if (msg.length !== FANO_WIRE || !verify(msg)) {
    stats.dropped++;
    if (V) console.log(`drop ${rinfo.address}:${rinfo.port} (${msg.length}B, bad seal/size)`);
    return;
  }
  stats.verified++;

  /* control plane: FLEET-BEACON:<name> — rendezvous, never enters the
     cap-8 mesh inbox. The binding is the OBSERVED source addr of a
     seal-verified packet. */
  const plen = Math.min(msg[PLEN], 64);
  const body = msg.subarray(40, 40 + plen).toString();
  if (body.startsWith("FLEET-BEACON:")) {
    const name = body.slice(13).replace(/[^\w.-]/g, "").slice(0, 32) || "anon";
    const now = new Date().toISOString();
    const p = peers[name] ?? { firstSeen: now, count: 0 };
    p.addr = rinfo.address; p.port = rinfo.port;
    p.lastSeen = now; p.count++;
    peers[name] = p;
    stats.beacons++;
    fs.mkdirSync(path.dirname(RENDEZVOUS), { recursive: true });
    fs.writeFileSync(RENDEZVOUS, JSON.stringify(peers, null, 2));
    const ack = build(7, 7, 7, msg[32], msg[33], msg[34],
                      0xACCA, Buffer.from(`FLEET-ACK:${name}`));
    sock.send(ack, rinfo.port, rinfo.address);
    if (V) console.log(`beacon ${name} @ ${rinfo.address}:${rinfo.port} → ack sent`);
    return;
  }

  fwd.send(msg, MESH_PORT, MESH_NODE, (e) => {
    if (e) { stats.fwd_err++; if (V) console.log(`fwd err: ${e.message}`); }
    else stats.forwarded++;
    if (V) console.log(`fwd  ${rinfo.address}:${rinfo.port} → ${MESH_NODE}:${MESH_PORT} plen=${msg[PLEN]}`);
  });
});

sock.on("listening", () => {
  const a = sock.address();
  console.log(`fano-wan-gateway sealed edge on [${a.address}]:${a.port}`);
  console.log(`inward target: ${MESH_NODE}:${MESH_PORT} (seal-gated)`);
});
process.on("SIGINT", () => { console.log("stats:", stats); process.exit(0); });
sock.bind(GATE_PORT, "::");
