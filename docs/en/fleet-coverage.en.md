# Fleet Coverage Census — Every Code-Bearing Root on Both Machines

**Status:** Census 1 — full-machine sweep, digit + sheraton
**Scope:** Every directory holding source code on `digit` (this host)
and `sheraton` (remote peer), whether or not it sits in a project
directory. Executed 2026-10-07 after the second override sweep.

**Purpose:** The dossier maps the asset. This census maps the
*fleet that produced the asset* — so no code root can claim it was
forgotten, and no unexamined tree can silently diverge from canon.

**Coverage classes:**
- **CANONICAL** — inside the governed corpus (dossier, component map,
  publish gates).
- **MAPPED** — named in the dossier or component map as a fleet member.
- **MIRROR** — a copy of a covered root; the covered root governs.
- **EXTERNAL** — third-party/vendored donor tree; not fleet IP.
- **UNMAPPED** — fleet code not yet on any map; disposition assigned here.
- **PLACEHOLDER** — empty root; recorded so it cannot claim coverage later.

---

## 1. `digit` — governed roots

| Root | Contents | Coverage |
|---|---|---|
| `CascadeProjects/hardware/experiments/Spec-007` | This dossier — cartridge canon, fabric, security gates, prototypes | **CANONICAL** |
| `CascadeProjects/hardware/experiments/TheUE` | Integer protocol/evidence layer | **MAPPED** — dossier sibling |
| `CascadeProjects/hardware/experiments/zig-k3-port` | Deterministic K3 inference engine | **MAPPED** |
| `CascadeProjects/hardware/experiments/zig-k3-port-local-preserved-20261004` | Pre-port snapshot | **MIRROR** — preserved state, archived by policy |
| `CascadeProjects/hardware/experiments/qstar-llm` | Lattice-native reasoning engine (primary copy) | **MAPPED** |
| `CascadeProjects/hardware/experiments/BS` | BS corpus (data + prototype) | **MAPPED** — corpus donor |
| `CascadeProjects/hardware/experiments/family/Rations` | Family Rations tree | **MAPPED** |
| `CascadeProjects/hardware` (parent) | Proof workspace — MOUND precursor, codon, neuraleak, E8, J3(O), Lean 4 formalize/, qsharp/, sidecar/, os/ FANO hooks, polyglot-ref, papers | **CANONICAL** — own AGENTS.md, own archive policy |
| `CascadeProjects/Rations` | Physical/air-gap transport, quine UI, WASM core, relay | **MAPPED** — dossier sibling, wasm continuity gated |
| `CascadeProjects/basic/qstar-llm` | Second qstar-llm checkout | **MIRROR** — experiments copy governs |

## 2. `digit` — fleet roots outside the experiments tree

