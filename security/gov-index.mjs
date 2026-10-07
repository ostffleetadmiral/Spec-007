// gov-index.mjs — deterministic index of the governance corpus.
//
// Walks thoughts&convos/gov/ (the live corpus — `.archive/` superseded
// snapshots are excluded), sha256-hashes every document, and emits a
// checksum-anchored index the fabric bridge serves at /gov.
//
// Discipline:
//   - Index lives in security/out/ — NOT site/. The corpus carries
//     officer names (onboarding/, bylaws signatories); the public tree
//     must not (surname tripwire). The bridge is the only reader.
//   - Deterministic: sections sorted, docs sorted by path — re-running
//     on an unchanged corpus produces an identical `docs` array.
//   - Index only. The deck renders structure (offices, ladder, tallies);
//     document bodies stay in the corpus.
//
//   node gov-index.mjs
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GOV = process.env.GOV_ROOT || path.resolve(HERE, "..", "thoughts&convos", "gov");
const OUT = path.join(HERE, "out", "gov-index.json");

const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
const docs = [];
const errors = [];

function walk(dir, section) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)); }
  catch (e) { errors.push({ section, error: e.code }); return; }
  for (const ent of ents) {
    if (ent.name.startsWith(".")) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) { walk(p, `${section}/${ent.name}`); continue; }
    if (!ent.isFile()) continue;
    try {
      const bytes = fs.statSync(p).size;
      docs.push({ section, name: ent.name, sha256: sha256(fs.readFileSync(p)), bytes });
    } catch (e) { errors.push({ section, name: ent.name, error: e.code }); }
  }
}

let rootEnts;
try { rootEnts = fs.readdirSync(GOV, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)); }
catch (e) { console.error(`gov-index: cannot read corpus root ${GOV}: ${e.code}`); process.exit(1); }
for (const ent of rootEnts) {
  if (ent.name.startsWith(".")) continue;
  const p = path.join(GOV, ent.name);
  if (ent.isDirectory()) { walk(p, ent.name); continue; }
  if (!ent.isFile()) continue;
  try { docs.push({ section: "(root)", name: ent.name, sha256: sha256(fs.readFileSync(p)), bytes: fs.statSync(p).size }); }
  catch (e) { errors.push({ section: "(root)", name: ent.name, error: e.code }); }
}

const sections = {};
for (const d of docs) {
  const s = (sections[d.section] ??= { docs: 0, bytes: 0 });
  s.docs++; s.bytes += d.bytes;
}
const totals = { docs: docs.length, bytes: docs.reduce((a, d) => a + d.bytes, 0), sections: Object.keys(sections).length };

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString(), root: "thoughts&convos/gov", sections, totals, docs, errors }, null, 2));
console.log(`gov-index: ${totals.docs} docs across ${totals.sections} sections (${(totals.bytes / 1024).toFixed(0)} KiB)` +
  (errors.length ? ` — ${errors.length} unreadable entr${errors.length === 1 ? "y" : "ies"} recorded` : "") + ` → security/out/gov-index.json`);
for (const [s, v] of Object.entries(sections)) console.log(`  ${s}: ${v.docs} docs`);
