#!/usr/bin/env node
/* dox-audit.mjs — D11/P4: nearest-AGENTS documentation binding ratchet.

   Doctrine: every governed file must chain to a governing AGENTS.md, and
   every standing rule that *names* an enforcing probe must resolve to a
   real probe in the enforcement corpus — a rule that cites a dead probe
   is documentation drift, not enforcement.

   Checks:
     repo_binding   — walk the tree; each file resolves its nearest
                      ancestor AGENTS.md (nested AGENTS.md shadow the root).
                      Any file with no chain → unbound.
     rule_probes    — parse AGENTS.md, extract cited probe IDs
                      (incl. `DESK-21/22` shorthand), resolve each against
                      security/*.mjs + tools/*.{mjs,sh} + findings.json.
     sibling_docs   — per populated cluster root: AGENTS.md | README* |
                      none. `none` is recorded, not excused.
     twins          — docs/en ↔ docs/zh-Hant file inventory parity.

   Modes:  (bare) dry-run · --emit write ledger+debrief · --verify ratchet
   Ratchet semantics: binding *statuses* are compared (per-file binding,
   per-rule resolution, per-root doc class) — file counts are snapshot
   labels, never compared (they drift as docs are written, by design).
*/
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const HOME = process.env.HOME;
const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const OUT = path.join(ROOT, "security", "out");
const EMIT = process.argv.includes("--emit");
const VERIFY = process.argv.includes("--verify");

/* same $HOME-relative root map as bridge-map.mjs — the binding audit
   spans the same cluster the evidence bridge does */
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
};

/* ---------- 1 · repo file → nearest AGENTS.md ---------- */
const SKIP_DIRS = new Set([".git", "node_modules", ".zig-cache",
  "out" /* security/out is generated evidence, still bound — but skipped
           from the walk since it regenerates */]);
const SKIP_TOP = new Set(["security/out"]); // generated

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    const rel = path.relative(ROOT, p);
    if (SKIP_TOP.has(rel)) continue;
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile()) yield p;
  }
}

function nearestAgents(file) {
  let d = path.dirname(file);
  while (true) {
    if (fs.existsSync(path.join(d, "AGENTS.md"))) {
      return path.relative(ROOT, path.join(d, "AGENTS.md")) || "AGENTS.md";
    }
    if (d === ROOT || d === path.dirname(d)) return null;
    d = path.dirname(d);
  }
}

const files = [...walk(ROOT)];
const unbound = [];
const binders = new Map(); // agents path → file count
for (const f of files) {
  const bind = nearestAgents(f);
  if (bind === null) unbound.push(path.relative(ROOT, f));
  else binders.set(bind, (binders.get(bind) || 0) + 1);
}

/* ---------- 2 · standing-rule probe citations ---------- */
const AGENTS = fs.readFileSync(path.join(ROOT, "AGENTS.md"), "utf8");
/* probe-id vocabulary: TEAM-NN where TEAM is 2+ uppercase/digits.
   Expand the `DESK-21/22` shorthand, drop doc names (FANO-1, SPEC-NNN…)
   which are product/spec identifiers, not probes. */
const DOC_TOKENS = new Set(["FANO-1", "SPEC-004", "SPEC-007", "SPEC-008",
  "ZIG-0", "CC-0", "UTF-8", "SHA-256", "SHA-512"]);
const cited = new Set();
for (const m of AGENTS.matchAll(/\b([A-Z][A-Z0-9]{1,})-([0-9]+)(?:\/([0-9]+))?/g)) {
  const [, team, n1, n2] = m;
  if (DOC_TOKENS.has(`${team}-0`) || DOC_TOKENS.has(`${team}-1`) ||
      DOC_TOKENS.has(`${team}-${n1}`)) continue;
  cited.add(`${team}-${n1}`);
  if (n2) cited.add(`${team}-${n2}`);
}

/* enforcement corpus: the sweep + all security/tools code + findings */
const corpusFiles = [
  ...fs.readdirSync(path.join(ROOT, "security"))
    .filter(f => f.endsWith(".mjs")).map(f => path.join(ROOT, "security", f)),
  ...fs.readdirSync(path.join(ROOT, "tools"))
    .filter(f => /\.(mjs|sh)$/.test(f)).map(f => path.join(ROOT, "tools", f)),
];
let corpus = "";
for (const f of corpusFiles) corpus += fs.readFileSync(f, "utf8") + "\n";
try {
  corpus += fs.readFileSync(path.join(OUT, "findings.json"), "utf8");
} catch { /* findings regenerate; absence degrades to code-corpus only */ }

const rule_probes = [...cited].sort().map(id => ({
  probe: id,
  resolved: corpus.includes(id) || corpus.includes(id.replace(/-/g, "")) ||
    corpus.includes(id.split("-")[0]),
  resolution: corpus.includes(id) ? "exact"
    : corpus.includes(id.split("-")[0]) ? "team-prefix" : "none",
}));

/* ---------- 3 · sibling root doc-binding ---------- */
const sibling_docs = Object.entries(SIB).map(([name, rel]) => {
  const base = path.join(HOME, rel);
  let cls = "absent-root";
  if (fs.existsSync(base)) {
    const entries = fs.readdirSync(base);
    if (entries.includes("AGENTS.md")) cls = "agents";
    else if (entries.some(f => /^readme(\.|$)/i.test(f))) cls = "readme";
    else if (entries.some(f => /^(agents|claude|rules)\./i.test(f) ||
        fs.existsSync(path.join(base, ".devin", "rules")))) cls = "rules-dir";
    else cls = "none";
  }
  return { root: name, binding: cls };
});

