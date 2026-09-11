# Procurement Overhaul — Phase 2b-ii: Supplier Payments & AP Settlement

**Date:** 2026-09-11
**App:** `apps/pharmacy-lite`
**Status:** Design — awaiting review before implementation plan
**Part of:** Procurement overhaul. Phase 1 (PO→receipt loop), Phase 2a (cost
model), and Phase 2b-i (supplier invoice + 3-way match) are complete. Phase 2b
(full buy-side AP) was split into **2b-i (supplier invoice + 3-way match)** and
**2b-ii (this spec — payments & settlement)**, which depends on 2b-i. Phases 3
and 4 remain deferred.

## Context

After Phase 2b-i, a supplier invoice is captured against a PO, reconciled three
ways (ordered ↔ received ↔ billed), and passes a human approve/dispute gate
(`SupplierInvoiceStatus = 'pending' | 'approved' | 'disputed'`). But approval is
purely a compliance gate: it moves no money. There is no record of what has been
paid to a supplier, what is still owed, or how overdue it is. A pharmacy cannot
answer "how much do we owe supplier X, and which bills are past due?"

There is no supplier-side Accounts Payable at all today. The app already has two
customer-side AR precedents to mirror:

- **POS patient invoices** (`src/lib/pos/`): invoice-level — `Payment.invoiceId`,
  per-invoice `amountPaid`/`amountDue`, status `partial`/`paid`. This is the
  pattern 2b-ii mirrors.
- **Wholesale customer accounts** (`src/lib/wholesale/`): account-level running
  balance + ledger entries. Not used here (we chose invoice-level).
- **Aging** (`src/lib/pos/aging.ts`): a pure, reusable
  `computeAging(entries: { amount; timestamp }[], now)` → `{ current, thirtyDay,
  sixtyDay, ninetyPlus }` (0-30 / 31-60 / 61-90 / 90+ days off each entry's
  timestamp, charges only i.e. `amount > 0`).

## Goal

Record payments against **approved** supplier invoices with invoice-level
allocation, so each invoice tracks how much is paid and still due; derive a
per-supplier AP account (outstanding balance + aging off due date) as a roll-up
of unpaid approved invoices; and allow a mistaken payment to be voided.

## Locked Decisions

1. **Invoice-level allocation.** A payment is allocated to specific approved
   invoice(s); each invoice carries `amountPaid` and a `settlementStatus`.
   `amountDue` is **derived** (`total − amountPaid`), never stored. The supplier
   "AP account" (outstanding + aging) is a **derived roll-up** of unpaid approved
   invoices — there is **no** `supplierAccounts` store and no stored running
   balance (avoids drift; single source of truth is the invoices).
2. **Due date on the invoice, defaulted from supplier terms.** Add numeric
   `Supplier.paymentTermsDays`; capture a `dueDate` per invoice, defaulted to
   the capture date (`createdAt`) `+ paymentTermsDays` days — 2b-i captures no
   separate invoice-issue date, and adding one is out of scope — editable at
   capture. Aging ages each
   invoice's `amountDue` off `dueDate` (real overdue buckets; not-yet-due lands
   in "current").
3. **Payment UX = pay-from-invoice + supplier FIFO auto-allocate.** Primary: a
   "Record payment" action on an approved invoice settles that one invoice
   (amount defaults to `amountDue`, editable for partial). Also: a supplier
   account page where a lump sum auto-allocates oldest-`dueDate`-first across the
   supplier's unpaid approved invoices, with the allocation shown before confirm.
4. **Void is supported.** A payment can be voided with a reason + attribution;
   voiding reverses each allocation (restores the invoices' `amountPaid` and
   `settlementStatus`). Mirrors the existing invoice-void pattern.
5. **Method + optional reference per payment.** Method enum
   (`cash | bank_transfer | cheque | other`) + optional free-text `reference`
   (cheque no., transfer id). No cash-drawer integration.

## Data Model (Dexie **v19** bump)

