# Procurement Phase 4a — Supplier Master + Supplier↔Item Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich the supplier master and record which supplier(s) supply each catalog item (per-supplier price/MOQ/lead-time + a single preferred source), plus a per-item reorder quantity — the sourcing data layer Phase 4b's reorder generator consumes.

**Architecture:** Additive `Supplier`/`CatalogItem` fields + a new `supplierItems` junction store (Dexie v20). A `supplier-item-service` owns junction CRUD and the one-preferred-per-item invariant (transactional). UI: enrichment fields on `SupplierForm`, a `reorderQuantity` field + an embedded `SupplierItemsManager` on `CatalogItemFormDialog`.

**Tech Stack:** Next.js 15 PWA, TypeScript, Dexie/IndexedDB, next-intl (en/ar/prs/ps), ShadCN via `@ultranos/ui-kit`, Vitest + fake-indexeddb + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-13-procurement-phase4a-supplier-master-item-catalog-design.md`

## Global Constraints

- **Money = integer minor units** (`unitPrice`, `minOrderValue`); `Math.round` for major→minor parse.
- **One preferred supplier per item:** `setPreferredSupplier` and `upsertSupplierItem({isPreferred:true})` clear `isPreferred` on all OTHER `supplierItems` rows for that `catalogItemId` IN THE SAME transaction. Never >1 preferred per item.
- **Dexie:** append a NEW `this.version(20)` block for the `supplierItems` store; NEVER edit v1–v19. `Supplier`/`CatalogItem` field additions are additive (no store/index change). A brand-new store needs no `upgrade()`.
- **Catalog sync safety:** `reorderQuantity` is written via `updateCatalogItem`, which already sets `locallyModified: true` — the existing catalog-sync dirty-guard then protects it. Do NOT change `catalog-sync.ts`.
- **Sync:** every `supplierItems` mutation (create/update/delete, and each row whose `isPreferred` was cleared) enqueues via `enqueuePharmacySyncEntry({ resourceType: 'SupplierItem', resourceId, action, payload, hlcTimestamp, createdAt })`. Non-PHI operational data — not encrypted (consistent with the other procurement stores).
- **No audit** for these config edits (they are not procurement state-transitions).
- **Design system (UI):** semantic oklch tokens only (no hex/raw oklch), money `font-numeric`, RTL logical props (`ms-*`/`me-*`, `text-start`/`text-end`), ShadCN from `@/components/ui/*`, icons from `@ultranos/ui-kit/icons`, `EmptyState` for empty lists.
- **i18n:** all strings across `messages/{en,ar,prs,ps}.json`; identical key sets; genuine Pashto.
- **Known baseline:** 6 pre-existing typecheck errors in unrelated test files — reviewers judge only NEW errors in touched files.

---

## File Structure

**Modify:** `src/lib/procurement/types.ts` (Supplier fields + SupplierItem); `src/lib/inventory/types.ts` (CatalogItem.reorderQuantity); `src/lib/db.ts` (supplierItems store + v20); `src/lib/procurement/supplier-service.ts` (5 fields); `src/lib/inventory/catalog-item-service.ts` (reorderQuantity input); `src/components/pharmacy/procurement/SupplierForm.tsx`; `src/components/pharmacy/inventory/CatalogItemFormDialog.tsx`; `messages/{en,ar,prs,ps}.json`.
**Create:** `src/lib/procurement/supplier-item-service.ts`; `src/components/pharmacy/inventory/SupplierItemsManager.tsx`; tests under `src/__tests__/`.

**Test harness (service/db tests):**
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

## Task 1: Data model + Dexie v20 store

**Files:**
- Modify: `src/lib/procurement/types.ts` (Supplier + SupplierItem)
- Modify: `src/lib/inventory/types.ts` (CatalogItem.reorderQuantity)
- Modify: `src/lib/db.ts` (EntityTable + v20)
- Test: `src/__tests__/supplier-items-schema.test.ts`

**Interfaces:**
- Produces: `Supplier` += `supplierCode?/taxId?/minOrderValue?/rating?/notes?`; `CatalogItem` += `reorderQuantity?: number`; `SupplierItem` interface; `db.supplierItems: EntityTable<SupplierItem,'id'>`.

- [ ] **Step 1: Add the types**

In `src/lib/procurement/types.ts`, add to `Supplier` (after `paymentTermsDays?`):
```ts
  supplierCode?: string
  taxId?: string
  minOrderValue?: number   // minor units
  rating?: number
  notes?: string
```
Append the `SupplierItem` interface:
```ts
export interface SupplierItem {
  id: string
  supplierId: string
  catalogItemId: string
  supplierSku?: string
  unitPrice?: number       // minor units
  minOrderQty?: number
  leadTimeDays?: number
  isPreferred?: boolean
  createdBy: string
  createdAt: string
  hlcTimestamp: string
}
```
In `src/lib/inventory/types.ts`, add to `CatalogItem` (after `maxStock?`):
```ts
  reorderQuantity?: number  // Phase 4a — per-item reorder policy (pharmacy-local)
```

- [ ] **Step 2: Declare the store in `db.ts`**

Add `SupplierItem` to the existing procurement type import (`import type { Supplier, PurchaseOrder, StockCount, SupplierInvoice, SupplierPayment, SupplierItem } from './procurement/types'`). Add the field after the last procurement EntityTable (`supplierPayments!`):
```ts
  supplierItems!: EntityTable<SupplierItem, 'id'>
```
Append a v20 block immediately after the v19 block, inside the constructor:
```ts
    // v20: Procurement Phase 4a — supplier↔item catalog (junction).
    // Non-PHI operational data; not encrypted.
    this.version(20).stores({
      supplierItems: 'id, supplierId, catalogItemId, [supplierId+catalogItemId], [catalogItemId+isPreferred]',
    })
```
Do NOT touch the v1–v19 blocks.

- [ ] **Step 3: Write the schema test**

Create `src/__tests__/supplier-items-schema.test.ts` (harness above):
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

describe('supplierItems schema (v20)', () => {
  it('opens at version 20 with the supplierItems store', async () => {
    expect(db.verno).toBe(20)
    await db.supplierItems.put({ id: 's1', supplierId: 'sup1', catalogItemId: 'cat1', unitPrice: 500, isPreferred: true, createdBy: 'u1', createdAt: 'h', hlcTimestamp: 'h' })
    expect((await db.supplierItems.get('s1'))?.unitPrice).toBe(500)
  })
  it('queries by [catalogItemId+isPreferred]', async () => {
    await db.supplierItems.bulkPut([
      { id: 'a', supplierId: 'sup1', catalogItemId: 'cat1', isPreferred: true, createdBy: 'u', createdAt: 'h', hlcTimestamp: 'h' },
      { id: 'b', supplierId: 'sup2', catalogItemId: 'cat1', isPreferred: false, createdBy: 'u', createdAt: 'h', hlcTimestamp: 'h' },
    ])
    const preferred = await db.supplierItems.where('[catalogItemId+isPreferred]').equals(['cat1', 1]).toArray()
    // Dexie stores booleans as 0/1 in compound indexes; assert via the query returning the preferred row
    expect(preferred.map((r) => r.id)).toContain('a')
  })
})
```
> Note on the boolean index: Dexie indexes `true` as `1`. If `.equals(['cat1', 1])` returns empty in fake-indexeddb, adapt the test to filter in memory (`(await db.supplierItems.where('catalogItemId').equals('cat1').toArray()).filter(r => r.isPreferred)`); the SERVICE (Task 2) queries preferred by filtering in memory to avoid the boolean-index pitfall — keep the index for `catalogItemId` grouping.

- [ ] **Step 4: Run the test**

Run: `pnpm -F pharmacy-lite test run supplier-items-schema`
Expected: 2 pass (`db.verno === 20`). `pnpm -F pharmacy-lite typecheck` — no new errors in touched files.

- [ ] **Step 5: Commit**
```bash
git add apps/pharmacy-lite/src/lib/procurement/types.ts apps/pharmacy-lite/src/lib/inventory/types.ts apps/pharmacy-lite/src/lib/db.ts apps/pharmacy-lite/src/__tests__/supplier-items-schema.test.ts
git commit -m "feat(pharmacy-lite): supplier master fields + supplierItems store (Dexie v20)"
```

---

## Task 2: Supplier-item service (junction CRUD + preferred)

**Files:**
- Create: `src/lib/procurement/supplier-item-service.ts`
- Test: `src/__tests__/supplier-item-service.test.ts`

**Interfaces:**
- Consumes: `db.supplierItems` (Task 1); `enqueuePharmacySyncEntry`; `SupplierItem` type.
- Produces: `upsertSupplierItem`, `setPreferredSupplier`, `getSupplierItemsForCatalogItem`, `getPreferredSupplierItem`, `getSupplierItemsForSupplier`, `removeSupplierItem`.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/supplier-item-service.test.ts` (harness above):
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import {
  upsertSupplierItem, setPreferredSupplier, getSupplierItemsForCatalogItem,
  getPreferredSupplierItem, getSupplierItemsForSupplier, removeSupplierItem,
} from '@/lib/procurement/supplier-item-service'

beforeEach(async () => {
  await db.delete(); await db.open()
  if (!encryptionKeyStore.isReady()) {
    encryptionKeyStore.setKey(await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']))
  }
})

describe('upsertSupplierItem', () => {
  it('creates a link + enqueues a SupplierItem sync entry', async () => {
    const r = await upsertSupplierItem({ supplierId: 'sup1', catalogItemId: 'cat1', unitPrice: 500, createdBy: 'u1' })
    expect(r.id).toBeDefined()
    expect((await db.supplierItems.get(r.id))?.unitPrice).toBe(500)
    expect((await db.syncQueue.toArray()).some((q) => q.resourceType === 'SupplierItem')).toBe(true)
  })
  it('upserts a duplicate (supplierId, catalogItemId) in place (no second row)', async () => {
    await upsertSupplierItem({ supplierId: 'sup1', catalogItemId: 'cat1', unitPrice: 500, createdBy: 'u1' })
    await upsertSupplierItem({ supplierId: 'sup1', catalogItemId: 'cat1', unitPrice: 700, minOrderQty: 10, createdBy: 'u1' })
    const rows = await getSupplierItemsForCatalogItem('cat1')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.unitPrice).toBe(700)
    expect(rows[0]!.minOrderQty).toBe(10)
  })
  it('setting isPreferred clears it on other rows for the same item (exactly one preferred)', async () => {
    const a = await upsertSupplierItem({ supplierId: 'sup1', catalogItemId: 'cat1', isPreferred: true, createdBy: 'u1' })
    await upsertSupplierItem({ supplierId: 'sup2', catalogItemId: 'cat1', isPreferred: true, createdBy: 'u1' })
    const rows = await getSupplierItemsForCatalogItem('cat1')
    expect(rows.filter((r) => r.isPreferred)).toHaveLength(1)
    expect((await getPreferredSupplierItem('cat1'))?.supplierId).toBe('sup2')
    expect((await db.supplierItems.get(a.id))?.isPreferred).toBe(false)
  })
})

describe('setPreferredSupplier / queries / remove', () => {
  it('setPreferredSupplier makes exactly one row preferred', async () => {
    const a = await upsertSupplierItem({ supplierId: 'sup1', catalogItemId: 'cat1', createdBy: 'u1' })
    const b = await upsertSupplierItem({ supplierId: 'sup2', catalogItemId: 'cat1', createdBy: 'u1' })
    await setPreferredSupplier('cat1', a.id)
    await setPreferredSupplier('cat1', b.id)
    const rows = await getSupplierItemsForCatalogItem('cat1')
    expect(rows.filter((r) => r.isPreferred).map((r) => r.id)).toEqual([b.id])
  })
  it('getSupplierItemsForSupplier + removeSupplierItem', async () => {
    const a = await upsertSupplierItem({ supplierId: 'sup1', catalogItemId: 'cat1', createdBy: 'u1' })
    await upsertSupplierItem({ supplierId: 'sup1', catalogItemId: 'cat2', createdBy: 'u1' })
    expect(await getSupplierItemsForSupplier('sup1')).toHaveLength(2)
    await removeSupplierItem(a.id)
    expect(await db.supplierItems.get(a.id)).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F pharmacy-lite test run supplier-item-service`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/procurement/supplier-item-service.ts`:
```ts
import { db } from '@/lib/db'
import { enqueuePharmacySyncEntry } from '@/lib/dexie-sync-adapter'
import type { SupplierItem } from './types'

async function enqueue(item: SupplierItem, action: 'create' | 'update' | 'delete'): Promise<void> {
  await enqueuePharmacySyncEntry({
    resourceType: 'SupplierItem', resourceId: item.id, action,
    payload: item as unknown as Record<string, unknown>, hlcTimestamp: item.hlcTimestamp, createdAt: item.createdAt,
  })
}

/** Clear isPreferred on every OTHER row for this item (call inside a tx). Returns the cleared rows. */
async function clearOtherPreferred(catalogItemId: string, keepId: string, now: string): Promise<SupplierItem[]> {
  const others = await db.supplierItems.where('catalogItemId').equals(catalogItemId).toArray()
  const cleared: SupplierItem[] = []
  for (const o of others) {
    if (o.id !== keepId && o.isPreferred) {
      await db.supplierItems.update(o.id, { isPreferred: false, hlcTimestamp: now })
      cleared.push({ ...o, isPreferred: false, hlcTimestamp: now })
    }
  }
  return cleared
}

