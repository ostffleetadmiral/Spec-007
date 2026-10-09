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

echo "== js syntax"
for j in site/assets/fano-*.js security/*.mjs prototypes/*.mjs; do
  node --check "$j" >/dev/null 2>&1 && say " PASS" "$j" || { say " FAIL" "$j"; FAIL=1; }
done

echo
[ "$FAIL" -eq 0 ] && echo "PUBLISH CHECK: all gates green" || echo "PUBLISH CHECK: FAILURES PRESENT"
exit $FAIL
