#!/usr/bin/env node
/* doc-census.mjs — D11/P5: cluster-wide documentation census.

   Walks every populated sibling root (same SIB map as bridge-map /
   dox-audit), finds every documentation file, and classifies it into the
   audit vocabulary:

     governing   — AGENTS.md / README* / CLAUDE.md / rules dirs — the docs
                   that bind the tree (dox-audit's binding classes)
     status      — status/reports/audits/roadmaps — docs that claim a
                   measured state and therefore go stale
     docs        — docs/ and Documentation/ trees — maintained manuals
     corpus      — other first-party .md/.txt/.tex — narrative, plans,
                   research notes
     generated   — produced artifacts (datasets, lessons, codex entries,
                   security/out, egg-info, vendored-trees' own docs,
                   .archive/archive content) — counted, never graded
     donor       — vendored/upstream trees (llama.cpp, freenet, qdk,
                   nullclaw/nullhub/vulkan-zig, node_modules, .venv,
                   externals, deps) — classified, not swept
     mirror      — ThePlatform/AdmPaul — a pre-rename snapshot of the
                   Spec-007 drawer; compared, never merged

   Outputs:
     security/out/doc-census.json    — per-file path→class map + tallies
     security/out/doc-census-debrief.md — human summary

   Modes: (bare) dry-run · --emit writes · --verify proves the class map
   matches committed state (file path + class identity — bytes drift free,
   same snapshot-label convention as dox-audit/cluster-census). */
import fs from "node:fs";
import path from "node:path";

const HOME = process.env.HOME;
const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const OUT = path.join(ROOT, "security", "out");
const EMIT = process.argv.includes("--emit");
const VERIFY = process.argv.includes("--verify");

/* same $HOME-relative root map as bridge-map.mjs / dox-audit.mjs */
const SIB = {
  "hardware": "CascadeProjects/hardware",
  "zig-k3-port": "CascadeProjects/hardware/experiments/zig-k3-port",
  "zig-k3-preserved": "CascadeProjects/hardware/experiments/zig-k3-port-local-preserved-20261004",
  "theue": "CascadeProjects/hardware/experiments/TheUE",
  "qstar-llm": "CascadeProjects/hardware/experiments/qstar-llm",
  "bs-analysis": "CascadeProjects/hardware/experiments/BS",
  "rations": "CascadeProjects/Rations",
  "theplatform": "CascadeProjects/ThePlatform",
  "octolab": "CascadeProjects/octo",
  "falsifible": "CascadeProjects/Falsifible",
  "abby-donor-shelf": "CascadeProjects/basic/Abby",
  "qstar-llm-basic": "CascadeProjects/basic/qstar-llm",
  "eu-version-z": "Music/Paul/Sci-Fi",
  "eu-legacy": "Music/Paul/engineered_universe",
  "eu-vx4": "Music/Paul/newest",
  "codon": "Music/Paul/codon",
  "space-agent": "Music/Paul/space-agent",
  "pj-hexredox": "Desktop/PJ",
  "qstar-corpus": "Desktop/Qstar",
  "ralph-corpus": "Desktop/Ralph",
  "sheraton-shelf": "Desktop/Sheraton",
  "tp-donor-shelf": "Desktop/ThePlatform",
  "desi-llama": "Desktop/Desi",
  "fano-engine": "Documents/animation",
  "ark-ivector": "Documents/Ark",
  "mosi-papertunes": "Documents/Mosi",
  "archive-corpus": "Documents/archive",
  "models-store": "Documents/models",
  "euqinome-drawer": "CascadeProjects/hardware/experiments/Spec-007/thoughts&convos/AdmPaul/.Euqinom",
  "spec-007": "CascadeProjects/hardware/experiments/Spec-007",
};

const DOC_EXT = new Set([".md", ".txt", ".tex", ".rst"]);

/* ordered exclusion rules — first hit wins; donor before generated so a
   vendored tree's own datasets still grade donor */
const DONOR = [
  /(^|\/)node_modules\//, /(^|\/)\.venv\//, /(^|\/)vendor\//,
  /(^|\/)\.git\//, /(^|\/)__pycache__\//, /(^|\/)deps\//,
  /(^|\/)llama\.cpp\//, /(^|\/)freenet[^/]*\//, /(^|\/)qdk\//,
  /(^|\/)nullclaw\//, /(^|\/)nullhub\//, /(^|\/)vulkan-zig\//,
  /(^|\/)zlm\//, /(^|\/)externals\//, /(^|\/)third[_-]?party\//,
  /(^|\/)site-packages\//, /(^|\/)target\//, /(^|\/)zig-cache\//,
  /(^|\/)\.zig-cache\//, /(^|\/)zig-out\//, /(^|\/)build\//,
  /(^|\/)\.cargo\//, /(^|\/)\.npm\//, /(^|\/)dist\//,
];
const GENERATED = [
  /(^|\/)datasets\//, /(^|\/)lessons\//, /(^|\/)codex_entries\//,
  /(^|\/)security\/out\//, /(^|\/)\.archives?\//, /(^|\/)archives?\//,
  /(^|\/)component_chunks\//, /egg-info\//, /(^|\/)generated\//,
  /(^|\/)coverage\//, /(^|\/)out\//, /(^|\/)results\//, /(^|\/)logs\//,
  /(^|\/)vocabs?\//, /(^|\/)prompts\//, /(^|\/)data\//,
];