export async function upsertSupplierItem(params: {
  id?: string
  supplierId: string
  catalogItemId: string
  supplierSku?: string
  unitPrice?: number
  minOrderQty?: number
  leadTimeDays?: number
  isPreferred?: boolean
  createdBy: string
}): Promise<SupplierItem> {
  const now = new Date().toISOString()
  const existing = params.id
    ? await db.supplierItems.get(params.id)
    : await db.supplierItems.where('[supplierId+catalogItemId]').equals([params.supplierId, params.catalogItemId]).first()

  const record: SupplierItem = {
    id: existing?.id ?? params.id ?? crypto.randomUUID(),
    supplierId: params.supplierId,
    catalogItemId: params.catalogItemId,
    supplierSku: params.supplierSku?.trim() || undefined,
    unitPrice: params.unitPrice,
    minOrderQty: params.minOrderQty,
    leadTimeDays: params.leadTimeDays,
    isPreferred: params.isPreferred ?? existing?.isPreferred ?? false,
    createdBy: existing?.createdBy ?? params.createdBy,
    createdAt: existing?.createdAt ?? now,
    hlcTimestamp: now,
  }

  let cleared: SupplierItem[] = []
  await db.transaction('rw', db.supplierItems, async () => {
    if (record.isPreferred) cleared = await clearOtherPreferred(record.catalogItemId, record.id, now)
    await db.supplierItems.put(record)
  })
  await enqueue(record, existing ? 'update' : 'create')
  for (const c of cleared) await enqueue(c, 'update')
  return record
}