### Modify `SupplierInvoice` (`src/lib/procurement/types.ts`)
Add four fields (all populated at creation from Phase 2b-i onward; legacy rows
backfilled by the v19 upgrade + defensive reads):

```ts
dueDate: string                 // ISO date; defaulted invoiceDate + paymentTermsDays
amountPaid: number              // minor units; default 0
settlementStatus: 'unpaid' | 'partial' | 'paid'   // stored (indexed); derived from amountPaid vs total
// amountDue is DERIVED (total − amountPaid) via computeAmountDue(); never stored.
```

### Modify `Supplier` (`src/lib/procurement/types.ts`)
Add `paymentTermsDays?: number` (net-days; mirrors `WholesaleCustomer.paymentTermsDays`).
The existing free-string `paymentTerms?: string` is kept for display and is not removed.

### New `supplierPayments` store (`src/lib/db.ts` + `src/lib/procurement/types.ts`)
Index string: `id, supplierId, status, paidAt, [supplierId+status]`.

```ts
export type SupplierPaymentMethod = 'cash' | 'bank_transfer' | 'cheque' | 'other'
export type SupplierPaymentStatus = 'active' | 'void'

export interface SupplierPaymentAllocation {
  supplierInvoiceId: string
  invoiceNumber: string   // denormalized for display
  amount: number          // minor units applied to this invoice
}

export interface SupplierPayment {
  id: string
  supplierId: string
  supplierName: string          // denormalized for display
  amount: number                // total minor units == Σ allocations[].amount
  method: SupplierPaymentMethod
  reference?: string
  allocations: SupplierPaymentAllocation[]
  status: SupplierPaymentStatus // 'active' → 'void'
  notes?: string
  paidBy: string                // attribution (userId)
  paidAt: string                // ISO instant
  voidedBy?: string
  voidReason?: string
  voidedAt?: string
  hlcTimestamp: string
}
```

### Dexie v19 version block (`src/lib/db.ts`)
```ts
// v19: Procurement Phase 2b-ii — supplier payments + AP settlement.
// Non-PHI operational data (money + ids only); not encrypted.
this.version(19)
  .stores({
    supplierInvoices:
      'id, purchaseOrderId, supplierId, status, invoiceNumber, settlementStatus, [supplierId+invoiceNumber], [supplierId+status]',
    supplierPayments: 'id, supplierId, status, paidAt, [supplierId+status]',
  })
  .upgrade(async (tx) => {
    // Backfill settlement fields on invoices created before 2b-ii.
    await tx.table('supplierInvoices').toCollection().modify((inv) => {
      if (inv.amountPaid === undefined) inv.amountPaid = 0
      if (inv.settlementStatus === undefined) inv.settlementStatus = 'unpaid'
      if (inv.dueDate === undefined) inv.dueDate = inv.createdAt
    })
  })
```
Re-declaring `supplierInvoices` here (with the added `settlementStatus` and
`[supplierId+status]` index) is required — Dexie index changes live in a new
version block. The v18 block stays untouched (append-only versioning).

## Pure Logic (no DB)

### `src/lib/procurement/ap-invoice.ts`
```ts
export function computeAmountDue(inv: Pick<SupplierInvoice, 'total' | 'amountPaid'>): number
  // total − (amountPaid ?? 0), clamped ≥ 0
export function computeSettlementStatus(
  inv: Pick<SupplierInvoice, 'total' | 'amountPaid'>,
): 'unpaid' | 'partial' | 'paid'
  // amountDue ≤ 0 → 'paid'; amountPaid > 0 → 'partial'; else 'unpaid'
```

### `src/lib/procurement/ap-allocation.ts`
```ts
export interface AllocatableInvoice {
  id: string; invoiceNumber: string; amountDue: number; dueDate: string
}
export interface AllocationLine {
  supplierInvoiceId: string; invoiceNumber: string; amount: number
}
export function allocateFifo(
  invoices: AllocatableInvoice[],
  paymentAmount: number,
): { allocations: AllocationLine[]; unapplied: number }
```
Sorts `invoices` by `dueDate` ascending (tie-break `invoiceNumber`), applies
`min(remaining, amountDue)` to each until the payment is exhausted; skips
`amountDue ≤ 0`. `unapplied` is any leftover once every invoice is full (a lump
sum exceeding total outstanding — the UI blocks this, but the allocator reports
it). Integer minor units throughout. Pure — no DB, deterministic.

