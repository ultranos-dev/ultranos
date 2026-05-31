# Story 55.7: Lab Network & Outbreak Management

Status: review

## Story

As a provincial health officer,
I want to manage multi-branch lab networks and activate outbreak response mode from the Admin Portal,
so that network operations and emergency responses are coordinated.

## Acceptance Criteria

1. **Given** the admin navigates to `/network`, **when** the page loads, **then** they see all lab locations with operational status (ACTIVE/PENDING/SUSPENDED), pending sample count, stock level summary, and staffing count.
2. **Given** the network page renders, **when** the admin views the lab list, **then** each lab shows a status badge (ACTIVE=green, PENDING=amber, SUSPENDED=red) and key operational metrics.
3. **Given** the admin clicks "Activate Outbreak Mode", **when** they select affected labs, enter the target pathogen, and confirm, **then** an outbreak event is created with status ACTIVE and all selected labs receive a notification of type `OUTBREAK_MODE_ACTIVATED`.
4. **Given** outbreak mode is activated, **when** Lab-Lite users at affected labs log in, **then** they receive the outbreak mode notification via the existing notification system.
5. **Given** the admin needs to enroll community health workers, **when** they fill in the simplified CHW enrollment form (name, phone, assigned collection point), **then** a user record with role CHW is created.
6. **Given** active outbreaks exist, **when** the admin views the outbreak dashboard, **then** they see: active outbreaks with pathogen name, participating labs, activation date, and status (ACTIVE/RESOLVED).
7. **Given** any outbreak activation or deactivation action, **then** an audit event is emitted with the actor ID, action type, affected lab IDs, and pathogen.

## Tasks / Subtasks

- [x] **Task 1: Database migration for `outbreak_events` table** (AC: 3-7)
  - [x] 1.1 Create `outbreak_events` table: `id` (UUID PK), `org_id` (FK), `pathogen` (text NOT NULL), `affected_lab_ids` (JSONB — array of lab UUIDs), `status` ('ACTIVE' | 'RESOLVED' default 'ACTIVE'), `activated_by` (FK — practitioner_id), `activated_at` (timestamptz NOT NULL), `resolved_at` (timestamptz), `resolved_by` (FK), `notes` (text), `created_at` (timestamptz). Add index on `(org_id, status)`.
  - [x] 1.2 Enable RLS scoped to `org_id`.

- [x] **Task 2: Network overview endpoint with lab aggregation** (AC: 1, 2)
  - [x] 2.1 Create `admin.getNetworkOverview` query — accepts `{ org_id }`, returns array of lab summaries. Each summary: `{ lab_id, lab_name, status, pending_samples, stock_alert_count, staff_count, last_sync_at }`.
  - [x] 2.2 Aggregate pending samples from the existing lab sample/order tables.
  - [x] 2.3 Aggregate stock alerts by counting `lab_inventory_snapshots` with RED-level quantities (from Story 55.6 tables — if not yet available, return 0 with a "data unavailable" flag).
  - [x] 2.4 Staff count from practitioner table filtered by `lab_id`.
  - [x] 2.5 Emits audit event `NETWORK_OVERVIEW_ACCESSED`.

- [x] **Task 3: Outbreak activation/deactivation endpoints** (AC: 3, 4, 7)
  - [x] 3.1 Create `admin.activateOutbreakMode` mutation — accepts `{ pathogen, affected_lab_ids: string[], notes? }`, validates all lab IDs belong to the org, inserts outbreak event, emits audit event `OUTBREAK_MODE_ACTIVATED`.
  - [x] 3.2 After insertion, dispatch notifications to all practitioners at affected labs: create notification records with type `OUTBREAK_MODE_ACTIVATED` and payload `{ outbreak_id, pathogen }`. Use existing notification table/mechanism.
  - [x] 3.3 Create `admin.deactivateOutbreakMode` mutation — accepts `{ outbreak_id, notes? }`, validates outbreak is ACTIVE, updates status to RESOLVED with resolved_at/resolved_by, emits audit event `OUTBREAK_MODE_DEACTIVATED`. Dispatch `OUTBREAK_MODE_DEACTIVATED` notifications.
  - [x] 3.4 Create `admin.listOutbreaks` query — accepts `{ org_id, status?: 'ACTIVE' | 'RESOLVED' }`, returns outbreaks with lab names joined.

