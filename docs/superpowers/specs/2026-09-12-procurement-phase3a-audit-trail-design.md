# Procurement Overhaul — Phase 3a: Procurement Audit Trail

**Date:** 2026-09-12
**App:** `apps/pharmacy-lite` (+ additive enum entries in `packages/shared-types`)
**Status:** Design — awaiting review before implementation plan
**Part of:** Procurement overhaul. Phases 1 (PO→receipt), 2a (cost model),
2b-i (supplier invoice + 3-way match), 2b-ii (payments & AP settlement) are
complete. Phase 3 (governance) is split into **3a (this spec — audit trail)**,
**3b (PO approval workflow)**, and **3c (QC / receiving inspection)**, built in
that order. 3a is the backbone: 3b and 3c will audit their new decisions through
the helper this sub-phase adds. Phase 4 (supplier master + reorder) remains
deferred.

## Context

Every procurement state-change today happens with **no audit record**:
`createPurchaseOrder` / `markPurchaseOrderSent` / `cancelPurchaseOrder`,
`processGoodsReceipt` / `reverseGoodsReceipt`, `createSupplierInvoice` /
`approveSupplierInvoice` / `disputeSupplierInvoice`, and
`recordSupplierPayment` / `voidSupplierPayment` all mutate durable financial /
inventory state and emit nothing. Meanwhile the app already has a mature audit
pipeline used for PHI access:

- `emitClientAudit(input: ClientAuditEventInput)` (`@ultranos/audit-logger/client`)
  — never throws; validates metadata has no PHI field names (auto-strips);
  per-resource SHA-256 hash-chains; queues to the local `clientAuditLog` Dexie
  store via the registered `DexieAuditAdapter`; `AuditDrainWorker` syncs entries
  to the Hub (`/audit.sync`), flipping their `status` `pending → synced` (entries
  **persist** — the store is a durable, queryable ledger).
- `ClientAuditEvent = { id, actorId, actorRole: UserRole, action: AuditAction,
  resourceType: AuditResourceType, resourceId, patientId?, hlcTimestamp,
  metadata?, queuedAt, status, chainHash? }`.
- `auditPhiAccess(...)` (`src/lib/audit.ts`) is the pharmacy wrapper for PHI
  events. Procurement uses none of this.

`AuditAction` / `AuditResourceType` (`packages/shared-types/src/enums.ts`) follow
a **fine-grained lifecycle-verb** convention (e.g. `SAMPLE_RECEIVED`,
`RESULT_AUTHORIZED`, `RESULT_RELEASED`) and have a generic `PAYMENT` resource but
**no** procurement resource types.

## Goal

Record a durable, Hub-synced, hash-chained audit event for every procurement
state-change, and surface a read-only in-app Procurement Audit view — reusing the
existing `clientAuditLog` pipeline, with fine-grained action verbs, non-blocking
(fire-and-forget) emission, and strictly non-PHI metadata.

## Locked Decisions

1. **Unified `clientAuditLog` ledger** via `emitClientAudit` — the same durable,
   locally-queryable, Hub-drained, hash-chained store `auditPhiAccess` uses. One
   audit source of truth. (Not a separate store; not the `pendingAuditEvents`
   drain-and-clear outbox.)
2. **Distinct AuditAction verbs per event** (matches the codebase's
   lab-lifecycle convention) — added to `@ultranos/shared-types`.
3. **Fire-and-forget, non-blocking** emission (`emitClientAudit` never throws).
   Procurement is non-PHI operational data, so CLAUDE.md rule 6's
   throw-on-audit-failure (which binds PHI access) does not apply; a PO send or
   payment must not fail on an audit hiccup.
4. **Dedicated read-only view** at `/inventory/audit` with a new sidebar "Audit"
   item under Inventory.

## Enum Additions (`packages/shared-types/src/enums.ts`) — additive, then rebuild

