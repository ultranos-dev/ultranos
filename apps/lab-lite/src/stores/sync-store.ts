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
  isDashboardOpen: boolean
  updateSyncStatus: (status: SyncStatus) => void
  setConflictCount: (count: number) => void
  setDashboardOpen: (open: boolean) => void
}

export const useSyncStore = create<SyncState>()((set) => ({
  isPending: false,
  isError: false,
  lastSyncedAt: null,
  pendingCount: 0,
  failedCount: 0,
  conflictCount: 0,
  isDashboardOpen: false,

  updateSyncStatus: (status) => {
    set(status)
  },

  setConflictCount: (count) => {
    set({ conflictCount: count })
  },

  setDashboardOpen: (open) => {
    set({ isDashboardOpen: open })
  },
}))
