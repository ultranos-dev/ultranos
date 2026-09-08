# Catalog Item Local CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let a pharmacist create, edit, and deactivate catalog items locally on the pharmacy-lite device, with local edits protected from being overwritten by the Hub catalog pull — **without** pushing to the authoritative global Hub catalog.

**Architecture:** `db.catalogItems` is today a pull-only, Hub-authoritative cache (`syncCatalogFromHub` bulk-puts from `catalog.list`; no push path). We add (1) two optional markers on `CatalogItem` (`locallyModified`, `source`) — NO Dexie schema/index change, so no version bump; (2) a dirty-guard in `syncCatalogFromHub` so a locally-modified row is never clobbered and a local row never advances the pull watermark; (3) a `catalog-item-service.ts` (create/update/deactivate/reactivate); (4) a `CatalogItemFormDialog` + Add/Edit/Deactivate affordances on the existing read-only `CatalogBrowsePage`. Local-only items (client-generated ids) are never returned by the Hub pull, so they are inherently safe; the dirty-guard exists to protect *edits to Hub-sourced items* and deactivations.

**Tech Stack:** Next.js 15 PWA, Dexie/IndexedDB, Zustand, ShadCN (ui-kit), Vitest. App: `apps/pharmacy-lite`.

**Spec:** No separate spec doc — brainstormed + scope-approved inline (client-local + dirty-guard, no Hub push). This plan is the authority.

## Global Constraints

- **Client-local only — NO Hub push.** Never call `enqueuePharmacySyncEntry`/`enqueuePharmacySync*` for `CatalogItem`. Catalog items are not added to `WHOLESALE_TYPES`. No Hub mutation. (Contrast the supplier service, which DOES enqueue — do NOT copy that part.)
- **Money = integer minor units** for `defaultSellingPrice` and `wholesalePrice`. The form takes major-unit input and converts via `Math.round(parseFloat(x) * 10 ** minorUnits)` (read `currencyMinorUnits` from `db.pharmacySettings` like `PatientAccountsPage`/`NewPurchaseOrderPage` do — default 2 if unavailable). Display via the existing money formatter used on inventory pages.
- **Dirty-guard invariant:** after any Hub catalog sync, a row that was locally created or edited (`locallyModified === true`) must retain its local values; and a locally-modified/local-only row must NOT raise the sync watermark (which would cause subsequent Hub pulls to miss server-side changes).
- **No Dexie version bump / migration** — `locallyModified` and `source` are new OPTIONAL fields on existing `CatalogItem` objects; Dexie stores full objects, so adding non-indexed fields needs no `version().stores()` change. Do NOT add a new `this.version(17)` block.
- **Layout/token/RTL/i18n standards** (OPD list-page standard for the catalog page; ShadCN Dialog for the form). New user-facing strings via the `inventory` i18n namespace in ALL FOUR message files (en/ar/prs/ps).
- **Non-PHI:** `catalogItems` is reference data (already in `PRESERVE_TABLES`, not encrypted) — no PHI handling needed, but never log item content unnecessarily.
- **NO-COMMIT mode.**

---

### Task 1: `CatalogItem` markers + sync dirty-guard

**Files:**
- Modify: `apps/pharmacy-lite/src/lib/inventory/types.ts` (add two optional fields to `CatalogItem`)
- Modify: `apps/pharmacy-lite/src/lib/inventory/catalog-sync.ts` (`syncCatalogFromHub` dirty-guard + watermark fix)
- Test: `apps/pharmacy-lite/src/__tests__/catalog-sync-dirty-guard.test.ts`

**Interfaces:**
- Produces: `CatalogItem` gains `locallyModified?: boolean` and `source?: 'hub' | 'local'`. `syncCatalogFromHub` unchanged signature/return, new guard behavior.
- Consumes (Task 2/3): those two fields.

- [ ] **Step 1: Add the fields** — in `types.ts`, extend the `CatalogItem` interface (after `isActive`, before/after `lastSyncedAt`):

