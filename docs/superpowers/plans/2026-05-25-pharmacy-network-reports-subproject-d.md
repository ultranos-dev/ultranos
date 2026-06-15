# Pharmacy Network & Reports Sub-Project D: Transfers + Reporting

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add inter-pharmacy stock transfers (request/approve/ship/receive via Hub), cross-location stock visibility, and a reports page with consumption trends, margins, wastage, and controlled substance discrepancy history.

**Architecture:** Dexie v10 adds stockTransfers table. Transfer lifecycle flows through Hub API — sender deducts on ship, receiver adds on receive, both create StockMovements. Reports page queries local data (StockMovements, Invoices, StockBatches) to compute metrics. Network stock visibility queries Hub for sibling pharmacy stock levels. All gated behind `enableTransfers` setting.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS, Dexie (IndexedDB), Zustand, next-intl.

**Spec:** `docs/superpowers/specs/2026-05-25-pharmacy-inventory-pos-design.md` (Network & Reports sections)

**Depends on:** Sub-projects A (stock service, FEFO), B (invoice service), C (stock count, controlled balance)

---

## File Structure

### New Files

```
apps/pharmacy-lite/src/
├── lib/
│   ├── transfers/
│   │   ├── types.ts                     # StockTransfer, TransferItem types
│   │   ├── transfer-service.ts          # Create, approve, ship, receive, cancel transfers
│   │   └── network-stock-query.ts       # Query Hub for sibling pharmacy stock levels
│   ├── reports/
│   │   ├── consumption-report.ts        # Consumption trends (dispensed per day/week/month)
│   │   ├── financial-report.ts          # Revenue, margins, daily sales summary
│   │   ├── wastage-report.ts            # Expired/quarantined/disposed stock metrics
│   │   └── controlled-discrepancy.ts    # Controlled substance count variances history
├── components/pharmacy/
│   ├── transfers/
│   │   ├── TransfersPage.tsx            # /inventory/transfers — transfer list + actions
│   │   ├── TransferRequestForm.tsx      # Create transfer request (search network stock)
│   │   ├── NetworkStockView.tsx         # Cross-pharmacy stock visibility table
│   │   └── TransferCard.tsx             # Single transfer item display
│   ├── reports/
│   │   ├── ReportsPage.tsx              # /reports — dashboard of report cards
│   │   ├── ConsumptionChart.tsx         # Top dispensed items (bar/list)
│   │   ├── FinancialSummaryCard.tsx     # Revenue, margins, outstanding
│   │   ├── WastageCard.tsx              # Expired/disposed metrics
│   │   └── ControlledDiscrepancyCard.tsx # Count variances for controlled items
├── app/[locale]/
│   ├── inventory/transfers/page.tsx     # Transfers route
│   └── reports/page.tsx                 # Reports route
```

### Modified Files

```
apps/pharmacy-lite/src/
├── lib/db.ts                            # Dexie v10: stockTransfers table
├── components/AppShellWrapper.tsx       # Add transfers + reports nav items
```

---

## Phase 1: Types + Schema (Tasks 1-2)

### Task 1: Transfer Types

**Files:**
- Create: `apps/pharmacy-lite/src/lib/transfers/types.ts`

- [ ] **Step 1: Create transfer types**

```ts
// apps/pharmacy-lite/src/lib/transfers/types.ts

export type TransferStatus = 'requested' | 'approved' | 'shipped' | 'received' | 'cancelled'

export interface TransferItem {
  catalogItemId: string
  catalogItemName: string
  stockBatchId: string
  batchNumber: string
  quantity: number
}

export interface StockTransfer {
  id: string
  fromLocationId: string
  fromLocationName: string
  toLocationId: string
  toLocationName: string
  status: TransferStatus
  items: TransferItem[]
  requestedBy: string
  requestedAt: string
  approvedBy?: string
  approvedAt?: string
  shippedAt?: string
  receivedAt?: string
  receivedBy?: string
  cancelledReason?: string
  hlcTimestamp: string
}

export interface NetworkStockItem {
  catalogItemId: string
  catalogItemName: string
  locationId: string
  locationName: string
  totalOnHand: number
  nearestExpiry?: string
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/pharmacy-lite/src/lib/transfers/types.ts
git commit -m "feat(pharmacy-lite): transfer types — StockTransfer, TransferItem, NetworkStockItem"
```

---

### Task 2: Dexie v10 Schema

**Files:**
- Modify: `apps/pharmacy-lite/src/lib/db.ts`

- [ ] **Step 1: Add transfer table to DB**

Add import:
```ts
import type { StockTransfer } from './transfers/types'
```

Add table declaration:
```ts
stockTransfers!: EntityTable<StockTransfer, 'id'>
```

Add v10 migration:
```ts
// v10: Inter-pharmacy stock transfers
this.version(10).stores({
  stockTransfers: 'id, fromLocationId, toLocationId, status, requestedAt',
})
```

- [ ] **Step 2: Commit**

```bash
git add apps/pharmacy-lite/src/lib/db.ts
git commit -m "feat(pharmacy-lite): Dexie v10 — stockTransfers table"
```

