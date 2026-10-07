# SPEC-007 expanded engineering specification

**Revision:**
**Version:** 1.0.0 Design-input-integrated red-team draft  
**Status:** Concept architecture and validation requirements — **not approved for construction, transport, vehicle integration, or deployment**  
**Immutable baseline:** `spec-007.md`  
**Verified numbers:** All promoted numeric claims must match `spec-007-verified.en.md`. Numbers appearing in this document that differ are historical design inputs, not promoted claims.  
**Design inputs:** Classified OSTF records (per SPEC-004), retained outside the public face of this repository.

## 0. Scope and evidence discipline

This document expands the original SPEC-007 concept with the additional architecture captured in the classified design inputs: passive daytime radiative cooling (PDRC), a calcium-carbide reactor, an acetylene burner, staged heat exchangers, a closed-loop organic Rankine cycle (ORC), a Tesla turbine, TEG arrays, disposable dry-contact reaction cartridges, modular racks, and a possible ultra-light electric vehicle.

It is an engineering hypothesis, not a validated product specification. Every item is assigned one of these statuses:

- **Calculated:** follows from stated quantities and a reproducible model.
- **Sourced:** supported by a cited standard, manufacturer data sheet, government source, or peer-reviewed work under stated conditions.
- **Target:** a proposed requirement that needs test evidence.
- **Conditional:** could be feasible only if stated dependencies are satisfied.
- **Blocked:** unsafe, contradictory, unavailable, or insufficiently specified.
- **Out of scope:** not part of the first demonstrator.

The original bilingual specification is preserved unchanged. This revision does not convert rhetorical language such as “global deployment,” “carbon-neutral,” or “self-charging” into engineering requirements.

## 1. Architecture overview

### 1.1 Proposed energy path

```text
Dry CaC2 cartridge
        │ controlled internal activation
        ▼
CaC2 + water reactor ──► Ca(OH)2 residue + acetylene
        │                         │
        │ reaction heat            └─► qualified burner and exhaust path
        ▼                                      │
Reactor heat interface                           ▼
        │                              Primary heat exchanger
        ├─► reactor TEGs                         │
        │                                        ▼
        └──────────────────────────────► high-temperature buffer loop
                                                 │
                                                 ▼
                                      Intermediate heat exchanger
                                                 │
                                                 ▼
                                      ORC working-fluid loop
                                                 │
                                    pump → evaporator → expander
                                                 │
                                      generator + optional TEGs
                                                 │
                                                 ▼
                                       condenser / heat rejection
                                      PDRC + convection + radiator
```

The branches are not automatically additive. Every branch draws from the same finite chemical energy and competes for the same temperature difference and heat-rejection capacity. “Three harvesters” is therefore an energy-allocation problem, not three independent sources of energy.

### 1.2 Product variants

| Variant | Purpose | Decision |
|---|---|---|
| Research thermal cartridge | Measure chemistry, heat, residue, and containment using a qualified facility | First demonstrator candidate |
| Standalone emergency thermal-electric unit | Low-power emergency electricity with sealed professional-service cartridge | Conditional niche product |
| Rack power station | Multiple cartridges feeding shared conversion hardware | Deferred until single-unit evidence exists |
| Ultra-light LEV range extender | Vehicle-integrated chemical power source and buffer battery | Deferred; certification-heavy |
| Marine generator | Water-cooled stationary or vessel power unit | Separate program |
| Aircraft/drone system | High energy density but oxygen, crash, and certification constraints | Out of first program |
| Submarine/AUV system | Requires oxygen or non-combustion heat path and pressure-hull integration | Separate program |

## 2. Chemistry and cartridge subsystem

### 2.1 Reaction

`CaC2 + 2 H2O → C2H2 + Ca(OH)2`

The reaction is real and exothermic. The ideal 300 g baseline gives approximately 104.9 L acetylene and 595 kJ hydrolysis heat using the existing model assumptions. Commercial carbide yield depends on purity, particle size, moisture exposure, and impurity content; the design inputs' “high-purity” assumption must not be applied without a certificate of analysis.

### 2.2 Duration control

A slow water feed can extend reaction duration, but it cannot increase total chemical output. In the ideal model:

- 0.1 mL/min water → approximately 0.062 L/min acetylene.
- 0.5 mL/min water → approximately 0.311 L/min acetylene.
- 5 L/min acetylene requires approximately 8.0 mL/min water.
- A 300 g ideal charge at 5 L/min lasts approximately 21 minutes.

Claims of “hours or days” require either a lower average power level, a larger charge, multiple cartridges, or an additional fuel. They do not follow from a single 300 g charge at the stated 5 L/min rate.

### 2.3 Cartridge decisions

- The user must not handle exposed carbide, water-reactive residue, or acetylene.
- The preferred product architecture is a factory-filled, sealed, service-return cartridge with internal activation and no user-accessible gas or liquid quick-connects.
- A dry thermal-contact dock reduces user-side fluid-transfer interfaces, but it does not eliminate internal pressure, gas, combustion, rupture, transport, or end-of-life hazards.
- “Disposable” is not equivalent to “safe.” The cartridge still needs pressure/thermal containment, moisture ingress protection, fire response, transport approval, traceability, and controlled collection.
- A cartridge must have an independently defined safe state. Turbine consumption, a single diaphragm, or a single impact sensor cannot be the sole safety function.
- Residue management is a design target: ~347 g of Ca(OH)₂ forms per 300 g charge (harness-verified stoichiometry) and cakes as a low-conductivity solid. The design inputs propose an automatic purge or isolated sequestration chamber; either mechanism must be demonstrated to keep the thermal path open without breaching containment.
- **Mass floor:** 300 g carbide + ~169 g carried water + ~483 g illustrative shell = ~951 g before closures, reservoir vessel, sensors, insulation, and connectors (harness test). With the convo3 pouch architecture (water pouch + CaO quench pouch + closures/sensors) the screened floor lands **~1.18 kg — a ~1.1–1.3 kg realistic band, not 1.0 kg** (harness test).
<!-- Q's suitcases were always fuller than they looked from the outside. This one has twelve millilitres of air left in it. -->
- **Volume budget (binding constraint):** a 50×200 mm envelope with 2 mm walls has ~332 mL interior (canon geometry). The pouch contents claim ~320 mL (carbide bed ~136 mL at ~2.2 g/cm³ bulk, water ~169 mL, CaO ~15 mL), leaving ~12 mL — **<4% headspace** for the gas plenum, plumbing clearances, and diaphragm motion (harness test). The reaction also grows the solids: ~347 g Ca(OH)₂ occupies ~155 mL versus the ~136 mL of carbide it replaces (~14% growth, absorbed by packed-bed pore volume). The pop-can envelope is feasible only if powdered-bed packing is verified or the envelope grows; this is a CONDITIONAL packaging claim, not a fit-for-purpose result.

