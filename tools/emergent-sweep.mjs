#!/usr/bin/env node
/* emergent-sweep.mjs — the emergent-discovery sweep.
 *
 * Scans every populated sibling root for named integer constants, then
 * finds values carried by the SAME identifier in >=2 independent roots —
 * shared-name/shared-value is the clean signature of an emergent
 * discovery (a structure that recurred, not a number that collided).
 * Bare-literal convergence across >=3 roots is filed as "convergent"
 * (numerology-tier unless the paradigm map already claims it).
 *
 * Verdicts:
 *   filed       — already claimed in the paradigm map
 *   emergent    — shared identifier across independent roots, not filed;
 *                 each must carry an explicit disposition in DISPOSITIONS
 *                 (EMG-02 ratchets: nothing emergent stays unfiled or
 *                  unexplained)
 *   convergent  — significant value, literal-only co-occurrence
 *
 * Emit → security/out/emergent-ledger.json + emergent-debrief.md
 */
import fs from "node:fs";
import path from "node:path";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, "..");
const HOME = process.env.HOME;
const OUT = path.join(ROOT, "security", "out");
const LEDGER = path.join(OUT, "emergent-ledger.json");
const DEBRIEF = path.join(OUT, "emergent-debrief.md");
const DISCOVERIES = path.join(ROOT, "docs", "en", "spec-007-discoveries.en.md");

const SIBROOTS = {
  "hardware": "CascadeProjects/hardware",
  "zig-k3-port": "CascadeProjects/hardware/experiments/zig-k3-port",
  /* zig-k3-preserved excluded — a byte-preserved copy of zig-k3-port,
     not an independent root */
  "theue": "CascadeProjects/hardware/experiments/TheUE",
  "qstar-llm": "CascadeProjects/hardware/experiments/qstar-llm",
  "bs-analysis": "CascadeProjects/hardware/experiments/BS",
  "spec-007": "CascadeProjects/hardware/experiments/Spec-007",
  "rations": "CascadeProjects/Rations",
  "theplatform": "CascadeProjects/ThePlatform",
  "octolab": "CascadeProjects/octo",
  "falsifible": "CascadeProjects/Falsifible",
  "eu-version-z": "Music/Paul/Sci-Fi",
  "eu-legacy": "Music/Paul/engineered_universe",
  "eu-vx4": "Music/Paul/newest",
  "codon": "Music/Paul/codon",
  "space-agent": "Music/Paul/space-agent",
  "pj-hexredox": "Desktop/PJ",
  "ark-ivector": "Documents/Ark",
  "mosi-papertunes": "Documents/Mosi",
  "archive-corpus": "Documents/archive",
  "models-store": "Documents/models",
};

const SIGNIFICANT = new Set([
  7, 15, 16, 21, 27, 30, 31, 42, 49, 56, 62, 64, 90, 104, 112, 113, 133,
  136, 137, 168, 240, 248, 288, 336, 421, 480, 496, 720, 721, 1365, 2016,
  3375, 4096, 53888, 57346, 22715355,
]);

/* identifiers too generic to carry structure even when shared */
const GENERIC_IDENT = new Set([
  "SIZE", "need", "out", "raw", "bits", "n", "count", "total", "len",
  "HEADER_SIZE", "HEADER_LEN", "norm", "margin", "entry_size", "offset",
  "cell_size", "dim", "numerator", "target", "cycle", "name", "e",
]);

/* public-format/protocol constants — shared because the spec is shared,
   not because structure emerged */
const PROTO_RE = /TOKEN_ID|_VOCAB|MAGIC|SEED|CRC|STUN|SALT|PORT$|TIMEOUT|MTU|ALIGN|FINGERPRINT|SAMPLE_RATE|CODEBOOK|TRIG|SIGMOID|TABLE_SIZE|BLOCK_SIZE|_BYTES$|QR_|LORA|DTLS|ICE_|AKA|ACK_|RT_|MODEL_ENTRY|outSize|fnOutSize|data$|^S\d?$|^S$|^f\d$|PRIMITIVE_POLY|FIELD_SIZE|delta$|^p$|^S9$/;

