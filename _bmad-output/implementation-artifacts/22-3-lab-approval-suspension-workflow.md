# Story 22.3: Lab Approval & Suspension Workflow

Status: done

## Story

As a back-office reviewer,
I want to approve or suspend lab registrations,
so that only verified labs can upload diagnostic results.

## Acceptance Criteria

1. The Labs section of the admin portal displays a lab queue with pending and active lab registrations
2. Each queue entry shows: lab name, license reference, accreditation reference, technician name, registration date, current status
3. The reviewer can: Approve (PENDING → ACTIVE), Suspend (ACTIVE → SUSPENDED), or Reactivate (SUSPENDED → ACTIVE)
4. A new Hub API endpoint `admin.reviewLab` is created for ADMIN role only
5. Approval/suspension emits audit events and sends notifications to the lab technician
6. Suspended labs are immediately blocked from uploading by `enforceLabActive()` middleware on lab upload endpoints
7. The lab queue supports filtering by status: All, Pending, Active, Suspended
8. Each status transition requires a confirmation dialog with optional reason field
9. The lab detail view shows: lab registration documents, technician credentials, upload history summary, and current status with transition history

## Tasks / Subtasks

- [x] Task 1: Create Lab registration data model types
  - [x] Create `LabRegistration` interface in `packages/shared-types/src/fhir/lab-registration.ts`
  - [x] Fields: id, labName, licenseReference, accreditationReference (optional — ISO 15189), technicianId, technicianName, registeredAt, status (PENDING | ACTIVE | SUSPENDED), statusHistory (array of { status, changedBy, changedAt, reason? })
  - [x] Create `LabStatus` enum in `packages/shared-types/src/enums.ts`: PENDING, ACTIVE, SUSPENDED
  - [x] Export from `packages/shared-types/src/index.ts`

