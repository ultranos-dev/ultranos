import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { FhirMedicationRequestZod } from '@ultranos/shared-types'
import type { PrescriptionFormData } from '@/lib/prescription-config'
import { mapFormToMedicationRequest, type InteractionContext } from '@/lib/medication-request-mapper'
import { db } from '@/lib/db'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'
import { enqueueSyncAction } from '@ultranos/sync-engine'
import { syncQueue } from '@/lib/sync-queue'
import { hlc, serializeHlc } from '@/lib/hlc'

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

  /**
   * Set (or clear, with null) the preferred pharmacy on EVERY pending
   * prescription for the current encounter. The pharmacy is chosen once for the
   * whole prescription, so this rewrites dispenseRequest.performer on each
   * MedicationRequest, bumps its version, persists, and queues an update sync.
   */
  applyPharmacyToPending: (pharmacy: { id: string; name?: string } | null) => Promise<void>

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
      // The original active record is preserved; the cancellation is a distinct
      // record with its OWN uuid (the `medication_requests.id` column is uuid — a
      // suffixed `<id>:cancelled:N` value is rejected on sync), linked back to the
      // original via FHIR `priorPrescription`. It is stamped with a freshly
      // serialized HLC (NOT `meta.lastUpdated`, an ISO string that the Hub's
      // deserializeHlc would mis-parse into a near-epoch clock and mis-order).
      const cancelledTs = serializeHlc(hlc.now())
      const cancelled: FhirMedicationRequestZod = {
        ...prescription,
        id: crypto.randomUUID(),
        status: 'cancelled',
        priorPrescription: { reference: `MedicationRequest/${prescription.id}` },
        _ultranos: {
          ...prescription._ultranos,
          hlcTimestamp: cancelledTs,
        },
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
          hlcTimestamp: cancelledTs,
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

    applyPharmacyToPending: async (pharmacy) => {
      const pending = get().pendingPrescriptions
      if (pending.length === 0) return

      const nowIso = new Date().toISOString()
      const performer = pharmacy
        ? { reference: `Organization/${pharmacy.id}`, display: pharmacy.name }
        : undefined

      // Each rewrite gets a freshly serialized HLC (NOT meta.lastUpdated, an ISO
      // string the Hub would mis-parse into a near-epoch clock). hlc.now() advances
      // monotonically, so the per-record timestamps are distinct and causally ordered.
      const updated: FhirMedicationRequestZod[] = pending.map((rx) => ({
        ...rx,
        dispenseRequest: { ...(rx.dispenseRequest ?? {}), performer },
        _ultranos: {
          ...rx._ultranos,
          hlcTimestamp: serializeHlc(hlc.now()),
        },
        meta: {
          ...rx.meta,
          lastUpdated: nowIso,
          versionId: nextVersion(rx.meta.versionId),
        },
      }))

      for (const rx of updated) {
        await db.medications.put(rx)

        void enqueueSyncAction(syncQueue, {
          resourceType: 'MedicationRequest',
          resourceId: rx.id,
          action: 'update',
          payload: rx as unknown as Record<string, unknown>,
          hlcTimestamp: rx._ultranos.hlcTimestamp,
        })

        const patientRef = rx.subject.reference.replace('Patient/', '')
        auditPhiAccess(AuditAction.UPDATE, AuditResourceType.PRESCRIPTION, rx.id, patientRef, {
          phiAccess: 'prescription_pharmacy_update',
        })
      }

      set((state) => {
        state.pendingPrescriptions = updated
      })
    },

    loadPrescriptions: async (encounterId) => {
      try {
        const medications = await db.medications
          .where('encounter.reference')
          .equals(`Encounter/${encounterId}`)
          .toArray()

        // D1: Query-time dedup — collect the original IDs that cancelled records
        // point at (via FHIR priorPrescription), then exclude those originals
        // (append-only safe). Falls back to the legacy `<id>:cancelled:N` suffix
        // for any pre-existing records created before the uuid/priorPrescription fix.
        const cancelledBaseIds = new Set(
          medications
            .filter((m) => m.status === 'cancelled')
            .map(
              (m) =>
                m.priorPrescription?.reference?.replace(/^MedicationRequest\//, '') ??
                m.id.split(':cancelled:')[0],
            ),
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
