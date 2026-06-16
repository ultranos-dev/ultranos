/**
 * Story 48.2 — Reagent Consumption Logging Hook
 *
 * Provides logConsumption() to record reagent usage and update stock.
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
   *
   * - Writes a new entry to reagent_consumption_log (P3: correct field names).
   * - For 'tests' unit only: increments testsPerformed on the reagent inventory
   *   record, clamped to [0, expectedTests] to prevent corruption (P13).
   * - addReagentConsumptionLog no longer auto-increments testsPerformed (P4).
   * - For non-test units (mL, strips, etc.): the operator should manually
   *   update stock in the inventory panel (unit-aware behavior, see P18).
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

      // Insert log entry — no side-effects on inventory (P4: single owner of stock decrement)
      await addReagentConsumptionLog(entry)

      // Stock update: only for test-count-tracked reagents
      if (unit === 'tests') {
        const reagent = await getReagentByReagentId(reagentId)
        if (reagent) {
          // P13: clamp to [0, expectedTests] — prevent negative stock AND overflow
          const newTests = Math.min(
            reagent.expectedTests,
            Math.max(0, reagent.testsPerformed + quantityUsed),
          )
          await updateReagent(reagentId, { testsPerformed: newTests })
        }
      }
    },
    [technicianId],
  )

  return { logConsumption }
}
