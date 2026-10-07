#!/usr/bin/env node
// fleet-map.mjs — DNS-free address book for the sovereign mesh.
//
// The transport layer trusts seals, not names: this probe discovers each
// member's LIVE addresses and emits a signed-shape JSON the other gates
// consume via FLEET_MAP. Replaces DNS for mesh-internal rendezvous —
// entries are measured, not asserted.
//
//   node fleet-map.mjs          # print map to stdout
//   node fleet-map.mjs --emit   # + write security/out/fleet-map.json
//
// Members: digit (self), sheraton (LAN), qstar001/fano001 (ESP32 mesh).
import dgram from "node:dgram";
import http from "node:http";
import { execFile, execSync } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT  = path.join(HERE, "out", "fleet-map.json");
const SHERATON = process.env.SHERATON_SSH ?? "admpaul@192.168.12.210";

const getJson = (url, timeout = 4000) => new Promise((res) => {
  /* 'timeout' needs an explicit handler — without it the socket just
     hangs on unreachable mesh IPs (no error event, promise never
     resolves) */
  const r = http.get(url, (r2) => {
    let b = ""; r2.on("data", c => b += c);
    r2.on("end", () => { try { res(JSON.parse(b)); } catch { res(null); } });
  });
  r.setTimeout(timeout, () => r.destroy());
  r.on("error", () => res(null));
});

/* --- self --- */
function selfAddrs() {
  const v4 = {}, v6g = [], v6u = [];
  try {
    for (const i of JSON.parse(execSync("ip -j addr show").toString())) {
      for (const a of i.addr_info ?? []) {
        if (!a.local) continue;
        if (a.family === "inet" && !a.local.startsWith("127.") &&
            !a.local.startsWith("172.1")) v4[i.ifname] = a.local;
        if (a.family === "inet6" && a.scope === "global") {
          const tmp = (a.flags ?? []).includes("temporary") || a.temporary;
          if (a.local.startsWith("fd")) v6u.push(a.local);
          else if (!tmp) v6g.push(a.local);   /* stable globals only */
        }
      }
    }
  } catch {}
  return { v4, v6_global: v6g, v6_ula: v6u };
}

/* --- sheraton via ssh --- */
async function sheraton() {
  try {
    const { stdout } = await run("ssh",
      ["-o", "BatchMode=yes", "-o", "ConnectTimeout=5",
       "-o", "StrictHostKeyChecking=accept-new", SHERATON,
       "hostname; ip -6 addr show scope global | grep -oP 'inet6 \\K[0-9a-f:]+' | grep -v ^fd; ip -4 addr show | grep -oP 'inet \\K[0-9.]+' | grep -v ^127"],
      { timeout: 15_000 });
    const L = stdout.trim().split("\n");
    return { reachable: true, host: L[0], v6: L.slice(1).filter(x => x.includes(":")),
             v4: L.filter(x => /^\d+\.\d+\.\d+\.\d+$/.test(x) && !x.startsWith("172.17")) };
  } catch { return { reachable: false }; }
}

/* --- ESP32 nodes via mesh API --- */
async function nodeAt(ip) {
  const p = await getJson(`http://${ip}/api/project`);
  if (!p?.node) return { ip, reachable: false };
  return { ip, reachable: true, name: p.node, sta_ip: p.sta_ip,
           rssi: p.rssi, engine: p.engine,
           cell: p.cell, phase: p.node_phase };
}

const self = selfAddrs();
const sher = await sheraton();
const nodeA = await nodeAt(process.env.FANO_NODE_IP ?? "192.168.4.1");
const nodeB = await nodeAt(process.env.FANO_NODE_B  ?? "192.168.4.3");

/* authoritative binding: name → ordered transport preference */
const map = {
  spec: "FLEETMAPv1",
  generated: new Date().toISOString(),
  note: "DNS-free: entries measured by probe; transport trusts FNV-256 seals, not names",
  members: {
    digit:    { role: "edge-gateway+bridge", ...self,
                gateway: { udp6: GATE(), mesh_v4: self.v4.wlan1 } },
    sheraton: { role: "fleet-peer", ...sher,
                ssh: sher.reachable ? SHERATON : null },
    qstar001: { role: "mesh-node", ...nodeA, udp: [nodeA.ip, nodeA.sta_ip].filter(Boolean).map(ip => `${ip}:7777`) },
    fano001:  { role: "mesh-node", ...nodeB, udp: [nodeB.ip].filter(Boolean).map(ip => `${ip}:7777`) },
  },
};
function GATE() { const g = self.v6_global[0]; return g ? `[${g}]:9779` : null; }

console.log(JSON.stringify(map, null, 2));
if (process.argv.includes("--emit")) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(map, null, 2));
  console.error(`fleet-map → ${OUT}`);
}
