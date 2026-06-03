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
} from '@/lib/data-budget-calc'

export interface DataBudgetState {
  planSizeMB: number
  billingCycleDay: number
  lowDataMode: boolean
  currentCycleUsedMB: number
  projectedExhaustionDate: string | null
  dailyUsage: Array<{ date: string; totalMB: number }>
  categoryBreakdown: Record<string, number> // category -> MB
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
  _loading: false, // guard against concurrent loadFromDexie calls

  loadFromDexie: async () => {
    if (get()._loading) return
    set({ _loading: true })
    try {
      // Check and handle billing cycle rollover on app init
      const rolledOver = await checkAndRolloverCycle()
      if (rolledOver) {
        try {
          const { reportDataBudgetConfigEvent } = await import('@/lib/audit-client')
          reportDataBudgetConfigEvent({ action: 'DATA_BUDGET_CYCLE_ROLLOVER' })
        } catch {
          // Audit must never block
        }
      }

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

    // Total bytes used this cycle
    const totalBytes = cycleUsage.reduce((sum, r) => sum + r.bytesOut + r.bytesIn, 0)
    const currentCycleUsedMB = totalBytes / (1024 * 1024)

    // Category breakdown
    const categoryBreakdown: Record<string, number> = {}
    for (const r of cycleUsage) {
      const mb = (r.bytesOut + r.bytesIn) / (1024 * 1024)
      categoryBreakdown[r.category] = (categoryBreakdown[r.category] ?? 0) + mb
    }

    // Daily usage for last 14 days — use local dates to avoid UTC offset issues
    const toLocalISO = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

    const today = new Date()
    const fourteenDaysAgo = new Date(today)
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13)
    const startDate = toLocalISO(fourteenDaysAgo)
    const endDate = toLocalISO(today)

    const recentUsage = await getUsageByDay(startDate, endDate)
    const dailyMap = new Map<string, number>()
    for (const r of recentUsage) {
      const mb = (r.bytesOut + r.bytesIn) / (1024 * 1024)
      dailyMap.set(r.date, (dailyMap.get(r.date) ?? 0) + mb)
    }

    const dailyUsage: Array<{ date: string; totalMB: number }> = []
    for (let i = 0; i < 14; i++) {
      const d = new Date(fourteenDaysAgo)
      d.setDate(d.getDate() + i)
      const dateStr = toLocalISO(d)
      dailyUsage.push({ date: dateStr, totalMB: dailyMap.get(dateStr) ?? 0 })
    }

    // 7-day trailing average
    const last7 = dailyUsage.slice(-7)
    const avgDailyUsageMB =
      last7.length > 0
        ? last7.reduce((sum, d) => sum + d.totalMB, 0) / last7.length
        : 0

    // Projection
    const cycleEndDate = getCycleEndDate(config.billingCycleDay, config.currentCycleStart)
    const projectedExhaustionDate = calculateProjectedExhaustion({
      planSizeMB: config.planSizeMB,
      usedMB: currentCycleUsedMB,
      avgDailyUsageMB,
      cycleEndDate,
    })

    const thresholdLevel = getThresholdLevel(currentCycleUsedMB, config.planSizeMB)

    set({
      currentCycleUsedMB,
      projectedExhaustionDate,
      dailyUsage,
      categoryBreakdown,
      thresholdLevel,
    })
  },
}))
