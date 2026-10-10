#!/usr/bin/env node
/* canon-verify.mjs — drawer-canon integrity + citation resolution.

   Two checks, both deterministic:

   1. CANON PARITY — every canon document must be byte-identical to its
      `.archive/originals/` counterpart (sha256). Canon is preserved, not
      edited; the archive copy is the seal. Master index and the working
      ledgers (CLAIMS-LEDGER, CANON-MATH-MAP, DOC-LEDGER, CONSOLIDATION-MAP,
      probability_analysis) are EXEMPT — they are living documents.

   2. CITATION RESOLUTION — every filesystem path cited in backticks inside
      the drawer ledgers must resolve on disk (absolute paths, ~/, or
      workspace-relative). A ledger that cites a dead path is stale by
      definition — same doctrine as dox-audit's dead-probe-cites.

   Boundary-safe by construction: the report carries file NAMES, hashes,
   and verdicts — never drawer content.

   Modes: (bare) dry-run · --emit writes security/out/canon-verify.json
   · --verify proves byte-parity + citation set unchanged. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const HOME = process.env.HOME;
const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const DRAWER = path.join(ROOT, "thoughts&convos", "AdmPaul");
const ORIG = path.join(DRAWER, ".archive", "originals");
const OUT = path.join(ROOT, "security", "out");
const EMIT = process.argv.includes("--emit");
const VERIFY = process.argv.includes("--verify");

const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");

/* Canon files that must stay byte-identical to originals/ (living
   documents — ledgers, index — are excluded by name) */
const LIVING = new Set([
  "CLAIMS-LEDGER.md", "CANON-MATH-MAP.md", "DOC-LEDGER.md",
  "CONSOLIDATION-MAP.md", "probability_analysis.md", "master_index.md",
  "notes.md", "VISION-AUDIT.json",
]);

/* ---------- canon parity ---------- */
const canonFiles = fs.readdirSync(ORIG).filter(f => fs.statSync(path.join(ORIG, f)).isFile());
const parity = [];
for (const f of canonFiles) {
  const live = path.join(DRAWER, f);
  const orig = path.join(ORIG, f);
  if (LIVING.has(f)) {
    parity.push({ file: f, verdict: "LIVING", drifted_from_original: fs.existsSync(live) && sha(live) !== sha(orig) });
    continue;
  }
  if (!fs.existsSync(live)) { parity.push({ file: f, verdict: "MISSING-LIVE" }); continue; }
  parity.push({ file: f, verdict: sha(live) === sha(orig) ? "SEALED" : "DRIFTED", sha256: sha(live).slice(0, 16) });
}

/* ---------- citation resolution ----------
   Scope: ledgers that cite live infrastructure. DOC-LEDGER.md is excluded —
   its subject matter IS dead/divergent paths (a findings ledger, not a
   reference). Remote-only trees (sheraton) classify as "remote-deferred" —
   unverifiable locally, not broken. Globs/bare names are skipped. */
const LEDGERS = ["CLAIMS-LEDGER.md", "CANON-MATH-MAP.md",
                 "CONSOLIDATION-MAP.md", "master_index.md"];