```ts
// AuditResourceType += (procurement)
PURCHASE_ORDER = 'PURCHASE_ORDER',
SUPPLIER_INVOICE = 'SUPPLIER_INVOICE',
SUPPLIER_PAYMENT = 'SUPPLIER_PAYMENT',
GOODS_RECEIPT = 'GOODS_RECEIPT',

// AuditAction += (procurement lifecycle)
PO_CREATED = 'PO_CREATED',
PO_SENT = 'PO_SENT',
PO_CANCELLED = 'PO_CANCELLED',
GOODS_RECEIVED = 'GOODS_RECEIVED',
GOODS_RECEIPT_REVERSED = 'GOODS_RECEIPT_REVERSED',
SUPPLIER_INVOICE_CREATED = 'SUPPLIER_INVOICE_CREATED',
SUPPLIER_INVOICE_APPROVED = 'SUPPLIER_INVOICE_APPROVED',
SUPPLIER_INVOICE_DISPUTED = 'SUPPLIER_INVOICE_DISPUTED',
SUPPLIER_PAYMENT_RECORDED = 'SUPPLIER_PAYMENT_RECORDED',
SUPPLIER_PAYMENT_VOIDED = 'SUPPLIER_PAYMENT_VOIDED',
```
Purely additive (append to the enums; do not reorder existing members). After
editing, rebuild the package: `pnpm --filter @ultranos/shared-types build` so
pharmacy-lite resolves the new members through `dist/`. No Hub migration is
required — the Hub stores `action`/`resource_type` as strings.

## The Helper (`src/lib/procurement/audit.ts`, new)

```ts
import { emitClientAudit } from '@ultranos/audit-logger/client'
import { AuditAction, AuditResourceType, UserRole } from '@ultranos/shared-types'
import { hlc, serializeHlc } from '@/lib/hlc'

/**
 * Emit a procurement audit event to the unified client audit ledger.
 * Never throws (fire-and-forget). Metadata MUST be non-PHI (opaque ids,
 * money, status, reference numbers, operational reason strings) — emitClientAudit
 * additionally strips any known PHI field names at runtime.
 */
export function auditProcurementEvent(
  actorId: string,
  action: AuditAction,
  resourceType: AuditResourceType,
  resourceId: string,
  metadata?: Record<string, unknown>,
): void {
  void emitClientAudit({
    actorId: actorId || 'unknown',
    actorRole: UserRole.PHARMACIST, // RBAC is Phase 3b; default matches auditPhiAccess
    action,
    resourceType,
    resourceId,
    hlcTimestamp: serializeHlc(hlc.now()),
    metadata: { ...metadata, source: 'pharmacy-lite', domain: 'procurement' },
  })
}
```
`actorRole` is hardcoded to `UserRole.PHARMACIST` (consistent with
`auditPhiAccess`) because there is no RBAC yet; Phase 3b introduces roles and can
revisit this. No `patientId` — procurement events are never patient-scoped.

## Instrumentation — 10 call sites

Each service function calls `auditProcurementEvent(...)` **after** its write
completes (after the Dexie transaction / `put` / `update`, before returning),
fire-and-forget. `actorId` is the existing attribution param the function already
receives. Metadata carries only opaque ids, reference numbers, money (minor
units), status, and operational reason strings.

