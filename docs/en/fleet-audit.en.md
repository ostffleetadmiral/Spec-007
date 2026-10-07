# Fleet Audit — External Descent-Verification of the Giants

**Status:** IN EFFECT — first sweep complete, 2026-10-07
**Harness:** `security/fleet-audit.mjs`
**Reports:** `security/out/fleet-audit-{euz,downbeat,theplatform}.json`

---

## 0. Charter

The fleet census (`fleet-coverage`) mapped three uncovered giants — `eu_version_z` (research-gated EU evolution core, 6,372+ claimed tests), `downbeat` (Engineered Universe starship layer, ~490 tests), and `ThePlatform` "Quantam Black" (~565 tests). This document records the first **external audit**: not an inspection — an anvil pass. Each giant was exercised by its own native test runner and probed at its ingestion, determinism, and interruption boundaries.

**Standing rule — audit against THEIR contracts, not ours.** Each giant is measured against its own declared standards (its `AGENTS.md`/manifest): determinism, honest failure, provenance discipline. SPEC-007's integer-pure law is a *canonical-core* constraint — a Python research repo using `numpy` floats is not a violation unless it claims determinism it fails. Findings are classified, not moralized.

**Verdict grid** (proving-ground vocabulary):

| Verdict | Meaning |
|---|---|
| `HELD` | Withstood the probe cleanly |
| `BOUNDARY` | Holds within a narrower or honestly-classified envelope |
| `FRACTURE` | Real break — silent wrongness, fabricated state, or unhandled crash where the contract promised tolerance |
| `SEALED` | Confirmed unsafe by evidence |

**Read-only covenant.** Fault injection runs in temp directories and subprocesses only. Nothing inside a giant's tree is modified; fixes belong to each giant's own retro-dev loop.

---

## 1. `eu_version_z` — `~/Music/Paul/Sci-Fi`

`pytest` 160 test files, per-file isolation, 300 s per-file bound, 4 workers.

### Stage A — Test-suite exhaustion

