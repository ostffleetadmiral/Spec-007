# SPEC-007 claim verification: design-input evidence grades

**Purpose:** Distinguish verified facts from extrapolations and unsupported narrative in the classified OSTF design inputs (SPEC-004; not public).
**Governance:** Promoted claims live exclusively in `spec-007-verified.en.md`; executable checks live in the three `spec007_*_calculations.zig` harnesses.  
**Grade scale:** VERIFIED (primary/institutional source) · VERIFIED-WITH-CORRECTION · EXTRAPOLATION (plausible inference, not measured) · UNSUPPORTED · CONTRADICTED.

## 1. China renewable energy leadership

| Design-input claim | Grade | Finding |
|---|---|---|
| China dominates solar panel manufacturing (~80%) | VERIFIED | IEA Solar PV Global Supply Chains: China's share in all key manufacturing stages exceeds 80%; polysilicon and wafers were projected above 95% under then-planned capacity. https://www.iea.org/reports/solar-pv-global-supply-chains/executive-summary |
| China has ~850 GW solar installed | VERIFIED-WITH-CORRECTION (outdated low) | IEA PVPS Snapshot 2026: China cumulative PV was approximately 1,048 GW at end of 2024 and approximately 1,464 GW at end of 2025, with 415 GW added in 2025 alone (~60% of global annual additions). https://iea-pvps.org/wp-content/uploads/2026/04/Snapshot-of-Global-PV-Markets-2026.pdf |
| China has ~450 GW wind installed | VERIFIED-WITH-CORRECTION (outdated low) | CWEA/IEA Wind annual report: 561.53 GW cumulative at end of 2024 (about 48% of world total), with 87.25 GW new in 2024 (about 70% of global additions). https://iea-wind.org/wp-content/uploads/2025/12/Excecutive.Summary.2024_Final.pdf |
| Three Gorges Dam is 22.5 GW | VERIFIED | Official operator and USGS sources: 22,500 MW total installed capacity. https://www.usgs.gov/special-topics/water-science-school/science/three-gorges-dam-worlds-largest-hydroelectric-plant |
| China has record renewable curtailment ("stranded energy") | VERIFIED | Reuters/GEM-CREA report: China curtailed an estimated 360 TWh of clean power in H1 2026; NEA-published rates reached 8.6% solar / 9.1% wind in H1 2026, rising year over year. https://uk.marketscreener.com/news/china-leads-wave-of-clean-power-wastage-as-grids-globally-hit-limits-ce7859dfd088f326 |
| China is "both the largest renewable builder and largest emitter" | VERIFIED (framing) | Consistent with IEA/country statistics; exact ranking of "largest emitter" is well established in public data. |
| China makes ~80% of solar panels, ~60% of wind turbines | VERIFIED-WITH-CORRECTION | Solar: verified 80%+ for key manufacturing stages (IEA). Wind turbine share figures vary by metric and year; treat 60% as approximate industry framing, not a single regulated statistic. |

## 2. Calcium carbide industry

| Design-input claim | Grade | Finding |
|---|---|---|
| China produces ~80% of world calcium carbide | VERIFIED | Industry compilations place China's share at about 80%; SunSirs 2025 review reports 38–40 Mt annual production and 42 Mt/y effective capacity, concentrated in Northwest provinces. https://www.sunsirs.com/commodity-news/petail-29439.html |
| Carbide production needs ~3 kWh/kg (3,000 kWh/t) | VERIFIED | Chinese policy/market sources routinely cite ~3,000 kWh per tonne; a 90 MW furnace paper reports ~3.0 MWh/t specific consumption. total-process analyses quote ~4,000 kWh/t. Dossier consistently treats 3–4 MWh/t. |
| Commercial carbide gas yield ~285–305 L/kg | VERIFIED (commercial datasheet figures) | Industrial suppliers (e.g., TYWH) specify 285–305 L/kg at 20 °C / 101 kPa per GB 10665-2004. Pure theoretical yield is ≈349 L/kg at 0 °C STP and ≈375 L/kg at the 20 °C rating condition; the implied active-carbide fraction at the rated condition is ≈75.9–81.2%. |
| 1 kg carbide stores "~12 kWh/kg" | CONTRADICTED | Verified figure is ~**6.2 kWh per kg** pure carbide: 5.63 kWh acetylene chemical energy (0.406 kg at 49.9 MJ/kg LHV) plus 0.55 kWh reaction heat (127.2 kJ/mol). "~12 kWh/kg" is about double the physically available figure; enforced by `spec007_verified_calculations.zig`. |
| A 40-ft container holds ~480 MWh ≈ "5,000 Tesla Powerwalls" | CONTRADICTED | Container estimate multiplies an already-inflated energy density. Real figure is roughly half, and power output/weight/thermal limits are unconstrained in the source material. |
| Carbide sludge (Ca(OH)2) is recyclable via calcination → carbothermic reduction | VERIFIED (industrial reality) | EPA AP-42 and IPCC guidance describe CaO production and CaO + 3C → CaC2 + CO at ~2,000–2,100 °C; recycling loop is standard industrial chemistry. |
| If biochar is used, the cycle is carbon-neutral | EXTRAPOLATION | Carbon accounting depends on biochar sourcing, furnace electricity, CO/CO2 fate, and use-phase emissions. "Carbon-neutral" is not shown by chemistry alone. |

