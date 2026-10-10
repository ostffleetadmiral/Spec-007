#!/usr/bin/env node
/* curriculum-map.mjs — the Academy's coverage-enforced course map.

   Re-derives the curriculum index from the emitted artifacts
   (site/assets/academy-manifest.json + site/assets/academy/<course>.json
   + tools/repo-corpus.json) and proves every obligation in coverage:

     1. every harvested lesson lives in exactly one course;
     2. every registry source with lessons binds to ≥1 course;
     3. the required course set is complete (the tracks the Academy
        claims to teach — including ministry-neo-hindu);
     4. every topic in the manifest maps to a course;
     5. the ministry corpus binds its full document set.

   --emit   write site/assets/curriculum-map.json (fails if coverage breaks)
   --verify reproduce byte-exact + re-check coverage (exit 1 on drift)
   bare     dry-run report */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(ROOT, "site");
const MANIFEST = path.join(SITE, "assets", "academy-manifest.json");
const CORPUS = path.join(ROOT, "tools", "repo-corpus.json");
const OUT = path.join(SITE, "assets", "curriculum-map.json");
const J = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const EMIT = process.argv.includes("--emit");
const VERIFY = process.argv.includes("--verify");

/* the tracks the Academy claims to teach — a missing course fails the map */
const REQUIRED = [
  "orientation", "governance-ethics", "identity-authority",
  "systems-engineering", "ai-literacy", "security-clearance",
  "communications", "campaign-operations", "ministry-neo-hindu",
  "science-lattice", "hardware-fleet", "reference-stack", "lore-shelf",
];
/* tracks that also carry the curated shelf (human + generated lessons) */
const SHELF_TOPICS = ["orientation", "ethics", "identity", "systems",
  "ai-literacy", "security", "communications", "campaign", "ministry",
  "science", "hardware", "reference", "lore"];
const COURSE_OF = {
  orientation: "orientation", ethics: "governance-ethics",
  identity: "identity-authority", systems: "systems-engineering",
  "ai-literacy": "ai-literacy", security: "security-clearance",
  communications: "communications", campaign: "campaign-operations",
  ministry: "ministry-neo-hindu", science: "science-lattice",
  hardware: "hardware-fleet", reference: "reference-stack", lore: "lore-shelf",
};

const m = J(MANIFEST), corpus = J(CORPUS);
const problems = [];

/* load every course chunk, reassemble the harvested set */
const courses = [];
const seen = new Set();
for (const c of m.courses || []) {
  const fp = path.join(SITE, "assets", "academy", `${c.id}.json`);
  if (!fs.existsSync(fp)) { problems.push(`missing course chunk ${c.id}`); continue; }
  const chunk = J(fp);
  const lessons = chunk.lessons || [];
  if (lessons.length !== c.lesson_count)
    problems.push(`course ${c.id}: filed ${lessons.length} != declared ${c.lesson_count}`);
  const roots = new Set(), topics = new Set();
  for (const l of lessons) {
    if (seen.has(l.id)) problems.push(`lesson ${l.id} in two courses`);
    seen.add(l.id);
    if (COURSE_OF[l.topic] !== c.id)
      problems.push(`lesson ${l.id} topic ${l.topic} filed under ${c.id}`);
    const mr = (l.source || "").match(/^repo:([^:]+):/);
    if (mr) roots.add(mr[1]);
    topics.add(l.topic);
  }
  courses.push({ id: c.id, lesson_count: lessons.length,
    topics: [...topics].sort(), sources: [...roots].sort() });
}
courses.sort((a, b) => a.id.localeCompare(b.id));

/* 1 — every harvested lesson filed exactly once */
const harvested = m.harvested_count || 0;
if (seen.size !== harvested)
  problems.push(`chunked ${seen.size} != harvested_count ${harvested}`);
/* curated shelf must not carry harvested lessons */
if ((m.lessons || []).some(l => l.origin === "harvested"))
  problems.push("harvested lesson leaked into the curated shelf");

/* 2 — every registry source with lessons binds to a course */
const bound = new Set(courses.flatMap(c => c.sources));
for (const s of corpus.sources.filter(x => x.root)) {
  const rec = (m.harvest_sources || []).find(h => h.root === s.root);
  if (rec && rec.lessons > 0 && !bound.has(s.root))
    problems.push(`source ${s.root} harvested ${rec.lessons} lessons but binds to no course`);
}

/* 3 — required course set complete */
for (const r of REQUIRED)
  if (!courses.find(c => c.id === r)) problems.push(`required course ${r} absent`);
if (!courses.find(c => c.id === "ministry-neo-hindu" && c.lesson_count > 0))
  problems.push("ministry-neo-hindu carries no lessons");

/* 4 — every manifest topic maps to a course */
for (const t of Object.keys((m.metrics || {}).topics || {}))
  if (!COURSE_OF[t] && !(m.lessons || []).some(l => l.topic === t))
    problems.push(`unmapped topic ${t}`);

/* 5 — the ministry corpus binds its full document set */
const gnm = (m.harvest_sources || []).find(h => h.root === "gnm-ministry");
if (!gnm || gnm.docs !== 5 || gnm.lessons < 5)
  problems.push(`gnm-ministry bound ${gnm ? `${gnm.docs} docs/${gnm.lessons} lessons` : "nothing"} — want 5 docs/≥5 lessons`);

const doc = {
  schema: "CURRICULUM-MAP-v1",
  lesson_count: m.lesson_count,
  course_count: courses.length,
  shelf_lessons: (m.lessons || []).length,
  harvested_lessons: harvested,
  courses,
  required: REQUIRED,
  coverage_ok: problems.length === 0,
};

if (VERIFY) {
  let cur = null;
  try { cur = J(OUT); } catch {}
  const ok = cur && !problems.length
    && JSON.stringify({ ...cur }) === JSON.stringify(doc);
  console.log(ok
    ? `curriculum-map verify OK — ${courses.length} courses, ${seen.size} harvested lessons bound, coverage complete`
    : `curriculum-map verify FAIL — ${problems.length ? problems.join("; ") : "emitted map drifted"}`);
  process.exit(ok ? 0 : 1);
}
if (EMIT) {
  if (problems.length) {
    console.log("curriculum-map emit REFUSED — coverage broken:");
    problems.forEach(p => console.log(`  ! ${p}`));
    process.exit(1);
  }
  fs.writeFileSync(OUT, JSON.stringify(doc, null, 2) + "\n");
  console.log(`curriculum-map → ${OUT} (${courses.length} courses, ${seen.size} lessons)`);
  process.exit(0);
}
console.log(`curriculum-map — dry-run (${courses.length} courses, ${seen.size} harvested lessons)`);
courses.forEach(c => console.log(`  ${c.id.padEnd(22)} ${String(c.lesson_count).padStart(6)} lessons ← ${c.sources.join(", ")}`));
if (problems.length) { problems.forEach(p => console.log(`  ! ${p}`)); process.exit(1); }
