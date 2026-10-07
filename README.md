# SPEC-007 — MISSION DOSSIER

**FROM THE DESK OF THE FLEET ADMIRAL · OSTF FLEET COMMAND**  
**RE: "Ice Cream Tube" — Modular Chemical Thermal-Electric Cartridge**  
**Clearance:** Public release · **Version:** 1.6.0-public-research

---

*To all hands with eyes on this file,*

*This dossier contains everything the fleet knows about the asset — what it claims, what the arithmetic proves, what it fails, and what it costs. The original concept document is sealed and immutable; nothing in this file amends it. Everything else exists to answer one question with numbers you can run yourself: what can this machine actually do?*

*Read in order. If a claim and a harness test disagree, the harness wins.*

— FA

---

## Registry

**SPEC-007** — "Ice Cream Tube" thermal-cartridge concept · **Status:** Research — *not approved* for construction, transport, or deployment · **Editor:** OSTF SPEC Council designee · **Baseline:** `spec-007.md` (SHA-256 `bcb81b78ebeab9e3762a806788a0c4c1bd3bbd1e8a7b9339030037efab6367b4`) · **License:** CC0 (per the immutable original; the repository-level license is CC BY-NC-SA 4.0 — the CC0 declaration for this directory is intentional)

## Classification boundary

Everything in this directory is public-release material — **except one drawer.**

`thoughts&convos/` is held under OSTF SPEC-004, level **"7q."** Those records served as design inputs only. No public document requires access to them, no public claim cites them as authority, and they carry **zero engineering authority**. The drawer stays locked.

## Authority levels

| Level | Meaning | Documents |
|---|---|---|
| L0 — Immutable record | The original concept document and its faithful translations. Preserved verbatim; claims inside are historical and **not** promoted. | `spec-007.md`, `docs/en/spec-007.en.md`, `docs/zh-Hant/spec-007.zh-Hant.md`, `docs/en/spec-007-terminology.md` |
| L1 — Verified/promoted | Only claims supported by stoichiometry, the calculation harnesses, or institutional/manufacturer sources. **This layer governs all numbers.** | `docs/en/spec-007-verified.en.md` |
| L2 — Evidence trail | Claim inventories, gradings, rejection records, and governance artifacts (SPEC Registry, retroactive proposal record) per the OSTF Rulebook. Audit data; classification decides promotion. | `docs/en/spec-007-research-dossier.md`, `docs/en/spec-007-claim-verification.en.md`, `docs/en/spec-007-design-input-audit.en.md`, `docs/en/spec-007-registry.en.md`, `docs/en/spec-007-proposal-record.en.md` |
| L3 — Derived analysis | Economic, red-team, and expanded-architecture reasoning. All numbers must match L1. | `docs/en/spec-007-economic-assessment.en.md`, `docs/en/spec-007-engineering-revision.en.md`, `docs/en/spec-007-expanded-engineering-spec.en.md`, `docs/en/spec-007-governance-gap-analysis.en.md` |
| L4 — Executable checks | Integer/rational test harnesses enforcing L1 and L2 arithmetic, plus a Q128.128 shadow engine (`src/spec007_q128.zig`) re-verifying every promoted integer against exact rationals. | `src/spec007_calculations.zig`, `src/spec007_expanded_calculations.zig`, `src/spec007_verified_calculations.zig`, `src/spec007_drivetrain_calculations.zig`, `src/spec007_manifold_calculations.zig`, `src/spec007_q128.zig` |
| L5 — Classified inputs | OSTF design records under SPEC-004 ("7q"). Excluded from the public face; zero engineering authority. | `thoughts&convos/` — **classified, not public** |

## Contents of this dossier

