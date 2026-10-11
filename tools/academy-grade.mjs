#!/usr/bin/env node
/* academy-grade.mjs — the deterministic pedagogy-signal instrument
   (SPEC-011 §grading tier).

   academy-review.mjs vets STRUCTURE (formed fields, routing, provenance).
   This tool measures CONTENT-LEVEL quality signals over the same emitted
   course chunks — the second deterministic tier, still not the human
   pedagogical review the corpus's `deterministic_review_required`
   assessment names. What it can and cannot say is stated plainly in the
   artifact.

   Signals per course:
     thin       — outcomes under 60 chars (content too shallow to teach)
     capped     — outcomes at the 400-char emit cap (truncated bodies)
     title_coll — duplicate titles (boilerplate section reuse)
     neardup    — lessons clustered by ≥2 shared 5-word shingles on
                  title+outcome (what byte-identical dedupe cannot see:
                  same boilerplate with a word changed)
     term_cov   — lessons containing ≥1 course-vocabulary term — the
                  content-level routing signal (a uiux lesson about uiux)
     src_conc   — top single-source share (concentration risk)
     ids        — lesson id uniqueness

   Bands: green / amber / red per signal; course grade =
     STRONG (all green) · FAIR (≤2 amber, no red) · THIN (otherwise).
   Corpus grade = weakest course. assessment stays
   `deterministic_review_required` — heuristics measure consistency,
   never pedagogical soundness.

   --emit   write site/assets/academy-pedagogy.json
   --verify reproduce byte-exact (exit 1 on drift)
   --selfcheck  instrument ratchet: grade a synthetic fixture where the
               near-dup answer is known — a flat-zero report means the
               shingle path is dead, not the corpus clean
   bare     dry-run report */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(ROOT, "site");
const ACDIR = path.join(SITE, "assets", "academy");
const MANIFEST = path.join(SITE, "assets", "academy-manifest.json");
const OUT = path.join(SITE, "assets", "academy-pedagogy.json");
const J = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const EMIT = process.argv.includes("--emit"), VERIFY = process.argv.includes("--verify");

/* course-vocabulary term sets — the routing signal at content level.
   Stems (substring match on normalized lowercase text). */
const TERMS = {
  orientation: ["orient", "academy", "course", "curricul", "cadet", "train", "standard", "policy", "manual", "onboard"],
  ethics: ["ethic", "govern", "policy", "right", "fair", "equit", "inclus", "conduct", "accountab", "bias", "accessib"],
  identity: ["ident", "auth", "credential", "callsign", "role", "grant", "roster", "totp", "sign", "certif", "trust", "key", "passw", "token"],
  systems: ["system", "architect", "design", "module", "engineer", "spec", "integr", "component", "interface", "structur", "pipeline"],
  "ai-literacy": ["ai", "model", "prompt", "llm", "neural", "token", "inferenc", "machin", "learn", "train", "context", "gpt", "chat", "agent"],
  security: ["secur", "clearance", "classif", "threat", "vulnerab", "attack", "encrypt", "cipher", "red", "audit", "harden", "exploit", "phish"],
  communications: ["commun", "signal", "protocol", "message", "wire", "relay", "transmit", "radio", "packet", "channel", "network"],
  campaign: ["campaign", "operation", "mission", "deploy", "fleet", "tactic", "strateg", "logist", "exercise", "combat"],
  ministry: ["ministr", "hindu", "faith", "doctrine", "scriptur", "temple", "ritual", "dharma", "sacred", "gnm", "god", "worship"],
  science: ["scien", "physic", "quantum", "lattice", "math", "calcul", "formul", "theor", "experim", "atom", "energy", "chem"],
  hardware: ["hardware", "device", "circuit", "board", "chip", "firmware", "power", "thermal", "sensor", "voltage", "pcb", "usb"],
  reference: ["referenc", "api", "function", "method", "class", "param", "syntax", "document", "spec", "option", "return", "argument"],
  lore: ["lore", "story", "narrat", "canon", "codex", "chapter", "archiv", "legend", "doctrine", "saga"],
  uiux: ["ui", "ux", "component", "css", "design", "layout", "button", "style", "theme", "widget", "form", "menu", "grid", "icon", "screen", "view", "page", "chart", "table", "dialog", "modal", "render", "html", "javascript"],
};
/* topic → course routing (mirrors curriculum-map; review enforces fit,
   this uses it only to pick the term set) */
