# Story 55.5: Certification & Credential Management

Status: review

## Story

As an organization administrator,
I want to define certification milestones and manage credential records for lab staff,
so that professional development is tracked centrally and credentials are verifiable.

## Acceptance Criteria

1. **Given** the admin navigates to `/certifications`, **when** the page loads, **then** they see all certification pathways defined for their organization with name, description, milestone count, and status (ACTIVE/ARCHIVED).
2. **Given** the admin clicks "Create Pathway", **when** they fill in the form with name, description, and a list of milestones (each with title, type: MODULE_COMPLETION | SUPERVISED_PROCEDURE | ASSESSMENT_PASS | CONTINUING_ED_HOURS, and required_count), **then** the pathway is created and appears in the list.
3. **Given** a staff member has been assigned a certification pathway, **when** the admin navigates to `/staff/[practitionerId]/certifications`, **then** they see all milestones with status (completed/pending), completion percentage, and timestamps.
4. **Given** a technician submits evidence for a milestone, **when** the admin views the pending milestone, **then** they can approve or reject it with an optional note, and the action is audited.
5. **Given** all milestones in a pathway are approved, **when** the admin clicks "Issue Credential", **then** a digital certificate is generated (PDF) with a verifiable SHA-256 hash, and a `certification_credentials` record is created.
6. **Given** credentials exist with expiry dates, **when** the admin views the dashboard, **then** credentials expiring within 90, 60, or 30 days are highlighted with color-coded warnings (amber 90d, orange 60d, red 30d).
7. **Given** a lab technician is logged into Lab-Lite, **when** they access their certification view, **then** they see their own progress (read-only) via the `lab.getMyCertifications` endpoint, which returns only their own pathway progress.

## Tasks / Subtasks

- [x] **Task 1: Database migrations** (AC: 1-6)
  - [x] 1.1 Create `certification_pathways` table: `id` (UUID PK), `org_id` (FK), `name` (text NOT NULL), `description` (text), `milestones` (JSONB — array of `{ title, type, required_count }`), `status` ('ACTIVE' | 'ARCHIVED' default 'ACTIVE'), `created_at` (timestamptz), `updated_at` (timestamptz). Add index on `org_id`.
  - [x] 1.2 Create `certification_progress` table: `id` (UUID PK), `pathway_id` (FK → certification_pathways), `practitioner_id` (FK), `milestone_index` (integer), `status` ('PENDING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' default 'PENDING'), `evidence_ref` (text — opaque reference, no PHI), `reviewer_note` (text), `approved_by` (FK), `approved_at` (timestamptz), `submitted_at` (timestamptz), `created_at` (timestamptz). Add composite index on `(pathway_id, practitioner_id)`.
  - [x] 1.3 Create `certification_credentials` table: `id` (UUID PK), `pathway_id` (FK → certification_pathways), `practitioner_id` (FK), `issued_at` (timestamptz), `expires_at` (timestamptz), `certificate_hash` (text NOT NULL — SHA-256 of certificate content), `issued_by` (FK), `created_at` (timestamptz). Add index on `(practitioner_id, expires_at)`.
  - [x] 1.4 Enable RLS on all three tables scoped to `org_id`.

- [x] **Task 2: Admin CRUD endpoints for pathways** (AC: 1, 2)
  - [x] 2.1 Create `admin.listCertificationPathways` query — accepts `{ org_id, status?: 'ACTIVE' | 'ARCHIVED', cursor?: number, limit?: number }`, returns paginated pathways.
  - [x] 2.2 Create `admin.createCertificationPathway` mutation — accepts `{ name, description, milestones }`, validates milestone schema (each must have title, valid type enum, required_count > 0), inserts row, emits audit event `CERTIFICATION_PATHWAY_CREATED`.
  - [x] 2.3 Create `admin.updateCertificationPathway` mutation — accepts `{ id, name?, description?, milestones?, status? }`, emits audit event `CERTIFICATION_PATHWAY_UPDATED`.
  - [x] 2.4 Create `admin.archiveCertificationPathway` mutation — sets status to ARCHIVED, emits audit event.

