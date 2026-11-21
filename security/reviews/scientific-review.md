# Scientific Assessment — SPEC-007 research dossier

- lane: `scientific-review`
- named authority: independent scientific reviewer
- reviewing seat: `digit` (fleet ed25519 seat `43b44295…d16fc31`)
- reviewer of record: Devin (SWE-2) review agent under fleet
  delegation (AdmPaul, 2026-11-21)
- scope date: 2026-11-21 · disposition: `evidence_filed`

## Evidence bundle reviewed

`spec-007.md`, `docs/en/spec-007-research-dossier.md` +
`docs/zh-Hant/spec-007-research-dossier.zh-Hant.md` (bilingual twin),
`docs/en/spec-007-science-coverage.en.md` +
`docs/zh-Hant/spec-007-science-coverage.zh-Hant.md` (external-record
map, 10 sections / 136 table rows per side).

## Assessment criterion

The lane asks for a separation of **verified arithmetic**, **simulation
output**, **interpretation**, and **unverified physical claims**. The
dossier already carries that separation mechanically — this review
audits whether the separation is real and honestly labeled, and files
where it is strong and where it must be watched.

## 1. Verified arithmetic — properly bounded

The SETTLED tier is genuinely settled: octonion multiplication and the
Fano plane PG(2,2) (Hurwitz 1898), Aut(O)=G₂, Aut(J₃(O))=F₄ (Chevalier
& Schafer 1950), SO(10) 16-dim spinor = 15+1, Pati-Salam SU(4)≅SO(6),
E8 root system (240 roots). These are textbook results correctly
tiered as SETTLED, with `sibling:` cites that resolve to real source
files (BRG-05: 43 sibling cites resolve). Arithmetic identity claims
(e.g., 64 = 2⁶ codon encoding, 421 = (15³−7)/8) are labeled
"arithmetic true; physics reading is construction-tier" — the
arithmetic is never inflated into physics.

## 2. Simulation output — measured, falsifiable, bounded

The harness results are real computation with refusal channels:

- Q128.128 fixed-point RNE half-ulp bound — proved in-repo (Lean 4,
  zero sorries); that is a formal result, not a benchmark claim.
- Light-cone test: ballistic-front correlation measured, instant
  signaling absent — "correlation real, instant signaling absent" is
  the correct no-communication-theorem reading (QD-05).
- Astrometric evaluation (AST-01..05): EIRP ledger, Arecibo ratio,
  persistence + Doppler bounds all computed integer-only with the
  wire-cost refusal + disconfirmation channel in-source.
- RF-01/02 medium-as-lattice: tested both directions under a bounded
  noise model; OutsideDisk refusal + scope note + empirical-domain
  pointer all in-source.

## 3. Interpretation — correctly tiered below the arithmetic

- PEER-REVIEWED tier holds published results (Furey octonionic SM,
  Todorov/Dubois-Violette, Wilson E8) and never upgrades them to
  framework claims — they are listed as *external record* the
  framework's construction parallels.
- PREPRINT tier is marked unrefereed (Singh J₃(O) mass-ratio series,
  Wilson E8 program) — venue flagged where venue matters (§10).
- CONTESTED rows carry the counter-ledger in-line: Orch-OR lists both
  the 2024–25 microtubule evidence and the Donadi/Bassi
  spontaneous-radiation bound ruling out the simplest DP case —
  verdict INDETERMINATE, held. Wow↔ATLAS is falsified twice over
  under the persistent-transmitter model and still files the surviving
  unfalsifiable one-shot-transient + coincidence-favored verdict with
  a stated falsification channel. That is how an honest contested
  claim is carried.

## 4. Unverified physical claims — held open, not laundered

33 rows are explicitly INDETERMINATE and 7 CONSTRAINED (SCI-05). The
mechanical classifier `tools/science-verdict.mjs` grades every row
(harness_proven / lit_supported / constrained / flagged /
indeterminate) — prove-or-hold, nothing unparsed (SCI-04). The
CONSTRAINED rows bind a published constraint (e.g., octonion compute
substrate obstructed by Quantum Rep. 7(4):55 — interpretation tier
accordingly). No row silently skips a verdict (SCI-06).

## Weak points a reviewer must flag

- The framework's unconventional lanes (air_comp superposition,
  lattice-defect routing, Wow-signal adjacent reading) are
  EXTRAPOLATION/UNSUPPORTED-tier by their own taxonomy — correctly so.
  A reader should not read the SETTLED algebra tier as endorsing the
  speculative physics rows; the dossier does not claim that transfer,
  but the adjacency is a place enthusiasm could leak.
- FRINGE-TIER sources (e.g., the E8↔RNA genomatrix web source) are
  admitted as real-but-low-weight — fine — but future readers must
  keep that tier label attached wherever the claim is cited.

## Verdict

The dossier's epistemic discipline is **real and mechanical**: a
verdict engine grades every row, counter-ledger entries live next to
positive claims, arithmetic never masquerades as physics, and the
unverified tail is named rather than laundered into results. The
separation the lane asks for — arithmetic / simulation /
interpretation / unverified — is present, enforced, and honest.
