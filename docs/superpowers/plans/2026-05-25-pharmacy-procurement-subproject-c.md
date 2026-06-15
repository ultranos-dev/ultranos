# Pharmacy Procurement Sub-Project C: Suppliers, Purchase Orders, Stock Counts

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add supplier management, purchase order lifecycle (opt-in), stock count/reconciliation with controlled substance tracking, and upgrade the ControlledSubstancesView to show real schedule data and running balances.

**Architecture:** Dexie v9 adds 2 new tables (suppliers, purchaseOrders) + a stockCounts table. Supplier management is always available (needed for goods receiving enrichment). PO lifecycle is gated behind `enablePurchaseOrders` setting. Stock counts generate adjustment StockMovements on completion. Controlled substance view reads schedule from CatalogItem and computes running balance from StockMovements.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS, Dexie (IndexedDB), Zustand, next-intl.

**Spec:** `docs/superpowers/specs/2026-05-25-pharmacy-inventory-pos-design.md`

**Depends on:** Sub-project A (inventory types, stock service, catalog, Dexie v6-v8), Sub-project B (POS types, Dexie v7)

---

## File Structure

### New Files

```
apps/pharmacy-lite/src/
├── lib/
│   ├── procurement/
│   │   ├── types.ts                     # Supplier, PurchaseOrder, StockCount types
│   │   ├── supplier-service.ts          # Supplier CRUD
│   │   ├── purchase-order-service.ts    # PO lifecycle (create, send, receive, close)
│   │   └── stock-count-service.ts       # Stock count workflow + adjustment generation
├── components/pharmacy/
│   ├── procurement/
│   │   ├── SuppliersPage.tsx            # /inventory/suppliers — CRUD list
│   │   ├── SupplierForm.tsx             # Create/edit supplier form
│   │   ├── PurchaseOrdersPage.tsx       # PO list + create flow (PO mode only)
│   │   ├── PurchaseOrderForm.tsx        # Create/edit PO with line items
│   │   ├── PurchaseOrderDetail.tsx      # View PO + receive against it
│   │   ├── StockCountPage.tsx           # /inventory/count — count workflow
│   │   ├── StockCountForm.tsx           # Active count: scan/search → enter actual qty
│   │   ├── StockCountHistory.tsx        # Completed counts list
│   │   └── ControlledBalanceCard.tsx    # Running balance display for controlled items
├── app/[locale]/
│   ├── inventory/
│   │   ├── suppliers/page.tsx           # Suppliers route
│   │   ├── orders/page.tsx              # Purchase Orders route (PO mode only)
│   │   └── count/page.tsx               # Stock Count route
```

### Modified Files

```
apps/pharmacy-lite/src/
├── lib/db.ts                            # Dexie v9: procurement tables
├── lib/inventory/types.ts               # Add Supplier, PurchaseOrder, StockCount types
├── lib/inventory-db.ts                  # Update INVENTORY_STORES (or add v9 in db.ts)
├── components/pharmacy/
│   ├── inventory/ReceiveStockPage.tsx   # Add PO selection when PO mode enabled
│   └── ControlledSubstancesView.tsx     # Upgrade with real schedule + running balance
├── components/AppShellWrapper.tsx       # Add supplier/orders/count nav items
```

---

## Phase 1: Types + Schema (Tasks 1-2)

### Task 1: Procurement Types

**Files:**
- Create: `apps/pharmacy-lite/src/lib/procurement/types.ts`

- [ ] **Step 1: Create procurement types**

```ts
// apps/pharmacy-lite/src/lib/procurement/types.ts

export interface Supplier {
  id: string
  name: string
  contactName?: string
  phone?: string
  email?: string
  address?: string
  leadTimeDays?: number
  paymentTerms?: string
  isActive: boolean
  createdAt: string
}

export type PurchaseOrderStatus = 'draft' | 'sent' | 'partially_received' | 'closed' | 'cancelled'

export interface PurchaseOrderItem {
  catalogItemId: string
  catalogItemName: string
  quantityOrdered: number
  quantityReceived: number
  unitCost: number
}

export interface PurchaseOrder {
  id: string
  supplierId: string
  supplierName: string
  status: PurchaseOrderStatus
  items: PurchaseOrderItem[]
  totalCost: number
  notes?: string
  createdBy: string
  createdAt: string
  sentAt?: string
  closedAt?: string
  hlcTimestamp: string
}

export type StockCountType = 'full' | 'spot' | 'controlled_only'
export type StockCountStatus = 'in_progress' | 'completed'

export interface StockCountItem {
  catalogItemId: string
  catalogItemName: string
  stockBatchId: string
  batchNumber: string
  expectedQty: number
  actualQty: number
  variance: number
}

export interface StockCount {
  id: string
  type: StockCountType
  status: StockCountStatus
  countedBy: string
  items: StockCountItem[]
  totalVarianceItems: number
  startedAt: string
  completedAt?: string
  hlcTimestamp: string
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/pharmacy-lite/src/lib/procurement/types.ts
git commit -m "feat(pharmacy-lite): procurement types — Supplier, PurchaseOrder, StockCount"
```

---

### Task 2: Dexie v9 Schema