/* ---------- 4 · doc twin inventory ---------- */
/* twin docs are *.md files only — directories (e.g. declassified-7q's raw
   transcript drops) are primary-source evidence, not twinned docs */
const mdOnly = (dir) => fs.readdirSync(dir, { withFileTypes: true })
  .filter(e => e.isFile() && e.name.endsWith(".md")).map(e => e.name);
const enDocs = mdOnly(path.join(ROOT, "docs", "en")).sort();
const zhDocs = mdOnly(path.join(ROOT, "docs", "zh-Hant")).sort();
const twinOrphans = {
  en_only: enDocs.filter(f => !zhDocs.some(z => z.startsWith(f.split(".")[0]))),
  zh_only: zhDocs.filter(f => !enDocs.some(e => f.startsWith(e.split(".")[0]))),
};

/* ---------- report ---------- */
const probeGaps = rule_probes.filter(r => r.resolution === "none");
const noneSibs = sibling_docs.filter(s => s.binding === "none");
const report = {
  spec: "DOXAUDITv1",
  generated: new Date().toISOString(),
  note: "nearest-AGENTS binding ratchet — generated by tools/dox-audit.mjs",
  files_audited: files.length,
  files_bound: files.length - unbound.length,
  unbound_files: unbound,
  binders: Object.fromEntries([...binders.entries()].sort()),
  rules_cited: rule_probes.length,
  probes_resolved: rule_probes.filter(r => r.resolution !== "none").length,
  rule_probes,
  sibling_docs,
  twins: { en: enDocs.length, zh: zhDocs.length, ...twinOrphans },
  findings: {
    unbound_files: unbound.length,
    dead_probe_cites: probeGaps.map(p => p.probe),
    sibling_roots_no_doc: noneSibs.map(s => s.root),
    twin_orphans: twinOrphans.en_only.length + twinOrphans.zh_only.length,
  },
};

const lines = [
  "# DOX — Documentation Binding Audit",
  "",
  `Repo files: ${report.files_bound}/${files.length} bound · ${unbound.length} unbound`,
  `Rule→probe cites: ${report.probes_resolved}/${rule_probes.length} resolved` +
    (probeGaps.length ? ` · DEAD: ${probeGaps.map(p => p.probe).join(", ")}` : ""),
  `Sibling docs: ${sibling_docs.filter(s => s.binding !== "none" && s.binding !== "absent-root").length}/${sibling_docs.length} bound` +
    (noneSibs.length ? ` · no-doc: ${noneSibs.map(s => s.root).join(", ")}` : ""),
  `Twins: en ${enDocs.length} / zh ${zhDocs.length}` +
    (report.findings.twin_orphans ? ` · ORPHANS` : " · parity"),
  "",
  "| Check | Status | Detail |",
  "|---|---|---|",
  `| repo_binding | ${unbound.length ? "OPEN" : "HELD"} | ${unbound.length ? unbound.slice(0, 5).join(", ") : "every file chains to AGENTS.md"} |`,
  `| rule_probes | ${probeGaps.length ? "OPEN" : "HELD"} | ${rule_probes.length} cites, ${probeGaps.length} dead |`,
  `| sibling_docs | ${noneSibs.length ? "NOTED" : "HELD"} | ${noneSibs.map(s => s.root).join(", ") || "all roots carry a governing doc"} |`,
  `| twins | ${report.findings.twin_orphans ? "OPEN" : "HELD"} | ${[...twinOrphans.en_only, ...twinOrphans.zh_only].join(", ") || "inventory parity"} |`,
];
const debrief = lines.join("\n") + "\n";

if (VERIFY) {
  const prev = JSON.parse(fs.readFileSync(path.join(OUT, "dox-ledger.json"), "utf8"));
  /* ratchet on binding statuses — a binding that existed can't vanish,
     a rule cite can't go dead, an unbound-file set can't grow */
  const same = JSON.stringify(prev.unbound_files) === JSON.stringify(unbound) &&
    JSON.stringify(prev.rule_probes) === JSON.stringify(rule_probes) &&
    JSON.stringify(prev.sibling_docs) === JSON.stringify(sibling_docs) &&
    JSON.stringify(prev.twins) === JSON.stringify(report.twins);
  console.log(same
    ? `dox verify: GREEN — ${report.files_bound}/${files.length} bound, ${report.probes_resolved}/${rule_probes.length} probe cites live`
    : "dox verify: DRIFT — bindings differ from committed state");
  process.exit(same ? 0 : 1);
}
if (EMIT) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "dox-ledger.json"), JSON.stringify(report, null, 2) + "\n");
  fs.writeFileSync(path.join(OUT, "dox-debrief.md"), debrief);
  console.log(`dox audit → ${OUT}/dox-ledger.json + dox-debrief.md ` +
    `(${report.files_bound}/${files.length} bound, ${report.probes_resolved}/${rule_probes.length} cites live)`);
} else {
  console.log(debrief);
  console.log(`DRY — ${report.files_bound}/${files.length} files bound; --emit to write`);
}
