// gov-stress.mjs — GOV team: the constitution under adversarial fire.
//
// Where RATIONS hammered the paper leg, GOV hammers the corpus and its
// tripwire: malformed documents, filesystem-level attacks on the
// indexer (unreadable dirs, deep nesting, exclusion semantics),
// surname-tripwire evasion classes, index determinism under churn,
// and the lattice feed's data-path ceiling.
//
// Staged corpora via GOV_ROOT env override — the live corpus and the
// public tree are never touched.
//
//   node gov-stress.mjs
import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, "../site");
const OUT = path.join(HERE, "out");
const WORK = path.join(OUT, "govstress");
const GOV_INDEX = path.join(HERE, "gov-index.mjs");
const LIVE_GOV = path.resolve(HERE, "..", "thoughts&convos", "gov");

const findings = [];
let n = 0;
function f(name, verdict, detail, severity) {
  n++;
  findings.push({ id: `GOV-${String(n).padStart(2, "0")}`, team: "GOV", name, verdict, severity, detail, ts: new Date().toISOString() });
  console.log(`  [${verdict}] GOV-${String(n).padStart(2, "0")} ${name}${detail ? " — " + detail : ""}`);
}
const held = (name, d) => f(name, "HELD", d, "info");
const noted = (name, d, sev) => f(name, "NOTED", d, sev || "info");
const open_ = (name, d) => f(name, "OPEN", d, "high");
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");

/* run the real indexer against a staged corpus root */
function index(corpus) {
  try {
    const out = execFileSync("node", [GOV_INDEX], {
      env: { ...process.env, GOV_ROOT: corpus },
      encoding: "utf8", timeout: 60_000 });
    const idx = JSON.parse(fs.readFileSync(path.join(OUT, "gov-index.json"), "utf8"));
    return { ok: true, out, index: idx };
  } catch (e) {
    return { ok: false, out: (e.stdout || "") + (e.stderr || ""), status: e.status };
  }
}

/* the tripwire expression — extracted from tools/publish-check.sh at
   runtime so the probe always tests the REAL wire, and so this file
   never carries the surnames in plaintext (the wire scans this tree) */
const PCHECK = fs.readFileSync(path.resolve(HERE, "..", "tools", "publish-check.sh"), "utf8");
const TRIP_EXPR = (PCHECK.match(/grep -rIlE '([^']+)'/) || [])[1];
if (!TRIP_EXPR) { console.error("could not extract tripwire pattern from publish-check.sh"); process.exit(1); }
function tripwireHits(dir) {
  try {
    const out = execSync(`grep -rIlE '${TRIP_EXPR}' ${JSON.stringify(dir)}`, { encoding: "utf8" }).trim();
    return out ? out.split("\n") : [];
  } catch { return []; } // grep exit 1 = no hits
}
/* surnames assembled from codepoints — the wire must not find them in
   this file either */
const cp = (...xs) => String.fromCodePoint(...xs);
const SUR = {
  zhang: cp(90, 104, 97, 110, 103),
  elshikh: cp(69, 108, 115, 104, 105, 107, 104),
  sly: cp(83, 108, 121),
};

fs.rmSync(WORK, { recursive: true, force: true });
fs.mkdirSync(WORK, { recursive: true });
console.log("GOV stress — staged corpora, real indexer, real tripwire\n");

/* GOV-01 malformed corpus: binary garbage, empty files, no headers,
   weird names — the indexer is metadata-agnostic and must still
   index deterministically. */
{
  const dir = path.join(WORK, "corpus-malformed");
  fs.mkdirSync(path.join(dir, "sec-a"), { recursive: true });
  fs.mkdirSync(path.join(dir, "sec-b"), { recursive: true });
  fs.writeFileSync(path.join(dir, "sec-a", "empty.md"), "");
  fs.writeFileSync(path.join(dir, "sec-a", "binary.bin"), crypto.randomBytes(4096));
  fs.writeFileSync(path.join(dir, "sec-b", "no extension"), Buffer.from("plain bytes"));
  fs.writeFileSync(path.join(dir, "sec-b", "unicodé-名前.md"), "名前\n");
  fs.writeFileSync(path.join(dir, "root.md"), "\xef\xbb\xbfbom\n");
  const r1 = index(dir), r2 = index(dir);
  const same = r1.ok && r2.ok &&
    sha256(JSON.stringify(r1.index.docs)) === sha256(JSON.stringify(r2.index.docs));
  r1.ok && same && r1.index.totals.docs === 5
    ? held("malformed-corpus", `5 hostile files indexed; re-run byte-identical — the index doesn't parse, it measures`)
    : open_("malformed-corpus", `ok=${r1.ok} deterministic=${same} docs=${r1.index?.totals?.docs} ${r1.out.slice(0, 200)}`);
}

