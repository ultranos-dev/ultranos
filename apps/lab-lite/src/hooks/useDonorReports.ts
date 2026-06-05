// ---------------------------------------------------------------------------
// Story 50.2 — useDonorReports hook
// Fetches donor reports from Dexie with optional program and date filters.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react'
import { getDonorReports } from '@/lib/db'
import type { DonorReport } from '@/lib/donor-types'

interface Options {
  programCode?: string
}

export function useDonorReports({ programCode }: Options = {}) {
  const [reports, setReports] = useState<DonorReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getDonorReports(programCode)
      setReports(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load reports')
      setReports([])
    } finally {
      setLoading(false)
    }
  }, [programCode])

  useEffect(() => { void load() }, [load])

  return { reports, loading, error, reload: load }
}
