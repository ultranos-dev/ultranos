# Pharmacy Inventory Sub-Project A: Catalog + Stock Core

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add inventory tracking to pharmacy-lite — medication catalog (Hub-synced), stock batches with FEFO, stock movements (append-only ledger), goods receiving, stock overview page, auto-quarantine, and dispensing integration (stock deduction on confirm).

**Architecture:** Dexie v6 adds 4 new tables (catalogItems, stockBatches, stockMovements, goodsReceipts) + a pharmacySettings table. Catalog syncs from Hub API on connect. Dispensing flow gains FEFO batch selection and stock deduction. Background timer quarantines expired batches. Dashboard shows inventory alert widgets.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS, Dexie (IndexedDB), Zustand, next-intl, `@ultranos/ui-kit` Sidebar, html5-qrcode (barcode scan reuse).

**Spec:** `docs/superpowers/specs/2026-05-25-pharmacy-inventory-pos-design.md`

---

## File Structure

### New Files

```
apps/pharmacy-lite/src/
├── lib/
│   ├── inventory/
│   │   ├── types.ts                    # All inventory type definitions
│   │   ├── catalog-sync.ts             # Hub catalog fetch + local bulk-put
│   │   ├── stock-service.ts            # Core stock operations (deduct, receive, quarantine, query)
│   │   ├── fefo.ts                     # FEFO batch selection logic
│   │   ├── expiry-watchdog.ts          # Background auto-quarantine check
│   │   └── goods-receipt-service.ts    # Create receipt + batches + movements
│   └── inventory-db.ts                 # Dexie v6 schema extension (new tables)
├── stores/
│   └── inventory-store.ts              # Zustand store for stock alerts, catalog state
├── hooks/
│   ├── useCatalogSync.ts               # Hook: sync catalog on mount when online
│   ├── useStockAlerts.ts               # Hook: low-stock + near-expiry counts
│   └── useExpiryWatchdog.ts            # Hook: run quarantine check on mount + interval
├── components/pharmacy/
│   ├── inventory/
│   │   ├── StockOverviewPage.tsx       # /inventory page — table + filters + alerts panel
│   │   ├── StockTable.tsx              # Searchable/filterable stock table
│   │   ├── StockAlertPanel.tsx         # Low-stock, near-expiry, quarantined counts
│   │   ├── ReceiveStockPage.tsx        # /inventory/receive — goods receiving form
│   │   ├── ReceiveStockForm.tsx        # Add items (scan/search → batch/expiry/qty/cost)
│   │   ├── ReceiveStockItemRow.tsx     # Single line item in receiving form
│   │   ├── CatalogSearchInput.tsx      # Barcode scan + name search for catalog items
│   │   ├── CatalogBrowsePage.tsx       # /inventory/catalog — browse formulary
│   │   ├── InventoryAlertCard.tsx      # Dashboard widget
│   │   └── FefoWarningBanner.tsx       # Shown during dispense if non-FEFO batch selected
│   └── ...existing
├── app/[locale]/
│   ├── inventory/
│   │   ├── page.tsx                    # Stock Overview route
│   │   ├── receive/page.tsx            # Receive Stock route
│   │   └── catalog/page.tsx            # Catalog Browse route
│   └── ...existing
```

### Modified Files

```
apps/pharmacy-lite/src/
├── lib/db.ts                           # Dexie v6: add inventory tables
├── stores/fulfillment-store.ts         # Add FEFO batch selection + stock deduction on confirm
├── components/pharmacy/
│   ├── PharmacyDashboard.tsx           # Add InventoryAlertCard widget
│   └── FulfillmentChecklist.tsx        # Show FEFO batch info + warning banner
├── components/AppShellWrapper.tsx      # Add inventory nav items to sidebar
```

---

## Phase 1: Data Layer (Tasks 1-3)

### Task 1: Inventory Types

**Files:**
- Create: `apps/pharmacy-lite/src/lib/inventory/types.ts`

- [ ] **Step 1: Create the inventory types file**

```ts
// apps/pharmacy-lite/src/lib/inventory/types.ts

/**
 * All monetary values are stored as integers in minor currency units.
 * e.g. 350 = 3.50 AFN (when currencyMinorUnits = 2)
 */

export type MedicationForm =
  | 'tablet'
  | 'capsule'
  | 'syrup'
  | 'injection'
  | 'cream'
  | 'drops'
  | 'inhaler'
  | 'other'

export type ControlledSchedule = 'II' | 'III' | 'IV' | 'V'

export interface CatalogItem {
  id: string
  name: string
  nameLocal?: string
  form: MedicationForm
  strength: string
  strengthUnit: string
  packSize: number
  barcode?: string
  category: string
  controlledSchedule?: ControlledSchedule
  defaultSellingPrice: number
  reorderPoint: number
  minStock?: number
  maxStock?: number
  isActive: boolean
  lastSyncedAt: string
}

export type StockBatchStatus = 'active' | 'quarantined' | 'depleted'

export interface StockBatch {
  id: string
  catalogItemId: string
  batchNumber: string
  lotNumber?: string
  expiryDate: string
  quantityOnHand: number
  costPrice: number
  sellingPrice: number
  zoneId?: string
  supplierId?: string
  goodsReceiptId?: string
  receivedAt: string
  status: StockBatchStatus
  locationId: string
  hlcTimestamp: string
}

export type StockMovementType =
  | 'received'
  | 'dispensed'
  | 'adjusted'
  | 'transferred_out'
  | 'transferred_in'
  | 'quarantined'
  | 'disposed'
  | 'returned'
  | 'void_reversal'

export type StockMovementRefType =
  | 'dispense'
  | 'purchase_order'
  | 'transfer'
  | 'count'
  | 'goods_receipt'
  | 'void'

export interface StockMovement {
  id: string
  stockBatchId: string
  catalogItemId: string
  type: StockMovementType
  quantity: number
  reason?: string
  referenceId?: string
  referenceType?: StockMovementRefType
  performedBy: string
  timestamp: string
  hlcTimestamp: string
}

export interface GoodsReceiptItem {
  catalogItemId: string
  batchNumber: string
  lotNumber?: string
  expiryDate: string
  quantity: number
  costPrice: number
  sellingPrice: number
}

export interface GoodsReceipt {
  id: string
  supplierId?: string
  purchaseOrderId?: string
  receivedBy: string
  items: GoodsReceiptItem[]
  totalCost: number
  notes?: string
  receivedAt: string
  hlcTimestamp: string
}

export interface PharmacyInventorySettings {
  enablePurchaseOrders: boolean
  enableZones: boolean
  enablePatientCredit: boolean
  enableTransfers: boolean
  requirePaymentOnDispense: boolean
  expiryAlertDays: number
  lowStockAlertEnabled: boolean
  fefoEnforcement: 'suggest' | 'enforce'
  currency: string
  currencyMinorUnits: number
  taxRate: number
  invoicePrefix: string
  locationId: string
  locationName: string
  organizationId?: string
}

export const DEFAULT_PHARMACY_SETTINGS: PharmacyInventorySettings = {
  enablePurchaseOrders: false,
  enableZones: false,
  enablePatientCredit: false,
  enableTransfers: false,
  requirePaymentOnDispense: false,
  expiryAlertDays: 90,
  lowStockAlertEnabled: true,
  fefoEnforcement: 'enforce',
  currency: 'AFN',
  currencyMinorUnits: 2,
  taxRate: 0,
  invoicePrefix: 'INV-',
  locationId: '',
  locationName: '',
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/pharmacy-lite/src/lib/inventory/types.ts
git commit -m "feat(pharmacy-lite): inventory type definitions — catalog, stock, movements, settings"
```

---

### Task 2: Dexie v6 Schema — Inventory Tables

**Files:**
- Create: `apps/pharmacy-lite/src/lib/inventory-db.ts`
- Modify: `apps/pharmacy-lite/src/lib/db.ts`

- [ ] **Step 1: Create inventory-db module with table declarations**

