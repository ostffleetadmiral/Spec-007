#!/usr/bin/env node
/* academy-review.mjs — the course-level review instrument (SPEC-011).

   Reviews every emitted course file under site/assets/academy/ — the
   structural review, not the pedagogical one:

     1. formed   — every lesson carries all controlled fields, non-empty
                   title/outcome/source, values inside the vocabulary;
     2. routed   — every lesson's topic routes to the course it sits in
                   (a uiux lesson in ministry-neo-hindu is a defect);
     3. provenance — every lesson's repo:<src>:<path> source resolves to
                     a declared registry source;
     4. ministry — ministry-neo-hindu composition is reported (the
                   course binds ministry-topic lessons from any
                   declared source; the declassified corpus subset is
                   separately enforced by ACAD-04);
     5. lede-dup — (title, outcome) collisions are counted as an
                   info metric — the harvester dedupes on the full
                   body, so remaining collisions are distinct sections
                   sharing a boilerplate lede, not duplicated lessons;
     6. lang     — zh-Hant slice counted per course (report, not fail).

   Verdicts: HELD when the course is defect-free, FINDINGS when a real
   defect exists (the finding names the count). The residual is honest:
   structure is vetted, pedagogy is still deterministic_review_required.

   --emit   write site/assets/academy-review.json (fails on defects)
   --verify reproduce byte-exact + re-check (exit 1 on drift)
   bare     dry-run report */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(ROOT, "site");
const ACDIR = path.join(SITE, "assets", "academy");
const MANIFEST = path.join(SITE, "assets", "academy-manifest.json");
const CORPUS = path.join(ROOT, "tools", "repo-corpus.json");
const OUT = path.join(SITE, "assets", "academy-review.json");
const J = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const EMIT = process.argv.includes("--emit"), VERIFY = process.argv.includes("--verify");

/* topic → course routing, mirrored from curriculum-map.mjs (the two
   must not drift — the map enforces coverage, this enforces fit) */
const COURSE_OF = {
  orientation: "orientation", ethics: "governance-ethics",
  identity: "identity-authority", systems: "systems-engineering",
  "ai-literacy": "ai-literacy", security: "security-clearance",
  communications: "communications", campaign: "campaign-operations",
  ministry: "ministry-neo-hindu", science: "science-lattice",
  hardware: "hardware-fleet", reference: "reference-stack",
  lore: "lore-shelf", uiux: "uiux-craft",
};
const VOCAB = {
  provenance: new Set(["upstream", "first_party"]),
  origin: new Set(["harvested"]),
  evidence: new Set(["repo_document", "declassified_corpus"]),
  access: new Set(["public"]),
  assessment: new Set(["deterministic_review_required"]),
};

const corpus = J(CORPUS), manifest = J(MANIFEST);
const declaredSources = new Set((corpus.sources || []).map(s => s.root));

function review() {
  const courses = [], defects = [];
  let total = 0, zhTotal = 0;
  for (const cm of manifest.courses || []) {
    const file = path.join(ACDIR, `${cm.id}.json`);
    if (!fs.existsSync(file)) { defects.push({ course: cm.id, kind: "missing-file" }); continue; }
    const c = J(file), lessons = c.lessons || [];
    const bad = { formed: 0, routed: 0, provenance: 0 };
    const seen = new Set(); let ledeDup = 0, zh = 0, declass = 0;
    const srcCount = {}, topicCount = {};
    for (const L of lessons) {
      if (!L.id || !L.title || !L.outcome || !L.source ||
          !VOCAB.provenance.has(L.provenance) || !VOCAB.origin.has(L.origin) ||
          !VOCAB.evidence.has(L.evidence) || !VOCAB.access.has(L.access) ||
          !VOCAB.assessment.has(L.assessment)) bad.formed++;
      if (COURSE_OF[L.topic] !== cm.id) bad.routed++;
      const sm = /^repo:([^:]+):/.exec(L.source || "");
      if (!sm || !declaredSources.has(sm[1])) bad.provenance++;
      const key = `${L.title}|${L.outcome}`;
      if (seen.has(key)) ledeDup++; else seen.add(key);
      if ((L.language || []).includes("zh-Hant")) zh++;
      if (L.evidence === "declassified_corpus") declass++;
      srcCount[sm ? sm[1] : "?"] = (srcCount[sm ? sm[1] : "?"] || 0) + 1;
      topicCount[L.topic] = (topicCount[L.topic] || 0) + 1;
    }
    total += lessons.length; zhTotal += zh;
    const d = Object.entries(bad).filter(([, n]) => n > 0);
    for (const [kind, n] of d) defects.push({ course: cm.id, kind, count: n });
    const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k}:${v}`);
    courses.push({
      course: cm.id, lessons: lessons.length,
      zh_lessons: zh, declassified_lessons: declass,
      topics: Object.keys(topicCount).length,
      lede_collisions: ledeDup,
      top_sources: top(srcCount), top_topics: top(topicCount),
      defects: d.length,
      verdict: d.length === 0 ? "HELD" : "FINDINGS",
    });
  }
  return {
    schema: "academy-review-v1", scope: "structural",
    courses_reviewed: courses.length, lessons_reviewed: total,
    zh_lessons: zhTotal,
    defects, courses,
    residual: "structure vetted; pedagogy remains deterministic_review_required",
    verdict: defects.length === 0 ? "HELD" : "FINDINGS",
  };
}

const report = review();
const pretty = JSON.stringify(report, null, 2) + "\n";

if (VERIFY) {
  const same = fs.existsSync(OUT) && fs.readFileSync(OUT, "utf8") === pretty;
  console.log(same && report.defects.length === 0
    ? `review verify: GREEN — ${report.courses_reviewed} courses, ${report.lessons_reviewed} lessons, zero structural defects`
    : same
      ? `review verify: FINDINGS — ${report.defects.length} defect classes on record`
      : "review verify: DRIFT — ledger differs from committed state");
  process.exit(same && report.defects.length === 0 ? 0 : 1);
}
if (EMIT) {
  fs.writeFileSync(OUT, pretty);
  console.log(`academy-review → ${OUT}`);
}
for (const c of report.courses) {
  console.log(`  [${c.verdict.padEnd(8)}] ${c.course.padEnd(22)} ${String(c.lessons).padStart(6)} lessons · zh ${c.zh_lessons} · lede-dup ${c.lede_collisions} · ${c.defects} defect classes`);
}
console.log(`academy review: ${report.lessons_reviewed} lessons / ${report.courses_reviewed} courses — ${report.verdict} (${report.defects.length} defect classes); residual: ${report.residual}`);
process.exit(report.defects.length === 0 ? 0 : 1);
