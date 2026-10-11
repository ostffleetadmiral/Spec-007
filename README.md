# SPEC-007 — MISSION DOSSIER

**FROM THE DESK OF THE FLEET ADMIRAL · OSTF FLEET COMMAND**  
**RE: "Ice Cream Tube" — Modular Chemical Thermal-Electric Cartridge + the FANO-1 Platform**  
**Clearance:** Public release · **Version:** 2.0.0-public-platform

---

*To all hands with eyes on this file,*

*This dossier contains everything the fleet knows about the asset — what it claims, what the arithmetic proves, what it fails, and what it costs. The original concept document is sealed and immutable; nothing in this file amends it.*

*Two objects share this tree. The cartridge is a design dossier — calculations, geometry, safety envelopes, economics — awaiting its first bench. The platform that carries it is real and running: an integer-only computation core, a sealed wire dialect, a bilingual workstation, an evidence ledger where every claim binds to a mechanical check or carries its failure label. The software is verified. The device is not yet built. This file will not let you confuse the two.*

*Read in order. If a claim and a harness test disagree, the harness wins.*

— FA

---

## Registry

**SPEC-007** — "Ice Cream Tube" thermal-cartridge concept · **Status:** Research — *not approved* for construction, transport, or deployment · **Editor:** OSTF SPEC Council designee · **Baseline:** `spec-007.md` (SHA-256 `bcb81b78ebeab9e3762a806788a0c4c1bd3bbd1e8a7b9339030037efab6367b4`) · **License:** CC0 (per the immutable original; the repository-level license is CC BY-NC-SA 4.0 — the CC0 declaration for this directory is intentional)

**FANO-1** — the workstation + evidence platform carrying the dossier · **Status:** Active — governed under the drawer SPEC corpus (SPEC-000…SPEC-014) · **Verification:** `tools/publish-check.sh` — all gates green or nothing ships

## Classification boundary

Everything in this directory is public-release material — **except one drawer.**

`thoughts&convos/` is held under OSTF SPEC-004, level **"7q."** Those records served as design inputs only. No public document requires access to them, no public claim cites them as authority, and they carry **zero engineering authority**. The drawer stays locked — it is never committed and never published; the tripwire is mechanical.

## Authority levels

| Level | Meaning | Documents |
|---|---|---|
| L0 — Immutable record | The original concept document and its faithful translations. Preserved verbatim; claims inside are historical and **not** promoted. | `spec-007.md`, `docs/en/spec-007.en.md`, `docs/zh-Hant/spec-007.zh-Hant.md`, `docs/en/spec-007-terminology.md` |
| L1 — Verified/promoted | Only claims supported by stoichiometry, the calculation harnesses, or institutional/manufacturer sources. **This layer governs all numbers.** | `docs/en/spec-007-verified.en.md` |
| L2 — Evidence trail | Claim inventories, gradings, rejection records, and governance artifacts (SPEC Registry, retroactive proposal record) per the OSTF Rulebook. Audit data; classification decides promotion. | `docs/en/spec-007-research-dossier.md`, `docs/en/spec-007-claim-verification.en.md`, `docs/en/spec-007-design-input-audit.en.md`, `docs/en/spec-007-registry.en.md`, `docs/en/spec-007-proposal-record.en.md` |
| L3 — Derived analysis | Economic, red-team, and expanded-architecture reasoning. All numbers must match L1. | `docs/en/spec-007-economic-assessment.en.md`, `docs/en/spec-007-engineering-revision.en.md`, `docs/en/spec-007-expanded-engineering-spec.en.md`, `docs/en/spec-007-governance-gap-analysis.en.md` |
| L4 — Executable checks | Integer/rational test harnesses enforcing L1 and L2 arithmetic, plus a Q128.128 shadow engine (`src/spec007_q128.zig`) re-verifying every promoted integer against exact rationals. | `src/spec007_*.zig` (290 test blocks across 26 modules) |
| L5 — Classified inputs | OSTF design records under SPEC-004 ("7q"), including the SPEC governance corpus. Excluded from the public face; zero engineering authority over public claims — binding authority over development conduct. | `thoughts&convos/` — **classified, not public** |

