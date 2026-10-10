#!/usr/bin/env node
/* academy-harvest.mjs — the open corpus becomes the curriculum.

   Reads tools/repo-corpus.json — every declared public source (local
   clones, pinned remote clones under ~/.academy-corpus, declassified
   copies inside the repo) — and emits Academy lessons deterministically:
   each doc section becomes one lesson, same granularity the human
   corpus uses. Honest labels on every card:
     origin:"harvested"  evidence:"repo_document"|"declassified_corpus"
     language:["en"]     assessment:"deterministic_review_required"
     provenance:"first_party"|"upstream"   source:"repo:<root>:<path>"

   Private/local-only trees are excluded entirely — the public manifest
   never sees them (owner decision). gov/ is NOT harvested — it already
   feeds 530 human lessons.

   Modes:
     --fetch   clone/update every pinned_clone source into
             ~/.academy-corpus/<root> via codeload tarballs (docs-only
             extraction), stamping <root>/.pin with the resolved sha
     --emit    merge the harvested set into site/assets/academy-manifest.json
               (human + generated slices untouched; harvested slice fully
               regenerated — idempotent by construction)
     --verify  pass iff the manifest's harvested slice equals a fresh
               regeneration and lesson_count is consistent
     (bare)    dry-run — prints the set it would emit
*/
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOME = process.env.HOME;
const CACHE = path.join(HOME, ".academy-corpus");
const REG = path.join(ROOT, "tools", "repo-corpus.json");
const MANIFEST = path.join(ROOT, "site", "assets", "academy-manifest.json");

const J = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const FETCH = process.argv.includes("--fetch");
const EMIT = process.argv.includes("--emit");
const VERIFY = process.argv.includes("--verify");

/* ---------- glob matching ---------- */
function glob2re(g) {
  let s = g.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  s = s.replace(/\*\*\//g, "\x01");      // **/ → any depth sentinel
  s = s.replace(/\*\*/g, "\x02");        // ** → any chars sentinel
  s = s.replace(/\*/g, "[^/]*");
  s = s.replace(/\?/g, "[^/]");
  s = s.replace(/\x01/g, "(?:.*/)?");
  s = s.replace(/\x02/g, ".*");
  return new RegExp("^" + s + "$");
}
const anyMatch = (rels, patterns) => patterns.some(g => rels === g || glob2re(g).test === undefined ? false : false) || patterns.some(g => glob2re(g).test(rels));

/* ---------- source resolution ---------- */
const corpus = JSON.parse(fs.readFileSync(REG, "utf8"));
const GLOBAL_EX = corpus.global_exclude.map(glob2re);

function sourceDir(src) {
  if (src.mode === "local" || src.mode === "declassified")
    return path.join(HOME, src.local);
  return path.join(CACHE, src.root);
}
function sourcePin(src, dir) {
  if (src.mode !== "pinned_clone") return null;
  try { return JSON.parse(fs.readFileSync(path.join(dir, ".pin"), "utf8")).sha || null; }
  catch { return null; }
}

function walk(dir, rel = "", out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const r = rel ? rel + "/" + e.name : e.name;
    if (e.name === ".pin") continue;
    if (e.isDirectory()) {
      if (GLOBAL_EX.some(re => re.test(r + "/"))) continue;
      walk(path.join(dir, e.name), r, out);
    } else {
      if (GLOBAL_EX.some(re => re.test(r))) continue;
      out.push(r);
    }
  }
  return out;
}

function docsOf(src) {
  const dir = sourceDir(src);
  const inc = (src.include || corpus.global_include).map(glob2re);
  const exc = (src.exclude || []).map(glob2re);
  return walk(dir)
    .filter(r => inc.some(re => re.test(r)))
    .filter(r => !exc.some(re => re.test(r)))
    .map(rel => ({ rel, dir }));
}

