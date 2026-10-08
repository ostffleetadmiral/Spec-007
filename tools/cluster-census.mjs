#!/usr/bin/env node
/* cluster-census.mjs — DEBRIEF D0: enumerate every project root in the
   cluster and emit the sanitized public registry projection.

   The tool's source list uses $HOME-relative paths (resolved at runtime —
   usernames never enter the emitted artifact or the public repo). The
   registry carries codenames + roles + evidence classes only: no absolute
   paths, no officer names, no drawer content — same sanitation convention
   as archive-projection.mjs.

   Modes:
     (bare)      dry-run — prints the registry it would emit
     --emit      write site/assets/cluster-registry.json
     --verify    pass iff the emitted file equals a fresh regeneration
*/
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HOME = process.env.HOME;
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "site", "assets", "cluster-registry.json");

/* Canonical root list — $HOME-relative. class: first-party | donor-vendored
   | asset-store | empty. evidence follows the controlled vocabulary:
   verified-here | doc-cited | donor-survey | census-empty. */
const ROOTS = [
  // — the framework itself —
  { rel: "CascadeProjects/hardware/experiments/Spec-007", name: "spec-007", cls: "first-party", realm: "framework", role: "the desk — dossier, governance, security battery", evidence: "verified-here" },
  // — hardware monorepo family —
  { rel: "CascadeProjects/hardware", name: "hardware-monorepo", cls: "first-party", realm: "compute", role: "E=mc² proof workspace — 713 ops, Lean 4 formalization", evidence: "doc-cited" },
  { rel: "CascadeProjects/hardware/experiments/qstar-llm", name: "qstar-llm", cls: "first-party", realm: "compute", role: "lattice-native inference engine — 421×8 nodes", evidence: "doc-cited" },
  { rel: "CascadeProjects/hardware/experiments/zig-k3-port", name: "zig-k3-port", cls: "first-party", realm: "compute", role: "2.78T-param MoE in GBs RAM — token-identical Zig port", evidence: "doc-cited" },
  { rel: "CascadeProjects/hardware/experiments/zig-k3-port-local-preserved-20261004", name: "zig-k3-port-preserved", cls: "first-party", realm: "compute", role: "preserved pre-port snapshot", evidence: "census-static" },
  { rel: "CascadeProjects/hardware/experiments/TheUE", name: "theue", cls: "first-party", realm: "render", role: "immersive engine — 50-entry capability registry, 3,472-row public projection", evidence: "doc-cited" },
  { rel: "CascadeProjects/hardware/experiments/BS", name: "bs-analysis", cls: "first-party", realm: "research", role: "sharpshooter/cathedral analysis + prototype", evidence: "doc-cited" },
  { rel: "CascadeProjects/hardware/experiments/family", name: "family-empty", cls: "empty", realm: "n/a", role: "empty directory — reserved slot", evidence: "census-empty" },
  // — CascadeProjects —
  { rel: "CascadeProjects/Rations", name: "rations", cls: "first-party", realm: "comms", role: "browser-first offline platform — Zig→WASM, physical transports", evidence: "verified-here" },
  { rel: "CascadeProjects/ThePlatform", name: "theplatform", cls: "first-party", realm: "compute", role: "multi-language proof platform — 605 tests cited", evidence: "doc-cited" },
  { rel: "CascadeProjects/octo", name: "octolab", cls: "first-party", realm: "research", role: "Octolab — dockerized AI lab stack", evidence: "doc-cited" },
  { rel: "CascadeProjects/Falsifible", name: "falsifible", cls: "first-party", realm: "research", role: "falsifiability harness — zig + tests + archives", evidence: "doc-cited" },
  { rel: "CascadeProjects/digit-sheraton", name: "digit-sheraton", cls: "empty", realm: "n/a", role: "dangling symlink → Digit&sheraton (absent) — sheraton lives on the Desktop shelf", evidence: "census-empty" },
  { rel: "CascadeProjects/basic/Abby", name: "abby-donor-shelf", cls: "donor-vendored", realm: "donor", role: "donor shelf: codon, Falsifible, llama.cpp, neuraleak, an owner-named LLM tree, zotron", evidence: "donor-survey" },
  { rel: "CascadeProjects/basic/qstar-llm", name: "qstar-llm-basic", cls: "donor-vendored", realm: "donor", role: "second qstar-llm tree — dedup candidate vs experiments copy", evidence: "donor-survey" },
  // — Music/Paul —
  { rel: "Music/Paul/Sci-Fi", name: "eu-version-z", cls: "first-party", realm: "research", role: "Engineered Universe audit foundation — 6,372+ tests", evidence: "doc-cited" },
  { rel: "Music/Paul/engineered_universe", name: "eu-legacy", cls: "first-party", realm: "research", role: "legacy vX.4 tree — euz donor", evidence: "doc-cited" },
  { rel: "Music/Paul/newest", name: "eu-vx4", cls: "first-party", realm: "research", role: "vX4 single-file + consciousness.py snapshot", evidence: "doc-cited" },
  { rel: "Music/Paul/codon", name: "codon", cls: "first-party", realm: "research", role: "64-codon → 6D Jordan routing test suite", evidence: "doc-cited" },
  { rel: "Music/Paul/space-agent", name: "space-agent", cls: "first-party", realm: "framework", role: "DOX agent framework — Node app", evidence: "doc-cited" },
  { rel: "Music/Paul/pi", name: "pi-empty", cls: "empty", realm: "n/a", role: "empty directory — reserved slot", evidence: "census-empty" },
  // — Desktop shelf —
  { rel: "Desktop/PJ", name: "pj-hexredox", cls: "first-party", realm: "research", role: "HexRedox HIPF — hyper-informational physics framework (zig+latex+docs)", evidence: "doc-cited" },
  { rel: "Desktop/Qstar", name: "qstar-corpus", cls: "first-party", realm: "governance", role: "QSTAR corpus — Book of Phi, Gov, Maypole firmware, public disclosure", evidence: "doc-cited" },
  { rel: "Desktop/Ralph", name: "ralph-corpus", cls: "first-party", realm: "research", role: "MOUND (axiom7revisited) + EU zig + lattice_computing + papers", evidence: "doc-cited" },
  { rel: "Desktop/Sheraton", name: "sheraton-shelf", cls: "first-party", realm: "mixed", role: "HexRedOx + tinyoffice + vendored nullclaw/nullhub/zml + models", evidence: "doc-cited" },
  { rel: "Desktop/ThePlatform", name: "tp-donor-shelf", cls: "donor-vendored", realm: "donor", role: "hyper-token + number-systems (first-party) beside qdk/vulkan-zig/zlm/nullclaw/nullhub donors", evidence: "donor-survey" },
  { rel: "Desktop/Desi", name: "desi-llama", cls: "first-party", realm: "compute", role: "DESI-Llama — Vulkan llama build + RADV probe output", evidence: "doc-cited" },
  // — Documents shelf —
  { rel: "Documents/animation", name: "fano-engine", cls: "first-party", realm: "render", role: "Fano Engine — I256Q128.128 integer-only animation + networking pipeline", evidence: "doc-cited" },
  { rel: "Documents/Ark", name: "ark-ivector", cls: "first-party", realm: "compute", role: "I-Vector polyglot — Zig+Vulkan+Q# geometric compression (LLM/edge/QEC)", evidence: "doc-cited" },
  { rel: "Documents/Mosi", name: "mosi-papertunes", cls: "first-party", realm: "comms", role: "Paper Tunes — audio→paper QR storage research", evidence: "doc-cited" },
  { rel: "Documents/archive", name: "archive-corpus", cls: "first-party", realm: "research", role: "20GB corpus — tensor prototypes, quantum-latent/qubit engines, Governance, vendored llama.cpp/vulkan-zig", evidence: "doc-cited" },
  { rel: "Documents/models", name: "models-store", cls: "asset-store", realm: "assets", role: "GGUF weights — qwen 0.5B/3B/8B/9B", evidence: "census-static" },
  // — drawer sibling (codename only) —
  { rel: "CascadeProjects/hardware/experiments/Spec-007/thoughts&convos/AdmPaul/Euqinom", name: "euqinome-drawer", cls: "first-party", realm: "drawer", role: "in-drawer sibling project — indexed, not subsumed", evidence: "drawer-cited" },
];