## What the platform is

- **Integer-only core** — Q128.128 fixed-point arithmetic, round-to-nearest-even, 512-bit intermediates, half-ulp error bounds. No `f32`/`f64` in `src/` outside annotated sidecar boundaries; the ratchet is mechanical (ZIG-01).
- **Sealed wire dialect** — canonical 136-byte datagrams, Ed25519 signatures, per-frame keyed sealing, two-gate reassembly, first-contact messages filed honestly as unsealed. Golden-vector conformance, bit-exact.
- **FANO-1 desk** — covenant-gated workstation: Ed25519 keystore (PBKDF2+AES-256-GCM), QStar.net TOTP, roaming flag authenticator, bot containment doctrine, four workspaces, seven-zone snap ghost, window/taskbar menus, tray + notification ledger + calendar, organ applications (files, control, integer `BigInt` calculator, task manager, editor, terminal, comms, academy, persona, engine, continuity, director, nebula, science, sysmon, palette, admiralty), session persistence, and a full EN ⇄ 繁體中文 twin (exact 1:1 key parity).
- **Evidence engine** — 120 claims, each graded proved / held-as-labeled / rejected-held / external / blocked; records conserve against dossier rows in every twin. Rejected claims stay filed with reasons. The release gate refuses a green build while any check drifts.
- **Executable governance** — the drawer SPEC corpus (SPEC-000…SPEC-014 + Rulebook) binds to machinery: 47 mandates across 16 domains, each realized by a running counterpart with a mechanical check. `thoughts&convos/` holds the instruments; the checks run public.
- **Academy** — 56,120 lessons (55,572 corpus-harvested + 548 curated) across 14 coverage-enforced courses, 102 declared sources, full-body dedupe, per-lesson provenance and `deterministic_review_required` labeling, structural course review graded and ratcheted, ministry material filed as theology/philosophy — never empirical.
- **Adversarial self-audit** — 213-probe consolidated sweep (RED/BLUE/BLACK/GRAY/COMM/DESK/BOT/AUTH/WIRE/ZIG/SPEC004/HARN/FLEET/CLUSTER/ENGINE/CONTINUITY/LIBRARY/PRODUCTION/CURRICULUM/ACAD/GOVM/EMG/BRG/AIWO/DHT/SVC), Docker WAN lab under real `tc netem` impairment, 284 sealed archives, surname tripwire, canon-pair byte parity after every deploy.

## Contents of this dossier

