import type { SupabaseClient } from '@supabase/supabase-js'

export interface PractitionerInfo {
  practitionerId: string
  role: string
}

/**
 * Maps a Supabase auth UUID to a FHIR Practitioner reference and role.
 * Queries the `practitioners` table which links auth.users.id to Practitioner.id.
 *
 * Fail-Safe: returns null if not found or on any DB error (default to "No Access").
 */
export async function getPractitionerFromAuthId(
  supabase: SupabaseClient,
  authUserId: string,
): Promise<PractitionerInfo | null> {
  const { data, error } = await supabase
    .from('practitioners')
    .select('id, fhir_practitioner_id, role')
    .eq('auth_user_id', authUserId)
    .single()

  if (error || !data) {
    // Log shape only — never PHI
    if (error && error.code !== 'PGRST116') {
      console.error('Practitioner lookup error:', { code: error.code })
    }
    return null
  }

  return {
    practitionerId: data.fhir_practitioner_id,
    role: data.role,
  }
}