## 3. Acetylene branch

### 3.1 Architecture options

| Option | Energy result | Safety result | Status |
|---|---|---|---|
| Vent acetylene | No useful combustion energy | Unacceptable uncontrolled flammable-gas release | Rejected |
| Store acetylene in a separate pressure system | Potentially useful; a small buffer accumulator decouples generation rate from burner demand | Adds pressure-vessel and storage hazards; buffer sizing must cover throttle mismatch and reactor-cooldown carryover | Not for first product |
| Generate-at-burn-rate (preferred) | Because the water drip IS the throttle (~0.8 mL/min water per 0.5 L/min gas), matching generation to consumption keeps acetylene inventory near zero — no stored volume to decompose or leak | Requires tight coupling between dosing valve, gas outlet, and flame monitoring; needs only a transient buffer sized to reaction lag and shutdown carryover | Design target |
| Scrub then store/feed acetylene | Removes sulfur/phosphorus impurities that poison catalysts and create toxic combustion byproducts | Adds sorbent cartridges, regeneration/disposal stream, and maintenance burden | Design target |
| Burn in a qualified enclosed burner | Makes chemical energy available as heat | Requires oxygen/air control (≈60 L/min air at the full 5 L/min gas rate, harness-verified), ignition, flame monitoring, flashback protection, exhaust (~412 g CO₂ + water vapor per charge), CO/NOx assessment | Conditional |
| Low-rate, broad-area burning (preferred duty point) | Maximizes charge duration and heat-flux uniformity: ~530 W thermal for ≈3.5 h at 0.5 L/min, ~106 W for ≈17.5 h at 0.1 L/min; ~2.65 kW/m² over a ~0.2 m² (briefcase-scale) plate vs. multi-MW/m² at a torch nozzle (harness test) | Acetylene must stay near-atmospheric: above ~1.5–2 bar it can self-decompose explosively without oxygen, so low-pressure generation/burning is a hard safety regime, not a preference; low flow velocity raises flashback risk requiring an arrestor; fuel-rich acetylene flames soot heavily — a lean premixed or radiant-pad arrangement with secondary air is required for clean CO-limited combustion | Design target |
| Use acetylene directly in a turbine | Does not recover its chemical energy without combustion | High flammable-gas and ignition risk | Rejected |

The expanded architecture may study an enclosed burner only in a qualified laboratory. The first non-hazardous demonstrator should use an inert heat source or electrical heater to qualify the thermal loops and expander independently.

**Thermal ceiling context:** combustion is the only identified path to kW-class blade output. The verified layer bounds it at ≈5.3 kW thermal (pure) / ≈4.9 kW (commercial) for ≈17–21 minutes per charge — a burst mode, not continuous duty. All electrical claims downstream of the burner remain subject to measured cascade efficiency and the full set of combustion gates.

### 3.2 Exhaust

Clean stoichiometric combustion is:

`2 C2H2 + 5 O2 → 4 CO2 + 2 H2O`

A portable unit cannot trap combustion exhaust indefinitely. Any burner variant requires a defined exhaust path, dilution/ventilation, surface-temperature control, flame failure response, carbon-monoxide monitoring where relevant, and a safe blocked-exhaust state. “Filtered exhaust” does not make a sealed enclosure safe or make the process zero-emission.

## 4. Thermal architecture

### 4.1 Loop 0: reactor heat

Reactor-wall heat is low-to-medium-grade, transient, and affected by water metering, pellet geometry, residue caking, moisture transport, and shell thermal resistance. Reactor TEGs may provide startup telemetry or auxiliary power, but they are not a backup source independent of reactor heat.

### 4.2 Loop 1: primary thermal buffer

A primary loop may smooth burner heat and protect the secondary loop. Candidate fluids must be selected by actual temperature, pressure, fire point, viscosity, oxidation, seal compatibility, and environmental requirements. “Synthetic oil” is not a sufficient specification.

A **refractory-insulated thermal storage block** in the primary path is a design target from the design inputs: a thermal flywheel to absorb combustion spikes and carry the expander through throttle transients. Its mass, charge/discharge temperature band, and insulation budget are TBD and must enter the mass model explicitly.

The loop must not be assumed to tolerate the source document's 300–450 °C continuously. The design must identify the maximum fluid-film temperature and local hot spots, not only the bulk temperature.

### 4.3 Loop 2: Novec-649 ORC candidate

Novec 649 / FK-5-1-12 is a technically documented ORC candidate, but the source material overstates its suitability:

- Boiling point: approximately 49 °C.
- Critical temperature: approximately 169 °C.
- Critical pressure: approximately 1.88 MPa.
- Heat of vaporization: approximately 88 kJ/kg.
- The manufacturer says it is stable above 300 °C in the absence of water, but that is not a conventional ORC operating target above its critical temperature.
- The manufacturer recommends sealed systems and warns about interaction with liquid water.
- 3M completed its exit from PFAS manufacturing at the end of 2025, creating supply continuity, regulatory, and end-of-life concerns.

**Requirement:** A Novec loop may only be retained after a current supply declaration, environmental/legal review, fluid-property model, pressure design, material-compatibility review, and independent leak/containment plan. It is not automatically the best fluid because it is dielectric and nonflammable.

**Integration note:** because Novec is a dielectric fluid, the same loop can in principle provide direct immersion cooling for electronics — a dual-use architecture element in the design inputs. Any immersion chamber shares the loop's sealing, moisture-exclusion, and pressure requirements and adds wetted-component compatibility review.

