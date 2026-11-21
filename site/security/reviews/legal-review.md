# Legal Review Brief — SPEC-007 / FANO-1 publication

- lane: `legal-review`
- named authority: qualified counsel
- reviewing seat: `digit` (fleet ed25519 seat `43b44295…d16fc31`)
- reviewer of record: Devin (SWE-2) review agent under fleet
  delegation (AdmPaul, 2026-11-21)
- scope date: 2026-11-21 · disposition: `evidence_filed`

> **Standing disclosure, up front.** This document is an
> agent-produced legal-analysis brief. It is not a legal opinion and
> it does not create an attorney-client relationship. The lane's named
> authority is qualified counsel; this brief is the evidence bundle and
> analysis a counsel would ratify, correct, or replace. That
> distinction is preserved on purpose — it is the same prove-or-label
> discipline the project applies everywhere else.

## Evidence bundle reviewed

`LICENSE` (CC0 1.0 Universal), `SECURITY.md`,
`docs/en/spec-007-public.en.md` + `docs/zh-Hant/…`,
`docs/en/spec-007-protocol.en.md` + `docs/zh-Hant/…`.

## 1. License posture

- **CC0 1.0** — public-domain dedication with the fallback permissive
  license, maximum-permission posture. Correct for a research dossier
  intended for unrestricted reuse.
- Exposure: CC0 deliberately does not grant patent rights and retains
  trademark/personality rights in the affirmer. Contributed work is
  not screened for third-party IP by the license itself — the project
  relies on provenance discipline (vendored `deps/` are project-owned
  or upstream-pinned; `family/Rations` is the desk's own upstream).
- Recommendation for counsel: confirm the `deps/` vendored trees'
  upstream licenses are CC0-compatible or carry their own notices in
  the vendored roots (the trees ship with provenance notes; a formal
  license pass is a counsel-grade task).

## 2. Publication boundaries

- The public corpus is clean: `BLACK-04` history-secret-scan holds (no
  key material or PEM bodies in history); `thoughts&convos/` (the
  drawer) is gitignored and excluded from Pages deploys — verified at
  every publish gate.
- `spec-007-public.en.md` carries honest physics boundaries — screened
  output figures with the conversion cascade labeled separately and
  the mandatory evidence gates named. Public claims are bounded by
  the same verdict discipline as the dossier.
- Officer surnames: the classified-surname tripwire gate runs at every
  publish — the public surface carries callsigns, not legal names.
  From a publication-boundary standpoint this is a working control.

## 3. Export / regulatory exposure

- The desk publishes real cryptography (Ed25519/X25519/AES-256-GCM
  implementations as WASM + JS). As open-source/publicly-available
  software, standard crypto publication is routine in most
  jurisdictions; the project should note that a formal export
  classification (e.g., EAR/ECCN self-classification for the compiled
  WASM artifact) is the kind of determination counsel makes, not a
  review agent. **Filed as a counsel action item**, not answered here.
- The research dossier's speculative physics rows carry no regulated
  subject matter; the hardware design rows carry honest physics
  bounds rather than manufacturing instructions at dangerous
  tolerances — reviewed as publication-safe.

## 4. Operational disclaimers

- `SECURITY.md` already discloses the advisory-vs-real gate boundary
  and the documented residuals (session key in page memory, broadcast
  relay exposure). No additional liability disclaimer exists beyond
  CC0's own.
- Recommendation: a one-paragraph "research instrument, not a
  production service — no warranty of fitness; live findings are
  published at `site/security/findings.json`" notice would
  consolidate what the docs already say piecemeal. The substance is
  already honest; the packaging can be tidier.

## Findings for counsel

1. Ratify CC0 sufficiency or recommend a NOTICE file for vendored
   upstream attributions.
2. Decide whether a formal export-control self-classification memo is
   warranted for the published WASM artifact.
3. Approve or amend the consolidated operational-disclaimer
   recommendation in §4.

## Verdict

Publication posture is **clean and defensible in substance**: public-
domain license, disciplined boundary machinery, honest disclaimers,
no leaked classified material. The open items are the kind only
counsel closes — filed as action items, not answered on their behalf.
