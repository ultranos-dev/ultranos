# Wholesale Delete-Sync (Design)

**Date:** 2026-09-07
**Apps:** `apps/hub-api/` (push delete + reused pull) + `apps/pharmacy-lite/` (remove enqueue + drain passthrough + pull apply) + `supabase/migrations/`
**Status:** Approved design — pending implementation plan
**Epic:** Wholesaler Pharmacy. Closes the documented "removal is local-only" limitation from the Contract Pricing slice; establishes the generic delete-sync mechanism that later org-scoped resources (inventory/procurement) reuse.

## 1. Overview

The Contract Pricing slice made `removeContractPrice` a **local-only** Dexie delete — no delete op is pushed, so a re-pull re-hydrates a removed price and other devices never learn of the removal. This slice adds **cross-device delete propagation** for `ContractPrice`, built as a generic mechanism the B1/B2 org-scoped sync recipe can reuse for any resource.

**In scope:** a `deleted_at` tombstone column on `contract_prices`; a `'delete'` sync action end-to-end (client remove → drain → Hub push stamps `deleted_at` → existing pull returns the tombstone → client deletes its local row); the pull-apply "delete-on-tombstone" rule (dirty-protected).

**Out of scope (later):** hard purge / tombstone GC of old soft-deleted rows; delete-sync for the other wholesale resources (`WholesaleCustomer`/`SalesOrder`/`CustomerLedgerEntry` — they have no user-facing delete today); undo/restore UX.

## 2. Locked decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| D1 | Delete representation | **Soft-delete `deleted_at` column** on the resource table (NOT a central tombstones table) | The org-scoped pull is already generic `SELECT * WHERE org_id=? AND hlc_timestamp > sinceHlc`. Stamping `deleted_at` + bumping `hlc_timestamp` means the **existing** pull already returns the tombstone — zero new pull query. One additive column per table generalizes cleanly. |
| D2 | Local removal | **Local Dexie delete stays a hard delete**; the tombstone lives only on the Hub | Local reads never see removed rows; the soft-delete is purely the propagation vehicle. |
| D3 | Delete action on the wire | **Extend `SyncOperationSchema.action` to `['create','update','delete']`**; drain passes `'delete'` through | Minimal contract change; reuses the whole push path (org stamping, upsert onConflict id). |
| D4 | Hub delete write | On `action:'delete'`, **stamp `deleted_at = now()` into the flattened row before the existing upsert** (generic, in the push loop — not per-flattener) | Reuses `db.toRow` snake-casing (`deleted_at`) + the existing `upsert(onConflict:'id')`; works for any resource. |
| D5 | Pull apply | When a pulled row has `deletedAt` set → **delete the local row** (instead of `put`), gated by the SAME `isLocalDirty` check as puts | Remote delete wins unless the local device has an unpushed edit (then local keeps it and pushes → it re-creates, LWW-consistent). |
| D6 | Idempotency | Deleting an already-absent local row is a no-op; re-pulling a tombstone re-applies the same delete | `Dexie.table.delete(id)` on a missing id is a safe no-op. |

## 3. Hub changes (`apps/hub-api/`)

### 3.1 Migration `049_contract_prices_deleted_at.sql` (via Supabase MCP; confirm next free number with `list_migrations`)
```sql
ALTER TABLE contract_prices ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
```
(No index needed — pull already filters on `org_id` + `hlc_timestamp`; `deleted_at` is read per-returned-row, not a query predicate.)

### 3.2 `src/trpc/routers/sync.ts`
- `SyncOperationSchema.action`: `z.enum(['create','update','delete'])`.
- In the push loop, after `flat` is built and BEFORE the `db.toRow`/upsert: `if (op.action === 'delete') flat.deletedAt = new Date().toISOString()`. Org stamping + upsert path unchanged. The audit `metadata.syncAction` already records `op.action`, so deletes are audited.
- **Pull:** NO change. The generic org-scoped branch already returns rows by `hlc_timestamp > sinceHlc`; a tombstone row (bumped hlc) flows through with `deletedAt` populated (via `db.fromRows`).

### 3.3 RBAC
No change — `ContractPrice` PHARMACIST access already granted; delete is the same resource type.

## 4. Client changes (`apps/pharmacy-lite/`)

### 4.1 `src/lib/wholesale/contract-price-service.ts` — `removeContractPrice`
Before deleting locally, fetch the row and enqueue a delete op, then hard-delete the Dexie row:
```ts
export async function removeContractPrice(id: string): Promise<void> {
  const existing = await db.contractPrices.get(id)
  if (existing) {
    const now = new Date().toISOString()
    await enqueuePharmacySyncEntry({
      resourceType: 'ContractPrice', resourceId: id, action: 'delete',
      payload: existing as unknown as Record<string, unknown>, hlcTimestamp: now, createdAt: now,
    })
  }
  await db.contractPrices.delete(id)
}
```
(If the row is already gone, no enqueue — nothing to propagate.)

