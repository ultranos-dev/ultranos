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

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getDonorReports(programCode)
      setReports(data)
    } finally {
      setLoading(false)
    }
  }, [programCode])

  useEffect(() => { void load() }, [load])

  return { reports, loading, reload: load }
}
