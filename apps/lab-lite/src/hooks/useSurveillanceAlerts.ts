/**
 * useSurveillanceAlerts — Story 50.3: Automated Disease Surveillance Alerts
 *
 * Fetches surveillance alerts from Dexie with filtering support.
 * Follows the useUploadHistory.ts hook pattern.
 *
 * No PHI — alerts contain aggregate counts, rates, and lab metadata only.
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import type { SurveillanceAlert } from '@/lib/surveillance-types'
import { getSurveillanceAlerts, getAlertsByDateRange } from '@/lib/db'

export interface SurveillanceAlertFilters {
  /** ISO 8601 date string (inclusive from). */
  fromDate?: string
  /** ISO 8601 date string (inclusive to). */
  toDate?: string
  diseaseCode?: string
  alertType?: 'spike' | 'cluster'
  transmissionStatus?: SurveillanceAlert['transmissionStatus']
}

interface UseSurveillanceAlertsResult {
  alerts: SurveillanceAlert[]
  loading: boolean
  error: string | null
  reload: () => void
}

export function useSurveillanceAlerts(
  filters?: SurveillanceAlertFilters,
): UseSurveillanceAlertsResult {
  const [alerts, setAlerts] = useState<SurveillanceAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let raw: SurveillanceAlert[]

      if (filters?.fromDate && filters?.toDate) {
        raw = await getAlertsByDateRange(
          filters.fromDate,
          filters.toDate + 'T23:59:59.999Z',
        )
      } else {
        raw = await getSurveillanceAlerts()
      }

      // Apply remaining filters in-memory
      let result = raw
      if (filters?.diseaseCode) {
        result = result.filter((a) => a.diseaseCode === filters.diseaseCode)
      }
      if (filters?.alertType) {
        result = result.filter((a) => a.alertType === filters.alertType)
      }
      if (filters?.transmissionStatus) {
        result = result.filter((a) => a.transmissionStatus === filters.transmissionStatus)
      }

      setAlerts(result)
    } catch {
      setError('Failed to load surveillance alerts')
    } finally {
      setLoading(false)
    }
  }, [filters?.fromDate, filters?.toDate, filters?.diseaseCode, filters?.alertType, filters?.transmissionStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void load()
  }, [load])

  return { alerts, loading, error, reload: load }
}
