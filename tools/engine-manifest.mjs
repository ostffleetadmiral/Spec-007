#!/usr/bin/env node
// engine-manifest.mjs — the unified governed-runtime registry (blueprint P1
// gap): one signed document naming every runtime the desk is permitted to
// trust — LLM providers behind the governance bridge, the WASM cores, the
// published registries, and the security battery itself.
//
// Same canon discipline as fleet-manifest.mjs:
//   node tools/engine-manifest.mjs            # dry-run — print payload, write nothing
//   node tools/engine-manifest.mjs --emit     # sign → engine-manifest.json + site/
//   node tools/engine-manifest.mjs --verify   # load gate: sig + lineage + inventory
//   node tools/engine-manifest.mjs --emit --push
//
// Env: FLEET_PRIVKEY / FLEET_PUBKEY (the fleet's own trust root signs the
// engine roster — a registry nobody signed is just a list).
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const OUT  = path.join(ROOT, "engine-manifest.json");
const SITE = path.join(ROOT, "site", "engine-manifest.json");
const KEYDIR  = path.join(os.homedir(), ".config", "fleet");
const PRIV = process.env.FLEET_PRIVKEY ?? path.join(KEYDIR, "ed25519.pem");
const PUB  = process.env.FLEET_PUBKEY  ?? path.join(KEYDIR, "ed25519.pub.pem");

const sha = (p) => "sha256:" +
  crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, p))).digest("hex");
const exists = (p) => fs.existsSync(path.join(ROOT, p));

/* genesis anchor — the engine roster must descend from the same trust root
   as the fleet bulletin; a registry that can't name its lineage is a rumor. */
let genesis_sha256 = null;
try {
  const g = JSON.parse(fs.readFileSync(path.join(ROOT, "fleet-genesis.json"), "utf8"));
  genesis_sha256 = crypto.createHash("sha256")
    .update(JSON.stringify(g.payload, null, 2)).digest("hex");
} catch {}

/* Local artifacts carry measured hashes — verify recomputes them, so a
   tampered wasm or registry fails closed at load, not silently at run.
   Remote endpoints carry evidence labels — reachability is measured by the
   bridge, not promised by the manifest. */
const ARTIFACTS = [
  ["spec007.wasm",            "site/assets/spec007.wasm"],
  ["rations.wasm",            "site/apps/rations/rations.wasm"],
  ["capability-registry",     "site/assets/capability-registry.json"],
  ["zig-capability-registry", "site/assets/zig-capability-registry.json"],
  ["spec-registry",           "site/assets/spec-registry.json"],
  ["academy-manifest",        "site/assets/academy-manifest.json"],
  ["science-inventory",       "site/assets/science-inventory.json"],
];

const runtimes = {
  "gov-bridge": {
    kind: "governance-gate",
    endpoint: "http://127.0.0.1:8765",
    evidence: "verified-here",
    note: "clearance/HRIS/evidence/audit gate — the desk never calls providers directly",
  },
  "ollama-local": {
    kind: "llm-upstream", endpoint: "http://127.0.0.1:11434",
    provider_id: "local", evidence: "bridge-mediated",
    note: "reachable only through gov-bridge",
  },
  "ollama-qstar": {
    kind: "llm-upstream", endpoint: "http://127.0.0.1:11435",
    provider_id: "qstar", evidence: "bridge-mediated",
    note: "lattice-native inference sibling — qstar-llm",
  },
  "ollama-remote": {
    kind: "llm-upstream", endpoint: "http://192.168.12.210:11434",
    provider_id: "remote", evidence: "doc-cited",
    note: "firingline host — reachability measured by the bridge, not promised here",
  },
};

for (const [id, rel] of ARTIFACTS) {
  if (!exists(rel)) { console.error(`missing artifact: ${rel}`); continue; }
  runtimes[id] = {
    kind: id === "spec007.wasm" || id === "rations.wasm" ? "wasm-core" : "registry",
    path: rel,
    sha256: sha(rel),
    evidence: "verified-here",
  };
}
/* the rations artifact must agree with its own published pin — a registry
   that disagrees with the sidecar is itself the finding */
try {
  const pin = fs.readFileSync(
    path.join(ROOT, "site/apps/rations/rations.wasm.sha256"), "utf8")
    .trim().split(/\s+/)[0];
  if (runtimes["rations.wasm"])
    runtimes["rations.wasm"].sidecar_agrees =
      runtimes["rations.wasm"].sha256 === "sha256:" + pin;
} catch {}