```ts
// apps/pharmacy-lite/src/lib/inventory-db.ts
import type { EntityTable } from 'dexie'
import type {
  CatalogItem,
  StockBatch,
  StockMovement,
  GoodsReceipt,
  PharmacyInventorySettings,
} from './inventory/types'

/**
 * Inventory table type declarations for the PharmacyLiteDatabase class.
 * These are added to the main db.ts class.
 */
export type InventoryTables = {
  catalogItems: EntityTable<CatalogItem, 'id'>
  stockBatches: EntityTable<StockBatch, 'id'>
  stockMovements: EntityTable<StockMovement, 'id'>
  goodsReceipts: EntityTable<GoodsReceipt, 'id'>
  pharmacySettings: EntityTable<PharmacyInventorySettings, 'locationId'>
}

/**
 * Dexie v6 store definitions for inventory tables.
 * Add this to the version(6) migration in db.ts.
 */
export const INVENTORY_STORES = {
  catalogItems: 'id, barcode, name, category, controlledSchedule, isActive',
  stockBatches: 'id, catalogItemId, expiryDate, status, locationId, [catalogItemId+status]',
  stockMovements: 'id, stockBatchId, catalogItemId, type, timestamp, hlcTimestamp',
  goodsReceipts: 'id, receivedAt, supplierId',
  pharmacySettings: 'locationId',
}

/**
 * PHI config for inventory tables.
 * StockMovements contain practitionerId (non-PHI opaque ID) — no encryption needed.
 * CatalogItems are Hub-public — no encryption needed.
 * GoodsReceipts may contain supplier info but not patient data — no encryption needed.
 * StockBatches are product data — no encryption needed.
 */
export const INVENTORY_PHI_TABLES = []
// None of the inventory tables contain patient health information.
// Patient linkage happens at the Invoice/Dispense layer (Sub-project B).
```

- [ ] **Step 2: Add inventory tables to main db.ts**

In `apps/pharmacy-lite/src/lib/db.ts`, add the following changes:

1. Add import at top:
```ts
import type { CatalogItem, StockBatch, StockMovement, GoodsReceipt, PharmacyInventorySettings } from './inventory/types'
import { INVENTORY_STORES } from './inventory-db'
```

2. Add table declarations inside `PharmacyLiteDatabase` class (with the other `!:` declarations):
```ts
catalogItems!: EntityTable<CatalogItem, 'id'>
stockBatches!: EntityTable<StockBatch, 'id'>
stockMovements!: EntityTable<StockMovement, 'id'>
goodsReceipts!: EntityTable<GoodsReceipt, 'id'>
pharmacySettings!: EntityTable<PharmacyInventorySettings, 'locationId'>
```

3. Add version 6 migration after version 5:
```ts
// v6: Inventory management — catalog, stock batches, movements, goods receipts, settings
this.version(6).stores(INVENTORY_STORES)
```

- [ ] **Step 3: Commit**

```bash
git add apps/pharmacy-lite/src/lib/inventory-db.ts apps/pharmacy-lite/src/lib/db.ts
git commit -m "feat(pharmacy-lite): Dexie v6 — inventory tables (catalog, stockBatches, stockMovements, goodsReceipts, settings)"
```

---

### Task 3: Inventory Zustand Store

**Files:**
- Create: `apps/pharmacy-lite/src/stores/inventory-store.ts`

- [ ] **Step 1: Create inventory store**

```ts
// apps/pharmacy-lite/src/stores/inventory-store.ts
import { create } from 'zustand'

interface StockAlerts {
  lowStockCount: number
  nearExpiryCount: number
  quarantinedCount: number
}

interface InventoryState {
  alerts: StockAlerts
  catalogLastSynced: string | null
  isSyncingCatalog: boolean
  setAlerts: (alerts: StockAlerts) => void
  setCatalogLastSynced: (timestamp: string) => void
  setIsSyncingCatalog: (syncing: boolean) => void
}

export const useInventoryStore = create<InventoryState>((set) => ({
  alerts: { lowStockCount: 0, nearExpiryCount: 0, quarantinedCount: 0 },
  catalogLastSynced: null,
  isSyncingCatalog: false,
  setAlerts: (alerts) => set({ alerts }),
  setCatalogLastSynced: (timestamp) => set({ catalogLastSynced: timestamp }),
  setIsSyncingCatalog: (syncing) => set({ isSyncingCatalog: syncing }),
}))
```

- [ ] **Step 2: Commit**

```bash
git add apps/pharmacy-lite/src/stores/inventory-store.ts
git commit -m "feat(pharmacy-lite): inventory Zustand store for alerts and catalog sync state"
```

---

## Phase 2: Catalog Sync + Stock Service (Tasks 4-6)

### Task 4: Catalog Sync from Hub

**Files:**
- Create: `apps/pharmacy-lite/src/lib/inventory/catalog-sync.ts`
- Create: `apps/pharmacy-lite/src/hooks/useCatalogSync.ts`

- [ ] **Step 1: Create catalog sync logic**

```ts
// apps/pharmacy-lite/src/lib/inventory/catalog-sync.ts
import { db } from '@/lib/db'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getHubApiUrl } from '@/lib/trpc'
import type { CatalogItem } from './types'

const SYNC_PAGE_SIZE = 100

interface CatalogSyncResult {
  itemsSynced: number
  lastSyncedAt: string
}

/**
 * Fetch catalog items from Hub API since a given timestamp.
 * Pages through all results using cursor-based pagination.
 */
export async function syncCatalogFromHub(
  signal?: AbortSignal,
): Promise<CatalogSyncResult> {
  const token = await useAuthSessionStore.getState().getAccessToken()
  if (!token) throw new Error('Authentication required')

  const hubBaseUrl = getHubApiUrl()

  // Get the most recent lastSyncedAt from local catalog
  const mostRecent = await db.catalogItems
    .orderBy('lastSyncedAt')
    .reverse()
    .first()
  const since = mostRecent?.lastSyncedAt ?? '1970-01-01T00:00:00.000Z'

  let cursor: string | undefined
  let totalSynced = 0
  const syncTimestamp = new Date().toISOString()

  while (true) {
    if (signal?.aborted) break

    const url = new URL(hubBaseUrl)
    url.pathname = url.pathname.replace(/\/$/, '') + '/catalog.list'
    const input: Record<string, unknown> = {
      since,
      limit: SYNC_PAGE_SIZE,
    }
    if (cursor) input.cursor = cursor
    url.searchParams.set('input', JSON.stringify({ json: input }))

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    })

    if (!res.ok) {
      if (res.status === 404) {
        // Endpoint not yet available on Hub — skip silently
        break
      }
      throw new Error(`Catalog sync failed: ${res.status}`)
    }

    const body = (await res.json()) as {
      result: { data: { json: { items: CatalogItem[]; nextCursor?: string } } }
    }
    const { items, nextCursor } = body.result.data.json

    if (items.length > 0) {
      // Stamp each item with sync time and bulk-put
      const stamped = items.map((item) => ({
        ...item,
        lastSyncedAt: syncTimestamp,
      }))
      await db.catalogItems.bulkPut(stamped)
      totalSynced += items.length
    }

    if (!nextCursor || items.length < SYNC_PAGE_SIZE) break
    cursor = nextCursor
  }

  return { itemsSynced: totalSynced, lastSyncedAt: syncTimestamp }
}

/**
 * Search local catalog by name or barcode.
 */
export async function searchCatalog(query: string): Promise<CatalogItem[]> {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed || trimmed.length < 2) return []

  // Try barcode exact match first
  const barcodeMatch = await db.catalogItems
    .where('barcode')
    .equals(trimmed)
    .first()
  if (barcodeMatch) return [barcodeMatch]

  // Fall back to name prefix search
  return db.catalogItems
    .filter((item) =>
      item.name.toLowerCase().includes(trimmed) ||
      (item.nameLocal?.toLowerCase().includes(trimmed) ?? false)
    )
    .limit(20)
    .toArray()
}
```

- [ ] **Step 2: Create useCatalogSync hook**

```ts
// apps/pharmacy-lite/src/hooks/useCatalogSync.ts
import { useEffect, useRef } from 'react'
import { syncCatalogFromHub } from '@/lib/inventory/catalog-sync'
import { useInventoryStore } from '@/stores/inventory-store'

/**
 * Syncs the medication catalog from Hub on mount when online.
 * Non-blocking — runs in background. Fails silently (offline-safe).
 */
export function useCatalogSync() {
  const setIsSyncingCatalog = useInventoryStore((s) => s.setIsSyncingCatalog)
  const setCatalogLastSynced = useInventoryStore((s) => s.setCatalogLastSynced)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!navigator.onLine) return

    const controller = new AbortController()
    abortRef.current = controller

    async function sync() {
      setIsSyncingCatalog(true)
      try {
        const result = await syncCatalogFromHub(controller.signal)
        if (!controller.signal.aborted) {
          setCatalogLastSynced(result.lastSyncedAt)
        }
      } catch {
        // Catalog sync is non-blocking — fail silently when offline or Hub unavailable
      } finally {
        if (!controller.signal.aborted) {
          setIsSyncingCatalog(false)
        }
      }
    }

    sync()
    return () => { controller.abort() }
  }, [setIsSyncingCatalog, setCatalogLastSynced])
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/pharmacy-lite/src/lib/inventory/catalog-sync.ts apps/pharmacy-lite/src/hooks/useCatalogSync.ts
git commit -m "feat(pharmacy-lite): catalog sync from Hub API with local barcode/name search"
```

