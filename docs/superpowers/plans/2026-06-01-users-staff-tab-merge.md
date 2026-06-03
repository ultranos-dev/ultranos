# Users + Staff Tab Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the separate `/staff` (Lab Staff Overview) page into `/users` as a second tab ("Lab Assignments"), with `/staff` redirecting to `/users?tab=lab-assignments`.

**Architecture:** `users/page.tsx` becomes a thin tab shell that reads `?tab` from the URL search params; each tab's content moves into its own `_components/` file. The existing query backends and tRPC calls are untouched — only the routing and rendering layer changes. `/staff/page.tsx` becomes a server-side redirect.

**Tech Stack:** Next.js 15 App Router, TypeScript, Vitest + @testing-library/react

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| **Create** | `apps/admin-portal/src/app/users/_components/AllUsersTab.tsx` | All current users content: state, tRPC calls, filters, table, pagination |
| **Create** | `apps/admin-portal/src/app/users/_components/LabAssignmentsTab.tsx` | All current staff content: state, tRPC calls, filters, table, pagination |
| **Rewrite** | `apps/admin-portal/src/app/users/page.tsx` | Tab shell: reads `?tab` URL param, renders tab nav, delegates to components |
| **Rewrite** | `apps/admin-portal/src/app/staff/page.tsx` | Server-side redirect → `/users?tab=lab-assignments` |
| **Modify** | `apps/admin-portal/src/components/Sidebar.tsx` | Remove "Staff" nav item + `Award` icon import |
| **Create** | `apps/admin-portal/src/__tests__/users-tabs.test.tsx` | Tests for tab shell: URL param → correct tab rendered |
| **Modify** | `apps/admin-portal/src/__tests__/users-list.test.tsx` | Update import paths; fix `formatRelativeTime` export location |
| **Modify** | `apps/admin-portal/src/__tests__/sidebar-updated.test.tsx` | Assert "Staff" nav item is gone; assert "Users" item still present |

---

### Task 1: Create `AllUsersTab` component

Extract all content from the current `users/page.tsx` — every piece of state, tRPC calls, helper functions, badges, filters, table, and pagination — into a standalone client component. The page shell will call this component directly.

**Files:**
- Create: `apps/admin-portal/src/app/users/_components/AllUsersTab.tsx`

- [ ] **Step 1: Write the failing test first**

Add a test that imports `AllUsersTab` directly and asserts it renders the user table. This will fail until the file exists.

File: `apps/admin-portal/src/__tests__/users-list.test.tsx`

Replace the existing import line:
```typescript
const { default: UsersPage, formatRelativeTime } = await import('../app/users/page')
```
with:
```typescript
const { default: AllUsersTab, formatRelativeTime } = await import('../app/users/_components/AllUsersTab')
```

Also update the `render(<UsersPage />)` calls → `render(<AllUsersTab />)` throughout the file, and update the empty state text `'No staff users yet'` checks — they remain unchanged (same string stays in the component).

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
pnpm -F admin-portal test -- --reporter=verbose 2>&1 | grep -A 5 "users-list"
```
Expected: FAIL — `Cannot find module '../app/users/_components/AllUsersTab'`

- [ ] **Step 3: Create `AllUsersTab.tsx`**

This is a direct lift of the existing `users/page.tsx` content, converted from a page to a component. Copy everything verbatim except: remove the `TopHeader` usage (the shell page handles the header), and change the function name from `UsersPage` to `AllUsersTab`.

File: `apps/admin-portal/src/app/users/_components/AllUsersTab.tsx`

```typescript
'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import { ExportButton } from '@/components/ExportButton'

type RoleFilter = 'ALL' | 'ADMIN' | 'CLINICIAN' | 'DOCTOR' | 'PHARMACIST' | 'LAB_TECH'
type StatusFilter = 'ALL' | 'ACTIVE' | 'SUSPENDED' | 'PENDING_INVITE'