- [x] **Task 3: Progress tracking and milestone review endpoints** (AC: 3, 4)
  - [x] 3.1 Create `admin.listCertificationProgress` query — accepts `{ practitioner_id, pathway_id? }`, returns all progress records with milestone details joined from pathway.
  - [x] 3.2 Create `admin.reviewMilestone` mutation — accepts `{ progress_id, action: 'APPROVE' | 'REJECT', note? }`, validates current status is SUBMITTED, updates status/approved_by/approved_at, emits audit event `CERTIFICATION_MILESTONE_REVIEWED`.
  - [x] 3.3 Create `admin.assignPathway` mutation — accepts `{ practitioner_id, pathway_id }`, creates PENDING progress records for each milestone in the pathway.

- [x] **Task 4: Credential issuance endpoint** (AC: 5)
  - [x] 4.1 Create `admin.issueCredential` mutation — accepts `{ practitioner_id, pathway_id, expires_at }`, validates all milestones are APPROVED, generates certificate content (practitioner name, pathway name, issue date, expiry), computes SHA-256 hash of content, inserts credential record, emits audit event `CERTIFICATION_CREDENTIAL_ISSUED`.
  - [x] 4.2 Certificate hash computation: `crypto.createHash('sha256').update(certificateContent).digest('hex')`.

- [x] **Task 5: `/certifications/page.tsx` — pathway list** (AC: 1)
  - [x] 5.1 Create `apps/admin-portal/src/app/certifications/page.tsx`.
  - [x] 5.2 Layout: `TopHeader` with title "Certifications" and "Create Pathway" button (rounded-full, brand-lime accent).
  - [x] 5.3 Table with `bg-black` header row: Name, Description, Milestones (count), Status (badge), Actions.
  - [x] 5.4 Status filter tabs: ALL | ACTIVE | ARCHIVED (same tab pattern as labs page).
  - [x] 5.5 Pagination with cursor-based navigation (reuse pattern from `/labs/page.tsx`).
  - [x] 5.6 "Create Pathway" modal with form: name (required), description (textarea), milestones list (dynamic add/remove rows with title, type dropdown, required_count number input).

- [x] **Task 6: `/staff/[practitionerId]/certifications` — progress view** (AC: 3)
  - [x] 6.1 Create `apps/admin-portal/src/app/staff/[practitionerId]/certifications/page.tsx`.
  - [x] 6.2 Show practitioner name at top, then list of assigned pathways with progress bars.
  - [x] 6.3 For each pathway: expandable section showing each milestone with status badge (PENDING=gray, SUBMITTED=amber, APPROVED=green, REJECTED=red), evidence reference link, reviewer note.
  - [x] 6.4 "Assign Pathway" button to assign a new pathway to this practitioner.

- [x] **Task 7: Milestone review UI** (AC: 4)
  - [x] 7.1 Create `apps/admin-portal/src/components/certifications/MilestoneReviewModal.tsx`.
  - [x] 7.2 Modal shows: milestone title, type, submitted evidence reference, submitted date.
  - [x] 7.3 Two action buttons: "Approve" (green) and "Reject" (red), both with optional note textarea.
  - [x] 7.4 Confirmation dialog before final action (reuse existing confirmation modal pattern).

- [x] **Task 8: `lab.getMyCertifications` read-only endpoint** (AC: 7)
  - [x] 8.1 Add to `apps/hub-api/src/trpc/routers/lab.ts`: `lab.getMyCertifications` query.
  - [x] 8.2 Returns all pathways assigned to `ctx.user.practitioner_id` with progress records.
  - [x] 8.3 Read-only — no mutations exposed to lab users for certification data.
  - [x] 8.4 Emits audit event `CERTIFICATION_PROGRESS_VIEWED` for data access tracking.

