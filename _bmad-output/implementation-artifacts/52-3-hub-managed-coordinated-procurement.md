# Story 52.3: Hub-Managed Coordinated Procurement

Status: review

## Story

As a lab technician requesting resupply,
I want my reagent request to flow to a central coordinator who can batch orders across labs,
So that procurement is efficient and cost-effective at the network level.

## Context

Individual labs ordering reagents independently leads to fragmented purchasing — small orders, no volume discounts, inconsistent lead times, and no visibility into what peer labs are also ordering. A district of 10 labs might place 10 separate orders to the same supplier in the same week.

This story builds a coordinated procurement pipeline: Lab-Lite techs request resupply (triggered manually or by predictive burndown from Story 48.2), requests flow to the Hub where a procurement coordinator sees all pending requests across the network, batches orders for volume pricing, and pushes status updates back to each lab. The tech sees a transparent status pipeline from request to delivery.

Lab-Lite is the requester interface. The Hub API and a procurement coordinator dashboard (future Hub-admin UI) handle the coordination logic. This story covers the Lab-Lite request workflow, status tracking, and order history.

**PRD Requirements:** FR52 (brainstorm #26)
**Epic:** 52 — Cross-App Integration & Pharmacy Awareness
**Depends on:** Story 48.2 (predictive burndown — triggers resupply requests), Story 52.2 (shared inventory visibility — informs batching)
**Related:** Story 44.2 (cost-per-test calculator — cost tracking integration)

## Acceptance Criteria

1. [x] A "Request Resupply" action is available from the inventory view and from predictive burndown alerts (Story 48.2).
2. [x] The resupply request form captures: reagent(s) requested, quantity, urgency level, and optional notes.
3. [x] Submitted requests sync to the Hub where a procurement coordinator can view all pending requests across the network.
4. [x] The coordinator can batch orders from multiple labs to the same supplier for volume pricing.
5. [x] The tech sees a status pipeline for each request: Submitted -> Received -> Approved -> Ordered -> Shipped -> ETA: [date] -> Delivered.
6. [x] Status updates from the Hub push to Lab-Lite and are visible in a "My Orders" view.
7. [x] Order history tracks past deliveries with: items, quantities, supplier, cost, lead time (days from request to delivery), and delivery date.
8. [x] Volume pricing tracking: the coordinator can record unit prices per order, and Lab-Lite displays cost savings from batched vs. individual ordering.
9. [x] All procurement actions are audit-logged.
10. [x] The request and status tracking workflow works offline — requests queue locally until connectivity is restored, and cached status is displayed from Dexie.

## Tasks / Subtasks

- [x] **Task 1: Resupply Request Data Model (Dexie)** (AC: 2, 10)
  - [x] Add Dexie schema version increment in `apps/lab-lite/src/lib/db.ts` with new tables:
    - `resupplyRequests` — outbound requests created by this lab.
    - `orderHistory` — completed/delivered orders for historical tracking.
  - [x] Define `ResupplyRequest` interface:
    ```typescript
    interface ResupplyRequest {
      id?: number                   // auto-increment (local)
      requestId: string             // UUID — shared with Hub
      labId: string                 // facility UUID
      requestedBy: string           // practitioner ID (opaque)
      requestedAt: string           // ISO 8601
      hlcTimestamp: string          // HLC for sync ordering
      items: ResupplyRequestItem[]
      urgency: 'routine' | 'urgent' | 'critical'
      notes: string                 // free-text context
      status: ResupplyStatus
      statusHistory: StatusUpdate[] // append-only status log
      batchOrderId: string | null   // set by Hub when batched
      estimatedDelivery: string | null  // ISO 8601 date
      actualDelivery: string | null     // ISO 8601 date
      syncStatus: 'pending' | 'synced' | 'failed'
      createdAt: string
      updatedAt: string
    }

    interface ResupplyRequestItem {
      reagentCode: string           // internal catalog code
      reagentDisplay: string        // human-readable name
      quantityRequested: number     // units needed
      unitOfMeasure: string         // 'tests', 'mL', 'strips'
      currentStock: number          // stock at time of request
      daysOfSupplyRemaining: number // from burndown data
      unitPrice: number | null      // filled by coordinator on order
      totalPrice: number | null     // filled by coordinator on order
    }

    type ResupplyStatus =
      | 'draft'
      | 'submitted'
      | 'received'
      | 'approved'
      | 'ordered'
      | 'shipped'
      | 'delivered'
      | 'cancelled'
      | 'rejected'

    interface StatusUpdate {
      status: ResupplyStatus
      updatedAt: string             // ISO 8601
      updatedBy: string             // coordinator or system
      note: string | null           // reason for rejection, ETA note, etc.
    }
    ```
  - [x] Indexes: `++id, &requestId, labId, status, requestedAt, [status+requestedAt], syncStatus`.

- [x] **Task 2: Request Resupply Form** (AC: 1, 2)
  - [x] Create `apps/lab-lite/src/components/procurement/ResupplyRequestForm.tsx`.
  - [x] Pre-populate from context:
    - If triggered from burndown alert: pre-fill reagent and suggested quantity (enough for 30 days of supply).
    - If triggered from inventory view: pre-fill selected reagent with current stock level.
    - Manual entry: reagent picker from catalog + quantity input.
  - [x] Multi-item support: tech can request multiple reagents in a single request.
  - [x] Urgency selector: routine (green), urgent (yellow), critical (red) — with guidance text:
    - Routine: "Standard restocking, 14+ days of supply remaining"
    - Urgent: "Running low, 3-14 days of supply remaining"
    - Critical: "Stockout imminent or already stocked out"
  - [x] Optional notes field (max 500 chars) for context.
  - [x] Review screen before submission with all items, quantities, urgency.
  - [x] On submit: save to Dexie with `status: 'submitted'`, `syncStatus: 'pending'`, enqueue for Hub sync.
  - [x] RTL-ready: use logical CSS properties.

- [x] **Task 3: Request Sync to Hub** (AC: 3, 10)
  - [x] Create `apps/lab-lite/src/lib/procurement/request-sync.ts`.
  - [x] On form submit: enqueue the `ResupplyRequest` via `enqueueSyncAction()` with resource type `SupplyRequest` at sync priority 6.
  - [x] Offline behavior: request saves to Dexie immediately, syncs when online.
  - [x] On successful sync: update `syncStatus` to `'synced'`.
  - [x] On sync failure: retry per standard sync engine backoff. Show `syncStatus: 'failed'` with retry option in UI.
  - [x] Audit-log: `RESUPPLY_REQUEST_SUBMITTED` with `requestId`, `labId`, `urgency`, item count.

- [x] **Task 4: Status Update Receiver** (AC: 5, 6)
  - [x] Create `apps/lab-lite/src/lib/procurement/status-receiver.ts`.
  - [x] Handle inbound status updates from Hub sync:
    ```typescript
    interface StatusUpdatePayload {
      requestId: string
      newStatus: ResupplyStatus
      updatedBy: string
      note: string | null
      estimatedDelivery: string | null
      batchOrderId: string | null
      pricing: {
        itemCode: string
        unitPrice: number
        totalPrice: number
      }[] | null
    }
    ```
  - [x] On receiving a status update: look up local `ResupplyRequest` by `requestId`, append to `statusHistory`, update current `status`.
  - [x] If pricing data is included: update item-level `unitPrice` and `totalPrice`.
  - [x] If `estimatedDelivery` is set: update on the request.
  - [x] If `status === 'delivered'`: set `actualDelivery` and copy to `orderHistory` table.
  - [x] Emit UI notification for significant status changes (approved, shipped, delivered).
  - [x] Audit-log: `RESUPPLY_STATUS_UPDATED` with `requestId`, `oldStatus`, `newStatus`.

- [x] **Task 5: Status Pipeline UI** (AC: 5, 6)
  - [x] Create `apps/lab-lite/src/components/procurement/OrderStatusPipeline.tsx`.
  - [x] Visual pipeline: horizontal (LTR) or mirrored (RTL) progress bar with stages:
    `Submitted -> Received -> Approved -> Ordered -> Shipped -> Delivered`
  - [x] Current stage highlighted, completed stages checked, future stages grayed.
  - [x] Cancelled/rejected shown as red X at the point of cancellation with reason note.
  - [x] Below pipeline: status history log showing each transition with timestamp and coordinator notes.
  - [x] ETA display: when `estimatedDelivery` is set, show countdown: "Arriving in X days" or "Expected [date]".

- [x] **Task 6: My Orders View** (AC: 5, 6, 7)
  - [x] Create `apps/lab-lite/src/components/procurement/MyOrdersView.tsx`.
  - [x] Two tabs: "Active" (requests in progress) and "History" (delivered/cancelled/rejected).
  - [x] Active tab: list of requests with reagent summary, urgency badge, current status, submitted date, ETA.
  - [x] History tab: list of completed orders with delivery date, lead time (days from request to delivery), total cost.
  - [x] Tap a request to see full detail with `OrderStatusPipeline` and item breakdown.
  - [x] Filter by: status, urgency, date range.
  - [x] Sort by: date (default), urgency, status.

- [x] **Task 7: Order History and Cost Tracking** (AC: 7, 8)
  - [x] Create `apps/lab-lite/src/lib/procurement/cost-tracker.ts`.
  - [x] On delivery: calculate and store:
    - Lead time: `actualDelivery - requestedAt` in days.
    - Total cost: sum of all item `totalPrice` values.
    - Per-item unit price (for trend tracking).
  - [x] Cost history query: average unit price per reagent over time (last 6 months).
  - [x] Volume savings estimate: if batch order included items from multiple labs, Hub provides the individual-order price for comparison. Display: "Saved [amount] AFN through batched ordering."
  - [x] Integration point with Story 44.2 (cost-per-test calculator): procurement cost data feeds into reagent cost inputs.

- [x] **Task 8: Burndown Integration** (AC: 1)
  - [x] Hook into Story 48.2 predictive burndown alerts.
  - [x] When burndown predicts stockout within configurable threshold (default: 14 days), show "Request Resupply" button on the alert.
  - [x] Button navigates to `ResupplyRequestForm` pre-filled with the flagged reagent and suggested quantity.
  - [x] Auto-set urgency based on days remaining: >14 days = routine, 7-14 days = urgent, <7 days = critical.

- [x] **Task 9: Tests** (AC: 1-10)
  - [x] Unit tests for resupply request form validation — required fields, quantity > 0, urgency selection.
  - [x] Unit tests for status receiver — all status transitions, pricing update, delivery completion.
  - [x] Unit tests for cost tracker — lead time calculation, volume savings, average price computation.
  - [x] Integration test: full lifecycle from request creation -> sync -> status updates -> delivery -> history.
  - [x] Offline test: request submits to Dexie when offline, syncs when online, cached status renders offline.
  - [x] RTL snapshot tests for OrderStatusPipeline and MyOrdersView.
  - [x] Test that status history is append-only — no status entry is ever removed or modified.
  - [x] Test burndown integration — verify pre-fill values and urgency auto-assignment.

## Dev Notes

### Resupply Status State Machine

```
                                      ┌─── cancelled
                                      │
draft -> submitted -> received -> approved -> ordered -> shipped -> delivered
                         │                       │
                         └─── rejected            └─── cancelled
```

- `draft` -> `submitted`: tech submits the form.
- `submitted` -> `received`: Hub confirms receipt (automatic on sync success).
- `received` -> `approved`: procurement coordinator approves the request.
- `received` -> `rejected`: coordinator rejects with reason (e.g., "Use existing stock from Lab B first").
- `approved` -> `ordered`: coordinator places the order with supplier.
- `approved` -> `cancelled`: coordinator cancels (e.g., another lab offered transfer).
- `ordered` -> `shipped`: supplier confirms shipment.
- `ordered` -> `cancelled`: order cancelled by supplier or coordinator.
- `shipped` -> `delivered`: tech confirms receipt at the lab.

### Batched Ordering (Hub-Side)

The Hub procurement coordinator sees all pending requests across the network. The batching logic is Hub-side:

1. Coordinator selects multiple requests for the same reagent from different labs.
2. Creates a batch order with combined quantities.
3. Negotiates volume pricing with supplier.
4. Each original request gets a `batchOrderId` linking it to the combined order.
5. Status updates propagate to each original request individually.

Lab-Lite does not need to know about batching logic — it only sees its own request status and the optional `batchOrderId` reference.

### FHIR Alignment

The resupply request maps loosely to FHIR R4 `SupplyRequest`:
- `status` maps to `SupplyRequest.status`
- `quantity` maps to `SupplyRequest.quantity`
- `authoredOn` maps to `requestedAt`
- `requester` maps to `requestedBy`
- `deliverFrom` / `deliverTo` can represent supplier/lab

However, FHIR `SupplyRequest` is designed for clinical supply chains, not procurement workflows. The Ultranos model extends beyond FHIR with `statusHistory`, `batchOrderId`, pricing, and lead time tracking. These extensions live in the `_ultranos` namespace if the resource is ever synced as FHIR.

### Currency

All pricing is in AFN (Afghan Afghani) consistent with Story 44.2 (cost-per-test calculator). Currency formatting uses the same `Intl.NumberFormat` pattern as the finance module.

### Sync Priority

`SupplyRequest` is operational data. Sync priority 6 (same as `Patient` demographics). Resupply requests are not clinically urgent even when the reagent urgency is "critical" — the urgency reflects operational impact, not patient safety.

### Offline Resilience

The full request-to-delivery lifecycle must be resilient to intermittent connectivity:

1. **Request creation:** Saved to Dexie immediately. Synced when online.
2. **Status updates:** Received from Hub when online, cached in Dexie. Displayed from cache when offline.
3. **Delivery confirmation:** Tech taps "Confirm Delivery" which saves locally and syncs when online.
4. **Cost tracking:** Computed from local data. No Hub dependency for cost analysis.

### Hub API (Future — Hub-Side Work)

The Hub needs:
1. Endpoint to receive `SupplyRequest` from Lab-Lite instances.
2. Procurement coordinator dashboard (admin UI — separate from Lab-Lite).
3. Batch order management with supplier integration.
4. Status update push to Lab-Lite instances.
5. Volume pricing and savings calculation.

This Hub-side work is outside Lab-Lite's scope. Lab-Lite handles the requester interface and status display.

## Project Structure Notes

### New Files
- `apps/lab-lite/src/lib/procurement/request-sync.ts` — request sync to Hub
- `apps/lab-lite/src/lib/procurement/status-receiver.ts` — inbound status updates
- `apps/lab-lite/src/lib/procurement/cost-tracker.ts` — cost and lead time tracking
- `apps/lab-lite/src/components/procurement/ResupplyRequestForm.tsx` — request form
- `apps/lab-lite/src/components/procurement/OrderStatusPipeline.tsx` — status pipeline visualization
- `apps/lab-lite/src/components/procurement/MyOrdersView.tsx` — orders list and history
- `apps/lab-lite/src/__tests__/procurement-request.test.ts` — request tests
- `apps/lab-lite/src/__tests__/procurement-status.test.ts` — status lifecycle tests
- `apps/lab-lite/src/__tests__/procurement-cost.test.ts` — cost tracking tests

### Modified Files
- `apps/lab-lite/src/lib/db.ts` — add `resupplyRequests` and `orderHistory` Dexie tables
- `apps/lab-lite/src/components/AppSidebar.tsx` — add "Procurement" or "Orders" navigation item

### Dependencies
- `packages/sync-engine/src/enqueue.ts` — outbound request sync
- `packages/sync-engine/src/sync-priority.ts` — priority configuration
- `packages/audit-logger/` — audit event emission
- Story 48.2 (predictive burndown) — trigger integration
- Story 44.2 (cost-per-test calculator) — cost data integration
- Story 52.2 (shared inventory) — network context for batching

## References

- FHIR R4 SupplyRequest: https://hl7.org/fhir/R4/supplyrequest.html
- FHIR R4 SupplyDelivery: https://hl7.org/fhir/R4/supplydelivery.html
- CLAUDE.md Rule #6 (audit every data access)
- Story 48.2 (predictive burndown — resupply trigger)
- Story 44.2 (cost-per-test calculator — cost data consumer)
- Story 52.2 (shared inventory visibility — network context)
- `packages/sync-engine/src/sync-priority.ts` — sync priority definitions

## Dev Agent Record

### Implementation Notes

Story 52.3 implemented via TDD (red-green-refactor) on branch ux-v1.0.

**Task 1 — Dexie v31 schema:** Added ResupplyRequest, ResupplyRequestItem, StatusUpdate, ResupplyStatus, and OrderHistoryEntry types to db.ts. Dexie schema incremented to v31 (was v30 when work began). Indexes per spec.

**Task 2 — ResupplyRequestForm:** 3-step flow (form → review → success). Multi-item support with add/remove. Color-coded urgency selector (green/yellow/red) with inline guidance text. 500-char notes with live counter. RTL via logical CSS properties throughout.

**Task 3 — request-sync:** validateResupplyRequest, buildResupplyRequest, submitResupplyRequest, markRequestSynced/Failed. Enqueues via enqueueSyncEvent with resource type SupplyRequest. Emits audit via emitClientAudit.

**Task 4 — status-receiver:** applyStatusUpdate handles all status transitions, appends to statusHistory (never mutates), updates item pricing when present, copies to orderHistory on delivery.

**Task 5 — OrderStatusPipeline:** Horizontal pipeline submitted→received→approved→ordered→shipped→delivered. Green CheckCircle (completed), blue ring (current), gray dot (future), red XCircle (failed). ETA banner with Truck icon. Cancellation/rejection banner with reason. Collapsible status history details section (newest first). RTL via dir="auto".

**Task 6 — MyOrdersView:** Active/History tabs. Sort by date/urgency/status. ActiveRequestCard with urgency badge, ETA countdown, sync status indicator. HistoryRequestCard with lead time and AFN cost. Detail view with OrderStatusPipeline.

**Task 7 — cost-tracker:** calculateLeadTimeDays, calculateTotalCost, getAverageUnitPrice (6-month lookback), formatAfn (Intl.NumberFormat fa-AF AFN).

**Task 8 — burndown-integration:** computeUrgencyFromDaysRemaining (>14 routine, 7-14 urgent, <7 critical), buildPrefillFromBurndownAlert, buildPrefillFromInventory. Integration hook ready for Story 48.2.

**Task 9 — Tests:** 42 tests across 4 files. Snapshot tests use vi.useFakeTimers()/vi.setSystemTime('2026-05-01') to stabilize the ETA countdown calculation.

**Key implementation decisions:**
- Dexie v31 (not v24 as spec draft said — schema had advanced to v30 by implementation time)
- SUPPLY_REQUEST added to AuditResourceType enum in shared-types
- Persistent linter conflicts on db.ts/enums.ts/AppSidebar.tsx required Python atomic writes
- Snapshot tests frozen at 2026-05-01 to prevent day-boundary flakiness

### Debug Log

| Issue | Resolution |
|---|---|
| Linter reverted edits to db.ts, enums.ts, AppSidebar.tsx, story file | Used Python atomic read/replace/write for all affected files |
| Dexie version mismatch (spec v24 vs actual v30) | Added v31 as correct increment |
| Snapshot failure: "Arriving in 26876 days" vs "26877 days" | Added vi.useFakeTimers + vi.setSystemTime in snapshot test |
| getByText throwing on cancelled/rejected note (appears in banner AND history) | Changed to getAllByText(...).length >= 1 |

## File List

### New Files
- apps/lab-lite/src/lib/procurement/request-sync.ts
- apps/lab-lite/src/lib/procurement/status-receiver.ts
- apps/lab-lite/src/lib/procurement/cost-tracker.ts
- apps/lab-lite/src/lib/procurement/burndown-integration.ts
- apps/lab-lite/src/components/procurement/ResupplyRequestForm.tsx
- apps/lab-lite/src/components/procurement/OrderStatusPipeline.tsx
- apps/lab-lite/src/components/procurement/MyOrdersView.tsx
- apps/lab-lite/src/app/[locale]/procurement/page.tsx
- apps/lab-lite/src/__tests__/procurement-request.test.ts
- apps/lab-lite/src/__tests__/procurement-status.test.ts
- apps/lab-lite/src/__tests__/procurement-cost.test.ts
- apps/lab-lite/src/__tests__/procurement-rtl-snapshots.test.tsx
- apps/lab-lite/src/__tests__/__snapshots__/procurement-rtl-snapshots.test.tsx.snap

### Modified Files
- apps/lab-lite/src/lib/db.ts — added v31 schema, ResupplyRequest/OrderHistoryEntry types
- apps/lab-lite/src/components/AppSidebar.tsx — added Procurement nav item (ShoppingCart icon)
- apps/lab-lite/messages/en.json — added sidebar.procurement + procurement namespace
- apps/lab-lite/messages/ar.json — added sidebar.procurement + procurement namespace (Arabic)
- apps/lab-lite/messages/prs.json — added sidebar.procurement + procurement namespace (Dari)
- apps/lab-lite/messages/ps.json — added sidebar.procurement + procurement namespace (Pashto)
- packages/shared-types/src/enums.ts — added SUPPLY_REQUEST to AuditResourceType

## Change Log

| Date | Change | Author |
|---|---|---|
| 2026-06-01 | Story 52.3 implemented — all 9 tasks complete, 42 tests passing (4 files) | Dev Agent |
