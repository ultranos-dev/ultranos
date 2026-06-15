'use client'

import { useEffect, useRef } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

type RealtimeEvent = 'lab-result' | 'sync-conflict' | 'notification'

interface UseRealtimeDashboardOptions {
  /** Practitioner ID to scope notifications */
  practitionerId: string | undefined
  /** Called when a lab result or notification arrives via Realtime */
  onEvent: (type: RealtimeEvent) => void
}

/**
 * Subscribe to Supabase Realtime broadcast channel for dashboard updates.
 *
 * Architecture:
 * - Hub API publishes to a Supabase Realtime broadcast channel
 *   keyed by practitioner ID when new notifications/lab results arrive.
 * - This hook subscribes to that channel and fires a callback,
 *   which the dashboard uses to trigger an immediate data refresh
 *   instead of waiting for the next polling cycle.
 * - Falls back gracefully to polling when Realtime is unavailable
 *   (offline, WebSocket blocked, etc.).
 */
export function useRealtimeDashboard({ practitionerId, onEvent }: UseRealtimeDashboardOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    if (!practitionerId) return

    const supabase = getSupabaseBrowserClient()
    const channelName = `dashboard:${practitionerId}`

    const channel = supabase
      .channel(channelName)
      .on('broadcast', { event: 'lab-result' }, () => {
        onEvent('lab-result')
      })
      .on('broadcast', { event: 'sync-conflict' }, () => {
        onEvent('sync-conflict')
      })
      .on('broadcast', { event: 'notification' }, () => {
        onEvent('notification')
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          // Realtime unavailable — polling continues as fallback
          console.warn('[Realtime] Channel error — falling back to polling')
        }
      })

    channelRef.current = channel

    return () => {
      channel.unsubscribe()
      channelRef.current = null
    }
  }, [practitionerId, onEvent])
}
