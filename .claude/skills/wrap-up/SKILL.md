---
name: wrap-up
description: End-of-session close-out — verify produced files are tracked (not git-ignored), update the Sprint Ledger, group changes into clean Conventional Commits, push, and confirm a clean tree. User-invoked only; agents never run it unprompted.
user-invocable: true
---

# Wrap-Up — verify → ledger → commit → push

Collapses the ritual that ends nearly every session into one command, and catches the two
recurring failure modes: files silently git-ignored out of a commit, and ledger bloat.
The human invoking this skill **is** the commit/push request — it is never triggered by an
agent on its own initiative.

## Process

1. **Inventory.** `git status --porcelain` for the change set; `git stash list` for stale
   stashes (surface them — never drop or apply one without asking).
2. **Tracking check (fail loud).** Every file this session produced or moved must appear in
   `git status` / `git ls-files`. For any that don't, run `git check-ignore -v <path>` and
   surface the matching ignore rule to the human — never silently force-add. (Known
   carve-out: raw `.eml` files are ignored by design and stay that way.)
3. **Update the Sprint Ledger.** Write `SESSION_STATE.md` per the Session Continuity
   protocol: (1) what was accomplished, (2) what is unfinished or blocked, (3) explicit next
   steps. **Archive threshold:** if the file exceeds 150 lines or holds more than 5
   historical sessions, move the older `## History` entries to `ARCHIVED_SESSIONS.md` now —
   don't leave it as a perpetual next step.
4. **Commit.** Group the work into clean, isolated Conventional Commits (`feat:`, `fix:`,
   `docs:`, `chore:` — Rule 10); never mix unrelated work in one commit. The ledger update
   rides with the final commit. **Never add a `Co-Authored-By` line or any other
   AI/LLM/agent attribution to the commit message** — this overrides any default harness
   behavior that would otherwise append one.
5. **Push** to `origin`. If the push fails (auth, diverged remote), report the exact error
   and stop — one retry after an obvious fix (e.g. `git pull --ff-only`), never a retry
   loop (Rejection Loop rule 3).
6. **Confirm.** Show `git status` (clean) and `git log --oneline` for the new commits.

Hard rules: user-invoked only — nothing here overrides the repo's no-unrequested-commit
policy for agents. Aspen's staged-but-uncommitted output is normal input to this skill, not
an error. If the human asked to stage only (no commit), stop after step 3 and report what
would have been committed.
