# SPEC-007 — Modular Chemical Thermal-Electric Cartridge
## 中國製造拯救世界 (Made in China Saves the World)

**Codename:** "Ice Cream Tube" / 冰淇淋管 · 鈣卡匣 ("Calcium Cartridge")
**Classification:** Open Source Energy Infrastructure — Research Candidate
**License:** CC0 Public Domain — 無權利保留
**Authority:** OSTF Fleet Command — Fleet Admiral Paul P. Ramsey
**Issued under:** Real Illumination Covenant; OSTF Interim Founding Governance Charter; SPEC Governance Rulebook (local implementation)
**Version:** 1.4.0 · 2026-10-05

> **Standing notice.** This document is a research-grade specification. It is not an authorization to manufacture, transport, or deploy. All promoted numbers come exclusively from the verified claim layer (`spec-007-verified.en.md`), enforced by reproducible integer test harnesses and institutional sources. Design targets that have not passed measurement gates are labeled as targets, never as specifications.

---

## Preamble — Real Illumination

This specification is framed by the Real Illumination covenant: knowledge in service of abundance, unification, and the protection and advancement of the human species. Energy should be *owned*, *swappable*, and *resilient* — not scarce by architecture.

This document tells the truth even where the truth is inconvenient: the current concept is a *research candidate*, with real contradictions corrected in the open.

---

## Article I — Purpose and Designation

**SPEC-007** defines a modular chemical thermal-electric cartridge ("blade") concept: a sealed calcium-carbide reaction tube intended to deliver heat, a TEG-based low-power electrical output, and a managed acetylene gas path through a standard mechanical interface.

**Design intent:** a field-replaceable energy module for emergency power, remote service, and industrial heat research.

**What it is not:** it is not a battery, not a certified product, and not presently safe for public deployment. It is also not the "self-charging vehicle" powerplant discussed in early design inputs; those claims survive only as gated research targets.

---

## Article II — Verified Physics Baseline

Source reaction (hydrolysis):

```
CaC₂ + 2 H₂O → C₂H₂ + Ca(OH)₂ + heat (ΔH ≈ −127.2 kJ/mol model)
```

### A. Pure-charge model (300 g CaC₂, stoichiometric)

| Quantity | Verified value |
|---|---:|
| CaC₂ amount | 4.680 mol |
| Water consumed | 168.6 g |
| Acetylene formed | 121.9 g ≈ 104.9 L (STP model) |
| Reaction heat | ≈595 kJ (165 Wh) |
| Acetylene chemical energy | ≈1.689 kWh (49.9 MJ/kg LHV) |

### B. Commercial-grade model (GB 10665-2004 acetylene grade)

| Quantity | Verified value |
|---|---:|
| Rated gas yield | 285–305 L/kg at 20 °C, 101 kPa |
| 300 g charge output | **85.5–91.5 L** |
| Implied active carbide | **≈75.9–81.2%** |
| Energy density (commercial grade) | **≈4.7–5.0 kWh/kg** |
| Duration at 5 L/min | **≈17–18 min** (21 min for the pure model) |

### C. Energy density (verified, corrected)

**≈6.2 kWh per kg of pure carbide** (5.63 kWh chemical + 0.55 kWh reaction heat). The earlier "≈12 kWh/kg" figure has been **excluded**.

### D. Flow coupling (verified)

Gas output is physically tied to water feed: **0.622 L/min acetylene per mL/min water**. The stated 0.1–0.5 mL/min pump envelope therefore yields **0.062–0.311 L/min** gas. A 5 L/min gas target requires ~**8 mL/min** water and would deplete a 300 g charge in ≈**21 minutes** (pure model; ≈17–18 min commercial).

### E. Combustion-mode ceiling (verified thermal bound, not an output claim)