```typescript
  isActive: boolean
  lastSyncedAt: string
  /** True when this row was created or edited locally and must be preserved
   *  across a Hub catalog pull (dirty-guard). Absent/false = clean Hub copy. */
  locallyModified?: boolean
  /** 'local' = pharmacy-created item (never on the Hub); 'hub' or absent = pulled. */
  source?: 'hub' | 'local'
```

- [ ] **Step 2: Write the failing test** — `apps/pharmacy-lite/src/__tests__/catalog-sync-dirty-guard.test.ts`. Mock the network `fetch` to return a Hub batch, seed local rows, and assert the guard. Mirror the fetch-mock + fake-indexeddb harness used by other pharmacy-lite sync tests (e.g. look at `__tests__/dexie-sync-adapter.test.ts` / any `catalog`/`sync` test for the `db` reset + `useAuthSessionStore.getState().getAccessToken` stub). Concretely test three behaviors by calling the SAME internal merge logic Step 3 extracts:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/lib/db'
import { mergeCatalogBatch, computeCatalogWatermark } from '@/lib/inventory/catalog-sync'
import type { CatalogItem } from '@/lib/inventory/types'

function item(over: Partial<CatalogItem>): CatalogItem {
  return {
    id: 'x', name: 'Item', form: 'tablet', strength: '1', strengthUnit: 'mg',
    packSize: 1, category: 'misc', defaultSellingPrice: 0, reorderPoint: 0,
    isActive: true, lastSyncedAt: '2026-01-01T00:00:00.000Z', ...over,
  }
}

beforeEach(async () => {
  await db.catalogItems.clear()
})

describe('catalog dirty-guard', () => {
  it('does NOT overwrite a locally-modified row on Hub sync', async () => {
    await db.catalogItems.put(item({ id: 'a', name: 'LOCAL EDIT', defaultSellingPrice: 999, locallyModified: true }))
    // Hub returns a competing version of the same id
    await mergeCatalogBatch([item({ id: 'a', name: 'HUB NAME', defaultSellingPrice: 100 })], '2026-06-01T00:00:00.000Z')
    const a = await db.catalogItems.get('a')
    expect(a!.name).toBe('LOCAL EDIT')          // local edit preserved
    expect(a!.defaultSellingPrice).toBe(999)
  })

  it('DOES upsert a clean Hub row', async () => {
    await db.catalogItems.put(item({ id: 'b', name: 'OLD', locallyModified: false }))
    await mergeCatalogBatch([item({ id: 'b', name: 'NEW' })], '2026-06-01T00:00:00.000Z')
    expect((await db.catalogItems.get('b'))!.name).toBe('NEW')
  })

  it('watermark ignores locally-modified / local-only rows', async () => {
    await db.catalogItems.put(item({ id: 'h', lastSyncedAt: '2026-03-01T00:00:00.000Z', locallyModified: false }))
    await db.catalogItems.put(item({ id: 'l', lastSyncedAt: '2026-09-01T00:00:00.000Z', locallyModified: true, source: 'local' }))
    // newest CLEAN row is 'h'; the local row must NOT advance the watermark
    expect(await computeCatalogWatermark()).toBe('2026-03-01T00:00:00.000Z')
  })
})
```

- [ ] **Step 3: Run to verify FAIL** — `pnpm -F pharmacy-lite test catalog-sync-dirty-guard` → FAIL (`mergeCatalogBatch`/`computeCatalogWatermark` not exported).

- [ ] **Step 4: Refactor `syncCatalogFromHub` to use two exported helpers, with the guard.** Replace the watermark derivation (lines 21–25) and the `bulkPut` (lines 55–59) with calls to new exported functions, and add those functions:

```typescript
/** Newest lastSyncedAt among CLEAN (Hub-authoritative) rows only. A locally
 *  modified or local-only row must not advance the pull watermark, else the
 *  next Hub pull would skip server-side changes newer than the local edit. */
export async function computeCatalogWatermark(): Promise<string> {
  const rows = await db.catalogItems.orderBy('lastSyncedAt').reverse().toArray()
  const newestClean = rows.find((r) => !r.locallyModified)
  return newestClean?.lastSyncedAt ?? '1970-01-01T00:00:00.000Z'
}

