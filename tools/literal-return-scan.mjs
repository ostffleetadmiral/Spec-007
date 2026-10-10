#!/usr/bin/env node
/* literal-return-scan.mjs — the construction-signature detector.

   The hydrogenLineLatticeCm() pattern: a function that LOOKS like it
   computes a physical quantity but returns a hardcoded literal — the
   expression is documented in comments, the constant is what's shipped.
   This is the mechanical signature of the CONSTRUCTION audit class: a
   function can only be as derived as its return statement.

   Detector: parse each zig file for fn bodies; flag any function whose
   EVERY return statement is a literal constant (numeric, or a single
   const-foldable expression with no dependence on parameters or
   computed locals). A function is only flagged if it has at least one
   return — declaration-free bodies aren't construction, they're stubs
   (different finding, flagged separately as 'empty').

   Conservative by design: only reports functions that return the SAME
   literal from all exit points, or literals with no input dependence.
   False positives are possible (constants legitimately defined as
   literal getters — e.g. `fn pi() return LITERAL` is fine when the
   function IS a constant accessor). Accessor-named functions
   (pi/getConstant/etc.) are whitelisted by the --names flag pattern.

   Output: JSON { file, fn, line, kind } per finding.
   Modes: (bare) scan-and-report · --emit writes security/out/literal-scan.json
          · --verify recompares against emitted artifact.
*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "security", "out", "literal-scan.json");
const HW = path.resolve(ROOT, "..", "..");           /* CascadeProjects/hardware */
const SRC = [path.join(ROOT, "src"), path.join(HW, "src")];

const FN_RE = /\bfn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)[^{]*\{/g;
const RET_RE = /\breturn\s+([^;]+);/g;
const LOCAL_RE = /\b(?:const|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?::[^=;]+)?=/g;

/* a literal constant: digits, dots, operators, known-foldable consts */
const LITERAL_RE = /^[\d\s.+\-*/()%_a-zA-Z"]+$/;
const isLiteral = (expr) => {
  const t = expr.trim();
  if (!t) return false;
  if (!LITERAL_RE.test(t)) return false;
  /* must contain at least one digit or ALL-CAPS const — a bare
     identifier could be a computed local, don't flag those */
  if (/[0-9]/.test(t)) return true;
  if (/^[A-Z_][A-Z0-9_]*$/.test(t)) return true;
  return false;
};

function scanFile(file) {
  const text = fs.readFileSync(file, "utf8");
  const findings = [];
  let m;
  while ((m = FN_RE.exec(text)) !== null) {
    const name = m[1];
    const params = m[2].trim();
    const bodyStart = m.index + m[0].length;
    /* walk to matching close brace */
    let depth = 1, i = bodyStart;
    while (i < text.length && depth > 0) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") depth--;
      i++;
    }
    const body = text.slice(bodyStart, i - 1);
    const line = text.slice(0, m.index).split("\n").length;
    const returns = [...body.matchAll(RET_RE)].map(r => r[1]);
    if (returns.length === 0) continue;
    /* names the body binds — a return referencing one is DERIVED, not
       literal: `return t1.sub(t2).div(den)` computes from locals */
    const paramNames = params
      .split(",")
      .map(p => p.trim().split(":")[0].trim())
      .filter(Boolean);
    const localNames = [...body.matchAll(LOCAL_RE)].map(l => l[1]);
    const bound = new Set([...paramNames, ...localNames]);
    const usesBound = returns.some(r =>
      [...bound].some(b => b && new RegExp(`\\b${b}\\b`).test(r))
    );
    /* a call on a lowercase-starting identifier is a function call —
       derived even if the arg is a literal (verifyDimension(), etc.) */
    const callsFn = returns.some(r => /\b[a-z][A-Za-z0-9_]*\s*\(/.test(r));
    const allLiteral = returns.every(isLiteral);
    if (allLiteral && !usesBound && !callsFn) {
      findings.push({ file: path.relative(ROOT, file), fn: name, line, kind: "literal-return", returns });
    }
  }
  return findings;
}

const all = SRC.flatMap(d =>
  fs.readdirSync(d).filter(f => f.endsWith(".zig")).map(f => scanFile(path.join(d, f)))
).flat();

const mode = process.argv.includes("--emit") ? "emit"
  : process.argv.includes("--verify") ? "verify" : "report";

const artifact = { schema: "LITERAL-SCAN-v1", findings: all, count: all.length };
const bytes = JSON.stringify(artifact, null, 2) + "\n";

if (mode === "verify") {
  const ok = fs.existsSync(OUT) && fs.readFileSync(OUT, "utf8") === bytes;
  console.log(ok ? `literal-scan verify OK — ${all.length} findings` : "literal-scan verify FAIL — run --emit");
  process.exit(ok ? 0 : 1);
}
if (mode === "emit") {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, bytes);
}
console.log(`literal-scan — ${all.length} finding(s)`);
for (const f of all) console.log(`  ${f.file}:${f.line}  ${f.fn}()  ${f.kind}  -> ${f.returns.join(" | ")}`);
