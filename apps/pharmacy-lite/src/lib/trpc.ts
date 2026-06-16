import type { DrugSearchResult } from '@ultranos/shared-types'
import { useAuthSessionStore } from '@/stores/auth-session-store'

export function getHubApiUrl(): string {
  if (typeof window !== 'undefined') {
    return process.env.NEXT_PUBLIC_HUB_API_URL ?? 'http://localhost:3004/api/trpc'
  }
  return process.env.HUB_API_URL ?? 'http://localhost:3004/api/trpc'
}

type AuthEventType =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILURE'
  | 'MFA_VERIFY_SUCCESS'
  | 'MFA_VERIFY_FAILURE'
  | 'PASSWORD_RESET_REQUESTED'
  | 'PASSWORD_RESET_COMPLETED'

/**
 * Fire-and-forget audit event reporting to Hub API.
 * Never throws — auth flow must not be blocked by audit failures.
 */
export async function reportAuthEvent(
  event: AuthEventType,
  opts?: { actorId?: string; actorEmail?: string },
): Promise<void> {
  try {
    await fetch(`${getHubApiUrl()}/lab.reportAuthEvent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        json: {
          event,
          ...(opts?.actorId ? { actorId: opts.actorId } : {}),
          ...(opts?.actorEmail ? { actorEmail: opts.actorEmail } : {}),
        },
      }),
    })
  } catch {
    // Audit reporting is best-effort from the client.
  }
}

/**
 * Search the Hub drug catalog by INN name, ATC code, brand name, or local name.
 * Returns identity fields only (no tier content).
 */
export async function searchDrugCatalog(
  q: string,
  lang: 'en' | 'prs' | 'ps' = 'en',
  signal?: AbortSignal,
): Promise<DrugSearchResult[]> {
  const token = await useAuthSessionStore.getState().getAccessToken()
  if (!token) return []

  const url = new URL(getHubApiUrl())
  url.pathname = url.pathname.replace(/\/$/, '') + '/drugCatalog.search'
  url.searchParams.set('input', JSON.stringify({ json: { q, lang, limit: 20 } }))

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    signal,
  })
  if (!res.ok) throw new Error(`Drug catalog search failed: ${res.status}`)
  const body = await res.json() as { result: { data: { json: DrugSearchResult[] } } }
  return body.result.data.json
}

export interface SetDrugPriceInput {
  atcCode: string
  facilityId: string
  retailPrice: number          // AFN (not minor units)
  stockSignal: 'in_stock' | 'low_stock' | 'out_of_stock'
  doseForm?: string
  quantity?: number
}

/**
 * Publish a pharmacy's retail price for a drug to the Hub.
 * Best-effort: swallows Hub errors — never propagates to UI.
 * Pharmacist role only; Hub enforces facility-scoping via JWT.
 */
export async function setDrugPrice(input: SetDrugPriceInput): Promise<void> {
  const token = await useAuthSessionStore.getState().getAccessToken()
  if (!token) return

  try {
    await fetch(`${getHubApiUrl()}/drugCatalog.setPrice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ json: input }),
    })
  } catch {
    // Best-effort: price sync failure must never block a goods receipt
  }
}