/* engineering parameters the dossier shares with its own engine by
   lineage — spec-007's numbers ARE hardware's numbers */
const LINEAGE_PAIR = new Set(["spec-007", "hardware"]);

/* framework-domain vocabulary in the identifier itself */
const DOMAIN_RE = /E8|E7|E6|F4|G2|D8|OCT|FANO|LATTICE|CODON|JORDAN|GOLAY|FREUDENTHAL|TRIALITY|PATI|SPINOR|MERSENNE|GUT|QSTAR|SPEC008|SCALING|INTERIOR|BOUNDARY|DOUBLING|CLOSURE|CELL|SHELL|CLAIM|VOLUME|FACES|_ROOT|alpha|codata|q64|CONSCIOUSNESS|SOLITON|CENTRAL|H21/i;

/* explicit dispositions for emergent candidates — the ratchet lives here:
   a shared-name discovery is either paradigm-filed or explained.
   The cubic-scaling chain resolves: the "volume" constants ARE the
   filed 15→16→32→62→128→256 chain cubed (225=15², 4096=16³, 32768=32³,
   238328=62³, 2097152=128³, 16777216=256³). */
const DISPOSITIONS = {
  "5::OBJECTIVE_INTERIOR_DIM": "emergent — objective-interior dim 5 shared by hardware + qstar-llm (5D interior of the 6D objective)",
  "16::CORE_SIDE": "paradigm-filed — core side 16 is the 16=15+1 / 2⁴ structure",
  "16::SPINOR_DIM": "paradigm-filed — SO(10) chiral spinor dim 16 is the filed 16=15+1 decomposition",
  "16::TOTAL_STATES": "paradigm-filed — 16 total states is the filed 16-state structure",
  "16::cap": "routine-shared-constant — generic capacity bound, coincidental value",
  "16::TAG_LEN": "routine-shared-constant — AEAD/MAC tag width: 16 bytes is the standard GCM/HMAC tag size",
  "4096::MAX_PAYLOAD": "routine-shared-constant — 4 KiB payload bound, generic buffer sizing",
  "4096::SDP_MAX_LEN": "routine-shared-constant — SDP length bound, generic sizing",
  "721::plus_one": "paradigm-filed — 721=16³−15³ shell boundary (720+1)",
  "6::FACES_PER_CELL": "paradigm-filed — 6-face cell is the filed 6D lattice-cell structure (qstar-llm + rations)",
  "6::INTERIOR_DIM": "emergent — INTERIOR_DIM=6 named constant shared by hardware + qstar-llm",
  "9::SCALING_DIM": "emergent — scaling dimension S=9 (C+defect=2+7) shared by hardware + qstar-llm",
  "14::G2_DIM": "paradigm-filed — G₂ dim 14 is filed octonion-automorphism structure (mosi defines it independently)",
  "16::CLOSURE_L": "emergent — closure-side L=16 shared by hardware + qstar-llm",
  "16::DETERMINED_CLAIMS": "emergent — the 16-determined / 20-free audit split is implemented as named constants in hardware + qstar-llm",
  "20::FREE_CLAIMS": "emergent — FREE_CLAIMS=20 shared by hardware + qstar-llm (the consciousness-routed claim partition)",
  "21::H21_BARE": "coincidence — mosi's 21 is the hydrogen 21-cm line (radio astronomy), unrelated to Pati-Salam",
  "23::GOLAY_N": "emergent — extended Golay code length 23 named in hardware + qstar-llm: shared error-correction structure",
  "42::ROTATION_SEED": "emergent — renderer ROTATION_SEED=42 shared by qstar-llm + rations (the signature constant)",
  "42::q64_val": "emergent — Q64.64 value convention shared by qstar-llm + zig-k3-port",
  "52::F4_DIM": "emergent — F₄ dim 52 named constant shared by hardware + qstar-llm (Aut(J₃(O)) algebra)",
  "56::FREUDENTHAL_DIM": "emergent — Freudenthal magic dim 56 named in hardware + qstar-llm (E₇ layer of the magic square)",
  "90::GRID_ROWS": "emergent — render GRID_ROWS=90 shared by hardware + qstar-llm",
  "112::D8_ROOTS": "emergent — D₈ root count 112 named in hardware + qstar-llm (SO(16) rung of the doubling ladder)",
  "113::GUT_SUPER_PERIOD": "emergent — GUT super-period 113 shared by qstar-llm + zig-k3-port",
  "137::codata": "lineage — α⁻¹≈137 CODATA constant: dossier-lineage parameter (spec-007 cites hardware's physics)",
  "43::alpha": "lineage — α coefficient 43 (=43π+ln7 form): dossier-lineage parameter",
  "137::FINE": "lineage — fine-structure constant: dossier-lineage parameter",
  "225::FACE_CELLS": "paradigm-filed — 225=15² is a cubic-scaling-chain instance (filed chain: 15→16→32→62→128→256)",
  "238328::CODON_BOUNDARY_VOLUME": "paradigm-filed — 238328=62³ is a cubic-scaling-chain instance",
  "32768::FIRST_DOUBLING_VOLUME": "paradigm-filed — 32768=32³ is a cubic-scaling-chain instance",
  "32::FIRST_DOUBLING_L": "paradigm-filed — side 32 of the first doubling (32³ chain rung)",
  "2097152::THIRD_DOUBLING_VOLUME": "paradigm-filed — 2097152=128³ is a cubic-scaling-chain instance",
  "16777216::OCTONION_CAPACITY_VOLUME": "paradigm-filed — 16777216=256³ is a cubic-scaling-chain instance",
  "256::OCTONION_CAPACITY_L": "paradigm-filed — side 256 of the capacity volume (256³ chain rung)",
  "4096::CLOSURE_VOLUME": "paradigm-filed — 4096=16³ chain rung",
  "4096::SHELL_CELLS": "paradigm-filed — 4096=16³ shell cells, chain rung",
  "3375::CELL_COUNT": "paradigm-filed — 3375=15³ interior, chain rung",
  "3375::INTERIOR_CELLS": "paradigm-filed — 3375=15³ interior, chain rung",
  "3375::INTERIOR_VOLUME": "paradigm-filed — 3375=15³ interior, chain rung",
  "721::BOUNDARY_CELLS": "paradigm-filed — 721=16³−15³ shell boundary",
  "721::shell_plus_one": "paradigm-filed — 721=16³−15³ shell boundary",
  "240::E8_ROOTS": "paradigm-filed — E₈ root count",
  "240::E8_ROOT_COUNT": "paradigm-filed — E₈ root count",
  "240::ROOT_COUNT": "paradigm-filed — E₈ root count",
  "240::MAGIC0": "lineage — wire magic byte: dossier-lineage constant",
  "160::MAGIC1": "lineage — wire magic byte: dossier-lineage constant",
  "104::SEAL_OFF": "lineage — wire seal offset: dossier-lineage constant",
  "36::TOTAL_CLAIMS": "paradigm-filed — the 36-claim audit count is the filed audit-vocabulary paradigm",
  "49::CENTRAL_ROW_SUM": "paradigm-filed — 15³ central row sum",
  "27::GF_GENERATOR": "paradigm-filed — GF(2⁸) generator shared by the erasure dialects",
  "56::FRAME_PAYLOAD": "paradigm-filed — 56-byte frame payload is the filed wire dialect",
  "62::CODON_BOUNDARY_L": "paradigm-filed — codon boundary 62=64−2",
  "64::CODON_COUNT": "paradigm-filed — 64 codons",
  "136::FANO_WIRE": "paradigm-filed — 136-byte wire dialect",
  "421::E0_NODES": "paradigm-filed — 421 e0 nodes",
  "53888::QSTAR_STATE_BYTES": "paradigm-filed — 53,888-byte qstar state",
  "27000::CONSCIOUSNESS_DENOMINATOR": "paradigm-filed — 1/8−7/27000 denominator in scaling analysis",
};

