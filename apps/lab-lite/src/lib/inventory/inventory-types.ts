/**
 * Story 52.2 — Shared Inventory Visibility: Shared type definitions.
 *
 * Extracted to a standalone file so that `db.ts` and `network-sync.ts`
 * can both reference these types without creating a circular dependency.
 *
 * No PHI — operational inventory metadata only.
 */

export interface InventorySnapshotItem {
  reagentCode: string           // linkedTestCode (LOINC)
  reagentDisplay: string        // human-readable name
  category: string              // e.g. 'hematology', 'chemistry', 'rapid-tests'
  currentQuantity: number       // units on hand
  unitOfMeasure: string         // 'tests', 'mL', 'strips', 'cassettes'
  dailyConsumptionRate: number  // average tests/day (30-day trailing window)
  daysOfSupply: number          // currentQuantity / dailyConsumptionRate (999 = ∞)
  expiryDate: string | null     // nearest expiry in active stock
  lastRestockedAt: string | null
  isStockedOut: boolean         // currentQuantity === 0
}

export interface InventoryLabLocation {
  district: string
  province: string
  coordinates?: { lat: number; lng: number }
}

export interface InventorySnapshot {
  labId: string
  labName: string
  labLocation: InventoryLabLocation
  snapshotAt: string            // ISO 8601
  hlcTimestamp: string          // HLC for sync ordering
  items: InventorySnapshotItem[]
}