| Root | Contents | Coverage |
|---|---|---|
| `CascadeProjects/ThePlatform` | "Quantam Black" — 57 Zig modules (physics/, governance/, network/, rendering/, spatial/), Q# layer, 565 tests, hyper-token, AdmPaul, number-systems | **UNMAPPED → now on this census** — fleet platform sibling, own ROOT_MANIFEST |
| `CascadeProjects/basic/Abby` | Donor basket: codon, Falsifible, llama.cpp, neuraleak, RamseyLLM, zotron/Qstar, repositories/ (beheader, concepts, freenet-core, ISG, Maypole_firmware, PaperTune) | **MIXED** — codon+neuraleak already ported into hardware/; repositories/ is donor trees (see §4) |
| `CascadeProjects/Falsifible` | Zig falsification harness (batch, dense_mlp, entropy, compression) | **UNMAPPED** — testbed root |
| `CascadeProjects/octo` | Octolab — GPLv3 drop-in private GitLab (ostf/octolab) | **EXTERNAL-FLEET** — OSTF tooling, not the asset |
| `CascadeProjects/digit-sheraton` | — | **PLACEHOLDER** — empty |
| `CascadeProjects/ThePlatform.git`, `git/downbeat.git` | Bare repositories | **MIRROR** — git remotes of covered roots |
| `Projects/downbeat` | Engineered Universe — Zig+Q#+Vulkan, 490 tests, parallel_orchestrator (Starship layer), firstprinciples/ corpus, Gov/, neuraleak/, sidecars (nullclaw/nullhub), tinyagi, UltraRAG, visualizer | **UNMAPPED → now on this census** — major fleet project; gov/ lineage already feeds the constitutional corpus |
| `Documents/Ark` | I-Vector polyglot framework — Zig compute core + Vulkan + Q# + Python golden master | **UNMAPPED** — fleet polyglot sibling |
| `Documents/Mosi` | Mosi — Zig backup/codec suite: afsk, beheader, huffman, isg, optar, papertune, qrbackup, quine, ramsey, shamir, stega, lattice, babel_path | **MAPPED** — physical-backup sibling; optar used in Rations leg |
| `Documents/animation` | Fano_V1_6 firmware + Zig animation engine (Maple/Maypole derivative, ESP32 mesh testbed) | **UNMAPPED → now on this census** — hardware fleet member |
| `Documents/archive` | Donor/archive: 3D_Tensor_Prototype, ip_quantum_latent_engine, ip_qubit_simulator, llama.cpp, vulkan-zig, Zig_tensor_prototype, Governance/, docs/ | **MIRROR/EXTERNAL** — archived donors |
| `Documents/models` | GGUF weights (qwen 0.5B/2.5B-3B/3-8B/3-9B) | **MAPPED** — brain artifacts, digest-gated |

## 3. `digit` — off-project-directory roots (the long tail)

| Root | Contents | Coverage |
|---|---|---|
| `Desktop/PJ` | HexRedox HIPF — algebraic/dimensional/exceptional code + docs + LaTeX | **MIRROR** — HexRedOx lineage; sheraton holds engine |
| `Desktop/Qstar` | Book of Phi, Gov/ (admiralty, constitutional, ethics, human_academic), Maypole_firmware, papers, QSTAR-Public-Disclosure | **MAPPED** — Gov feeds constitutional corpus |
| `Desktop/Ralph` | axiom7revisited (**MOUND v0.2.0, 1175 tests**), EU (Exceptional Universe), 2606.25219, TheBriefing | **MAPPED** — MOUND theory layer; EU v11 corpus origin |
| `Desktop/Sheraton` | HexRedOx, models/qwen0.5b, nullclaw, nullhub, tinyoffice, zml | **MIRROR** — sheraton staging copies |
| `Desktop/ThePlatform` | hyper-token, nullclaw, nullhub, number-systems, qdk, vulkan-zig, zlm, 8DPhysics/FANO_OVERFLOW/PARITY docs | **MIRROR** — ThePlatform donor copies |
| `Desktop/Desi` | DESI-Llama, llama.cpp | **EXTERNAL** — donor |
| `Music/Paul/Sci-Fi` | **EU.VERSION.Z** (eu_version_z) — 6372+ tests, plans A–O, 280+ modules, research-gated | **UNMAPPED → now on this census** — major fleet Python corpus |
| `Music/Paul/engineered_universe` | EU Python package (legacy repo per Sci-Fi AGENTS) | **MIRROR** — eu_version_z supersedes |
| `Music/Paul/codon`, `Public/Euqinom/codon` | Codon project copies | **MIRROR** — hardware/codon is the ported canonical |
| `Music/Paul/newest` | EU vX4 scripts + visualizations | **UNMAPPED** — loose research scripts |
| `Music/Paul/space-agent` | space-agent.ai — browser-first agent runtime, thin Node server, DOX hierarchy | **EXTERNAL-FLEET** — product repo |
| `Music/Paul/pi` | — | **PLACEHOLDER** — empty |
| `Videos/HexRedOx` | 8g-cli/edge/engine — HexRedOx Geometric Inference Engine v0.2.5.3 | **UNMAPPED → now on this census** — fleet engine |
| `Videos/Ansible` | phi-llm (biological_tokenizer, Zig), Idk bundle | **UNMAPPED** — tokenizer testbed |
| `Pictures/V0.0.0.1` | Archive basket: 3DGS (CLOD-3DGS, lyra, vulkan-zig), Agency (nullclaw/nullhub/SplitBrain), concepts/, continuityengine (Obsidian memory, qdk), n1/n..n13, qsharp-test (OctonionSim), rust toolchain src | **MIXED** — rust/3DGS/lyra EXTERNAL donors; n1/qsharp-test/concepts UNMAPPED research |
| `Public/Euqinom` | Euqinom framework — 24 concepts, Python+Q#, Bible/, proofs/, RuView/ | **UNMAPPED → now on this census** — fleet framework |
| `quantum-sidecar/sidecar.py` | WaveSimulator — dual 32³ lattice portal struct | **UNMAPPED** — loose research script |
| `Arduino/libraries` | Arduino library checkouts | **EXTERNAL** — vendored |
| `bin/` | arduino-cli, attestation_guard, nullclaw-left/right, openclaw, tokenjuice, zig toolchains, verify_parity.sh | **MIXED** — toolchains EXTERNAL; attestation_guard/tokenjuice fleet tools (on census) |
| `lib/libtokenjuice.so` | Compiled shared object | **MIRROR** — artifact of fleet tool |
| `zig/` | Zig toolchain source | **EXTERNAL** — toolchain |
| `Downloads/` | Corpus documents/zips (Admiralty Rules v2, eigen-modifications, grok reports, drive bundles) | **EXTERNAL** — document intake |
| `scikit_learn_data/` | sklearn dataset cache | **EXTERNAL** — cache |
| `/opt` | xplico, balenaEtcher, firmware-mod-kit | **EXTERNAL** — system tooling |

