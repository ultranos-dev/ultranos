import { Gauge } from 'prom-client'
import { getMetricsRegistry } from '@/trpc/middleware/metrics'
import { sendAlert } from '@/lib/alert-notifier'
import { getSupabaseClient } from '@/lib/supabase'

/**
 * Sync Queue Depth Monitor — Story 23.1 Task 6.
 *
 * Runs every 5 minutes. Queries the sync queue table for pending events
 * grouped by spoke app type. Records as gauge metric and alerts if
 * >1000 pending events with oldest event >1 hour old.
 */

const QUEUE_DEPTH_THRESHOLD = 1000
const MAX_AGE_MS = 60 * 60 * 1000 // 1 hour

const syncQueueDepth = new Gauge({
  name: 'sync_queue_depth',
  help: 'Number of pending sync queue events by spoke app type',
  labelNames: ['spoke_type'] as const,
  registers: [getMetricsRegistry()],
})

interface QueueDepthRow {
  spoke_type: string
  count: number
  oldest_created_at: string
}

export async function runSyncQueueMonitor(): Promise<void> {
  const supabase = getSupabaseClient()

  const { data, error } = await supabase
    .from('sync_queue')
    .select('spoke_type, count, oldest_created_at')

  if (error || !data) {
    console.warn('[SYNC_QUEUE_MONITOR] Query failed:', error?.message ?? 'no data')
    return
  }

  const rows = data as QueueDepthRow[]

  for (const row of rows) {
    // Record gauge metric
    syncQueueDepth.set({ spoke_type: row.spoke_type }, row.count)

    // Check alert condition: >1000 pending AND oldest >1 hour old
    if (row.count > QUEUE_DEPTH_THRESHOLD && row.oldest_created_at) {
      const oldestAge = Date.now() - new Date(row.oldest_created_at).getTime()
      if (isNaN(oldestAge)) continue

      if (oldestAge > MAX_AGE_MS) {
        await sendAlert({
          severity: 'P2',
          title: `Sync Queue Depth Alert: ${row.spoke_type}`,
          description: `${row.spoke_type} has ${row.count} pending events. Oldest event is ${Math.round(oldestAge / 60000)} minutes old.`,
          metric: 'sync_queue_depth',
          currentValue: row.count,
          threshold: QUEUE_DEPTH_THRESHOLD,
          timestamp: new Date().toISOString(),
        })
      }
    }
  }
}