- [x] **Task 4: CHW enrollment endpoint** (AC: 5)
  - [x] 4.1 Create `admin.enrollChw` mutation — accepts `{ full_name, phone, assigned_lab_id }`, validates lab belongs to org.
  - [x] 4.2 Creates a practitioner/user record with role `CHW` and simplified fields (no email required, phone-only auth).
  - [x] 4.3 Emits audit event `CHW_ENROLLED` with practitioner_id (not name — CLAUDE.md PHI rule).
  - [x] 4.4 Returns the created CHW record with generated ID.

- [x] **Task 5: `/network/page.tsx` with lab list and status** (AC: 1, 2)
  - [x] 5.1 Create `apps/admin-portal/src/app/network/page.tsx`.
  - [x] 5.2 Layout: `TopHeader` with title "Lab Network" and two action buttons: "Activate Outbreak Mode" (red/danger) and "Enroll CHW" (brand-lime).
  - [x] 5.3 Lab list as cards or table: Lab Name, Status (badge), Pending Samples, Stock Alerts, Staff Count, Last Sync.
  - [x] 5.4 Status filter tabs: ALL | ACTIVE | PENDING | SUSPENDED.
  - [x] 5.5 Below lab list: "Active Outbreaks" section showing current outbreak events.

- [x] **Task 6: Outbreak activation modal** (AC: 3)
  - [x] 6.1 Create `apps/admin-portal/src/components/network/OutbreakActivationModal.tsx`.
  - [x] 6.2 Form: pathogen name (text input, required), affected labs (checkbox list of org's labs with name and status), notes (textarea, optional).
  - [x] 6.3 Confirmation step: "You are about to activate outbreak mode for [pathogen] at [N] labs. All staff at these labs will be notified. Proceed?"
  - [x] 6.4 Submit calls `trpc.admin.activateOutbreakMode.mutate(...)`.

- [x] **Task 7: Outbreak dashboard view** (AC: 6)
  - [x] 7.1 Create `apps/admin-portal/src/components/network/OutbreakDashboard.tsx`.
  - [x] 7.2 Active outbreaks section: cards showing pathogen, participating lab count (with lab names in tooltip), activation date, activated by, "Resolve" button.
  - [x] 7.3 Resolved outbreaks: collapsible table with pathogen, labs, activation/resolution dates, duration.
  - [x] 7.4 "Resolve" action opens confirmation modal, calls `trpc.admin.deactivateOutbreakMode.mutate(...)`.

- [x] **Task 8: CHW enrollment form** (AC: 5)
  - [x] 8.1 Create `apps/admin-portal/src/components/network/ChwEnrollmentModal.tsx`.
  - [x] 8.2 Simplified form: full name (required), phone number (required, validated), assigned collection point (dropdown of org's labs).
  - [x] 8.3 No email field, no password — CHW auth is OTP-only via phone (per CLAUDE.md auth rules: "Patient auth is OTP-only" — CHW follows same simplified pattern).
  - [x] 8.4 Success state shows generated CHW ID for reference.

- [x] **Task 9: Sidebar navigation update** (AC: 1)
  - [x] 9.1 Add "Network" nav item to `apps/admin-portal/src/components/Sidebar.tsx` after "Labs" entry. Use a globe/network icon (must NOT mirror in RTL — it is a semantic icon, not directional).

- [x] **Task 10: Tests** (AC: 1-7)
  - [x] 10.1 Hub API unit tests: network overview aggregation (labs with various statuses, sample counts, stock alerts).
  - [x] 10.2 Hub API unit tests: outbreak lifecycle — activate, verify notification dispatch, resolve, verify status transition.
  - [x] 10.3 Hub API unit tests: outbreak validation — reject activation with empty lab list, reject activation of lab from different org, reject resolve of already-resolved outbreak.
  - [x] 10.4 Hub API unit tests: CHW enrollment — validate phone format, validate lab belongs to org, verify role is CHW.
  - [x] 10.5 Hub API unit tests: audit event emission for activate, deactivate, enroll CHW, view network.
  - [x] 10.6 Admin Portal component tests: lab list renders with correct status badges and metrics.
  - [x] 10.7 Admin Portal component tests: outbreak activation modal — lab checkbox selection, confirmation step.
  - [x] 10.8 Admin Portal component tests: CHW enrollment form validation (name and phone required).

## Dev Notes

### Architecture

- All endpoints use `adminProcedure` from `apps/hub-api/src/trpc/routers/admin.ts`.
- Network overview reuses existing `admin.listLabs` data as a foundation but adds aggregated operational metrics (pending samples, stock alerts, staff count). If stock tables from Story 55.6 are not yet deployed, the overview endpoint should gracefully return `stock_alert_count: 0` with a flag indicating data is unavailable.
- Outbreak notifications use the existing notification mechanism (type field on notification records). Lab-Lite already polls for notifications — no new polling needed.
- CHW enrollment creates a lightweight user record. The CHW role should be added to the role enum in `@ultranos/shared-types` if not already present.
- PHI rules: CHW enrollment involves names and phone numbers. The `full_name` is stored in the practitioner record (encrypted at rest per field-level encryption on PHI columns). Audit events must log only the practitioner_id, never the name or phone.

### Notification Dispatch

When outbreak mode is activated:
1. Query all practitioners with `lab_id IN affected_lab_ids`
2. For each practitioner, insert a notification record: `{ type: 'OUTBREAK_MODE_ACTIVATED', recipient_id, payload: { outbreak_id, pathogen }, created_at }`
3. Lab-Lite picks these up during its next notification poll/sync cycle

### Project Structure Notes

**New files to create:**
- `apps/admin-portal/src/app/network/page.tsx` — network overview + outbreak dashboard
- `apps/admin-portal/src/components/network/OutbreakActivationModal.tsx` — outbreak activation form
- `apps/admin-portal/src/components/network/OutbreakDashboard.tsx` — active/resolved outbreaks
- `apps/admin-portal/src/components/network/ChwEnrollmentModal.tsx` — CHW enrollment form
- `apps/admin-portal/src/components/network/LabNetworkCard.tsx` — individual lab summary card
- `apps/admin-portal/src/__tests__/network.test.tsx` — component tests
- `apps/hub-api/src/__tests__/network-outbreak.test.ts` — API tests

**Files to modify:**
- `apps/hub-api/src/trpc/routers/admin.ts` — add network overview, outbreak, and CHW endpoints
- `apps/admin-portal/src/components/Sidebar.tsx` — add "Network" nav item

### Component Patterns to Follow

- Table/card layout: follow existing lab list page pattern
- Status badges: `StatusBadge` with colored pill styling (ACTIVE=green, PENDING=amber, SUSPENDED=red)
- Action buttons: `rounded-full`, danger variant for outbreak activation (red bg), brand-lime for CHW enrollment
- Modals: form modals with confirmation step (see `EscalationModal.tsx`)
- Top header: `TopHeader` component with title and action buttons

### References

- [Source: apps/admin-portal/src/app/labs/page.tsx] — lab list table layout, status filters, pagination
- [Source: apps/admin-portal/src/app/labs/[labId]/page.tsx] — detail page with approval/suspension actions
- [Source: apps/admin-portal/src/components/Sidebar.tsx] — nav item structure (line 9-25)
- [Source: apps/hub-api/src/trpc/routers/admin.ts] — `adminProcedure`, audit event patterns
- [Source: apps/admin-portal/src/components/alerts/EscalationModal.tsx] — modal with confirmation pattern
- [Source: apps/admin-portal/src/app/users/create/page.tsx] — user creation form pattern (for CHW enrollment)
- [Source: _bmad-output/implementation-artifacts/54-5-outbreak-response-mode.md] — Lab-Lite outbreak mode story (related)
- [Source: _bmad-output/implementation-artifacts/54-2-chw-collection-module.md] — CHW collection module (related)

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Debug Log References
- Supabase migration `create_outbreak_events_table` applied successfully
- Initial RLS policy used wrong column `auth_uid` — fixed to `auth_user_id`
- Admin-portal test `validates that name and phone are required` failed due to duplicate `getByText('Enroll CHW')` — fixed with `getAllByText`

### Completion Notes List
- Task 1: Created `outbreak_events` table with RLS, index on `(org_id, status)`, FK constraints to `organizations` and `practitioners`
- Task 2: `admin.getNetworkOverview` aggregates lab metrics (pending samples from `lab_orders`, stock alerts from `lab_inventory_snapshots` with graceful fallback, staff from `lab_technicians`). Emits `NETWORK_OVERVIEW_ACCESSED` audit event.
- Task 3: Full outbreak lifecycle — `activateOutbreakMode` (validates labs belong to org, inserts event, dispatches `OUTBREAK_MODE_ACTIVATED` notifications to all lab practitioners), `deactivateOutbreakMode` (validates active status, sets RESOLVED, dispatches deactivation notifications), `listOutbreaks` (with lab name joining and optional status filter).
- Task 4: `enrollChw` creates practitioner with role `CHW`, encrypts `given_name` via `@ultranos/crypto`, validates phone regex and lab org membership. Audit event logs only `practitioner_id` and `assignedLabId` — no PHI.
- Task 5: Network page with card grid layout, status filter tabs (ALL/ACTIVE/PENDING/SUSPENDED), TopHeader, action buttons
- Task 6: Outbreak activation modal with two-step flow (form → confirmation), checkbox lab selection with status badges
- Task 7: Outbreak dashboard with active outbreak cards (Resolve button with confirm), collapsible resolved outbreaks table showing duration
- Task 8: CHW enrollment modal with phone validation, lab dropdown, success state showing generated CHW ID, "Enroll Another" flow
- Task 9: Added "Network" nav item with globe icon (semantic, non-mirroring) after Labs/Inventory in Sidebar
- Added `CHW` role to `ROLE_MODULE_MAP` in `@ultranos/shared-types` (module: `null` — always available)
- Hub API tests: 15/15 passing. Admin Portal tests: 12/12 passing. All pre-existing test failures unrelated to this story.

### File List
- `apps/hub-api/src/trpc/routers/admin.ts` — modified (added 5 endpoints: getNetworkOverview, activateOutbreakMode, deactivateOutbreakMode, listOutbreaks, enrollChw)
- `apps/admin-portal/src/app/network/page.tsx` — new (network overview page)
- `apps/admin-portal/src/components/network/LabNetworkCard.tsx` — new (lab summary card component)
- `apps/admin-portal/src/components/network/OutbreakActivationModal.tsx` — new (outbreak activation form modal)
- `apps/admin-portal/src/components/network/OutbreakDashboard.tsx` — new (active/resolved outbreaks view)
- `apps/admin-portal/src/components/network/ChwEnrollmentModal.tsx` — new (CHW enrollment form modal)
- `apps/admin-portal/src/components/Sidebar.tsx` — modified (added Network nav item + NetworkIcon)
- `packages/shared-types/src/subscription.ts` — modified (added CHW role to ROLE_MODULE_MAP)
- `apps/hub-api/src/__tests__/network-outbreak.test.ts` — new (15 API tests)
- `apps/admin-portal/src/__tests__/network.test.tsx` — new (12 component tests)
- Supabase migration: `create_outbreak_events_table` (outbreak_events table + RLS + index)