const batteryDir = path.join(ROOT, "security");
const batteryFiles = fs.readdirSync(batteryDir).filter((f) => f.endsWith(".mjs")).sort();
runtimes["security-battery"] = {
  kind: "harness",
  path: "security/",
  members: batteryFiles.length,
  anchor_sha256: sha("security/team-sweep-2.mjs"),
  evidence: "verified-here",
  note: "team-sweep-2 is the load gate — anchor hash pins the sweep",
};

const payload = {
  spec: "ENGINEMANIFESTv1",
  ts: new Date().toISOString(),
  genesis_sha256,
  runtime_count: Object.keys(runtimes).length,
  runtimes,
};

const EMIT = process.argv.includes("--emit");
const VERIFY = process.argv.includes("--verify");
const PUSH = process.argv.includes("--push");

/* ---- load-side gate ---- */
if (VERIFY) {
  const man = JSON.parse(fs.readFileSync(OUT, "utf8"));
  const body = JSON.stringify(man.payload, null, 2);
  const pub = fs.readFileSync(PUB);
  const checks = {};
  checks.spec = man.payload.spec === "ENGINEMANIFESTv1";
  checks.signature = crypto.verify(null, Buffer.from(body), pub,
    Buffer.from(man.sig_ed25519, "base64url"));
  checks.genesis_lineage = man.payload.genesis_sha256 === genesis_sha256;
  checks.pubkey_hint = man.pubkey_hint ===
    "sha256:" + crypto.createHash("sha256").update(pub).digest("hex").slice(0, 16);
  checks.ts = Number.isFinite(Date.parse(man.payload.ts || ""));
  checks.site_parity = fs.existsSync(SITE) &&
    fs.readFileSync(OUT).equals(fs.readFileSync(SITE));
  /* inventory: every registry artifact must still hash to its signed value —
     the registry against reality, not just the signature against the doc */
  const drift = [];
  for (const [id, rt] of Object.entries(man.payload.runtimes || {})) {
    if (rt.path && rt.sha256) {
      if (!exists(rt.path) || sha(rt.path) !== rt.sha256) drift.push(id);
    }
    if (rt.anchor_sha256 &&
        sha("security/team-sweep-2.mjs") !== rt.anchor_sha256) drift.push(id + ":anchor");
  }
  checks.inventory_held = drift.length === 0;
  for (const [k, v] of Object.entries(checks))
    console.log(`  [${v ? "PASS" : "FAIL"}] ${k}`);
  if (drift.length) console.error(`  drift: ${drift.join(", ")}`);
  if (!Object.values(checks).every(Boolean)) process.exit(1);
  console.log(`engine verify: GREEN — ${man.payload.runtime_count} runtimes signed, inventory held`);
  process.exit(0);
}

/* ---- emit ---- */
if (!EMIT) {
  console.log(JSON.stringify(payload, null, 2));
  console.error("dry-run — nothing signed or written · --emit to sign, --verify to check");
  process.exit(0);
}

if (!fs.existsSync(PRIV)) { console.error("no signing key — fleet --keygen first"); process.exit(1); }
const body = JSON.stringify(payload, null, 2);
const sig = crypto.sign(null, Buffer.from(body),
  fs.readFileSync(PRIV)).toString("base64url");
const manifest = { payload: JSON.parse(body), sig_ed25519: sig,
  pubkey_hint: "sha256:" + crypto.createHash("sha256")
    .update(fs.readFileSync(PUB)).digest("hex").slice(0, 16) };
fs.writeFileSync(OUT, JSON.stringify(manifest, null, 2));
fs.writeFileSync(SITE, JSON.stringify(manifest, null, 2));
console.log(`engine manifest → ${OUT} + site/ (${payload.runtime_count} runtimes, sig ${sig.slice(0, 24)}…)`);

if (PUSH) {
  await run("git", ["-C", ROOT, "add", "engine-manifest.json", "site/engine-manifest.json"]);
  await run("git", ["-C", ROOT, "commit", "-m", `engine-manifest: ${payload.ts}`]);
  await run("git", ["-C", ROOT, "push"]);
  console.log("pushed → engine roster live");
}
