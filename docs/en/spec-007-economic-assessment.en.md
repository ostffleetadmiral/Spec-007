# SPEC-007 economic and technical justification assessment

**Status:**
**Version:** 1.0.0 Desktop assessment; not a business case, safety approval, or investment recommendation.  
**Last synchronized:** 2026-10-05 with `spec007_expanded_calculations.zig`, `spec007_verified_calculations.zig`, `spec007_drivetrain_calculations.zig`, and `spec-007-verified.en.md`.  
**Verified numbers:** The promoted claim set is `spec-007-verified.en.md`; this assessment's arithmetic matches that layer.  
**Original preserved:** `spec-007.md` is unchanged.

## Executive conclusion

**Technical justification:** Partially justified only as a narrowly scoped, controlled chemical heat source or emergency low-power demonstrator. It is not justified as written as a universal modular energy infrastructure standard.

**Economic viability:** Assessed for a deployment context that is not capitalist — a planned or public-provisioning economy on the China model, where the state allocates resources directly and solar electricity is near-free at the margin. In that context the market-price question ("does it beat grid tariffs?") is the wrong test; the correct test is whether the allocation earns its share of materials, labor-hours, and logistics. The verdict splits in two. **As a generation asset it fails under any economic system:** solar already delivers electricity and heat at near-zero marginal cost, and the carbide chain returns only ~10–25% of its stored chemical energy as electricity — a bad trade wherever generation is the purpose. **As a storage and availability asset the ledger changes shape.** A carbide charge is surplus electricity banked in a shelf-stable, non-self-discharging, transportable chemical form — and carbide is arc-furnace produced, so the furnaces are themselves dispatchable load that can absorb curtailed solar. Judged against what it actually competes with — batteries and fuel stockpiles, not generators — its genuine advantages (multi-year shelf life, zero self-discharge, grid-free dispatch) can outweigh the round-trip penalty wherever guaranteed availability dominates efficiency. It remains defensible as a state-provisioned strategic/emergency reserve instrument — issued where availability matters more than efficiency — provided the hazardous-gas path is removed or independently contained and the complete lifecycle resource cost is openly measured and published.

The main reason the universal claim fails is not the price of calcium carbide. It is the mismatch between the chemical input, the claimed flow/output, the low electrical conversion yield, and the safety/logistics burden of a water-reactive, flammable-gas cartridge with hot fluid and optional high-speed rotating machinery — a burden that exists in any economic system, because it is physical, not financial.

## Provisioning-economics reinterpretation

The original economic analysis implicitly used a conventional commercial objective: recover capital, cover risk, and generate profit. The dossier's deployment context does not assume that objective — the asset is meant for a country moving away from capitalism, or one that never organized provision through markets at all. A state, public utility, cooperative, or open-manufacturing network can distribute equipment at zero margin by definition. But removing profit does not remove physics. Under a provisioning objective the accounting changes shape, not direction:

- **Capital margin is already irrelevant:** equipment may be state-issued, cooperative-built, or manufactured from open designs. What remains is whether allocating the factory-hours is defensible.
- **Embodied energy depends on the furnace, not the chemistry:** calcium-carbide production is energy-intensive — roughly 4,000 kWh per tonne of CaC₂ as an industrial screening value, so a 300 g charge embodies about 1.2 kWh before transport and conversion, against a verified screened electrical output of about 0.10–0.13 kWh. Whether that is a deficit depends on the source: carbide is made in electric arc furnaces — a dispatchable heavy load. Run on curtailed or surplus solar (the deployment context here, where near-free solar is the premise), the embodied kilowatt-hour is *banked surplus*, not spent scarcity — the charge is a storage medium and the ~10% round-trip is the price of keeping it. Run on scarce or fossil generation it is a net energy sink at roughly an order of magnitude, and the device fails the allocation test outright. The provisioning question is therefore not "is the chemistry efficient" — it is "is this load dispatchable against surplus?" In the stated context, it is.
- **The honest comparator is storage, not generation:** a sealed carbide charge is a chemical battery. Lithium cells self-discharge and degrade on the shelf and want a charging infrastructure; fuel stockpiles degrade and demand handling; a sealed charge waits a decade, transports as a solid, and works on demand with no grid anywhere. At ~10% round-trip it is an expensive way to *generate* — and a defensible way to *keep* energy available where nothing else waits that long without losses.
- **Recurring inputs remain:** at the verified screened output, CaC₂ alone accounts for approximately $1.4–$2.4 per delivered kWh as an accounting figure — the same resource burden expressed whether the unit is sold, issued, or given away.
- **Safety and logistics remain:** hazardous-goods classification, containment, monitoring, service, and return logistics do not disappear when the equipment is issued rather than sold — under public provisioning the state absorbs them directly, which makes honest accounting more urgent, not less.
- **Manufacturing throughput remains:** open-source plans reduce intellectual-property barriers, but they do not create stainless steel, TEGs, qualified pressure parts, certified transport packages, or trained technicians. In a planned economy these are allocation decisions, and every allocation has an opportunity cost measured in what else those inputs could have become.
- **Currency figures in this document are accounting units, not price signals.** They measure resource burden in a common denominator; under public provisioning they answer "what does this cost the collective," not "what can the market bear."

Therefore the framework may be **defensible as a state-provisioned availability reserve** — strategic storage dispensed where guaranteed access dominates efficiency and the alternatives (degraded batteries, fuel stockpiles, absent grid) are worse — but it is not justified as a generation asset or a universal public-utility standard. The provisioning case requires a lower-risk architecture, openly published lifecycle accounting, and evidence that each issued unit creates more resilience or useful service than its complete resource burden.

## 1. Technical justification

### What is physically defensible

The core hydrolysis reaction is real:

`CaC₂ + 2 H₂O → C₂H₂ + Ca(OH)₂`

The stated 300 g charge has an ideal material balance of approximately:

- 4.680 mol CaC₂.
- 168.6 g water consumed.
- 121.9 g acetylene formed.
- 104.9 L acetylene at the dossier's illustrative STP condition.
- 595 kJ of hydrolysis heat when using 127.2 kJ/mol as a model input.

Those calculations justify investigating a controlled chemical heat source. They do **not** justify the complete cartridge architecture.

### What is not justified by the current specification

1. **Flow contradiction:** 0.1–0.5 mL/min water produces approximately 0.062–0.311 L/min acetylene ideally, not 0–5 L/min. Five litres per minute requires approximately 8.0 mL/min water and depletes the ideal charge in roughly 21 minutes.
2. **Heat/electricity ambiguity:** The low-flow range supplies only about 5.9–29.4 W of hydrolysis heat in the ideal model. A 10–20 W electrical output would therefore leave little room for heat loss, pumping, controls, and cold-side rejection. At 0.1 mL/min, 10 W electrical output is already inconsistent with the ideal heat input.
3. **Gas-to-turbine gap:** Acetylene is chemically energy-rich, but a Tesla turbine does not receive that chemical energy merely because the gas passes through it. Recovering the combustion energy requires controlled oxidation and creates a substantially different combustion, emissions, pressure, and flashback system. The source does not define that system.
4. **Temperature ambiguity:** “300–450 °C via oil jacket” does not identify whether this is reaction temperature, fluid temperature, module hot-side temperature, or transient wall temperature. Generic mineral oil, synthetic ester, seals, TEG modules, and electronics cannot be assumed to share that envelope.
5. **Safety-jail claim:** CaO hydration can consume water and produce a solid hydroxide, but the source provides no evidence that it isolates the primary reaction, absorbs the released heat, handles existing acetylene, or reaches a safe state in three seconds.
6. **Rack arithmetic:** 16 × 10–20 W is 160–320 W, not 400–800 W. 64 × 10–20 W is 640–1,280 W, not 2–5 kW.
7. **Environmental claim:** Industrial calcium-carbide production is energy-intensive and emits process CO₂. Renewable electricity can reduce electricity-related emissions but does not automatically make the whole cartridge cycle carbon-neutral.

