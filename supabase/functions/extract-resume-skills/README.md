# extract-resume-skills (Supabase Edge Function)

Server-side proxy to Claude for resume skill extraction. This is the repo's first Supabase Edge
Function and the first LLM call in the codebase — see `specs/004-resume-gap-layer.md` (Task 1)
for the approved SPIKE this implements.

## What it does

- Accepts `POST { resumeText: string }`.
- Rejects (400, no Claude call made) empty/whitespace-only text, or text over 20,000 characters.
- Calls Claude's Messages API (`https://api.anthropic.com/v1/messages`) via plain `fetch()` — no
  Anthropic SDK dependency — with a forced tool-use call (`extract_skills`) so the response shape
  is constrained at the source.
- Returns `200 { skills: string[] }` on success (an empty array is a valid result, not an error).
- Returns `502 { error: "extraction_failed" }` on any upstream failure/timeout — the raw Anthropic
  error text is never forwarded to the client, since it could leak infra details.
- Never logs `resumeText`, the raw Claude response, or writes anything to the database. This
  function is fully stateless.

## Model choice

Uses `claude-sonnet-5` for extraction. This repo's first LLM call had no established model
convention to reuse; Sonnet 5 gives reliable structured tool-use output on free-form resume text
at a lower cost than Opus for a bounded, non-reasoning-heavy extraction task. If step 5 (result
narration, a future SPEC) turns out to need a different model for a simpler summarization task,
that can be chosen independently when that function is built — this doesn't need to be the same
model repo-wide.

## CORS

Origins are allow-listed, never `'*'`. The default allow-list covers the Vite dev server
(`http://localhost:5173`, `http://127.0.0.1:5173`). Once the frontend has a production URL
(Vercel), add it via the `ALLOWED_ORIGINS` secret (comma-separated, see below) rather than editing
the code.

## Deploy + secret setup (manual — run these yourself)

This function has not been deployed and no secret has been set as part of this task. To do so:

1. **Install/authenticate the Supabase CLI** (skip if already set up):
   ```bash
   supabase login
   supabase link --project-ref <your-project-ref>
   ```

2. **Set the Anthropic API key as a project secret** (never a `VITE_*`/client-visible env var —
   this must never end up in the frontend bundle):
   ```bash
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   ```

3. **(Optional) Set production CORS origins**, once the frontend has a deployed URL:
   ```bash
   supabase secrets set ALLOWED_ORIGINS=http://localhost:5173,https://your-prod-domain.vercel.app
   ```

4. **Deploy the function**:
   ```bash
   supabase functions deploy extract-resume-skills
   ```

5. **Verify secrets are set** (this lists secret *names* only, never values):
   ```bash
   supabase secrets list
   ```

## Manual end-to-end verification

No frontend caller is wired in this task (that's Task 4). Verify the deployed function directly:

**Option A — `supabase-js` from a scratch Node/Deno REPL or script:**
```ts
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  '<your-supabase-url>',
  '<your-anon-key>', // the public anon key is fine here — it's not the Anthropic key
)

const { data, error } = await supabase.functions.invoke('extract-resume-skills', {
  body: { resumeText: 'Built ETL pipelines in Python and SQL, deployed on AWS with Docker.' },
})

console.log(data, error)
// Expect: data = { skills: [...] }, error = null
```

**Option B — `curl` directly against the function URL:**
```bash
curl -i -X POST \
  'https://<your-project-ref>.supabase.co/functions/v1/extract-resume-skills' \
  -H 'Authorization: Bearer <your-anon-key>' \
  -H 'Content-Type: application/json' \
  -d '{"resumeText": "Built ETL pipelines in Python and SQL, deployed on AWS with Docker."}'
```

**Checks to confirm the SPIKE proved the path:**
- A valid resume string returns `200` with a JSON body shaped `{ "skills": [...] }` containing
  plausible skill strings (e.g. `"python"`, `"sql"`, `"aws"`, `"docker"`).
- An empty-string `resumeText` returns `400` immediately (check function logs to confirm no
  Anthropic API call was attempted — no latency, no Claude usage recorded in the Anthropic
  console).
- A `resumeText` longer than 20,000 characters returns `400` with no Claude call.
- Requesting from a browser origin *not* on the allow-list (e.g. opening the deployed function URL
  directly from an arbitrary origin) is blocked by the browser's CORS check — the
  `Access-Control-Allow-Origin` response header will not match.
- `supabase functions logs extract-resume-skills` shows no resume content and no raw Claude
  response body in the log output — only the generic status/error strings this function emits.

## Tipping point

If a second Claude call is ever needed (e.g. the step-5 narration function, out of scope here),
factor the shared `fetch`/auth boilerplate into `supabase/functions/_shared/anthropic.ts` instead
of duplicating it. Not worth doing for a single function.
