#!/usr/bin/env node
// fleet-genesis-update.mjs — admit the flag seat into published genesis.
//
// Adds the admiral member ({name:"admiral", role:"flag-seat"}) to
// fleet-genesis.json so bindFleetFlag() can anchor roaming FANO-ROOT-v1
// authenticators fleet-wide. The payload is re-signed by every genesis
// root (digit local, sheraton via ssh — private keys never travel).
// The admiral does not sign genesis; the roots endorse the seat.
//
//   node fleet-genesis-update.mjs --pk <64-hex raw ed25519 pk>
//   node fleet-genesis-update.mjs --pk <hex> --dry     (print only)
//   node fleet-genesis-update.mjs --pk <hex> --no-sheraton
import { execSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const GEN = path.join(ROOT, "fleet-genesis.json");
const canon = o => JSON.stringify(o, null, 2);

const i = process.argv.indexOf("--pk");
if (i === -1) {
  console.error("usage: --pk <64-hex raw ed25519 public key> [--dry] [--no-sheraton]");
  process.exit(2);
}
const raw = Buffer.from(process.argv[i + 1], "hex");
if (raw.length !== 32) { console.error("pk must be 32 raw bytes (64 hex)"); process.exit(2); }

/* raw pk -> SPKI DER -> PEM -> b64 (member entry form) */
const DER_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const der = Buffer.concat([DER_PREFIX, raw]);
const pem = "-----BEGIN PUBLIC KEY-----\n" +
  der.toString("base64").replace(/.{64}/g, "$&\n") +
  "\n-----END PUBLIC KEY-----\n";
const pubkey_pem_b64 = Buffer.from(pem).toString("base64");
const hint = "sha256:" + crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);

const gen = JSON.parse(fs.readFileSync(GEN));
const members = gen.payload.members.filter(m => m.name !== "admiral");
members.push({
  name: "admiral",
  role: "flag-seat",
  pubkey_hint: hint,
  pubkey_pem_b64,
});
const payload = { ...gen.payload, members };
const body = Buffer.from(canon(payload));
const sigs = {};

/* digit — local fleet key */
const priv = fs.readFileSync(path.join(os.homedir(), ".config/fleet/ed25519.pem"));
sigs.digit = crypto.sign(null, body, priv).toString("base64url");
console.error("digit signed");

/* sheraton — remote co-sign (its key never leaves sheraton) */
if (!process.argv.includes("--no-sheraton")) {
  const b64 = body.toString("base64");
  const remote = execSync(
    `ssh -o StrictHostKeyChecking=accept-new admpaul@192.168.12.210 ` +
    `python3 - '${b64}' <<'PY'\n` +
    `import sys, base64\n` +
    `from cryptography.hazmat.primitives.serialization import load_pem_private_key\n` +
    `k = load_pem_private_key(open('/home/admpaul/.config/fleet/ed25519.pem','rb').read(), password=None)\n` +
    `sig = k.sign(base64.b64decode(sys.argv[1]))\n` +
    `print(base64.urlsafe_b64encode(sig).decode().rstrip('='))\nPY`,
    { encoding: "utf8", timeout: 30_000 }).trim();
  sigs.sheraton = remote.split("\n").pop().trim();
  console.error("sheraton signed (remote co-sign)");
}

const out = { payload, sigs };
const ghash = crypto.createHash("sha256").update(body).digest("hex");
if (process.argv.includes("--dry")) {
  console.log(JSON.stringify(out, null, 2));
  console.error(`genesis_sha256: ${ghash}`);
} else {
  fs.writeFileSync(GEN, JSON.stringify(out, null, 2) + "\n");
  /* the desk fetches the site copy — publish BOTH or the fleet anchor
     silently rots (root is canon, site/ is what actually ships) */
  fs.writeFileSync(path.join(ROOT, "site/fleet-genesis.json"),
    JSON.stringify(out, null, 2) + "\n");
  console.error(`wrote fleet-genesis.json + site/fleet-genesis.json — genesis_sha256 ${ghash}`);
  console.error("NOTE: fleet bootstrap TOFU pins first-seen genesis on every");
  console.error("desk — an amended genesis is a NEW anchor. desks that already");
  console.error("pinned must re-pin (documented: GENESIS CONFLICT → re-pin path).");
}