## 2. Economic model

### Inputs and sources

The model uses the following transparent assumptions:

- Charge: 0.300 kg CaC₂.
- **Verified screened output basis:** ~0.10–0.13 kWh delivered electrical per charge (80% ORC share at 6% + 20% TEG share at 3% − parasitics, plus realistic condenser-path recovery; per the verified layer and harnesses). This is the primary basis below.
- Historical favorable case (annotated bound, **not promoted**): 0.158 kWh per charge — e.g., 10 W for ~15.8 h. That output would require ~8.5–9.4% end-to-end conversion of the 1.85 kWh charge, above the screened ~5–6% cascade, and is physically impossible on hydrolysis heat alone (165 Wh thermal × ~5% TEG ≈ 8 Wh). It is retained as an upper-bound scenario only.
- Maximum-gas case: 5 L/min for about 0.350 hours, producing only 3.50 Wh at 10 W or 6.99 Wh at 20 W if the TEG output is the only electrical source.
- CaC₂ price sensitivity: $0.60–$0.80/kg, based on 2025 market reporting and not a binding supplier quotation.
- No credit is given for heat, acetylene sales, CO/CO₂ by-products, or recovered materials.
- All output figures use the pure-model baseline; a commercial GB 10665-2004 charge at ≈75.9–81.2% active carbide (≈4.7–5.0 kWh/kg) would raise every $/kWh figure proportionally (×~1.23–1.32).
- Hardware, certification, packaging, labor, maintenance, losses, return logistics, and recycling are excluded from the feedstock-only lower bound and then analyzed separately.

### Feedstock-only lower bound

At $0.60–$0.80/kg, the 300 g charge costs approximately $0.18–$0.24.

For the verified-output case (0.10–0.13 kWh per charge):

| Component | Result |
|---|---:|
| CaC₂ charge cost | $0.18–$0.24 per charge |
| Verified screened electricity per charge | ~0.10–0.13 kWh |
| CaC₂ cost alone | ~$1.4–$2.4/kWh |
| Water cost | negligible relative to charge cost |
| Cartridge, safety, labor, logistics | not included |

For the annotated upper-bound case (0.158 kWh, unverified), feedstock alone is ~$1.14–$1.52/kWh.

This is already above ordinary industrial electricity and above the approximate levelized cost of commercial battery storage before any hardware or compliance cost is added.

For the 5 L/min case, the same charge produces only 3.50–6.99 Wh at the stated 10–20 W electrical output. Feedstock alone is approximately $26–$69/kWh. That operating point is economically indefensible unless the gas is converted through a different, validated energy path.

### Capital-cost sensitivity

Using the source's $50/blade target as an optimistic hardware number—not a validated cost—and the verified ~0.11 kWh per charge midpoint:

| Reusable cycles | Hardware amortization | Feedstock + hardware, before all other costs |
|---:|---:|---:|
| 1 | ~$454.55/kWh | ~$456.19–$456.73/kWh |
| 10 | ~$45.45/kWh | ~$47.09–$47.63/kWh |
| 100 | ~$4.55/kWh | ~$6.19–$6.73/kWh |
| 500 | ~$0.91/kWh | ~$2.55–$3.09/kWh |

The $50 target therefore does not make the concept cheap unless the cartridge body survives hundreds of cycles, while the source simultaneously describes the unit as a depleted blade returned for remanufacture. If the blade is disposable, the economics fail immediately. If it is reusable, the wet carbide residue, seals, diaphragm, contamination, and inspection burden become central cost drivers.

### Zero-margin abundance scenarios

