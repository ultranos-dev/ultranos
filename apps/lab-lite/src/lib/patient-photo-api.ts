import { getHubApiUrl } from '@/lib/trpc'
import { getSupabaseBrowserClient } from '@/lib/supabase'

/** Hub origin base (drops the trailing /api/trpc so we can hit /api/patient-photo). */
function photoEndpoint(): string {
  return getHubApiUrl().replace(/\/api\/trpc\/?$/, '') + '/api/patient-photo'
}

/** Current access token, or null when unauthenticated. */
async function accessToken(): Promise<string | null> {
  const { data } = await getSupabaseBrowserClient().auth.getSession()
  return data.session?.access_token ?? null
}

/**
 * Fetch a short-lived signed URL for a patient's photo by patient id (Rule #7: the
 * Hub resolves the opaque storage key server-side and returns a signed URL — the
 * client never holds the raw key). Returns null when the patient has no photo or on
 * any failure (caller shows initials). Lab-lite holds the real patient id (full
 * access, product decision 2026-09-28), so it can query by id like every other app.
 */
export async function getPatientPhotoUrl(
  patientId: string,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const token = await accessToken()
    if (!token) return null
    const res = await fetch(`${photoEndpoint()}?patientId=${encodeURIComponent(patientId)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      signal,
    })
    if (!res.ok) return null
    const json = (await res.json()) as { signedUrl?: string | null }
    return json.signedUrl ?? null
  } catch {
    return null
  }
}

/** Convert a data: URL (from the photo cropper) to a Blob for multipart upload. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const commaIdx = dataUrl.indexOf(',')
  const header = dataUrl.slice(0, commaIdx)
  const base64 = dataUrl.slice(commaIdx + 1)
  const mime = /data:(.*?);/.exec(header)?.[1] ?? 'image/jpeg'
  const bytes = atob(base64)
  const arr = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

/** Upload/replace a patient's photo (multipart). Hub stores it under an opaque key. */
export async function uploadPatientPhoto(
  patientId: string,
  blob: Blob,
  lastKnownUpdate: string,
): Promise<{ photoUrl: string; lastUpdated: string }> {
  const token = await accessToken()
  const form = new FormData()
  form.set('file', blob, `${patientId}.img`)
  form.set('patientId', patientId)
  form.set('lastKnownUpdate', lastKnownUpdate)

  const res = await fetch(photoEndpoint(), {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  })
  if (!res.ok) throw new Error(`Photo upload failed: HTTP ${res.status}`)
  return res.json() as Promise<{ photoUrl: string; lastUpdated: string }>
}

/** Remove a patient's photo. */
export async function removePatientPhoto(
  patientId: string,
  lastKnownUpdate: string,
): Promise<{ lastUpdated: string }> {
  const token = await accessToken()
  const res = await fetch(photoEndpoint(), {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ patientId, lastKnownUpdate }),
  })
  if (!res.ok) throw new Error(`Photo remove failed: HTTP ${res.status}`)
  return res.json() as Promise<{ lastUpdated: string }>
}
