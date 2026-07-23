import { z } from 'zod'
import { supabase } from './supabaseClient'

// Bounded-AI boundary: this is the ONLY function allowed to touch the LLM (via the
// `extract-resume-skills` edge function). Its output is validated against a strict schema and
// flattened to a plain `string[]` — never a score, a gap, or a ranking. Resume text is passed
// straight through to the edge function and never logged or persisted here.

const ExtractionResponseSchema = z.object({
  skills: z.array(z.string()).max(200),
})

export class ExtractionSchemaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExtractionSchemaError'
  }
}

export async function extractResumeSkills(resumeText: string): Promise<string[]> {
  const { data, error } = await supabase.functions.invoke('extract-resume-skills', {
    body: { resumeText },
  })

  if (error) {
    throw error
  }

  const parsed = ExtractionResponseSchema.safeParse(data)
  if (!parsed.success) {
    throw new ExtractionSchemaError(
      `extract-resume-skills response failed schema validation: ${parsed.error.message}`,
    )
  }

  return parsed.data.skills
}