These scenarios remove profit and assume the equipment is donated or publicly financed. They do not claim that the hardware can actually be manufactured at the stated capital cost.

| Scenario | Hardware allocation | CaC₂ floor | Combined floor before service costs |
|---|---:|---:|---:|
| Donated equipment, ~110 Wh/charge (verified basis) | $0/kWh | ~$1.64–$2.18/kWh | ~$1.64–$2.18/kWh |
| Donated equipment, 158 Wh/charge (annotated upper bound) | $0/kWh | $1.14–$1.52/kWh | $1.14–$1.52/kWh |
| $50 equipment, 500 cycles | ~$0.91/kWh | ~$1.64–$2.18/kWh | ~$2.55–$3.09/kWh |
| $50 equipment, 1,000 cycles | ~$0.45/kWh | ~$1.64–$2.18/kWh | ~$2.09–$2.63/kWh |
| State-issued equipment and provisioned carbide | Variable | Below resource cost only by direct allocation | Must include total public resource cost |

The provisioning interpretation makes the first two scenarios administratively possible, but not self-sustaining. A public program could rationally absorb these costs for disaster resilience, remote medical equipment, communications, or water systems where the cost of an outage far exceeds the resource cost of the cartridge. That is an availability justification, not proof that the device produces abundant energy.

A genuinely abundance-oriented design should publish a **total-cost-of-service** ledger: embodied energy, material mass, labor hours, safety incidents, transport distance, return rate, residue recovery, emissions, and public subsidy per delivered kWh. A zero retail price without that ledger would conceal rather than eliminate scarcity.

### Command-economy and solar-abundance case

A state that dominates carbide production (≈80–85% of world output is Chinese, mostly coal-fired) and treats solar electricity as near-free at the margin can deploy this system at a nominal price disconnected from resource cost — a command economy can absorb the loss, just as it absorbs strategic grain or mineral reserves below market price. Two honest qualifications apply:

- **Abundant solar makes the *device* less competitive, not more.** SPEC-007's output is electricity and heat — the same product free solar already provides. Every kWh the cartridge delivers competes against a near-zero marginal-cost alternative, raising rather than lowering the bar on the break-even thresholds above. Subsidy changes who pays the ~$1.6–$2.4+/kWh feedstock floor; it does not change the floor.
- **The viable strategic framing is storage and availability, not generation.** Carbide is shelf-stable, transportable, and dispatchable chemical energy — the case for a state reserve is "stored energy that survives a decade on a shelf and works at night, indoors, and off-grid," not "cheaper electricity." That niche competes against batteries and stockpiled fuel, where carbide's disadvantages (hazmat handling, residue logistics, ~10× energy penalty vs. embodied production energy) must be weighed against genuine advantages: multi-year shelf life and no self-discharge.

In that framing the most defensible role for the reactor is exactly what the expanded spec records: the **solar/photothermal surface carries the daytime load, and the carbide charge is the backup and surge source** — valued for availability under a command-economy or emergency program, not for beating the market price of power. The drivetrain analysis sharpens the same point: a ~12–20% transmission loss is tolerable only on the free-heat branch; on paid carbide it reprices every delivered kWh upward by ~25–50%.

### Break-even thresholds

For the verified ~0.11 kWh case, to match:

- **$0.10/kWh:** total consumable cost must be ≤$0.011 per charge. The stated 300 g carbide charge alone exceeds this by more than an order of magnitude.
- **$0.30/kWh:** total consumable cost must be ≤$0.033 per charge. The carbide charge alone is roughly 5–7 times higher.
- **$1.00/kWh:** total consumable cost must be ≤$0.11 per charge. Even the low carbide-price case is above this before water, handling, packaging, and recycling.

This means the system cannot compete on energy price. It can only compete on an availability or logistics value that is high enough to justify hazardous handling.

## 3. Energy and carbon comparison