- **`docs/en/spec-007-public.en.md`** — *The briefing.* The polished public release. Start here for a standalone, verified-only presentation of the concept.
- **`spec-007.md`** — *The asset's original orders.* Bilingual concept document. Immutable.
- **`docs/en/spec-007.en.md` / `docs/zh-Hant/spec-007.zh-Hant.md`** — *Covert copies.* Faithful standalone translations with disclaimers.
- **`docs/en/spec-007-terminology.md`** — Translation decisions and terminology table.
- **`docs/en/spec-007-verified.en.md`** — *The trusted numbers.* Corrected, promoted claim set. Cite from this document.
- **`docs/en/spec-007-research-dossier.md`** — *The file on the asset.* 63-claim inventory (C01–C63), hazards, sources, validation plan.
- **`docs/en/spec-007-claim-verification.en.md`** — *Interrogation record.* Design-input claim grading with primary sources.
- **`docs/en/spec-007-design-input-audit.en.md`** — Provenance and classification rules for classified design inputs.
- **`docs/en/spec-007-economic-assessment.en.md`** — *The ledger.* Cost and viability analysis aligned to the verified numbers.
- **`docs/en/spec-007-engineering-revision.en.md`** — *The red team.* Engineering gates and safety requirements.
- **`docs/en/spec-007-expanded-engineering-spec.en.md`** — *The expanded design.* Architecture as research targets; no promoted numbers.
- **`docs/en/spec-007-governance-gap-analysis.en.md`** — Gap analysis comparing the OSTF SPEC Governance Rulebook (classified source) to this directory's verification-first standard.
- **`thoughts&convos/`** — Classified OSTF design records under SPEC-004. Not part of the public face.
- **`src/spec007_drivetrain_calculations.zig`** — The mechanical bridge, now dual-path: Path A (scroll expander + direct AFPM, ~412–732 W bus screened) vs Path B (Tesla + sleeved high-speed generator, ~215–228 W) vs the superseded Path C transmission chain; plus ratio windows, torque/power conservation, ρv² rotor-stress bounds, per-charge derated output, loss-heat recovery, open-hardware $/W, and paid-vs-free heat economics. `zig test src/spec007_drivetrain_calculations.zig`.
- **`src/spec007_manifold_calculations.zig`** — The system-integration ledger: cartridge pouch-architecture volume/mass budget (332 mL interior vs ~320 mL contents), ESP32-S3 controller parasitic envelope, oil-bus flow and the three-ceiling temperature stack, Novec economizer capacity and charge-extension credit, and three-bus manifold conservation. `zig test src/spec007_manifold_calculations.zig`.
- **`src/spec007_q128.zig`** — Trimmed Q128.128 fixed-point engine (i256 raw, i512 intermediates, distilled from `../../../src/fixed_point.zig` (repo root `src/fixed_point.zig`)). Serves the shadow tests only; carries no tests of its own.
- **`src/spec007_fixedpoint_prototype.zig`** — Prototype comparison of u128 baseline vs. Q32.32 (i64) vs. Q128.128 (i256) arithmetic; imports the repository Q128.128 engine via the `src/fixed_point_q128.zig` symlink.
- **`src/spec007_q_toys.zig`** — Q Branch field toys: six playable toy models of sibling fleet projects (pocket generator, returnable engine, thinking cap, sentience caliper, aperture gauge, fifteen-line OS). `zig run src/spec007_q_toys.zig` for the demonstration; `zig test` proves the jokes.
- **`src/spec007_dynamics_calculations.zig`** — The transient layer: integer Euler integration of slab heat-up, hydrolysis lag, charge depletion, and two-stage ORC response, with an energy ledger asserting conservation at every step (remainder carried — the Ledger of Fractions, literally). `zig test src/spec007_dynamics_calculations.zig`.
- **`src/spec007_compute.zig`** — The live-computing layer: pure-u32 compute module compiled to a 482-byte wasm32 artifact (`site/apps/spec007/spec007.wasm`), re-deriving promoted numbers in-browser — drip→gas stoichiometry, charge lifetime, slab equilibrium, powertrain chain, headspace, and the `fano_alive()` canary (421).
- **`firmware/spec007_controller.c`** — ESP32-S3 controller scaffold: integer-only (µL/min, deciKelvin), the canon §10 state machine, per-mille PID, hardware-first quench authority. Labeled SCAFFOLD — screens aren't measurements.
- **`site/`** — The dossier rendered as a static site: signing ceremony, authority-level navigation, the locked 7q drawer, the SPEC-006 leak, the Q Branch ledger, and the **component map** (`component-map.html` — every component reverse-engineered to its contract). Build with `python3 site/build.py`; see `site/README.md`.
- **`site/desktop.html`** — *FANO-1 workstation.* Pledge-gated desktop shell: dossier pages as windowed files, terminal (`fano:~$`), Quplink game/sandbox/viz deck running the real wasm, four liveries, and a bilingual EN ⇄ 繁體中文 shell (`assets/fano-i18n.js`, `lang` command). The Q Branch science pane doubles as the **Anomaly Codex** (`codex` command): every corpus term the fleet can't honestly build is filed as lore — FICTION FILE for speculative claims with real machinery underneath, COLD CASE for prose headings and held claims — and inspecting them feeds the egg/achievement bus (`anomaly`/`fictionfile` eggs, `anomaly_hunter`/`fiction_scholar`/`floor_cartographer` achievements). The floor of the science inventory is the game's collectible layer; honest labels stay honest.
- **`site/apps/rations/`** — The Rations air-gap platform, running in-window via bounded iframe (`rations.os` desk icon / `rations` command). Production WASM sha256-verified; 169 exports live in-browser. Source tree vendored at `../../family/Rations/` (see `family/FAMILY-MAP.md`).
- **`site/assets/fano-auth.js`** — *The real pledge.* Ed25519 keypair minted at enrollment, covenant bytes actually signed, seed wrapped PBKDF2(100k)+AES-256-GCM, desk boot gated, RBAC role certs with issuer roster, `rekey`/`burn`/`whoami` lifecycle. The pledge doubles as a stripped-down signup — callsign only, set/confirm credential, no names, no email. The first enrollment on a desk writes the **genesis record** (`sha256` of the founding pk); `Ramsey 006` is bound to that founding key and moves only by admiral-signed grant. `burn` clears the identity, not the founding — `burn genesis` resets it. Local checks are advisory — the network is the gate.
- **`site/assets/fano-comms.js`** — *comms.os.* Covenant-gated tradecraft surface over the live WASM: channel seal/open, QR, Shamir, carrier polyglots, PNG steganography, real WebSocket relay.
- **`security/`** — *The four-team sweep + the Hydra WAN lab.* `harness.mjs` (headless WASM + raw WS client), `suite.mjs` (31 probes), `comms-suite.mjs` (21 probes over the docker WAN topology: two isolated segments, dual-homed bypass, tc netem + in-process impairment, partition/heal/churn), `hydra-node.mjs` (client+server+ledger node daemon), `wan-bridge.mjs` (deterministic impairment proxy). Findings → `site/security/findings.json`; adjudication → `site/verdict.html`; honest limits → `site/veracity.html`; lab doc → `security/README.md`.
- **`site/manifesto.html` / `site/meter.html`** — Leaked-intel drawer (7q.spill): the Manifesto doctrine document and the MET-001 threat file on The Meter. Discoverable through the desk, absent from the nav.