### Aging (reuse `src/lib/pos/aging.ts`)
No new ager. For a supplier's unpaid approved invoices, call
`computeAging(invoices.map(i => ({ amount: computeAmountDue(i), timestamp: i.dueDate })), now)`.
Buckets are days-past-due off `dueDate`. **Verify during implementation** that
`computeAging` places a future `dueDate` (age < 0, not-yet-due) into `current`;
if it does not, clamp age to `≥ 0` at the call site (do not edit the shared AR
ager).

## Services

### `src/lib/procurement/supplier-payment-service.ts`
```ts
export class InvoiceNotApprovedError extends Error {}   // target invoice not 'approved'
export class OverpaymentError extends Error {}          // allocation amount > that invoice's amountDue

export async function recordSupplierPayment(params: {
  supplierId: string
  allocations: { supplierInvoiceId: string; amount: number }[]
  method: SupplierPaymentMethod
  reference?: string
  notes?: string
  paidBy: string
  hlcTimestamp: string
}): Promise<SupplierPayment>
```
In one Dexie read-write transaction over `supplierInvoices` + `supplierPayments`:
resolve `supplierName` from the supplier; for each allocation load its invoice,
assert `status === 'approved'` (else `InvoiceNotApprovedError`) and
`amount ≤ computeAmountDue(inv)` (else `OverpaymentError`) and `amount > 0`;
create the `SupplierPayment` (`status: 'active'`, `amount = Σ allocations`,
`invoiceNumber` denormalized per allocation); for each invoice set
`amountPaid += amount` and `settlementStatus = computeSettlementStatus(...)`.
Enqueue sync: one `SupplierPayment` `create` + one `SupplierInvoice` `update`
per touched invoice.

```ts
export async function voidSupplierPayment(
  paymentId: string, voidedBy: string, reason: string, hlcTimestamp: string,
): Promise<void>
```
Load the payment; if already `void` → throw. In a transaction: set
`status: 'void'`, `voidedBy`, `voidReason`, `voidedAt`; for each allocation
reverse `invoice.amountPaid -= amount` (clamp ≥ 0) and recompute
`settlementStatus`. Enqueue the payment `update` + each invoice `update`. (A
voided allocation against an invoice since fully paid by other payments simply
returns it to `partial`/`unpaid`.)

```ts
export async function getSupplierPayments(supplierId?: string): Promise<SupplierPayment[]>
export async function getSupplierPaymentById(id: string): Promise<SupplierPayment | undefined>
export async function getPaymentsForInvoice(supplierInvoiceId: string): Promise<SupplierPayment[]>
  // scans allocations[]; returns active + void for the invoice's payment history
```

### `src/lib/procurement/supplier-account-service.ts` (derived AP account — no stored balance)
```ts
export interface SupplierPayableSummary {
  supplierId: string; supplierName: string
  outstanding: number            // Σ amountDue of approved-unpaid invoices
  aging: AgingBuckets
  oldestDueDate: string | null
  invoiceCount: number
}
export async function getSupplierPayables(): Promise<SupplierPayableSummary[]>
  // group approved invoices with amountDue > 0 by supplier; roll up outstanding + aging

export interface SupplierAccountDetail {
  supplierId: string; supplierName: string
  outstanding: number; aging: AgingBuckets
  invoices: SupplierInvoice[]    // approved, amountDue > 0, sorted by dueDate asc
  payments: SupplierPayment[]    // this supplier's payments (active + void), newest first
}
export async function getSupplierAccount(supplierId: string): Promise<SupplierAccountDetail>
```
Only `status === 'approved'` invoices with `amountDue > 0` are payable; `pending`
and `disputed` invoices never appear in payables. Balance and aging are always
recomputed from the invoices — nothing is stored.

