# Hub Backend B1 — Wholesale Sync Ingestion (Design)

**Date:** 2026-09-07
**Apps:** `apps/hub-api/` (Hub ingestion) + `apps/pharmacy-lite/` (drain routing) + `supabase/migrations/`
**Status:** Approved design — pending implementation plan
**Epic:** Hub Inventory/Order Backend (net-new). This is the FIRST slice; the wider epic (core inventory, procurement, transfers) reuses this pattern in later slices.

## 1. Overview

Pharmacy-Lite already enqueues sync entries for `WholesaleCustomer`, `SalesOrder`,
and `CustomerLedgerEntry`, but they never reach the Hub: the drain function is
hardcoded to `/medication.recordDispense`, and the Hub has no tables or ingestion
for these types. Result: a permanent "failed sync" state (observed live).

This slice makes those three resources **push (ingest) to the Hub** by extending
the Hub's existing generic `sync.push` endpoint — landing them in new org-scoped
Postgres tables — and by teaching the pharmacy drain to route by `resourceType`.

**In scope (B1 = push/ingestion):** 3 tables + RLS; `sync.push` extension
(resource-table map, RBAC, flatteners, org-scoping); pharmacy `drainSyncFn`
routing. Delivers durability + Hub-side availability and clears the failed-sync
banner.

**Out of scope (→ B2, the immediate next slice):** client-side **pull** so a
second device of the same pharmacy hydrates the records. Pull needs net-new
pharmacy-lite wiring and is independently testable.

**Explicit non-goals (later slices / other epics):** core inventory / procurement
/ transfer resource ingestion; cross-tenant order routing; admin-portal
visibility.

## 2. Locked decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| D1 | First slice | Wholesale resources | Exactly what fails to sync live; coherent set; validates the pattern for the epic. |
| D2 | Ingestion mechanism | **Extend generic `sync.push`** | Reuses proven OPD-Lite machinery (map → RBAC → flatten → org-stamp → HLC upsert → audit). Least new code. |
| D3 | Hub's job this slice | **Durability + same-org availability, RLS-scoped** | Land rows in the caller's org. No cross-tenant, no admin dashboards. |
| D4 | Push vs pull | **Push only (B1)**; pull = B2 | Push fixes the visible failure + gives durability. Pull needs net-new client wiring; separate testable slice. |
| D5 | Conflict semantics | **LWW by HLC** (operational tier) | Wholesale data is not Tier-1 safety-critical; `sync.push` default newer-wins upsert is correct. `CustomerLedgerEntry` is create-only. |
| D6 | `SalesOrder.lines[]` | **Store as JSONB** | Read-mostly nested array; no need to normalize into a child table this slice. |
| D7 | Org scoping | **Org-scoped tables**, org stamped from `ctx.user.orgId` | Matches D3. Depends on the pharmacist JWT carrying `org_id` (see §7 prerequisite). |

## 3. Data flow (unchanged creation path)

```
app creates customer/order/ledger entry
  → enqueuePharmacySyncEntry({ resourceType, resourceId, action, payload, hlcTimestamp })   [already happening]
  → DrainWorker.drain() → syncFn(entry)                                                     [shared sync-engine, unchanged]
  → drainSyncFn(entry): route by entry.resourceType                                         [CHANGED]
       • MedicationDispense → POST /medication.recordDispense  (unchanged)
       • WholesaleCustomer | SalesOrder | CustomerLedgerEntry → POST /sync.push             [NEW route]
  → Hub sync.push: RBAC → RESOURCE_TABLE_MAP → flattenForDb → stamp org_id → HLC upsert → audit   [EXTENDED]
```

No change to how the app creates/enqueues data.

## 4. Hub changes (`apps/hub-api/`)

### 4.1 Postgres tables (migration `047_wholesale_sync_tables.sql`, applied via Supabase MCP `apply_migration`)