| Service (file) | Function | action | resourceType | resourceId | metadata |
|---|---|---|---|---|---|
| `purchase-order-service.ts` | `createPurchaseOrder` | `PO_CREATED` | `PURCHASE_ORDER` | `po.id` | `{ poNumber, supplierId, totalCost, lineCount }` |
| `purchase-order-service.ts` | `markPurchaseOrderSent` | `PO_SENT` | `PURCHASE_ORDER` | `poId` | `{ poNumber, supplierId }` |
| `purchase-order-service.ts` | `cancelPurchaseOrder` | `PO_CANCELLED` | `PURCHASE_ORDER` | `poId` | `{ poNumber, reason }` |
| `goods-receipt-service.ts` | `processGoodsReceipt` | `GOODS_RECEIVED` | `GOODS_RECEIPT` | `receipt.id` | `{ purchaseOrderId, supplierId, totalCost, lineCount }` |
| `goods-receipt-service.ts` | `reverseGoodsReceipt` | `GOODS_RECEIPT_REVERSED` | `GOODS_RECEIPT` | `reversalReceipt.id` | `{ reversalOf, purchaseOrderId }` |
| `supplier-invoice-service.ts` | `createSupplierInvoice` | `SUPPLIER_INVOICE_CREATED` | `SUPPLIER_INVOICE` | `invoice.id` | `{ invoiceNumber, supplierId, purchaseOrderId, total }` |
| `supplier-invoice-service.ts` | `approveSupplierInvoice` | `SUPPLIER_INVOICE_APPROVED` | `SUPPLIER_INVOICE` | `invoiceId` | `{ invoiceNumber, overrideReason }` |
| `supplier-invoice-service.ts` | `disputeSupplierInvoice` | `SUPPLIER_INVOICE_DISPUTED` | `SUPPLIER_INVOICE` | `invoiceId` | `{ invoiceNumber, reason }` |
| `supplier-payment-service.ts` | `recordSupplierPayment` | `SUPPLIER_PAYMENT_RECORDED` | `SUPPLIER_PAYMENT` | `payment.id` | `{ supplierId, amount, method, allocationCount }` |
| `supplier-payment-service.ts` | `voidSupplierPayment` | `SUPPLIER_PAYMENT_VOIDED` | `SUPPLIER_PAYMENT` | `paymentId` | `{ reason }` |

Notes:
- `markPurchaseOrderSent`/`cancelPurchaseOrder` receive only `poId` + actor; the
  function loads the PO for the mutation anyway, so `poNumber` is available to
  pass. If not already loaded, a lightweight `getPurchaseOrderById` read for the
  audit metadata is acceptable (non-blocking path).
- `approveSupplierInvoice`/`disputeSupplierInvoice` already load the invoice —
  reuse `inv.invoiceNumber`.
- No PHI: supplier ids/names and reason strings are business/operational, never
  patient data. `emitClientAudit`'s PHI-field-name guard is the safety net.

## View Layer

### `getProcurementAuditEvents(filter?)` (`src/lib/procurement/audit.ts`)
```ts
const PROCUREMENT_RESOURCE_TYPES = [
  AuditResourceType.PURCHASE_ORDER, AuditResourceType.SUPPLIER_INVOICE,
  AuditResourceType.SUPPLIER_PAYMENT, AuditResourceType.GOODS_RECEIPT,
] as const

export async function getProcurementAuditEvents(filter?: {
  resourceType?: AuditResourceType
  action?: AuditAction
  search?: string   // matches resourceId or a reference number in metadata
}): Promise<ClientAuditEvent[]>
```
Reads `db.clientAuditLog.toArray()`, keeps entries whose `resourceType` is in
`PROCUREMENT_RESOURCE_TYPES`, applies the optional `resourceType`/`action`/
`search` filters in memory, sorts by `hlcTimestamp` (then `queuedAt`) descending.
(In-memory filter is fine at pharmacy audit volumes and matches the app's
existing audit-read pattern; `clientAuditLog` is not indexed by resourceType.)

### Procurement Audit page (`ProcurementAuditPage.tsx` / route `/inventory/audit`)
OPD list-page standard, design-system compliant, 4 locales:
- Standalone `<h1>` (`text-2xl font-semibold text-foreground`), one toolbar row
  (`flex flex-wrap items-center gap-3`): a resource-type pill/`<select>` filter →
  an action `<select>` → a wide `SearchInput` (`min-w-[200px] flex-1`) matching
  resourceId / reference.
- One content box (`overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px]
  ring-border/50`) wrapping loading / empty / table. Columns: **When**
  (localized `hlcTimestamp`/`queuedAt`), **Action** (i18n label per verb),
  **Resource** (i18n label per resource type), **Reference** (a friendly
  `metadata.poNumber` / `metadata.invoiceNumber`, else `resourceId`), **Actor**
  (`actorId`). Optional **synced** indicator from `status`.
