import { getHubBaseUrl } from '@/lib/hub-url'
import { getSupabaseBrowserClient } from '@/lib/supabase'

function staffPhotoEndpoint(): string {
  return `${getHubBaseUrl()}/api/staff-photo`
}

async function bearer(): Promise<Record<string, string>> {
  const { data } = await getSupabaseBrowserClient().auth.getSession()
  const token = data.session?.access_token
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
  const res = await fetch(staffPhotoEndpoint(), {
    method: 'POST',
    headers: await bearer(),
    body: form,
  })
  if (!res.ok) throw new Error(`Photo upload failed: HTTP ${res.status}`)
  return res.json() as Promise<{ photoUrl: string; lastUpdated: string }>
}

export async function removeStaffPhoto(
  practitionerId: string,
  lastKnownUpdate: string,
): Promise<{ lastUpdated: string }> {
  const res = await fetch(staffPhotoEndpoint(), {
    method: 'DELETE',
    headers: { ...(await bearer()), 'Content-Type': 'application/json' },
    body: JSON.stringify({ practitionerId, lastKnownUpdate }),
  })
  if (!res.ok) throw new Error(`Photo remove failed: HTTP ${res.status}`)
  return res.json() as Promise<{ lastUpdated: string }>
}
