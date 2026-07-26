# Migrations

Four migrations, all **already applied** to the linked Supabase project.

## If `supabase db push` says `relation "skills_core" already exists` (42P07)

That is bookkeeping, not a broken migration. The CLI decides what to run by reading one remote
table, `supabase_migrations.schema_migrations`. This project's schema was applied by pasting DDL
into the Dashboard SQL Editor, which writes **nothing** to that table — so the CLI reads an empty
ledger, concludes nothing has ever run, starts at the first migration, and its first statement
(`CREATE TABLE skills_core`, hence `At statement: 0`) collides with the table already there.

The migrations intentionally do not use `IF NOT EXISTS`: a migration is meant to apply exactly once.
Re-running one will always fail this way. **Do not make them idempotent, and do not re-run them.**
Reconcile the ledger instead:

```bash
supabase migration list      # local vs remote, side by side — check this first
supabase migration repair --status applied \
  20260722134021 20260722140908 20260722160652 20260723122104
supabase db push             # should now report nothing to do
```

`migration repair --status applied` only writes to the tracking table; it never touches your schema.

Because `repair` tells the CLI to skip these forever, confirm the schema really is complete first:

```sql
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('skills_core','skill_role_profile','skill_arbitrage_scores')
union all
select table_name from information_schema.views
where table_schema = 'public' and table_name in ('arbitrage_scores','role_skill_arbitrage');
```

All five must come back. Also confirm `role_skill_arbitrage` has `salary_premium_pct` and
`median_days_open` — that pair is what the last migration adds, and it was once missing live while
passing every structural test (see `specs/005-template-narrator.md`).

**Going forward, apply migrations with `supabase db push`, not the SQL Editor.** Pasting DDL by hand
is what desynchronized the ledger in the first place.

## Filename mapping

Renamed from `NNNN_` to the CLI's expected `<YYYYMMDDHHMMSS>_` format. The old names appear
throughout `specs/` — those are historical records, left as authored. Use this table to resolve them:

| Was | Now | Adds |
|---|---|---|
| `0001_init_skills_schema.sql` | `20260722134021_init_skills_schema.sql` | `skills_core`, `skill_role_profile` |
| `0002_arbitrage_scores.sql` | `20260722140908_arbitrage_scores.sql` | `skill_arbitrage_scores`, `arbitrage_scores` view |
| `0003_frontend_read_layer.sql` | `20260722160652_frontend_read_layer.sql` | `role_skill_arbitrage` view + anon RLS |
| `0004_role_arbitrage_narration_fields.sql` | `20260723122104_role_arbitrage_narration_fields.sql` | `salary_premium_pct`, `median_days_open` |

Timestamps are each migration's real first-commit date, so filename order matches authoring order.