---

### Task 5: Stock Service (Core Operations)

**Files:**
- Create: `apps/pharmacy-lite/src/lib/inventory/stock-service.ts`
- Create: `apps/pharmacy-lite/src/lib/inventory/fefo.ts`

- [ ] **Step 1: Create FEFO batch selection**

```ts
// apps/pharmacy-lite/src/lib/inventory/fefo.ts
import { db } from '@/lib/db'
import type { StockBatch } from './types'

/**
 * Select the batch with the nearest expiry date for a given catalog item.
 * FEFO = First Expiry, First Out.
 *
 * Returns null if no active batches have sufficient quantity.
 */
export async function selectFefoBatch(
  catalogItemId: string,
  requiredQty: number,
): Promise<StockBatch | null> {
  // Query active batches ordered by expiry (ascending = nearest first)
  const batches = await db.stockBatches
    .where('[catalogItemId+status]')
    .equals([catalogItemId, 'active'])
    .sortBy('expiryDate')

  // Find the first batch with enough quantity
  for (const batch of batches) {
    if (batch.quantityOnHand >= requiredQty) {
      return batch
    }
  }

  // No single batch has enough — return the nearest-expiry with any stock
  // (caller may need to split across batches)
  const anyStock = batches.find((b) => b.quantityOnHand > 0)
  return anyStock ?? null
}

/**
 * Get all active batches for a catalog item, ordered by FEFO.
 */
export async function getFefoBatches(catalogItemId: string): Promise<StockBatch[]> {
  return db.stockBatches
    .where('[catalogItemId+status]')
    .equals([catalogItemId, 'active'])
    .sortBy('expiryDate')
}

/**
 * Get total stock on hand for a catalog item across all active batches.
 */
export async function getTotalStockOnHand(catalogItemId: string): Promise<number> {
  const batches = await db.stockBatches
    .where('[catalogItemId+status]')
    .equals([catalogItemId, 'active'])
    .toArray()
  return batches.reduce((sum, b) => sum + b.quantityOnHand, 0)
}
```

- [ ] **Step 2: Create stock service**

```ts
// apps/pharmacy-lite/src/lib/inventory/stock-service.ts
import { db } from '@/lib/db'
import type { StockBatch, StockMovement, StockMovementType } from './types'

/**
 * Deduct stock from a specific batch. Creates an append-only StockMovement.
 * Returns the updated batch.
 */
export async function deductStock(params: {
  stockBatchId: string
  catalogItemId: string
  quantity: number
  type: StockMovementType
  referenceId?: string
  referenceType?: StockMovement['referenceType']
  performedBy: string
}): Promise<StockBatch> {
  const { stockBatchId, catalogItemId, quantity, type, referenceId, referenceType, performedBy } = params

  // Read current batch
  const batch = await db.stockBatches.get(stockBatchId)
  if (!batch) throw new Error(`StockBatch not found: ${stockBatchId}`)
  if (batch.quantityOnHand < quantity) {
    throw new Error(`Insufficient stock: have ${batch.quantityOnHand}, need ${quantity}`)
  }

  const now = new Date().toISOString()
  const movementId = crypto.randomUUID()

  // Create movement (append-only)
  const movement: StockMovement = {
    id: movementId,
    stockBatchId,
    catalogItemId,
    type,
    quantity: -quantity, // negative for outgoing
    referenceId,
    referenceType,
    performedBy,
    timestamp: now,
    hlcTimestamp: now,
  }

  // Update batch quantity
  const newQty = batch.quantityOnHand - quantity
  const newStatus = newQty <= 0 ? 'depleted' as const : batch.status

  await db.transaction('rw', [db.stockMovements, db.stockBatches], async () => {
    await db.stockMovements.put(movement)
    await db.stockBatches.update(stockBatchId, {
      quantityOnHand: newQty,
      status: newStatus,
      hlcTimestamp: now,
    })
  })

  // Enqueue sync
  await db.syncQueue.put({
    id: crypto.randomUUID(),
    resourceType: 'StockMovement',
    resourceId: movementId,
    action: 'create',
    payload: JSON.stringify(movement),
    status: 'pending',
    hlcTimestamp: now,
    createdAt: now,
    retryCount: 0,
  })

  return { ...batch, quantityOnHand: newQty, status: newStatus }
}

/**
 * Add stock to a batch (used by goods receiving and transfer-in).
 * Creates an append-only StockMovement.
 */
export async function addStock(params: {
  stockBatchId: string
  catalogItemId: string
  quantity: number
  type: StockMovementType
  referenceId?: string
  referenceType?: StockMovement['referenceType']
  performedBy: string
}): Promise<void> {
  const { stockBatchId, catalogItemId, quantity, type, referenceId, referenceType, performedBy } = params

  const now = new Date().toISOString()
  const movementId = crypto.randomUUID()

  const movement: StockMovement = {
    id: movementId,
    stockBatchId,
    catalogItemId,
    type,
    quantity, // positive for incoming
    referenceId,
    referenceType,
    performedBy,
    timestamp: now,
    hlcTimestamp: now,
  }

  await db.transaction('rw', [db.stockMovements, db.stockBatches], async () => {
    await db.stockMovements.put(movement)
    await db.stockBatches.update(stockBatchId, (batch) => {
      batch.quantityOnHand += quantity
      batch.hlcTimestamp = now
      // Reactivate if was depleted and now has stock
      if (batch.status === 'depleted' && batch.quantityOnHand > 0) {
        batch.status = 'active'
      }
    })
  })

  await db.syncQueue.put({
    id: crypto.randomUUID(),
    resourceType: 'StockMovement',
    resourceId: movementId,
    action: 'create',
    payload: JSON.stringify(movement),
    status: 'pending',
    hlcTimestamp: now,
    createdAt: now,
    retryCount: 0,
  })
}

/**
 * Query stock alerts: low-stock items, near-expiry batches, quarantined batches.
 */
export async function getStockAlerts(expiryAlertDays: number): Promise<{
  lowStockCount: number
  nearExpiryCount: number
  quarantinedCount: number
}> {
  const now = new Date()
  const alertDate = new Date(now.getTime() + expiryAlertDays * 24 * 60 * 60 * 1000)
  const alertDateStr = alertDate.toISOString().split('T')[0]!

  // Low stock: aggregate qty by catalogItemId, compare to reorderPoint
  const activeBatches = await db.stockBatches.where('status').equals('active').toArray()
  const qtyByCatalog = new Map<string, number>()
  for (const batch of activeBatches) {
    qtyByCatalog.set(batch.catalogItemId, (qtyByCatalog.get(batch.catalogItemId) ?? 0) + batch.quantityOnHand)
  }

  let lowStockCount = 0
  const catalogIds = Array.from(qtyByCatalog.keys())
  if (catalogIds.length > 0) {
    const catalogItems = await db.catalogItems.where('id').anyOf(catalogIds).toArray()
    for (const item of catalogItems) {
      const qty = qtyByCatalog.get(item.id) ?? 0
      if (qty <= item.reorderPoint) lowStockCount++
    }
  }

  // Near-expiry: active batches expiring within threshold
  const nearExpiryCount = activeBatches.filter(
    (b) => b.expiryDate <= alertDateStr
  ).length

  // Quarantined
  const quarantinedCount = await db.stockBatches.where('status').equals('quarantined').count()

  return { lowStockCount, nearExpiryCount, quarantinedCount }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/pharmacy-lite/src/lib/inventory/fefo.ts apps/pharmacy-lite/src/lib/inventory/stock-service.ts
git commit -m "feat(pharmacy-lite): stock service — FEFO selection, deduct/add stock, alerts query"
```

---

### Task 6: Expiry Watchdog + Stock Alerts Hook

**Files:**
- Create: `apps/pharmacy-lite/src/lib/inventory/expiry-watchdog.ts`
- Create: `apps/pharmacy-lite/src/hooks/useExpiryWatchdog.ts`
- Create: `apps/pharmacy-lite/src/hooks/useStockAlerts.ts`

- [ ] **Step 1: Create expiry watchdog**