**Operating-point note:** evaporator pressure/temperature is a design dial bounded above by the 169 °C critical point. Raising it produces dense, high-pressure vapor — Novec's high molecular weight (316 g/mol) yields vapor far denser than steam at equal pressure, which suits compact boundary-layer expanders. However, latent heat declines toward zero as temperature approaches the critical point, so the practical evaporator sweet spot is roughly **90–150 °C** (model-estimated ~0.4–1.2 MPa vapor pressure, derived from manufacturer data: 40 kPa @ 25 °C, bp 49 °C, hfg 88 kJ/kg) rather than near-critical operation. At the low end, sub-atmospheric evaporation can couple to lower-grade reactor-wall heat but increases specific volume, expander losses, and sealing demands. Operating pressure relocates the cycle's operating point; it does not change the energy budget, and it never lifts the 169 °C gate.

### 4.4 Expander selection

A Tesla turbine is not automatically superior to a scroll, piston, vane, or other positive-displacement expander at tens-of-watts scale. The choice shall be based on measured net output after pump power, leakage, friction, generator losses, startup behavior, partial-load efficiency, and containment.

The claimed 5–8% micro-ORC efficiency and 12–15% larger-turbine efficiency are targets requiring evidence, not inputs to a business case. Published micro-ORC experiments show positive net output is possible, but results vary strongly by scale and often use expanders other than Tesla turbines.

<!-- The Q-boat had no gearbox between engine and jet, and Bond still outran the helicopter. Sometimes the transmission is the problem wearing a disguise. -->
### 4.5 Powertrain: dual expander/generator paths

The design inputs specify an axial-flux permanent-magnet machine as the generator (a verified machine class — AFPMSGs are standard direct-drive wind/regenerative hardware). The earlier integration treated a transmission as mandatory because it married a 15,000–30,000 RPM Tesla turbine to a screened 3,000–5,000 RPM generator window. The convo3 literature pass dissolved that premise: **the transmission existed to bridge two mismatched endpoints, and both endpoints have direct-drive alternatives.** Per the open-hardware mandate, both are documented; the CVT chain is retained as the superseded Path C.

**Path A — scroll expander + direct-drive AFPM (flagship).** Commercial scroll compressors run backwards are the most-measured expander class at this scale: the Sanden TRS090 measured ~45% isentropic at ~650 W shaft, and semi-hermetic E15H-class machines measured ~80% isentropic at 120–140 °C — inside the Novec evaporator band. Applied to the cycle's ~24% isentropic potential (6% overall ÷ 25% Tesla), the scroll band lifts overall ORC efficiency to ~10.8–19.2%:

| Metric | Path A | Path B | Path C (superseded) |
|---|---|---|---|
| Expander → shaft (burst) | **~458–814 W** | ~254 W | ~254 W |
| Shaft → bus | **~412–732 W** | ~215–228 W | ~182–224 W |
| Per-charge electrical | **~155–266 Wh** | ~85 Wh | ~74–90 Wh |
| Rotor speed | 2–6k RPM — no sleeve | 15–30k RPM — CF sleeve mandatory | mixed |
| Open-hardware BOM (screen) | ~$250–500 | ~$400–900 | +CVT part |
| Cost per burst watt | **~$0.34–1.21/W** | ~$1.75–4.19/W | highest |
| Sealing | Hermetic scroll shell = **zero rotating seals** | High-speed shaft seal or hermetic gen | shaft seal + CVT |
| Hazard class | scroll seizure = rebuild | rotor burst = containment event | rotor burst + transmission |
| Fabrication | reman COTS expander | flat-plate discs — garage-fab | precision CVT part |

Path A wins the $/W metric at *both* bounds: its worst case (~$1.21/W) beats Path B's best case (~$1.75/W) (harness test).

**Path B — Tesla turbine + sleeved high-speed PM generator (garage-fab).** High-speed PM machines are proven well beyond the screened 3–5k window — 100 W @ 500k RPM in a 3 cm³ package, 1 kW @ 500k RPM, Capstone's commercial 30 kW microturbine at 96k RPM on air bearings — and carbon-fiber magnet sleeves are standard practice at 20k+ RPM. A compact 50 mm magnet rotor keeps the ρv² hoop bound at ~46 MPa at 30k RPM (inside the ~800 MPa sleeve screen and even the ~150 MPa un-sleeved hub bound); the 150 mm rotor would hit ~416 MPa at 30k and mandates the sleeve. Path B keeps the flat-plate Tesla rotor — every part is flat or cylindrical — and pays for it in generator complexity (sleeve winding, precision bearings, HF rectification, sensorless drive) and a mandatory containment housing.

**Path C — Tesla + transmission (superseded, retained).** The CVT/belt/gear chain from the drivetrain integration remains in the harness and archive as the quantified baseline: ~182–224 W bus, ~74–90 Wh/charge, and the ratio-window/torque/loss-heat analysis below still applies to any builder who retains it.

**Ratio window.** Required reduction is `R = N_turbine / N_generator`:

| Turbine band | Generator window | Required R | Status |
|---|---|---:|---|
| Convo band 15,000–30,000 RPM | 3,000–5,000 RPM | 3:1–10:1 | Calculated |
| L0 band 30,000–80,000 RPM | 3,000–5,000 RPM | 6:1–26.7:1 | Calculated — beyond any single-stage CVT |
| Worked example | 20,000 → 4,000 RPM | 5:1 | Calculated |

A fixed 4:1–6:1 CVT sweep holds a *fixed* 4,000 RPM generator setpoint only across 16,000–24,000 RPM of turbine speed; covering the full convo band needs either a ~3.75–7.5 sweep or letting the generator work its whole 3–5k window (harness test).

**Torque chain.** `T_out = T_in·R·η` is enforced by the harness: at the verified ~254 W burst shaft and 20k RPM, turbine torque is ~0.121 N·m; through 5:1 at η0.88 the generator receives ~0.534 N·m at 4,000 RPM (223.5 W — power conserved minus the transmission loss).

**Rotor-stress screening (thin-ring bound σ ≈ ρv²).**

| Element | Speed | Tip speed | Stress bound | Disposition |
|---|---:|---:|---:|---|
| 50 mm stainless disc pack (304, 8.0 g/cm³) | 30,000 RPM | ~78.5 m/s | ~49 MPa | Under ~205 MPa annealed yield — fine |
| Same | 80,000 RPM | ~209.4 m/s | ~351 MPa ring / ~145 MPa solid-disc center | Marginal-to-fail; bore hoop concentration (~2–3×) pushes the disc bore over yield — the L0 top end stays Blocked |
| 150 mm AFPM rotor (NdFeB, ~7.5 g/cm³) | 5,000 RPM | ~39.3 m/s | ~12 MPa | Inside the ~150 MPa un-sleeved retention screen |
| Same | 20,000 RPM | ~157.1 m/s | ~185 MPa | Exceeds the screen — direct-drive requires a carbon-sleeved rotor |

