import { createClient } from '@supabase/supabase-js'

// Publishable/anon key only — RLS (supabase/migrations/0003_frontend_read_layer.sql) is the real
// security boundary. Never the Secret key, never a hardcoded value: both come from Vite's env at
// runtime so no credential ever lands in source or in a commit.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Mirrors `role_skill_arbitrage` (supabase/migrations/0003_frontend_read_layer.sql,
// supabase/migrations/0004_role_arbitrage_narration_fields.sql) column for column. `skill_key`/
// `demand_score`/`scarcity_index`/`arbitrage_score`/`scarcity_data_completeness`/
// `d3_corroborated`/`d3_pct_of_all_postings`/`salary_premium_pct`/`median_days_open` are nullable:
// the view's LEFT JOIN means a role skill with no D1/D2 arbitrage-score match still surfaces with
// those fields null, and that row must still render, never be dropped.
export interface RoleSkillRow {
  role_family: string
  skill_name_raw: string
  skill_key: string | null
  pct_of_role: number
  postings_with_skill: number
  demand_score: number | null
  scarcity_index: number | null
  arbitrage_score: number | null
  scarcity_data_completeness: string | null
  d3_corroborated: boolean | null
  d3_pct_of_all_postings: number | null
  // Optional (not just nullable): existing RoleSkillRow literals elsewhere in the codebase
  // (specs 003/004 fixtures, predating this field) omit them entirely rather than setting them
  // to `null` — `?:` keeps this an additive, non-breaking append for those call sites, while the
  // new frozen fixtures for this spec still supply an explicit `number | null` value.
  salary_premium_pct?: number | null
  median_days_open?: number | null
}

// Deterministic query only — filters the already-computed `role_skill_arbitrage` view by the
// user's role selection. No score/gap/join computation happens client-side.
export async function fetchRoleSkillProfile(role: string): Promise<RoleSkillRow[]> {
  const { data, error } = await supabase
    .from('role_skill_arbitrage')
    .select(
      'role_family, skill_name_raw, skill_key, pct_of_role, postings_with_skill, demand_score, scarcity_index, arbitrage_score, scarcity_data_completeness, d3_corroborated, d3_pct_of_all_postings, salary_premium_pct, median_days_open',
    )
    .eq('role_family', role)

  if (error) {
    throw new Error(`Failed to fetch role skill profile for "${role}": ${error.message}`)
  }

  return data ?? []
}