```ts
// apps/pharmacy-lite/src/lib/inventory/expiry-watchdog.ts
import { db } from '@/lib/db'
import type { StockMovement } from './types'

/**
 * Quarantine all active batches whose expiryDate is today or earlier.
 * Creates StockMovement('quarantined') for each affected batch.
 * Returns the number of batches quarantined.
 */
export async function quarantineExpiredBatches(performedBy: string): Promise<number> {
  const today = new Date().toISOString().split('T')[0]!

  const expiredBatches = await db.stockBatches
    .where('status')
    .equals('active')
    .filter((batch) => batch.expiryDate <= today)
    .toArray()

  if (expiredBatches.length === 0) return 0

  const now = new Date().toISOString()

  await db.transaction('rw', [db.stockBatches, db.stockMovements, db.syncQueue], async () => {
    for (const batch of expiredBatches) {
      // Create quarantine movement
      const movementId = crypto.randomUUID()
      const movement: StockMovement = {
        id: movementId,
        stockBatchId: batch.id,
        catalogItemId: batch.catalogItemId,
        type: 'quarantined',
        quantity: -batch.quantityOnHand, // all remaining stock quarantined
        reason: `Auto-quarantined: expired on ${batch.expiryDate}`,
        performedBy,
        timestamp: now,
        hlcTimestamp: now,
      }
      await db.stockMovements.put(movement)

      // Update batch status
      await db.stockBatches.update(batch.id, {
        status: 'quarantined' as const,
        hlcTimestamp: now,
      })

      // Enqueue sync
      await db.syncQueue.put({
        id: crypto.randomUUID(),
        resourceType: 'StockMovement',
        resourceId: movementId,
        action: 'create',
        payload: JSON.stringify(movement),
        status: 'pending',
        hlcTimestamp: now,
        createdAt: now,
        retryCount: 0,
      })
    }
  })

  return expiredBatches.length
}
```

- [ ] **Step 2: Create useExpiryWatchdog hook**

```ts
// apps/pharmacy-lite/src/hooks/useExpiryWatchdog.ts
import { useEffect, useRef } from 'react'
import { quarantineExpiredBatches } from '@/lib/inventory/expiry-watchdog'
import { useAuthSessionStore } from '@/stores/auth-session-store'

const CHECK_INTERVAL_MS = 60 * 60 * 1000 // Check every hour

/**
 * Runs expiry quarantine check on mount and every hour.
 * Auto-quarantines expired batches so they can never be dispensed.
 */
export function useExpiryWatchdog() {
  const session = useAuthSessionStore((s) => s.session)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!session) return

    const performedBy = session.practitionerId ?? session.userId

    // Run immediately on mount
    quarantineExpiredBatches(performedBy).catch(() => {
      // Non-critical — will retry next interval
    })

    // Then every hour
    intervalRef.current = setInterval(() => {
      quarantineExpiredBatches(performedBy).catch(() => {})
    }, CHECK_INTERVAL_MS)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [session])
}
```

- [ ] **Step 3: Create useStockAlerts hook**

```ts
// apps/pharmacy-lite/src/hooks/useStockAlerts.ts
import { useEffect, useCallback } from 'react'
import { getStockAlerts } from '@/lib/inventory/stock-service'
import { useInventoryStore } from '@/stores/inventory-store'

const REFRESH_INTERVAL_MS = 60_000 // Refresh alerts every 60s

/**
 * Polls stock alert counts and updates the inventory store.
 * Used by dashboard and sidebar badge.
 */
export function useStockAlerts(expiryAlertDays = 90) {
  const setAlerts = useInventoryStore((s) => s.setAlerts)

  const refresh = useCallback(async () => {
    try {
      const alerts = await getStockAlerts(expiryAlertDays)
      setAlerts(alerts)
    } catch {
      // Non-critical
    }
  }, [expiryAlertDays, setAlerts])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [refresh])
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/pharmacy-lite/src/lib/inventory/expiry-watchdog.ts apps/pharmacy-lite/src/hooks/useExpiryWatchdog.ts apps/pharmacy-lite/src/hooks/useStockAlerts.ts
git commit -m "feat(pharmacy-lite): expiry watchdog (auto-quarantine) and stock alerts polling hook"
```

---

## Phase 3: Goods Receiving (Tasks 7-9)

### Task 7: Goods Receipt Service

**Files:**
- Create: `apps/pharmacy-lite/src/lib/inventory/goods-receipt-service.ts`

- [ ] **Step 1: Create goods receipt service**

```ts
// apps/pharmacy-lite/src/lib/inventory/goods-receipt-service.ts
import { db } from '@/lib/db'
import type { GoodsReceipt, GoodsReceiptItem, StockBatch, StockMovement } from './types'

/**
 * Process a goods receipt: creates GoodsReceipt + StockBatches + StockMovements.
 * This is the single entry point for receiving stock into the pharmacy.
 */
export async function processGoodsReceipt(params: {
  items: GoodsReceiptItem[]
  supplierId?: string
  purchaseOrderId?: string
  receivedBy: string
  locationId: string
  notes?: string
}): Promise<GoodsReceipt> {
  const { items, supplierId, purchaseOrderId, receivedBy, locationId, notes } = params

  const now = new Date().toISOString()
  const receiptId = crypto.randomUUID()
  const totalCost = items.reduce((sum, item) => sum + item.costPrice * item.quantity, 0)

  const receipt: GoodsReceipt = {
    id: receiptId,
    supplierId,
    purchaseOrderId,
    receivedBy,
    items,
    totalCost,
    notes,
    receivedAt: now,
    hlcTimestamp: now,
  }

  await db.transaction('rw', [db.goodsReceipts, db.stockBatches, db.stockMovements, db.syncQueue], async () => {
    // Save the receipt document
    await db.goodsReceipts.put(receipt)

    // Create a StockBatch and StockMovement for each line item
    for (const item of items) {
      const batchId = crypto.randomUUID()
      const movementId = crypto.randomUUID()

      const batch: StockBatch = {
        id: batchId,
        catalogItemId: item.catalogItemId,
        batchNumber: item.batchNumber,
        lotNumber: item.lotNumber,
        expiryDate: item.expiryDate,
        quantityOnHand: item.quantity,
        costPrice: item.costPrice,
        sellingPrice: item.sellingPrice,
        supplierId,
        goodsReceiptId: receiptId,
        receivedAt: now,
        status: 'active',
        locationId,
        hlcTimestamp: now,
      }

      const movement: StockMovement = {
        id: movementId,
        stockBatchId: batchId,
        catalogItemId: item.catalogItemId,
        type: 'received',
        quantity: item.quantity,
        referenceId: receiptId,
        referenceType: 'goods_receipt',
        performedBy: receivedBy,
        timestamp: now,
        hlcTimestamp: now,
      }

      await db.stockBatches.put(batch)
      await db.stockMovements.put(movement)

      // Enqueue movement for sync
      await db.syncQueue.put({
        id: crypto.randomUUID(),
        resourceType: 'StockMovement',
        resourceId: movementId,
        action: 'create',
        payload: JSON.stringify(movement),
        status: 'pending',
        hlcTimestamp: now,
        createdAt: now,
        retryCount: 0,
      })
    }

    // Enqueue receipt for sync
    await db.syncQueue.put({
      id: crypto.randomUUID(),
      resourceType: 'GoodsReceipt',
      resourceId: receiptId,
      action: 'create',
      payload: JSON.stringify(receipt),
      status: 'pending',
      hlcTimestamp: now,
      createdAt: now,
      retryCount: 0,
    })
  })

  return receipt
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/pharmacy-lite/src/lib/inventory/goods-receipt-service.ts
git commit -m "feat(pharmacy-lite): goods receipt service — creates batches + movements in single transaction"
```

---

### Task 8: Receive Stock Page (UI)

**Files:**
- Create: `apps/pharmacy-lite/src/components/pharmacy/inventory/CatalogSearchInput.tsx`
- Create: `apps/pharmacy-lite/src/components/pharmacy/inventory/ReceiveStockItemRow.tsx`
- Create: `apps/pharmacy-lite/src/components/pharmacy/inventory/ReceiveStockForm.tsx`
- Create: `apps/pharmacy-lite/src/components/pharmacy/inventory/ReceiveStockPage.tsx`
- Create: `apps/pharmacy-lite/src/app/[locale]/inventory/receive/page.tsx`

- [ ] **Step 1: Create CatalogSearchInput**

```tsx
// apps/pharmacy-lite/src/components/pharmacy/inventory/CatalogSearchInput.tsx
'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { searchCatalog } from '@/lib/inventory/catalog-sync'
import type { CatalogItem } from '@/lib/inventory/types'

interface CatalogSearchInputProps {
  onSelect: (item: CatalogItem) => void
  placeholder?: string
}

export function CatalogSearchInput({ onSelect, placeholder }: CatalogSearchInputProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CatalogItem[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([])
      setIsOpen(false)
      return
    }
    const items = await searchCatalog(q)
    setResults(items)
    setIsOpen(items.length > 0)
  }, [])

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => handleSearch(query), 200)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [query, handleSearch])

  const handleSelect = (item: CatalogItem) => {
    onSelect(item)
    setQuery('')
    setResults([])
    setIsOpen(false)
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder ?? 'Search by name or scan barcode...'}
        className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"
        data-testid="catalog-search-input"
      />
      {isOpen && (
        <ul className="absolute z-10 mt-1 w-full divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white shadow-md overflow-hidden max-h-60 overflow-y-auto">
          {results.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-neutral-50 text-sm"
              onClick={() => handleSelect(item)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSelect(item) }}
              tabIndex={0}
            >
              <div>
                <span className="font-medium text-neutral-900">{item.name}</span>
                <span className="text-neutral-500 ms-2">{item.strength} {item.form}</span>
              </div>
              {item.barcode && (
                <span className="text-xs text-neutral-400 font-mono">{item.barcode}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create ReceiveStockItemRow**

```tsx
// apps/pharmacy-lite/src/components/pharmacy/inventory/ReceiveStockItemRow.tsx
'use client'