**Transmission options.**

| Option | η (screen) | Benefit | Cost | Status |
|---|---:|---|---|---|
| Synchronous timing belt (GT2/HTD) | 95–98% | Cheap, quiet, shock-absorbent, no lubricant | Ratio fixed at build; belt life at 20k+ input needs vendor data | Conditional — preferred for net output |
| Fixed-ratio planetary gearbox | 96–98% | Compact, in-line, handles high input speed | Bearing ratings and lubrication at sustained 20k+ RPM | Conditional |
| Planetary traction CVT | 80–88% | Variable ratio: holds the generator setpoint across turbine speed/pressure swings; relieves turbine startup stall | −12 to −20% of shaft power as traction-fluid heat; creep/spin losses documented in the literature; expensive precision part | Conditional — control benefit paid in watts |
| Sleeved direct-drive alternator | ~90% gen only | No transmission stage at all | Rotor sleeve design, high-frequency rectification, bearings at 20k+ RPM | Conditional — highest net efficiency path |

**Derated output.** With the screened 6% ORC figure read conservatively as heat→shaft, the verified ~254 W burst shaft becomes ~182–201 W at the bus through a CVT, ~217–224 W through a belt, ~228 W direct-drive (shaft + generator only). Per charge, the ORC branch's ~89 Wh becomes ~63 Wh (CVT worst case) to ~79 Wh (direct) — the drivetrain-inclusive screened total including the ~11 Wh TEG branch runs ~74–90 Wh versus the ~90–110 Wh cascade-only bound. If the 6% figure is instead read as already heat→bus, only the transmission factor applies (~203–248 W). Both interpretations are computed in the harness; the conservative band governs the economics.

**Loss-heat routing (mandatory-flow rule applies).** CVT losses (~30–50 W at burst) heat the traction fluid and casing — that heat *must* be piped off, so under the distributed-TEG boundary rule it is a legitimate harvest path. But at a realistic ~50–80 K casing ΔT the screen recovers only ~0.3–0.7 W (~1–1.5% of the loss): real, ledger-legal, and economically negligible. The genuine benefit is routing the loss into the shared PDRC/radiator budget — +~1% on the ~5 kW burst rejection requirement (~42.1 m² vs ~41.7 m² at the favorable flux) — rather than a dedicated cooler. A PV/photothermal surface on the same skin remains a *source* (free heat), not a recovery path.

**Free-heat vs paid-heat caveat.** "20% drivetrain loss is acceptable" holds only where the input heat is free (solar/waste branch). On the paid carbide charge, the loss raises the feedstock floor from ~$1.64/kWh to ~$2.05–$2.43/kWh (harness economics test).

**Mechanical interface requirements (targets, not validated):**

- Flexible disc or micro-bellows couplings above ~15k RPM (rigid couplings amplify misalignment into destructive vibration).
- Ceramic hybrid bearings rated for combined radial/thrust loads; L10 life data required.
- Ratio actuation: servo feedback loop or centrifugal governor; overspeed trip on *both* shafts plus an independent generator-side brake so a transmission fault cannot overspeed either rotor.

<!-- Le Chiffre collected from every client at the table at their own rate. The manifold collects heat from every source at its own grade — nobody pays more than their temperature can afford. -->
### 4.6 Three-grade heat manifold

The convo3 design intent — "a heat exchanger grabbing heat from almost any source," with plug-in loads such as PC cooling — survives grading as a **grade-separated manifold**. Heat cannot climb temperature, so sources enter at their own grade and sinks sit where the cycle needs them. `spec007_manifold_calculations.zig` enforces the arithmetic.

| Bus | Temperature band | Carries | Accepts |
|---|---|---|---|
| Hot (oil loop) | ~150–250 °C bulk | Burner slab heat toward the evaporator; fluid-rating-limited (mineral/ester oil ~150–200 °C continuous; 300–450 °C remains excluded) | Carbide burner, solar photothermal, industrial waste heat at ≥250 °C |
| Warm (Novec economizer) | ~40–90 °C | Liquid working fluid between condenser and evaporator | **External low-grade sources (PC/electronics cooling, warm waste water)** — preheats working fluid, directly relieving burner duty |
| Cold (condenser) | ~30–40 °C | Rejection stream to PDRC/radiator/forced convection | Recovery TEGs on mandatory flows only |

**Temperature stack (three ceilings, harness-ordered):** burner slab ≤~300 °C (TEG module rating) → oil bus ≤~150–250 °C (fluid rating) → Novec evaporator ≤150 °C (19 K margin to the 169 °C critical gate) → condenser ~40 °C. The oil loop does not "step down" temperature like a gearbox — it circulates heat at its own rating and the evaporator draw is what cools it; the refractory thermal block (§4.2) absorbs slab spikes above the oil's bulk rating.

**Oil-bus flow screen:** at cp ~2.0 kJ/kg·K and a 50 K supply-return swing, the bus carries ~5 g/s at the sustained 530 W duty point and ~53 g/s at the 5.3 kW burst; a ~0.5 L loop gives ~87 s / ~8 s residence — a real thermal buffer, not a pipe.

**Economizer capacity and credit.** Novec near the 150 °C band is dominated by *sensible* preheat — screening cp_l ~1.3 kJ/kg·K over the 100 K condenser→evaporator span against a h_fg that has fallen toward ~60 kJ/kg near critical — so liquid preheat is the larger share of evaporator duty. The warm bus can absorb ~**1.43 kW at burst** (ṁ ≈ 22 g/s) but only ~**0.13 kW sustained** (ṁ ≈ 2 g/s). A 500 W plug-in source (e.g. a PC under full load) is fully absorbed at burst but capped at ~0.13 kW sustained. Two honest consequences:

- **Credit-displaced operation:** every absorbed watt is a watt the burner does not owe — charge duration extends by ~1.10× at burst and ~1.32× sustained. *External heat stretches the charge most at low duty* — the reverse of intuition.
- **Additive operation:** input rises to ~5.8 kW and rejection carries the balance (~5.0–5.3 kW at Path-A extraction) — plugging heat in *enlarges* the rejection problem. The manifold is a shared budget, not free energy.