---

## Phase 2: Transfer Service (Tasks 3-4)

### Task 3: Transfer Service

**Files:**
- Create: `apps/pharmacy-lite/src/lib/transfers/transfer-service.ts`

- [ ] **Step 1: Create transfer lifecycle service**

```ts
// apps/pharmacy-lite/src/lib/transfers/transfer-service.ts
import { db } from '@/lib/db'
import { deductStock, addStock } from '@/lib/inventory/stock-service'
import type { StockTransfer, TransferItem, TransferStatus } from './types'

/**
 * Create a transfer request (outgoing — this pharmacy is sending).
 */
export async function createTransferRequest(params: {
  fromLocationId: string
  fromLocationName: string
  toLocationId: string
  toLocationName: string
  items: TransferItem[]
  requestedBy: string
}): Promise<StockTransfer> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  const transfer: StockTransfer = {
    id,
    fromLocationId: params.fromLocationId,
    fromLocationName: params.fromLocationName,
    toLocationId: params.toLocationId,
    toLocationName: params.toLocationName,
    status: 'requested',
    items: params.items,
    requestedBy: params.requestedBy,
    requestedAt: now,
    hlcTimestamp: now,
  }

  await db.stockTransfers.put(transfer)
  await db.syncQueue.put({
    id: crypto.randomUUID(),
    resourceType: 'StockTransfer',
    resourceId: id,
    action: 'create',
    payload: JSON.stringify(transfer),
    status: 'pending',
    hlcTimestamp: now,
    createdAt: now,
    retryCount: 0,
  })

  return transfer
}

/**
 * Approve a transfer request (pharmacy manager action).
 */
export async function approveTransfer(transferId: string, approvedBy: string): Promise<void> {
  const now = new Date().toISOString()
  await db.stockTransfers.update(transferId, {
    status: 'approved' as TransferStatus,
    approvedBy,
    approvedAt: now,
    hlcTimestamp: now,
  })
  await enqueueSyncUpdate(transferId)
}

/**
 * Ship a transfer — deducts stock from sender's batches.
 * Creates StockMovement('transferred_out') for each item.
 */
export async function shipTransfer(transferId: string, performedBy: string): Promise<void> {
  const transfer = await db.stockTransfers.get(transferId)
  if (!transfer) throw new Error('Transfer not found')
  if (transfer.status !== 'approved') throw new Error('Transfer must be approved before shipping')

  const now = new Date().toISOString()

  // Deduct stock for each item
  for (const item of transfer.items) {
    await deductStock({
      stockBatchId: item.stockBatchId,
      catalogItemId: item.catalogItemId,
      quantity: item.quantity,
      type: 'transferred_out',
      referenceId: transferId,
      referenceType: 'transfer',
      performedBy,
    })
  }

  await db.stockTransfers.update(transferId, {
    status: 'shipped' as TransferStatus,
    shippedAt: now,
    hlcTimestamp: now,
  })
  await enqueueSyncUpdate(transferId)
}

/**
 * Receive a transfer — adds stock to receiver's inventory.
 * Creates StockMovement('transferred_in') for each item.
 * Also creates new StockBatches at the receiving location.
 */
export async function receiveTransfer(transferId: string, receivedBy: string, locationId: string): Promise<void> {
  const transfer = await db.stockTransfers.get(transferId)
  if (!transfer) throw new Error('Transfer not found')
  if (transfer.status !== 'shipped') throw new Error('Transfer must be shipped before receiving')

  const now = new Date().toISOString()

  // Create new batches at receiving location and add stock
  for (const item of transfer.items) {
    // Look up the source batch for metadata
    const sourceBatch = await db.stockBatches.get(item.stockBatchId)

    const newBatchId = crypto.randomUUID()
    await db.stockBatches.put({
      id: newBatchId,
      catalogItemId: item.catalogItemId,
      batchNumber: item.batchNumber,
      expiryDate: sourceBatch?.expiryDate ?? '',
      quantityOnHand: 0, // Will be incremented by addStock
      costPrice: sourceBatch?.costPrice ?? 0,
      sellingPrice: sourceBatch?.sellingPrice ?? 0,
      receivedAt: now,
      status: 'active',
      locationId,
      hlcTimestamp: now,
    })

    await addStock({
      stockBatchId: newBatchId,
      catalogItemId: item.catalogItemId,
      quantity: item.quantity,
      type: 'transferred_in',
      referenceId: transferId,
      referenceType: 'transfer',
      performedBy: receivedBy,
    })
  }

  await db.stockTransfers.update(transferId, {
    status: 'received' as TransferStatus,
    receivedAt: now,
    receivedBy,
    hlcTimestamp: now,
  })
  await enqueueSyncUpdate(transferId)
}

/**
 * Cancel a transfer request.
 */
export async function cancelTransfer(transferId: string, reason: string): Promise<void> {
  const now = new Date().toISOString()
  await db.stockTransfers.update(transferId, {
    status: 'cancelled' as TransferStatus,
    cancelledReason: reason,
    hlcTimestamp: now,
  })
  await enqueueSyncUpdate(transferId)
}

/**
 * Get transfers for this pharmacy (both incoming and outgoing).
 */
export async function getTransfers(locationId: string): Promise<StockTransfer[]> {
  const allTransfers = await db.stockTransfers.orderBy('requestedAt').reverse().toArray()
  return allTransfers.filter(
    (t) => t.fromLocationId === locationId || t.toLocationId === locationId
  )
}

/**
 * Get pending incoming transfers (awaiting receive).
 */
export async function getPendingIncoming(locationId: string): Promise<StockTransfer[]> {
  return db.stockTransfers
    .where('toLocationId')
    .equals(locationId)
    .filter((t) => t.status === 'shipped')
    .toArray()
}

async function enqueueSyncUpdate(transferId: string): Promise<void> {
  const transfer = await db.stockTransfers.get(transferId)
  if (!transfer) return
  const now = new Date().toISOString()
  await db.syncQueue.put({
    id: crypto.randomUUID(),
    resourceType: 'StockTransfer',
    resourceId: transferId,
    action: 'update',
    payload: JSON.stringify(transfer),
    status: 'pending',
    hlcTimestamp: now,
    createdAt: now,
    retryCount: 0,
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/pharmacy-lite/src/lib/transfers/transfer-service.ts
git commit -m "feat(pharmacy-lite): transfer service — request, approve, ship (deduct), receive (add), cancel"
```

