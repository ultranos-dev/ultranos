import { create } from 'zustand'
import { db } from '@/lib/db'

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

export const useSyncStore = create<SyncState>()((set, get) => ({
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
    const prev = get().lastSyncedAt
    const resolved = status.lastSyncedAt ?? prev
    set({
      ...status,
      lastSyncedAt: resolved,
    })
    // Persist to Dexie so it survives page loads
    if (resolved && resolved !== prev) {
      db.syncMeta.put({ patientId: '__global__', lastPulledHlc: '', lastPulledAt: resolved }).catch(() => {})
    }
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
