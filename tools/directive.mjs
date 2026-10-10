#!/usr/bin/env node
/* directive.mjs — Sheraton's command execution, for real.

   "Sheraton-001 processes and routes Fleet Admiral directives across
   all Nexus modules." The real counterpart: a fleet-signed directive
   is issued to a patrol duty, dispatched to the duty's lane roster
   (command-manifest TEAM_MAP), and every routing step lands in the
   Continuity DHT as a signed `directive` record — the receipt chain
   is the audit.

   Usage:
     directive.mjs issue <seat> <duty> <json-payload>
                     — sign + route + receipt (returns the directive id)
     directive.mjs status
                     — list directives + routed receipts
     directive.mjs verify <id>
                     — re-verify a directive's signature + receipts
     directive.mjs --verify
                     — the deterministic gate: every filed directive
                       verifies, every receipt record resolves

   Signing: the DHT fleet-service key (ed25519, store-local) — same
   kid convention as IDaaS records. A directive is valid iff its sig
   verifies over the canonical body; routing receipts are IDaaS
   records (themselves signed). */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const QUEUE = path.join(ROOT, "security", "out", "directives");
const DHT = path.join(ROOT, "tools", "dht-fs.mjs");
const MANIFEST = path.join(ROOT, "site", "assets", "command-manifest.json");

const dht = await import(pathToFileURL(DHT).href);

const shaHex = (b) => crypto.createHash("sha256").update(b).digest("hex");
const J = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

/* the glyph table — Sheraton's symbolic interface. Every glyph binds
   exactly one patrol duty from the command manifest's controlled
   vocabulary; the table is coverage-enforced at verify time (a duty
   without a glyph, or a glyph without a duty, fails emission-class
   verification). Unknown glyphs refuse — and the refusal is itself
   filed as an auditable DHT record, never silently dropped. */
const GLYPHS = {
  continuity:  "audit_integrity",
  watch:       "anomaly_watch",
  seal:        "comms_integrity",
  ledger:      "claims_audit",
  custody:     "custody",
  canon:       "canon_integrity",
  perimeter:   "defense_posture",
  forge:       "offense_testing",
  gate:        "clearance_enforcement",
  echo:        "identity_assurance",
  lattice:     "core_integrity",
  mirror:      "content_integrity",
  academy:     "curriculum_integrity",
  horizon:     "discovery_integrity",
  axiom:       "physics_falsification",
  federation:  "federation_audit",
  insider:     "insider_audit",
  chain:       "supply_chain_integrity",
};
function glyphCoverage() {
  const duties = (J(MANIFEST).aiwo && J(MANIFEST).aiwo.patrol_duties) || [];
  const bound = new Set(Object.values(GLYPHS));
  const missingDuty = duties.filter(d => !bound.has(d));
  const phantomGlyph = Object.values(GLYPHS).filter(d => !duties.includes(d));
  return { ok: !missingDuty.length && !phantomGlyph.length, missingDuty, phantomGlyph, duties: duties.length };
}

/* canonical directive body — sig covers exactly this */
const canon = (d) => Buffer.from(JSON.stringify({
  id: d.id, seat: d.seat, duty: d.duty, payload: d.payload, issued: d.issued,
}));

function issue(seat, duty, payload) {
  const manifest = J(MANIFEST);
  const lanes = (manifest.security_roster || [])
    .filter(r => r.duty === duty).map(r => r.team);
  if (!lanes.length) return { ok: false, reason: `no lanes on duty ${duty}` };
  const { sk } = dht.fleetServiceKeys();
  const id = shaHex(Buffer.from(`${seat}|${duty}|${JSON.stringify(payload)}|${Date.now()}`)).slice(0, 32);
  const d = { id, seat, duty, payload, issued: new Date().toISOString() };
  d.sig_kid = "fleet-service";
  d.sig = crypto.sign(null, canon(d), sk).toString("base64");
  d.routed = lanes;
  /* receipts: one signed IDaaS record per directive — the audit chain */
  const rec = dht.recordPut("sheraton", "directive", `D-${id.slice(0, 8)}`,
    { seat, duty, lanes, payload_sha: shaHex(Buffer.from(JSON.stringify(payload))).slice(0, 16) }, 3);
  d.receipt_record = rec.id;
  fs.mkdirSync(QUEUE, { recursive: true });
  fs.writeFileSync(path.join(QUEUE, `${id}.json`), JSON.stringify(d, null, 2) + "\n");
  return { ok: true, id, lanes: lanes.length, receipt: rec.id };
}

