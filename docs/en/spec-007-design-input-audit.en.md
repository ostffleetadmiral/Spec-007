# SPEC-007 design-input audit

This audit records how the design ideas from classified OSTF design inputs were classified when expanded into `spec-007-expanded-engineering-spec.en.md`.

## Source continuity and provenance

The design inputs are classified OSTF records (per SPEC-004) and are not part of the public repository face. They contain design discussion and a small number of chemical equations, but no external URLs, DOIs, standards identifiers, manufacturer datasheets, or reproducible simulation inputs. Therefore:

- An evidence-grade layer now exists: `spec-007-claim-verification.en.md` grades each major design-input claim as VERIFIED, VERIFIED-WITH-CORRECTION, EXTRAPOLATION, UNSUPPORTED, or CONTRADICTED, with primary/institutional sources where available.
- Verified background: China's PV/wind manufacturing and deployment dominance (IEA/IEA PVPS/IEA Wind), ~80% share of global calcium-carbide production, ~3,000 kWh/t production energy, sludge recycling chemistry, negative-price/curtailment market data, and Invention Secrecy Act history/statistics.
- Corrected claims: carbide energy density is roughly 5–6 kWh/kg, not "~12 kWh/kg"; China cumulative PV is ~1,464 GW end-2025 (the source's 850 GW is outdated low, not wrong direction); wind is ~562 GW end-2024, not ~450 GW.
- The design inputs' ~65 W / 1 kg / 4 h screening estimate implies ~6.6% end-to-end conversion — near the verified ~5–6% screened cascade band, but remains unmeasured and is not promoted. The inputs' three-tier TEG harvest is bounded by placement ΔT: exhaust-boundary TEGs can approach module ratings, while reactor-wall and condenser stages run at ~30–70 K ΔT and recover roughly 0.5–1.5%. The inputs also imply a small gas buffer between generator and burner (throttle mismatch, cooldown carryover) — recorded as an open design target.
- Novec 649 subcritical ORC gate (~169 °C critical) and PDRC panel-area limits are enforced by `spec007_expanded_calculations.zig`.
<!-- Columbo looked like the smuggler and turned out to be the only honest man on the island. The classified inputs are filed suspect and read honest — the audit exists to tell the difference. -->

- Political, military, and leadership narrative is classified under SPEC-004 ("7q"), retained only in the classified design inputs, and must not become engineering requirements.

- Design-input text is treated as a design hypothesis or user requirement, not as independent evidence.
- Chemical and safety claims are carried forward only where they are supported by the research dossier's external sources or by the executable calculation harness.
- Numerical claims from the design inputs are preserved as historical inputs but are not promoted to requirements unless they pass conservation, thermal, mechanical, regulatory, and economic gates.
- The authoritative continuity chain is: original `spec-007.md` → faithful translations → research dossier/economic assessment → expanded engineering specification → calculation harnesses.
- Current external evidence is listed in `spec-007-research-dossier.md`, `spec-007-economic-assessment.en.md`, and the Sources section of `spec-007-expanded-engineering-spec.en.md`.

| Design-input idea | Classification | Required correction or evidence |
|---|---|---|
| Hours/days of CaC₂ gas release | Conditional | Lower average rate, larger/multiple charges, and complete water/gas balance. |
| Acetylene combustion provides the main heat | Physically plausible | Requires qualified burner, oxygen/air control, exhaust, CO/NOx and flashback controls. |
| Three independent harvesting tiers | Misleading framing | All tiers share one finite heat budget; model heat allocation and parasitics. |
| PDRC maintains a very cold condenser | Conditional | Weather, area, convection, solar load, humidity, and conventional radiator must be modeled. |
| 200–300 cm² PDRC rejects main waste heat | Contradicted by scale | Area is only 0.02–0.03 m²; expected cooling is a few watts to low tens of watts in favorable conditions. |
| Novec 649 is the safest/best ORC fluid | Unproven | Critical temperature is ~169 °C; supply and PFAS lifecycle are material risks. |
| Novec stability above 300 °C | Misapplied | Chemical stability in a dry sealed condition is not the same as allowable two-phase ORC operation. |
| Dual heat exchanger solves thermal limits | Conditional | It reduces coupling but adds pumps, seals, pressure boundaries, and heat-transfer losses. |
| Tesla turbine is durable and contamination-tolerant | Unverified | Micro-scale efficiency, fouling, overspeed, balance, and containment require testing. |
| 65 W from 1 kg over 4 hours | Not established | Prior estimate double-counts/underdefines energy flows and lacks net-output measurements. |
| 5.5 kg / 30×20×35 cm system | Unsupported | Missing containment, exhaust, radiator, insulation, controls, service clearances, and crash structure. |
| 16 pods yield ~1 kW | Contradicts original scaling | Original 10–20 W/pod implies 160–320 W; higher output needs new evidence. |
| Sequential pods extend runtime | Physically plausible | Extends runtime at lower power; does not increase total charge energy. |
| Shared turbine improves scale efficiency | Conditional | Must include manifold isolation, part-load behavior, and fault propagation. |
| 6 kW LEV generator | Unverified | Requires a new energy model and much larger reactor/heat-rejection system. |
| 50 mph ultra-light family vehicle | Conditional | Requires drag, rolling, grade, acceleration, battery, thermal, and crash models. |
| In-wheel axial motors are 95%+ and more efficient overall | Overstated | Motor maps and vehicle-level losses required; unsprung mass and sealing are major trade-offs. |
| Hemp-graphene shell is crashworthy | Unsupported | Begin as noncritical panel material; occupant structure requires crash and aging evidence. |
| Disposable cartridge eliminates safety issues | False | It moves hazards to factory, transport, service, return, and end-of-life operations. |
| $4 cartridge cost / $18 sale price | Unsupported | Missing certification, packaging, labor, rejection, logistics, and recycling costs. |
| $6,600 vehicle COGS / 71% margin | Unsupported | No supplier quotations, tooling, compliance, warranty, crash testing, or service model. |
| Boats are naturally advantageous | Conditional | Water cooling helps but marine corrosion, flooding, exhaust, and approval remain. |
| Aircraft application has energy-density advantage | Conditional but out of scope | Oxygen/oxidizer, crash, fire, and certification burdens dominate. |
| Submarine application can avoid combustion | Unverified | Hydrolysis heat budget and pressure-hull heat rejection must be modeled; no high-power claim follows. |
| Sealed carbide cartridge is safer than a gasoline tank or Li-ion pack | Partially supported, unverified | Plausible elements: fuel is inert solid until wet, per-pod inventory is small and bounded (~1 kg, ~350 L gas if flooded), buoyant gas dissipates rather than pooling. Unverified: comparative crash, submersion, and fire-scenario analysis is required; a vented acetylene cloud near ignition sources is itself a severe hazard. Comparative safety cannot be asserted as a claim. |
| Axial-flux PM motor doubles as the generator | Verified practice | AFPMSGs are standard direct-drive wind/regen hardware; the specific machine still needs an efficiency map and thermal data. |
| Tesla turbine sweet spot is 15–30k RPM | Consistent with measured literature | Hoya & Guha (IMechE 2009) measured ~25% at 25k RPM; sits below the L0 30–80k band, and the ρv² rotor-stress screen supports the lower band (harness). |
| Axial generator safe window is 3–5k RPM | Reasonable screening bound | Rotor-design dependent; the ρv² magnet-retention screen passes at 5k on a 150 mm rotor (~12 MPa) but fails at 20k (~185 MPa) without a sleeve (harness). |
| 4:1–6:1 reduction bridges turbine to generator | Conditionally correct | Covers the convo band only if the generator sweeps its full 3–5k window; a fixed 4k setpoint needs a 3.75–7.5 sweep; the L0 80k top end needs ~26.7:1 — outside any single-stage CVT (harness). |
| Torque multiplies T_out = T_in·R·η | Verified mechanics | Harness-enforced; power conserved minus transmission loss. |
| Planetary traction CVT runs η ~80–88% | Consistent with literature | Creep/spin losses documented in traction-drive research; sustained 20k+ RPM input needs active traction-fluid cooling. |
| Timing belt / fixed planetary runs η ~95–98% | Verified range | Preferred for net output where ratio flexibility is not needed. |
| "20% drivetrain loss is economically viable" | Conditional | True only on free-heat input (solar roof ~1.6 kW bound, waste heat); on paid carbide it raises the feedstock floor to ~$2.05–2.43/kWh vs ~$1.64 (harness). |
| Drivetrain loss heat pipes into the TEG/TEC/PDRC/PV system | Legitimate mandatory-flow path | Recovery is real but sub-watt: ~30–50 W of CVT loss at burst, ~50–80 K casing ΔT → ~0.3–0.7 W recovered (~1–1.5% of the loss). The value is shared rejection plumbing (+~1% on the ~5 kW budget), not harvested watts (harness). |
| High-speed flexible couplings and ceramic hybrid bearings required | Sourced practice | Needed above ~15k RPM; vendor L10 life and misalignment ratings required before any build. |
| CVT ratio sweep relieves turbine startup torque | Physically plausible | Boundary-layer turbines stall under early load; transient spool/stall model required — not computed in this harness. |
| ~1 kg pop-can cartridge holding CaC₂ + water pouch + CaO pouch | Conditional | Mass floor lands ~1.18 kg (1.1–1.3 kg realistic); the deeper constraint is volume — a 50×200 mm/2 mm envelope holds ~332 mL against ~320 mL of contents, leaving ~12 mL (<4%) headspace for the gas plenum, plus ~14% solids growth to Ca(OH)₂ absorbed by bed porosity (harness). Powder-bed packing verification or envelope growth required. |
| Internal AI running "life support" for the whole system | Consistent with architecture | Maps to the §10 operating-state machine; must stay parasitic-bounded and cannot be the sole safety path — independent hardware shutdown required. |
| ESP32-S3 controllers (possibly multiple) | Verified practice | Duty-cycled ULP sentinel runs ~10–50 mW — <0.2% of the 30 W sustained bus; up to three units fit inside a 0.5% parasitic budget (harness). Always-on compute at the low duty point would cost ~5.7%, so duty cycling is mandatory. Same-die redundancy ≠ independent safety: analog supervisor, thermal fuse, and the CaO quench remain hardware functions. |
| Briefcase slab burner at low gas rates | Verified duty point | Converges on the promoted ~530 W / ~2.65 kW/m² broad-area figure; two ceilings apply — slab ≤~300 °C (TEG module rating), Novec ≤150 °C (169 °C critical gate). |
| Transformer-oil loop between burner and Novec | Verified-with-correction | Matches the canonical dual-loop (§4.2→§4.3). Correction: the oil is a hot bus at its own fluid-rating ceiling (~150–250 °C bulk), not a temperature gearbox; the evaporator draw is what cools it. 300–450 °C oil remains excluded. |
<!-- Silva hid a virus inside headquarters itself. The convos hid a three-bus manifold and an unnecessary transmission — the audit found both. -->
| Heat-exchanger manifold accepts any external heat source (e.g. PC cooling) | Verified architecture, bounded | Formalized as a three-grade manifold: hot oil bus (~150–250 °C), warm Novec economizer (~40–90 °C), cold condenser (~30–40 °C). Low-grade sources can only enter at the economizer — heat does not flow uphill into the hot bus. Economizer capacity ~1.43 kW at burst / ~0.13 kW sustained (harness); additive input heat enlarges the rejection budget. |
| Scroll expander + direct-drive AFPM (Path A) | Sourced, promoted as flagship | Measured scroll isentropic efficiency 45–80% at our evaporator band (Sanden TRS090 ~45% @ ~650 W shaft; E15H-class ~80% @ 120–140 °C) → ~458–814 W shaft → ~412–732 W bus. Hermetic scroll housings allow zero rotating seals (harness). |
| Tesla turbine + sleeved high-speed PM generator (Path B) | Sourced, conditional | High-speed PM machines exist far above 3–5k RPM (100 W @ 500k RPM in 3 cm³; Capstone 30 kW @ 96k RPM). ~215–228 W bus; a compact 50 mm rotor keeps hoop stress ~46 MPa at 30k RPM (harness); CF sleeve + containment mandatory — rotor-burst hazard class. |
| Tesla + transmission chain (Path C) | Superseded | Retained in the harness and archive as the historical record; the transmission existed only to marry mismatched endpoints. |
<!-- Elektra King presented as the hostage. "Sealed is safer" presents as the safety feature. Same trick — check who benefits before you trust the framing. -->

## Corrected high-level conclusion

The design inputs contain useful architectural hypotheses, especially separation of chemical, thermal, conversion, and user interfaces. They also contain repeated optimism errors: nameplate power treated as net power, radiative cooling treated as an unlimited cold sink, Novec's dry thermal stability treated as an ORC operating limit, and preliminary cost guesses treated as margins.

The expanded architecture is suitable for a staged research program. It is not yet justified as a product, vehicle, or profitable cartridge ecosystem.