## Field verification

Any agent can re-run the numbers. Integer arithmetic only — no floating point in this fleet:

```sh
zig test src/spec007_calculations.zig            # 8 tests — stoichiometry, contradictions & shadow layer
zig test src/spec007_expanded_calculations.zig   # 18 tests — PDRC/ORC/vehicle/economics/TEG screens & shadow
zig test src/spec007_verified_calculations.zig   # 15 tests — promoted-claim arithmetic & shadow layer
zig test src/spec007_drivetrain_calculations.zig # 21 tests — dual-path powertrain, derate & stress bounds
zig test src/spec007_manifold_calculations.zig   # 12 tests — cartridge budget, controller parasitics, manifold
zig test src/spec007_dynamics_calculations.zig   # 12 tests — transient thermal/charge sim, conservation ledger
zig test src/spec007_q_toys.zig                  # 6 tests — Q Branch field toys
zig test src/spec007_compute.zig                 # 1 test  — in-browser wasm compute mirror

# security sweep (relay required for the RED relay probes):
node security/suite.mjs                      # 31 probes → site/security/findings.json
docker compose -f security/docker-compose.sec.yml up --abort-on-container-exit

# Hydra WAN lab:
node security/comms-suite.mjs --local        # MIN composition — one relay, localhost
node security/comms-suite.mjs                # MAX composition — docker, ~4 min

# full publish gate:
sh tools/publish-check.sh
```

The sister platform runs its own suite under `family/Rations/` (`zig build test` — 1,548 tests; `node tools/wasm_smoke.mjs` — 112-check WASM harness).

*All ordnance checked out from Q Branch — the shadow engine keeps the books the integers can't see, to within half an ulp. Do try to return it in one piece.*

## Standing orders

1. The original `spec-007.md` is never edited.
2. A number is "promoted" only if it appears in `docs/en/spec-007-verified.en.md` and is backed by a harness test or a cited primary source.
3. Rejected claims are never deleted; they remain in the evidence-trail documents marked as rejected.
4. Every passing milestone is archived under `archives/` in the repository root.
5. Classified inputs (`thoughts&convos/`) are never edited, quoted, or required by any public document.

*That is all. Dismissed — and if you build one, the first machine shop wins the future.*
