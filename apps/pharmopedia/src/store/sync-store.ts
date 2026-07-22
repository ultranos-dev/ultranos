import { create } from 'zustand'

interface SyncState {
  status: 'idle' | 'syncing' | 'error'
  lastSyncAt: string | null
  lastVersion: number
  /** Running count of drugs synced in the current active sync. Reset to 0 on sync end. */
  syncedCount: number
  /**
   * True when the branded/trade-name (brands + presentations) sync failed while
   * the catalog sync itself succeeded. Non-fatal for the core catalog, but the UI
   * should surface that brand data may be incomplete. Cleared on a successful sync.
   */
  brandsIncomplete: boolean
  setStatus: (s: 'idle' | 'syncing' | 'error') => void
  setSyncedCount: (n: number) => void
  /** Flag/clear an incomplete brands sync so the UI can indicate stale brand data. */
  setBrandsIncomplete: (incomplete: boolean) => void
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
  brandsIncomplete: false,

  setStatus: (s) => set({ status: s }),
  setSyncedCount: (n) => set({ syncedCount: n }),
  setBrandsIncomplete: (incomplete) => set({ brandsIncomplete: incomplete }),
  setLastSync: (version, at) => set({ status: 'idle', lastVersion: version, lastSyncAt: at, syncedCount: 0 }),
  reset: () => set({ status: 'idle', lastSyncAt: null, lastVersion: 0, syncedCount: 0, brandsIncomplete: false }),
}))
