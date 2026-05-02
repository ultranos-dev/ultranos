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

  updateSyncStatus: (status: SyncStatus) => void
  setConflictCount: (count: number) => void
  setIsDraining: (draining: boolean) => void
  setDashboardOpen: (open: boolean) => void
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

  updateSyncStatus: (status) => {
    set(status)
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
}))