const SCANNED_EXT = new Set([".zig", ".py", ".ts", ".js", ".mjs", ".qs",
  ".lean", ".rs", ".cs", ".c", ".h", ".cpp"]);
const MAX_FILES = 400;
const MAX_SIZE = 400_000;
const SCAN_DIRS = ["src", "docs", "qsharp", "formalize", "tools",
  "experiments", "security", "prototypes", "os"];

const CONST_RE = /(?:pub\s+)?(?:const|#define|constexpr\s+\w+|static\s+\w+)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?::[^=\n]+)?=\s*(0x[0-9a-fA-F]+|\d{1,10})\b/g;

const walk = (dir, depth, acc) => {
  if (acc.length >= MAX_FILES || depth > 6) return;
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    if (acc.length >= MAX_FILES) return;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (/^(node_modules|\.git|dist|build|out|target|vendor|__pycache__|archives|deps|third_party)$/i.test(e.name)) continue;
      walk(p, depth + 1, acc);
    } else if (SCANNED_EXT.has(path.extname(e.name))) {
      acc.push(p);
    }
  }
};

const rootFiles = (rootAbs) => {
  const acc = [];
  for (const base of ["README.md", "AGENTS.md"]) {
    const p = path.join(rootAbs, base);
    if (fs.existsSync(p)) acc.push(p);
  }
  for (const d of SCAN_DIRS) {
    const p = path.join(rootAbs, d);
    if (fs.existsSync(p)) walk(p, 0, acc);
  }
  return acc.slice(0, MAX_FILES);
};