---

### Task 4: Network Stock Query

**Files:**
- Create: `apps/pharmacy-lite/src/lib/transfers/network-stock-query.ts`

- [ ] **Step 1: Create network stock query**

```ts
// apps/pharmacy-lite/src/lib/transfers/network-stock-query.ts
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getHubApiUrl } from '@/lib/trpc'
import type { NetworkStockItem } from './types'

/**
 * Query Hub API for stock levels across sibling pharmacies in the same organization.
 * Returns items available at other locations for a given catalog item.
 */
export async function queryNetworkStock(params: {
  catalogItemId?: string
  organizationId?: string
  signal?: AbortSignal
}): Promise<NetworkStockItem[]> {
  const token = await useAuthSessionStore.getState().getAccessToken()
  if (!token) return []

  const hubBaseUrl = getHubApiUrl()
  const url = new URL(hubBaseUrl)
  url.pathname = url.pathname.replace(/\/$/, '') + '/inventory.networkStock'

  const input: Record<string, unknown> = {}
  if (params.catalogItemId) input.catalogItemId = params.catalogItemId
  if (params.organizationId) input.organizationId = params.organizationId
  url.searchParams.set('input', JSON.stringify({ json: input }))

  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      signal: params.signal,
    })

    if (!res.ok) return []

    const body = (await res.json()) as {
      result: { data: { json: NetworkStockItem[] } }
    }
    return body.result.data.json
  } catch {
    return [] // Offline or Hub unavailable — graceful fallback
  }
}

/**
 * Query network stock for multiple catalog items at once.
 */
export async function queryNetworkStockBulk(params: {
  catalogItemIds: string[]
  signal?: AbortSignal
}): Promise<NetworkStockItem[]> {
  const token = await useAuthSessionStore.getState().getAccessToken()
  if (!token) return []

  const hubBaseUrl = getHubApiUrl()
  const url = new URL(hubBaseUrl)
  url.pathname = url.pathname.replace(/\/$/, '') + '/inventory.networkStockBulk'
  url.searchParams.set('input', JSON.stringify({ json: { catalogItemIds: params.catalogItemIds } }))

  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      signal: params.signal,
    })

    if (!res.ok) return []

    const body = (await res.json()) as {
      result: { data: { json: NetworkStockItem[] } }
    }
    return body.result.data.json
  } catch {
    return []
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/pharmacy-lite/src/lib/transfers/network-stock-query.ts
git commit -m "feat(pharmacy-lite): network stock query — Hub API for cross-pharmacy stock visibility"
```

---

## Phase 3: Reports Services (Tasks 5-6)

### Task 5: Consumption + Wastage Reports

**Files:**
- Create: `apps/pharmacy-lite/src/lib/reports/consumption-report.ts`
- Create: `apps/pharmacy-lite/src/lib/reports/wastage-report.ts`

- [ ] **Step 1: Create consumption report**

