'use client'

import { useCallback, useEffect, useState } from 'react'
import { getLogbookEntries, type LabLogbookEntry, type LogbookFilter } from '@/lib/db'

const PAGE_SIZE = 50

export interface UseLogbookReturn {
  entries: LabLogbookEntry[]
  loading: boolean
  error: string | null
  filter: LogbookFilter
  setFilter: (f: Partial<LogbookFilter>) => void
  hasMore: boolean
  loadMore: () => Promise<void>
  loadingMore: boolean
  total: number
  refresh: () => Promise<void>
}

export function useLogbook(): UseLogbookReturn {
  const [entries, setEntries] = useState<LabLogbookEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilterState] = useState<LogbookFilter>({})
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [total, setTotal] = useState(0)

  const fetchData = useCallback(
    async (currentFilter: LogbookFilter, currentOffset: number, append: boolean) => {
      try {
        const result = await getLogbookEntries(currentFilter, currentOffset, PAGE_SIZE)
        if (append) {
          setEntries((prev) => [...prev, ...result.entries])
        } else {
          setEntries(result.entries)
        }
        setTotal(result.total)
        setHasMore(currentOffset + result.entries.length < result.total)
      } catch {
        setError('Failed to load logbook entries')
      }
    },
    [],
  )

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    setOffset(0)
    await fetchData(filter, 0, false)
    setLoading(false)
  }, [filter, fetchData])

  useEffect(() => {
    setLoading(true)
    setError(null)
    setOffset(0)
    fetchData(filter, 0, false).then(() => setLoading(false))
  }, [filter, fetchData])

  const setFilter = useCallback((updates: Partial<LogbookFilter>) => {
    setFilterState((prev) => ({ ...prev, ...updates }))
    setOffset(0)
  }, [])

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return
    setLoadingMore(true)
    const nextOffset = offset + PAGE_SIZE
    await fetchData(filter, nextOffset, true)
    setOffset(nextOffset)
    setLoadingMore(false)
  }, [hasMore, loadingMore, offset, filter, fetchData])

  return {
    entries,
    loading,
    error,
    filter,
    setFilter,
    hasMore,
    loadMore,
    loadingMore,
    total,
    refresh,
  }
}