export async function setPreferredSupplier(catalogItemId: string, supplierItemId: string): Promise<void> {
  const now = new Date().toISOString()
  const target = await db.supplierItems.get(supplierItemId)
  if (!target || target.catalogItemId !== catalogItemId) throw new Error('Supplier item not found for this catalog item')
  let cleared: SupplierItem[] = []
  await db.transaction('rw', db.supplierItems, async () => {
    cleared = await clearOtherPreferred(catalogItemId, supplierItemId, now)
    await db.supplierItems.update(supplierItemId, { isPreferred: true, hlcTimestamp: now })
  })
  await enqueue({ ...target, isPreferred: true, hlcTimestamp: now }, 'update')
  for (const c of cleared) await enqueue(c, 'update')
}

export async function getSupplierItemsForCatalogItem(catalogItemId: string): Promise<SupplierItem[]> {
  return db.supplierItems.where('catalogItemId').equals(catalogItemId).toArray()
}

export async function getPreferredSupplierItem(catalogItemId: string): Promise<SupplierItem | undefined> {
  const rows = await db.supplierItems.where('catalogItemId').equals(catalogItemId).toArray()
  return rows.find((r) => r.isPreferred)
}

export async function getSupplierItemsForSupplier(supplierId: string): Promise<SupplierItem[]> {
  return db.supplierItems.where('supplierId').equals(supplierId).toArray()
}

