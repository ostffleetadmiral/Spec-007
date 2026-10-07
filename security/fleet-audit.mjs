// fleet-audit.mjs — external descent-audit of the fleet giants.
// The anvil: does another codebase's own test suite hold under
// malformed inputs, boundary overflows, interruptions, and
// repeat-determinism — classified under our verdict grid:
//   HELD     — withstands the probe cleanly
//   BOUNDARY — holds within a narrower/honestly-classified envelope
//   FRACTURE — real break: silent wrongness, fabricated state, or
//              unhandled crash where the contract promised tolerance
//   SEALED   — confirmed unsafe by evidence
//
// Standing rule: we audit each giant against ITS OWN declared
// contracts (its AGENTS.md / README), not ours. Integer-purity is a
// canonical-core law — a Python research repo using floats is noted,
// not condemned. Read-only: fault injection runs in temp dirs and
// subprocesses; nothing in a giant's tree is modified.
//
//   node security/fleet-audit.mjs <giant|all> [--stage A|B|C] [--emit]
//   giants: euz (eu_version_z), downbeat, theplatform
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUTDIR = path.join(HERE, "out");
const run = promisify(execFile);

const results = [];
const report = (giant, stage, name, verdict, detail) => {
  results.push({ giant, stage, probe: name, verdict, detail });
  console.log(`  [${verdict.padEnd(8)}] ${giant}/${stage} ${name}  ${detail}`);
};

/* ---------------- helpers ---------------- */

const sh = (cmd, args, opts = {}, timeoutMs = 120_000) =>
  new Promise(resolve => {
    const p = spawn(cmd, args, { ...opts, timeout: timeoutMs });
    let out = "", err = "";
    p.stdout?.on("data", d => (out += d));
    p.stderr?.on("data", d => (err += d));
    p.on("close", (code, sig) =>
      resolve({ code, sig, out, err, timedOut: sig === "SIGTERM" }));
    p.on("error", e => resolve({ code: -1, sig: null, out, err: String(e), timedOut: false }));
  });

const python = (code, cwd, timeoutMs = 60_000) =>
  sh("python3", ["-c", code], {
    cwd, env: { ...process.env, PYTHONPATH: "src" },
  }, timeoutMs);

/* ================= GIANT: eu_version_z ================= */

