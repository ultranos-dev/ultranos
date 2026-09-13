# Lab-Order Row Enrichment, Edit & Lock — Design

**Date:** 2026-09-12
**Status:** Approved (design), pending implementation
**Area:** opd-lite (encounter page lab-order section), hub-api (new read endpoint), shared-types

## Goal

On the encounter-details page, the lab-test rows a doctor adds after ordering a
test should (1) display the same level of detail as the enriched prescription
rows, (2) be editable by the ordering doctor, and (3) become **read-only once a
lab has started work** on the order.

## Background (ground truth, verified)

- Lab orders are FHIR `ServiceRequest` resources created locally in OPD-Lite
  (`lab-order-store.addLabOrder` → `lab-order-mapper.mapInputToServiceRequest`),
  persisted to Dexie `db.serviceRequests`, and pushed to the Hub via the generic
  sync queue. OPD-Lite is **push-only** for ServiceRequests today.
- The current pending-row UI (`LabOrderEntry.tsx`) shows only the test name and a
  non-routine priority label. Everything else the enrichment needs is already on
  the resource: LOINC `code`, `reasonCode`, `_ultranos.specialInstructions`,
  `performer` (assigned lab), `priority`, `status`.
- When a lab claims an order, `lab.acknowledgeOrder` (hub-api) sets
  `service_requests.status = 'on-hold'`, `received_at`, `received_by_lab_id`,
  `received_by_tech_id`, and bumps `meta_last_updated`. The shared `_ultranos`
  type already models `receivedAt` / `receivedByLabId` / `receivedByTechId`.
- **Gap:** OPD-Lite never pulls ServiceRequests back, so its local copy is frozen
  at `status: 'active'` and cannot know the lab started. `sync.pull` deliberately
  omits ServiceRequest. A lock therefore requires a new read path.
- `ctx.supabase` in hub-api is a shared (service-role) client — **no RLS
  auto-scoping**; endpoints scope explicitly. `service_requests.requester_id`
  holds the resolved `practitioners.id` (sync resolves auth-sub → practitioner FK
  on push via `resolvePractitionerId`). The caller's `ctx.user.practitionerId` is
  the auth sub, so the new endpoint resolves it the same way before scoping.
- The prescription row is the enrichment reference: full medication name (bold),
  brand/manufacturer pill, dosage text, fulfilment/interaction status chips, and a
  remove action (`encounter-dashboard.tsx` pending-prescriptions block).

## Decisions (confirmed)

1. **Edit UI:** reuse the existing `LabOrderEntry` form in an edit mode
   (pre-filled), not inline-row or modal editing. One form for add + edit (DRY).
2. **Lock signal:** a lightweight Hub read endpoint (`serviceRequest.getOrderStatus`)
   fetched on encounter load — **not** wiring ServiceRequest into `sync.pull`.
3. **Offline behaviour:** use last-known status. Editable unless the last synced
   status already says started (`on-hold`); Tier-2 timestamp-wins reconciles any
   divergence on reconnect.

## Architecture

Three layers, built in order. Layer 1 is display-only; Layer 2 adds local edit;
Layer 3 adds the Hub status signal that powers the lock.

### Layer 1 — Enriched row (opd-lite, display-only)

New pure helper in `lab-order-mapper.ts`:

```ts
export interface LabOrderDisplay {
  testName: string            // code.text ?? code.coding[0].display
  code?: string               // code.coding[0].code (LOINC)
  category?: string           // LAB_TEST_CATALOG lookup by code
  priority: LabOrderPriority   // defaults 'routine'
  reason?: string             // reasonCode[0].text
  specialInstructions?: string // _ultranos.specialInstructions
  note?: string               // note[0].text
  labName?: string            // performer.display
  status: string              // FHIR status
  locked: boolean             // isLabOrderLocked(sr)
}
export function readLabOrderDisplay(sr: FhirServiceRequest): LabOrderDisplay
export function isLabOrderLocked(sr: FhirServiceRequest): boolean
```

`isLabOrderLocked(sr) = sr.status !== 'active' || !!sr._ultranos.receivedAt`.

`LabOrderEntry` renders each row from this view model, mirroring the prescription
row's density: test name (bold) + LOINC code (muted); a category badge; a
priority badge shown **always**, colour-coded (`stat`/`asap` → `destructive`,
`urgent` → `warning`, `routine` → muted); reason and special-instructions muted
sub-lines; the assigned-lab pill; and a status badge (Layer 3).

### Layer 2 — Edit via the existing form (opd-lite)

Mapper gains a pure update helper that preserves identity/provenance and the lab
assignment, replacing only the editable clinical fields:

```ts
export function applyInputToServiceRequest(
  existing: FhirServiceRequest,
  input: LabOrderInput,
): FhirServiceRequest   // keeps id, authoredOn, _ultranos.createdAt, performer,
                        // received*; replaces code/priority/reasonCode/note/
                        // specialInstructions; bumps meta.versionId + fresh HLC
```

Store gains `updateLabOrder(id, input)`:
- Guard: if the current order `isLabOrderLocked`, throw (defence in depth).
- Build via `applyInputToServiceRequest`, `db.serviceRequests.put`, enqueue an
  `update` sync action (hlcTimestamp from the fresh HLC), audit `UPDATE`
  `SERVICE_REQUEST`, replace the order in `pendingOrders`.

`LabOrderEntry` gains `editingId` state. "Edit" on an unlocked row loads its
fields into the form, flips the submit button to "Update order", and shows a
"Cancel edit" affordance; submit routes to `updateLabOrder` vs `addLabOrder`.
The encounter-wide lab picker is untouched — editing changes the test itself, not
the per-encounter assigned lab.

