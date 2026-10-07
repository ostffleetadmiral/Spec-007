# Vendored Qstar deps — pinned 2026-10-07

Source: /home/admpaul/CascadeProjects/hardware/experiments/qstar-llm/deps/
Pin: working tree state, all dep test suites green under zig 0.13.0 at vendoring time.

| Dep | LOC | Role in Spec-007 |
|---|---|---|
| qstar-quantum | 4,267 | Shamir flag escrow, RS-FEC on the 136B wire, DLCZ, RF fingerprint |
| qstar-transport | 3,991 | FANO artifact carriage: QR/audio/cassette/paperback/stega/polyglot/LoRa + maypole bridge |
| qstar-net | 2,783 | Fleet bootstrap (25 E0 seeds), Sybil PoLW, Möbius merge, NAT/WebRTC |
| qstar-mesh | 5,105 | Lattice Location connection management (f64 boundary — sidecar consumer) |
| qstar-vfs | 3,185 | Lattice-page dossier storage + streaming |
| qstar-compress | 3,265 | RMSY container, dedup, TurboQuant sidecar |
| qstar-collapse | 1,373 | Dossier atomization into QR portals (deep archive) |
| qstar-render | 2,605 | Fixed-point Vec3/Mat4/ECS for lattice visualization |

Rule: integer-only cores; qstar-mesh Location and qstar-render use f64
internally — they are consumed at the boundary as sidecar semantics and
documented as such in the harnesses. No float math enters wire formats,
hashes, or governance.