interface User {
  id: string
  name: string
  email: string
  role: string
  moduleCode: string | null
  moduleName: string | null
  status: string
  mfaEnrolled: boolean
  lastLoginAt: string | null
  createdAt: string
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    ACTIVE: 'bg-success-subtle text-success',
    SUSPENDED: 'bg-danger-subtle text-danger',
    PENDING_INVITE: 'bg-warning-subtle text-warning',
  }
  const labelMap: Record<string, string> = {
    ACTIVE: 'Active',
    SUSPENDED: 'Suspended',
    PENDING_INVITE: 'Pending Invite',
  }
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${colorMap[status] ?? 'bg-surface text-text-secondary'}`}>
      {labelMap[status] ?? status}
    </span>
  )
}

function MfaBadge({ enrolled }: { enrolled: boolean }) {
  if (enrolled) {
    return <span className="text-xs font-medium text-success">Enrolled</span>
  }
  return <span className="text-xs font-medium text-warning">&#x26A0; Not Enrolled</span>
}

export function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

const ROLE_FILTERS: RoleFilter[] = ['ALL', 'ADMIN', 'CLINICIAN', 'DOCTOR', 'PHARMACIST', 'LAB_TECH']
const STATUS_FILTERS: StatusFilter[] = ['ALL', 'ACTIVE', 'SUSPENDED', 'PENDING_INVITE']
const STATUS_LABELS: Record<StatusFilter, string> = {
  ALL: 'All',
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  PENDING_INVITE: 'Pending Invite',
}
const PAGE_SIZE = 20

export default function AllUsersTab() {
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await trpc.admin.listUsers.query({
        page,
        pageSize: PAGE_SIZE,
        ...(roleFilter !== 'ALL' && { roleFilter }),
        ...(statusFilter !== 'ALL' && { statusFilter }),
        ...(search.trim() && { search: search.trim() }),
      })
      setUsers(result.users)
      setTotalCount(result.totalCount)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [page, roleFilter, statusFilter, search])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  function handleRoleFilterChange(newFilter: RoleFilter) {
    setRoleFilter(newFilter)
    setPage(1)
  }

  function handleStatusFilterChange(newFilter: StatusFilter) {
    setStatusFilter(newFilter)
    setPage(1)
  }

  function handleSearchChange(value: string) {
    setSearch(value)
    setPage(1)
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)
  const hasSuspendedUsers = users.some((u) => u.status === 'SUSPENDED')

  return (
    <div className="mx-auto max-w-7xl px-8 py-6">
      {/* Top bar: filters + CTA */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={roleFilter}
            onChange={(e) => handleRoleFilterChange(e.target.value as RoleFilter)}
            className="rounded-full border border-border bg-surface px-4 py-1.5 text-sm font-medium text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            aria-label="Filter by role"
          >
            {ROLE_FILTERS.map((r) => (
              <option key={r} value={r}>
                {r === 'ALL' ? 'All Roles' : r.replace('_', ' ')}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => handleStatusFilterChange(e.target.value as StatusFilter)}
            className="rounded-full border border-border bg-surface px-4 py-1.5 text-sm font-medium text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            aria-label="Filter by status"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder="Search name or email..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="rounded-full border border-border bg-surface px-4 py-1.5 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent w-60"
            aria-label="Search users"
          />
        </div>

        <div className="flex items-center gap-3">
          <ExportButton exportFn={() => trpc.admin.exportUsers.query()} filters={{}} />
          <Link
            href="/users/create"
            className="rounded-full bg-brand-lime px-5 py-2 text-sm font-semibold text-black hover:bg-brand-lime/90 transition-colors"
          >
            Create User
          </Link>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-2xl bg-danger-subtle p-3 text-sm text-danger">{error}</div>
      )}

      {hasSuspendedUsers && (
        <div className="mt-4 rounded-2xl bg-warning-subtle p-3 text-sm text-warning">
          Some users are suspended.{' '}
          <Link href="/subscriptions" className="underline font-medium hover:text-warning/80">
            Review subscriptions
          </Link>
        </div>
      )}

      {loading ? (
        <div className="mt-6 text-text-secondary">Loading users...</div>
      ) : users.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-border bg-white p-12 text-center">
          <p className="text-lg font-medium text-text-primary">No staff users yet</p>
          <p className="mt-1 text-sm text-text-muted">
            Get started by inviting your first team member.
          </p>
          <Link
            href="/users/create"
            className="mt-4 inline-block rounded-full bg-brand-lime px-5 py-2 text-sm font-semibold text-black hover:bg-brand-lime/90 transition-colors"
          >
            Create User
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-4 overflow-hidden rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-black">
                <tr>
                  <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Name</th>
                  <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Email</th>
                  <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Role</th>
                  <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">MFA</th>
                  <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Last Login</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-surface-raised">
                {users.map((user) => (
                  <tr
                    key={user.id}
                    onClick={() => router.push(`/users/${user.id}`)}
                    className="cursor-pointer transition-colors hover:bg-brand-lime/5"
                  >
                    <td className="px-4 py-3 font-medium text-text-primary">
                      <Link
                        href={`/users/${user.id}`}
                        className="hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {user.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-text-muted">{user.email}</td>
                    <td className="px-4 py-3 text-text-primary">
                      {user.role}
                      {user.moduleName && (
                        <span className="text-text-muted"> ({user.moduleName})</span>
                      )}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={user.status} /></td>
                    <td className="px-4 py-3"><MfaBadge enrolled={user.mfaEnrolled} /></td>
                    <td className="px-4 py-3 text-text-muted">{formatRelativeTime(user.lastLoginAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-text-secondary">
              <span>
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalCount)} of {totalCount}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="rounded-full border border-border px-4 py-1.5 text-sm font-medium disabled:opacity-50 hover:bg-surface hover:scale-[1.02] transition-transform duration-200"
                >
                  Previous
                </button>
                <span className="flex items-center px-2">Page {page} of {totalPages}</span>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={page >= totalPages}
                  className="rounded-full border border-border px-4 py-1.5 text-sm font-medium disabled:opacity-50 hover:bg-surface hover:scale-[1.02] transition-transform duration-200"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run the updated test to verify it passes**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
pnpm -F admin-portal test -- --reporter=verbose 2>&1 | grep -A 20 "users-list"
```
Expected: all tests in `users-list.test.tsx` PASS.

