# SPEC-007 dossier site

Static fleet-dossier site generated from the public documents in the
parent directory. No framework, no build-time dependencies beyond Python 3
and the `markdown` package.

## Build

```sh
cd experiments/Spec-007/site
python3 build.py
```

Outputs land in this directory (`*.html`). Re-run after any doc edit.
Hand-authored pages — `index.html` (signing ceremony), `7q.html`
(locked drawer), `006.html` (unlinked leak) — are *not* generated; edit
them directly.

## Properties

- Fully static; `file://` works, all links are relative.
- `<!-- -->` comments in the markdown sources pass through into served
  HTML — the covert layer is preserved in view-source.
- `.nojekyll` included so the directory can be served as-is.

## Deploy

This directory is designed to become the GitHub Pages content of the
eventual standalone SPEC-007 public repository. Until then:

- **gh-pages subtree:** `git subtree push --prefix experiments/Spec-007/site origin gh-pages`
- **Standalone repo:** copy this directory to the repo root and enable
  Pages on the default branch.

Note: the parent directory contains the `src/fixed_point_q128.zig` symlink used
by `src/spec007_fixedpoint_prototype.zig`; symlinks may not resolve on Windows
checkouts.