Three tables, column names snake_case (the `db.toRow()` convention converts the
flattener's camelCase output). Each: `org_id UUID NOT NULL`, `hlc_timestamp TEXT
NOT NULL`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, RLS enabled with a
`service_role` all-access policy (the Hub connects as service role; RLS is
defence-in-depth, matching `004_fhir_encounters.sql`).

- **`wholesale_customers`**: `id UUID PK`, `name TEXT NOT NULL`, `contact_name TEXT`,
  `phone TEXT`, `email TEXT`, `address TEXT`, `payment_terms_days INT`,
  `credit_limit BIGINT`, `ultranos_org_id TEXT`, `is_active BOOLEAN NOT NULL DEFAULT TRUE`,
  `org_id`, `hlc_timestamp`, `created_at`.
- **`sales_orders`**: `id UUID PK`, `order_number TEXT NOT NULL`, `customer_id UUID NOT NULL`,
  `status TEXT NOT NULL`, `lines JSONB NOT NULL`, `subtotal BIGINT NOT NULL`,
  `tax_rate NUMERIC NOT NULL`, `tax_amount BIGINT NOT NULL`, `total BIGINT NOT NULL`,
  `notes TEXT`, `created_by TEXT NOT NULL`, `fulfilled_at TIMESTAMPTZ`,
  `cancelled_at TIMESTAMPTZ`, `org_id`, `hlc_timestamp`, `created_at`.
- **`customer_ledger_entries`**: `id UUID PK`, `customer_id UUID NOT NULL`,
  `type TEXT NOT NULL`, `amount BIGINT NOT NULL`, `sales_order_id UUID`, `note TEXT`,
  `created_by TEXT NOT NULL`, `entry_timestamp TIMESTAMPTZ NOT NULL`,
  `org_id`, `hlc_timestamp`, `created_at`.
  (Client field `timestamp` → column `entry_timestamp` to avoid the SQL keyword; the
  flattener maps it.)

Money is integer minor units → `BIGINT`. Index `sales_orders(customer_id)`,
`customer_ledger_entries(customer_id)`, and each table on `org_id`.

### 4.2 `sync.ts`
- `RESOURCE_TABLE_MAP` (line ~20) += `WholesaleCustomer: 'wholesale_customers'`,
  `SalesOrder: 'sales_orders'`, `CustomerLedgerEntry: 'customer_ledger_entries'`.
- `ORG_SCOPED_TABLES` (line ~38) += the three table names.

### 4.3 `rbac.ts`
- `ROLE_PERMISSIONS.PHARMACIST` (line ~32) += `'WholesaleCustomer'`, `'SalesOrder'`,
  `'CustomerLedgerEntry'`. (Leave all other roles unchanged — these stay denied to
  DOCTOR/LAB_TECH/etc.)

### 4.4 `resource-mappers.ts`
Three flatteners returning camelCase rows, registered in the `mappers` object:
- `flattenWholesaleCustomer(p)` → 1:1 fields.
- `flattenSalesOrder(p)` → 1:1 scalar fields; `lines: p.lines` passed through (JSONB).
- `flattenCustomerLedgerEntry(p)` → 1:1; `entryTimestamp: p.timestamp`.
None strip/require FHIR shape; none set `hlcTimestamp` (sync.push injects it).

## 5. Pharmacy-lite change (`apps/pharmacy-lite/src/lib/drain-sync-fn.ts`)

Replace the hardcoded endpoint (line ~29) with routing by `resourceType`:
- **`MedicationDispense` → `/medication.recordDispense`**, body `{ json: <dispense
  payload> }` (unchanged — this dedicated endpoint does idempotency / TOCTOU /
  MedicationStatement / prescription-status work that a plain upsert must not
  bypass, so it stays off `sync.push`).
- **Everything else → `/sync.push`** (generic), body `{ json: [ { resourceType:
  entry.resourceType, resourceId: entry.resourceId, action: entry.action ===
  'update' ? 'update' : 'create', payload: entry.payload, hlcTimestamp:
  entry.hlcTimestamp } ] }`. Parse the tRPC envelope `result.data.json.results[0]`:
  `success:true` → success; `conflict` → `{ success:false, conflict:true }`
  (DrainWorker's conflict path); `error` (incl. the Hub's `Unknown resource type`
  for not-yet-registered resources) → `{ success:false, error }`.

Routing "all non-dispense → sync.push" is deliberate: this slice registers only
the 3 wholesale types Hub-side, so other already-enqueued resources (Supplier,
StockMovement, …) will now fail with a *clean* Hub error `Unknown resource type`
instead of being silently mis-POSTed to `recordDispense` — an improvement — and
each later epic slice makes them work with **no further drain change** (§9).

Keep the existing 401 (`auth-expired`) / 403 handling. `sync.push` `action` is
`'create'|'update'` only; map the queue's `action` accordingly (`update`→`update`,
otherwise `create`).

## 6. Conflict / idempotency

`sync.push` compares incoming vs stored HLC and rejects stale writes; re-draining
the same entry is idempotent (upsert by `id`, newer-or-equal HLC → no-op/accept).
`CustomerLedgerEntry` rows are create-only. No Tier-1 append-only logic applies
(operational data).

## 7. Prerequisite / risk — JWT `org_id`

`sync.push` returns `MISSING_ORG_CONTEXT` (row fails) when `ctx.user.orgId` is
null. `ctx.user.orgId` = JWT `user_metadata.org_id ?? payload.org_id ?? null`
(`init.ts:65`). **Therefore pharmacist accounts MUST carry `org_id`.** The plan
includes a verification step (check a pharmacist JWT / user_metadata). If missing,
it is a small config prerequisite (populate `org_id` on pharmacy users) — surfaced
loudly rather than silently dropping data, which is the correct failure mode.

## 8. Testing

**Hub (Vitest, existing sync test harness):**
- `sync.push` with a `WholesaleCustomer` op (PHARMACIST, org present) → row in
  `wholesale_customers` with `org_id` stamped.
- Same for `SalesOrder` (asserts `lines` JSONB round-trips) and
  `CustomerLedgerEntry` (asserts `entry_timestamp` mapping).
- Missing `org_id` → `MISSING_ORG_CONTEXT`, no row.
- RBAC: PHARMACIST allowed for the 3; a non-permitted role denied; unrelated types
  still work.
- Re-push with older HLC → rejected/no-op (newer-wins).
- Flatteners: unit tests for each (field mapping + `lines` passthrough + timestamp rename).

**Pharmacy-lite (Vitest):**
- `drainSyncFn` routes each wholesale type to `/sync.push` with the correct
  `{json:[op]}` envelope and parses `results[0]`.
- `MedicationDispense` still routes to `/medication.recordDispense` (regression).
- A non-dispense resourceType routes to `/sync.push` (NOT `/medication.recordDispense`)
  with the `{json:[op]}` envelope — asserted via the mocked fetch URL.

**Live (after build):** enable wholesale mode, create a customer/order, watch the
"failed sync" banner clear and the Sync Queue drain to synced (the exact failure
observed in verification).

## 9. Reuse / pattern for later slices

This establishes the repeatable recipe for the rest of the epic (inventory,
procurement, transfers): table + RLS migration → `RESOURCE_TABLE_MAP` +
`ORG_SCOPED_TABLES` entry → `ROLE_PERMISSIONS` grant → flattener → (drain already
routes anything non-dispense to `sync.push`, so later resources need no further
drain change). Later slices are mostly "add table + flattener + map entry".
