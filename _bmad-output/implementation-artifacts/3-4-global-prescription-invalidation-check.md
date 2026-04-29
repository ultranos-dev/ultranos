# Story 3.4: Global Prescription Invalidation Check

Status: done

## Story

As a pharmacist,
I want to verify if a prescription has already been used,
so that I can prevent double-fulfillment and medication fraud.

## Acceptance Criteria

1. [x] Scanning a prescription QR triggers a real-time status check against the Hub API.
2. [x] The Hub returns the status: `AVAILABLE`, `FULFILLED`, or `VOIDED`.
3. [x] If the status is not `AVAILABLE`, the UI blocks the fulfillment action with a clear error message.
4. [x] The check fails safely: if offline, the pharmacist is warned that the status cannot be verified globally.
5. [x] Successfully fulfilled prescriptions are immediately marked as `completed` on the Hub.

## Tasks / Subtasks

- [x] **Task 1: Status Check tRPC Procedure** (AC: 1, 2)
  - [x] Implement `getMedicationRequestStatus` query in `apps/hub-api`.
  - [x] Query the `medication_requests` table in Supabase by resource ID.
- [x] **Task 2: Pharmacy Scan Logic** (AC: 1, 3)
  - [x] Implement the QR scanner in the Pharmacy application (or PWA view).
  - [x] Call the tRPC status check procedure upon a successful scan.
- [x] **Task 3: Fulfillment Status UI** (AC: 2, 3)
  - [x] Display a "Prescription Valid" green banner or "Already Fulfilled" red banner.
  - [x] Block the "Dispense" button if the status is not `AVAILABLE`.
- [x] **Task 4: Real-time Invalidation** (AC: 5)
  - [x] Implement `completeMedicationRequest` mutation in `apps/hub-api`.
  - [x] Update the status to `completed` in the central DB upon pharmacist confirmation.

## Dev Notes

- **Fraud Prevention:** This is a "Cloud Gate". While prescriptions are signed offline, their *state* (used/unused) must be checked globally if a connection is available.
- **Sync:** If the pharmacist dispenses offline, the local `MedicationDispense` record is queued and will invalidate the request globally upon the next sync.

### Project Structure Notes

- API: `apps/hub-api/src/server/trpc/routers/medication.ts`
- Component: `apps/opd-lite-pwa/src/components/pharmacy/PrescriptionScanner.tsx`

### References

