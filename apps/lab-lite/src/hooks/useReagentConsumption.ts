/**
 * Story 48.2 — Reagent Consumption Logging Hook
 *
 * Provides logConsumption() to record reagent usage and auto-decrement stock.
 * Designed to be called from the result entry workflow (Story 42.4) when a
 * test completes and reagent is consumed.
 *
 * For now, also exposes a standalone manual log action for use in the burndown UI.
 */

import { useCallback } from 'react'
import { addReagentConsumptionLog, updateReagent, getReagentByReagentId } from '@/lib/db'
import type { ReagentConsumptionEntry } from '@/lib/db'
import { useAuthSessionStore } from '@/stores/auth-session-store'

export interface LogConsumptionParams {
  reagentId: string
  loincCode: string
  quantityUsed: number
  unit: string
}

export function useReagentConsumption() {
  const session = useAuthSessionStore((s) => s.session)
  const technicianId = session?.userId ?? 'unknown'

  /**
   * Log a reagent consumption event.
   * - Writes a new entry to reagent_consumption_log.
   * - Auto-decrements the reagent's expectedTests by quantityUsed (if unit is 'tests').
   *   For non-test units (mL, strips, etc.), the stock is not auto-decremented here
   *   because the inventory is tracked in different units — the operator should
   *   manually update stock in the inventory panel.
   */
  const logConsumption = useCallback(
    async (params: LogConsumptionParams): Promise<void> => {
      const { reagentId, loincCode, quantityUsed, unit } = params
      const now = new Date().toISOString()

      const entry: Omit<ReagentConsumptionEntry, 'id'> = {
        reagentId,
        loincCode,
        quantityUsed,
        unit,
        consumedAt: now,
        technicianId,
      }

      await addReagentConsumptionLog(entry)

      // Auto-decrement stock: only applicable when unit matches inventory tracking unit.
      // Guard against negative stock — clamp to 0.
      const reagent = await getReagentByReagentId(reagentId)
      if (reagent) {
        const newTests = Math.max(0, reagent.testsPerformed + (unit === 'tests' ? quantityUsed : 0))
        if (unit === 'tests') {
          await updateReagent(reagentId, { testsPerformed: newTests })
        }
      }
    },
    [technicianId],
  )

  return { logConsumption }
}