/** Upsert a Hub batch, skipping any id whose local row is locallyModified
 *  (dirty-guard) so pharmacist edits/deactivations survive the pull. */
export async function mergeCatalogBatch(items: CatalogItem[], syncTimestamp: string): Promise<void> {
  if (items.length === 0) return
  const ids = items.map((i) => i.id)
  const existing = await db.catalogItems.where('id').anyOf(ids).toArray()
  const dirtyIds = new Set(existing.filter((e) => e.locallyModified).map((e) => e.id))
  const toPut = items
    .filter((i) => !dirtyIds.has(i.id))
    .map((i) => ({ ...i, lastSyncedAt: syncTimestamp, source: 'hub' as const }))
  if (toPut.length > 0) await db.catalogItems.bulkPut(toPut)
}
```

Then in `syncCatalogFromHub`: replace lines 21–25 with `const since = await computeCatalogWatermark()`, and replace the `if (items.length > 0) { ... bulkPut ... }` block (lines 55–59) with `await mergeCatalogBatch(items, syncTimestamp); totalSynced += items.length`. Keep everything else (paging, abort, return shape) identical.

- [ ] **Step 5: Run to verify PASS** — `pnpm -F pharmacy-lite test catalog-sync-dirty-guard` → green.

- [ ] **Step 6: Typecheck** — `pnpm -F pharmacy-lite typecheck` → no NEW errors in `types.ts` / `catalog-sync.ts` / the new test.

- [ ] **Step 7: Commit** (skip in NO-COMMIT).

---

### Task 2: `catalog-item-service.ts` (create / update / deactivate / reactivate)

**Files:**
- Create: `apps/pharmacy-lite/src/lib/inventory/catalog-item-service.ts`
- Test: `apps/pharmacy-lite/src/__tests__/catalog-item-service.test.ts`

**Interfaces:**
- Produces:
  - `createCatalogItem(input: CatalogItemInput): Promise<CatalogItem>`
  - `updateCatalogItem(id: string, updates: Partial<CatalogItemInput>): Promise<void>`
  - `deactivateCatalogItem(id: string): Promise<void>`
  - `reactivateCatalogItem(id: string): Promise<void>`
  - `type CatalogItemInput` = the editable fields (see below).
- Consumes: `db.catalogItems`, `CatalogItem`, `MedicationForm`, `ControlledSchedule`. NO sync enqueue.

- [ ] **Step 1: Write the failing test** — `apps/pharmacy-lite/src/__tests__/catalog-item-service.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { createCatalogItem, updateCatalogItem, deactivateCatalogItem } from '@/lib/inventory/catalog-item-service'

beforeEach(async () => { await db.catalogItems.clear() })

const VALID = {
  name: 'Paracetamol 500mg', form: 'tablet' as const, strength: '500', strengthUnit: 'mg',
  packSize: 20, category: 'analgesic', defaultSellingPrice: 500, reorderPoint: 10,
}

describe('createCatalogItem', () => {
  it('creates a local item flagged source=local + locallyModified, active, with a generated id', async () => {
    const created = await createCatalogItem(VALID)
    expect(created.id).toBeTruthy()
    expect(created.source).toBe('local')
    expect(created.locallyModified).toBe(true)
    expect(created.isActive).toBe(true)
    const stored = await db.catalogItems.get(created.id)
    expect(stored!.name).toBe('Paracetamol 500mg')
    expect(stored!.defaultSellingPrice).toBe(500) // minor units, stored as-is
  })

  it('rejects an empty name', async () => {
    await expect(createCatalogItem({ ...VALID, name: '  ' })).rejects.toThrow()
  })
  it('rejects a non-positive packSize', async () => {
    await expect(createCatalogItem({ ...VALID, packSize: 0 })).rejects.toThrow()
  })
  it('rejects a negative price', async () => {
    await expect(createCatalogItem({ ...VALID, defaultSellingPrice: -1 })).rejects.toThrow()
  })
})

