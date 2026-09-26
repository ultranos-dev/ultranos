import { getAuthHeaders, getHubApiUrl } from '@/lib/hub-auth'

/** Hub origin base (drops the trailing /api/trpc so we can hit /api/patient-photo). */
function photoEndpoint(): string {
  return getHubApiUrl().replace(/\/api\/trpc\/?$/, '') + '/api/patient-photo'
}

/** Auth headers WITHOUT Content-Type — the browser sets the multipart boundary itself. */
async function bearerOnly(): Promise<Record<string, string>> {
  const headers = await getAuthHeaders()
  const { ['Content-Type']: _omit, ...rest } = headers
  return rest
}

/**
 * Fetch a short-lived signed URL for a patient's photo by patient id (Story 56.2 /
 * audit C-HUB-4: the raw storage path is no longer returned in directory/search
 * output — the Hub resolves the key server-side and returns a signed URL). Returns
 * null when the patient has no photo, or on any failure (caller shows initials).
 */
export async function getPatientPhotoUrl(
  patientId: string,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const url = `${photoEndpoint()}?patientId=${encodeURIComponent(patientId)}`
    const res = await fetch(url, { method: 'GET', headers: await getAuthHeaders(), signal })
    if (!res.ok) return null
    const data = (await res.json()) as { signedUrl?: string | null }
    return data.signedUrl ?? null
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

export async function uploadPatientPhoto(
  patientId: string,
  blob: Blob,
  lastKnownUpdate: string,
): Promise<{ photoUrl: string; lastUpdated: string }> {
  const form = new FormData()
  form.set('file', blob, `${patientId}.img`)
  form.set('patientId', patientId)
  form.set('lastKnownUpdate', lastKnownUpdate)

  const res = await fetch(photoEndpoint(), { method: 'POST', headers: await bearerOnly(), body: form })
  if (!res.ok) throw new Error(`Photo upload failed: HTTP ${res.status}`)
  return res.json() as Promise<{ photoUrl: string; lastUpdated: string }>
}

export async function removePatientPhoto(
  patientId: string,
  lastKnownUpdate: string,
): Promise<{ lastUpdated: string }> {
  const res = await fetch(photoEndpoint(), {
    method: 'DELETE',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ patientId, lastKnownUpdate }),
  })
  if (!res.ok) throw new Error(`Photo remove failed: HTTP ${res.status}`)
  return res.json() as Promise<{ lastUpdated: string }>
}