The Novec dielectric property (§4.3 integration note) enables the strongest version of the plug-in: **direct immersion** of electronics in the working-fluid loop, subject to the same sealing/pressure review.

## 5. Heat rejection and PDRC subsystem

### 5.1 Correct energy balance

PDRC net cooling is approximately:

`P_net = P_radiated − P_atmosphere − P_solar − P_convection/conduction`

The 3 K sky is a radiative reference, not a guaranteed 3 K condenser. Clouds, humidity, viewing angle, solar absorption, wind, dirt, and conduction from the chassis all matter.

A favorable PDRC surface may achieve tens to approximately 120 W/m² under suitable conditions, while practical vehicle conditions can be lower or different. A 200–300 cm² panel has an area of 0.02–0.03 m², so its idealized heat rejection is on the order of a few watts, not hundreds of watts. It cannot be the sole condenser for an 800 W waste-heat stream or “instantly” liquefy ORC vapor.

### 5.2 Thermal switching and solar input

A roof or chassis surface may support a controlled dual-mode surface:

- Solar-reflective/radiative mode for rejecting heat.
- Solar-absorptive mode only when deliberate heat input is beneficial and the thermal loop can accept it.

In absorptive mode the surface is a genuine secondary heat source: a selective absorber at ~800 W/m² net input yields only ~16–24 W from a 200–300 cm² panel, but ~**1.6 kW thermal** from a ~2 m² vehicle-scale roof at peak sun (harness screening) — comparable to a 1–2 L/min carbide throttle. This supports an architecture where solar heat carries the daytime load and the carbide reactor covers night, low-sun, or surge demand; the two sources share the same conversion cascade and are never additive with the charge's chemical budget in per-charge accounting.

The surface must include bypasses and conventional radiators. A fluid-routing valve cannot make the same surface simultaneously behave as an ideal solar collector and ideal radiative cooler; the optical and thermal modes are competing design states.

**Burst-scale rejection:** at the verified ~5.3 kW thermal burst, ~5.0 kW must still be rejected after screened conversion recovery — ~41.7 m² at the favorable 120 W/m² PDRC flux (harness test). Burst mode therefore requires a forced-convection radiator sized to the full waste stream at worst-case ambient, not a passive panel.

### 5.3 Vehicle operation

Motion increases convective heat transfer and may help reject heat, but it can also heat the panel under warm ambient air. PDRC performance while driving requires wind-tunnel or road testing; it must not be counted as a fixed bonus to ORC efficiency.

## 6. TEG staging

TEGs may be placed at:

1. Reactor wall — startup/low-grade heat.
2. Burner or exhaust boundary — higher temperature, but high thermal stress.
3. Condenser or radiator boundary — only where a real temperature difference remains.

The stages are thermally coupled. Adding a TEG changes heat flow and can reduce the heat available to the turbine or condenser. The system model must conserve heat and include electrical parasitics, contact resistance, cold-side temperature, and module derating.

**Distributed recovery rule:** TEGs are legitimate harvesters only on heat paths that *must* flow — the ORC condenser rejection stream and the exhaust boundary — and their yield is bounded by placement ΔT. At the verified burst rate the condenser rejects ~3.99 kW; a TEG in that path at the ~3–5% module point recovers ≈119 W only under a rated ΔT ≈ 270 K that a ~50–90 °C condenser cannot provide. At a realistic condenser ΔT of ~30–60 K, screening-scaled efficiency is ~0.5–1.1%, so recovery is ≈**20–44 W** (harness test). The high-ΔT placement is the exhaust boundary; reactor-wall and condenser stages are low-ΔT and recover proportionally less. Two further constraints apply: a TEG module is itself a thermal conductor — mounted on an *insulated* surface it partially creates the leak it harvests, so better insulation beats harvesting there; and a condenser-path TEG raises the condensing temperature, trading recovery against ORC cycle efficiency. Recovery on required paths is an optimization, not free energy.

**Parasitic cooling note:** thermoelectric coolers powered by harvested TEG output are a parasitic refrigeration loop, not a cooling resource. At COP ~0.5–2, even the entire idealized condenser recovery (~120 W electric) pumps only ~60–240 W of heat — under 5% of the ~5 kW burst rejection requirement — while removing all of it from the electrical bus (harness test).

The correct output metric is net electrical energy at the regulated bus, not the sum of nameplate TEG power, turbine shaft power, and theoretical chemical heat.

### 6.1 Expanded screening calculations

The integer-scaled harness `spec007_expanded_calculations.zig` makes the main design-level contradictions reproducible without using floating-point state:

