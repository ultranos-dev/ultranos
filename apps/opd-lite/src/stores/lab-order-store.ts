import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { FhirServiceRequest } from '@ultranos/shared-types'
import {
  mapInputToServiceRequest,
  applyInputToServiceRequest,
  isLabOrderLocked,
  type LabOrderInput,
} from '@/lib/lab-order-mapper'
import { db } from '@/lib/db'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'
import { enqueueSyncAction } from '@ultranos/sync-engine'
import { syncQueue } from '@/lib/sync-queue'
import { hlc, serializeHlc } from '@/lib/hlc'

interface LabOrderState {
  pendingOrders: FhirServiceRequest[]
  isSaving: boolean

  addLabOrder: (
    input: LabOrderInput,
    encounterId: string,
    patientId: string,
    practitionerRef: string,
  ) => Promise<FhirServiceRequest>

  cancelLabOrder: (serviceRequestId: string) => Promise<void>

  /**
   * Edit an existing lab order in place (test, priority, reason, note, special
   * instructions). Refuses if the order is locked — i.e. a lab has already started
   * it (non-`active` status or a `receivedAt` stamp). Preserves identity,
   * provenance, and the assigned lab; bumps version + HLC and queues an update sync.
   */
  updateLabOrder: (serviceRequestId: string, input: LabOrderInput) => Promise<FhirServiceRequest>

  /**
   * Pull the Hub's processing status for the given order ids (defaults to the
   * current pending orders) and merge it forward-only onto the local copies:
   * an `active` order that the Hub reports as started becomes locked. Never
   * downgrades a started order and never rewrites a locked one. Reflects inbound
   * Hub truth — does NOT enqueue a sync or bump the version. Offline-safe (no-op
   * when the fetch returns nothing).
   */
  refreshLabOrderStatuses: (ids?: string[]) => Promise<void>

  /**
   * Set (or clear, with null) the assigned lab on EVERY pending lab order for the
   * current encounter. The lab is chosen once for all the encounter's lab tests,
   * so this rewrites ServiceRequest.performer on each order, bumps its version +
   * HLC, persists, and queues an update sync. Mirrors applyPharmacyToPending.
   */
  applyLabToPending: (lab: { id: string; name?: string } | null) => Promise<void>

  loadOrders: (encounterId: string) => Promise<void>

  clearPhiState: () => void
}

// Epoch counter — incremented by clearPhiState to invalidate in-flight writes.
let storeEpoch = 0

function nextVersion(versionId: string | undefined): string {
  const parsed = parseInt(versionId ?? '0', 10)
  return String(Number.isFinite(parsed) ? parsed + 1 : 1)
}

