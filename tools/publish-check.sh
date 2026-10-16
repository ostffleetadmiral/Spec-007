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

echo "== integer harnesses (L4) — spec007 + deps + spec008 via build graph"
if zig build test >/dev/null 2>&1; then
  say " PASS" "zig build test (19 spec007 + deps + spec008 harnesses)"
else
  say " FAIL" "zig build test"; FAIL=1
  zig build test 2>&1 | grep -E 'error|FAIL' | head -10 >&2 || true
fi

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

echo "== executable regression scanners"
chk node tools/native-dialog-audit.mjs --verify "native-dialog audit"
chk node tools/wasm-memory-hygiene.mjs --verify "wasm-memory-hygiene"
chk node tools/relay-isolation-audit.mjs "relay subscription isolation"
chk node tools/fano-wire-audit.mjs --verify "fano-wire canonical datagram"
chk node tools/external-review-manifest.mjs --verify "external-review pending packages"

echo "== canon parity (published copies must match the signed roots)"
for c in fleet-genesis.json fleet-manifest.json engine-manifest.json; do
  cmp -s "$c" "site/$c" \
    && say " PASS" "canon:$c" || { say " FAIL" "canon:$c"; FAIL=1; }
done

echo "== deterministic ledgers (parallel —verify gates)"
# each line: "label<tab>verify-command" — run in parallel, print in declaration order
VCHK=$(cat <<'EOF'
persona-manifest.json	node tools/persona-map.mjs --verify
command-manifest.json	node tools/command-map.mjs --verify
vision-ledger.json	node tools/vision-audit.mjs --verify
dht-manifest.json	node tools/dht-fs.mjs --verify
film-manifest.json	node tools/film-render.mjs --verify
aiwo-service-ledger	node security/aiwo-service.mjs --verify
agency-map.json	node tools/agency-map.mjs --verify
directive	node tools/directive.mjs --verify
gov-ledger.json	node tools/gov-map.mjs --verify
gov-metadata.json	node tools/gov-metadata.mjs --verify
academy-manifest.json	node tools/academy-harvest.mjs --verify
curriculum-map.json	node tools/curriculum-map.mjs --verify
academy-review.json	node tools/academy-review.mjs --verify
academy-pedagogy.json	node tools/academy-grade.mjs --verify && node tools/academy-grade.mjs --selfcheck
course-gen	node tools/course-gen.mjs --verify
component-census	node tools/component-census.mjs --verify
component-performance	node tools/component-performance.mjs --verify
component-retrograde	node tools/component-retrograde.mjs --verify
EOF
)
VRES=$(echo "$VCHK" | xargs -d '\n' -P 8 -I{} sh -c 'lbl=${1%%	*}; cmd=${1#*	}; eval "$cmd" >/dev/null 2>&1 && echo "$lbl|PASS" || echo "$lbl|FAIL"' _ {})
echo "$VCHK" | cut -f1 | while IFS= read -r lbl; do
  echo "$VRES" | grep -F "$lbl|" | sed "s/|PASS/ PASS/; s/|FAIL/ FAIL/"
done
echo "$VRES" | grep -q '|FAIL' && FAIL=1 || true

echo "== nebula 3d module (scene shipped, desk-wired)"
node --check site/assets/nebula-3d.js >/dev/null 2>&1 \
  && grep -q 'getContext("webgl2"' site/assets/nebula-3d.js \
  && grep -q 'nebula-3d.js' site/desktop.html \
  && say " PASS" "nebula-3d.js" || { say " FAIL" "nebula-3d.js"; FAIL=1; }

echo "== js syntax"
# parallel node --check — worker prints "PASS|FAIL file" per file, sorted for stable output
JSCHK=$(ls site/assets/fano-*.js site/assets/nebula-3d.js security/*.mjs prototypes/*.mjs \
  | xargs -P 8 -I{} sh -c 'node --check "$1" >/dev/null 2>&1 && echo "PASS $1" || echo "FAIL $1"' _ {} | sort)
echo "$JSCHK" | sed 's/^PASS/ PASS/; s/^FAIL/ FAIL/'
echo "$JSCHK" | grep -q '^FAIL' && FAIL=1 || true

echo
[ "$FAIL" -eq 0 ] && echo "PUBLISH CHECK: all gates green" || echo "PUBLISH CHECK: FAILURES PRESENT"
exit $FAIL
