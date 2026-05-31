'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getOrders,
  putOrders,
  updateOrderStatus,
  type LabOrderEntry,
} from '@/lib/db'
import { pullOrders, acknowledgeOrder } from '@/lib/trpc'
import { getSupabaseBrowserClient } from '@/lib/supabase'

const POLL_INTERVAL_MS = 60_000
const FULL_SYNC_EVERY_N = 10

// P6: In-memory sync timestamp — never use localStorage (CLAUDE.md prohibition)
let lastSyncedAtCache: string | undefined
let pollCount = 0

export interface OrderSyncState {
  orders: LabOrderEntry[]
  loading: boolean
  error: string | null
  lastSyncedAt: string | null
  refresh: () => void
}

export function useOrderSync(): OrderSyncState {
  const [orders, setOrders] = useState<LabOrderEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastSyncedAt, setLastSyncedAtState] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const inFlightRef = useRef(false)
  const cancelledRef = useRef(false)

  const sync = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true

    try {
      const supabase = getSupabaseBrowserClient()
      const { data } = await supabase.auth.getSession()

      if (!data.session) {
        const cached = await getOrders()
        if (!cancelledRef.current) {
          setOrders(cached)
          setError('Session expired')
        }
        return
      }

      const token = data.session.access_token

      // P7: Periodic full sync for tombstone cleanup
      pollCount++
      const isFullSync = pollCount % FULL_SYNC_EVERY_N === 1
      const since = isFullSync ? undefined : lastSyncedAtCache

      let result
      try {
        result = await pullOrders(token, since)
      } catch {
        const cached = await getOrders()
        if (!cancelledRef.current) {
          setOrders(cached)
          setError('Offline — showing cached orders')
        }
        return
      }

      if (cancelledRef.current) return

      const { orders: fetched, syncTimestamp } = result

      // P1: Track existing order IDs BEFORE upsert for new-order detection
      const existingIds = new Set((await getOrders()).map((o) => o.orderId))

      const now = new Date().toISOString()
      const entries: LabOrderEntry[] = fetched.map((o) => ({
        orderId: o.orderId,
        patientFirstName: o.patientFirstName,
        patientAge: o.patientAge,
        patientRef: o.patientRef,
        testsRequested: o.testsRequested,
        urgency: o.urgency,
        orderingPhysicianName: o.orderingPhysicianName,
        specialInstructions: o.specialInstructions,
        status: 'RECEIVED' as const,
        authoredOn: o.authoredOn,
        receivedAt: now,
        syncedAt: now,
      }))

      if (entries.length > 0) {
        await putOrders(entries)
      }

      // P1: Only acknowledge orders NOT previously in Dexie
      for (const entry of entries) {
        if (!existingIds.has(entry.orderId)) {
          try {
            await acknowledgeOrder(entry.orderId, token)
          } catch {
            // Ack is best-effort — will retry on next cycle
          }
        }
      }

      // P7: On full sync, mark local orders absent from server as CANCELLED
      if (isFullSync) {
        const serverIds = new Set(fetched.map((o) => o.orderId))
        const localOrders = await getOrders()
        for (const local of localOrders) {
          if (local.status === 'RECEIVED' && !serverIds.has(local.orderId)) {
            await updateOrderStatus(local.orderId, 'CANCELLED')
          }
        }
      }

      // P11: Use server timestamp for accurate incremental sync (no clock skew)
      if (syncTimestamp) {
        lastSyncedAtCache = syncTimestamp
      }
      setLastSyncedAtState(lastSyncedAtCache ?? null)

      const allOrders = await getOrders()
      if (!cancelledRef.current) {
        setOrders(allOrders)
        setError(null)
      }
    } finally {
      // P10: Always reset loading and in-flight state
      inFlightRef.current = false
      if (!cancelledRef.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    cancelledRef.current = false

    getOrders()
      .then((cached) => {
        if (!cancelledRef.current) {
          setOrders(cached)
          setLastSyncedAtState(lastSyncedAtCache ?? null)
          setLoading(false)
        }
      })
      .catch(() => {})

    sync()
    intervalRef.current = setInterval(sync, POLL_INTERVAL_MS)
    return () => {
      cancelledRef.current = true
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [sync])

  const refresh = useCallback(() => {
    setError(null)
    setLoading(true)
    sync()
  }, [sync])

  return { orders, loading, error, lastSyncedAt, refresh }
}