import { Button } from '@/components/ui/Button'
import type { CatalogItem } from '@/lib/inventory/types'

export interface ReceiveLineItem {
  catalogItem: CatalogItem
  batchNumber: string
  lotNumber: string
  expiryDate: string
  quantity: number
  costPrice: number
  sellingPrice: number
}

interface ReceiveStockItemRowProps {
  item: ReceiveLineItem
  index: number
  currencyMinorUnits: number
  onUpdate: (index: number, updates: Partial<ReceiveLineItem>) => void
  onRemove: (index: number) => void
}

export function ReceiveStockItemRow({ item, index, currencyMinorUnits, onUpdate, onRemove }: ReceiveStockItemRowProps) {
  const formatPrice = (minorUnits: number) => (minorUnits / Math.pow(10, currencyMinorUnits)).toFixed(currencyMinorUnits)
  const parsePrice = (display: string) => Math.round(parseFloat(display || '0') * Math.pow(10, currencyMinorUnits))

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4" data-testid={`receive-item-${index}`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-medium text-neutral-900">{item.catalogItem.name}</p>
          <p className="text-xs text-neutral-500">{item.catalogItem.strength} {item.catalogItem.form}</p>
        </div>
        <Button variant="ghost" type="button" onClick={() => onRemove(index)} aria-label="Remove item">
          &times;
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Batch No. *</label>
          <input
            type="text"
            value={item.batchNumber}
            onChange={(e) => onUpdate(index, { batchNumber: e.target.value })}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Expiry Date *</label>
          <input
            type="date"
            value={item.expiryDate}
            onChange={(e) => onUpdate(index, { expiryDate: e.target.value })}
            min={new Date().toISOString().split('T')[0]}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Quantity *</label>
          <input
            type="number"
            min={1}
            value={item.quantity || ''}
            onChange={(e) => onUpdate(index, { quantity: parseInt(e.target.value) || 0 })}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Cost Price *</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={item.costPrice ? formatPrice(item.costPrice) : ''}
            onChange={(e) => onUpdate(index, { costPrice: parsePrice(e.target.value) })}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Selling Price *</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={item.sellingPrice ? formatPrice(item.sellingPrice) : ''}
            onChange={(e) => onUpdate(index, { sellingPrice: parsePrice(e.target.value) })}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Lot No.</label>
          <input
            type="text"
            value={item.lotNumber}
            onChange={(e) => onUpdate(index, { lotNumber: e.target.value })}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500"
          />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create ReceiveStockForm**

```tsx
// apps/pharmacy-lite/src/components/pharmacy/inventory/ReceiveStockForm.tsx
'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/Button'
import { CatalogSearchInput } from './CatalogSearchInput'
import { ReceiveStockItemRow, type ReceiveLineItem } from './ReceiveStockItemRow'
import { processGoodsReceipt } from '@/lib/inventory/goods-receipt-service'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import type { CatalogItem } from '@/lib/inventory/types'

interface ReceiveStockFormProps {
  locationId: string
  currencyMinorUnits: number
  onComplete: () => void
}

export function ReceiveStockForm({ locationId, currencyMinorUnits, onComplete }: ReceiveStockFormProps) {
  const [items, setItems] = useState<ReceiveLineItem[]>([])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const session = useAuthSessionStore((s) => s.session)

  const handleAddItem = useCallback((catalogItem: CatalogItem) => {
    setItems((prev) => [
      ...prev,
      {
        catalogItem,
        batchNumber: '',
        lotNumber: '',
        expiryDate: '',
        quantity: 0,
        costPrice: 0,
        sellingPrice: catalogItem.defaultSellingPrice,
      },
    ])
  }, [])

  const handleUpdateItem = useCallback((index: number, updates: Partial<ReceiveLineItem>) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...updates } : item)))
  }, [])

  const handleRemoveItem = useCallback((index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const isValid = items.length > 0 && items.every(
    (item) => item.batchNumber.trim() && item.expiryDate && item.quantity > 0 && item.costPrice > 0 && item.sellingPrice > 0
  )

  const handleSubmit = async () => {
    if (!isValid || !session) return
    setSaving(true)
    setError(null)

    try {
      await processGoodsReceipt({
        items: items.map((item) => ({
          catalogItemId: item.catalogItem.id,
          batchNumber: item.batchNumber.trim(),
          lotNumber: item.lotNumber.trim() || undefined,
          expiryDate: item.expiryDate,
          quantity: item.quantity,
          costPrice: item.costPrice,
          sellingPrice: item.sellingPrice,
        })),
        receivedBy: session.practitionerId ?? session.userId,
        locationId,
        notes: notes.trim() || undefined,
      })
      onComplete()
    } catch {
      setError('Failed to process goods receipt. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4" data-testid="receive-stock-form">
      <CatalogSearchInput onSelect={handleAddItem} />

      {error && (
        <div role="alert" className="rounded-md bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-8 text-center">
          <p className="text-sm text-neutral-500">Search or scan a product above to start receiving stock.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item, index) => (
            <ReceiveStockItemRow
              key={`${item.catalogItem.id}-${index}`}
              item={item}
              index={index}
              currencyMinorUnits={currencyMinorUnits}
              onUpdate={handleUpdateItem}
              onRemove={handleRemoveItem}
            />
          ))}
        </div>
      )}

      {items.length > 0 && (
        <>
          <div>
            <label htmlFor="receipt-notes" className="mb-1 block text-xs font-medium text-neutral-600">Notes (optional)</label>
            <input
              id="receipt-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Delivery ref #1234"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500"
            />
          </div>
          <Button
            variant="primary"
            fullWidth
            type="button"
            disabled={!isValid || saving}
            onClick={handleSubmit}
            data-testid="confirm-receipt-btn"
          >
            {saving ? 'Processing...' : `Confirm Receipt (${items.length} item${items.length !== 1 ? 's' : ''})`}
          </Button>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Create ReceiveStockPage**

```tsx
// apps/pharmacy-lite/src/components/pharmacy/inventory/ReceiveStockPage.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ReceiveStockForm } from './ReceiveStockForm'

export function ReceiveStockPage() {
  const router = useRouter()
  const [showSuccess, setShowSuccess] = useState(false)

  // TODO: read from pharmacySettings when settings page wired
  const locationId = 'default'
  const currencyMinorUnits = 2

  if (showSuccess) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border-2 border-green-400 bg-green-50 p-6 text-center" data-testid="receipt-success">
          <p className="text-lg font-bold text-green-800">Stock Received Successfully</p>
          <p className="text-sm text-green-700 mt-1">Items have been added to your inventory.</p>
          <div className="mt-4 flex gap-3 justify-center">
            <button
              type="button"
              onClick={() => setShowSuccess(false)}
              className="text-sm font-semibold text-primary-700 hover:text-primary-800"
            >
              Receive More
            </button>
            <button
              type="button"
              onClick={() => router.push('/inventory')}
              className="text-sm font-semibold text-neutral-600 hover:text-neutral-800"
            >
              View Stock
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-neutral-900">Receive Stock</h1>
      <p className="text-sm text-neutral-500">Search or scan products to record incoming stock.</p>
      <ReceiveStockForm
        locationId={locationId}
        currencyMinorUnits={currencyMinorUnits}
        onComplete={() => setShowSuccess(true)}
      />
    </div>
  )
}
```

- [ ] **Step 5: Create route page**

```tsx
// apps/pharmacy-lite/src/app/[locale]/inventory/receive/page.tsx
'use client'

import { ReceiveStockPage } from '@/components/pharmacy/inventory/ReceiveStockPage'