async function euz_stageA(root) {
  console.log(`\n== euz Stage A: per-file pytest exhaustion`);
  const files = fs.readdirSync(path.join(root, "tests"))
    .filter(f => /^test_.*\.py$|_test\.py$/.test(f)).sort();   /* test files only — conftest/__init__ are not tests */
  let pass = 0, fail = 0, err = 0, timeouts = 0, crashes = 0, filesOk = 0;
  const failures = [];
  const workers = 4;
  let idx = 0;
  const next = async () => {
    while (idx < files.length) {
      const f = files[idx++];
      /* no -q here: the project's own pyproject addopts already sets -q,
         and -qq suppresses the summary line we parse */
      const r = await sh("python3",
        ["-m", "pytest", `tests/${f}`, "--tb=line", "-x"],
        { cwd: root, env: { ...process.env, PYTHONPATH: "src" } }, 300_000);
      const pm = r.out.match(/(\d+) passed/), fm = r.out.match(/(\d+) failed/),
            em = r.out.match(/(\d+) error/);
      if (r.timedOut || r.sig) { timeouts++; failures.push(`${f}: timeout/sig ${r.sig}`); continue; }
      if (r.code === 0) {
        pass += pm ? +pm[1] : 0;
        if (!pm) crashes++; else filesOk++;
        if (!pm) failures.push(`${f}: exit0 but no summary — ${r.out.trim().split("\n").pop()?.slice(0,100)}`);
      } else {
        pass += pm ? +pm[1] : 0; fail += fm ? +fm[1] : 0; err += em ? +em[1] : 0;
        if (!fm && !em) crashes++;
        const why = r.out.trim().split("\n").filter(l => l.trim()).pop() ?? "";
        failures.push(`${f}: exit${r.code} ${fm ? fm[1] + "F" : ""}${em ? em[1] + "E" : ""} — ${why.slice(0, 110)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: workers }, next));
  report("euz", "A", "pytest-per-file",
    fail + err + timeouts + crashes === 0 ? "HELD" : "FRACTURE",
    `${files.length} test files (${filesOk} green): ${pass} passed, ${fail} failed, ${err} errors, ${timeouts} timeouts, ${crashes} crashes` +
    (failures.length ? ` | ${failures.slice(0, 6).join(" ; ")}` : ""));

  /* their own audit gate — release_blocked is intentional per AGENTS.md */
  const audit = await sh("python3",
    ["-m", "eu_version_z.cli", "audit", "--check", "--output", "/tmp/euz-audit-report.json"],
    { cwd: root, env: { ...process.env, PYTHONPATH: "src" } }, 120_000);
  const blocked = /release_blocked.: *true/.test(audit.out);
  report("euz", "A", "self-audit-gate",
    audit.code === 1 && blocked ? "HELD" : "BOUNDARY",
    `audit --check exit ${audit.code} release_blocked:${blocked} — honest self-gate per AGENTS.md`);
}

async function euz_stageB(root) {
  console.log(`\n== euz Stage B: parser/filesystem fault injection (temp dirs only)`);
  const B = async (name, code, cwd) => {
    const r = await python(code, cwd ?? root, 90_000);
    return { code: r.code, tail: (r.out + r.err).trim().slice(-400) };
  };

  /* B-01: EACCES-silent-skip — corpus loader drops unreadable files quietly */
  const b01 = await B("chunker-eacces", `
import tempfile, pathlib, os, stat
from eu_version_z.rag.chunker import load_chunks
with tempfile.TemporaryDirectory() as d:
    p = pathlib.Path(d)
    (p/'good.md').write_text('# t\\n\\nbody text')
    (p/'locked.md').write_text('# secret\\n\\nhidden')
    (p/'locked.md').chmod(0)
    out = load_chunks(p)
    print(f'loaded={len(out)} sources={[c["source"] for c in out]}')`);
  const b01silent = /loaded=\d+.*\['good\.md'\]/.test(b01.tail) && !/locked/.test(b01.tail);
  report("euz", "B", "chunker-eacces",
    b01.code === 0 && b01silent ? "BOUNDARY" : b01.code === 0 ? "BOUNDARY" : "FRACTURE",
    b01.code === 0
      ? `EACCES file silently skipped — no error, no log: ${b01.tail.slice(0, 120)}`
      : `EACCES raised: ${b01.tail.slice(0, 120)}`);

  /* B-02: binary-disguised .md — UnicodeDecodeError escapes the OSError guard */
  const b02 = await B("chunker-binary-md", `
import tempfile, pathlib
from eu_version_z.rag.chunker import load_chunks
with tempfile.TemporaryDirectory() as d:
    p = pathlib.Path(d)
    (p/'good.md').write_text('# t\\n\\nbody')
    (p/'evil.md').write_bytes(b'\\xff\\xfe\\x00\\x01garbage')
    try:
        out = load_chunks(p)
        print(f'OK loaded={len(out)}')
    except Exception as e:
        print(f'RAISED {type(e).__name__}: {e}')`);
  report("euz", "B", "chunker-binary-md",
    /RAISED/.test(b02.tail) ? "FRACTURE" : "HELD",
    /UnicodeDecodeError/.test(b02.tail)
      ? "one malformed .md kills the whole corpus load — except OSError misses UnicodeDecodeError (ValueError)"
      : b02.tail.slice(0, 120));

  /* B-03: nonexistent root — silent empty return */
  const b03 = await B("chunker-badroot", `
from eu_version_z.rag.chunker import load_chunks
from pathlib import Path
out = load_chunks(Path('/nonexistent-euz-root-xyz'))
print(f'OK loaded={len(out)}')`);
  report("euz", "B", "chunker-badroot",
    /OK loaded=0/.test(b03.tail) ? "BOUNDARY" : "HELD",
    /OK loaded=0/.test(b03.tail)
      ? "nonexistent root → silent empty corpus (no error surfaced to caller)"
      : b03.tail.slice(0, 120));

  /* B-04: malformed YAML — must raise loudly */
  const b04 = await B("yaml-malformed", `
from eu_version_z.rag.yaml_schema import parse_pipeline_yaml
try:
    parse_pipeline_yaml('{{{{unclosed: [1,2')
    print('OK no error')
except Exception as e:
    print(f'RAISED {type(e).__name__}')`);
  report("euz", "B", "yaml-malformed",
    /RAISED/.test(b04.tail) && !/OK/.test(b04.tail) ? "HELD" : "FRACTURE",
    `malformed YAML → ${b04.tail.slice(0, 100)}`);

  /* B-05: wrong-schema YAML — real field, wrong type; pydantic must refuse */
  const b05 = await B("yaml-wrong-schema", `
from eu_version_z.rag.yaml_schema import parse_pipeline_yaml
try:
    c = parse_pipeline_yaml('pipeline: "not-a-list"\\ncomponents: 42')
    print(f'OK accepted pipeline={c.pipeline!r}')
except Exception as e:
    print(f'RAISED {type(e).__name__}')`);
  report("euz", "B", "yaml-wrong-schema",
    /RAISED/.test(b05.tail) ? "HELD" : "FRACTURE",
    `wrong-typed 'pipeline'/'components' → ${b05.tail.slice(0, 120)}`);

  /* B-06: corrupt sqlite cache — honest exception expected */
  const b06 = await B("cache-corrupt-db", `
import tempfile, pathlib
from eu_version_z.rag.cache import EmbeddingCache
with tempfile.TemporaryDirectory() as d:
    db = pathlib.Path(d) / 'c.db'
    db.write_bytes(b'not a sqlite file at all')
    try:
        c = EmbeddingCache(db); c.count()
        print('OK no error')
    except Exception as e:
        print(f'RAISED {type(e).__name__}: {str(e)[:80]}')`);
  report("euz", "B", "cache-corrupt-db",
    /RAISED/.test(b06.tail) ? "HELD" : "FRACTURE",
    `corrupt db → ${b06.tail.slice(0, 120)}`);

  /* B-07b: legacy-package shadowing — how much of the suite tests the
     engineered_universe legacy tree instead of eu_version_z */
  const b07b = await sh("grep", ["-rln",
    "import engineered_universe\\|from engineered_universe"],
    { cwd: path.join(root, "tests") }, 30_000);
  const legacy = b07b.out.trim().split("\n").filter(Boolean);
  report("euz", "B", "legacy-import-surface",
    legacy.length === 0 ? "HELD" : "BOUNDARY",
    legacy.length === 0
      ? "no test files import the legacy engineered_universe package"
      : `${legacy.length} test files import legacy 'engineered_universe' (pip-editable at ~/Music/Paul/engineered_universe) — those tests exercise the legacy tree, not eu_version_z: ${legacy.slice(0, 5).join(", ")}`);

  /* B-08: CLI audit on nonexistent source root — exit code honesty */
  const b07 = await sh("python3",
    ["-m", "eu_version_z.cli", "audit",
     "--source-root", "/nonexistent-euz-root-xyz", "--check"],
    { cwd: root, env: { ...process.env, PYTHONPATH: "src" } }, 120_000);
  const b07honest = b07.code !== 0 || /error|not.found|no such/i.test(b07.err + b07.out);
  report("euz", "B", "cli-audit-badroot",  /* probe id kept stable */
    b07honest ? "HELD" : "BOUNDARY",
    `audit --source-root /nonexistent → exit ${b07.code}: ${(b07.err + b07.out).trim().slice(0, 140)}`);
}

async function euz_stageC(root) {
  console.log(`\n== euz Stage C: determinism`);
  const probe = `
import hashlib
from eu_version_z.core.octonion import OCTONION_MULT_TABLE, build_mult_table
from eu_version_z.core.e8_roots import E8_ROOTS, E8_N_ROOTS
h = hashlib.sha256()
h.update(repr(OCTONION_MULT_TABLE).encode())
h.update(repr(build_mult_table()).encode())
h.update(repr(E8_ROOTS).encode())
print(h.hexdigest(), E8_N_ROOTS)`;
  const runs = await Promise.all([1, 2, 3].map(() => python(probe, root, 60_000)));
  const hashes = runs.map(r => r.out.trim().split(" ")[0]);
  const roots = runs.map(r => r.out.trim().split(" ")[1]);
  report("euz", "C", "determinism-3x",
    new Set(hashes).size === 1 && hashes[0]?.length === 64 ? "HELD" : "FRACTURE",
    `octonion table + E8 roots hashed 3×: ${new Set(hashes).size === 1 ? "bit-identical" : "DIVERGENT"} (${roots[0]} roots)`);

  /* unseeded-randomness scan in deterministic-claimed modules */
  const scan = await sh("grep", ["-rln", "--include=*.py",
    "-E", "random\\.(random|choice|randint|shuffle)|np\\.random\\.(random|rand|choice)"],
    { cwd: path.join(root, "src/eu_version_z") }, 30_000);
  const files = scan.out.trim().split("\n").filter(Boolean)
    .filter(f => !/test|experimental|simulation/.test(f));
  report("euz", "C", "random-surface-scan",
    files.length === 0 ? "HELD" : "BOUNDARY",
    files.length === 0
      ? "no unseeded-random call sites outside experimental/simulation modules"
      : `${files.length} non-experimental modules touch unseeded randomness: ${files.slice(0, 4).join(", ")}`);

  /* C-03: stochastic-assertion flake — test_quantum_grover asserts
     result==5 on an UNSEEDED Grover measurement (8 states, 1 marked,
     2 iters ≈ 92% success). Repeat it and measure the real fail rate. */
  let flakePass = 0;
  const N = 12;
  for (let i = 0; i < N; i++) {
    const r = await sh("python3",
      ["-m", "pytest",
       "tests/test_web_expanded.py::TestQuantumExpansion::test_quantum_grover",
       "--tb=no"],
      { cwd: root, env: { ...process.env, PYTHONPATH: "src" } }, 90_000);
    if (/1 passed/.test(r.out)) flakePass++;
  }
  report("euz", "C", "stochastic-assertion-flake",
    flakePass === N ? "HELD" : "BOUNDARY",
    `test_quantum_grover ×${N}: ${flakePass} pass / ${N - flakePass} fail — ` +
    (flakePass === N
      ? "held this sweep; still unseeded-stochastic by construction"
      : `~${Math.round(flakePass / N * 100)}% pass — test asserts determinism on an unseeded stochastic measurement (legacy-tree endpoint)`));
}

/* ================= GIANT: downbeat ================= */

async function zig_stageA(giant, root, zig = "zig", timeoutMs = 2400_000) {
  console.log(`\n== ${giant} Stage A: zig build test (${zig})`);
  const zv = (await sh(zig, ["version"], {}, 15_000)).out.trim();
  const t0 = Date.now();
  const r = await sh(zig, ["build", "test"], { cwd: root }, timeoutMs);
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  const passed = (r.out.match(/(\d+)\/(\d+) tests? passed|(\d+) tests passed/g) ?? [])
    .slice(-1)[0] ?? "";
  const tail = (r.out + "\n" + r.err).trim().split("\n").slice(-6).join(" | ");
  if (r.timedOut)
    return report(giant, "A", "zig-build-test", "BOUNDARY",
      `[zig ${zv}] suite exceeded ${timeoutMs / 60000}min audit timeout — recorded, not hidden (tail: ${tail.slice(0, 200)})`);
  report(giant, "A", "zig-build-test",
    r.code === 0 ? "HELD" : "FRACTURE",
    `[zig ${zv}] exit ${r.code} in ${secs}s ${passed} — ${tail.slice(0, 220)}`);
}

async function zig_ingest_scan(giant, root, subdir = "src") {
  console.log(`\n== ${giant} Stage B: ingestion-surface static audit`);
  const scan = await sh("grep", ["-rln", "-E",
    "readFile|openFile|readFileAlloc|std\\.json\\.parse|Dir\\.walker|walk\\("],
    { cwd: path.join(root, subdir) }, 30_000);
  const files = scan.out.trim().split("\n").filter(Boolean);
  /* classify each: does a surrounding catch/try exist? crude but honest —
     reported as static evidence, scoped as such. */
  let unguarded = [];
  for (const rel of files) {
    const src = fs.readFileSync(path.join(root, subdir, rel), "utf8");
    const lines = src.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (/readFile|readFileAlloc|json\.parse|openFile/.test(lines[i]) &&
          !/try|catch|error|!/.test(lines[i])) {
        unguarded.push(`${rel}:${i + 1}:${lines[i].trim().slice(0, 60)}`);
      }
    }
  }
  report(giant, "B", "ingestion-surface",
    unguarded.length === 0 ? "HELD" : "BOUNDARY",
    `${files.length} files touch filesystem/parsing; ${unguarded.length} call sites lack visible error handling on the line (static evidence — unverified): ${unguarded.slice(0, 4).join(" | ")}`);
}

async function zig_random_scan(giant, root, subdir = "src") {
  const scan = await sh("grep", ["-rln", "-E",
    "std\\.rand\\.|DefaultPrng|nanoTimestamp|Timestamp\\(\\)"],
    { cwd: path.join(root, subdir) }, 30_000);
  const files = scan.out.trim().split("\n").filter(Boolean);
  report(giant, "C", "nondeterminism-surface",
    files.length === 0 ? "HELD" : "BOUNDARY",
    files.length === 0
      ? "no rand/timestamp call sites under src/ — deterministic surface"
      : `${files.length} files touch rand/timestamp (schedule-drift risk — static evidence): ${files.slice(0, 5).join(", ")}`);
}

/* ================= driver ================= */

const GIANTS = {
  euz: {
    root: os.homedir() + "/Music/Paul/Sci-Fi",
    stageA: euz_stageA, stageB: euz_stageB, stageC: euz_stageC,
  },
  downbeat: {
    root: os.homedir() + "/Projects/downbeat",
    stageA: r => zig_stageA("downbeat", r, "zig"),   /* passed under host default 0.13.0 */
    stageB: r => zig_ingest_scan("downbeat", r),
    stageC: r => zig_random_scan("downbeat", r),
  },
  theplatform: {
    root: os.homedir() + "/CascadeProjects/ThePlatform",
    stageA: r => zig_stageA("theplatform", r, "/usr/local/zig-0.16.0/zig"), /* README/manifest require 0.16.0 */
    stageB: r => zig_ingest_scan("theplatform", r),
    stageC: r => zig_random_scan("theplatform", r),
  },
};

const arg = process.argv[2] ?? "all";
const stageEq = process.argv.find(a => a.startsWith("--stage="));
const stageIdx = process.argv.indexOf("--stage");
const stageFilter = stageEq ? stageEq.split("=")[1]
                  : stageIdx >= 0 ? process.argv[stageIdx + 1] : undefined;
const emit = process.argv.includes("--emit");

const targets = arg === "all" ? Object.keys(GIANTS) : [arg];
for (const name of targets) {
  const g = GIANTS[name];
  if (!g) { console.error(`unknown giant: ${name}`); process.exit(2); }
  console.log(`\n### GIANT: ${name} @ ${g.root}`);
  if (!fs.existsSync(g.root)) { report(name, "-", "presence", "SEALED", "root missing"); continue; }
  const t0 = Date.now();
  if (!stageFilter || stageFilter === "A") await g.stageA(g.root);
  if (!stageFilter || stageFilter === "B") await g.stageB(g.root);
  if (!stageFilter || stageFilter === "C") await g.stageC(g.root);
  console.log(`   (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}

/* ---------- verdict ---------- */
const counts = {};
for (const r of results) counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;
console.log(`\nFLEET AUDIT: ${JSON.stringify(counts)}`);
if (emit) {
  fs.mkdirSync(OUTDIR, { recursive: true });
  for (const name of targets) {
    const mine = results.filter(r => r.giant === name);
    const f = path.join(OUTDIR, `fleet-audit-${name}.json`);
    fs.writeFileSync(f, JSON.stringify({
      giant: name, ts: new Date().toISOString(),
      probes: mine,
      tally: mine.reduce((a, r) => ({ ...a, [r.verdict]: (a[r.verdict] ?? 0) + 1 }), {}),
    }, null, 2));
    console.log(`report → ${f}`);
  }
}
const fractures = results.filter(r => r.verdict === "FRACTURE" || r.verdict === "SEALED");
process.exit(0);
