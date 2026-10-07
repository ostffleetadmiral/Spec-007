# SPEC-007 engineering revision (red-team draft)

**Status:**
**Version:** 1.0.0 Desktop feasibility and safety review draft — **not approved for construction or deployment**  
**Baseline:** `spec-007.md` (preserved unchanged)  
**Verified numbers:** All promoted numeric claims must match `spec-007-verified.en.md`; anything else in this document is evidence trail, not a promoted claim.  
**Related faithful copies:** `spec-007.en.md`, `spec-007.zh-Hant.md`

## 1. Purpose and evidence rules

This document converts the concept into a reviewable engineering target without claiming that the concept is presently feasible or safe. It is deliberately separate from the faithful translations.

Each item is classified as one of:

- **Calculated:** follows from stated values and a documented model.
- **Sourced:** supported by an authoritative standard, manufacturer datasheet, government publication, or peer-reviewed source under stated conditions.
- **Design target:** a proposed value requiring engineering validation.
- **TBD:** insufficient information for a defensible value.
- **Blocked:** unsafe or contradictory until a qualified safety review resolves it.
- **Rhetorical:** cultural, political, fictional, or mission language rather than a physical requirement.

No status in this file constitutes a pressure-vessel approval, hazardous-materials authorization, electrical certification, grid interconnection approval, or permission to manufacture.

## 2. Red-team disposition summary

| Source claim | Review result | Reason |
|---|---|---|
| 300 g CaC₂ charge | Calculable but hazardous | Water-reactive material; purity, pellet size, impurities, and containment are unspecified. |
| 0.1–0.5 mL/min water feed | Contradicts stated 0–5 L/min gas range | Ideal stoichiometry gives approximately 0.062–0.311 L/min acetylene. |
| 5 L/min acetylene | Design target only | It would consume the ideal 300 g charge in approximately 21 minutes and requires a substantially higher water feed. |
| 300–450 °C oil jacket | Blocked | Working-fluid, pressure, flash/fire, seal, and material limits are not established. |
| 8–12 Bi₂Te₃ modules at 10–20 W | Plausible only as a heat-flow design hypothesis | Requires hot-side/cold-side temperatures, derating, contact resistance, and heat rejection evidence. |
| 30,000–80,000 RPM Tesla turbine | Blocked | Rotor containment, overspeed behavior, bearings, gas quality, nozzle conditions, and measured efficiency are absent. |
| 3-second solidification | Unverified and safety-critical | No mass-transfer, heat-transfer, sensor-latency, or full-scale test evidence. |
| UN 1402 compliance | Incomplete claim | UN 1402 is a dangerous-goods identification/classification pathway, not complete product certification. |
| Carbon-neutral recycling | Unproven conditional claim | Requires full electricity, carbon feedstock, heat, transport, yield, and CO/CO₂ accounting. |
| <$50 per blade | Unverified | Does not include hazardous packaging, containment, sensors, certification, testing, reverse logistics, or recycling. |
| Global deployment authorized | Rejected for this revision | Jurisdictional certification and independent safety review are not present. |

## 3. Safe system boundary

The desktop model covers stoichiometry, conservation checks, non-hazardous parameter sweeps, scaling arithmetic, and evidence classification. It does **not** prescribe an open-shop acetylene generator, combustion system, pressure vessel, high-speed rotor, or test procedure.

Any physical work would require, at minimum:

1. A qualified chemical-process and rotating-machinery design review.
2. A formal HAZOP/FMEA and independent pressure/containment assessment.
3. A controlled laboratory with gas detection, ventilation, ignition control, remote operation, and emergency response.
4. Jurisdiction-specific hazardous-goods, machinery, electrical, EMC, and installation approvals.
5. A staged test plan starting with inert substitutes and non-energetic coupons.

## 4. Revised system requirements and gates

### 4.1 Cartridge

- The 50 mm × 200 mm envelope is a **design envelope**, not a validated package volume.
- The mass/volume budget shall include shell, end closures, dry carbide, void fraction, water reservoir, secondary containment, thermal interface, insulation, sensors, labels, and connectors.
- CaC₂ purity and impurity profile shall be specified by certificate of analysis. Water ingress during storage and transport shall be treated as a credible initiating event.
- The cartridge shall have a defined safe state that does not depend solely on a crush sensor, rupture diaphragm, or turbine consumption.

### 4.2 Gas and pressure boundary

- The gas path must be treated as a flammable-gas system with backflow, ignition, flashback, blockage, and leak hazards.
- Pressure, relief, temperature, gas composition, and allowable residence time are **TBD** pending a qualified process design.
- “Consumed immediately by the turbine” is not a safety function. Independent isolation and detection are required.
- The 6 mm port and dry-break coupling require compatibility, pressure, flow, leakage, and ignition-source testing under the selected jurisdiction's standards.

### 4.3 Thermal system

- “300–450 °C” must be split into reaction temperature, jacket-fluid temperature, hot-side interface temperature, cold-side temperature, external surface temperature, and transient maximum.
- Mineral oil and synthetic ester are not interchangeable by name. Each candidate requires a datasheet-based temperature, fire-point, oxidation, compatibility, pressure, and aging assessment.
- No 300–450 °C continuous operation is accepted for a fluid or TEG without a manufacturer-rated operating envelope and independent thermal-cycle evidence.

### 4.4 Electrical system

