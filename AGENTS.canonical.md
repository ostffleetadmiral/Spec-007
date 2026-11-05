# BLUE — Agent Standard

Canonical agent rules for this tree. Consolidated from prior per-directory
agent files; originals are sealed under `~/.archives/agents-md-stand-1/`
(sha256 in `SHA256SUMS`, tarball `originals.tar.gz`).

## Workspace map

- `src/` — the engine: integer-only Zig core (i*/u*), lattice, wire,
  ledger, transport, and the audit layers.
- `src/audit_seams.zig` + `src/audit_fuzz.zig` — directed fault-injection
  and seeded mutation coverage; every seam is exercised under perturbation.
- `src/concept_bridge.zig` + `scifi-ingest` — corpus ingestion and claim
  grading by executed probes (the verdict engine).
- `artifacts/concept-bridge/` — generated evidence: index, claims ledger,
  equivalence map, sealed fano cards.
- `docs/CONTINUITY-AUDIT.md` · `docs/retro-dev-map.md` — the audit and
  architecture ledgers; keep synchronized with any change.
- `tests/fixtures/` — golden vectors; several module tests resolve them
  by cwd — run the suite from the repo root.
- `externals/` — donor trees; their own AGENTS.md/README conventions are
  upstream and out of scope for this file.

## Epistemic law

The framework substrate is the referee. Claims are proven or disproven by
running the project's own instruments — never adjudicated against external
physics, never by prior assumption.

- `VERIFIED` — a project probe ran and confirmed the claim or its concrete
  artifact.
- `VERIFIED-WITH-CORRECTION` — claim holds modulo a named correction.
- `EXTRAPOLATION` — the mechanism executes in the project substrate; the
  physical lane is named and open.
- `UNSUPPORTED` — no current artifact; always carries the named elevation
  path. "No possible artifact" is never a verdict.
- `UNRESOLVABLE` — data verdict; keeps the question open both ways.
- `CONTRADICTED` — corpus self-divergence, failed internal consistency,
  or a claimed artifact failing its own verifier. Nothing else.
- `REGISTER` — doctrine/narrative register; no physical verdict either
  direction, no demotion.

Every claim carries verdict + probe + basis + elevation. The verdict is
what the instrument returned — never the reader's estimate.

## Code law

- Integer-only core (`i*`/`u*` per founder rule); f64 confined to marked
  sidecar/display paths. New floating point in core code is a defect.
- No stubs, mocks, placeholders, or TODO-shaped logic — build real logic
  or file the open lane honestly.
- Every artifact ships a reproducer: test, golden vector, or CLI flag.
- Perturbation is a first-class lane: new seams get a directed mutation
  in `audit_seams` and a seeded lane in `audit_fuzz`.
- Corrupt input must never panic — hostile frames return errors/false.

## Archive law

Never delete anything that has passed testing or carries evidence value.
Moves are byte-identical (verify hash before and after). Originals seal
into `~/.archives/` before consolidation.

## Propagation rule

Every discovery propagates — it is a mechanism, not a hope. When a module
changes: re-run its tests, re-run the audit layers that touch its seams,
re-derive the corpus artifacts whose digests cite it, and update
`docs/CONTINUITY-AUDIT.md` + `docs/retro-dev-map.md` + `TODO.md` in the
same edit. No stale verdicts, no dead ledgers.

## Hardware transmission rule (standing)

**Any OTA or RF work calibrates first.** Before any acoustic or RF
transmission lane runs (air_*, ota_*, em_monitor, retrocausal, thermal,
k3beacon, fano-mesh), the calibration sequence must run:

1. `python3 tools/air_cal.py` (or `hw-calibrate.sh`) — ambient floor +
   chirp transfer function → per-band EQ profile.
2. Lane parameters derive from the measured profile, never assumed.

Reason: measured band gains drift +11–29% within ~10s of operation
(artifacts/second-order/DRIFT-LOG.csv) — static calibration is an
open-loop illusion; uncalibrated transmissions are unmeasured claims.