- [ ] **Step 5: Commit**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
git add apps/admin-portal/src/app/users/_components/AllUsersTab.tsx
git add apps/admin-portal/src/__tests__/users-list.test.tsx
git commit -m "refactor(admin-portal): extract AllUsersTab component from users/page"
```

---

### Task 2: Create `LabAssignmentsTab` component

Lift the entire content of `apps/admin-portal/src/app/staff/page.tsx` into a standalone component. Remove the `TopHeader` wrapper (the shell handles the header). Change the exported function name.

**Files:**
- Create: `apps/admin-portal/src/app/users/_components/LabAssignmentsTab.tsx`

- [ ] **Step 1: Write the failing test**

File: `apps/admin-portal/src/__tests__/users-tabs.test.tsx` — create this new file:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  usePathname: () => '/users',
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams(''),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      signOut: vi.fn().mockResolvedValue({}),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  }),
}))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: (selector: any) => {
    const state = {
      session: { email: 'admin@ultranos.com', userId: 'u1', practitionerId: 'p1', role: 'admin', sessionId: 's1' },
      clearSession: vi.fn(),
    }
    return selector(state)
  },
}))

const mockListUsers = vi.fn()
const mockListAllLabStaff = vi.fn()
const mockListLabsForFilter = vi.fn()
const mockGetManagerlessLabs = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      listUsers: { query: (...args: any[]) => mockListUsers(...args) },
      listAllLabStaff: { query: (...args: any[]) => mockListAllLabStaff(...args) },
      listLabsForFilter: { query: (...args: any[]) => mockListLabsForFilter(...args) },
      getManagerlessLabs: { query: (...args: any[]) => mockGetManagerlessLabs(...args) },
    },
  },
  setAccessToken: vi.fn(),
}))

// Import LabAssignmentsTab directly for isolation
const { default: LabAssignmentsTab } = await import('../app/users/_components/LabAssignmentsTab')

describe('LabAssignmentsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListLabsForFilter.mockResolvedValue([])
    mockGetManagerlessLabs.mockResolvedValue([])
  })

  it('renders the lab staff table with rows', async () => {
    mockListAllLabStaff.mockResolvedValue({
      items: [
        {
          practitionerId: 'p1',
          email: 'alice@clinic.com',
          labId: 'lab1',
          labName: 'Lab Alpha',
          labRole: 'LAB_TECH',
          lastActiveAt: new Date(Date.now() - 3_600_000).toISOString(),
          createdAt: '2026-01-15T00:00:00Z',
          labHasManager: true,
        },
      ],
      nextCursor: null,
    })

    render(<LabAssignmentsTab />)

    await waitFor(() => {
      expect(screen.getByText('Lab Alpha')).toBeTruthy()
    })

    expect(screen.getByText('Lab Tech')).toBeTruthy()
    expect(screen.getByText('1h ago')).toBeTruthy()
  })

  it('shows empty state when no staff found', async () => {
    mockListAllLabStaff.mockResolvedValue({ items: [], nextCursor: null })

    render(<LabAssignmentsTab />)

    await waitFor(() => {
      expect(screen.getByText('No staff found')).toBeTruthy()
    })
  })

  it('shows managerless labs warning when count > 0', async () => {
    mockGetManagerlessLabs.mockResolvedValue([{ id: 'lab1' }, { id: 'lab2' }])
    mockListAllLabStaff.mockResolvedValue({ items: [], nextCursor: null })

    render(<LabAssignmentsTab />)

    await waitFor(() => {
      expect(screen.getByText(/2 labs have no Lab Manager assigned/)).toBeTruthy()
    })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
pnpm -F admin-portal test -- --reporter=verbose 2>&1 | grep -A 10 "users-tabs"
```
Expected: FAIL — `Cannot find module '../app/users/_components/LabAssignmentsTab'`

