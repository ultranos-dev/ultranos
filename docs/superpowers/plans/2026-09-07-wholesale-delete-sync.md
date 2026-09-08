# Wholesale Delete-Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Propagate `ContractPrice` removals cross-device via a generic soft-delete tombstone mechanism (client remove → drain → Hub push stamps `deleted_at` → existing pull returns the tombstone → client deletes its local row), closing the "removal is local-only" limitation.

**Architecture:** Add `deleted_at` to `contract_prices` (+ partial-unique index ignoring tombstones); extend the sync `action` enum with `'delete'`; the Hub push stamps `deleted_at` on delete (generic, reuses upsert); the drain passes `'delete'` through; the client `removeContractPrice` enqueues a delete then hard-deletes locally; the pull applies deletes (dirty-gated).

**Tech Stack:** Node/tRPC/Supabase (hub-api), Next.js/Dexie/Vitest (pharmacy-lite).

**Spec:** `docs/superpowers/specs/2026-09-07-wholesale-delete-sync-design.md`

## Global Constraints

- **Soft-delete is Hub-only.** The local Dexie remove stays a HARD delete; `deleted_at` exists only on the Hub as the propagation vehicle.
- **`action:'delete'`** is a first-class sync action: `SyncOperationSchema.action = z.enum(['create','update','delete'])`; drain maps `entry.action==='delete' → 'delete'`.
- **Hub delete write:** on `action:'delete'`, stamp `flat.deletedAt = new Date().toISOString()` before the existing `db.toRow`/`upsert(onConflict:'id')` — GENERIC, in the push loop, not per-flattener. Pull is UNCHANGED (tombstone flows via the existing hlc-scoped org branch).
- **Pull apply:** `if (clientRow.deletedAt) table.delete(id) else table.put(clientRow)`, both gated by the existing `isLocalDirty(id)` check (local unpushed edit wins).
- **Re-add after delete:** uniqueness must ignore tombstones — partial unique index `WHERE deleted_at IS NULL` replaces the plain `UNIQUE(org_id,customer_id,catalog_item_id)`.
- **DB ops via Supabase MCP only.** Migration applied live (user-authorized standing directive for this epic).
- **NO-COMMIT mode:** implement + test, never `git add`/`git commit`. Reviews via working-tree scoped diffs.

---

## File Structure

**Create:**
- `supabase/migrations/049_contract_prices_deleted_at.sql`

**Modify:**
- `apps/hub-api/src/trpc/routers/sync.ts` — action enum + delete stamp.
- `apps/hub-api/src/__tests__/sync.test.ts` — delete-push case.
- `apps/pharmacy-lite/src/lib/wholesale/contract-price-service.ts` — `removeContractPrice` enqueues delete.
- `apps/pharmacy-lite/src/__tests__/contract-price-service.test.ts` — delete-enqueue case.
- `apps/pharmacy-lite/src/lib/drain-sync-fn.ts` — pass `'delete'` through.
- `apps/pharmacy-lite/src/__tests__/` — drain delete-passthrough test (existing drain test file, or a focused new one).
- `apps/pharmacy-lite/src/lib/wholesale/wholesale-pull.ts` — delete-on-tombstone apply.
- `apps/pharmacy-lite/src/__tests__/wholesale-pull.test.ts` — tombstone-delete + dirty-kept cases.

---

### Task 1: Migration `049` — `deleted_at` + partial unique index

**Files:** Create `supabase/migrations/049_contract_prices_deleted_at.sql`

- [ ] **Step 1: Confirm state.** `mcp__plugin_supabase_supabase__list_migrations` (confirm `049` free; use next free `NNN` if taken). `mcp__plugin_supabase_supabase__execute_sql`: find the existing unique constraint name — `SELECT conname FROM pg_constraint WHERE conrelid='contract_prices'::regclass AND contype='u';`
- [ ] **Step 2: Write the SQL** (`049_contract_prices_deleted_at.sql`):
```sql
ALTER TABLE contract_prices ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
ALTER TABLE contract_prices DROP CONSTRAINT IF EXISTS contract_prices_org_id_customer_id_catalog_item_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_prices_pair_live
  ON contract_prices (org_id, customer_id, catalog_item_id) WHERE deleted_at IS NULL;
```
(If Step 1 reported a DIFFERENT constraint name, add a matching `DROP CONSTRAINT IF EXISTS <that_name>;` line — keep the generic one too; `IF EXISTS` makes extras harmless.)
- [ ] **Step 3: Apply** via `mcp__plugin_supabase_supabase__apply_migration` (name `049_contract_prices_deleted_at`).
- [ ] **Step 4: Verify** via `execute_sql`: `SELECT column_name FROM information_schema.columns WHERE table_name='contract_prices' AND column_name='deleted_at';` → one row. And `SELECT indexname FROM pg_indexes WHERE tablename='contract_prices' AND indexname='uq_contract_prices_pair_live';` → one row. And confirm the old constraint is gone: `SELECT conname FROM pg_constraint WHERE conrelid='contract_prices'::regclass AND contype='u';` → the old key name absent.
- [ ] **Step 5: Commit** (checkpoint — NO-COMMIT mode: skip actual commit).