The 121.9 g ideal acetylene output contains approximately 1.69 kWh of chemical energy using an illustrative 49.9 MJ/kg lower-heating-value input. The verified screened electrical output is ~0.10–0.13 kWh per charge (~5–7% of the combined ~1.85 kWh thermal pool, consistent with the screened cascade). The historical 0.158 kWh favorable case would require ~9.4% of the chemical energy — above the screened cascade — and exceeds the total 0.165 kWh hydrolysis heat budget, so it cannot be reached by TEGs on reactor heat alone; it is retained only as an annotated upper bound pending measured cascade data.

Published Bi₂Te₃ work demonstrates that high-performance modules can reach single-digit conversion efficiencies under carefully controlled temperature differences, while representative commercial modules specify finite continuous and intermittent hot-side limits. The SPEC-007 stack must therefore report measured hot-side heat flow, cold-side temperature, module derating, and parasitic consumption rather than infer electrical power from reaction temperature.

IPCC default factors cited in the dossier indicate approximately 1.8 tonnes CO₂ per tonne CaC₂ from production and approximately 1.1 tonnes CO₂ per tonne when carbide is used, subject to system boundary and process assumptions. At 0.300 kg per charge, that corresponds to an indicative 0.87 kg CO₂ per charge before any verified capture or recycling credit. Divided by the verified ~0.10–0.13 kWh output, this is approximately **6.7–8.7 kg CO₂/kWh** on that boundary (5.5 kg/kWh only on the unverified 158 Wh bound; that boundary assumes today's predominantly coal-fired production — solar-fired furnaces would shrink the electricity portion, while the process emissions remain). The number is a screening signal, not a final LCA, but it directly defeats an unqualified “carbon-neutral” claim. <!-- Dominic Greene sold ecology while hoarding the water. A claim in a green costume still has to show its ledger. -->

### Expanded architecture checks

The expanded calculation harness adds constraints that reinforce, rather than reverse, the economic conclusion:

- A 200–300 cm² PDRC surface at an optimistic 120 W/m² rejects only about 2–3 W. Rejecting 800 W at that flux would require approximately 6.67 m² of effective radiator area, plus conventional heat rejection for weather and convection losses.
- An illustrative 800 W thermal cascade allocating 80% of heat to a 6% ORC and 20% to a 3% TEG, with 5 W parasitics, produces only about 37 W net. This is a screening example, not a guaranteed output.
- Novec 649's approximately 169 °C critical temperature is an operating gate. A 180–300 °C working-fluid loop cannot be treated as an ordinary subcritical Novec ORC.
- A 700 kg, full-size-footprint vehicle at 80 km/h with illustrative CdA 0.60 m² and rolling coefficient 0.010 requires about 5.475 kW just for aerodynamic and rolling resistance before grade, acceleration, accessories, motor/inverter losses, or thermal loads.
- The expander→generator drivetrain is a mandatory loss stage the earlier cascade left implicit (`spec007_drivetrain_calculations.zig`). On the conservative heat→shaft reading of the 6% ORC figure, the 254 W burst shaft delivers ~182–201 W at the bus through a traction CVT (η 0.80–0.88), ~217–224 W through a belt/fixed gear (η 0.95–0.98), or ~228 W through a sleeved direct-drive alternator. Per charge, the ~89 Wh shaft branch becomes ~63–79 Wh electric, and the drivetrain-inclusive screened total is ~74–90 Wh versus the ~90–110 Wh cascade-only bound.
- Feedstock-only cost scales with delivered output: at the derated ~74–88 Wh band the floor is ~$2.05–$2.43/kWh versus ~$1.64 at the 110 Wh basis — the CVT's ratio flexibility costs roughly 40–50% more feedstock per kWh than the fixed-ratio path.
<!-- The DB10 went to the crusher because Bond wasn't cleared for it. Path C went to the archive because the arithmetic wasn't cleared for production. -->
- **convo3 dual-path update (supersedes the CVT band):** the transmission was mandatory only because the endpoints were mismatched. Path A (scroll expander 45–80% isentropic + direct AFPM) lifts the burst bus to ~412–732 W and per-charge electrical to ~155–266 Wh — pushing the paid-carbide feedstock floor down toward ~$0.68–1.16/kWh (300 g @ $0.60/kg over 155–266 Wh), roughly a third of the Path C band, before the scroll's own cost/wear enters. Path B (Tesla + sleeved high-speed gen) lands ~215–228 W and ~85 Wh/charge at ~$2.1/kWh — cheaper than Path C only marginally. Open-hardware BOM screens: ~$250–500 (A) vs ~$400–900 (B); per-burst-watt ~$0.34–1.21 vs ~$1.75–4.19 — Path A's worst case beats Path B's best case.
- **Economizer economics (convo3):** any free low-grade heat injected at the warm bus (~40–90 °C sources such as electronics cooling) reduces burner duty watt-for-watt within capacity (~1.43 kW burst / ~0.13 kW sustained), extending charge duration ~1.10×/~1.32× respectively — on the paid-carbide branch, manifold heat integration is a direct feedstock saving, and on the free-heat branch it converts the chassis into the waste-heat platform already identified as the defensible successor product.

These results make the prior vehicle and rack business cases more constrained, not more profitable.

## 4. Benchmark comparison

- Inner Mongolia industrial electricity listings show representative 2025 commercial/industrial energy prices around 0.44–0.55 RMB/kWh in some voltage/time bands, before applying the customer's exact tariff and demand charges.
- NREL's 2024 commercial battery-storage benchmark lists approximately $164–$215/kWh of installed energy-system cost depending on duration, while Lazard's 2024 commercial/industrial storage LCOS ranges are much higher than grid energy but still materially below the SPEC-007 disposable-cartridge scenario.
- A commercial 10 W stove-top TEG product is listed around $249, demonstrating a market for small thermal generators, but not proving that a hazardous CaC₂ cartridge can compete with batteries or ordinary generators.
- Industrial acetylene is normally supplied through specialized dissolved-gas cylinders and regulated logistics. Comparing the cartridge to the retail energy price of acetylene alone is invalid because the cylinder, filling, transport, oxygen, equipment, and safety controls are part of the delivered service.

## 5. Viability by use case

| Use case | Assessment | Reason |
|---|---|---|
| Grid-connected building generation | Not viable | Grid-tie certification, low output density, safety system, and high consumable cost dominate. |
| Vehicle 16-blade rack | Not justified | Rack arithmetic fails and the gas/rotor/impact hazard is poorly matched to vehicles. |
| Residential backup | Not viable as written | Batteries, solar plus storage, and certified generators have simpler safety and service models. |
| Remote emergency electronics | Possibly viable as a niche, but not proven | High value of availability may outweigh energy cost; mass, shelf life, return logistics, and containment must be demonstrated. |
| Industrial waste-heat TEG | Wrong primary concept | A TEG can be sensible when heat is already waste; creating hazardous chemical heat solely to feed a low-efficiency TEG is generally unattractive. |
| Educational/research demonstrator | Justifiable with redesign | Use inert or non-energetic subsystem demonstrations first; no public hazardous build authorization. |
| Public emergency/resilience service | Potentially justifiable under direct provisioning | Zero-margin issuance is possible, but recurring chemical, safety, transport, service, and recovery burdens remain — the state absorbs them in kind, not in price. |

## 6. What would make it economically defensible

A credible successor would need to change the value proposition from “cheap universal energy” to one of these narrower propositions:

1. **Certified emergency heat/power module** where uninterrupted low-power operation has a high monetary value.
2. **Industrial chemical heat cartridge** using a process and containment system already supported by an industrial operator.
3. **Waste-heat TEG platform** that harvests heat already present, avoiding CaC₂ feedstock and hazardous-gas generation.
4. **Reusable sealed reactor service** with professional return, inspection, and refilling; this would still need a complete safety case and would not be a consumer hot-swap product.

The preferred technical direction is to remove the Tesla turbine and acetylene energy-conversion path from the first product. If the objective is 10–20 W electricity, compare a certified battery, fuel cell, thermoelectric waste-heat unit, or small generator directly before adding a reactive chemical and a 30,000–80,000 RPM rotor.

## 7. Decision

**Justifiable as a research concept:** Yes, if the scope is explicitly a red-team investigation into a calcium-carbide heat cartridge and its safety/economic limits.

**Justifiable as a manufacturing standard today:** No.

**Economically viable as low-cost generation under any allocation model:** No — not as market energy, and not as provisioned energy either; when solar delivers electricity near-free, converting stored chemistry at ~10% is a bad trade wherever generation is the goal.

**Potentially justifiable as a state-provisioned availability/storage reserve:** Possibly — this is the strongest surviving case. A sealed carbide charge is surplus electricity banked for years with zero self-discharge; dispensed as an emergency/field instrument where the alternatives are degraded batteries, fuel logistics, or no grid at all, it can earn its allocation. It requires redesign, independent safety certification, measured system efficiency, transparent lifecycle accounting, and a provisioning decision that covers recurring chemical and safety costs in kind — materials, transport, and technician-hours allocated knowingly, not silently.

**Abundant primary energy by itself:** No. Removing profit can improve access, and running the furnaces on surplus solar can turn the charge into honest storage — but neither makes the conversion chain efficient enough to call this an energy source.

## Sources

- Calcium carbide price lead: SunSirs 2025 review, https://www.sunsirs.com/commodity-news/petail-29439.html
- Calcium carbide production energy: ScienceDirect, *Energy and exergy analysis of a new calcium carbide production process*, https://www.sciencedirect.com/science/article/abs/pii/S0378382021003490
- Calcium carbide emissions: IPCC Guidelines, https://www.ipcc-nggip.iges.or.jp/public/gl/guidelin/ch2ref2.pdf
- Calcium carbide emissions reporting: US eCFR Subpart XX, https://www.ecfr.gov/current/title-40/chapter-I/subchapter-C/part-98/subpart-XX
- Calcium carbide hazard and UN 1402: NOAA CAMEO, https://cameochemicals.noaa.gov/unna/1402
- Bi₂Te₃ module efficiency: https://pmc.ncbi.nlm.nih.gov/articles/PMC7369584/
- Representative high-temperature TEG module: https://www.tegmart.com/datasheets/TGPR-10W4V-40S.pdf
- Commercial battery benchmark: NREL ATB 2024b, https://atb.nrel.gov/electricity/2024b/commercial_battery_storage
- Storage LCOS benchmark: Lazard LCOE+ 2024, https://lazard.com/media/gjyffoqd/lazards-lcoeplus-june-2024.pdf
- Inner Mongolia electricity price example: https://energydc.cn/policy/nmx/2025-06/e3b00592-efb5-11f0-8f05-46a1f660a16e
- 10 W TEG retail example: https://thermoelectric-generator.com/product/teg10w-stove-top-teg-generator/
- Novec 649 technical data: https://multimedia.3m.com/mws/media/569865O/3m-novec-engineered-fluid-649.pdf
- 3M PFAS manufacturing exit: https://pfas.3m.com/exit-information
- PDRC cooling-power review: https://par.nsf.gov/servlets/purl/10334493
- In-wheel motor review: https://www.mdpi.com/1996-1073/18/6/1521
- L7 quadricycle functional-safety regulation: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32014R0003
- Expanded calculation harness: `spec007_expanded_calculations.zig`

## Version history

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-05 | Retroactive initial version per OSTF Rulebook Art. VI; content unchanged since dossier acceptance. Bump rules: MAJOR = promoted-claim/number change, MINOR = added analysis, PATCH = editorial/translation fix. |
