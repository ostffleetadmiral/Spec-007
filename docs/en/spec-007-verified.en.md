# SPEC-007 verified claims specification

**Status:**
**Version:** 1.0.0 Corrected, source-backed baseline. This document promotes **only** claims that are stoichiometrically derivable, sourced to institutional/manufacturer data, or proven by the calculation harnesses. Everything else is excluded (see `spec-007-research-dossier.md` and `spec-007-claim-verification.en.md` for the rejected/conditional items).

**Immutable source:** `spec-007.md` is preserved unchanged as the historical concept record. This file supersedes its unverified numbers.

**Evidence harnesses:**

- `spec007_calculations.zig` — 8 tests (stoichiometry, flow contradiction, duration, rack scaling, envelope geometry, Q128.128 shadow material balance, shadow drip-rate chain)
- `spec007_expanded_calculations.zig` — 18 tests (PDRC area, thermal cascade, Novec gate, energy split, carbon, vehicle power, feedstock cost, hardware amortization, condenser-path TEG recovery, TEG ΔT scaling, burst rejection area, TEC parasitics, solar photothermal bound, low-rate broad-area burning, monotonicity, Q128.128 shadow cascade/TEG/road-load)
- `spec007_verified_calculations.zig` — 15 tests (commercial yield, implied purity, energy density, TEG module efficiency, rack envelope, envelope consistency, combustion burst ceiling, commercial-grade scaling, rate-duration conservation, residue mass, combustion air/exhaust, cartridge mass floor, Q128.128 shadow energy density/combustion/residue-air-mass ledger)
- `spec007_drivetrain_calculations.zig` — 21 tests (ratio windows, CVT sweep coverage, torque/power conservation, disc and generator-rotor tip-stress bounds, transmission derate chain, per-charge ORC-branch derate, loss-heat TEG recovery bound, shared rejection budget, paid-vs-free heat economics, **dual-path powertrain: scroll-vs-Tesla expander bands, Path A/B bus and per-charge screens, open-hardware $/W comparison, sleeved-rotor bounds**, Q128.128 shadow checks)
- `spec007_manifold_calculations.zig` — 12 tests (cartridge volume/mass budget incl. pouch architecture and ~14% sludge growth, ESP32-S3 controller parasitic envelope and redundancy bound, oil-bus flow and temperature stack, Novec economizer capacity and charge-extension credit, three-bus manifold conservation, Q128.128 shadow checks)
- `spec007_q128.zig` — shadow fixed-point engine (Q128.128, no tests of its own; verified through the harnesses it serves)

## 1. Verified chemistry

Reaction: `CaC₂ + 2 H₂O → C₂H₂ + Ca(OH)₂`, exothermic (ΔH model ≈ −127.2 kJ/mol; literature range corroborated by NOAA CAMEO and MIT OCW materials).

For a **300 g pure** charge:

| Quantity | Verified value | Basis |
|---|---:|---|
| CaC₂ amount | 4.680 mol | Stoichiometry (test harness) |
| Water consumed | 168.6 g | Stoichiometry (test harness) |
| Acetylene produced | 121.9 g / 104.9 L (STP model) | Stoichiometry (test harness) |
| Reaction heat | ≈595 kJ (165 Wh) | 127.2 kJ/mol model (test harness) |
| Acetylene chemical energy | ≈1,689 Wh | 49.9 MJ/kg LHV (test harness) |
| Ca(OH)₂ residue | ≈346.8 g | Stoichiometry (test harness) |
| Carried water inventory | ≈168.6 g | Stoichiometry (test harness) |

For a **commercial acetylene-grade** 300 g charge (GB 10665-2004 supplier rating 285–305 L/kg at 20 °C, 101 kPa):

| Quantity | Verified value | Basis |
|---|---:|---|
| Gas yield | 85.5–91.5 L | Supplier-rated yield (harness test) |
| Implied active CaC₂ | ≈75.9–81.2% | Derived from yield at the rated 20 °C condition (harness test) |
| Energy density (commercial grade) | ≈4.7–5.0 kWh/kg | Pure-model density × active fraction (harness test) |
| Duration at 5 L/min | ≈17–18 min | Yield ÷ rate (harness test) |

