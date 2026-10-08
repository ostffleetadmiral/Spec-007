#!/usr/bin/env node
/* course-gen.mjs — blueprint P7: generated curriculum (ArchitectAgent analog).

   Reads the wave reports under security/out/ — the campaign's own primary
   record — and emits academy lessons deterministically: same inputs, same
   bytes. Generated lessons are honest about their origin: origin:"generated",
   evidence:"wave_report", language:["en"] (machine-derived, no human
   translation reviewed), and every one carries assessment:
   "deterministic_review_required" — the academy's standing gate.

   Modes:
     (bare)      dry-run — prints the lesson set it would emit, writes nothing
     --emit      merge generated lessons into site/assets/academy-manifest.json
                 (existing human/spec lessons untouched; the generated set is
                 fully replaced by regeneration — idempotent by construction)
     --verify    pass iff the manifest's generated set equals a fresh
                 regeneration and lesson_count is consistent
*/
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "security", "out");
const MANIFEST = path.join(ROOT, "site", "assets", "academy-manifest.json");

/* Wave reports are the corpus: wave-N*.md + sentience-wN*.md only — not the
   raw finding JSON, not seed payloads. Sorted for byte-determinism. */
function waveReports() {
  return fs.readdirSync(OUT)
    .filter(f => /^(wave-|sentience-w).+\.md$/.test(f))
    .sort();
}

function lessonFor(file) {
  const text = fs.readFileSync(path.join(OUT, file), "utf8");
  const lines = text.split("\n").map(l => l.trim());
  const title = (lines.find(l => l.startsWith("# ")) || `# ${file}`)
    .replace(/^#\s+/, "").trim();
  /* Outcome: the first substantive paragraph after the header block —
     verdict line preferred when present, else first non-empty body line. */
  const verdict = lines.find(l => /verdict:/i.test(l));
  const body = lines.find(l => l && !l.startsWith("#") && !/^date:/i.test(l)
    && !/verdict:/i.test(l)) || "";
  const outcome = ((verdict ? verdict.replace(/^.*verdict:\s*/i, "Verdict: ") + " — " : "") + body)
    .replace(/\s+/g, " ").slice(0, 400).trim();
  const source = `security/out/${file}`;
  const id = "lesson-" + crypto.createHash("sha256")
    .update(`course-gen|${source}|${title}`).digest("hex").slice(0, 16);
  /* key order is alphabetical — matches the manifest's sorted-keys
     convention so regeneration is byte-stable */
  return {
    access: "public",
    assessment: "deterministic_review_required",
    evidence: "wave_report",
    id,
    language: ["en"],
    origin: "generated",
    outcome,
    source,
    title,
    topic: "campaign",
  };
}

function generatedSet() {
  return waveReports().map(lessonFor).sort((a, b) => a.id.localeCompare(b.id));
}

const mode = process.argv.includes("--emit") ? "emit"
  : process.argv.includes("--verify") ? "verify" : "dry";
const gen = generatedSet();

if (mode === "dry") {
  console.log(`course-gen — dry-run (${gen.length} lessons, writes nothing)`);
  gen.forEach(l => console.log(`  ${l.id}  ${l.source}`));
  process.exit(0);
}

const m = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const human = (m.lessons || []).filter(l => l.origin !== "generated");
const next = {
  ...m,
  lesson_count: human.length + gen.length,
  lessons: [...human, ...gen],
};

if (mode === "verify") {
  const cur = (m.lessons || []).filter(l => l.origin === "generated");
  const ok = JSON.stringify(cur) === JSON.stringify(gen)
    && m.lesson_count === m.lessons.length;
  console.log(ok
    ? `course-gen verify OK — ${cur.length} generated lessons deterministic, count ${m.lesson_count} consistent`
    : `course-gen verify FAIL — generated=${cur.length} regenerated=${gen.length} count=${m.lesson_count}/${m.lessons.length}`);
  process.exit(ok ? 0 : 1);
}

fs.writeFileSync(MANIFEST, JSON.stringify(next, null, 2) + "\n");
console.log(`course-gen → ${MANIFEST} (${human.length} human/spec + ${gen.length} generated = ${next.lesson_count})`);
