import type { SupabaseClient } from '@supabase/supabase-js'

// WHO ATC 5th-level shape, e.g. B01AA03, N05AN01
const ATC_SHAPE = /^[A-Z]\d{2}[A-Z]{2}\d{2}$/

/**
 * Resolve a dispensed medication code to its canonical ATC code.
 * Order: exact catalog match → ATC-shape trust → unresolvable (null).
 * Brand→generic resolution is intentionally omitted (YAGNI): dispenses carry
 * generic ATC-shaped codes today; an unresolved code is made observable by the
 * caller (metric + audit) so any real brand-code gap surfaces before we build it.
 */
export async function resolveCanonicalAtc(
  supabase: SupabaseClient,
  medicationCode: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('drug_catalog')
    .select('atc_code')
    .eq('atc_code', medicationCode)
    .maybeSingle()
  if (data?.atc_code) return data.atc_code as string
  if (ATC_SHAPE.test(medicationCode)) return medicationCode
  return null
}
