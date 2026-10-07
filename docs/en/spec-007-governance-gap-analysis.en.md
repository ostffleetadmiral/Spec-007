# SPEC-007 governance gap analysis

**Subject:**
**Version:** 1.0.0 The OSTF SPEC Governance Rulebook (classified source, held under SPEC-004) compared against the current Spec-007 documentation standard (README authority levels L0–L5, `spec-007-verified.en.md`, calculation harnesses, archive policy).

**Verdict up front:** The Rulebook is a strong **procedural** governance document but a weak **epistemic** one. It regulates *who may change a SPEC and how*, but contains no requirement that the claims inside a SPEC be **verified, sourced, or testable**. The Spec-007 standard goes further: claims are *promoted* only when a harness test or institutional source backs them. Neither side fully contains the other; the correct end state is to adopt the Rulebook's lifecycle machinery **and** keep the Spec-007 evidence gates.

## Article-by-article matrix

| Rulebook provision | Spec-007 standard today | Conformance |
|---|---|---|
| **Art. I — Authority, purpose, traceability to an audit system** | Immutable baseline with SHA-256 pin; `archives/` milestones; README authority levels | **Partial overlap.** Rulebook names "Alpha State audit system" (unverifiable input); Spec-007 uses concrete hash + archive directories. Spec-007's approach is stronger and executable. |
| **Art. II — Hierarchy & numbering (core numbers, sub-SPECs, reserved)** | Level system (L0 immutable record → L1 verified → L2 evidence → L3 derived → L4 tests → L5 inputs) | **Different axis, complementary.** Rulebook hierarchizes by *document number*; Spec-007 hierarchizes by *epistemic authority*. Merging is possible (see Recommendations). |
| **Art. III — Roles (Editor, Council, Ethics, Admiralty; AI advisory only)** | Red-team analysis and AI-derived design-input content demoted to L5 classified inputs; ethics content excluded unless engineering-relevant | **Aligned in spirit.** "AI systems do not vote on SPEC governance" matches Spec-007's rule that design inputs have zero engineering authority. |
| **Art. IV — Creation (Proposal document, ethics/security assessment, duplication check)** | SPEC-007 has no proposal; it exists as a user-provided concept then acquired dossier/verification layers | **Gap (Spec-007 side).** A retroactive proposal + SPEC Registry entry is recommended. |
| **Art. V — Format (header, purpose, definitions, operative provisions, governance, adoption signatures)** | `spec-007-verified.en.md` has status header, evidence tables, promotion rules; original doc intentionally nonconformant and immutable | **Partial.** L1 largely satisfies this; L0 cannot (frozen). Not blocking. |
| **Art. VI — Versioning (MAJOR.MINOR.PATCH, approval tiers, history section)** | Spec-007 documents carry dates/status but no semver or version history | **Gap (Spec-007 side).** Adopt semver and version-history sections for L1/L3 docs. |
| **Art. VII — Review & maintenance (annual + triggered)** | Spec-007 has continuous red-team passes but no scheduled review | **Gap (Spec-007 side).** Add annual review date + triggered-review clause (e.g., new supplier data, regulator change) to L1. |
| **Art. VIII — Retirement/supersession, archive, "never delete after retirement"** | Rulebook: retired SPECs may not be deleted/altered. Spec-007: originals never edited; false claims never deleted, only annotated in L2 | **Aligned and compatible.** Spec-007's rule is the strict superset (immutability from day one, not just after retirement). |
| **Art. IX — SPEC Registry (status, version, editor, approval record)** | No registry; README lacks status/version/editor columns | **Gap (Spec-007 side).** Add registry table (see Recommendations). |
| **Art. X — Implementation & compliance monitoring, waivers** | Zig harness tests are executable compliance monitoring; no waiver mechanism | **Gap (Rulebook side).** Rulebook compliance is "AIWO Corps monitoring" (undefined input); Spec-007 has reproducible tests. Add waiver rule to Spec-007 only if needed — harness breaks already block promotion. |
| **Art. XI — Self-amendment (unanimity / 72-hour ratification)** | Spec-007 has no self-amendment rule | **Gap (Spec-007 side).** L1 promotion rules (README §Rules) serve as the informal analogue; formalize. |
| **Art. XII — Adoption** | N/A (documents are project artifacts) | N/A |

## What the Rulebook is missing relative to the Spec-007 standard

1. **No truth gate.** Nothing in the Rulebook requires a SPEC's claims to be verified before publication. Under the Rulebook as written, the false pre-verification numbers of `spec-007.md` (rack arithmetic, mismatched flow rates, Novec temperature) could be adopted by vote with zero epistemic check. Spec-007's promotion rule (test or source required) closes exactly this hole.
2. **No executable verification.** Rulebook has no test harness requirement, no reproducibility rule, no "numbers must be computable" clause.
3. **No immutable basing.** The Rulebook's immutability applies only *after retirement*; Spec-007 requires the *original* never change and corrections to accumulate in a separately promoted layer.
4. **No conditional-claim taxonomy.** Spec-007 distinguishes VERIFIED / VERIFIED-WITH-CORRECTION / EXTRAPOLATION / UNSUPPORTED / CONTRADICTED. The Rulebook has no equivalent.

## What the Spec-007 standard should adopt from the Rulebook

1. **SPEC Registry entry for SPEC-007** with status fields (draft/active, editor, version) — one table row per document, updated with milestones.
2. **Semantic versioning + version history** on L1/L3 documents so future numeric changes are auditable.
3. **Triggered review clauses**: review L1 when (a) a cited datasheet changes, (b) a supplier quote is obtained, (c) a qualified lab measurement arrives, (d) UN 1402 or relevant regulation text changes.
4. **Formal proposal record** retroactively documenting SPEC-007's problem statement and security/ethics assessment, referencing the existing hazard register in `spec-007-research-dossier.md`.

## Recommended merger (proposed, not yet applied)

- Keep Rulebook **Article VIII** (retirement) and **Article III** (roles, AI advisory-only) verbatim into Spec-007 process.
- Add to Rulebook, or to an L1-local governance annex, the Spec-007 promotion gates: (1) immutable baseline; (2) claim grading; (3) harness-enforced numbers; (4) archived milestones.
- Treat the README L0–L5 ladder as the local implementation of Rulebook Article II for this directory.

## Conclusion

**Closeness estimate:** the Rulebook covers roughly the *procedural* 60–70% of what Spec-007's documentation standard does, and Spec-007's evidence/verification machinery covers the part the Rulebook simply lacks. Combined, they form a complete governance system; separately, Rulebook governs *process without truth*, and the current folder enforces *truth without process*. The archive `archives/spec-007-governance-gap-analysis-20261004/` records this comparison.
## Version history

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-05 | Retroactive initial version per OSTF Rulebook Art. VI; content unchanged since dossier acceptance. Bump rules: MAJOR = promoted-claim/number change, MINOR = added analysis, PATCH = editorial/translation fix. |