**Files:**
- Modify: `apps/pharmacy-lite/src/lib/db.ts`

- [ ] **Step 1: Add imports and table declarations**

Add imports at top of db.ts:
```ts
import type { Supplier, PurchaseOrder, StockCount } from './procurement/types'
```

Add table declarations in the class body:
```ts
suppliers!: EntityTable<Supplier, 'id'>
purchaseOrders!: EntityTable<PurchaseOrder, 'id'>
stockCounts!: EntityTable<StockCount, 'id'>
```

Add v9 migration after v8:
```ts
// v9: Procurement — suppliers, purchase orders, stock counts
this.version(9).stores({
  suppliers: 'id, name, isActive',
  purchaseOrders: 'id, supplierId, status, createdAt',
  stockCounts: 'id, type, status, startedAt',
})
```

- [ ] **Step 2: Commit**

```bash
git add apps/pharmacy-lite/src/lib/db.ts
git commit -m "feat(pharmacy-lite): Dexie v9 — suppliers, purchaseOrders, stockCounts tables"
```

---

## Phase 2: Services (Tasks 3-5)

### Task 3: Supplier Service

**Files:**
- Create: `apps/pharmacy-lite/src/lib/procurement/supplier-service.ts`

- [ ] **Step 1: Create supplier CRUD service**

```ts
// apps/pharmacy-lite/src/lib/procurement/supplier-service.ts
import { db } from '@/lib/db'
import type { Supplier } from './types'

export async function createSupplier(params: {
  name: string
  contactName?: string
  phone?: string
  email?: string
  address?: string
  leadTimeDays?: number
  paymentTerms?: string
}): Promise<Supplier> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  const supplier: Supplier = {
    id,
    name: params.name.trim(),
    contactName: params.contactName?.trim() || undefined,
    phone: params.phone?.trim() || undefined,
    email: params.email?.trim() || undefined,
    address: params.address?.trim() || undefined,
    leadTimeDays: params.leadTimeDays,
    paymentTerms: params.paymentTerms?.trim() || undefined,
    isActive: true,
    createdAt: now,
  }

  await db.suppliers.put(supplier)

  await db.syncQueue.put({
    id: crypto.randomUUID(),
    resourceType: 'Supplier',
    resourceId: id,
    action: 'create',
    payload: JSON.stringify(supplier),
    status: 'pending',
    hlcTimestamp: now,
    createdAt: now,
    retryCount: 0,
  })

  return supplier
}

export async function updateSupplier(id: string, updates: Partial<Omit<Supplier, 'id' | 'createdAt'>>): Promise<void> {
  await db.suppliers.update(id, updates)
}

export async function deactivateSupplier(id: string): Promise<void> {
  await db.suppliers.update(id, { isActive: false })
}

export async function getActiveSuppliers(): Promise<Supplier[]> {
  return db.suppliers.where('isActive').equals(1).toArray()
}

export async function getAllSuppliers(): Promise<Supplier[]> {
  return db.suppliers.orderBy('name').toArray()
}

export async function getSupplierById(id: string): Promise<Supplier | undefined> {
  return db.suppliers.get(id)
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/pharmacy-lite/src/lib/procurement/supplier-service.ts
git commit -m "feat(pharmacy-lite): supplier service — CRUD operations with sync queue"
```

---

### Task 4: Purchase Order Service

**Files:**
- Create: `apps/pharmacy-lite/src/lib/procurement/purchase-order-service.ts`

- [ ] **Step 1: Create PO lifecycle service**

