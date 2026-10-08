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

const results = []; // { name, form, status, detail }
const top = fs.existsSync(ARCHIVES) ? fs.readdirSync(ARCHIVES).sort() : [];

for (const name of top) {
  const abs = path.join(ARCHIVES, name);
  const st = fs.statSync(abs);

  if (st.isDirectory()) {
    const sums = path.join(abs, "SHA256SUMS");
    if (name === "extracted") { /* scratch dir — recorded, not sealed */
      results.push({ name, form: "dir", status: "unsealed", detail: "scratch dir" });
      continue;
    }
    if (!fs.existsSync(sums)) {
      results.push({ name, form: "dir", status: "unsealed", detail: "no SHA256SUMS" });
      continue;
    }
    const lines = fs.readFileSync(sums, "utf8").split("\n").filter(Boolean);
    let broken = [], missing = [], ok = 0;
    const listed = new Set();
    for (const line of lines) {
      const m = line.match(/^([0-9a-f]{64})\s+(.+)$/);
      if (!m) { broken.push(`<malformed:${line.slice(0, 24)}>`); continue; }
      const [, want, rel] = m;
      listed.add(rel);
      /* a manifest cannot seal itself — the SHA256SUMS self-pin line is
         recorded, never counted as broken */
      if (rel === "SHA256SUMS") continue;
      const fp = path.join(abs, rel);
      if (!fs.existsSync(fp)) { missing.push(rel); continue; }
      if (await sha256(fp) === want) ok++;
      else broken.push(rel);
    }
    /* files present but not in the manifest → unsealed additions.
       Only FILES count — directories are traversal structure (the
       manifest lists nested paths like `src/foo`), and GITHEAD is the
       post-seal commit stamp, not sealable content */
    const present = fs.readdirSync(abs, { withFileTypes: true })
      .filter(e => e.isFile() && e.name !== "SHA256SUMS" && e.name !== "GITHEAD")
      .map(e => e.name);
    const extra = present.filter(f => ![...listed].some(l => l === f || l.startsWith(f + "/")));
    const status = broken.length || missing.length ? "broken"
      : extra.length ? "unsealed-additions" : "sealed";
    results.push({ name, form: "dir+SHA256SUMS", status,
      detail: `${ok} files verified` +
        (broken.length ? `, BROKEN: ${broken.join(",")}` : "") +
        (missing.length ? `, MISSING: ${missing.join(",")}` : "") +
        (extra.length ? `, unsealed: ${extra.join(",")}` : "") });
    continue;
  }

  /* files: tarball + sidecar, or strays */
  if (name.endsWith(".sha256")) continue; // handled with its tarball
  if (name.endsWith(".tar.gz")) {
    const sidecar = abs + ".sha256";
    if (!fs.existsSync(sidecar)) {
      results.push({ name, form: "tarball", status: "unsealed", detail: "no .sha256 sidecar" });
      continue;
    }
    const want = fs.readFileSync(sidecar, "utf8").match(/^([0-9a-f]{64})/)?.[1];
    const got = await sha256(abs);
    results.push({ name, form: "tarball+sidecar",
      status: want === got ? "sealed" : "broken",
      detail: want === got ? "hash verified" : `hash mismatch want=${want?.slice(0,12)}… got=${got.slice(0,12)}…` });
    continue;
  }
  /* strays: NOTE files, loose artifacts — recorded */
  results.push({ name, form: "file", status: "stray", detail: `${st.size}B` });
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
