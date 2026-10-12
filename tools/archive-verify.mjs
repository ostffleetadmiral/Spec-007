#!/usr/bin/env node
/* archive-verify.mjs — D11/P7: content-hash verification of the
   ~/.archives continuity corpus, both seal forms.

   Seal forms in the corpus:
     dir+SHA256SUMS   — a directory containing SHA256SUMS whose lines are
                        `<sha256>  <relpath>`; every listed file is re-
                        hashed, every present file is sealed.
     tarball+sidecar  — `X.tar.gz` + `X.tar.gz.sha256` whose line is
                        `<sha256>  <abspath>`; the tarball re-hashes.

   Rules honored:
     * never delete anything that has passed testing — this tool only
       READS; broken seals are findings, not repairs.
     * unsealed entries (dirs without SHA256SUMS, tarballs without
       sidecars, the `extracted/` scratch dir) are recorded as
       `unsealed` — visible, not silently passed.
     * strays (files that are neither tarballs nor sidecars at top
       level) are recorded too.

   Emit:   security/out/archive-report.json + archive-debrief.md
   Verify: re-run the full hash audit — any seal that verified before
           and fails now → BROKEN; exit nonzero. New archives are
           growth (allowed); sealed→broken and sealed→absent are not.

   Modes: (bare) dry-run · --emit · --verify
*/
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const HOME = process.env.HOME;
const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const OUT = path.join(ROOT, "security", "out");
const ARCHIVES = path.join(HOME, ".archives");
const EMIT = process.argv.includes("--emit");
const VERIFY = process.argv.includes("--verify");

/* streaming hash — the corpus holds >2GiB tarballs, past readFileSync's
   buffer limit */
const sha256 = (abs) => new Promise((resolve, reject) => {
  const h = crypto.createHash("sha256");
  fs.createReadStream(abs)
    .on("data", d => h.update(d))
    .on("end", () => resolve(h.digest("hex")))
    .on("error", reject);
});

/* bounded async pool — SPEED-AUDIT item 3/T6. Hashing is the sweep's
   dominant serial cost (~80s over ~270 files); jobs run ~POOL-wide, and
   results land in submission order so verdicts stay deterministic.
   Concurrency bounds open FDs/streams, never correctness. */
const POOL = 16;
async function pool(items, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(POOL, items.length) },
    async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    });
  await Promise.all(workers);
  return out;
}

/* two passes: collect every hash job first (manifest parse is cheap
   sync work), run them through one shared pool, then assemble results
   in the original top-level order — verdict bytes identical. */
const jobs = [];   // { abs } → hashed once, referenced by per-entry job lists
const pending = []; // per top-level entry: null (no hashing) or { kind, ... }
const top = fs.existsSync(ARCHIVES) ? fs.readdirSync(ARCHIVES).sort() : [];

for (const name of top) {
  const abs = path.join(ARCHIVES, name);
  const st = fs.statSync(abs);

  if (st.isDirectory()) {
    const sums = path.join(abs, "SHA256SUMS");
    if (name === "extracted") { pending.push({ kind: "scratch", name }); continue; }
    if (!fs.existsSync(sums)) { pending.push({ kind: "nosums", name }); continue; }
    const lines = fs.readFileSync(sums, "utf8").split("\n").filter(Boolean);
    const entry = { kind: "dir", name, abs, broken: [], missing: [], listed: new Set(), jobIdx: [] };
    for (const line of lines) {
      const m = line.match(/^([0-9a-f]{64})\s+(.+)$/);
      if (!m) { entry.broken.push(`<malformed:${line.slice(0, 24)}>`); continue; }
      const [, want, rel] = m;
      entry.listed.add(rel);
      /* a manifest cannot seal itself — the SHA256SUMS self-pin line is
         recorded, never counted as broken */
      if (rel === "SHA256SUMS") continue;
      const fp = path.join(abs, rel);
      if (!fs.existsSync(fp)) { entry.missing.push(rel); continue; }
      entry.jobIdx.push({ i: jobs.length, want, rel });
      jobs.push(fp);
    }
    pending.push(entry);
    continue;
  }

  if (name.endsWith(".sha256")) { pending.push({ kind: "skip", name }); continue; }
  if (name.endsWith(".tar.gz")) {
    const sidecar = abs + ".sha256";
    if (!fs.existsSync(sidecar)) { pending.push({ kind: "nosidecar", name }); continue; }
    const want = fs.readFileSync(sidecar, "utf8").match(/^([0-9a-f]{64})/)?.[1];
    pending.push({ kind: "tarball", name, abs, want, jobIdx: jobs.length });
    jobs.push(abs);
    continue;
  }
  pending.push({ kind: "stray", name, size: st.size });
}

const hashes = await pool(jobs, sha256);

