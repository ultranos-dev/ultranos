# Story 55.4: Mentorship Pairing Management

Status: review

## Story

As a district health officer,
I want to pair experienced techs with junior techs for structured mentorship,
so that professional isolation is addressed across the network.

## Acceptance Criteria

1. New route `/mentorship` showing all active pairings in a table with columns: mentor name/email, mentee name/email, lab name (mentor's lab), start date, status badge (ACTIVE/DISSOLVED)
2. Create pairing: form to select a mentor (must be SUPERVISOR or LAB_MANAGER role), a mentee (any lab tech), set goals (text), and start date
3. Dissolve pairing with a reason code (COMPLETED, REASSIGNED, INACTIVE, OTHER) and optional notes, via confirmation modal
4. Dashboard summary section showing: total paired techs, unmatched techs count, average pairing duration, check-in completion rate (percentage)
5. Monthly check-in tracking: each pairing has monthly check-in records (COMPLETED or SKIPPED), viewable in pairing detail
6. Lab-Lite read-only endpoint that returns the mentorship pairing for the current authenticated user (mentor or mentee perspective)
7. All pairing creation, dissolution, and check-in updates emit audit events (action: CREATE/UPDATE, resourceType: MENTORSHIP)

## Tasks / Subtasks

- [x] Task 1: Create database migrations for `mentorship_pairings` and `mentorship_checkins` (AC: #1-5)
  - [x] Create migration `032_mentorship_pairings.sql` (next available after 031 from Story 55.3)
  - [x] `mentorship_pairings` table:
    ```sql
    CREATE TABLE mentorship_pairings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      mentor_practitioner_id UUID NOT NULL REFERENCES practitioners(id),
      mentee_practitioner_id UUID NOT NULL REFERENCES practitioners(id),
      lab_id UUID NOT NULL REFERENCES labs(id),  -- mentor's lab
      goals TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'DISSOLVED')),
      start_date DATE NOT NULL,
      dissolved_at TIMESTAMPTZ,
      dissolved_reason TEXT
        CHECK (dissolved_reason IS NULL OR dissolved_reason IN ('COMPLETED', 'REASSIGNED', 'INACTIVE', 'OTHER')),
      dissolved_notes TEXT,
      created_by UUID NOT NULL REFERENCES practitioners(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Prevent duplicate active pairings for the same mentee
    CREATE UNIQUE INDEX idx_mentorship_active_mentee
      ON mentorship_pairings (mentee_practitioner_id)
      WHERE status = 'ACTIVE';

    -- Index for listing by status
    CREATE INDEX idx_mentorship_status ON mentorship_pairings (status);
    ```
  - [x] `mentorship_checkins` table:
    ```sql
    CREATE TABLE mentorship_checkins (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      pairing_id UUID NOT NULL REFERENCES mentorship_pairings(id) ON DELETE CASCADE,
      month TEXT NOT NULL,  -- format: YYYY-MM
      status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('COMPLETED', 'SKIPPED', 'PENDING')),
      notes TEXT,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (pairing_id, month)
    );
    ```
  - [x] RLS policies: service role full access on both tables

- [x] Task 2: Create admin CRUD endpoints (AC: #1-3, #5, #7)
  - [x] Add to `apps/hub-api/src/trpc/routers/admin.ts`:
  - [x] `admin.listMentorshipPairings`:
    - Input: `{ statusFilter?: 'ACTIVE' | 'DISSOLVED' | 'ALL', cursor?: string, limit?: number }`
    - Join `mentorship_pairings` + `practitioners` (for mentor/mentee names) + `labs` (for lab name)
    - Look up emails via targeted `getUserById` per practitioner
    - Return paginated list with `{ items, nextCursor }`
  - [x] `admin.getMentorshipPairingDetail`:
    - Input: `{ pairingId: string }`
    - Return full pairing with check-in history
  - [x] `admin.createMentorshipPairing`:
    - Input: `{ mentorPractitionerId, menteePractitionerId, goals?, startDate }`
    - Validate mentor is SUPERVISOR or LAB_MANAGER (query `lab_technicians` for their role)
    - Validate mentee does not already have an ACTIVE pairing (enforced by unique index, but check first for better error message)
    - Look up mentor's lab_id from `lab_technicians`
    - Insert into `mentorship_pairings` with `created_by = ctx.user.id`
    - Emit audit event: CREATE, MENTORSHIP
    - Return created pairing
  - [x] `admin.dissolveMentorshipPairing`:
    - Input: `{ pairingId, reason: 'COMPLETED' | 'REASSIGNED' | 'INACTIVE' | 'OTHER', notes?: string }`
    - Update status to DISSOLVED, set dissolved_at, dissolved_reason, dissolved_notes
    - Emit audit event: UPDATE, MENTORSHIP, metadata `{ action: 'DISSOLVE', reason }`
    - Return updated pairing
  - [x] `admin.updateMentorshipCheckin`:
    - Input: `{ pairingId, month: string, status: 'COMPLETED' | 'SKIPPED', notes?: string }`
    - Upsert into `mentorship_checkins`
    - Emit audit event: UPDATE, MENTORSHIP, metadata `{ action: 'CHECKIN', month, status }`
  - [x] `admin.getMentorshipStats`:
    - Returns: `{ totalPaired, unmatchedTechs, avgPairingDurationDays, checkinCompletionRate }`
    - `totalPaired`: count of practitioners in ACTIVE pairings (both mentors and mentees)
    - `unmatchedTechs`: count of practitioners in `lab_technicians` NOT in any ACTIVE pairing
    - `avgPairingDurationDays`: average of `now() - start_date` for ACTIVE pairings + `dissolved_at - start_date` for DISSOLVED
    - `checkinCompletionRate`: `COMPLETED / (COMPLETED + SKIPPED)` from all checkins

- [x] Task 3: Create `lab.getMyMentorship` read-only endpoint for Lab-Lite (AC: #6)
  - [x] Add to `apps/hub-api/src/trpc/routers/lab.ts`
  - [x] Guard: `labRestrictedProcedure` (any authenticated lab user)
  - [x] Query `mentorship_pairings` where `mentor_practitioner_id = ctx.user.practitionerId OR mentee_practitioner_id = ctx.user.practitionerId` and `status = 'ACTIVE'`
  - [x] Join to get partner's name (first name only, data minimization)
  - [x] Return: `{ role: 'MENTOR' | 'MENTEE', partnerName, labName, goals, startDate, checkins: Array<{ month, status }> }` or `null` if no active pairing
  - [x] Emit audit event: READ, MENTORSHIP

- [x] Task 4: Create `/mentorship/page.tsx` with pairings list and dashboard stats (AC: #1, #4)
  - [x] Create `apps/admin-portal/src/app/mentorship/page.tsx`
  - [x] Use `'use client'` directive
  - [x] Dashboard stats cards at top (reuse card pattern from dashboard page):
    - "Paired Techs" (count)
    - "Unmatched Techs" (count, with warning color if > 0)
    - "Avg Duration" (formatted as "X months")
    - "Check-in Rate" (percentage with color: green > 80%, amber 50-80%, red < 50%)
  - [x] Filter bar: status tabs (All | Active | Dissolved)
  - [x] Pairings table with `bg-black` header:
    - Mentor (email truncated)
    - Mentee (email truncated)
    - Lab
    - Start Date
    - Status (badge: ACTIVE green, DISSOLVED gray)
  - [x] Row click: expand inline or navigate to detail view showing check-in history
  - [x] "Create Pairing" button (rounded-full, brand-lime accent) at top right
  - [x] Pagination (20 per page, cursor-based)

- [x] Task 5: Create pairing creation form with role validation (AC: #2)
  - [x] Modal or dedicated section for creating a new pairing
  - [x] Mentor selector: dropdown or search of practitioners with SUPERVISOR or LAB_MANAGER role
    - Fetch eligible mentors via a new `admin.listEligibleMentors` endpoint (query `lab_technicians` where `lab_role IN ('SUPERVISOR', 'LAB_MANAGER')`)
  - [x] Mentee selector: dropdown or search of all lab technicians
    - Exclude those with an existing ACTIVE pairing
  - [x] Goals: textarea
  - [x] Start date: date picker (defaults to today)
  - [x] Validation: mentor and mentee cannot be the same person
  - [x] On submit: call `trpc.admin.createMentorshipPairing.mutate()`
  - [x] Success: close modal, refresh pairings list
  - [x] Error: show validation message (e.g., "Mentor must be SUPERVISOR or LAB_MANAGER")

- [x] Task 6: Create dissolution modal with reason codes (AC: #3)
  - [x] "Dissolve" button on each ACTIVE pairing row
  - [x] Confirmation modal with:
    - Reason dropdown: COMPLETED, REASSIGNED, INACTIVE, OTHER
    - Optional notes textarea
    - "Dissolve Pairing" (red) and "Cancel" buttons
  - [x] On confirm: call `trpc.admin.dissolveMentorshipPairing.mutate()`
  - [x] Refresh pairings list on success

- [x] Task 7: Add "Mentorship" nav item to Sidebar.tsx
  - [x] Add entry `{ label: 'Mentorship', href: '/mentorship', icon: MentorshipIcon }` to Sidebar navItems
  - [x] Place after "Staff" (from Story 55.2) and before "Patients"
  - [x] Create a `MentorshipIcon` SVG component (handshake or people-connection icon)

- [x] Task 8: Write tests (AC: #1-7)
  - [x] Create `apps/hub-api/src/__tests__/mentorship.test.ts`
  - [x] Test: `admin.createMentorshipPairing` validates mentor is SUPERVISOR or LAB_MANAGER
  - [x] Test: `admin.createMentorshipPairing` rejects if mentee already has ACTIVE pairing
  - [x] Test: `admin.createMentorshipPairing` emits CREATE audit event
  - [x] Test: `admin.dissolveMentorshipPairing` sets status, reason, dissolved_at
  - [x] Test: `admin.dissolveMentorshipPairing` emits UPDATE audit event with reason
  - [x] Test: `admin.updateMentorshipCheckin` upserts correctly
  - [x] Test: `admin.getMentorshipStats` computes correct values
  - [x] Test: `lab.getMyMentorship` returns pairing for current user
  - [x] Test: `lab.getMyMentorship` returns null when no active pairing
  - [x] Test: non-ADMIN callers rejected on admin endpoints with FORBIDDEN
  - [x] Create `apps/admin-portal/src/__tests__/mentorship.test.tsx`
  - [x] Test: dashboard stats cards render with correct values
  - [x] Test: pairings table renders with correct columns
  - [x] Test: create pairing form validates mentor role
  - [x] Test: dissolution modal shows reason dropdown
  - [x] Test: status filter changes trigger re-fetch

## Dev Notes

### Dependencies
- **Requires Story 55.2** — for the "Staff" sidebar nav item placement and staff overview page
- **Requires Story 42.1** (completed) — LabRole enum, lab_technicians table with lab_role column

### Mentor eligibility
A mentor must have `lab_role` of SUPERVISOR or LAB_MANAGER in the `lab_technicians` table. The eligibility check is a query:
```sql
SELECT lt.practitioner_id, p.name, l.lab_name, lt.lab_role
FROM lab_technicians lt
JOIN practitioners p ON lt.practitioner_id = p.id
JOIN labs l ON lt.lab_id = l.id
WHERE lt.lab_role IN ('SUPERVISOR', 'LAB_MANAGER')
```

### Unique active pairing constraint
The partial unique index `idx_mentorship_active_mentee` on `(mentee_practitioner_id) WHERE status = 'ACTIVE'` ensures a mentee can only have one active pairing at a time. The application should check first for a better error message, but the index provides a safety net.

### Monthly check-in tracking
Check-ins are tracked by `YYYY-MM` month string. The system does not auto-generate check-in records; they are created on-demand when an admin marks a month as COMPLETED or SKIPPED. The check-in completion rate is calculated across all recorded check-ins (not including future/unrecorded months).

### Stats computation
```sql
-- totalPaired: distinct practitioners in ACTIVE pairings
SELECT COUNT(DISTINCT id) FROM (
  SELECT mentor_practitioner_id AS id FROM mentorship_pairings WHERE status = 'ACTIVE'
  UNION
  SELECT mentee_practitioner_id AS id FROM mentorship_pairings WHERE status = 'ACTIVE'
) t;

-- unmatchedTechs: technicians not in any active pairing
SELECT COUNT(*) FROM lab_technicians lt
WHERE lt.practitioner_id NOT IN (
  SELECT mentor_practitioner_id FROM mentorship_pairings WHERE status = 'ACTIVE'
  UNION
  SELECT mentee_practitioner_id FROM mentorship_pairings WHERE status = 'ACTIVE'
);
```

### Sidebar placement
Add "Mentorship" to `navItems` in `apps/admin-portal/src/components/Sidebar.tsx` after the "Staff" entry (added in Story 55.2) and before "Patients". The final nav order for the relevant section should be: Labs, Staff, Mentorship, Users, Patients.

### Audit events
Add `MENTORSHIP` to the ResourceType enum in `packages/shared-types/src/enums.ts` if not already present. All pairing lifecycle events (create, dissolve, check-in update) must emit audit events. The Lab-Lite read endpoint also emits a READ audit event.

### No i18n
All text hardcoded in English, consistent with existing Admin Portal patterns.

### Project Structure Notes

**Files to create:**
- `supabase/migrations/032_mentorship_pairings.sql` — tables + indexes + RLS
- `apps/admin-portal/src/app/mentorship/page.tsx` — mentorship dashboard and pairings list
- `apps/hub-api/src/__tests__/mentorship.test.ts` — API tests
- `apps/admin-portal/src/__tests__/mentorship.test.tsx` — UI tests

**Files to modify:**
- `apps/hub-api/src/trpc/routers/admin.ts` — add `listMentorshipPairings`, `getMentorshipPairingDetail`, `createMentorshipPairing`, `dissolveMentorshipPairing`, `updateMentorshipCheckin`, `getMentorshipStats`, `listEligibleMentors`
- `apps/hub-api/src/trpc/routers/lab.ts` — add `getMyMentorship`
- `apps/admin-portal/src/components/Sidebar.tsx` — add "Mentorship" nav item
- `packages/shared-types/src/enums.ts` — add `MENTORSHIP` to ResourceType if needed

### References

- [Source: apps/admin-portal/src/app/users/page.tsx] — table, filters, pagination pattern
- [Source: apps/admin-portal/src/app/dashboard/page.tsx] — stats cards pattern
- [Source: apps/admin-portal/src/app/labs/[labId]/page.tsx] — confirmation modal pattern
- [Source: apps/admin-portal/src/components/Sidebar.tsx:9-25] — navItems array
- [Source: apps/hub-api/src/trpc/routers/admin.ts:14-22] — `adminProcedure` middleware
- [Source: apps/hub-api/src/trpc/routers/lab.ts:1-4] — labRestrictedProcedure import pattern
- [Source: supabase/migrations/028_lab_technician_roles.sql] — lab_technicians table with lab_role
- [Source: packages/shared-types/src/enums.ts:192-210] — LabRole enum

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Debug Log References
- admin-router.test.ts has 1 pre-existing failure (dashboardStats mock expects old return shape before enrichments) — not a regression from this story

### Completion Notes List
- Migration 031_mentorship_pairings.sql applied to Supabase and committed to repo (next available after 030)
- Added MENTORSHIP to AuditResourceType enum in shared-types
- 7 admin CRUD endpoints added: listMentorshipPairings, getMentorshipPairingDetail, createMentorshipPairing, dissolveMentorshipPairing, updateMentorshipCheckin, getMentorshipStats, listEligibleMentors
- 1 Lab-Lite read-only endpoint: lab.getMyMentorship (returns partner first name only for data minimization)
- All pairing lifecycle events emit audit events (CREATE, UPDATE/DISSOLVE, UPDATE/CHECKIN, READ)
- Admin portal page at /mentorship with stats cards, pairings table, inline detail expand, create modal, dissolve modal
- Mentorship nav item with people-connection SVG icon added to Sidebar after Staff
- 10 hub-api unit tests passing (CRUD, audit events, RBAC enforcement, lab read endpoint)
- 7 admin-portal UI tests passing (stats cards, table columns, modals, filter re-fetch, empty state)

### File List
- supabase/migrations/031_mentorship_pairings.sql (new)
- packages/shared-types/src/enums.ts (modified — added MENTORSHIP to AuditResourceType)
- apps/hub-api/src/trpc/routers/admin.ts (modified — added 7 mentorship endpoints)
- apps/hub-api/src/trpc/routers/lab.ts (modified — added getMyMentorship endpoint)
- apps/admin-portal/src/app/mentorship/page.tsx (new)
- apps/admin-portal/src/components/Sidebar.tsx (modified — added Mentorship nav item + MentorshipIcon)
- apps/hub-api/src/__tests__/mentorship.test.ts (new)
- apps/admin-portal/src/__tests__/mentorship.test.tsx (new)

### Change Log
- 2026-05-30: Implemented Story 55.4 — full mentorship pairing management (DB, API, UI, tests)
