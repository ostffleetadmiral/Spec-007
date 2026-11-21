#!/bin/sh
# deploy-pages.sh — atomic gh-pages deploy via a detached git worktree.
# Replaces the old `git checkout gh-pages && rm -rf .` pattern, which
# twice caused damage: it killed serve.py's cwd and committed the
# gitignored SPEC-004 drawer to the public branch. The worktree method
# never touches the live checkout or the desk server's cwd.
set -eu
cd "$(dirname "$0")/.."
WT="$(mktemp -d /tmp/gh-pages.XXXXXX)"
trap 'git worktree remove "$WT" --force 2>/dev/null || rm -rf "$WT"' EXIT

# fresh orphan state in the worktree — never the shared index
STAGE="_pages_stage_$$"
trap 'git worktree remove "$WT" --force 2>/dev/null || rm -rf "$WT"; git branch -D "$STAGE" 2>/dev/null || true' EXIT
git worktree add "$WT" --detach HEAD -q
cd "$WT"
git checkout -q --orphan "$STAGE"
git rm -rf . -q 2>/dev/null || true

cp -r "$OLDPWD/site/." .
# deploy-side ignore file guards the copy step itself
printf 'thoughts&convos/\n__pycache__/\n' > .gitignore

# published-surface manifest — BLACK-03 binds this set on the branch and
# live: every apps/** artifact plus the landing pages, `hash  ./path`
# lines, self-entry last (digest of the manifest minus its own line).
{
  find apps -type f | LC_ALL=C sort
  for f in index.html reboot.html recovery.html; do
    [ -f "$f" ] && echo "$f"
  done
} | sed 's|^|./|' | tr '\n' '\0' | xargs -0 sha256sum > SHA256SUMS
printf '%s  ./SHA256SUMS\n' "$(sha256sum SHA256SUMS | cut -d' ' -f1)" >> SHA256SUMS

git add -A
git commit -q -m "gh-pages: $(git -C "$OLDPWD" log -1 --format=%h\ %s)"
git push -f origin HEAD:gh-pages
git branch -f gh-pages HEAD
cd "$OLDPWD"
echo "deployed: $(git ls-tree -r gh-pages --name-only | wc -l) files"
# hard gate: classified material must never reach the branch
if git ls-tree -r gh-pages --name-only | grep -q 'thoughts'; then
  echo "FATAL: classified path on gh-pages" >&2; exit 1; fi