- The 10–20 W output is a design target pending a complete thermal resistance and heat-rejection model.
- The 50 W thermal-interface claim is not equivalent to 50 W electrical output.
- Series/parallel topology, output voltage, short-circuit behavior, isolation, over-temperature protection, connector derating, and USB-C PD conversion are TBD.
- A 16-cartridge rack scales the stated single-cartridge range to 160–320 W, not 400–800 W, unless an additional source or a higher validated cartridge output is identified. A 64-cartridge rack scales to 640–1,280 W, not 2–5 kW, under the same stated range.

### 4.5 Rotating machinery

- The host Tesla turbine is optional and must not be a required safety barrier.
- Rotor speed is a design target only. Overspeed containment, balancing, critical speeds, bearing loads, fatigue, seal performance, generator coupling, and fragment protection require analysis and testing.
- ISO 1940-1 describes balance-quality requirements for rigid rotors; citing G2.5 does not by itself establish a safe rotor design or acceptance test for this assembly.
- A passive, non-rotating gas-energy conversion path should be evaluated before accepting a high-speed turbine in a portable or building product.
- **Quantified bounds (drivetrain harness):** the 50 mm disc pack reaches a thin-ring ρv² stress of ~351 MPa at the stated 80,000 RPM top end — above the ~205 MPa annealed-304 yield point (solid-disc bound ~145 MPa, with bore hoop concentration unresolved). The low band (~30k RPM, ~49 MPa) is the defensible operating region pending a qualified rotor-dynamics case.
- **Speed bridge is a choice, not a mandate:** an un-sleeved axial-flux generator rotor screens at ~12 MPa at 5,000 RPM but ~185 MPa at 20,000 RPM on a 150 mm rotor — which *either* forces a transmission **or** defines the two direct-drive paths now screened: **Path A** replaces the expander (scroll at 2–6k RPM, measured 45–80% isentropic at this band, ~412–732 W bus) and **Path B** sleeves the generator (50 mm magnet rotor → ~46 MPa hoop at 30k RPM, inside a ~800 MPa CF-sleeve screen; ~215–228 W bus). The Tesla+transmission chain (~182–224 W) is superseded. `spec007_drivetrain_calculations.zig` enforces all three.
- **Path B shifts the hazard, it does not remove it:** a sleeved 15–30k RPM magnet rotor is a rotor-burst containment problem — rated CF/Inconel sleeve margin, containment housing, ISO 1940-class balance, and dual overspeed trips are mandatory. Scroll seizure at 4k RPM (Path A) is a rebuild; rotor burst is a shrapnel event.
- **Transmission fault is a new hazard path:** ratio-control failure or belt/traction loss can back-drive or overspeed either rotor; independent overspeed trips on both shafts and a generator-side brake are required.

## 5. Safety-gate matrix

| Gate | Required evidence | Current status |
|---|---|---|
| Chemistry | Verified reaction, impurity profile, heat/gas yield bounds | Partially calculated; source and impurity review required |
| Primary containment | Pressure/thermal/mechanical design with independent review | Blocked |
| Secondary containment | Demonstrated response to water ingress, impact, and blocked outlet | Blocked |
| Shutdown | Independent detection and isolation; not turbine-dependent | Not defined |
| Thermal | Transient model, material compatibility, fire analysis, cycle testing | Blocked |
| TEG | Current datasheets and measured system-level output | Unverified |
| Rotor | Rotor dynamics, containment, overspeed, balance verification | Blocked |
| Transport | Jurisdiction-specific packaging and labels for the assembled article | Incomplete |
| Recycling | Mass/energy/carbon balance and controlled industrial process | Unverified |
| Manufacturing | Process capability, inspection, traceability, nonconformance plan | Unverified |
| Deployment | Independent certification and site approval | Rejected at current evidence level |

## 6. Required instrumentation for any future qualified test program

The following are measurement requirements, not build instructions: calibrated temperature sensing at all thermal boundaries; pressure measurement and independent high-high shutdown; gas composition and leak detection; flow measurement; electrical voltage/current/power; vibration and speed monitoring; containment-state logging; synchronized data acquisition; and emergency-state recording. Sensor ranges, sampling rates, hazardous-area ratings, and calibration intervals must be selected by the responsible laboratory.

## 7. Acceptance criteria to be defined before physical testing

- Conservation of mass for CaC₂, water, acetylene, Ca(OH)₂, and impurities.
- No uncontrolled gas release in normal, blocked-outlet, water-ingress, impact, thermal runaway, or power-loss scenarios.
- Defined maximum pressure and temperature with independent protection layers.
- TEG output measured at specified hot/cold temperatures and after thermal cycling.
- Rotor operation, if retained, demonstrated inside rated containment with overspeed protection and vibration limits.
- Safe storage, transport, return, residue handling, and incident-response procedures.
- Traceable inspection and failure reporting for every cartridge.

## 8. Engineering decision

**SPEC-007 is not ready for manufacturing or global deployment as written.** The immediate technically defensible deliverable is a research and validation program. The strongest first redesign direction is to separate the chemical cartridge, hazardous-gas handling, thermal-electric converter, and host power electronics into independently reviewable subsystems, then reconsider whether a high-speed Tesla turbine is necessary at all.

## Version history

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-05 | Retroactive initial version per OSTF Rulebook Art. VI; content unchanged since dossier acceptance. Bump rules: MAJOR = promoted-claim/number change, MINOR = added analysis, PATCH = editorial/translation fix. |