### Layer 3 — Lock signal (hub-api + opd-lite)

**Hub — new `serviceRequest` router, `getOrderStatus`:**

```ts
getOrderStatus: protectedProcedure
  .input(z.object({ ids: z.array(z.string().uuid()).min(1).max(100) }))
  .query(async ({ ctx, input }) => {
    const practitionerId = await resolvePractitionerId(
      ctx.supabase, ctx.user.practitionerId ?? ctx.user.sub, new Map())
    if (!practitionerId) return []
    const { data, error } = await ctx.supabase
      .from('service_requests')
      .select('id, status, received_at, received_by_lab_id')
      .in('id', input.ids)
      .eq('requester_id', practitionerId)   // caller sees only orders they authored
    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
    // READ audit (Rule #6): operational status only, no clinical content, no names
    return (data ?? []).map(toLabOrderStatus)
  })
```

Returns `LabOrderStatus[]` = `{ id, status, receivedAt?, receivedByLabId? }`. No
clinical fields → no data-minimization concern; scoping to `requester_id` means a
doctor only ever learns the status of orders they created. `resolvePractitionerId`
is promoted from `sync.ts` to a shared helper (or exported) and reused. Register
the router in `_app.ts` as `serviceRequest`.

**OPD-Lite:**
- `trpc.ts`: `fetchLabOrderStatuses(ids): Promise<LabOrderStatus[]>` — GET
  `serviceRequest.getOrderStatus`, Supabase auth header, returns `[]` on any
  failure (offline-first; never throws into the UI).
- `lab-order-store.ts`:
  - `loadOrders` broadens its keep-filter from `status === 'active'` to
    `['active','on-hold'].includes(status)` so started orders stay visible but
    locked; `completed`/`revoked` still drop out.
  - `refreshLabOrderStatuses(ids?)`: fetches statuses, **merges forward-only**
    (only apply a changed status; set `_ultranos.receivedAt/receivedByLabId`),
    persists to Dexie (so a later offline reload keeps the lock), updates
    `pendingOrders`. Does **not** enqueue a sync and does **not** bump versionId —
    this reflects Hub truth inbound, it is not a local edit.
  - `applyLabToPending` skips locked (on-hold) orders — the encounter-wide lab
    re-assignment must not rewrite an order a lab already started.
- `LabOrderEntry`: after `loadOrders`, when online, call `refreshLabOrderStatuses`
  for the pending ids. Locked rows hide Edit/Cancel and show an "In progress"
  status badge; unlocked rows show Edit + Cancel.

## Data flow

Create / edit → local Dexie + push `update`/`create` (existing path). Encounter
load → `loadOrders` (Dexie) → `refreshLabOrderStatuses` (Hub, online) → forward-
only merge → render with per-row lock.

## Error handling

- `getOrderStatus` fetch fails / offline → `fetchLabOrderStatuses` returns `[]`;
  rows keep their last-known (Dexie) status and lock state. No blocking, no throw.
- `updateLabOrder` on a locked order → store guard throws; the UI already hides
  Edit for locked rows (defence in depth).
- PHI: logs carry shapes/counts only — never test names, reasons, or patient ids.

## Testing (TDD)

- **mapper:** `readLabOrderDisplay` (category lookup by code, priority default,
  reason/instructions/lab passthrough, locked flag); `isLabOrderLocked` (active =
  false; on-hold = true; receivedAt present = true); `applyInputToServiceRequest`
  (identity/performer/createdAt preserved, fields replaced, version bumped).
- **store:** `updateLabOrder` happy path (fields change, version bump, sync
  enqueued, audit emitted); rejects when locked; `refreshLabOrderStatuses`
  forward-only merge (active→on-hold applies; never downgrades; sets received*);
  `loadOrders` keeps active + on-hold; `applyLabToPending` skips on-hold.
- **Hub:** `getOrderStatus` returns status rows for the caller's own orders;
  scopes out other practitioners' orders; empty/again input handled; resolves
  practitioner ref.
- **component:** row renders enriched fields; Edit loads the form and Update
  routes to `updateLabOrder`; a locked row hides Edit/Cancel and shows the status
  badge; offline status-fetch failure leaves rows editable.

## Files

- `packages/shared-types/src/fhir/service-request.schema.ts` — add `LabOrderStatus`
  interface; export via barrel. Rebuild package.
- `apps/hub-api/src/trpc/routers/service-request.ts` — new router (`getOrderStatus`).
- `apps/hub-api/src/trpc/routers/sync.ts` — export/relocate `resolvePractitionerId`.
- `apps/hub-api/src/trpc/routers/_app.ts` — register `serviceRequest` router.
- `apps/hub-api/src/__tests__/service-request-status.test.ts` — new.
- `apps/opd-lite/src/lib/lab-order-mapper.ts` — display + lock + update helpers.
- `apps/opd-lite/src/stores/lab-order-store.ts` — update + refresh + loadOrders +
  applyLabToPending guard.
- `apps/opd-lite/src/lib/trpc.ts` — `fetchLabOrderStatuses`.
- `apps/opd-lite/src/components/clinical/LabOrderEntry.tsx` — enriched rows, edit
  mode, lock UI, status refresh.
- `apps/opd-lite/messages/{en,ar,prs,ps}.json` — edit/status/field keys.
- opd-lite test files for mapper, store, and component.

## Out of scope

- Wiring ServiceRequest into the bidirectional `sync.pull` engine.
- Any change to Lab-Lite or the `lab.acknowledgeOrder` flow.
- A tombstone/soft-delete pass for deactivated directory entries (tracked
  separately, shared with the pharmacy picker).