function classify(root, rel) {
  const p = rel + "/";
  if (root === "theplatform" && /^AdmPaul\//.test(rel)) return "mirror";
  if (root === "spec-007" && /^thoughts&convos\//.test(rel)) return "corpus";
  if (root === "spec-007" && /^docs\//.test(rel)) return "docs";
  for (const re of DONOR) if (re.test(p)) return "donor";
  for (const re of GENERATED) if (re.test(p)) return "generated";
  const base = path.basename(rel);
  if (/^(agents|claude|rules)\.md$/i.test(base) || /^readme(\.|$)/i.test(base))
    return "governing";
  if (/^(agents|claude|rules)\./i.test(base) ||
      /(^|\/)(\.devin\/rules|\.windsurf\/rules|rules)\//.test(p))
    return "governing";
  if (/^(status|roadmap|todo|changelog|changes|history|news)(\.|_|$)/i.test(base) ||
      /(status|report|audit|assessment|verdict|ledger|coverage|results)(\.|_|-|$)/i.test(base))
    return "status";
  if (/(^|\/)(docs?|documentation|manual|guides?)\//.test(p)) return "docs";
  return "corpus";
}

/* sibling roots nest (hardware ⊃ experiments/*) — a subtree that is itself
   a census root is counted under its own root, never twice */
const SIB_ABS = new Set(Object.values(SIB).map(r => path.join(HOME, r)));

/* volatile build caches — contents churn mid-sweep (zig writes/deletes
   hash-named .txt files on every invocation); they are artifacts, not
   documentation, and make verify nondeterministic */
const PRUNE_DIRS = new Set([".zig-cache", "zig-cache"]);

function* walk(dir, rel, root) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return; }
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, e.name), r = rel ? rel + "/" + e.name : e.name;
    if (e.isDirectory()) {
      if (PRUNE_DIRS.has(e.name)) continue;
      if (SIB_ABS.has(p) && path.join(dir) !== p) continue;
      yield* walk(p, r, root);
    } else if (e.isFile() && DOC_EXT.has(path.extname(e.name).toLowerCase())
        && e.name !== "doc-census-debrief.md") {
      /* self-exclusion: the census's own artifacts are generated, not corpus */
      yield { root, file: r, cls: classify(root, r) };
    }
  }
}

const docs = [];
const absent = [];
for (const [name, rel] of Object.entries(SIB)) {
  const base = path.join(HOME, rel);
  if (!fs.existsSync(base)) { absent.push(name); continue; }
  for (const d of walk(base, "", name)) docs.push(d);
}

const tally = {};
for (const d of docs) {
  const k = `${d.root}:${d.cls}`;
  tally[k] = (tally[k] || 0) + 1;
}

const report = {
  spec: "DOCCENSUSv1",
  generated: new Date().toISOString(),
  note: "cluster documentation census — per-doc classification, generated by tools/doc-census.mjs. generated/donor classes are counted, never swept; mirror is compared, never merged.",
  roots: Object.keys(SIB).length,
  roots_absent: absent,
  doc_count: docs.length,
  by_class: Object.fromEntries(
    [...new Set(docs.map(d => d.cls))].sort()
      .map(c => [c, docs.filter(d => d.cls === c).length])),
  tally,
  docs,
};

const lines = [
  "# DOC-CENSUS — cluster documentation census",
  "",
  `Roots: ${report.roots - absent.length}/${report.roots} populated` +
    (absent.length ? ` · absent: ${absent.join(", ")}` : ""),
  `Docs: ${docs.length} — ${JSON.stringify(report.by_class)}`,
  "",
  "| Root | governing | status | docs | corpus | generated | donor | mirror |",
  "|---|---|---|---|---|---|---|---|",
  ...Object.keys(SIB).filter(r => !absent.includes(r)).map(r => {
    const g = c => tally[`${r}:${c}`] || 0;
    return `| ${r} | ${g("governing")} | ${g("status")} | ${g("docs")} | ${g("corpus")} | ${g("generated")} | ${g("donor")} | ${g("mirror")} |`;
  }),
];

if (VERIFY) {
  let prev;
  try { prev = JSON.parse(fs.readFileSync(path.join(OUT, "doc-census.json"), "utf8")); }
  catch { console.error("doc-census verify: ledger absent — run --emit"); process.exit(1); }
  const key = d => `${d.root}/${d.file}:${d.cls}`;
  const a = new Set(prev.docs.map(key)), b = new Set(docs.map(key));
  const drift = [...b].filter(k => !a.has(k)).concat([...a].filter(k => !b.has(k)));
  console.log(drift.length
    ? `doc-census verify: DRIFT — ${drift.length} entries differ (first: ${drift[0]})`
    : `doc-census verify: GREEN — ${docs.length} docs, class map stable`);
  process.exit(drift.length ? 1 : 0);
}
if (EMIT) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "doc-census.json"), JSON.stringify(report, null, 2) + "\n");
  fs.writeFileSync(path.join(OUT, "doc-census-debrief.md"), lines.join("\n") + "\n");
  console.log(`doc-census → ${OUT}/doc-census.json + debrief (${docs.length} docs)`);
} else {
  console.log(lines.join("\n"));
  console.log(`DRY — ${docs.length} docs; --emit to write`);
}