**Verified energy density:** ~**6.2 kWh per kg** of pure carbide (5.63 kWh chemical + 0.55 kWh reaction heat). Any figure materially above this (e.g., "~12 kWh/kg") is excluded.

## 2. Verified flow/duration relationship

- Ideal gas rate ≈ **0.622 L/min acetylene per mL/min water**.
- At 0.1–0.5 mL/min water: **0.062–0.311 L/min** gas.
- At 5 L/min gas: requires ≈**8.0 mL/min** water; a 300 g pure charge lasts ≈**21 min**.

Promoted requirement: **any published gas rating must state the paired water-feed rate and charge duration.** Gas rate, water rate, and duration are verified to be physically coupled; they cannot be specified independently.

## 2a. Verified combustion-mode thermal ceiling

If the acetylene is **burned in a qualified burner** (a separate, unproven subsystem), the thermal ceiling rises by roughly an order of magnitude over hydrolysis heat alone:

|| Mode | Thermal power at 5 L/min gas | Duration per 300 g charge | Thermal energy per charge |
||---|---:|---:|---:|
|| Pure model (STP basis) | ≈5.30 kW (4,830 W combustion + 472 W hydrolysis) | ≈21 min | ≈1.85 kWh |
|| Commercial grade (rated basis) | ≈4.94 kW (4,501 W combustion + 440 W hydrolysis) | ≈17–18 min | ≈1.5 kWh |

This is a **thermal ceiling, not an electrical output claim**: conversion through a screened cascade (80% of heat at 6% ORC + 20% at 3% TEG − parasitics, per `spec007_expanded_calculations.zig`) yields roughly **0.09–0.11 kWh electrical per charge** delivered as a high-power burst.

**Thermal-ledger convention:** the cascade's TEG share applies to heat paths *other than* the ORC stream (reactor wall, exhaust boundary). The ORC's ~3.99 kW condenser rejection is a *downstream* path: a TEG in that stream harvests heat already past the expander, so it is not double-counted — but the module's ~5% point rating applies only at a rated ΔT ≈ 270 K. At a real condenser ΔT of ~30–60 K, screening-scaled efficiency is ~0.5–1.1%, so realistic condenser-path recovery is **≈20–44 W**, not the ΔT-idealized ~119 W bound. The high-ΔT placement is the exhaust boundary; low-ΔT placements (reactor wall, condenser) recover proportionally less.

**Combustion air/exhaust requirements (per charge):** at the full 5 L/min gas rate, stoichiometric burning demands ~12.5 L/min O₂ ≈ **~59.5 L/min continuous air**; a whole pure charge consumes ~262 L O₂ (~1.25 m³ air) and produces ≈**412 g CO₂** plus water vapor. Any enclosed or vehicle integration must provide this ventilation and exhaust path.

**Burst-mode rejection:** after screened conversion recovery, ~5.0 kW must still leave the system. At the favorable 120 W/m² PDRC flux that is **~41.7 m²** of radiating area — burst mode requires a forced-convection radiator, not a panel. The burner, exhaust, flashback protection, ventilation, and emissions path remain unverified and are mandatory evidence gates before any such mode is claimed.

**Rate is a dial, not a fixed point.** The ~21-minute figure is only the maximum-rate case. Thermal power scales linearly with gas rate while duration stretches inversely — total energy per charge is conserved (harness test):

| Gas rate | Thermal power (pure model) | Duration per 300 g |
|---:|---:|---:|
| 0.5 L/min | ≈0.53 kW | ≈210 min |
| 1 L/min | ≈1.06 kW | ≈105 min |
| 2 L/min | ≈2.12 kW | ≈52 min |
| 5 L/min | ≈5.30 kW | ≈21 min |

Caveat: parasitic loads (pumps, controls, any active cooling) are roughly constant in watts, so **net** electrical margin shrinks disproportionately at low rates — part-load conversion efficiency is also generally worse, not better. The low-throttle regime is nonetheless physically credible: historical drip-fed carbide lamps sustained ~2–5 hours per charge, consistent with the 0.5 L/min → ≈3.5 h model point.

