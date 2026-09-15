'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { pullDispenseMonitoringEvents, pullMonitoringMappings } from '@/lib/trpc'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { putMedicationLabMappings, getMedicationLabMappingsMap } from '@/lib/db'
import { processBatchDispenseEvents } from '@/lib/monitoring/dispense-receiver'
import type { DispenseMonitoringPayload } from '@/lib/monitoring/dispense-receiver'

const POLL_INTERVAL_MS = 120_000

// P6 (CLAUDE.md): In-memory cursor watermarks — never use localStorage.
// Idempotent event processing makes a full re-pull on reload safe.
let cursorCache: number | undefined
let mappingVersionCache: number | undefined

/**
 * Core sync logic extracted as a named async function so it can be
 * unit-tested without invoking the full React hook lifecycle.
 *
 * @internal — exported for tests only; do not use outside this module.
 */
export async function runMonitoringSyncOnce(): Promise<void> {
  const supabase = getSupabaseBrowserClient()
  const { data } = await supabase.auth.getSession()
  if (!data.session) {
    throw new Error('Session expired')
  }
  const token = data.session.access_token

  // 1. Refresh mappings (offline-tolerant; bundled map is the fallback)
  try {
    const { mappings } = await pullMonitoringMappings(token, mappingVersionCache)
    if (mappings.length) {
      await putMedicationLabMappings(
        mappings.map((m) => ({
          atcCode: m.atcCode,
          medicationDisplay: m.medicationDisplay,
          version: m.version,
          requiredTests: m.requiredTests,
        })),
      )
      mappingVersionCache = mappings.reduce(
        (mx, m) => Math.max(mx, m.version),
        mappingVersionCache ?? 0,
      )
    }
  } catch {
    // Offline — use existing overrides + bundled fallback; continue to events
  }

  const overrides = await getMedicationLabMappingsMap()

  // 2. Page monitoring events by cursor
  let cursor = cursorCache
  while (true) {
    const { events, nextCursor } = await pullDispenseMonitoringEvents(token, undefined, cursor)
    if (events.length) {
      const payloads: DispenseMonitoringPayload[] = events.map((e) => ({
        dispensingEventId: e.dispensingEventId,
        patientRef: e.patientRef.replace(/^Patient\//, ''), // R1: store bare blind index
        patientFirstName: e.patientFirstName,
        patientAge: e.patientAge ?? 0,      // DTO age is nullable, payload is number
        medicationCode: e.atcCode,          // ATC is the map lookup key (Task 8)
        medicationDisplay: e.medicationDisplay,
        dispensedAt: e.dispensedAt,
        orderingPractitionerRef: e.orderingPractitionerRef,
        hlcTimestamp: e.hlcTimestamp,
      }))
      await processBatchDispenseEvents(payloads, overrides)
    }
    if (nextCursor == null) break
    cursor = nextCursor
    cursorCache = nextCursor
  }
}

/**
 * Returns the current in-memory cursor value.
 *
 * @internal — exported for tests only; do not use outside this module.
 */
export function getMonitoringCursor(): number | undefined {
  return cursorCache
}

/**
 * Resets the module-level cursor and version caches.
 * Useful in tests to avoid state leaking between test cases.
 *
 * @internal — exported for tests only.
 */
export function resetMonitoringCaches(): void {
  cursorCache = undefined
  mappingVersionCache = undefined
}

export interface MonitoringSyncState {
  loading: boolean
  error: string | null
  lastSyncedAt: string | null
  refresh: () => void
}

export function useMonitoringSync(): MonitoringSyncState {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const inFlight = useRef(false)
  const cancelled = useRef(false)

  const sync = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      await runMonitoringSyncOnce()
      if (!cancelled.current) {
        setError(null)
        setLastSyncedAt(new Date().toISOString())
      }
    } catch {
      if (!cancelled.current) setError('Offline — monitoring will retry')
    } finally {
      inFlight.current = false
      if (!cancelled.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    cancelled.current = false
    void sync()
    const interval = setInterval(() => void sync(), POLL_INTERVAL_MS)
    const onOnline = () => void sync()
    window.addEventListener('online', onOnline)
    return () => {
      cancelled.current = true
      clearInterval(interval)
      window.removeEventListener('online', onOnline)
    }
  }, [sync])

  const refresh = useCallback(() => {
    setError(null)
    setLoading(true)
    void sync()
  }, [sync])

  return { loading, error, lastSyncedAt, refresh }
}
