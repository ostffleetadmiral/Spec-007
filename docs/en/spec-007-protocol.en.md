# SPEC-007 Protocol Specification

**Status:** Draft 1 — conformance-bound
**Scope:** The interface contract between the integer-pure core and any
external module, runtime, or hardware node. This document is the boundary;
it specifies *what may cross*, *what it must cost*, and *how conformance is
proven*.

Normative terms (MUST/SHOULD/MAY) carry their RFC-2119 senses.

---

## 1. The Bifurcation Invariant

The protocol exists to keep two channels strictly separate:

| Channel | Cost | Content |
|---|---|---|
| **Correlation** | 0 wire bytes | Pre-shared state derived from pairwise seeds. Locally computed, never transmitted. |
| **Signal** | ≥1 wire byte, ≥d/c flight | Any bit that was not already determined by shared seed state. |

A conforming implementation MUST NOT deliver a signal bit without a wire
transmission. Any observation of `bits_moved > 0 ∧ wire_bytes == 0` is a
FRACTURE — a defect in the implementation, never a feature.

## 2. Pairwise Seeding

1. Seeding is the ONLY operation permitted to establish shared state.
2. A seed exchange between nodes A and B is a one-time wire event per pair.
   For N fully-paired nodes the wire cost is O(N) drops while the resulting
   correlated channels are N(N−1)/2 — the philotic dividend
   (`webDividendMilli`). The dividend is an *unforced consequence* of
   pairwise sharing, not a channel.
3. Seed material MUST be treated as secret-bearing: seed-derived streams
   are deterministic, so any party holding the seed reproduces the stream.
4. An unseeded pair MUST behave as uncorrelated noise (~50% agreement on
   binary slots). Correlation appearing between unseeded parties is a leak
   and MUST be reported as a fracture.

## 3. The α-Bit Discipline

Extraction of value from correlated state requires a classical payload
(the α-bit) on the wire. Ordering is normative:

```
measure_ns <= alpha_sent_ns <= extract_ns      (qetSequenceOk)
```

- An α-bit arriving *before* the sender's measurement MUST be rejected.
- An extraction occurring *before* α arrival MUST be rejected.
- Causal inversion is not a protocol violation of style; it is a physical
  violation and MUST be treated as a fracture.

## 4. Wire Accounting

Every conforming node MUST maintain a ledger satisfying:

```
∀ delivered payload: Σ received bytes ≥ Σ logged sends
```

- Phantom deliveries (bytes received that were never sent) are fractures.
- Packet reordering, duplication, and impairment do not excuse accounting
  drift; the invariant holds at the byte level.
- An established carrier (a steady, already-lit stream) encodes **zero
  bits** (`dcCarrierBits = 0`). Information lives only in transitions, and
  every transition pays `transitionFloorNs = d/c`.

## 5. Hydrogen-Clock Slotting

Slot coordination derives from the universal 21-cm line
(1,420,405,751,768 µHz). Conforming nodes MUST:

- Derive slot indices deterministically from the shared constant and a
  locally measured elapsed time (`h1SlotBit`).
- Tolerate jitter up to the slack boundary: agreement survives jitter ≤
  slack and MUST break at slack + 1 (`h1JitterSafe`). At `elapsed=500`,
  `slot=1000`: slack = 500; jitter 500 holds, 501 dies.
- Require zero handshake rounds for slot agreement.

## 6. Determinism Vectors (Interop Contract)

`theue-golden-vectors` emits the canonical vector set: 153 operation
lines + 1 digest line, covering the Q128.128 floor (fromInt/fromRatio/
add/sub/mul/div/pow/cmp/toInt), the transcendental boundary (expFp, railed
at |x| ≥ 88), furnace-hardened corners (T=0, f=0, u64-saturation), philotic
predicates, astro boundaries, and the i-vector census.

Conformance requires **byte-identical reproduction** of:

```
digest|sha256|538237e6fb7060e899cdcada370ae13d34d3aacc5dee4f4c5f5e1307e26c920f
```

including the per-line results, error markers (`!DivisionByZero`), and
`null` horizons. Verified across architectures:

| Target | Status |
|---|---|
| x86_64-linux-gnu (ReleaseSafe) | byte-identical (reference) |
| wasm32-wasi (Debug, Node WASI) | byte-identical |
| aarch64-linux-gnu (ReleaseSafe) | compiles; runtime check pending silicon/qemu |
| riscv64-linux-gnu (ReleaseSafe) | compiles; runtime check pending |

**Known boundary:** wasm32-wasi fails under all Release modes in Zig 0.13
(`LLVM ERROR: Unsupported library call operation!` — optimizer-exposed
wide-int lowering gap). Debug builds are bit-identical. Recorded as a
toolchain limitation, not a spec deviation.

## 7. Serialization & Endianness

- All integer serialization MUST use explicit byte order: `.little` for
  stored data and hash preimages, `.big` for wire/network-order headers
  (`science_address` u112/u128 headers).
- Hash preimages MUST NOT embed native-layout integers (no `asBytes` on
  ints). *Fixed 2026-10-06:* `AuditChain.append` sequence and
  `shadowCommit`/`shadowCommitAt` nonce/coord preimages now encode
  little-endian explicitly — audit chains and position-bound shadows
  verify identically on big- and little-endian hosts.
- f32/bf16/f64 appear only at **format boundaries** (GGUF decode, JSON
  parse, dtype tags, accessor read-outs, test fixtures feeding decoders).
  The core arithmetic is integer-only; this is enforced by the descent
  audit's purity scan (84 boundary sites, 0 violations).

## 8. Conformance Gates

An external module interfaces with the lattice only after passing, in
order:

1. `zig build test` — full module suite.
2. `tools/descent_audit.py` — CLOSED (no cycles, no float-arithmetic
   violations, no orphans).
3. `tools/cross_target_check.sh` — compile matrix + byte-identical digest.
4. Furnace (`science_fuzz` + `chaos-hammer.mjs`) — all probes HELD.
5. `emergence-watch.mjs` — no forbidden emergence; wire accounting closed.
6. `tools/continuity_audit.py` and `tools/twenty_re_audit.py` — green.
7. `tools/publish-check.sh` — all gates green.

## 9. Rejected Behaviors (Non-Negotiable)

- Information without wire cost — FRACTURE, never emergence.
- α-bit reordering or retro-causal extraction.
- Phantom delivery, invented bytes, or ledger drift.
- Correlation between unseeded parties above chance.
- Floating-point arithmetic in core logic.
- Silent overflow/wrap in fixed-point paths (rail or error, never wrap).

---

*This specification describes implemented, tested machinery. The physics
interpretations retain their model/verified/speculative labels in the
findings corpus; the contract here governs the engineering boundary only.*
