#!/usr/bin/env node
/* science-verdict.mjs — the prove-or-indeterminate pass.
 *
 * Parses the science-coverage doc (docs/en/spec-007-science-coverage.en.md)
 * table rows and assigns each a mechanical verdict:
 *
 *   harness_proven     — INTERNAL tier whose file anchors all resolve
 *   lit_supported      — PEER-REVIEWED / STANDARD / SETTLED external record
 *   constrained        — COUNTER-LEDGER row (a published bound or measured
 *                        limit — the claim survives only inside the bound)
 *   indeterminate      — PREPRINT / FRINGE-TIER / interpretive physics:
 *                        neither proven nor refuted — held, not promoted
 *   broken_anchor      — INTERNAL tier with a dead anchor (a finding, not
 *                        a verdict — must never ship)
 *
 * Emit → security/out/science-verdicts.json + science-verdicts-debrief.md
 * Verify → re-parse + re-classify; byte-compare against the committed ledger.
 */
import fs from "node:fs";
import path from "node:path";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, "..");
const HOME = process.env.HOME;
const DOC = path.join(ROOT, "docs", "en", "spec-007-science-coverage.en.md");
const OUT = path.join(ROOT, "security", "out");
const LEDGER = path.join(OUT, "science-verdicts.json");
const DEBRIEF = path.join(OUT, "science-verdicts-debrief.md");

