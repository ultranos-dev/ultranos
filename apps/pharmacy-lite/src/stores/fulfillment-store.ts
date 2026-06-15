import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { VerifiedPrescription } from '@/lib/prescription-verify'
import { createMedicationDispense } from '@/lib/medication-dispense'
import { syncDispenseToHub, type DispenseSyncResult } from '@/lib/dispense-sync'
import { logDispenseEvent } from '@/services/dispenseAuditService'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'
import { db } from '@/lib/db'
import { selectFefoBatch } from '@/lib/inventory/fefo'
import { deductStock } from '@/lib/inventory/stock-service'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { createInvoiceFromDispense } from '@/lib/pos/invoice-service'
import { hlc, serializeHlc } from '@/lib/hlc'
import { usePosStore } from '@/stores/pos-store'
import type { InvoiceLineItem } from '@/lib/pos/types'

export type FulfillmentPhase =
  | 'empty'
  | 'loaded'
  | 'reviewing'
  | 'dispensing'
  | 'completed'

export interface FulfillmentItem {
  prescription: VerifiedPrescription
  selected: boolean
  brandName: string
  batchLot: string
  fefoBatchId?: string
  fefoBatchNumber?: string
  fefoBatchExpiry?: string
}

export interface DispenseSyncStatus {
  isPending: boolean
  pendingCount: number
  lastSyncResult: DispenseSyncResult | null
}

interface FulfillmentState {
  phase: FulfillmentPhase
  items: FulfillmentItem[]
  practitionerName: string | null
  patientName: string | null
  patientAge: number | null
  scannedAt: string | null
  syncStatus: DispenseSyncStatus

  loadPrescriptions: (
    prescriptions: VerifiedPrescription[],
    practitionerName?: string,
    patient?: { name: string; age: number },
  ) => void
  toggleItem: (prescriptionId: string) => void
  selectAll: () => void
  deselectAll: () => void
  setBrandName: (prescriptionId: string, brandName: string) => void
  setBatchLot: (prescriptionId: string, batchLot: string) => void
  startReview: () => void
  assignFefoBatches: () => Promise<void>
  deductStockOnDispense: (practitionerId: string) => Promise<void>
  confirmDispense: () => Promise<void>
  createInvoiceAfterDispense: (practitionerId: string) => Promise<void>
  reset: () => void
}

