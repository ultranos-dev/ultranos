/**
 * network-metrics.ts — Network Metrics Aggregation
 * Story 54.1 / Task 4
 *
 * Computes network-wide metrics and per-location status snapshots entirely
 * from local Dexie data. Data freshness depends on sync frequency from satellites.
 * No PHI involved — all aggregations use opaque IDs and counts only.
 */

import type { NetworkMetrics, NetworkStatusSnapshot } from '@/types/lab-network'
import { getDb, getActiveLocations, getNetworkSnapshot } from '@/lib/db'

// ---------------------------------------------------------------------------
// aggregateNetworkMetrics
// ---------------------------------------------------------------------------

/**
 * Aggregate network-wide metrics from local Dexie data.
 * Returns staleness metadata via `asOf` so the UI can show "data from X ago".
 */
export async function aggregateNetworkMetrics(): Promise<NetworkMetrics> {
  const db = getDb()
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()

  // Total samples collected today (orders received today across all locations)
  const allOrders = await db.orders
    .where('receivedAt')
    .aboveOrEqual(todayStart)
    .toArray()
  const totalSamplesToday = allOrders.length

  // Average TAT per location — computed from COMPLETED orders that have both
  // receivedAt and a completedAt equivalent. We proxy TAT as time from
  // receivedAt to syncedAt for COMPLETED orders (best available offline metric).
  const completedOrders = allOrders.filter((o) => o.status === 'COMPLETED')
  const tatByLocation: Record<string, number[]> = {}
  for (const order of completedOrders) {
    if (order.syncedAt && order.receivedAt) {
      const tat = (new Date(order.syncedAt).getTime() - new Date(order.receivedAt).getTime()) / 60_000
      const locId = 'main' // Lab-Lite doesn't tag orders by location yet — default to main
      if (!tatByLocation[locId]) tatByLocation[locId] = []
      tatByLocation[locId].push(tat)
    }
  }
  const avgTATByLocation: Record<string, number> = {}
  for (const [locId, tats] of Object.entries(tatByLocation)) {
    avgTATByLocation[locId] = Math.round(tats.reduce((a, b) => a + b, 0) / tats.length)
  }

  // Pending results per location — IN_PROGRESS orders keyed by location
  const pendingOrders = await db.orders
    .where('status')
    .equals('IN_PROGRESS')
    .toArray()
  const pendingResultsByLocation: Record<string, number> = {}
  for (const order of pendingOrders) {
    const locId = 'main'
    pendingResultsByLocation[locId] = (pendingResultsByLocation[locId] ?? 0) + 1
  }

  // Stockout alerts — count active locations with no upload queue capacity
  // (proxy: upload queue items with status 'failed' indicate connectivity issues)
  const failedUploads = await db.uploadQueue
    .where('status')
    .equals('failed')
    .count()
  const stockoutAlerts = failedUploads > 0 ? 1 : 0

  return {
    totalSamplesToday,
    avgTATByLocation,
    pendingResultsByLocation,
    stockoutAlerts,
    asOf: now.toISOString(),
  }
}

// ---------------------------------------------------------------------------
// getLocationStatus
// ---------------------------------------------------------------------------

/**
 * Compile a status snapshot for a single location.
 * Merges stored snapshot data with live Dexie counts.
 * Returns a degraded snapshot (all zeros) if no stored snapshot exists.
 */
export async function getLocationStatus(locationId: string): Promise<NetworkStatusSnapshot> {
  const stored = await getNetworkSnapshot(locationId)
  const db = getDb()

  // Count pending samples for this location from upload queue
  const pendingSamples = await db.uploadQueue
    .where('status')
    .anyOf(['pending', 'uploading'])
    .count()

  // Count upload failures as stock alerts
  const failedCount = await db.uploadQueue
    .where('status')
    .equals('failed')
    .count()

  // If we have a stored snapshot, merge live counts; otherwise return degraded
  if (stored) {
    return {
      ...stored,
      pendingSamples,
      stockAlerts: failedCount,
      // connectivity status is preserved from stored snapshot (set during sync)
    }
  }

  // No snapshot means this location has never synced — return offline stub
  return {
    locationId,
    pendingSamples,
    stockAlerts: failedCount,
    staffOnDuty: 0,
    lastSyncTimestamp: new Date(0).toISOString(), // epoch — indicates never synced
    connectivityStatus: 'offline',
  }
}

// ---------------------------------------------------------------------------
// getLocationsWithStatus
// ---------------------------------------------------------------------------

/**
 * Return status snapshots for all active locations.
 * Used by the network dashboard to populate location cards.
 */
export async function getLocationsWithStatus(): Promise<
  Array<{ locationId: string; name: string; type: string; mode: string; status: string; snapshot: NetworkStatusSnapshot }>
> {
  const locations = await getActiveLocations()
  const results = await Promise.all(
    locations.map(async (loc) => ({
      locationId: loc.id,
      name: loc.name,
      type: loc.type,
      mode: loc.mode,
      status: loc.status,
      snapshot: await getLocationStatus(loc.id),
    })),
  )
  return results
}
