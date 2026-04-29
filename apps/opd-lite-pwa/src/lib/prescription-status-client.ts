/**
 * Hub API client for prescription status checks.
 * Story 3.4: Global Prescription Invalidation Check.
 *
 * Uses raw fetch (same pattern as trpc.ts) to avoid pulling hub-api
 * runtime deps into the PWA build.
 */

export type InvalidationStatus = 'AVAILABLE' | 'FULFILLED' | 'VOIDED'

export interface PrescriptionStatusResult {
  prescriptionId: string
  status: InvalidationStatus
  medicationDisplay: string
  authoredOn: string
  dispensedAt: string | null
}

export interface CompletePrescriptionResult {
  success: boolean
  prescriptionId: string
  previousStatus: InvalidationStatus
  newStatus: 'FULFILLED'
  dispensedAt: string
}

function getHubApiUrl(): string {
  if (typeof window !== 'undefined') {
    return process.env.NEXT_PUBLIC_HUB_API_URL ?? 'http://localhost:3000/api/trpc'
  }
  return process.env.HUB_API_URL ?? 'http://localhost:3000/api/trpc'
}

/**
 * AC 1, 2: Check prescription status against the Hub API.
 * AC 4: Returns null when offline (caller must show warning).
 */
export async function checkPrescriptionStatus(
  prescriptionId: string,
  authToken: string,
  signal?: AbortSignal,
): Promise<PrescriptionStatusResult> {
  const url = new URL(getHubApiUrl())
  url.pathname = url.pathname.replace(/\/$/, '') + '/medication.getStatus'
  url.searchParams.set(
    'input',
    JSON.stringify({ json: { prescriptionId } }),
  )

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    signal,
  })

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const message = body?.error?.message ?? `Hub API error: ${res.status}`
    throw new Error(message)
  }

  const body = (await res.json()) as {
    result: { data: { json: PrescriptionStatusResult } }
  }
  return body.result.data.json
}

/**
 * AC 5: Mark prescription as fulfilled on the Hub.
 * Requires authentication token.
 */
export async function completePrescription(
  prescriptionId: string,
  authToken: string,
  signal?: AbortSignal,
): Promise<CompletePrescriptionResult> {
  const url = new URL(getHubApiUrl())
  url.pathname = url.pathname.replace(/\/$/, '') + '/medication.complete'

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ json: { prescriptionId } }),
    signal,
  })

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const message = body?.error?.message ?? `Hub API error: ${res.status}`
    throw new Error(message)
  }

  const body = (await res.json()) as {
    result: { data: { json: CompletePrescriptionResult } }
  }
  return body.result.data.json
}