export async function removeSupplierItem(id: string): Promise<void> {
  const existing = await db.supplierItems.get(id)
  await db.supplierItems.delete(id)
  if (existing) await enqueue(existing, 'delete')
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -F pharmacy-lite test run supplier-item-service`
Expected: PASS (5 tests). `pnpm -F pharmacy-lite typecheck` — no new errors.

- [ ] **Step 5: Commit**
```bash
git add apps/pharmacy-lite/src/lib/procurement/supplier-item-service.ts apps/pharmacy-lite/src/__tests__/supplier-item-service.test.ts
git commit -m "feat(pharmacy-lite): supplier-item junction service (CRUD + one preferred per item)"
```

---

## Task 3: Supplier + catalog input plumbing

**Files:**
- Modify: `src/lib/procurement/supplier-service.ts` (`createSupplier`)
- Modify: `src/lib/inventory/catalog-item-service.ts` (`CatalogItemInput` + validate + create/update)
- Test: `src/__tests__/supplier-catalog-fields.test.ts`

**Interfaces:**
- Produces: `createSupplier`/`updateSupplier` accept `supplierCode/taxId/minOrderValue/rating/notes`; `createCatalogItem`/`updateCatalogItem` accept `reorderQuantity`.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/supplier-catalog-fields.test.ts` (harness above):
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { createSupplier, updateSupplier } from '@/lib/procurement/supplier-service'
import { createCatalogItem, updateCatalogItem } from '@/lib/inventory/catalog-item-service'

beforeEach(async () => {
  await db.delete(); await db.open()
  if (!encryptionKeyStore.isReady()) {
    encryptionKeyStore.setKey(await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']))
  }
})

describe('supplier master fields', () => {
  it('createSupplier persists the new fields; updateSupplier updates them', async () => {
    const s = await createSupplier({ name: 'Acme', supplierCode: 'ACM', taxId: 'TX-1', minOrderValue: 10000, rating: 4, notes: 'reliable' })
    expect(s.supplierCode).toBe('ACM')
    expect(s.minOrderValue).toBe(10000)
    expect(s.rating).toBe(4)
    await updateSupplier(s.id, { rating: 5, notes: 'excellent' })
    const after = await db.suppliers.get(s.id)
    expect(after?.rating).toBe(5)
    expect(after?.notes).toBe('excellent')
  })
})

describe('catalog reorderQuantity', () => {
  it('createCatalogItem persists reorderQuantity + marks locallyModified', async () => {
    const c = await createCatalogItem({ name: 'Amox', form: 'tablet', strength: '500', strengthUnit: 'mg', packSize: 10, category: 'antibiotic', defaultSellingPrice: 100, reorderPoint: 5, reorderQuantity: 50 })
    expect(c.reorderQuantity).toBe(50)
    expect(c.locallyModified).toBe(true)
  })
  it('updateCatalogItem sets reorderQuantity + locallyModified; rejects negative', async () => {
    const c = await createCatalogItem({ name: 'Amox', form: 'tablet', strength: '500', strengthUnit: 'mg', packSize: 10, category: 'antibiotic', defaultSellingPrice: 100, reorderPoint: 5 })
    await updateCatalogItem(c.id, { reorderQuantity: 30 })
    const after = await db.catalogItems.get(c.id)
    expect(after?.reorderQuantity).toBe(30)
    expect(after?.locallyModified).toBe(true)
    await expect(createCatalogItem({ name: 'X', form: 'tablet', strength: '1', strengthUnit: 'mg', packSize: 1, category: 'c', defaultSellingPrice: 0, reorderPoint: 0, reorderQuantity: -1 })).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F pharmacy-lite test run supplier-catalog-fields`
Expected: FAIL — fields not persisted / not rejected.

- [ ] **Step 3: Implement**

In `supplier-service.ts` `createSupplier`: add the 5 optional params to the params type, and to the constructed `supplier` object:
```ts
    supplierCode: params.supplierCode?.trim() || undefined,
    taxId: params.taxId?.trim() || undefined,
    minOrderValue: params.minOrderValue,
    rating: params.rating,
    notes: params.notes?.trim() || undefined,
```
`updateSupplier` already takes `Partial<Omit<Supplier,'id'|'createdAt'>>` — no change.

In `catalog-item-service.ts`: add `reorderQuantity?: number` to `CatalogItemInput`; in `validate`, add:
```ts
  if (input.reorderQuantity !== undefined && (!Number.isFinite(input.reorderQuantity) || input.reorderQuantity < 0)) throw new Error('Reorder quantity must be zero or more')
```
In `createCatalogItem`'s object literal add `reorderQuantity: input.reorderQuantity`. `updateCatalogItem` already spreads `{ ...updates, locallyModified: true }`, so `reorderQuantity` flows through automatically.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -F pharmacy-lite test run supplier-catalog-fields`
Expected: PASS. Re-run existing supplier/catalog suites for no regression:
Run: `pnpm -F pharmacy-lite test run supplier-service catalog-item`
Expected: all pass. `pnpm -F pharmacy-lite typecheck` — no new errors.

- [ ] **Step 5: Commit**
```bash
git add apps/pharmacy-lite/src/lib/procurement/supplier-service.ts apps/pharmacy-lite/src/lib/inventory/catalog-item-service.ts apps/pharmacy-lite/src/__tests__/supplier-catalog-fields.test.ts
git commit -m "feat(pharmacy-lite): supplier master fields + catalog reorderQuantity plumbing"
```

---

## Task 4: i18n (4 locales)

**Files:**
- Modify: `apps/pharmacy-lite/messages/{en,ar,prs,ps}.json`

**Interfaces:**
- Produces: supplier-master field labels in the `procurement` namespace; `reorderQuantity` + supplier-item section keys in the `inventory` namespace. Tasks 5–7 consume these.

- [ ] **Step 1: Add the keys to `en.json`**

Add to the existing `"procurement"` namespace (SupplierForm uses `t('procurement')`):
```json
"supplierCode": "Supplier code",
"taxId": "Tax ID",
"minOrderValue": "Minimum order value",
"rating": "Rating (1–5)",
"notes": "Notes"
```
Add to the existing `"inventory"` namespace (CatalogItemFormDialog + SupplierItemsManager use `t('inventory')`):
```json
"fieldReorderQuantity": "Reorder quantity",
"suppliersForItem": "Suppliers for this item",
"supplierItemsEmpty": "No suppliers linked yet",
"supplierItemAddSupplier": "Supplier",
"supplierItemPrice": "Unit price",
"supplierItemMoq": "Min order qty",
"supplierItemLeadTime": "Lead time (days)",
"supplierItemSku": "Supplier SKU",
"supplierItemPreferred": "Preferred",
"supplierItemSetPreferred": "Set preferred",
"supplierItemAdd": "Add supplier",
"supplierItemRemove": "Remove",
"supplierItemSaveError": "Could not save the supplier link."
```

- [ ] **Step 2: Mirror into `ar.json`, `prs.json`, `ps.json`**

Add the same key sets with accurate translations (ar Arabic, prs Dari, ps genuine Pashto — not Arabic-copied). Identical key sets across all four.

- [ ] **Step 3: Verify parity + JSON validity**

Run:
```bash
node -e "const l=['en','ar','prs','ps'].map(x=>JSON.parse(require('fs').readFileSync('apps/pharmacy-lite/messages/'+x+'.json','utf8')));const keys=o=>Object.keys(o).sort().join(',');const chk=(ns)=>l.every(m=>keys(m[ns])===keys(l[0][ns]))||ns;console.log(['procurement','inventory'].map(chk).filter(x=>x!==true).length?'PARITY FAIL':'PARITY OK')"
```
Expected: `PARITY OK`.

- [ ] **Step 4: Commit**
```bash
git add apps/pharmacy-lite/messages/en.json apps/pharmacy-lite/messages/ar.json apps/pharmacy-lite/messages/prs.json apps/pharmacy-lite/messages/ps.json
git commit -m "feat(pharmacy-lite): i18n for supplier master + supplier-item catalog (4 locales)"
```

---

## Task 5: Supplier master fields on `SupplierForm`

**Files:**
- Modify: `src/components/pharmacy/procurement/SupplierForm.tsx`
- Test: `src/__tests__/SupplierFormFields.test.tsx` (new)

**Interfaces:**
- Consumes: Task 3 (`createSupplier`/`updateSupplier` accept the 5 fields); Task 4 (`procurement` i18n keys).

`SupplierForm.tsx` (READ FIRST) uses `t = useTranslations('procurement')`, has state per field + a `params` object passed to `createSupplier`/`updateSupplier`, and a shared `inputClasses` const.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/SupplierFormFields.test.tsx`. Mock next-intl passthrough + the supplier service; assert the new fields render (`supplierCode`, `taxId`, `notes`) and a save includes them. Follow the existing SupplierForm test structure if present; minimum: `screen.getByText('supplierCode')` (label) renders.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F pharmacy-lite test run SupplierFormFields`
Expected: FAIL — fields absent.

- [ ] **Step 3: Implement**

Add state + inputs for `supplierCode` (text), `taxId` (text), `minOrderValue` (a plain integer number input storing MINOR units directly — `parseInt` on submit; entering major-unit amounts is a 4b polish, out of scope here — mirror the existing `leadTimeDays` numeric field pattern), `rating` (number, `min={1}` `max={5}`), `notes` (textarea). Initialize from `supplier?.<field>` in edit mode. Add each to the `params` object in `handleSubmit`:
```ts
        supplierCode: supplierCode.trim() || undefined,
        taxId: taxId.trim() || undefined,
        minOrderValue: minOrderValue ? parseInt(minOrderValue, 10) : undefined,
        rating: rating ? parseInt(rating, 10) : undefined,
        notes: notes.trim() || undefined,
```
Labels via `t('supplierCode')`/`t('taxId')`/`t('minOrderValue')`/`t('rating')`/`t('notes')`. Reuse the existing `inputClasses`; place the new fields after `paymentTerms`/`paymentTermsDays` (a 2-col grid + the notes textarea full-width). Design-system: semantic tokens, RTL logical props.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -F pharmacy-lite test run SupplierFormFields`
Expected: PASS. `pnpm -F pharmacy-lite typecheck` — no new errors.

- [ ] **Step 5: Commit**
```bash
git add apps/pharmacy-lite/src/components/pharmacy/procurement/SupplierForm.tsx apps/pharmacy-lite/src/__tests__/SupplierFormFields.test.tsx
git commit -m "feat(pharmacy-lite): supplier master enrichment fields on supplier form"
```

---

## Task 6: `SupplierItemsManager` component (junction CRUD UI)

**Files:**
- Create: `src/components/pharmacy/inventory/SupplierItemsManager.tsx`
- Test: `src/__tests__/SupplierItemsManager.test.tsx`

**Interfaces:**
- Consumes: Task 2 (`getSupplierItemsForCatalogItem`, `upsertSupplierItem`, `setPreferredSupplier`, `removeSupplierItem`); `getActiveSuppliers` (`@/lib/procurement/supplier-service`); `getSupplierById`; Task 4 (`inventory` supplier-item keys).
- Produces: `<SupplierItemsManager catalogItemId={string} performedBy={string} />`.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/SupplierItemsManager.test.tsx`. Mock next-intl passthrough, the supplier-item-service (`getSupplierItemsForCatalogItem` → one row; `upsertSupplierItem`/`setPreferredSupplier`/`removeSupplierItem`), and `getActiveSuppliers` (→ two suppliers). Assert: an existing link renders (supplier name); the add form's supplier `<select>` renders (`data-testid="si-supplier-select"`); adding calls `upsertSupplierItem`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SupplierItemsManager } from '@/components/pharmacy/inventory/SupplierItemsManager'

vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k }))
const getSupplierItemsForCatalogItem = vi.fn()
const upsertSupplierItem = vi.fn().mockResolvedValue({ id: 'new' })
vi.mock('@/lib/procurement/supplier-item-service', () => ({
  getSupplierItemsForCatalogItem: () => getSupplierItemsForCatalogItem(),
  upsertSupplierItem: (...a: unknown[]) => upsertSupplierItem(...a),
  setPreferredSupplier: vi.fn().mockResolvedValue(undefined),
  removeSupplierItem: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/procurement/supplier-service', () => ({ getActiveSuppliers: async () => [{ id: 'sup1', name: 'Acme' }, { id: 'sup2', name: 'Globex' }], getSupplierById: async (id: string) => ({ id, name: id === 'sup1' ? 'Acme' : 'Globex' }) }))
vi.mock('@/lib/db', () => ({ db: { pharmacySettings: { toCollection: () => ({ first: async () => ({ currencyMinorUnits: 2 }) }) } } }))

beforeEach(() => { getSupplierItemsForCatalogItem.mockReset(); upsertSupplierItem.mockClear() })

describe('SupplierItemsManager', () => {
  it('lists existing links and adds a new one', async () => {
    getSupplierItemsForCatalogItem.mockResolvedValue([{ id: 'si1', supplierId: 'sup1', catalogItemId: 'cat1', unitPrice: 500, isPreferred: true, createdBy: 'u', createdAt: 'h', hlcTimestamp: 'h' }])
    render(<SupplierItemsManager catalogItemId="cat1" performedBy="u1" />)
    expect(await screen.findByText('Acme')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('si-supplier-select'), { target: { value: 'sup2' } })
    fireEvent.click(screen.getByTestId('si-add-btn'))
    await waitFor(() => expect(upsertSupplierItem).toHaveBeenCalled())
  })
  it('shows empty state with no links', async () => {
    getSupplierItemsForCatalogItem.mockResolvedValue([])
    render(<SupplierItemsManager catalogItemId="cat1" performedBy="u1" />)
    expect(await screen.findByText('supplierItemsEmpty')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F pharmacy-lite test run SupplierItemsManager`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement**

Create `src/components/pharmacy/inventory/SupplierItemsManager.tsx`, `t = useTranslations('inventory')`:
- Props `{ catalogItemId: string; performedBy: string }`.
- Load `getSupplierItemsForCatalogItem(catalogItemId)` + `getActiveSuppliers()` + currencyMinorUnits from `db.pharmacySettings` into state; resolve supplier names from the active-suppliers list (id→name map).
- Section header `<h3>{t('suppliersForItem')}</h3>`.
- Existing-links list (or `EmptyState`/muted `t('supplierItemsEmpty')` when none): each row shows supplier name, unit price (`font-numeric`, formatted via minor units), MOQ, lead time, a preferred marker (`text-success` badge when `isPreferred`), a **Set preferred** button (`data-testid={`si-preferred-${r.id}`}` → `setPreferredSupplier(catalogItemId, r.id)` then reload) when not preferred, and a **Remove** button (`data-testid={`si-remove-${r.id}`}` → `removeSupplierItem(r.id)` then reload).
- Add form: a supplier `<select>` (`data-testid="si-supplier-select"`, options from active suppliers), number inputs for unit price / MOQ / lead time, a text input for supplier SKU, an **Add supplier** button (`data-testid="si-add-btn"`) → `upsertSupplierItem({ supplierId, catalogItemId, unitPrice, minOrderQty, leadTimeDays, supplierSku, createdBy: performedBy })` then reload + reset the add form; on error set an inline `t('supplierItemSaveError')` alert.
- Money: parse major→minor with `Math.round(parseFloat(v||'0') * 10 ** minorUnits)`; display with `(x / 10**minorUnits).toFixed(minorUnits)`.
- Design system: semantic tokens, `font-numeric` money, RTL logical props, ShadCN `<Button>`/`<Input>`, filter `<select>` `rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -F pharmacy-lite test run SupplierItemsManager`
Expected: PASS (2 tests). `pnpm -F pharmacy-lite typecheck` — no new errors.

- [ ] **Step 5: Commit**
```bash
git add apps/pharmacy-lite/src/components/pharmacy/inventory/SupplierItemsManager.tsx apps/pharmacy-lite/src/__tests__/SupplierItemsManager.test.tsx
git commit -m "feat(pharmacy-lite): supplier-items manager (per-item supplier links + preferred)"
```

---

## Task 7: `CatalogItemFormDialog` — reorderQuantity + embed the manager

**Files:**
- Modify: `src/components/pharmacy/inventory/CatalogItemFormDialog.tsx`
- Test: `src/__tests__/CatalogItemFormDialog.test.tsx` (extend if present, else new)

**Interfaces:**
- Consumes: Task 3 (`CatalogItemInput.reorderQuantity`); Task 6 (`<SupplierItemsManager />`); Task 4 (`inventory.fieldReorderQuantity`).

`CatalogItemFormDialog.tsx` (READ FIRST): a ShadCN dialog with a fields grid; the Pack Size + Reorder Point row is at ~lines 248–270; the `input: CatalogItemInput` object literal is at ~line 133; `reorderPoint` state at line 66 + prefill at line 104.

- [ ] **Step 1: Write the failing test**

Create/extend `src/__tests__/CatalogItemFormDialog.test.tsx`: assert the dialog renders a `reorderQuantity` field (`data-testid="catalog-form-reorder-quantity"`), and that when editing an existing item the `<SupplierItemsManager>` section header (`suppliersForItem`) is shown; a create (no item) does NOT show the suppliers section. Mock next-intl passthrough, the catalog-item service, `db`, and the supplier-item-service + `getActiveSuppliers` (so the embedded manager renders).

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F pharmacy-lite test run CatalogItemFormDialog`
Expected: FAIL — field/section absent.

- [ ] **Step 3: Implement**

- Add `reorderQuantity` state (`const [reorderQuantity, setReorderQuantity] = useState('')`); prefill in the edit branch (`setReorderQuantity(item.reorderQuantity != null ? String(item.reorderQuantity) : '')`) and reset in the create branch (`setReorderQuantity('')`).
- Add a `reorderQuantity` field next to Reorder Point (make that row 2→3 columns or add below), label `t('fieldReorderQuantity')`, `type="number"`, `min={0}`, `data-testid="catalog-form-reorder-quantity"`.
- In the `input` object literal add `reorderQuantity: reorderQuantity ? parseInt(reorderQuantity, 10) : undefined`.
- After the fields grid (inside `<form>` or below the DialogFooter is fine, but inside DialogContent), when `isEdit && item` render `<SupplierItemsManager catalogItemId={item.id} performedBy={performedBy} />` — get `performedBy` from `useAuthSessionStore` (`const session = useAuthSessionStore((s) => s.session); const performedBy = session?.practitionerId ?? session?.userId ?? 'unknown'`). Wrap it in a `mt-4 border-t border-border pt-4` divider block. Do NOT show it on create (no item id yet).
- Keep all existing catalog fields + submit behavior unchanged.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -F pharmacy-lite test run CatalogItemFormDialog`
Expected: PASS. `pnpm -F pharmacy-lite typecheck` — no new errors.

- [ ] **Step 5: Commit**
```bash
git add apps/pharmacy-lite/src/components/pharmacy/inventory/CatalogItemFormDialog.tsx apps/pharmacy-lite/src/__tests__/CatalogItemFormDialog.test.tsx
git commit -m "feat(pharmacy-lite): catalog item reorderQuantity + embedded supplier-items manager"
```

---

## Final Verification (after all tasks)

- [ ] `pnpm -F pharmacy-lite test` — full suite green (new + regression). Pre-existing unrelated errors (jsdom canvas-getContext; SyncQueueDashboard DatabaseClosedError teardown) are not this work.
- [ ] `pnpm -F pharmacy-lite typecheck` — only the 6 known pre-existing unrelated-file errors; zero new in touched files.
- [ ] Invariant sanity: after linking two suppliers to one item and setting each preferred in turn, exactly one row has `isPreferred: true` (Task 2 test asserts this).
- [ ] `reorderQuantity` set via the dialog marks the item `locallyModified` (Task 3 test asserts) → survives a catalog re-sync.
- [ ] No PHI in logs; RTL logical props only on touched UI; `supplierItems` sync entries emitted.
