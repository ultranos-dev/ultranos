# Lab-Order Row Enrichment, Edit & Lock — Implementation Plan

> **For agentic workers:** TDD throughout — failing test first, watch it fail, minimal code, green. Frequent commits are deferred to the user (no autonomous commits in this repo).

**Goal:** Enrich encounter lab-order rows, make them editable via the existing form, and lock them once a lab has started the order.

**Architecture:** Display-only enrichment + a local edit action + a new Hub read endpoint (`serviceRequest.getOrderStatus`) fetched on load to drive a per-row lock. No change to the bidirectional sync engine.

**Spec:** `docs/superpowers/specs/2026-09-12-lab-order-row-enrichment-edit-lock-design.md`

## Global Constraints

- PHI never in logs/errors/comments — status fetch logs shapes/counts only.
- ServiceRequest is Tier 2 (timestamp-wins); cancel/update mutate in place, both versions kept as addenda at the Hub.
- Audit every PHI access via `@ultranos/audit-logger` / local `auditPhiAccess`.
- Shared UI from `@ultranos/ui-kit`; semantic oklch tokens only; `destructive` = red is intentional for critical/urgent.
- `ctx.supabase` is service-role — scope the new endpoint explicitly by resolved `requester_id`.
- No migration (columns exist). No autonomous git commits.

---

### Task 1: shared-types `LabOrderStatus`

**Files:** Modify `packages/shared-types/src/fhir/service-request.schema.ts`; Test `packages/shared-types/src/__tests__/lab-order-status.test.ts`

**Produces:** `interface LabOrderStatus { id: string; status: string; receivedAt?: string; receivedByLabId?: string }`, exported via the fhir barrel.

- [ ] Test: object with id+status (and optional received fields) is assignable to `LabOrderStatus`; import resolves from `@ultranos/shared-types`.
- [ ] Add the interface after `LabDirectoryEntry`; build: `pnpm --filter @ultranos/shared-types build`.

---

### Task 2: Hub `serviceRequest.getOrderStatus`

**Files:** Create `apps/hub-api/src/trpc/routers/service-request.ts`; Modify `apps/hub-api/src/trpc/routers/sync.ts` (export `resolvePractitionerId`); Modify `apps/hub-api/src/trpc/routers/_app.ts` (register `serviceRequest`); Test `apps/hub-api/src/__tests__/service-request-status.test.ts`

**Consumes:** `resolvePractitionerId(supabase, ref, cache)` from sync.ts.
**Produces:** `serviceRequestRouter.getOrderStatus({ ids })` → `LabOrderStatus[]`.

- [ ] Export `resolvePractitionerId` from sync.ts (keep existing internal usage working).
- [ ] Test (mocked supabase): returns `{id,status,receivedAt,receivedByLabId}` rows for ids where `requester_id` = resolved caller; excludes rows with a different requester; returns `[]` when practitioner unresolved; emits a READ audit.
- [ ] Implement `getOrderStatus` (protectedProcedure, `ids` 1..100 uuids, `.in('id',ids).eq('requester_id',resolved)`, map via `toLabOrderStatus`, READ audit `SERVICE_REQUEST` with `{ orderCount }`).
- [ ] Register in `_app.ts`; run `pnpm -F hub-api test service-request-status`.

---

### Task 3: opd-lite mapper helpers

**Files:** Modify `apps/opd-lite/src/lib/lab-order-mapper.ts`; Test `apps/opd-lite/src/__tests__/lab-order-mapper.test.ts` (add describe blocks)

**Consumes:** `LAB_TEST_CATALOG` (for category), `FhirServiceRequest`, `hlc/serializeHlc`.
**Produces:** `readLabOrderDisplay(sr): LabOrderDisplay`, `isLabOrderLocked(sr): boolean`, `applyInputToServiceRequest(existing, input): FhirServiceRequest`.

- [ ] Tests: display view model (category resolved by code; priority default 'routine'; reason/specialInstructions/labName/code passthrough; locked flag). `isLabOrderLocked`: active→false, on-hold→true, receivedAt set→true. `applyInputToServiceRequest`: preserves id/authoredOn/_ultranos.createdAt/performer/received*; replaces code/priority/reasonCode/note/specialInstructions; versionId bumped; fresh hlcTimestamp.
- [ ] Implement the three helpers (pure; import catalog).

---

### Task 4: opd-lite store actions

**Files:** Modify `apps/opd-lite/src/stores/lab-order-store.ts`; Test `apps/opd-lite/src/__tests__/lab-order-store.test.ts` (add describe blocks)

**Consumes:** `applyInputToServiceRequest`, `isLabOrderLocked`, `fetchLabOrderStatuses` (Task 5 — stub/mock in tests).
**Produces:** `updateLabOrder(id, input)`, `refreshLabOrderStatuses(ids?)`; broadened `loadOrders`; guarded `applyLabToPending`.

- [ ] Tests: `updateLabOrder` replaces fields, bumps version, enqueues `update`, audits UPDATE, updates `pendingOrders`; throws when order locked. `refreshLabOrderStatuses` forward-only merge (active→on-hold applies, sets received*, persists to Dexie; does not enqueue; never downgrades on-hold→active). `loadOrders` keeps active + on-hold. `applyLabToPending` skips on-hold orders.
- [ ] Implement. `refreshLabOrderStatuses` imports `fetchLabOrderStatuses` lazily or via the trpc module (mockable in vitest).

---

### Task 5: opd-lite trpc client

**Files:** Modify `apps/opd-lite/src/lib/trpc.ts`

**Produces:** `fetchLabOrderStatuses(ids: string[]): Promise<LabOrderStatus[]>` — GET `serviceRequest.getOrderStatus`, Supabase auth header, `[]` on failure (mirror `searchLabsHub` exactly but POST-free GET with `{ ids }` input). Empty `ids` → `[]` without a request.

- [ ] Implement (no dedicated test file — covered via store mock + manual; type-only surface).

---

### Task 6: LabOrderEntry UI

**Files:** Modify `apps/opd-lite/src/components/clinical/LabOrderEntry.tsx`; Test `apps/opd-lite/src/__tests__/lab-order-entry.test.tsx` (new)

**Consumes:** store (`updateLabOrder`, `refreshLabOrderStatuses`), mapper (`readLabOrderDisplay`).

- [ ] Tests: enriched row shows code/category/priority/reason/lab; Edit on an unlocked row loads the form and submit calls `updateLabOrder`; a locked row hides Edit/Cancel and shows the status badge; `refreshLabOrderStatuses` invoked on load.
- [ ] Implement: `editingId` state, Edit/Cancel-edit wiring, submit routing, enriched rows from `readLabOrderDisplay`, locked-row badge, status refresh effect.

---

### Task 7: i18n keys

**Files:** Modify `apps/opd-lite/messages/{en,ar,prs,ps}.json` under `labOrder`.

- [ ] Add: `edit`, `updateOrder`, `cancelEdit`, `editAria`, `statusInProgress`, `statusReceived`, `lockedHint`, `codeLabel`, `categoryLabel`, `reasonLabel`, `instructionsLabel` (English values across all four, per the established pattern). Verify all four files parse.

---

### Task 8: Verification

- [ ] `pnpm -F shared-types build`; `pnpm -F opd-lite exec tsc --noEmit` (changed files clean).
- [ ] `pnpm -F hub-api test service-request-status` green.
- [ ] `pnpm -F opd-lite test` — full suite green (watch LabOrderEntry, store, mapper).