Broad-area duty point: at 0.5 L/min the ~530 W thermal stream spread over a briefcase-scale (~0.2 m²) plate is ~2.65 kW/m² — uniform enough for large-area TEG or evaporator coverage. Low generation pressure is also the *required* safety regime: acetylene can self-decompose explosively above ~1.5–2 bar even without oxygen, which is why cylinders store it dissolved in acetone. The trade-off is unchanged — the charge's ~1.85 kWh thermal is conserved, so slow burning buys duration and flux control, not more energy.

**On evaporator pressure as a design dial:** a pressurized Novec vapor generator is a legitimate architecture — vapor pressure climbs steeply with temperature (model estimate ~0.4–1.2 MPa at 90–150 °C, derived from manufacturer data), and the dense, high-molecular-weight vapor suits a compact boundary-layer expander. Two bounds apply: the 169 °C critical gate is absolute, and latent heat collapses toward it, so the practical evaporator band is roughly 90–150 °C rather than near-critical. At the low end, sub-atmospheric evaporation can couple to cooler reactor-wall heat but inflates specific volume and sealing demands. Pressure relocates the operating point; it does not add energy — turbine output remains bounded by mass flow × enthalpy drop × measured expander efficiency.

## 2b. Verified drivetrain screening (expander→generator bridge)

If the combustion/ORC path uses a Tesla-turbine expander driving an axial-flux PM generator, the mechanical link is governed by verified screening arithmetic (`spec007_drivetrain_calculations.zig`):

| Quantity | Verified screen | Basis |
|---|---:|---|
| Required ratio, 15–30k RPM turbine → 3–5k RPM generator | **3:1–10:1** | Harness arithmetic |
| Required ratio, L0 30–80k RPM band → 3–5k window | **6:1–26.7:1** | Harness arithmetic — beyond single-stage CVT span |
| Turbine torque at 254 W shaft / 20k RPM | ≈0.121 N·m | T = P/ω, harness |
| Torque at generator through 5:1 at η0.88 | ≈0.534 N·m at 4,000 RPM | T_out = T_in·R·η, harness |
| 50 mm disc tip speed | 78.5 m/s @30k · 209.4 m/s @80k | v = πDN/60, harness |
| 50 mm disc ρv² stress bound (thin ring) | ~49 MPa @30k · ~351 MPa @80k | 351 MPa exceeds ~205 MPa annealed-304 yield; solid-disc bound ~145 MPa with bore concentration unresolved — **the 80k top end stays blocked** |
| 150 mm generator-rotor ρv² screen | ~12 MPa @5k · ~185 MPa @20k | Un-sleeved magnet retention bound (~150 MPa screen) fails at 20k — gear-down or sleeved rotor required |
| Transmission derate band | CVT ×0.80–0.88 · belt/gear ×0.95–0.98 · direct (sleeved) ×1.00 | Sourced efficiency ranges |
| Burst shaft → bus (conservative heat→shaft reading of the 6% ORC figure) | ~182–201 W CVT · ~217–224 W belt · ~228 W direct | Harness; generous heat→bus reading: ~203–248 W |
| Per-charge ORC branch through drivetrain | ~63–79 Wh electric (from ~89 Wh shaft) | Drivetrain-inclusive screened total ≈**0.07–0.09 kWh** vs the ~0.09–0.11 kWh cascade-only bound |
| CVT loss heat → mandatory-flow TEG recovery | ~0.3–0.7 W of ~30–50 W loss | Real but sub-watt at ~50–80 K casing ΔT; the benefit is shared rejection plumbing (+~1% on the ~5 kW burst budget) |
| **Path A (scroll + direct AFPM) bus** | **~412–732 W** | Scroll 45–80% isentropic (measured: Sanden TRS090 ~45% @650 W; E15H ~80% @120–140 °C) × ~24% cycle potential → 10.8–19.2% overall; direct drive, no transmission |
| **Path A per-charge** | **~155–266 Wh** incl. TEG branch | ~2–3× the superseded Path C window |
| **Path B (Tesla + sleeved high-speed gen) bus** | ~215–228 W | HS-gen η ~0.85 screen; direct drive at turbine speed |
| Path B rotor bound | 50 mm magnet rotor → ~46 MPa @30k RPM | Inside both hub (~150 MPa) and CF-sleeve (~800 MPa) screens; 150 mm rotor → ~416 MPa mandates the sleeve |
| Open-hardware $/W | A ~$0.34–1.21 · B ~$1.75–4.19 | Path A's worst bound beats Path B's best (harness) |

