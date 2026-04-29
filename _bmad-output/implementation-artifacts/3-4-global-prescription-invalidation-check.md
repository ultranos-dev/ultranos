# Story 3.4: Global Prescription Invalidation Check

Status: ready-for-dev

## Story

As a pharmacist,
I want to verify if a prescription has already been used,
so that I can prevent double-fulfillment and medication fraud.

## Acceptance Criteria

1. [ ] Scanning a prescription QR triggers a real-time status check against the Hub API.
2. [ ] The Hub returns the status: `AVAILABLE`, `FULFILLED`, or `VOIDED`.
3. [ ] If the status is not `AVAILABLE`, the UI blocks the fulfillment action with a clear error message.
4. [ ] The check fails safely: if offline, the pharmacist is warned that the status cannot be verified globally.
5. [ ] Successfully fulfilled prescriptions are immediately marked as `completed` on the Hub.

## Tasks / Subtasks

- [ ] **Task 1: Status Check tRPC Procedure** (AC: 1, 2)
  - [ ] Implement `getMedicationRequestStatus` query in `apps/hub-api`.
  - [ ] Query the `medication_requests` table in Supabase by resource ID.
- [ ] **Task 2: Pharmacy Scan Logic** (AC: 1, 3)
  - [ ] Implement the QR scanner in the Pharmacy application (or PWA view).
  - [ ] Call the tRPC status check procedure upon a successful scan.
- [ ] **Task 3: Fulfillment Status UI** (AC: 2, 3)
  - [ ] Display a "Prescription Valid" green banner or "Already Fulfilled" red banner.
  - [ ] Block the "Dispense" button if the status is not `AVAILABLE`.
- [ ] **Task 4: Real-time Invalidation** (AC: 5)
  - [ ] Implement `completeMedicationRequest` mutation in `apps/hub-api`.
  - [ ] Update the status to `completed` in the central DB upon pharmacist confirmation.

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

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