const cites = new Map();  // cited path -> ledgers
const backtickRe = /`([^`\n]{3,200})`/g;
const looksLikePath = (s) =>
  !s.includes("*") && s.length > 4 && s.includes("/") &&
  !/\s/.test(s) &&
  (/^(\/home\/|~\/|\/)/.test(s) ||
   /^(tools|security|src|docs|site|thoughts&convos|apps|deps|prototypes|golden|firmware|admiralty-desk|corpus|convos)\//.test(s) ||
   /\.(zig|mjs|py|qs|wasm|lean)$/.test(s));

/* sheraton-only roots — paths inside these are remote-deferred */
const REMOTE_ROOTS = ["~/Mosi", "~/CascadeProjects/concepts", "~/Desktop/Digit",
                      "~/backups", "~/CascadeProjects/EU", "192.168.12.2"];

/* sibling roots for cluster-relative resolution */
const SIB_ROOTS = [
  "CascadeProjects", "CascadeProjects/hardware",
  "CascadeProjects/hardware/experiments",
  "CascadeProjects/basic", "CascadeProjects/basic/Abby",
  "Music/Paul", "Desktop",
];

/* a cite recorded ON A LINE describing it as dead/dangling is a finding,
   not a reference — classify it recorded-dead, never broken */
const DEAD_CTX = /\b(dead|dangling|missing|does not exist|stale|recorded, not edited|defunct)\b/i;

for (const L of LEDGERS) {
  const p = path.join(DRAWER, L);
  if (!fs.existsSync(p)) continue;
  const txt = fs.readFileSync(p, "utf8");
  for (const line of txt.split("\n")) {
    for (const m of line.matchAll(backtickRe)) {
      const c = m[1].trim();
      if (!looksLikePath(c)) continue;
      if (!cites.has(c)) cites.set(c, { ledgers: [], deadCtx: false });
      const e = cites.get(c);
      e.ledgers.push(L);
      if (DEAD_CTX.test(line)) e.deadCtx = true;
    }
  }
}

const resolved = [], broken = [], remote = [], recordedDead = [];
for (const [cite, info] of [...cites].sort()) {
  const { ledgers, deadCtx } = info;
  if (REMOTE_ROOTS.some(r => cite.startsWith(r) || cite.includes(r))) {
    remote.push({ cite, ledgers }); continue;
  }
  const cands = [];
  if (cite.startsWith("~/")) cands.push(path.join(HOME, cite.slice(2)));
  else if (cite.startsWith("/")) cands.push(cite);
  else {
    cands.push(path.join(ROOT, cite));
    cands.push(path.join(ROOT, "site", cite));
    cands.push(path.join(DRAWER, cite));
    for (const s of SIB_ROOTS) cands.push(path.join(HOME, s, cite));
  }
  const hit = cands.find(c => fs.existsSync(c));
  if (hit) resolved.push({ cite, ledgers });
  else if (deadCtx) recordedDead.push({ cite, ledgers });
  else broken.push({ cite, ledgers });
}

/* ---------- verdict ---------- */
const sealed = parity.filter(p => p.verdict === "SEALED").length;
const living = parity.filter(p => p.verdict === "LIVING").length;
const drifted = parity.filter(p => p.verdict === "DRIFTED" || p.verdict === "MISSING-LIVE");
const report = {
  kind: "CANONVERIFYv1",
  ts: new Date().toISOString(),
  canon: { originals: canonFiles.length, sealed, living, drifted },
  citations: { cited: cites.size, resolved: resolved.length, remote: remote.length, recorded_dead: recordedDead.length, broken: broken.length },
  parity,
  broken_cites: broken.map(b => b.cite),
};
const ok = drifted.length === 0 && broken.length === 0;

if (VERIFY) {
  const prev = JSON.parse(fs.readFileSync(path.join(OUT, "canon-verify.json"), "utf8"));
  const sameCanon = JSON.stringify(prev.canon) === JSON.stringify(report.canon);
  const prevBroken = JSON.stringify((prev.broken_cites || []).sort());
  const sameBroken = prevBroken === JSON.stringify(broken.map(b => b.cite).sort());
  const good = sameCanon && sameBroken && ok;
  console.log(good
    ? `canon verify: GREEN — ${sealed} sealed, ${living} living, ${resolved.length}/${cites.size} cites resolve (${remote.length} remote-deferred), 0 broken`
    : `canon verify: DRIFT — canon ${JSON.stringify(report.canon)}; broken: ${broken.map(b => b.cite).slice(0, 8).join(", ") || "none"}`);
  process.exit(good ? 0 : 1);
}

if (EMIT) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "canon-verify.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(`canon-verify → security/out/canon-verify.json (${sealed} sealed, ${living} living, ${resolved.length}/${cites.size} cites, ${broken.length} broken)`);
  process.exit(ok ? 0 : 1);
}

console.log(`canon-verify DRY — ${sealed}/${canonFiles.length} sealed (+${living} living); ${resolved.length}/${cites.size} cites resolve, ${remote.length} remote-deferred, ${broken.length} broken`);
if (drifted.length) console.log(`  drifted: ${drifted.map(d => d.file).join(", ")}`);
if (broken.length) console.log(`  broken: ${broken.map(b => b.cite).slice(0, 20).join(", ")}`);
