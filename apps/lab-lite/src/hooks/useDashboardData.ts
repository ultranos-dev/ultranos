'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getQueueItems, type UploadQueueEntry } from '@/lib/db'
import { listLabReports, type LabReport } from '@/lib/trpc'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getSupabaseBrowserClient } from '@/lib/supabase'

export interface QueueCounts {
  pending: number
  uploading: number
  expired: number
  failed: number
}

export interface DashboardData {
  queueCounts: QueueCounts
  todayUploadsCompleted: number
  todayResultsPending: number
  recentUploads: RecentUploadItem[]
  loading: boolean
  error: string | null
}

export interface RecentUploadItem {
  id: string
  loincDisplay: string
  timestamp: string
  status: 'completed' | 'pending' | 'uploading' | 'failed' | 'expired'
  source: 'local' | 'remote'
}

const REFRESH_INTERVAL_MS = 60_000

function startOfToday(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function mapQueueToRecent(items: UploadQueueEntry[]): RecentUploadItem[] {
  return items.map((item) => ({
    id: `local-${item.id}`,
    loincDisplay: item.metadata.loincDisplay,
    timestamp: item.queuedAt,
    status: item.status,
    source: 'local' as const,
  }))
}

function mapReportsToRecent(reports: LabReport[]): RecentUploadItem[] {
  return reports.map((r) => ({
    id: r.id,
    loincDisplay: r.loincDisplay ?? 'Unknown Test',
    timestamp: r.issued ?? r.collectionDate ?? '',
    status: (r.status === 'final' ? 'completed' : 'pending') as RecentUploadItem['status'],
    source: 'remote' as const,
  }))
}

export function useDashboardData(): DashboardData {
  const [queueCounts, setQueueCounts] = useState<QueueCounts>({
    pending: 0,
    uploading: 0,
    expired: 0,
    failed: 0,
  })
  const [todayUploadsCompleted, setTodayUploadsCompleted] = useState(0)
  const [todayResultsPending, setTodayResultsPending] = useState(0)
  const [recentUploads, setRecentUploads] = useState<RecentUploadItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const cancelledRef = useRef(false)

  const fetchData = useCallback(async () => {
    // Local queue counts — fetched independently so Hub API failure doesn't block
    let items: UploadQueueEntry[] = []
    try {
      items = await getQueueItems()
      if (cancelledRef.current) return
      setQueueCounts({
        pending: items.filter((i) => i.status === 'pending').length,
        uploading: items.filter((i) => i.status === 'uploading').length,
        expired: items.filter((i) => i.status === 'expired').length,
        failed: items.filter((i) => i.status === 'failed').length,
      })
    } catch {
      // IndexedDB unavailable (e.g., private browsing) — continue with empty local data
    }

    const localRecent = mapQueueToRecent(items)

    // Hub API reports — fetched independently so local failure doesn't block
    let remoteRecent: RecentUploadItem[] = []
    let completedToday = 0
    let pendingToday = 0

    try {
      const supabase = getSupabaseBrowserClient()
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (token) {
        const result = await listLabReports(token, { limit: 20 })
        remoteRecent = mapReportsToRecent(result.reports)

        const todayStart = startOfToday()
        for (const r of result.reports) {
          const ts = r.issued ?? r.collectionDate ?? ''
          if (ts >= todayStart) {
            if (r.status === 'final') completedToday++
            else pendingToday++
          }
        }
      }
    } catch {
      if (!cancelledRef.current) {
        setError('Remote data unavailable — showing local queue only')
      }
    }

    if (cancelledRef.current) return

    setTodayUploadsCompleted(completedToday)
    setTodayResultsPending(pendingToday)

    // Merge local + remote, sort by timestamp desc, limit to 10
    const merged = [...localRecent, ...remoteRecent]
      .sort((a, b) => (b.timestamp > a.timestamp ? 1 : b.timestamp < a.timestamp ? -1 : 0))
      .slice(0, 10)
    setRecentUploads(merged)
    if (remoteRecent.length > 0 || items.length > 0) {
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    cancelledRef.current = false
    fetchData()
    intervalRef.current = setInterval(fetchData, REFRESH_INTERVAL_MS)
    return () => {
      cancelledRef.current = true
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchData])

  return { queueCounts, todayUploadsCompleted, todayResultsPending, recentUploads, loading, error }
}
