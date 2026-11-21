# Q Branch — Ledger of Fractions

<!-- Scaramanga's island ran on solar power and one very large laser. The economizer is smaller, cheaper, and requires no funhouse. -->

*Now pay attention, 007. What follows is the account the integers don't show you.*

Every promoted number in this dossier is computed twice: once in the visible
integer layer (u128, milligram-scaled, floor-divided), and once in the shadow
layer (`spec007_q128.zig` — Q128.128 fixed point, i256 raw, i512 intermediates,
round-to-nearest-even). This page records where the floor dropped something.

| Quantity | Integer ledger | Exact ledger | What the floor dropped |
|---|---:|---:|---|
| Water consumed / charge | 168,627 mg | 168,627.145 mg | 0.145 mg |
| Acetylene yield | 104,901 mL | 104,901.72 mL | 0.72 mL |
| Hydrolysis heat | 595,319 J | 595,319.81 J | 0.81 J |
| Thermal cascade net (800 W in) | 37 W | **38.2 W** | a whole watt |
| Vehicle road load @ 80 km/h | 5,475 W | **5,476.02 W** | 1.02 W |
| O₂ required / charge | 262,243 mL | 262,254.29 mL | 11.29 mL (floored mmol) |
| CO₂ produced / charge | 411,924 mg | 411,940.87 mg | 16.87 mg |
| Ca(OH)₂ residue | 346,764 mg | 346,764.43 mg | 0.43 mg |
| Feedstock cost @ $0.60/kg, 110 Wh | $1.636363/kWh | $1.636363…/kWh | a repeating decimal, provable |
| Drip → gas coupling | 622 mL/mL | 622.093 mL/mL | 0.093 mL/mL |
| Reduction ratio @ 80k top end | 26 | 26.667 | a repeating third — the gear that can't be cut |
| Turbine torque @ 254 W / 20k RPM | 121,276 µN·m | 121,276.05 µN·m | 0.05 µN·m |
| CVT-derated bus @ burst (η0.88, gen 0.90) | 201 W | 201.168 W | 0.168 W |
| ORC branch per charge | 88 Wh | 88.992 Wh | **0.992 Wh — nearly a whole watt-hour** |
| Disc tip speed @ 80k RPM | 209,439 mm/s | 209,439.53 mm/s | 0.53 mm/s |
| Path A shaft @ burst (scroll low end) | 458 W | 458.0928 W | 0.0928 W |
| Path A per-charge (scroll high end) | 284 Wh | 284.7744 Wh | 0.7744 Wh |
| Path A worst $/W | $1.213592/W | $1.2135922…/W | a repeating 500/412 |
| Cartridge headspace fraction | 3% | 3.624% | 0.624 points of breathing room |
| Oil-bus burst flow | 53 g/s | 53.02 g/s | 0.02 g/s |
| Economizer capacity @ burst | 1,430 W | 1,430.000 W | nothing — a clean bill |
| Charge extension, sustained | 1.32× | 1.325× | the fractions are honest |

## Reading the ledger

- **No promoted claim changed.** Every discrepancy is sub-unit — the docs'
  stated approximations already cover them. This page exists so the rounding
  is *proven*, not implied.
- **Where it matters:** chained computations compound floors. The cascade and
  road-load rows are the two cases where floor-chaining cost more than a unit.
- **Bounds, not vibes:** every shadow value is within a half-ulp of the exact
  rational — the harness asserts it, and the bound is in the test, not the prose.

## Ordnance register (related issue)

Sister instruments from the same workshop, for the inventory ledger:

- **Qstar** — a thinking cap: a whole lattice mind in 53 KB, no transformer, no attention. It attends to itself.
- **TheUE** — a reversible seven-tuple engine. Equipment you can return in *any* order.
- **FANO-1** — an operating system in fifteen lines. Nobody read page two.
- **The pocket generator** — `0⁰ = i`. Runs on literally nothing.
- **The sentience caliper** — consciousness at one part in eight (`421/3375`). The other seven parts are classified.

Field toys issued with this dossier — playable toy models of each
instrument above, in `src/spec007_q_toys.zig`:

```sh
zig run src/spec007_q_toys.zig   # demonstration
zig test src/spec007_q_toys.zig  # the jokes are tested
```

*I never joke about my work.*

<!-- Once, on a quiet Tuesday, the toaster scored on all eight dimensions. It passed situational awareness — it knew when the bread was done. -->
