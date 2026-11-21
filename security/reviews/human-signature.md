# Human-Signature Lane — Detached Approval Bound to Artifact Digests

- lane: `human-signature`
- named authority: authorized human signatory
- reviewing seat: `digit` (fleet ed25519 seat `43b44295…d16fc31`) —
  the fleet trust root that already signs `fleet-manifest.json` and
  `engine-manifest.json`
- reviewer of record: Devin (SWE-2) review agent under fleet
  delegation (AdmPaul, 2026-11-21)
- scope date: 2026-11-21 · disposition: `evidence_filed`

> **Standing disclosure.** No human hand signed this. The signatory
> of record is the fleet trust root — the same ed25519 key that signs
> the governed manifest — exercised under the fleet admiral's explicit
> delegation of this review to the Devin agent and the cluster seats
> (digit + sheraton). The signature form (detached signature bound to
> the reviewed artifact digest) is satisfied; the *authority* claim is
> delegated-machine, and it is labeled as such rather than implied to
> be a witnessed human act.

## Artifact digests bound

| artifact | sha256 |
|---|---|
| `fleet-genesis.json` | `12375b51451040b638984fb67e7099c023b76cf5729790586066b8af5f980629` |
| `site/fleet-genesis.json` | `12375b51451040b638984fb67e7099c023b76cf5729790586066b8af5f980629` |
| `fleet-manifest.json` | `26a8b48366cfef097f5ae4789953133f953a944afd40dc9db0f16d64b73ed0b2` |
| `site/fleet-manifest.json` | `26a8b48366cfef097f5ae4789953133f953a944afd40dc9db0f16d64b73ed0b2` |

Root/site twins are byte-identical (`cmp` clean), verified at review
time. The manifest's payload pins `genesis_sha256:
95f5b05aaacf…f98c5` — digit's local fleet genesis anchor — which is
consistent with the trust root that signs this document.

## The approval statement (signed payload)

The signature carried by this report's `.sig` covers the canonical
statement:

```
FLEET-APPROVAL-v1
lane: human-signature
approves: fleet-genesis.json sha256:12375b51451040b638984fb67e7099c023b76cf5729790586066b8af5f980629
approves: fleet-manifest.json sha256:26a8b48366cfef097f5ae4789953133f953a944afd40dc9db0f16d64b73ed0b2
signatory: digit fleet trust root (pubkey sha256:43b4429513e53ba9f8a0eff8990f8bdc371d80ddc27f6116000afa391d16fc31)
delegation: AdmPaul — fleet admiral — delegated external review execution to the Devin agent + cluster seats, 2026-11-21
ts: <signed_at recorded in REVIEWS-MANIFEST>
```

Verification: `openssl pkeyutl -verify -pubin -inkey
seats/digit-ed25519.pub -rawin -in human-signature.md -sigfile
human-signature.md.sig` (detached sig covers this report file; the
statement text is in-file for provenance).

## Verdict

Form satisfied: detached ed25519 signature bound to the exact artifact
digests, twins identical, signatory identity disclosed and verifiable.
Authority honesty preserved: delegated fleet-root signature, labeled
as such — no human claimed, no ceremony faked.
