# Story 55.3: Employee Health & Vaccination Registry (Admin Surface)

Status: review

## Story

As an organization administrator,
I want to maintain each tech's occupational health record centrally,
so that vaccination status is instantly available during exposure incidents.

## Acceptance Criteria

1. New route `/staff/[practitionerId]/health` for viewing and editing an employee health record
2. Record fields: Hep B vaccination (status: NOT_STARTED | IN_PROGRESS | COMPLETE, titer date), tetanus (status, date), COVID (status, doses, last dose date), TB screening (date, result: NEGATIVE | POSITIVE | INDETERMINATE), exposure history (array of entries with date, type, outcome)
3. Health records encrypted at rest using field-level encryption via `@ultranos/crypto` (`encryptField` / `decryptField`)
4. Access-restricted: only the tech themselves, their lab manager, or an org admin can view the record
5. Screening reminders: display "TB screening due in 30 days" (or overdue) banner based on last TB screening date and a 12-month interval
6. Lab-Lite read-only API endpoint for emergency access during exposure incidents — returns ONLY vaccination status fields (Hep B status, tetanus status, COVID status), not full record (data minimization)
7. Audit event emitted on every health record access (action: READ) and modification (action: UPDATE), resourceType: EMPLOYEE_HEALTH

## Tasks / Subtasks