```ts
// apps/pharmacy-lite/src/lib/reports/consumption-report.ts
import { db } from '@/lib/db'

export interface ConsumptionItem {
  catalogItemId: string
  catalogItemName: string
  totalDispensed: number
  category: string
}

/**
 * Get top dispensed items in a date range.
 */
export async function getTopDispensedItems(params: {
  daysBack: number
  limit: number
}): Promise<ConsumptionItem[]> {
  const since = new Date(Date.now() - params.daysBack * 86400000).toISOString()

  const movements = await db.stockMovements
    .where('type')
    .equals('dispensed')
    .filter((m) => m.timestamp >= since)
    .toArray()

  // Aggregate by catalogItemId
  const totals = new Map<string, number>()
  for (const m of movements) {
    const current = totals.get(m.catalogItemId) ?? 0
    totals.set(m.catalogItemId, current + Math.abs(m.quantity))
  }

  // Sort by total dispensed (descending) and limit
  const sorted = Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, params.limit)

  // Enrich with catalog names
  const catalogIds = sorted.map(([id]) => id)
  const catalogItems = catalogIds.length > 0
    ? await db.catalogItems.where('id').anyOf(catalogIds).toArray()
    : []
  const catalogMap = new Map(catalogItems.map((c) => [c.id, c]))

  return sorted.map(([id, total]) => ({
    catalogItemId: id,
    catalogItemName: catalogMap.get(id)?.name ?? 'Unknown',
    totalDispensed: total,
    category: catalogMap.get(id)?.category ?? '',
  }))
}

/**
 * Get daily dispensing totals for chart data.
 */
export async function getDailyDispensingTotals(daysBack: number): Promise<{ date: string; count: number }[]> {
  const since = new Date(Date.now() - daysBack * 86400000).toISOString()

  const movements = await db.stockMovements
    .where('type')
    .equals('dispensed')
    .filter((m) => m.timestamp >= since)
    .toArray()

  const dailyMap = new Map<string, number>()
  for (const m of movements) {
    const date = m.timestamp.split('T')[0]!
    dailyMap.set(date, (dailyMap.get(date) ?? 0) + 1)
  }

  // Fill in missing days with zero
  const results: { date: string; count: number }[] = []
  for (let i = daysBack - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86400000).toISOString().split('T')[0]!
    results.push({ date, count: dailyMap.get(date) ?? 0 })
  }

  return results
}
```

- [ ] **Step 2: Create wastage report**

```ts
// apps/pharmacy-lite/src/lib/reports/wastage-report.ts
import { db } from '@/lib/db'

export interface WastageMetrics {
  totalQuarantined: number
  totalDisposed: number
  quarantinedBatches: number
  disposedInPeriod: number
  wastageRate: number // percentage of total stock movements that were waste
}

/**
 * Calculate wastage metrics for a given period.
 */
export async function getWastageMetrics(daysBack: number): Promise<WastageMetrics> {
  const since = new Date(Date.now() - daysBack * 86400000).toISOString()

  const [quarantinedBatches, movements] = await Promise.all([
    db.stockBatches.where('status').equals('quarantined').count(),
    db.stockMovements.filter((m) => m.timestamp >= since).toArray(),
  ])

  let totalQuarantined = 0
  let totalDisposed = 0
  let totalMovements = 0

  for (const m of movements) {
    totalMovements++
    if (m.type === 'quarantined') totalQuarantined += Math.abs(m.quantity)
    if (m.type === 'disposed') totalDisposed += Math.abs(m.quantity)
  }

  const wasteMovements = movements.filter((m) => m.type === 'quarantined' || m.type === 'disposed').length
  const wastageRate = totalMovements > 0 ? Math.round((wasteMovements / totalMovements) * 100) : 0

  return {
    totalQuarantined,
    totalDisposed,
    quarantinedBatches,
    disposedInPeriod: movements.filter((m) => m.type === 'disposed').length,
    wastageRate,
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/pharmacy-lite/src/lib/reports/consumption-report.ts apps/pharmacy-lite/src/lib/reports/wastage-report.ts
git commit -m "feat(pharmacy-lite): reports services — consumption trends and wastage metrics"
```

---

### Task 6: Financial + Controlled Discrepancy Reports

**Files:**
- Create: `apps/pharmacy-lite/src/lib/reports/financial-report.ts`
- Create: `apps/pharmacy-lite/src/lib/reports/controlled-discrepancy.ts`

- [ ] **Step 1: Create financial report**

```ts
// apps/pharmacy-lite/src/lib/reports/financial-report.ts
import { db } from '@/lib/db'

export interface FinancialSummary {
  todayRevenue: number
  weekRevenue: number
  monthRevenue: number
  totalOutstanding: number
  invoiceCount: number
  averageInvoiceValue: number
}

export async function getFinancialSummary(): Promise<FinancialSummary> {
  const now = new Date()
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
  const weekStart = new Date(now.getTime() - 7 * 86400000)
  const monthStart = new Date(now.getTime() - 30 * 86400000)

  const invoices = await db.invoices.toArray()

  const paidInvoices = invoices.filter((inv) => inv.status === 'paid' || inv.status === 'partial')
  const todayInvoices = paidInvoices.filter((inv) => inv.createdAt >= todayStart.toISOString())
  const weekInvoices = paidInvoices.filter((inv) => inv.createdAt >= weekStart.toISOString())
  const monthInvoices = paidInvoices.filter((inv) => inv.createdAt >= monthStart.toISOString())

  const todayRevenue = todayInvoices.reduce((sum, inv) => sum + inv.amountPaid, 0)
  const weekRevenue = weekInvoices.reduce((sum, inv) => sum + inv.amountPaid, 0)
  const monthRevenue = monthInvoices.reduce((sum, inv) => sum + inv.amountPaid, 0)

  const accounts = await db.patientAccounts.filter((a) => a.balance > 0).toArray()
  const totalOutstanding = accounts.reduce((sum, a) => sum + a.balance, 0)

  const invoiceCount = paidInvoices.length
  const averageInvoiceValue = invoiceCount > 0 ? Math.round(monthRevenue / Math.min(invoiceCount, monthInvoices.length || 1)) : 0

  return { todayRevenue, weekRevenue, monthRevenue, totalOutstanding, invoiceCount, averageInvoiceValue }
}
```

