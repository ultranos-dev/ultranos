import { create } from 'zustand'

interface SyncState {
  status: 'idle' | 'syncing' | 'error'
  lastSyncAt: string | null
  lastVersion: number
  /** Running count of drugs synced in the current active sync. Reset to 0 on sync end. */
  syncedCount: number
  setStatus: (s: 'idle' | 'syncing' | 'error') => void
  setSyncedCount: (n: number) => void
  /** Set status to idle and record the latest version + timestamp. Resets syncedCount. */
  setLastSync: (version: number, at: string) => void
  /** Reset to initial state (called on logout). */
  reset: () => void
}

export const useSyncStore = create<SyncState>((set) => ({
  status: 'idle',
  lastSyncAt: null,
  lastVersion: 0,
  syncedCount: 0,

  setStatus: (s) => set({ status: s }),
  setSyncedCount: (n) => set({ syncedCount: n }),
  setLastSync: (version, at) => set({ status: 'idle', lastVersion: version, lastSyncAt: at, syncedCount: 0 }),
  reset: () => set({ status: 'idle', lastSyncAt: null, lastVersion: 0, syncedCount: 0 }),
}))
