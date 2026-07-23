import { create } from 'zustand'

export interface SyncStatus {
  isPending: boolean
  isError: boolean
  lastSyncedAt: string | null
  pendingCount: number
  failedCount: number
}

interface SyncState extends SyncStatus {
  conflictCount: number
  isDashboardOpen: boolean
  /**
   * Human-facing reason the last push could not complete (e.g. "KYC_REQUIRED"),
   * or null when the queue is draining cleanly. Lets the banner explain WHY
   * dispense records aren't reaching the Hub instead of only showing "N failed".
   */
  syncError: string | null
  updateSyncStatus: (status: Partial<SyncStatus>) => void
  markSynced: () => void
  setConflictCount: (count: number) => void
  setDashboardOpen: (open: boolean) => void
  setSyncError: (reason: string | null) => void
}

export const useSyncStore = create<SyncState>()((set) => ({
  isPending: false,
  isError: false,
  lastSyncedAt: null,
  pendingCount: 0,
  failedCount: 0,
  conflictCount: 0,
  isDashboardOpen: false,
  syncError: null,

  updateSyncStatus: (status) => {
    set(status)
  },

  markSynced: () => {
    set({ lastSyncedAt: new Date().toISOString() })
  },

  setConflictCount: (count) => {
    set({ conflictCount: count })
  },

  setDashboardOpen: (open) => {
    set({ isDashboardOpen: open })
  },

  setSyncError: (reason) => {
    set({ syncError: reason })
  },
}))
