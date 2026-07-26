#!/usr/bin/env bash
# Stop hook: enforce the *oracle*, not prose.
#
# This replaces stop-session-state.sh, which blocked the stop until SESSION_STATE.md
# had been touched. That inverted the incentive it was meant to create: it made
# narration mandatory and verification optional. Measured cost across this project's
# 142 commits — 45 of them (32%) touched only SESSION_STATE.md/ARCHIVED_SESSIONS.md
# and changed no code, while a visible UI bug survived four rounds and nine commits
# with 622 unit tests green the whole way.
#
# So: if presentation code changed, require that the Playwright oracle actually ran
# and passed *after* the most recent edit. Session notes are a `Verified-With:` commit
# trailer now (AGENTS.md, Session Continuity) — a convention, not a gate.
#
# Keyed off `git status` (not bare mtimes) for what changed, so git-ignored editor
# state never counts; mtimes are used only to tell a fresh oracle run from a stale one.
set -u

input=$(cat)

# Circuit breaker: if we already blocked once this turn, let the session stop.
printf '%s' "$input" | grep -q '"stop_hook_active": *true' && exit 0

proj="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Not a git repo (or git unavailable) → can't assess; don't block.
git -C "$proj" rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

# --porcelain omits git-ignored files; status code is cols 1-2, path from col 4.
# Handle renames ("old -> new") by taking the destination path.
changed=$(git -C "$proj" status --porcelain 2>/dev/null | sed 's/^...//' | sed 's/.* -> //')

# Only presentation/app code has an e2e oracle. Data-layer changes are gated by
# pytest, which leaves no machine-checkable artifact behind — Cypress's audit covers
# those, and this hook does not pretend to verify what it cannot see.
watched=$(printf '%s\n' "$changed" | grep -E '^frontend/src/.*\.(tsx?|css)$' | grep -v '\.test\.' || true)

[ -n "$watched" ] || exit 0

# A run under ANY project writes this; it carries the whole run's verdict.
lastrun="$proj/frontend/test-results/.last-run.json"

if [ ! -f "$lastrun" ]; then
  echo "Presentation code changed but the e2e oracle has never run in this checkout. Run 'npm run e2e' in frontend/ (or 'npm run e2e:mobile' for touch-only profiles) and fix what it reports, then stop. Changed: $(printf '%s' "$watched" | head -n3 | tr '\n' ' ')" >&2
  exit 2
fi

if ! grep -q '"status": *"passed"' "$lastrun"; then
  echo "The last e2e oracle run did not pass ($lastrun). Presentation code changed, so this is a blocking failure — fix it or, if the oracle itself is wrong, say so explicitly rather than leaving red behind. Re-run 'npm run e2e' in frontend/." >&2
  exit 2
fi

# Freshness: the oracle must have run *after* the newest watched edit, or it proves
# nothing about the current state of the tree.
newest=""
while IFS= read -r f; do
  [ -n "$f" ] || continue
  [ -f "$proj/$f" ] || continue                      # deleted files can't be stat'd
  if [ -z "$newest" ] || [ "$proj/$f" -nt "$newest" ]; then
    newest="$proj/$f"
  fi
done <<EOF
$watched
EOF

if [ -n "$newest" ] && [ "$newest" -nt "$lastrun" ]; then
  echo "The e2e oracle passed, but $(basename "$newest") was edited after that run — the green is stale and proves nothing about the current tree. Re-run 'npm run e2e' in frontend/, then stop." >&2
  exit 2
fi

exit 0
