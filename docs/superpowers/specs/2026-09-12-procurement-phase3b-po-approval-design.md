# Procurement Overhaul — Phase 3b: PO Approval Workflow

**Date:** 2026-09-12
**App:** `apps/pharmacy-lite` (+ additive enum entries in `packages/shared-types`)
**Status:** Design — awaiting review before implementation plan
**Part of:** Procurement overhaul. Phases 1, 2a, 2b-i, 2b-ii, and 3a (audit
trail) are complete. Phase 3 (governance) splits into **3a (audit — done)**,
**3b (this spec — PO approval)**, and **3c (QC / receiving inspection)**. 3b
audits its decisions through the 3a `auditProcurementEvent` helper. Phase 4
(supplier master + reorder) remains deferred.

## Context

Today a purchase order goes `draft → sent` through `markPurchaseOrderSent(poId,
sentBy?)` with **no authorization gate** — any authenticated user can send any
PO of any value. There is no RBAC anywhere in the app (`AuthSession.role` is a
freeform string that is never checked). Phase 3a added the audit backbone
(`auditProcurementEvent`) and deferred approval-specific verbs to 3b.

`PurchaseOrderStatus = 'draft' | 'sent' | 'partially_received' | 'closed' |
'cancelled'`; `PurchaseOrder` carries `createdBy`, `sentBy?`, `sentAt?`,
`cancelledBy?`, `totalCost` (integer minor units). `PharmacyInventorySettings`
holds procurement config (e.g. `invoiceMatchTolerancePercent`, default 0, read
defensively). The PO detail page (`PurchaseOrderDetailPage.tsx`) renders a "Mark
sent" action for drafts; the PO list (`PurchaseOrdersPage.tsx`) has status
pill-tabs.

## Goal

Insert an opt-in approval gate before a PO can be sent: POs at or above a
configurable spending threshold must be submitted for approval and approved by
a **different** user than the creator (segregation of duties) before they send;
rejection returns them to draft for rework. Every transition is audited.

## Locked Decisions

1. **Threshold + segregation-of-duties (SoD), no RBAC.** Approval is gated by
   amount (`poApprovalThreshold`); the approver/rejecter must be a different
   user than the PO's `createdBy`. No role system — uses the session user id.
2. **State machine:** one new status `pending_approval`. **Submit** (draft →
   pending_approval), **Approve** (pending_approval → **sent**, in one step —
   approval authorizes and marks sent; there is no separate transmit step),
   **Reject** (pending_approval → **draft**, with a required reason).
