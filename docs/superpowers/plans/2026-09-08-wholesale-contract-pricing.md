# Wholesale Contract Pricing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a pharmacy set a negotiated price per (customer, catalog item), have order lines auto-use it (falling back to the default `wholesalePrice`), managed on a new customer detail page and synced cross-device via the B1/B2 pattern.

**Architecture:** Add a `ContractPrice` client model + Dexie table + service (upsert-by-pair/resolve). Change `NewOrderPage` line-price resolution to `contract → wholesalePrice → 0` (manual override on top). Add a customer detail page. Sync via the B1 recipe (migration + `sync.push` table-map/RBAC/flattener) + B2 pull (types list + `tableFor` + `price→priceMinor` reversal).

**Tech Stack:** Next.js/Dexie/Vitest (pharmacy-lite), Node/tRPC/Supabase (hub-api).

**Spec:** `docs/superpowers/specs/2026-09-08-wholesale-contract-pricing-design.md`

## Global Constraints

- **Money = integer minor units** (`BIGINT` on Hub). `priceMinor` is per BASE unit; `× packSize` for pack lines.
- **Client↔Hub field map:** client `ContractPrice.priceMinor` ↔ Hub column `price`. Flatten maps `priceMinor→price`; pull maps `price→priceMinor`.
- **Resolution order:** `resolveContractPrice(customerId, itemId) ?? item.wholesalePrice ?? 0`, then `× packSize` for pack; a manual per-line price override still wins.
- **Uniqueness:** one price per `(customerId, catalogItemId)` — the service upserts by looking up the compound index and reusing the existing `id`. Hub `UNIQUE(org_id, customer_id, catalog_item_id)` is the safety net.
- **Org-scoped + synced:** the Hub table has `org_id NOT NULL`; add it to `ORG_SCOPED_TABLES`; PHARMACIST gets `ContractPrice` access. Pull reuses the shared wholesale watermark.
- **Removal is local-only this slice** (delete the Dexie row; no delete-sync) — documented limitation; set/update fully syncs.
- **Database ops via Supabase MCP tools only** (`apply_migration`, `list_migrations`, `execute_sql`).
- **Commits:** commit steps are the cadence; per repo policy **do not `git commit` without the user's explicit go-ahead** — checkpoints.

---

## File Structure

**Create:**
- `apps/pharmacy-lite/src/lib/wholesale/contract-price-service.ts`
- `apps/pharmacy-lite/src/app/[locale]/(app)/wholesale/customers/[id]/page.tsx` + `apps/pharmacy-lite/src/components/pharmacy/wholesale/CustomerDetailPage.tsx`
- `supabase/migrations/048_contract_prices.sql`
- test files alongside.

**Modify:**
- `apps/pharmacy-lite/src/lib/wholesale/types.ts` — `ContractPrice` type.
- `apps/pharmacy-lite/src/lib/db.ts` — `contractPrices` table (v16).
- `apps/pharmacy-lite/src/components/pharmacy/wholesale/NewOrderPage.tsx` — resolution.
- `apps/pharmacy-lite/src/components/pharmacy/wholesale/CustomersPage.tsx` — row link to detail.
- `apps/pharmacy-lite/src/lib/wholesale/wholesale-pull.ts` — add `ContractPrice`.
- `apps/hub-api/src/trpc/routers/sync.ts` — map + org-scoped.
- `apps/hub-api/src/trpc/rbac.ts` — PHARMACIST grant.
- `apps/hub-api/src/lib/resource-mappers.ts` — `flattenContractPrice`.
- `apps/hub-api/src/__tests__/sync.test.ts` — push + pull cases.

---

### Task 1: `ContractPrice` type + Dexie table

**Files:**
- Modify: `apps/pharmacy-lite/src/lib/wholesale/types.ts`, `apps/pharmacy-lite/src/lib/db.ts`
- Test: `apps/pharmacy-lite/src/__tests__/contract-prices-table.test.ts`

