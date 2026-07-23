// Supabase Edge Function: extract-resume-skills
//
// Server-side proxy to OpenRouter for resume skill extraction. This is the ONLY place in the
// codebase that talks to the OpenRouter API — the API key never reaches the browser bundle.
//
// Bounded-AI boundary: this function extracts a flat list of skill strings from free text. It
// performs zero scoring, ranking, or gap logic — that happens later in deterministic frontend
// code (see specs/004-resume-gap-layer.md, Task 4).
//
// Request:  POST { resumeText: string }
// Response: 200 { skills: string[] }
//           400 { error: string }  — invalid input, no upstream call made
//           502 { error: string }  — upstream failure (generic message only)

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'

// See the README in this directory for why this model was chosen.
const OPENROUTER_MODEL = 'google/gemma-4-31b-it:free'

// Static, non-PII attribution metadata OpenRouter recommends including — never derived from
// request data. See https://openrouter.ai/docs for why these headers exist.
const OPENROUTER_HTTP_REFERER = 'https://github.com/rhaeyyan/looking-glass'
const OPENROUTER_X_TITLE = 'Looking Glass'

const MAX_RESUME_LENGTH = 20000
const OPENROUTER_TIMEOUT_MS = 30000

// CORS is restricted to known frontend origins — never '*'. The Vite dev server's default port
// covers local development; production origins are supplied via the ALLOWED_ORIGINS secret
// (comma-separated) once the frontend is deployed. See this directory's README for setup.
const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173']

function resolveAllowedOrigins(): string[] {
  const configured = Deno.env.get('ALLOWED_ORIGINS')
  if (!configured) return DEFAULT_ALLOWED_ORIGINS
  return configured
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
}

function corsHeaders(requestOrigin: string | null): Record<string, string> {
  const allowedOrigins = resolveAllowedOrigins()
  const allowOrigin =
    requestOrigin && allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0]

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    Vary: 'Origin',
  }
}

function jsonResponse(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}

const EXTRACT_SKILLS_TOOL = {
  type: 'function',
  function: {
    name: 'extract_skills',
    description:
      'Record the technical skills mentioned in a resume as a flat list of short skill-name strings.',
    parameters: {
      type: 'object',
      properties: {
        skills: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Skill names extracted verbatim from the resume text, e.g. "python", "sql".',
        },
      },
      required: ['skills'],
    },
  },
} as const

async function callOpenRouter(resumeText: string, apiKey: string): Promise<string[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), OPENROUTER_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'HTTP-Referer': OPENROUTER_HTTP_REFERER,
        'X-Title': OPENROUTER_X_TITLE,
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        max_tokens: 1024,
        tools: [EXTRACT_SKILLS_TOOL],
        tool_choice: { type: 'function', function: { name: 'extract_skills' } },
        messages: [
          {
            role: 'user',
            content: `Extract every technical skill mentioned in the following resume text. Use the extract_skills tool.\n\n${resumeText}`,
          },
        ],
      }),
      signal: controller.signal,
    })
  } catch {
    throw new Error('upstream_request_failed')
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    throw new Error('upstream_request_failed')
  }

  let parsed: unknown
  try {
    parsed = await response.json()
  } catch {
    throw new Error('upstream_response_unparseable')
  }

  type OpenRouterResponse = {
    choices?: Array<{
      message?: {
        tool_calls?: Array<{ function?: { arguments?: unknown } }>
      }
    }>
  }

  const rawArguments = (parsed as OpenRouterResponse)?.choices?.[0]?.message?.tool_calls?.[0]
    ?.function?.arguments

  if (typeof rawArguments !== 'string') {
    throw new Error('upstream_response_unparseable')
  }

  let parsedArguments: unknown
  try {
    parsedArguments = JSON.parse(rawArguments)
  } catch {
    throw new Error('upstream_response_unparseable')
  }

  const skills = (parsedArguments as { skills?: unknown })?.skills

  if (!Array.isArray(skills) || !skills.every((skill) => typeof skill === 'string')) {
    throw new Error('upstream_response_unparseable')
  }

  return skills
}

Deno.serve(async (req: Request) => {
  const headers = corsHeaders(req.headers.get('origin'))

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405, headers)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'invalid_json_body' }, 400, headers)
  }

  const resumeText = (body as { resumeText?: unknown })?.resumeText

  if (typeof resumeText !== 'string' || resumeText.trim().length === 0) {
    return jsonResponse({ error: 'resumeText_required' }, 400, headers)
  }

  if (resumeText.length > MAX_RESUME_LENGTH) {
    return jsonResponse({ error: 'resumeText_too_long' }, 400, headers)
  }

  const apiKey = Deno.env.get('OPENROUTER_API_KEY')
  if (!apiKey) {
    return jsonResponse({ error: 'server_misconfigured' }, 502, headers)
  }

  try {
    const skills = await callOpenRouter(resumeText, apiKey)
    return jsonResponse({ skills }, 200, headers)
  } catch {
    // Never forward the raw upstream error text — it could leak infra details.
    return jsonResponse({ error: 'extraction_failed' }, 502, headers)
  }
})