function probe(rel) {
  const p = path.join(HOME, rel);
  const exists = fs.existsSync(p) || (() => {
    try { return fs.lstatSync(p).isSymbolicLink(); } catch { return false; }
  })();
  if (!exists) return { exists: false };
  const lst = fs.lstatSync(p);
  if (lst.isSymbolicLink()) {
    let target = "";
    try { target = fs.readlinkSync(p); } catch {}
    /* file_count -1 marks the dangling link — present in the census,
       honest about pointing nowhere */
    return { exists: true, kind: "symlink", file_count: -1, target };
  }
  let files = 0;
  /* the registry itself lives inside spec-007 — exclude it so emit→verify
     doesn't race the artifact it just wrote */
  try { files = Number(execSync(
    `find "${p}" -type f ! -path "${OUT}" | wc -l`, { encoding: "utf8" }).trim()); }
  catch { files = -1; }
  return { exists: true, kind: lst.isDirectory() ? "dir" : "file", file_count: files };
}

const entries = ROOTS.map(r => ({ ...r, present: probe(r.rel) }));
const missing = entries.filter(e => !e.present.exists);
const registry = {
  schema: "CLUSTER-CENSUS-v1",
  generated: new Date().toISOString(),
  note: "sanitized projection — codenames + roles + evidence classes; source paths are $HOME-relative inside tools/, never absolute in the artifact",
  root_count: entries.length,
  by_class: entries.reduce((m, e) => ((m[e.cls] = (m[e.cls] || 0) + 1), m), {}),
  entries: entries.map(e => ({
    name: e.name, class: e.cls, realm: e.realm, role: e.role,
    evidence: e.evidence, present: e.present.exists,
    file_count: e.present.exists ? e.present.file_count : 0,
  })),
};

