# prototypes/ — Executive Override Proving Ground

By executive order: the falsification-audit seals (docs/en/falsification-audit.en.md)
are testable here as *experiments*. A prototype does not unseal — it
challenges the seal on record. Verdicts:

- **SEAL CONFIRMED** — the nullified path fails empirically; the ledger
  entry stands.
- **BOUNDARY** — fails as stated but a narrower form works; the ledger
  is amended, not overturned.
- **SEAL BROKEN** — the nullified path works; escalate to the ledger §7
  process (argue against the sealing proof on record).

Nothing here touches production paths. Prototype reports land in
`prototypes/out/` — never the findings corpus (experiments are not
verified findings until promoted).

## Current challenges

| ID | Seal tested | File |
|---|---|---|
| OVR-01 | N-03 — "flat routing can replace physical seed drops" | `seal-override.mjs` |
| OVR-02 | N-02 — "full lattice state fits one min-MTU datagram" | `seal-override.mjs` |
| OVR-03 | N-05 complement — the missing weights-hash tripwire | `seal-override.mjs` |
| OVR-Q1 | no-communication theorem — signaling via basis choice | `quantum-falsifiables.mjs` |
| OVR-Q2 | quantum teleportation model — correlated pair alone | `quantum-falsifiables.mjs` |
| OVR-Q3 | CHSH local bound on the seed model | `quantum-falsifiables.mjs` |
| OVR-04 | N-01 open inference — bounded-grammar channel | `seal-override-2.mjs` |
| OVR-05 | N-04 tripwire — normalized matcher vs evasion battery | `seal-override-2.mjs` |
| OVR-06 | N-06 unsigned shard — signed-shard variant | `seal-override-2.mjs` |
| OVR-07 | N-07 total khat — wrapping fold | `seal-override-2.mjs` |
| OVR-08 | I-01 qmul4 batching — third-host re-gate | `seal-override-2.mjs` |
| OVR-09 | I-02 fp forward path — domain representability | `seal-override-2.mjs` |
| OVR-10 | I-03 graceful off-domain — saturating variants | `seal-override-2.mjs` |
| OVR-11 | T-01 Golay distance-5 — exhaustive 42,504 wounds | `seal-override-2.mjs` |
| OVR-12 | M-34/36 — J3(O) eigenvalues, α natural-path | `seal-override-2.mjs` |

Run: `node prototypes/seal-override.mjs`
     `node prototypes/quantum-falsifiables.mjs`
     `node prototypes/seal-override-2.mjs`

## Record so far

- OVR-02 is the only seal broken on record (RESURRECTED — boundary).
- OVR-Q1/Q2/Q3: the physics held — the seed model is a local hidden
  variable: correlation, never signal; teleportation costs a channel;
  CHSH |S| ≤ 2 exactly. The paper drop is the price of correlation.
- Sweep 2: N-01 narrowed (bounded grammar channel viable — free-form
  stays sealed); N-04 narrowed (normalized matcher catches all 14
  evasion classes — promotion candidate via ledger §8); N-06 viable-
  but-redundant (signed shard); T-01 boundary moved (d=5 misdecodes
  exhaustively — safe envelope is wounds ≤4); qmul4 killed on a third
  host; khat/fp/degradation seals confirmed; M-34/36 stay UNVERIFIED.