```ts
// apps/pharmacy-lite/src/lib/procurement/purchase-order-service.ts
import { db } from '@/lib/db'
import type { PurchaseOrder, PurchaseOrderItem, PurchaseOrderStatus } from './types'

export async function createPurchaseOrder(params: {
  supplierId: string
  supplierName: string
  items: Omit<PurchaseOrderItem, 'quantityReceived'>[]
  notes?: string
  createdBy: string
}): Promise<PurchaseOrder> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  const items: PurchaseOrderItem[] = params.items.map((item) => ({
    ...item,
    quantityReceived: 0,
  }))

  const totalCost = items.reduce((sum, item) => sum + item.unitCost * item.quantityOrdered, 0)

  const po: PurchaseOrder = {
    id,
    supplierId: params.supplierId,
    supplierName: params.supplierName,
    status: 'draft',
    items,
    totalCost,
    notes: params.notes?.trim() || undefined,
    createdBy: params.createdBy,
    createdAt: now,
    hlcTimestamp: now,
  }

  await db.purchaseOrders.put(po)

  await db.syncQueue.put({
    id: crypto.randomUUID(),
    resourceType: 'PurchaseOrder',
    resourceId: id,
    action: 'create',
    payload: JSON.stringify(po),
    status: 'pending',
    hlcTimestamp: now,
    createdAt: now,
    retryCount: 0,
  })

  return po
}

export async function markPurchaseOrderSent(poId: string): Promise<void> {
  const now = new Date().toISOString()
  await db.purchaseOrders.update(poId, { status: 'sent' as PurchaseOrderStatus, sentAt: now, hlcTimestamp: now })
}

export async function recordReceiptAgainstPO(poId: string, receivedItems: { catalogItemId: string; quantityReceived: number }[]): Promise<void> {
  const po = await db.purchaseOrders.get(poId)
  if (!po) throw new Error('Purchase order not found')

  const now = new Date().toISOString()
  const updatedItems = po.items.map((item) => {
    const received = receivedItems.find((r) => r.catalogItemId === item.catalogItemId)
    if (received) {
      return { ...item, quantityReceived: item.quantityReceived + received.quantityReceived }
    }
    return item
  })

  const allFullyReceived = updatedItems.every((item) => item.quantityReceived >= item.quantityOrdered)
  const anyReceived = updatedItems.some((item) => item.quantityReceived > 0)

  let status: PurchaseOrderStatus = po.status
  if (allFullyReceived) {
    status = 'closed'
  } else if (anyReceived) {
    status = 'partially_received'
  }

  await db.purchaseOrders.update(poId, {
    items: updatedItems,
    status,
    closedAt: status === 'closed' ? now : undefined,
    hlcTimestamp: now,
  })
}

export async function cancelPurchaseOrder(poId: string): Promise<void> {
  const now = new Date().toISOString()
  await db.purchaseOrders.update(poId, { status: 'cancelled' as PurchaseOrderStatus, hlcTimestamp: now })
}

export async function getPurchaseOrders(statusFilter?: PurchaseOrderStatus): Promise<PurchaseOrder[]> {
  if (statusFilter) {
    return db.purchaseOrders.where('status').equals(statusFilter).reverse().sortBy('createdAt')
  }
  return db.purchaseOrders.orderBy('createdAt').reverse().toArray()
}

export async function getPurchaseOrderById(id: string): Promise<PurchaseOrder | undefined> {
  return db.purchaseOrders.get(id)
}

export async function getOpenPurchaseOrdersForSupplier(supplierId: string): Promise<PurchaseOrder[]> {
  return db.purchaseOrders
    .where('supplierId')
    .equals(supplierId)
    .filter((po) => po.status === 'sent' || po.status === 'partially_received')
    .toArray()
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/pharmacy-lite/src/lib/procurement/purchase-order-service.ts
git commit -m "feat(pharmacy-lite): purchase order service — full lifecycle (draft, send, receive, close, cancel)"
```

---

### Task 5: Stock Count Service

**Files:**
- Create: `apps/pharmacy-lite/src/lib/procurement/stock-count-service.ts`

- [ ] **Step 1: Create stock count service**

```ts
// apps/pharmacy-lite/src/lib/procurement/stock-count-service.ts
import { db } from '@/lib/db'
import type { StockCount, StockCountItem, StockCountType } from './types'
import type { StockMovement } from '@/lib/inventory/types'

/**
 * Start a new stock count session.
 */
export async function startStockCount(params: {
  type: StockCountType
  countedBy: string
}): Promise<StockCount> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  const count: StockCount = {
    id,
    type: params.type,
    status: 'in_progress',
    countedBy: params.countedBy,
    items: [],
    totalVarianceItems: 0,
    startedAt: now,
    hlcTimestamp: now,
  }

  await db.stockCounts.put(count)
  return count
}

/**
 * Add or update a count item in an active stock count.
 */
export async function addCountItem(countId: string, item: StockCountItem): Promise<void> {
  const count = await db.stockCounts.get(countId)
  if (!count) throw new Error('Stock count not found')
  if (count.status !== 'in_progress') throw new Error('Stock count already completed')

  const existingIndex = count.items.findIndex(
    (i) => i.stockBatchId === item.stockBatchId
  )

  let updatedItems: StockCountItem[]
  if (existingIndex >= 0) {
    updatedItems = [...count.items]
    updatedItems[existingIndex] = item
  } else {
    updatedItems = [...count.items, item]
  }

  await db.stockCounts.update(countId, { items: updatedItems, hlcTimestamp: new Date().toISOString() })
}

/**
 * Complete a stock count — generates adjustment StockMovements for all variances.
 * Controlled substance variances are flagged (they have a reason prefix).
 */
export async function completeStockCount(countId: string): Promise<StockCount> {
  const count = await db.stockCounts.get(countId)
  if (!count) throw new Error('Stock count not found')
  if (count.status !== 'in_progress') throw new Error('Stock count already completed')

  const now = new Date().toISOString()
  const varianceItems = count.items.filter((item) => item.variance !== 0)

  await db.transaction('rw', [db.stockCounts, db.stockMovements, db.stockBatches, db.syncQueue], async () => {
    // Generate adjustment movements for each variance
    for (const item of varianceItems) {
      const movementId = crypto.randomUUID()

      // Check if this is a controlled substance
      const catalogItem = await db.catalogItems.get(item.catalogItemId)
      const isControlled = !!catalogItem?.controlledSchedule

      const movement: StockMovement = {
        id: movementId,
        stockBatchId: item.stockBatchId,
        catalogItemId: item.catalogItemId,
        type: 'adjusted',
        quantity: item.variance, // positive if actual > expected, negative if less
        reason: isControlled
          ? `[CONTROLLED] Stock count variance: expected ${item.expectedQty}, counted ${item.actualQty}`
          : `Stock count variance: expected ${item.expectedQty}, counted ${item.actualQty}`,
        referenceId: countId,
        referenceType: 'count',
        performedBy: count.countedBy,
        timestamp: now,
        hlcTimestamp: now,
      }

      await db.stockMovements.put(movement)

      // Update batch quantity to match actual count
      await db.stockBatches.update(item.stockBatchId, {
        quantityOnHand: item.actualQty,
        hlcTimestamp: now,
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

    // Mark count as completed
    await db.stockCounts.update(countId, {
      status: 'completed' as const,
      completedAt: now,
      totalVarianceItems: varianceItems.length,
      hlcTimestamp: now,
    })
  })

  return { ...count, status: 'completed', completedAt: now, totalVarianceItems: varianceItems.length }
}

/**
 * Get the running balance for controlled substances.
 * Returns total on-hand for each controlled catalog item.
 */
export async function getControlledSubstanceBalances(): Promise<{
  catalogItemId: string
  catalogItemName: string
  schedule: string
  totalOnHand: number
  batchCount: number
}[]> {
  const controlledItems = await db.catalogItems
    .filter((item) => !!item.controlledSchedule && item.isActive)
    .toArray()

  const results = await Promise.all(
    controlledItems.map(async (item) => {
      const batches = await db.stockBatches
        .where('[catalogItemId+status]')
        .equals([item.id, 'active'])
        .toArray()

      const totalOnHand = batches.reduce((sum, b) => sum + b.quantityOnHand, 0)

      return {
        catalogItemId: item.id,
        catalogItemName: item.name,
        schedule: item.controlledSchedule!,
        totalOnHand,
        batchCount: batches.length,
      }
    })
  )

  return results
}

/**
 * Get recent completed stock counts.
 */
export async function getRecentStockCounts(limit = 10): Promise<StockCount[]> {
  return db.stockCounts
    .where('status')
    .equals('completed')
    .reverse()
    .sortBy('completedAt')
    .then((counts) => counts.slice(0, limit))
}

/**
 * Get in-progress stock count (only one allowed at a time).
 */
export async function getActiveStockCount(): Promise<StockCount | null> {
  const active = await db.stockCounts.where('status').equals('in_progress').first()
  return active ?? null
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/pharmacy-lite/src/lib/procurement/stock-count-service.ts
git commit -m "feat(pharmacy-lite): stock count service — start, add items, complete with adjustment generation"
```

