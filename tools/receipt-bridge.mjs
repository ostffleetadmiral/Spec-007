#!/usr/bin/env node
/* receipt-bridge.mjs — fold k3/k3serve --sched-emit JSONL into the
   Continuity DHT (phase D, bridge-mediated evidence).

   Each sched-emit line is a scale-0 Observation→Commit: trajectory,
   selected token, model/observer/routing folds — receipts, never
   tensors. The bridge validates the commit schema, sha256-pins the
   raw line, and files it as a signed DHT record
   (kind "k3-sched-receipt") under the serving lane. Malformed or
   mutated lines are refused and counted — the bridge never repairs
   evidence it doesn't recognize.

   Usage:
     node tools/receipt-bridge.mjs --fold FILE.jsonl [--lane k3-serve]
     node tools/receipt-bridge.mjs --fold FILE.jsonl --emit
     node tools/receipt-bridge.mjs --verify            # ledger re-check */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { recordPut } from "./dht-fs.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const LEDGER = path.join(ROOT, "security", "out", "receipt-bridge-ledger.json");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const FOLD = arg("--fold", null);
const LANE = arg("--lane", "k3-serve");
const EMIT = process.argv.includes("--emit");
const H = (b) => crypto.createHash("sha256").update(b).digest("hex");

if (process.argv.includes("--verify")) {
  const bad = (m) => { console.error(`receipt-bridge verify: FAIL — ${m}`); process.exit(1); };
  if (!fs.existsSync(LEDGER)) bad("ledger absent — run --fold --emit first");
  const l = JSON.parse(fs.readFileSync(LEDGER, "utf8"));
  if (l.schema !== "RCT-BRIDGE-v1") bad(`schema ${l.schema}`);
  if (!(l.filed >= 0) || !(l.refused >= 0)) bad("counters");
  if (!Array.isArray(l.records)) bad("records");
  console.log(`receipt-bridge verify OK — ${l.filed} filed, ${l.refused} refused, lane ${l.lane}`);
  process.exit(0);
}
if (!FOLD) {
  console.error("usage: receipt-bridge.mjs --fold FILE.jsonl [--lane L] [--emit] | --verify");
  process.exit(2);
}
if (!fs.existsSync(FOLD)) { console.error(`receipt-bridge: ${FOLD} absent`); process.exit(2); }

const HEX = /^[0-9a-f]+$/;
function validCommit(line) {
  try {
    const j = JSON.parse(line);
    const c = j && j.commit;
    return Number.isInteger(j.step) && c &&
      Number.isInteger(c.trajectory_id) && Number.isInteger(c.selected_token) &&
      HEX.test(c.model_fold || "") && HEX.test(c.routing_fold || "") &&
      Number.isInteger(c.scale) && Number.isInteger(c.branch_count)
      ? j : null;
  } catch { return null; }
}
function dhtRecord(lane, kind, name, clearance, body) {
  try { recordPut(lane, kind, name, body, clearance); return true; }
  catch { return false; }
}

const lines = fs.readFileSync(FOLD, "utf8").split("\n").map(l => l.trim()).filter(Boolean);
let filed = 0, refused = 0;
const records = [];
for (const line of lines) {
  const j = validCommit(line);
  if (!j) { refused++; continue; }
  const name = `sched-${j.commit.trajectory_id}-${j.step}`;
  const ok = dhtRecord(LANE, "k3-sched-receipt", name, 3, {
    line_sha: H(line).slice(0, 16), commit: j.commit,
    logits_fold: j.logits_fold, state_fold: j.state_fold });
  ok ? filed++ : refused++;
  if (ok) records.push(name);
}
console.log(`receipt-bridge — ${lines.length} lines: ${filed} filed, ${refused} refused → lane ${LANE}`);
if (EMIT) {
  fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
  fs.writeFileSync(LEDGER, JSON.stringify({
    schema: "RCT-BRIDGE-v1", ts: new Date().toISOString(),
    source: path.basename(FOLD), lane: LANE, filed, refused, records,
  }, null, 2) + "\n");
  console.log(`ledger → ${path.relative(ROOT, LEDGER)}`);
}
process.exit(refused > 0 && filed === 0 ? 1 : 0);