3. **`poApprovalThreshold` (minor units), default `0` = off.** `0` means no PO
   requires approval (today's behavior — non-breaking). A positive value means
   POs with `totalCost ≥ threshold` require approval; below it, send directly.
4. **Reject returns to draft** (editable, resubmittable), recording
   `rejectedBy`/`rejectedReason`/`rejectedAt`.
5. **Enforcement in the service layer**, not just the UI: `markPurchaseOrderSent`
   hard-blocks a draft that requires approval; `approve`/`reject` enforce the SoD
   and status guards.

## Data Model (no Dexie bump — additive fields + a new status value)

### `PurchaseOrderStatus` (`src/lib/procurement/types.ts`)
Add `'pending_approval'`:
```ts
export type PurchaseOrderStatus =
  | 'draft' | 'pending_approval' | 'sent' | 'partially_received' | 'closed' | 'cancelled'
```
The `purchaseOrders` store already indexes `status`, so the new value is
queryable with no schema change.

### `PurchaseOrder` (`src/lib/procurement/types.ts`)
Add optional attribution fields (all `string`):
```ts
  submittedBy?: string
  submittedAt?: string
  approvedBy?: string
  approvedAt?: string
  rejectedBy?: string
  rejectedReason?: string
  rejectedAt?: string
```

### `PharmacyInventorySettings` (`src/lib/inventory/types.ts`)
Add `poApprovalThreshold: number` (minor units) and `poApprovalThreshold: 0` in
`DEFAULT_PHARMACY_SETTINGS`. Reads default defensively (`settings?.poApprovalThreshold ?? 0`)
so existing settings rows need no migration (same pattern as
`invoiceMatchTolerancePercent`).

## Pure Logic (`src/lib/procurement/po-approval.ts`, new)

```ts
/** A PO requires approval only when a positive threshold is configured and the
 *  PO total meets or exceeds it. threshold 0 (or negative) → approval off. */
export function requiresApproval(totalCost: number, threshold: number): boolean {
  return threshold > 0 && totalCost >= threshold
}
```
Pure, integer minor units, deterministic.

## Enum Additions (`packages/shared-types/src/enums.ts`) — additive, then rebuild

```ts
// AuditAction += (procurement approval — Phase 3b)
PO_SUBMITTED_FOR_APPROVAL = 'PO_SUBMITTED_FOR_APPROVAL',
PO_APPROVED = 'PO_APPROVED',
PO_REJECTED = 'PO_REJECTED',
```
Append only (do not reorder existing members). Rebuild:
`pnpm --filter @ultranos/shared-types build`.

## Services (`src/lib/procurement/purchase-order-service.ts`)

```ts
export class SelfApprovalError extends Error {}      // approver/rejecter === createdBy
export class ApprovalRequiredError extends Error {}  // markPurchaseOrderSent on an approval-required draft
```

- `submitPurchaseOrderForApproval(poId: string, submittedBy: string): Promise<void>`
  — load PO; if `status !== 'draft'` throw; set `status: 'pending_approval'`,
  `submittedBy`, `submittedAt`, `hlcTimestamp`; enqueue PO update sync; emit
  `auditProcurementEvent(submittedBy, PO_SUBMITTED_FOR_APPROVAL, PURCHASE_ORDER,
  poId, { poNumber, totalCost })`.
- `approvePurchaseOrder(poId: string, approvedBy: string): Promise<void>`
  — load PO; if `status !== 'pending_approval'` throw; if `approvedBy === po.createdBy`
  throw `SelfApprovalError`; set `status: 'sent'`, `approvedBy`, `approvedAt`,
  `sentBy: approvedBy`, `sentAt` (= now), `hlcTimestamp`; enqueue sync; emit
  `PO_APPROVED` (`{ poNumber, totalCost }`).
- `rejectPurchaseOrder(poId: string, rejectedBy: string, reason: string): Promise<void>`
  — load PO; if `status !== 'pending_approval'` throw; if `rejectedBy === po.createdBy`
  throw `SelfApprovalError`; set `status: 'draft'`, `rejectedBy`,
  `rejectedReason: reason.trim() || undefined`, `rejectedAt`, `hlcTimestamp`;
  enqueue sync; emit `PO_REJECTED` (`{ poNumber, reason }`).
- **Modify `markPurchaseOrderSent(poId, sentBy?)`**: before the existing update,
  load the PO + settings; if
  `requiresApproval(po.totalCost, settings?.poApprovalThreshold ?? 0)` → throw
  `ApprovalRequiredError` (regardless of current status — an approval-required PO
  can reach `sent` ONLY through `approvePurchaseOrder`, so this closes the bypass
  for both `draft` and `pending_approval`). Otherwise unchanged (existing
  behavior + the existing `PO_SENT` audit from 3a).

All emits are fire-and-forget via the 3a helper; existing sync-enqueue and status
logic is otherwise unchanged.

## UI (design-system, 4 locales)

**Design-system rules (binding):** ShadCN from `@/components/ui/*`, icons from
`@ultranos/ui-kit/icons`; semantic oklch tokens only (no hex/raw oklch); money in
`font-numeric`; RTL logical props (`ms-*`/`me-*`, `text-start`/`text-end`);
`EmptyState` for empty/loading; OPD list/detail-page layout standards.

- **PurchaseOrderDetailPage** — the action area branches by status (using
  `requiresApproval(po.totalCost, threshold)`, threshold loaded from settings on
  the page):
  - `draft` + requires approval → **Submit for approval** (`submitPurchaseOrderForApproval`).
  - `draft` + not required → **Mark sent** (unchanged).
  - `pending_approval` → **Approve** (`approvePurchaseOrder`) + **Reject**
    (reveals a required reason field → `rejectPurchaseOrder`). Both are disabled
    with an inline note (`text-muted-foreground`) when `performedBy === po.createdBy`
    (self-approval); the service enforces this regardless. `SelfApprovalError` maps
    to an inline message; `ApprovalRequiredError` (should not normally surface, but
    if a stale "Mark sent" is clicked) maps to "This PO needs approval first".
  - A `pending_approval` status badge (`bg-warning/10 text-warning`) and
    approval attribution (`submittedBy`, `approvedBy`, `rejectedBy` + reason).
- **PurchaseOrdersPage** — add a `pending_approval` status pill-tab / filter
  option and the row badge.
- **PharmacySettingsView** — a `poApprovalThreshold` field in the Procurement
  settings card (minor-units input, mirrors `invoiceMatchTolerancePercent`;
  save-on-blur preserving `poSequenceNext` and the other settings).
- i18n: submit/approve/reject/reason labels, `pending_approval` status label,
  self-approval + approval-required messages, the threshold field label, across
  `messages/{en,ar,prs,ps}.json`.

## Errors & Edge Cases

- `SelfApprovalError` — the creator cannot approve or reject their own PO (SoD).
- `ApprovalRequiredError` — `markPurchaseOrderSent` refuses an approval-required
  draft; the UI shows "Submit for approval" instead, so this is a guardrail.
- Status guards: submit only from `draft`; approve/reject only from
  `pending_approval` — else a clear error.
- Threshold 0 (default) → `requiresApproval` is always false → the entire
  workflow is dormant and every existing flow is unchanged (non-breaking).
- A rejected PO returns to `draft` with its rejection reason retained; editing +
  resubmitting is the rework loop. (Prior `rejectedBy/reason/at` are overwritten
  on a subsequent reject.)
- Cancel remains available from `draft`/`pending_approval` (unchanged
  `cancelPurchaseOrder`).
- No PHI in audit metadata (poNumber, totalCost, reason — all operational).

## Testing

- **Pure `requiresApproval`:** threshold 0 → false; total below → false; total
  equal → true; total above → true; negative threshold → false.
- **Services:** `submitPurchaseOrderForApproval` (draft → pending_approval +
  attribution + audit; non-draft throws); `approvePurchaseOrder` (pending → sent
  + sentBy/At + audit; `SelfApprovalError` when approver === creator; non-pending
  throws); `rejectPurchaseOrder` (pending → draft + reason + audit; SoD throw;
  non-pending throws); `markPurchaseOrderSent` throws `ApprovalRequiredError` for
  an approval-required draft and still sends when not required or below threshold.
- **Audit:** `PO_SUBMITTED_FOR_APPROVAL` / `PO_APPROVED` / `PO_REJECTED` emitted
  with actor + poNumber (spy on the emitter or read `clientAuditLog`).
- **UI:** detail page shows the correct action per status; SoD disables
  approve/reject for the creator; list shows the `pending_approval` pill;
  settings threshold saves (poSequenceNext preserved). RTL/design-system check on
  touched surfaces.
- **Compliance:** attribution recorded; no PHI in logs/metadata.

## Out of Scope (later)

- Multi-level / tiered approval chains and per-tier approvers.
- RBAC / role-gated approver permissions (this uses SoD on user id only).
- Approval delegation / out-of-office.
- Per-supplier or per-category thresholds.
- Editing a `pending_approval` PO in place (must reject → draft first).
- Phase 3c: QC / receiving inspection.

## Affected Files (indicative)

- `packages/shared-types/src/enums.ts` — 3 additive `AuditAction` verbs (rebuild).
- `src/lib/procurement/types.ts` — `pending_approval` status + PO attribution fields.
- `src/lib/inventory/types.ts` — `poApprovalThreshold` + default.
- `src/lib/procurement/po-approval.ts` — pure `requiresApproval`.
- `src/lib/procurement/purchase-order-service.ts` — submit/approve/reject +
  `markPurchaseOrderSent` guard + `SelfApprovalError`/`ApprovalRequiredError`.
- `src/components/pharmacy/procurement/PurchaseOrderDetailPage.tsx` — action
  branching + reject reason + attribution + badge.
- `src/components/pharmacy/procurement/PurchaseOrdersPage.tsx` — pending pill/filter.
- `src/components/pharmacy/PharmacySettingsView.tsx` — threshold field.
- `messages/{en,ar,prs,ps}.json` — approval strings.
