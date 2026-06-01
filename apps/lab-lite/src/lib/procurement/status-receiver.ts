/**
 * Procurement Status Receiver — Story 52.3 Task 4
 *
 * Handles inbound status updates pushed from the Hub.
 * Status history is append-only — no status entry is ever removed or modified.
 *
 * No PHI: status updates contain only operational/procurement metadata.
 */

import { getDb } from '../db'
import { emitClientAudit } from '@ultranos/audit-logger/client'
import { AuditAction, AuditResourceType } from '@ultranos/shared-types'
import { calculateLeadTimeDays, calculateTotalCost } from './cost-tracker'
import type { ResupplyRequest, ResupplyStatus, OrderHistoryEntry } from '../db'

// ---------------------------------------------------------------------------
// Inbound payload type (from Hub sync)
// ---------------------------------------------------------------------------

export interface StatusUpdatePayload {
  requestId: string
  newStatus: ResupplyStatus
  updatedBy: string
  note: string | null
  estimatedDelivery: string | null
  batchOrderId: string | null
  pricing: {
    itemCode: string
    unitPrice: number
    totalPrice: number
  }[] | null
}

// ---------------------------------------------------------------------------
// applyStatusUpdate — process a Hub-pushed status change (AC 5, 6)
// ---------------------------------------------------------------------------

export async function applyStatusUpdate(payload: StatusUpdatePayload): Promise<void> {
  const db = getDb()

  const existing = await db.resupplyRequests
    .where('requestId')
    .equals(payload.requestId)
    .first()

  if (!existing?.id) {
    // Request not found locally — silently skip (Hub may push before local sync)
    return
  }

  const oldStatus = existing.status
  const now = new Date().toISOString()

  // Build updated items with pricing if provided
  let updatedItems = [...existing.items]
  if (payload.pricing && payload.pricing.length > 0) {
    updatedItems = updatedItems.map((item) => {
      const priceEntry = payload.pricing!.find((p) => p.itemCode === item.reagentCode)
      if (priceEntry) {
        return { ...item, unitPrice: priceEntry.unitPrice, totalPrice: priceEntry.totalPrice }
      }
      return item
    })
  }

  // Append to status history (never modify existing entries — append-only)
  const updatedHistory = [
    ...existing.statusHistory,
    {
      status: payload.newStatus,
      updatedAt: now,
      updatedBy: payload.updatedBy,
      note: payload.note,
    },
  ]

  const updates: Partial<ResupplyRequest> = {
    status: payload.newStatus,
    statusHistory: updatedHistory,
    items: updatedItems,
    updatedAt: now,
  }

  if (payload.estimatedDelivery) {
    updates.estimatedDelivery = payload.estimatedDelivery
  }
  if (payload.batchOrderId) {
    updates.batchOrderId = payload.batchOrderId
  }

  // If delivered: set actualDelivery and copy to orderHistory
  if (payload.newStatus === 'delivered') {
    updates.actualDelivery = now

    const leadTimeDays = calculateLeadTimeDays(existing.requestedAt, now)
    const totalCost = calculateTotalCost(updatedItems)

    const historyEntry: Omit<OrderHistoryEntry, 'id'> = {
      requestId: existing.requestId,
      labId: existing.labId,
      requestedBy: existing.requestedBy,
      requestedAt: existing.requestedAt,
      deliveredAt: now,
      items: updatedItems,
      urgency: existing.urgency,
      batchOrderId: existing.batchOrderId ?? payload.batchOrderId,
      leadTimeDays,
      totalCost,
      volumeSavingsAFN: null, // Hub may provide later via separate event
      createdAt: now,
    }

    await db.orderHistory.add(historyEntry as OrderHistoryEntry)
  }

  await db.resupplyRequests.update(existing.id, updates)

  // Audit log: RESUPPLY_STATUS_UPDATED (AC 9)
  emitClientAudit({
    action: AuditAction.UPDATE,
    resourceType: AuditResourceType.SUPPLY_REQUEST,
    resourceId: payload.requestId,
    metadata: {
      oldStatus,
      newStatus: payload.newStatus,
      updatedBy: payload.updatedBy,
    },
  })
}
