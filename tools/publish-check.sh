#!/bin/sh
# SPEC-007 publish gate — every check must pass before a milestone archives.
set -eu
cd "$(dirname "$0")/.."
FAIL=0
say() { printf '%s %s\n' "$1" "$2"; }
chk() { if "$@" >/dev/null 2>&1; then say " PASS" "$2"; else say " FAIL" "$2"; FAIL=1; fi }

echo "== baseline"
if echo "bcb81b78ebeab9e3762a806788a0c4c1bd3bbd1e8a7b9339030037efab6367b4  spec-007.md" | sha256sum -c - >/dev/null 2>&1
then say " PASS" "spec-007.md immutable baseline"; else say " FAIL" "spec-007.md baseline"; FAIL=1; fi

echo "== integer harnesses (L4)"
for f in src/spec007_*.zig; do
  case "$f" in
    *q128*|*compute*|*prototype*) ;; # library/mirror modules — tested via importers
    *) zig test "$f" >/dev/null 2>&1 && say " PASS" "$f" || { say " FAIL" "$f"; FAIL=1; } ;;
  esac
done
zig test src/spec007_fixedpoint_prototype.zig >/dev/null 2>&1 && say " PASS" "src/spec007_fixedpoint_prototype.zig" || { say " FAIL" "prototype"; FAIL=1; }
zig test src/fixed_point_q128.zig >/dev/null 2>&1 && say " PASS" "src/fixed_point_q128.zig" || { say " FAIL" "fixed_point_q128"; FAIL=1; }
zig test src/spec007_compute.zig >/dev/null 2>&1 && say " PASS" "src/spec007_compute.zig" || { say " FAIL" "compute"; FAIL=1; }

echo "== qstar dep suites + spec008 harnesses (zig build test)"
zig build test >/dev/null 2>&1 && say " PASS" "zig build test (deps + spec008 harnesses)" || { say " FAIL" "zig build test"; FAIL=1; }

echo "== site build + twins"
( cd site && python3 build.py >/dev/null 2>&1 ) && say " PASS" "build.py" || { say " FAIL" "build.py"; FAIL=1; }
for slug in public verified dossier claims input-audit registry proposal-record economics red-team expanded governance terminology covert declassified object-006 component-map discoveries bridge-map science-coverage; do
  if [ "$slug" = covert ]; then a=covert-en.html; b=covert-zh.html; else a="$slug.html"; b="$slug-zh.html"; fi
  [ -f "site/$a" ] && [ -f "site/$b" ] && say " PASS" "twin:$slug" || { say " FAIL" "twin:$slug"; FAIL=1; }
done

echo "== classified tripwire (public tree must carry no officer surnames)"
if grep -rIlE '\b(Zhang|Elshikh|Noltemeyer|Adeusoye|Eschbach|Sly)\b' --exclude-dir='thoughts&convos' --exclude='publish-check.sh' . >/dev/null 2>&1; then
  say " FAIL" "surname leak"; FAIL=1
else
  say " PASS" "surname tripwire"
fi

echo "== wasm continuity"
( cd site/apps/rations && sha256sum -c rations.wasm.sha256 >/dev/null 2>&1 ) \
  && say " PASS" "rations.wasm sha256" || { say " FAIL" "rations.wasm sha256"; FAIL=1; }

echo "== canon parity (published copies must match the signed roots)"
for c in fleet-genesis.json fleet-manifest.json engine-manifest.json; do
  cmp -s "$c" "site/$c" \
    && say " PASS" "canon:$c" || { say " FAIL" "canon:$c"; FAIL=1; }
done

echo "== casting ledger (Layer 2 — deterministic, watch-list complete)"
node tools/persona-map.mjs --verify >/dev/null 2>&1 \
  && say " PASS" "persona-manifest.json" || { say " FAIL" "persona-manifest.json"; FAIL=1; }

echo "== command ledger (Layer 3 — deterministic, fleet + corps complete)"
node tools/command-map.mjs --verify >/dev/null 2>&1 \
  && say " PASS" "command-manifest.json" || { say " FAIL" "command-manifest.json"; FAIL=1; }

echo "== vision ledger (deterministic, artifact-backed)"
node tools/vision-audit.mjs --verify >/dev/null 2>&1 \
  && say " PASS" "vision-ledger.json" || { say " FAIL" "vision-ledger.json"; FAIL=1; }

echo "== continuity dht (deterministic projection)"
node tools/dht-fs.mjs --verify >/dev/null 2>&1 \
  && say " PASS" "dht-manifest.json" || { say " FAIL" "dht-manifest.json"; FAIL=1; }

echo "== film manifest (hash-pinned artifacts)"
node tools/film-render.mjs --verify >/dev/null 2>&1 \
  && say " PASS" "film-manifest.json" || { say " FAIL" "film-manifest.json"; FAIL=1; }

echo "== aiwo standing service (ledger integrity)"
node security/aiwo-service.mjs --verify >/dev/null 2>&1 \
  && say " PASS" "aiwo-service-ledger" || { say " FAIL" "aiwo-service-ledger"; FAIL=1; }

echo "== nebula 3d module (scene shipped, desk-wired)"
node --check site/assets/nebula-3d.js >/dev/null 2>&1 \
  && grep -q 'getContext("webgl2"' site/assets/nebula-3d.js \
  && grep -q 'nebula-3d.js' site/desktop.html \
  && say " PASS" "nebula-3d.js" || { say " FAIL" "nebula-3d.js"; FAIL=1; }

echo "== agency map (gov↔sci-fi binding + organ counterparts)"
node tools/agency-map.mjs --verify >/dev/null 2>&1 \
  && say " PASS" "agency-map.json" || { say " FAIL" "agency-map.json"; FAIL=1; }

echo "== directive router (glyph table + signed receipts)"
node tools/directive.mjs --verify >/dev/null 2>&1 \
  && say " PASS" "directive" || { say " FAIL" "directive"; FAIL=1; }

echo "== js syntax"
for j in site/assets/fano-*.js site/assets/nebula-3d.js security/*.mjs prototypes/*.mjs; do
  node --check "$j" >/dev/null 2>&1 && say " PASS" "$j" || { say " FAIL" "$j"; FAIL=1; }
done

echo
[ "$FAIL" -eq 0 ] && echo "PUBLISH CHECK: all gates green" || echo "PUBLISH CHECK: FAILURES PRESENT"
exit $FAIL