**Interfaces:**
- Produces: `ContractPrice` type; `db.contractPrices` (`EntityTable<ContractPrice, 'id'>`).

- [ ] **Step 1: Write the failing test**

```ts
// apps/pharmacy-lite/src/__tests__/contract-prices-table.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import type { ContractPrice } from '@/lib/wholesale/types'

beforeEach(async () => { await db.delete(); await db.open() })

describe('contractPrices table', () => {
  it('round-trips and queries by [customerId+catalogItemId]', async () => {
    const row: ContractPrice = { id: 'cp1', customerId: 'c1', catalogItemId: 'i1', priceMinor: 1800, createdBy: 'p1', createdAt: '2026-09-08T00:00:00Z' }
    await db.contractPrices.put(row)
    expect(await db.contractPrices.get('cp1')).toEqual(row)
    const found = await db.contractPrices.where('[customerId+catalogItemId]').equals(['c1', 'i1']).first()
    expect(found?.priceMinor).toBe(1800)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test contract-prices-table`
Expected: FAIL — `db.contractPrices` undefined.

- [ ] **Step 3: Implement**

In `types.ts` add:
```ts
export interface ContractPrice {
  id: string
  customerId: string
  catalogItemId: string
  priceMinor: number
  createdBy: string
  createdAt: string
}
```
In `db.ts`: add field declaration `contractPrices!: EntityTable<ContractPrice, 'id'>` (import the type), and a NEW `this.version(16).stores({ contractPrices: 'id, customerId, [customerId+catalogItemId]' })` block (current highest is 15 from B2). NOT in `PHI_TABLE_CONFIGS`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F pharmacy-lite test contract-prices-table`
Expected: PASS.

- [ ] **Step 5: Commit** (checkpoint)

```bash
git add apps/pharmacy-lite/src/lib/wholesale/types.ts apps/pharmacy-lite/src/lib/db.ts apps/pharmacy-lite/src/__tests__/contract-prices-table.test.ts
git commit -m "feat(pharmacy-lite): ContractPrice type + table"
```

---

### Task 2: `contract-price-service`

**Files:**
- Create: `apps/pharmacy-lite/src/lib/wholesale/contract-price-service.ts`
- Test: `apps/pharmacy-lite/src/__tests__/contract-price-service.test.ts`

**Interfaces:**
- Consumes: `db`, `enqueuePharmacySyncEntry`, `ContractPrice` (Task 1).
- Produces: `setContractPrice({customerId,catalogItemId,priceMinor,createdBy})`, `removeContractPrice(id)`, `getContractPrices(customerId)`, `resolveContractPrice(customerId,catalogItemId): Promise<number|null>`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/pharmacy-lite/src/__tests__/contract-price-service.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { setContractPrice, resolveContractPrice, getContractPrices, removeContractPrice } from '@/lib/wholesale/contract-price-service'

beforeEach(async () => {
  await db.delete(); await db.open()
  if (!encryptionKeyStore.isReady()) encryptionKeyStore.setKey(await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt','decrypt']))
})

describe('contract-price-service', () => {
  it('creates a price and enqueues a sync entry', async () => {
    const cp = await setContractPrice({ customerId: 'c1', catalogItemId: 'i1', priceMinor: 1800, createdBy: 'p1' })
    expect(cp.priceMinor).toBe(1800)
    expect(await resolveContractPrice('c1', 'i1')).toBe(1800)
    const q = await db.syncQueue.toArray()
    expect(q.some((e) => e.resourceType === 'ContractPrice' && e.resourceId === cp.id)).toBe(true)
  })

  it('upserts by (customer,item): same pair updates, reuses id, no duplicate row', async () => {
    const a = await setContractPrice({ customerId: 'c1', catalogItemId: 'i1', priceMinor: 1800, createdBy: 'p1' })
    const b = await setContractPrice({ customerId: 'c1', catalogItemId: 'i1', priceMinor: 1500, createdBy: 'p1' })
    expect(b.id).toBe(a.id)
    expect(await resolveContractPrice('c1', 'i1')).toBe(1500)
    expect((await db.contractPrices.where('[customerId+catalogItemId]').equals(['c1','i1']).toArray())).toHaveLength(1)
  })

  it('resolve returns null when no contract price; getContractPrices filters by customer; remove deletes', async () => {
    expect(await resolveContractPrice('c1', 'nope')).toBeNull()
    const cp = await setContractPrice({ customerId: 'c2', catalogItemId: 'i9', priceMinor: 999, createdBy: 'p1' })
    expect((await getContractPrices('c2')).map((x) => x.id)).toEqual([cp.id])
    await removeContractPrice(cp.id)
    expect(await db.contractPrices.get(cp.id)).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test contract-price-service`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// apps/pharmacy-lite/src/lib/wholesale/contract-price-service.ts