/* ---------- lesson generation ---------- */
const clean = (t) => t
  .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
  .replace(/<[^>]+>/g, "")
  .replace(/[*_`~]/g, "")
  .replace(/\s+/g, " ")
  .trim();

/* the drawer boundary is absolute — public lesson text never carries
   drawer paths, the operator's host home, or officer material. The
   pattern names the real boundary: upstream docs legitimately carry
   /home/<user>/ unix paths and /api/home/ routes — those are content,
   not leaks. Scrub at harvest so emitted chunks are clean by build. */
const scrub = (t) => t
  .replace(/thoughts&convos\S*/g, "[drawer]")
  .replace(/\/home\/admpaul\S*/g, "[host]")
  .replace(/AdmPaul\b/g, "[drawer]")
  .replace(/BEGIN [A-Z ]*PRIVATE KEY[\s\S]*$/g, "[redacted]");

const TOPICS = [
  ["ministry", /ministry|gnm|hindu|hermetic|kybalion|atma|vaswani|kybalion|divine|scripture|karma/i],
  ["security", /secur|crypto|tls|encrypt|vulnerab|threat|privacy|classification|clearance|penetrat/i],
  ["ethics", /ethic|conduct|harass|conflict.of.interest|rights|moral|covenant|nda|whistleblow/i],
  ["campaign", /campaign|wave-|sweep|probe|red.team|audit|battle|operation|strategy|finding|debrief/i],
  ["communications", /comm|wire|protocol|envelope|message|signal|network|dht|peer|radio|lte|gsm|5g|mesh|modem|nb-iot|sip|voip|voicemail|telecom/i],
  ["science", /physic|quantum|proof|theorem|algebra|e8|octonion|cosmolog|astro|lattice|research|science|lemma|fano|ramsey|mass|coupling|scalar|tensor/i],
  ["ai-literacy", /agent|llm|model|prompt|neural|sentien|digit|sheraton|inference|autonom|ollama|onnx|openai|claude|gpt|embed/i],
  ["hardware", /firmware|esp32|hardware|driver|gpio|uart|spi|i2c|embedded|board|schematic|pcb|walter|ukama|openwrt|eeprom|sensor/i],
  ["identity", /identit|persona|callsign|enroll|grant|roster|onboard|account|login|signin|authenticat/i],
  ["orientation", /readme|start|intro|overview|getting|install|setup|quick|contributing|license|notice|changelog/i],
  ["lore", /lore|narrative|story|myth|prophecy|chapter|novel|fiction|tale|history|timeline/i],
  ["systems", /system|architect|design|structur|build|infra|module|api|runtime|engine|framework|implement|deploy|config/i],
  ["reference", /reference|spec|glossary|index|faq|manual|guide|doc|table|list|appendix|reference/i],
];
const topicFor = (hay) => (TOPICS.find(([, re]) => re.test(hay)) || [null])[0] || "reference";

const zhHeavy = (t) => {
  const cjk = (t.match(/[㐀-鿿豈-﫿]/g) || []).length;
  return cjk > 20 && cjk / Math.max(t.length, 1) > 0.15;
};

function lessonsForDoc(src, rel, text) {
  const lines = text.split("\n");
  const heads = [];
  lines.forEach((l, i) => {
    const m = l.match(/^#{1,4}\s+(.+?)\s*#*\s*$/);
    if (m) heads.push({ i, title: clean(m[1]).slice(0, 140) });
  });
  /* prose docs (the ministry corpus writes real headings without # —
     numbered items, Chapter/Section/Article markers become sections) */
  if (!heads.length) {
    lines.forEach((l, i) => {
      const t = l.trim();
      const m = t.match(/^(?:chapter|section|article|part)\s+[\divxlcdm]+[:.]?\s+(.{3,80})$/i)
        || t.match(/^\d+[.)]\s+(.{4,80})$/);
      if (m) heads.push({ i, title: clean(m[1]).slice(0, 140) });
    });
  }
  const out = [];
  const fileTitle = heads.length ? heads[0].title
    : clean(rel.replace(/\.[^.]+$/, "").split("/").pop()).slice(0, 140);
  const mk = (title, body, idx) => {
    const paras = body.split(/\n\s*\n/).map(clean).filter(Boolean);
    const para = paras.find(p => p.length >= 40) || clean(body);
    if (!title || para.length < 40) return;
    const id = "lesson-" + crypto.createHash("sha256")
      .update(`harvest|${src.root}|${rel}|${idx}|${title}`).digest("hex").slice(0, 16);
    out.push({
      access: "public",
      assessment: "deterministic_review_required",
      evidence: src.mode === "declassified" ? "declassified_corpus" : "repo_document",
      id,
      language: zhHeavy(body) ? ["zh-Hant"] : ["en"],
      origin: "harvested",
      outcome: scrub(para.slice(0, 400)),
      provenance: src.class === "first_party" ? "first_party" : "upstream",
      source: `repo:${src.root}:${rel}`,
      title: scrub(title),
      topic: src.mode === "declassified" ? "ministry"
        : topicFor(`${src.root}/${rel} ${title}`),
    });
  };
  if (!heads.length) {
    if (text.trim().length >= 200) mk(fileTitle, text, 0);
    return out;
  }
  /* preamble — text before the first heading (skip the title heading itself) */
  const pre = lines.slice(0, heads[0].i).join("\n").trim();
  if (pre.length >= 80) mk(fileTitle, pre, 0);
  for (let h = 0; h < heads.length; h++) {
    const end = heads[h + 1] ? heads[h + 1].i : lines.length;
    const body = lines.slice(heads[h].i + 1, end).join("\n").trim();
    if (body.length >= 40) mk(heads[h].title, body, h + 1);
  }
  return out;
}

function harvestedSet() {
  const lessons = [], sources = [];
  for (const src of corpus.sources) {
    const dir = sourceDir(src);
    const docs = docsOf(src);
    let n = 0;
    for (const d of docs) {
      let text;
      try { text = fs.readFileSync(path.join(d.dir, d.rel), "utf8"); }
      catch { continue; }
      const ls = lessonsForDoc(src, d.rel, text);
      lessons.push(...ls); n += ls.length;
    }
    sources.push({ root: src.root, class: src.class, mode: src.mode,
      pin: sourcePin(src, dir), docs: docs.length, lessons: n, present: fs.existsSync(dir) });
  }
  lessons.sort((a, b) => a.id.localeCompare(b.id));
  return { lessons, sources };
}

/* ---------- fetch — pinned docs-only clones ---------- */
function fetchSource(src) {
  const dir = path.join(CACHE, src.root);
  fs.mkdirSync(CACHE, { recursive: true });
  const ls = spawnSync("git", ["ls-remote", src.url, "HEAD"], { encoding: "utf8" });
  const sha = (ls.stdout || "").split(/\s/)[0];
  if (!sha || ls.status !== 0) return { root: src.root, ok: false, err: "ls-remote failed" };
  const prior = sourcePin(src, dir);
  if (prior === sha && fs.existsSync(dir) && walk(dir).length > 0)
    return { root: src.root, ok: true, sha, cached: true };
  const m = src.url.match(/github\.com[/:]([^/]+)\/(.+?)(?:\.git)?$/);
  const tgz = `https://codeload.github.com/${m[1]}/${m[2]}/tar.gz/${sha}`;
  const dl = spawnSync("curl", ["-sfL", tgz], { encoding: "buffer", maxBuffer: 512 * 1024 * 1024 });
  if (dl.status !== 0 || !dl.stdout || dl.stdout.length < 100)
    return { root: src.root, ok: false, err: `download rc=${dl.status}` };
  const tmp = path.join(CACHE, `.tmp-${src.root}-${sha.slice(0, 8)}.tgz`);
  fs.writeFileSync(tmp, dl.stdout);
  const stage = path.join(CACHE, `.stage-${src.root}`);
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
  spawnSync("tar", ["-xzf", tmp, "-C", stage,
    "--wildcards", "*.md", "*.markdown", "*.txt", "*.rst"], { encoding: "utf8" });
  /* tar exits nonzero when a wildcard finds no members — judge by yield */
  const subs = fs.readdirSync(stage);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  fs.renameSync(path.join(stage, subs[0]), dir);
  fs.rmSync(stage, { recursive: true, force: true });
  fs.rmSync(tmp, { force: true });
  const ndocs = walk(dir).length;
  fs.writeFileSync(path.join(dir, ".pin"), JSON.stringify({ sha, url: src.url, fetched: new Date().toISOString().slice(0, 10) }, null, 1) + "\n");
  return { root: src.root, ok: ndocs > 0, sha, docs: ndocs };
}

if (FETCH) {
  for (const src of corpus.sources.filter(s => s.mode === "pinned_clone")) {
    const r = fetchSource(src);
    console.log(`${r.ok ? "fetched" : "FAILED"} ${r.root} ${r.sha ? "@" + r.sha.slice(0, 10) : ""} ${r.docs !== undefined ? r.docs + " docs" : (r.err || "")}${r.cached ? " (cached)" : ""}`);
  }
  process.exit(0);
}

/* ---------- course map — every harvested lesson in exactly one course */
const COURSE_OF = {
  orientation: "orientation", ethics: "governance-ethics",
  identity: "identity-authority", systems: "systems-engineering",
  "ai-literacy": "ai-literacy", security: "security-clearance",
  communications: "communications", campaign: "campaign-operations",
  ministry: "ministry-neo-hindu", science: "science-lattice",
  hardware: "hardware-fleet", reference: "reference-stack", lore: "lore-shelf",
};
function courseSplit(lessons) {
  const by = new Map();
  for (const l of lessons) {
    const c = COURSE_OF[l.topic];
    if (!c) throw new Error(`unmapped topic "${l.topic}" — coverage fails`);
    if (!by.has(c)) by.set(c, []);
    by.get(c).push(l);
  }
  return [...by.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([id, ls]) => ({ id, lesson_count: ls.length,
      file: `assets/academy/${id}.json`,
      topics: [...new Set(ls.map(l => l.topic))].sort() }));
}
const COURSE_DIR = path.join(ROOT, "site", "assets", "academy");
const readCourse = (id) => {
  try { return J(path.join(COURSE_DIR, `${id}.json`)).lessons || []; }
  catch { return null; }
};

/* ---------- emit / verify ---------- */
const { lessons, sources } = harvestedSet();
const missing = sources.filter(s => !s.present);

if (!EMIT && !VERIFY) {
  console.log(`academy-harvest — dry-run (${lessons.length} lessons over ${sources.length} sources)`);
  sources.forEach(s => console.log(`  ${s.present ? " " : "!"} ${s.root.padEnd(18)} ${s.mode.padEnd(13)} ${String(s.docs).padStart(4)} docs → ${s.lessons} lessons`));
  process.exit(missing.length ? 1 : 0);
}

const m = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const others = (m.lessons || []).filter(l => l.origin !== "harvested")
  .map(l => ({ ...l, title: scrub(l.title || ""), outcome: scrub(l.outcome || "") }));
const courses = courseSplit(lessons);
const byTopic = {}, byOrigin = {}, byLang = {}, byAccess = {}, byProvenance = {};
for (const l of [...others, ...lessons]) {
  byTopic[l.topic] = (byTopic[l.topic] || 0) + 1;
  byOrigin[l.origin || "human"] = (byOrigin[l.origin || "human"] || 0) + 1;
  byAccess[l.access || "public"] = (byAccess[l.access || "public"] || 0) + 1;
  byProvenance[l.provenance || "curated"] = (byProvenance[l.provenance || "curated"] || 0) + 1;
  for (const lang of l.language || []) byLang[lang] = (byLang[lang] || 0) + 1;
}
const next = {
  ...m,
  lesson_count: others.length + lessons.length,
  lessons: others,
  harvested_count: lessons.length,
  courses,
  metrics: { open_access: true, origins: byOrigin, topics: byTopic,
    languages: byLang, access: byAccess, provenance: byProvenance },
  harvest_sources: sources.map(s => ({ root: s.root, class: s.class, mode: s.mode, pin: s.pin, docs: s.docs, lessons: s.lessons })),
};

if (VERIFY) {
  /* the harvested set lives in per-course chunks — reassemble + compare */
  let cur = [], chunksOk = true;
  for (const c of m.courses || []) {
    const ls = readCourse(c.id);
    if (!ls || ls.length !== c.lesson_count) { chunksOk = false; break; }
    cur.push(...ls);
  }
  cur.sort((a, b) => a.id.localeCompare(b.id));
  const ok = chunksOk && JSON.stringify(cur) === JSON.stringify(lessons)
    && m.lesson_count === (m.lessons || []).length + (m.harvested_count || 0)
    && (m.harvested_count || 0) === lessons.length
    && JSON.stringify(m.harvest_sources || []) === JSON.stringify(next.harvest_sources);
  console.log(ok
    ? `academy-harvest verify OK — ${cur.length} harvested lessons deterministic across ${sources.length} sources + ${courses.length} course chunks, count ${m.lesson_count} consistent`
    : `academy-harvest verify FAIL — chunks=${chunksOk} harvested=${cur.length} regenerated=${lessons.length} count=${m.lesson_count} want=${others.length + lessons.length}`);
  process.exit(ok ? 0 : 1);
}

/* emit: manifest = index + curated shelf; harvested lessons chunk per course */
fs.mkdirSync(COURSE_DIR, { recursive: true });
for (const c of courses) {
  const ls = lessons.filter(l => COURSE_OF[l.topic] === c.id);
  fs.writeFileSync(path.join(COURSE_DIR, `${c.id}.json`),
    JSON.stringify({ schema: "ACADEMY-COURSE-v1", course: c.id, lesson_count: ls.length, lessons: ls }, null, 2) + "\n");
}
fs.writeFileSync(MANIFEST, JSON.stringify(next, null, 2) + "\n");
console.log(`academy-harvest → ${MANIFEST} + ${courses.length} course chunks`);
sources.forEach(s => console.log(`  ${s.root.padEnd(18)} ${s.docs} docs → ${s.lessons} lessons${s.pin ? " @" + s.pin.slice(0, 10) : ""}`));
console.log(`  total: ${next.lesson_count} lessons (${others.length} curated + ${lessons.length} harvested)`);
process.exit(missing.length ? 1 : 0);
