#!/usr/bin/env node
/* harness-binding.mjs — claim<->harness binding gate.

   Doctrine: a ledger row may not claim VERIFIED without an executable
   anchor. This tool binds each ledger-cited harness to reality:
     1. every `*.zig` path cited in the drawer audit docs must exist;
     2. every stated test count "N tests" adjacent to a citation must
        equal the file's actual `test "` block count;
     3. every spec007_*.zig harness in src/ must be cited by at least
        one drawer ledger — an uncited harness is an unfiled result.

   Scope (drawer side, per 7q): thoughts&convos/convos/*.md +
   thoughts&convos/AdmPaul/CANON-MATH-MAP.md — the ledgers that cite
   harnesses. CANON-MATH-MAP is read-only here (untouched per owner).

   Output: security/out/harness-binding.json — every citation row with
   resolved path, claimed vs actual test count, verdict.
   Modes: (bare) report · --emit · --verify
*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DRAWER = path.join(ROOT, "thoughts&convos");
const OUT = path.join(ROOT, "security", "out", "harness-binding.json");

const LEDGERS = [
  ...fs.readdirSync(path.join(DRAWER, "convos"))
    .filter(f => f.endsWith(".md"))
    .map(f => path.join(DRAWER, "convos", f)),
  path.join(DRAWER, "AdmPaul", "CANON-MATH-MAP.md"),
];

/* citation forms: `spec007_x.zig`, `src/spec007_x.zig`, `x.zig` with
   an optional "(N tests)" or "N tests green" nearby on the same line */
const CITE_RE = /`?(?:[a-zA-Z_/.-]*\/)?([A-Za-z_][A-Za-z0-9_]*\.zig)`?[^\n]*/g;
const COUNT_RE = /(\d+)\s+tests?\b/;

function testCount(file) {
  const text = fs.readFileSync(file, "utf8");
  return (text.match(/\btest\s+"/g) || []).length;
}

/* resolve a cited zig name against src/ (spec007 harnesses live there)
   and hardware/src via the ../../ sibling convention */
function resolveZig(name) {
  const cands = [
    path.join(ROOT, "src", name),
    path.resolve(ROOT, "..", "..", "src", name),
    path.join(ROOT, "src", "quantum", name),
    path.resolve(ROOT, "..", "..", "src", "quantum", name),
  ];
  return cands.find(p => fs.existsSync(p)) || null;
}

const rows = [];
for (const doc of LEDGERS) {
  if (!fs.existsSync(doc)) continue;
  const lines = fs.readFileSync(doc, "utf8").split("\n");
  lines.forEach((line, idx) => {
    let m;
    CITE_RE.lastIndex = 0;
    while ((m = CITE_RE.exec(line)) !== null) {
      const name = m[1];
      if (!name.endsWith(".zig")) continue;
      if (name.startsWith("_") || name.includes("*")) continue; // glob patterns, not citations
      const resolved = resolveZig(name);
      const claimed = (line.match(COUNT_RE) || [])[1];
      const actual = resolved ? testCount(resolved) : null;
      rows.push({
        doc: path.relative(ROOT, doc),
        line: idx + 1,
        harness: name,
        resolved: resolved ? path.relative(ROOT, resolved) : null,
        claimed_tests: claimed ? parseInt(claimed, 10) : null,
        actual_tests: actual,
        verdict: !resolved ? "UNRESOLVED"
          : claimed && parseInt(claimed, 10) !== actual ? "COUNT-MISMATCH"
          : "BOUND",
      });
    }
  });
}

/* rule 3: every spec007_*.zig in src/ must appear in at least one row */
const cited = new Set(rows.filter(r => r.resolved).map(r => r.harness));
const orphans = fs.readdirSync(path.join(ROOT, "src"))
  .filter(f => f.startsWith("spec007_") && f.endsWith(".zig") && !cited.has(f));

const counts = rows.reduce((a, r) => (a[r.verdict] = (a[r.verdict] || 0) + 1, a), {});
const artifact = { schema: "HARNESS-BINDING-v1", rows, orphans, counts };
const bytes = JSON.stringify(artifact, null, 2) + "\n";

const mode = process.argv.includes("--emit") ? "emit"
  : process.argv.includes("--verify") ? "verify" : "report";

if (mode === "verify") {
  const ok = fs.existsSync(OUT) && fs.readFileSync(OUT, "utf8") === bytes;
  console.log(ok ? `harness-binding verify OK — ${counts.BOUND || 0} bound` : "harness-binding verify FAIL — run --emit");
  process.exit(ok ? 0 : 1);
}
if (mode === "emit") {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, bytes);
}
console.log(`harness-binding — ${rows.length} citations, ${JSON.stringify(counts)}${orphans.length ? `, ${orphans.length} uncited` : ""}`);
for (const r of rows.filter(r => r.verdict !== "BOUND"))
  console.log(`  ${r.verdict}  ${r.doc}:${r.line}  ${r.harness}  claimed=${r.claimed_tests} actual=${r.actual_tests}`);
for (const o of orphans) console.log(`  UNCITED  src/${o}`);
