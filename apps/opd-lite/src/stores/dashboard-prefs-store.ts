import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type WidgetId = 'todayEncounters' | 'pendingLabResults' | 'unresolvedConflicts' | 'queueDepth' | 'avgWaitTime'

interface DashboardPrefsState {
  /** Ordered list of visible widget IDs. If null, use role defaults. */
  widgetOrder: WidgetId[] | null
  /** Collapsed widget IDs */
  collapsed: WidgetId[]

  setWidgetOrder: (order: WidgetId[]) => void
  resetToDefaults: () => void
  toggleCollapsed: (id: WidgetId) => void
}

/**
 * Dashboard widget preferences — persisted in localStorage.
 * SAFE: contains only widget layout prefs, never PHI.
 */
export const useDashboardPrefsStore = create<DashboardPrefsState>()(
  persist(
    (set) => ({
      widgetOrder: null,
      collapsed: [],

      setWidgetOrder: (order) => set({ widgetOrder: order }),

      resetToDefaults: () => set({ widgetOrder: null, collapsed: [] }),

      toggleCollapsed: (id) =>
        set((state) => ({
          collapsed: state.collapsed.includes(id)
            ? state.collapsed.filter((w) => w !== id)
            : [...state.collapsed, id],
        })),
    }),
    {
      name: 'opd-lite-dashboard-prefs',
    }
  )
)
