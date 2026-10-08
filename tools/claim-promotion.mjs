#!/usr/bin/env node
/* claim-promotion.mjs — the claims-lifecycle engine (D11/P1).

   Ported from eu-version-z's promotion_report schema
   (records[] → {decision:{state,blockers,rationale}, dossier:{controls,
   dependencies,evidence,limitations}}) and adapted to the dossier's
   verdict vocabulary + the override-ledger's mechanical anchor counts.

   Gate rules:
   - `proved`        — grade REVERIFIED and ≥1 mechanical anchor held
   - `held`          — HOLDS-AS-LABELED (non-Verified verdicts included)
   - `rejected_held` — HOLDS-AS-REJECTED — the label is enforced
   - `external`      — EXT-CITED — literature/second-party evidence only
   - `instrumentation` — verdict is instrumentation-tier; can never
     promote to `proved` regardless of anchor count (honesty gate)
   - `blocked`       — a Verified-labeled claim with ZERO resolving
     anchors. Blocked claims set release_blocked: a claimed verification
     without mechanical backing is a defect, not a deferral.

   Emits security/out/promotion-ledger.json + promotion-debrief.md.
   Bare run is dry; --emit writes; --verify reproduces byte-exact
   (records only — the timestamp rides free). */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const OUT = path.join(ROOT, "security", "out");
const OVERRIDE = path.join(OUT, "override-ledger.json");

const args = new Set(process.argv.slice(2));
const EMIT = args.has("--emit"), VERIFY = args.has("--verify");

const led = JSON.parse(fs.readFileSync(OVERRIDE, "utf8"));

const INSTRUMENTATION = /instrumentation/i;

const records = led.ledger.map(row => {
  const anchors = row.anchors || {};
  /* harness + xref are mechanical too — the audit resolves them into the
     grade, so the promotion gate counts them; `lit` is documentary, not
     executable, and stays out of the mechanical total */
  const total = (anchors.paths || 0) + (anchors.symbols || 0) +
    (anchors.probes || 0) + (anchors.probes_held || 0) + (anchors.probes_ext || 0) +
    (anchors.counts_ok || 0) + (anchors.sibling || 0) +
    (anchors.harness || 0) + (anchors.xref || 0);
  const controls = Object.entries(anchors)
    .filter(([, n]) => n > 0).map(([k]) => k);
  const dependencies = [];
  if ((anchors.sibling || 0) > 0) dependencies.push("bridge");
  if ((anchors.probes || 0) + (anchors.probes_held || 0) > 0) dependencies.push("battery");
  if ((anchors.paths || 0) > 0 || (anchors.symbols || 0) > 0)
    dependencies.push("tree");
  if ((anchors.counts_ok || 0) > 0) dependencies.push("live-state");
  if (dependencies.length === 0) dependencies.push("documentation");

  const blockers = [];
  let state;
  const isInstrumentation = INSTRUMENTATION.test(row.verdict || "");
  if (isInstrumentation) {
    state = "instrumentation";
    blockers.push("instrumentation-tier: operational definition — " +
      "cannot promote to proved regardless of anchor count");
  } else if (row.grade === "REVERIFIED") {
    state = total > 0 ? "proved" : "blocked";
    if (total === 0)
      blockers.push("verified verdict with zero resolving anchors — " +
        "promotion requires ≥1 mechanical anchor");
  } else if (row.grade === "HOLDS-AS-LABELED") {
    state = "held";
  } else if (row.grade === "HOLDS-AS-REJECTED") {
    state = "rejected_held";
    blockers.push("rejected verdict held — the label is enforced");
  } else if (row.grade === "EXT-CITED") {
    state = "external";
    blockers.push("external citation only — no first-party anchor");
  } else {
    state = "blocked";
    blockers.push(`unclassified grade ${row.grade}`);
  }

  const limitations = [
    ...(row.notes || []),
    ...(isInstrumentation
      ? ["Score is a framework-internal operational definition."] : []),
    ...(state === "external"
      ? ["Evidence lives outside this tree — cite, don't promote."] : []),
  ];

  return {
    identifier: row.id,
    decision: {
      state, blockers,
      rationale: `grade=${row.grade} anchors=${total} ` +
        `verdict="${(row.verdict || "").slice(0, 60)}"`,
      default_executable: total > 0,
    },
    dossier: {
      claim_status: row.verdict,
      controls,
      dependencies,
      evidence: Object.entries(anchors)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${k}:${n}`),
      limitations,
      roots: row.roots || [],
    },
  };
});

const states = {};
for (const r of records)
  states[r.decision.state] = (states[r.decision.state] || 0) + 1;
const blocked = records.filter(r => r.decision.state === "blocked");
const report = {
  schema_version: "PROMOT1",
  generated: new Date().toISOString(),
  source: "override-ledger grades + mechanical anchor counts",
  release_blocked: blocked.length > 0,
  default_execution_blockers: blocked.map(r =>
    `${r.identifier}: ${r.decision.blockers.join("; ")}`),
  states, records,
};

const lines = [
  "# Promotion Ledger — claims lifecycle (debrief d11)",
  "",
  `States: ${Object.entries(states).map(([k, v]) => `${k}:${v}`).join(" · ")}`,
  `Release blocked: ${report.release_blocked}`,
  "",
  "| Claim | State | Controls | Dependencies | Blockers |",
  "|---|---|---|---|---|",
  ...records.map(r =>
    `| ${r.identifier} | ${r.decision.state} | ` +
    `${r.dossier.controls.join(",") || "—"} | ` +
    `${r.dossier.dependencies.join(",")} | ` +
    `${r.decision.blockers.join("; ") || "—"} |`),
];
const debrief = lines.join("\n") + "\n";

if (VERIFY) {
  const prev = JSON.parse(fs.readFileSync(path.join(OUT, "promotion-ledger.json"), "utf8"));
  const same = JSON.stringify(prev.records) === JSON.stringify(report.records) &&
    prev.release_blocked === report.release_blocked;
  console.log(same
    ? `promotion verify: GREEN — ${records.length} records, blocked=${blocked.length}`
    : "promotion verify: DRIFT — ledger differs from committed state");
  process.exit(same ? 0 : 1);
}
if (EMIT) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "promotion-ledger.json"),
    JSON.stringify(report, null, 2) + "\n");
  fs.writeFileSync(path.join(OUT, "promotion-debrief.md"), debrief);
  console.log(`promotion ledger → ${OUT}/promotion-ledger.json + debrief ` +
    `(${records.length} records, ${JSON.stringify(states)})`);
} else {
  console.log(debrief);
  console.log(`DRY — ${records.length} records; --emit to write`);
}
