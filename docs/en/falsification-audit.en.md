# Falsification Audit — The Negative Space Sweep

**Status:** Audit 1 — post-stress-matrix, pre-SPEC-008-wire;
**Audit 2** — executive-override proving ground (`prototypes/`), one seal broken on record
**Scope:** Every nullified or falsified path across the ecosystem,
re-examined against the hardened baseline (37-probe stress matrix,
Q128.128 trap boundaries, dual-anchor discipline, SPEC-008 draft).

**Verdicts:**
- **SEALED** — still dead; the mathematical/engineering proof holds.
- **BOUNDARY** — dead in the role it was conceived for, alive in a
  documented narrower role.
- **RESURRECTED** — new context revives it; gated and re-opened.
- **EXTERNAL** — blocked outside the codebase; honest deferral.

---

## 1. Protocol dead-ends (this fabric)

| # | Nullified path | Verdict | Post-hardening examination |
|---|---|---|---|
| N-01 | Open inference through the bridge gate (`k3` prompt as request param) | **SEALED → BOUNDARY (OVR-04)** | Free-form prompt stays sealed — argv injection by definition. But a *bounded grammar* channel (template verbs + u32 slots) escapes the seal's premise: no attacker text reaches argv — every element is a validated literal. Caveat earned the hard way: the naive grammar carried the FAB-01 proto-hole (`constructor()`); own-property checks are mandatory even in "safe" grammars. |
| N-02 | Single-datagram full-lattice at minimum MTU | **RESURRECTED — boundary** | Sealed by arithmetic on *raw* state (3375×3 = 1266 B > 1232 B). OVR-02 broke the seal empirically: the canon lattice is canon-structured (repeated canonical rows), so joint entropy ≪ per-cell marginal entropy — brotli carries the full state losslessly in **267 B** (deflate 299 B), 4.6× under the min-MTU payload. Boundary: near-entropic/non-canonical states can still approach ~1266 B and retain the SPEC-008 §3 multiframe path. Raw-state seal stays; compressed-state claim reopens. |
| N-03 | "Skip pairwise seeding via clever routing" | **SEALED — with honest note** | The O(N) drop count is an *epistemic* invariant (each pair needs its own out-of-band physical drop), not a topological one. SPEC-008 flat routing reduces signal-path cost to O(1) resolution but cannot manufacture shared seed state — seeds ride paper, not routes. Context shifted cost, not law. |
| N-04 | Surname tripwire as adversary filter | **BOUNDARY → NARROWED (OVR-05)** | GOV-05 falsified the filter role; OVR-05 showed a normalized matcher (NFKC + casefold + leet-map + entity/URL-decode + zero-width-strip) catches **all 14** evasion classes with 0 false positives on control — the accident-catcher upgrades to a real net for the measured class set. Still not an adversary filter (encoding space is open-ended); promotion candidate via §9. |
| N-05 | Brain digest as weight-integrity attestor | **BOUNDARY** | K3B-03 falsified: argmax absorbs sub-marginal wounds, digest emits reference ids. The digest attests *behavior* (emitted-id identity). Structural attestation (weights-hash) is the documented complement, still unbuilt. |
| N-06 | Unsigned shard = weakness | **BOUNDARY** | Rations' token format leaves the shard unsigned *by design* — verified as lawful. OVR-06 measured the signed-shard variant: buys standalone wound detection (+64 B sig on 32 B shard) but is redundant where the seedHash/tokenHash anchor lives — viable as a standalone-verification mode only. |
| N-07 | `khat` fold is total (safe off-domain) | **BOUNDARY → PINNED → CONFIRMED (OVR-07)** | Domain x∈[0,16] pinned by science_boundary tests. OVR-07 tested a wrapping fold (mod 17): 29 inputs in x∈[17,255] silently alias onto canonical labels (x≡0 mod 17 → same label as x=0). Totality costs silent wrongness — the trap is the correct contract, empirically. |

## 2. Integer-core dead-ends (TheUE + vendored layers)

