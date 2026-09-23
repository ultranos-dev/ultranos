# Story 57.4: Inventory Deduction Integrity & Silent Check-Degradation Surfacing

Status: ready-for-dev

## Story

As a pharmacist,
I want stock deduction to be transactionally correct (no expired-batch dispensing, no silently-swallowed failures, no lost concurrent decrements) and every degraded safety-check dimension to be visibly surfaced,
so that the inventory ledger matches reality and I always know when a check ran on partial data.

## Acceptance Criteria

1. **Given** a dispense deducts stock, **when** `deductStock` runs, **then** the quantity read-check-write happens INSIDE the Dexie transaction (no TOCTOU between tabs), and concurrent decrements cannot produce lost updates or unnoticed negative stock.
2. **Given** FEFO batch selection, **when** batches are evaluated, **then** expired batches (`expiryDate <= today`) are excluded by the predicate itself — not only by the expiry watchdog having run — and a batch that cannot cover the required quantity triggers an explicit partial-coverage flow rather than silently returning any batch with >0 units.
3. **Given** stock deduction throws during fulfillment, **when** the dispense completes, **then** the failure is NOT swallowed — a persistent "Stock not decremented — manual adjustment required" warning is shown and a reconciliation task is enqueued/visible.
4. **Given** the active-medications dimension of the dispense interaction check cannot load (offline/no token/error), **when** the confirmation modal renders, **then** it shows "Active-medication check unavailable" as a warning/override-requiring state — never an implicit clear from an empty list.
5. **Given** a legacy queue entry lacking structured dosage, **when** the queue view reconstructs it, **then** dosage is displayed as UNKNOWN/incomplete — never fabricated (`qty:1, unit:'tablet', dur:7`) as if authoritative.
6. **Zero regression:** normal dispensing with sufficient in-date stock, the existing interaction-check flow with loaded active meds, stock receiving/count flows, and all pre-existing tests pass unchanged; `pnpm typecheck` passes; no feature or functionality is removed or degraded.

## Tasks / Subtasks

- [ ] **Task 1: Transactional deduction** (AC: 1)
  - [ ] 1.1 `apps/pharmacy-lite/src/lib/inventory/stock-service.ts:19-53`: move the quantity check + `newQty` computation inside the transaction; use relative decrement semantics; guard negative results with an explicit error state.
- [ ] **Task 2: FEFO correctness** (AC: 2)
  - [ ] 2.1 `lib/inventory/fefo.ts:8-21`: add `expiryDate > today` to the predicate; replace the >0-units fallback with a typed `insufficientCoverage` result the caller must handle (partial-batch dispensing UX decision documented in code).
- [ ] **Task 3: Unswallow deduction failure** (AC: 3)
  - [ ] 3.1 `stores/fulfillment-store.ts:204-206` (`catch { /* should not block */ }`): keep dispensing unblocked (clinical priority) but surface a persistent warning and write a reconciliation record (new small Dexie table or flag on the dispense) listed on the inventory page.
- [ ] **Task 4: Active-med degradation surfacing** (AC: 4)
  - [ ] 4.1 `lib/active-medications.ts:10-27`: return `{ meds, complete: boolean }`; `DispensingConfirmationModal.tsx:50-53` renders the incomplete state as a warning requiring acknowledgment/override, mirroring the UNAVAILABLE pattern.
- [ ] **Task 5: No fabricated dosage** (AC: 5)
  - [ ] 5.1 `components/pharmacy/PrescriptionQueueView.tsx:76-86`: mark reconstructed dosage `unknown: true`; fulfillment UI renders it as requiring pharmacist confirmation/entry.
- [ ] **Task 6: Tests + regression verification** (AC: all)
  - [ ] 6.1 Tests: concurrent deduction (two tx) → no lost update; expired batch never selected; insufficient coverage → typed result; deduction failure → warning + reconciliation record; active-med incomplete → warning state; legacy dosage → unknown flag.
  - [ ] 6.2 Full pharmacy suite; manual dispense happy path; `pnpm typecheck`.

## Dev Notes

### Audit Findings Addressed

- **M-PHARM-1, M-PHARM-2 (cluster), M-PHARM-6** (audit §6): deductStock TOCTOU; FEFO expired-batch + coverage fallback with swallowed throw → dispense completes with no ledger entry (silent inventory drift); active-med dimension silently vanishes; fabricated dosage presented as authoritative.

### Architecture

- Clinical priority stands: inventory problems must WARN, not block a dispense (the audit agrees) — the fix is visibility + reconciliation, not blocking.
- Do not touch `stock-count-service` absolute-set semantics (correct for counts); the concurrent-dispense-during-count guard is noted in the audit as Low #37 — in scope only if trivial.
- Coordinate with Story 57.2's override UX so "acknowledge partial check" reuses the same modal patterns.

### Zero-Regression Mandate

This story must introduce **zero regression in existing features and functionality**. Sufficient-stock, in-date, fully-loaded-data dispensing flows are pixel- and behavior-identical apart from the corrected ledger writes. All pre-existing tests pass; `pnpm typecheck` clean.

### Project Structure Notes

**Files to modify:** `lib/inventory/stock-service.ts`, `lib/inventory/fefo.ts`, `stores/fulfillment-store.ts`, `lib/active-medications.ts`, `DispensingConfirmationModal.tsx`, `PrescriptionQueueView.tsx`.
**New files:** `src/__tests__/stock-deduction-concurrency.test.ts`, `src/__tests__/fefo-expiry.test.ts`.

### References

- [Source: docs/system-audit-2026-09-23.md#6-pharmacy-lite-appspharmacy-lite] — M-PHARM-1/2/6
- [Source: apps/pharmacy-lite/src/lib/inventory/expiry-watchdog.ts] — current (insufficient-alone) expiry protection

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

### Change Log
