import type { DrugSearchResult } from '@ultranos/shared-types'
// Type-only Hub contract (Story 59.2, Task 2): the prescription wire DTO is defined
// once in @ultranos/hub-client (no runtime dependency on hub-api) and re-exported
// below under its historical name. Requests are unchanged (byte-equivalent, AC6).
import type { PharmacyPrescriptionItem } from '@ultranos/hub-client'
import { useAuthSessionStore } from '@/stores/auth-session-store'

// Re-export the canonical Hub DTO under the name pharmacy-lite consumers already import.
export type { PharmacyPrescriptionItem }

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
 * Story 61.2: fetch the caller's per-user key-wrapping secret from the Hub
 * (`session.getKeyWrappingSecret`). Held in memory only — NEVER persisted
 * client-side. Returns null on any failure (offline / no token / refusal) so the
 * caller can fall back to the offline PIN-unlock path. No PHI involved.
 */
export async function fetchKeyWrappingSecret(): Promise<string | null> {
  try {
    const token = await useAuthSessionStore.getState().getAccessToken()
    if (!token) return null
    const url = new URL(getHubApiUrl())
    url.pathname = url.pathname.replace(/\/$/, '') + '/session.getKeyWrappingSecret'
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    const body = (await res.json()) as { result?: { data?: { json?: { secret?: string } } } }
    return body?.result?.data?.json?.secret ?? null
  } catch {
    return null
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

// `PharmacyPrescriptionItem` (a patient's un-dispensed prescription, data-minimized
// for the pharmacy) is defined once in @ultranos/hub-client and re-exported above.

/**
 * Pull a patient's un-dispensed prescriptions from the Hub — the no-QR lookup
 * path (Gap #4). The pharmacist identifies the patient first (Health Passport
 * identity QR or national-ID lookup); pass the resulting patient UUID. The signed
 * prescription-QR remains the offline-primary channel; this covers repeat fills
 * and patients arriving without a printed QR.
 */
export async function listPrescriptionsForPatient(
  patientRef: string,
  signal?: AbortSignal,
): Promise<PharmacyPrescriptionItem[]> {
  const token = await useAuthSessionStore.getState().getAccessToken()
  if (!token) return []

  const url = new URL(getHubApiUrl())
  url.pathname = url.pathname.replace(/\/$/, '') + '/medication.listForPharmacy'
  url.searchParams.set('input', JSON.stringify({ json: { patientRef } }))

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    signal,
  })
  if (!res.ok) throw new Error(`Prescription lookup failed: ${res.status}`)
  const body = (await res.json()) as {
    result: { data: { json: { prescriptions: PharmacyPrescriptionItem[] } } }
  }
  return body.result.data.json.prescriptions
}

// ── Notifications (generic notification.* Hub router) ───────────────────────

export interface PharmacyNotificationPayload {
  /** NON-PHI fields for DISPENSE_REVIEW_RESOLVED */
  reviewId?: string
  prescriptionId?: string
  status?: string
  acknowledgedAt?: string
  [key: string]: unknown
}

export interface PharmacyNotification {
  id: string
  type: string
  payload: PharmacyNotificationPayload
  status: string
  createdAt: string
  deliveredAt: string | null
  acknowledgedAt: string | null
  /** Descriptor fields from Hub (Task 10 — notification presentation enrichment) */
  sourceApp?: string | null
  subjectKey?: string | null
  bodyKey?: string | null
  bodyParams?: Record<string, string | number>
  notesKey?: string | null
}

/** Unread notification count for the pharmacist (badge). Best-effort → 0 on failure. */
export async function getUnreadNotificationCount(): Promise<number> {
  try {
    const token = await useAuthSessionStore.getState().getAccessToken()
    if (!token) return 0
    const res = await fetch(`${getHubApiUrl()}/notification.unreadCount`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return 0
    const body = await res.json() as { result: { data: { json: { count: number } } } }
    return body.result.data.json.count
  } catch {
    return 0
  }
}

/** List the pharmacist's notifications (newest first). */
export async function listNotifications(): Promise<PharmacyNotification[]> {
  const token = await useAuthSessionStore.getState().getAccessToken()
  if (!token) return []
  const res = await fetch(`${getHubApiUrl()}/notification.list`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Failed to fetch notifications: ${res.status}`)
  // notification.list returns { notifications: [...] }, not a bare array.
  const body = await res.json() as { result: { data: { json: { notifications: PharmacyNotification[] } } } }
  return body.result.data.json.notifications
}

/** Acknowledge a single notification. */
export async function acknowledgeNotification(notificationId: string): Promise<void> {
  const token = await useAuthSessionStore.getState().getAccessToken()
  if (!token) return
  await fetch(`${getHubApiUrl()}/notification.acknowledge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ json: { notificationId } }),
  })
}

/** Delete a single notification. */
export async function deleteNotification(notificationId: string): Promise<void> {
  const token = await useAuthSessionStore.getState().getAccessToken()
  if (!token) return
  await fetch(`${getHubApiUrl()}/notification.delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ json: { notificationId } }),
  })
}

/** Mark a single notification as unread (reverses acknowledge). */
export async function markUnreadNotification(notificationId: string): Promise<void> {
  const token = await useAuthSessionStore.getState().getAccessToken()
  if (!token) return
  await fetch(`${getHubApiUrl()}/notification.markUnread`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ json: { notificationId } }),
  })
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
