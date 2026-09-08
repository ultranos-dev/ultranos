# Hub B2 — Wholesale Client Pull Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a second device of the same pharmacy PULL `WholesaleCustomer`/`SalesOrder`/`CustomerLedgerEntry` from the Hub (org-scoped) and hydrate its local Dexie, completing the cross-device story B1 started.

**Architecture:** Extend the Hub's `sync.pull` to org-scope the wholesale tables (`org_id + sinceHlc`, `patientId` optional). Add a net-new pharmacy-lite `pullWholesale()` handler (watermark cursor → call `sync.pull` → transform → conflict → write Dexie → advance cursor), triggered on app-open + `ultranos:sync-now`.

**Tech Stack:** Node/tRPC (hub-api), Supabase Postgres, Dexie/IndexedDB, Vitest. Pharmacy-Lite Next.js.

**Spec:** `docs/superpowers/specs/2026-09-07-b2-wholesale-client-pull-design.md`

## Global Constraints

- **Org isolation:** the Hub pull filters wholesale rows to `ctx.user.orgId`; a missing `org_id` yields an error for that type and NO rows (never leak another org's data).
- **Conflict = remote-wins unless local dirty:** on pull, apply the remote row UNLESS a non-synced sync-queue entry exists for that `id` (status ∈ {pending, failed, syncing, awaiting-key}) → then keep local. No per-row HLC compare (local wholesale rows don't all carry an HLC).
- **Field reversal:** `CustomerLedgerEntry` — the Hub returns `entryTimestamp`; the client type uses `timestamp`; the client maps `entryTimestamp → timestamp`. `WholesaleCustomer`/`SalesOrder` (incl. `lines` inner keys) already arrive camelCase from `db.fromRows`.
- **Watermark:** a single org-level cursor in a new `wholesalePullMeta` Dexie table, key `'wholesale'`, default `'0'`. Advance to the batch max HLC using the shared `@ultranos/sync-engine` HLC compare.
- **Non-PHI:** `wholesalePullMeta` and the wholesale tables are NOT added to `PHI_TABLE_CONFIGS`.
- **Best-effort:** the client pull never throws into the app; offline / auth-expired / Hub error → soft failure, watermark unchanged.
- **Commits:** commit steps are the intended cadence but per repo policy **do not `git commit` without the user's explicit go-ahead** — treat each as a checkpoint.

---

## File Structure

**Create:**
- `apps/pharmacy-lite/src/lib/wholesale/wholesale-pull.ts` — `pullWholesale()`.
- `apps/pharmacy-lite/src/__tests__/wholesale-pull.test.ts`.

**Modify:**
- `apps/hub-api/src/trpc/routers/sync.ts` — `pull`: `patientId` optional + org-scope ORG_SCOPED tables.
- `apps/hub-api/src/__tests__/sync.test.ts` — add pull org-scope cases.
- `apps/pharmacy-lite/src/lib/db.ts` — add `wholesalePullMeta` table (new schema version).
- `apps/pharmacy-lite/src/components/providers/SyncProvider.tsx` — trigger `pullWholesale()`.
- `apps/pharmacy-lite/src/__tests__/` — a SyncProvider trigger test (new or existing).

---

### Task 1: Hub `sync.pull` — org-scoped pull

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/sync.ts` (the `pull` procedure)
- Test: `apps/hub-api/src/__tests__/sync.test.ts` (add cases, reuse harness)

**Interfaces:**
- Produces: `sync.pull({ resourceTypes:['WholesaleCustomer'|'SalesOrder'|'CustomerLedgerEntry'], sinceHlc })` returns `{ changes: [{ resourceType, resourceId, data, hlcTimestamp }] }` filtered by the caller's `org_id`.

- [ ] **Step 1: Write the failing test**

Add to `apps/hub-api/src/__tests__/sync.test.ts` reusing its `createCaller` + mocked-Supabase harness (read the file; mirror how existing `sync.pull` tests build the caller + mock `from().select()...gt('hlc_timestamp', sinceHlc)`). The mock `from('wholesale_customers')` should support the org-scoped query chain and return one row for `org-1`. Cases:

```ts
describe('sync.pull — org-scoped wholesale (B2)', () => {
  it('returns the org\'s wholesale customers filtered by org_id + sinceHlc, no patientId needed', async () => {
    // PHARMACIST caller, ctx.user.orgId = 'org-1'; mock wholesale_customers rows for org-1
    const res = await caller.sync.pull({ resourceTypes: ['WholesaleCustomer'], sinceHlc: '0' })
    expect(res.changes.map(c => c.resourceType)).toContain('WholesaleCustomer')
    expect(res.changes[0]).toMatchObject({ resourceType: 'WholesaleCustomer' })
    // the query was scoped to org_id = 'org-1'
    expect(orgFilterApplied).toBe('org-1')
  })

  it('rejects org-scoped pull when caller has no org_id (no rows leaked)', async () => {
    // caller with ctx.user.orgId = null
    const res = await callerNoOrg.sync.pull({ resourceTypes: ['WholesaleCustomer'], sinceHlc: '0' })
    expect(res.changes.filter(c => c.resourceType === 'WholesaleCustomer')).toHaveLength(0)
  })
})
```

Adapt the capture (`orgFilterApplied`) to whatever the existing harness exposes for asserting the `.eq('org_id', ...)` filter; if impractical, assert instead that the returned rows are only the org-1 rows (and a planted org-2 row is absent).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F hub-api test sync`
Expected: FAIL — wholesale types return no changes (pull skips org-scoped tables at the no-patient-column fallback).

- [ ] **Step 3: Implement org-scoping in `pull`**

Read the `pull` procedure in `sync.ts`. (1) Make `patientId` optional in its input schema (`patientId: z.string().uuid().optional()`). (2) Inside the per-resource loop, AFTER the RBAC + table-map lookup and BEFORE the patient-column branch, insert:

```ts
if (ORG_SCOPED_TABLES.has(tableName)) {
  if (!ctx.user.orgId) {
    // fail-loud: no org context → return nothing for this type (no cross-org leak)
    continue
  }
  const { data: rows, error } = await ctx.supabase
    .from(tableName)
    .select('*')
    .eq('org_id', ctx.user.orgId)
    .gt('hlc_timestamp', input.sinceHlc)
  if (error) { /* mirror the loop's existing error handling */ continue }
  const decrypted = db.fromRows(rows ?? []) as Array<Record<string, unknown>>
  for (const row of decrypted) {
    changes.push({ resourceType: type, resourceId: row.id as string, data: row, hlcTimestamp: row.hlcTimestamp as string })
  }
  continue // handled; skip the patient-column branch
}
```

Match the surrounding variable names (`type`/`tableName`, the `changes` accumulator, the `db.fromRows` import) to the actual code. Patient-scoped tables keep their existing branch; if `patientId` is undefined, patient-scoped types simply find no patient column / are skipped as today.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F hub-api test sync`
Expected: PASS (new cases + existing sync push/pull tests still green).

- [ ] **Step 5: Commit** (checkpoint)

```bash
git add apps/hub-api/src/trpc/routers/sync.ts apps/hub-api/src/__tests__/sync.test.ts
git commit -m "feat(hub): org-scoped sync.pull for wholesale resources"
```

---

### Task 2: Dexie `wholesalePullMeta` watermark table

**Files:**
- Modify: `apps/pharmacy-lite/src/lib/db.ts`
- Test: `apps/pharmacy-lite/src/__tests__/wholesale-pull-meta.test.ts`

**Interfaces:**
- Produces: `db.wholesalePullMeta` (`EntityTable<{ key: string; lastPulledHlc: string }, 'key'>`).

- [ ] **Step 1: Write the failing test**

```ts
// apps/pharmacy-lite/src/__tests__/wholesale-pull-meta.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'

beforeEach(async () => { await db.delete(); await db.open() })

describe('wholesalePullMeta table', () => {
  it('round-trips a pull watermark', async () => {
    await db.wholesalePullMeta.put({ key: 'wholesale', lastPulledHlc: '42' })
    expect(await db.wholesalePullMeta.get('wholesale')).toEqual({ key: 'wholesale', lastPulledHlc: '42' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test wholesale-pull-meta`
Expected: FAIL — `db.wholesalePullMeta` undefined.

- [ ] **Step 3: Add the table**

In `apps/pharmacy-lite/src/lib/db.ts`: add the field declaration to `PharmacyLiteDatabase` (`wholesalePullMeta!: EntityTable<{ key: string; lastPulledHlc: string }, 'key'>`) and a NEW `this.version(N+1).stores({ wholesalePullMeta: 'key' })` block (N = current highest, 14 → 15). Do NOT add it to `PHI_TABLE_CONFIGS`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F pharmacy-lite test wholesale-pull-meta`
Expected: PASS.

- [ ] **Step 5: Commit** (checkpoint)

```bash
git add apps/pharmacy-lite/src/lib/db.ts apps/pharmacy-lite/src/__tests__/wholesale-pull-meta.test.ts
git commit -m "feat(pharmacy-lite): wholesalePullMeta watermark table"
```

---

### Task 3: `pullWholesale()` client handler

**Files:**
- Create: `apps/pharmacy-lite/src/lib/wholesale/wholesale-pull.ts`
- Test: `apps/pharmacy-lite/src/__tests__/wholesale-pull.test.ts`

**Interfaces:**
- Consumes: `db` (tables + `db.syncQueue`, `db.wholesalePullMeta`), `getHubApiUrl()` (`@/lib/trpc`), auth token (`useAuthSessionStore.getState().getAccessToken()`), HLC compare from `@ultranos/sync-engine`.
- Produces: `pullWholesale(): Promise<{ pulled: number; applied: number }>` — best-effort; never throws.

- [ ] **Step 1: Write the failing test**

```ts
// apps/pharmacy-lite/src/__tests__/wholesale-pull.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/lib/db'

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: { getState: () => ({ getAccessToken: vi.fn().mockResolvedValue('test-token') }) },
}))
vi.mock('@/lib/trpc', () => ({ getHubApiUrl: () => 'http://hub/api/trpc' }))

import { pullWholesale } from '@/lib/wholesale/wholesale-pull'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

function pullResponse(changes: unknown[]) {
  return { ok: true, json: async () => ({ result: { data: { json: { changes } } } }) }
}

beforeEach(async () => { await db.delete(); await db.open(); vi.clearAllMocks() })

describe('pullWholesale', () => {
  it('writes pulled rows to their Dexie tables and maps entryTimestamp->timestamp', async () => {
    fetchMock.mockResolvedValue(pullResponse([
      { resourceType: 'WholesaleCustomer', resourceId: 'c1', hlcTimestamp: '5', data: { id: 'c1', name: 'Herat', isActive: true, createdAt: '2026-09-07T00:00:00Z' } },
      { resourceType: 'CustomerLedgerEntry', resourceId: 'l1', hlcTimestamp: '6', data: { id: 'l1', customerId: 'c1', type: 'charge', amount: 20000, createdBy: 'p1', entryTimestamp: '2026-09-07T01:00:00Z' } },
    ]))
    const res = await pullWholesale()
    expect(res.applied).toBe(2)
    expect(await db.wholesaleCustomers.get('c1')).toMatchObject({ id: 'c1', name: 'Herat' })
    const ledger = await db.customerLedgerEntries.get('l1')
    expect(ledger).toMatchObject({ id: 'l1', timestamp: '2026-09-07T01:00:00Z' }) // entryTimestamp -> timestamp
    expect((ledger as Record<string, unknown>).entryTimestamp).toBeUndefined()
    expect(await db.wholesalePullMeta.get('wholesale')).toMatchObject({ lastPulledHlc: '6' })
  })

  it('passes the stored watermark as sinceHlc on the next call', async () => {
    await db.wholesalePullMeta.put({ key: 'wholesale', lastPulledHlc: '9' })
    fetchMock.mockResolvedValue(pullResponse([]))
    await pullWholesale()
    const url = fetchMock.mock.calls[0][0] as string
    expect(decodeURIComponent(url)).toContain('"sinceHlc":"9"')
  })

  it('does NOT overwrite a local row that has a pending sync-queue entry (dirty-protection)', async () => {
    await db.salesOrders.put({ id: 'o1', orderNumber: 'SO-LOCAL', customerId: 'c1', status: 'draft', lines: [], subtotal: 0, taxRate: 0, taxAmount: 0, total: 0, createdBy: 'p1', createdAt: '', hlcTimestamp: '1' } as never)
    await db.syncQueue.add({ id: 'q1', resourceType: 'SalesOrder', resourceId: 'o1', action: 'create', payload: '{}', status: 'pending', hlcTimestamp: '1', createdAt: '', retryCount: 0 } as never)
    fetchMock.mockResolvedValue(pullResponse([
      { resourceType: 'SalesOrder', resourceId: 'o1', hlcTimestamp: '5', data: { id: 'o1', orderNumber: 'SO-REMOTE', customerId: 'c1', status: 'fulfilled', lines: [], subtotal: 0, taxRate: 0, taxAmount: 0, total: 0, createdBy: 'p1', createdAt: '', hlcTimestamp: '5' } },
    ]))
    await pullWholesale()
    expect((await db.salesOrders.get('o1'))!.orderNumber).toBe('SO-LOCAL') // local kept
  })

  it('soft-fails when offline (watermark unchanged)', async () => {
    await db.wholesalePullMeta.put({ key: 'wholesale', lastPulledHlc: '3' })
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const res = await pullWholesale()
    expect(res.applied).toBe(0)
    expect(await db.wholesalePullMeta.get('wholesale')).toMatchObject({ lastPulledHlc: '3' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test wholesale-pull`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `pullWholesale`**

Create `src/lib/wholesale/wholesale-pull.ts`. Structure:

```ts
import { db } from '@/lib/db'
import { getHubApiUrl } from '@/lib/trpc'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { compareHlc } from '@ultranos/sync-engine'   // confirm the exact exported name

const WHOLESALE_TYPES = ['WholesaleCustomer', 'SalesOrder', 'CustomerLedgerEntry'] as const

interface PullChange { resourceType: string; resourceId: string; hlcTimestamp: string; data: Record<string, unknown> }

async function isLocalDirty(id: string): Promise<boolean> {
  const entries = await db.syncQueue.where('resourceId').equals(id).toArray()
  return entries.some((e) => e.status === 'pending' || e.status === 'failed' || e.status === 'syncing' || e.status === 'awaiting-key')
}

function tableFor(resourceType: string) {
  if (resourceType === 'WholesaleCustomer') return db.wholesaleCustomers
  if (resourceType === 'SalesOrder') return db.salesOrders
  if (resourceType === 'CustomerLedgerEntry') return db.customerLedgerEntries
  return null
}

function toClientRow(resourceType: string, data: Record<string, unknown>): Record<string, unknown> {
  if (resourceType === 'CustomerLedgerEntry') {
    const { entryTimestamp, ...rest } = data
    return { ...rest, timestamp: entryTimestamp }
  }
  return data // WholesaleCustomer / SalesOrder already camelCase (incl. lines)
}

export async function pullWholesale(): Promise<{ pulled: number; applied: number }> {
  try {
    const token = await useAuthSessionStore.getState().getAccessToken()
    if (!token) return { pulled: 0, applied: 0 }

    const meta = await db.wholesalePullMeta.get('wholesale')
    const sinceHlc = meta?.lastPulledHlc ?? '0'

    const url = new URL(getHubApiUrl())
    url.pathname = url.pathname.replace(/\/$/, '') + '/sync.pull'
    url.searchParams.set('input', JSON.stringify({ json: { resourceTypes: WHOLESALE_TYPES, sinceHlc } }))

    const res = await fetch(url.toString(), { method: 'GET', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } })
    if (!res.ok) return { pulled: 0, applied: 0 }
    const body = await res.json() as { result?: { data?: { json?: { changes?: PullChange[] } } } }
    const changes = body.result?.data?.json?.changes ?? []

    let applied = 0
    let maxHlc = sinceHlc
    for (const ch of changes) {
      const table = tableFor(ch.resourceType)
      if (!table) continue
      if (!(await isLocalDirty(ch.resourceId))) {
        await table.put(toClientRow(ch.resourceType, ch.data) as never)
        applied++
      }
      if (compareHlc(ch.hlcTimestamp, maxHlc) > 0) maxHlc = ch.hlcTimestamp
    }
    if (maxHlc !== sinceHlc) await db.wholesalePullMeta.put({ key: 'wholesale', lastPulledHlc: maxHlc })
    return { pulled: changes.length, applied }
  } catch {
    return { pulled: 0, applied: 0 }
  }
}
```

**Confirm at implementation:** (a) whether `sync.pull` is a `.query()` (GET, as above) or `.mutation()` (POST with body `{ json: {...} }`) — check `sync.ts` and use the matching method; (b) the exact HLC compare export from `@ultranos/sync-engine` (`compareHlc` vs `compareHlcStrings`/`deserializeHlc`+compare) — check how `drain`/opd-lite compares HLCs and reuse it. If HLC strings are not safely comparable via a single helper, deserialize both and compare.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F pharmacy-lite test wholesale-pull`
Expected: PASS (4 tests). If the sinceHlc-in-URL test fails because pull is a mutation (POST), switch the request to POST and assert the body instead.

- [ ] **Step 5: Commit** (checkpoint)

```bash
git add apps/pharmacy-lite/src/lib/wholesale/wholesale-pull.ts apps/pharmacy-lite/src/__tests__/wholesale-pull.test.ts
git commit -m "feat(pharmacy-lite): wholesale pull handler"
```

---

### Task 4: Trigger pull in `SyncProvider`

**Files:**
- Modify: `apps/pharmacy-lite/src/components/providers/SyncProvider.tsx`
- Test: `apps/pharmacy-lite/src/__tests__/sync-provider-pull.test.tsx`

**Interfaces:**
- Consumes: `pullWholesale` (Task 3).

- [ ] **Step 1: Write the failing test**

```tsx
// apps/pharmacy-lite/src/__tests__/sync-provider-pull.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

const mockPull = vi.fn().mockResolvedValue({ pulled: 0, applied: 0 })
vi.mock('@/lib/wholesale/wholesale-pull', () => ({ pullWholesale: (...a: unknown[]) => mockPull(...a) }))
// Stub the drain init so mounting SyncProvider doesn't start real workers
vi.mock('@/lib/sync-drain-init', () => ({ startSyncDrain: vi.fn(() => () => {}) }))
vi.mock('@/stores/auth-session-store', () => ({ useAuthSessionStore: Object.assign((s: (x: unknown)=>unknown)=>s({ session: { userId: 'u1' } }), { getState: () => ({ session: { userId: 'u1' }, getAccessToken: vi.fn().mockResolvedValue('t') }) }) }))

import { SyncProvider } from '@/components/providers/SyncProvider'

beforeEach(() => vi.clearAllMocks())

describe('SyncProvider wholesale pull trigger', () => {
  it('runs pullWholesale on mount', async () => {
    render(<SyncProvider><div /></SyncProvider>)
    await vi.waitFor(() => expect(mockPull).toHaveBeenCalled())
  })

  it('runs pullWholesale on the ultranos:sync-now event', async () => {
    render(<SyncProvider><div /></SyncProvider>)
    await vi.waitFor(() => expect(mockPull).toHaveBeenCalledTimes(1))
    window.dispatchEvent(new Event('ultranos:sync-now'))
    await vi.waitFor(() => expect(mockPull).toHaveBeenCalledTimes(2))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test sync-provider-pull`
Expected: FAIL — `pullWholesale` not called (not wired).

- [ ] **Step 3: Wire the trigger**

Read `SyncProvider.tsx`. In the existing effect that starts the drain worker (and listens for `ultranos:sync-now`), also call `pullWholesale()` once on mount and inside the `ultranos:sync-now` handler. Guard against overlap with a simple in-flight ref:

```tsx
import { pullWholesale } from '@/lib/wholesale/wholesale-pull'
// ...inside the component:
const pullInFlight = useRef(false)
const runPull = useCallback(async () => {
  if (pullInFlight.current) return
  pullInFlight.current = true
  try { await pullWholesale() } finally { pullInFlight.current = false }
}, [])
// in the mount effect: void runPull()
// in the existing ultranos:sync-now listener: void runPull()
```

Only run when there is an authenticated session (match how the drain start is gated). Do not block rendering on the pull.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F pharmacy-lite test sync-provider-pull`
Expected: PASS.

- [ ] **Step 5: Commit** (checkpoint)

```bash
git add apps/pharmacy-lite/src/components/providers/SyncProvider.tsx apps/pharmacy-lite/src/__tests__/sync-provider-pull.test.tsx
git commit -m "feat(pharmacy-lite): trigger wholesale pull on app-open + sync-now"
```

---

### Task 5: Verification — suites, typecheck, live re-hydration

**Files:** none (verification only)

- [ ] **Step 1: Run the hub suite**

Run: `pnpm -F hub-api test`
Expected: new pull cases pass; existing sync tests green. (The pre-existing unrelated `license-expiry.test.ts` failure is out of scope — note but ignore.)

- [ ] **Step 2: Run the pharmacy suite**

Run: `pnpm -F pharmacy-lite test`
Expected: the new tests pass; only the known `SyncQueueDashboard` teardown flake (`DatabaseClosedError`) remains.

- [ ] **Step 3: Typecheck both**

Run: `pnpm -F hub-api typecheck` and `pnpm -F pharmacy-lite typecheck`
Expected: no NEW errors referencing the files changed in this slice (`sync.ts`, `db.ts`, `wholesale-pull.ts`, `SyncProvider.tsx`). Pre-existing errors (unbuilt `@ultranos/*` deps in hub-api) are out of scope.

- [ ] **Step 4: Live re-hydration check (optional, if a dev server is available)**

On the running app (pharmacist has `org_id`; the 2 orders from B1's live test are on the Hub): clear the local wholesale tables (DevTools → IndexedDB `pharmacy-lite` → delete rows in `wholesaleCustomers`/`salesOrders`/`customerLedgerEntries`, or use a second browser profile), then fire "Sync Now" (or reload). Confirm the customer + orders + AR ledger reappear locally. If no dev server is running, record that live check was deferred.

- [ ] **Step 5: Commit** (checkpoint) — nothing unless earlier steps were split.

---

## Self-Review

**Spec coverage:**
- §3 Hub org-scoped pull (patientId optional; org_id + sinceHlc filter; fail-loud on no org) → Task 1. ✓
- §4.1 watermark table → Task 2. ✓
- §4.2 `pullWholesale` (watermark → sync.pull → transform → conflict → write → advance) → Task 3. ✓
- §4.3 trigger (app-open + sync-now, in-flight guard) → Task 4. ✓
- §3 field reversal (`entryTimestamp→timestamp`) → Task 3 `toClientRow`. ✓
- §2 D3 conflict (remote-wins unless dirty via sync-queue) → Task 3 `isLocalDirty` + test. ✓
- §6 tests → Tasks 1–4 carry them; Task 5 runs suites + typecheck + live. ✓

**Placeholder scan:** No TBD/TODO. Two explicit confirm-at-implementation notes in Task 3 (sync.pull query-vs-mutation HTTP method; exact HLC-compare export) — these are grounded checks against real code, not vague placeholders, and the test adapts if pull is a mutation.

**Type consistency:** `wholesalePullMeta` shape `{ key, lastPulledHlc }` consistent Task 2 ↔ Task 3. `pullWholesale(): { pulled, applied }` consistent Task 3 ↔ Task 4. Dexie tables `wholesaleCustomers`/`salesOrders`/`customerLedgerEntries` match B1's schema (version 14). `entryTimestamp→timestamp` reversal matches the B1 flattener's `timestamp→entryTimestamp` (symmetric). ✓