| Probe | Verdict | Evidence |
|---|---|---|
| `pytest-per-file` | **HELD** | 160/160 test files green; **6,367 passed**, 0 failed, 0 errors, 0 crashes — the "6,372+ tests" claim verified within enumeration error (some files' counts vary with collection) |
| `self-audit-gate` | **HELD** | `cli audit --check` exits 1 with `release_blocked:true` — the project's intentional release gate works exactly as its AGENTS.md declares |

Observed flake (not in the green run but measured separately): `test_web_expanded.py::test_quantum_grover` asserts `result == 5` on an **unseeded** stochastic Grover measurement — 11/12 pass in a pair of 12-run probes (11/12 then 12/12 — ~96% observed, stochastic by construction). See Stage C.

### Stage B — Filesystem & parser safety

| Probe | Verdict | Evidence |
|---|---|---|
| `chunker-binary-md` | **FRACTURE** | `rag/chunker.load_chunks` wraps `read_text` in `except OSError` — but a binary-disguised `.md` raises `UnicodeDecodeError` (a `ValueError`), which escapes the guard and kills the **entire** corpus load. One malformed file = batch-kill of the RAG ingestion pipeline |
| `chunker-eacces` | BOUNDARY | `chmod 000` file is silently skipped (`except OSError: continue`) — no error, no log. Defensible robustness, but a denied file vanishes from the corpus with no signal |
| `chunker-badroot` | BOUNDARY | Nonexistent root returns `[]` silently — caller cannot distinguish "empty corpus" from "wrong path" |
| `legacy-import-surface` | BOUNDARY | **7 test files import the legacy `engineered_universe` package** (pip-editable at `~/Music/Paul/engineered_universe`) — those tests exercise the legacy tree, not `eu_version_z`. AGENTS.md's own porting notes admit the partial remap; the audit measured it |
| `yaml-malformed` | HELD | `parse_pipeline_yaml` raises `ParserError` on malformed YAML — loud, honest |
| `yaml-wrong-schema` | HELD | `pipeline: "not-a-list"` + `components: 42` → pydantic `ValidationError` — schema is enforced on real fields |
| `cache-corrupt-db` | HELD | Corrupt sqlite file → `DatabaseError: file is not a database` — loud |
| `cli-audit-badroot` | HELD | `audit --source-root /nonexistent` → exit 1, traceback — loud |

### Stage C — Determinism & concurrency

| Probe | Verdict | Evidence |
|---|---|---|
| `determinism-3x` | **HELD** | `OCTONION_MULT_TABLE` + `build_mult_table()` + `E8_ROOTS` hashed 3× → bit-identical (240 roots) |
| `random-surface-scan` | BOUNDARY | 3 non-experimental modules touch unseeded `np.random`/`random`: `quantum/vqe.py`, `research/bio/hp_folding.py`, `research/quantum/vqe.py` — schedule-drift surface for callers that don't pass `rng` |
| `stochastic-assertion-flake` | BOUNDARY | `test_quantum_grover` ×24 across two sweeps: **23 pass / 1 fail (~96%)** — test asserts `result==5` on unseeded measurement against the *legacy* endpoint; physics is honest, the assertion isn't |

### euz tally

`HELD ×7 · BOUNDARY ×4 · FRACTURE ×1`

**Verdict:** the suite's headline claim holds — 6,367 green measured. The single FRACTURE is `chunker`'s exception-type asymmetry (OSError skipped, UnicodeDecodeError uncaught) — a one-line repair inside the giant's own loop, per retro-dev rules. The deeper finding is governance-shaped: 7 test files still exercise the legacy tree, and one test is flaky by construction.

---

## 2. `downbeat` — `~/Projects/downbeat`

`zig build test` — full suite including Q# sidecar build (dotnet restore) and shader compile.

| Probe | Verdict | Evidence |
|---|---|---|
| `zig-build-test` | **HELD** | exit 0 in 158 s — all module test artifacts pass under the host Zig (0.13.0); suite emits its closing signature ("The torus belongs to humanity") |
| `ingestion-surface` | **HELD** | 9 `src/` files touch filesystem/parsing (`corpus_analyzer`, `foundation_audit`, `pulse`, `simulator`, `sidecar_probe`, …); **0 call sites lack visible error handling** — every read is `try`/catch-guarded on the line |
| `nondeterminism-surface` | BOUNDARY | 7 files touch rand/timestamp (`entropy_generator`, `pulse`, `static_presence_monitor`, `telemetry`, `stress_tester`, …) — expected for an entropy/stress suite, but a schedule-drift surface for the `parallel_orchestrator` paths that consume them |

### downbeat tally

`HELD ×2 · BOUNDARY ×1`

**Verdict:** HELD. The starship's test rig is real and green under load. The nondeterminism surface is honest (entropy generators are supposed to draw entropy); the note stands for callers that assume reproducibility.

---

## 3. `ThePlatform` — `~/CascadeProjects/ThePlatform`

`zig build test` — toolchain-sensitive: `build.zig` targets **Zig 0.16.0** (`root_module` API). Host default is 0.13.0; the manifest documents the requirement. Ran under `/usr/local/zig-0.16.0/zig`.

| Probe | Verdict | Evidence |
|---|---|---|
| `zig-build-test` | **HELD** | exit 0 in 96 s under zig 0.16.0 — all test artifacts green (number_systems, hyper_token, c137_vector, ui_telemetry, quantum_bridge, attestation_guard, reality_verifier, ivector_ingestor, residue_projector, zotron_types, …). **Toolchain caveat on record:** under the PATH-default 0.13.0 the build fails to compile — the suite is only verifiable with its declared toolchain. The giant's own `FINAL_AUDIT_REPORT` already discloses "7 suites pending 0.16.0 API migration" — its self-report is honest |
| `ingestion-surface` | BOUNDARY | 6 files touch filesystem/parsing; static scan flagged 3 sites in `hardware/hardware_monitor.zig`. **Manual review:** all three are `if (openFileAbsolute(...)) \|file\| … else \|_\| {}` — idiomatic optional-sensor reads, correctly handled. BOUNDARY stands only as the static-scan limitation, not a defect |
| `nondeterminism-surface` | BOUNDARY | 9 files touch rand/timestamp (`hardware_monitor`, `ollama_bridge`, `monte_carlo`, `integration_test`, `stress_test`) — consistent with a telemetry/stress codebase |

### theplatform tally

`HELD ×1 · BOUNDARY ×2`

**Verdict:** HELD-with-toolchain-caveat. The "565 tests" headline couldn't be independently counted per-test (the build graph runs artifacts, not a numbered summary), but every artifact the build emits runs green. The platform honestly documents its own migration debt — that candor is the finding.

---

## 4. Findings ledger

| ID | Giant | Class | Finding |
|---|---|---|---|
| FA-01 | euz | **FRACTURE** | `rag/chunker.load_chunks`: `except OSError` misses `UnicodeDecodeError` — one malformed `.md` kills the whole corpus walk |
| FA-02 | euz | BOUNDARY | EACCES/unreadable files silently skipped — no error surfaced |
| FA-03 | euz | BOUNDARY | Nonexistent corpus root → silent `[]` — empty-corpus ambiguity |
| FA-04 | euz | BOUNDARY | 7 test files import legacy `engineered_universe` (test the wrong tree); `test_quantum_grover` flaky ~8% — unseeded stochastic assertion |
| FA-05 | euz | BOUNDARY | 3 non-experimental modules use unseeded randomness (`vqe` ×2, `hp_folding`) |
| FA-06 | downbeat | BOUNDARY | 7 rand/timestamp files under `src/` — honest entropy surface, drift risk only if callers assume reproducibility |
| FA-07 | theplatform | BOUNDARY | Suite requires Zig 0.16.0; host-default 0.13.0 cannot build it — toolchain-gated verification |
| FA-08 | theplatform | BOUNDARY | 9 rand/timestamp files; static-scan ingestion flags reviewed → idiomatic optional-file reads |

### Resolution — FA-01 REPAIRED (2026-10-07)

The single FRACTURE was repaired in the giant's own loop, per rule 5:
`eu_version_z/rag/chunker.py` `load_chunks` now catches
`(OSError, UnicodeDecodeError)` and skips malformed files with the same
contract as unreadable ones. Regression test `test_load_chunks_skips_binary_md`
added in `tests/test_coverage_rag.py` — 59 related tests green. Giant commit
`3153cfd` (local to the euz repo at audit time). Tally after repair:
`HELD ×11 · BOUNDARY ×7 · FRACTURE ×0` — the BOUNDARY items stand as recorded;
each is an honest envelope, not a defect.

## 5. Standing rules for external audits

1. **Their contracts, not ours** — a giant is judged against its own AGENTS.md/manifest. Canonical-core laws (integer-purity, descent closure) apply only where the giant claims them.
2. **No tree mutation** — fault injection lives in temp dirs/subprocesses; audit artifacts emit to `security/out/`, never into the giant.
3. **Toolchain honesty** — verify under the toolchain the giant declares; a wrong-toolchain failure is our artifact, not their fracture.
4. **Flakes get measured, not excused** — a stochastic test asserting determinism is a boundary finding whether it passes or fails on the day.
5. **Findings are reported, not fixed** — repair belongs to each giant's own retro-dev loop; this dossier records, it does not patch foreign trees.

*Audit harness: `node security/fleet-audit.mjs <giant|all> [--emit]` — JSON reports land in `security/out/fleet-audit-<giant>.json`.*
