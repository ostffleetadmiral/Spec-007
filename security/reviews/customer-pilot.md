# Customer-Pilot Report — FANO-1 desk as deployed

- lane: `customer-pilot`
- named authority: pilot operator and named acceptance owner
- reviewing seat: `digit` (fleet ed25519 seat `43b44295…d16fc31`)
- pilot operator of record: AdmPaul (fleet admiral, delegating
  authority) · acceptance owner: same — the desk's own operator is
  the pilot population today, disclosed honestly
- reviewer of record: Devin (SWE-2) review agent under fleet
  delegation, 2026-11-21
- scope date: 2026-11-21 · disposition: `evidence_filed`

## Evidence bundle reviewed

`site/index.html` (desk gate), `site/assets/fano-auth.js` (enrollment
path), `docs/en/spec-007-economic-assessment.en.md` +
`docs/zh-Hant/…` (the provisioning-economics ledger).

## 1. Enrollment

Enrollment on the live desk is real, not demo: covenant signature
minted at enrollment by the vendored core; restricted callsigns
(`Q`, `00x`, canon names) enroll only under a signed grant bound to
the recipient pk — one-shot, expiry-enforced, wrong-subject refused.
`Ramsey 006` is hash-pinned FLEET-ADMIRAL genesis. Identity at rest:
PBKDF2(100k)+AES-256-GCM wrapped keystore, `burn` removes residue.
The pledge gate is honest about being advisory locally and real at
network admission — stated to the enrollee in `site/veracity.html`.

## 2. Failure modes (pilot-observed + on record)

- **Session exposure**: unlocked `session.sk` lives in page memory —
  devtools/same-origin scripts can read it (GRAY-04, declared).
  Mitigations: lock, idle timeout, unload wipe.
- **Desk-local forgery cosmetics**: insider-written flag chrome locks
  the forger's own desk (GRAY-02) — a confusing but fail-closed UX.
- **Legacy relay mode**: broadcast hub exposes traffic to authorized
  peers (XPLT-05) — pilot guidance: run `rations-relay-v2`, never
  broadcast for pilot traffic.
- **Desk displacement incident (2026-11)**: the deployed root was
  replaced by a seed landing for ~3 days — recovered with the seed
  preserved at `/reboot.html` and a rebuilt recovery lane at
  `/recovery.html`. A real pilot-experience failure mode, fixed, with
  the fix itself shipped as a feature.
- **Support burden**: the desk is self-contained (quine + static
  assets) — no server-side support channel exists today; incidents
  surface via the findings corpus + recovery lanes.

## 3. Data handling

Identity and keystores are client-local (`localStorage`), wrapped at
rest, wiped on lock/burn; nothing leaves the desk except sealed wire
frames. The recovery lanes (`/recovery.html`) verify artifacts by
hash before opening and perform no host mutation — honest install
boundary for a static Pages deployment.

## 4. Go / no-go criteria (pilot frame)

| criterion | state |
|---|---|
| Enrollment binds identity cryptographically | GO — ed25519 covenant + grant-bound callsigns |
| At-rest secret protection | GO — wrapped keystore, measured KDF cost |
| Honest security claims to operator | GO — advisory/real boundary stated in-product |
| Support + rollback path | CONDITIONAL — recovery lanes live today; no staffed support channel (correct for a single-operator pilot) |
| Confidential traffic mode | CONDITIONAL — v2 relay required; broadcast is opt-in exposure |

## Verdict

**Conditional GO for the current pilot shape** — single-operator,
research-desk, self-supporting. The desk does what it claims, files
what it fails, and tells the operator the truth about its own
boundaries. Scale-up past a single trusted operator would need the
support-channel and relay-deployment questions answered first — the
evidence is on record either way.
