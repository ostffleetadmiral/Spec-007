#!/usr/bin/env node
// fleet-manifest.mjs — sign + publish the fleet bulletin to the public
// GitHub repo. Peers fetch it via raw.githubusercontent.com — a globally
// replicated, carrier-unblocked HTTPS endpoint that needs no server of ours.
//
// The manifest is ed25519-signed: fleet members pin the pubkey; the
// bulletin board itself is untrusted transport.
//
//   node fleet-manifest.mjs --emit            # sign → fleet-manifest.json
//   node fleet-manifest.mjs --emit --push     # + git add/commit/push
//   node fleet-manifest.mjs --keygen          # mint keypair (once)
//
// Env: FLEET_PRIVKEY (default ~/.config/fleet/ed25519.pem)
//      FLEET_PUBKEY  (default ~/.config/fleet/ed25519.pub.pem)
import { execFile, execSync } from "node:child_process";
import { promisify } from "node:util";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const OUT  = path.join(ROOT, "fleet-manifest.json");
const KEYDIR  = path.join(os.homedir(), ".config", "fleet");
const PRIV = process.env.FLEET_PRIVKEY ?? path.join(KEYDIR, "ed25519.pem");
const PUB  = process.env.FLEET_PUBKEY  ?? path.join(KEYDIR, "ed25519.pub.pem");

if (process.argv.includes("--keygen")) {
  fs.mkdirSync(KEYDIR, { recursive: true, mode: 0o700 });
  if (fs.existsSync(PRIV)) { console.error("keypair exists — refusing to overwrite"); process.exit(1); }
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  fs.writeFileSync(PRIV, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  fs.writeFileSync(PUB, publicKey.export({ type: "spki", format: "pem" }));
  console.log(`keypair → ${KEYDIR} (pin ${PUB} on all fleet members)`);
  process.exit(0);
}

/* gather our live bindings (same probes as fleet-map) */
function selfAddrs() {
  const v4 = {}, v6g = [];
  try {
    for (const i of JSON.parse(execSync("ip -j addr show").toString()))
      for (const a of i.addr_info ?? []) {
        if (!a.local) continue;
        if (a.family === "inet" && !a.local.startsWith("127.") &&
            !a.local.startsWith("172.1")) v4[i.ifname] = a.local;
        if (a.family === "inet6" && a.scope === "global" &&
            !a.local.startsWith("fd") &&
            !(a.flags ?? []).includes("temporary") && !a.temporary)
          v6g.push(a.local);
      }
  } catch {}
  return { v4, v6_global: v6g };
}

const peers = {};
try { Object.assign(peers, JSON.parse(fs.readFileSync(
  path.join(HERE, "out", "rendezvous.json"), "utf8"))); } catch {}

const addrs = selfAddrs();
const payload = {
  spec: "FLEETMANIFESTv1",
  ts: new Date().toISOString(),
  members: {
    digit: {
      role: "edge-gateway",
      v6_global: addrs.v6_global,
      gateway_udp6: addrs.v6_global.length ? `[${addrs.v6_global[0]}]:9779` : null,
      relay_ws: "ws://<lan-or-hub>:8100/ws",
      note: "inbound filtered by carrier — beacon or relay preferred",
    },
    ...Object.fromEntries(Object.entries(peers).map(([n, p]) => [n, {
      role: "fleet-peer", lastSeen: p.lastSeen,
      addr: p.addr ? `[${p.addr}]:${p.port}` : null,
    }])),
  },
};

if (!fs.existsSync(PRIV)) { console.error(`no signing key — run --keygen first`); process.exit(1); }
const body = JSON.stringify(payload, null, 2);
const sig = crypto.sign(null, Buffer.from(body),
  fs.readFileSync(PRIV)).toString("base64url");

const manifest = { payload: JSON.parse(body), sig_ed25519: sig,
                   pubkey_hint: "sha256:" + crypto.createHash("sha256")
                     .update(fs.readFileSync(PUB)).digest("hex").slice(0, 16) };
fs.writeFileSync(OUT, JSON.stringify(manifest, null, 2));
console.log(`manifest → ${OUT} (sig ${sig.slice(0, 24)}…)`);

if (process.argv.includes("--push")) {
  const { stdout } = await run("git", ["-C", ROOT, "add", "fleet-manifest.json"]);
  await run("git", ["-C", ROOT, "commit", "-m",
    `fleet-manifest: ${payload.ts}`]);
  await run("git", ["-C", ROOT, "push"]);
  console.log("pushed → bulletin board live");
}
