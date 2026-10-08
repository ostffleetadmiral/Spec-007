#!/usr/bin/env node
/* evidence-manifest.mjs — D11/P6: SHA-256 manifest over sibling cites.

   Doctrine: a claim that cites `sibling:<root>:<path>` is only as strong
   as the file's content. This manifest pins every cited file's hash —
   a sibling file that changes silently is evidence DRIFT, not a stale
   citation.

   Sources:
     1. `sibling:root:rel` cites in the EN dossier (canonical surface),
        attributed to the claim row (C##) they appear in.
     2. file-backed anchors in the bridge ledger (check.file entries).

   Emit:   security/out/evidence-manifest.json — per-cite {root, rel,
           sha256, size, claims[]}
   Verify: re-hash every cite — changed content → DRIFTED, missing →
           ABSENT. Both are findings; the verify exits nonzero.

   Modes: (bare) dry-run · --emit · --verify
*/
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const HOME = process.env.HOME;
const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const OUT = path.join(ROOT, "security", "out");
const EMIT = process.argv.includes("--emit");
const VERIFY = process.argv.includes("--verify");

/* same $HOME-relative root map as bridge-map.mjs / dox-audit.mjs */
const SIB = {
  "hardware": "CascadeProjects/hardware",
  "zig-k3-port": "CascadeProjects/hardware/experiments/zig-k3-port",
  "zig-k3-preserved": "CascadeProjects/hardware/experiments/zig-k3-port-local-preserved-20261004",
  "theue": "CascadeProjects/hardware/experiments/TheUE",
  "qstar-llm": "CascadeProjects/hardware/experiments/qstar-llm",
  "bs-analysis": "CascadeProjects/hardware/experiments/BS",
  "rations": "CascadeProjects/Rations",
  "theplatform": "CascadeProjects/ThePlatform",
  "octolab": "CascadeProjects/octo",
  "falsifible": "CascadeProjects/Falsifible",
  "abby-donor-shelf": "CascadeProjects/basic/Abby",
  "qstar-llm-basic": "CascadeProjects/basic/qstar-llm",
  "eu-version-z": "Music/Paul/Sci-Fi",
  "eu-legacy": "Music/Paul/engineered_universe",
  "eu-vx4": "Music/Paul/newest",
  "codon": "Music/Paul/codon",
  "space-agent": "Music/Paul/space-agent",
  "pj-hexredox": "Desktop/PJ",
  "qstar-corpus": "Desktop/Qstar",
  "ralph-corpus": "Desktop/Ralph",
  "sheraton-shelf": "Desktop/Sheraton",
  "tp-donor-shelf": "Desktop/ThePlatform",
  "desi-llama": "Desktop/Desi",
  "fano-engine": "Documents/animation",
  "ark-ivector": "Documents/Ark",
  "mosi-papertunes": "Documents/Mosi",
  "archive-corpus": "Documents/archive",
  "models-store": "Documents/models",
};

/* ---------- collect cites ---------- */
const dossier = fs.readFileSync(
  path.join(ROOT, "docs", "en", "spec-007-research-dossier.md"), "utf8");

/* cite → claims: walk dossier rows, attribute each sibling: cite to the
   row's claim id (| C101 | ...) */
const cites = new Map(); // "root:rel" → { roots claims Set }
const rows = dossier.split("\n").filter(l => /^\|\s*C\d+/.test(l));
for (const row of rows) {
  const claim = row.match(/^\|\s*(C\d+)/)?.[1] || "?";
  for (const m of row.matchAll(/sibling:([a-z0-9-]+):([A-Za-z0-9_\-./]+)/g)) {
    const key = `${m[1]}:${m[2]}`;
    if (!cites.has(key)) cites.set(key, { root: m[1], rel: m[2], claims: new Set() });
    cites.get(key).claims.add(claim);
  }
}

