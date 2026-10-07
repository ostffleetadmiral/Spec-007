# Security — SPEC-007 / FANO-1

## Threat model

The workstation's pledge gate is **advisory on a single desk** (a local
attacker with the keystore and passphrase fights PBKDF2, ~4 tries/s on
one core — measured) and **real at network admission**: callsign
enrollment, restricted-callsign grants, and role elevation are
cryptographically bound. See `site/veracity.html` for the honest
statement of what is and isn't crypto.

Guarantees that hold:

- Covenant signatures are real Ed25519 over real bytes.
- Keystores are PBKDF2(100k)+AES-256-GCM; `burn` removes all residue.
- Role certs bind issuer→subject; elevated roles require a rostered
  issuer (`fano1.issuers`, seeded by genesis).
- Restricted callsigns (`Q`, all `00x` designations, canon names)
  enroll only under a signed grant bound to the recipient's pk —
  one-shot, expiry-enforced, wrong-subject rejected.
- `Ramsey 006` is hash-pinned as FLEET-ADMIRAL genesis.
- The production WASM artifact is sha256-pinned and verified at sweep.

## The rig (`security/`)

Four teams, all probes executable:

- **RED** — forged signatures, tampered keystores, malformed frames,
  origin abuse, flood/oversize, replay.
- **BLUE** — live defense verification: wasm hash continuity, CSP,
  AES-GCM tag rejection, rate limits, debug surface off in production.
- **BLACK** — key-strength bounds, capability notes (keystore exfil via
  own stego channel is ciphertext-only), Shamir threshold, burn residue.
- **COMM** — the Hydra WAN lab (see `security/README.md`): sealed
  transport across segmented/impaired/partitioned networks, per-node
  ledgers, consensus forgery rejection, callsign lifecycle.

Run:

```sh
node security/suite.mjs                 # 31 probes, needs relay
node security/comms-suite.mjs --local   # 5-node localhost lab
node security/comms-suite.mjs           # full docker WAN lab
docker compose -f security/docker-compose.sec.yml up --abort-on-container-exit
```

Results land in `site/security/findings.json` (machine-readable) and
`site/verdict.html` (adjudicated).

## Reporting

This is a research dossier — no deployed service. If a probe here
surfaces a real defect in `family/Rations` (it has — see the
peer-discovery ping-pong fix), patch upstream with a regression test,
rebuild the artifact via `tools/release.sh`, re-pin the sha256 sidecar,
and record the finding in the sweep output.
