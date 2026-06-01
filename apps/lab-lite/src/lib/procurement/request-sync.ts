/**
 * Procurement Request Sync — Story 52.3 Task 3
 *
 * Handles creation, validation, and outbound sync of resupply requests.
 * Requests save immediately to Dexie (offline-first), then sync when online.
 *
 * No PHI: resupply requests contain reagent codes and operational metadata only.
 */

import { getDb, enqueueSyncEvent } from '../db'
import { hlc, serializeHlc } from '../hlc'
import { emitClientAudit } from '@ultranos/audit-logger/client'
import { AuditAction, AuditResourceType } from '@ultranos/shared-types'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import type {
  ResupplyRequest,
  ResupplyRequestItem,
  ResupplyStatus,
} from '../db'

// ---------------------------------------------------------------------------
// Validation types
// ---------------------------------------------------------------------------

export interface ResupplyRequestDraft {
  items: Omit<ResupplyRequestItem, 'unitPrice' | 'totalPrice'>[]
  urgency: ResupplyRequest['urgency']
  notes: string
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

// ---------------------------------------------------------------------------
// validateResupplyRequest — form validation (AC 2)
// ---------------------------------------------------------------------------

export function validateResupplyRequest(draft: ResupplyRequestDraft): ValidationResult {
  const errors: string[] = []

  if (!draft.items || draft.items.length === 0) {
    errors.push('At least one item is required')
  } else {
    draft.items.forEach((item, idx) => {
      if (!item.quantityRequested || item.quantityRequested <= 0) {
        errors.push(`Item ${idx + 1}: quantity must be greater than 0`)
      }
    })
  }

  const validUrgencies: ResupplyRequest['urgency'][] = ['routine', 'urgent', 'critical']
  if (!validUrgencies.includes(draft.urgency)) {
    errors.push(`Invalid urgency value: ${draft.urgency}. Must be routine, urgent, or critical`)
  }

  if (draft.notes && draft.notes.length > 500) {
    errors.push('Notes must not exceed 500 characters')
  }

  return { valid: errors.length === 0, errors }
}

// ---------------------------------------------------------------------------
// computeUrgencyFromDaysRemaining — burndown integration (AC 1, Task 8)
// ---------------------------------------------------------------------------

export function computeUrgencyFromDaysRemaining(daysRemaining: number): ResupplyRequest['urgency'] {
  if (daysRemaining < 7) return 'critical'
  if (daysRemaining <= 14) return 'urgent'
  return 'routine'
}

// ---------------------------------------------------------------------------
// buildResupplyRequest — construct a new ResupplyRequest from a draft
// ---------------------------------------------------------------------------

export interface BuildResupplyRequestInput {
  labId: string
  requestedBy: string
  items: Omit<ResupplyRequestItem, 'unitPrice' | 'totalPrice'>[]
  urgency: ResupplyRequest['urgency']
  notes: string
  hlcTimestamp: string
}

export function buildResupplyRequest(input: BuildResupplyRequestInput): Omit<ResupplyRequest, 'id'> {
  const requestId = crypto.randomUUID()
  const now = new Date().toISOString()

  return {
    requestId,
    labId: input.labId,
    requestedBy: input.requestedBy,
    requestedAt: now,
    hlcTimestamp: input.hlcTimestamp,
    items: input.items.map((item) => ({
      ...item,
      unitPrice: null,
      totalPrice: null,
    })),
    urgency: input.urgency,
    notes: input.notes,
    status: 'submitted' as ResupplyStatus,
    statusHistory: [
      {
        status: 'submitted' as ResupplyStatus,
        updatedAt: now,
        updatedBy: input.requestedBy,
        note: null,
      },
    ],
    batchOrderId: null,
    estimatedDelivery: null,
    actualDelivery: null,
    syncStatus: 'pending',
    createdAt: now,
    updatedAt: now,
  }
}

// ---------------------------------------------------------------------------
// submitResupplyRequest — saves to Dexie and enqueues sync (AC 3, 10)
// ---------------------------------------------------------------------------

export async function submitResupplyRequest(
  draft: ResupplyRequestDraft,
): Promise<{ requestId: string; localId: number }> {
  const session = useAuthSessionStore.getState().session
  if (!session) throw new Error('No active session')

  const timestamp = serializeHlc(hlc.now())

  const request = buildResupplyRequest({
    labId: session.labId ?? 'unknown-lab',
    requestedBy: session.userId ?? 'unknown-tech',
    items: draft.items,
    urgency: draft.urgency,
    notes: draft.notes,
    hlcTimestamp: timestamp,
  })

  const db = getDb()
  const localId = await db.resupplyRequests.add(request as ResupplyRequest)

  // Enqueue for Hub sync at priority 6 (operational, same as Patient demographics)
  await enqueueSyncEvent({
    resourceType: 'SupplyRequest',
    resourceId: request.requestId,
    status: 'pending',
    payload: request,
    createdAt: request.createdAt,
    lastAttemptAt: null,
    retryCount: 0,
  })

  // Audit log: RESUPPLY_REQUEST_SUBMITTED (AC 9)
  emitClientAudit({
    action: AuditAction.CREATE,
    resourceType: AuditResourceType.SUPPLY_REQUEST,
    resourceId: request.requestId,
    metadata: {
      labId: request.labId,
      urgency: request.urgency,
      itemCount: request.items.length,
    },
  })

  return { requestId: request.requestId, localId }
}

/**
 * Mark a request's syncStatus after successful Hub sync.
 */
export async function markRequestSynced(requestId: string): Promise<void> {
  const db = getDb()
  const existing = await db.resupplyRequests.where('requestId').equals(requestId).first()
  if (!existing?.id) return
  await db.resupplyRequests.update(existing.id, {
    syncStatus: 'synced',
    updatedAt: new Date().toISOString(),
  })
}

/**
 * Mark a request's syncStatus as failed.
 */
export async function markRequestSyncFailed(requestId: string): Promise<void> {
  const db = getDb()
  const existing = await db.resupplyRequests.where('requestId').equals(requestId).first()
  if (!existing?.id) return
  await db.resupplyRequests.update(existing.id, {
    syncStatus: 'failed',
    updatedAt: new Date().toISOString(),
  })
}