- **`docs/en/spec-007-public.en.md`** — *The briefing.* The polished public release. Start here for a standalone, verified-only presentation of the concept.
- **`spec-007.md`** — *The asset's original orders.* Bilingual concept document. Immutable.
- **`docs/en/spec-007.en.md` / `docs/zh-Hant/spec-007.zh-Hant.md`** — *Covert copies.* Faithful standalone translations with disclaimers; `docs/en/spec-007-terminology.md` records the translation decisions.
- **`docs/en/spec-007-verified.en.md`** — *The trusted numbers.* Corrected, promoted claim set. Cite from this document.
- **`docs/en/spec-007-research-dossier.md`** — *The file on the asset.* The claim inventory, hazards, sources, validation plan, and the platform's own graded claims.
- **`docs/en/spec-007-claim-verification.en.md`** — *Interrogation record.* Design-input claim grading with primary sources; `spec-007-design-input-audit`, `spec-007-registry`, and `spec-007-proposal-record` carry the provenance and governance trail.
- **`site/component-map.html`** — *Every component reverse-engineered to its contract.*
- **`docs/en/spec-007-economic-assessment.en.md`** — *The ledger.* Cost and viability analysis aligned to the verified numbers.
- **`docs/en/spec-007-engineering-revision.en.md`** — *The red team.* Engineering gates and safety requirements.
- **`docs/en/spec-007-governance-gap-analysis.en.md`** — Gap analysis comparing the OSTF SPEC Governance Rulebook to this directory's verification-first standard.
- **`src/`** — The integer harnesses: `spec007_*` calculations, probes, and simulators (calculated envelopes only — no bench data exists yet); `spec008_*` wire/lattice modules; `fixed_point_q128.zig` the shadow engine. `zig build test` — all of it.
- **`firmware/spec007_controller.c`** — ESP32-S3 controller scaffold: integer-only, the canon state machine, hardware-first quench authority. Labeled SCAFFOLD — screens aren't measurements.
- **`site/`** — The dossier rendered as a static site + the FANO-1 desk (`desktop.html`). Dependency-free; `python3 site/build.py`; see `site/README.md`.
- **`site/assets/fano-auth.js` / `fano-comms.js` / `fano-desktop.js`** — The real pledge (Ed25519 + PBKDF2 + TOTP + genesis + containment), the tradecraft surface, and the full window manager.
- **`security/`** — The consolidated sweep + the Hydra WAN lab: `team-sweep-2.mjs` (213 probes), `comms-suite.mjs`, `hydra-node.mjs`, `fano-mesh-bridge.mjs` (the 136-byte dialect end-to-end). Findings → `site/security/findings.json`.
- **`tools/`** — The emit/verify machinery: every ledger (`vision-audit`, `layer-map`, `gov-map`, `engine-manifest`, `academy-harvest`, `curriculum-map`, `academy-review`, `claim-promotion`, `override-audit`, `archive-projection`, `doc-census`, and kin) re-derives on `--verify` and exits nonzero on drift.
- **`site/apps/rations/`** — The Rations air-gap platform, running in-window via bounded iframe; production WASM sha256-verified. Source tree at `../../family/Rations/` (see `family/FAMILY-MAP.md`).
- **`site/manifesto.html` / `site/meter.html`** — Leaked-intel drawer (7q.spill). Discoverable through the desk, absent from the nav.
- **`thoughts&convos/`** — Classified OSTF records under SPEC-004, including the SPEC corpus (SPEC-000…SPEC-014, the Governance Rulebook) that governs development conduct. Not part of the public face.

## Field verification

Any agent can re-run the numbers. Integer arithmetic only — no floating point in this fleet:

```sh
zig build test                                # 290 test blocks / 26 modules — all green
node security/team-sweep-2.mjs                # 213 probes → findings ledger
node tools/vision-audit.mjs --verify          # 23 elements, all realized
node tools/gov-map.mjs --verify               # 47/47 mandates realized
node tools/academy-review.mjs --verify        # 14 courses, zero structural defects
node security/comms-suite.mjs --local         # WAN lab — localhost hydra nodes
node security/comms-suite.mjs --docker        # same suite, real tc netem impairment
sh tools/publish-check.sh                     # the release gate — ALL of it
```

The sister platform runs its own suite under `family/Rations/` (`zig build test` — 1,548 tests; `node tools/wasm_smoke.mjs` — 112-check WASM harness).

*All ordnance checked out from Q Branch — the shadow engine keeps the books the integers can't see, to within half an ulp. Do try to return it in one piece.*

## Standing orders

1. The original `spec-007.md` is never edited; its SHA-256 is pinned in the desk and the gate.
2. A number is "promoted" only if it appears in `docs/en/spec-007-verified.en.md` and is backed by a harness test or a cited primary source.
3. Rejected claims are never deleted; they remain in the evidence-trail documents marked as rejected.
4. Every passing state is archived under `~/.archives/spec-007-*` with NOTE.md + SHA256SUMS; nothing that has passed is ever deleted.
5. Classified inputs (`thoughts&convos/`) are never committed, published, quoted, or required by any public document.
6. No physical claim promotes past *calculated* or *design target* without instrumented bench data. Simulation completeness is not fabrication; the dossier says so everywhere it counts.

*That is all. Dismissed — and if you build one, the first machine shop wins the future.*