import { db } from '@/lib/db'
import { enqueuePharmacySyncEntry } from '@/lib/dexie-sync-adapter'
import type { ContractPrice } from './types'

export async function setContractPrice(params: {
  customerId: string; catalogItemId: string; priceMinor: number; createdBy: string
}): Promise<ContractPrice> {
  const existing = await db.contractPrices
    .where('[customerId+catalogItemId]').equals([params.customerId, params.catalogItemId]).first()
  const now = new Date().toISOString()
  const row: ContractPrice = existing
    ? { ...existing, priceMinor: params.priceMinor }
    : { id: crypto.randomUUID(), customerId: params.customerId, catalogItemId: params.catalogItemId, priceMinor: params.priceMinor, createdBy: params.createdBy, createdAt: now }
  await db.contractPrices.put(row)
  await enqueuePharmacySyncEntry({
    resourceType: 'ContractPrice', resourceId: row.id, action: existing ? 'update' : 'create',
    payload: row as unknown as Record<string, unknown>, hlcTimestamp: now, createdAt: now,
  })
  return row
}

export async function removeContractPrice(id: string): Promise<void> {
  await db.contractPrices.delete(id)   // local-only this slice (no delete-sync)
}

export async function getContractPrices(customerId: string): Promise<ContractPrice[]> {
  return db.contractPrices.where('customerId').equals(customerId).toArray()
}

