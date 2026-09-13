# Procurement Phase 4b — Reorder Report + Suggested POs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface items due for reorder (on-hand ≤ reorder point, with suggested qty + supplier + cost) and draft purchase orders grouped by supplier from the selected lines.

**Architecture:** A pure `computeSuggestedQty`; a `reorder-service` (`getReorderReport` + `getLastPurchaseCost` + `generateReorderPurchaseOrders`) reading existing stores and 4a's `getPreferredSupplierItem`; a `/inventory/reorder` view with per-line checkbox + editable qty/cost + supplier select. Draft-only via `createPurchaseOrder` (into the 3b gate, auto-audited by 3a). No Dexie bump, no new audit verb.

**Tech Stack:** Next.js 15 PWA, TypeScript, Dexie/IndexedDB, next-intl (en/ar/prs/ps), ShadCN via `@ultranos/ui-kit`, Vitest + fake-indexeddb + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-13-procurement-phase4b-reorder-suggested-pos-design.md`

## Global Constraints

- **Money = integer minor units.** `ReorderLine.unitCost` is minor units (from `supplierItem.unitPrice` or a batch `costPrice`); the UI edits in major units and re-parses (`Math.round(parseFloat(v) * 10 ** minorUnits)`) before calling the service.
- **Suggested qty** = `reorderQuantity ?? (maxStock − onHand) ?? (reorderPoint − onHand)`, clamped ≥ 0, then `max(…, moq ?? 0)`.
- **Report inclusion:** an item appears iff `isActive && reorderPoint > 0 && onHand ≤ reorderPoint`. Zero-stock items (no active batch → `onHand = 0`) ARE included.
- **Unit-cost fallback:** `preferred supplierItem.unitPrice ?? getLastPurchaseCost(id) ?? 0`.
- **Draft-only:** `generateReorderPurchaseOrders` groups by `supplierId` and drafts ONE `createPurchaseOrder` per supplier (status `draft`). It does NOT send — drafts flow into the 3b approval/send gate. Each drafted PO auto-emits the 3a `PO_CREATED` audit (no new verb here).
- **No Dexie bump** (reads existing stores only). No PHI (items/suppliers/quantities/prices are operational).
- **Design system (UI):** semantic oklch tokens only (no hex/raw oklch), money `font-numeric`, RTL logical props (`ms-*`/`me-*`, `text-start`/`text-end`), ShadCN from `@/components/ui/*`, icons from `@ultranos/ui-kit/icons`, `EmptyState` for empty/loading, OPD list-page layout.
- **i18n:** all strings across `messages/{en,ar,prs,ps}.json`; identical key sets; genuine Pashto.
- **Known baseline:** 6 pre-existing typecheck errors in unrelated test files — reviewers judge only NEW errors in touched files.

---

## File Structure

**Create:** `src/lib/procurement/reorder.ts`; `src/lib/procurement/reorder-service.ts`; `src/components/pharmacy/inventory/ReorderReportPage.tsx`; `src/app/[locale]/(app)/inventory/reorder/page.tsx`; tests.
**Modify:** `src/components/sidebar/nav-config.ts`; `messages/{en,ar,prs,ps}.json`.

**Test harness (service tests):**
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'

beforeEach(async () => {
  await db.delete(); await db.open()
  if (!encryptionKeyStore.isReady()) {
    encryptionKeyStore.setKey(await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']))
  }
})
```

---

## Task 1: Pure `computeSuggestedQty`

**Files:**
- Create: `src/lib/procurement/reorder.ts`
- Test: `src/__tests__/reorder-logic.test.ts`

**Interfaces:**
- Produces: `computeSuggestedQty(item: { reorderQuantity?: number; maxStock?: number; reorderPoint: number }, onHand: number, moq?: number): number`.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/reorder-logic.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { computeSuggestedQty } from '@/lib/procurement/reorder'

describe('computeSuggestedQty', () => {
  it('uses reorderQuantity when set', () => {
    expect(computeSuggestedQty({ reorderQuantity: 50, maxStock: 100, reorderPoint: 10 }, 3)).toBe(50)
  })
  it('falls back to maxStock - onHand', () => {
    expect(computeSuggestedQty({ maxStock: 100, reorderPoint: 10 }, 30)).toBe(70)
  })
  it('falls back to reorderPoint - onHand when no maxStock', () => {
    expect(computeSuggestedQty({ reorderPoint: 10 }, 4)).toBe(6)
  })
  it('clamps to 0 (never negative when onHand exceeds maxStock)', () => {
    expect(computeSuggestedQty({ maxStock: 20, reorderPoint: 10 }, 25)).toBe(0)
  })
  it('raises the result to the MOQ', () => {
    expect(computeSuggestedQty({ reorderPoint: 10 }, 8, 25)).toBe(25) // gap 2 → raised to 25
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F pharmacy-lite test run reorder-logic`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/procurement/reorder.ts`:
```ts
/**
 * Suggested reorder quantity: an explicit per-item reorderQuantity if set, else
 * top up to maxStock, else cover the reorderPoint gap. Clamped ≥ 0, then raised to
 * the supplier's minimum order quantity (moq). Integer units, pure.
 */