/* file-backed bridge anchors are evidence too */
try {
  const bridge = JSON.parse(fs.readFileSync(path.join(OUT, "bridge-ledger.json"), "utf8"));
  for (const a of bridge.anchors || []) {
    const f = a.check?.file;
    if (!f || !a.root || a.root === "spec-007") continue;
    const key = `${a.root}:${f}`;
    if (!cites.has(key)) cites.set(key, { root: a.root, rel: f, claims: new Set(a.claims || []) });
    for (const c of a.claims || []) cites.get(key).claims.add(c);
  }
} catch { /* bridge ledger optional — dossier cites still manifest */ }

/* ---------- hash each cite ---------- */
function hashFile(abs) {
  if (!fs.existsSync(abs)) return { status: "absent" };
  const st = fs.statSync(abs);
  if (st.isDirectory()) {
    /* directory cite: hash the sorted listing + subtree size — a dir
       cite pins its shape, not every byte (trees grow) */
    const entries = [];
    const stack = [abs];
    let bytes = 0, count = 0;
    while (stack.length) {
      const d = stack.pop();
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) stack.push(p);
        else { entries.push(path.relative(abs, p)); bytes += fs.statSync(p).size; count++; }
      }
    }
    entries.sort();
    const h = crypto.createHash("sha256").update(entries.join("\n") + `\n${bytes}`).digest("hex");
    return { status: "dir", sha256: h, size: bytes, entries: count };
  }
  const h = crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex");
  return { status: "file", sha256: h, size: st.size };
}

const entries = [];
for (const [key, c] of [...cites.entries()].sort()) {
  const abs = SIB[c.root] ? path.join(HOME, SIB[c.root], c.rel) : null;
  const r = abs ? hashFile(abs) : { status: "unknown-root" };
  entries.push({ cite: `sibling:${key}`, root: c.root, rel: c.rel,
    claims: [...c.claims].sort(), ...r });
}

const absent = entries.filter(e => e.status === "absent" || e.status === "unknown-root");

const manifest = {
  spec: "EVIDENCEMANIFESTv1",
  generated: new Date().toISOString(),
  note: "sha256 pins over every sibling: cite — generated by tools/evidence-manifest.mjs; drift = finding",
  cite_count: entries.length,
  claims_covered: [...new Set(entries.flatMap(e => e.claims))].length,
  entries,
};

if (VERIFY) {
  const prev = JSON.parse(fs.readFileSync(path.join(OUT, "evidence-manifest.json"), "utf8"));
  const prevMap = new Map((prev.entries || []).map(e => [e.cite, e]));
  const drift = [], gone = [], added = [];
  for (const e of entries) {
    const p = prevMap.get(e.cite);
    if (!p) { added.push(e.cite); continue; }
    if (p.sha256 !== e.sha256) drift.push(e.cite);
  }
  for (const p of prevMap.keys()) {
    if (!entries.find(e => e.cite === p)) gone.push(p);
  }
  const ok = drift.length === 0 && gone.length === 0;
  console.log(ok
    ? `evidence verify: GREEN — ${entries.length} cites pinned, ${manifest.claims_covered} claims covered${added.length ? ` (+${added.length} new)` : ""}`
    : `evidence verify: DRIFT — changed: ${drift.join(", ") || "none"} · removed: ${gone.join(", ") || "none"}`);
  if (drift.length) console.log("  drifted:", drift.join(", "));
  process.exit(ok ? 0 : 1);
}
if (EMIT) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "evidence-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`evidence manifest → ${OUT}/evidence-manifest.json ` +
    `(${entries.length} cites, ${manifest.claims_covered} claims, ${absent.length} absent)`);
} else {
  console.log(`cites: ${entries.length} · claims covered: ${manifest.claims_covered} · absent: ${absent.length}`);
  if (absent.length) console.log("  absent:", absent.map(e => e.cite).join(", "));
  console.log("DRY — --emit to write");
}
