import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { FhirMedicationRequestZod } from '@ultranos/shared-types'
import type { PrescriptionFormData } from '@/lib/prescription-config'
import { mapFormToMedicationRequest, type InteractionContext } from '@/lib/medication-request-mapper'
import { db } from '@/lib/db'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'
import { enqueueSyncAction } from '@ultranos/sync-engine'
import { syncQueue } from '@/lib/sync-queue'

interface PrescriptionState {
  pendingPrescriptions: FhirMedicationRequestZod[]
  isSaving: boolean

  addPrescription: (
    form: PrescriptionFormData,
    encounterId: string,
    patientId: string,
    practitionerRef: string,
    interactionCtx?: InteractionContext,
  ) => Promise<FhirMedicationRequestZod>

  removePrescription: (medicationRequestId: string) => Promise<void>

  loadPrescriptions: (encounterId: string) => Promise<void>

  clearPhiState: () => void
}

// Epoch counter — incremented by clearPhiState to invalidate in-flight writes
let storeEpoch = 0

function nextVersion(versionId: string | undefined): string {
  const parsed = parseInt(versionId ?? '0', 10)
  return String(Number.isFinite(parsed) ? parsed + 1 : 1)
}

export const usePrescriptionStore = create<PrescriptionState>()(
  immer((set, get) => ({
    pendingPrescriptions: [],
    isSaving: false,

    addPrescription: async (form, encounterId, patientId, practitionerRef, interactionCtx?) => {
      // P1+P3: Atomic check-and-set prevents race condition and ensures
      // isSaving is only true inside the try/finally boundary
      if (get().isSaving) {
        throw new Error('A prescription save is already in progress')
      }

      const epochAtStart = storeEpoch

      // Validate synchronously before setting isSaving — mapper throws
      // should not lock the store
      const medicationRequest = mapFormToMedicationRequest(form, {
        encounterId,
        patientId,
        practitionerRef,
      }, interactionCtx)

      set((state) => {
        state.isSaving = true
      })

      try {
        await db.medications.put(medicationRequest)

        void enqueueSyncAction(syncQueue, {
          resourceType: 'MedicationRequest',
          resourceId: medicationRequest.id,
          action: 'create',
          payload: medicationRequest as unknown as Record<string, unknown>,
          hlcTimestamp: medicationRequest._ultranos.hlcTimestamp,
        })

        if (storeEpoch !== epochAtStart) return medicationRequest

        auditPhiAccess(AuditAction.CREATE, AuditResourceType.PRESCRIPTION, medicationRequest.id, patientId, {
          phiAccess: 'prescription_create',
        })

        set((state) => {
          state.pendingPrescriptions.push(medicationRequest)
        })

        return medicationRequest
      } catch (err) {
        // P10: Preserve original error message
        throw err instanceof Error ? err : new Error('Failed to save prescription')
      } finally {
        if (storeEpoch === epochAtStart) {
          set((state) => {
            state.isSaving = false
          })
        }
      }
    },

    removePrescription: async (medicationRequestId) => {
      const prescription = get().pendingPrescriptions.find(
        (p) => p.id === medicationRequestId,
      )
      if (!prescription) return

      const nowIso = new Date().toISOString()

      // Soft-cancel: append a new cancelled record (Tier 1 safety-critical — append-only).
      // The original active record is preserved; the cancelled version gets a new ID.
      const cancelledId = `${prescription.id}:cancelled:${nextVersion(prescription.meta.versionId)}`
      const cancelled: FhirMedicationRequestZod = {
        ...prescription,
        id: cancelledId,
        status: 'cancelled',
        meta: {
          ...prescription.meta,
          lastUpdated: nowIso,
          versionId: nextVersion(prescription.meta.versionId),
        },
      }

      try {
        await db.medications.put(cancelled)

        void enqueueSyncAction(syncQueue, {
          resourceType: 'MedicationRequest',
          resourceId: cancelled.id,
          action: 'update',
          payload: cancelled as unknown as Record<string, unknown>,
          hlcTimestamp: cancelled.meta.lastUpdated,
        })

        const patientRef = prescription.subject.reference.replace('Patient/', '')
        auditPhiAccess(AuditAction.DELETE_REQUEST, AuditResourceType.PRESCRIPTION, medicationRequestId, patientRef, {
          phiAccess: 'prescription_cancel',
        })

        set((state) => {
          state.pendingPrescriptions = state.pendingPrescriptions.filter(
            (p) => p.id !== medicationRequestId,
          )
        })
      } catch {
        throw new Error('Failed to cancel prescription')
      }
    },

    loadPrescriptions: async (encounterId) => {
      try {
        const medications = await db.medications
          .where('encounter.reference')
          .equals(`Encounter/${encounterId}`)
          .toArray()

        // D1: Query-time dedup — collect base IDs from cancelled records,
        // then exclude originals that have been superseded (append-only safe)
        const cancelledBaseIds = new Set(
          medications
            .filter((m) => m.status === 'cancelled')
            .map((m) => m.id.split(':cancelled:')[0]),
        )
        const active = medications.filter(
          (m) => m.status === 'active' && !cancelledBaseIds.has(m.id),
        )

        if (active.length > 0) {
          auditPhiAccess(AuditAction.READ, AuditResourceType.PRESCRIPTION, encounterId, undefined, {
            phiAccess: 'prescription_view',
            prescriptionCount: active.length,
          })
        }

        set((state) => {
          state.pendingPrescriptions = active
        })
      } catch {
        throw new Error('Failed to load prescriptions')
      }
    },

    clearPhiState: () => {
      storeEpoch++
      set((state) => {
        state.pendingPrescriptions = []
        state.isSaving = false
      })
    },
  })),
)

// P2: Register PHI cleanup on tab close / visibility change
if (typeof window !== 'undefined') {
  const cleanup = () => usePrescriptionStore.getState().clearPhiState()
  window.addEventListener('beforeunload', cleanup)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') cleanup()
  })
}
