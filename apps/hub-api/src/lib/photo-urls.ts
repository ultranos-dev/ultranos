/**
 * Server-side signed photo URLs. Centralizes signed-URL creation so list/detail
 * endpoints can return ready-to-render photo URLs (the client never needs the raw
 * storage key or the patient UUID — important for the data-minimized Lab portal).
 *
 * Storage-key policy (Story 58.1 / audit C-SYS-4):
 * - `patient-photos` objects are keyed by an OPAQUE random id (`opaquePhotoKey()`),
 *   NOT by the patient UUID. The key is the value persisted in `patients.photo_url`
 *   and is the ONLY thing a signed URL path exposes — so a lab client (which only
 *   ever holds the HMAC blind-index ref) cannot recover the patient UUID from, or
 *   correlate patients across, signed photo URLs. Always sign the stored
 *   `photo_url` value directly; never derive a key from the patient id.
 * - `staff-photos` objects remain keyed by practitioner/auth id — those ids are not
 *   blind-indexed secrets and staff photos are never served to the lab portal.
 * Signed URLs expire in 1 hour.
 */

import { randomUUID } from 'node:crypto'

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

/**
 * Generate an OPAQUE, non-correlating storage key for a NEW patient photo upload.
 * The key embeds no patient UUID and no cross-record-stable identifier — a fresh
 * random id per upload. Persist the returned key in `patients.photo_url`, then sign
 * that stored value with {@link signPhotoUrl}/{@link signPhotoUrls}. This is what
 * defeats the C-SYS-4 blind-index leak: lab-facing signed URLs carry only this key.
 */
export function opaquePhotoKey(): string {
  return `${randomUUID()}.webp`
}

/**
 * @deprecated Do NOT use for patient photos. Deriving a storage key from the
 * patient id embeds the real patient UUID into signed-URL paths handed to lab
 * clients, defeating the HMAC blind index (audit C-SYS-4). Patient photos are now
 * stored under {@link opaquePhotoKey} and signed via the stored `photo_url` value.
 * Retained only so any legacy staff-photo callsite (non-lab, non-blind-indexed)
 * keeps compiling; new code must not call this.
 */
export function photoKey(id: string): string {
  return `${id}.webp`
}
