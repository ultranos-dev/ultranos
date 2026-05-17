import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Check if a practitioner's public key has been revoked (Key Revocation List).
 *
 * Queries the practitioner_keys table for the given public key and checks
 * if revoked_at is set. Fail-closed: if the DB query fails or the key is
 * not found, the key is treated as revoked (request rejected).
 *
 * @param publicKey - Base64-encoded public key to check
 * @param supabase  - Supabase client instance
 * @returns true if key is revoked or cannot be verified, false if active
 */
export async function isKeyRevoked(
  publicKey: string,
  supabase: SupabaseClient,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('practitioner_keys')
    .select('revoked_at')
    .eq('public_key', publicKey)
    .single()

  // Fail-closed: DB error or key not found → treat as revoked
  if (error || !data) {
    return true
  }

  // Key exists — revoked if revoked_at is set
  return data.revoked_at != null
}
