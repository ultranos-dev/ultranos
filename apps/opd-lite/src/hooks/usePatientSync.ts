'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { db } from '@/lib/db'
import { pullPatientChanges, type PullResult } from '@/lib/sync-pull'
import { useSyncStore } from '@/stores/sync-store'

/** Minimum interval between pulls for the same patient (ms). */
const STALENESS_WINDOW_MS = 5 * 60 * 1000 // 5 minutes

export interface PatientSyncState {
  isSyncing: boolean
  lastPulledAt: string | null
  pullError: string | null
  pullNow: () => Promise<void>
}

/**
 * Triggers an incremental pull from the Hub when a patient chart is opened,
 * respecting a 5-minute staleness window. Also re-pulls on reconnect if
 * this chart is still mounted.
 */
export function usePatientSync(patientId: string): PatientSyncState {
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastPulledAt, setLastPulledAt] = useState<string | null>(null)
  const [pullError, setPullError] = useState<string | null>(null)
  const pullingRef = useRef(false)
  const setConflictCount = useSyncStore((s) => s.setConflictCount)

  const tokenRef = useRef('')

  // Refresh token on mount and keep it current
  useEffect(() => {
    async function refresh() {
      const { getSupabaseBrowserClient } = await import('@/lib/supabase')
      const { data } = await getSupabaseBrowserClient().auth.getSession()
      tokenRef.current = data.session?.access_token ?? ''
    }
    refresh()
    const interval = setInterval(refresh, 10 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const getAuthToken = useCallback(() => tokenRef.current, [])

  const doPull = useCallback(async () => {
    if (pullingRef.current) return
    pullingRef.current = true
    setIsSyncing(true)
    setPullError(null)

    try {
      const result: PullResult = await pullPatientChanges(patientId, getAuthToken)

      // Update last-pulled timestamp from DB
      const meta = await db.syncMeta.get(patientId)
      setLastPulledAt(meta?.lastPulledAt ?? new Date().toISOString())

      if (result.errors.length > 0) {
        setPullError(`${result.errors.length} error(s) during pull`)
      }

      // Update global conflict count
      if (result.conflictsDetected > 0) {
        const total = await db.syncQueue
          .filter((e) => e.conflictFlag === true && e.status !== 'resolved')
          .count()
        setConflictCount(total)
      }
    } catch {
      setPullError('Pull failed — will retry on next chart open or reconnect')
    } finally {
      setIsSyncing(false)
      pullingRef.current = false
    }
  }, [patientId, getAuthToken, setConflictCount])

  // Pull on mount if stale
  useEffect(() => {
    let cancelled = false

    async function checkAndPull() {
      const meta = await db.syncMeta.get(patientId)
      setLastPulledAt(meta?.lastPulledAt ?? null)

      const lastPulled = meta?.lastPulledAt ? new Date(meta.lastPulledAt).getTime() : 0
      const isStale = Date.now() - lastPulled > STALENESS_WINDOW_MS

      if (isStale && !cancelled) {
        await doPull()
      }
    }

    checkAndPull()
    return () => { cancelled = true }
  }, [patientId, doPull])

  // Re-pull on reconnect
  useEffect(() => {
    function handleOnline() {
      doPull()
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [doPull])

  return { isSyncing, lastPulledAt, pullError, pullNow: doPull }
}