| # | Nullified path | Verdict | Post-hardening examination |
|---|---|---|---|
| I-01 | `qmul4`/`qmul4_32`/`qmul8_32` batched multiply | **SEALED — third host agrees (OVR-08)** | Re-gated on a third microarchitecture: 0.709×/0.631×/0.668× vs the 1.3× keep gate — KILL ×3 (Zen+ 0.89×, SKX 0.85×/0.82×, this host ~0.67×). The seal is architecture-independent; batching stays dead. |
| I-02 | Floating-point in the inference forward path | **SEALED — domain-level (OVR-09)** | f64 can't hold the domain: (1+1e20)−1e20 = 0 vs 1+(1e20−1e20) = 1 — same multiset, order-dependent result; 53-bit mantissa vs 128-bit quantum. Determinism itself requires integer; the seal is arithmetic, not preference. |
| I-03 | Graceful off-domain degradation | **SEALED (as a design) — measured (OVR-10)** | Saturating variants emit 22/22 wrong-but-valid results on boundary inputs (rung 22→21's value; 1e30→i64max): consumers cannot distinguish legal from degraded. Trap-or-nothing confirmed by measurement. |

## 3. Transport/medium dead-ends (Rations)

| # | Nullified path | Verdict | Post-hardening examination |
|---|---|---|---|
| T-01 | Golay silent-correction envelope | **BOUNDARY MOVED (OVR-11)** | d≤4: zero misdecodes (10,626 exhaustive; triangle bound 8−4=4 > decoder radius 3 → impossible). d=5: **all 42,504 exhaustive wounds misdecode** (8−5=3 = radius — every wounded word lands in a wrong correction sphere). The medium's safe envelope is provably wounds ≤4 per codeword; at 5 the decoder lies *confidently*. |
| T-02 | Unchecked fixed-tail parse | **RESURRECTED → CLOSED** | Was dead code *as a defect vector* — the truncation battery proved it live: OOB `@memcpy` panic. Patched to `error.TokenTooShort`; the parser boundary is now a wall. |
| T-03 | `abs(i16.min)` representability | **RESURRECTED → CLOSED** | Legal input (-32768) trapped `peakAmplitude`; now saturating. Same class as T-02: the battery exhumed latent assumptions and sealed them with tests. |

## 4. External deferrals (honest frontier, not dead)

| # | Deferred path | Verdict | Note |
|---|---|---|---|
| X-01 | Jetson acceptance gate | **EXTERNAL** | Needs the device; proof content decomposed and locally satisfied (qemu-aarch64 suite, 6 GiB cgroup residency). Only the literal script is external. |
| X-02 | wasm64 under third-party runtime | **EXTERNAL** | No memory64 WASI runtime exists outside `k3w`; module compiles and runs under the in-tree interpreter. Dead *outside*, alive inside. |
| X-03 | Chromium DOM-paint ceiling | **EXTERNAL** | No Chromium on host; data path measured (0.3ms parse, 3375 cells) — the paint path is the only unmeasured leg. |
| X-04 | 93-layer golden replay on released weights | **EXTERNAL → CLOSED** | Retired dev-server rental; closed as archived verification 2026-10-03. |

## 5. MOUND claim space (final_audit lineage)

The 20 rejected claims (construction/interpretation/numerology/
unverified) were re-examined against the new context. None revive:

- Claims 17–33 are epistemic classifications — the hardened fabric
  doesn't change what the arithmetic proves. SEALED.
- Claims 34–36 (J3(O) eigenvalues → fermion ratios, CKM, α) remain
  **UNVERIFIED** — the computation is still unbuilt, not falsified.
  These are frontier, not dead ends.

## 6. Audit 2 — executive-override proving ground (`prototypes/`)

By executive order the sealed paths were executed as isolated
experiments (`prototypes/seal-override.mjs`). Results on record:

| Probe | Seal tested | Verdict |
|---|---|---|
| OVR-01 | N-03 routed-seeding | **SEAL CONFIRMED** — address-derived state agrees 100%, but Eve replays it at 100%: address bits are public headers, so public determinism is reproducible by anyone and is not correlation. Only a secret physical drop yields a private stream. The earlier probe bug (masking both addresses to the shared 44-bit fragment) was itself the lesson: fragment identity ≠ shared *secret* state. |
| OVR-02 | N-02 single-datagram lattice | **SEAL BROKEN → RESURRECTED (boundary)** — canonical state compresses to 267 B ≤ 1232 B. Per-cell entropy (~3 bits) was the wrong model; the grid's canon structure gives far lower joint entropy. First seal broken on record. |
| OVR-03 | N-05 complement (weights-hash) | **BOUNDARY CLOSED** — sha256 over the checkpoint sees the mantissa-LSB wound argmax absorbs (K3B-03): `729a3610…`→`407b1e69…`. The documented complement now exists as a prototype. |

## 7. Audit 3 — the full override (`seal-override-2.mjs` + `quantum-falsifiables.mjs`)

Every remaining sealed path executed as an experiment:

| Probe | Seal tested | Verdict |
|---|---|---|
| OVR-04 | N-01 open inference | **BOUNDARY** — free-form stays sealed; bounded-grammar channel viable (no attacker text reaches argv). Own-property checks mandatory — the naive grammar had the FAB-01 proto-hole. |
| OVR-05 | N-04 tripwire | **BOUNDARY NARROWED** — normalized matcher catches all 14 evasion classes, 0 false positives. Promotion candidate via §9. |
| OVR-06 | N-06 unsigned shard | **BOUNDARY** — signed shard viable standalone, redundant inside fabric. |
| OVR-07 | N-07 total khat | **SEAL CONFIRMED** — wrap aliases 29 inputs onto canonical labels. |
| OVR-08 | I-01 qmul4 | **SEAL CONFIRMED** — third host: 0.709×/0.631×/0.668×, KILL ×3. |
| OVR-09 | I-02 fp forward | **SEAL CONFIRMED** — f64 can't hold the domain (order-dependent sums). |
| OVR-10 | I-03 degradation | **SEAL CONFIRMED** — saturating variants emit 22/22 wrong-but-valid results. |
| OVR-11 | T-01 Golay | **BOUNDARY MOVED** — d=5: all 42,504 wounds misdecode. Safe envelope = ≤4. |
| OVR-12 | M-34/36 | **UNVERIFIED STANDS** — J3 illustrative matrix √ratios {0.618,0.526} vs measured {0.149,0.034} — no match; 43π+ln(7)=137.0344 is 11.7 ppm but external. |
| OVR-Q1–Q3 | physics seals | **ALL CONFIRMED** — no-signaling (50.00%), teleportation classical cost (50.05%→100% at 1 wire-bit), CHSH \|S\|=2.0000. |

## 8. What the sweeps actually found

- **Audit 1: zero resurrections** — the falsifications held.
  That is itself the finding: the sealed paths were sealed by
  *arithmetic and physics* (MTU, covering radius, epistemic cost),
  which don't yield to new machinery.
- **Audit 2: one resurrection** — the override sweep proved the
  finding's own caveat: OVR-02 showed the N-02 arithmetic modeled the
  *marginal* entropy, not the *joint* entropy of a canon-structured
  grid. Sealed-by-arithmetic claims still have to name which
  arithmetic. Physics negotiated once — through compression.
- **Two latent traps were dead-ends-as-defects** (T-02, T-03) —
  the stress battery already exhumed and sealed them.
- **Three boundary reclassifications** (N-04, N-05, N-06) — dead in
  the role imagined, alive in a narrower honest role. The dossier's
  value is exactly this: knowing which role is real.
- **The context-shift principle confirmed**: SPEC-008 changed the
  *cost* of signal movement, never the *laws* of correlation (N-03).
- **Audit 3: the seals mostly held — and two worth narrowing** —
  13 further challenges: N-01's bounded-grammar channel and N-04's
  normalized tripwire are viable narrower forms (promotion
  candidates, §9); T-01's envelope moved empirically (Golay d=5
  misdecodes *every* wound — the safe radius is ≤4); qmul4 died on a
  third host; khat-wrap/fp/degradation seals confirmed by
  measurement; the physics itself held (no-signaling, teleportation
  classical cost, CHSH |S|=2); M-34/36 stay UNVERIFIED — computed,
  not matched.

## 9. Standing rule

Any future proposal that names a path on this ledger MUST cite the
entry and argue against the sealing proof — not merely restate the
idea. Negative space is load-bearing.