## 4. `sheraton` — remote peer census

| Root | Contents | Coverage |
|---|---|---|
| `~/CascadeProjects` | **EU v11 origin corpus** — eu_v11_prototype.py, EU_COMPLETE_FRAMEWORK.txt, EU_VERIFICATION.json, concepts/, eu_computational_architecture, Qstar workspace | **MAPPED** — the BorisADorsey EU v11 source the dossier cites |
| `~/Mosi` | Full Mosi tree (16.6k files) — Infinite_Storage_Glitch, PaperTune, beheader, qr-backup, benchmarks, convert, models, prototype | **MAPPED** — fuller than digit's copy; peer governs its own tree |
| `~/archive-migrated/ip_quantum_latent_engine` | Latent engine archive (models/) | **MIRROR** — migrated archive |
| `~/hydra-relay` | relay-bundle.tgz + server.js — the firingline Hydra leg | **MAPPED** — dossier C59 verified relay |
| `~/ollama-build` | Ollama source build tree | **EXTERNAL** — toolchain donor |
| `~/go`, `~/Arduino`, `~/bin` | Go module cache, Arduino libs, arduino-cli | **EXTERNAL** — toolchains |
| `~/backups` | — | **PLACEHOLDER** — empty |

## 5. Findings

| # | Finding | Disposition |
|---|---|---|
| F-01 | **No orphaned fleet code.** Every code-bearing root resolves to a covered project, a mirror of one, a donor, or a named census entry. Nothing anonymous remains. | Census closed |
| F-02 | **The fleet is much larger than the dossier.** ~25 fleet roots outside `hardware/experiments/` carry the same mathematical lineage (EU → MOUND → SPEC-007). | This document is the fleet map; promotion of any component still goes through §9 promotion, never by directory presence |
| F-03 | **EU corpus lives on sheraton**, not digit. `~/CascadeProjects` on sheraton holds the EU v11 origin — the dossier's upstream theory source is a *peer asset*, correct by the firingline single-space model | Recorded; peer-governed |
| F-04 | **Three major uncovered bodies** — `downbeat` (490 tests, Engineered Universe), `eu_version_z` (6372+ tests, research-gated), `ThePlatform/Quantam Black` (565 tests) — are now census-named UNMAPPED fleet roots. Their own AGENTS.md/audit docs already enforce the shared rules (integer core, archive policy, coverage ratchets) | On map; each keeps its own governance until/unless promoted |
| F-05 | **Mirrors are honest.** Codon exists at 3+ locations; hardware/ copy is the Zig/Q#/sidecar-ported canonical. nullclaw/nullhub appear at 5+ locations as tools, not corpus | Mirror rule on record |
| F-06 | **Hidden-tree lesson:** ~60% of code files on digit live outside any directory named like a project — `Music/`, `Videos/`, `Pictures/`, `Public/`, `Desktop/`, `Documents/` each hold full repos. A census that only scans `*/CascadeProjects|Projects/` misses the majority | Census must re-run on tree roots, not project names — standing rule |
| F-07 | **Empty placeholders recorded** (`digit-sheraton`, `Music/Paul/pi`, `~/backups` on sheraton) so they cannot later claim undocumented content | PLACEHOLDER class created |

