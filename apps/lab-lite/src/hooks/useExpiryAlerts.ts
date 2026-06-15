'use client'

import { useState, useEffect, useCallback } from 'react'
import { getActiveReagents, getConsumptionLogForReagent } from '@/lib/db'
import {
  projectExpiryBeforeDepletion,
  generateExpiryAlert,
} from '@/lib/reagent-waste-service'
import type { ExpiryAlert } from '@/lib/reagent-waste-service'

const REFRESH_INTERVAL_MS = 60 * 60 * 1000 // 1 hour

/**
 * Custom hook that scans all ACTIVE reagents for expiry-before-depletion risk.
 * Runs on mount and refreshes hourly while the component is active.
 * Returns alerts sorted with critical (< 14 days) first.
 */
export function useExpiryAlerts(): {
  alerts: ExpiryAlert[]
  criticalCount: number
  warningCount: number
  loading: boolean
  refresh: () => void
} {
  const [alerts, setAlerts] = useState<ExpiryAlert[]>([])
  const [loading, setLoading] = useState(true)

  const runCheck = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10)

    try {
      const activeReagents = await getActiveReagents()
      const newAlerts: ExpiryAlert[] = []

      for (const entry of activeReagents) {
        const log = await getConsumptionLogForReagent(entry.reagentId)
        const projection = projectExpiryBeforeDepletion(entry, log, today)
        if (projection) {
          newAlerts.push(generateExpiryAlert(entry, projection))
        }
      }

      // Sort: critical first, then ascending daysUntilExpiry
      newAlerts.sort((a, b) => {
        if (a.severity !== b.severity) {
          return a.severity === 'critical' ? -1 : 1
        }
        return a.daysUntilExpiry - b.daysUntilExpiry
      })

      setAlerts(newAlerts)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    runCheck()
    const interval = setInterval(runCheck, REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [runCheck])

  const criticalCount = alerts.filter((a) => a.severity === 'critical').length
  const warningCount = alerts.filter((a) => a.severity === 'warning').length

  return { alerts, criticalCount, warningCount, loading, refresh: runCheck }
}
