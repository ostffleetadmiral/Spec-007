# SPEC — i-Vector (e0–e7) & 15³ Fano Qubit Lattice

Backported into `src/chiral.zig`: `IVEC`, `fanoCell()`, `e0Census()`, `tier()`.
All structure is comptime-generable — no lookup tables, closed form verified
against the full spec.

## The i-vector (information/imaginary unit)

i = [e0^i, e1^i, ..., e7^i] — 8 components, 32 real components total:

| Idx | Dim | Algebra | Lie group | Fields |
|-----|-----|---------|-----------|--------|
| e0 | 0D/8D^i | Real (observer, ∞-info boundary) | E8 root | 1 |
| e1 | 1D | Real numbers (time) | A1 | 1 |
| e2 | 2D | Complex (a+bi, first i-vector) | A1×A1 | 2 |
| e3 | 3D | S3 vector algebra | SO(4)=SU(2)×SU(2) | 3 |
| e4 | 4D | Quaternions | SO(5)=Sp(2) | 4 |
| e5 | 5D | Bi-complex | SO(4)×SO(4) | 4 |
| e6 | 6D | Jordan algebra | E6/F4 | 9 |
| e7 | 7D | Octonions | G2 | 8 |

0D ≡ 8D: the index wraps mod 8 (`IVEC.at(8) == IVEC.at(0)`) — the boundary
loop where e7 meets e0.

## The 15³ Fano cube — closed form

`fanoCell(layer, row, col)` — layer L ∈ [1,15] mirrors to `min(L, 16-L)`;
row r ∈ [0,14] has center `s = |(15−L) − r| mod 8`; the row is the palindrome
`[s−1…s−7, s, s+1…s+7] mod 8` (6-arm structure, center = the row's i-label).

Verified invariants (all tests in `src/chiral.zig`):
- Every row palindromic around col 7
- `fanoCell(L,r,c) == fanoCell(16-L,r,c)` — layers mirror
- Central slice (L=8) row 8 centers on **e0**
- **e0 census = exactly 421 nodes** (spec said ~421 — exact)

## Scaling tiers

`tier(shell)` → cells / qubits / entangled:

| Shell | Cells | Qubits | Universes | State |
|-------|-------|--------|-----------|-------|
| 15³ | 3,375 | 1 (7-node defect) | — | base qubit |
| 16³ | 4,096 | 1 | 1 | entangled |
| 30³ | 27,000 | 2 | — | non-entangled |
| 32³ | 32,768 | 8 | 8 | entangled |
| 60³ | 216,000 | 4 | — | non-entangled |
| 64³ | 262,144 | 64 | 64 | entangled |
| 120³ | 1.73M | 8 | — | non-entangled |
| 128³ | 2.10M | 512 | 512 | entangled |

Entangled tiers = 16^k shells, qubits = (n/16)³. Non-entangled = 15·2^k
shells, qubits = n/15.
