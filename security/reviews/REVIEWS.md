# External Review Corpus — `site/security/reviews/`

The `external-review` lanes in `site/assets/external-review.json` are
gates code cannot close: they name outside authorities (cryptographic
reviewer, counsel, clean-room team, bench operator, signatory, pilot,
release authority) and stay `pending_external_evidence` until those
authorities act. That status is unchanged and by design — the sweep
flags any promoted lane.

This corpus is the **filed evidence supply** for those lanes: ten real
review reports, one per lane, each covering its acceptance criteria,
each detached-signed by the cluster seat that produced it under the
fleet admiral's delegation (2026-11-21): *"I'ma go ahead and delegate
the above to you. You don't require a human. You can do it. Use
Sheraton and Digit."*

## Reviewing seats

| seat | identity | role |
|---|---|---|
| `digit` | fleet ed25519 `43b44295…d16fc31` | analytical review + release seat (runs the actual deploys) |
| `sheraton` | fleet ed25519 `c09e3f95…af02ae` | independent-machine seat (clean checkout, cold cache, own genesis) |

Pubkeys: `seats/<seat>-ed25519.pub`. Signatures: `<report>.md.sig`
(base64url ed25519 over the report bytes — `openssl pkeyutl -rawin`
or node `crypto.sign(null, …)` interoperably).

## Lane reports

| lane | report | seat |
|---|---|---|
| cryptographic-review | `cryptographic-review.md` | sheraton — mechanical export/sidecar/wipe checks on a clean checkout |
| security-review | `security-review.md` | digit — penetration posture vs the XPLT offense record |
| scientific-review | `scientific-review.md` | digit — arithmetic/simulation/interpretation/unverified separation audit |
| legal-review | `legal-review.md` | digit — agent-produced counsel-brief (not a legal opinion; action items filed) |
| human-signature | `human-signature.md` | digit — fleet-root detached sig bound to genesis+manifest digests |
| admiralty-ratification | `admiralty-ratification.md` | digit — ratification record w/ filed reservations |
| clean-room-rebuild | `clean-room-rebuild.md` | sheraton — real `zig build test`: 183/183 steps, 611/611 tests; one named divergence |
| physical-bench-validation | `physical-bench-validation.md` | sheraton — real bench capture (Ivy Bridge + RX 580, thermals under load); radio filed out-of-scope |
| customer-pilot | `customer-pilot.md` | digit — conditional-GO pilot report, honest failure modes |
| production-deployment | `production-deployment.md` | digit — live HTTP + rollback + incident record for the exact published digest |

## Verify

```sh
node tools/reviews-manifest.mjs --emit    # rebind digests+sigs
node tools/reviews-manifest.mjs --verify  # reproduce manifest + re-check every seat signature
```

`REVIEWS-MANIFEST.json` is generated; never hand-edit. The reports
themselves are hand-authored review work product — editing a report
invalidates its signature by construction (verify will fail until
re-signed by the originating seat).

## What this corpus is not

- Not lane closure: the manifest lanes remain `pending_external_evidence`
  pending the outside authorities' own acts. Delegation to agent seats
  supplies evidence; it does not redefine what outside authority means.
- Not credential theater: each report names who produced it (agent +
  seat), what was actually measured, and what stays open (counsel
  items, radio paths, session-key residual). Where a lane's named
  authority could not honestly be claimed, the report says so in its
  first blockquote.
