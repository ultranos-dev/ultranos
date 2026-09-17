'use client'

/**
 * useDriftAlerts — Story 43.6
 *
 * React hook that fetches all active (unacknowledged) drift alerts from Dexie.
 * Used by the dashboard and result entry pages to show the DriftAlertBanner.
 *
 * Refreshes on mount and exposes a manual refresh function for post-acknowledgment updates.
 */

import { useState, useEffect, useCallback } from 'react'
import type { DriftAlert } from '@/lib/qc/types'
import { getAllActiveDriftAlerts } from '@/lib/qc/drift-detector'

interface UseDriftAlertsResult {
  alerts: DriftAlert[]
  loading: boolean
  error: boolean
  refresh: () => void
}

export function useDriftAlerts(): UseDriftAlertsResult {
  const [alerts, setAlerts] = useState<DriftAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    setError(false)
    try {
      const active = await getAllActiveDriftAlerts()
      setAlerts(active)
    } catch {
      // QC drift is operational-safety — expose load failures so the UI can
      // show "unavailable" rather than silently rendering nothing.
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return { alerts, loading, error, refresh: () => void load() }
}