---

## Phase 3: Supplier UI (Tasks 6-7)

### Task 6: Supplier Form Component

**Files:**
- Create: `apps/pharmacy-lite/src/components/pharmacy/procurement/SupplierForm.tsx`

- [ ] **Step 1: Create SupplierForm**

```tsx
// apps/pharmacy-lite/src/components/pharmacy/procurement/SupplierForm.tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { createSupplier, updateSupplier } from '@/lib/procurement/supplier-service'
import type { Supplier } from '@/lib/procurement/types'

interface SupplierFormProps {
  supplier?: Supplier
  onSaved: () => void
  onCancel: () => void
}

export function SupplierForm({ supplier, onSaved, onCancel }: SupplierFormProps) {
  const [name, setName] = useState(supplier?.name ?? '')
  const [contactName, setContactName] = useState(supplier?.contactName ?? '')
  const [phone, setPhone] = useState(supplier?.phone ?? '')
  const [email, setEmail] = useState(supplier?.email ?? '')
  const [address, setAddress] = useState(supplier?.address ?? '')
  const [leadTimeDays, setLeadTimeDays] = useState(supplier?.leadTimeDays?.toString() ?? '')
  const [paymentTerms, setPaymentTerms] = useState(supplier?.paymentTerms ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      if (supplier) {
        await updateSupplier(supplier.id, {
          name: name.trim(),
          contactName: contactName.trim() || undefined,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          address: address.trim() || undefined,
          leadTimeDays: leadTimeDays ? parseInt(leadTimeDays) : undefined,
          paymentTerms: paymentTerms.trim() || undefined,
        })
      } else {
        await createSupplier({
          name: name.trim(),
          contactName: contactName.trim() || undefined,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          address: address.trim() || undefined,
          leadTimeDays: leadTimeDays ? parseInt(leadTimeDays) : undefined,
          paymentTerms: paymentTerms.trim() || undefined,
        })
      }
      onSaved()
    } catch {
      setError('Failed to save supplier.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="supplier-form">
      <h3 className="text-lg font-semibold text-neutral-900">
        {supplier ? 'Edit Supplier' : 'Add Supplier'}
      </h3>

      {error && (
        <div role="alert" className="rounded-md bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">{error}</div>
      )}

      <div>
        <label htmlFor="supplier-name" className="mb-1 block text-xs font-medium text-neutral-600">Name *</label>
        <input id="supplier-name" type="text" required value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="supplier-contact" className="mb-1 block text-xs font-medium text-neutral-600">Contact Person</label>
          <input id="supplier-contact" type="text" value={contactName} onChange={(e) => setContactName(e.target.value)} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500" />
        </div>
        <div>
          <label htmlFor="supplier-phone" className="mb-1 block text-xs font-medium text-neutral-600">Phone</label>
          <input id="supplier-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="supplier-email" className="mb-1 block text-xs font-medium text-neutral-600">Email</label>
          <input id="supplier-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500" />
        </div>
        <div>
          <label htmlFor="supplier-lead" className="mb-1 block text-xs font-medium text-neutral-600">Lead Time (days)</label>
          <input id="supplier-lead" type="number" min="0" value={leadTimeDays} onChange={(e) => setLeadTimeDays(e.target.value)} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500" />
        </div>
      </div>

      <div>
        <label htmlFor="supplier-address" className="mb-1 block text-xs font-medium text-neutral-600">Address</label>
        <input id="supplier-address" type="text" value={address} onChange={(e) => setAddress(e.target.value)} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500" />
      </div>

      <div>
        <label htmlFor="supplier-terms" className="mb-1 block text-xs font-medium text-neutral-600">Payment Terms</label>
        <input id="supplier-terms" type="text" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="e.g. Net 30, COD" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500" />
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" variant="primary" fullWidth disabled={!name.trim() || saving}>
          {saving ? 'Saving...' : supplier ? 'Update Supplier' : 'Add Supplier'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/pharmacy-lite/src/components/pharmacy/procurement/SupplierForm.tsx
git commit -m "feat(pharmacy-lite): SupplierForm — create/edit supplier with all fields"
```

