'use client'

/**
 * MonitoringSyncInit — zero-UI mount that starts the monitoring sync worker.
 *
 * Rendered as a leaf component so its useState re-renders are isolated to itself
 * and do not cause the entire app tree to re-render on each polling cycle.
 *
 * Mount this in the authenticated (app) layout alongside SyncProvider so it runs
 * app-wide while a lab user is authenticated.
 */
import { useMonitoringSync } from '@/hooks/useMonitoringSync'

export function MonitoringSyncInit() {
  useMonitoringSync()
  return null
}
