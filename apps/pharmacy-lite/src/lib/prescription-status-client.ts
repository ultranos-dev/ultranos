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

/** The signed prescription bundle scanned from the QR (payload/sig/pub). */
export interface SignedBundleInput {
  payload: string
  sig: string
  pub: string
}

function getHubApiUrl(): string {
  if (typeof window !== 'undefined') {
    return process.env.NEXT_PUBLIC_HUB_API_URL ?? 'http://localhost:3004/api/trpc'
  }
  return process.env.HUB_API_URL ?? 'http://localhost:3004/api/trpc'
}

/**
 * Story 3.4: Check a prescription's global status against the Hub.
 *
 * The Hub verifies the Ed25519 signature over the payload before any DB lookup,
 * so we send the full signed bundle plus the specific prescription id we are
 * checking (`targetPrescriptionId`). The Hub confirms that id is present in the
 * signed payload array before resolving its status — binding the checked id to
 * the verified signature. Callers handle the thrown error (e.g. Hub offline) by
 * warning and proceeding, per the offline-first policy.
 */
export async function checkPrescriptionStatus(
  signedBundle: SignedBundleInput,
  targetPrescriptionId: string,
  authToken: string,
  signal?: AbortSignal,
): Promise<PrescriptionStatusResult> {
  const url = new URL(getHubApiUrl())
  url.pathname = url.pathname.replace(/\/$/, '') + '/medication.getStatus'
  url.searchParams.set(
    'input',
    JSON.stringify({ json: { signedBundle, targetPrescriptionId } }),
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
