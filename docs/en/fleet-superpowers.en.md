# Fleet Superpowers — Security Team Capability Ledger

Date: 2026-10-07 · Auditor: `security/superpowers-audit.mjs` (live-verified) · Result: **27/28 proven, 1 pending, 9 honest limits**

Every entry below was verified against its evidence anchor on audit day — file presence plus code markers, with live Ed25519 verification of the genesis signatures. Nothing in this ledger is asserted without a probe behind it.

## Identity & Keys

| Power | Evidence | Scope note |
|---|---|---|
| ed25519 identity, PBKDF2 + AES-256-GCM keystore wrap | `fano-auth.js` | secret key exists only in session memory while unlocked |
| TOTP second factor (Google Authenticator class) | `fano-auth.js` + covenant flow | clock-bound; setup revealed at sign-in |
| Roster-gated grants + role certificates | `verifyGrant`/`grantBytes` | roster is desk-local; fleet auth needs the anchor |
| **Roaming flag sign-in** — FLEET-ADMIRAL on a foreign founded desk without claiming it | `bindFleetFlag` + DESK-01 probe | **PENDING**: needs `admiral` member in published genesis (`fleet-genesis-update.mjs --pk <hex>`) |
| Desk transfer — `FANO-DESK-v1`, keystore stays wrapped end-to-end | DESK-03/04/05 | DOM import path (Electron-safe) |
| Unlock throttle — persisted exponential backoff | `fano1.auth.fail` | depth, not wall: local attacker can clear localStorage |

## Escrow & Governance

| Power | Evidence | Scope note |
|---|---|---|
| Shamir escrow — 3-of-3 unanimous reconstruction of the flag seed | `spec008_qstar_escrow.zig` | mirrors the reset-vote doctrine cryptographically |
| 2-of-3 quorum — seat-dark recovery | same harness | every pair reconstructs |
| Foreign-share forgery detected via sha256 commitment | same harness | Shamir itself has no integrity tag — the commitment layer supplies it |
| Unanimous reset vote on foreign-origin flag desk | `fano-reset.js` + token minter | dual-signed live: digit local + sheraton over ssh |
| Dual-signed genesis root + TOFU pin + freshness horizon | `fleet_bootstrap.py`, sentinel-sweep | cold-boot caveat in Limits |

## Wire & Transport

| Power | Evidence | Scope note |
|---|---|---|
| 136-B sealed envelope, strict-len verify, JS↔Python↔WASM twins | `fano-mesh-bridge.mjs`, `fano-wan-gateway.mjs` | capstone: 86/86 covered-byte forgeries refused |
| O(1) route decision — ≤14 instrumented ops, ≤42-hop bound | `route-o1.mjs` | decision only — never delivery latency |
| 10 physical transports byte-exact: QR, OPTAR, audio, cassette, paperback, stega, polyglot-JAR, LoRa, WiFi, maypole bridge | `spec008_qstar_carriage.zig` | LoRa MTU 255 B honored; `NotForUs` addressing |
| Staleness detection — wound/permutation/truncation all flagged | `staleness-detect.mjs` | detects divergence, not forgery |
| WAN-edge seal-gated gateway + measured address book rendezvous | `fano-wan-gateway.mjs`, `fleet-map.mjs` | external v6 inbound UNVERIFIED |
| Multi-hop relay — TTL-16 bounded, greedy forward, honest drop | `spec008_qstar_mesh.zig` | empty peer table = clean drop |
| Mesh AEAD — XChaCha20-Poly1305 on the envelope | mesh harness | tamper + wrong-key refused |

## Archive & Survival

| Power | Evidence | Scope note |
|---|---|---|
| Lattice atomization — 3375 cells → 20,250 QR portals | `spec008_qstar_archive.zig` | collapse-resilient deep archive |
| Recursive QR nest — dossier-scale (8 KB tested) round-trip | same | MAX_DEPTH 8 honored |
| RMSY container — desk-state compression byte-exact | same | dedup + lattice transform |
| VFS lattice pages — pin/evict, agent state, heartbeat registry | same | 421-node page map |
| Paperback print — 2-of-3 Shamir pages survive a lost sheet | carriage harness | latent threshold; `decode` needs full container |

## Countermeasures (BLUE/BLACK posture)

| Power | Evidence |
|---|---|
| Hardened server — GET/HEAD only, traversal 404, no listing, CSP/nosniff/frame headers | `tools/serve.py` + BLUE probes |
| Surname/classified tripwire on the public tree | `publish-check.sh` + SPEC-004 probes |
| Wasm artifact bit-parity + 5 manifest artifact pins | BLACK probes |
| Detached-worktree deploy — shared-tree hazard class eliminated | `tools/deploy-pages.sh` |
| Lockstep JS↔Python wire canon | COMM probes |

## Honest Limits — what we cannot do (and don't claim to)

1. **TOFU cold-boot** — a fully hostile board can serve a self-consistent attacker genesis on first contact; defense is out-of-band pinning.
2. **Wire parity bound** — `rsEncode` parity is XOR-sum (one-erasure recovery), not Vandermonde RS; `rsReconstruct` transposes (dep defect, routed around).
3. **Unlocked session `sk`** lives in page memory — devtools/same-origin read is inherent.
4. **Roster injection** is desk-local theater — fleet authority is published-key-gated; local UI can still be spoofed.
5. **`fano-comms.js` `prompt()`** — silent failure under Electron (composer rebuild pending).
6. **External IPv6 inbound** to the WAN edge UNVERIFIED; IPv4 inbound is CGNAT-blocked.
7. **136-B payload tail** is unauthenticated scratch — receivers MUST honor `plen`.
8. **`capacity()`** registry slots in transport deps return constants, not byte counts.
9. **Admiral member pending** — roaming sign-in is built and probed; it anchors the moment the flag pk lands in `fleet-genesis.json`.

## Reproduce

```bash
node security/superpowers-audit.mjs   # 27/28 + live genesis sig verify
zig build test                        # 799 dep + 41 harness assertions
node security/team-sweep-2.mjs        # 34 probes: 31 HELD / 3 NOTED
./tools/publish-check.sh              # all gates
```
