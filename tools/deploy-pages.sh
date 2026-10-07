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
git add -A
git commit -q -m "gh-pages: $(git -C "$OLDPWD" log -1 --format=%h\ %s)"
git push -f origin HEAD:gh-pages
git branch -f gh-pages HEAD
cd "$OLDPWD"
echo "deployed: $(git ls-tree -r gh-pages --name-only | wc -l) files"
# hard gate: classified material must never reach the branch
if git ls-tree -r gh-pages --name-only | grep -q 'thoughts'; then
  echo "FATAL: classified path on gh-pages" >&2; exit 1; fi