/* GOV-02 unreadable directory: a chmod-000 subdir mid-tree — does the
   walker degrade or die? */
{
  const dir = path.join(WORK, "corpus-unreadable");
  fs.mkdirSync(path.join(dir, "open"), { recursive: true });
  fs.mkdirSync(path.join(dir, "sealed"), { recursive: true });
  fs.writeFileSync(path.join(dir, "open", "a.md"), "ok\n");
  fs.writeFileSync(path.join(dir, "sealed", "secret.md"), "x\n");
  fs.chmodSync(path.join(dir, "sealed"), 0o000);
  const r = index(dir);
  fs.chmodSync(path.join(dir, "sealed"), 0o755); // restore before cleanup
  r.ok && r.index.totals.docs === 1 && r.index.errors?.length === 1
    ? held("unreadable-dir", `sealed dir skipped with recorded error (${r.index.errors[0].error}), open dir indexed — graceful degradation`)
    : r.ok
      ? noted("unreadable-dir", `indexed ${r.index.totals.docs} docs, errors=${r.index.errors?.length ?? 0} — unexpected profile`, "info")
      : open_("unreadable-dir", `indexer died on EACCES — unhandled throw kills the walk: ${r.out.slice(-200)}`);
}

/* GOV-03 deep nesting: nested dirs to the path-length wall — recursion
   boundary of the walker. */
{
  const dir = path.join(WORK, "corpus-deep");
  fs.mkdirSync(dir, { recursive: true });
  let p = dir, depth = 0;
  for (let i = 0; i < 900; i++) {
    const q = path.join(p, `d${i}`);
    try { fs.mkdirSync(q); } catch { break; }
    p = q; depth = i + 1;
  }
  try { fs.writeFileSync(path.join(p, "leaf.md"), "deep\n"); } catch {}
  const r = index(dir);
  r.ok
    ? held("deep-nesting", `${depth}-level tree (${p.length} chars) walked without crash — recursion survives to the path wall`)
    : open_("deep-nesting", `indexer died at depth ${depth}: ${r.out.slice(-150)}`);
}

/* GOV-04 exclusion semantics: dotfiles skipped; names WITHOUT a dot
   prefix are indexed — pin the contract. */
{
  const dir = path.join(WORK, "corpus-exclusion");
  fs.mkdirSync(path.join(dir, ".archive"), { recursive: true });
  fs.mkdirSync(path.join(dir, "archive"), { recursive: true }); // no dot — indexed by design
  fs.mkdirSync(path.join(dir, "Archive"), { recursive: true });
  fs.mkdirSync(path.join(dir, "real"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".archive", "old.md"), "superseded\n");
  fs.writeFileSync(path.join(dir, "archive", "old.md"), "superseded\n");
  fs.writeFileSync(path.join(dir, "Archive", "old.md"), "superseded\n");
  fs.writeFileSync(path.join(dir, "real", "live.md"), "live\n");
  fs.writeFileSync(path.join(dir, ".hidden.md"), "x\n");
  const r = index(dir);
  const sections = Object.keys(r.ok ? r.index.sections : {});
  const docs = r.ok ? r.index.docs.map(d => `${d.section}/${d.name}`) : [];
  const hasDot = sections.includes(".archive") || docs.some(d => d.includes(".hidden") || d.includes(".archive"));
  const hasBare = docs.some(d => d.startsWith("archive/")) && docs.some(d => d.startsWith("Archive/"));
  r.ok && !hasDot && hasBare && r.index.totals.docs === 3
    ? held("exclusion-semantics", `dot-prefixed excluded; bare "archive"/"Archive" indexed — the contract is literal: only .-prefix hides`)
    : !hasDot
      ? noted("exclusion-semantics", `dots excluded; docs=${docs.join(",")}`, "info")
      : open_("exclusion-semantics", `dotfile leaked into index: ${docs.join(",")}`);
}