export const useFulfillmentStore = create<FulfillmentState>()(
  immer((set, get) => ({
    phase: 'empty',
    items: [],
    practitionerName: null,
    patientName: null,
    patientAge: null,
    scannedAt: null,
    syncStatus: { isPending: false, pendingCount: 0, lastSyncResult: null },

    loadPrescriptions: (prescriptions, practitionerName, patient) => {
      // Guard: do not overwrite state during active dispensing
      if (get().phase === 'dispensing') return

      set((state) => {
        state.phase = 'loaded'
        state.items = prescriptions.map((rx) => ({
          prescription: rx,
          selected: true,
          brandName: '',
          batchLot: '',
        }))
        state.practitionerName = practitionerName ?? null
        state.patientName = patient?.name ?? null
        state.patientAge = patient?.age ?? null
        state.scannedAt = new Date().toISOString()
      })

      // Audit: PHI access when patient demographics are loaded for fulfillment view
      if (prescriptions.length > 0) {
        const patientRef = prescriptions[0]?.pat
        auditPhiAccess(
          useAuthSessionStore.getState().session?.userId ?? 'unknown',
          AuditAction.READ,
          AuditResourceType.PRESCRIPTION,
          'fulfillment-view',
          patientRef,
          { phiAccess: 'fulfillment_view', prescriptionCount: prescriptions.length },
        )
      }
    },

    toggleItem: (prescriptionId) => {
      set((state) => {
        const item = state.items.find((i) => i.prescription.id === prescriptionId)
        if (item) item.selected = !item.selected
      })
    },

    selectAll: () => {
      set((state) => {
        for (const item of state.items) item.selected = true
      })
    },

    deselectAll: () => {
      set((state) => {
        for (const item of state.items) item.selected = false
      })
    },

    setBrandName: (prescriptionId, brandName) => {
      set((state) => {
        const item = state.items.find((i) => i.prescription.id === prescriptionId)
        if (item) item.brandName = brandName
      })
    },

    setBatchLot: (prescriptionId, batchLot) => {
      set((state) => {
        const item = state.items.find((i) => i.prescription.id === prescriptionId)
        if (item) item.batchLot = batchLot
      })
    },

    startReview: () => {
      if (get().items.some((i) => i.selected)) {
        set((state) => {
          state.phase = 'reviewing'
        })
      }
    },

    assignFefoBatches: async () => {
      const items = get().items
      const updatedItems = await Promise.all(
        items.map(async (item) => {
          if (!item.selected || item.fefoBatchId) return item
          const catalogItem = await db.catalogItems
            .filter((c) => c.name === item.prescription.medN || c.barcode === item.prescription.med)
            .first()
          if (!catalogItem) return item
          const batch = await selectFefoBatch(catalogItem.id, item.prescription.dos.qty)
          if (!batch) return item
          return {
            ...item,
            fefoBatchId: batch.id,
            fefoBatchNumber: batch.batchNumber,
            fefoBatchExpiry: batch.expiryDate,
          }
        })
      )
      set({ items: updatedItems })
    },

    deductStockOnDispense: async (practitionerId: string) => {
      const items = get().items
      for (const item of items) {
        if (!item.selected || !item.fefoBatchId) continue
        try {
          const catalogItem = await db.catalogItems
            .filter((c) => c.name === item.prescription.medN || c.barcode === item.prescription.med)
            .first()
          if (!catalogItem) continue
          await deductStock({
            stockBatchId: item.fefoBatchId,
            catalogItemId: catalogItem.id,
            quantity: item.prescription.dos.qty,
            type: 'dispensed',
            referenceId: item.prescription.id,
            referenceType: 'dispense',
            performedBy: practitionerId,
          })
        } catch {
          // Stock deduction failure should not block dispensing
        }
      }
    },

    confirmDispense: async () => {
      // Guard: prevent double-invocation (e.g. double-tap)
      if (get().phase === 'dispensing') return

      let pharmacistRef: string
      try {
        pharmacistRef = useAuthSessionStore.getState().getPractitionerRef()
      } catch {
        throw new Error('Session expired — re-authentication required')
      }

      const selectedItems = get().items.filter((i) => i.selected)
      if (selectedItems.length === 0) return

      set((state) => {
        state.phase = 'dispensing'
        state.syncStatus.isPending = true
        state.syncStatus.pendingCount = selectedItems.length
      })

      try {
        let pendingCount = selectedItems.length

        for (let i = 0; i < selectedItems.length; i++) {
          const item = selectedItems[i]!
          const dispense = createMedicationDispense(item, pharmacistRef as `Practitioner/${string}`, {
            fulfilledCount: i + 1,
            totalCount: selectedItems.length,
          })

          // Persist locally first (offline-first)
          await db.dispenses.put(dispense)
          await logDispenseEvent(dispense, 'created')

          // Attempt Hub sync (optimistic push)
          const result = await syncDispenseToHub(dispense)

          pendingCount--
          set((state) => {
            state.syncStatus.pendingCount = pendingCount
            state.syncStatus.lastSyncResult = result
          })
        }

        set((state) => {
          state.phase = 'completed'
        })
      } catch (err) {
        // Partial failure — some items may have been persisted locally.
        // Transition to error-aware completed state so the pharmacist is warned.
        set((state) => {
          state.phase = 'completed'
          state.syncStatus.lastSyncResult = {
            synced: false,
            queued: false,
            error: err instanceof Error ? err.message : 'Dispensing failed — some items may not have been recorded. Check each medication before handing over.',
          }
        })
      } finally {
        set((state) => {
          state.syncStatus.isPending = false
        })
      }
    },

    createInvoiceAfterDispense: async (practitionerId: string) => {
      const state = get()
      const selectedItems = state.items.filter((i) => i.selected)
      if (selectedItems.length === 0) return

      const lineItems: InvoiceLineItem[] = selectedItems.map((item) => ({
        catalogItemId: item.prescription.med,
        stockBatchId: item.fefoBatchId ?? '',
        description: item.prescription.medT || item.prescription.medN,
        quantity: item.prescription.dos.qty,
        unitPrice: 0,
        lineTotal: 0,
      }))

      try {
        const invoice = await createInvoiceFromDispense({
          dispenseIds: selectedItems.map((i) => i.prescription.id),
          patientId: undefined,
          items: lineItems,
          taxRate: 0,
          createdBy: practitionerId,
          hlcTimestamp: serializeHlc(hlc.now()),
          prefix: 'INV-',
        })
        usePosStore.getState().setActiveInvoice(invoice)
      } catch {
        // Invoice creation failure should not block dispensing
      }
    },

    reset: () => {
      set((state) => {
        state.phase = 'empty'
        state.items = []
        state.practitionerName = null
        state.patientName = null
        state.patientAge = null
        state.scannedAt = null
        state.syncStatus = { isPending: false, pendingCount: 0, lastSyncResult: null }
      })
    },
  })),
)