const results = []; // { name, form, status, detail }
for (const e of pending) {
  switch (e.kind) {
    case "scratch":
      results.push({ name: e.name, form: "dir", status: "unsealed", detail: "scratch dir" });
      break;
    case "nosums":
      results.push({ name: e.name, form: "dir", status: "unsealed", detail: "no SHA256SUMS" });
      break;
    case "dir": {
      const { broken, missing } = e;
      let ok = 0;
      for (const j of e.jobIdx) (hashes[j.i] === j.want) ? ok++ : broken.push(j.rel);
      /* files present but not in the manifest → unsealed additions.
         Only FILES count — directories are traversal structure (the
         manifest lists nested paths like `src/foo`), and GITHEAD is the
         post-seal commit stamp, not sealable content */
      const present = fs.readdirSync(e.abs, { withFileTypes: true })
        .filter(x => x.isFile() && x.name !== "SHA256SUMS" && x.name !== "GITHEAD")
        .map(x => x.name);
      const extra = present.filter(f => ![...e.listed].some(l => l === f || l.startsWith(f + "/")));
      const status = broken.length || missing.length ? "broken"
        : extra.length ? "unsealed-additions" : "sealed";
      results.push({ name: e.name, form: "dir+SHA256SUMS", status,
        detail: `${ok} files verified` +
          (broken.length ? `, BROKEN: ${broken.join(",")}` : "") +
          (missing.length ? `, MISSING: ${missing.join(",")}` : "") +
          (extra.length ? `, unsealed: ${extra.join(",")}` : "") });
      break;
    }
    case "skip": break; // .sha256 sidecars — handled with their tarball
    case "nosidecar":
      results.push({ name: e.name, form: "tarball", status: "unsealed", detail: "no .sha256 sidecar" });
      break;
    case "tarball": {
      const got = hashes[e.jobIdx];
      results.push({ name: e.name, form: "tarball+sidecar",
        status: e.want === got ? "sealed" : "broken",
        detail: e.want === got ? "hash verified" : `hash mismatch want=${e.want?.slice(0,12)}… got=${got.slice(0,12)}…` });
      break;
    }
    case "stray":
      results.push({ name: e.name, form: "file", status: "stray", detail: `${e.size}B` });
      break;
  }
}

const sealed = results.filter(r => r.status === "sealed").length;
const broken = results.filter(r => r.status === "broken");
const unsealed = results.filter(r => r.status === "unsealed" || r.status === "unsealed-additions");

const report = {
  spec: "ARCHIVEVERIFYv1",
  generated: new Date().toISOString(),
  corpus: "~/.archives",
  note: "both seal forms verified — dir+SHA256SUMS and tarball+.sha256 sidecar; read-only, nothing repaired or deleted",
  total: results.length, sealed, broken: broken.length,
  unsealed: unsealed.length, stray: results.filter(r => r.status === "stray").length,
  results,
};

const debrief = [
  "# ARC — Archive Integrity Audit",
  "",
  `Corpus: ~/.archives — ${results.length} top-level entries`,
  `Sealed: ${sealed} · Broken: ${broken.length} · Unsealed: ${unsealed.length} · Stray: ${report.stray}`,
  "",
  ...(broken.length ? ["## BROKEN SEALS", ...broken.map(b => `- ${b.name}: ${b.detail}`), ""] : []),
  ...(unsealed.length ? ["## Unsealed (recorded, not excused)",
    ...unsealed.slice(0, 12).map(u => `- ${u.name}: ${u.detail}`),
    ...(unsealed.length > 12 ? [`- …and ${unsealed.length - 12} more`] : []), ""] : []),
].join("\n") + "\n";

if (VERIFY) {
  const prev = JSON.parse(fs.readFileSync(path.join(OUT, "archive-report.json"), "utf8"));
  const prevSealed = new Set((prev.results || []).filter(r => r.status === "sealed").map(r => r.name));
  const regressions = [];
  for (const r of results) {
    if (prevSealed.has(r.name) && r.status !== "sealed") regressions.push(`${r.name}(${r.status})`);
  }
  for (const name of prevSealed) {
    if (!results.find(r => r.name === name)) regressions.push(`${name}(absent)`);
  }
  const ok = regressions.length === 0 && broken.length === 0;
  console.log(ok
    ? `archive verify: GREEN — ${sealed} sealed, ${broken.length} broken, ${unsealed.length} unsealed`
    : `archive verify: FAIL — regressions: ${regressions.join(", ") || "none"} · broken: ${broken.map(b => b.name).join(", ") || "none"}`);
  process.exit(ok ? 0 : 1);
}
if (EMIT) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "archive-report.json"), JSON.stringify(report, null, 2) + "\n");
  fs.writeFileSync(path.join(OUT, "archive-debrief.md"), debrief);
  console.log(`archive audit → ${OUT}/archive-report.json + archive-debrief.md ` +
    `(${sealed} sealed / ${results.length} entries, ${broken.length} broken, ${unsealed.length} unsealed)`);
} else {
  console.log(debrief);
  console.log(`DRY — ${sealed}/${results.length} sealed; --emit to write`);
}
