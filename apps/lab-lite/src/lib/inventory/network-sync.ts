/**
 * Story 52.2 — Shared Inventory Visibility: Network Sync Data Model
 *
 * Defines the outbound snapshot builder that assembles an InventorySnapshot
 * from local Dexie reagent tables (Epic 44 / Story 44.3).
 *
 * PRIVACY: Zero PHI. Payload contains reagent names, quantities, facility
 * identifiers, and consumption metrics ONLY. Verified by Task 9 unit tests.
 *
 * CLAUDE.md Rule #7 (data minimization) — operational metadata only.
 * CLAUDE.md Rule #6 (audit every access) — caller emits audit event.
 */

import { getDb, ReagentStatus } from '@/lib/db'
import type {
  InventorySnapshotItem,
  InventoryLabLocation,
  InventorySnapshot,
} from '@/lib/inventory/inventory-types'

// Re-export for consumers that import from this module
export type { InventorySnapshotItem, InventoryLabLocation, InventorySnapshot }

// ---------------------------------------------------------------------------
// Category derivation
// ---------------------------------------------------------------------------

/** Map LOINC code prefixes to reagent category labels. */
function deriveCategory(loincCode: string): string {
  const prefix = loincCode.split('-')[0]
  const num = parseInt(prefix ?? '0', 10)

  // Hematology: 718xx–789xx range (CBC, diff, Hb)
  if (num >= 718 && num <= 789) return 'hematology'
  // Chemistry / metabolic: 2xxx–3xxx
  if (num >= 2000 && num <= 3999) return 'chemistry'
  // Microbiology / infectious disease: 5xxx–6xxx
  if (num >= 5000 && num <= 6999) return 'microbiology'
  // Immunology / rapid tests: 7xxx
  if (num >= 7000 && num <= 7999) return 'rapid-tests'
  // Urinalysis: specific UA codes
  if (loincCode.startsWith('5794') || loincCode.startsWith('2091')) return 'urinalysis'

  return 'other'
}

// ---------------------------------------------------------------------------
// Snapshot builder
// ---------------------------------------------------------------------------

export interface BuildSnapshotOptions {
  labId: string
  labName: string
  labLocation: InventoryLabLocation
  hlcTimestamp: string
}

/**
 * Build an InventorySnapshot from local Dexie tables.
 *
 * Groups active reagent entries by linkedTestCode (LOINC). For each group:
 * - Sums remaining tests across active units
 * - Computes dailyConsumptionRate from consumption log (trailing 30 days)
 * - Picks nearest expiry date
 *
 * Never throws — returns empty items array on DB failure.
 */
export async function buildInventorySnapshot(
  opts: BuildSnapshotOptions,
): Promise<InventorySnapshot> {
  const snapshotAt = new Date().toISOString()

  try {
    const db = getDb()

    // Load active reagent inventory (exclude DISPOSED, EXPIRED)
    const activeStatuses = [ReagentStatus.ACTIVE, ReagentStatus.DEPLETED]
    const reagents = await db.reagent_inventory
      .where('status')
      .anyOf(activeStatuses)
      .toArray()

    // Load consumption logs from trailing 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const consumptionLogs = await db.reagent_consumption_log
      .where('loggedAt')
      .aboveOrEqual(thirtyDaysAgo)
      .toArray()

    // Index consumption by reagentId → total tests consumed in window
    const consumptionByReagentId = new Map<string, number>()
    for (const log of consumptionLogs) {
      consumptionByReagentId.set(
        log.reagentId,
        (consumptionByReagentId.get(log.reagentId) ?? 0) + log.testsConsumed,
      )
    }

    // Group by linkedTestCode
    const byCode = new Map<string, typeof reagents>()
    for (const r of reagents) {
      const group = byCode.get(r.linkedTestCode) ?? []
      group.push(r)
      byCode.set(r.linkedTestCode, group)
    }

    const items: InventorySnapshotItem[] = []

    for (const [loincCode, group] of byCode.entries()) {
      const currentQuantity = group.reduce(
        (sum, r) => sum + Math.max(0, r.expectedTests - r.testsPerformed),
        0,
      )

      // Sum 30-day consumption across all units of this reagent code
      let totalConsumed = 0
      for (const r of group) {
        totalConsumed += consumptionByReagentId.get(r.reagentId) ?? 0
      }
      const dailyConsumptionRate = totalConsumed / 30

      const daysOfSupply =
        dailyConsumptionRate > 0
          ? Math.min(999, Math.round(currentQuantity / dailyConsumptionRate))
          : currentQuantity > 0
            ? 999   // stock present but no consumption → treat as 999 days
            : 0

      // Nearest expiry date among active units
      const activeUnits = group.filter(r => r.status === ReagentStatus.ACTIVE)
      const expiryDate =
        activeUnits.length > 0
          ? activeUnits
              .map(r => r.expiryDate)
              .sort()
              .at(0) ?? null
          : null

      const lastRestockedAt =
        group
          .map(r => r.createdAt)
          .sort()
          .at(-1) ?? null

      items.push({
        reagentCode: loincCode,
        reagentDisplay: group[0]!.name,
        category: deriveCategory(loincCode),
        currentQuantity,
        unitOfMeasure: group[0]!.unit ?? 'tests',
        dailyConsumptionRate: Math.round(dailyConsumptionRate * 10) / 10,
        daysOfSupply,
        expiryDate: expiryDate ?? null,
        lastRestockedAt: lastRestockedAt ?? null,
        isStockedOut: currentQuantity === 0,
      })
    }

    return {
      labId: opts.labId,
      labName: opts.labName,
      labLocation: opts.labLocation,
      snapshotAt,
      hlcTimestamp: opts.hlcTimestamp,
      items,
    }
  } catch {
    // Never block clinical workflows on inventory sync errors
    return {
      labId: opts.labId,
      labName: opts.labName,
      labLocation: opts.labLocation,
      snapshotAt,
      hlcTimestamp: opts.hlcTimestamp,
      items: [],
    }
  }
}

/**
 * Verify that an InventorySnapshot contains zero PHI.
 *
 * Returns true if clean, false if any PHI-like field is detected.
 * Used in tests and as a pre-flight check before Hub sync.
 */
export function verifyZeroPhi(snapshot: InventorySnapshot): boolean {
  // PHI = patient names, IDs, diagnoses. An inventory snapshot MUST NOT
  // contain any of these. We check the serialized payload for known PHI
  // field names as a defence-in-depth measure.
  const serialized = JSON.stringify(snapshot)
  const phiPatterns = [
    /"patientId"/,
    /"patientName"/,
    /"dateOfBirth"/,
    /"diagnosis"/,
    /"prescription"/,
    /"allergy"/i,
    /"mrn"/i,
  ]
  return !phiPatterns.some(p => p.test(serialized))
}
