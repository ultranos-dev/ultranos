import { getHubApiUrl } from './trpc'
import { useAuthSessionStore } from '@/stores/auth-session-store'

interface ActiveStatement { medicationDisplay?: string }

/**
 * Story 57.4 (M-PHARM-1, AC 4): the result of loading the active-medication
 * dimension of the dispense interaction check.
 *
 * `complete: false` means the active-medication list could NOT be loaded
 * (offline, no token, hub error) — it is NOT an assertion that the patient has no
 * active meds. Callers MUST treat an incomplete result as a DEGRADED check
 * (surface "active-medication check unavailable" + require override), never as an
 * implicit clear from an empty list. `meds` is always safe to feed into the
 * interaction check (empty when incomplete).
 *
 * Story 58.4 (H-HUB-7): `consentLimited: true` means the hub ran but the patient's
 * consent does not authorize the active-medication list — so `meds` is empty NOT
 * because none exist but because the data is consent-restricted. This is the same
 * false-negative risk as an unavailable check, so callers MUST treat it as a
 * DEGRADED check too (surface "active-medication data may be consent-limited" +
 * require override), never as an implicit clear.
 */
export interface ActiveMedicationResult {
  meds: string[]
  complete: boolean
  consentLimited: boolean
}

/**
 * Fetch a patient's active medication display names from the Hub (PHARMACIST-scoped).
 * Best-effort: never throws. Returns `{ meds: [], complete: false }` on no-token /
 * offline / non-OK response / error so the caller can distinguish "check could not
 * run" from "checked, none found". Online only.
 */
export async function fetchActiveMedications(patientId: string): Promise<ActiveMedicationResult> {
  try {
    if (typeof window !== 'undefined' && !navigator.onLine) return { meds: [], complete: false, consentLimited: false }
    const token = await useAuthSessionStore.getState().getAccessToken()
    if (!token) return { meds: [], complete: false, consentLimited: false }

    const url = new URL(getHubApiUrl())
    url.pathname = url.pathname.replace(/\/$/, '') + '/medicationStatement.listActiveForPharmacist'
    url.searchParams.set('input', JSON.stringify({ json: { patientRef: `Patient/${patientId}` } }))

    const res = await fetch(url.toString(), { method: 'GET', headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return { meds: [], complete: false, consentLimited: false }
    const body = (await res.json()) as {
      result: { data: { json: { statements: ActiveStatement[]; consentLimited?: boolean } } }
    }
    // Story 58.4: the hub responded (check ran), so complete: true. But if the read
    // was consent-limited, meds is empty by policy, not because none exist — flag it
    // so the caller treats it as a degraded check (require override), same as the
    // unavailable path above.
    const consentLimited = body.result.data.json.consentLimited === true
    const meds = body.result.data.json.statements
      .map((s) => s.medicationDisplay ?? '')
      .filter((d) => d.length > 0)
    return { meds, complete: true, consentLimited }
  } catch {
    return { meds: [], complete: false, consentLimited: false }
  }
}

/**
 * @deprecated Story 57.4: use {@link fetchActiveMedications} which distinguishes
 * "check could not run" (`complete: false`) from "checked, none found". This
 * thin wrapper discards the completeness signal and is retained only for callers
 * that do not surface degradation.
 */
export async function fetchActiveMedicationDisplays(patientId: string): Promise<string[]> {
  return (await fetchActiveMedications(patientId)).meds
}
