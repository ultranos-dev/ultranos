import { useEffect, useState } from 'react'
import { getDailyLogsByDateRange } from '@/lib/db'
import type { DailyActivityLog } from '@/lib/daily-log-types'

export interface UseDailyLogsOptions {
  from: string  // YYYY-MM-DD
  to: string    // YYYY-MM-DD
}

export interface UseDailyLogsResult {
  logs: DailyActivityLog[]
  loading: boolean
  error: string | null
  reload: () => void
}

export function useDailyLogs({ from, to }: UseDailyLogsOptions): UseDailyLogsResult {
  const [logs, setLogs] = useState<DailyActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    getDailyLogsByDateRange(from, to)
      .then((results) => {
        if (!cancelled) {
          // Sort descending by date
          const sorted = [...results].sort((a, b) => b.logDate.localeCompare(a.logDate))
          setLogs(sorted)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load logs')
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [from, to, tick])

  return {
    logs,
    loading,
    error,
    reload: () => setTick((t) => t + 1),
  }
}