### 4.2 `src/lib/drain-sync-fn.ts`
Change the action mapping to pass `'delete'` through:
```ts
action: entry.action === 'delete' ? 'delete' : entry.action === 'update' ? 'update' : 'create',
```

### 4.3 `src/lib/wholesale/wholesale-pull.ts` — apply loop
In the per-change apply, branch on a tombstone. Keep the existing `isLocalDirty` gate for BOTH put and delete:
```ts
if (!(await isLocalDirty(ch.resourceId))) {
  const clientRow = toClientRow(ch.resourceType, ch.data)
  if (clientRow.deletedAt) {
    await table.delete(ch.resourceId)
  } else {
    await table.put(clientRow as never)
  }
  applied++
}
```
`toClientRow` already spreads unknown fields, so `deletedAt` survives for the tombstone check. (For `ContractPrice`, `price→priceMinor` still happens; `deletedAt` passes through in `...rest`.) The watermark still advances to the batch max HLC (tombstones included).

## 5. Correctness notes

- **Dirty-protection symmetry:** a local unpushed edit to id X (pending/failed/in-flight/awaiting-key sync-queue entry) blocks BOTH a remote put and a remote delete for X — the local edit pushes and wins. Consistent with B2's rule.
- **Delete then re-add same pair:** re-adding via `setContractPrice` creates a NEW row id (the old id was hard-deleted locally; upsert-by-pair found nothing) and pushes a create; the Hub gets a fresh row (the old id stays tombstoned). The `UNIQUE(org_id,customer_id,catalog_item_id)` — the tombstoned row still occupies that pair. **Ruling:** the delete stamps `deleted_at` but the row still violates the UNIQUE for a re-add of the same pair. To avoid a re-add push failing on the stale unique row, the Hub delete for an org-scoped contract price uses a **hard delete** of the row is NOT chosen (breaks pull propagation). Instead: the `UNIQUE` must ignore soft-deleted rows. **D7 (added):** replace the plain `UNIQUE(org_id,customer_id,catalog_item_id)` with a **partial unique index** `WHERE deleted_at IS NULL`, so a tombstoned pair no longer blocks re-adding that pair. Migration `049` also drops the old table constraint and creates the partial index.
- **New-device full pull:** pulling from `sinceHlc='0'` returns tombstones too; the client deletes-then-never-creates (delete of an absent id = no-op). Net state correct.

## 6. Migration `049` (final, incorporating D7)
```sql
ALTER TABLE contract_prices ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
-- Re-add uniqueness ignoring tombstones so a deleted pair can be recreated.
ALTER TABLE contract_prices DROP CONSTRAINT IF EXISTS contract_prices_org_id_customer_id_catalog_item_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_prices_pair_live
  ON contract_prices (org_id, customer_id, catalog_item_id) WHERE deleted_at IS NULL;
```
(The implementer confirms the exact auto-generated constraint name via `list_tables`/`execute_sql` before dropping; `IF EXISTS` makes a wrong guess a no-op, and the partial index is the real enforcement.)

## 7. Testing

**Hub (`sync.test.ts`):** a `ContractPrice` push with `action:'delete'` → upsert on `contract_prices` with `deleted_at` stamped (non-null) + org stamped; existing create/update paths unchanged.
**Client service (`contract-price-service.test.ts`):** `removeContractPrice` enqueues a `ContractPrice`/`delete` sync entry AND hard-deletes the local row; removing an absent id enqueues nothing.
**Client drain (`drain-sync-fn` coverage, existing test file):** a `delete`-action entry POSTs `action:'delete'` to `sync.push` (not collapsed to `create`).
**Client pull (`wholesale-pull.test.ts`):** a pulled `ContractPrice` with `deletedAt` set → the local row is DELETED (not put); a dirty local id is NOT deleted (local kept); a normal row still upserts.
**Live (deferred, needs session):** set a price on device A, confirm it on device B via pull; remove on A, Sync Now on B → the price disappears on B.

## 8. Reuse

Any later org-scoped resource gets delete-sync by: adding `deleted_at` (+ partial-unique where it has a natural key) in its migration, and — because the push `deleted_at` stamp, the pull tombstone flow, and the client delete-on-tombstone rule are all generic — nothing else. The mechanism is defined once here.