- [x] **Task 9: Expiry monitoring logic** (AC: 6)
  - [x] 9.1 Create `admin.getExpiringCredentials` query — accepts `{ days_ahead?: number }` (default 90), returns credentials expiring within that window with practitioner name, pathway name, expiry date, days remaining.
  - [x] 9.2 Dashboard widget: show count of credentials expiring in 90/60/30 day buckets.
  - [x] 9.3 Color coding: 90d = amber, 60d = orange, 30d = red.

- [x] **Task 10: Sidebar navigation update** (AC: 1)
  - [x] 10.1 Add "Certifications" nav item to `apps/admin-portal/src/components/Sidebar.tsx` after "Mentorship" entry.
  - [x] 10.2 Use a certificate/badge icon (must NOT mirror in RTL).

- [x] **Task 11: Tests** (AC: 1-7)
  - [x] 11.1 Hub API unit tests: pathway CRUD validation (name required, milestone schema validation, status transitions).
  - [x] 11.2 Hub API unit tests: milestone review flow (SUBMITTED → APPROVED, SUBMITTED → REJECTED, reject review of PENDING milestone).
  - [x] 11.3 Hub API unit tests: credential issuance (all milestones must be approved, hash generation, expiry date validation).
  - [x] 11.4 Hub API unit tests: `lab.getMyCertifications` returns only current user's data.
  - [x] 11.5 Hub API unit tests: audit event emission for all mutations.
  - [x] 11.6 Admin Portal component tests: pathway list renders with correct columns, filter tabs work.
  - [x] 11.7 Admin Portal component tests: milestone review modal approve/reject flow.
  - [x] 11.8 Admin Portal component tests: expiry warning color coding logic.

## Dev Notes

### Architecture

- All endpoints live under the `admin` tRPC namespace using the existing `adminProcedure` middleware guard in `apps/hub-api/src/trpc/routers/admin.ts` (line 14: `protectedProcedure` with `ctx.user.role !== 'ADMIN'` check).
- The `lab.getMyCertifications` endpoint uses the existing `protectedProcedure` in the lab router (no admin check — any authenticated lab user can view their own).
- Database operations go through Supabase MCP tools per CLAUDE.md rules.
- PHI rule: certification records do not contain PHI directly. Evidence references are opaque IDs pointing to uploaded documents — never inline PHI content. Audit events must not log practitioner names, only IDs.
- Certificate hash: SHA-256 of a deterministic string `"${practitioner_id}|${pathway_id}|${issued_at_iso}"` concatenated with milestone details. This hash is stored for verification without needing the full certificate.

### Milestone Type Enum

```typescript
type MilestoneType =
  | 'MODULE_COMPLETION'
  | 'SUPERVISED_PROCEDURE'
  | 'ASSESSMENT_PASS'
  | 'CONTINUING_ED_HOURS'
```

### tRPC Client Usage

Admin Portal calls endpoints via `trpc.admin.listCertificationPathways.query(...)` using the existing client in `apps/admin-portal/src/lib/trpc.ts` with `httpBatchLink` and Bearer token auth.

### Project Structure Notes

**New files to create:**
- `apps/admin-portal/src/app/certifications/page.tsx` — pathway list page
- `apps/admin-portal/src/app/staff/[practitionerId]/certifications/page.tsx` — practitioner progress page
- `apps/admin-portal/src/components/certifications/MilestoneReviewModal.tsx` — review modal
- `apps/admin-portal/src/components/certifications/PathwayCreateModal.tsx` — creation modal
- `apps/admin-portal/src/components/certifications/ExpiryWarningWidget.tsx` — dashboard widget
- `apps/admin-portal/src/__tests__/certifications.test.tsx` — component tests
- `apps/hub-api/src/__tests__/certification.test.ts` — API tests

**Files to modify:**
- `apps/hub-api/src/trpc/routers/admin.ts` — add certification endpoints
- `apps/hub-api/src/trpc/routers/lab.ts` — add `getMyCertifications` query
- `apps/admin-portal/src/components/Sidebar.tsx` — add "Certifications" nav item (after line 13, after Labs entry)