| Check | Nominal inputs | Result | Interpretation |
|---|---|---:|---|
| PDRC panel rejection | 200–300 cm² at 120 W/m² | 2–3 W | Too small to reject an 800 W waste-heat stream. |
| PDRC area for 800 W | 120 W/m² net cooling | ~66,666 cm² / 6.67 m² | Requires a vehicle-scale radiator plus conventional convection/radiation paths. |
| Shared thermal cascade | 800 W input; 80% ORC share at 6%; 20% TEG share at 3%; 5 W parasitics | 37 W net | Harvesters do not create independent energy; heat allocation and parasitics dominate. |
| Novec-649 subcritical gate | 169 °C critical temperature | 150 °C passes; 180/300 °C fails | A 300 °C loop cannot be treated as an ordinary subcritical Novec ORC. |
| Acetylene chemical energy | 121.862 g at 49.9 MJ/kg LHV | ~1,689 Wh | Separate from the ~165 Wh modeled hydrolysis heat; combustion requires a separate qualified system. |
| Indicative CO₂ screen | 300 g CaC₂ at 2.9 kg CO₂/kg combined factor | ~870 g CO₂ | “Carbon-neutral” requires verified capture/recycling credits and full lifecycle accounting. |
| 700 kg vehicle at 80 km/h | CdA 0.60 m², Crr 0.010, ρ 1.2 kg/m³ | ~3,950 W aero + ~1,525 W rolling = ~5,475 W | Lightweight mass helps rolling resistance, but full-size frontal area still drives substantial cruise power. |
| Feedstock-only electricity | 300 g at $0.60/kg and 110 Wh verified-screened output | ~$1.64/kWh | Excludes cartridge, safety, labor, transport, service, and recycling costs; the legacy 158 Wh figure is an unverified upper bound. |
| Condenser-path TEG at real ΔT | ~3.99 kW rejected; ΔT ~30–60 K | ~20–44 W recovered | The ~119 W figure assumes rated ΔT ≈ 270 K that a condenser cannot provide; exhaust boundary is the high-ΔT placement. |
| Burst-mode rejection area | ~5.0 kW rejected at 120 W/m² | ~416,667 cm² ≈ 41.7 m² | Burst mode requires a forced-convection radiator, not a passive panel. |
| TEC powered by TEG output | 120 W input at COP ~0.5–2 | ~60–240 W pumped, 0 W to bus | Parasitic refrigeration loop; <5% of burst rejection need. |
| Solar photothermal input | ~800 W/m² net on ~2 m² roof | ~1.6 kW thermal peak | Comparable to a 1–2 L/min carbide throttle; daytime source sharing the same cascade. |
| Drivetrain ratio window | 15–30k RPM turbine → 3–5k RPM generator | R = 3:1–10:1 (L0 80k top needs ~26.7:1) | A single-stage CVT cannot bridge the immutable spec's top end; sleeved direct-drive or compound gearing required there. |
| Burst shaft through CVT | 254 W shaft, η 0.80–0.88, gen η 0.90 | ~182–201 W bus | Transmission stage is mandatory; CVT control is paid in watts. |
| Burst shaft through belt/gear | 254 W shaft, η 0.95–0.98, gen η 0.90 | ~217–224 W bus (~228 direct) | Fixed-ratio hardware preserves ~8–10% more bus power than the CVT band. |
| Per-charge ORC branch | 88 Wh shaft (1.854 kWh thermal × 0.8 × 0.06) | 63–79 Wh electric + 11 Wh TEG | Drivetrain-inclusive screen ~74–90 Wh vs ~90–110 Wh cascade-only. |
| Rotor tip-stress screen | ρv² thin-ring bound | 49 MPa @30k / ~351 MPa @80k (50 mm, 304) | 80k top end exceeds annealed yield; low band is the defensible operating region. |
| CVT loss-heat recovery | ~30–50 W mandatory flow at ~50–80 K ΔT | ~0.3–0.7 W recovered | Ledger-legal via the boundary rule; the value is shared rejection plumbing, not harvest. |
| Path A bus (scroll + direct AFPM) | 45–80% scroll isentropic × 24% cycle potential | ~412–732 W bus | Expander swap triples output; superseded Path C tops at ~224 W (harness). |
| Path A per-charge energy | 1,854 Wh thermal × 0.8 × 0.108–0.192 | ~155–266 Wh incl. TEG | ~2–3× the Path C ~74–90 Wh window (harness). |
| Path B rotor stress | 50 mm magnet rotor @ 30k RPM | ~46 MPa hoop | Inside sleeve (~800 MPa) and hub (~150 MPa) screens; 150 mm rotor hits ~416 MPa — sleeve mandatory there. |
| Open-hardware cost/W | A $250–500 BOM on 412–732 W; B $400–900 on 215–228 W | A ~$0.34–1.21/W; B ~$1.75–4.19/W | Path A worst beats Path B best (harness). |
| Cartridge volume budget | 332 mL interior vs ~320 mL contents | ~12 mL headspace (<4%) | Pop-can envelope nearly full — powder-bed packing or envelope growth required (harness). |
| Cartridge mass floor | pouches + closures + sensors on ~951 g base | ~1.18 kg | Realistic band ~1.1–1.3 kg, not 1.0 kg (harness). |
| ESP32-S3 parasitic | 10–50 mW duty-cycled / 300 mW always-on | <0.2% of 30 W bus / ~5.7% of 5.3 W low-rate | Duty cycling mandatory; ≤3 units inside 0.5% budget (harness). |
| Oil-bus flow | cp ~2.0 kJ/kg·K, ΔT 50 K | ~5 g/s sustained / ~53 g/s burst | ~0.5 L loop → ~87 s / ~8 s residence — a buffer, not a pipe (harness). |
| Economizer capacity | Novec ~22 g/s burst / ~2 g/s sustained, cp 1.3, 50 K span | ~1.43 kW burst / ~0.13 kW sustained | External low-grade heat plugs in only at the warm bus (harness). |
| Charge extension via economizer | 500 W source vs capacity | ~1.10× burst / ~1.32× sustained | Free heat stretches the charge most at low duty; additive use enlarges rejection (harness). |

These are screening calculations, not validated performance predictions. They intentionally do not model hazardous pressure, combustion, rotor dynamics beyond first-order tip-stress bounds, or physical construction.

## 7. Mechanical interfaces and modular docking

### 7.1 Dry-contact cartridge dock

The preferred dock has no user-accessible acetylene, water, primary-loop fluid, or ORC-fluid connections. It may use:

- Conductive thermal plates.
- Mechanical retention and alignment.
- Electrical identity and temperature sensing.
- A sealed cartridge-state interlock.

The dock still requires isolation during insertion/removal, thermal burn protection, moisture exclusion, cartridge presence detection, and a way to handle an overheated or damaged cartridge.

### 7.2 Shared turbine rack

Shared conversion can improve expander scale, but it introduces a manifold and fault-propagation problem. The rack must prevent one cartridge from feeding gas or heat into another faulted cartridge. A shared turbine cannot be assumed to “gracefully” accept any number of active pods without a flow-control and isolation model.

Staggered operation extends calendar runtime but does not create energy. It reduces instantaneous power and may improve thermal management; it does not change the total energy per charge.

## 8. Vehicle platform

### 8.1 Vehicle target

The design inputs describe a full-size four-seat shell on a lightweight tubular frame, with approximately 600–700 kg target mass, a 3–5 kWh buffer battery, 4–8 kW continuous cruise power, and 50 mph operation. These are design hypotheses requiring a complete vehicle mass, drag, rolling-resistance, grade, acceleration, braking, thermal, and safety model.

At 80 km/h, aerodynamic power depends primarily on frontal area, drag coefficient, air density, and speed cubed. Reducing mass helps rolling resistance and acceleration, but it does not eliminate aerodynamic power. A full-size vehicle footprint can therefore defeat some of the expected mass benefit.

### 8.2 In-wheel axial-flux motors

Potential benefits:

- Reduced mechanical drivetrain components.
- Independent torque control.
- Packaging space.
- Direct regenerative braking at each wheel.

