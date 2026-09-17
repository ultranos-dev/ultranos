/**
 * Server-side signed photo URLs. Centralizes signed-URL creation so list/detail
 * endpoints can return ready-to-render photo URLs (the client never needs the raw
 * storage key or the patient UUID — important for the data-minimized Lab portal).
 *
 * Buckets: `patient-photos` (key `{patientId}.webp`) and `staff-photos`
 * (key `{practitionerId}.webp`). Signed URLs expire in 1 hour.
 */

const TTL_SECONDS = 3600

// Minimal shape we use from the Supabase client (works for both service-role and RLS clients).
type StorageClient = {
  storage: {
    from: (bucket: string) => {
      createSignedUrl: (path: string, expiresIn: number) => Promise<{ data: { signedUrl: string } | null }>
      createSignedUrls: (
        paths: string[],
        expiresIn: number,
      ) => Promise<{ data: Array<{ path: string | null; signedUrl: string | null; error: string | null }> | null }>
    }
  }
}

/** Sign a single storage key. Returns null for a missing key or on failure. */
export async function signPhotoUrl(
  supabase: StorageClient,
  bucket: string,
  key: string | null | undefined,
): Promise<string | null> {
  if (!key) return null
  try {
    const { data } = await supabase.storage.from(bucket).createSignedUrl(key, TTL_SECONDS)
    return data?.signedUrl ?? null
  } catch {
    return null
  }
}

/**
 * Batch-sign many keys in one round-trip. Returns a map of key → signed URL.
 * Missing/blank keys are skipped; failures are omitted (caller treats absent as no photo).
 */
export async function signPhotoUrls(
  supabase: StorageClient,
  bucket: string,
  keys: Array<string | null | undefined>,
): Promise<Record<string, string>> {
  const unique = [...new Set(keys.filter((k): k is string => !!k))]
  if (unique.length === 0) return {}
  try {
    const { data } = await supabase.storage.from(bucket).createSignedUrls(unique, TTL_SECONDS)
    const map: Record<string, string> = {}
    for (const item of data ?? []) {
      if (item?.path && item.signedUrl) map[item.path] = item.signedUrl
    }
    return map
  } catch {
    return {}
  }
}

/** Convenience: derive the storage key from a practitioner/patient id. */
export function photoKey(id: string): string {
  return `${id}.webp`
}
