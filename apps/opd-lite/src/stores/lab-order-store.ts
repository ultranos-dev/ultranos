import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { FhirServiceRequest } from '@ultranos/shared-types'
import { mapInputToServiceRequest, type LabOrderInput } from '@/lib/lab-order-mapper'
import { db } from '@/lib/db'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'
import { enqueueSyncAction } from '@ultranos/sync-engine'
import { syncQueue } from '@/lib/sync-queue'

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

    loadOrders: async (encounterId) => {
      try {
        const orders = await db.serviceRequests
          .where('encounter.reference')
          .equals(`Encounter/${encounterId}`)
          .toArray()

        const active = orders.filter((o) => o.status === 'active')

        if (active.length > 0) {
          auditPhiAccess(AuditAction.READ, AuditResourceType.SERVICE_REQUEST, encounterId, undefined, {
            phiAccess: 'lab_order_view',
            orderCount: active.length,
          })
        }

        set((state) => {
          state.pendingOrders = active
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
