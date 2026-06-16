import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'

const RECENT_KEY = 'pharmopedia.recent-searches'
const MAX = 10

interface RecentSearchState {
  recents: string[]
  initialized: boolean
  init: () => Promise<void>
  add: (query: string) => Promise<void>
  clear: () => Promise<void>
}

export const useRecentSearchStore = create<RecentSearchState>((set, get) => ({
  recents: [],
  initialized: false,

  async init() {
    if (get().initialized) return
    let recents: string[] = []
    try {
      const saved = await SecureStore.getItemAsync(RECENT_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) recents = parsed.filter((x): x is string => typeof x === 'string').slice(0, MAX)
      }
    } catch {
      // SecureStore/parse failure — start empty
    }
    set({ recents, initialized: true })
  },

  async add(query: string) {
    const q = query.trim()
    if (!q) return
    const lower = q.toLowerCase()
    const next = [q, ...get().recents.filter((r) => r.toLowerCase() !== lower)].slice(0, MAX)
    set({ recents: next })
    try {
      await SecureStore.setItemAsync(RECENT_KEY, JSON.stringify(next))
    } catch {
      // write failed — in-memory state is still updated
    }
  },

  async clear() {
    set({ recents: [] })
    try {
      await SecureStore.setItemAsync(RECENT_KEY, JSON.stringify([]))
    } catch {
      // silent
    }
  },
}))