const mode = process.argv.includes("--emit") ? "emit"
  : process.argv.includes("--verify") ? "verify" : "dry";

if (mode === "dry") {
  console.log(`cluster-census — dry-run (${entries.length} roots, writes nothing)`);
  entries.forEach(e => console.log(
    `  ${e.present.exists ? "●" : "○"} ${e.name.padEnd(22)} ${e.cls.padEnd(15)} ${e.present.file_count ?? "-"} files`));
  if (missing.length) console.error(`MISSING: ${missing.map(e => e.rel).join(", ")}`);
  process.exit(missing.length ? 1 : 0);
}

if (mode === "verify") {
  if (!fs.existsSync(OUT)) { console.error("verify FAIL — registry absent"); process.exit(1); }
  const cur = JSON.parse(fs.readFileSync(OUT, "utf8"));
  /* file_count is a census-time snapshot label (it drifts the moment any
     root gains a file — including this registry itself). Identity-level
     verify: names, presence, class, evidence — not counts. */
  const same = cur.root_count === registry.root_count
    && JSON.stringify(cur.by_class) === JSON.stringify(registry.by_class)
    && cur.entries.every((e, i) => e.name === registry.entries[i].name
      && e.present === registry.entries[i].present
      && e.class === registry.entries[i].class
      && e.evidence === registry.entries[i].evidence
      && e.role === registry.entries[i].role);
  console.log(same
    ? `census verify OK — ${cur.root_count} roots consistent (identity; counts are snapshot-labeled)`
    : "census verify FAIL — registry drifted from live roots");
  process.exit(same ? 0 : 1);
}

fs.writeFileSync(OUT, JSON.stringify(registry, null, 2) + "\n");
console.log(`cluster-census → ${OUT} (${entries.length} roots: ${JSON.stringify(registry.by_class)})`);
