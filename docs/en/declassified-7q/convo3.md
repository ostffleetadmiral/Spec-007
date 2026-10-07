# convo3 — SPEC-007 component vision walkthrough

<!-- The asset talked for three sessions. Everything it said is filed, graded, and — where the fractions agreed — promoted. -->

Classification: L5 classified design input (SPEC-004, "7q"). Not public. Not
engineering authority. This file is a faithful record of the system owner's
component-by-component vision as stated in session; grading lives in
`spec-007-design-input-audit.en.md` and `spec-007-claim-verification.en.md`.

Format: live walkthrough, one component at a time, owner describing intended
behavior; agent grading against canon. Below is the record of what was stated.

---

## 1. Cartridge

Owner's vision: a ~1 kg unit, "about the size of a pop can or pop bottle."
Contents:

- Solid or powdered CaC₂ charge.
- A pouch of quicklime (CaO) — the quench.
- A pouch of water — onboard feedstock.
- Mechanical safety hardware layered on top.

Stated intent: the pouch architecture "gives it its own safety basically" —
fuel, oxidizer-trigger, and quench all sealed inside one disposable unit.

## 2. Reactor control

Owner's vision: "an internal AI system" whose only job is life support for the
whole system — water/gas rate coupling, monitoring, and safe operation.

Follow-up exchange pinned the silicon: ESP32-S3, and "we can use multiples of
the ESPs because they use very little power" (redundant/distributed controllers).

## 3. Acetylene / burner

Owner's vision: briefcase-size appliance. Acetylene burned at low gas rates
under a slab about the size of a briefcase — broad-area burning for latent
heat delivery. Owner referenced "~300 °C or is it 169 °C" as the ceiling; the
two ceilings were distinguished in discussion (slab ~300 °C TEG-limited vs
Novec 169 °C critical gate; evaporator band 90–150 °C).

## 4. Thermal buffer / heat exchange

Owner's vision: multiple heat exchangers. High-grade heat goes "against
something like transformer oil"; the oil steps the temperature down into the
Novec side so the working fluid stays below its limit.

Correction applied in discussion: the exchanger does not gear temperature
down — the oil loop is a hot bus whose own fluid rating (~150–250 °C bulk for
mineral/ester oils) sets the ceiling; the evaporator draw is what cools it.

## 5. Heat manifold

Owner's vision: "a heat exchanger that's grabbing heat from almost any
source" — external sources plug into the same cooling loop. Worked example
given: "if I got a computer running, I can plug my cooling for my PC into it,
and it will cool the PC the same way it cools the rest of the system."

Formalized in discussion as a three-grade manifold (hot oil bus / warm Novec
economizer / cold condenser) — external low-grade heat (e.g. PC cooling)
enters at the economizer, preheating the working fluid before the evaporator.

## 6. Expander + drivetrain

Owner stated low familiarity and asked for research. Owner's intuition: "all
of this stuff can be small — definitely the axial generator."

Research returned (graded separately): scroll expanders measure 45–80%
isentropic at our band (Sanden TRS090 ~45% @ ~650 W shaft; E15H-type ~80% @
120–140 °C); Tesla turbine experiments cap ~14–25%; high-speed PM generators
exist far above the assumed 3–5k window (100 W @ 500k RPM in 3 cm³; Capstone
30 kW @ 96k RPM); PCB-wound axial-flux machines hit 72–82% at small scale.

Owner directive (open-hardware mandate): document BOTH paths —
  Path A: scroll expander + direct-drive ~3–5k RPM AFPM (flagship).
  Path B: Tesla turbine + sleeved high-speed PM generator, direct drive
          (garage-fab: every part flat or cylindrical).
Path C (Tesla + CVT) retained as superseded.

## 7. Heat routing mandate (restated)

"Pipe the heat away into our TEG, TEC, solar radiated film system. Solar PV,
T, radiated film system." — all mandatory heat flows route through the
recovery/rejection stack; recovery only on mandatory flows; TECs are
parasitics; the ~5 kW burst budget is shared and conserved.

## Standing quotes (for the ledger)

- "CaO quench don't care what the firmware thinks." — independent-shutdown
  doctrine, now canon phrasing.
