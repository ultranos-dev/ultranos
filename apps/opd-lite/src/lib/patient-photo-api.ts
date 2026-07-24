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
