#!/usr/bin/env node
/* layer-map.mjs — per-document classification of the drawer corpus under
   the triple-nested narrative enclosure (OpusDei doctrine).

   Every file under thoughts&convos/ lands in exactly one layer — coverage
   is enforced: an unclassified path fails emission, so new subtrees must
   be curated, never silently absorbed. Classification is deterministic:
   ordered path rules, first match wins. No content sniffing — the map is
   about *where a file lives in the architecture*, which is a path fact.

   Layers (the enclosure, inside → out):
     substrate:*   — the real thing: legal governance, academy operations,
                     the commercial arm, operational index maps
     mythos:*      — Layer 3 institutional narrative (fleet corpus)
     source:*      — transcript/plan inputs — cited, never authoritative
     research:*    — evidence and analysis shelves
     shelf:*       — engineering code trees and tooling kept in-drawer
     aspirational:*— proposals and forward material
     archive:*     — sealed, original, or retired material

   Outputs:
     thoughts&convos/LAYER-MAP.json — full per-file map (drawer-side; the
       drawer is gitignored and never ships — SPEC-004 boundary intact)
     site/assets/layer-census.json  — sanitized public projection: layer →
       {files, bytes} counts only. No paths, no names, no contents —
       same convention as cluster-registry.json / device-ledger.mjs.

   Modes:
     (bare)      dry-run — prints layer tallies
     --emit      write both artifacts
     --verify    pass iff both artifacts equal fresh regeneration
*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DRAWER = path.join(ROOT, "thoughts&convos");
const MAP_OUT = path.join(DRAWER, "LAYER-MAP.json");
const CENSUS_OUT = path.join(ROOT, "site", "assets", "layer-census.json");

/* ordered rules — first match wins */
const RULES = [
  /* shelf/tooling — code trees and environments kept in-drawer */
  [/\.venv\//, "shelf:tooling"],
  [/\.git\//, "shelf:tooling"],
  [/vendor\//, "shelf:engineering"],
  [/node_modules\//, "shelf:tooling"],
  [/AdmPaul\/\.Euqinom\//, "archive:retired"],
  [/AdmPaul\/\.governance\//, "archive:retired"],
  /* archive — sealed, original, retired */
  [/\.archive\//, "archive:sealed"],
  [/(^|\/)archive\//, "archive:sealed"],
  [/originals\//, "archive:originals"],
  [/AdmPaul\/\.pdfs\//, "archive:originals"],
  /* real substrate — the governed org underneath the layers */
  [/^gov\/human_academic\//, "substrate:academy"],
  [/^gov\/onboarding\//, "substrate:academy"],
  [/^gov\/subsidiaries\//, "substrate:commercial"],
  [/^gov\/(constitutional|specs|admiralty|legal_financial|security|ethics|strategy|research_ip)\//, "substrate:governance"],
  [/^gov\/[^/]+$/, "substrate:governance"], /* root instruments: OSTF.pdf EIN, narrative, Sigma, registries */
  /* Layer 3 — the fleet mythos and its research shelves */
  [/^AdmPaul\/corpus\/sci-fi\//, "mythos:fiction"],
  [/^AdmPaul\/corpus\/(concepts|Reality)\//, "research:evidence"],
  [/^AdmPaul\/corpus\/Governance\//, "mythos:star-command"],
  [/^AdmPaul\/corpus\//, "mythos:star-command"],
  /* sources — transcripts and drawer plans (cited, not authority) */
  [/^AdmPaul\/convos\/plan-/, "plan:drawer"],
  [/^AdmPaul\/convos\//, "source:transcript"],
  [/^convos\//, "source:transcript"],
  [/^AdmPaul\/\.6EQUJ5\//, "archive:retired"],
  [/^AdmPaul\/\.Proposal\//, "archive:retired"],
  /* AdmPaul root docs — mythos source material */
  [/^AdmPaul\/[^/]+$/, "mythos:star-command"],
  /* drawer-root operational maps (CANON-INDEX, BRIDGE-MAP, …) */
  [/^[^/]+$/, "substrate:index"],
];

function classify(rel) {
  for (const [re, layer] of RULES) if (re.test(rel)) return layer;
  return null;
}

const files = [];
(function walk(dir, rel) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, e.name), r = rel ? rel + "/" + e.name : e.name;
    if (e.isDirectory()) walk(p, r);
    else if (e.isFile()) files.push(r);
  }
})(DRAWER, "");

const unclassified = files.filter(f => !classify(f));
if (unclassified.length) {
  console.error("layer-map: unclassified paths — curate a RULE before emitting:\n  " +
    unclassified.slice(0, 40).join("\n  ") + (unclassified.length > 40 ? `\n  … +${unclassified.length - 40} more` : ""));
  process.exit(1);
}

/* self-exclusion: the map artifact is generated, not corpus */
const entries = files
  .filter(f => f !== "LAYER-MAP.json")
  .map(f => ({ file: f, layer: classify(f), bytes: fs.statSync(path.join(DRAWER, f)).size }));

const census = {};
for (const e of entries) {
  const c = (census[e.layer] ||= { files: 0, bytes: 0 });
  c.files++; c.bytes += e.bytes;
}

const map = {
  schema: "LAYER-MAP-v1",
  note: "Triple-nested narrative enclosure — per-file classification. Drawer-side evidence edition; the public projection carries counts only.",
  generated_by: "tools/layer-map.mjs",
  file_count: entries.length,
  layers: Object.keys(census).sort(),
  entries,
};
const pub = {
  schema: "LAYER-CENSUS-v1",
  note: "Sanitized projection of the drawer layer map — counts only. The per-file ledger is drawer-side by the SPEC-004 boundary.",
  file_count: entries.length,
  by_layer: Object.fromEntries(Object.keys(census).sort().map(k => [k, census[k]])),
};

const mapBytes = JSON.stringify(map, null, 2) + "\n";
const pubBytes = JSON.stringify(pub, null, 2) + "\n";
const mode = process.argv.includes("--emit") ? "emit"
  : process.argv.includes("--verify") ? "verify" : "dry";

if (mode === "dry") {
  console.log(`layer-map — dry-run (${entries.length} files, writes nothing)`);
  for (const k of Object.keys(census).sort())
    console.log(`  ${k.padEnd(22)} ${String(census[k].files).padStart(6)} files · ${(census[k].bytes / 1048576).toFixed(1)} MB`);
  process.exit(0);
}
if (mode === "verify") {
  const ok = fs.existsSync(MAP_OUT) && fs.existsSync(CENSUS_OUT) &&
    fs.readFileSync(MAP_OUT, "utf8") === mapBytes &&
    fs.readFileSync(CENSUS_OUT, "utf8") === pubBytes;
  console.log(ok
    ? `layer-map verify OK — ${entries.length} files across ${map.layers.length} layers, deterministic`
    : "layer-map verify FAIL — artifacts stale or absent; run --emit");
  process.exit(ok ? 0 : 1);
}
fs.writeFileSync(MAP_OUT, mapBytes);
fs.writeFileSync(CENSUS_OUT, pubBytes);
console.log(`layer-map → thoughts&convos/LAYER-MAP.json + site/assets/layer-census.json (${entries.length} files, ${map.layers.length} layers)`);