If the acetylene is burned in a *qualified* burner — a separate unproven subsystem — the per-blade thermal ceiling is ≈**5.3 kW pure / 4.9 kW commercial** at the maximum 5 L/min rate, for ≈**17–21 minutes** per charge (≈1.5–1.9 kWh thermal). Rate is a dial: ≈**0.53 kW for ~3.5 h** at 0.5 L/min up to ≈**5.3 kW for ~21 min** at 5 L/min — total energy per charge is conserved. A screened conversion cascade turns this into roughly **0.1 kWh electrical per charge** delivered as a burst, less at low rates where parasitics dominate. Distributed TEGs may additionally recover mandatory heat flows, bounded by placement ΔT: the exhaust boundary supports module-rating-grade ΔT (~5% point efficiency), while the ~3.99 kW condenser-rejection stream at a realistic ~30–60 K ΔT yields only ~**20–44 W** of recovery (the ~119 W figure assumes a rated 270 K ΔT a condenser cannot provide). Note the boundary rule: TEGs harvest only where heat *must* flow — on insulated surfaces a TEG module partially creates the leak it harvests — and TECs powered by TEG output are a parasitic loop that can never supply the ~5 kW burst rejection requirement (~42 m² of passive radiating area or a forced-convection radiator). Combustion air demand is ~60 L/min continuous at full rate (~412 g CO₂/charge). The burner, exhaust, flashback, ventilation, and emissions path are mandatory evidence gates; this mode is excluded from the TEG-only envelope.

### F. Drivetrain screening (verified mechanical link)

On the combustion/ORC path the mechanical link is now specified **dual-path**, because the transmission that once seemed mandatory existed only to marry two mismatched endpoints. **Path A (flagship):** a scroll expander — the most-measured small-ORC expander class, 45–80% isentropic at our 120–140 °C band (Sanden TRS090 ~45% @ ~650 W shaft; semi-hermetic E15H-class ~80%) — direct-drives an axial-flux generator at 2–6k RPM: screened burst bus **~412–732 W**, per-charge **~155–266 Wh**, open-hardware BOM ~$250–500 (~$0.34–1.21/W), and a hermetic scroll shell can eliminate rotating seals entirely. **Path B (garage-fab):** the Tesla turbine direct-drives a sleeved high-speed PM generator — a 50 mm magnet rotor holds ~46 MPa hoop stress at 30k RPM inside the ~800 MPa CF-sleeve screen (a 150 mm rotor hits ~416 MPa and mandates the sleeve): screened bus ~215–228 W, ~85 Wh/charge, ~$400–900 (~$1.75–4.19/W) — every part flat or cylindrical, at the cost of rotor-burst containment. **Path C (superseded):** the Tesla + transmission chain (~182–224 W bus, ~74–90 Wh) is retained as the archived baseline — its 3:1–10:1 ratio window, ρv² stress bounds (~49 MPa @30k / ~351 MPa @80k on 50 mm discs), and loss-heat routing analysis still stand. Path A's worst case beats Path B's best case on cost per burst watt, and triples the delivered energy per charge — on paid carbide the feedstock floor improves from ~$2.05–2.43/kWh (Path C) toward ~$0.68–1.16/kWh (Path A).

---

## Article III — Envelope and Materials (design targets)

Pending measured integration — these are targets, not final dimensions:

| Target | Value | Status |
|---|---|---|
| Cartridge envelope | 50 mm Ø × 200 mm L, 2 mm wall (316L) | Geometry verified; material suitability unproven |
| Internal cylindrical volume | ≈332 cm³ | Verified geometry |
| Illustrative shell mass | ≈483 g at 8.0 g/cm³ | Verified geometry baseline |
| Working fluid inventory | TBD — must fit the mass/volume budget | Open |
| TEG array | 8–12 × 40×40 mm Bi₂Te₃-class modules | Representative module data known (below) |

Representative high-temperature module behavior: ≈**9.8 W** matched load at 300 °C hot-side / 30 °C cold-side with ≈**188 W** heat through the module (~**5%** point efficiency). Research-grade Bi₂Te₃ has demonstrated up to **8%** under controlled ΔT.

A working-fluid temperature top end of **300–450 °C** is **not** verified: mineral oil and standard Bi₂Te₃ modules have lower continuous ratings, and any Novec-649 ORC loop is bounded by a **169 °C critical temperature**. Fluid selection is an open engineering gate.

A pressurized Novec vapor generator is a legitimate architecture within that gate: vapor pressure rises steeply with temperature (model-estimated ~0.4–1.2 MPa at 90–150 °C) and the dense, high-molecular-weight vapor suits a compact expander. Latent heat collapses toward the critical point, so the practical evaporator band is roughly **90–150 °C** — not 300 °C.

---

## Article IV — Safety Gates (release-blocking)

No physical build proceeds past design review until each gate closes:

