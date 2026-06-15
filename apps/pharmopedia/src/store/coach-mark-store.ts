import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'

const COACH_KEY = 'pharmopedia.coach-dismissed'

interface CoachMarkState {
  dismissed: Set<string>
  initialized: boolean
  init: () => Promise<void>
  dismiss: (key: string) => Promise<void>
  shouldShow: (key: string) => boolean
  reset: () => Promise<void>
}

export const useCoachMarkStore = create<CoachMarkState>((set, get) => ({
  dismissed: new Set<string>(),
  initialized: false,

  async init() {
    if (get().initialized) return
    let dismissed = new Set<string>()
    try {
      const saved = await SecureStore.getItemAsync(COACH_KEY)
      if (saved) {
        dismissed = new Set(saved.split(',').filter(Boolean))
      }
    } catch {
      // SecureStore unavailable — start fresh
    }
    set({ dismissed, initialized: true })
  },

  async dismiss(key: string) {
    const next = new Set(get().dismissed)
    next.add(key)
    set({ dismissed: next })
    try {
      await SecureStore.setItemAsync(COACH_KEY, [...next].join(','))
    } catch {
      // SecureStore write failed — state is still updated in memory
    }
  },

  shouldShow(key: string) {
    return !get().dismissed.has(key)
  },

  async reset() {
    set({ dismissed: new Set() })
    try {
      await SecureStore.setItemAsync(COACH_KEY, '')
    } catch {
      // Silent
    }
  },
}))
