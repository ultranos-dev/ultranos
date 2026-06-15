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
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()

  // P6: receivedAt is not indexed in Dexie schema — use full table scan with
  // client-side filter rather than the broken where('receivedAt').aboveOrEqual()
  const allOrders = await db.orders.toArray()
  const todayOrders = allOrders.filter(
    (o) => o.receivedAt && new Date(o.receivedAt).getTime() >= todayStart,
  )
  const totalSamplesToday = todayOrders.length

  // D2→P: avgTATByLocation computation removed — TAT proxy via syncedAt is
  // unreliable (HLC drift on backfill produces negative values; syncedAt ≠ completedAt).
  // Replaced with empty stub; TAT card is removed from NetworkMetricsSummary.

  // Pending results per location — IN_PROGRESS orders (status IS indexed)
  const pendingOrders = await db.orders.where('status').equals('IN_PROGRESS').toArray()
  const pendingResultsByLocation: Record<string, number> = {}
  for (const order of pendingOrders) {
    const locId = 'main'
    pendingResultsByLocation[locId] = (pendingResultsByLocation[locId] ?? 0) + 1
  }

  // D1→P: Renamed from stockoutAlerts → syncFailures.
  // Counts upload queue items with 'failed' status to surface connectivity issues.
  const syncFailures = await db.uploadQueue.where('status').equals('failed').count()

  return {
    totalSamplesToday,
    pendingResultsByLocation,
    syncFailures,
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

  // Count pending/failed samples for this location — locationId is indexed (v38)
  const locationEntries = await db.uploadQueue.where('locationId').equals(locationId).toArray()
  const pendingSamples = locationEntries.filter(
    (e) => e.status === 'pending' || e.status === 'uploading',
  ).length
  const failedCount = locationEntries.filter((e) => e.status === 'failed').length

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