1. **Water-ingress containment** — moisture exclusion, detection, isolation, containment for a water-reactive (UN 1402, Class 4.3) charge.
2. **Gas handling** — controlled acetylene path with flare/burn qualification, flashback prevention, pressure relief, and blockable-outlay safe state; external venting is prohibited.
3. **Shutdown independence** — safe state must not depend on the turbine, a single diaphragm, or one sensor.
4. **Secondary quench verification** — the 50 g CaO ("Safety Jail") concept and < 3 s solidification are **unverified targets**; independent containment layers required regardless.
5. **Transport** — Class 4.3 Packing Group II compliance is a classification entry point only; the assembled article needs jurisdiction-specific packaging evidence.
6. **Shelf life** — 5+ year hermetic storage is an unverified target.

---

## Article V — Interface and Host Configurations (corrected scale)

**Interface targets** — blade mechanical rail, thermal conduction plate, dry-break gasless dock preferred, 2-pin power + identity/status pins, omnidirectional insertion target.

**Host scaling is arithmetic, not marketing:**

| Host | Per verified 10–20 W TEG-only envelope |
|---|---:|
| Suitcase (1 blade) | **10–20 W** |
| Vehicle rack (16 blades) | **160–320 W** |
| Building rack (64 blades) | **640–1,280 W** |

Higher output requires a separately validated combustion/ORC conversion stage; that architecture is a research target (optional burner → thermal-loop → expander → generator) and is **not** part of the verified envelope.

---

## Article VI — Recycling Loop (verified industrial chemistry)

```
Spent residue (Ca(OH)₂ + unreacted CaC₂ + impurities)
  → Collection → Calcination (~900 °C class)
  → Carbothermic reduction (CaO + 3C → CaC₂ + CO, ~2,000–2,100 °C, EAF)
  → Remanufacture
```

Verified industrial foundations: EPA AP-42 carbide manufacture, IPCC carbide emission factors (≈1.8 t CO₂/t production + ≈1.1 t CO₂/t use-phase). "Carbon-neutral" via biochar is conditional and **not promoted**.

---

## Article VII — Manufacturing Context (verified, non-promotional)

- China holds ~80% of world calcium-carbide production at ~38–40 Mt/y, concentrated in Northwest provinces, at ~3,000–4,000 kWh/t production energy (industry sources).
- World IEA data: China cumulative PV ≈1,464 GW end-2025 (~60% of annual additions); wind ≈561.5 GW end-2024 (~70% of 2024 global additions); >80% of key solar manufacturing stages.
- These context facts establish where carbide cost/renewable-oversupply conditions are strongest; they do **not** make any SPEC-007 cost claim (`<$50/blade`/retail figures) verified. All cost figures in this document are excluded as targets.

---

## Article VIII — Mission (narrative 使命)

> The blade is a seed. When stored sunlight can travel in a sealed tube from a kiln to a village, the grid becomes an option, not a permission slip. The mandate of energy returns to the people — 大同.

The mission language frames intent. The physics above sets the boundary.

---

## Article IX — Exclusions

The following earlier claims are **excluded** from this release (full record in the evidence-trail documents):

- 400–800 W (16-blade) and 2–5 kW (64-blade) figures; "~12 kWh/kg"; unverified 5.5 kg system weight; 3-second solidification; 5+ year shelf life; 30,000–80,000 RPM as a safe operating claim; "$50/blade" and any margin model; "global deployment authorized"; all strategic/political/narrative content (classified under SPEC-004, retained only in the classified design inputs).

---

## Article X — Verification & Audit

