import { create } from 'zustand'
import {
  getDataBudgetConfig,
  updateDataBudgetConfig,
  getUsageForCycle,
  getUsageByDay,
  checkAndRolloverCycle,
} from '@/lib/db'
import {
  calculateProjectedExhaustion,
  getThresholdLevel,
  getCycleEndDate,
  type ThresholdLevel,
} from '@ultranos/sync-engine'

export interface DataBudgetState {
  planSizeMB: number
  billingCycleDay: number
  lowDataMode: boolean
  currentCycleUsedMB: number
  projectedExhaustionDate: string | null
  dailyUsage: Array<{ date: string; totalMB: number }>
  categoryBreakdown: Record<string, number>
  thresholdLevel: ThresholdLevel
  isLoaded: boolean
  _loading: boolean
  loadFromDexie: () => Promise<void>
  updateConfig: (
    config: Partial<{ planSizeMB: number; billingCycleDay: number; lowDataMode: boolean }>,
  ) => Promise<void>
  refreshUsageStats: () => Promise<void>
}

export const useDataBudgetStore = create<DataBudgetState>()((set, get) => ({
  planSizeMB: 500,
  billingCycleDay: 1,
  lowDataMode: false,
  currentCycleUsedMB: 0,
  projectedExhaustionDate: null,
  dailyUsage: [],
  categoryBreakdown: {},
  thresholdLevel: 'normal' as ThresholdLevel,
  isLoaded: false,
  _loading: false,

  loadFromDexie: async () => {
    if (get()._loading) return
    set({ _loading: true })
    try {
      await checkAndRolloverCycle()
      const config = await getDataBudgetConfig()
      set({
        planSizeMB: config.planSizeMB,
        billingCycleDay: config.billingCycleDay,
        lowDataMode: config.lowDataMode,
        isLoaded: true,
      })
      await get().refreshUsageStats()
    } finally {
      set({ _loading: false })
    }
  },

  updateConfig: async (updates) => {
    await updateDataBudgetConfig(updates)
    const config = await getDataBudgetConfig()
    set({
      planSizeMB: config.planSizeMB,
      billingCycleDay: config.billingCycleDay,
      lowDataMode: config.lowDataMode,
    })
    await get().refreshUsageStats()
  },

  refreshUsageStats: async () => {
    const config = await getDataBudgetConfig()
    const cycleUsage = await getUsageForCycle()

    const totalBytes = cycleUsage.reduce((sum, r) => sum + r.bytesOut + r.bytesIn, 0)
    const currentCycleUsedMB = totalBytes / (1024 * 1024)

    const categoryBreakdown: Record<string, number> = {}
    for (const r of cycleUsage) {
      const mb = (r.bytesOut + r.bytesIn) / (1024 * 1024)
      categoryBreakdown[r.category] = (categoryBreakdown[r.category] ?? 0) + mb
    }

    const formatLocalDate = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

    const today = new Date()
    const fourteenDaysAgo = new Date(today)
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13)

    const recentUsage = await getUsageByDay(formatLocalDate(fourteenDaysAgo), formatLocalDate(today))
    const dailyMap = new Map<string, number>()
    for (const r of recentUsage) {
      const mb = (r.bytesOut + r.bytesIn) / (1024 * 1024)
      dailyMap.set(r.date, (dailyMap.get(r.date) ?? 0) + mb)
    }

    const dailyUsage: Array<{ date: string; totalMB: number }> = []
    for (let i = 0; i < 14; i++) {
      const d = new Date(fourteenDaysAgo)
      d.setDate(d.getDate() + i)
      const dateStr = formatLocalDate(d)
      dailyUsage.push({ date: dateStr, totalMB: dailyMap.get(dateStr) ?? 0 })
    }

    const last7 = dailyUsage.slice(-7)
    const avgDailyUsageMB =
      last7.length > 0
        ? last7.reduce((sum, d) => sum + d.totalMB, 0) / last7.length
        : 0

    const cycleEndDate = getCycleEndDate(config.billingCycleDay, config.currentCycleStart)
    const projectedExhaustionDate = calculateProjectedExhaustion({
      planSizeMB: config.planSizeMB,
      usedMB: currentCycleUsedMB,
      avgDailyUsageMB,
      cycleEndDate,
    })

    const thresholdLevel = getThresholdLevel(currentCycleUsedMB, config.planSizeMB)
    set({ currentCycleUsedMB, projectedExhaustionDate, dailyUsage, categoryBreakdown, thresholdLevel })
  },
}))