const scan = () => {
  /* identKey "VAL::IDENT" → Set(root); literal value → Set(root) */
  const sharedIdent = new Map();
  const literals = new Map();
  const stats = { roots_scanned: 0, files_scanned: 0, roots_absent: [] };
  for (const [name, rel] of Object.entries(SIBROOTS)) {
    const abs = path.join(HOME, rel);
    if (!fs.existsSync(abs)) { stats.roots_absent.push(name); continue; }
    stats.roots_scanned++;
    for (const f of rootFiles(abs)) {
      stats.files_scanned++;
      let text;
      try {
        const st = fs.statSync(f);
        if (st.size > MAX_SIZE) continue;
        text = fs.readFileSync(f, "utf8");
      } catch { continue; }
      for (const m of text.matchAll(CONST_RE)) {
        const ident = m[1];
        const raw = m[2];
        const val = raw.startsWith("0x") ? parseInt(raw, 16) : parseInt(raw, 10);
        if (!Number.isSafeInteger(val) || val < 3 || GENERIC_IDENT.has(ident)) continue;
        const key = `${val}::${ident}`;
        if (!sharedIdent.has(key)) sharedIdent.set(key, new Set());
        sharedIdent.get(key).add(name);
      }
      for (const v of SIGNIFICANT) {
        if (new RegExp(`\\b${v}\\b`).test(text)) {
          if (!literals.has(v)) literals.set(v, new Set());
          literals.get(v).add(name);
        }
      }
    }
  }
  return { sharedIdent, literals, stats };
};

const build = () => {
  const { sharedIdent, literals, stats } = scan();
  const docText = fs.existsSync(DISCOVERIES) ? fs.readFileSync(DISCOVERIES, "utf8") : "";
  const filedSet = new Set(
    [...docText.matchAll(/\b(\d{1,9})\b/g)].map(m => parseInt(m[1], 10))
      .filter(Number.isSafeInteger));

  const candidates = [];
  /* channel 1: shared identifier across roots */
  for (const [key, rootsSet] of [...sharedIdent.entries()].sort()) {
    if (rootsSet.size < 2) continue;
    const [valS, ident] = key.split("::");
    const val = parseInt(valS, 10);
    const roots = [...rootsSet].sort();
    const disp = DISPOSITIONS[key];
    const allLineage = roots.every(r => LINEAGE_PAIR.has(r));
    let verdict;
    if (disp) {
      verdict = disp.startsWith("paradigm-filed") ? "filed"
        : disp.startsWith("coincidence") ? "coincidence"
        : disp.startsWith("lineage") ? "lineage"
        : disp.startsWith("routine") ? "routine"
        : "emergent";
    } else if (allLineage) verdict = "lineage";
    else if (PROTO_RE.test(ident)) verdict = "routine";
    else if (filedSet.has(val)) verdict = "filed";
    else if (SIGNIFICANT.has(val) || DOMAIN_RE.test(ident)) verdict = "emergent";
    else continue; /* coincidence noise — not a candidate */
    if (verdict === "coincidence") continue;
    candidates.push({
      channel: "shared-ident",
      value: val, ident, roots, root_count: roots.length,
      verdict,
      disposition: disp ||
        (verdict === "lineage" ? "dossier↔engine lineage constant" :
         verdict === "routine" ? "shared public format/protocol constant" :
         verdict === "filed" ? "in paradigm map" :
         "UNFILED — needs disposition"),
    });
  }
  /* channel 2: significant literal convergence (>=3 roots, literal or const) */
  for (const [val, roots] of [...literals.entries()].sort((a, b) => a[0] - b[0])) {
    if (roots.size < 3) continue;
    candidates.push({
      channel: "literal",
      value: val, ident: null, roots: [...roots].sort(), root_count: roots.size,
      verdict: filedSet.has(val) ? "filed" : "convergent",
      disposition: filedSet.has(val) ? "in paradigm map" : "literal convergence — recorded",
    });
  }
  const tally = {};
  for (const c of candidates) tally[c.verdict] = (tally[c.verdict] || 0) + 1;
  return {
    generated: "2026-10-08", stats,
    candidate_count: candidates.length, verdicts: tally, candidates,
  };
};