---

### Task 7: Suppliers Page

**Files:**
- Create: `apps/pharmacy-lite/src/components/pharmacy/procurement/SuppliersPage.tsx`
- Create: `apps/pharmacy-lite/src/app/[locale]/inventory/suppliers/page.tsx`

- [ ] **Step 1: Create SuppliersPage**

```tsx
// apps/pharmacy-lite/src/components/pharmacy/procurement/SuppliersPage.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/Button'
import { getAllSuppliers, deactivateSupplier } from '@/lib/procurement/supplier-service'
import { SupplierForm } from './SupplierForm'
import type { Supplier } from '@/lib/procurement/types'

type View = 'list' | 'create' | 'edit'

export function SuppliersPage() {
  const [view, setView] = useState<View>('list')
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [editingSupplier, setEditingSupplier] = useState<Supplier | undefined>()
  const [loading, setLoading] = useState(true)

  const loadSuppliers = useCallback(async () => {
    setLoading(true)
    const data = await getAllSuppliers()
    setSuppliers(data)
    setLoading(false)
  }, [])

  useEffect(() => { loadSuppliers() }, [loadSuppliers])

  const handleEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier)
    setView('edit')
  }

  const handleDeactivate = async (supplier: Supplier) => {
    await deactivateSupplier(supplier.id)
    await loadSuppliers()
  }

  if (view === 'create' || view === 'edit') {
    return (
      <div className="space-y-4">
        <SupplierForm
          supplier={view === 'edit' ? editingSupplier : undefined}
          onSaved={() => { setView('list'); loadSuppliers() }}
          onCancel={() => setView('list')}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4" data-testid="suppliers-page">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-neutral-900">Suppliers</h1>
        <Button variant="primary" type="button" onClick={() => setView('create')}>+ Add Supplier</Button>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-neutral-400">Loading suppliers...</div>
      ) : suppliers.length === 0 ? (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-8 text-center">
          <p className="text-sm text-neutral-500">No suppliers yet.</p>
          <p className="text-xs text-neutral-400 mt-1">Add your first supplier to track where your stock comes from.</p>
        </div>
      ) : (
        <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 overflow-hidden">
          {suppliers.map((supplier) => (
            <div key={supplier.id} className="flex items-center justify-between px-4 py-3 bg-white">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-neutral-900">{supplier.name}</p>
                  {!supplier.isActive && (
                    <span className="text-xs text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded">Inactive</span>
                  )}
                </div>
                <p className="text-xs text-neutral-500">
                  {[supplier.contactName, supplier.phone].filter(Boolean).join(' · ') || 'No contact info'}
                </p>
              </div>
              <div className="flex gap-2 ms-3">
                <Button variant="secondary" type="button" onClick={() => handleEdit(supplier)}>Edit</Button>
                {supplier.isActive && (
                  <Button variant="ghost" type="button" onClick={() => handleDeactivate(supplier)}>Deactivate</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create route**

```tsx
// apps/pharmacy-lite/src/app/[locale]/inventory/suppliers/page.tsx
'use client'

import { SuppliersPage } from '@/components/pharmacy/procurement/SuppliersPage'

