import { create } from 'zustand'

interface SyncStatus {
  isPending: boolean
  isError: boolean
  lastSyncedAt: string | null
  pendingCount: number
  failedCount: number
}

interface SyncState extends SyncStatus {
  conflictCount: number
  isDraining: boolean
  isDashboardOpen: boolean
  activePatientId: string | null

  updateSyncStatus: (status: SyncStatus) => void
  setConflictCount: (count: number) => void
  setIsDraining: (draining: boolean) => void
  setDashboardOpen: (open: boolean) => void
  setActivePatientId: (id: string | null) => void
}

export const useSyncStore = create<SyncState>()((set) => ({
  isPending: false,
  isError: false,
  lastSyncedAt: null,
  pendingCount: 0,
  failedCount: 0,
  conflictCount: 0,
  isDraining: false,
  isDashboardOpen: false,
  activePatientId: null,

  updateSyncStatus: (status) => {
    set((prev) => ({
      ...status,
      // Never regress lastSyncedAt to null — DrainWorker reports null
      // when no queue entries have been synced, but a successful manual
      // sync or pull should keep the timestamp
      lastSyncedAt: status.lastSyncedAt ?? prev.lastSyncedAt,
    }))
  },

  setConflictCount: (count) => {
    set({ conflictCount: count })
  },

  setIsDraining: (draining) => {
    set({ isDraining: draining })
  },

  setDashboardOpen: (open) => {
    set({ isDashboardOpen: open })
  },

  setActivePatientId: (id) => {
    set({ activePatientId: id })
  },
}))
