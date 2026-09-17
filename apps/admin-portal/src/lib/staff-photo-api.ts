import { getAccessToken } from '@/lib/trpc'

/** Hub origin base (drops the trailing /api/trpc so we can hit /api/staff-photo). */
function staffPhotoEndpoint(): string {
  const url = process.env.NEXT_PUBLIC_HUB_API_URL ?? 'http://localhost:3004/api/trpc'
  return url.replace(/\/api\/trpc\/?$/, '') + '/api/staff-photo'
}

function bearer(): Record<string, string> {
  const token = getAccessToken()
  return token ? { authorization: `Bearer ${token}` } : {}
}

export async function uploadStaffPhoto(
  practitionerId: string,
  blob: Blob,
  lastKnownUpdate: string,
): Promise<{ photoUrl: string; lastUpdated: string }> {
  const form = new FormData()
  form.set('file', blob, `${practitionerId}.img`)
  form.set('practitionerId', practitionerId)
  form.set('lastKnownUpdate', lastKnownUpdate)
  // No Content-Type header — the browser sets the multipart boundary itself.
  const res = await fetch(staffPhotoEndpoint(), { method: 'POST', headers: bearer(), body: form })
  if (!res.ok) throw new Error(`Photo upload failed: HTTP ${res.status}`)
  return res.json() as Promise<{ photoUrl: string; lastUpdated: string }>
}

export async function removeStaffPhoto(
  practitionerId: string,
  lastKnownUpdate: string,
): Promise<{ lastUpdated: string }> {
  const res = await fetch(staffPhotoEndpoint(), {
    method: 'DELETE',
    headers: { ...bearer(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ practitionerId, lastKnownUpdate }),
  })
  if (!res.ok) throw new Error(`Photo remove failed: HTTP ${res.status}`)
  return res.json() as Promise<{ lastUpdated: string }>
}