### Component Patterns to Follow

- Table header: `bg-black text-white` (see `apps/admin-portal/src/app/labs/page.tsx`)
- Buttons: `rounded-full` with brand-lime accent for primary actions
- Tab-style filters: horizontal button group for status filtering (ALL | ACTIVE | etc.)
- Confirmation modals: existing pattern in `apps/admin-portal/src/components/alerts/EscalationModal.tsx`
- Status badges: `StatusBadge` component pattern from labs page (colored pill badges)
- Pagination: cursor-based with Previous/Next buttons

### References

- [Source: apps/admin-portal/src/app/labs/page.tsx] — table layout, status filters, pagination pattern
- [Source: apps/admin-portal/src/app/labs/[labId]/page.tsx] — detail page with actions
- [Source: apps/admin-portal/src/components/Sidebar.tsx] — nav item structure (line 9-25)
- [Source: apps/hub-api/src/trpc/routers/admin.ts] — `adminProcedure` guard, audit logging pattern
- [Source: apps/hub-api/src/trpc/routers/lab.ts] — lab router endpoint pattern
- [Source: apps/admin-portal/src/lib/trpc.ts] — tRPC client setup with Bearer token
- [Source: apps/admin-portal/src/components/alerts/EscalationModal.tsx] — modal pattern

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Debug Log References
- Hub API tests: 21/21 passed (certification.test.ts)
- Admin Portal tests: 10/10 passed (certifications.test.tsx)
- Pre-existing failures in other test files (not caused by this story)

### Completion Notes List
- Task 1: Applied Supabase migration `create_certification_tables` with all 3 tables, indexes, RLS, and policies
- Task 2-4, 9: Added 9 admin endpoints to admin router: listCertificationPathways, createCertificationPathway, updateCertificationPathway, archiveCertificationPathway, listCertificationProgress, reviewMilestone, assignPathway, issueCredential, getExpiringCredentials
- Task 5: Created certifications page with TopHeader, status filter tabs (ALL/ACTIVE/ARCHIVED), paginated table, archive action
- Task 5 (continued): Created PathwayCreateModal with dynamic milestone add/remove form
- Task 6: Created practitioner certifications progress view with expandable pathway sections, progress bars, assign pathway modal
- Task 7: Created MilestoneReviewModal with approve/reject buttons, confirmation dialog, optional note
- Task 8: Added lab.getMyCertifications read-only endpoint to lab router with CERTIFICATION_PROGRESS_VIEWED audit event
- Task 9: Added getExpiringCredentials endpoint with 90/60/30 day buckets and ExpiryWarningWidget with color-coded cards (red/orange/amber)
- Task 10: Added "Certifications" nav item with CertificateIcon after Mentorship in sidebar
- Task 11: Created 21 hub-api unit tests and 10 admin-portal component tests covering all ACs

### Change Log
- 2026-05-30: Full story implementation — all 11 tasks completed

### File List
- apps/hub-api/src/trpc/routers/admin.ts (modified — added 9 certification endpoints)
- apps/hub-api/src/trpc/routers/lab.ts (modified — added getMyCertifications)
- apps/admin-portal/src/components/Sidebar.tsx (modified — added Certifications nav + CertificateIcon)
- apps/admin-portal/src/app/certifications/page.tsx (new)
- apps/admin-portal/src/app/staff/[practitionerId]/certifications/page.tsx (new)
- apps/admin-portal/src/components/certifications/PathwayCreateModal.tsx (new)
- apps/admin-portal/src/components/certifications/MilestoneReviewModal.tsx (new)
- apps/admin-portal/src/components/certifications/ExpiryWarningWidget.tsx (new)
- apps/hub-api/src/__tests__/certification.test.ts (new)
- apps/admin-portal/src/__tests__/certifications.test.tsx (new)
