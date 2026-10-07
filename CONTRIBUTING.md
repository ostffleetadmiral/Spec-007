# Contributing — SPEC-007

This dossier is evidence-first. Every change follows the same rule:
**claims cite sources, numbers carry harness tests, and nothing passing
is ever deleted.**

## Hard rules

1. `spec-007.md` is immutable. Never edit it. Its sha256 is published in
   `README.md` and `site/cover.md`; any change breaks continuity.
2. Integer-only core. No floating point in Zig sources; f64 lives in JS
   sidecars only.
3. No stubs, mocks, placeholders, or TODOs — real logic only.
4. Every promoted number needs a test in `src/spec007_*.zig` or a cited
   primary source in the L2 evidence docs.
5. Bilingual parity: authored content exists in `docs/en/` and
   `docs/zh-Hant/`; keep twins synchronized (numerals and identifiers
   must match exactly; translation conventions like `Ca(OH)₂` are fine).
6. Classified material never crosses the boundary. `thoughts&convos/`
   content is not evidence — no public file quotes, paraphrases, or
   cites it. Names in the governance corpus stay sealed; `Ramsey 006`
   is the only published callsign.
7. Passing milestones are archived under `archives/` with sha256
   sidecars. Nothing verified is deleted.

## Where things live

| Path | Holds |
|---|---|
| `spec-007.md` | The immutable original (L0) |
| `docs/en/` `docs/zh-Hant/` | Authored dossier sources (L0–L3) |
| `src/` | Integer/Q128.128 calculation harnesses (L4) |
| `firmware/` | ESP32-S3 controller scaffold (SCAFFOLD) |
| `site/` | Generated dossier site + FANO-1 workstation |
| `security/` | Four-team security rig + Hydra WAN lab |
| `thoughts&convos/` | Classified drawer — not public |

## Working a change

1. Establish the baseline: run the harness for the module you touch.
2. Reverse-engineer before refactoring — record the component's
   contract, invariants, and callers.
3. Refactor one component at a time; run its tests immediately.
4. Update the docs that describe it (both languages).
5. Rebuild the site: `cd site && python3 build.py`.
6. Run `tools/publish-check.sh` before calling it done.

## Security work

See `security/README.md` for the WAN lab and `SECURITY.md` for the
threat model. Findings must be *executed* — a probe that reports
HARDENED without sending the attack is not evidence.
