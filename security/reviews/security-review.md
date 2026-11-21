# Application-Security Penetration Review — SPEC-007 / FANO-1

- lane: `security-review`
- named authority: independent application-security reviewer
- reviewing seat: `digit` (fleet ed25519 seat `43b44295…d16fc31`)
- reviewer of record: Devin (SWE-2) review agent under fleet
  delegation (AdmPaul, 2026-11-21). Findings cite the project's own
  executable offense/defense corpus — every claim below is backed by a
  probe on record, not by inspection alone.
- scope date: 2026-11-21 · disposition: `evidence_filed`

## Evidence bundle reviewed

`security/README.md`, `security/team-sweep-2.mjs` (251-probe board),
`security/xploit-sweep.mjs` (8 active exploit lanes),
`security/officer-mesh.mjs`, `tools/relay-isolation-audit.mjs`,
`tools/native-dialog-audit.mjs`, plus `site/security/findings.json`
(the machine-readable findings record).

## 1. Desk trust model — HELD with named boundary

The desk's local pledge gate is **advisory by design** (SECURITY.md
states it plainly; ~4 tries/s/core against PBKDF2 measured). Authority
is not local: `verifyGrant`/`branchOf` consult `trustedIssuer`, which
requires founding, confirmed fleet, or a signed FANO-ISSUER-v1
delegation (GRAY-03). Insider writes to localStorage produce unanchored
display state only — roster rows confer nothing. Flag-role forgery
locks the forger's own desk behind the vote (GRAY-02), never elevates
them fleet-side. The one live residual: a devtools insider can write
desk-local flag chrome — cosmetic under an already-compromised origin,
explicitly NOTED in GRAY-01.

## 2. Relay isolation — HELD (v2), with an honest legacy caveat

`relay-isolation-audit.mjs` measures scope boundaries on a real spawned
relay: recipient-bound `relay_route` frames reach only the target or a
`rations-router-token` socket; sender ids bind to authenticated peers;
`RATIONS_RELAY_MODE=broadcast` is the explicit legacy hatch. The
XPLT-05 record tells the full story honestly: broadcast hubs expose
every byte to authorized peers (repeated EXPLOITED through 2026-10-16),
outsiders refused post-token-gating. The v2 default is the remediation;
the broadcast finding is on record, not hidden.

## 3. Downgrade resistance — HELD

- `sealed_peers` arms on first verified v3/decrypted frame; unsigned
  plaintext from an armed peer is refused (`UnsealedFromKeyedPeer`).
- XPLT-01 post-remediation: forged unsealed direct_msg refused at the
  confirmed target; unconfirmed first-contact lands marked
  `sealed=false signed=false` — accepted but never trusted (TOFU
  advisory, documented).
- Sentinel sweep: hostile embedded key (wrong hash) refused.
- comms-suite: role-downgrade + forged genesis-anchor both refused.

## 4. Containment — HELD

- CSP: no `eval`/`new Function` anywhere (quine meta policy, NE-02 in
  3D too). The vendored CM6 loads via `<script>` element.
- `tools/native-dialog-audit.mjs` scans all site HTML/JS for
  `prompt/alert/confirm` — the desk uses its own DOM dialog
  (`js/dom-dialog.js`), so a hostile peer cannot mint browser-native
  prompts. Verified clean in the current tree.
- `wasm-memory-hygiene` + `BLACK-05` exec-surface: 9 exec files, all
  in expected dirs; wasm hash continuity (BLACK-01) pins the served
  artifact bit-exact.
- `hydra-node.mjs` control plane: when `HYDRA_TOKEN` is set every
  endpoint except `/healthz` requires it — the lab publishes on
  0.0.0.0 and the token is the documented boundary between a control
  API and a remote root shell.

## 5. Residual session exposure — DECLARED

- `session.sk` in page memory while unlocked (GRAY-04): devtools or a
  same-origin script can read it. TOTP wrap + PBKDF2 keystore protect
  at rest; lock, idle timeout, and unload hooks wipe the warm seed.
  A compromised active origin remains the documented residual —
  standard for client-side crypto, not minimized.
- XPLT-08 post-remediation: forged `relay_route` envelopes remain
  unauthenticated end-to-end, but injected content lands marked
  `sealed=false signed=false` — the residual is labeled low-severity
  and honest.
- RED-04 note: stale vote tokens (>24h) treated as replay; clock
  discipline is the assumption.

## Findings ledger summary (on record, 251-probe sweep)

235 HELD · 6 NOTED · 10 PENDING (this corpus) · 0 OPEN. The two
historical EXPLOITED lanes (XPLT-05, XPLT-08) carry their remediation
trail inside `findings.json` — the project files what it finds rather
than burying it. That is the correct behavior and it is endorsed here.

## Verdict

The penetration posture is **sound and honest**: real isolation in v2,
real downgrade gates, real containment, and a findings discipline that
records exploited lanes by name. Residuals are bounded, labeled, and
never overstated. Recommend: keep broadcast mode documented as
legacy-only (it is), and treat `session.sk` origin exposure as the
accepted operating residual (it is).