| Harness | Tests | Scope |
|---|---:|---|
| `spec007_calculations.zig` | 8 | Stoichiometry, flow coupling, rack arithmetic, envelope geometry, Q128.128 shadow material balance, shadow drip-rate chain |
| `spec007_expanded_calculations.zig` | 18 | PDRC area, thermal cascade, Novec gate, energy split, carbon screen, vehicle power, feedstock cost, hardware amortization, condenser-path TEG recovery, TEG ΔT scaling, burst rejection area, TEC parasitic loop, solar photothermal bound, low-rate broad-area burning, monotonicity, Q128.128 shadow cascade/TEG-chain/road-load checks |
| `spec007_verified_calculations.zig` | 15 | Commercial yield, implied purity (rated basis), corrected energy density, TEG point, linear racks, envelope consistency, combustion burst ceiling, commercial scaling, rate-duration conservation, residue mass, combustion air/exhaust, mass floor, Q128.128 shadow energy-density/combustion/residue checks |
| `spec007_drivetrain_calculations.zig` | 21 | Ratio windows, CVT sweep coverage, torque/power conservation, rotor tip-stress bounds, transmission derate chain, per-charge derate, loss-heat recovery bound, shared rejection budget, paid-vs-free heat economics, dual-path powertrain (scroll vs Tesla bands, Path A/B bus + per-charge + $/W screens, sleeved-rotor bounds), Q128.128 shadow checks |
| `spec007_manifold_calculations.zig` | 12 | Cartridge volume/mass budget (pouch architecture, ~14% sludge growth), ESP32-S3 controller parasitic envelope and redundancy bound, oil-bus flow and temperature stack, Novec economizer capacity and charge-extension credit, three-bus manifold conservation, monotonicity, Q128.128 shadow checks |
| `spec007_q128.zig` | — | Trimmed Q128.128 fixed-point engine (i256 raw, i512 intermediates) serving the shadow tests; carries no tests of its own — verified through the harnesses it serves. Q Branch issue: the quartermaster keeps the fractions |

All milestones are archived; the original concept record is immutable (SHA-256 `bcb81b78…`).

---

## Article XI — Amendment and Versioning

Versions follow **MAJOR.MINOR.PATCH** per the SPEC Governance Rulebook:

- **PATCH:** Editorial only — Editor approval.
- **MINOR:** Compatible additions — Standards review.
- **MAJOR:** Any change to a promoted number **requires** a harness test or institutional citation before merge.

**Triggered review:** this document must be re-reviewed when (a) a cited datasheet or standard changes, (b) a supplier quotation or certificate of analysis is obtained, (c) a qualified laboratory measurement arrives, or (d) UN 1402 / GB 10665 / relevant regulation text changes.