## 3. System/hardware claims

| Design-input claim | Grade | Finding |
|---|---|---|
| Tesla turbines are real boundary-layer machines | VERIFIED | Engineering literature and patents support the concept; efficiency at micro scale is the contested part. |
| TEGs are solid-state and 5–8% efficient in featured devices | VERIFIED (range) | Peer-reviewed Bi2Te3 devices reached 8% module efficiency under specific ΔT; many commercial modules operate below that. |
| Micro-ORC experimental systems exist and can be net-positive | VERIFIED | Published 10 W-class μ-ORC demonstrators exist; net electrical efficiencies at that scale are low and pump power matters. |
| "Single blade 10–20 W; 16 blades 400–800 W; 64 blades 2–5 kW" | CONTRADICTED (internal arithmetic) | Baseline harness test `rack arithmetic exposes scaling contradiction`: 16 × 10–20 W = 160–320 W; 64 × 10–20 W = 640–1,280 W. Higher figures require a separate energy source (combustion-driven ORC) not accounted in the original spec. |
| PDRC films maintain cold-side below ambient | VERIFIED-WITH-CORRECTION | Sub-ambient daytime cooling is demonstrated; but small (200–300 cm2) panels reject only a few watts, not hundreds. See `spec007_expanded_calculations.zig` PDRC tests. |
| Novec 649 "boils at 49 °C, stable to ~300 °C" | VERIFIED-WITH-CORRECTION | Boiling point 49 °C correct; critical temperature is ~169 °C, so a 300 °C loop is not a subcritical ORC point. 3M exited PFAS manufacturing at end of 2025 — supply risk is real. |
| "Government swap stations like LPG bottles" model | EXTRAPOLATION | Structural analogy to existing hazardous-goods distribution; implementation model is policy, not engineering. |
| "<$50 per blade at scale with Shenzhen prototyping" | UNSUPPORTED | Supplier-quotation-level BOM required. The dossier treats this as an engineering target, not a cost estimate. |
| Axial-flux PM machines work as generators (AFPMSG) | VERIFIED | Standard direct-drive hardware: published AFPMG wind-turbine designs deliver 3 kW-class output at ~240 RPM with measured/FEA-validated performance; regen braking is conventional EV practice. https://www.iaras.org/journals/caijps/design-and-analysis-of-axial-flux-permanent-magnet-generator-for-direct-driven-wind-turbines |
| Tesla turbine peak efficiency lands ~15–30k RPM at kW-class scale | VERIFIED (range) | Hoya & Guha (IMechE Part A, 2009) measured ~25% peak efficiency at 25,000 RPM; Univ. Genoa micro-expander campaign tested to 40,000 RPM; historical Leaman/Beans/Rice results span ~8–41%. https://facweb.iitkgp.ac.in/~aguha/research/Hoya_Guha_IMechE_PartA_2009_Tesla_Turbine.pdf · https://www.e3s-conferences.org/articles/e3sconf/pdf/2019/39/e3sconf_supehr18_03015.pdf |
| Axial generator "safe window" is 3,000–5,000 RPM | EXTRAPOLATION | Reasonable screening bound, not a universal limit — rotor-design dependent. The ρv² tip-stress screen passes ~11.6 MPa at 5k on a 150 mm rotor but reaches ~185 MPa at 20k (un-sleeved magnet retention is the failing element), quantified in `spec007_drivetrain_calculations.zig`. |
| "4:1–6:1 step-down bridges the mismatch" | VERIFIED-WITH-CORRECTION | Arithmetic confirmed for the mid band: 20k→4k at 5:1 (harness). But a fixed-4k setpoint across the full 15–30k band needs a 3.75:1–7.5:1 sweep, and the L0 spec's 80k top end needs ~26.7:1 — beyond any single-stage CVT. |
| T_out = T_in·R·η torque multiplication | VERIFIED | Elementary mechanics, harness-enforced (121,276 µN·m @ 254 W/20k → 533,614 µN·m through 5:1 at η0.88). |
| Planetary traction CVT efficiency ~80–88% | VERIFIED (range) | Traction-drive literature documents creep/spin losses; measured toroidal-CVT efficiency sits in the ~80–90% band depending on ratio/load. 80–88% is a fair conservative screening band. https://www.sciencedirect.com/science/article/pii/S2405896319306883 |
| Timing belts / fixed planetary gears ~95–98% | VERIFIED (range) | Standard transmission efficiency figures; preferred for net output where ratio flexibility is unneeded. |
| "Magnet ejection above ~20k RPM" | EXTRAPOLATION (quantified) | Tip-speed math supports the concern: ~157 m/s and ~185 MPa rim stress on a 150 mm rotor at 20k vs ~12 MPa at 5k — a carbon sleeve is the documented fix (harness screen). |
| CVT "solves the startup torque problem" | EXTRAPOLATION | Physically plausible — boundary-layer turbines stall under early load — but the transient spool/stall behavior is unmodeled; not claimed. |
| "20% drivetrain loss is economically viable" | CONTRADICTED under paid feedstock / CONDITIONAL under free heat | On a paid 300 g carbide charge, the CVT band lifts the feedstock floor from ~$1.64 to ~$2.05–2.43/kWh (harness). Only on a free-heat source (solar/waste ~1.6 kW roof bound) is the loss tolerable. |
| Drivetrain loss heat routed to shared TEG/PDRC/PV rejection | VERIFIED (as routing) / bounded as recovery | Mandatory-flow rule applies (TEGs harvest only where heat must flow), but at ~50–80 K casing ΔT the screen recovers ~0.3–0.7 W of a ~30–50 W loss — real, ledger-legal, and economically negligible; the benefit is shared rejection plumbing, not harvest (harness). |
| Scroll compressors convert to credible ORC expanders at this scale | VERIFIED (measured) | Sanden TRS090 measured ~45% isentropic, ~650 W shaft at expansion ratio ~2–2.2 (Energy 2019); semi-hermetic E15H022A-SH measured ~80% isentropic at 120–140 °C — inside our evaporator band; ULiège ORC2019 comparison measured variable-speed scroll up to ~76%. https://www.sciencedirect.com/science/article/abs/pii/S0360544219316135 · https://orbi.uliege.be/handle/2268/239272 |
| Tesla turbine experimental ceiling ~14–25% | VERIFIED (measured cap) | SLR + experiments: simulations claim 40–60% while measured results cap ~20–25%; +~5% per bar inlet pressure; 14.2%±0.4% @ 3 barg/4k RPM in the DoE study. https://pure.iiasa.ac.at/id/eprint/18201/1/Influence%20of%20Operational%20Parameters%20on%20the%20Performance%20of%20Tesla%20Turbines.pdf |
| High-speed PM generators exist far above 3–5k RPM at this power class | VERIFIED (measured) | ETH 100 W @ 500k RPM in 3 cm³; 1 kW @ 500k RPM; Capstone microturbine 30 kW @ 96k RPM on air bearings. The 3–5k "window" was a screening bound for un-sleeved rotors, not a physics limit. https://www.ams-publications.ee.ethz.ch/uploads/tx_ethpublications/zwyssig_PCC07.pdf |
| PCB-wound axial-flux machines at small scale ~72–82% | VERIFIED (measured range) | 40 W @ 2k RPM gimbal machine measured 72%; METU double-rotor PCB-stator AFPM measured 82% system efficiency to 7k RPM. Coreless PCB stators eliminate iron loss — favorable at high frequency. https://open.metu.edu.tr/handle/11511/97372 |
| Carbon-fiber sleeve retains magnets at 20k+ RPM | VERIFIED (practice) | ORNL FEM-validated CF sleeve on outer-rotor SPM at 20k RPM; Energies 2022 sleeve-design review; 80 kW/60k RPM bread-type rotor studies. https://www.ornl.gov/publication/mechanical-analysis-carbon-fiber-retaining-sleeve-high-speed-outer-rotor-spm-electric |
| ESP32-S3 as the controller silicon | VERIFIED (datasheet-class) / harness-bounded | Deep-sleep ULP ~10 µA; duty-cycled ~10–50 mW (<0.2% of the 30 W bus; up to three units inside a 0.5% parasitic budget); always-on ~300 mW would cost ~5.7% at the low duty point → duty cycling mandatory (harness). Independent hardware shutdown remains mandatory — same-die redundancy shares failure modes. |
| Transformer-oil hot bus at ~150–250 °C | VERIFIED-WITH-CORRECTION | Mineral oil bulk service ~150–200 °C before oxidation accelerates; synthetic ester similar; silicone fluids higher. The bus does not "step down" temperature — it circulates heat; the evaporator draw cools it. 300–450 °C oil remains excluded. |
<!-- Gustav Graves had a mirror satellite routing sunlight. This layer routes fractions — and unlike Graves, it conserves energy. -->
| Low-grade external heat (PC cooling) can plug into the manifold | VERIFIED-WITH-CORRECTION | Correct only at the economizer: a 40–60 °C source cannot push heat into the 150–250 °C hot bus, but preheats Novec liquid across its usable span — capacity ~1.43 kW burst / ~0.13 kW sustained (harness). Every absorbed watt reduces burner duty; additive use enlarges rejection. |
| Path A (scroll + AFPM) vs Path B (Tesla + HS gen) | VERIFIED comparison | Harness-enforced: ~412–732 W bus vs ~215–228 W; ~155–266 Wh/charge vs ~85 Wh; open-hardware $/W ~$0.34–1.21 vs ~$1.75–4.19 — Path A's worst case beats Path B's best case on $/W. Path C (Tesla+CVT, ~182–224 W) superseded, retained in archive. |

