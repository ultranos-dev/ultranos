import { getHubApiUrl } from './trpc'
import { useAuthSessionStore } from '@/stores/auth-session-store'

interface ActiveStatement { medicationDisplay?: string }

/**
 * Fetch a patient's active medication display names from the Hub (PHARMACIST-scoped).
 * Best-effort: returns [] on no-token / offline / error — never throws. Online only.
 */
export async function fetchActiveMedicationDisplays(patientId: string): Promise<string[]> {
  try {
    if (typeof window !== 'undefined' && !navigator.onLine) return []
    const token = await useAuthSessionStore.getState().getAccessToken()
    if (!token) return []

    const url = new URL(getHubApiUrl())
    url.pathname = url.pathname.replace(/\/$/, '') + '/medicationStatement.listActiveForPharmacist'
    url.searchParams.set('input', JSON.stringify({ json: { patientRef: `Patient/${patientId}` } }))

    const res = await fetch(url.toString(), { method: 'GET', headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return []
    const body = (await res.json()) as { result: { data: { json: { statements: ActiveStatement[] } } } }
    return body.result.data.json.statements.map((s) => s.medicationDisplay ?? '').filter((d) => d.length > 0)
  } catch {
    return []
  }
}
