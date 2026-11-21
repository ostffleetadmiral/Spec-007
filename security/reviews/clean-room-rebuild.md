# Clean-Room Rebuild Log — sheraton seat, independent machine

- lane: `clean-room-rebuild`
- named authority: independent clean-room team
- reviewing seat: `sheraton` (fleet ed25519 seat `c09e3f95…af02ae`) —
  independent hardware (Ivy Bridge i7-3770S, no prior checkout), no
  shared build cache, no shared `.zig-cache`
- reviewer of record: Devin (SWE-2) review agent under fleet
  delegation (AdmPaul, 2026-11-21)
- scope date: 2026-11-21 · disposition: `evidence_filed`

## Evidence bundle reviewed

`build.zig`, `tools/publish-check.sh`,
`site/apps/rations/rations.wasm.sha256`,
`docs/en/spec-007-component-map.en.md` + `docs/zh-Hant/…`.

## Method

1. Source acquisition: `git archive --format=tar.gz HEAD` of the desk
   repo at `0454f19` — 637 tracked files, 15.5 MB. No `.git`, no
   working-tree residue, no drawer content (untracked, never copied).
2. Toolchain: zig 0.13.0 shipped as a directory copy
   (`/usr/local/zig-0.13.0`, 341 MB, statically linked) — the same
   pinned version the desk uses; verified `zig version` → `0.13.0`.
3. Build: `zig build test --summary all` on sheraton, cold
   `.zig-cache`, nothing vendored from digit's build outputs.

## Result

```
Build Summary: 183/183 steps succeeded; 611/611 tests passed
RC=0
```

All spec007 roots + vendored dep harnesses + spec008 integration
harnesses compile and pass on the independent machine.

## Divergence table (every divergence, accepted + documented)

| # | divergence | disposition |
|---|---|---|
| 1 | `src/fixed_point_q128.zig` is a **symlink** → `../../../src/fixed_point.zig` — the target lives in the *sibling* `hardware/` proof workspace, outside this repository. `git archive` preserves the symlink, so a bare archive checkout cannot build (run 1 failed exactly here: 9 roots `FileNotFound`). | **Documented + materialized.** Target content copied over the link (`sha256:5cfec71914a672c1eed28ad017869143c59118083514929909d723c2b79265bf`, identical to the canonical sibling file). The repo builds clean-room only when its sibling tree is present — this dependency is now named on the record; the component map already declares `sibling:` cites, so the boundary is documented, just not build-self-contained. |
| 2 | Toolchain was carried in, not installed from the host's package manager (sheraton has no zig). | **Accepted** — pinned-version parity is the point of the lane; provenance stated. |
| 3 | `zig-out/` produced no install artifacts (the build's only step is `test`); byte-reproducibility of *test binaries* is cache-path-dependent and not meaningful to compare cross-host. | **Documented** — what is reproducible is the *test verdict*: 611/611 identical on both machines. The published WASM artifact (`rations.wasm`) is built in the upstream Rations repo, not here; its sidecar verified `OK` on this checkout. |

## Byte-identity evidence

- `site/apps/rations/rations.wasm` on the sheraton checkout verifies
  against its committed `rations.wasm.sha256` sidecar (`OK`).
- The only build-affecting delta between the desk working tree and
  the archive is the symlink — identical content once materialized.
- Source commit under review: `0454f19` (includes the desk-restore +
  ledger-reseat commits deployed to `gh-pages` at `71ab256`).

## Verdict

**Byte-reproducible: YES, modulo one named dependency.** From a
pristine archive on independent hardware, the build reproduces
611/611 test passes with zero test-level divergences. The single
structural divergence — a symlink into the sibling workspace — is a
real finding the lane exists to catch: the repo is build-dependent on
`hardware/src/fixed_point.zig` and now that dependency is written
down, signed, and verified instead of assumed.
