/**
 * Story 52.2 — Shared Inventory Visibility: Redistribution Recommendation Engine
 *
 * Algorithm:
 *   1. Identify labs with daysOfSupply ≤ 7 or isStockedOut for any reagent.
 *   2. For each critical item, find peer labs in the same district with
 *      daysOfSupply > 30 for the same reagent.
 *   3. Rank by proximity (GPS distance when available, else same-district label).
 *   4. Generate recommendation with a suggested transfer amount that:
 *      - Brings deficit lab to ≥ 14 days of supply.
 *      - Does NOT drop source lab below 14 days.
 *
 * Results are stored in Dexie `redistributionRecommendations` and recomputed
 * on every network inventory update.
 *
 * No PHI — facility names/IDs and reagent operational data only.
 */

import { getDb } from '@/lib/db'
import type { NetworkInventoryEntry, RedistributionRecommendation } from '@/lib/db'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CRITICAL_THRESHOLD_DAYS = 7   // labs with ≤ this are "critical"
const SURPLUS_THRESHOLD_DAYS  = 30  // labs with > this are "surplus"
const TARGET_DAYS_AFTER_TRANSFER = 14  // target for deficit lab post-transfer
const MIN_SOURCE_DAYS_AFTER  = 14   // source lab must retain this many days

// ---------------------------------------------------------------------------
// Haversine distance (km) — used for GPS-based proximity sorting
// ---------------------------------------------------------------------------

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function distanceLabel(km: number | null): string {
  if (km === null) return 'same district'
  return `${Math.round(km)} km`
}

// ---------------------------------------------------------------------------
// Core engine
// ---------------------------------------------------------------------------

/**
 * Compute redistribution recommendations from cached network inventory.
 *
 * Stores results in Dexie `redistributionRecommendations` (full replace).
 * Safe to call repeatedly — previous recommendations are cleared first.
 */
export async function computeRedistributionRecommendations(
  myLabId: string,
): Promise<RedistributionRecommendation[]> {
  const db = getDb()

  // Load all cached network snapshots
  const allEntries = await db.networkInventory.toArray()
  if (allEntries.length < 2) {
    // Need at least two labs to make a recommendation
    await db.redistributionRecommendations.clear()
    return []
  }

  const recommendations: Omit<RedistributionRecommendation, 'id'>[] = []

  // Build lookup: labId → entry
  const byLabId = new Map<string, NetworkInventoryEntry>()
  for (const entry of allEntries) {
    byLabId.set(entry.labId, entry)
  }

  // For each lab with a critical reagent, find donor labs
  for (const deficitEntry of allEntries) {
    for (const item of deficitEntry.items) {
      const isCritical = item.daysOfSupply <= CRITICAL_THRESHOLD_DAYS || item.isStockedOut
      if (!isCritical) continue

      // Find surplus peers in same district
      const surplusPeers = allEntries
        .filter(
          e =>
            e.labId !== deficitEntry.labId &&
            e.district === deficitEntry.district,
        )
        .map(e => ({
          entry: e,
          item: e.items.find(i => i.reagentCode === item.reagentCode),
        }))
        .filter(
          ({ item: si }) => si !== undefined && si.daysOfSupply > SURPLUS_THRESHOLD_DAYS,
        )

      if (surplusPeers.length === 0) continue

      // Rank by distance (GPS if available)
      const deficitCoords = deficitEntry.coordinates
      const ranked = surplusPeers
        .map(({ entry: se, item: si }) => {
          const sourceCoords = se.coordinates
          const km =
            deficitCoords && sourceCoords
              ? haversineKm(
                  deficitCoords.lat,
                  deficitCoords.lng,
                  sourceCoords.lat,
                  sourceCoords.lng,
                )
              : null
          return { entry: se, sourceItem: si!, km }
        })
        .sort((a, b) => {
          // GPS distance asc; null (no GPS) sorts last
          if (a.km === null && b.km === null) return 0
          if (a.km === null) return 1
          if (b.km === null) return -1
          return a.km - b.km
        })

      // Take best (closest) donor
      const best = ranked[0]
      if (!best) continue

      const { entry: sourceEntry, sourceItem, km } = best

      // Calculate suggested transfer amount
      // deficit lab needs: (TARGET_DAYS - current daysOfSupply) × dailyRate
      const deficitRate = item.dailyConsumptionRate
      const needed =
        deficitRate > 0
          ? Math.ceil(
              (TARGET_DAYS_AFTER_TRANSFER - item.daysOfSupply) * deficitRate,
            )
          : item.isStockedOut
            ? Math.min(sourceItem.currentQuantity, 20)  // fallback: suggest 20 units
            : 0

      if (needed <= 0) continue

      // Source lab must retain MIN_SOURCE_DAYS_AFTER worth of supply
      const sourceRate = sourceItem.dailyConsumptionRate
      const sourceMinRetain =
        sourceRate > 0
          ? Math.ceil(MIN_SOURCE_DAYS_AFTER * sourceRate)
          : 0
      const canTransfer = sourceItem.currentQuantity - sourceMinRetain

      if (canTransfer <= 0) continue

      const suggestedTransferQty = Math.min(needed, canTransfer)

      recommendations.push({
        reagentCode: item.reagentCode,
        reagentDisplay: item.reagentDisplay,
        deficitLabId: deficitEntry.labId,
        deficitLabName: deficitEntry.labName,
        deficitDaysOfSupply: item.daysOfSupply,
        sourceLabId: sourceEntry.labId,
        sourceLabName: sourceEntry.labName,
        sourceDaysOfSupply: sourceItem.daysOfSupply,
        suggestedTransferQty,
        distanceKm: km !== null ? Math.round(km) : null,
        distanceLabel: distanceLabel(km !== null ? Math.round(km) : null),
        createdAt: new Date().toISOString(),
        dismissedUntil: null,
      })
    }
  }

  // Replace stored recommendations
  await db.transaction(
    'rw',
    db.redistributionRecommendations,
    async () => {
      await db.redistributionRecommendations.clear()
      if (recommendations.length > 0) {
        await db.redistributionRecommendations.bulkAdd(
          recommendations as RedistributionRecommendation[],
        )
      }
    },
  )

  return db.redistributionRecommendations.toArray()
}

/**
 * Load recommendations relevant to a specific lab (as source OR destination).
 * Filters out dismissed recommendations.
 */
export async function getLabRecommendations(
  labId: string,
): Promise<RedistributionRecommendation[]> {
  const db = getDb()
  const now = new Date().toISOString()

  const all = await db.redistributionRecommendations
    .where('deficitLabId')
    .equals(labId)
    .toArray()

  const asSource = await db.redistributionRecommendations
    .where('sourceLabId')
    .equals(labId)
    .toArray()

  const combined = [...all, ...asSource]
  const deduped = Array.from(
    new Map(combined.map(r => [r.id, r])).values(),
  )

  // Filter dismissed
  return deduped.filter(
    r => r.dismissedUntil === null || r.dismissedUntil <= now,
  )
}

/** All recommendations (for district health officers). */
export async function getAllRecommendations(): Promise<RedistributionRecommendation[]> {
  const db = getDb()
  const now = new Date().toISOString()
  const all = await db.redistributionRecommendations.toArray()
  return all.filter(r => r.dismissedUntil === null || r.dismissedUntil <= now)
}

/** Dismiss a recommendation for 7 days. */
export async function dismissRecommendation(id: number): Promise<void> {
  const db = getDb()
  const sevenDaysFromNow = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000,
  ).toISOString()
  await db.redistributionRecommendations.update(id, {
    dismissedUntil: sevenDaysFromNow,
  })
}