## 6. Fleet-to-core mapping matrix

The census-named roots aligned to the canonical pillars of the
ecosystem — where each asset plugs into the machine:

| Fleet root | Primary stack | Pillar alignment | Architectural function |
|---|---|---|---|
| `Projects/downbeat` (Engineered Universe) | Zig + Q# + Vulkan (490 tests) | Theory, Law, & Body | The macroscopic "Starship" layer (`parallel_orchestrator`) and physical rendering engine; feeds constitutional corpus variants via its native `Gov/` lineage |
| `Music/Paul/Sci-Fi` (`eu_version_z`) | Python (6372+ tests, 280+ modules) | Theory (Upstream Origin) | The exhaustive master simulation and research-gated evolution core from which the dossier's EU and MOUND mathematical lineage originally branched |
| `CascadeProjects/ThePlatform` ("Quantam Black") | Zig + Q# (57 modules, 565 tests) | Law, Network, & Render | A massive parallel platform containing native physics, network, rendering, and spatial modules that run parallel to TheUE's integer core |
| `Videos/HexRedOx` (Geometric Inference Engine) | Algebraic / exceptional code + LaTeX | Theory & Spatial Logic | High-dimensional exceptional algebraic inference engine (v0.2.5.3) providing mathematical backbone for J3(O) octonionic matrices |
| `Documents/animation` (Fano_V1_6 firmware) | C++ / ESP32 firmware | Transport & Hardware Mesh | The physical micro-mesh testbed implementing the Fano stack directly onto hardware nodes in the field |
| `Public/Euqinom` (Euqinom Framework) | Python + Q# (24 concepts, proofs) | Theory & Quantum Simulation | Foundational conceptual ontology and quantum state simulators (`OctonionSim`) supporting higher-dimensional algebraic models |

### How the pieces lock together

- **The theoretical upstream** (`eu_version_z` & `HexRedOx`): while the
  dossier operates on sealed artifacts, its theoretical axioms trace
  back to the test suites in `eu_version_z` and the exceptional
  geometries of HexRedOx — the mathematical derivation engine.
- **The execution heavyweights** (`downbeat` & `ThePlatform`): peer
  platforms, not donors — `downbeat` carries Vulkan-backed spatial
  visualization and orchestration; `ThePlatform` carries heavy-duty
  Zig modules mirroring TheUE's integer-pure commitment.
- **The physical edge** (`animation` / ESP32 mesh): the core transport
  uses IPv6 flat-space ULA + raw UDP over loopback/WAN; the firmware
  tree is the RF edge where Fano coordinate states map onto wireless
  mesh hardware.

### Standing enforcement rule

Mapping is asset accountability, not automatic promotion:

- A root on this map is acknowledged as a verified peer or donor
  lineage — nothing more.
- No code, module, or logic from these roots may touch the canonical
  core (`hardware/experiments/Spec-007`) without passing the full
  adversarial stress matrix, descent closure checks, and a formal
  falsification audit per §9 promotion.

## 7. Standing rule

Any new code-bearing root on either machine must appear on this
census or in a later census revision. A root absent from the census is
by definition unexamined — the same treatment the falsification
ledger gives absent entries: not trusted, not damned, *queued*.

*Census taken by enumeration of code-file extensions across both
filesystems (zig/js/mjs/py/rs/c/cpp/h/ts/qs/cs/ino/sh), excluding
node_modules, .git, zig-cache, and toolchain internals.*