export const useLabOrderStore = create<LabOrderState>()(
  immer((set, get) => ({
    pendingOrders: [],
    isSaving: false,

    addLabOrder: async (input, encounterId, patientId, practitionerRef) => {
      if (get().isSaving) {
        throw new Error('A lab order save is already in progress')
      }

      const epochAtStart = storeEpoch

      // Validate + build synchronously before locking the store.
      const serviceRequest = mapInputToServiceRequest(input, {
        encounterId,
        patientId,
        practitionerRef,
      })

      set((state) => {
        state.isSaving = true
      })

      try {
        await db.serviceRequests.put(serviceRequest)

        void enqueueSyncAction(syncQueue, {
          resourceType: 'ServiceRequest',
          resourceId: serviceRequest.id,
          action: 'create',
          payload: serviceRequest as unknown as Record<string, unknown>,
          hlcTimestamp: serviceRequest._ultranos.hlcTimestamp,
        })

        if (storeEpoch !== epochAtStart) return serviceRequest

        auditPhiAccess(AuditAction.CREATE, AuditResourceType.SERVICE_REQUEST, serviceRequest.id, patientId, {
          phiAccess: 'lab_order_create',
        })

        set((state) => {
          state.pendingOrders.push(serviceRequest)
        })

        return serviceRequest
      } catch (err) {
        throw err instanceof Error ? err : new Error('Failed to save lab order')
      } finally {
        if (storeEpoch === epochAtStart) {
          set((state) => {
            state.isSaving = false
          })
        }
      }
    },

    cancelLabOrder: async (serviceRequestId) => {
      const order = get().pendingOrders.find((o) => o.id === serviceRequestId)
      if (!order) return

      const nowIso = new Date().toISOString()

      // ServiceRequest is Tier 2 (timestamp-wins), not append-only: revoke in place.
      const revoked: FhirServiceRequest = {
        ...order,
        status: 'revoked',
        meta: {
          ...order.meta,
          lastUpdated: nowIso,
          versionId: nextVersion(order.meta.versionId),
        },
      }

      try {
        await db.serviceRequests.put(revoked)

        void enqueueSyncAction(syncQueue, {
          resourceType: 'ServiceRequest',
          resourceId: revoked.id,
          action: 'update',
          payload: revoked as unknown as Record<string, unknown>,
          hlcTimestamp: revoked.meta.lastUpdated,
        })

        const patientRef = order.subject.reference.replace('Patient/', '')
        auditPhiAccess(AuditAction.UPDATE, AuditResourceType.SERVICE_REQUEST, serviceRequestId, patientRef, {
          phiAccess: 'lab_order_cancel',
        })

        set((state) => {
          state.pendingOrders = state.pendingOrders.filter((o) => o.id !== serviceRequestId)
        })
      } catch {
        throw new Error('Failed to cancel lab order')
      }
    },

    updateLabOrder: async (serviceRequestId, input) => {
      const existing = get().pendingOrders.find((o) => o.id === serviceRequestId)
      if (!existing) {
        throw new Error('Lab order not found')
      }
      // Safety: a lab that has started the order owns it now — no silent edits.
      if (isLabOrderLocked(existing)) {
        throw new Error('Cannot edit a lab order a lab has already started')
      }

      const updated = applyInputToServiceRequest(existing, input)

      try {
        await db.serviceRequests.put(updated)

        void enqueueSyncAction(syncQueue, {
          resourceType: 'ServiceRequest',
          resourceId: updated.id,
          action: 'update',
          payload: updated as unknown as Record<string, unknown>,
          hlcTimestamp: updated._ultranos.hlcTimestamp,
        })

        const patientRef = updated.subject.reference.replace('Patient/', '')
        auditPhiAccess(AuditAction.UPDATE, AuditResourceType.SERVICE_REQUEST, updated.id, patientRef, {
          phiAccess: 'lab_order_update',
        })

        set((state) => {
          state.pendingOrders = state.pendingOrders.map((o) => (o.id === updated.id ? updated : o))
        })

        return updated
      } catch {
        throw new Error('Failed to update lab order')
      }
    },

    refreshLabOrderStatuses: async (ids) => {
      const pending = get().pendingOrders
      const targetIds = ids ?? pending.map((o) => o.id)
      if (targetIds.length === 0) return

      let statuses: Array<{ id: string; status: string; receivedAt?: string; receivedByLabId?: string }>
      try {
        const { fetchLabOrderStatuses } = await import('@/lib/trpc')
        statuses = await fetchLabOrderStatuses(targetIds)
      } catch {
        return // offline / Hub unreachable — keep last-known local status
      }
      if (!statuses.length) return

      const byId = new Map(statuses.map((s) => [s.id, s]))
      const changed: FhirServiceRequest[] = []
      const merged: FhirServiceRequest[] = pending.map((order) => {
        const incoming = byId.get(order.id)
        // Forward-only: only an unlocked (`active`) order can move; once a lab has
        // started it we never downgrade or overwrite from the Hub snapshot.
        if (!incoming || order.status !== 'active' || incoming.status === 'active') {
          return order
        }
        const next: FhirServiceRequest = {
          ...order,
          status: incoming.status as FhirServiceRequest['status'],
          _ultranos: {
            ...order._ultranos,
            ...(incoming.receivedAt ? { receivedAt: incoming.receivedAt } : {}),
            ...(incoming.receivedByLabId ? { receivedByLabId: incoming.receivedByLabId } : {}),
          },
        }
        changed.push(next)
        return next
      })

      if (changed.length === 0) return

      for (const order of changed) {
        await db.serviceRequests.put(order)
      }
      set((state) => {
        state.pendingOrders = merged
      })
    },

    applyLabToPending: async (lab) => {
      const pending = get().pendingOrders
      if (pending.length === 0) return

      const nowIso = new Date().toISOString()
      const performer = lab
        ? { reference: `Organization/${lab.id}`, display: lab.name }
        : undefined

      // Locked (lab-started) orders are owned by the lab — never rewrite their
      // performer. Only unlocked orders get the encounter-wide lab re-assignment.
      // Each rewrite gets a freshly serialized HLC (NOT meta.lastUpdated, an ISO
      // string the Hub would mis-parse). hlc.now() advances monotonically.
      const changed: FhirServiceRequest[] = []
      const updated: FhirServiceRequest[] = pending.map((order) => {
        if (isLabOrderLocked(order)) return order
        const next: FhirServiceRequest = {
          ...order,
          performer,
          _ultranos: {
            ...order._ultranos,
            hlcTimestamp: serializeHlc(hlc.now()),
          },
          meta: {
            ...order.meta,
            lastUpdated: nowIso,
            versionId: nextVersion(order.meta.versionId),
          },
        }
        changed.push(next)
        return next
      })

      for (const order of changed) {
        await db.serviceRequests.put(order)

        void enqueueSyncAction(syncQueue, {
          resourceType: 'ServiceRequest',
          resourceId: order.id,
          action: 'update',
          payload: order as unknown as Record<string, unknown>,
          hlcTimestamp: order._ultranos.hlcTimestamp,
        })

        const patientRef = order.subject.reference.replace('Patient/', '')
        auditPhiAccess(AuditAction.UPDATE, AuditResourceType.SERVICE_REQUEST, order.id, patientRef, {
          phiAccess: 'lab_order_lab_update',
        })
      }

      set((state) => {
        state.pendingOrders = updated
      })
    },

    loadOrders: async (encounterId) => {
      try {
        const orders = await db.serviceRequests
          .where('encounter.reference')
          .equals(`Encounter/${encounterId}`)
          .toArray()

        // Keep active AND on-hold (a lab has started it) so started orders stay
        // visible but locked; completed/revoked/errored drop out of the editor.
        const visible = orders.filter((o) => o.status === 'active' || o.status === 'on-hold')

        if (visible.length > 0) {
          auditPhiAccess(AuditAction.READ, AuditResourceType.SERVICE_REQUEST, encounterId, undefined, {
            phiAccess: 'lab_order_view',
            orderCount: visible.length,
          })
        }

        set((state) => {
          state.pendingOrders = visible
        })
      } catch {
        throw new Error('Failed to load lab orders')
      }
    },

    clearPhiState: () => {
      storeEpoch++
      set((state) => {
        state.pendingOrders = []
        state.isSaving = false
      })
    },
  })),
)

// Register PHI cleanup on tab close / visibility change.
if (typeof window !== 'undefined') {
  const cleanup = () => useLabOrderStore.getState().clearPhiState()
  window.addEventListener('beforeunload', cleanup)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') cleanup()
  })
}