export async function resolveContractPrice(customerId: string, catalogItemId: string): Promise<number | null> {
  const row = await db.contractPrices.where('[customerId+catalogItemId]').equals([customerId, catalogItemId]).first()
  return row ? row.priceMinor : null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F pharmacy-lite test contract-price-service`
Expected: PASS.

- [ ] **Step 5: Commit** (checkpoint)

```bash
git add apps/pharmacy-lite/src/lib/wholesale/contract-price-service.ts apps/pharmacy-lite/src/__tests__/contract-price-service.test.ts
git commit -m "feat(pharmacy-lite): contract-price service"
```

---

### Task 3: Supabase migration — `contract_prices`

**Files:**
- Create: `supabase/migrations/048_contract_prices.sql`

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/048_contract_prices.sql` with the exact SQL from spec §7.1 (`contract_prices` with `id`, `customer_id UUID`, `catalog_item_id TEXT`, `price BIGINT`, `created_by`, `org_id NOT NULL`, `hlc_timestamp`, `created_at`, `UNIQUE(org_id, customer_id, catalog_item_id)`, indexes, RLS + service_role policy).

- [ ] **Step 2: Confirm the migration number + apply**

Use `mcp__plugin_supabase_supabase__list_migrations` to confirm `048` is free (B1 used `047`; if `048` is taken, rename to the next free `NNN_contract_prices.sql`). Then `mcp__plugin_supabase_supabase__apply_migration` (name `048_contract_prices`, the SQL).

- [ ] **Step 3: Verify**

`mcp__plugin_supabase_supabase__execute_sql`: `SELECT column_name FROM information_schema.columns WHERE table_name='contract_prices';` → confirm `price`, `org_id`, `hlc_timestamp`, `catalog_item_id`. And `SELECT relrowsecurity FROM pg_class WHERE relname='contract_prices';` → `true`.

- [ ] **Step 4: Commit** (checkpoint)

```bash
git add supabase/migrations/048_contract_prices.sql
git commit -m "feat(hub): contract_prices table (048)"
```

---

### Task 4: Hub ingestion — flattener + map + RBAC + `sync.push` test

**Files:**
- Modify: `apps/hub-api/src/lib/resource-mappers.ts`, `apps/hub-api/src/trpc/routers/sync.ts`, `apps/hub-api/src/trpc/rbac.ts`
- Test: `apps/hub-api/src/__tests__/sync.test.ts` (add a case)

**Interfaces:**
- Produces: `sync.push` accepts `ContractPrice` → row in `contract_prices` with `price` (from `priceMinor`) + `org_id`.

- [ ] **Step 1: Write the failing test**

Add to `sync.test.ts` (reuse its caller + mock harness, as the B1/B2 wholesale cases did):

```ts
describe('sync.push — ContractPrice ingestion', () => {
  it('lands a ContractPrice in contract_prices with price from priceMinor + org_id stamped', async () => {
    // PHARMACIST caller, ctx.user.orgId='org-1', mock capturing the upsert table + row
    const op = { resourceType: 'ContractPrice', resourceId: 'cp1', action: 'create',
      payload: JSON.stringify({ id: 'cp1', customerId: 'c1', catalogItemId: 'i1', priceMinor: 1800, createdBy: 'p1', createdAt: '2026-09-08T00:00:00Z' }), hlcTimestamp: '100' }
    const res = await caller.sync.push([op])
    expect(res.results[0]).toMatchObject({ resourceId: 'cp1', success: true })
    expect(upsertedTable).toBe('contract_prices')
    // flattener maps priceMinor -> price; org stamped from context
    expect(upsertedRow).toMatchObject({ id: 'cp1', price: 1800, orgId: 'org-1' })
  })
})
```
(Adapt `caller`/`upsertedTable`/`upsertedRow` to the real harness; the row may be camelCase in the mock — assert `price: 1800` and org stamped, per the B1 precedent.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F hub-api test sync`
Expected: FAIL — `Unknown resource type: ContractPrice`.

- [ ] **Step 3: Implement**

- `resource-mappers.ts`: add + register
```ts
function flattenContractPrice(p: any): Record<string, unknown> {
  return { id: p.id, customerId: p.customerId, catalogItemId: p.catalogItemId, price: p.priceMinor, createdBy: p.createdBy, createdAt: p.createdAt ?? new Date().toISOString() }
}
// in mappers: ContractPrice: flattenContractPrice,
```
- `sync.ts`: `RESOURCE_TABLE_MAP` += `ContractPrice: 'contract_prices'`; `ORG_SCOPED_TABLES` += `'contract_prices'`.
- `rbac.ts`: `ROLE_PERMISSIONS.PHARMACIST` += `'ContractPrice'`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F hub-api test sync`
Expected: PASS (+ existing sync tests green).

- [ ] **Step 5: Commit** (checkpoint)

```bash
git add apps/hub-api/src/lib/resource-mappers.ts apps/hub-api/src/trpc/routers/sync.ts apps/hub-api/src/trpc/rbac.ts apps/hub-api/src/__tests__/sync.test.ts
git commit -m "feat(hub): ingest ContractPrice via sync.push"
```

---

### Task 5: B2 pull — hydrate `ContractPrice`

**Files:**
- Modify: `apps/pharmacy-lite/src/lib/wholesale/wholesale-pull.ts`
- Test: `apps/pharmacy-lite/src/__tests__/wholesale-pull.test.ts` (add a case); optionally `apps/hub-api/src/__tests__/sync.test.ts` (pull case)

**Interfaces:**
- Consumes: `db.contractPrices`, the existing `pullWholesale` handler.
- Produces: pulled `ContractPrice` rows land in `db.contractPrices` with `price → priceMinor`.

- [ ] **Step 1: Write the failing test**

Add to `wholesale-pull.test.ts` (reuse its fetch mock + `pullResponse` helper):

```ts
it('hydrates a ContractPrice, mapping Hub price -> priceMinor', async () => {
  fetchMock.mockResolvedValue(pullResponse([
    { resourceType: 'ContractPrice', resourceId: 'cp1', hlcTimestamp: '7', data: { id: 'cp1', customerId: 'c1', catalogItemId: 'i1', price: 1800, createdBy: 'p1', createdAt: '2026-09-08T00:00:00Z' } },
  ]))
  await pullWholesale()
  const cp = await db.contractPrices.get('cp1')
  expect(cp).toMatchObject({ id: 'cp1', customerId: 'c1', catalogItemId: 'i1', priceMinor: 1800 })
  expect((cp as Record<string, unknown>).price).toBeUndefined()
})

it('requests ContractPrice among the pulled resource types', async () => {
  fetchMock.mockResolvedValue(pullResponse([]))
  await pullWholesale()
  expect(decodeURIComponent(fetchMock.mock.calls[0][0] as string)).toContain('ContractPrice')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test wholesale-pull`
Expected: FAIL — `ContractPrice` not in `WHOLESALE_TYPES` / not routed to a table / `price` not mapped.

- [ ] **Step 3: Implement**

In `wholesale-pull.ts`:
- Add `'ContractPrice'` to the `WHOLESALE_TYPES` array.
- In `tableFor`: `if (resourceType === 'ContractPrice') return db.contractPrices`.
- In `toClientRow`: add
```ts
if (resourceType === 'ContractPrice') {
  const { price, ...rest } = data
  return { ...rest, priceMinor: price }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F pharmacy-lite test wholesale-pull`
Expected: PASS (+ existing pull tests green).

- [ ] **Step 5: Commit** (checkpoint)

```bash
git add apps/pharmacy-lite/src/lib/wholesale/wholesale-pull.ts apps/pharmacy-lite/src/__tests__/wholesale-pull.test.ts
git commit -m "feat(pharmacy-lite): pull ContractPrice (price->priceMinor)"
```

---

### Task 6: Order-line resolution uses contract price

**Files:**
- Modify: `apps/pharmacy-lite/src/components/pharmacy/wholesale/NewOrderPage.tsx`
- Test: `apps/pharmacy-lite/src/__tests__/WholesaleNewOrderPage.test.tsx` (add cases)

**Interfaces:**
- Consumes: `resolveContractPrice` (Task 2).

- [ ] **Step 1: Write the failing test**

Add to `WholesaleNewOrderPage.test.tsx`. Mock `@/lib/wholesale/contract-price-service` so `resolveContractPrice` returns a contract price for a specific (customer,item) and null otherwise; seed `db.catalogItems` with an item (`wholesalePrice`). Assert that adding that item as a line for the contract customer yields the contract unit price (not `wholesalePrice`), and for a non-contract item falls back to `wholesalePrice`. (Follow the file's existing pattern for adding a catalog line + reading the line's `unitPriceMinor`/displayed price.)

```ts
// sketch — adapt to the file's harness:
vi.mock('@/lib/wholesale/contract-price-service', () => ({
  resolveContractPrice: vi.fn(async (cust: string, item: string) => (cust === 'c1' && item === 'i1' ? 1500 : null)),
}))
// ...add item i1 (wholesalePrice 2000) to an order for customer c1 → line unitPriceMinor === 1500 (contract), NOT 2000
// ...add item i2 (wholesalePrice 800) → line unitPriceMinor === 800 (fallback)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test WholesaleNewOrderPage`
Expected: FAIL — line uses `wholesalePrice` (2000), not the contract price (1500).

- [ ] **Step 3: Implement**

In `NewOrderPage.tsx`: import `resolveContractPrice`. The current `computeUnitPriceMinor(unit, item)` uses `item.wholesalePrice`. Change the per-base resolution to be contract-aware. Since resolution is async, make the line-add path (`addCatalogLine`) and the unit-change handler resolve the base price:
```ts
const base = (await resolveContractPrice(customerId, item.id)) ?? item.wholesalePrice ?? 0
const unitPriceMinor = unit === 'pack' ? base * item.packSize : base
```
where `customerId` is the form's selected customer. Keep the manual per-line price override behavior unchanged (an override still wins). On CUSTOMER change, re-resolve each existing line's `unitPriceMinor` from the new customer (map each line through `resolveContractPrice(newCustomerId, line.catalogItemId) ?? wholesalePrice`). If a line was manually overridden, re-resolution replaces it (acceptable — documented).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F pharmacy-lite test WholesaleNewOrderPage`
Expected: PASS (+ existing new-order tests green).

- [ ] **Step 5: Commit** (checkpoint)

```bash
git add apps/pharmacy-lite/src/components/pharmacy/wholesale/NewOrderPage.tsx apps/pharmacy-lite/src/__tests__/WholesaleNewOrderPage.test.tsx
git commit -m "feat(pharmacy-lite): order lines use contract price"
```

---

### Task 7: Customer detail page + contract-prices section

**Files:**
- Create: `apps/pharmacy-lite/src/app/[locale]/(app)/wholesale/customers/[id]/page.tsx`, `apps/pharmacy-lite/src/components/pharmacy/wholesale/CustomerDetailPage.tsx`
- Modify: `apps/pharmacy-lite/src/components/pharmacy/wholesale/CustomersPage.tsx` (row link)
- Test: `apps/pharmacy-lite/src/__tests__/WholesaleCustomerDetailPage.test.tsx`

**Interfaces:**
- Consumes: `getCustomerById`, `updateCustomer` (customer-service); `getContractPrices`, `setContractPrice`, `removeContractPrice` (Task 2); `db.catalogItems`; `useAuthSessionStore.getState().getPractitionerRef()`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/pharmacy-lite/src/__tests__/WholesaleCustomerDetailPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'c1' }), useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/stores/auth-session-store', () => ({ useAuthSessionStore: { getState: () => ({ getPractitionerRef: () => 'Practitioner/p1' }) } }))
const mockGetCustomer = vi.fn().mockResolvedValue({ id: 'c1', name: 'Herat Depot', isActive: true, createdAt: '' })
vi.mock('@/lib/wholesale/customer-service', () => ({ getCustomerById: () => mockGetCustomer(), updateCustomer: vi.fn() }))
const mockGetPrices = vi.fn().mockResolvedValue([])
const mockSet = vi.fn().mockResolvedValue({ id: 'cp1' })
vi.mock('@/lib/wholesale/contract-price-service', () => ({ getContractPrices: () => mockGetPrices(), setContractPrice: (...a: unknown[]) => mockSet(...a), removeContractPrice: vi.fn() }))
import { CustomerDetailPage } from '@/components/pharmacy/wholesale/CustomerDetailPage'
beforeEach(() => vi.clearAllMocks())
describe('CustomerDetailPage', () => {
  it('renders the customer name and a Contract prices section', async () => {
    render(<CustomerDetailPage />)
    await waitFor(() => expect(screen.getByText('Herat Depot')).toBeInTheDocument())
    expect(screen.getByText(/contract prices/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test WholesaleCustomerDetailPage`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `CustomerDetailPage.tsx` (detail-page standard: root `flex flex-col gap-4`, standalone `<h1 text-2xl font-semibold>` = customer name, left back button `<Button variant="ghost" size="sm" className="w-fit px-0">` to `/wholesale/customers`, boxed cards `rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50`). Read `id` from `useParams`; load `getCustomerById(id)`.
- **Customer info card:** editable fields (name/contact/phone/email/address/paymentTermsDays/creditLimit) saved via `updateCustomer`.
- **Contract prices card** (`text-sm font-semibold` heading "Contract prices"): a table of `getContractPrices(id)` (item name via `db.catalogItems` lookup · price via the minor-unit formatter · Remove → `removeContractPrice`), plus an add row: catalog search over `db.catalogItems` → major-unit price input → on submit `setContractPrice({ customerId: id, catalogItemId, priceMinor: Math.round(parseFloat(x)*10^minorUnits), createdBy: getPractitionerRef() })` then refresh. ui-kit `EmptyState` when no prices. Money display + input conversion like `NewOrderPage`. `page.tsx` is `'use client'` returning `<CustomerDetailPage />`.
Then in `CustomersPage.tsx`: make each customer row link/navigate to `/wholesale/customers/${c.id}`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F pharmacy-lite test WholesaleCustomerDetailPage`
Expected: PASS.

- [ ] **Step 5: Add LTR+RTL snapshots + commit** (checkpoint)

Add LTR + RTL snapshot cases, then:
```bash
git add "apps/pharmacy-lite/src/app/[locale]/(app)/wholesale/customers/[id]" apps/pharmacy-lite/src/components/pharmacy/wholesale/CustomerDetailPage.tsx apps/pharmacy-lite/src/components/pharmacy/wholesale/CustomersPage.tsx apps/pharmacy-lite/src/__tests__/WholesaleCustomerDetailPage.test.tsx
git commit -m "feat(pharmacy-lite): customer detail page + contract prices UI"
```

---

### Task 8: Verification

**Files:** none (verification only)

- [ ] **Step 1: Hub suite** — `pnpm -F hub-api test` → new ContractPrice case passes; existing sync green (the pre-existing unrelated `license-expiry.test.ts` failure is out of scope).
- [ ] **Step 2: Pharmacy suite** — `pnpm -F pharmacy-lite test` → new tests pass; only the known `DatabaseClosedError` teardown flake remains.
- [ ] **Step 3: Typecheck** — `pnpm -F hub-api typecheck` and `pnpm -F pharmacy-lite typecheck` → no NEW errors referencing this slice's files (`types.ts`, `db.ts`, `contract-price-service.ts`, `wholesale-pull.ts`, `NewOrderPage.tsx`, `CustomerDetailPage.tsx`, hub `sync.ts`/`rbac.ts`/`resource-mappers.ts`). Pre-existing unbuilt-`@ultranos/*`-dep errors in hub-api are out of scope.
- [ ] **Step 4: Live (optional, if servers + a valid session available)** — set a contract price for a customer on the detail page, start a new order for them, confirm the line auto-prices to the contract price (not `wholesalePrice`). If no authenticated session is available, record the live check as deferred.

---

## Self-Review

**Spec coverage:**
- §3.1 type + §3.2 table → Task 1. ✓
- §4 service (set/remove/list/resolve, upsert-by-pair) → Task 2. ✓
- §7.1 migration → Task 3. ✓
- §7.2 hub ingestion (map/ORG_SCOPED/RBAC/flattener) → Task 4. ✓
- §7.4 B2 pull (types list, tableFor, price→priceMinor) → Task 5. ✓  §7.3 drain (no change) — noted. ✓
- §5 resolution (contract→default→0, pack, override, customer-change) → Task 6. ✓
- §6 customer detail page + list link → Task 7. ✓
- §8 tests → each task carries them; Task 8 runs suites/typecheck. ✓
- §7 removal-local-only limitation → Task 2 `removeContractPrice` (delete only, no enqueue) — matches spec. ✓

**Placeholder scan:** No TBD/TODO. Task 6/7 defer some UI-harness specifics to "the file's existing pattern" (a real spec the implementer reads) but give concrete resolution logic, testids intent, and the money conversion — acceptable for modify-existing-UI tasks.

**Type consistency:** `priceMinor` (client) ↔ `price` (Hub column) mapped in Task 4 flatten (`priceMinor→price`) and Task 5 pull (`price→priceMinor`) — symmetric. `resolveContractPrice(customerId, catalogItemId): Promise<number|null>` consistent Task 2 ↔ Task 6. `db.contractPrices` table + `[customerId+catalogItemId]` index consistent Tasks 1/2/5. Migration `048` matches spec. ✓
