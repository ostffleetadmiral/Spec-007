# SPEC-007 — MISSION DOSSIER

**FROM THE DESK OF THE FLEET ADMIRAL · OSTF FLEET COMMAND**
**RE: "Ice Cream Tube" — Modular Chemical Thermal-Electric Cartridge**
**Clearance:** Public release · **Version:** 1.3.0-public-research

---

*To all hands with eyes on this file,*

*This dossier contains everything the fleet knows about the asset — what it claims, what the arithmetic proves, what it fails, and what it costs. The original concept document is sealed and immutable; nothing in this file amends it. Everything else exists to answer one question with numbers you can run yourself: what can this machine actually do?*

*Read in order. If a claim and a harness test disagree, the harness wins.*

— FA

---

## Registry

**SPEC-007** — "Ice Cream Tube" thermal-cartridge concept · **Status:** Research — *not approved* for construction, transport, or deployment · **Baseline:** `spec-007.md` (SHA-256 `bcb81b78ebeab9e3762a806788a0c4c1bd3bbd1e8a7b9339030037efab6367b4`) · **License:** CC0

## Authority levels

| Level | Meaning | Documents |
|---|---|---|
| L0 — Immutable record | Original concept document and faithful translations. Claims inside are historical, **not** promoted. | [The Briefing](public.html) · [Covert EN](covert-en.html) · [Covert ZH](covert-zh.html) · [Terminology](terminology.html) |
| L1 — Verified/promoted | Claims backed by stoichiometry, harnesses, or institutional sources. **Governs all numbers.** | [The Trusted Numbers](verified.html) |
| L2 — Evidence trail | Claim inventories, gradings, rejections. | [The File](dossier.html) · [Interrogation Record](claims.html) · [Design-Input Audit](input-audit.html) |
| L3 — Derived analysis | Economics, red team, expanded architecture. | [The Ledger](economics.html) · [The Red Team](red-team.html) · [Expanded Design](expanded.html) · [Governance](governance.html) |
| L4 — Executable checks | Integer/rational harnesses + Q128.128 shadow engine. | [Ledger of Fractions](ledger.html) · `src/spec007_*.zig` |
| L5 — Classified inputs | OSTF design records under SPEC-004. Excluded. | [7q](7q.html) |

## Field verification

```sh
zig test src/spec007_calculations.zig            # 8 tests — stoichiometry, contradictions & shadow layer
zig test src/spec007_expanded_calculations.zig   # 18 tests — PDRC/ORC/vehicle/economics/TEG screens & shadow
zig test src/spec007_verified_calculations.zig   # 15 tests — promoted-claim arithmetic & shadow layer
zig test src/spec007_drivetrain_calculations.zig # 21 tests — dual-path powertrain, derate & stress bounds
zig test src/spec007_manifold_calculations.zig   # 12 tests — cartridge budget, controller parasitics, manifold
zig test src/spec007_dynamics_calculations.zig   # 12 tests — transient thermal/charge sim, conservation ledger
zig test src/spec007_q_toys.zig                  # 6 tests — Q Branch field toys
```

*All ordnance checked out from Q Branch — the shadow engine keeps the books the integers can't see, to within half an ulp.*

## The workstation

[Open the FANO-1 workstation](desktop.html) — the dossier as a desktop: files, folders, a `fano:~$` terminal, the Quplink sandbox running the real 482-byte wasm core, and the sister platform **rations.os** docked in-window (vendored under `family/Rations/` — 1,548-test air-gap web platform, production artifact sha256-verified). The desk speaks two tongues: **EN ⇄ 繁體中文** — taskbar toggle or `lang zh`.

<!-- Moneypenny keeps the office and the records; this index is her desk. Felix Leiter isn't ours, but he always shows — if you found a bug, you're him today. -->

## Standing orders

1. The original `spec-007.md` is never edited.
2. A number is "promoted" only if it appears in `spec-007-verified.en.md` and is backed by a harness test or a cited primary source.
3. Rejected claims are never deleted; they remain marked as rejected.
4. Every passing milestone is archived.
5. Classified inputs are never edited, quoted, or required by any public document.