- [x] Task 1: Create database migration for `employee_health_records` table (AC: #2, #3)
  - [x] Create migration `032_employee_health_records.sql` (031 was taken by mentorship_pairings)
  - [x] Table schema with CHECK constraints for status enums, RLS, updated_at trigger
  - [x] The `exposure_history_encrypted` column stores the encrypted JSONB blob — decrypted only at the application layer via `@ultranos/crypto`
  - [x] Vaccination status fields (hep_b_status, tetanus_status, covid_status) are stored in plaintext for the emergency access endpoint (AC #6) — they contain no PHI, only enum values

- [x] Task 2: Create `admin.getEmployeeHealth` and `admin.updateEmployeeHealth` endpoints (AC: #1, #2, #4, #7)
  - [x] Add to `apps/hub-api/src/trpc/routers/admin.ts`
  - [x] `admin.getEmployeeHealth`: queries by practitioner_id, decrypts exposure history, computes screening reminders, emits READ audit event
  - [x] `admin.updateEmployeeHealth`: encrypts exposure history, upserts record, emits UPDATE audit event with changed fields list

- [x] Task 3: Create `lab.getEmergencyVaccinationStatus` endpoint for Lab-Lite (AC: #6)
  - [x] Add to `apps/hub-api/src/trpc/routers/lab.ts`
  - [x] Guard: `labRestrictedProcedure` with `enforceLabRole(LabPermission.VIEW_STAFF)`
  - [x] Verify target practitioner belongs to the same lab as the caller
  - [x] Query ONLY: `hep_b_status`, `tetanus_status`, `covid_status` (data minimization)
  - [x] Emit audit event with `{ accessType: 'EMERGENCY', scope: 'VACCINATION_STATUS_ONLY' }`
  - [x] Return: `{ hepBStatus, tetanusStatus, covidStatus }` or `null`

- [x] Task 4: Create `/staff/[practitionerId]/health` page with form (AC: #1, #2, #5)
  - [x] Create `apps/admin-portal/src/app/staff/[practitionerId]/health/page.tsx`
  - [x] Screening reminder banner (red for overdue, amber for due soon/not recorded)
  - [x] Form sections: Hepatitis B, Tetanus, COVID-19, TB Screening, Exposure History
  - [x] Save button, success/error toasts, back link to staff overview

- [x] Task 5: Implement screening reminder logic (AC: #5)
  - [x] Created `apps/hub-api/src/lib/screening-reminders.ts` with `computeScreeningReminders()`
  - [x] 12-month interval, 30-day DUE_SOON threshold
  - [x] Returns status, daysUntilDue/daysOverdue, message

- [x] Task 6: Write tests for encryption, access control, data minimization (AC: #3, #4, #6, #7)
  - [x] `apps/hub-api/src/__tests__/employee-health.test.ts` — 8 tests (admin endpoints)
  - [x] `apps/hub-api/src/__tests__/employee-health-lab.test.ts` — 5 tests (lab endpoint)
  - [x] `apps/hub-api/src/__tests__/screening-reminders.test.ts` — 5 tests (screening logic)
  - [x] `apps/admin-portal/src/__tests__/employee-health.test.tsx` — 8 tests (UI)
  - [x] All 26 tests pass

## Dev Notes

### Dependencies
- **Requires Story 55.2** — for the `/staff` page that links to `/staff/[practitionerId]/health`
- **Requires Story 42.1** (completed) — LabRole/LabPermission enums, enforceLabRole middleware

### Field-level encryption
Use the existing `@ultranos/crypto/server` module:
- `encryptField(plaintext: string, key: Buffer): string` — returns base64-encoded ciphertext
- `decryptField(ciphertext: string, key: Buffer): string` — returns plaintext
- Key retrieval: `getFieldEncryptionKeys()` from `apps/hub-api/src/lib/field-encryption.ts`

The encryption key is loaded from environment variables and is the same key used for patient PHI encryption. Only the `exposure_history` field needs encryption — it contains free-text descriptions of exposure incidents which could identify patients or incidents. Vaccination status enums (NOT_STARTED/IN_PROGRESS/COMPLETE) are not PHI and can be stored in plaintext, which also enables the emergency access endpoint to query them without decryption.

### Data minimization for Lab-Lite endpoint (CRITICAL)
The `lab.getEmergencyVaccinationStatus` endpoint MUST select only the three status columns:
```sql
SELECT hep_b_status, tetanus_status, covid_status
FROM employee_health_records
WHERE practitioner_id = $1
```
Do NOT use `SELECT *`. This follows the same data minimization principle as the lab patient verification endpoint (CLAUDE.md rule #7 extended to employee data).

### Access control model
- **Admin**: full read/write via `admin.getEmployeeHealth` / `admin.updateEmployeeHealth`
- **Lab Manager/Supervisor**: read-only vaccination status only via `lab.getEmergencyVaccinationStatus`
- **Tech self-access**: not in scope for this story (can be added as a Lab-Lite feature later)

### Audit logging
Every access to employee health records must be audited. Use a new resourceType `EMPLOYEE_HEALTH` (add to enums if not present). Follow the existing audit pattern:
```typescript
await AuditLogger.emit(ctx.supabase, {
  action: 'READ', // or 'UPDATE'
  resourceType: 'EMPLOYEE_HEALTH',
  resourceId: practitionerId,
  actorId: ctx.user.id,
  actorRole: ctx.user.role,
  sessionId: ctx.sessionId,
  metadata: { /* context-specific */ },
})
```

### Screening reminder logic
TB screening is due every 12 months. The reminder states:
- 0-30 days before due: "TB screening due in {n} days" (amber)
- Past due: "TB screening overdue by {n} days" (red)
- No record: "No TB screening recorded" (amber)
- Up to date: no banner shown

### Project Structure Notes

**Files to create:**
- `supabase/migrations/031_employee_health_records.sql` — table + RLS
- `apps/admin-portal/src/app/staff/[practitionerId]/health/page.tsx` — health record form page
- `apps/hub-api/src/__tests__/employee-health.test.ts` — API tests
- `apps/admin-portal/src/__tests__/employee-health.test.tsx` — UI tests

**Files to modify:**
- `apps/hub-api/src/trpc/routers/admin.ts` — add `getEmployeeHealth`, `updateEmployeeHealth`
- `apps/hub-api/src/trpc/routers/lab.ts` — add `getEmergencyVaccinationStatus`
- `packages/shared-types/src/enums.ts` — add `EMPLOYEE_HEALTH` to ResourceType enum if needed

### References

- [Source: packages/crypto/src/server-crypto.ts] — `encryptField` and `decryptField` functions
- [Source: apps/hub-api/src/lib/field-encryption.ts] — `getFieldEncryptionKeys()` for encryption key
- [Source: apps/hub-api/src/trpc/routers/lab.ts:827-884] — existing `listStaff` endpoint pattern
- [Source: apps/hub-api/src/trpc/routers/admin.ts:14-22] — `adminProcedure` middleware
- [Source: apps/hub-api/src/trpc/middleware/enforceLabRole.ts] — lab role enforcement middleware
- [Source: packages/shared-types/src/enums.ts:192-210] — LabRole, LabPermission enums
- [Source: apps/admin-portal/src/app/labs/[labId]/page.tsx] — page layout pattern with TopHeader

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Debug Log References
- Lab endpoint tests initially failed due to `labRestrictedProcedure` middleware querying `lab_technicians` with labs join — fixed by building a call-count-aware mock that returns different data for rbac middleware vs endpoint same-lab check.

### Completion Notes List
- Migration applied via Supabase MCP (`apply_migration`) and saved locally as `032_employee_health_records.sql` (031 was taken by `mentorship_pairings`)
- `EMPLOYEE_HEALTH` added to `AuditResourceType` enum in shared-types
- `encryptField`/`decryptField` used directly for `exposure_history_encrypted` (not the global `encryptRow` helper, since exposure history is not in the global `SENSITIVE_FIELDS` set)
- Lab endpoint enforces same-lab check by querying target practitioner's `lab_technicians` record
- All 26 new tests pass; no regressions introduced in existing test suites

### File List
**Created:**
- `supabase/migrations/032_employee_health_records.sql`
- `apps/hub-api/src/lib/screening-reminders.ts`
- `apps/admin-portal/src/app/staff/[practitionerId]/health/page.tsx`
- `apps/hub-api/src/__tests__/employee-health.test.ts`
- `apps/hub-api/src/__tests__/employee-health-lab.test.ts`
- `apps/hub-api/src/__tests__/screening-reminders.test.ts`
- `apps/admin-portal/src/__tests__/employee-health.test.tsx`

**Modified:**
- `apps/hub-api/src/trpc/routers/admin.ts` — added `getEmployeeHealth`, `updateEmployeeHealth` endpoints
- `apps/hub-api/src/trpc/routers/lab.ts` — added `getEmergencyVaccinationStatus` endpoint
- `packages/shared-types/src/enums.ts` — added `EMPLOYEE_HEALTH` to `AuditResourceType`

### Change Log
- 2026-05-30: Story 55.3 implemented — employee health registry with encrypted exposure history, admin CRUD, lab emergency read-only endpoint, screening reminders, 26 tests
