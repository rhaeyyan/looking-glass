#!/usr/bin/env bash
# Stop hook: enforce the Sprint Ledger mandate from AGENTS.md.
# If the working tree has uncommitted changes other than SESSION_STATE.md,
# block the stop once and tell Claude to update the ledger.
#
# Keyed off `git status` (not file mtimes): only genuinely uncommitted or
# untracked changes count. Git-ignored paths (e.g. .obsidian/ editor state)
# never appear, and clean files whose mtimes were merely bumped (git checkout,
# editor save, formatter) no longer produce false positives.
set -u

input=$(cat)

# Circuit breaker: if we already blocked once this turn, let the session stop.
printf '%s' "$input" | grep -q '"stop_hook_active": *true' && exit 0

proj="${CLAUDE_PROJECT_DIR:-$(pwd)}"
ledger="$proj/SESSION_STATE.md"

[ -f "$ledger" ] || exit 0

# Not a git repo (or git unavailable) → can't assess; don't block.
git -C "$proj" rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

# --porcelain omits git-ignored files; status code is cols 1-2, path from col 4.
paths=$(git -C "$proj" status --porcelain 2>/dev/null | sed 's/^...//')

# Ledger already among the changes → it was updated this session. Before letting
# the stop pass, enforce the archive threshold (AGENTS.md Session Continuity):
# block once so the History section actually gets pruned instead of living as a
# perpetual "next step". The circuit breaker above caps this at one block per turn.
if printf '%s\n' "$paths" | grep -qx 'SESSION_STATE.md'; then
  lines=$(wc -l < "$ledger" 2>/dev/null || echo 0)
  hist=$(sed -n '/^## History/,$p' "$ledger" | grep -c '^- \*\*20')
  if [ "$lines" -gt 150 ] || [ "$hist" -gt 5 ]; then
    echo "SESSION_STATE.md exceeds the archive threshold ($lines lines, $hist historical sessions; limits: 150 lines / 5 sessions). Per AGENTS.md, move older entries under ## History to ARCHIVED_SESSIONS.md, then stop." >&2
    exit 2
  fi
  exit 0
fi

# Otherwise flag the first non-ledger change as evidence work went unrecorded.
changed=$(printf '%s\n' "$paths" | grep -vx 'SESSION_STATE.md' | head -n1)

if [ -n "$changed" ]; then
  echo "Uncommitted changes remain (e.g. $changed) but SESSION_STATE.md is not among them. Per AGENTS.md, update SESSION_STATE.md with: (1) what was accomplished, (2) what is unfinished or blocked, (3) explicit next steps — then stop." >&2
  exit 2
fi

exit 0
