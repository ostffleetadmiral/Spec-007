# SPEC Registry — SPEC-007 dossier

**Status:** Active registry, per OSTF SPEC Governance Rulebook **Article IX** (SPEC Registry: status, version, editor, approval record). Filed at authority level **L2** — audit/tracking data, not promoted claims.

**Scope:** One row per document *artifact* (language twins share a row). The immutable baseline is exempt from versioning by design.

## Registry

| Document | Level | Status | Version | Editor | Approval record | Last review | Next review |
|---|---|---|---|---|---|---|---|
| `spec-007.md` (baseline) | L0 | Immutable — exempt from versioning | n/a | Fleet Admiral (owner) | Accepted as historical record, SHA-256 pinned | 2026-10-05 | Never (L0 rule) |
| `spec-007.en/zh-Hant` (faithful translations) | L0 | Immutable-derived | n/a | SPEC Council designee | Fidelity-attested translations of the baseline | 2026-10-05 | Never |
| `spec-007-terminology` | L0 | Active — verbatim-preserved vocabulary | n/a | SPEC Council designee | Accepted with baseline | 2026-10-05 | With baseline |
| `spec-007-verified` | L1 | Active — governs all numbers | 1.0.0 | SPEC Council designee | Promoted through L4 harness gates | 2026-10-05 | 2027-10-05 (annual + triggers) |
| `spec-007-research-dossier` | L2 | Active — evidence trail incl. hazard register | 1.0.0 | SPEC Council designee | Accepted as evidence layer | 2026-10-05 | With L1 |
| `spec-007-claim-verification` | L2 | Active — claim gradings + rejections | 1.0.0 | SPEC Council designee | Accepted as evidence layer | 2026-10-05 | With L1 |
| `spec-007-design-input-audit` | L2 | Active — provenance audit | 1.0.0 | SPEC Council designee | Accepted as evidence layer | 2026-10-05 | With L1 |
| `spec-007-proposal-record` | L2 | Active — retroactive Art. IV record | 1.0.0 | SPEC Council designee | Accepted (this registry cycle) | 2026-10-05 | With L1 |
| `spec-007-registry` (this file) | L2 | Active — Rulebook Art. IX artifact | 1.0.0 | SPEC Council designee | Self-registering entry | 2026-10-05 | With L1 |
| `spec-007-economic-assessment` | L3 | Active — derived analysis | 1.0.0 | SPEC Council designee | Numbers must match L1 | 2026-10-05 | With L1 |
| `spec-007-engineering-revision` | L3 | Active — derived analysis | 1.0.0 | SPEC Council designee | Numbers must match L1 | 2026-10-05 | With L1 |
| `spec-007-expanded-engineering-spec` | L3 | Active — derived analysis | 1.0.0 | SPEC Council designee | Numbers must match L1 | 2026-10-05 | With L1 |
| `spec-007-governance-gap-analysis` | L3 | Active — derived analysis | 1.0.0 | SPEC Council designee | Numbers must match L1 | 2026-10-05 | With L1 |
| `spec-007-component-map` | L2 | Active — reverse-engineering baseline | 1.0.0 | SPEC Council designee | Rows must match publish-check coverage | 2026-10-06 | With L4 harnesses |
| `spec-007-discoveries` | L2 | Active — paradigm map (sanitized projection) | 1.0.0 | SPEC Council designee | Evidence classes must match D-series cards | 2026-10-08 | With L1 |
| `spec-007-public` | L3 | Active — public face | 1.0.0 | SPEC Council designee | Sanitized projection of L1/L2 | 2026-10-05 | With L1 |
| `src/spec007_*.zig` harnesses | L4 | Active — executable gates | n/a (pinned by tests) | SPEC Council designee | All tests green per publish-check | 2026-10-05 | Continuous |
| `thoughts&convos/` drawer | L5 | Classified — referenced, not itemized | n/a | Fleet Admiral (owner) | Under SPEC-004 "7q" registry (separate) | 2026-10-05 | Under SPEC-004 |

## Registry rules

- Entries are updated **with each milestone**, not retroactively reconstructed.
- A document's `Status` moves `draft → active → superseded → retired`; retirement requires a superseding row citing the replacement.
- AI systems hold **zero engineering authority** (Rulebook Art. III): they may register, never approve. Approval records name a human role, not an agent.
- The `thoughts&convos/` drawer registry lives at `thoughts&convos/SPEC-004-REGISTRY.md` under its own append-only rules — it is classified and not duplicated here.