**Version history**

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-04 | Initial polished public release built on the verified-claims layer. |
| 1.1.0 | 2026-10-04 | Deep-audit corrections: implied active carbide corrected to the 20 °C rated basis (≈75.9–81.3%), hardware-amortization arithmetic corrected and harness-enforced, commercial-grade energy density and burst duration added. New verified section: combustion-mode thermal ceiling (≈5 kW-class for ≈17–21 min per charge) with explicit burner/safety gates. Expanded harness now 9 tests; verified harness now 8 tests. |
| 1.1.1 | 2026-10-04 | Clarified that burst duration is rate-selectable, not fixed: added verified rate↔power↔duration table (≈0.53 kW/3.5 h to ≈5.3 kW/21 min) and conservation test. Added low-pressure-evaporation operating-point note (evaporator pressure bounds turbine work; 169 °C gate stands). Verified harness now 9 tests. |
| 1.1.2 | 2026-10-04 | Refined evaporator-pressure guidance to cover the full design dial: pressurized Novec vapor generation is affirmed as a legitimate architecture; practical evaporator band identified as ~90–150 °C (latent heat collapses toward the 169 °C critical point); dense high-molecular-weight vapor noted as favorable for compact boundary-layer expanders. |
| 1.1.3 | 2026-10-04 | Added distributed-TEG recovery bound: ~119 W recoverable from the mandatory ~3.99 kW condenser-rejection stream at burst rate (screened, ~3% module point), raising screened electric output toward ~0.13 kWh/charge; documented the boundary rule that TEGs harvest only required heat flows — on insulation a TEG partially creates the leak it harvests. Expanded harness now 10 tests. |
| 1.2.0 | 2026-10-04 | Twenty-iteration audit batch. ΔT-corrected condenser-TEG recovery (~20–44 W realistic; ~119 W is the idealized bound); explicit thermal-ledger convention; burst rejection quantified (~42 m² passive or forced convection); combustion air/exhaust quantified (~60 L/min air, ~412 g CO₂/charge); residue (~347 g), carried water (~169 g), and ~951 g cartridge mass floor added; TEC parasitic loop and solar-photothermal input (~1.6 kW roof bound) screened; implied purity aligned to harness floor (75.9–81.2%); economics re-based on the verified ~0.10–0.13 kWh output with the 158 Wh case demoted to an annotated bound. Harnesses now 6 + 14 + 12 tests. |
| 1.2.1 | 2026-10-04 | Added verified low-rate broad-area duty point: ~530 W thermal for ≈3.5 h (0.5 L/min) or ~106 W for ≈17.5 h (0.1 L/min), ~2.65 kW/m² over a ~0.2 m² plate; documented the acetylene self-decomposition ceiling (~1.5–2 bar) making low-pressure operation a hard safety regime. Expanded harness now 15 tests. |
| 1.2.2 | 2026-10-04 | README rewritten as the mission dossier brief (v1.2.2 registry); no numerical or harness changes. |
| 1.2.3 | 2026-10-04 | Q128.128 shadow layer added beneath all three harnesses (`spec007_q128.zig`, trimmed FANO-1 engine port): 8 shadow tests re-verify every promoted integer against exact rationals with half-ulp rounding bounds. Surfaced two floor-chain corrections documented in-test: cascade net is exactly 38.2 W (floor-chained 37 W) and road-load total is exactly 5,476.02 W (floor-chained 5,475 W); O₂/CO₂ exact values sit ~11 mL / ~17 mg above floored-mmol intermediates. No promoted claim changed. Harnesses now 8 + 18 + 15 = 41 tests. |
| 1.2.4 | 2026-10-04 | Static dossier site added (`site/`): python3+markdown builder producing committed HTML with dossier cover, authority-level navigation, locked L5 drawer page, unlinked SPEC-006 leak page, and a Q Branch "Ledger of Fractions" tabulating exact-vs-floored values. Hidden-annotation layer in the faithful copies extended (cast/registry additions); all comments survive into served page source. No numerical changes. |
| 1.3.0 | 2026-10-05 | Drivetrain integration. New harness `spec007_drivetrain_calculations.zig` (15 tests) screens the expander→generator mechanical bridge: required ratio 3:1–10:1 for the 15–30k RPM band (~26.7:1 for the L0 80k top end — beyond any single-stage CVT); ρv² stress bounds keep the turbine at the low band and require gear-down or a sleeved rotor on the generator; traction-CVT derate (~182–201 W bus) vs belt/gear (~217–224 W) vs sleeved direct-drive (~228 W) on the verified 254 W burst shaft; drivetrain-inclusive per-charge screen ≈0.07–0.09 kWh vs ~0.09–0.11 cascade-only; CVT loss heat is a mandatory-flow path recovering <1 W but adding ~1% to the rejection budget; feedstock floor rises to ~$2.05–2.43/kWh on the paid-heat branch while the loss is tolerable on free heat. New §2b verified drivetrain screening; expanded spec gains §4.5; audit and claim-verification grade all convo-input items. Total harnesses now 8 + 18 + 15 + 15 = 56 tests. |
<!-- Carver's stealth ship was invisible to radar. The CVT became invisible the same way — quietly, by design review. -->
| 1.4.0 | 2026-10-05 | convo3 vision integration — dual-path powertrain + three-bus manifold. The transmission is dissolved: **Path A** (scroll expander 45–80% isentropic measured + direct AFPM) screens ~412–732 W bus, ~155–266 Wh/charge, ~$0.34–1.21/W, hermetic-seal option; **Path B** (Tesla + sleeved high-speed PM gen, 50 mm rotor ~46 MPa @30k) screens ~215–228 W bus, ~$1.75–4.19/W, garage-fab flat-plate parts; Path C retained as superseded baseline. New `spec007_manifold_calculations.zig` (12 tests): cartridge pouch architecture volume budget (332 mL interior vs ~320 mL contents → ~12 mL headspace, ~14% sludge growth, ~1.18 kg mass floor), ESP32-S3 controller parasitic bound (<0.2% duty-cycled; duty cycling mandatory), oil-bus flow (~5/53 g/s), three-grade manifold (hot ~150–250 °C / warm economizer ~40–90 °C / cold ~30–40 °C) with economizer capacity ~1.43 kW burst / ~0.13 kW sustained and charge-extension ~1.10–1.32×, additive input enlarges rejection. Drivetrain harness now 21 tests; totals 8 + 18 + 15 + 21 + 12 = 74 tests. Expanded spec gains §4.6 manifold + §10.1 controller hardware; red-team records Path B burst class; feedstock floor improves to ~$0.68–1.16/kWh on Path A.

---

## Adoption Record

Drafted in research, reviewed in the open. Not yet adopted as a manufacturing specification.

**Prepared by:** OSTF SPEC-007 working record
**Status:** Research Candidate — public research release
