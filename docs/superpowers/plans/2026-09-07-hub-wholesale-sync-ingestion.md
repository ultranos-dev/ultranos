# Hub B1 — Wholesale Sync Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Pharmacy-Lite's `WholesaleCustomer`, `SalesOrder`, `CustomerLedgerEntry` queue entries drain to the Hub — landing in new org-scoped Postgres tables — by extending the Hub's generic `sync.push` and routing the pharmacy drain by `resourceType`.

**Architecture:** Add 3 Supabase tables (+RLS). Register the 3 resource types in the Hub's `sync.push` (`RESOURCE_TABLE_MAP` + `ORG_SCOPED_TABLES`), grant PHARMACIST access (`rbac.ts`), and add 3 flatteners (`resource-mappers.ts`). Change the pharmacy `drainSyncFn` to route `MedicationDispense → /medication.recordDispense` and everything else → `/sync.push`.

**Tech Stack:** Node/tRPC (hub-api), Supabase Postgres (via Supabase MCP tools), Vitest. Pharmacy-Lite Next.js + Vitest.

**Spec:** `docs/superpowers/specs/2026-09-07-hub-wholesale-sync-ingestion-design.md`

## Global Constraints

- **Database operations use the Supabase MCP tools ONLY** (`apply_migration`, `list_tables`, `execute_sql`) — never raw psql or a manual migration run. (CLAUDE.md.)
- **Money = integer minor units → `BIGINT`** columns. `tax_rate` is a percentage → `NUMERIC`.
- **Org-scoped:** the 3 tables carry `org_id UUID NOT NULL`; the Hub stamps it from `ctx.user.orgId`. All 3 tables must be added to `ORG_SCOPED_TABLES`.
- **Flatteners return camelCase**; `db.toRow()` converts to snake_case. Flatteners do NOT set `hlcTimestamp` (sync.push injects it).
- **Client `CustomerLedgerEntry.timestamp` → column `entry_timestamp`** (avoid the SQL keyword); the flattener maps it via `entryTimestamp`.
- **`MedicationDispense` stays on `/medication.recordDispense`** — never routed to `sync.push` (it does idempotency/TOCTOU/MedicationStatement work a plain upsert must not bypass).
- **RLS:** enable RLS + a `service_role` all-access policy on each new table (Hub connects as service role; RLS is defence-in-depth), mirroring `supabase/migrations/004_fhir_encounters.sql`.
- **Commits:** commit steps below are the intended cadence but per repo policy (CLAUDE.md) **do not `git commit` without the user's explicit go-ahead** — treat each as a checkpoint.

---

## File Structure

**Create:**
- `supabase/migrations/047_wholesale_sync_tables.sql` — 3 tables + RLS (applied via Supabase MCP).
- `apps/hub-api/src/__tests__/resource-mappers-wholesale.test.ts` — flattener unit tests.

**Modify:**
- `apps/hub-api/src/lib/resource-mappers.ts` — 3 flatteners + register in `mappers`.
- `apps/hub-api/src/trpc/rbac.ts` — grant PHARMACIST the 3 resource types.
- `apps/hub-api/src/trpc/routers/sync.ts` — `RESOURCE_TABLE_MAP` + `ORG_SCOPED_TABLES` entries.
- `apps/hub-api/src/__tests__/sync.test.ts` — add wholesale ingestion cases (reuse its existing caller/mock harness).
- `apps/pharmacy-lite/src/lib/drain-sync-fn.ts` — route by `resourceType`.
- `apps/pharmacy-lite/src/__tests__/drain-sync-fn.test.ts` — add routing cases.

---

### Task 1: Supabase migration — 3 wholesale tables + RLS

**Files:**
- Create: `supabase/migrations/047_wholesale_sync_tables.sql`

