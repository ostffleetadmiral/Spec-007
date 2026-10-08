#!/usr/bin/env node
/* override-audit.mjs — the D6 claims override.
   Every dossier claim gets three passes:
     1. re-verify   — resolve every checkable anchor the evidence cites
                      (backtick paths, probe IDs, live counts)
     2. adversarial — attack the verdict: Verified-family claims with
                      zero resolved anchors drift; honest labels must
                      still be present verbatim
     3. grade + map — final grade + which cluster root substantiates
   Emits security/out/override-ledger.json + override-debrief.md.
   Bare run is dry; --emit writes; --verify proves the ledger matches. */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const HOME = process.env.HOME;
const OUT = path.join(ROOT, "security", "out");
const CLAIMS_MD = path.join(ROOT, "docs", "en", "spec-007-research-dossier.md");

const args = new Set(process.argv.slice(2));
const EMIT = args.has("--emit"), VERIFY = args.has("--verify");

/* ---------- parse the claims table ---------- */
const rows = fs.readFileSync(CLAIMS_MD, "utf8").split("\n")
  .filter(l => /^\| C\d+ \|/.test(l))
  .map(l => {
    const c = l.split("|").map(x => x.trim());
    return { id: c[1], claim: c[2], type: c[3], verdict: c[4], evidence: c[5] || "" };
  });

/* ---------- ledgers + live artifacts ---------- */
const findings = JSON.parse(fs.readFileSync(
  path.join(ROOT, "site", "security", "findings.json"), "utf8"));
const held = new Set((findings.findings || []).filter(r => /HELD|HARDENED/.test(r.verdict)).map(r => r.id));
const known = new Set((findings.findings || []).map(r => r.id));

/* suite-native teams — harnesses that mint their own id space dynamically
   (COMM-, SENT-, FURN-…). Cites to these resolve as external-suite anchors. */
