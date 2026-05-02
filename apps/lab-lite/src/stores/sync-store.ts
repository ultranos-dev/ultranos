import { create } from 'zustand'

interface SyncStatus {
  isPending: boolean
  isError: boolean
  lastSyncedAt: string | null
  pendingCount: number
  failedCount: number
}

interface SyncState extends SyncStatus {
  updateSyncStatus: (status: SyncStatus) => void
}

export const useSyncStore = create<SyncState>()((set) => ({
  isPending: false,
  isError: false,
  lastSyncedAt: null,
  pendingCount: 0,
  failedCount: 0,

  updateSyncStatus: (status) => {
    set(status)
  },
}))
