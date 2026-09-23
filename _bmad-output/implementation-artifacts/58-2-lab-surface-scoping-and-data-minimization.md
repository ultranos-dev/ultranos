# Story 58.2: Lab Surface Scoping & Data-Minimization Closure

Status: ready-for-dev

## Story

As a privacy officer,
I want every lab-facing surface scoped to the calling lab and trimmed to the documented field tiers — dispense monitoring lab-scoped and medication-stripped, unassigned orders no longer broadcast, DTOs trimmed, and national IDs never transported in URLs,
so that the API-layer enforcement of Rule #7 has no remaining leaks around its edges.

## Acceptance Criteria

1. **Given** `lab.pullDispenseMonitoringEvents`, **when** a lab pulls, **then** results are scoped to that lab's assigned/monitored patients (no platform-wide feed), and the payload carries the monitoring REQUIREMENT (LOINC test + due window) — not `medicationDisplay`/`atcCode` (medication identity stripped server-side). Lab-lite's `monitoringFlags` table and DTO are updated to match and added to PHI cleanup.
2. **Given** an order not yet received by any lab, **when** labs pull orders or request order patient details, **then** access follows a claim/targeting model — an unclaimed order's patient details are NOT readable by every lab (`getOrderPatientDetails` requires the order be claimed-by/targeted-to the caller).
3. **Given** `lab.verifyPatient` with a National ID query, **when** the client calls it, **then** the ID travels in a POST body — never a GET query string — and hub logging of tRPC inputs for this procedure is redacted.
4. **Given** lab-lite's `PatientSearchResult` DTO and local search mapping, **then** `gender` and `phone` are removed from list-surface shapes (`firstName` + `age` + opaque ref only); gender needed for reference ranges comes from the sanctioned detail tier (Rule #7 amended to include it there — see Dev Notes).
5. **Given** every lab-facing procedure, **then** a per-endpoint output-schema test asserts the EXACT allowed field set, so future field additions fail CI (data-min contract tests).
6. **Zero regression:** the lab order pipeline (pull → ack → collect → result), identity verification, and dispense-monitoring workflow all continue to function for legitimately scoped labs; all pre-existing tests pass; `pnpm typecheck` passes; no feature or functionality is removed or degraded beyond the deliberate scoping changes above.

## Tasks / Subtasks

- [ ] **Task 1: Dispense monitoring** (AC: 1)
  - [ ] 1.1 Hub `lab.ts:2090-2101`: add lab scoping (assignment model: monitoring events for patients with orders at this lab, or an explicit monitoring-assignment table — document choice); strip medication identity from the DTO (`packages/shared-types/src/monitoring.ts:17-27`).
  - [ ] 1.2 lab-lite: update `pullDispenseMonitoringEvents` (`lib/trpc.ts:685-713`), `monitoringFlags` schema (`db.ts:666-687`), and UI copy; add `monitoringFlags` to `phi-cleanup.ts` PHI_TABLES (coordinates with Story 58.3).
- [ ] **Task 2: Unassigned-order scoping** (AC: 2)
  - [ ] 2.1 Hub `lab.ts:1937-1939` (`received_by_lab_id = labId OR NULL`) and `:713` (details rejection only when assigned elsewhere): introduce claim-before-details (or explicit lab targeting on order creation — check what OPD's order flow supports); unclaimed orders appear in lists with the minimal tier only and details unlock on claim/receive.
- [ ] **Task 3: National ID transport** (AC: 3)
  - [ ] 3.1 lab-lite `lib/trpc.ts:114-125`: switch `verifyPatient` to POST (tRPC mutation or POST-mode query); hub-side input-logging redaction for this procedure.
- [ ] **Task 4: DTO trimming** (AC: 4)
  - [ ] 4.1 lab-lite `trpc.ts:482-488` (`gender`, `phone` on PatientSearchResult) and `hooks/usePatientSearch.ts:7-14,63-64` (local phone/gender mapping): trim to tier. Result-entry gender sourcing (`enter/page.tsx:115-118` reads a local full-patient record) moves to the detail-tier fetch; amend CLAUDE.md Rule #7 to add gender to the sanctioned detail tier (needed for reference ranges).
  - [ ] 4.2 Review `verified_patients.fatherName` (`db.ts:230-237`) — father name IS in the sanctioned detail tier (full name = given/father/grandfather); keep but ensure it is populated only via the detail endpoint and cleaned up on session end.
- [ ] **Task 5: Data-min contract tests** (AC: 5)
  - [ ] 5.1 New hub test file asserting exact output field sets for `pullOrders`, `verifyPatient`, `getOrderPatientDetails`, `pullDispenseMonitoringEvents` (allowlist, fails on any added key).
- [ ] **Task 6: Regression verification** (AC: 6)
  - [ ] 6.1 Full hub lab router + lab-lite order/result sync suites; manual: order pull → claim → details → result submit; `pnpm typecheck`.

## Dev Notes

### Audit Findings Addressed

- **H-HUB-3/C-LAB-1** (platform-wide medication-bearing dispense events), **H-HUB-4** (unassigned-order broadcast), **H-LAB-5** (photo/gender/phone/national-ID transport — photo handled in Story 58.1), **M-LAB-1 area** (local gender sourcing), audit §3/§5, plus §10 Theme 6 ("enforced at the query, leaked at the edges").

### Architecture

- The blind-ref R1 convention (bare vs `Patient/`-prefixed) is working — don't disturb `lib/patient-ref.ts` handling.
- Order claim model must respect offline labs: claims can queue like acks do; details unlock after a successful claim round-trip (online action, acceptable — verification is an online-adjacent workflow already).
- Coordinate with Epic 52 stories (52-1 pharmacy medication monitoring flags) — the monitoring feature's product intent is preserved; only the payload minimization and scoping change.

### Zero-Regression Mandate

This story must introduce **zero regression in existing features and functionality**. The lab pipeline, monitoring alerts (with minimized payloads), and verification all keep working; only over-broad access is removed. All pre-existing tests pass (update only those asserting the old over-broad shapes); `pnpm typecheck` clean.

### Project Structure Notes

**Files to modify:** hub `lab.ts`, `packages/shared-types/src/monitoring.ts`, lab-lite `lib/trpc.ts`, `lib/db.ts` (schema bump), `hooks/usePatientSearch.ts`, `results/[sampleId]/enter/page.tsx`, `phi-cleanup.ts`, CLAUDE.md Rule #7.
**New files:** `apps/hub-api/src/__tests__/lab-datamin-contract.test.ts`.

### References

- [Source: docs/system-audit-2026-09-23.md#3-hub-api-appshub-api] — H-HUB-3/4/5
- [Source: docs/system-audit-2026-09-23.md#5-lab-lite-appslab-lite] — C-LAB-1, H-LAB-5
- [Source: apps/hub-api/src/trpc/routers/lab.ts:675-770] — tier-model endpoint

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

### Change Log
