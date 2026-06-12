/**
 * Story 53.4 — Consultation Response Handler & Sync
 *
 * Store-and-forward model:
 * - Outbound: consultation_requests with syncStatus='pending' are synced to Hub.
 * - Inbound: responses from experts are fetched on each sync cycle and stored locally.
 *
 * PHI rules (CLAUDE.md):
 * - No PHI in any sync payload metadata — request/response IDs are opaque UUIDs.
 * - Notification uses opaque sampleId — never patient name (Rule #7).
 */

import { getDb } from './db'
import type { ConsultationResponse } from './consultation'
import { reportConsultationEvent } from './audit-client'

// ---------------------------------------------------------------------------
// Outbound sync — push pending requests to Hub
// ---------------------------------------------------------------------------

/**
 * Sync pending consultation requests to Hub.
 * Called by the sync engine on each connectivity event.
 * Never throws — connectivity failures are handled gracefully.
 */
export async function syncPendingRequests(
  hubApiUrl: string,
  token: string,
): Promise<void> {
  const db = getDb()

  try {
    // Recovery: reset any requests stuck in 'syncing' from a prior crash
    await db.consultation_requests
      .where('syncStatus')
      .equals('syncing')
      .modify({ syncStatus: 'pending' })

    const pending = await db.consultation_requests
      .where('syncStatus')
      .equals('pending')
      .and((r) => r.status === 'submitted')
      .toArray()

    for (const request of pending) {
      // Atomically claim this request for this sync cycle — prevents duplicate sends on concurrent cycles
      const claimed = await db.transaction('rw', db.consultation_requests, async () => {
        const current = await db.consultation_requests.get(request.id)
        if (!current || current.syncStatus !== 'pending') return false
        await db.consultation_requests.update(request.id, { syncStatus: 'syncing' })
        return true
      })
      if (!claimed) continue  // another cycle already claimed it

      try {
        const res = await fetch(`${hubApiUrl}/consultation/requests`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(request),
        })

        if (res.ok) {
          await db.consultation_requests.update(request.id, {
            syncStatus: 'synced',
            status: 'sent',
          })

          reportConsultationEvent({
            action: 'CONSULTATION_SUBMITTED',
            consultationId: request.id,
            recipientType: request.recipientType,
            status: 'sent',
          })
        } else {
          await db.consultation_requests.update(request.id, { syncStatus: 'failed' })
        }
      } catch {
        await db.consultation_requests.update(request.id, { syncStatus: 'failed' })
      }
    }
  } catch {
    // Dexie query failure — non-critical
  }
}

// ---------------------------------------------------------------------------
// Inbound sync — pull expert responses from Hub
// ---------------------------------------------------------------------------

export interface IncomingResponse {
  id: string
  requestId: string
  respondentName: string
  respondentCredentials: string
  responseText: string
  attachments: string[]
  receivedAt: string
  hlcTimestamp: string
}

/**
 * Fetch new consultation responses from Hub and store them locally.
 * Attaches each response to the corresponding consultation request.
 * Emits an in-app notification per new response.
 *
 * Never throws — connectivity failures are non-critical.
 */
export async function syncIncomingResponses(
  hubApiUrl: string,
  token: string,
  onNotification?: (sampleId: string, consultationId: string) => void,
): Promise<void> {
  const db = getDb()

  try {
    const res = await fetch(`${hubApiUrl}/consultation/responses/pending`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return

    const data = (await res.json()) as { responses: IncomingResponse[] }

    for (const incoming of data.responses) {
      // Idempotency check — don't duplicate
      const existing = await db.consultation_responses.get(incoming.id)
      if (existing) continue

      const response: ConsultationResponse = {
        id: incoming.id,
        requestId: incoming.requestId,
        respondentName: incoming.respondentName,
        respondentCredentials: incoming.respondentCredentials,
        responseText: incoming.responseText,
        attachments: incoming.attachments,
        receivedAt: incoming.receivedAt,
        hlcTimestamp: incoming.hlcTimestamp,
      }

      // Check for orphaned response BEFORE writing anything
      const request = await db.consultation_requests.get(incoming.requestId)

      if (!request) {
        // Orphaned response — no matching local request (e.g. after device restore).
        // Log for operator visibility (no PHI — only opaque requestId).
        // Cannot notify — no sampleId is recoverable for routing.
        console.warn('[consultation-sync] Orphaned response for unknown requestId:', incoming.requestId)
        continue
      }

      // Parent exists — safe to write
      await db.consultation_responses.add(response)

      // Update parent request status
      await db.consultation_requests.update(incoming.requestId, {
        status: 'response_received',
      })

      reportConsultationEvent({
        action: 'CONSULTATION_RESPONSE_RECEIVED',
        consultationId: incoming.requestId,
        recipientType: request.recipientType,
        status: 'response_received',
      })

      // Emit in-app notification (no PHI — only sampleId)
      onNotification?.(request.sampleId, incoming.requestId)
    }
  } catch {
    // Non-critical — responses will be fetched on next sync
  }
}

// ---------------------------------------------------------------------------
// Close a consultation (tech has reviewed the response)
// ---------------------------------------------------------------------------

/**
 * Mark a consultation as closed after the tech has reviewed the expert response.
 * Emits a CONSULTATION_CLOSED audit event.
 */
export async function closeConsultation(consultationId: string): Promise<void> {
  const db = getDb()

  await db.consultation_requests.update(consultationId, { status: 'closed' })

  const request = await db.consultation_requests.get(consultationId)

  if (request) {
    reportConsultationEvent({
      action: 'CONSULTATION_CLOSED',
      consultationId,
      recipientType: request.recipientType,
      status: 'closed',
    })
  }
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/** Get all consultation requests for a given sample. */
export async function getConsultationsForSample(sampleId: string) {
  return getDb().consultation_requests.where('sampleId').equals(sampleId).toArray()
}

/** Get the response for a given consultation request (if received). */
export async function getResponseForRequest(requestId: string) {
  const responses = await getDb().consultation_responses
    .where('requestId')
    .equals(requestId)
    .toArray()
  return responses[0] ?? null
}
