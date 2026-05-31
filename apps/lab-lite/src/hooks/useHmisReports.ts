'use client'

import { useCallback, useEffect, useState } from 'react'
import { getHmisReportsByYear } from '@/lib/db'
import type { HmisMonthlyReport } from '@/lib/hmis-types'

interface UseHmisReportsResult {
  reports: HmisMonthlyReport[]
  loading: boolean
  error: string | null
  refresh: () => void
}

/**
 * Fetch all HMIS reports for a given year from local Dexie.
 * Offline-capable — no network required.
 */
export function useHmisReports(year: number): UseHmisReportsResult {
  const [reports, setReports] = useState<HmisMonthlyReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await getHmisReportsByYear(year)
      setReports(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reports')
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => {
    void load()
  }, [load])

  return { reports, loading, error, refresh: load }
}