- [ ] **Step 2: Create controlled discrepancy report**

```ts
// apps/pharmacy-lite/src/lib/reports/controlled-discrepancy.ts
import { db } from '@/lib/db'

export interface ControlledDiscrepancy {
  countId: string
  countDate: string
  catalogItemName: string
  schedule: string
  expectedQty: number
  actualQty: number
  variance: number
}

/**
 * Get history of controlled substance count discrepancies.
 */
export async function getControlledDiscrepancies(limit = 50): Promise<ControlledDiscrepancy[]> {
  // Get adjustment movements with [CONTROLLED] prefix
  const movements = await db.stockMovements
    .where('type')
    .equals('adjusted')
    .filter((m) => m.reason?.startsWith('[CONTROLLED]') ?? false)
    .reverse()
    .sortBy('timestamp')

  const results: ControlledDiscrepancy[] = []

  for (const m of movements.slice(0, limit)) {
    const catalogItem = await db.catalogItems.get(m.catalogItemId)

    // Parse expected and actual from reason string
    const match = m.reason?.match(/expected (\d+), counted (\d+)/)
    const expectedQty = match ? parseInt(match[1]!) : 0
    const actualQty = match ? parseInt(match[2]!) : 0

    results.push({
      countId: m.referenceId ?? '',
      countDate: m.timestamp,
      catalogItemName: catalogItem?.name ?? 'Unknown',
      schedule: catalogItem?.controlledSchedule ?? '',
      expectedQty,
      actualQty,
      variance: m.quantity,
    })
  }

  return results
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/pharmacy-lite/src/lib/reports/financial-report.ts apps/pharmacy-lite/src/lib/reports/controlled-discrepancy.ts
git commit -m "feat(pharmacy-lite): financial summary and controlled substance discrepancy report services"
```

---

## Phase 4: Transfers UI (Tasks 7-8)

### Task 7: Transfer Components

**Files:**
- Create: `apps/pharmacy-lite/src/components/pharmacy/transfers/TransferCard.tsx`
- Create: `apps/pharmacy-lite/src/components/pharmacy/transfers/TransfersPage.tsx`
- Create: `apps/pharmacy-lite/src/app/[locale]/inventory/transfers/page.tsx`

- [ ] **Step 1: Create TransferCard**

```tsx
// apps/pharmacy-lite/src/components/pharmacy/transfers/TransferCard.tsx
'use client'

import { Button } from '@/components/ui/Button'
import type { StockTransfer } from '@/lib/transfers/types'

interface TransferCardProps {
  transfer: StockTransfer
  currentLocationId: string
  onApprove?: (id: string) => void
  onShip?: (id: string) => void
  onReceive?: (id: string) => void
  onCancel?: (id: string) => void
  actionInProgress?: boolean
}

const statusColors: Record<string, string> = {
  requested: 'bg-blue-100 text-blue-700',
  approved: 'bg-amber-100 text-amber-700',
  shipped: 'bg-purple-100 text-purple-700',
  received: 'bg-green-100 text-green-700',
  cancelled: 'bg-neutral-100 text-neutral-500',
}

export function TransferCard({ transfer, currentLocationId, onApprove, onShip, onReceive, onCancel, actionInProgress }: TransferCardProps) {
  const isOutgoing = transfer.fromLocationId === currentLocationId
  const direction = isOutgoing ? 'Outgoing' : 'Incoming'

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4" data-testid={`transfer-${transfer.id}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-neutral-500">{direction}</span>
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[transfer.status] ?? ''}`}>
            {transfer.status}
          </span>
        </div>
        <span className="text-xs text-neutral-400">{new Date(transfer.requestedAt).toLocaleDateString()}</span>
      </div>

      <p className="text-sm text-neutral-900">
        {isOutgoing ? `To: ${transfer.toLocationName}` : `From: ${transfer.fromLocationName}`}
      </p>

      <div className="mt-2 text-xs text-neutral-600">
        {transfer.items.length} item{transfer.items.length !== 1 ? 's' : ''}:
        {' '}{transfer.items.map((i) => `${i.catalogItemName} x${i.quantity}`).join(', ')}
      </div>

      {/* Actions based on status and direction */}
      <div className="mt-3 flex gap-2">
        {transfer.status === 'requested' && isOutgoing && onApprove && (
          <Button variant="primary" type="button" disabled={actionInProgress} onClick={() => onApprove(transfer.id)}>Approve</Button>
        )}
        {transfer.status === 'approved' && isOutgoing && onShip && (
          <Button variant="primary" type="button" disabled={actionInProgress} onClick={() => onShip(transfer.id)}>Ship</Button>
        )}
        {transfer.status === 'shipped' && !isOutgoing && onReceive && (
          <Button variant="primary" type="button" disabled={actionInProgress} onClick={() => onReceive(transfer.id)}>Receive</Button>
        )}
        {(transfer.status === 'requested' || transfer.status === 'approved') && onCancel && (
          <Button variant="ghost" type="button" disabled={actionInProgress} onClick={() => onCancel(transfer.id)}>Cancel</Button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create TransfersPage**

```tsx
// apps/pharmacy-lite/src/components/pharmacy/transfers/TransfersPage.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/Button'
import { getTransfers, approveTransfer, shipTransfer, receiveTransfer, cancelTransfer } from '@/lib/transfers/transfer-service'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { TransferCard } from './TransferCard'
import type { StockTransfer } from '@/lib/transfers/types'