### Modify Phase 2b-i `createSupplierInvoice` (`supplier-invoice-service.ts`)
Accept an optional `dueDate` param; when absent, default to the capture date
(`createdAt`) plus `supplier.paymentTermsDays` days (fallback `0` days — due on
receipt — when the supplier has no `paymentTermsDays`). Initialize
`amountPaid = 0` and
`settlementStatus = 'unpaid'` on every created invoice. `approveSupplierInvoice`
is unchanged — approval only gates payability; it moves no money.

## UI (all surfaces held to the design system)

**Design-system rules (binding on every component):** ShadCN from ui-kit /
`@/components/ui/*`, icons from `@ultranos/ui-kit/icons`; semantic oklch tokens
only (`bg-card`, `text-foreground`, `text-muted-foreground`,
`bg-success/10 text-success`, `bg-warning/10 text-warning`, `text-destructive`,
`ring-border`) — **no hardcoded hex/raw oklch**; money in `font-numeric`; RTL
logical properties (`ms-*`/`me-*`, `text-start`/`text-end`); `EmptyState` for
empty/loading; OPD list-page and detail-page layout standards.

- **Payables list** `/inventory/payables` — list-page standard: standalone `<h1>`,
  one toolbar row (wide `SearchInput` over supplier name + the primary nav), one
  content box (`overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px]
  ring-border/50`). Columns: supplier, outstanding (`font-numeric`), aging
  summary (small buckets or an "overdue" chip when `ninetyPlus`/`sixtyDay > 0`
  → `warning`/`destructive` token), oldest due date, invoice count. Row → account
  detail. `EmptyState` inside the box when nothing is owed. Sidebar "Payables"
  sub-item under Inventory (`nav-config.ts`).
