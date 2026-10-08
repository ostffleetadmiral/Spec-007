#!/usr/bin/env node
// fleet-manifest.mjs — sign + publish the fleet bulletin to the public
// GitHub repo. Peers fetch it via raw.githubusercontent.com — a globally
// replicated, carrier-unblocked HTTPS endpoint that needs no server of ours.
//
// The manifest is ed25519-signed: fleet members pin the pubkey; the
// bulletin board itself is untrusted transport.
//
//   node fleet-manifest.mjs                   # dry-run — print payload, write nothing
//   node fleet-manifest.mjs --emit            # sign → fleet-manifest.json + site/
//   node fleet-manifest.mjs --emit --push     # + git add/commit/push (canon pair)
//   node fleet-manifest.mjs --verify          # load-side gate: sig + lineage + parity
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

/* rendezvous entries are measurements, not facts: a peer beaconing once
   months ago must not stay signed into the bulletin. Stale sightings
   are excluded from the payload (the ledger keeps them as evidence). */
const PEER_MAX_AGE_MS = 24 * 3600 * 1000;
const nowMs = Date.now();
const livePeers = {}, stalePeers = [];
for (const [n, p] of Object.entries(peers)) {
  const age = nowMs - Date.parse(p.lastSeen || 0);
  if (Number.isFinite(age) && age <= PEER_MAX_AGE_MS) livePeers[n] = p;
  else stalePeers.push(n);
}

/* genesis anchor: the manifest must cite the fleet's trust root so
   bootstrap can reject manifests that don't descend from genesis */
let genesis_sha256 = null;
try {
  const g = JSON.parse(fs.readFileSync(
    path.join(ROOT, "fleet-genesis.json"), "utf8"));
  genesis_sha256 = crypto.createHash("sha256")
    .update(JSON.stringify(g.payload, null, 2)).digest("hex");
} catch {}

/* signed artifact hashes: the board is untrusted transport, so any
   * downloadable the fleet publishes must carry its sha256 inside the
   * signed payload — a tampered .py or .wasm on the board then fails
   * closed at verification time, not silently at install time. */
const ARTIFACTS = [
  "site/apps/fano/fano.wasm",
  "site/downloads/fano_beacon.py",
  "site/downloads/fano_relay_link.py",
  "site/downloads/fano_dialect.py",
  "site/downloads/fleet_bootstrap.py",
];
const artifacts = {};
for (const a of ARTIFACTS) {
  const p = path.join(ROOT, a);
  if (fs.existsSync(p))
    artifacts[a.replace(/^site\//, "")] =
      "sha256:" + crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

const addrs = selfAddrs();
const payload = {
  spec: "FLEETMANIFESTv1",
  ts: new Date().toISOString(),
  genesis_sha256,
  artifacts,
  members: {
    digit: {
      role: "edge-gateway",
      v6_global: addrs.v6_global,
      gateway_udp6: addrs.v6_global.length ? `[${addrs.v6_global[0]}]:9779` : null,
      relay_ws: "ws://<lan-or-hub>:8100/ws",
      note: "inbound filtered by carrier — beacon or relay preferred",
    },
    ...Object.fromEntries(Object.entries(livePeers).map(([n, p]) => [n, {
      role: "fleet-peer", lastSeen: p.lastSeen,
      /* the beacon's source port is ephemeral — it observed, it does
         not listen. Emit it labeled, never as a dialable address. */
      addr: p.addr || null,
      observed_port: p.port ?? null,
    }])),
  },
};

const EMIT = process.argv.includes("--emit");
const VERIFY = process.argv.includes("--verify");
const PUSH = process.argv.includes("--push");

/* ---- load-side gate: verify the signed bulletin end-to-end ---- */
if (VERIFY) {
  const man = JSON.parse(fs.readFileSync(OUT, "utf8"));
  const body = JSON.stringify(man.payload, null, 2);
  const pub = fs.readFileSync(PUB);
  const okSig = crypto.verify(null, Buffer.from(body), pub,
    Buffer.from(man.sig_ed25519, "base64url"));
  const okSpec = man.payload.spec === "FLEETMANIFESTv1";
  const okGen = man.payload.genesis_sha256 === genesis_sha256;
  const okHint = man.pubkey_hint ===
    "sha256:" + crypto.createHash("sha256").update(pub).digest("hex").slice(0, 16);
  const okTs = Number.isFinite(Date.parse(man.payload.ts || ""));
  const okParity = fs.existsSync(path.join(ROOT, "site", "fleet-manifest.json")) &&
    fs.readFileSync(OUT).equals(
      fs.readFileSync(path.join(ROOT, "site", "fleet-manifest.json")));
  const checks = { spec: okSpec, signature: okSig, genesis_lineage: okGen,
                   pubkey_hint: okHint, ts: okTs, site_parity: okParity };
  for (const [k, v] of Object.entries(checks))
    console.log(`  [${v ? "PASS" : "FAIL"}] ${k}`);
  if (!Object.values(checks).every(Boolean)) process.exit(1);
  console.log("manifest verify: GREEN — signed bulletin descends from genesis");
  process.exit(0);
}

/* ---- emit ---- */
if (!EMIT) {
  console.log(JSON.stringify(payload, null, 2));
  console.error(`dry-run — nothing signed or written` +
    (stalePeers.length ? ` · stale peers excluded: ${stalePeers.join(",")}` : "") +
    ` · --emit to sign, --verify to check the published bulletin`);
  process.exit(0);
}
if (stalePeers.length)
  console.error(`stale peers excluded: ${stalePeers.join(",")}`);

if (!fs.existsSync(PRIV)) { console.error(`no signing key — run --keygen first`); process.exit(1); }
const body = JSON.stringify(payload, null, 2);
const sig = crypto.sign(null, Buffer.from(body),
  fs.readFileSync(PRIV)).toString("base64url");

const manifest = { payload: JSON.parse(body), sig_ed25519: sig,
                   pubkey_hint: "sha256:" + crypto.createHash("sha256")
                     .update(fs.readFileSync(PUB)).digest("hex").slice(0, 16) };
fs.writeFileSync(OUT, JSON.stringify(manifest, null, 2));
/* published copy too — publish-check's canon gate gates the pair */
fs.writeFileSync(path.join(ROOT, "site", "fleet-manifest.json"),
  JSON.stringify(manifest, null, 2));
console.log(`manifest → ${OUT} + site/ (sig ${sig.slice(0, 24)}…)`);

if (PUSH) {
  /* the canon is a PAIR — pushing one side leaves the published copy
     stale and publish-check's parity gate red */
  await run("git", ["-C", ROOT, "add", "fleet-manifest.json",
                                    "site/fleet-manifest.json"]);
  await run("git", ["-C", ROOT, "commit", "-m",
    `fleet-manifest: ${payload.ts}`]);
  await run("git", ["-C", ROOT, "push"]);
  console.log("pushed → bulletin board live");
}