- `EmptyState` (icon e.g. `ScrollText`/`History`) inside the box for loading +
  empty. Newest first. Read-only — no row actions.
- Sidebar: `{ titleKey: 'audit', url: '/inventory/audit' }` added to the
  Inventory group in `nav-config.ts` (after `payables`); `sidebar.audit` i18n key.

i18n: an `audit` namespace (column headers, filter labels, empty/loading) plus a
label map for the 10 action verbs and 4 resource types, across
`messages/{en,ar,prs,ps}.json`.

## Errors & Edge Cases

- Emission never throws; a failed audit write is logged by `emitClientAudit`
  internally without PHI and does not affect the procurement operation.
- Metadata is non-PHI by construction; the runtime PHI-field-name guard in
  `emitClientAudit` is the backstop (it strips + warns, never throws).
- The view degrades gracefully if `clientAuditLog` is empty (EmptyState) or an
  entry lacks a friendly reference (falls back to `resourceId`).
- Existing PHI-access audit entries in `clientAuditLog` are **excluded** from the
  procurement view by the resource-type filter.

## Testing

- **Helper:** `auditProcurementEvent` emits a `ClientAuditEvent` with the given
  action/resourceType/resourceId/actorId and `metadata.domain === 'procurement'`;
  never throws even if the adapter rejects.
- **Instrumentation (per service):** after each state-change, exactly one
  matching audit event lands in `clientAuditLog` (assert action + resourceType +
  resourceId + actorId). Spy on `emitClientAudit` or read `db.clientAuditLog`
  after the operation. Confirm the operation still succeeds if the audit emit
  rejects (fire-and-forget).
- **Query:** `getProcurementAuditEvents` returns only procurement resource types,
  newest-first, and honors the `resourceType`/`action`/`search` filters; excludes
  a seeded PHI-access (`PRESCRIPTION`) entry.
- **View:** renders rows for seeded events; filters narrow the list; EmptyState
  when none.
- **Compliance:** no PHI in any procurement audit metadata (assert the seeded
  metadata contains only ids/money/status/reference/reason).

## Out of Scope (later)

- **Phase 3b:** PO approval workflow (`pending_approval` status, approve/reject,
  spending threshold, roles) — will emit its own approval audit verbs via this
  helper.
- **Phase 3c:** QC / receiving inspection (accept/reject/quarantine, batch
  release) — will emit QC audit verbs via this helper.
- RBAC / real `actorRole` derivation (Phase 3b).
- Audit export / reporting, retention policy, tamper-evident local verification
  UI (the Hub already hash-chains server-side).
- Editing the PO model (e.g. adding `cancelledAt`) — the audit event's
  `hlcTimestamp` captures the time; the model stays unchanged this sub-phase.

## Affected Files (indicative)

- `packages/shared-types/src/enums.ts` — additive `AuditResourceType` +
  `AuditAction` members (then `pnpm --filter @ultranos/shared-types build`).
- `src/lib/procurement/audit.ts` — `auditProcurementEvent` +
  `getProcurementAuditEvents` + `PROCUREMENT_RESOURCE_TYPES`.
- `src/lib/procurement/purchase-order-service.ts` — 3 emit call sites.
- `src/lib/inventory/goods-receipt-service.ts` — 2 emit call sites.
- `src/lib/procurement/supplier-invoice-service.ts` — 3 emit call sites.
- `src/lib/procurement/supplier-payment-service.ts` — 2 emit call sites.
- `src/components/pharmacy/procurement/ProcurementAuditPage.tsx` — the view.
- `src/app/[locale]/(app)/inventory/audit/page.tsx` — route.
- `src/components/sidebar/nav-config.ts` — "Audit" nav item.
- `messages/{en,ar,prs,ps}.json` — `audit` namespace + action/resource labels +
  `sidebar.audit`.