export function TransfersPage() {
  const session = useAuthSessionStore((s) => s.session)
  const [transfers, setTransfers] = useState<StockTransfer[]>([])
  const [loading, setLoading] = useState(true)
  const [actionInProgress, setActionInProgress] = useState(false)

  const locationId = 'default' // TODO: read from PharmacySettings

  const loadData = useCallback(async () => {
    setLoading(true)
    const data = await getTransfers(locationId)
    setTransfers(data)
    setLoading(false)
  }, [locationId])

  useEffect(() => { loadData() }, [loadData])

  const handleApprove = async (id: string) => {
    if (!session) return
    setActionInProgress(true)
    await approveTransfer(id, session.practitionerId ?? session.userId)
    await loadData()
    setActionInProgress(false)
  }

  const handleShip = async (id: string) => {
    if (!session) return
    setActionInProgress(true)
    try {
      await shipTransfer(id, session.practitionerId ?? session.userId)
    } catch { /* insufficient stock — handle gracefully */ }
    await loadData()
    setActionInProgress(false)
  }

  const handleReceive = async (id: string) => {
    if (!session) return
    setActionInProgress(true)
    await receiveTransfer(id, session.practitionerId ?? session.userId, locationId)
    await loadData()
    setActionInProgress(false)
  }

  const handleCancel = async (id: string) => {
    setActionInProgress(true)
    await cancelTransfer(id, 'Cancelled by pharmacist')
    await loadData()
    setActionInProgress(false)
  }

  const pending = transfers.filter((t) => t.status !== 'received' && t.status !== 'cancelled')
  const completed = transfers.filter((t) => t.status === 'received' || t.status === 'cancelled')

  return (
    <div className="space-y-6" data-testid="transfers-page">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-neutral-900">Stock Transfers</h1>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-neutral-400">Loading transfers...</div>
      ) : transfers.length === 0 ? (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-8 text-center">
          <p className="text-sm text-neutral-500">No transfers yet.</p>
          <p className="text-xs text-neutral-400 mt-1">Transfer requests from sibling pharmacies will appear here.</p>
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-neutral-700 mb-2">Active ({pending.length})</h2>
              <div className="space-y-3">
                {pending.map((t) => (
                  <TransferCard
                    key={t.id}
                    transfer={t}
                    currentLocationId={locationId}
                    onApprove={handleApprove}
                    onShip={handleShip}
                    onReceive={handleReceive}
                    onCancel={handleCancel}
                    actionInProgress={actionInProgress}
                  />
                ))}
              </div>
            </div>
          )}
          {completed.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-neutral-700 mb-2">Completed ({completed.length})</h2>
              <div className="space-y-3">
                {completed.map((t) => (
                  <TransferCard key={t.id} transfer={t} currentLocationId={locationId} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create route**

```tsx
// apps/pharmacy-lite/src/app/[locale]/inventory/transfers/page.tsx
'use client'

import { TransfersPage } from '@/components/pharmacy/transfers/TransfersPage'

export default function TransfersRoute() {
  return <TransfersPage />
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/pharmacy-lite/src/components/pharmacy/transfers/TransferCard.tsx apps/pharmacy-lite/src/components/pharmacy/transfers/TransfersPage.tsx apps/pharmacy-lite/src/app/[locale]/inventory/transfers/page.tsx
git commit -m "feat(pharmacy-lite): Transfers page — list, approve, ship, receive, cancel with status cards"
```

---

## Phase 5: Reports UI (Tasks 8-9)

### Task 8: Report Cards

**Files:**
- Create: `apps/pharmacy-lite/src/components/pharmacy/reports/ConsumptionChart.tsx`
- Create: `apps/pharmacy-lite/src/components/pharmacy/reports/FinancialSummaryCard.tsx`
- Create: `apps/pharmacy-lite/src/components/pharmacy/reports/WastageCard.tsx`
- Create: `apps/pharmacy-lite/src/components/pharmacy/reports/ControlledDiscrepancyCard.tsx`

- [ ] **Step 1: Create all 4 report cards**

```tsx
// apps/pharmacy-lite/src/components/pharmacy/reports/ConsumptionChart.tsx
'use client'

import { useState, useEffect } from 'react'
import { getTopDispensedItems, type ConsumptionItem } from '@/lib/reports/consumption-report'

export function ConsumptionChart() {
  const [items, setItems] = useState<ConsumptionItem[]>([])

  useEffect(() => {
    getTopDispensedItems({ daysBack: 30, limit: 10 }).then(setItems)
  }, [])

  if (items.length === 0) return null

  const maxQty = Math.max(...items.map((i) => i.totalDispensed))

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4" data-testid="consumption-chart">
      <h3 className="text-sm font-semibold text-neutral-700 mb-3">Top Dispensed (30 days)</h3>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.catalogItemId} className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-neutral-900 truncate">{item.catalogItemName}</p>
              <div className="mt-1 h-2 rounded-full bg-neutral-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary-400"
                  style={{ width: `${(item.totalDispensed / maxQty) * 100}%` }}
                />
              </div>
            </div>
            <span className="text-xs font-semibold tabular-nums text-neutral-700 w-10 text-end">{item.totalDispensed}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

```tsx
// apps/pharmacy-lite/src/components/pharmacy/reports/FinancialSummaryCard.tsx
'use client'

import { useState, useEffect } from 'react'
import { getFinancialSummary, type FinancialSummary } from '@/lib/reports/financial-report'

export function FinancialSummaryCard() {
  const [data, setData] = useState<FinancialSummary | null>(null)

  useEffect(() => { getFinancialSummary().then(setData) }, [])

  if (!data) return null

  const fmt = (amount: number) => (amount / 100).toFixed(2)

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4" data-testid="financial-summary">
      <h3 className="text-sm font-semibold text-neutral-700 mb-3">Financial Summary</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-neutral-500">Today</p>
          <p className="text-lg font-bold tabular-nums text-neutral-900">{fmt(data.todayRevenue)}</p>
        </div>
        <div>
          <p className="text-xs text-neutral-500">This Week</p>
          <p className="text-lg font-bold tabular-nums text-neutral-900">{fmt(data.weekRevenue)}</p>
        </div>
        <div>
          <p className="text-xs text-neutral-500">This Month</p>
          <p className="text-lg font-bold tabular-nums text-neutral-900">{fmt(data.monthRevenue)}</p>
        </div>
        <div>
          <p className="text-xs text-neutral-500">Outstanding</p>
          <p className="text-lg font-bold tabular-nums text-amber-700">{fmt(data.totalOutstanding)}</p>
        </div>
      </div>
    </div>
  )
}
```

```tsx
// apps/pharmacy-lite/src/components/pharmacy/reports/WastageCard.tsx
'use client'

import { useState, useEffect } from 'react'
import { getWastageMetrics, type WastageMetrics } from '@/lib/reports/wastage-report'

export function WastageCard() {
  const [data, setData] = useState<WastageMetrics | null>(null)

  useEffect(() => { getWastageMetrics(30).then(setData) }, [])

  if (!data) return null

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4" data-testid="wastage-card">
      <h3 className="text-sm font-semibold text-neutral-700 mb-3">Wastage (30 days)</h3>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-lg font-bold tabular-nums text-red-700">{data.quarantinedBatches}</p>
          <p className="text-[10px] text-neutral-500">Quarantined</p>
        </div>
        <div>
          <p className="text-lg font-bold tabular-nums text-neutral-900">{data.totalDisposed}</p>
          <p className="text-[10px] text-neutral-500">Disposed</p>
        </div>
        <div>
          <p className="text-lg font-bold tabular-nums text-amber-700">{data.wastageRate}%</p>
          <p className="text-[10px] text-neutral-500">Waste Rate</p>
        </div>
      </div>
    </div>
  )
}
```

```tsx
// apps/pharmacy-lite/src/components/pharmacy/reports/ControlledDiscrepancyCard.tsx
'use client'

import { useState, useEffect } from 'react'
import { getControlledDiscrepancies, type ControlledDiscrepancy } from '@/lib/reports/controlled-discrepancy'

export function ControlledDiscrepancyCard() {
  const [data, setData] = useState<ControlledDiscrepancy[]>([])

  useEffect(() => { getControlledDiscrepancies(10).then(setData) }, [])

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50/50 p-4" data-testid="controlled-discrepancy">
        <h3 className="text-sm font-semibold text-green-800">Controlled Substances</h3>
        <p className="text-xs text-green-700 mt-1">No discrepancies found.</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50/30 p-4" data-testid="controlled-discrepancy">
      <h3 className="text-sm font-semibold text-red-800 mb-3">Controlled Substance Discrepancies</h3>
      <div className="space-y-2">
        {data.map((item, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <div>
              <span className="font-medium text-neutral-900">{item.catalogItemName}</span>
              <span className="text-neutral-500 ms-1">C{item.schedule}</span>
            </div>
            <div className="text-end">
              <span className={`font-bold tabular-nums ${item.variance > 0 ? 'text-green-700' : 'text-red-700'}`}>
                {item.variance > 0 ? '+' : ''}{item.variance}
              </span>
              <span className="text-neutral-400 ms-2">{new Date(item.countDate).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/pharmacy-lite/src/components/pharmacy/reports/ConsumptionChart.tsx apps/pharmacy-lite/src/components/pharmacy/reports/FinancialSummaryCard.tsx apps/pharmacy-lite/src/components/pharmacy/reports/WastageCard.tsx apps/pharmacy-lite/src/components/pharmacy/reports/ControlledDiscrepancyCard.tsx
git commit -m "feat(pharmacy-lite): report cards — consumption, financial summary, wastage, controlled discrepancies"
```

---

### Task 9: Reports Page + Route

**Files:**
- Create: `apps/pharmacy-lite/src/components/pharmacy/reports/ReportsPage.tsx`
- Create: `apps/pharmacy-lite/src/app/[locale]/reports/page.tsx`

- [ ] **Step 1: Create ReportsPage**

```tsx
// apps/pharmacy-lite/src/components/pharmacy/reports/ReportsPage.tsx
'use client'

import { ConsumptionChart } from './ConsumptionChart'
import { FinancialSummaryCard } from './FinancialSummaryCard'
import { WastageCard } from './WastageCard'
import { ControlledDiscrepancyCard } from './ControlledDiscrepancyCard'

export function ReportsPage() {
  return (
    <div className="space-y-6" data-testid="reports-page">
      <h1 className="text-xl font-bold text-neutral-900">Reports</h1>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <FinancialSummaryCard />
        <WastageCard />
      </div>

      <ConsumptionChart />
      <ControlledDiscrepancyCard />
    </div>
  )
}
```

- [ ] **Step 2: Create route**

```tsx
// apps/pharmacy-lite/src/app/[locale]/reports/page.tsx
'use client'

import { ReportsPage } from '@/components/pharmacy/reports/ReportsPage'

export default function ReportsRoute() {
  return <ReportsPage />
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/pharmacy-lite/src/components/pharmacy/reports/ReportsPage.tsx apps/pharmacy-lite/src/app/[locale]/reports/page.tsx
git commit -m "feat(pharmacy-lite): Reports page — financial, consumption, wastage, controlled discrepancy dashboard"
```

---

## Phase 6: Navigation (Task 10)

### Task 10: Add Transfers + Reports Nav Items

**Files:**
- Modify: `apps/pharmacy-lite/src/components/AppShellWrapper.tsx`
- Modify: `apps/pharmacy-lite/messages/en.json`
- Modify: `apps/pharmacy-lite/messages/ar.json`
- Modify: `apps/pharmacy-lite/messages/prs.json`

- [ ] **Step 1: Add icons and nav items**

In AppShellWrapper, add icons:
```tsx
transfers: (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="17 1 21 5 17 9" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <polyline points="7 23 3 19 7 15" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
),
reports: (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
),
```

Add nav items:
- In the inventory group (after stockCount): `{ label: t('transfers'), href: '/inventory/transfers', icon: icons.transfers, active: pathname === '/inventory/transfers', group: 'inventory' },`
- In the system group (before sync): `{ label: t('reports'), href: '/reports', icon: icons.reports, active: pathname === '/reports', group: 'system' },`

Add `/inventory/transfers` and `/reports` to `wideRoutes`.

- [ ] **Step 2: Add i18n keys**

In `en.json` sidebar:
```json
"transfers": "Transfers",
"reports": "Reports"
```

In `ar.json` sidebar:
```json
"transfers": "التحويلات",
"reports": "التقارير"
```

In `prs.json` sidebar:
```json
"transfers": "انتقالات",
"reports": "گزارشات"
```

- [ ] **Step 3: Commit**

```bash
git add apps/pharmacy-lite/src/components/AppShellWrapper.tsx apps/pharmacy-lite/messages/en.json apps/pharmacy-lite/messages/ar.json apps/pharmacy-lite/messages/prs.json
git commit -m "feat(pharmacy-lite): add Transfers and Reports nav items to sidebar with i18n"
```

---

## Summary

| Phase | Tasks | What it delivers |
|-------|-------|-----------------|
| **1. Types + Schema** | 1-2 | Transfer types, Dexie v10 |
| **2. Transfer Service** | 3-4 | Full transfer lifecycle + network stock query |
| **3. Reports Services** | 5-6 | Consumption, wastage, financial, controlled discrepancy |
| **4. Transfers UI** | 7 | Transfer cards + page (approve/ship/receive/cancel) |
| **5. Reports UI** | 8-9 | Report cards + Reports page |
| **6. Navigation** | 10 | Sidebar items for transfers + reports |

**Total: 10 tasks, 6 phases.**

After completion, pharmacy-lite will:
- Request stock from sibling pharmacies (via Hub)
- Approve, ship (deducts stock), and receive (adds stock) transfers
- View cross-pharmacy stock levels when online
- See consumption trends (top dispensed items, daily totals)
- Track wastage metrics (quarantined, disposed, rate)
- View financial summary (today/week/month revenue, outstanding)
- Monitor controlled substance count discrepancies
- Navigate to Transfers and Reports from sidebar
