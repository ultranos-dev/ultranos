/**
 * useReadinessBriefing — Story 48.3
 *
 * Provides the readiness briefing data for the ReadinessBriefingCard.
 * Runs once on mount; subsequent refreshes are manual.
 * Caches in component state — never persisted to Dexie (cheap to recompute).
 */

import { useState, useEffect, useCallback } from 'react'
import { generateReadinessBriefing, type ReadinessBriefing } from '@/lib/readiness-engine'

interface UseReadinessBriefingResult {
  briefing: ReadinessBriefing | null
  isLoading: boolean
  refresh: () => void
  lastRefreshedAt: Date | null
}

export function useReadinessBriefing(): UseReadinessBriefingResult {
  const [briefing, setBriefing] = useState<ReadinessBriefing | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await generateReadinessBriefing()
      setBriefing(result)
      setLastRefreshedAt(new Date())
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Run once on mount
  useEffect(() => {
    load()
  }, [load])

  return { briefing, isLoading, refresh: load, lastRefreshedAt }
}