- [ ] **Step 3: Create `LabAssignmentsTab.tsx`**

This is a direct lift of `apps/admin-portal/src/app/staff/page.tsx`, with two changes:
1. Remove the `TopHeader` wrapper and the outer `<>` fragment that wrapped it — the component returns just its inner `<div>` content
2. Rename `StaffPage` → `LabAssignmentsTab`

File: `apps/admin-portal/src/app/users/_components/LabAssignmentsTab.tsx`

```typescript
'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { ExportButton } from '@/components/ExportButton'
import { TriangleAlert } from '@ultranos/ui-kit/icons'

type LabRoleFilter = 'ALL' | 'LAB_TECH' | 'SENIOR_TECH' | 'SUPERVISOR' | 'LAB_MANAGER'
type ActivityFilter = 'ALL' | 'ACTIVE_7D' | 'INACTIVE'

interface StaffRow {
  practitionerId: string
  email: string
  labId: string
  labName: string
  labRole: string
  lastActiveAt: string | null
  createdAt: string
  labHasManager: boolean
}

interface LabOption {
  id: string
  labName: string
}

const ROLE_FILTERS: LabRoleFilter[] = ['ALL', 'LAB_TECH', 'SENIOR_TECH', 'SUPERVISOR', 'LAB_MANAGER']
const ROLE_LABELS: Record<LabRoleFilter, string> = {
  ALL: 'All Roles',
  LAB_TECH: 'Lab Tech',
  SENIOR_TECH: 'Senior Tech',
  SUPERVISOR: 'Supervisor',
  LAB_MANAGER: 'Lab Manager',
}
const ROLE_COLORS: Record<string, string> = {
  LAB_TECH: 'bg-blue-100 text-blue-800',
  SENIOR_TECH: 'bg-purple-100 text-purple-800',
  SUPERVISOR: 'bg-amber-100 text-amber-800',
  LAB_MANAGER: 'bg-success-subtle text-success',
}
const PAGE_SIZE = 20

function truncateEmail(email: string): string {
  if (!email) return ''
  const [local, domain] = email.split('@')
  if (!domain) return email
  return `${local.charAt(0)}***@${domain}`
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 0) return 'Just now'
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function RoleBadge({ role }: { role: string }) {
  const label = ROLE_LABELS[role as LabRoleFilter] ?? role
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_COLORS[role] ?? 'bg-surface text-text-secondary'}`}>
      {label}
    </span>
  )
}