---

### Task 2: Hub `sync.push` delete handling

**Files:** Modify `apps/hub-api/src/trpc/routers/sync.ts`; Test `apps/hub-api/src/__tests__/sync.test.ts`

**Interfaces:**
- Produces: `sync.push` accepts `action:'delete'` → upsert on the resource table with `deleted_at` stamped.

- [ ] **Step 1: Write the failing test** — add to `sync.test.ts` (reuse the ContractPrice push harness from the prior slice):
```ts
describe('sync.push — ContractPrice delete', () => {
  it('stamps deleted_at when action is delete', async () => {
    // PHARMACIST caller, org present. First create cp1, then push a delete op for cp1.
    const del = { resourceType: 'ContractPrice', resourceId: 'cp1', action: 'delete',
      payload: JSON.stringify({ id: 'cp1', customerId: 'c1', catalogItemId: 'i1', priceMinor: 1800, createdBy: 'p1', createdAt: '2026-09-08T00:00:00Z' }), hlcTimestamp: '200' }
    const res = await caller.sync.push([del])
    expect(res.results[0]).toMatchObject({ resourceId: 'cp1', success: true })
    expect(upsertedTable).toBe('contract_prices')
    expect(upsertedRow.deletedAt ?? upsertedRow.deleted_at).toBeTruthy() // deleted_at stamped
  })
})
```
(Adapt capture vars to the real harness; assert the load-bearing fact: the upserted row carries a non-null `deleted_at`/`deletedAt`.)
- [ ] **Step 2: Run to verify it fails** — `pnpm -F hub-api test sync` → FAIL (action enum rejects `'delete'`, OR no `deleted_at` on the row).
- [ ] **Step 3: Implement** in `sync.ts`:
  - `SyncOperationSchema.action`: `z.enum(['create', 'update', 'delete'])`.
  - In the push loop, immediately after `const flat = flattenForDb(...)` and before/near the org stamp: `if (op.action === 'delete') { flat.deletedAt = new Date().toISOString() }`. (Placement: before `db.toRow` so snake-casing yields `deleted_at`. Org stamp block stays.)
- [ ] **Step 4: Run to verify it passes** — `pnpm -F hub-api test sync` → PASS (+ existing sync tests green).
- [ ] **Step 5: Commit** (checkpoint — skip in NO-COMMIT).

---

### Task 3: Client `removeContractPrice` enqueues delete + drain passthrough

**Files:** Modify `apps/pharmacy-lite/src/lib/wholesale/contract-price-service.ts`, `apps/pharmacy-lite/src/lib/drain-sync-fn.ts`; Test `apps/pharmacy-lite/src/__tests__/contract-price-service.test.ts` (+ a drain passthrough assertion)

**Interfaces:**
- Consumes: `db.contractPrices`, `enqueuePharmacySyncEntry`.
- Produces: `removeContractPrice(id)` enqueues a `ContractPrice`/`delete` entry then hard-deletes; drain forwards `action:'delete'`.

- [ ] **Step 1: Write the failing test** — add to `contract-price-service.test.ts`:
```ts
it('removeContractPrice enqueues a delete op and hard-deletes the local row', async () => {
  const cp = await setContractPrice({ customerId: 'c1', catalogItemId: 'i1', priceMinor: 1800, createdBy: 'p1' })
  await removeContractPrice(cp.id)
  expect(await db.contractPrices.get(cp.id)).toBeUndefined()
  const q = await db.syncQueue.toArray()
  expect(q.some((e) => e.resourceType === 'ContractPrice' && e.resourceId === cp.id && e.action === 'delete')).toBe(true)
})
it('removeContractPrice on an absent id enqueues nothing', async () => {
  const before = (await db.syncQueue.toArray()).length
  await removeContractPrice('nope')
  expect((await db.syncQueue.toArray()).length).toBe(before)
})
```
Also add/confirm a drain passthrough assertion (in the drain test file — READ it first to reuse its harness): a `SyncQueueEntry` with `action:'delete'` (non-MedicationDispense) produces a `sync.push` body whose op `action` is `'delete'` (not `'create'`).
- [ ] **Step 2: Run to verify it fails** — `pnpm -F pharmacy-lite test contract-price-service` (and the drain test) → FAIL (no delete enqueue; drain collapses to create).
- [ ] **Step 3: Implement:**
  - `contract-price-service.ts` `removeContractPrice` — per spec §4.1 (fetch row; if present enqueue `action:'delete'` with the row as payload + `hlcTimestamp`/`createdAt` = now; then `db.contractPrices.delete(id)`).
  - `drain-sync-fn.ts` — `action: entry.action === 'delete' ? 'delete' : entry.action === 'update' ? 'update' : 'create'`.
- [ ] **Step 4: Run to verify it passes** — both green (+ existing service/drain tests green).
- [ ] **Step 5: Commit** (checkpoint — skip in NO-COMMIT).

---

