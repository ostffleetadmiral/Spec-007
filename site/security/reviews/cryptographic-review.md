# Cryptographic Review — SPEC-007 / FANO-1 desk + Rations core

- lane: `cryptographic-review`
- named authority: independent cryptographic reviewer
- reviewing seat: `sheraton` (fleet ed25519 seat `c09e3f95…af02ae`), clean
  `git archive` checkout of `0454f19` — independent machine, independent
  working tree
- reviewer of record: Devin (SWE-2) review agent executing under fleet
  delegation (AdmPaul, 2026-11-21). Mechanical checks re-executed on the
  sheraton seat; findings cite the repository's own executable audits.
- scope date: 2026-11-21 · disposition: `evidence_filed`

## Evidence bundle reviewed

| artifact | role |
|---|---|
| `site/apps/rations/rations.wasm` (+ `.sha256`) | production crypto core, 177 `rations_*` exports |
| `site/apps/rations/js/transport.js` | relay transport bridge, auth response path |
| `site/assets/fano-auth.js` | desk identity, covenant signature, keystore, TOTP |
| `security/harness.mjs` | headless WASM harness — the deliberate-attack surface |
| `security/hydra-node.mjs` | WAN lab node — identity, ledger, control-plane gate |
| `tools/wasm-memory-hygiene.mjs` | `rations_free` ABI scanner |

## 1. Ed25519 use — HELD

`rations_ed25519_keypair_seed / sign / verify` are the only signing
primitives in the bundle; all are exported by the pinned WASM artifact
(`sha256:0d321d2d…`, sidecar verifies). Observed call sites are
consistent and canonical:

- Covenant signature: Ed25519 over the canonical covenant bytes
  (`fano-auth.js` COVENANT constant), minted at enrollment by the core —
  not ceremony.
- Role certificates and reset-vote tokens: issuer→subject bound; the
  founding callsign is hash-pinned at genesis (RED-03 holds).
- Seed handling: the wire API wants the 64-byte expanded key;
  `expandSeed` derives `sk64` from the stored 32-byte seed inside WASM
  memory, returns copies, and frees both intermediates with the
  two-argument `rations_free` (wipe-before-release).
- Relay challenge: `rations_p2p_relay_auth_sign` signs
  `rations-relay-auth-v1‖challenge‖peer_id` — the 32-byte
  relay-supplied challenge, hex-decoded and length-checked
  (`transport.js:50-69`). Response carries `peer_id` + `sig` only; the
  sender id is bound to the authenticated peer relay-side.

No home-grown signature construction anywhere in the bundle. The JS
layer marshals; the math is all in the reviewed core.

## 2. X25519 use — HELD (upstream-verified)

`rations_channel_handshake` exports this node's 32-byte ephemeral
X25519 public key; `rations_channel_seal` seals frames under the shared
session key. Per the vendored family source
(`family/Rations/src/p2p/channel_crypto.zig`): scalar clamping per
RFC 7748, shared secret → Blake2b-256 KDF. The WebRTC bridge drives the
same X25519 handshake over DataChannel (`HANDSHAKE_PPKIND = 32`).
Persistent phone identity is a separate X25519 keypair
(`rations_phone_pk`), with `rations_phone_set_identity` pinning the
seed at node init. `BadHandshake` is the named refusal path in the
artifact's string table.

## 3. AES-256-GCM use — HELD

- Keystore wrap: `PBKDF2(pass, salt, 100_000) → AES-256-GCM`
  (`fano-auth.js` ITERATIONS=100000), `{wrapped:true}` records in
  localStorage; plaintext identity tolerated but the wrapped form is
  the production shape. SECURITY.md's own measurement: ~4 tries/s/core
  against the passphrase — the desk gate is honestly advisory.
- `rations_aes_encrypt/decrypt` carry the 16-byte GCM tag explicitly;
  `aesDec` returns null on tag failure (fail-closed).
- Finding (informational, not a defect): PBKDF2-100k is below current
  OWASP guidance (~210k for SHA-256). The binding is honest and
  measured; a future revision should ratchet iterations with a
  versioned keystore header.

## 4. v3 envelopes — HELD

Direct-message wire ladder (upstream contract, confirmed in bundle):

- v1 `[flags=0][kind][body]` — legacy unsigned, lands marked
  `sealed=false signed=false`.
- v2 `[flags=2|3]` — 32-byte msg_id for replay dedup + receipts.
- v3 `flags bit 2` — 64-byte Ed25519 signature over
  `domain‖sender‖recipient‖msg_id‖kind‖body`; the sender's peer_id is
  the signing public key. A verified v3 (or successfully decrypted
  sealed frame) arms `sealed_peers`.

The sealed 136-byte FANO wire (`F1` envelope) verifies under strict
`len==136` in both Python and JS twins (COMM-01/02); covered-flip,
oversize, and short frames all drop.

## 5. Relay authentication — HELD

`rations-relay-v2` is the isolated default: relay challenges each
socket, verifies `Ed25519(domain‖challenge‖peer_id)`, and binds sender
ids. `rations-relay-v1` remains in the protocol list only so an
explicit legacy broadcast relay can run — documented escape hatch, not
silent fallback. `rations-router-token.<token>` gates recipient-bound
`relay_route` frames; bounded seen-set suppresses echo re-circulation.

## 6. Downgrade gates — HELD

- `sealed_peers` armed on first verified v3/decrypted frame; unsigned
  plaintext from an armed peer → `UnsealedFromKeyedPeer` (upstream
  contract).
- Post-XPLT-01 remediation verified by the offense suite:
  `unsealed-sender-forgery` probe confirms the confirmed-channel
  downgrade gate refuses forged unsigned frames.
- `sentinel-sweep` exercises the hostile-pin case (embedded key whose
  hash ≠ local pin) — refusal holds.
- `comms-suite` flag-credential-forgery: role-downgrade and forged
  genesis-anchor both refused.

## 7. Memory wiping — HELD

- `rations_secure_wipe(ptr, len)` is a real export;
  `rations_free(ptr, len)` wipes the caller-visible range before
  release (upstream contract).
- `tools/wasm-memory-hygiene.mjs` scans all site/security JS+HTML for
  single-argument `rations_free` calls (the ABI defect that used to
  leave allocations live); current tree is clean — every call site
  carries both args.
- `fano-auth.js` zeroes `session.sk` on fold; `burn` removes all
  keystore residue (BLACK suite). TOTP wrap key derives from
  `sha256("FANO-TOTP-v1"‖sk)` — destroyed with the session.

## Residuals (declared, not hidden)

- `session.sk` lives in page memory while unlocked — devtools or a
  same-origin script can read it (GRAY-04). Standard client-side
  exposure; the at-rest wrap + wipe-on-fold bound the rest.
- The RFC 6238 TOTP implementation uses SHA-1 in HMAC — protocol
  mandated, not a weakness claim; confined to the authenticator lane.
- Desk-local pledge gate is advisory against a local attacker with
  keystore+passphrase access; network admission is the real gate —
  stated plainly in SECURITY.md and verified by the seat.

## Verdict

The cryptographic construction in the bundle is **coherent, canonical,
and honest**: real primitives (Ed25519/X25519/AES-256-GCM/Blake2b/
PBKDF2/SHA-256), a correct versioned-envelope ladder, a live downgrade
gate verified by offense probes, and a real wipe boundary with a
ratcheted scanner. No fabricated crypto, no ceremonial signatures.
The PBKDF2 iteration count is the one forward-looking recommendation.
