import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { VerifiedPrescription } from '@/lib/prescription-verify'
import { createMedicationDispense } from '@/lib/medication-dispense'
import { syncDispenseToHub, type DispenseSyncResult } from '@/lib/dispense-sync'
import { logDispenseEvent } from '@/services/dispenseAuditService'
import { db } from '@/lib/db'

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
  confirmDispense: (pharmacistId: string) => Promise<void>
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

    confirmDispense: async (pharmacistId: string) => {
      // Guard: prevent double-invocation (e.g. double-tap)
      if (get().phase === 'dispensing') return

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
          const dispense = createMedicationDispense(item, pharmacistId, {
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
      } catch {
        // Partial failure — some items may have been persisted locally.
        // Phase transitions to completed so the UI isn't stuck.
        set((state) => {
          state.phase = 'completed'
        })
      } finally {
        set((state) => {
          state.syncStatus.isPending = false
        })
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