Required validation:

- Peak and continuous torque/power.
- Motor/inverter efficiency maps, not a single “95%” figure.
- Unsprung mass and suspension response.
- Sealing against water, dust, salt, and impact.
- Brake redundancy and fail-safe behavior.
- Thermal rejection at the wheel.
- Electromagnetic compatibility and high-voltage isolation.

In-wheel motors can increase unsprung mass and wheel vibration. They are not automatically more efficient at the vehicle level.

### 8.3 Hemp/graphene shell

Natural-fiber composites can be useful for panels and energy absorbers, but the source claim that hemp/graphene automatically rivals carbon fiber or creates a crashworthy passenger cell is unsupported. Graphene nanoplatelets do not remove problems of moisture, resin aging, fiber variability, delamination, fire, repairability, joining, and crash-rate behavior.

The initial vehicle shall use a certified occupant cell and crash structure. Hemp-based composites may be evaluated first for noncritical panels, interior components, or secondary absorbers. Structural substitution requires coupon tests, environmental aging, component crash tests, and regulatory approval.

### 8.4 Vehicle safety boundary

A four-seat 50 mph vehicle carrying water-reactive carbide, acetylene generation, a burner, high-temperature loops, pressure boundaries, and a high-speed expander is not a simple L7e or kit-car substitution. Classification and approval depend on jurisdiction. The vehicle program is blocked until the chemical power module has an independent safety case and the chassis has a defined crash-energy architecture.

## 9. Marine, aviation, and submarine variants

- **Boat:** Water provides a possible heat sink, but corrosion, flooding, exhaust, and marine approval remain. This is a separate product.
- **Aircraft/drone:** Combustion requires oxygen; carrying an oxidizer or compressor adds mass and hazard. Passenger or cargo aviation is out of scope.
- **Submarine/AUV:** Combustion requires stored oxidizer and produces exhaust. Pure carbide-hydration heat is too limited for the claimed high-power role without a complete heat/pressure model. Separate AIP analysis is required.

No claim of transferability between these platforms is accepted without a platform-specific mass, energy, safety, and certification model.

## 10. Operating-state model

<!-- Red Grant shadowed Bond the whole train ride — silent, professional, always one carriage back. The state machine is that shadow: it watches the drip so the drip can sleep. -->

The expanded system shall define these states:

1. **Stored:** cartridge dry, inactive, isolated, traceable.
2. **Inserted:** mechanical/electrical identity verified; no activation.
3. **Armed:** all sensors and heat-rejection paths healthy; activation still inhibited.
4. **Startup:** controlled internal activation; burner/ORC unavailable until safe temperatures and pressures are confirmed.
5. **Thermal operation:** chemical heat and any qualified burner operate within measured limits.
6. **Power conversion:** ORC and TEG output is regulated to the buffer bus.
7. **Reduced power:** one or more thermal or conversion paths derated.
8. **Fault isolation:** affected cartridge and loops isolated; no dependence on turbine consumption.
9. **Emergency shutdown:** fuel/water reaction, burner, pumps, and expander enter a qualified safe state.
10. **Cool-down/return:** cartridge remains isolated until service-return criteria are met.

<!-- Kincade defended Skyfall with two shotguns and a knife. The ULP runs the watch on 33 microwatts — and the quench asks for even less than that. -->
### 10.1 Controller hardware (convo3)

The "internal AI" life-support function lands on **ESP32-S3** silicon: dual-core 240 MHz with a ULP coprocessor, ~10 µA deep sleep (~33 µW), ~10–50 mW duty-cycled, ~130–315 mW always-on, ~0.5–1.2 W WiFi bursts. The ULP sentinel watches sensors while the main cores sleep and wakes them on anomaly or control tick — duty cycling is mandatory, since always-on compute would consume ~5.7% of the low-rate bus (~5.3 W) while duty-cycled consumption is <0.2% of the 30 W sustained bus (harness test). Up to three units fit inside a 0.5% parasitic budget for voting/distribution; a fourth exceeds it.

**Independence rule (canon phrasing): "the CaO quench doesn't care what the firmware thinks."** MCU count does not change the safety topology — redundant ESP32s share die, firmware, and power-domain failure modes. The independent shutdown layer remains different physics: analog supervisor IC, hardware watchdog, thermal fuse, mechanical relief, and the quench pouch.

The integer-brain port target exists in the fleet: the 53,888-byte Qstar lattice (`spec007_q_toys.zig`) and `qstar_llm_esp32.wasm` already target this silicon class — a candidate anomaly-scorer without floating point. Adoption is optional; the parasitic bound is not.

## 11. Economic and business model disposition

The design inputs' financial assumptions are not evidence:

- $280 pod COGS.
- $1,199 retail pod.
- $4 sealed cartridge cost.
- $18 cartridge price.
- $6,600 vehicle COGS.
- $22,999 retail price.
- $2–4 million NRE.
- 200–250 vehicle break-even volume.

These omit certification, crash testing, hazardous-goods packaging, liability insurance, warranty reserves, reverse logistics, fluid supply risk, service labor, rejected cartridges, recalls, and end-of-life treatment. They must be replaced by supplier quotations and a bottom-up costed design.

The existing economic assessment found that the CaC₂ charge alone can exceed $1/kWh of electricity under a favorable low-flow TEG scenario. Therefore:

- The product cannot compete as low-cost electricity.
- The viable value proposition, if any, is availability in remote or emergency applications.
- A disposable cartridge creates recurring revenue but also creates recurring hazardous-material obligations and waste.
- A sealed cartridge may improve user safety but increases factory process, packaging, inspection, return, and liability costs.
- A vehicle business cannot be declared profitable until the complete vehicle passes regulatory and crash gates.

## 12. Validation program

### Phase A — non-energetic subsystem validation

- Electrical heater in place of burner.
- Inert thermal cartridges in place of CaC₂.
- Instrumented primary and secondary loops.
- Nonhazardous expander fluid or approved laboratory loop.
- PDRC/radiator comparison under controlled weather conditions.
- TEG and pump parasitic measurements.

### Phase B — sealed cartridge containment

Performed only by a qualified chemical-process laboratory:

- Material compatibility and moisture-ingress testing.
- Pressure/thermal response and relief assessment.
- Residue handling and contamination analysis.
- Independent HAZOP/FMEA.

### Phase C — integrated thermal conversion

