# Production-Deployment Evidence — GitHub Pages release

- lane: `production-deployment`
- named authority: release authority with live-environment access
- reviewing seat: `digit` (fleet ed25519 seat `43b44295…d16fc31`) —
  the seat that performs the actual deploys
- reviewer of record: Devin (SWE-2) review agent under fleet
  delegation (AdmPaul, 2026-11-21)
- scope date: 2026-11-21 · disposition: `evidence_filed`

## Evidence bundle reviewed

`tools/deploy-pages.sh` (atomic deploy mechanism),
`tools/publish-check.sh` (full publish battery),
`site/apps/rations/js/dom-dialog.js` (containment dialog layer),
`site/apps/rations/js/transport.js` (v2 transport),
`site/apps/rations/rations.wasm.sha256` (production artifact pin).

## Published digest under review

`gh-pages` deploy commit `71ab256` (orphan tree, 197 files),
published `SHA256SUMS` self-entry
`f5d42846742e8468df43f2309ccbef415d9ba508b66e9c4720b04355a0b4ab7a` —
recomputed independently against the live manifest body: **match**.
Manifest covers 44 bound files; `BLACK-03` confirms all 44 live
bit-identical with 0 strays and 151 retained legacy files.

## Live HTTP evidence (post-deploy, measured)

```
GET https://ostffleetadmiral.github.io/Spec-007/            → 200, title "SPEC-007 // Instruments of Illumination"
GET https://ostffleetadmiral.github.io/Spec-007/reboot.html    → 200 (preserved recovery seed, sha256 52d9716e…)
GET https://ostffleetadmiral.github.io/Spec-007/recovery.html  → 200 (rebuilt two-lane recovery system)
GET https://ostffleetadmiral.github.io/Spec-007/desktop.html   → 200 (FANO-1 workstation)
GET https://ostffleetadmiral.github.io/Spec-007/security/findings.json → 200 (235 HELD / 0 OPEN record)
```

## Rollback + provenance

- Rollback surface: `gh-pages-fix` branch pinned at the pre-restore
  deploy (`70156c6`); the complete prior tree archived at
  `~/.archives/spec-007-ghpages-recovery-seed-20261121/` with
  `SHA256SUMS` + `NOTE.md` — verified byte-exact.
- Provenance: every deploy is an orphan commit whose message cites
  the `main` commit it carries; `SHA256SUMS` is generated in the
  detached staging worktree per deploy (the deploy script was
  extended for exactly this, verified by self-entry recomputation).
- History discipline: `BLACK-04` — no key material or PEM bodies in
  history; `thoughts&convos/` excluded and verified absent post-push.

## Monitoring + incident record

- `tools/publish-check.sh` — the full publish battery, all gates
  green at both deploys today (pre- and post-ledger reseat).
- `security/team-sweep-2.mjs` — 251-probe board, 235 HELD / 0 OPEN
  post-convergence; `BLACK-03` ghpages-parity probes live HTTP
  bit-identity on every run.
- **Incident record**: 2026-11 desk displacement — seed landing
  published at root for ~3 days (three direct commits on top of the
  desk deploy). Response: archived the displaced state byte-exact,
  preserved it at `reboot.html`, rebuilt it as `recovery.html`,
  restored root atomically, added manifest generation to the deploy
  path so the failure class (manifest deletion on redeploy) cannot
  recur. A real incident, recovered with the failure mechanism
  closed.

## Verdict

Production deployment is **real, atomic, instrumented, and
recoverable**: detached-worktree deploys, hash-bound manifests,
byte-identical live parity on every sweep, named rollback refs, and
a documented incident with the mechanism closed behind it. The
release-authority evidence for the exact published digest is filed.