**The transmission was optional all along.** The 3:1–10:1 bridge existed only to marry a 15–30k RPM Tesla expander to an un-sleeved 3–5k RPM generator window. Path A removes the mismatch at the expander end (scrolls run 2–6k RPM and are the most-measured small-ORC expander class — and hermetic scroll shells allow zero rotating seals); Path B removes it at the generator end (sleeved PM machines routinely run 20k–500k RPM at this power class). Path C — Tesla + transmission — is superseded and retained only as the archived baseline.

**Economic consequence:** on the paid-carbide branch the CVT-band loss lifts the feedstock floor from ~$1.64 to ~$2.05–2.43/kWh. On a free-heat input (the ~1.6 kW solar roof bound or genuine waste heat) the same loss carries no feedstock cost — the tolerability claim is conditional on which branch feeds the turbine.

**Rotor-speed convention:** the immutable source's 30,000–80,000 RPM turbine band is superseded in practice by the verified stress screen — the defensible operating region is the lower band (~15–30k RPM, consistent with measured literature), and any operation toward 80k RPM requires a qualified rotor-dynamics case that does not currently exist.

## 3. Verified TEG envelope

- Representative 40×40 mm high-temperature Bi₂Te₃-class module: ≈**9.8 W** matched-load output at 300 °C hot / 30 °C cold, with ≈**188 W** heat flow through the module — implying ~**5%** module efficiency at that point.
- Peer-reviewed Bi₂Te₃ modules have demonstrated up to ~**8%** under specified conditions; ordinary commercial modules are rated near 250–300 °C continuous hot-side, not 450 °C.
- Promoted envelope for the 8–12 module array under TEG-only operation: **10–20 W electrical output is a favorable target**; the associated thermal interface must then move on the order of 200–400 W through the modules.

Any working-fluid or TEG claim above manufacturer ratings (e.g., 450 °C continuous mineral oil or Bi₂Te₃) is excluded.

## 4. Verified scaling arithmetic

| Array | Per-blade 10–20 W envelope | Excluded historical figure |
|---|---:|---|
| 16 blades | **160–320 W** | 400–800 W |
| 64 blades | **640–1,280 W** | 2–5 kW |

Higher rack outputs are possible only with a **separate, validated combustion/ORC path**; such output is not verified and is excluded from promotion until measured.

## 5. Verified envelope geometry

50 mm OD × 200 mm L × 2 mm wall (integer-π model): internal cylinder ≈**332 cm³**, shell volume ≈**60.3 cm³**, illustrative shell mass ≈**483 g** (8.0 g/cm³). **Mass floor:** 300 g carbide + 168.6 g water + 483 g shell = **≈951 g** before closures, reservoir vessel, TEGs, fluid inventory, containment, controls, or gas buffer (harness test). Any jacket/fluid inventory must be shown to fit within a complete mass/volume budget; no such budget is presently verified.

<!-- Scaramanga's funhouse packed a lot of tricks into one small room. The cartridge does the same — 320 of its 332 millilitres are already spoken for. -->
**Pouch-architecture budget (convo3):** carbide bed ~136 mL + water pouch ~169 mL + CaO quench pouch ~15 mL ≈ **320 mL against the 332 mL interior → ~12 mL (<4%) headspace** for gas plenum and diaphragm travel; the Ca(OH)₂ product bed grows ~14% over the carbide volume it replaces (absorbed by packed-bed porosity). Screened mass floor with pouches, closures, and sensors: **~1.18 kg** (realistic band ~1.1–1.3 kg — not 1.0 kg) (harness tests).

