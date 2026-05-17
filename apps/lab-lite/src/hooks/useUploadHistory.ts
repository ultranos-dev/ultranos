'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getQueueItems, type UploadQueueEntry } from '@/lib/db'
import { listLabReports, type LabReport } from '@/lib/trpc'
import { getSupabaseBrowserClient } from '@/lib/supabase'

export interface UploadHistoryItem {
  id: string
  patientFirstName: string
  testCategory: string
  uploadDate: string
  status: 'pending' | 'uploading' | 'completed' | 'expired' | 'failed'
  source: 'local' | 'remote'
  localQueueId?: number
  patientRef?: string
  failureReason?: string
}

const PAGE_SIZE = 20

function mapLocalItems(entries: UploadQueueEntry[]): UploadHistoryItem[] {
  return entries.map((e) => ({
    id: `local-${e.id}`,
    patientFirstName: e.patientFirstName,
    testCategory: e.metadata.loincDisplay,
    uploadDate: e.queuedAt,
    status: e.status,
    source: 'local' as const,
    localQueueId: e.id,
    patientRef: e.patientRef,
    failureReason:
      e.status === 'failed' ? 'Upload failed after 3 retries' : undefined,
  }))
}

function mapRemoteItems(reports: LabReport[]): UploadHistoryItem[] {
  return reports.map((r) => ({
    id: r.id,
    patientFirstName: '',
    testCategory: r.loincDisplay ?? 'Unknown Test',
    uploadDate: r.issued ?? r.collectionDate ?? '',
    status: 'completed' as const,
    source: 'remote' as const,
  }))
}

export interface UseUploadHistoryReturn {
  items: UploadHistoryItem[]
  loading: boolean
  error: string | null
  searchQuery: string
  setSearchQuery: (q: string) => void
  hasMore: boolean
  loadMore: () => Promise<void>
  loadingMore: boolean
  refresh: () => Promise<void>
}

export function useUploadHistory(): UseUploadHistoryReturn {
  const [localItems, setLocalItems] = useState<UploadHistoryItem[]>([])
  const [remoteItems, setRemoteItems] = useState<UploadHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const cancelledRef = useRef(false)

  const fetchData = useCallback(async () => {
    cancelledRef.current = false
    setLoading(true)
    setError(null)

    // Fetch local items from Dexie
    let local: UploadHistoryItem[] = []
    try {
      const entries = await getQueueItems()
      if (cancelledRef.current) return
      local = mapLocalItems(entries)
      setLocalItems(local)
    } catch {
      // IndexedDB unavailable
    }

    // Fetch remote items from Hub API
    try {
      const supabase = getSupabaseBrowserClient()
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (token) {
        const result = await listLabReports(token, { limit: PAGE_SIZE })
        if (cancelledRef.current) return
        const remote = mapRemoteItems(result.reports)
        setRemoteItems(remote)
        setNextCursor(result.nextCursor)
        setHasMore(!!result.nextCursor)
      }
    } catch {
      if (!cancelledRef.current) {
        setError('Remote data unavailable — showing local queue only')
      }
    }

    if (!cancelledRef.current) {
      setLoading(false)
    }
  }, [])

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)

    try {
      const supabase = getSupabaseBrowserClient()
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (token) {
        const result = await listLabReports(token, {
          cursor: nextCursor,
          limit: PAGE_SIZE,
        })
        const more = mapRemoteItems(result.reports)
        setRemoteItems((prev) => [...prev, ...more])
        setNextCursor(result.nextCursor)
        setHasMore(!!result.nextCursor)
      }
    } catch {
      setError('Failed to load more results')
    } finally {
      setLoadingMore(false)
    }
  }, [nextCursor, loadingMore])

  useEffect(() => {
    cancelledRef.current = false
    fetchData()
    return () => {
      cancelledRef.current = true
    }
  }, [fetchData])

  // Merge local + remote, sort by uploadDate descending
  const allItems = [...localItems, ...remoteItems].sort((a, b) =>
    b.uploadDate > a.uploadDate ? 1 : b.uploadDate < a.uploadDate ? -1 : 0,
  )

  // Apply search filter
  const query = searchQuery.toLowerCase().trim()
  const filtered = query
    ? allItems.filter(
        (item) =>
          item.patientFirstName.toLowerCase().includes(query) ||
          item.testCategory.toLowerCase().includes(query),
      )
    : allItems

  return {
    items: filtered,
    loading,
    error,
    searchQuery,
    setSearchQuery,
    hasMore,
    loadMore,
    loadingMore,
    refresh: fetchData,
  }
}