## 4. Scarcity/economics claims

| Design-input claim | Grade | Finding |
|---|---|---|
| Metered electricity markets can show negative prices when renewables oversupply | VERIFIED | France recorded ~800 hours of zero/negative prices in 2026 including a record −€498/MWh; curtailment/negative prices are documented market phenomena. https://www.pv-magazine.com/2026/06/03/un-prix-spot-negatif-record-de-498-e-mwh-enregistre-le-1er-mai/ |
| US Invention Secrecy Act (1951) exists and has screened energy-efficiency patents | VERIFIED | FAS Secrecy News: 6,543 secrecy orders in effect at end of FY2025; a 1971 screening list included photovoltaics >20% efficient and energy conversion "in excess of 70–80%." The current list is not public. https://sgp.fas.org/othergov/invention/ |
| ISA "criminalizes >70% efficient energy conversion today" | EXTRAPOLATION | The 70–80% figure is from a 1971 review list and does not by itself prove present-day suppression of any specific class of inventions. Do not state this as current law without evidence. |
| China six battery firms hold ~70% of global power+ESS battery market (2024) | VERIFIED | SMM/CNEVPost reporting of SNE data: six Chinese companies at ~69%; CATL 37.9%, BYD 17.2% EV battery share 2024. |
| China manufacturing ≈ 27–28% of world value added | VERIFIED | World Bank WDI (via data portal) and UNIDO methodology give ~27.7% for 2024/2025. |