export default function SuppliersRoute() {
  return <SuppliersPage />
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/pharmacy-lite/src/components/pharmacy/procurement/SuppliersPage.tsx apps/pharmacy-lite/src/app/[locale]/inventory/suppliers/page.tsx
git commit -m "feat(pharmacy-lite): Suppliers page — list, create, edit, deactivate"
```

---

## Phase 4: Stock Count UI (Tasks 8-9)

### Task 8: Stock Count Form

**Files:**
- Create: `apps/pharmacy-lite/src/components/pharmacy/procurement/StockCountForm.tsx`

- [ ] **Step 1: Create StockCountForm**

```tsx
// apps/pharmacy-lite/src/components/pharmacy/procurement/StockCountForm.tsx
'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/Button'
import { CatalogSearchInput } from '@/components/pharmacy/inventory/CatalogSearchInput'
import { addCountItem, completeStockCount } from '@/lib/procurement/stock-count-service'
import { getFefoBatches } from '@/lib/inventory/fefo'
import { db } from '@/lib/db'
import type { StockCount, StockCountItem } from '@/lib/procurement/types'
import type { CatalogItem } from '@/lib/inventory/types'

interface StockCountFormProps {
  count: StockCount
  onCompleted: () => void
}

export function StockCountForm({ count, onCompleted }: StockCountFormProps) {
  const [items, setItems] = useState<StockCountItem[]>(count.items)
  const [completing, setCompleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAddProduct = useCallback(async (catalogItem: CatalogItem) => {
    // Get all active batches for this product
    const batches = await getFefoBatches(catalogItem.id)
    if (batches.length === 0) return

    const newItems: StockCountItem[] = batches
      .filter((b) => !items.some((i) => i.stockBatchId === b.id))
      .map((batch) => ({
        catalogItemId: catalogItem.id,
        catalogItemName: catalogItem.name,
        stockBatchId: batch.id,
        batchNumber: batch.batchNumber,
        expectedQty: batch.quantityOnHand,
        actualQty: batch.quantityOnHand, // Default to expected
        variance: 0,
      }))

    if (newItems.length > 0) {
      setItems((prev) => [...prev, ...newItems])
      // Persist each item
      for (const item of newItems) {
        await addCountItem(count.id, item)
      }
    }
  }, [count.id, items])

  const handleUpdateActual = useCallback(async (index: number, actualQty: number) => {
    setItems((prev) => {
      const updated = [...prev]
      const item = updated[index]!
      updated[index] = { ...item, actualQty, variance: actualQty - item.expectedQty }
      // Persist
      addCountItem(count.id, updated[index]!)
      return updated
    })
  }, [count.id])

  const handleComplete = async () => {
    setCompleting(true)
    setError(null)
    try {
      await completeStockCount(count.id)
      onCompleted()
    } catch {
      setError('Failed to complete stock count.')
    } finally {
      setCompleting(false)
    }
  }

  const varianceCount = items.filter((i) => i.variance !== 0).length

  return (
    <div className="space-y-4" data-testid="stock-count-form">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">
            {count.type === 'full' ? 'Full' : count.type === 'spot' ? 'Spot' : 'Controlled'} Count
          </h2>
          <p className="text-xs text-neutral-500">Started {new Date(count.startedAt).toLocaleString()}</p>
        </div>
        <div className="text-end">
          <p className="text-xs text-neutral-500">{items.length} items counted</p>
          {varianceCount > 0 && (
            <p className="text-xs font-semibold text-amber-700">{varianceCount} variance{varianceCount !== 1 ? 's' : ''}</p>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-md bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">{error}</div>
      )}

      {/* Add products to count */}
      <CatalogSearchInput onSelect={handleAddProduct} placeholder="Search product to count..." />

      {/* Count items table */}
      {items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-neutral-200">
          <table className="min-w-full divide-y divide-neutral-200">
            <thead className="bg-neutral-50">
              <tr>
                <th scope="col" className="px-4 py-2 text-start text-xs font-medium uppercase text-neutral-500">Product</th>
                <th scope="col" className="px-4 py-2 text-start text-xs font-medium uppercase text-neutral-500">Batch</th>
                <th scope="col" className="px-4 py-2 text-center text-xs font-medium uppercase text-neutral-500">Expected</th>
                <th scope="col" className="px-4 py-2 text-center text-xs font-medium uppercase text-neutral-500">Actual</th>
                <th scope="col" className="px-4 py-2 text-center text-xs font-medium uppercase text-neutral-500">Variance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {items.map((item, index) => (
                <tr key={item.stockBatchId} className={item.variance !== 0 ? 'bg-amber-50/50' : ''}>
                  <td className="px-4 py-2 text-sm text-neutral-900">{item.catalogItemName}</td>
                  <td className="px-4 py-2 text-sm text-neutral-600 font-mono">{item.batchNumber}</td>
                  <td className="px-4 py-2 text-center text-sm tabular-nums text-neutral-500">{item.expectedQty}</td>
                  <td className="px-4 py-2 text-center">
                    <input
                      type="number"
                      min={0}
                      value={item.actualQty}
                      onChange={(e) => handleUpdateActual(index, parseInt(e.target.value) || 0)}
                      className="w-20 rounded border border-neutral-300 px-2 py-1 text-center text-sm tabular-nums focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500"
                    />
                  </td>
                  <td className={`px-4 py-2 text-center text-sm font-semibold tabular-nums ${
                    item.variance === 0 ? 'text-neutral-400' :
                    item.variance > 0 ? 'text-green-700' : 'text-red-700'
                  }`}>
                    {item.variance > 0 ? '+' : ''}{item.variance}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Complete button */}
      {items.length > 0 && (
        <Button variant="primary" fullWidth type="button" disabled={completing} onClick={handleComplete} data-testid="complete-count-btn">
          {completing ? 'Completing...' : `Complete Count (${varianceCount} adjustment${varianceCount !== 1 ? 's' : ''})`}
        </Button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/pharmacy-lite/src/components/pharmacy/procurement/StockCountForm.tsx
git commit -m "feat(pharmacy-lite): StockCountForm — count items, enter actual quantities, show variances"
```

---

### Task 9: Stock Count Page

**Files:**
- Create: `apps/pharmacy-lite/src/components/pharmacy/procurement/StockCountPage.tsx`
- Create: `apps/pharmacy-lite/src/app/[locale]/inventory/count/page.tsx`

- [ ] **Step 1: Create StockCountPage**

```tsx
// apps/pharmacy-lite/src/components/pharmacy/procurement/StockCountPage.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/Button'
import { startStockCount, getActiveStockCount, getRecentStockCounts } from '@/lib/procurement/stock-count-service'
import { StockCountForm } from './StockCountForm'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import type { StockCount, StockCountType } from '@/lib/procurement/types'

export function StockCountPage() {
  const session = useAuthSessionStore((s) => s.session)
  const [activeCount, setActiveCount] = useState<StockCount | null>(null)
  const [recentCounts, setRecentCounts] = useState<StockCount[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    const [active, recent] = await Promise.all([
      getActiveStockCount(),
      getRecentStockCounts(5),
    ])
    setActiveCount(active)
    setRecentCounts(recent)
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleStartCount = async (type: StockCountType) => {
    if (!session) return
    const count = await startStockCount({
      type,
      countedBy: session.practitionerId ?? session.userId,
    })
    setActiveCount(count)
  }

  if (loading) {
    return <div className="py-8 text-center text-sm text-neutral-400">Loading...</div>
  }

  // Active count in progress
  if (activeCount) {
    return (
      <StockCountForm
        count={activeCount}
        onCompleted={() => { setActiveCount(null); loadData() }}
      />
    )
  }

  // Start new count
  return (
    <div className="space-y-6" data-testid="stock-count-page">
      <h1 className="text-xl font-bold text-neutral-900">Stock Count</h1>

      {/* Start count options */}
      <div className="grid grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => handleStartCount('full')}
          className="flex flex-col items-center gap-2 rounded-xl border border-neutral-200 bg-white p-5 text-center transition-colors hover:bg-neutral-50"
          data-testid="start-full-count"
        >
          <p className="text-sm font-semibold text-neutral-900">Full Count</p>
          <p className="text-xs text-neutral-500">All items in stock</p>
        </button>
        <button
          type="button"
          onClick={() => handleStartCount('spot')}
          className="flex flex-col items-center gap-2 rounded-xl border border-neutral-200 bg-white p-5 text-center transition-colors hover:bg-neutral-50"
          data-testid="start-spot-count"
        >
          <p className="text-sm font-semibold text-neutral-900">Spot Check</p>
          <p className="text-xs text-neutral-500">Selected items only</p>
        </button>
        <button
          type="button"
          onClick={() => handleStartCount('controlled_only')}
          className="flex flex-col items-center gap-2 rounded-xl border border-red-200 bg-red-50/30 p-5 text-center transition-colors hover:bg-red-50"
          data-testid="start-controlled-count"
        >
          <p className="text-sm font-semibold text-red-800">Controlled</p>
          <p className="text-xs text-red-600">Schedule II-V only</p>
        </button>
      </div>

      {/* Recent counts */}
      {recentCounts.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-neutral-700 mb-2">Recent Counts</h2>
          <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 overflow-hidden">
            {recentCounts.map((count) => (
              <div key={count.id} className="flex items-center justify-between px-4 py-3 bg-white">
                <div>
                  <p className="text-sm text-neutral-900 capitalize">{count.type.replace('_', ' ')} Count</p>
                  <p className="text-xs text-neutral-500">
                    {count.completedAt ? new Date(count.completedAt).toLocaleString() : 'In progress'}
                    {' · '}{count.items.length} items
                  </p>
                </div>
                <div className="text-end">
                  {count.totalVarianceItems > 0 ? (
                    <span className="text-xs font-semibold text-amber-700">{count.totalVarianceItems} variance{count.totalVarianceItems !== 1 ? 's' : ''}</span>
                  ) : (
                    <span className="text-xs text-green-700">No variances</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create route**

```tsx
// apps/pharmacy-lite/src/app/[locale]/inventory/count/page.tsx
'use client'

import { StockCountPage } from '@/components/pharmacy/procurement/StockCountPage'

export default function StockCountRoute() {
  return <StockCountPage />
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/pharmacy-lite/src/components/pharmacy/procurement/StockCountPage.tsx apps/pharmacy-lite/src/app/[locale]/inventory/count/page.tsx
git commit -m "feat(pharmacy-lite): Stock Count page — full/spot/controlled counts with variance tracking"
```

---

## Phase 5: Controlled Substances Upgrade + Navigation (Tasks 10-11)

### Task 10: Upgrade ControlledSubstancesView

**Files:**
- Modify: `apps/pharmacy-lite/src/components/pharmacy/ControlledSubstancesView.tsx`

- [ ] **Step 1: Add controlled substance running balance section**

At the top of the component, add a section that shows the running balance of controlled substances using `getControlledSubstanceBalances()` from the stock count service.

Add import:
```tsx
import { getControlledSubstanceBalances } from '@/lib/procurement/stock-count-service'
```

Add state:
```tsx
const [balances, setBalances] = useState<{ catalogItemId: string; catalogItemName: string; schedule: string; totalOnHand: number; batchCount: number }[]>([])
```

Load balances in the existing `fetchData` useEffect:
```tsx
const balanceData = await getControlledSubstanceBalances()
setBalances(balanceData)
```

Add a "Running Balances" section before the existing table:
```tsx
{balances.length > 0 && (
  <div className="mt-4 mb-6">
    <h2 className="text-sm font-semibold text-neutral-700 mb-2">Controlled Substance Balances</h2>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {balances.map((item) => (
        <div key={item.catalogItemId} className="rounded-lg border border-red-200 bg-red-50/30 p-3">
          <p className="text-xs font-bold text-red-800">C{item.schedule}</p>
          <p className="text-sm font-medium text-neutral-900">{item.catalogItemName}</p>
          <p className="text-lg font-bold tabular-nums text-neutral-900">{item.totalOnHand}</p>
          <p className="text-[10px] text-neutral-500">{item.batchCount} batch{item.batchCount !== 1 ? 'es' : ''}</p>
        </div>
      ))}
    </div>
  </div>
)}
```

Also update the Schedule column in the table to read from catalog instead of showing "---":

Replace the hardcoded `---` in the schedule column cell with:
```tsx
{/* Look up schedule from catalog — requires joining on medication code */}
{d.medicationCodeableConcept?.coding?.[0]?.code ? 'See balance above' : '---'}
```

(Note: Full catalog-to-dispense joining requires the `catalogItemId` to be stored on dispenses, which happens when FEFO batch selection is active. For dispenses created before inventory integration, this will still show '---'.)

- [ ] **Step 2: Commit**

```bash
git add apps/pharmacy-lite/src/components/pharmacy/ControlledSubstancesView.tsx
git commit -m "feat(pharmacy-lite): ControlledSubstancesView — running balance cards for controlled substances"
```

---

### Task 11: Add Procurement Nav Items to Sidebar

**Files:**
- Modify: `apps/pharmacy-lite/src/components/AppShellWrapper.tsx`
- Modify: `apps/pharmacy-lite/messages/en.json`
- Modify: `apps/pharmacy-lite/messages/ar.json`
- Modify: `apps/pharmacy-lite/messages/prs.json`

- [ ] **Step 1: Add nav items and icons**

In `AppShellWrapper.tsx`, add icons:
```tsx
suppliers: (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
),
stockCount: (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 11l3 3L22 4" />
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </svg>
),
```

Add nav items to the inventory group (after the existing catalog item):
```tsx
{ label: t('suppliers'), href: '/inventory/suppliers', icon: icons.suppliers, active: pathname === '/inventory/suppliers', group: 'inventory' },
{ label: t('stockCount'), href: '/inventory/count', icon: icons.stockCount, active: pathname === '/inventory/count', group: 'inventory' },
```

Add `/inventory/suppliers` and `/inventory/count` to `wideRoutes`.

- [ ] **Step 2: Add i18n keys**

In `en.json` sidebar:
```json
"suppliers": "Suppliers",
"stockCount": "Stock Count"
```

In `ar.json` sidebar:
```json
"suppliers": "الموردون",
"stockCount": "جرد المخزون"
```

In `prs.json` sidebar:
```json
"suppliers": "تأمین کنندگان",
"stockCount": "شمارش موجودی"
```

- [ ] **Step 3: Commit**

```bash
git add apps/pharmacy-lite/src/components/AppShellWrapper.tsx apps/pharmacy-lite/messages/en.json apps/pharmacy-lite/messages/ar.json apps/pharmacy-lite/messages/prs.json
git commit -m "feat(pharmacy-lite): add Suppliers and Stock Count nav items to sidebar with i18n"
```

---

## Summary

| Phase | Tasks | What it delivers |
|-------|-------|-----------------|
| **1. Types + Schema** | 1-2 | Procurement types, Dexie v9 (suppliers, POs, stock counts) |
| **2. Services** | 3-5 | Supplier CRUD, PO lifecycle, stock count with adjustment generation |
| **3. Supplier UI** | 6-7 | Supplier form + page (list, create, edit, deactivate) |
| **4. Stock Count UI** | 8-9 | Stock count form (scan/search, enter actuals, variances) + page (start/history) |
| **5. Integration** | 10-11 | Controlled substances running balance, sidebar navigation |

**Total: 11 tasks, 5 phases.**

After completion, pharmacy-lite will:
- Manage suppliers (contacts, lead times, payment terms)
- Track which supplier provided each batch (via goods receiving)
- Perform physical stock counts (full, spot, controlled-only)
- Auto-generate adjustment movements for count variances
- Flag controlled substance discrepancies with `[CONTROLLED]` prefix
- Show running balances for all controlled items (Schedule II-V)
- Navigate to Suppliers and Stock Count from the sidebar

**Note:** Purchase Order pages (create PO, receive against PO) are intentionally deferred to reduce scope. The PO service is built and ready — the UI can be added when `enablePurchaseOrders` is wired. The Receive Stock page already has a `purchaseOrderId` field in the goods receipt; adding PO selection UI is a future task.