export function computeSuggestedQty(
  item: { reorderQuantity?: number; maxStock?: number; reorderPoint: number },
  onHand: number,
  moq?: number,
): number {
  const base =
    item.reorderQuantity != null ? item.reorderQuantity
    : item.maxStock != null ? item.maxStock - onHand
    : item.reorderPoint - onHand
  return Math.max(base, moq ?? 0, 0)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -F pharmacy-lite test run reorder-logic`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**
```bash
git add apps/pharmacy-lite/src/lib/procurement/reorder.ts apps/pharmacy-lite/src/__tests__/reorder-logic.test.ts
git commit -m "feat(pharmacy-lite): pure computeSuggestedQty reorder helper"
```

---

## Task 2: Reorder service (report + last-cost + PO generation)

**Files:**
- Create: `src/lib/procurement/reorder-service.ts`
- Test: `src/__tests__/reorder-service.test.ts`

**Interfaces:**
- Consumes: `db.stockBatches`/`db.catalogItems`; `computeSuggestedQty` (Task 1); `getPreferredSupplierItem`, `upsertSupplierItem` (4a supplier-item-service); `getSupplierById` (supplier-service); `createPurchaseOrder` (purchase-order-service — item shape `{ catalogItemId, catalogItemName, quantityOrdered, unitCost }`).
- Produces:
  - `interface ReorderLine { catalogItemId; catalogItemName; onHand; reorderPoint; suggestedQty; preferredSupplierId?; preferredSupplierName?; unitCost }`
  - `getLastPurchaseCost(catalogItemId: string): Promise<number | undefined>`
  - `getReorderReport(): Promise<ReorderLine[]>`
  - `generateReorderPurchaseOrders(selected: { catalogItemId; catalogItemName; quantity; unitCost; supplierId }[], createdBy: string): Promise<PurchaseOrder[]>`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/reorder-service.test.ts` (harness above):
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { getLastPurchaseCost, getReorderReport, generateReorderPurchaseOrders } from '@/lib/procurement/reorder-service'
import { upsertSupplierItem } from '@/lib/procurement/supplier-item-service'
import type { CatalogItem, StockBatch } from '@/lib/inventory/types'

beforeEach(async () => {
  await db.delete(); await db.open()
  if (!encryptionKeyStore.isReady()) {
    encryptionKeyStore.setKey(await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']))
  }
})

function cat(over: Partial<CatalogItem>): CatalogItem {
  return {
    id: 'c1', name: 'Amoxicillin', form: 'tablet', strength: '500', strengthUnit: 'mg', packSize: 10,
    category: 'antibiotic', defaultSellingPrice: 150, reorderPoint: 10, isActive: true,
    lastSyncedAt: 'h', ...over,
  } as CatalogItem
}
function batch(over: Partial<StockBatch>): StockBatch {
  return {
    id: 'b1', catalogItemId: 'c1', batchNumber: 'B1', expiryDate: '2027-01-01', quantityOnHand: 5,
    costPrice: 100, sellingPrice: 150, receivedAt: '2026-01-01T00:00:00.000Z', status: 'active',
    locationId: 'loc1', hlcTimestamp: 'h', ...over,
  } as StockBatch
}

describe('getLastPurchaseCost', () => {
  it('returns the newest batch costPrice; undefined when none', async () => {
    await db.stockBatches.bulkPut([
      batch({ id: 'b1', costPrice: 100, receivedAt: '2026-01-01T00:00:00.000Z' }),
      batch({ id: 'b2', costPrice: 130, receivedAt: '2026-03-01T00:00:00.000Z' }),
    ])
    expect(await getLastPurchaseCost('c1')).toBe(130)
    expect(await getLastPurchaseCost('nope')).toBeUndefined()
  })
})

describe('getReorderReport', () => {
  it('includes items at/below reorderPoint (incl. zero-stock), excludes above + reorderPoint 0', async () => {
    await db.catalogItems.bulkPut([
      cat({ id: 'low', name: 'Low', reorderPoint: 10, maxStock: 100 }),      // onHand 5 ≤ 10 → included
      cat({ id: 'zero', name: 'Zero', reorderPoint: 5 }),                    // no batch → onHand 0 ≤ 5 → included
      cat({ id: 'ok', name: 'Ok', reorderPoint: 10 }),                       // onHand 50 > 10 → excluded
      cat({ id: 'untracked', name: 'Untracked', reorderPoint: 0 }),         // reorderPoint 0 → excluded
    ])
    await db.stockBatches.bulkPut([
      batch({ id: 'lb', catalogItemId: 'low', quantityOnHand: 5, costPrice: 100 }),
      batch({ id: 'okb', catalogItemId: 'ok', quantityOnHand: 50 }),
    ])
    const rows = await getReorderReport()
    expect(rows.map((r) => r.catalogItemId).sort()).toEqual(['low', 'zero'])
    const low = rows.find((r) => r.catalogItemId === 'low')!
    expect(low.onHand).toBe(5)
    expect(low.suggestedQty).toBe(95)          // maxStock 100 − 5
    expect(low.unitCost).toBe(100)             // last batch cost (no preferred supplier)
  })
  it('uses the preferred supplier price + name + MOQ', async () => {
    await db.catalogItems.put(cat({ id: 'c1', reorderPoint: 10 }))
    await db.stockBatches.put(batch({ catalogItemId: 'c1', quantityOnHand: 2 }))
    await db.suppliers.put({ id: 'sup1', name: 'Acme', isActive: true, createdAt: 'h' })
    await upsertSupplierItem({ supplierId: 'sup1', catalogItemId: 'c1', unitPrice: 90, minOrderQty: 50, isPreferred: true, createdBy: 'u1' })
    const rows = await getReorderReport()
    const r = rows.find((x) => x.catalogItemId === 'c1')!
    expect(r.preferredSupplierId).toBe('sup1')
    expect(r.preferredSupplierName).toBe('Acme')
    expect(r.unitCost).toBe(90)                // preferred price beats last batch cost
    expect(r.suggestedQty).toBe(50)            // gap 8 → raised to MOQ 50
  })
})

describe('generateReorderPurchaseOrders', () => {
  it('groups selected lines by supplier into one draft PO each; drops qty ≤ 0', async () => {
    await db.suppliers.bulkPut([
      { id: 'sup1', name: 'Acme', isActive: true, createdAt: 'h' },
      { id: 'sup2', name: 'Globex', isActive: true, createdAt: 'h' },
    ])
    const pos = await generateReorderPurchaseOrders([
      { catalogItemId: 'a', catalogItemName: 'A', quantity: 10, unitCost: 100, supplierId: 'sup1' },
      { catalogItemId: 'b', catalogItemName: 'B', quantity: 5, unitCost: 200, supplierId: 'sup1' },
      { catalogItemId: 'c', catalogItemName: 'C', quantity: 8, unitCost: 50, supplierId: 'sup2' },
      { catalogItemId: 'd', catalogItemName: 'D', quantity: 0, unitCost: 10, supplierId: 'sup2' }, // dropped
    ], 'u1')
    expect(pos).toHaveLength(2)
    const acme = pos.find((p) => p.supplierId === 'sup1')!
    expect(acme.status).toBe('draft')
    expect(acme.items).toHaveLength(2)
    const globex = pos.find((p) => p.supplierId === 'sup2')!
    expect(globex.items).toHaveLength(1) // qty-0 line dropped
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F pharmacy-lite test run reorder-service`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/procurement/reorder-service.ts`:
```ts
import { db } from '@/lib/db'
import { computeSuggestedQty } from './reorder'
import { getPreferredSupplierItem } from './supplier-item-service'
import { getSupplierById } from './supplier-service'
import { createPurchaseOrder } from './purchase-order-service'
import type { PurchaseOrder } from './types'

export interface ReorderLine {
  catalogItemId: string
  catalogItemName: string
  onHand: number
  reorderPoint: number
  suggestedQty: number
  preferredSupplierId?: string
  preferredSupplierName?: string
  unitCost: number   // minor units
}

/** costPrice of the most recent stock batch (any status) for the item, or undefined. */
export async function getLastPurchaseCost(catalogItemId: string): Promise<number | undefined> {
  const batches = await db.stockBatches.where('catalogItemId').equals(catalogItemId).toArray()
  if (batches.length === 0) return undefined
  batches.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
  return batches[0]!.costPrice
}

export async function getReorderReport(): Promise<ReorderLine[]> {
  const activeBatches = await db.stockBatches.where('status').equals('active').toArray()
  const onHandByItem = new Map<string, number>()
  for (const b of activeBatches) {
    onHandByItem.set(b.catalogItemId, (onHandByItem.get(b.catalogItemId) ?? 0) + b.quantityOnHand)
  }
  const items = (await db.catalogItems.toArray()).filter((c) => c.isActive && c.reorderPoint > 0)
  const lines: ReorderLine[] = []
  for (const item of items) {
    const onHand = onHandByItem.get(item.id) ?? 0
    if (onHand > item.reorderPoint) continue
    const preferred = await getPreferredSupplierItem(item.id)
    const suggestedQty = computeSuggestedQty(item, onHand, preferred?.minOrderQty)
    const unitCost = preferred?.unitPrice ?? (await getLastPurchaseCost(item.id)) ?? 0
    const preferredSupplierName = preferred ? (await getSupplierById(preferred.supplierId))?.name : undefined
    lines.push({
      catalogItemId: item.id, catalogItemName: item.name, onHand, reorderPoint: item.reorderPoint,
      suggestedQty, preferredSupplierId: preferred?.supplierId, preferredSupplierName, unitCost,
    })
  }
  return lines.sort((a, b) => a.catalogItemName.localeCompare(b.catalogItemName))
}

export async function generateReorderPurchaseOrders(
  selected: { catalogItemId: string; catalogItemName: string; quantity: number; unitCost: number; supplierId: string }[],
  createdBy: string,
): Promise<PurchaseOrder[]> {
  const valid = selected.filter((l) => l.quantity > 0)
  const bySupplier = new Map<string, typeof valid>()
  for (const l of valid) {
    const g = bySupplier.get(l.supplierId) ?? []
    g.push(l)
    bySupplier.set(l.supplierId, g)
  }
  const pos: PurchaseOrder[] = []
  for (const [supplierId, group] of bySupplier) {
    const supplier = await getSupplierById(supplierId)
    const po = await createPurchaseOrder({
      supplierId,
      supplierName: supplier?.name ?? supplierId,
      items: group.map((l) => ({
        catalogItemId: l.catalogItemId, catalogItemName: l.catalogItemName,
        quantityOrdered: l.quantity, unitCost: l.unitCost,
      })),
      createdBy,
    })
    pos.push(po)
  }
  return pos
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -F pharmacy-lite test run reorder-service`
Expected: PASS. `pnpm -F pharmacy-lite typecheck` — no new errors in the touched file.

- [ ] **Step 5: Commit**
```bash
git add apps/pharmacy-lite/src/lib/procurement/reorder-service.ts apps/pharmacy-lite/src/__tests__/reorder-service.test.ts
git commit -m "feat(pharmacy-lite): reorder report + suggested-PO generation service"
```

---

## Task 3: i18n (4 locales)

**Files:**
- Modify: `apps/pharmacy-lite/messages/{en,ar,prs,ps}.json`

**Interfaces:**
- Produces: a `reorder` namespace + `sidebar.reorder`. Task 4 consumes these.

- [ ] **Step 1: Add the keys to `en.json`**

Add a new top-level `"reorder"` namespace (near `inventory`):
```json
"reorder": {
  "title": "Reorder",
  "loading": "Loading…",
  "empty": "Nothing needs reordering",
  "emptyDescription": "Items at or below their reorder point will appear here.",
  "colItem": "Item",
  "colOnHand": "On hand",
  "colReorderPoint": "Reorder point",
  "colQty": "Order qty",
  "colSupplier": "Supplier",
  "colUnitCost": "Unit cost",
  "colLineTotal": "Line total",
  "supplierPlaceholder": "Choose supplier…",
  "noSupplierHint": "Set a supplier to include",
  "generate": "Generate draft PO(s)",
  "generating": "Generating…",
  "generateError": "Could not generate purchase orders.",
  "generatedSummary": "{count} draft purchase order(s) created",
  "viewOrders": "View orders"
},
```
Add `"reorder": "Reorder"` to the existing `"sidebar"` namespace.

- [ ] **Step 2: Mirror into `ar.json`, `prs.json`, `ps.json`**

Same key sets, accurate translations (ar Arabic, prs Dari, ps genuine Pashto — not Arabic-copied). Preserve the `{count}` placeholder. Identical key sets across all four.

- [ ] **Step 3: Verify parity + JSON validity**

Run:
```bash
node -e "const l=['en','ar','prs','ps'].map(x=>JSON.parse(require('fs').readFileSync('apps/pharmacy-lite/messages/'+x+'.json','utf8')));const keys=o=>Object.keys(o).sort().join(',');const chk=(ns)=>l.every(m=>keys(m[ns])===keys(l[0][ns]))||ns;console.log(['reorder','sidebar'].map(chk).filter(x=>x!==true).length?'PARITY FAIL':'PARITY OK')"
```
Expected: `PARITY OK`.

- [ ] **Step 4: Commit**
```bash
git add apps/pharmacy-lite/messages/en.json apps/pharmacy-lite/messages/ar.json apps/pharmacy-lite/messages/prs.json apps/pharmacy-lite/messages/ps.json
git commit -m "feat(pharmacy-lite): i18n for reorder report (4 locales)"
```

---

## Task 4: Reorder report view + route + nav

**Files:**
- Create: `src/components/pharmacy/inventory/ReorderReportPage.tsx`
- Create: `src/app/[locale]/(app)/inventory/reorder/page.tsx`
- Modify: `src/components/sidebar/nav-config.ts` (add Reorder item)
- Test: `src/__tests__/ReorderReportPage.test.tsx`

**Interfaces:**
- Consumes: `getReorderReport`, `generateReorderPurchaseOrders`, `ReorderLine` (Task 2); `getActiveSuppliers` (`@/lib/procurement/supplier-service`); the `reorder` i18n (Task 3); `useAuthSessionStore`.

- [ ] **Step 1: Add the nav item**

In `nav-config.ts`, add to the Inventory group (after `reorderPoint`-related items — e.g. after `stockOverview` or near `purchaseOrders`; put it after `catalog`):
```ts
      { titleKey: 'reorder',       url: '/inventory/reorder' },
```

- [ ] **Step 2: Write the failing test**

Create `src/__tests__/ReorderReportPage.test.tsx`. Mock next-intl (passthrough), `getReorderReport`/`generateReorderPurchaseOrders`, `getActiveSuppliers`, `db` (settings), auth store, next/navigation. Assert: a reorder line renders (item name); a line WITH a preferred supplier is selectable and "Generate" calls `generateReorderPurchaseOrders`; the empty state shows when none:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ReorderReportPage } from '@/components/pharmacy/inventory/ReorderReportPage'

vi.mock('next-intl', () => ({ useTranslations: () => (k: string, v?: Record<string, unknown>) => (v ? `${k}:${JSON.stringify(v)}` : k) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
const getReorderReport = vi.fn()
const generateReorderPurchaseOrders = vi.fn().mockResolvedValue([{ id: 'po1' }])
vi.mock('@/lib/procurement/reorder-service', () => ({
  getReorderReport: () => getReorderReport(),
  generateReorderPurchaseOrders: (...a: unknown[]) => generateReorderPurchaseOrders(...a),
}))
vi.mock('@/lib/procurement/supplier-service', () => ({ getActiveSuppliers: async () => [{ id: 'sup1', name: 'Acme' }, { id: 'sup2', name: 'Globex' }] }))
vi.mock('@/stores/auth-session-store', () => ({ useAuthSessionStore: Object.assign((sel: (s: unknown) => unknown) => sel({ session: { userId: 'u1', practitionerId: 'u1' } }), { getState: () => ({ session: { userId: 'u1', practitionerId: 'u1' } }) }) }))
vi.mock('@/lib/db', () => ({ db: { pharmacySettings: { toCollection: () => ({ first: async () => ({ currency: 'AFN', currencyMinorUnits: 2 }) }) } } }))

beforeEach(() => { getReorderReport.mockReset(); generateReorderPurchaseOrders.mockClear() })

describe('ReorderReportPage', () => {
  it('renders a reorder line and generates draft POs for a line with a preferred supplier', async () => {
    getReorderReport.mockResolvedValue([
      { catalogItemId: 'c1', catalogItemName: 'Amoxicillin', onHand: 5, reorderPoint: 10, suggestedQty: 95, preferredSupplierId: 'sup1', preferredSupplierName: 'Acme', unitCost: 100 },
    ])
    render(<ReorderReportPage />)
    expect(await screen.findByText('Amoxicillin')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('generate-pos-btn'))
    await waitFor(() => expect(generateReorderPurchaseOrders).toHaveBeenCalled())
  })
  it('shows the empty state when nothing needs reordering', async () => {
    getReorderReport.mockResolvedValue([])
    render(<ReorderReportPage />)
    expect(await screen.findByText('empty')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm -F pharmacy-lite test run ReorderReportPage`
Expected: FAIL — component not found.

- [ ] **Step 4: Implement the page**

Create `src/components/pharmacy/inventory/ReorderReportPage.tsx`, `t = useTranslations('reorder')`, OPD list-page standard (mirror `SupplierPayablesPage.tsx`):
- Load `getReorderReport()` + `getActiveSuppliers()` + currency (`db.pharmacySettings`) into state; `performedBy = session?.practitionerId ?? session?.userId ?? 'unknown'` via `useAuthSessionStore`.
- Per-line UI state (keyed by `catalogItemId`): `selected` (default `true` when the line has a `preferredSupplierId`, else `false`), `qty` (default `suggestedQty`), `supplierId` (default `preferredSupplierId ?? ''`), `unitCostMajor` (default `(line.unitCost / 10**minorUnits).toFixed(minorUnits)`). Store as a `Map`/record in state; initialize from the loaded report.
- Standalone `<h1>{t('title')}</h1>`; one content box (`overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50`) with loading / empty (`EmptyState` icon e.g. `PackageSearch`, `title={t('empty')} description={t('emptyDescription')}`) / table.
- Toolbar row: the **Generate** primary action (`data-testid="generate-pos-btn"`, label `t('generate')`) → build `selected` lines (those checked with an effective supplierId + qty>0) as `{ catalogItemId, catalogItemName, quantity: qty, unitCost: Math.round(parseFloat(unitCostMajor)*10**minorUnits), supplierId }`, call `generateReorderPurchaseOrders(lines, performedBy)`, then show a success notice `t('generatedSummary', { count: pos.length })` + a link/button `t('viewOrders')` → `/inventory/orders`, and reload the report. Disable Generate when no includable line is selected. Catch → inline `t('generateError')`.
- Table columns: checkbox (disabled when no effective supplier; a muted `t('noSupplierHint')` shown for such rows), item, on-hand (`font-numeric`), reorder point, qty (editable `<Input type="number">`), supplier (`<select>`: an empty `t('supplierPlaceholder')` option + active suppliers; value = the row's supplierId; changing it enables the checkbox), unit cost (editable `<Input type="number">` in major units), line total (`font-numeric`, `qty × unitCost` in major units). `<thead className="bg-muted">` + standard th; `<tbody className="divide-y divide-border">`; rows `hover:bg-muted/50` `key={line.catalogItemId}`.
- Design system: semantic tokens, `font-numeric` money/qty, RTL logical props, ShadCN `<Input>`/`<Button>`, `EmptyState`/icons from ui-kit, filter `<select>` `rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm`.

- [ ] **Step 5: Create the route**

Create `src/app/[locale]/(app)/inventory/reorder/page.tsx`:
```tsx
import { ReorderReportPage } from '@/components/pharmacy/inventory/ReorderReportPage'
export default function Page() {
  return <ReorderReportPage />
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm -F pharmacy-lite test run ReorderReportPage`
Expected: PASS (2 tests). `pnpm -F pharmacy-lite typecheck` — no new errors.

- [ ] **Step 7: Commit**
```bash
git add apps/pharmacy-lite/src/components/pharmacy/inventory/ReorderReportPage.tsx apps/pharmacy-lite/src/app/[locale]/\(app\)/inventory/reorder/page.tsx apps/pharmacy-lite/src/components/sidebar/nav-config.ts apps/pharmacy-lite/src/__tests__/ReorderReportPage.test.tsx
git commit -m "feat(pharmacy-lite): reorder report view + suggested-PO generation + nav"
```

---

## Final Verification (after all tasks)

- [ ] `pnpm -F pharmacy-lite test` — full suite green (new + regression). Pre-existing unrelated errors (jsdom canvas-getContext; SyncQueueDashboard DatabaseClosedError teardown) are not this work.
- [ ] `pnpm -F pharmacy-lite typecheck` — only the 6 known pre-existing unrelated-file errors; zero new in touched files.
- [ ] End-to-end sanity: an item at/below reorderPoint with a preferred supplier appears in the report with the right suggested qty + unit cost; "Generate" drafts one PO per supplier (status draft); the drafted PO appears under Orders and (if over the 3b threshold) requires approval before sending.
- [ ] No PHI in logs; RTL logical props only on touched UI; drafted POs emit `PO_CREATED` (3a).
