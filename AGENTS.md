# Spec-007 — Agent Guide

The flagship dossier: immutable `spec-007.md` baseline + integer-only Zig
harnesses + Q128.128 fixed-point shadow verification + the FANO-1 desk
(`site/` — publishable static tree) + the `security/` lab battery.
Documentation doctrine: claims, arithmetic proof, implementation evidence,
failure/rejection, and cost are recorded separately — see the research
dossier twins under `docs/`.

## Build & verify

```bash
tools/publish-check.sh          # the release gate — ALL of it, every time
zig build test                  # deps + spec008 harnesses (integer-only)
node security/team-sweep-2.mjs  # consolidated sweep — 85 probes, exits 1 on any OPEN
node security/capstone-audit.mjs
node security/sentinel-sweep.mjs
node security/superpowers-audit.mjs
node security/gov-stress.mjs    # needs out/ivector-lattice.json (lattice-probe.mjs first)
node security/k3-stress.mjs
node security/comms-suite.mjs   # canonical mode needs the docker WAN lab
node security/kali-sweep.mjs    # external-tooling replay
node security/fleet-manifest.mjs --verify   # canon load gate (never signs)
sh tools/deploy-pages.sh        # atomic gh-pages deploy via detached worktree
```

## Standing rules (learned the hard way — waves 1–9)

- **`spec-007.md` is immutable.** Its sha256 is pinned in the terminal
  (`sha` command) and publish-check; never edit it.
- **Integer-only Zig core.** f64/f32 live only in explicitly marked
  sidecar/display paths; `grep -nE "f32|f64" src/*.zig` must show only
  annotated boundary reads (ZIG-01 enforces).
- **Twin parity.** `docs/en/` and `docs/zh-Hant/` dossier/ops twins and
  `site/dossier*.html` rows stay synchronized; the i18n dicts are exactly
  1:1 (DESK-12); the anomaly codex and terminal help carry full zh twins
  (DESK-21/22). Publish-check runs 18 twin gates.
- **Canon pair discipline.** `fleet-genesis.json` + `fleet-manifest.json`
  exist as signed roots AND byte-identical `site/` copies — emit is
  `--emit`-gated, load is `--verify`-gated, push stages BOTH.
- **Flag-seat singularity.** A genesis with more than one flag-seat
  member must refuse to bind (`bindFleetFlag`, `fleet-genesis-update`).
- **Findings taxonomy.** Verdicts/severities are a controlled vocabulary
  (HARN-01): HELD/HARDENED/NOTED/OPEN/EXPLOITED/ERROR/BLOCKED/CHANNEL/
  EMERGENT/PROVEN/ABSENT/PENDING × info/low/medium/high/critical.
  Absent lab services → NOTED (deferred), never ERROR or EXPLOITED.
- **No native dialogs.** `prompt()`/`alert()`/`confirm()` throw under
  Electron — the desk is a self-contained DOM application (DESK-15).
- **Bot containment.** Automation flags pin to CADET and seal every
  privilege gate; release only via signed `FANO-CONTAIN-v1` paper
  (human adjudication — never auto-burn).
- **Classification boundary.** `thoughts&convos/` is the drawer — never
  published, never committed, surname tripwire enforced.
- **`security/out/` is generated** — evidence, not source; gitignored.
- **Archives.** Completed waves land in `~/.archives/spec-007-*` with
  NOTE.md + SHA256SUMS; tarball archives carry `.sha256` sidecars.
- **Wave cadence.** Per-iteration: component checks + team-sweep-2.
  Per wave: full battery → findings.json regenerate → commit →
  `deploy-pages.sh` → BLACK-03 parity re-verify → push → archive.

## Cross-cluster evidence convention (wave 9)

Sibling-repo status on the FAMILY shelf (`site/assets/quplink.js`) is
**doc-cited**: every figure must appear verbatim in that tree's own
README/AGENTS, verified live by CLUSTER-01. The Rations bridge is
locally proven (`Rations/src/*spec007*` suites, upstream commit
e932053). Neighbor-repo WIP is not campaign work — don't commit it.

## Campaign ledger

Operation CENTURY — 10 waves × 10 iterations of reverse-engineering and
retrograde development. Wave reports: `security/out/wave-*.md`.
Dossier claims C81–C90 document the campaign; findings.json is the
merged evidence ledger (volatile — exempt from gh-pages byte-parity).
