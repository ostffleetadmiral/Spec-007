#!/usr/bin/env node
// admiralty-reset-token.mjs — mint a FANO-RESET-v1 unanimous-vote token.
// Every genesis member signs canon(body); the desk verifies all sigs
// against the published fleet-genesis.json before burning a flag
// founding on a foreign origin.
//
//   node admiralty-reset-token.mjs --callsign "ramsey 006" [--no-sheraton]
import { execSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const canon = o => JSON.stringify(o, null, 2);
const idx = process.argv.indexOf("--callsign");
const callsign = idx > -1 ? process.argv[idx + 1] : "ramsey 006";

const gen = JSON.parse(fs.readFileSync(path.join(ROOT, "fleet-genesis.json")));
const names = gen.payload.members.map(m => m.name);

const body = { v: "FANO-RESET-v1", callsign, ts: new Date().toISOString() };
const bodyBytes = Buffer.from(canon(body));
const sigs = {};

/* digit — local fleet key */
const priv = fs.readFileSync(
  path.join(os.homedir(), ".config/fleet/ed25519.pem"));
sigs.digit = crypto.sign(null, bodyBytes, priv).toString("base64url");
console.error("digit signed");

/* sheraton — remote co-sign (its key never leaves sheraton) */
if (!process.argv.includes("--no-sheraton") && names.includes("sheraton")) {
  const b64 = bodyBytes.toString("base64");
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

console.log(JSON.stringify({ body, sigs }, null, 2));