**Interfaces:**
- Produces: tables `wholesale_customers`, `sales_orders`, `customer_ledger_entries` (org-scoped, RLS on).

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/047_wholesale_sync_tables.sql`:

```sql
-- 047: Wholesale sync ingestion tables (B1). Org-scoped; Hub connects as service_role.
CREATE TABLE IF NOT EXISTS wholesale_customers (
  id                 UUID PRIMARY KEY,
  name               TEXT NOT NULL,
  contact_name       TEXT,
  phone              TEXT,
  email              TEXT,
  address            TEXT,
  payment_terms_days INTEGER,
  credit_limit       BIGINT,
  ultranos_org_id    TEXT,
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  org_id             UUID NOT NULL,
  hlc_timestamp      TEXT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wholesale_customers_org ON wholesale_customers(org_id);
ALTER TABLE wholesale_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_wholesale_customers" ON wholesale_customers TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS sales_orders (
  id            UUID PRIMARY KEY,
  order_number  TEXT NOT NULL,
  customer_id   UUID NOT NULL,
  status        TEXT NOT NULL,
  lines         JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal      BIGINT NOT NULL DEFAULT 0,
  tax_rate      NUMERIC NOT NULL DEFAULT 0,
  tax_amount    BIGINT NOT NULL DEFAULT 0,
  total         BIGINT NOT NULL DEFAULT 0,
  notes         TEXT,
  created_by    TEXT NOT NULL,
  fulfilled_at  TIMESTAMPTZ,
  cancelled_at  TIMESTAMPTZ,
  org_id        UUID NOT NULL,
  hlc_timestamp TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sales_orders_org ON sales_orders(org_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_customer ON sales_orders(customer_id);
ALTER TABLE sales_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_sales_orders" ON sales_orders TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS customer_ledger_entries (
  id              UUID PRIMARY KEY,
  customer_id     UUID NOT NULL,
  type            TEXT NOT NULL,
  amount          BIGINT NOT NULL,
  sales_order_id  UUID,
  note            TEXT,
  created_by      TEXT NOT NULL,
  entry_timestamp TIMESTAMPTZ NOT NULL,
  org_id          UUID NOT NULL,
  hlc_timestamp   TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customer_ledger_org ON customer_ledger_entries(org_id);
CREATE INDEX IF NOT EXISTS idx_customer_ledger_customer ON customer_ledger_entries(customer_id);
ALTER TABLE customer_ledger_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_customer_ledger_entries" ON customer_ledger_entries TO service_role USING (true) WITH CHECK (true);
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Use the `mcp__plugin_supabase_supabase__apply_migration` tool with `name: "047_wholesale_sync_tables"` and the SQL above as `query`.

- [ ] **Step 3: Verify the tables exist**

Use `mcp__plugin_supabase_supabase__list_tables` (or `execute_sql` with `SELECT table_name FROM information_schema.tables WHERE table_name IN ('wholesale_customers','sales_orders','customer_ledger_entries');`).
Expected: all three tables listed. Then `execute_sql`: `SELECT column_name FROM information_schema.columns WHERE table_name='sales_orders';` — confirm `lines`, `org_id`, `hlc_timestamp`, `total` present.

- [ ] **Step 4: Verify RLS is enabled**

`execute_sql`: `SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('wholesale_customers','sales_orders','customer_ledger_entries');`
Expected: `relrowsecurity = true` for all three.

- [ ] **Step 5: Commit** (checkpoint)

```bash
git add supabase/migrations/047_wholesale_sync_tables.sql
git commit -m "feat(hub): wholesale sync ingestion tables (047)"
```

---

### Task 2: Flatteners (`resource-mappers.ts`)

**Files:**
- Modify: `apps/hub-api/src/lib/resource-mappers.ts`
- Test: `apps/hub-api/src/__tests__/resource-mappers-wholesale.test.ts`

**Interfaces:**
- Consumes: `flattenForDb(resourceType, payload)` dispatcher + `mappers` registry (existing).
- Produces: `flattenForDb('WholesaleCustomer'|'SalesOrder'|'CustomerLedgerEntry', payload)` returns a camelCase row.

- [ ] **Step 1: Write the failing test**

```ts
// apps/hub-api/src/__tests__/resource-mappers-wholesale.test.ts
import { describe, it, expect } from 'vitest'
import { flattenForDb } from '@/lib/resource-mappers'

describe('wholesale flatteners', () => {
  it('flattens WholesaleCustomer 1:1 with defaults', () => {
    const row = flattenForDb('WholesaleCustomer', {
      id: 'c1', name: 'Herat Depot', creditLimit: 500000, isActive: true, createdAt: '2026-09-07T00:00:00Z',
    })
    expect(row).toMatchObject({ id: 'c1', name: 'Herat Depot', creditLimit: 500000, isActive: true })
    expect(row.contactName).toBeNull()
  })

  it('flattens SalesOrder passing lines through as-is (JSONB)', () => {
    const lines = [{ catalogItemId: 'i1', unit: 'each', quantity: 10, unitPrice: 2000, lineTotal: 20000, baseUnits: 10, batchAllocations: [{ stockBatchId: 'b1', qty: 10 }] }]
    const row = flattenForDb('SalesOrder', {
      id: 'o1', orderNumber: 'SO-1', customerId: 'c1', status: 'fulfilled', lines,
      subtotal: 20000, taxRate: 0, taxAmount: 0, total: 20000, createdBy: 'p1', createdAt: '2026-09-07T00:00:00Z',
    })
    expect(row).toMatchObject({ id: 'o1', orderNumber: 'SO-1', customerId: 'c1', status: 'fulfilled', total: 20000 })
    expect(row.lines).toEqual(lines)
    expect(row.hlcTimestamp).toBeUndefined() // injected by sync.push, not the flattener
  })

  it('flattens CustomerLedgerEntry mapping timestamp -> entryTimestamp', () => {
    const row = flattenForDb('CustomerLedgerEntry', {
      id: 'l1', customerId: 'c1', type: 'charge', amount: 20000, salesOrderId: 'o1', createdBy: 'p1', timestamp: '2026-09-07T01:00:00Z',
    })
    expect(row).toMatchObject({ id: 'l1', customerId: 'c1', type: 'charge', amount: 20000, salesOrderId: 'o1', entryTimestamp: '2026-09-07T01:00:00Z' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F hub-api test resource-mappers-wholesale`
Expected: FAIL — flatteners not registered (unmapped pass-through returns different shape; `entryTimestamp`/`contactName` assertions fail).

- [ ] **Step 3: Add the flatteners + register them**

In `apps/hub-api/src/lib/resource-mappers.ts`, add three functions (mirror the existing flattener style) and register them in the `mappers` object:

```ts
function flattenWholesaleCustomer(p: any): Record<string, unknown> {
  return {
    id: p.id,
    name: p.name,
    contactName: p.contactName ?? null,
    phone: p.phone ?? null,
    email: p.email ?? null,
    address: p.address ?? null,
    paymentTermsDays: p.paymentTermsDays ?? null,
    creditLimit: p.creditLimit ?? null,
    ultranosOrgId: p.ultranosOrgId ?? null,
    isActive: p.isActive ?? true,
    createdAt: p.createdAt ?? new Date().toISOString(),
  }
}

function flattenSalesOrder(p: any): Record<string, unknown> {
  return {
    id: p.id,
    orderNumber: p.orderNumber,
    customerId: p.customerId,
    status: p.status,
    lines: p.lines ?? [],
    subtotal: p.subtotal ?? 0,
    taxRate: p.taxRate ?? 0,
    taxAmount: p.taxAmount ?? 0,
    total: p.total ?? 0,
    notes: p.notes ?? null,
    createdBy: p.createdBy,
    fulfilledAt: p.fulfilledAt ?? null,
    cancelledAt: p.cancelledAt ?? null,
    createdAt: p.createdAt ?? new Date().toISOString(),
  }
}

function flattenCustomerLedgerEntry(p: any): Record<string, unknown> {
  return {
    id: p.id,
    customerId: p.customerId,
    type: p.type,
    amount: p.amount,
    salesOrderId: p.salesOrderId ?? null,
    note: p.note ?? null,
    createdBy: p.createdBy,
    entryTimestamp: p.timestamp,
    createdAt: p.timestamp ?? new Date().toISOString(),
  }
}
```

Register in the `mappers` object (alongside `MedicationRequest: flattenMedicationRequest`):

```ts
  WholesaleCustomer: flattenWholesaleCustomer,
  SalesOrder: flattenSalesOrder,
  CustomerLedgerEntry: flattenCustomerLedgerEntry,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F hub-api test resource-mappers-wholesale`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit** (checkpoint)

```bash
git add apps/hub-api/src/lib/resource-mappers.ts apps/hub-api/src/__tests__/resource-mappers-wholesale.test.ts
git commit -m "feat(hub): wholesale resource flatteners"
```

---

### Task 3: RBAC grant (`rbac.ts`)

**Files:**
- Modify: `apps/hub-api/src/trpc/rbac.ts`
- Test: add to `apps/hub-api/src/__tests__/` (a new `rbac-wholesale.test.ts`, or the existing rbac test file if present)

**Interfaces:**
- Consumes: `hasResourceAccess(role, resourceType)`, `ROLE_PERMISSIONS` (existing).
- Produces: PHARMACIST may access the 3 wholesale resource types.

- [ ] **Step 1: Write the failing test**

```ts
// apps/hub-api/src/__tests__/rbac-wholesale.test.ts
import { describe, it, expect } from 'vitest'
import { hasResourceAccess } from '@/trpc/rbac'

describe('wholesale RBAC', () => {
  it('PHARMACIST may access the 3 wholesale resource types', () => {
    for (const t of ['WholesaleCustomer', 'SalesOrder', 'CustomerLedgerEntry']) {
      expect(hasResourceAccess('PHARMACIST', t)).toBe(true)
    }
  })
  it('PHARMACIST retains existing access', () => {
    expect(hasResourceAccess('PHARMACIST', 'MedicationDispense')).toBe(true)
  })
  it('non-pharmacist roles are denied wholesale resources', () => {
    expect(hasResourceAccess('DOCTOR', 'SalesOrder')).toBe(false)
    expect(hasResourceAccess('LAB_TECH', 'WholesaleCustomer')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F hub-api test rbac-wholesale`
Expected: FAIL — PHARMACIST access to the 3 types returns false.

- [ ] **Step 3: Grant PHARMACIST the 3 types**

In `apps/hub-api/src/trpc/rbac.ts`, extend the `PHARMACIST` set in `ROLE_PERMISSIONS`:

```ts
  PHARMACIST: new Set([
    'MedicationRequest',
    'MedicationDispense',
    'WholesaleCustomer',
    'SalesOrder',
    'CustomerLedgerEntry',
  ]),
```

Do NOT change any other role.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F hub-api test rbac-wholesale`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit** (checkpoint)

```bash
git add apps/hub-api/src/trpc/rbac.ts apps/hub-api/src/__tests__/rbac-wholesale.test.ts
git commit -m "feat(hub): grant PHARMACIST wholesale sync access"
```

---

### Task 4: Register in `sync.push` (map + org-scoped) + integration test

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/sync.ts`
- Test: `apps/hub-api/src/__tests__/sync.test.ts` (add cases; reuse its existing caller/mock harness)

**Interfaces:**
- Consumes: flatteners (Task 2), RBAC (Task 3), `sync.push` handler (existing).
- Produces: `sync.push` with a wholesale op upserts to the right table with `org_id` stamped.

- [ ] **Step 1: Write the failing test**

Add to `apps/hub-api/src/__tests__/sync.test.ts`, using the SAME caller factory + mocked-Supabase harness the file already uses for existing `sync.push` tests (read the file to reuse `createCaller` / the mock `from` that captures upserts and returns `{data:null}` on the conflict-check select). Add:

```ts
describe('sync.push — wholesale ingestion (B1)', () => {
  it('lands a WholesaleCustomer in wholesale_customers with org_id stamped', async () => {
    // Arrange: PHARMACIST caller with ctx.user.orgId = 'org-1', mock supabase capturing upsert
    // (reuse this file's existing helpers).
    const op = {
      resourceType: 'WholesaleCustomer', resourceId: 'c1', action: 'create',
      payload: JSON.stringify({ id: 'c1', name: 'Herat Depot', isActive: true, createdAt: '2026-09-07T00:00:00Z' }),
      hlcTimestamp: '100',
    }
    const res = await caller.sync.push([op])
    expect(res.results[0]).toMatchObject({ resourceId: 'c1', success: true })
    // Assert upsert targeted 'wholesale_customers' with org_id + snake_case row
    expect(upsertedTable).toBe('wholesale_customers')
    expect(upsertedRow).toMatchObject({ id: 'c1', name: 'Herat Depot', org_id: 'org-1', hlc_timestamp: '100' })
  })

  it('rejects when the caller has no org_id (MISSING_ORG_CONTEXT)', async () => {
    // PHARMACIST caller with ctx.user.orgId = null
    const op = { resourceType: 'WholesaleCustomer', resourceId: 'c2', action: 'create', payload: JSON.stringify({ id: 'c2', name: 'X', isActive: true, createdAt: '2026-09-07T00:00:00Z' }), hlcTimestamp: '100' }
    const res = await callerNoOrg.sync.push([op])
    expect(res.results[0]).toMatchObject({ resourceId: 'c2', success: false, error: 'MISSING_ORG_CONTEXT' })
    expect(upsertedTable).toBeUndefined() // no upsert attempted
  })

  it('lands a SalesOrder with lines preserved as JSONB', async () => {
    const lines = [{ catalogItemId: 'i1', unit: 'each', quantity: 10, unitPrice: 2000, lineTotal: 20000, baseUnits: 10, batchAllocations: [{ stockBatchId: 'b1', qty: 10 }] }]
    const op = { resourceType: 'SalesOrder', resourceId: 'o1', action: 'create', payload: JSON.stringify({ id: 'o1', orderNumber: 'SO-1', customerId: 'c1', status: 'fulfilled', lines, subtotal: 20000, taxRate: 0, taxAmount: 0, total: 20000, createdBy: 'p1', createdAt: '2026-09-07T00:00:00Z' }), hlcTimestamp: '100' }
    const res = await caller.sync.push([op])
    expect(res.results[0]).toMatchObject({ resourceId: 'o1', success: true })
    expect(upsertedTable).toBe('sales_orders')
    expect(upsertedRow.lines).toEqual(lines)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F hub-api test sync`
Expected: FAIL — `WholesaleCustomer`/`SalesOrder` return `error: 'Unknown resource type: …'` (not in `RESOURCE_TABLE_MAP`); org_id not stamped (not in `ORG_SCOPED_TABLES`).

- [ ] **Step 3: Register the resources**

In `apps/hub-api/src/trpc/routers/sync.ts`:

Add to `RESOURCE_TABLE_MAP`:
```ts
  WholesaleCustomer: 'wholesale_customers',
  SalesOrder: 'sales_orders',
  CustomerLedgerEntry: 'customer_ledger_entries',
```

Add to `ORG_SCOPED_TABLES` (the `new Set([...])`):
```ts
  'wholesale_customers', 'sales_orders', 'customer_ledger_entries',
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F hub-api test sync`
Expected: PASS (new cases + existing sync tests still green).

- [ ] **Step 5: Commit** (checkpoint)

```bash
git add apps/hub-api/src/trpc/routers/sync.ts apps/hub-api/src/__tests__/sync.test.ts
git commit -m "feat(hub): register wholesale resources in sync.push (map + org-scoped)"
```

---

### Task 5: Pharmacy drain routing (`drain-sync-fn.ts`)

**Files:**
- Modify: `apps/pharmacy-lite/src/lib/drain-sync-fn.ts`
- Test: `apps/pharmacy-lite/src/__tests__/drain-sync-fn.test.ts` (add cases; reuse harness)

**Interfaces:**
- Consumes: `drainSyncFn(entry: SyncQueueEntry)` (existing), `getHubApiUrl()`, `meteredFetch`.
- Produces: routing — `MedicationDispense → /medication.recordDispense`; everything else → `/sync.push` with `{json:[op]}`.

- [ ] **Step 1: Write the failing test**

Add to `apps/pharmacy-lite/src/__tests__/drain-sync-fn.test.ts` (reuse its existing mocks for the auth store + fetch):

```ts
describe('drainSyncFn resourceType routing (B1)', () => {
  it('routes MedicationDispense to /medication.recordDispense (regression)', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ result: { data: { json: { success: true } } } }) })
    await drainSyncFn({ id: 'd1', resourceType: 'MedicationDispense', resourceId: 'x', action: 'create', payload: JSON.stringify({ dispenseId: 'x' }), status: 'pending', hlcTimestamp: '1', createdAt: '', retryCount: 0 })
    expect(fetchMock.mock.calls[0][0]).toContain('/medication.recordDispense')
  })

  it('routes WholesaleCustomer to /sync.push with a {json:[op]} envelope', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ result: { data: { json: { results: [{ resourceId: 'c1', success: true }] } } } }) })
    const entry = { id: 'q1', resourceType: 'WholesaleCustomer', resourceId: 'c1', action: 'create', payload: JSON.stringify({ id: 'c1', name: 'Herat' }), status: 'pending', hlcTimestamp: '5', createdAt: '', retryCount: 0 }
    const res = await drainSyncFn(entry)
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('/sync.push')
    expect(url).not.toContain('/medication.recordDispense')
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.json[0]).toMatchObject({ resourceType: 'WholesaleCustomer', resourceId: 'c1', action: 'create', hlcTimestamp: '5' })
    expect(res.success).toBe(true)
  })

  it('surfaces a Hub error result as a failure', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ result: { data: { json: { results: [{ resourceId: 'o1', success: false, error: 'MISSING_ORG_CONTEXT' }] } } } }) })
    const res = await drainSyncFn({ id: 'q2', resourceType: 'SalesOrder', resourceId: 'o1', action: 'create', payload: '{"id":"o1"}', status: 'pending', hlcTimestamp: '5', createdAt: '', retryCount: 0 })
    expect(res.success).toBe(false)
    expect(res.error).toContain('MISSING_ORG_CONTEXT')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test drain-sync-fn`
Expected: FAIL — WholesaleCustomer routes to `/medication.recordDispense` (hardcoded), body isn't the `{json:[op]}` envelope.

- [ ] **Step 3: Implement routing**

In `apps/pharmacy-lite/src/lib/drain-sync-fn.ts`, replace the hardcoded pathname block (around line 28-30) and body construction. Structure:

```ts
const url = new URL(getHubApiUrl())
const base = url.pathname.replace(/\/$/, '')

let body: unknown
if (entry.resourceType === 'MedicationDispense') {
  url.pathname = base + '/medication.recordDispense'
  let parsed: unknown
  try { parsed = JSON.parse(entry.payload) } catch { return { success: false, error: 'invalid-payload' } }
  body = { json: parsed }
} else {
  url.pathname = base + '/sync.push'
  body = { json: [{
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    action: entry.action === 'update' ? 'update' : 'create',
    payload: entry.payload,           // sync.push expects a JSON *string* payload
    hlcTimestamp: entry.hlcTimestamp,
  }] }
}

const res = await meteredFetch(url.toString(), {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify(body),
})
// ...existing 401/403 handling...
```

Then, when parsing the response for the non-dispense branch, read the batch result:

```ts
if (entry.resourceType !== 'MedicationDispense') {
  const json = await res.json()
  const result = json?.result?.data?.json?.results?.[0]
  if (result?.success) return { success: true }
  if (result?.conflict) return { success: false, conflict: true }
  return { success: false, error: result?.error ?? 'sync-push-failed' }
}
// dispense branch keeps its existing success/error parsing
```

Preserve the existing `auth-expired` (401) return and any 403 handling for both branches.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F pharmacy-lite test drain-sync-fn`
Expected: PASS (new cases + existing dispense tests still green).

- [ ] **Step 5: Commit** (checkpoint)

```bash
git add apps/pharmacy-lite/src/lib/drain-sync-fn.ts apps/pharmacy-lite/src/__tests__/drain-sync-fn.test.ts
git commit -m "feat(pharmacy-lite): route non-dispense sync to /sync.push"
```

---

### Task 6: Verification — suites, typecheck, and the org_id prerequisite

**Files:** none (verification only)

- [ ] **Step 1: Run the hub suite**

Run: `pnpm -F hub-api test`
Expected: the new wholesale tests pass; no regression in existing sync/rbac tests. (Pre-existing unrelated failures, if any, are noted but not this slice's concern.)

- [ ] **Step 2: Run the pharmacy suite**

Run: `pnpm -F pharmacy-lite test`
Expected: `drain-sync-fn` tests pass; only the known pre-existing `SyncQueueDashboard` teardown flake remains.

- [ ] **Step 3: Typecheck both**

Run: `pnpm -F hub-api typecheck` and `pnpm -F pharmacy-lite typecheck`
Expected: no NEW errors referencing the files changed in this slice (`resource-mappers.ts`, `rbac.ts`, `sync.ts`, `drain-sync-fn.ts`). Pre-existing errors elsewhere are out of scope.

- [ ] **Step 4: Verify the org_id prerequisite (Supabase MCP)**

Confirm pharmacist users carry `org_id` so `sync.push` won't reject with `MISSING_ORG_CONTEXT`. `execute_sql`:
`SELECT id, raw_user_meta_data->>'org_id' AS org_id, raw_user_meta_data->>'role' AS role FROM auth.users WHERE raw_user_meta_data->>'role' = 'PHARMACIST' LIMIT 5;`
Expected: `org_id` is non-null for pharmacist accounts. **If null:** STOP and report — this is a config prerequisite (populate `org_id` on pharmacy users) that blocks live sync; it is surfaced loudly by design (rows fail rather than silently drop). Record it as a finding; do not fake data.

- [ ] **Step 5: Commit** (checkpoint) — nothing to commit unless earlier steps were split; otherwise skip.

---

## Self-Review

**Spec coverage:**
- §4.1 tables + RLS → Task 1. ✓
- §4.2 `RESOURCE_TABLE_MAP` + `ORG_SCOPED_TABLES` → Task 4. ✓
- §4.3 PHARMACIST RBAC → Task 3. ✓
- §4.4 flatteners → Task 2. ✓
- §5 drain routing (`MedicationDispense → recordDispense`, else → `sync.push`, `{json:[op]}` envelope, results parsing) → Task 5. ✓
- §6 LWW/idempotency → exercised by sync.push's existing conflict path (unchanged); no new task needed (noted). ✓
- §7 org_id prerequisite → Task 6 Step 4. ✓
- §8 tests → Tasks 2–5 each carry their tests; Task 6 runs the suites + typecheck. ✓

**Placeholder scan:** No TBD/TODO. Task 4's integration test defers the mock-harness details to the existing `sync.test.ts` (a spec the implementer reads) but provides concrete ops + assertions — acceptable for a modify-existing-test task.

**Type consistency:** `entryTimestamp` (flattener camelCase) → `entry_timestamp` (column, via `db.toRow()`) — consistent across Task 1 (column) and Task 2 (flattener). `lines` JSONB consistent Task 1 ↔ Task 2 ↔ Task 4. Money `BIGINT` for `credit_limit/subtotal/tax_amount/total/amount`, `NUMERIC` for `tax_rate` — consistent Task 1 ↔ spec. `payload` sent to `sync.push` as a JSON **string** (Task 5) matches `SyncOperationSchema.payload: string` from the spec/Explore report. ✓

**Known follow-ups (not gaps):** confirm the exact `sync.test.ts` mock-capture helper names when implementing Task 4; confirm `drain-sync-fn.ts`'s existing 403 handling shape when implementing Task 5.
