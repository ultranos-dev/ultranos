# Story 55.2: Cross-Lab Staff Overview Dashboard

Status: review

## Story

As an organization administrator,
I want a single dashboard showing all staff across all my labs,
so that I can manage staffing and identify coverage gaps.

## Acceptance Criteria

1. New route `/staff` (top-level) showing all lab staff across the organization in a paginated table
2. Table columns: email (truncated to first 3 chars + domain), lab name, role badge (color-coded), last active date, assignment date
3. Filters: by role (LAB_TECH, SENIOR_TECH, SUPERVISOR, LAB_MANAGER), by lab (dropdown of all labs), by activity status (active in last 7 days, inactive)
4. Labs with no LAB_MANAGER get a warning badge displayed inline next to the lab name
5. Pagination: 20 items per page, cursor-based matching the existing users page pattern
6. CSV export via the existing ExportButton component
7. Click row to navigate to `/labs/[labId]/staff` (from Story 55.1)

## Tasks / Subtasks

- [x] Task 1: Create `admin.listAllLabStaff` Hub API endpoint with filtering and pagination (AC: #1-5)
  - [x] Add endpoint to `apps/hub-api/src/trpc/routers/admin.ts`
  - [x] Input schema:
    ```
    {
      roleFilter?: LabRole,
      labFilter?: string (labId),
      activityFilter?: 'ACTIVE_7D' | 'INACTIVE' | 'ALL',
      cursor?: string (practitioner_id for cursor-based pagination),
      limit?: number (default 20, max 50)
    }
    ```
  - [x] Query: join `lab_technicians` + `labs` (for lab name) + `practitioners` (for auth_user_id)
  - [x] Look up emails via targeted `getUserById` per practitioner (not `listUsers()`)
  - [x] For activity filter: join `audit_events` or check `practitioners.last_login_at` if available
  - [x] Return: `{ items: Array<{ practitionerId, email, labId, labName, labRole, lastActiveAt, createdAt }>, nextCursor: string | null }`
  - [x] Guard with `adminProcedure`

- [x] Task 2: Create `admin.listLabsForFilter` endpoint (AC: #3)
  - [x] Simple endpoint returning `Array<{ id, labName }>` for all labs
  - [x] Used to populate the lab filter dropdown
  - [x] Guard with `adminProcedure`

- [x] Task 3: Create `admin.exportLabStaffCsv` endpoint (AC: #6)
  - [x] Accepts same filters as `listAllLabStaff` but no pagination
  - [x] Returns `{ data: string (base64), filename: string, mimeType: 'text/csv' }`
  - [x] CSV columns: Email, Lab Name, Role, Last Active, Assigned Date
  - [x] Guard with `adminProcedure`
  - [x] Emit audit event for data export (action: EXPORT, resourceType: PRACTITIONER)

- [x] Task 4: Create managerless lab detection logic (AC: #4)
  - [x] In the `listAllLabStaff` response, include a `labHasManager: boolean` field per item
  - [x] Alternatively, create a separate `admin.getManagerlessLabs` endpoint returning `Array<{ labId, labName }>` and compute client-side
  - [x] Recommendation: include `labHasManager` in each row — simpler client logic, one fewer API call
  - [x] Query: subquery `SELECT lab_id FROM lab_technicians WHERE lab_role = 'LAB_MANAGER' GROUP BY lab_id` and left-join

- [x] Task 5: Create `/staff/page.tsx` with table, filters, and pagination (AC: #1-5, #7)
  - [x] Create `apps/admin-portal/src/app/staff/page.tsx`
  - [x] Use `'use client'` directive
  - [x] Fetch labs for filter dropdown via `trpc.admin.listLabsForFilter.query()`
  - [x] Fetch staff via `trpc.admin.listAllLabStaff.query({ ...filters, cursor, limit: 20 })`
  - [x] Filter bar:
    - Role filter: tab-style buttons (ALL | LAB_TECH | SENIOR_TECH | SUPERVISOR | LAB_MANAGER)
    - Lab filter: `<select>` dropdown with "All Labs" default
    - Activity filter: `<select>` dropdown (All | Active (7d) | Inactive)
  - [x] Table with `bg-black` header:
    - Email (truncated: `j***@example.com`)
    - Lab Name (with warning icon if `labHasManager === false`)
    - Role (colored badge)
    - Last Active (relative date or "Never")
    - Assigned (formatted date)
  - [x] Row click: `router.push(\`/labs/\${row.labId}/staff\`)`
  - [x] Pagination: "Previous" / "Next" buttons using cursor
  - [x] Warning banner at top if any managerless labs exist: "Warning: {n} lab(s) have no Lab Manager assigned"
  - [x] Loading state, error state, empty state

- [x] Task 6: Add CSV export via ExportButton (AC: #6)
  - [x] Import `ExportButton` from `@/components/ExportButton`
  - [x] Wire `exportFn` to `trpc.admin.exportLabStaffCsv.mutate` (or `.query`)
  - [x] Pass current filters to the export function
  - [x] Place next to filter bar

- [x] Task 7: Add "Staff" nav item to Sidebar.tsx (AC: #7)
  - [x] Modify `apps/admin-portal/src/components/Sidebar.tsx`
  - [x] Add entry `{ label: 'Staff', href: '/staff', icon: StaffIcon }` between "Labs" and "Users" in `navItems`
  - [x] Create a `StaffIcon` SVG component (use a badge/person icon variant distinct from UsersGroupIcon)

- [x] Task 8: Write Vitest tests (AC: #1-7)
  - [x] Create `apps/admin-portal/src/__tests__/cross-lab-staff.test.tsx`
  - [x] Test: staff table renders with correct columns
  - [x] Test: role filter changes trigger re-fetch with correct filter param
  - [x] Test: lab filter dropdown populated from `listLabsForFilter`
  - [x] Test: managerless lab warning badge renders next to lab name
  - [x] Test: top-level warning banner shows count of managerless labs
  - [x] Test: pagination next/previous buttons work with cursor
  - [x] Test: row click navigates to `/labs/[labId]/staff`
  - [x] Test: empty state renders when no staff found
  - [x] Create `apps/hub-api/src/__tests__/cross-lab-staff.test.ts`
  - [x] Test: `admin.listAllLabStaff` returns paginated results
  - [x] Test: role filter returns only matching roles
  - [x] Test: lab filter returns only matching lab
  - [x] Test: `admin.exportLabStaffCsv` returns valid base64 CSV
  - [x] Test: non-ADMIN callers rejected with FORBIDDEN

## Dev Notes

### Dependencies
- **Requires Story 55.1** — for the `/labs/[labId]/staff` page that row clicks navigate to
- **Requires Story 22.3** (completed) — admin router scaffold, lab data model

### Email truncation pattern
Truncate emails for display (data minimization in admin views): `john.doe@example.com` -> `j***@example.com`. This is a UI-only truncation; the full email is still available in the data for the row click navigation.

### Cursor-based pagination
Follow the existing pattern from `apps/admin-portal/src/app/users/page.tsx`. The cursor is the `practitioner_id` of the last item. Query uses `WHERE practitioner_id > cursor ORDER BY practitioner_id ASC LIMIT limit + 1` (fetch one extra to determine if there's a next page).

### Managerless lab detection
The recommended approach is to include `labHasManager` in each row of the `listAllLabStaff` response. This avoids an extra API call. The query:
```sql
SELECT lt.*, l.lab_name,
  EXISTS(SELECT 1 FROM lab_technicians m WHERE m.lab_id = lt.lab_id AND m.lab_role = 'LAB_MANAGER') AS lab_has_manager
FROM lab_technicians lt
JOIN labs l ON lt.lab_id = l.id
```

### ExportButton integration
The `ExportButton` component at `apps/admin-portal/src/components/ExportButton.tsx` expects:
```typescript
exportFn: (filters: Record<string, unknown>) => Promise<{ data: string; filename: string; mimeType: string }>
```
The `data` field must be base64-encoded. The component handles blob creation and download.

### Sidebar modification
The `navItems` array in `apps/admin-portal/src/components/Sidebar.tsx` (line 9-25) is ordered. Insert the "Staff" entry after "Labs" (index 3) and before "Users" (index 4). The icon should be visually distinct from the existing `UsersGroupIcon` used for "Users".

### No i18n
All text is hardcoded English, matching the existing Admin Portal pattern.

### Project Structure Notes

**Files to create:**
- `apps/admin-portal/src/app/staff/page.tsx` — cross-lab staff overview page
- `apps/admin-portal/src/__tests__/cross-lab-staff.test.tsx` — UI tests
- `apps/hub-api/src/__tests__/cross-lab-staff.test.ts` — API tests

**Files to modify:**
- `apps/hub-api/src/trpc/routers/admin.ts` — add `listAllLabStaff`, `listLabsForFilter`, `exportLabStaffCsv` endpoints
- `apps/admin-portal/src/components/Sidebar.tsx` — add "Staff" nav item between "Labs" and "Users"

### References

- [Source: apps/admin-portal/src/app/users/page.tsx] — table pattern, filters, pagination, ExportButton usage
- [Source: apps/admin-portal/src/components/ExportButton.tsx] — export component interface
- [Source: apps/admin-portal/src/components/Sidebar.tsx:9-25] — navItems array for sidebar navigation
- [Source: apps/hub-api/src/trpc/routers/admin.ts:14-22] — `adminProcedure` middleware guard
- [Source: apps/admin-portal/src/lib/trpc.ts] — tRPC client with Bearer token
- [Source: apps/admin-portal/src/app/labs/[labId]/page.tsx:36-46] — StatusBadge component pattern
- [Source: supabase/migrations/028_lab_technician_roles.sql] — lab_technicians table with lab_role column
- [Source: packages/shared-types/src/enums.ts:192-210] — LabRole enum values

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
- Fixed Supabase mock chain in hub-api tests: `.limit()` needed to return full chain for post-limit `.eq()` and `.gt()` calls

### Completion Notes List
- Task 1-4: Three Hub API endpoints added to `admin.ts`: `listAllLabStaff` (cursor-paginated, filtered), `listLabsForFilter`, `exportLabStaffCsv` (base64 CSV with audit event). `labHasManager` boolean included per row via subquery.
- Task 5-6: `/staff/page.tsx` created with role tab buttons, lab/activity dropdowns, ExportButton, truncated emails, warning badges for managerless labs, cursor-based pagination.
- Task 7: `BadgeIcon` (scales/balance icon) added to Sidebar between Labs and Users.
- Task 8: 10 API tests (paginated results, role/lab filters, CSV export with audit, RBAC guards) + 9 UI tests (columns, filters, pagination, navigation, managerless warnings, empty/error states).

### Change Log
- 2026-05-30: Story 55.2 implemented — cross-lab staff overview dashboard with API endpoints, UI page, sidebar nav, and tests.

### File List
- apps/hub-api/src/trpc/routers/admin.ts (modified — added listAllLabStaff, listLabsForFilter, exportLabStaffCsv endpoints)
- apps/admin-portal/src/app/staff/page.tsx (created — cross-lab staff overview page)
- apps/admin-portal/src/components/Sidebar.tsx (modified — added Staff nav item with BadgeIcon)
- apps/hub-api/src/__tests__/cross-lab-staff.test.ts (created — API tests)
- apps/admin-portal/src/__tests__/cross-lab-staff.test.tsx (created — UI tests)