export default function ReceiveStockRoute() {
  return <ReceiveStockPage />
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/pharmacy-lite/src/components/pharmacy/inventory/CatalogSearchInput.tsx apps/pharmacy-lite/src/components/pharmacy/inventory/ReceiveStockItemRow.tsx apps/pharmacy-lite/src/components/pharmacy/inventory/ReceiveStockForm.tsx apps/pharmacy-lite/src/components/pharmacy/inventory/ReceiveStockPage.tsx apps/pharmacy-lite/src/app/[locale]/inventory/receive/page.tsx
git commit -m "feat(pharmacy-lite): Receive Stock page — catalog search, line items, goods receipt creation"
```

---

## Phase 4: Stock Overview Page (Tasks 9-10)

### Task 9: Stock Table Component

**Files:**
- Create: `apps/pharmacy-lite/src/components/pharmacy/inventory/StockTable.tsx`

- [ ] **Step 1: Create StockTable**

```tsx
// apps/pharmacy-lite/src/components/pharmacy/inventory/StockTable.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { db } from '@/lib/db'
import type { StockBatch, CatalogItem } from '@/lib/inventory/types'

type FilterStatus = 'all' | 'active' | 'quarantined' | 'depleted'

interface StockRow {
  batch: StockBatch
  catalogItem: CatalogItem | undefined
}

interface StockTableProps {
  filterStatus?: FilterStatus
  filterLowStock?: boolean
  filterNearExpiry?: boolean
  expiryAlertDays?: number
}

export function StockTable({
  filterStatus = 'all',
  filterLowStock = false,
  filterNearExpiry = false,
  expiryAlertDays = 90,
}: StockTableProps) {
  const [rows, setRows] = useState<StockRow[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      let query = filterStatus === 'all'
        ? db.stockBatches.toCollection()
        : db.stockBatches.where('status').equals(filterStatus)

      let batches = await query.toArray()

      // Apply near-expiry filter
      if (filterNearExpiry) {
        const alertDate = new Date(Date.now() + expiryAlertDays * 86400000).toISOString().split('T')[0]!
        batches = batches.filter((b) => b.status === 'active' && b.expiryDate <= alertDate)
      }

      // Fetch catalog items for display names
      const catalogIds = [...new Set(batches.map((b) => b.catalogItemId))]
      const catalogItems = catalogIds.length > 0
        ? await db.catalogItems.where('id').anyOf(catalogIds).toArray()
        : []
      const catalogMap = new Map(catalogItems.map((c) => [c.id, c]))

      let stockRows: StockRow[] = batches.map((batch) => ({
        batch,
        catalogItem: catalogMap.get(batch.catalogItemId),
      }))

      // Apply low-stock filter
      if (filterLowStock) {
        stockRows = stockRows.filter((row) => {
          const reorderPoint = row.catalogItem?.reorderPoint ?? 0
          return row.batch.quantityOnHand <= reorderPoint && row.batch.status === 'active'
        })
      }

      // Apply search
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        stockRows = stockRows.filter((row) =>
          row.catalogItem?.name.toLowerCase().includes(q) ||
          row.batch.batchNumber.toLowerCase().includes(q)
        )
      }

      // Sort: active first, then by expiry ascending
      stockRows.sort((a, b) => {
        if (a.batch.status !== b.batch.status) {
          const order = { active: 0, quarantined: 1, depleted: 2 }
          return (order[a.batch.status] ?? 3) - (order[b.batch.status] ?? 3)
        }
        return a.batch.expiryDate.localeCompare(b.batch.expiryDate)
      })

      setRows(stockRows)
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [filterStatus, filterLowStock, filterNearExpiry, expiryAlertDays, search])

  useEffect(() => { loadData() }, [loadData])

  const isNearExpiry = (expiryDate: string) => {
    const alertDate = new Date(Date.now() + expiryAlertDays * 86400000).toISOString().split('T')[0]!
    return expiryDate <= alertDate
  }

  if (loading) {
    return <div className="py-8 text-center text-sm text-neutral-400">Loading stock data...</div>
  }

  return (
    <div className="space-y-3" data-testid="stock-table">
      {/* Search bar */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by product name or batch..."
        className="w-full rounded-lg border border-neutral-300 px-4 py-2 text-sm placeholder:text-neutral-400 focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"
        data-testid="stock-search"
      />

      {rows.length === 0 ? (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 py-8 text-center text-sm text-neutral-500">
          No stock items found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200">
          <table className="min-w-full divide-y divide-neutral-200">
            <thead className="bg-neutral-50">
              <tr>
                <th scope="col" className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-neutral-500">Product</th>
                <th scope="col" className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-neutral-500">Batch</th>
                <th scope="col" className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-neutral-500">Qty</th>
                <th scope="col" className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-neutral-500">Expiry</th>
                <th scope="col" className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-neutral-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.map((row) => (
                <tr key={row.batch.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 text-sm text-neutral-900">
                    {row.catalogItem?.name ?? 'Unknown'}
                    {row.catalogItem?.controlledSchedule && (
                      <span className="ms-1 text-xs font-bold text-red-700">C{row.catalogItem.controlledSchedule}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-neutral-600 font-mono">{row.batch.batchNumber}</td>
                  <td className="px-4 py-3 text-sm font-semibold tabular-nums text-neutral-900">{row.batch.quantityOnHand}</td>
                  <td className={`px-4 py-3 text-sm tabular-nums ${
                    row.batch.status === 'active' && isNearExpiry(row.batch.expiryDate)
                      ? 'font-semibold text-amber-700'
                      : 'text-neutral-600'
                  }`}>
                    {row.batch.expiryDate}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      row.batch.status === 'active' ? 'bg-green-100 text-green-700' :
                      row.batch.status === 'quarantined' ? 'bg-red-100 text-red-700' :
                      'bg-neutral-100 text-neutral-500'
                    }`}>
                      {row.batch.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-neutral-400">{rows.length} batch{rows.length !== 1 ? 'es' : ''}</p>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/pharmacy-lite/src/components/pharmacy/inventory/StockTable.tsx
git commit -m "feat(pharmacy-lite): StockTable — searchable, filterable stock table with expiry highlighting"
```

---

### Task 10: Stock Overview Page + Alert Panel

**Files:**
- Create: `apps/pharmacy-lite/src/components/pharmacy/inventory/StockAlertPanel.tsx`
- Create: `apps/pharmacy-lite/src/components/pharmacy/inventory/StockOverviewPage.tsx`
- Create: `apps/pharmacy-lite/src/app/[locale]/inventory/page.tsx`

- [ ] **Step 1: Create StockAlertPanel**

```tsx
// apps/pharmacy-lite/src/components/pharmacy/inventory/StockAlertPanel.tsx
'use client'

import { useInventoryStore } from '@/stores/inventory-store'

interface StockAlertPanelProps {
  onFilterLowStock: () => void
  onFilterNearExpiry: () => void
  onFilterQuarantined: () => void
}

export function StockAlertPanel({ onFilterLowStock, onFilterNearExpiry, onFilterQuarantined }: StockAlertPanelProps) {
  const alerts = useInventoryStore((s) => s.alerts)

  const hasAlerts = alerts.lowStockCount > 0 || alerts.nearExpiryCount > 0 || alerts.quarantinedCount > 0

  if (!hasAlerts) return null

  return (
    <div className="grid grid-cols-3 gap-3" data-testid="stock-alert-panel">
      {alerts.lowStockCount > 0 && (
        <button
          type="button"
          onClick={onFilterLowStock}
          className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-start transition-colors hover:bg-amber-100"
        >
          <p className="text-lg font-bold tabular-nums text-amber-700">{alerts.lowStockCount}</p>
          <p className="text-xs text-amber-600">Low Stock</p>
        </button>
      )}
      {alerts.nearExpiryCount > 0 && (
        <button
          type="button"
          onClick={onFilterNearExpiry}
          className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-start transition-colors hover:bg-orange-100"
        >
          <p className="text-lg font-bold tabular-nums text-orange-700">{alerts.nearExpiryCount}</p>
          <p className="text-xs text-orange-600">Near Expiry</p>
        </button>
      )}
      {alerts.quarantinedCount > 0 && (
        <button
          type="button"
          onClick={onFilterQuarantined}
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-start transition-colors hover:bg-red-100"
        >
          <p className="text-lg font-bold tabular-nums text-red-700">{alerts.quarantinedCount}</p>
          <p className="text-xs text-red-600">Quarantined</p>
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create StockOverviewPage**

```tsx
// apps/pharmacy-lite/src/components/pharmacy/inventory/StockOverviewPage.tsx
'use client'

import { useState } from 'react'
import { StockTable } from './StockTable'
import { StockAlertPanel } from './StockAlertPanel'
import { useStockAlerts } from '@/hooks/useStockAlerts'
import { Button } from '@/components/ui/Button'
import Link from 'next/link'

type ActiveFilter = 'all' | 'low-stock' | 'near-expiry' | 'quarantined'

export function StockOverviewPage() {
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all')
  useStockAlerts(90)

  return (
    <div className="space-y-4" data-testid="stock-overview-page">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-neutral-900">Stock Overview</h1>
        <Link href="/inventory/receive">
          <Button variant="primary" type="button">+ Receive Stock</Button>
        </Link>
      </div>

      {/* Alert panel — clickable filters */}
      <StockAlertPanel
        onFilterLowStock={() => setActiveFilter(activeFilter === 'low-stock' ? 'all' : 'low-stock')}
        onFilterNearExpiry={() => setActiveFilter(activeFilter === 'near-expiry' ? 'all' : 'near-expiry')}
        onFilterQuarantined={() => setActiveFilter(activeFilter === 'quarantined' ? 'all' : 'quarantined')}
      />

      {/* Active filter indicator */}
      {activeFilter !== 'all' && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-neutral-500">Filtered:</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">
            {activeFilter.replace('-', ' ')}
            <button type="button" onClick={() => setActiveFilter('all')} className="text-neutral-400 hover:text-neutral-600">&times;</button>
          </span>
        </div>
      )}

      {/* Stock table */}
      <StockTable
        filterStatus={activeFilter === 'quarantined' ? 'quarantined' : 'all'}
        filterLowStock={activeFilter === 'low-stock'}
        filterNearExpiry={activeFilter === 'near-expiry'}
      />
    </div>
  )
}
```

- [ ] **Step 3: Create route page**

```tsx
// apps/pharmacy-lite/src/app/[locale]/inventory/page.tsx
'use client'

import { StockOverviewPage } from '@/components/pharmacy/inventory/StockOverviewPage'

export default function InventoryRoute() {
  return <StockOverviewPage />
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/pharmacy-lite/src/components/pharmacy/inventory/StockAlertPanel.tsx apps/pharmacy-lite/src/components/pharmacy/inventory/StockOverviewPage.tsx apps/pharmacy-lite/src/app/[locale]/inventory/page.tsx
git commit -m "feat(pharmacy-lite): Stock Overview page with alert panel, filters, and searchable table"
```

---

## Phase 5: Catalog Browse + Dispensing Integration (Tasks 11-13)

### Task 11: Catalog Browse Page

**Files:**
- Create: `apps/pharmacy-lite/src/components/pharmacy/inventory/CatalogBrowsePage.tsx`
- Create: `apps/pharmacy-lite/src/app/[locale]/inventory/catalog/page.tsx`

- [ ] **Step 1: Create CatalogBrowsePage**

```tsx
// apps/pharmacy-lite/src/components/pharmacy/inventory/CatalogBrowsePage.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { db } from '@/lib/db'
import { useCatalogSync } from '@/hooks/useCatalogSync'
import { useInventoryStore } from '@/stores/inventory-store'
import type { CatalogItem } from '@/lib/inventory/types'
import { getTotalStockOnHand } from '@/lib/inventory/fefo'

interface CatalogRow {
  item: CatalogItem
  stockOnHand: number
}

export function CatalogBrowsePage() {
  useCatalogSync()
  const isSyncing = useInventoryStore((s) => s.isSyncingCatalog)
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<CatalogRow[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      let items: CatalogItem[]
      if (search.trim().length >= 2) {
        const q = search.trim().toLowerCase()
        items = await db.catalogItems
          .filter((item) => item.isActive && (
            item.name.toLowerCase().includes(q) ||
            item.nameLocal?.toLowerCase().includes(q) ||
            item.barcode?.includes(q) ||
            item.category.toLowerCase().includes(q)
          ))
          .limit(50)
          .toArray()
      } else {
        items = await db.catalogItems.where('isActive').equals(1).limit(50).toArray()
      }

      const catalogRows: CatalogRow[] = await Promise.all(
        items.map(async (item) => ({
          item,
          stockOnHand: await getTotalStockOnHand(item.id),
        }))
      )

      setRows(catalogRows)
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => { loadData() }, [loadData])

  return (
    <div className="space-y-4" data-testid="catalog-browse-page">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-neutral-900">Medication Catalog</h1>
        {isSyncing && (
          <span className="text-xs text-primary-600 animate-pulse motion-reduce:animate-none">Syncing...</span>
        )}
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name, barcode, or category..."
        className="w-full rounded-lg border border-neutral-300 px-4 py-2 text-sm placeholder:text-neutral-400 focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"
      />

      {loading ? (
        <div className="py-8 text-center text-sm text-neutral-400">Loading catalog...</div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 py-8 text-center">
          <p className="text-sm text-neutral-500">No catalog items found.</p>
          <p className="text-xs text-neutral-400 mt-1">Catalog syncs from Hub when online.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200">
          <table className="min-w-full divide-y divide-neutral-200">
            <thead className="bg-neutral-50">
              <tr>
                <th scope="col" className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-neutral-500">Name</th>
                <th scope="col" className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-neutral-500">Form</th>
                <th scope="col" className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-neutral-500">Strength</th>
                <th scope="col" className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-neutral-500">Category</th>
                <th scope="col" className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-neutral-500">Stock</th>
                <th scope="col" className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-neutral-500">Reorder</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.map((row) => (
                <tr key={row.item.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 text-sm text-neutral-900">
                    {row.item.name}
                    {row.item.controlledSchedule && (
                      <span className="ms-1 text-xs font-bold text-red-700">C{row.item.controlledSchedule}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-neutral-600 capitalize">{row.item.form}</td>
                  <td className="px-4 py-3 text-sm text-neutral-600">{row.item.strength}</td>
                  <td className="px-4 py-3 text-sm text-neutral-600">{row.item.category}</td>
                  <td className={`px-4 py-3 text-sm font-semibold tabular-nums ${
                    row.stockOnHand <= row.item.reorderPoint ? 'text-amber-700' : 'text-neutral-900'
                  }`}>
                    {row.stockOnHand}
                  </td>
                  <td className="px-4 py-3 text-sm text-neutral-400 tabular-nums">{row.item.reorderPoint}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create route page**

```tsx
// apps/pharmacy-lite/src/app/[locale]/inventory/catalog/page.tsx
'use client'

import { CatalogBrowsePage } from '@/components/pharmacy/inventory/CatalogBrowsePage'

export default function CatalogRoute() {
  return <CatalogBrowsePage />
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/pharmacy-lite/src/components/pharmacy/inventory/CatalogBrowsePage.tsx apps/pharmacy-lite/src/app/[locale]/inventory/catalog/page.tsx
git commit -m "feat(pharmacy-lite): Catalog Browse page — search formulary, stock levels, reorder indicators"
```

---

### Task 12: Dispensing Integration — FEFO Batch Selection + Stock Deduction

**Files:**
- Modify: `apps/pharmacy-lite/src/stores/fulfillment-store.ts`
- Create: `apps/pharmacy-lite/src/components/pharmacy/inventory/FefoWarningBanner.tsx`

- [ ] **Step 1: Create FefoWarningBanner**

```tsx
// apps/pharmacy-lite/src/components/pharmacy/inventory/FefoWarningBanner.tsx
'use client'

interface FefoWarningBannerProps {
  medicationName: string
  suggestedBatch: string
  suggestedExpiry: string
}

/**
 * Shown during dispensing when FEFO enforcement is active and
 * the system has a batch recommendation.
 */
export function FefoWarningBanner({ medicationName, suggestedBatch, suggestedExpiry }: FefoWarningBannerProps) {
  return (
    <div
      role="status"
      className="rounded-lg border border-primary-200 bg-primary-50/50 p-3"
      data-testid="fefo-banner"
    >
      <p className="text-xs font-medium text-primary-800">
        FEFO: Dispensing <span className="font-semibold">{medicationName}</span> from batch{' '}
        <span className="font-mono font-semibold">{suggestedBatch}</span>{' '}
        (expires {suggestedExpiry})
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Add stock deduction to fulfillment store**

In `apps/pharmacy-lite/src/stores/fulfillment-store.ts`, add a new action that integrates with the stock service. Add this import and method:

Add at top of file:
```ts
import { selectFefoBatch } from '@/lib/inventory/fefo'
import { deductStock } from '@/lib/inventory/stock-service'
```

Add a new field to `FulfillmentItem`:
```ts
// Add to the FulfillmentItem interface:
fefoBatchId?: string
fefoBatchNumber?: string
fefoBatchExpiry?: string
```

Add a new action `assignFefoBatches` to the store:
```ts
assignFefoBatches: async () => {
  const state = get()
  const updatedItems = await Promise.all(
    state.items.map(async (item) => {
      if (!item.selected || item.fefoBatchId) return item
      // Try to find FEFO batch by matching medication code to catalog
      const catalogItem = await db.catalogItems
        .filter((c) => c.name === item.prescription.medN || c.barcode === item.prescription.med)
        .first()
      if (!catalogItem) return item
      const batch = await selectFefoBatch(catalogItem.id, item.prescription.dos.qty)
      if (!batch) return item
      return {
        ...item,
        fefoBatchId: batch.id,
        fefoBatchNumber: batch.batchNumber,
        fefoBatchExpiry: batch.expiryDate,
      }
    })
  )
  set({ items: updatedItems })
},
```

Add a new action `deductStockOnDispense` that runs after confirmDispense succeeds:
```ts
deductStockOnDispense: async (practitionerId: string) => {
  const state = get()
  for (const item of state.items) {
    if (!item.selected || !item.fefoBatchId) continue
    try {
      const catalogItem = await db.catalogItems
        .filter((c) => c.name === item.prescription.medN || c.barcode === item.prescription.med)
        .first()
      if (!catalogItem) continue
      await deductStock({
        stockBatchId: item.fefoBatchId,
        catalogItemId: catalogItem.id,
        quantity: item.prescription.dos.qty,
        type: 'dispensed',
        referenceId: item.prescription.id,
        referenceType: 'dispense',
        performedBy: practitionerId,
      })
    } catch {
      // Stock deduction failure should not block dispensing
      // Movement will be reconciled on next stock count
    }
  }
},
```

- [ ] **Step 3: Commit**

```bash
git add apps/pharmacy-lite/src/components/pharmacy/inventory/FefoWarningBanner.tsx apps/pharmacy-lite/src/stores/fulfillment-store.ts
git commit -m "feat(pharmacy-lite): dispensing integration — FEFO batch assignment + stock deduction on confirm"
```

---

### Task 13: Dashboard Inventory Alert Widget

**Files:**
- Create: `apps/pharmacy-lite/src/components/pharmacy/inventory/InventoryAlertCard.tsx`
- Modify: `apps/pharmacy-lite/src/components/pharmacy/PharmacyDashboard.tsx`

- [ ] **Step 1: Create InventoryAlertCard**

```tsx
// apps/pharmacy-lite/src/components/pharmacy/inventory/InventoryAlertCard.tsx
'use client'

import Link from 'next/link'
import { useInventoryStore } from '@/stores/inventory-store'
import { useStockAlerts } from '@/hooks/useStockAlerts'

export function InventoryAlertCard() {
  useStockAlerts(90)
  const alerts = useInventoryStore((s) => s.alerts)
  const total = alerts.lowStockCount + alerts.nearExpiryCount + alerts.quarantinedCount

  if (total === 0) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50/50 p-4" data-testid="inventory-alert-card">
        <p className="text-sm font-medium text-green-800">Inventory healthy — no alerts</p>
      </div>
    )
  }

  return (
    <Link href="/inventory" data-testid="inventory-alert-card">
      <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4 transition-colors hover:bg-amber-50">
        <h3 className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-2">Inventory Alerts</h3>
        <div className="grid grid-cols-3 gap-3 text-center">
          {alerts.lowStockCount > 0 && (
            <div>
              <p className="text-lg font-bold tabular-nums text-amber-700">{alerts.lowStockCount}</p>
              <p className="text-[10px] text-amber-600">Low Stock</p>
            </div>
          )}
          {alerts.nearExpiryCount > 0 && (
            <div>
              <p className="text-lg font-bold tabular-nums text-orange-700">{alerts.nearExpiryCount}</p>
              <p className="text-[10px] text-orange-600">Near Expiry</p>
            </div>
          )}
          {alerts.quarantinedCount > 0 && (
            <div>
              <p className="text-lg font-bold tabular-nums text-red-700">{alerts.quarantinedCount}</p>
              <p className="text-[10px] text-red-600">Quarantined</p>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}
```

- [ ] **Step 2: Add to PharmacyDashboard**

In `apps/pharmacy-lite/src/components/pharmacy/PharmacyDashboard.tsx`:

Add import:
```tsx
import { InventoryAlertCard } from './inventory/InventoryAlertCard'
```

Add after the `<RecentDispensingList>` component (at the end of the dashboard):
```tsx
{/* Inventory alerts */}
<InventoryAlertCard />
```

- [ ] **Step 3: Commit**

```bash
git add apps/pharmacy-lite/src/components/pharmacy/inventory/InventoryAlertCard.tsx apps/pharmacy-lite/src/components/pharmacy/PharmacyDashboard.tsx
git commit -m "feat(pharmacy-lite): inventory alert card on dashboard — low stock, near-expiry, quarantined"
```

---

## Phase 6: Sidebar Navigation + Hooks Wiring (Tasks 14-15)

### Task 14: Add Inventory Nav Items to Sidebar

**Files:**
- Modify: `apps/pharmacy-lite/src/components/AppShellWrapper.tsx`

- [ ] **Step 1: Add inventory and catalog nav items**

In `AppShellWrapper.tsx`, add these icons to the `icons` object:

```tsx
inventory: (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
),
receive: (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
    <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </svg>
),
catalog: (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
),
```

Add new nav items to the `navItems` array, inserting an **inventory group** between the primary and clinical groups:

```tsx
// Inventory group (new)
{ label: t('stockOverview'), href: '/inventory', icon: icons.inventory, active: pathname === '/inventory', group: 'inventory' },
{ label: t('receiveStock'), href: '/inventory/receive', icon: icons.receive, active: pathname === '/inventory/receive', group: 'inventory' },
{ label: t('catalog'), href: '/inventory/catalog', icon: icons.catalog, active: pathname === '/inventory/catalog', group: 'inventory' },
```

Also add `/inventory`, `/inventory/receive`, `/inventory/catalog` to the `wideRoutes` array (they have tables).

- [ ] **Step 2: Add i18n keys**

Add to `apps/pharmacy-lite/messages/en.json` under the `"sidebar"` namespace:
```json
"stockOverview": "Stock Overview",
"receiveStock": "Receive Stock",
"catalog": "Catalog"
```

Add corresponding Arabic keys to `ar.json`:
```json
"stockOverview": "نظرة عامة على المخزون",
"receiveStock": "استلام المخزون",
"catalog": "الكتالوج"
```

Add Dari keys to `prs.json`:
```json
"stockOverview": "نمای کلی موجودی",
"receiveStock": "دریافت موجودی",
"catalog": "کتالوگ"
```

- [ ] **Step 3: Commit**

```bash
git add apps/pharmacy-lite/src/components/AppShellWrapper.tsx apps/pharmacy-lite/messages/en.json apps/pharmacy-lite/messages/ar.json apps/pharmacy-lite/messages/prs.json
git commit -m "feat(pharmacy-lite): add inventory nav items to sidebar with i18n (en/ar/prs)"
```

---

### Task 15: Wire Hooks into AppShellWrapper

**Files:**
- Modify: `apps/pharmacy-lite/src/components/AppShellWrapper.tsx`

- [ ] **Step 1: Add catalog sync + expiry watchdog hooks**

In `AppShellWrapper.tsx`, add imports:
```tsx
import { useCatalogSync } from '@/hooks/useCatalogSync'
import { useExpiryWatchdog } from '@/hooks/useExpiryWatchdog'
```

Call these hooks inside the component (after the existing hooks, before the `handleSignOut` callback):
```tsx
useCatalogSync()
useExpiryWatchdog()
```

These run for all authenticated users:
- Catalog sync: fetches Hub formulary on mount when online (non-blocking)
- Expiry watchdog: quarantines expired batches on mount + every hour

- [ ] **Step 2: Commit**

```bash
git add apps/pharmacy-lite/src/components/AppShellWrapper.tsx
git commit -m "feat(pharmacy-lite): wire catalog sync + expiry watchdog hooks into AppShellWrapper"
```

---

## Summary

| Phase | Tasks | What it delivers |
|-------|-------|-----------------|
| **1. Data Layer** | 1-3 | Types, Dexie v6 schema, inventory Zustand store |
| **2. Services** | 4-6 | Catalog sync, stock service (FEFO + deduct + add), expiry watchdog, alerts |
| **3. Receiving** | 7-8 | Goods receipt service, Receive Stock page (search + form + confirm) |
| **4. Stock View** | 9-10 | Stock table, alert panel, Stock Overview page |
| **5. Integration** | 11-13 | Catalog browse page, dispensing FEFO + stock deduction, dashboard widget |
| **6. Navigation** | 14-15 | Sidebar nav items, i18n, hook wiring |

**Total: 15 tasks, 6 phases.**

After completion, pharmacy-lite will:
- Track what stock is on hand (by batch, expiry, cost, selling price)
- Auto-deduct stock on dispense using FEFO ordering
- Auto-quarantine expired batches (patient safety)
- Alert on low stock and near-expiry items
- Allow goods receiving (barcode scan + manual search)
- Show a browsable medication catalog synced from Hub
- Display inventory health on the dashboard