### Task 4: Client pull applies deletes (dirty-gated)

**Files:** Modify `apps/pharmacy-lite/src/lib/wholesale/wholesale-pull.ts`; Test `apps/pharmacy-lite/src/__tests__/wholesale-pull.test.ts`

**Interfaces:**
- Consumes: the existing `pullWholesale` apply loop + `isLocalDirty` + `toClientRow`.
- Produces: a pulled row with `deletedAt` set deletes the local row (unless dirty).

- [ ] **Step 1: Write the failing test** — add to `wholesale-pull.test.ts` (reuse the `pullResponse` helper):
```ts
it('deletes a local ContractPrice when the pulled row is a tombstone (deletedAt set)', async () => {
  await db.contractPrices.put({ id: 'cp1', customerId: 'c1', catalogItemId: 'i1', priceMinor: 1800, createdBy: 'p1', createdAt: '' })
  fetchMock.mockResolvedValue(pullResponse([
    { resourceType: 'ContractPrice', resourceId: 'cp1', hlcTimestamp: '9', data: { id: 'cp1', customerId: 'c1', catalogItemId: 'i1', price: 1800, createdBy: 'p1', createdAt: '', deletedAt: '2026-09-09T00:00:00Z' } },
  ]))
  await pullWholesale()
  expect(await db.contractPrices.get('cp1')).toBeUndefined()
})
it('does NOT delete a locally-dirty ContractPrice tombstone', async () => {
  await db.contractPrices.put({ id: 'cp2', customerId: 'c1', catalogItemId: 'i2', priceMinor: 500, createdBy: 'p1', createdAt: '' })
  await db.syncQueue.add({ /* a pending entry for cp2 — match the file's SyncQueueEntry shape */ } as never)
  fetchMock.mockResolvedValue(pullResponse([
    { resourceType: 'ContractPrice', resourceId: 'cp2', hlcTimestamp: '9', data: { id: 'cp2', price: 500, customerId: 'c1', catalogItemId: 'i2', createdBy: 'p1', createdAt: '', deletedAt: '2026-09-09T00:00:00Z' } },
  ]))
  await pullWholesale()
  expect(await db.contractPrices.get('cp2')).toBeDefined() // local dirty kept
})
```
(Adapt the pending sync-queue entry to the real `SyncQueueEntry` shape used elsewhere in this test file / db schema; the load-bearing facts: tombstone → local deleted; dirty tombstone → local kept.)
- [ ] **Step 2: Run to verify it fails** — `pnpm -F pharmacy-lite test wholesale-pull` → FAIL (tombstone currently `put` instead of deleted).
- [ ] **Step 3: Implement** in `wholesale-pull.ts` apply loop — per spec §4.3:
```ts
if (!(await isLocalDirty(ch.resourceId))) {
  const clientRow = toClientRow(ch.resourceType, ch.data)
  if ((clientRow as Record<string, unknown>).deletedAt) {
    await table.delete(ch.resourceId)
  } else {
    await table.put(clientRow as never)
  }
  applied++
}
```
- [ ] **Step 4: Run to verify it passes** — green (+ existing pull tests green).
- [ ] **Step 5: Commit** (checkpoint — skip in NO-COMMIT).

---

### Task 5: Verification

**Files:** none.

- [ ] **Step 1: Hub suite** — `pnpm -F hub-api test sync` → new delete case + all existing sync green.
- [ ] **Step 2: Pharmacy suites** — `pnpm -F pharmacy-lite test contract-price-service wholesale-pull drain` (+ any drain test name) → new cases pass; only the known `DatabaseClosedError` teardown flake tolerated.
- [ ] **Step 3: Typecheck** — `pnpm -F pharmacy-lite typecheck` (slice files clean) and `pnpm -F hub-api typecheck` (no NEW errors referencing `sync.ts`; pre-existing unbuilt-`@ultranos/*`-dep + `TRPCContext` test-harness errors are out of scope).
- [ ] **Step 4: Live (deferred)** — if an authenticated session is available: set → confirm cross-device → remove → Sync Now → gone. Else record as deferred.

---

## Self-Review

**Spec coverage:** §3.1 migration → T1 ✓ (incl. D7 partial index). §3.2 action enum + delete stamp → T2 ✓. §4.1 removeContractPrice → T3 ✓. §4.2 drain passthrough → T3 ✓. §4.3 pull apply → T4 ✓. §7 tests → each task + T5 ✓.

**Placeholder scan:** no TBD/TODO. T3/T4 defer the exact drain-test harness + `SyncQueueEntry` literal to "the file's existing shape" (a real spec the implementer reads) but give concrete assertions and logic — acceptable for modify-existing tasks.

**Type consistency:** `deleted_at` (column) ↔ `deletedAt` (client, via `db.fromRows`/`db.toRow` case transform) consistent across T2 (stamp `flat.deletedAt`) and T4 (check `clientRow.deletedAt`). `action:'delete'` consistent T2 (enum) ↔ T3 (enqueue + drain) ↔ T4 (dirty gate unchanged). Migration `049` matches spec §6.