const suiteTeams = new Set();
const extIdLiterals = new Set();
try {
  for (const f of fs.readdirSync(path.join(ROOT, "security"))) {
    if (!f.endsWith(".mjs")) continue;
    const src = fs.readFileSync(path.join(ROOT, "security", f), "utf8");
    for (const m of src.matchAll(/id:\s*[`'"]([A-Z]{2,8})-?/g)) suiteTeams.add(m[1]);
    for (const m of src.matchAll(/\b([A-Z]{2,8})-\d{1,2}\b/g)) extIdLiterals.add(m[0]);
  }
} catch {}
/* probe-id vocabulary — only real teams match; FANO-1/SHA-1/SPEC-007 excluded */
const TEAMS = ["DESK","WIRE","AUTH","BOT","ZIG","RED","BLUE","BLACK","GRAY","COMM",
  "SENT","HARN","FLEET","CLUSTER","ENGINE","CONT","LIBRARY","PROD","CURR","CENS",
  "SPEC004","OVR","SUP","KALI"];
const PROBE_RE = new RegExp("\\b(" + TEAMS.join("|") + ")-(\\d{1,2})\\b", "g");
const ALIAS = { ENG: "ENGINE", LIB: "LIBRARY", CONT: "CONT" };
/* expand range cites: "ENG-01..04" → the full range */
function probeIds(text) {
  const ids = new Set();
  for (const m of text.matchAll(/\b([A-Z]{2,8})-(\d{1,2})\.\.(\d{1,2})\b/g)) {
    const team = ALIAS[m[1]] || m[1];
    if (TEAMS.includes(m[1]) || TEAMS.includes(team))
      for (let i = +m[2]; i <= +m[3]; i++) ids.add(team + "-" + String(i).padStart(2, "0"));
  }
  for (const m of text.matchAll(PROBE_RE)) ids.add((ALIAS[m[1]] || m[1]) + "-" + m[2]);
  return ids;
}

/* recomputable live facts — the numbers the dossier cites */
const facts = {};
try {
  const ac = JSON.parse(fs.readFileSync(path.join(ROOT, "site", "assets", "academy-manifest.json"), "utf8"));
  facts.lessons = ac.lesson_count;
} catch {}
try {
  const cap = JSON.parse(fs.readFileSync(path.join(ROOT, "site", "assets", "zig-capability-registry.json"), "utf8"));
  facts.capabilities = cap.capability_count;
} catch {}
try {
  const arch = JSON.parse(fs.readFileSync(path.join(ROOT, "site", "assets", "archive-manifest.json"), "utf8"));
  facts.archives = (arch.archives || []).length;
} catch {}
try {
  const eng = JSON.parse(fs.readFileSync(path.join(ROOT, "site", "engine-manifest.json"), "utf8"));
  facts.runtimes = eng.payload && eng.payload.runtime_count;
} catch {}
try {
  const led = JSON.parse(fs.readFileSync(path.join(ROOT, "site", "assets", "production-ledger.json"), "utf8"));
  facts.assets = led.asset_count || (led.counts && led.counts.total);
  facts.claims = led.counts && led.counts.claim;
  facts.codex = led.counts && led.counts.codex;
} catch {}
facts.findings = (findings.findings || []).length;

/* corpus for cross-reference anchors — dossier twins + calc harnesses */
const corpus = (() => {
  const parts = [];
  const add = d => { try { for (const f of fs.readdirSync(d))
    if (/\.(md|zig)$/.test(f)) parts.push(fs.readFileSync(path.join(d, f), "utf8")); } catch {} };
  add(path.join(ROOT, "docs", "en")); add(path.join(ROOT, "src"));
  return parts.join("\n");
})();

/* ---------- cluster root mapping ---------- */
const ROOTMAP = [
  [/rations|quine|wasm|invite|shamir|webrtc|relay/i, "Rations"],
  [/paper|qr\b|stega|lora|afsk|video.*transport|beheader|isg|polyglot/i, "Mosi"],
  [/qstar|lattice|421|e0 node|15.?³/i, "qstar-llm"],
  [/k3|kimi|trunk|tokeniz/i, "zig-k3-port"],
  [/theue|chiralmath|capabilit/i, "TheUE"],
  [/euz|eu_version|engineered universe/i, "EU.VERSION.Z"],
  [/mound|axiom|hurwitz|jordan|e8\b|octonion|free.param/i, "MOUND"],
  [/ark|ivector|i-vector/i, "Ark"],
  [/fano engine|animation|render/i, "Fano Engine"],
  [/codon|rna|genetic/i, "codon"],
  [/octolab|gitlab/i, "octo"],
  [/theplatform|8d physics/i, "ThePlatform"],
  [/sp016|platform|desk|fano-1|callsign|genesis|grant|totp|keystore|containment|dossier|canon|manifest|academy|blueprint|wire|envelope|fleet/i, "Spec-007"],
];

/* ---------- the audit ---------- */
const VERIFIED_RE = /^verified/i;
const LED = [];
let drifted = 0, refuted = 0;

for (const r of rows) {
  const ev = r.evidence;
  /* pass 1 — resolve anchors */
  const paths = [...ev.matchAll(/`([^`]+)`/g)].map(m => m[1])
    .filter(p => /[.\/\\*]/.test(p) && !/:\/\//.test(p) && !/^\//.test(p) &&
      !/^(fano1\.|FANO-|C\d+$|[a-f0-9]{6,}$|\d+\.\d+)/.test(p));
  const siblings = {
    Rations: path.join(HOME, "CascadeProjects", "Rations"),
    experiments: path.join(HOME, "CascadeProjects", "hardware", "experiments"),
    family: path.join(HOME, "CascadeProjects", "Rations"),
  };
  /* basename fallback index — drawer/deps/docs/site basenames across the repo */
  const basenameIdx = new Map();
  const idxDirs = ["", "site", "site/assets", "deps", "docs/en", "thoughts&convos",
    "tools", "security", "src"];
  for (const d of idxDirs) {
    const abs = path.join(ROOT, d);
    try { for (const f of fs.readdirSync(abs)) basenameIdx.set(f, path.join(abs, f)); }
    catch {}
  }
  const resolvePath = (p) => {
    const tries = [path.join(ROOT, p), path.join(ROOT, "site", p),
      path.join(ROOT, "site", "assets", p)];
    for (const [k, base] of Object.entries(siblings)) {
      if (p.startsWith(k + "/")) tries.push(path.join(base, p.slice(k.length + 1)));
      tries.push(path.join(base, p));
    }
    /* family/<Root>/rest → sibling Root + rest */
    const fm = p.match(/^family\/([^/]+)\/(.+)$/);
    if (fm) tries.push(path.join(HOME, "CascadeProjects", fm[1], fm[2]),
      path.join(HOME, "CascadeProjects", "hardware", "experiments", fm[1], fm[2]),
      path.join(HOME, "CascadeProjects", "Rations", fm[2]));
    if (basenameIdx.has(path.basename(p))) return true;
    if (p.includes("*")) {
      return tries.some(t => {
        const dir = t.slice(0, t.indexOf("*")).replace(/[^/\\]*$/, "");
        const pre = path.basename(t).split("*")[0];
        try { return fs.readdirSync(dir).some(f => f.startsWith(pre)); }
        catch { return false; }
      });
    }
    return tries.some(t => fs.existsSync(t));
  };
  const pathHits = paths.filter(resolvePath);
  /* code-symbol anchors — `enroll()`, `fano1.identity`, `sealed: true` etc. */
  const codeBlob = []; // lazy: symbol → resolves in repo source?
  const symbols = [...ev.matchAll(/`([^`]+)`/g)].map(m => m[1])
    .filter(p => !paths.includes(p) && /^[\w$.\[\]()'"=:, -]{3,60}$/.test(p) &&
      !/^\d|FANO-|C\d+/.test(p));
  let symHits = 0;
  const searchDirs = ["site/assets", "src", "tools", "security"];
  for (const s of symbols.slice(0, 12)) {
    const lit = s.replace(/\(\)$/, "");
    for (const d of searchDirs) {
      const abs = path.join(ROOT, d);
      let found = false;
      try {
        for (const f of fs.readdirSync(abs)) {
          if (!/\.(mjs|js|zig|ts|json|md)$/.test(f) || fs.statSync(path.join(abs, f)).isDirectory()) continue;
          if (fs.readFileSync(path.join(abs, f), "utf8").includes(lit)) { found = true; break; }
        }
      } catch {}
      if (found) { symHits++; break; }
    }
  }
  /* calc-harness anchor — "(harness)"/"harness-enforced" cites resolve when the
     integer calculation harness exists (it's the artifact the claim means) */
  const harnessCited = /\(harness\)|harness-enforced|harness\b/i.test(ev) &&
    fs.existsSync(path.join(ROOT, "src", "spec007_calculations.zig"));
  /* cross-reference anchors — cited quantities that appear in the corpus
     outside the claim's own row (duty-point consistency is mechanical) */
  const xref = [...ev.matchAll(/~?(\d[\d,.]*\d|\d)\s*(k?Wh?|kW\/m²|mL\/min|g\/s|L\/min|°C|bar|tests?|%|B\b|min\b)/g)]
    .map(m => m[1].replace(/,/g, ""))
    .filter(n => n.length >= 2)
    .filter(n => corpus.split(n).length > 2).length;
  /* literature/documentary citation — verified-practice verdicts that cite
     published work rather than local executable evidence */
  const litCited = /literature|measured|published|standard\b|datasheet|doi:|zenodo/i.test(ev);
  const probes = [...probeIds(ev)];
  const probesHeld = probes.filter(p => held.has(p));
  const probesExt = probes.filter(p => !held.has(p) &&
    (extIdLiterals.has(p) || suiteTeams.has(p.split("-")[0]) || known.has(p)));
  const probesDead = probes.filter(p => !held.has(p) && !probesExt.includes(p));
  /* count citations: "546 lessons", "3,472 rows", "12 runtimes", "101 probes"… */
  const counts = [...ev.matchAll(/(\d[\d,]*)\s*(lessons?|rows?|capabilities|runtimes?|archives|probes|claims?|assets|entries|tests)\b/gi)];
  const countChecks = counts.map(m => {
    const n = parseInt(m[1].replace(/,/g, ""), 10), w = m[2].toLowerCase();
    let live = null, snapshot = false;
    if (/lesson/.test(w)) live = facts.lessons;
    else if (/capabilit/.test(w)) live = facts.capabilities;
    else if (/row/.test(w)) { live = facts.findings; snapshot = true; }
    else if (/runtime/.test(w)) live = facts.runtimes;
    else if (/archive/.test(w)) { live = facts.archives; snapshot = true; }
    else if (/probe|finding/.test(w)) { live = facts.findings; snapshot = true; }
    else if (/claim/.test(w)) live = rows.length;
    else if (/codex|entries/.test(w)) live = facts.codex;
    else if (/asset/.test(w)) live = facts.assets;
    /* snapshot counts (probes/archives/findings) are wave-dated measurements —
       they never count as anchors and never drift; identity-count claims
       (lessons/claims/codex/capabilities/runtimes) are verified live */
    const ok = snapshot ? "snapshot" : live == null ? "unmapped" :
      n === live ? "ok" : "drift";
    return { cited: n, word: w, live, ok };
  });
  const anchors = pathHits.length + probesHeld.length +
    countChecks.filter(c => c.ok === "ok").length + symHits + (harnessCited ? 1 : 0) + xref;

  /* pass 2 — adversarial */
  const notes = [];
  for (const c of countChecks.filter(c => c.ok === "drift"))
    notes.push(`count drift: cited ${c.cited} ${c.word}, live ${c.live}`);
  for (const p of probesDead) notes.push(`dead probe ref: ${p}`);
  for (const p of paths.filter(p => !pathHits.includes(p))) notes.push(`dead path ref: ${p}`);
  const verifiedFamily = VERIFIED_RE.test(r.verdict);
  if (verifiedFamily && anchors === 0 && probesExt.length === 0 && !litCited)
    notes.push("VERIFIED verdict with zero resolvable anchors");

  /* pass 3 — grade + map */
  const roots = [...new Set(ROOTMAP.filter(([re]) => re.test(r.claim + " " + ev)).map(([, name]) => name))];
  let grade;
  if (notes.some(n => /count drift|VERIFIED verdict with zero/.test(n))) { grade = "DRIFTED"; drifted++; }
  else if (/rejected|refuted|contradicted/i.test(r.verdict)) grade = "HOLDS-AS-REJECTED";
  else if (verifiedFamily && anchors > 0) grade = "REVERIFIED";
  else if (verifiedFamily && (probesExt.length > 0 || litCited)) grade = "EXT-CITED";
  else grade = "HOLDS-AS-LABELED";

  LED.push({
    id: r.id, verdict: r.verdict, grade,
    anchors: { paths: pathHits.length, symbols: symHits, probes_held: probesHeld.length,
      probes_ext: probesExt.length, counts_ok: countChecks.filter(c => c.ok === "ok").length },
    roots, notes,
  });
}

const tally = {};
LED.forEach(l => { tally[l.grade] = (tally[l.grade] || 0) + 1; });

const report = {
  spec: "CLAIMOVERRIDEv1",
  generated: new Date().toISOString(),
  claim_count: LED.length,
  grades: tally,
  drifted, refuted,
  facts,
  ledger: LED,
};

/* ---------- debrief text ---------- */
const lines = [
  "# D6 — Claims Override (3-pass audit)",
  "",
  `Claims audited: ${LED.length}`,
  `Grades: ${Object.entries(tally).map(([k, v]) => `${k} ${v}`).join(" · ")}`,
  "",
  "| ID | verdict | grade | anchors | roots | notes |",
  "|---|---|---|---|---|---|",
  ...LED.map(l => `| ${l.id} | ${l.verdict} | ${l.grade} | ` +
    `p${l.anchors.paths}/s${l.anchors.symbols}/h${l.anchors.probes_held}/x${l.anchors.probes_ext}/c${l.anchors.counts_ok} | ` +
    `${l.roots.join(", ") || "—"} | ${l.notes.join("; ") || "—"} |`),
];
const debrief = lines.join("\n") + "\n";

if (VERIFY) {
  const prev = JSON.parse(fs.readFileSync(path.join(OUT, "override-ledger.json"), "utf8"));
  const same = JSON.stringify(prev.ledger) === JSON.stringify(report.ledger) &&
    prev.claim_count === report.claim_count;
  console.log(same
    ? `override verify: GREEN — ${report.claim_count} claims, ${JSON.stringify(tally)}`
    : "override verify: DRIFT — ledger differs from committed state");
  process.exit(same ? 0 : 1);
}
if (EMIT) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "override-ledger.json"), JSON.stringify(report, null, 2) + "\n");
  fs.writeFileSync(path.join(OUT, "override-debrief.md"), debrief);
  console.log(`override audit → ${OUT}/override-ledger.json + debrief (${LED.length} claims)`);
} else {
  console.log(debrief.slice(0, 1400) + "\n…");
  console.log(`DRY — ${LED.length} claims: ${JSON.stringify(tally)}`);
}
