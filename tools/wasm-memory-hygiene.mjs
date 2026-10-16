#!/usr/bin/env node
/* wasm-memory-hygiene.mjs — rations_free ABI scanner.

   rations_free has a two-argument ABI: (ptr, len). A missing length used to
   collapse to a zero-length free at the WASM boundary, leaving the allocation
   live and preventing a reliable wipe-before-free boundary.

   The scanner checks executable JS in site/ and security/, including inline
   scripts in HTML. Comments and literals are masked before calls are parsed.
   Bare mode reports; --verify fails on any call with fewer than two args.
*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const RATIONS_SRC = path.resolve(ROOT, "../../family/Rations/src");
const SCANDIRS = [path.join(ROOT, "site"), path.join(ROOT, "security")];
if (fs.existsSync(RATIONS_SRC)) SCANDIRS.push(RATIONS_SRC);
const FREE_RE = /\brations_free\s*\(/g;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
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

function callArity(src, openIndex) {
  let depth = 1, comma = 0, i = openIndex + src.slice(openIndex).indexOf("(") + 1;
  let quote = null, esc = false, lineComment = false, blockComment = false;
  for (; i < src.length && depth > 0; i++) {
    const c = src[i], n = src[i + 1];
    if (lineComment) { if (c === "\n") lineComment = false; continue; }
    if (blockComment) { if (c === "*" && n === "/") { i++; blockComment = false; } continue; }
    if (quote) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "/" && n === "/") { lineComment = true; i++; continue; }
    if (c === "/" && n === "*") { blockComment = true; i++; continue; }
    if (c === "'" || c === '"' || c === "`") { quote = c; continue; }
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "," && depth === 1) comma++;
  }
  return comma + 1;
}

function scanFile(file) {
  const text = fs.readFileSync(file, "utf8");
  const hits = [];
  for (const s of scriptBodies(file)) {
    const masked = maskJs(s.body);
    let m;
    FREE_RE.lastIndex = 0;
    while ((m = FREE_RE.exec(masked)) !== null) {
      const argc = callArity(masked, m.index);
      if (argc < 2) {
        const abs = s.offset + m.index;
        const line = text.slice(0, abs).split("\n").length;
        hits.push({ file: path.relative(ROOT, file), line, argc });
      }
    }
  }
  return hits;
}

const findings = SCANDIRS.flatMap((d) => walk(d)).flatMap(scanFile);
const verify = process.argv.includes("--verify");
const artifact = { schema: "WASM-MEMORY-HYGIENE-v1", count: findings.length, findings };
if (verify && findings.length) {
  console.error(JSON.stringify(artifact, null, 2));
  process.exit(1);
}
console.log(`wasm-memory-hygiene — ${findings.length} bad rations_free call(s)`);
for (const f of findings) console.log(`  ${f.file}:${f.line} argc=${f.argc}`);
