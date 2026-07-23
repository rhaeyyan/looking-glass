import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  VALID_INVOKE_RESPONSE,
  EMPTY_SKILLS_INVOKE_RESPONSE,
  MALFORMED_MISSING_SKILLS_KEY,
  MALFORMED_WRONG_TYPE_NOT_ARRAY,
  MALFORMED_WRONG_TYPE_NON_STRING_ITEMS,
  MALFORMED_OVERSIZED,
  INVOKE_LEVEL_ERROR_RESPONSE,
} from '../test/fixtures/resumeSkills.fixture'

// RED phase (spec 004 Task 3): `extractResumeSkills()` does not exist yet — Redwood builds it in
// Task 4 to make these tests pass. This file locks the contract:
//
//   extractResumeSkills(resumeText: string): Promise<string[]>
//     - calls supabase.functions.invoke('extract-resume-skills', { body: { resumeText } })
//     - Zod-parses the { skills: string[] } response shape (schema: z.array(z.string()).max(200))
//       before returning it — a schema mismatch throws ExtractionSchemaError, a named error class
//       exported from './resumeSkills', never a silent coercion/pass-through.
//
// No live Supabase/OpenRouter call is made anywhere in this file — the `supabase` client itself is
// mocked at the module boundary, mirroring supabaseClient.test.ts's approach.

const mockInvoke = vi.hoisted(() => vi.fn())

vi.mock('./supabaseClient', () => ({
  supabase: { functions: { invoke: mockInvoke } },
}))

// Imported after the mock so the module under test picks up the mocked `supabase` client.
import { extractResumeSkills, ExtractionSchemaError } from './resumeSkills'

beforeEach(() => {
  mockInvoke.mockReset()
})

describe('extractResumeSkills', () => {
  it('invokes the extract-resume-skills edge function with the exact resume text', async () => {
    mockInvoke.mockResolvedValue(VALID_INVOKE_RESPONSE)

    await extractResumeSkills('I worked with Kubernetes, Rust, and PostgreSQL.')

    expect(mockInvoke).toHaveBeenCalledWith('extract-resume-skills', {
      body: { resumeText: 'I worked with Kubernetes, Rust, and PostgreSQL.' },
    })
  })

  it('returns the skill-name strings verbatim on a valid response', async () => {
    mockInvoke.mockResolvedValue(VALID_INVOKE_RESPONSE)

    const skills = await extractResumeSkills('some resume text')

    expect(skills).toEqual(['Kubernetes', 'Rust', 'PostgreSQL'])
  })

  it('resolves to an empty array when the edge function extracts no skills (not an error)', async () => {
    mockInvoke.mockResolvedValue(EMPTY_SKILLS_INVOKE_RESPONSE)

    await expect(extractResumeSkills('no tech skills mentioned')).resolves.toEqual([])
  })

  it('rejects with ExtractionSchemaError when the "skills" key is missing', async () => {
    mockInvoke.mockResolvedValue(MALFORMED_MISSING_SKILLS_KEY)

    await expect(extractResumeSkills('resume text')).rejects.toBeInstanceOf(ExtractionSchemaError)
  })

  it('rejects with ExtractionSchemaError when "skills" is not an array', async () => {
    mockInvoke.mockResolvedValue(MALFORMED_WRONG_TYPE_NOT_ARRAY)

    await expect(extractResumeSkills('resume text')).rejects.toBeInstanceOf(ExtractionSchemaError)
  })

  it('rejects with ExtractionSchemaError when "skills" contains non-string items', async () => {
    mockInvoke.mockResolvedValue(MALFORMED_WRONG_TYPE_NON_STRING_ITEMS)

    await expect(extractResumeSkills('resume text')).rejects.toBeInstanceOf(ExtractionSchemaError)
  })

  it('rejects with ExtractionSchemaError when "skills" exceeds the bounded array size', async () => {
    mockInvoke.mockResolvedValue(MALFORMED_OVERSIZED)

    await expect(extractResumeSkills('resume text')).rejects.toBeInstanceOf(ExtractionSchemaError)
  })

  it('never silently coerces or passes through a malformed response', async () => {
    mockInvoke.mockResolvedValue(MALFORMED_WRONG_TYPE_NOT_ARRAY)

    // A malformed response must never resolve to a value that could be mistaken for a real
    // string[] result — regardless of the specific error type, this call must reject.
    await expect(extractResumeSkills('resume text')).rejects.toBeTruthy()
  })

  it('rejects (not silently returns []) when the edge-function invocation itself fails', async () => {
    mockInvoke.mockResolvedValue(INVOKE_LEVEL_ERROR_RESPONSE)

    await expect(extractResumeSkills('resume text')).rejects.toBeTruthy()
  })
})
