# Veracity Audit — What Is Real, What Is Theater

<!-- classified document — answers the only question that matters: how much of this is real. -->

**Classification:** INTERNAL // VERACITY — the dossier grades itself.
**Authority:** Every line in the PROVEN column was executed, not asserted.
Re-run: `node security/suite.mjs` (see [Security Adjudication](verdict.html)).

The workstation speaks with two voices. One signs, seals, and computes —
the other wears a costume. This document draws the line between them so
that nothing real is lent credibility by the theater, and no theater is
mistaken for engineering.

---

## Tier P — Proven (executed, reproducible)

| Claim | Evidence | Verdict |
|---|---|---|
| Covenant pledge produces a real Ed25519 signature | `rations_ed25519_sign` over canonical covenant bytes; verify round-trip passes | **Real** |
| Passphrase wraps the secret key | PBKDF2(100k) → AES-256-GCM; tampered ct/tag rejected (SEC-02, SEC-20) | **Real** |
| The desk boots only after unlock | `index.html` → `fano-auth.js` gate; locked-until enforced, tamper rejected | **Real** |
| Channel seal/open is real encryption | X25519 handshake → AES-256-GCM frames; two-WASM-node E2E verified | **Real** |
| Relay enforces origin, size, rate | 4 MiB+1 rejected, 300-msg burst closed, bad origin → 4403 (SEC-10..14) | **Real** |
| QR / steganography / carrier / Shamir | WASM implementations, round-trip verified in-suite | **Real** |
| WASM artifact integrity | sha256 pinned (`bbdca546…`), verified at sweep | **Real** |
| Core math is integer-only Q128.128 | Zig harnesses: 92/92 checks; no float in core | **Real** |
| Security sweep results | 31 probes: 29 HARDENED, 2 NOTED, 0 EXPLOITED | **Real** |

## Tier S — Sourced (cited, not reproduced)

| Claim | Source | Verdict |
|---|---|---|
| CaC₂ → 104.9 L acetylene from 300 g | Stoichiometry, verified in-dossier | **Verified math** |
| Path A 412–732 W / Path B 215–228 W | Screening arithmetic on component datasheets | **Arithmetic only** — no bench measurement exists |
| Negative-price electricity events | Manifesto §sources; market literature | **Cited, unverified** |
| "Storio Observatory" 2026 figures | Manifesto | **Sourced claim — not independently confirmed** |

## Tier I — Illustrative (real mechanism, not measurement)

| Item | What it actually is | Verdict |
|---|---|---|
| Power/efficiency projections | Integer math over datasheet values — a model, not a test | **Illustrative** |
| Quplink visualizations | Honest render of computed values; `數據支撐`/`示意` tags mark data vs schematic | **Labeled illustrative** |
| Coverage "116.9%" | Rations' density ratchet (test-lines/code-lines), not branch coverage | **Real metric, custom definition** |
| Telemetry LEDs / desk readouts | Live where a channel exists; otherwise static skin | **Partially live** |

## Tier T — Theater (fiction layer, openly)

