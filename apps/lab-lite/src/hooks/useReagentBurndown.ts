/**
 * Story 48.2 — Reagent Burndown Dashboard Hook
 *
 * Queries Dexie for reagent inventory, consumption logs, and supplier configs,
 * runs the burndown engine, and returns structured data for the dashboard.
 *
 * Re-evaluates on: mount, manual refresh trigger, and reagent inventory changes.
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  getActiveReagents,
  getAllSuppliers,
  getAllReagentSupplierMappings,
  getActiveReagentAlerts as getCachedAlertsFromDb,
  type ReagentAlertCache,
} from '@/lib/db'
import {
  calculateDailyConsumptionRate,
  projectUsageDepletionDate,
  getEffectiveDepletionDate,
  calculateReorderDate,
  evaluateAlertThreshold,
  daysUntilDepletion,
  type BurndownResult,
} from '@/lib/reagent-burndown'
import { evaluateAllReagentAlerts, type ReagentAlert } from '@/lib/reagent-alert-evaluator'

export interface BurndownData {
  burndownData: BurndownResult[]
  alerts: ReagentAlert[]
  cachedAlerts: ReagentAlertCache[]
  isLoading: boolean
  error: string | null
  refresh: () => void
}

export function useReagentBurndown(): BurndownData {
  const [burndownData, setBurndownData] = useState<BurndownResult[]>([])
  const [alerts, setAlerts] = useState<ReagentAlert[]>([])
  const [cachedAlerts, setCachedAlerts] = useState<ReagentAlertCache[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)

  const refresh = useCallback(() => setRefreshTick((t) => t + 1), [])

  useEffect(() => {
    let active = true

    async function load() {
      setIsLoading(true)
      setError(null)

      try {
        // Run full burndown evaluation — persists results to cache
        const [freshAlerts, reagents, suppliers, mappings] = await Promise.all([
          evaluateAllReagentAlerts(),
          getActiveReagents(),
          getAllSuppliers(),
          getAllReagentSupplierMappings(),
        ])

        if (!active) return

        const supplierMap = new Map(suppliers.map((s) => [s.supplierId, s]))
        const reagentToSupplier = new Map(mappings.map((m) => [m.reagentId, m.supplierId]))

        const now = new Date()
        const results: BurndownResult[] = []

        for (const reagent of reagents) {
          const currentStock = Math.max(0, reagent.expectedTests - reagent.testsPerformed)
          const rate = await calculateDailyConsumptionRate(reagent.reagentId)

          let expiryDate: Date
          try {
            expiryDate = new Date(reagent.expiryDate)
            if (isNaN(expiryDate.getTime())) throw new Error('invalid')
          } catch {
            continue
          }

          const usageDepletion = projectUsageDepletionDate(currentStock, rate.averageDailyUsage)
          const { date: effective, reason } = getEffectiveDepletionDate(usageDepletion, expiryDate)

          const supplierId = reagentToSupplier.get(reagent.reagentId)
          const supplier = supplierId ? supplierMap.get(supplierId) : undefined
          const leadTimeDays = supplier?.leadTimeDays ?? 0
          const reorderDate = calculateReorderDate(effective, leadTimeDays, now)
          const alertLevel = evaluateAlertThreshold(effective, now)
          const days = daysUntilDepletion(effective, now)

          results.push({
            reagentId: reagent.reagentId,
            reagentName: reagent.name,
            currentStock,
            unit: rate.unit || reagent.unit,
            expiryDate: reagent.expiryDate,
            consumptionRate: rate,
            usageDepletionDate: usageDepletion,
            effectiveDepletionDate: effective,
            depletionReason: reason,
            reorderDate,
            daysRemaining: days,
            alertLevel,
            supplierLeadTimeDays: leadTimeDays,
            supplierName: supplier?.supplierName,
          })
        }

        // Also load from cache for fast display
        const cached = await getCachedAlertsFromDb()

        if (!active) return
        setBurndownData(results)
        setAlerts(freshAlerts)
        setCachedAlerts(cached)
      } catch (e) {
        if (!active) return
        setError(e instanceof Error ? e.message : 'Burndown evaluation failed')
      } finally {
        if (active) setIsLoading(false)
      }
    }

    void load()
    return () => { active = false }
  }, [refreshTick])

  return { burndownData, alerts, cachedAlerts, isLoading, error, refresh }
}
