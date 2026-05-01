# Story 12.2: Restricted Patient Verification

Status: done

## Story

As a lab technician,
I want to verify patient identity before uploading results,
so that I can confirm I'm attaching results to the correct patient without seeing their medical history.

## Context

This is the most security-sensitive story in the lab epic. The lab portal operates on a **push-only, data-minimized** model. Technicians verify patient identity via National ID or QR scan, but the API returns ONLY first name and age — never diagnoses, medications, allergies, encounter history, or any other clinical data. This constraint is enforced at the API layer (CLAUDE.md Rule #7), not the UI.

**PRD Requirements:** LAB-010 (Push-Only Patient Lookup), LAB-011 (QR Code Verification)

## Acceptance Criteria

1. [x] The Hub API exposes a `lab.verifyPatient` endpoint that returns **only** `{ firstName, age }` for a given patient identifier.
2. [x] The endpoint accepts lookup by National ID or patient QR code payload.
3. [x] The endpoint rejects requests from any role other than `LAB_TECH`.
4. [x] The API response schema is enforced at the tRPC router level — no additional patient fields can leak through.
5. [x] The lab-lite UI displays a patient verification card showing only first name and age.
6. [x] QR scanning is supported for patient identity verification.
7. [x] Verified patient context (an opaque `patientRef`) is passed to the upload workflow — the technician never sees the patient ID directly.
8. [x] All patient verification lookups emit audit events with technician ID, lookup method, and timestamp.

## Tasks / Subtasks

- [x] **Task 1: Data-Minimized Patient Lookup Endpoint** (AC: 1, 3, 4)
  - [x] Create `lab.verifyPatient` procedure in `hub-api/src/trpc/routers/lab.ts`.
  - [x] Input: `{ query: string, method: 'NATIONAL_ID' | 'QR_SCAN' }`.
  - [x] Output schema strictly typed: `{ firstName: string, age: number, patientRef: string }`.
  - [x] `patientRef` is an opaque reference (e.g., hashed patient ID) — NOT the raw patient ID.
  - [x] Enforce `LAB_TECH` role via middleware.
  - [x] **Critical:** The database query must SELECT only `given_name` and `birth_date`. Do NOT query other columns and filter in code — the minimization happens at the SQL level.

- [x] **Task 2: QR Patient Verification** (AC: 2, 6)
  - [x] Create `apps/lab-lite/src/components/PatientVerifyScanner.tsx`.
  - [x] Integrate `html5-qrcode` for camera-based QR scanning.
  - [x] Extract patient identifier from QR payload (same format as Health Passport QR).
  - [x] Submit to `lab.verifyPatient` endpoint.

- [x] **Task 3: Manual National ID Lookup** (AC: 2, 5)
  - [x] Create `apps/lab-lite/src/components/PatientVerifyForm.tsx`.
  - [x] Input field for National ID.
  - [x] Display verification card: first name + age only.
  - [x] "Confirm Patient" button to proceed to upload workflow.

- [x] **Task 4: Opaque Patient Reference** (AC: 7)
  - [x] Generate `patientRef` as HMAC-SHA256 of patient ID (same blind index approach as Story 7.3).
  - [x] Store `patientRef` in upload session context — technician never sees raw patient ID.

- [x] **Task 5: Audit Logging** (AC: 8)
  - [x] Emit audit event on every `lab.verifyPatient` call.
  - [x] Log: technician ID, lookup method, timestamp, success/failure.
  - [x] Do NOT log the patient's name or any PHI in the audit event.

## Dev Notes

### Security: Defense in Depth

The data minimization for lab is enforced at THREE levels:
1. **SQL query** — only SELECT `given_name` and `birth_date` from the patients table.
2. **tRPC output schema** — Zod schema rejects any fields beyond `firstName`, `age`, `patientRef`.
3. **RBAC middleware** — only `LAB_TECH` role can access this endpoint.

If any one layer fails, the other two still protect the data. This is intentional.

### The `patientRef` Pattern

The opaque `patientRef` is critical. When the technician uploads a result, the upload endpoint receives `patientRef` — not a raw patient ID. The Hub API resolves `patientRef` back to the actual patient internally. This means even if the lab-lite frontend is compromised, the technician cannot enumerate patient IDs.

### References

- PRD: LAB-010, LAB-011
- CLAUDE.md Rule #7 (data minimization — API layer enforcement)
- Story 7.3: Hub API Field-Level Encryption (blind index pattern)

## Dev Agent Record

### Implementation Plan

- **Task 1+4+5 (Backend):** Added `lab.verifyPatient` tRPC query to the lab router using `labRestrictedProcedure` (LAB_TECH RBAC) + `enforceLabActive` middleware. SQL-level data minimization: `SELECT id, given_name, birth_date` only. Opaque `patientRef` generated via `generateBlindIndex` (HMAC-SHA256) from `@ultranos/crypto/server`. Audit events emitted on both success and failure, with no PHI in audit payloads.
- **Task 2 (QR Scanner):** Created `PatientVerifyScanner.tsx` using `html5-qrcode` for camera-based scanning. Parses Health Passport QR format (`{ pid, iat, exp }`) and falls back to raw string as patient ID.
- **Task 3 (Manual Lookup):** Created `PatientVerifyForm.tsx` with National ID input, verification card (first name + age only), and "Confirm Patient" flow. `patientRef` is never displayed in the UI.
- **tRPC client:** Extended `apps/lab-lite/src/lib/trpc.ts` with `verifyPatient()` helper using raw fetch + Bearer JWT auth.

### Completion Notes

All 5 tasks implemented with defense-in-depth data minimization:
1. SQL layer: only `id`, `given_name`, `birth_date` queried
2. Zod output schema: strictly `{ firstName, age, patientRef }` — rejects extra fields
3. RBAC: `labRestrictedProcedure` (LAB_TECH only) + `enforceLabActive` (ACTIVE labs only)

Test coverage: 17 backend tests (hub-api), 13 frontend tests (lab-lite) — all passing. Zero regressions.

## File List

- `apps/hub-api/src/trpc/routers/lab.ts` — modified (added `verifyPatient` procedure)
- `apps/lab-lite/src/lib/trpc.ts` — modified (added `verifyPatient` client helper)
- `apps/lab-lite/src/components/PatientVerifyScanner.tsx` — new
- `apps/lab-lite/src/components/PatientVerifyForm.tsx` — new
- `apps/hub-api/src/__tests__/lab-verify-patient.test.ts` — new (17 tests)
- `apps/lab-lite/src/__tests__/patient-verify-form.test.tsx` — new (7 tests)
- `apps/lab-lite/src/__tests__/patient-verify-scanner.test.tsx` — new (6 tests)
- `apps/lab-lite/package.json` — modified (added `html5-qrcode` dependency)
- `pnpm-lock.yaml` — modified (lockfile update)

## Review Findings

- [x] [Review][Decision] QR expiry check added; signature verification deferred to D70/P3 (crypto infra not built). Resolved: add `exp` validation in scanner, defer `sig` verification.
- [x] [Review][Decision] ADMIN bypass accepted — consistent with cross-cutting pattern, ADMIN has broader access. Resolved: add test asserting ADMIN can call endpoint.
- [x] [Review][Patch] Client uses POST for tRPC `.query()` — fixed: switched to GET with URL-encoded input [apps/lab-lite/src/lib/trpc.ts:63]
- [x] [Review][Patch] Race condition: double-scan fires duplicate `verifyPatient` calls — fixed: added `processingRef` guard [apps/lab-lite/src/components/PatientVerifyScanner.tsx:26]
- [x] [Review][Patch] `birth_date` or `given_name` null → NaN age or Zod rejection crash — fixed: added null check before processing [apps/hub-api/src/trpc/routers/lab.ts:284]
- [x] [Review][Patch] Audit emit failure on success path kills entire request — fixed: made audit non-blocking with `.catch(() => {})` [apps/hub-api/src/trpc/routers/lab.ts:293]
- [x] [Review][Patch] `getFieldEncryptionKeys()` throws raw Error leaking env var names — fixed: wrapped in try/catch with generic message [apps/hub-api/src/trpc/routers/lab.ts:241]
- [x] [Review][Patch] Scanner auto-proceeds to upload without showing verification card — fixed: added verification card with Confirm/Try Again [apps/lab-lite/src/components/PatientVerifyScanner.tsx:50]
- [x] [Review][Patch] QR_SCAN: no UUID format validation on `input.query` — fixed: added UUID regex validation + BAD_REQUEST error [apps/hub-api/src/trpc/routers/lab.ts:250]
- [x] [Review][Defer] No rate limiting on `verifyPatient` endpoint — PHI enumeration risk via National ID brute-force. Pre-existing architectural gap. — deferred, pre-existing

## Change Log

- 2026-04-30: Implemented Story 12.2 — Restricted Patient Verification. Added `lab.verifyPatient` endpoint with 3-layer data minimization, QR scanner and manual National ID lookup UI, opaque patientRef via HMAC-SHA256, and audit logging. 30 tests added.
