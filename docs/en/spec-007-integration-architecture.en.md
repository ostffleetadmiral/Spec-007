# SPEC-007 Integration Architecture

**Status:** Draft 1
**Scope:** How the verified integer-pure core (TheUE) connects to the
wider Sentience Ecosystem blueprint — the Sentience Engine (Phase 1),
The Library command center (Phase 3), and the remaining wrapper phases —
without weakening the proven boundaries.

The rule from the protocol spec governs every seam below: **boundaries
are enforced, not merged.** Nothing in the wrapper layers may bypass the
conformance gates of `spec-007-protocol.*.md` §8.

---

## 1. Layer Model

```
┌─────────────────────────────────────────────────────────────┐
│ L4 EXPERIENCE   The Library · Code Nebula · portals · eggs  │
│                 (blueprint Phases 3, 5)                     │
├─────────────────────────────────────────────────────────────┤
│ L3 EVIDENCE     findings.json (112 entries · 10 teams)      │
│     FABRIC      context/*.json audits · probe stdout streams │
│                 SSE/WS bridge — THE SENTIENCE-ENGINE SEAM    │
├─────────────────────────────────────────────────────────────┤
│ L2 COMMAND      theue-golden-vectors · descent_audit         │
│     SURFACE     cross_target_check · continuity/twenty-re    │
│                 deterministic CLIs — THE API CONTRACT        │
├─────────────────────────────────────────────────────────────┤
│ L1 CONTINUITY   ~/.archives/* · SHA256SUMS · findings corpus │
│                 (blueprint Phase 2 — already running)        │
├─────────────────────────────────────────────────────────────┤
│ L0 CORE         fixed_point (Q128.128) · science_* (65)      │
│     (LOCKED)    131-module DAG, 0 cycles, 0 float violations │
└─────────────────────────────────────────────────────────────┘
```

**L0 is immutable by contract.** Nothing above it edits it; everything
above it cites it. All UI/agent layers consume L2 outputs verbatim —
they never compute physics.

## 2. Blueprint Phase Mapping

| Blueprint phase | SPEC-007 substrate | Gap to close |
|---|---|---|
| **P1 Sentience Engine** (agent orchestration) | `findings.json` corpus, probe harnesses, audit tools = the deterministic capability set an agent may invoke | A **capability adapter**: every agent action maps to a named L2 command; agents never emit physics directly. GenesisAgency plans compile to probe invocations. |
| **P2 Continuity Engine** (persistence) | `~/.archives/` checksum-verified states + `findings.json` + `context/*-audit.json` | Already satisfied at archive level. The IDaaS/DMS layer may index archives but MUST NOT modify them (checksum lock). |
| **P3 The Library** (command center, IDE, social) | `site/` dossier (26+ pages) + findings corpus | New `command-deck` page: SSE-fed telemetry, team/finding widgets, lattice explorer. IDE/chat features are blueprint-side work, out of core scope. |
| **P4 Generative Film** | — | No core dependency; optional wrapper, not gated. |
| **P5 Code Nebula** (3D immersive) | `science_ivector` cube (15³, 421 census), Fano lines, dual ladder = the procedural geometry substrate | A geometry service exposing `cellLabel`/`census`/`ladderRung` as renderable data — data out, never math in. |
| **P6 Testing & Security** | The four adversarial teams (PHILOTIC/BREAKER/FURNACE/EMERGENT) + discriminator + descent audit | **Already built.** This phase is the core's job description; blueprint security work consumes our verdicts via L3. |
| **P7 Education** | Component maps, protocol spec, this document | Curriculum generation consumes docs read-only. |

## 3. The Evidence Fabric (Sentience-Engine Seam)

The only legal data path between core and agents:

```
probes/audits ──write──> security/out/ + context/ + site/security/findings.json
                              │
                    fabric bridge (node .mjs)
                    reads files; tails probe stdout
                              │
              SSE /event-stream ──> command deck widgets
              WS /command       <── gated commands (gate list below)
```

- **Read path:** findings corpus, descent/continuity/twenty-re reports,
  golden-vector digest. File-backed, checksum-anchored.
- **Write path:** agents may *invoke* gated commands only: `run-probe
  <name>`, `run-audit <name>`, `emit-vectors`. No raw args, no file
  writes, no core mutation. Each invocation logs to the AuditChain
  (now endian-safe).
- **Forbidden:** direct module calls, FFI into `fixed_point`, writes to
  `src/`, uncapped execution. The fabric enforces — not the agents.

## 4. Command Deck (Library Phase-3 slice)

First executable artifact: `site/command-deck.html` + bridge. Widgets
map 1:1 to verified machinery:

| Widget | Data source | Discriminator |
|---|---|---|
| Team/finding ticker | `findings.json` (team, verdict, id) | any `OPEN` verdict = breach light |
| Dividend meter | `webDividendMilli` vectors | quadratic-over-linear display |
| Hydrogen HUD | `h1SlotBit`/`h1JitterSafe` vectors | slack-boundary visualization |
| Lattice explorer | `cellLabel`/`census` data | 421 e0 cells rendered |
| Expansion horizon | `expandingDeliveryTicks` vectors | reachable vs `null` grid |
| Bifurcated comms sim | `philotic-cluster`/`carrier-flight` outputs | wire-cost badge per message |
| Descent status | `descent-audit.json` | CLOSED/OPEN banner |

Role views (Operator/Architect/Auditor) are **presentation filters on the
same evidence** — never different data. Auditor sees raw checksums;
Operator sees health aggregates; Architect sees constraint classification.
Access control is a UI concern for now; when real auth lands it gates at
the fabric bridge, not the page.

## 5. Easter Eggs (presentation layer only)

The Bond-layer presentation may hide the Codex Terminal, Möbius trigger,
and Fano lock — with one hard rule: **easter eggs are cosmetic state**,
persisted locally, never touching findings, gates, or the core. A "God
Mode" feed is just an unfiltered view of public evidence. If an egg can
affect a verdict, it is not an egg — it is a vulnerability and the
furnace owns it.

## 6. Sequencing

1. **Fabric bridge** (`security/fabric-bridge.mjs`): file-tail +
   gated-command SSE/WS server. Smallest useful slice.
2. **Command deck page** consuming the bridge (static-first: reads
   committed JSON; live upgrade when bridge runs).
3. **Lattice explorer** fed by a `cellLabel`/`census` JSON export from
   `theue-golden-vectors`-style tooling.
4. Deferred per blueprint: full agent runtime (P1), DMS (P2), film
   pipeline (P4), UE5 nebula (P5), curriculum (P7) — each enters through
   the same conformance gates when built.

Every slice ships through the 7 conformance gates of the protocol spec;
nothing gets a "UI exception."