- **Supplier account detail** `/inventory/payables/[supplierId]` — detail-page
  standard: `w-fit` ghost back button, standalone `<h1>` (supplier name), a header
  card with total outstanding + aging buckets. **Record payment** primary action
  → dialog: enter lump-sum amount + method + optional reference; on amount change
  show the **FIFO allocation preview** (which invoices, how much each, any
  leftover blocked); confirm calls `recordSupplierPayment`. Below: an unpaid-invoice
  table (invoice #, total, amountDue `font-numeric`, dueDate, overdue chip) and a
  payments table (date, amount, method, status; **void** action → reason dialog →
  `voidSupplierPayment`; voided rows shown muted/struck).
- **Invoice detail** (extend `SupplierInvoiceDetailPage.tsx`) — add a settlement
  panel (amountPaid / amountDue / `settlementStatus` badge) and, for
  `approved` + not `paid`, a **Record payment** action (single-invoice; amount
  defaults to `amountDue`, editable for partial) plus a payments-for-this-invoice
  list.
- **New invoice** (extend `NewSupplierInvoicePage.tsx`) — a `dueDate` field
  defaulted from the selected supplier's `paymentTermsDays` (editable).
- **Supplier edit form** — add a `paymentTermsDays` numeric field. *(The plan
  verifies whether a supplier create/edit surface exists; if none does, this
  field is deferred and `dueDate` remains editable at capture, so the feature is
  still complete.)*
- i18n: all strings across `messages/{en,ar,prs,ps}.json` (new `supplierPayments`
  / `payables` namespace + `sidebar.payables`).

## Errors & Edge Cases

- Pay a non-approved (pending/disputed) invoice → `InvoiceNotApprovedError`; UI
  never offers "Record payment" for such invoices.
- Allocation `amount > amountDue` for any invoice → `OverpaymentError`; the
  single-invoice form caps at `amountDue`, the FIFO preview blocks a lump sum
  that exceeds total outstanding ("amount exceeds outstanding").
- Void an already-void payment → throws; the void action is hidden on voided rows.
- FIFO with zero unpaid invoices → empty allocation; UI shows nothing owed.
- Legacy v18 invoices → v19 upgrade backfills `amountPaid=0`/
  `settlementStatus='unpaid'`/`dueDate=createdAt`; reads also default defensively.
- Partial payments accumulate (`amountPaid` grows; `settlementStatus`
  `unpaid → partial → paid`).
- Integer minor units everywhere; `Math.round` for any derived money.
- **No PHI in logs/errors** — money + opaque ids only (supplier/invoice/payment
  are operational, non-PHI).

## Testing

- **Pure `allocateFifo`:** exact fill; partial last invoice; single invoice;
  lump sum exceeding total (reports `unapplied`); ordering strictly by `dueDate`
  then `invoiceNumber`; skips already-paid.
- **Pure `ap-invoice`:** `computeAmountDue` clamp; `computeSettlementStatus`
  transitions (0 paid → unpaid, partial, full → paid, overpay-clamped → paid).
- **Aging reuse:** unpaid invoices bucketed off `dueDate`; a not-yet-due invoice
  lands in `current` (asserts the future-date behavior / clamp).
- **`supplier-payment-service`:** single-invoice payment (amounts, status,
  sync enqueue); multi-invoice FIFO payment; partial payment leaves `partial`;
  `InvoiceNotApprovedError` on pending/disputed target; `OverpaymentError` on
  over-allocation; `voidSupplierPayment` restores `amountPaid`/status + enqueues;
  void-of-void throws.
- **`supplier-account-service`:** `getSupplierPayables` roll-up (outstanding +
  aging) excludes paid and disputed invoices; `getSupplierAccount` invoice/payment
  lists + ordering.
- **UI:** payables list renders outstanding + aging; account-detail record-payment
  FIFO preview + confirm; invoice-detail settlement panel + single pay; dueDate
  capture defaulting; payment void flow; **RTL snapshot** of the aging/payables
  table.
- **Compliance:** attribution (`paidBy`/`voidedBy`) recorded; no PHI in logs.

## Out of Scope (later)

- Credit notes / debit notes and the dispute-settlement workflow (Phase 3).
- Supplier statement import & reconciliation.
- Supplier credit-limit enforcement / blocking on over-limit.
- Cash-drawer reconciliation for cash outflows.
- Multi-currency, landed cost, per-issue COGS.

## Affected Files (indicative)

- `src/lib/procurement/types.ts` — `SupplierInvoice` settlement fields;
  `Supplier.paymentTermsDays`; `SupplierPayment`/`SupplierPaymentAllocation`/
  method + status types.
- `src/lib/db.ts` — v19 block (`supplierPayments` store, `supplierInvoices`
  re-declare + backfill upgrade).
- `src/lib/procurement/ap-invoice.ts` — `computeAmountDue`/`computeSettlementStatus`.
- `src/lib/procurement/ap-allocation.ts` — pure `allocateFifo`.
- `src/lib/procurement/supplier-payment-service.ts` — record/void/query +
  `InvoiceNotApprovedError`/`OverpaymentError`.
- `src/lib/procurement/supplier-account-service.ts` — derived payables/account.
- `src/lib/procurement/supplier-invoice-service.ts` — `createSupplierInvoice`
  gains `dueDate` + settlement init.
- `src/components/pharmacy/procurement/SupplierPayablesPage.tsx` — payables list.
- `src/components/pharmacy/procurement/SupplierAccountDetailPage.tsx` — account
  detail + record payment + void.
- `src/components/pharmacy/procurement/SupplierInvoiceDetailPage.tsx` — settlement
  panel + single pay (extend).
- `src/components/pharmacy/procurement/NewSupplierInvoicePage.tsx` — dueDate
  field (extend).
- `src/app/[locale]/(app)/inventory/payables/{page,[supplierId]/page}.tsx` — routes.
- `src/components/sidebar/nav-config.ts` — Payables nav item.
- Supplier edit form (if present) — `paymentTermsDays` field.
- `messages/{en,ar,prs,ps}.json` — new strings.