- [x] Task 2: Create Hub API lab admin endpoints (AC: #4, #5, #6)
  - [x] Add `admin.listLabs` — query with status filter, pagination (25 per page)
  - [x] Add `admin.getLabDetail` — returns full lab registration detail with status history and upload count
  - [x] Add `admin.reviewLab` — input: { labId, action: 'APPROVE' | 'SUSPEND' | 'REACTIVATE', reason?: string }
  - [x] On APPROVE: transition PENDING → ACTIVE, emit audit event, trigger notification to technician
  - [x] On SUSPEND: transition ACTIVE → SUSPENDED, emit audit event, trigger notification, invalidate active sessions
  - [x] On REACTIVATE: transition SUSPENDED → ACTIVE, emit audit event, trigger notification
  - [x] Reject invalid transitions (e.g., PENDING → REACTIVATE) with descriptive error
  - [x] All endpoints guarded by ADMIN role middleware

- [x] Task 3: Implement `enforceLabActive()` middleware (AC: #6)
  - [x] Middleware already exists at `apps/hub-api/src/trpc/middleware/enforceLabActive.ts`
  - [x] Already checks that the calling lab technician's lab has status `ACTIVE`
  - [x] Already returns `FORBIDDEN` for SUSPENDED or PENDING labs
  - [x] Already applied to `lab.uploadResult` and `lab.verifyPatient` endpoints
  - [x] Middleware runs AFTER auth check but BEFORE business logic

- [x] Task 4: Build lab queue list page (AC: #1, #2, #7)
  - [x] Create `apps/admin-portal/src/app/labs/page.tsx` — lab queue view
  - [x] Table columns: Lab Name, License Ref, Accreditation, Technician, Registered Date, Status
  - [x] Status badges: Pending (yellow), Active (green), Suspended (red)
  - [x] Filter tabs: All | Pending | Active | Suspended
  - [x] Pagination controls (25 per page)
  - [x] Click row to navigate to detail view

- [x] Task 5: Build lab detail view (AC: #3, #8, #9)
  - [x] Create `apps/admin-portal/src/app/labs/[labId]/page.tsx`
  - [x] Show: lab registration documents, technician credentials, upload history count, current status
  - [x] Status transition history timeline (who changed, when, reason)
  - [x] Action buttons based on current status:
    - PENDING: "Approve" (green), no suspend option
    - ACTIVE: "Suspend" (red)
    - SUSPENDED: "Reactivate" (blue)
  - [x] Confirmation dialog with optional reason text field before any action
  - [x] After action: refresh detail view with updated status and success toast

- [x] Task 6: Wire dashboard stats
  - [x] Update `admin.dashboardStats` to return `pendingLabCount` from database
  - [x] Wire the "Pending Lab Approvals" card on the dashboard to show live count

- [x] Task 7: Write tests
  - [x] Test `admin.listLabs` returns filtered, paginated results
  - [x] Test `admin.reviewLab` APPROVE transitions PENDING → ACTIVE with audit event
  - [x] Test `admin.reviewLab` SUSPEND transitions ACTIVE → SUSPENDED with audit event
  - [x] Test `admin.reviewLab` REACTIVATE transitions SUSPENDED → ACTIVE with audit event
  - [x] Test `admin.reviewLab` rejects invalid transitions (e.g., PENDING → REACTIVATE)
  - [x] Test `enforceLabActive()` blocks SUSPENDED lab from uploading results
  - [x] Test `enforceLabActive()` blocks PENDING lab from uploading results
  - [x] Test `enforceLabActive()` allows ACTIVE lab to upload results
  - [x] Test non-ADMIN callers rejected with FORBIDDEN
  - [x] Test lab queue page renders with correct columns and status badges
  - [x] Test confirmation dialog appears before status transitions

## Dev Notes

### Dependencies
- **Requires Story 22.1** (admin portal scaffold, ADMIN router, sidebar)
- Can be developed in **parallel with Story 22.4** (both need only the admin scaffold)

### Key Difference from KYC (Story 22.2)
Lab approval is simpler — no OCR extraction, no SLA countdown. It's a straightforward status machine: PENDING → ACTIVE ↔ SUSPENDED.

### `enforceLabActive()` Middleware Integration
This middleware must be applied to the existing lab router endpoints. Check `apps/hub-api/src/trpc/routers/lab.ts` for the `lab.uploadResult` and `lab.verifyPatient` procedures that need the guard.

### PRD References
- LAB-001: Lab registration with back-office verification within 3 business days
- LAB-002: Technician identity binding — each upload linked to logged-in technician
- PRD Section 5.4: Lab portal design philosophy — minimal surface area, data minimization

### Existing Infrastructure
- Lab router exists at `apps/hub-api/src/trpc/routers/lab.ts`
- Notification router exists for sending approval/suspension notifications
- Audit logger available for all status transition events

## Dev Agent Record

### Implementation Plan
- Task 1: Created `LabRegistration` and `LabStatusHistoryEntry` interfaces in shared-types. `LabStatus` enum already existed. Added audit actions (`LAB_APPROVED`, `LAB_SUSPENDED`, `LAB_REACTIVATED`), `LAB_REGISTRATION` resource type, and notification types to enums.
- Task 2: Added `admin.listLabs`, `admin.getLabDetail`, and `admin.reviewLab` endpoints to the admin router. Each validates transitions, emits audit events, sends notifications, and records status history.
- Task 3: `enforceLabActive()` middleware was already implemented in Story 12.1 and applied to lab upload endpoints. Verified it blocks PENDING and SUSPENDED labs correctly.
- Task 4: Built lab queue list page with table, status badges, filter tabs, pagination, and row click navigation.
- Task 5: Built lab detail page with registration documents, technician credentials, status history timeline, context-dependent action buttons, and confirmation dialog with optional reason field.
- Task 6: Wired `admin.dashboardStats` to query live `pendingLabApprovals` count from database. Updated dashboard page to fetch and display live stats with clickable Pending Lab Approvals card.
- Task 7: Wrote 17 hub-api tests and 9 admin-portal UI tests covering all ACs.

### Database Changes
- Created `lab_status_history` table via Supabase migration for tracking status transitions (append-only).

### Completion Notes
All 7 tasks complete. 26 new tests (17 hub-api + 9 admin-portal) all pass. No regressions introduced — pre-existing test failures in `auth-guard.test.tsx` and other test files are unrelated.

## File List

### New Files
- `packages/shared-types/src/fhir/lab-registration.ts` — LabRegistration and LabStatusHistoryEntry interfaces
- `apps/admin-portal/src/app/labs/page.tsx` — Lab queue list page
- `apps/admin-portal/src/app/labs/[labId]/page.tsx` — Lab detail view page
- `apps/hub-api/src/__tests__/lab-approval-workflow.test.ts` — Hub API tests (17 tests)
- `apps/admin-portal/src/__tests__/lab-approval.test.tsx` — Admin portal UI tests (9 tests)

### Modified Files
- `packages/shared-types/src/enums.ts` — Added LAB_APPROVED/SUSPENDED/REACTIVATED audit actions, LAB_REGISTRATION resource type, lab notification types
- `packages/shared-types/src/index.ts` — Added lab-registration export
- `apps/hub-api/src/trpc/routers/admin.ts` — Added listLabs, getLabDetail, reviewLab endpoints; wired live dashboardStats
- `apps/admin-portal/src/app/dashboard/page.tsx` — Converted to client component with live stats and clickable cards
- `apps/admin-portal/src/__tests__/dashboard.test.tsx` — Updated to match new client component (mocks useRouter and trpc)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Story status: in-progress → review

### Review Findings

- [x] [Review][Decision] **AC #9: Registration documents not linked — only text references shown** — Deferred: document storage is a scope expansion; references sufficient for current approval workflow
- [x] [Review][Patch] **AC #9: Status history `changedBy` — resolve UUID to reviewer name** — Fixed: joined practitioners in status history query, added `changedByName` to response and UI. [admin.ts, labs/[labId]/page.tsx]
- [x] [Review][Patch] **Strip `reason` from audit metadata to prevent PHI leak** — Fixed: removed reason from audit metadata; kept in `lab_status_history` only. [admin.ts]
- [x] [Review][Decision] **Offline-first: Admin portal exempted** — Back-office tool requires real-time DB state; online-only is acceptable
- [x] [Review][Patch] **TOCTOU race in `reviewLab` — no optimistic lock** — Fixed: added `.eq('status', transition.from)` to UPDATE with row count check; returns CONFLICT on race. [admin.ts]
- [x] [Review][Patch] **RTL: Hard-coded `border-l-4` and `border-l-2`** — Fixed: changed to `border-s-4` / `border-s-2`. [dashboard/page.tsx, labs/[labId]/page.tsx]
- [x] [Review][Patch] **`handleAction` clears dialog before error path** — Fixed: removed `setPendingAction(null)` from catch block; dialog preserved on error. [labs/[labId]/page.tsx]
- [x] [Review][Patch] **Dashboard silently swallows all errors** — Fixed: added `statsError` state and error banner. [dashboard/page.tsx]
- [x] [Review][Patch] **Hardcoded `en-US` locale in date formatting** — Fixed: changed to `undefined` (browser locale). [labs/page.tsx, labs/[labId]/page.tsx]
- [x] [Review][Patch] **No test assertion for notification insert on reviewLab** — Fixed: added notification assertion in APPROVE test. [lab-approval-workflow.test.ts]
- [x] [Review][Defer] **`reportAuthEvent` unauthenticated endpoint accepts caller-supplied `actorId`** [admin.ts:80-141] — deferred, pre-existing from Story 22.1
- [x] [Review][Defer] **In-process `rateLimitMap` bypassed under multi-instance/serverless deployment** [admin.ts:24-45] — deferred, pre-existing from Story 22.1
- [x] [Review][Defer] **`labRestrictedProcedure` uses `.single()` — technician with multiple labs causes 406** [rbac.ts:127] — deferred, pre-existing in rbac.ts

## Change Log

- 2026-05-15: Implemented Story 22.3 — Lab Approval & Suspension Workflow. Created shared types, Hub API endpoints (listLabs, getLabDetail, reviewLab), admin portal UI (lab queue page, lab detail page with confirmation dialogs), live dashboard stats, and comprehensive test coverage (26 tests).