const COURSE_OF = {
  orientation: "orientation", ethics: "governance-ethics",
  identity: "identity-authority", systems: "systems-engineering",
  "ai-literacy": "ai-literacy", security: "security-clearance",
  communications: "communications", campaign: "campaign-operations",
  ministry: "ministry-neo-hindu", science: "science-lattice",
  hardware: "hardware-fleet", reference: "reference-stack",
  lore: "lore-shelf", uiux: "uiux-craft",
};

const manifest = J(MANIFEST);

/* 5-word shingles on normalized text → 32-bit fnv hash — deterministic,
   no crypto needed for a heuristic sketch */
function shingles(text) {
  const w = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  const out = new Set();
  for (let i = 0; i + 5 <= w.length; i++) {
    let h = 2166136261;
    const s = w[i] + w[i + 1] + w[i + 2] + w[i + 3] + w[i + 4];
    for (let j = 0; j < s.length; j++) { h ^= s.charCodeAt(j); h = Math.imul(h, 16777619); }
    out.add(h >>> 0);
  }
  return out;
}

/* union-find over lessons sharing ≥2 shingles — near-dup clusters */
function nearDupClusters(lessonTexts) {
  const parent = lessonTexts.map((_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (a, b) => { parent[find(a)] = find(b); };
  const seen = new Map(); /* shingle → first lesson idx */
  const shared = new Map(); /* pairkey → shared shingle count */
  for (let i = 0; i < lessonTexts.length; i++) {
    for (const sh of lessonTexts[i]) {
      const prev = seen.get(sh);
      if (prev === undefined) { seen.set(sh, i); continue; }
      const k = prev * 4294967291 + i;
      const n = (shared.get(k) || 0) + 1;
      shared.set(k, n);
      if (n >= 2) union(prev, i);
    }
  }
  const clusters = new Map();
  for (let i = 0; i < lessonTexts.length; i++) {
    const r = find(i);
    clusters.set(r, (clusters.get(r) || 0) + 1);
  }
  const multi = [...clusters.values()].filter(n => n > 1);
  return { clustered: multi.reduce((a, b) => a + b, 0), clusters: multi.length, biggest: Math.max(0, ...multi) };
}

function gradeCourse(cm) {
  const file = path.join(ACDIR, `${cm.id}.json`);
  if (!fs.existsSync(file)) return { course: cm.id, error: "missing-file" };
  const lessons = (J(file).lessons || []);
  const n = lessons.length || 1;
  const termSet = TERMS[(manifest.courses.find(c => c.id === cm.id) || {}).topics?.[0]] || TERMS[cm.topics?.[0]] || [];

  let thin = 0, capped = 0, termCov = 0, ids = new Set(), idDup = 0;
  const titles = new Set(); let titleDup = 0;
  const srcs = {};
  const texts = [];
  for (const L of lessons) {
    const ol = (L.outcome || "").length;
    if (ol < 60) thin++;
    if (ol >= 395) capped++;
    if (titles.has(L.title)) titleDup++; else titles.add(L.title);
    if (ids.has(L.id)) idDup++; else ids.add(L.id);
    const sm = /^repo:([^:]+):/.exec(L.source || "");
    if (sm) srcs[sm[1]] = (srcs[sm[1]] || 0) + 1;
    const hay = `${L.title} ${L.outcome}`.toLowerCase();
    const hayWords = new Set(hay.split(/[^a-z0-9]+/));
    /* stems ≥4 chars substring-match (govern → governance); shorter
       tokens are word-exact so "ai" can't hide inside "said"/"detail" */
    if (termSet.some(t => t.length >= 4 ? hay.includes(t) : hayWords.has(t))) termCov++;
    texts.push(shingles(`${L.title} ${L.outcome}`));
  }
  const nd = nearDupClusters(texts);
  const topShare = Math.max(0, ...Object.values(srcs)) / n;
  const r = (x) => Math.round(x * 10000) / 10000;

  const sig = {
    thin: { v: r(thin / n), band: thin / n <= 0.25 ? "green" : thin / n <= 0.5 ? "amber" : "red" },
    capped: { v: r(capped / n), band: capped / n <= 0.15 ? "green" : capped / n <= 0.3 ? "amber" : "red" },
    title_coll: { v: r(titleDup / n), band: titleDup / n <= 0.5 ? "green" : titleDup / n <= 0.75 ? "amber" : "red" },
    neardup: { v: r(nd.clustered / n), band: nd.clustered / n <= 0.1 ? "green" : nd.clustered / n <= 0.25 ? "amber" : "red" },
    term_cov: { v: r(termCov / n), band: termCov / n >= 0.6 ? "green" : termCov / n >= 0.35 ? "amber" : "red" },
    src_conc: { v: r(topShare), band: topShare <= 0.6 ? "green" : topShare <= 0.85 ? "amber" : "red" },
    ids: { v: idDup, band: idDup === 0 ? "green" : "red" },
  };
  const bands = Object.values(sig).map(s => s.band);
  const grade = bands.includes("red") ? "THIN"
    : bands.filter(b => b === "amber").length <= 2 ? "STRONG" : "FAIR";
  return {
    course: cm.id, lessons: lessons.length, grade, signals: sig,
    neardup_clusters: nd.clusters, neardup_biggest: nd.biggest,
    top_source: Object.entries(srcs).sort((a, b) => b[1] - a[1])[0] || null,
  };
}

/* instrument self-check — planted near-dups MUST cluster; a flat-zero
   report means the shingle path regressed, not that the corpus is clean */
if (process.argv.includes("--selfcheck")) {
  const base = "the quick brown fox jumps over the lazy dog and runs through the forest every morning at dawn";
  const texts = [base, base.replace("dog", "cat"), base.replace("morning", "evening"),
                 "unrelated content about tensor lattice geometry and fixed point arithmetic"]
    .map(t => shingles(`t ${t}`));
  const r = nearDupClusters(texts);
  const pass = r.clustered === 3 && r.clusters === 1;
  console.log(`selfcheck: ${pass ? "GREEN" : "FAIL"} — clustered=${r.clustered} clusters=${r.clusters} (expected 3/1)`);
  process.exit(pass ? 0 : 1);
}

const courses = (manifest.courses || []).map(gradeCourse);
const ORDER = { STRONG: 0, FAIR: 1, THIN: 2 };
const corpus = courses.reduce((w, c) => ORDER[w] < ORDER[c.grade] ? c.grade : w, "STRONG");
const report = {
  schema: "academy-pedagogy-v1", scope: "deterministic-content-signals",
  courses_graded: courses.length,
  lessons_graded: courses.reduce((a, c) => a + (c.lessons || 0), 0),
  grades: { STRONG: courses.filter(c => c.grade === "STRONG").length,
            FAIR: courses.filter(c => c.grade === "FAIR").length,
            THIN: courses.filter(c => c.grade === "THIN").length },
  corpus_grade: corpus,
  assessment: "deterministic_review_required",
  caveat: "heuristics measure consistency (length bands, boilerplate reuse, near-dup shingles, topic-term fit, source concentration) — not pedagogical soundness; human review remains the gate",
  courses,
};
const pretty = JSON.stringify(report, null, 2) + "\n";

if (VERIFY) {
  const same = fs.existsSync(OUT) && fs.readFileSync(OUT, "utf8") === pretty;
  console.log(same
    ? `pedagogy verify: GREEN — ${report.courses_graded} courses graded ${JSON.stringify(report.grades)} corpus=${report.corpus_grade}`
    : "pedagogy verify: DRIFT — ledger differs from emitted state");
  process.exit(same ? 0 : 1);
}
if (EMIT) { fs.writeFileSync(OUT, pretty); console.log(`academy-pedagogy → ${OUT}`); }
for (const c of courses) {
  if (c.error) { console.log(`  [ERROR   ] ${c.course} — ${c.error}`); continue; }
  const s = c.signals;
  console.log(`  [${c.grade.padEnd(6)}] ${c.course.padEnd(22)} ${String(c.lessons).padStart(6)} · thin ${s.thin.v} · neardup ${s.neardup.v} (${c.neardup_clusters} clusters) · term ${s.term_cov.v} · titles ${s.title_coll.v}`);
}
console.log(`academy pedagogy: ${report.lessons_graded} lessons / ${report.courses_graded} courses — corpus ${report.corpus_grade} ${JSON.stringify(report.grades)}; ${report.caveat}`);
process.exit(0);
