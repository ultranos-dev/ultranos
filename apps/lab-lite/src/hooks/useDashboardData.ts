'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getQueueItems, type UploadQueueEntry } from '@/lib/db'
import { listLabReports, type LabReport } from '@/lib/trpc'
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
  retry: () => void
}

export interface RecentUploadItem {
  id: string
  loincDisplay: string
  timestamp: string
  status: 'completed' | 'pending' | 'uploading' | 'failed' | 'expired'
  source: 'local' | 'remote'
  patientFirstName?: string
  localQueueId?: number
}

const REFRESH_INTERVAL_MS = 60_000
const MAX_LOINC_DISPLAY_LENGTH = 200

/** UTC start of today \u2014 consistent regardless of device timezone. */
function startOfTodayUTC(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
}

/** Parse ISO timestamp to epoch ms; returns 0 for unparseable values. */
function parseTimestamp(iso: string): number {
  if (!iso) return 0
  const ms = new Date(iso).getTime()
  return isNaN(ms) ? 0 : ms
}

function clampLoincDisplay(raw: string | undefined): string {
  if (!raw || raw.length === 0) return 'Unknown Test'
  return raw.length > MAX_LOINC_DISPLAY_LENGTH ? raw.slice(0, MAX_LOINC_DISPLAY_LENGTH) + '\u2026' : raw
}

function mapQueueToRecent(items: UploadQueueEntry[]): RecentUploadItem[] {
  return items.map((item) => ({
    id: `local-${item.id}`,
    loincDisplay: clampLoincDisplay(item.metadata.loincDisplay),
    timestamp: item.queuedAt,
    status: item.status,
    source: 'local' as const,
    patientFirstName: item.patientFirstName,
    localQueueId: item.id,
  }))
}

function mapReportsToRecent(reports: LabReport[]): RecentUploadItem[] {
  return reports.map((r) => ({
    id: r.id,
    loincDisplay: clampLoincDisplay(r.loincDisplay),
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
  const inFlightRef = useRef(false)

  const fetchData = useCallback(async () => {
    // [H3] Prevent concurrent in-flight fetches
    if (inFlightRef.current) return
    inFlightRef.current = true

    try {
      // Local queue counts \u2014 fetched independently so Hub API failure doesn't block
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
        // IndexedDB unavailable (e.g., private browsing) \u2014 continue with empty local data
      }

      const localRecent = mapQueueToRecent(items)

      // Hub API reports \u2014 fetched independently so local failure doesn't block
      let remoteRecent: RecentUploadItem[] = []
      let completedToday = 0
      let pendingToday = 0
      let remoteError = false

      try {
        const supabase = getSupabaseBrowserClient()
        const { data } = await supabase.auth.getSession()

        // [C3] Handle expired/missing session explicitly
        if (!data.session) {
          remoteError = true
          if (!cancelledRef.current) {
            setError('Session expired \u2014 please sign in again')
          }
        } else {
          const token = data.session.access_token
          const result = await listLabReports(token, { limit: 20 })
          remoteRecent = mapReportsToRecent(result.reports)

          const todayStart = startOfTodayUTC()
          for (const r of result.reports) {
            const ts = r.issued ?? r.collectionDate ?? ''
            if (ts >= todayStart) {
              if (r.status === 'final') completedToday++
              else pendingToday++
            }
          }
        }
      } catch {
        remoteError = true
        if (!cancelledRef.current) {
          setError('Remote data unavailable \u2014 showing local queue only')
        }
      }

      if (cancelledRef.current) return

      setTodayUploadsCompleted(completedToday)
      setTodayResultsPending(pendingToday)

      // [H6] Merge local + remote, sort by parsed timestamp desc, limit to 10
      const merged = [...localRecent, ...remoteRecent]
        .sort((a, b) => parseTimestamp(b.timestamp) - parseTimestamp(a.timestamp))
        .slice(0, 10)
      setRecentUploads(merged)

      // [H2] Only clear error if remote fetch actually succeeded
      if (!remoteError) {
        setError(null)
      }
      setLoading(false)
    } finally {
      inFlightRef.current = false
    }
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

  const retry = useCallback(() => {
    setError(null)
    setLoading(true)
    fetchData()
  }, [fetchData])

  return { queueCounts, todayUploadsCompleted, todayResultsPending, recentUploads, loading, error, retry }
}