/* lockstep with team-sweep-2 SIBROOTS */
const SIBROOTS = {
  "hardware": "CascadeProjects/hardware",
  "zig-k3-port": "CascadeProjects/hardware/experiments/zig-k3-port",
  "zig-k3-preserved": "CascadeProjects/hardware/experiments/zig-k3-port-local-preserved-20261004",
  "theue": "CascadeProjects/hardware/experiments/TheUE",
  "qstar-llm": "CascadeProjects/hardware/experiments/qstar-llm",
  "bs-analysis": "CascadeProjects/hardware/experiments/BS",
  "spec-007": "CascadeProjects/hardware/experiments/Spec-007",
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

const TIER_VERDICT = [
  [/\b(COUNTER-LEDGER|CONTESTED|MEASURED-BOUND|VENUE FLAG|BASIS FLAG|PRECISION NOTE|LOW WEIGHT|CONSTRAINED)\b/i, "constrained"],
  [/\bINDETERMINATE\b/i, "indeterminate"],
  [/\bPREPRINT\b/i, "indeterminate"],
  [/\bFRINGE-TIER\b/i, "indeterminate"],
  [/\bINTERNAL\b/i, "internal"],          // resolved below via anchors
  [/\bPEER-REVIEWED\b|\bSTANDARD\b|\bSETTLED\b/i, "lit_supported"],
];

const collect = () => {
  const doc = fs.readFileSync(DOC, "utf8");
  const rows = [];
  let section = "";
  for (const line of doc.split("\n")) {
    const sec = line.match(/^## (§\d+ .+)/);
    if (sec) section = sec[1];
    if (!line.startsWith("|") || /^\|\s*[-:]/.test(line) || /^\| Topic|^\| 主題|^\| Item|^\| 項目/.test(line)) continue;
    const cells = line.split("|").map(c => c.trim()).filter(Boolean);
    if (cells.length < 3) continue;
    const [topic, role, record, tier] = cells;
    const cites = [...line.matchAll(/sibling:([\w.-]+):([\w.\/-]+)/g)]
      .map(m => `sibling:${m[1]}:${m[2]}`)
      .concat([...line.matchAll(/`src\/([\w.\/-]+)`/g)].map(m => `repo:src/${m[1]}`))
      .concat([...line.matchAll(/`tools\/([\w.\/-]+)`/g)].map(m => `repo:tools/${m[1]}`))
      .concat([...line.matchAll(/`golden\/([\w.\/-]+)`/g)].map(m => `repo:golden/${m[1]}`));
    rows.push({ section, topic, role, record: record || "", tier: tier || "", cites });
  }
  return rows;
};

const resolveAnchor = (c) => {
  if (c.startsWith("repo:")) return fs.existsSync(path.join(ROOT, c.slice(5)));
  const m = c.match(/^sibling:([\w.-]+):([\w.\/-]+)$/);
  if (!m || !SIBROOTS[m[1]]) return false;
  return fs.existsSync(path.join(HOME, SIBROOTS[m[1]], m[2]));
};

const classify = (row) => {
  /* §10 counter-ledger: the status cell IS the verdict —
     constraints vs citation-precision flags vs meta rows */
  if (row.section.startsWith("§10")) {
    const s = row.role.toUpperCase();
    if (/\b(CONTESTED|CONSTRAINED|MEASURED-BOUND)\b/.test(s))
      return { verdict: "constrained", basis: `counter-ledger: ${row.role}` };
    if (/\b(FLAG|NOTE|WEIGHT)\b/.test(s))
      return { verdict: "flagged", basis: `record flag: ${row.role}` };
    return { verdict: "meta", basis: row.role || "counter-ledger row" };
  }
  const t = row.tier;
  for (const [re, v] of TIER_VERDICT) {
    if (!re.test(t)) continue;
    if (v === "internal") {
      if (row.cites.length === 0) return { verdict: "harness_proven", basis: "internal tier (no external anchor claimed)" };
      const dead = row.cites.filter(c => !resolveAnchor(c));
      return dead.length
        ? { verdict: "broken_anchor", basis: `dead: ${dead[0]}` }
        : { verdict: "harness_proven", basis: `${row.cites.length} anchor(s) resolve` };
    }
    return { verdict: v, basis: tierOf(t) };
  }
  return { verdict: "indeterminate", basis: "no tier label — held" };
};

const tierOf = (t) => t.match(/\b(PEER-REVIEWED|PREPRINT|FRINGE-TIER|STANDARD|SETTLED|INTERNAL|COUNTER-LEDGER)\b/i)?.[1].toUpperCase() || "?";

const build = () => {
  const rows = collect();
  const entries = rows.map(r => ({ section: r.section, topic: r.topic, tier: tierOf(r.tier), ...classify(r) }));
  const tally = {};
  for (const e of entries) tally[e.verdict] = (tally[e.verdict] || 0) + 1;
  return {
    generated: "2026-10-08",
    doc: "docs/en/spec-007-science-coverage.en.md",
    row_count: entries.length,
    verdicts: tally,
    entries,
  };
};

const debrief = (led) => {
  const L = [
    `# Science-verdict debrief — ${led.generated}`,
    ``,
    `Rows classified: ${led.row_count}`,
    ``,
    `| Verdict | Count |`,
    `|---|---|`,
    ...Object.entries(led.verdicts).sort().map(([v, n]) => `| ${v} | ${n} |`),
    ``,
    `## Indeterminate holdings (explicit, not promoted)`,
    ``,
    ...led.entries.filter(e => e.verdict === "indeterminate")
      .map(e => `- **${e.topic}** (${e.section}) — ${e.tier}`),
    ``,
    `## Constrained (published bound on record)`,
    ``,
    ...led.entries.filter(e => e.verdict === "constrained")
      .map(e => `- **${e.topic}** — ${e.tier}`),
    ``,
    `## Broken anchors (must be zero)`,
    ``,
    ...(led.entries.filter(e => e.verdict === "broken_anchor")
      .map(e => `- **${e.topic}** — ${e.basis}`).length
      ? led.entries.filter(e => e.verdict === "broken_anchor").map(e => `- **${e.topic}** — ${e.basis}`)
      : ["- none"]),
  ];
  return L.join("\n") + "\n";
};

const emit = () => {
  const led = build();
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(LEDGER, JSON.stringify(led, null, 2) + "\n");
  fs.writeFileSync(DEBRIEF, debrief(led));
  console.log(`science verdicts → ${LEDGER} (${led.row_count} rows: ${JSON.stringify(led.verdicts)})`);
};

const verify = () => {
  if (!fs.existsSync(LEDGER)) { console.error("ledger absent — run --emit"); process.exit(1); }
  const committed = JSON.parse(fs.readFileSync(LEDGER, "utf8"));
  const fresh = build();
  delete committed.generated; delete fresh.generated;
  const ok = JSON.stringify(committed) === JSON.stringify(fresh);
  const broken = fresh.entries.filter(e => e.verdict === "broken_anchor");
  if (ok && broken.length === 0) {
    console.log(`science-verdict verify: GREEN — ${fresh.row_count} rows, ${fresh.verdicts.indeterminate || 0} indeterminate, ${fresh.verdicts.constrained || 0} constrained, 0 broken anchors`);
  } else {
    console.error(`science-verdict verify: FAIL — deterministic=${ok} broken=${broken.length}`);
    process.exit(1);
  }
};

const mode = process.argv[2];
if (mode === "--emit") emit();
else if (mode === "--verify") verify();
else { console.log("usage: science-verdict.mjs --emit | --verify"); process.exit(2); }