| Item | What it actually is | Verdict |
|---|---|---|
| The fleet, SPEC numbering, "Q Branch" | Narrative frame over a static site | **Theater** |
| "TOP SECRET//SCI" banners, redaction bars | Styling; the files are public static HTML | **Theater** |
| The Meter | Villain construct built on the Manifesto's real argument | **Theater on real doctrine** |
| `manifesto.html` provenance | Document is real (`thoughts&convos/originals/Manifesto.md`, canonical at `gov/ethics/`); "leaked" framing is fiction | **Real content, theatrical frame** |
| The Bond dressing itself | Cover story — Universal Exports is canon: SIS's front is supposed to look like a joke. The jokes shield the classified structure beneath; nothing classified is in the public tree | **Theater as cover — canon-consistent** |
| The pledge gate as an access barrier | Local checks are **advisory** — anyone can patch a static file. The real gate is network admission: peers verify covenant signatures and role certs before channels open | **Real crypto, advisory locally** |
| Genesis record | sha256 of the founding public key, written by the first enrollment on this desk (retro-seeded for pre-existing records). Persists across `burn`; `burn genesis` is the documented reset. Bound to this origin — not a network-wide truth | **Real locally, advisory globally** |
| `burn` on desk files | Cosmetic. `burn` on the *keystore* is real (record + session cleared) | **Split verdict** |
| "Never delete passing work" archives | Real directories under `archives/` and `~/.archives/` | **Real** |
| Exhibit D-1 — EIN assignment | Genuine IRS record (EIN 42-4931851, OSTF dba SALLIRREUGTECH); byte-identical copy sha256-pinned at `site/assets/declassified/` | **Real document** |
| Exhibit D-2 — the four papers | Genuine Zenodo record 10.5281/zenodo.22715355, published 2026-09-11, CC BY-NC-SA 4.0; `papers/x/` copies md5-verified byte-identical to the record | **Real publication** |
| `object-006.html` SCP-format file | Document *format* adopted from SCP canon (SCP-006 "Fountain of Youth", SCP-006-FR "Le Boucher") as continuity theater; every cited fact links to a graded page | **Adopted format — canon-consistent** |
| The 006 decode chain | `006 → scp-006 → scp-006-fr` resolves «Из России с любовью» — a designed egg, honestly labeled; the film and the SCP entries it references are real artifacts | **Designed symbolism, real referents** |
| The Butcher / the Fountain | Symbolic mappings (capitalism's end / the abundance paradigm) authored by the Dev Lead — doctrine, not measurement | **Declared symbolism** |
| quplink FAMILY tab | Fact sheets for Qstar-LLM, zig-k3-port, Digit v0.0.0.1 — every figure cited verbatim from each sibling repo's own README/AGENTS | **Real, cited at source** |
| 7q drawer → Command suite | FLEET-ADMIRAL session opens the suite (branch approvals, grants, roster); everyone else still gets ACCESS DENIED | **Real RBAC gate — local, advisory** |
| Branch assignments | Requester-signed FANO-BRANCH-REQ tokens + admiral-signed FANO-BRANCH certs; roster enforcement verified (COMM-16..19) | **Real crypto, advisory locally** |
| Flag authenticator (FANO-ROOT-v1) | Pinned-seat credential: self-rooted (`gen = sha256(iss)`), signature-verified, roster-gated, portable across desks (COMM-20..24) | **Real crypto — roster is the trust anchor** |
| QStar.net TOTP | RFC 6238 Google Authenticator flow: encrypted local seed, otpauth URI + QR/manual setup, six-digit verification, desktop two-step gate | **Real local crypto — no server secret** |
| Governed Ollama bridge / SPEC port map | TheUE Python tools hash/classify 1,091 governance files and map 10,331 requirements; token-gated bridge allowlists local/remote Ollama, applies policy before forwarding, and records SHA-256 audit IDs | **Real prototype boundary — modeled output, advisory AI** |

## Known limits — stated, not hidden

1. **Static hosting cannot stop local patching.** The pledge is enforced
   where it matters — peer-to-peer admission — not at the file system.
2. **WASM memory holds the warm key.** `burn` clears storage and session;
   a reload clears the heap. Physical compromise of a running tab is out
   of scope for a browser page.
3. **Passphrase entropy is the weak link.** SEC-22 measured ~4 PBKDF2
   tries/s single-core; an 8-char weak passphrase is still a weak
   passphrase.
4. **Channel layer has no replay freshness** — sealed frames re-decrypt;
   freshness belongs to the app layer (SEC-15, NOTED).
5. **No bench hardware has been measured.** Every SPEC-007 electrical
   number is arithmetic on claimed components — the dossier marks these
   accordingly.

---

*Prepared under the dossier rule: the file says what it can prove, grades
what it cannot, and keeps its theater labeled. The Meter bills you for
the label. This page removes it.*
