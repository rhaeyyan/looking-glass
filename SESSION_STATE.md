# SESSION_STATE.md — Sprint Ledger

> Protocol (AGENTS.md): read this FIRST at session start; update it LAST before session end.
> Keep only the latest session at the top; move older entries to the History section.
> When this file exceeds 150 lines or contains more than 5 historical sessions, move older
> entries to [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md).

## Current Session — 2026-07-23 (README's full MVP scope is live-verified — milestone reached)

> Specs 001–006 (ingest through the deterministic-extraction pivot) are complete and archived —
> see [ARCHIVED_SESSIONS.md](ARCHIVED_SESSIONS.md) for the full build narrative.

### Accomplished
- **The entire primary flow is now live-verified end-to-end for the first time**: pick target
  role → paste resume → deterministic extraction → arbitrage-ranked have/gap → deterministic
  top-gap narration, all confirmed working against the real Supabase database via user-supplied
  screenshots. The app makes zero LLM calls anywhere in this flow.
- Found and fixed one real live-environment gap along the way: migration 0004
  (`salary_premium_pct`/`median_days_open` on `role_skill_arbitrage`) had only ever been
  structurally test-verified, never applied to the live database. Gave the user the exact SQL;
  independently confirmed the fix via a direct REST query against the live view before declaring
  it resolved.
- `screenshot/` (singular, contains real resume PII) added to `.gitignore` alongside the existing
  `screenshots/` entry.

### Unfinished / blocked
- Two documented, intentionally-not-fixed residual limitations in the deterministic extractor (by
  design, not bugs — pinned by frozen tests): a single-letter vocabulary entry (e.g. `r`) still
  false-matches inside an unrelated abbreviation that tokenizes identically (`R&D`); a negation
  cue further back than the fixed scan window fails to suppress a match.
- `@types/jest-axe` still not authorized/added — frozen test files surface a `jest-axe`
  TypeScript declaration gap under `tsc --noEmit` only (does not affect vitest/runtime). Needs
  Cedar's sign-off (new devDependency) before adding.
- Lint hook (`post-edit-lint.sh`) still can't resolve `node` (doesn't source nvm) — pre-existing
  env issue affecting every edit.
- No Claude-in-Chrome connection in this environment — any future live-browser verification still
  depends on the user driving it themselves (screenshots) or the extension getting connected.

### Next Steps
- No specific next step is queued — README's MVP scope is done and live-verified. Future work
  would be new, unspecced (polish/hardening, or a genuinely new feature), not a numbered MVP step.
- If the user wants `@types/jest-axe` resolved, route it to Cedar for dependency authorization
  first (Workflow Rule 8) — don't add it directly.
- Steer future manual verification toward synthetic/placeholder resume text where practical,
  consistent with the project's Zero-Trust "no real user PII" posture — the `screenshot/` folder
  already has one real resume in it (gitignored, not committed, but worth avoiding going forward).