const debrief = (led) => {
  const L = [
    `# Emergent-discovery sweep — ${led.generated}`,
    ``,
    `Roots scanned: ${led.stats.roots_scanned} | files: ${led.stats.files_scanned} | cross-root candidates: ${led.candidate_count}`,
    ``,
    `| Verdict | Count |`,
    `|---|---|`,
    ...Object.entries(led.verdicts).sort().map(([v, n]) => `| ${v} | ${n} |`),
    ``,
    `## Emergent — shared identifier, independent roots`,
    ``,
    ...led.candidates.filter(c => c.verdict === "emergent").map(c =>
      `- **${c.value} :: ${c.ident}** — roots: ${c.roots.join(", ")}\n  → ${c.disposition}`),
    ``,
    `## Convergent literals (significant values, ≥3 roots)`,
    ``,
    ...led.candidates.filter(c => c.verdict === "convergent").map(c =>
      `- **${c.value}** — ${c.root_count} roots: ${c.roots.join(", ")}`),
    ``,
    `## Filed`,
    ``,
    ...led.candidates.filter(c => c.verdict === "filed").map(c =>
      `- **${c.value}${c.ident ? " :: " + c.ident : ""}** — ${c.roots.join(", ")}`),
  ];
  return L.join("\n") + "\n";
};

const emit = () => {
  const led = build();
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(LEDGER, JSON.stringify(led, null, 2) + "\n");
  fs.writeFileSync(DEBRIEF, debrief(led));
  console.log(`emergent ledger → ${LEDGER} (${led.candidate_count} candidates: ${JSON.stringify(led.verdicts)})`);
};

const verify = () => {
  if (!fs.existsSync(LEDGER)) { console.error("ledger absent — run --emit"); process.exit(1); }
  const committed = JSON.parse(fs.readFileSync(LEDGER, "utf8"));
  const fresh = build();
  delete committed.generated; delete fresh.generated;
  const ok = JSON.stringify(committed) === JSON.stringify(fresh);
  const unfiled = fresh.candidates.filter(c => c.verdict === "emergent" && c.disposition.startsWith("UNFILED"));
  if (ok && unfiled.length === 0) {
    console.log(`emergent verify: GREEN — ${fresh.candidate_count} candidates, ${fresh.verdicts.emergent || 0} emergent (all dispositioned), 0 unfiled`);
  } else {
    console.error(`emergent verify: FAIL — deterministic=${ok} unfiled=${unfiled.length}${unfiled.length ? ": " + unfiled.map(c => `${c.value}::${c.ident}`).join(",") : ""}`);
    process.exit(1);
  }
};

const mode = process.argv[2];
if (mode === "--emit") emit();
else if (mode === "--verify") verify();
else { console.log("usage: emergent-sweep.mjs --emit | --verify"); process.exit(2); }
