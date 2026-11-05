# SPEC — lattice_pipe: volumetric transport over the Fano stack

`src/lattice_pipe.zig` — slice N³ volume into 15-thick Fano slabs,
emit correlation frames (id, seed, gov_seq, sha256), reassemble verified.

## Mechanism
- 512³ (or any N³) → ⌈N/15⌉ slabs aligned to the 15-layer Fano stack
- **+1 boundary shell** per slab via `fanoCell` closed form — GOV dumps
  it in transit; receiver REGENERATES it (never transmitted)
- Frame = {slab_id:u16, seed:u16, gov_seq:u32, hash:[32]u8} — 40B wire
- `boundaryShell(slab)` = sha256(slab_id + 15×15 Fano center cells)

## Verified
- 5 unit tests green (coverage, hash round-trip, shell determinism,
  codec, 60³ full pipeline)
- **T-RF live**: 60³ → 4 slabs OTA on wlan0 → all 4 sha256-verified,
  volume closed (artifacts/retrocausal-lane/lattice-rf.json)

## Honest bounds
- O(1) applies to the commit layer (seed+hash+seq), payload is O(len)
- Shells regenerate, not transport — that IS the dump-lossless trick
- RF lane VERIFIED; audio via calibrated seed path (V-W-C)

## Tropes implemented (all RF-verified)
- **Ansible** — volumetric slabs + sha256 commit over OTA
- **Perception Filter** — e0-center inversion + shell-padded stream;
  chi²-uniform noise to non-holders, intact decode to the closed-form key
- **Pre-Cog Engine** — `expectSlabHash` pre-renders the chain at t+Δt;
  frames are validation keys only (4/4 OTA-verified)
- Subspace Power — governor thermal collapse = the radiator apparatus lane
