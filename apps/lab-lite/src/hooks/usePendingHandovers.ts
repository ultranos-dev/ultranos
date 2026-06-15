'use client'

import { useState, useEffect, useRef } from 'react'
import { getPendingHandoverReports } from '@/lib/db'
import type { HandoverReport } from '@/lib/db'
import { reportHandoverAuditEvent } from '@/lib/audit-client'

/** Threshold in minutes before an unacknowledged handover triggers an alert. */
export const HANDOVER_ALERT_THRESHOLD_MINUTES = 30

const REFRESH_INTERVAL_MS = 5 * 60 * 1000 // 5-minute auto-refresh

export interface PendingHandoversResult {
  pendingHandovers: HandoverReport[]
  expiredHandovers: HandoverReport[]   // PENDING and older than threshold
  isLoading: boolean
  error: string | null
  refresh: () => void
}

/**
 * Hook to query PENDING handover reports from Dexie.
 * Auto-refreshes on a 5-minute interval.
 * Returns both "all pending" and "past threshold" (expired alert) lists.
 */
export function usePendingHandovers(): PendingHandoversResult {
  const [pendingHandovers, setPendingHandovers] = useState<HandoverReport[]>([])
  const [expiredHandovers, setExpiredHandovers] = useState<HandoverReport[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)
  const emittedAlertIds = useRef(new Set<string>())

  async function load() {
    if (inFlight.current) return
    inFlight.current = true

    try {
      const reports = await getPendingHandoverReports()
      const now = Date.now()
      const thresholdMs = HANDOVER_ALERT_THRESHOLD_MINUTES * 60 * 1000

      const expired = reports.filter((r) => {
        const age = now - new Date(r.createdAt).getTime()
        return age >= thresholdMs
      })

      setPendingHandovers(reports)
      setExpiredHandovers(expired)
      setError(null)

      // Emit expiry alert audit events for newly-expired handovers (once per report)
      for (const r of expired) {
        if (!emittedAlertIds.current.has(r.id)) {
          emittedAlertIds.current.add(r.id)
          reportHandoverAuditEvent({
            action: 'HANDOVER_EXPIRY_ALERT',
            reportId: r.id,
            outgoingTechId: r.outgoingTechId,
          })
        }
      }
    } catch {
      setError('Failed to load pending handovers.')
    } finally {
      setIsLoading(false)
      inFlight.current = false
    }
  }

  useEffect(() => {
    void load()
    const interval = setInterval(() => void load(), REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { pendingHandovers, expiredHandovers, isLoading, error, refresh: load }
}