## 5. Strategic/narrative claims (classified)

Strategic, political, military, and narrative content from the design inputs is **classified under SPEC-004 ("7q")** and is excluded from this public grading document. It is retained in the classified design inputs, carries zero engineering authority, and no claim in that category may be promoted to an engineering, market, or product requirement.

<!-- Boris Grishenko typed "I am invincible" and died mid-boast. Every row graded below the line is a claim that never doubted itself — verification is what doubt looks like in writing. -->

## 6. Bottom line

The source material is **not pure speculation**:

- China's dominance of PV/wind manufacturing and deployment is documented by IEA/IEA PVPS/IEA Wind data.
- China's calcium-carbide dominance and the ~3,000 kWh/t energy use are documented.
- Sludge recycling is established industrial chemistry.
- Negative electricity prices and curtailment under high renewable penetration are documented 2026 facts.
- The Invention Secrecy Act exists; the historical 1971 screening thresholds are documented.

But the source material also contains **contradictions and overstatements** that must not be promoted to requirements:

- The numbered performance figures for SPEC-007 are internally inconsistent (water feed vs gas output; rack power arithmetic).
- The "~12 kWh/kg" carbide energy density is twice the physical figure.
- Novec-649 has an ~169 °C critical point; a nominal 300–450 °C loop is not a nominal subcritical ORC operating point.
- The safety-jail and 3-second solidification claims are unverified without experiments.
- Strategic/narrative content is classified (SPEC-004) and is not part of the public evidence trail.

The appropriate integration status is: **architecture accepted as a research concept; factual background verified in part; performance and deployment claims remain gated until measured.**