describe('updateCatalogItem', () => {
  it('applies updates and flags the row locallyModified', async () => {
    const c = await createCatalogItem(VALID)
    // simulate a clean Hub row to prove update flips the flag
    await db.catalogItems.update(c.id, { locallyModified: false, source: 'hub' })
    await updateCatalogItem(c.id, { defaultSellingPrice: 750 })
    const u = await db.catalogItems.get(c.id)
    expect(u!.defaultSellingPrice).toBe(750)
    expect(u!.locallyModified).toBe(true)
  })
})

describe('deactivateCatalogItem', () => {
  it('sets isActive false and flags locallyModified (survives sync)', async () => {
    const c = await createCatalogItem(VALID)
    await db.catalogItems.update(c.id, { locallyModified: false, source: 'hub' })
    await deactivateCatalogItem(c.id)
    const d = await db.catalogItems.get(c.id)
    expect(d!.isActive).toBe(false)
    expect(d!.locallyModified).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify FAIL** — `pnpm -F pharmacy-lite test catalog-item-service` → FAIL (module missing).

- [ ] **Step 3: Implement** — `apps/pharmacy-lite/src/lib/inventory/catalog-item-service.ts`:

```typescript
import { db } from '@/lib/db'
import type { CatalogItem, MedicationForm, ControlledSchedule } from './types'

export interface CatalogItemInput {
  name: string
  nameLocal?: string
  form: MedicationForm
  strength: string
  strengthUnit: string
  packSize: number
  barcode?: string
  category: string
  controlledSchedule?: ControlledSchedule
  defaultSellingPrice: number // minor units
  wholesalePrice?: number     // minor units
  reorderPoint: number
}

function validate(input: Partial<CatalogItemInput>): void {
  if (input.name !== undefined && input.name.trim().length === 0) throw new Error('Name is required')
  if (input.packSize !== undefined && (!Number.isFinite(input.packSize) || input.packSize <= 0)) throw new Error('Pack size must be a positive number')
  if (input.reorderPoint !== undefined && (!Number.isFinite(input.reorderPoint) || input.reorderPoint < 0)) throw new Error('Reorder point must be zero or more')
  if (input.defaultSellingPrice !== undefined && (!Number.isFinite(input.defaultSellingPrice) || input.defaultSellingPrice < 0)) throw new Error('Price must be zero or more')
  if (input.wholesalePrice !== undefined && (!Number.isFinite(input.wholesalePrice) || input.wholesalePrice < 0)) throw new Error('Wholesale price must be zero or more')
}

export async function createCatalogItem(input: CatalogItemInput): Promise<CatalogItem> {
  validate(input)
  const now = new Date().toISOString()
  const item: CatalogItem = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    nameLocal: input.nameLocal?.trim() || undefined,
    form: input.form,
    strength: input.strength.trim(),
    strengthUnit: input.strengthUnit.trim(),
    packSize: input.packSize,
    barcode: input.barcode?.trim() || undefined,
    category: input.category.trim(),
    controlledSchedule: input.controlledSchedule,
    defaultSellingPrice: input.defaultSellingPrice,
    wholesalePrice: input.wholesalePrice,
    reorderPoint: input.reorderPoint,
    isActive: true,
    lastSyncedAt: now,
    locallyModified: true,
    source: 'local',
  }
  await db.catalogItems.put(item)
  return item
}

export async function updateCatalogItem(id: string, updates: Partial<CatalogItemInput>): Promise<void> {
  validate(updates)
  const clean: Record<string, unknown> = { ...updates, locallyModified: true }
  if (typeof updates.name === 'string') clean.name = updates.name.trim()
  await db.catalogItems.update(id, clean)
}

export async function deactivateCatalogItem(id: string): Promise<void> {
  await db.catalogItems.update(id, { isActive: false, locallyModified: true })
}

export async function reactivateCatalogItem(id: string): Promise<void> {
  await db.catalogItems.update(id, { isActive: true, locallyModified: true })
}
```

- [ ] **Step 4: Run to verify PASS** — `pnpm -F pharmacy-lite test catalog-item-service` → green.
- [ ] **Step 5: Typecheck** — `pnpm -F pharmacy-lite typecheck` → no NEW errors in the new files.
- [ ] **Step 6: Commit** (skip).

---

### Task 3: UI — `CatalogItemFormDialog` + Add/Edit/Deactivate on `CatalogBrowsePage`

**Files:**
- Create: `apps/pharmacy-lite/src/components/pharmacy/inventory/CatalogItemFormDialog.tsx`
- Modify: `apps/pharmacy-lite/src/components/pharmacy/inventory/CatalogBrowsePage.tsx` (toolbar Add button, actions column, Local badge, dialog state, reload after mutate)
- Modify: `apps/pharmacy-lite/messages/{en,ar,prs,ps}.json` (add keys under the `inventory` namespace)
- Test: `apps/pharmacy-lite/src/__tests__/CatalogItemFormDialog.test.tsx`

**Interfaces:**
- Consumes: `createCatalogItem`, `updateCatalogItem`, `CatalogItemInput` (Task 2); `db.pharmacySettings` for `currencyMinorUnits`; ShadCN `Dialog`, `Button`, `Input`, `Label`, `Select` from `@ultranos/ui-kit/components/ui/*`.
- Produces: `CatalogItemFormDialog` used by `CatalogBrowsePage` for both create (no `item` prop) and edit (with `item`).

- [ ] **Step 1: Write the failing component test** — `apps/pharmacy-lite/src/__tests__/CatalogItemFormDialog.test.tsx`. Mock `next-intl` `useTranslations` to identity (`(k) => k`), mock `@/lib/inventory/catalog-item-service` (`createCatalogItem`, `updateCatalogItem` as `vi.fn`), and mock `@/lib/db` `pharmacySettings.toCollection().first()` to `{ currencyMinorUnits: 2 }` (mirror the mock in `__tests__/NewPurchaseOrderPage.test.tsx`). Assert:
  - renders a name input + a submit button when `open` (create mode);
  - submitting with a valid name + price `5.00` calls `createCatalogItem` with `defaultSellingPrice: 500` (major→minor) and calls `onSaved`;
  - submitting with an empty name shows a validation error and does NOT call `createCatalogItem`;
  - in edit mode (given an `item` prop) the name field is pre-filled and submit calls `updateCatalogItem(item.id, ...)`.

  Use the `NewPurchaseOrderPage.test.tsx` mock structure as the template (same `vi.mock('@/lib/db', ...)` shape, `userEvent`, `data-testid` queries). Give the dialog these test ids: `catalog-form-name`, `catalog-form-price`, `catalog-form-submit`, and surface validation errors via `role="alert"`.

- [ ] **Step 2: Run to verify FAIL** — `pnpm -F pharmacy-lite test CatalogItemFormDialog` → FAIL (component missing).

- [ ] **Step 3: Implement `CatalogItemFormDialog.tsx`** — a controlled ShadCN `Dialog`. Props: `{ open: boolean; onOpenChange: (o: boolean) => void; item?: CatalogItem; onSaved: () => void }`. Behavior:
  - Local form state for all `CatalogItemInput` fields. In edit mode, initialize from `item` (prices shown in MAJOR units = `item.defaultSellingPrice / 10 ** minorUnits`); in create mode, blank with `form='tablet'`.
  - Read `currencyMinorUnits` once from `db.pharmacySettings.toCollection().first()` (default 2).
  - `form` and `controlledSchedule` are `Select`s (options from `MedicationForm` / `ControlledSchedule`; controlledSchedule has a "none" option → `undefined`).
  - On submit: build `CatalogItemInput` converting price majors→minors with `Math.round(parseFloat(x || '0') * 10 ** minorUnits)`; call `updateCatalogItem(item.id, input)` when editing else `createCatalogItem(input)`; on success call `onSaved()` + `onOpenChange(false)`; on thrown validation error, `setError(err.message)` in a `role="alert"`.
  - Layout: form fields in a `grid gap-3` inside `DialogContent`; footer with Cancel (ghost) + Save (default). Semantic tokens, `dir="auto"` on text inputs, i18n for every label/placeholder/button.

- [ ] **Step 4: Wire into `CatalogBrowsePage.tsx`:**
  - Toolbar (the existing `flex flex-wrap items-center gap-3` row): add a primary **Add item** `Button` folded at the END of the row (per the OPD list-page standard — action at the end of the toolbar, not a separate header). Clicking sets `editingItem = undefined` + `dialogOpen = true`.
  - Add an actions cell to each local-table row: an **Edit** ghost button (sets `editingItem = r.item` + opens dialog) and a **Deactivate** ghost/destructive button (calls `deactivateCatalogItem(r.item.id)` then reloads). Keep the existing Pharmopedia link.
  - Show a small **Local** badge next to the name when `r.item.source === 'local' || r.item.locallyModified` (tokens: `bg-primary/10 text-primary`).
  - Render `<CatalogItemFormDialog open={dialogOpen} onOpenChange={setDialogOpen} item={editingItem} onSaved={reload} />`, where `reload` re-runs the existing `load()` effect (extract it to a `useCallback` you can call after a mutation). Deactivated items still render (optionally dimmed) — do not filter them out, so the pharmacist can reactivate later; a follow-up may add an active/all filter.

- [ ] **Step 5: i18n** — add to the `inventory` namespace in all four `messages/*.json`: `addItem`, `editItem`, `deactivate`, `localBadge`, `catalogFormTitleCreate`, `catalogFormTitleEdit`, `fieldName`, `fieldNameLocal`, `fieldForm`, `fieldStrength`, `fieldStrengthUnit`, `fieldPackSize`, `fieldBarcode`, `fieldCategory`, `fieldControlledSchedule`, `fieldSellingPrice`, `fieldWholesalePrice`, `fieldReorderPoint`, `controlledNone`, `save`, `cancel`, `catalogValidationName` (+ any other error strings surfaced). English is authoritative; provide native translations for ar/prs/ps where straightforward, English fallback otherwise (note which were fallback). Maintain key parity across all four files.

- [ ] **Step 6: Run to verify PASS** — `pnpm -F pharmacy-lite test CatalogItemFormDialog` → green; then `pnpm -F pharmacy-lite test catalog` (all catalog tests) green.
- [ ] **Step 7: Typecheck + i18n parity** — `pnpm -F pharmacy-lite typecheck` (no NEW errors in the touched files); confirm the new keys exist in all four message files.
- [ ] **Step 8: Commit** (skip).

---

## Self-Review

**Coverage:** dirty-guard + markers → T1; CRUD service → T2; UI (add/edit/deactivate + badge) + i18n → T3. **Sync-safety (the core risk):** T1 proves a locally-modified row survives a Hub pull (`mergeCatalogBatch` skips dirty ids) and that a local row can't advance the watermark (`computeCatalogWatermark` finds the newest CLEAN row) — the two ways local edits could be lost or could hide Hub updates. **Governance:** no Hub push anywhere (no `enqueuePharmacySyncEntry` for CatalogItem; `WHOLESALE_TYPES` untouched) — matches the approved "client-local, no Hub push" scope. **Money:** prices are minor-unit ints in storage/service; the dialog converts major→minor on submit and minor→major on edit-prefill (T3), using `currencyMinorUnits` from settings. **No migration:** `locallyModified`/`source` are non-indexed optional fields — no `version(17)` block (called out so an implementer doesn't add one). **Type consistency:** `CatalogItemInput` (T2) is the create/update payload the dialog builds (T3); `locallyModified`/`source` written by T2 service + T1 sync are read by T1 guard + T3 badge. **Placeholder scan:** none — services, sync helpers, and tests are concrete; the dialog spec gives exact props, testids, conversion formula, and i18n keys. **Deferred (noted, not silently dropped):** an active/inactive filter on the catalog list and any Hub push are out of scope.