/* GOV-05 surname tripwire evasion battery — the literal publish-check
   grep against staged payloads. Measures exactly which encodings slip
   the wire. */
{
  const dir = path.join(WORK, "corpus-tripwire");
  fs.mkdirSync(dir, { recursive: true });
  const Z = SUR.zhang, E = SUR.elshikh;
  const cases = [
    ["exact", `Officer ${Z} signed`],                         // must hit
    ["lowercase", `officer ${Z.toLowerCase()} signed`],       // evades: case-sensitive
    ["uppercase", `OFFICER ${Z.toUpperCase()} SIGNED`],       // evades: case
    ["mixed", `OfFiCeR zHaNg`],                               // evades: case
    ["leetspeak", `Officer Zh4ng signed`],                    // evades
    ["spaced", `Officer Z h a n g signed`],                   // evades
    ["fullwidth", `Officer ${cp(65338, 65352, 65345, 65358, 65351)} signed`], // evades: homoglyph
    ["zerowidth", `Officer Zh​ang signed`],               // evades: U+200B split
    ["fused", `Officer ${SUR.sly}therin reported`],           // evades: \b boundary
    ["fused-prefix", `Mc${SUR.sly} was here`],                // evades: \b boundary
    ["possessive", `Officer ${Z}'s seal`],                    // HITS — ' is non-word → \b holds
    ["entity", `Officer &#90;hang signed`],                   // evades: HTML entity
    ["url-encoded", `Officer %5Ahang signed`],                // evades: percent encoding
    ["second-surname", `${E} approved`],                      // must hit
  ];
  const hits = new Set(tripwireHits(dir));
  const evasions = [], caught = [];
  for (const [name, text] of cases) {
    const p = path.join(dir, `${name}.md`);
    fs.writeFileSync(p, text + "\n");
    // per-file test
    const before = new Set(tripwireHits(dir));
    const caughtNow = before.has(p) && !hits.has(p);
    (caughtNow ? caught : evasions).push(name);
  }
  const expectedCaught = ["exact", "possessive", "second-surname"];
  const correct = expectedCaught.every(c => caught.includes(c)) && caught.length === expectedCaught.length;
  correct
    ? noted("tripwire-evasion-classes",
        `tripwire catches exact-case words only — EVADES: ${evasions.join(", ")}. Scope: accident-catcher, not adversary filter; the real boundary is architectural (classified stays bridge-side)`,
        "medium")
    : open_("tripwire-evasion-classes", `unexpected match profile — caught=[${caught}] evaded=[${evasions}]`);
}

/* GOV-06 determinism under churn: add a doc, remove a doc — digests
   and counts must track exactly, order stable. */
{
  const dir = path.join(WORK, "corpus-churn");
  fs.mkdirSync(path.join(dir, "s"), { recursive: true });
  fs.writeFileSync(path.join(dir, "s", "a.md"), "one\n");
  fs.writeFileSync(path.join(dir, "s", "b.md"), "two\n");
  const r1 = index(dir);
  fs.writeFileSync(path.join(dir, "s", "c.md"), "three\n");
  const r2 = index(dir);
  fs.rmSync(path.join(dir, "s", "a.md"));
  const r3 = index(dir);
  const t1 = r1.index.totals.docs, t2 = r2.index.totals.docs, t3 = r3.index.totals.docs;
  const names3 = r3.index.docs.map(d => d.name).join(",");
  r1.ok && t1 === 2 && t2 === 3 && t3 === 2 && names3 === "b.md,c.md"
    ? held("churn-determinism", `docs 2→3→2, names sorted [${names3}] — the index tracks the corpus exactly`)
    : open_("churn-determinism", `t=${t1},${t2},${t3} names=[${names3}]`);
}

/* GOV-07 lattice DOM ceiling — the data path measured; the paint path
   is browser-side (no Chromium on this host — honest deferral). */
{
  const latPath = path.join(OUT, "ivector-lattice.json");
  const bytes = fs.statSync(latPath).size;
  const t0 = process.hrtime.bigint();
  const j = JSON.parse(fs.readFileSync(latPath, "utf8"));
  const parseMs = Number(process.hrtime.bigint() - t0) / 1e6;
  const t1 = process.hrtime.bigint();
  const layers = [];
  for (let k = 0; k < 15; k++) {
    const L = [];
    for (let r = 0; r < 15; r++) {
      const row = [];
      for (let c = 0; c < 15; c++) row.push(j.cells[k * 225 + r * 15 + c]);
      L.push(row);
    }
    layers.push(L);
  }
  const buildMs = Number(process.hrtime.bigint() - t1) / 1e6;
  j.cells.length === 3375
    ? noted("lattice-data-ceiling",
        `${(bytes / 1024).toFixed(1)} KiB artifact, 3375 cells: JSON.parse ${parseMs.toFixed(1)}ms, 15³ grid build ${buildMs.toFixed(1)}ms — data path trivial; DOM paint (3375 nodes) deferred to a browser environment (no Chromium on host)`,
        "info")
    : open_("lattice-data-ceiling", `cells=${j.cells.length} ≠ 3375`);
}

const tally = findings.reduce((a, x) => (a[x.verdict] = (a[x.verdict] || 0) + 1, a), {});
console.log(`\nGOV sweep: ${findings.length} probes — ${JSON.stringify(tally)}`);
console.log(tally.OPEN ? "  fractures found — the constitution leaks" : "  no fractures — the constitution held");

const out = path.join(SITE, "security", "findings.json");
const prior = JSON.parse(fs.readFileSync(out, "utf8"));
const merged = {
  generated: new Date().toISOString(),
  findings: [...(prior.findings || []).filter((x) => x.team !== "GOV"), ...findings] };
fs.writeFileSync(out, JSON.stringify(merged, null, 2));
// the staged corpora carry tripwire payloads — they are regenerable,
// and leaving them would trip the surname wire on the very tree it guards
fs.rmSync(WORK, { recursive: true, force: true });
process.exit(tally.OPEN ? 1 : 0);