function verifyDirective(d) {
  if (!d.sig || d.sig_kid !== "fleet-service") return { ok: false, reason: "unsigned" };
  const { pk } = dht.fleetServiceKeys();
  const sigOk = crypto.verify(null, canon(d), pk, Buffer.from(d.sig, "base64"));
  if (!sigOk) return { ok: false, reason: "bad-sig" };
  const rec = dht.recordGet(d.receipt_record, 7);
  if (!rec.ok) return { ok: false, reason: `receipt:${rec.reason}` };
  return { ok: true, lanes: (d.routed || []).length };
}

/* ---------- CLI ---------- */
const argv = process.argv.slice(2);
if (argv[0] === "issue") {
  const r = issue(argv[1], argv[2], JSON.parse(argv[3] || "{}"));
  console.log(JSON.stringify(r));
  process.exit(r.ok ? 0 : 1);
}
if (argv[0] === "glyph") {
  /* symbolic execution — a glyph resolves to its duty, then routes
     exactly like an issued directive. Unknown glyphs refuse and the
     refusal is audited. */
  const glyph = (argv[2] || "").toLowerCase();
  const duty = GLYPHS[glyph];
  if (!duty) {
    const refusal = { ok: false, refused: "unknown-glyph", glyph,
      known: Object.keys(GLYPHS).length };
    dht.recordPut("sheraton", "glyph-refusal", `G-${shaHex(Buffer.from(glyph)).slice(0, 12)}`,
      { glyph, reason: "not in the bound vocabulary" }, 5);
    console.log(JSON.stringify(refusal));
    process.exit(1);
  }
  const r = issue(argv[1], duty, JSON.parse(argv[3] || "{}"));
  console.log(JSON.stringify({ ...r, glyph, duty }));
  process.exit(r.ok ? 0 : 1);
}
if (argv[0] === "status") {
  const files = fs.existsSync(QUEUE)
    ? fs.readdirSync(QUEUE).filter(f => f.endsWith(".json")) : [];
  const out = files.map(f => {
    const d = J(path.join(QUEUE, f));
    return { id: d.id, seat: d.seat, duty: d.duty, lanes: (d.routed || []).length };
  });
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}
if (argv[0] === "verify" && argv[1]) {
  const d = J(path.join(QUEUE, `${argv[1]}.json`));
  const r = verifyDirective(d);
  console.log(JSON.stringify(r));
  process.exit(r.ok ? 0 : 1);
}
if (argv.includes("--verify")) {
  /* glyph coverage first — the symbolic vocabulary must bind exactly
     the manifest's duty lexicon */
  const g = glyphCoverage();
  if (!g.ok) {
    console.log(`directive verify FAIL — glyph table drift: missing=${g.missingDuty} phantom=${g.phantomGlyph}`);
    process.exit(1);
  }
  /* every filed directive must verify — signature + receipt record */
  const files = fs.existsSync(QUEUE)
    ? fs.readdirSync(QUEUE).filter(f => f.endsWith(".json")) : [];
  let ok = files.length > 0, details = [];
  for (const f of files) {
    const d = J(path.join(QUEUE, f));
    const r = verifyDirective(d);
    if (!r.ok) { ok = false; details.push(`${d.id?.slice(0, 8)}:${r.reason}`); }
  }
  console.log(ok
    ? `directive verify OK — ${files.length} directives, ${g.duties}/${g.duties} glyph coverage, signatures + receipts green`
    : `directive verify FAIL — ${details.join(", ") || "no directives filed"}`);
  process.exit(ok ? 0 : 1);
}
console.log("usage: directive.mjs issue <seat> <duty> <json>|glyph <seat> <glyph> <json>|status|verify <id>|--verify");