**Controller parasitic bound (convo3):** an ESP32-S3 controller duty-cycled on its ULP coprocessor draws ~10–50 mW — **<0.2% of the 30 W sustained bus**, and up to three units fit inside a 0.5% budget; always-on compute (~300 mW) would cost ~5.7% at the ~5.3 W low-duty point, so duty cycling is mandatory, and safety shutdown remains an independent hardware function regardless of MCU count (harness tests).

**Three-bus manifold (convo3):** hot oil bus ~150–250 °C (fluid-rating-limited) / warm Novec economizer ~40–90 °C / cold condenser ~30–40 °C. Temperature stack: slab ≤~300 °C → oil ≤~250 °C → Novec ≤150 °C (19 K margin to the 169 °C gate). Oil flow ~5 g/s sustained / ~53 g/s burst. External low-grade sources (e.g. PC cooling) plug in only at the economizer — capacity ~1.43 kW burst / ~0.13 kW sustained; charge-extension credit ~1.10× burst / ~1.32× sustained; additive input enlarges the rejection budget (harness tests).

## 6. Verified regulatory facts

- Calcium carbide is **UN 1402, Class 4.3 (dangerous when wet)**, ADR Packing Group II; limited-quantity threshold 500 g under ADR 2025. UN designation is a classification pathway, **not** product certification.
- The Invention Secrecy Act (1951) exists with 6,543 orders in effect at FY2025 close; the historical (1971) screening list included high-efficiency energy conversions. No current-day suppression list is public; no present-day specific claim is promoted.

## 7. Verified background facts (context, not product claims)

These are verified context used in the analysis; they are not SPEC-007 product claims:

- China cumulative PV ≈1,464 GW end-2025; ~60% of global annual PV additions; >80% of key solar manufacturing stages (IEA/IEA PVPS).
- China wind ≈561.5 GW end-2024; ~70% of 2024 global additions (CWEA/IEA Wind).
- China produces ~80% of world calcium carbide; ~3,000–4,000 kWh/t production energy.
- Negative/zero electricity price hours in France reached ~800 in 2026 (record −€498/MWh, May 1, 2026); China curtailed an estimated 360 TWh of clean power in H1 2026.
- China manufacturing value added ≈27.7% of world total (World Bank WDI 2024/2025 basis).

## 8. What is excluded from promotion

The following categories appear in the historical design inputs but are **not** verified and are excluded from this specification:

1. Any specific net-output figure combining ORC + TEG + turbine (65 W/1 kg/4 h, etc.) — unmeasured.
2. Any system mass/volume claim (5.5 kg, 30×20×35 cm) — unbudgeted.
3. 3-second safety-jail solidification; >5G trigger sufficiency; 5+ year shelf life — untested.
4. Novec-649 as an available, optimal ORC fluid above its 169 °C critical temperature — gated; 3M exited PFAS manufacturing end-2025.
5. Carbon-neutral lifecycle claim — requires full LCA evidence.
6. <$50/blade and any retail/margin figures — no supplier quotations exist.
7. All strategic/political/narrative content — classified under SPEC-004 ("7q"), retained only in the classified design inputs, and excluded from all promoted documents.
8. "Global deployment authorized" — no certification basis exists.

## 9. Promotion rules going forward

1. A claim enters this document only with: a harness test, a primary/institutional source citation, or a qualified measurement report.
2. Conditional or aspirational items live exclusively in the dossier/expanded spec until promoted.
3. Any promotion updates the calculation harnesses and this document together.

## Review schedule

Per OSTF Rulebook Art. VII, this L1 document is under scheduled and triggered review:

- **Annual review:** next due **2027-10-05**.
- **Triggered review** — any of the following requires re-verification through the L4 harnesses before any L1 number may be cited as current:
  - a new or revised manufacturer datasheet,
  - a supplier quote revision affecting promoted costs,
  - a qualified laboratory measurement contradicting a promoted value,
  - a regulatory change affecting the carbide/acetylene or host-vehicle envelope.
- Review outcome is recorded in the SPEC Registry (`spec-007-registry.en.md`) and in this file's version history.

## Version history

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-05 | Retroactive initial version per OSTF Rulebook Art. VI; content unchanged since dossier acceptance. Bump rules: MAJOR = promoted-claim/number change, MINOR = added analysis, PATCH = editorial/translation fix. |
