#!/usr/bin/env node
/* native-dialog-audit.mjs — executable native-dialog detector.

   prompt(), alert(), and confirm() are forbidden on the desk/Electron path.
   This scanner checks executable script bodies only: comments and string
   literals are masked before the call matcher runs, so prose about the rule
   does not become a finding.

   Modes:
     bare / --report   print findings
     --verify          exit 1 if any executable native dialog remains
*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(ROOT, "site");
const CALL_RE = /(?<![.$\w])(?:(?:window|globalThis|self)\s*\.\s*)?(?:prompt|alert|confirm)\s*\(/g;

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(?:js|mjs|html)$/.test(ent.name)) out.push(p);
  }
  return out;
}

function maskJs(src) {
  const out = src.split("");
  let quote = null, esc = false, lineComment = false, blockComment = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (lineComment) {
      if (c === "\n") lineComment = false;
      else out[i] = " ";
      continue;
    }
    if (blockComment) {
      if (c === "*" && n === "/") { out[i] = out[i + 1] = " "; i++; blockComment = false; }
      else out[i] = " ";
      continue;
    }
    if (quote) {
      if (esc) { esc = false; out[i] = " "; continue; }
      if (c === "\\") { esc = true; out[i] = " "; continue; }
      if (c === quote) { quote = null; out[i] = " "; continue; }
      if (c !== "\n") out[i] = " ";
      continue;
    }
    if (c === "/" && n === "/") { lineComment = true; out[i] = out[i + 1] = " "; i++; continue; }
    if (c === "/" && n === "*") { blockComment = true; out[i] = out[i + 1] = " "; i++; continue; }
    if (c === "'" || c === '"' || c === "`") { quote = c; out[i] = " "; }
  }
  return out.join("");
}

function scriptBodies(file) {
  const text = fs.readFileSync(file, "utf8");
  if (!file.endsWith(".html")) return [{ body: text, offset: 0 }];
  const bodies = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const attrs = m[1] || "";
    if (/\bsrc\s*=/.test(attrs)) continue;
    if (/\btype\s*=\s*["'](?!module|text\/javascript|application\/javascript)/i.test(attrs)) continue;
    bodies.push({ body: m[2], offset: m.index + m[0].indexOf(m[2]) });
  }
  return bodies;
}

function methodDefinition(src, start) {
  let depth = 0, i = start + src.slice(start).indexOf("(");
  for (; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")") {
      depth--;
      if (!depth) break;
    }
  }
  let j = i + 1;
  while (/\s/.test(src[j] || "")) j++;
  if (src[j] !== "{") return false;
  let k = start - 1;
  while (k >= 0 && /\s/.test(src[k])) k--;
  return src[k] === "{" || src[k] === ",";
}

function scanFile(file) {
  const hits = [];
  for (const s of scriptBodies(file)) {
    const masked = maskJs(s.body);
    let m;
    CALL_RE.lastIndex = 0;
    while ((m = CALL_RE.exec(masked)) !== null) {
      if (methodDefinition(masked, m.index)) continue;
      const abs = s.offset + m.index;
      const line = fs.readFileSync(file, "utf8").slice(0, abs).split("\n").length;
      hits.push({ file: path.relative(ROOT, file), line, call: m[0].trim() });
    }
  }
  return hits;
}

const files = fs.existsSync(SITE) ? walk(SITE) : [];
const findings = files.flatMap(scanFile);
const verify = process.argv.includes("--verify");
const artifact = { schema: "NATIVE-DIALOG-AUDIT-v1", count: findings.length, findings };

if (verify && findings.length) {
  console.error(JSON.stringify(artifact, null, 2));
  process.exit(1);
}
console.log(`native-dialog audit — ${findings.length} executable finding(s)`);
for (const f of findings) console.log(`  ${f.file}:${f.line} ${f.call}`);