- Burner and exhaust system qualified separately.
- ORC pressure and thermal cycle qualified separately.
- Expander containment and overspeed qualified separately.
- Net electrical output measured at the bus over partial-load and fault cases.

### Phase D — modular rack

- Cartridge isolation and manifold fault testing.
- Hot-swap only after thermal and pressure states are proven safe.
- Shared-conversion efficiency measured against independent pods.

### Phase E — vehicle feasibility gate

- Vehicle mass/drag/grade model.
- Battery buffer sizing.
- Suspension and in-wheel motor testing.
- Crash structure and occupant protection.
- Hazardous-fuel crash, fire, submersion, and rescue scenarios.
- Jurisdiction-specific type approval.

## 13. Go/no-go criteria

**Go to the next phase only if:**

- Energy and mass balances close within stated uncertainty.
- The thermal rejection path rejects the full waste heat at worst-case ambient conditions.
- Net bus power remains positive after pumps, controls, generator, and cooling loads.
- Independent containment and shutdown layers exist.
- The selected working fluid has a durable supply and legal/environmental path.
- The system passes a documented safety review.

**No-go conditions:**

- External acetylene venting.
- Reliance on a turbine as a safety barrier.
- Use of PDRC nameplate cooling as the complete condenser.
- Operation of Novec 649 above its critical temperature as an ordinary subcritical ORC.
- Direct-drive of an un-sleeved generator rotor above its magnet-retention screen, or turbine operation at the L0 80k top end without a qualified rotor-dynamics case.
- Path B without rated CF/Inconel sleeve margin plus a containment housing — a 15–30k RPM magnet rotor is a burst hazard, not a bearing problem.
- A cartridge whose headspace cannot accommodate the gas plenum, diaphragm travel, and ~14% solids growth within the qualified envelope.
- A controller-only shutdown path — independent hardware (supervisor, thermal fuse, relief, quench) must not depend on any MCU count.
- An external heat port without per-port isolation and a grade-appropriate connection — no low-grade loop may connect to the hot bus.
- Unvalidated crash structure or fuel vault in a passenger vehicle.
- A business case based only on raw material price and nameplate output.

## 14. Final architecture decision

The design inputs support a **research program**, not the original “global deployment” claim. The recommended first product concept is a professional-service, sealed thermal cartridge feeding a non-combustion thermal test platform. The acetylene burner, Novec ORC, Tesla turbine, PDRC vehicle shell, in-wheel motors, and hemp/graphene structural shell remain separate research tracks until their independent evidence gates pass.

The convo3 walkthrough sharpened the frame: the chassis is a **three-grade heat manifold** (hot oil bus / warm Novec economizer / cold condenser) in which the carbide cartridge is one dispatchable input among many, not the product's identity. The economic assessment already flagged a waste-heat platform as the most defensible successor; the manifold architecture is the engineering form of that conclusion. Within it, the powertrain is documented dual-path — Path A (scroll + direct-drive AFPM, ~412–732 W bus screened) as the flagship, Path B (Tesla + sleeved high-speed generator, ~215–228 W) as the garage-fabricable branch — because the specification is open hardware and builders' tooling differs.

The most defensible near-term value is a controlled investigation of whether chemical heat can justify its containment and service cost in a premium remote-power niche. The design inputs do not yet justify a self-charging family vehicle, consumer disposable cartridge ecosystem, or universal energy standard.

## Sources

- 3M Novec 649 technical data: https://multimedia.3m.com/mws/media/569865O/3m-novec-engineered-fluid-649.pdf
- 3M PFAS manufacturing exit: https://pfas.3m.com/exit-information
- NIST Novec 649 thermodynamic properties: https://www.nist.gov/publications/thermodynamic-properties-111224555-nonafluoro-4-trifluoromethyl-3-pentanone-vapor
- Novec 649 ORC experiment: https://www.mdpi.com/2076-3417/9/9/1865
- PDRC review and cooling-power model: https://par.nsf.gov/servlets/purl/10334493
- Vehicle radiative-cooling study: https://bibliotekanauki.pl/articles/1955001.pdf
- Micro-ORC experimental evidence: https://www.sciencedirect.com/science/article/abs/pii/S0360544214012250
- In-wheel motor review: https://www.mdpi.com/1996-1073/18/6/1521
- Natural-fiber automotive crashworthiness review: https://pmc.ncbi.nlm.nih.gov/articles/PMC11123071/
- L7 quadricycle functional-safety regulation: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32014R0003
- L7 heavy-quadricycle assessment protocol: https://cdn.euroncap.com/cars/assets/euro_ncap_heavy_quadricycles_assessment_protocol_overall_rating_v10_479dc7922b.pdf
- Existing SPEC-007 economic assessment: `spec-007-economic-assessment.en.md`
- Scroll expander measurements: Sanden TRS090 (Energy 2019) https://www.sciencedirect.com/science/article/abs/pii/S0360544219316135 · E15H semi-hermetic ~80% isentropic: same review · ULiège five-expander ORC comparison: https://orbi.uliege.be/handle/2268/239272
- Tesla-turbine experimental review (SLR + DoE, ~14–25% measured cap): https://pure.iiasa.ac.at/id/eprint/18201/1/Influence%20of%20Operational%20Parameters%20on%20the%20Performance%20of%20Tesla%20Turbines.pdf
- High-speed PM machine results: 1 kW @ 500k RPM (ETH) https://www.ams-publications.ee.ethz.ch/uploads/tx_ethpublications/zwyssig_PCC07.pdf · 100 W @ 500k RPM: https://iopscience.iop.org/article/10.1088/0960-1317/16/9/S18 · Capstone C30 (30 kW @ 96k RPM): http://www.advantekinc.com/downloads/spec-sheets/Capstone30SpecSheet.pdf
- PCB-stator axial-flux machines (72–82% measured): https://open.metu.edu.tr/handle/11511/97372
- Carbon-fiber rotor-sleeve practice (ORNL outer-rotor SPM @ 20k RPM): https://www.ornl.gov/publication/mechanical-analysis-carbon-fiber-retaining-sleeve-high-speed-outer-rotor-spm-electric

## Version history

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-05 | Retroactive initial version per OSTF Rulebook Art. VI; content unchanged since dossier acceptance. Bump rules: MAJOR = promoted-claim/number change, MINOR = added analysis, PATCH = editorial/translation fix. |