export default function LabAssignmentsTab() {
  const router = useRouter()
  const [staff, setStaff] = useState<StaffRow[]>([])
  const [labs, setLabs] = useState<LabOption[]>([])
  const [labsError, setLabsError] = useState(false)
  const [managerlessCount, setManagerlessCount] = useState(0)
  const [roleFilter, setRoleFilter] = useState<LabRoleFilter>('ALL')
  const [labFilter, setLabFilter] = useState('')
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('ALL')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined])
  const [pageIndex, setPageIndex] = useState(0)
  const [nextCursor, setNextCursor] = useState<string | null>(null)

  useEffect(() => {
    trpc.admin.listLabsForFilter.query()
      .then(setLabs)
      .catch(() => setLabsError(true))

    trpc.admin.getManagerlessLabs.query()
      .then((labs) => setManagerlessCount(labs.length))
      .catch(() => {})
  }, [])

  const fetchStaff = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      setNextCursor(null)
      const result = await trpc.admin.listAllLabStaff.query({
        ...(roleFilter !== 'ALL' && { roleFilter }),
        ...(labFilter && { labFilter }),
        activityFilter,
        cursor: cursors[pageIndex],
        limit: PAGE_SIZE,
      })
      setStaff(result.items)
      setNextCursor(result.nextCursor)
    } catch {
      setError('Failed to load staff. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [roleFilter, labFilter, activityFilter, cursors, pageIndex])

  useEffect(() => {
    fetchStaff()
  }, [fetchStaff])

  function resetPagination() {
    setNextCursor(null)
    setCursors([undefined])
    setPageIndex(0)
  }

  function handleNext() {
    if (!nextCursor) return
    setCursors((prev) => {
      const updated = [...prev]
      if (pageIndex + 1 >= updated.length) updated.push(nextCursor)
      return updated
    })
    setPageIndex((prev) => prev + 1)
  }

  function handlePrevious() {
    if (pageIndex <= 0) return
    setPageIndex((prev) => prev - 1)
  }

  return (
    <div className="mx-auto max-w-7xl px-8 py-6">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Role filter — tab-style buttons */}
          <div className="flex rounded-full border border-border overflow-hidden">
            {ROLE_FILTERS.map((r) => (
              <button
                key={r}
                onClick={() => { setRoleFilter(r); resetPagination() }}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  roleFilter === r
                    ? 'bg-black text-white'
                    : 'bg-surface text-text-secondary hover:bg-accent-subtle'
                }`}
              >
                {ROLE_LABELS[r]}
              </button>
            ))}
          </div>

          <select
            value={labFilter}
            onChange={(e) => { setLabFilter(e.target.value); resetPagination() }}
            className="rounded-full border border-border bg-surface px-4 py-1.5 text-sm font-medium text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            aria-label="Filter by lab"
          >
            <option value="">All Labs</option>
            {labsError && <option disabled>Failed to load labs</option>}
            {labs.map((l) => (
              <option key={l.id} value={l.id}>
                {l.labName}
              </option>
            ))}
          </select>

          <select
            value={activityFilter}
            onChange={(e) => { setActivityFilter(e.target.value as ActivityFilter); resetPagination() }}
            className="rounded-full border border-border bg-surface px-4 py-1.5 text-sm font-medium text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            aria-label="Filter by activity"
          >
            <option value="ALL">All Activity</option>
            <option value="ACTIVE_7D">Active (7d)</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>

        <ExportButton
          exportFn={() =>
            trpc.admin.exportLabStaffCsv.mutate({
              ...(roleFilter !== 'ALL' && { roleFilter }),
              ...(labFilter && { labFilter }),
              activityFilter,
            })
          }
          filters={{}}
        />
      </div>

      {error && (
        <div className="mt-4 rounded-2xl bg-danger-subtle p-3 text-sm text-danger">{error}</div>
      )}

      {managerlessCount > 0 && (
        <div className="mt-4 flex items-center gap-2 rounded-2xl bg-warning-subtle p-3 text-sm text-warning">
          <TriangleAlert className="h-4 w-4 shrink-0" />
          Warning: {managerlessCount} lab{managerlessCount > 1 ? 's' : ''} have no Lab Manager assigned
        </div>
      )}

      {loading ? (
        <div className="mt-6 text-text-secondary">Loading staff...</div>
      ) : staff.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-border bg-white p-12 text-center">
          <p className="text-lg font-medium text-text-primary">No staff found</p>
          <p className="mt-1 text-sm text-text-muted">
            Adjust your filters or add staff to a lab.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-4 overflow-hidden rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-black">
                <tr>
                  <th className="ps-4 pe-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Email</th>
                  <th className="ps-4 pe-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Lab Name</th>
                  <th className="ps-4 pe-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Role</th>
                  <th className="ps-4 pe-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Last Active</th>
                  <th className="ps-4 pe-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Assigned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-surface-raised">
                {staff.map((row) => (
                  <tr
                    key={`${row.practitionerId}-${row.labId}`}
                    onClick={() => router.push(`/labs/${row.labId}/staff`)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') router.push(`/labs/${row.labId}/staff`) }}
                    tabIndex={0}
                    role="button"
                    className="cursor-pointer transition-colors hover:bg-brand-lime/5 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent"
                  >
                    <td className="ps-4 pe-4 py-3 text-text-muted">{truncateEmail(row.email)}</td>
                    <td className="ps-4 pe-4 py-3 font-medium text-text-primary">
                      <span className="flex items-center gap-1.5">
                        {row.labName}
                        {!row.labHasManager && (
                          <TriangleAlert className="h-4 w-4 text-warning shrink-0" />
                        )}
                      </span>
                    </td>
                    <td className="ps-4 pe-4 py-3"><RoleBadge role={row.labRole} /></td>
                    <td className="ps-4 pe-4 py-3 text-text-muted">{formatRelativeTime(row.lastActiveAt)}</td>
                    <td className="ps-4 pe-4 py-3 text-text-muted">{formatDate(row.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-text-secondary">
            <span>Page {pageIndex + 1}</span>
            <div className="flex gap-2">
              <button
                onClick={handlePrevious}
                disabled={pageIndex === 0}
                className="rounded-full border border-border px-4 py-1.5 text-sm font-medium disabled:opacity-50 hover:bg-surface hover:scale-[1.02] transition-transform duration-200"
              >
                Previous
              </button>
              <button
                onClick={handleNext}
                disabled={!nextCursor}
                className="rounded-full border border-border px-4 py-1.5 text-sm font-medium disabled:opacity-50 hover:bg-surface hover:scale-[1.02] transition-transform duration-200"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
pnpm -F admin-portal test -- --reporter=verbose 2>&1 | grep -A 20 "users-tabs"
```
Expected: all three tests in `users-tabs.test.tsx` PASS.

- [ ] **Step 5: Commit**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
git add apps/admin-portal/src/app/users/_components/LabAssignmentsTab.tsx
git add apps/admin-portal/src/__tests__/users-tabs.test.tsx
git commit -m "refactor(admin-portal): extract LabAssignmentsTab component from staff/page"
```

---

### Task 3: Rewrite `users/page.tsx` as the tab shell

Replace the current page with a thin shell that reads the `?tab` URL search param, renders two tab buttons, and delegates to the correct component. The tab buttons are `<Link>` elements so navigation is SEO-friendly and shareable.

**Files:**
- Rewrite: `apps/admin-portal/src/app/users/page.tsx`

- [ ] **Step 1: Add tab shell tests to `users-tabs.test.tsx`**

Append the following `describe` block to `apps/admin-portal/src/__tests__/users-tabs.test.tsx`:

```typescript
// Add this import at the top of the file (after the existing LabAssignmentsTab import):
// const { default: UsersPage } = await import('../app/users/page')

// Then add this describe block at the bottom of the file:

describe('UsersPage tab shell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListUsers.mockResolvedValue({ users: [], totalCount: 0 })
    mockListAllLabStaff.mockResolvedValue({ items: [], nextCursor: null })
    mockListLabsForFilter.mockResolvedValue([])
    mockGetManagerlessLabs.mockResolvedValue([])
  })

  it('renders "All Users" tab button and "Lab Assignments" tab button', async () => {
    const { default: UsersPage } = await import('../app/users/page')
    render(<UsersPage />)
    expect(screen.getByRole('link', { name: 'All Users' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Lab Assignments' })).toBeTruthy()
  })

  it('renders AllUsersTab content when no tab param (default)', async () => {
    // useSearchParams mock returns '' (no tab), so AllUsersTab should render
    const { default: UsersPage } = await import('../app/users/page')
    render(<UsersPage />)

    await waitFor(() => {
      // AllUsersTab shows this loading or empty state text
      expect(
        screen.queryByText('Loading users...') !== null ||
        screen.queryByText('No staff users yet') !== null
      ).toBe(true)
    })
  })

  it('renders LabAssignmentsTab content when ?tab=lab-assignments', async () => {
    // Re-mock useSearchParams to return lab-assignments tab
    vi.doMock('next/navigation', () => ({
      usePathname: () => '/users',
      useRouter: () => ({ push: mockPush }),
      useSearchParams: () => new URLSearchParams('tab=lab-assignments'),
    }))

    const { default: UsersPageWithTab } = await import('../app/users/page?tab=lab-assignments')
    render(<UsersPageWithTab />)

    await waitFor(() => {
      expect(
        screen.queryByText('Loading staff...') !== null ||
        screen.queryByText('No staff found') !== null
      ).toBe(true)
    })
  })
})
```

> **Note:** The third test uses `vi.doMock` (runtime mock, not hoisted) because the tab variant needs a different `useSearchParams` return value. If vitest module isolation makes this tricky, use a prop-based approach in the test by importing `AllUsersTab` / `LabAssignmentsTab` directly — the tab switching logic is already covered by the tab button rendering test.

- [ ] **Step 2: Run tests to verify the new shell tests fail**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
pnpm -F admin-portal test -- --reporter=verbose 2>&1 | grep -B 2 -A 5 "tab shell"
```
Expected: FAIL — `All Users` tab button not found (old page doesn't have tabs yet).

- [ ] **Step 3: Rewrite `users/page.tsx`**

File: `apps/admin-portal/src/app/users/page.tsx`

```typescript
'use client'

import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { TopHeader } from '@/components/TopHeader'
import AllUsersTab from './_components/AllUsersTab'
import LabAssignmentsTab from './_components/LabAssignmentsTab'

type TabId = 'all-users' | 'lab-assignments'

const TABS: { id: TabId; label: string }[] = [
  { id: 'all-users', label: 'All Users' },
  { id: 'lab-assignments', label: 'Lab Assignments' },
]

export default function UsersPage() {
  const searchParams = useSearchParams()
  const rawTab = searchParams.get('tab')
  const activeTab: TabId = rawTab === 'lab-assignments' ? 'lab-assignments' : 'all-users'

  return (
    <>
      <TopHeader title="Users" description="Manage staff accounts and lab assignments." />
      <div className="mx-auto max-w-7xl px-8 pt-6">
        {/* Tab navigation */}
        <div className="flex gap-1 rounded-full border border-border bg-surface p-1 w-fit">
          {TABS.map((tab) => (
            <Link
              key={tab.id}
              href={tab.id === 'all-users' ? '/users' : `/users?tab=${tab.id}`}
              className={`rounded-full px-5 py-1.5 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-black text-white'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
              aria-current={activeTab === tab.id ? 'page' : undefined}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </div>

      {activeTab === 'all-users' ? <AllUsersTab /> : <LabAssignmentsTab />}
    </>
  )
}
```

- [ ] **Step 4: Run all tests and verify they pass**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
pnpm -F admin-portal test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|users-tabs|users-list)"
```
Expected: both `users-list.test.tsx` and `users-tabs.test.tsx` pass. (If the `vi.doMock` tab test is flaky, see the note in Step 1 — skip it and rely on the component-level isolation tests.)

- [ ] **Step 5: Run typecheck**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
pnpm -F admin-portal typecheck
```
Expected: no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
git add apps/admin-portal/src/app/users/page.tsx
git commit -m "feat(admin-portal): rewrite users/page as tab shell with All Users + Lab Assignments tabs"
```

---

### Task 4: Replace `/staff/page.tsx` with a server-side redirect

The `/staff` route should silently forward any direct visitor to `/users?tab=lab-assignments`. Sub-routes (`/staff/[practitionerId]/certifications`, etc.) are unaffected — only `staff/page.tsx` changes.

**Files:**
- Rewrite: `apps/admin-portal/src/app/staff/page.tsx`

- [ ] **Step 1: Verify sub-routes are untouched**

```bash
ls "c:/Users/malan/OneDrive/Documents/Ultranos/apps/admin-portal/src/app/staff/"
```
Expected output shows both `page.tsx` and `[practitionerId]/` subdirectory. Only `page.tsx` will change.

- [ ] **Step 2: Rewrite `staff/page.tsx`**

`redirect()` from `next/navigation` works in server components. Remove `'use client'` entirely — this becomes a pure server component.

File: `apps/admin-portal/src/app/staff/page.tsx`

```typescript
import { redirect } from 'next/navigation'

export default function StaffPage() {
  redirect('/users?tab=lab-assignments')
}
```

- [ ] **Step 3: Verify the redirect compiles cleanly**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
pnpm -F admin-portal typecheck
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
git add apps/admin-portal/src/app/staff/page.tsx
git commit -m "feat(admin-portal): redirect /staff → /users?tab=lab-assignments"
```

---

### Task 5: Update the Sidebar

Remove the standalone "Staff" nav item. The "Users" item already covers both tabs — its active detection uses `pathname?.startsWith('/users/')` which correctly highlights when on `/users` or `/users?tab=lab-assignments` (query params don't affect `pathname`). Also remove the now-unused `Award` icon import.

**Files:**
- Modify: `apps/admin-portal/src/components/Sidebar.tsx`

- [ ] **Step 1: Update the failing sidebar test**

File: `apps/admin-portal/src/__tests__/sidebar-updated.test.tsx`

Add this test to the existing `describe` block:

```typescript
it('does NOT render a standalone "Staff" nav item', () => {
  render(<Sidebar collapsed={false} onToggle={() => {}} />)
  // "Staff" should not appear as a nav link (Award icon item removed)
  const staffLinks = screen.queryAllByRole('link', { name: 'Staff' })
  expect(staffLinks).toHaveLength(0)
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
pnpm -F admin-portal test -- --reporter=verbose 2>&1 | grep -A 5 "Staff.*nav"
```
Expected: FAIL — finds 1 link named "Staff" (the current nav item).

- [ ] **Step 3: Modify `Sidebar.tsx`**

Two changes:
1. Remove `Award` from the icon imports (line 27)
2. Remove the `{ label: 'Staff', href: '/staff', icon: Award }` entry from `navItems` (line 40)

**Change 1** — update the import block (lines 9–29):

```typescript
import {
  Home,
  User,
  FlaskConical,
  Package,
  Bell,
  FileText,
  Clock,
  Settings,
  Users,
  Plus,
  Receipt,
  Globe,
  SlidersHorizontal,
  FileCheck,
  ChevronLeft,
  Cpu,
  CreditCard,
  Wallet,
  LogOut,
} from '@ultranos/ui-kit/icons'
```

**Change 2** — update `navItems` to remove the Staff entry. The array should read:

```typescript
const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: Home },
  { label: 'Providers', href: '/providers', icon: User },
  { label: 'License Expiry', href: '/providers/expiry', icon: Clock, indent: true },
  { label: 'Labs', href: '/labs', icon: FlaskConical },
  { label: 'Inventory', href: '/inventory', icon: Package },
  { label: 'Suppliers', href: '/inventory/suppliers', icon: Plus, indent: true },
  { label: 'Network', href: '/network', icon: Globe },
  { label: 'Mentorship', href: '/mentorship', icon: Users },
  { label: 'Certifications', href: '/certifications', icon: FileCheck },
  { label: 'Users', href: '/users', icon: Users },
  { label: 'Create User', href: '/users/create', icon: Plus, indent: true },
  { label: 'Patients', href: '/patients', icon: User },
  { label: 'Merge Tool', href: '/patients/merge', icon: Plus, indent: true },
  { label: 'AI Models', href: '/ai-models', icon: Cpu },
  { label: 'Alerts', href: '/alerts', icon: Bell },
  { label: 'Alert Config', href: '/alerts/configuration', icon: SlidersHorizontal, indent: true },
  { label: 'Audit Log', href: '/audit', icon: FileText },
  { label: 'Subscriptions', href: '/subscriptions', icon: CreditCard },
  { label: 'Billing', href: '/subscriptions/billing', icon: Wallet, indent: true },
  { label: 'Invoices', href: '/subscriptions/invoices', icon: Receipt, indent: true },
  { label: 'Settings', href: '/settings', icon: Settings },
] as const
```

- [ ] **Step 4: Run all tests and confirm full suite passes**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
pnpm -F admin-portal test -- --reporter=verbose
```
Expected: all tests pass, including the new sidebar test asserting no "Staff" link.

- [ ] **Step 5: Run typecheck**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
pnpm -F admin-portal typecheck
```

- [ ] **Step 6: Commit**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
git add apps/admin-portal/src/components/Sidebar.tsx
git add apps/admin-portal/src/__tests__/sidebar-updated.test.tsx
git commit -m "feat(admin-portal): remove Staff sidebar item — consolidated into Users tabs"
```

---

## Self-Review

### Spec coverage
| Requirement | Covered by |
|-------------|-----------|
| `/users` shows both tabs | Task 3 — tab shell with `?tab` URL param |
| `?tab=lab-assignments` shows staff content | Task 3 — `LabAssignmentsTab` renders when tab param matches |
| `/staff` redirects to `/users?tab=lab-assignments` | Task 4 — server-side `redirect()` |
| Sidebar loses standalone Staff item | Task 5 — removed from navItems |
| Existing users list still works | Task 1 — `AllUsersTab` is a 1:1 extract |
| Existing staff/lab list still works | Task 2 — `LabAssignmentsTab` is a 1:1 extract |
| Sub-routes `/staff/[practitionerId]/...` unaffected | Task 4 — only `staff/page.tsx` replaced |
| No backend changes | All tRPC calls unchanged |

### Placeholder scan
No TBDs, TODOs, or "similar to above" references. All code blocks are complete.

### Type consistency
- `AllUsersTab` exports `formatRelativeTime` for test import — matches `users-list.test.tsx` import
- `LabAssignmentsTab` default export used in `users/page.tsx` — consistent
- `TabId` type is local to `users/page.tsx` — not leaked anywhere