- Architecture: [architecture.md](../planning-artifacts/architecture.md#Prescription-Invalidation)
- PRD: [ultranos_master_prd_v3.md](../../docs/ultranos_master_prd_v3.md#FR10)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Pre-existing `shared-types` build error in `condition.schema.test.ts:90` (TS2532) — not related to this story's changes.

### Completion Notes List

- **Task 1**: Created `medication_requests` Supabase migration (005) with FHIR R4-aligned schema, indexes for QR code ID and patient lookups. Implemented `medicationRouter` with `getStatus` query that maps internal `PrescriptionStatus` to pharmacist-facing `AVAILABLE`/`FULFILLED`/`VOIDED` statuses. 10 unit tests covering happy paths, error codes, and input validation.
- **Task 2**: Added `html5-qrcode` dependency for camera-based QR scanning. Created `PrescriptionScanner` component with both camera and manual ID entry. Parses `SignedPrescriptionBundle` QR format to extract prescription IDs. Created `prescription-status-client.ts` for raw-fetch tRPC calls (same pattern as existing `trpc.ts`).
- **Task 3**: Implemented `StatusBanner` sub-component with green "Prescription Valid" banner for AVAILABLE and red "Already Fulfilled"/"Prescription Voided" banners for non-AVAILABLE. Dispense button is disabled and shows "Dispense Blocked" for non-AVAILABLE statuses.
- **Task 4**: Implemented `complete` mutation as a `protectedProcedure` (requires auth). Verifies current status is ACTIVE before transitioning to DISPENSED/completed. Returns CONFLICT error for already-fulfilled prescriptions. Records `dispensed_at` and `dispensed_by` fields.
- **AC 4 (offline safety)**: Network failures (TypeError/fetch errors) trigger a dedicated offline warning panel with amber styling, warning that "prescription status cannot be verified globally."
- All 461 tests pass across hub-api (45), opd-lite-pwa (390), and sync-engine (26). Zero regressions.

### File List

- `supabase/migrations/005_medication_requests.sql` (new)
- `apps/hub-api/src/trpc/routers/medication.ts` (new)
- `apps/hub-api/src/trpc/routers/_app.ts` (modified — added medicationRouter)
- `apps/hub-api/src/__tests__/medication.test.ts` (new)
- `apps/opd-lite-pwa/src/lib/prescription-status-client.ts` (new)
- `apps/opd-lite-pwa/src/components/pharmacy/PrescriptionScanner.tsx` (new)
- `apps/opd-lite-pwa/src/__tests__/prescription-status-client.test.ts` (new)
- `apps/opd-lite-pwa/src/__tests__/PrescriptionScanner.test.tsx` (new)
- `apps/opd-lite-pwa/package.json` (modified — added html5-qrcode)
- `pnpm-lock.yaml` (modified)

### Review Findings

- [x] [Review][Patch] **D1: `getStatus` endpoint is unauthenticated** — Changed to `protectedProcedure`. Client updated to pass auth token. [medication.ts:43] ✅ Fixed
- [x] [Review][Defer] **D2: Offline mode completely blocks pharmacist — no offline dispensing path** — Deferred to Epic 6 (sync-engine integration). Current blocking is the safest default for fraud prevention. [PrescriptionScanner.tsx:280-301]
- [x] [Review][Patch] **D3: No `interaction_check` validation during fulfillment** — Added BLOCKED and UNAVAILABLE guards to `complete` mutation. [medication.ts] ✅ Fixed
- [x] [Review][Patch] **P1: TOCTOU race condition — double-dispense possible** — Added `.eq('prescription_status', 'ACTIVE')` to UPDATE WHERE clause + race detection. [medication.ts:122-140] ✅ Fixed
- [x] [Review][Defer] **P2: No audit events on PHI access** — Deferred. `@ultranos/audit-logger` has no integration in hub-api yet (consistent with D5/D9/D23/D38). Address in Story 6-2.
- [x] [Review][Defer] **P3: QR signature never verified** — Deferred. Ed25519 verify function not yet wired. Address in dedicated security story.
- [x] [Review][Patch] **P4: No request timeout — UI can hang indefinitely** — Added `AbortSignal.timeout(15_000)` to all Hub API calls. [PrescriptionScanner.tsx] ✅ Fixed
- [x] [Review][Patch] **P5: Multi-prescription QR silently drops all but first** — Added amber warning banner showing count of additional prescriptions. [PrescriptionScanner.tsx] ✅ Fixed
- [x] [Review][Defer] **P6: `new Date()` instead of HLC timestamps** — Deferred. HLC generation not wired to hub-api server-side. Address with sync-engine integration.
- [x] [Review][Patch] **P7: No UUID validation on `prescriptionId`** — Added `.uuid()` to Zod schemas. [medication.ts] ✅ Fixed
- [x] [Review][Patch] **P8: Offline detection heuristic is fragile** — Added `isOfflineError()` helper with `navigator.onLine`, TypeError, and message-based checks. [PrescriptionScanner.tsx] ✅ Fixed
- [x] [Review][Defer] **W1: `created_at` column not in `_ultranos` namespace** [005_medication_requests.sql:43] — deferred, pre-existing naming convention across all migrations
- [x] [Review][Defer] **W2: FHIR Meta field naming (`meta_last_updated` vs `lastUpdated`)** [005_medication_requests.sql:40] — deferred, DB-layer naming convention consistent with existing tables

### Change Log

- 2026-04-29: Implemented Story 3.4 — Global Prescription Invalidation Check. Added medication_requests table, tRPC status check + completion endpoints, pharmacy QR scanner with offline safety, and fulfillment status UI with dispense blocking.
