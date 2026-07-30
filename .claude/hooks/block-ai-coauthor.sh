#!/usr/bin/env bash
# PreToolUse hook (Bash): block any `git commit` invocation whose message would add an
# AI/agent Co-Authored-By trailer (or any other AI/LLM/agent attribution line).
#
# Repo convention (CLAUDE.md, Git protocol / Rule 10): commits in this repo never carry AI
# attribution, full stop. That rule previously lived only inside
# .claude/skills/wrap-up/SKILL.md, so it only applied when a session ran /wrap-up — a direct
# "commit this" request had nothing stopping the harness's own default trailer. This hook
# enforces it mechanically at the tool-call boundary instead, regardless of which path a
# commit comes from.
set -u

input=$(cat)
command=$(printf '%s' "$input" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))' 2>/dev/null)

case "$command" in
  *git\ commit*)
    if printf '%s' "$command" | grep -qiE 'co-authored-by[[:space:]]*:.*(claude|anthropic|openai|gpt|copilot|noreply@anthropic\.com)'; then
      echo "BLOCKED: this commit includes an AI/agent Co-Authored-By trailer. This repo never attributes commits to an AI/agent (CLAUDE.md, Git protocol) — strip that line from the message and retry." >&2
      exit 2
    fi
    ;;
esac

exit 0
