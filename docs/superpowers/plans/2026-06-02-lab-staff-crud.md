# Lab Staff CRUD — Assign & Remove Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give admins full CRUD for lab staff assignments: assign any practitioner to a lab with an initial role, and remove them — from both the per-lab staff page and the org-wide Lab Assignments tab.

**Architecture:** Two new tRPC mutations (`assignStaffToLab`, `removeStaffFromLab`) on the hub-api; a shared `AssignStaffModal` component reused in both UI surfaces; inline remove confirmation modals co-located with each page. No new routes — everything is modal-based.

**Tech Stack:** Next.js 15, TypeScript, tRPC, Supabase, Vitest, @testing-library/react, @testing-library/user-event

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| **Modify** | `apps/hub-api/src/trpc/routers/admin.ts` | Add `assignStaffToLab` + `removeStaffFromLab` procedures after `updateLabStaffRole` |
| **Create** | `apps/admin-portal/src/components/lab-staff/AssignStaffModal.tsx` | Shared modal: practitioner search + optional lab picker + role selector → calls `assignStaffToLab` |
| **Create** | `apps/admin-portal/src/__tests__/assign-staff-modal.test.tsx` | Tests for `AssignStaffModal` |
| **Modify** | `apps/admin-portal/src/app/labs/[labId]/staff/page.tsx` | Add "Add Staff" button (opens `AssignStaffModal` with `fixedLabId`), add "Remove" button + inline confirm modal per row |
| **Modify** | `apps/admin-portal/src/__tests__/lab-staff.test.tsx` | Add tests for Add Staff and Remove Staff flows |
| **Modify** | `apps/admin-portal/src/app/users/_components/LabAssignmentsTab.tsx` | Add "Assign to Lab" button (opens `AssignStaffModal` with `labs` prop), refresh list on success |
| **Modify** | `apps/admin-portal/src/__tests__/users-tabs.test.tsx` | Add tests for org-wide Assign to Lab flow |

---

### Task 1: Backend — `assignStaffToLab` and `removeStaffFromLab`

Add two new mutations to `apps/hub-api/src/trpc/routers/admin.ts`. Insert them immediately after the closing of the `updateLabStaffRole` procedure.

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/admin.ts`

- [ ] **Step 1: Locate the insertion point**

```bash
grep -n "updateLabStaffRole" "c:/Users/malan/OneDrive/Documents/Ultranos/apps/hub-api/src/trpc/routers/admin.ts" | head -5
```

Find the line number where `updateLabStaffRole` ends (closing `}),`). The two new procedures go immediately after it.

- [ ] **Step 2: Add `assignStaffToLab` and `removeStaffFromLab`**

In `apps/hub-api/src/trpc/routers/admin.ts`, after the closing `}),` of `updateLabStaffRole`, insert:

```typescript
  assignStaffToLab: adminProcedure
    .input(
      z.object({
        labId: z.string().uuid(),
        practitionerId: z.string().uuid(),
        initialRole: z.nativeEnum(LabRole),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify practitioner belongs to this org
      const { data: practitioner, error: practError } = await ctx.supabase
        .from('practitioners')
        .select('id')
        .eq('id', input.practitionerId)
        .eq('org_id', ctx.user.orgId)
        .maybeSingle()

      if (practError || !practitioner) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Practitioner not found in this organisation' })
      }

      // Reject duplicate assignment
      const { data: existing } = await ctx.supabase
        .from('lab_technicians')
        .select('practitioner_id')
        .eq('lab_id', input.labId)
        .eq('practitioner_id', input.practitionerId)
        .maybeSingle()

      if (existing) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Staff member is already assigned to this lab' })
      }

      const { error: insertError } = await ctx.supabase
        .from('lab_technicians')
        .insert({
          lab_id: input.labId,
          practitioner_id: input.practitionerId,
          lab_role: input.initialRole,
        })

      if (insertError) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to assign staff to lab' })
      }

      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'CREATE',
          resourceType: 'PRACTITIONER',
          resourceId: input.practitionerId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { labId: input.labId, initialRole: input.initialRole, endpoint: 'admin.assignStaffToLab' },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'CREATE', resourceType: 'PRACTITIONER', resourceId: input.practitionerId })
      }

      return { success: true }
    }),

  removeStaffFromLab: adminProcedure
    .input(
      z.object({
        labId: z.string().uuid(),
        practitionerId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Fetch all staff for this lab to run the last-manager invariant
      const { data: currentStaff, error: fetchError } = await ctx.supabase
        .from('lab_technicians')
        .select('practitioner_id, lab_role')
        .eq('lab_id', input.labId)

      if (fetchError) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch lab staff' })
      }

      const target = (currentStaff ?? []).find(
        (s: { practitioner_id: string; lab_role: string }) => s.practitioner_id === input.practitionerId,
      )

      if (!target) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Staff member is not assigned to this lab' })
      }

      // Invariant: must not remove the last LAB_MANAGER
      if (target.lab_role === 'LAB_MANAGER') {
        const managerCount = (currentStaff ?? []).filter(
          (s: { lab_role: string }) => s.lab_role === 'LAB_MANAGER',
        ).length
        if (managerCount <= 1) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Cannot remove the last Lab Manager from this lab',
          })
        }
      }

      const { error: deleteError } = await ctx.supabase
        .from('lab_technicians')
        .delete()
        .eq('lab_id', input.labId)
        .eq('practitioner_id', input.practitionerId)

      if (deleteError) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to remove staff from lab' })
      }

      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'DELETE',
          resourceType: 'PRACTITIONER',
          resourceId: input.practitionerId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { labId: input.labId, removedRole: target.lab_role, endpoint: 'admin.removeStaffFromLab' },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'DELETE', resourceType: 'PRACTITIONER', resourceId: input.practitionerId })
      }

      return { success: true }
    }),
```

- [ ] **Step 3: Run typecheck on hub-api**

```bash
cd "c:/Users/malan/OneDrive/Documents/Ultranos"
pnpm -F hub-api typecheck 2>&1 | head -30
```
Expected: no errors from the new procedures.

- [ ] **Step 4: Commit**

```bash
cd "c:/Users/malan/OneDrive/Documents/Ultranos"
git add apps/hub-api/src/trpc/routers/admin.ts
git commit -m "feat(hub-api): add assignStaffToLab and removeStaffFromLab tRPC mutations"
```

---

### Task 2: `AssignStaffModal` shared component

A reusable modal that handles both contexts:
- **Per-lab** (`fixedLabId` provided): hides lab picker, shows practitioner search + role selector
- **Org-wide** (`labs` provided): shows lab dropdown + practitioner search + role selector

Practitioner search calls `listUsers` (debounced 300ms, min 2 chars). Role selector defaults to `LAB_TECH`.

**Files:**
- Create: `apps/admin-portal/src/components/lab-staff/AssignStaffModal.tsx`
- Create: `apps/admin-portal/src/__tests__/assign-staff-modal.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/admin-portal/src/__tests__/assign-staff-modal.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/users',
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a>,
}))

const mockListUsers = vi.fn()
const mockAssignStaffToLab = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      listUsers: { query: (...args: any[]) => mockListUsers(...args) },
      assignStaffToLab: { mutate: (...args: any[]) => mockAssignStaffToLab(...args) },
    },
  },
  setAccessToken: vi.fn(),
}))

const mockOnAssigned = vi.fn()
const mockOnClose = vi.fn()

const { default: AssignStaffModal } = await import('../components/lab-staff/AssignStaffModal')

const mockUsers = [
  { id: 'p1', name: 'Alice Smith', email: 'alice@clinic.com', role: 'LAB_TECH', status: 'ACTIVE', moduleCode: null, moduleName: null, mfaEnrolled: true, lastLoginAt: null, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'p2', name: 'Bob Jones', email: 'bob@clinic.com', role: 'LAB_TECH', status: 'ACTIVE', moduleCode: null, moduleName: null, mfaEnrolled: false, lastLoginAt: null, createdAt: '2026-01-02T00:00:00Z' },
]

const mockLabs = [
  { id: 'lab-1', labName: 'Lab Alpha' },
  { id: 'lab-2', labName: 'Lab Beta' },
]

describe('AssignStaffModal — per-lab context (fixedLabId)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListUsers.mockResolvedValue({ users: [], totalCount: 0 })
  })

  it('renders the modal with title and role selector', () => {
    render(
      <AssignStaffModal
        fixedLabId="lab-1"
        onAssigned={mockOnAssigned}
        onClose={mockOnClose}
      />
    )
    expect(screen.getByText('Assign Staff to Lab')).toBeTruthy()
    expect(screen.getByLabelText('Initial role')).toBeTruthy()
    // Lab dropdown NOT shown when fixedLabId is provided
    expect(screen.queryByLabelText('Lab')).toBeNull()
  })

  it('shows search results when user types 2+ characters', async () => {
    mockListUsers.mockResolvedValue({ users: mockUsers, totalCount: 2 })
    const user = userEvent.setup()

    render(
      <AssignStaffModal
        fixedLabId="lab-1"
        onAssigned={mockOnAssigned}
        onClose={mockOnClose}
      />
    )

    const searchInput = screen.getByPlaceholderText('Search by name or email...')
    await user.type(searchInput, 'ali')

    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeTruthy()
    })
    expect(screen.getByText('alice@clinic.com')).toBeTruthy()
  })

  it('calls assignStaffToLab with correct args and invokes onAssigned', async () => {
    mockListUsers.mockResolvedValue({ users: mockUsers, totalCount: 2 })
    mockAssignStaffToLab.mockResolvedValue({ success: true })
    const user = userEvent.setup()

    render(
      <AssignStaffModal
        fixedLabId="lab-1"
        onAssigned={mockOnAssigned}
        onClose={mockOnClose}
      />
    )

    await user.type(screen.getByPlaceholderText('Search by name or email...'), 'ali')

    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeTruthy()
    })

    await user.click(screen.getByText('Alice Smith'))

    const assignBtn = screen.getByRole('button', { name: 'Assign' })
    await user.click(assignBtn)

    await waitFor(() => {
      expect(mockAssignStaffToLab).toHaveBeenCalledWith({
        labId: 'lab-1',
        practitionerId: 'p1',
        initialRole: 'LAB_TECH',
      })
    })
    expect(mockOnAssigned).toHaveBeenCalled()
  })

  it('shows error message on CONFLICT (already assigned)', async () => {
    mockListUsers.mockResolvedValue({ users: mockUsers, totalCount: 2 })
    mockAssignStaffToLab.mockRejectedValue(new Error('Staff member is already assigned to this lab'))
    const user = userEvent.setup()

    render(
      <AssignStaffModal
        fixedLabId="lab-1"
        onAssigned={mockOnAssigned}
        onClose={mockOnClose}
      />
    )

    await user.type(screen.getByPlaceholderText('Search by name or email...'), 'ali')
    await waitFor(() => { expect(screen.getByText('Alice Smith')).toBeTruthy() })
    await user.click(screen.getByText('Alice Smith'))
    await user.click(screen.getByRole('button', { name: 'Assign' }))

    await waitFor(() => {
      expect(screen.getByText('Staff member is already assigned to this lab')).toBeTruthy()
    })
    expect(mockOnAssigned).not.toHaveBeenCalled()
  })

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup()
    render(
      <AssignStaffModal
        fixedLabId="lab-1"
        onAssigned={mockOnAssigned}
        onClose={mockOnClose}
      />
    )
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(mockOnClose).toHaveBeenCalled()
  })
})

describe('AssignStaffModal — org-wide context (labs prop)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListUsers.mockResolvedValue({ users: [], totalCount: 0 })
  })

  it('renders lab dropdown when labs prop is provided', () => {
    render(
      <AssignStaffModal
        labs={mockLabs}
        onAssigned={mockOnAssigned}
        onClose={mockOnClose}
      />
    )
    expect(screen.getByLabelText('Lab')).toBeTruthy()
    expect(screen.getByText('Lab Alpha')).toBeTruthy()
    expect(screen.getByText('Lab Beta')).toBeTruthy()
  })

  it('calls assignStaffToLab with selected lab when submitted', async () => {
    mockListUsers.mockResolvedValue({ users: mockUsers, totalCount: 2 })
    mockAssignStaffToLab.mockResolvedValue({ success: true })
    const user = userEvent.setup()

    render(
      <AssignStaffModal
        labs={mockLabs}
        onAssigned={mockOnAssigned}
        onClose={mockOnClose}
      />
    )

    await user.selectOptions(screen.getByLabelText('Lab'), 'lab-2')
    await user.type(screen.getByPlaceholderText('Search by name or email...'), 'bob')

    await waitFor(() => { expect(screen.getByText('Bob Jones')).toBeTruthy() })
    await user.click(screen.getByText('Bob Jones'))
    await user.click(screen.getByRole('button', { name: 'Assign' }))

    await waitFor(() => {
      expect(mockAssignStaffToLab).toHaveBeenCalledWith({
        labId: 'lab-2',
        practitionerId: 'p2',
        initialRole: 'LAB_TECH',
      })
    })
  })

  it('Assign button is disabled until both a lab and a practitioner are selected', async () => {
    render(
      <AssignStaffModal
        labs={mockLabs}
        onAssigned={mockOnAssigned}
        onClose={mockOnClose}
      />
    )
    expect(screen.getByRole('button', { name: 'Assign' })).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
cd "c:/Users/malan/OneDrive/Documents/Ultranos"
pnpm -F admin-portal test -- --reporter=verbose 2>&1 | grep -A 5 "assign-staff-modal"
```
Expected: FAIL — Cannot find module `AssignStaffModal`.

- [ ] **Step 3: Create `AssignStaffModal.tsx`**

Create `apps/admin-portal/src/components/lab-staff/AssignStaffModal.tsx`:

```typescript
'use client'

import { useState, useEffect, useRef } from 'react'
import { trpc } from '@/lib/trpc'

type LabRole = 'LAB_TECH' | 'SENIOR_TECH' | 'SUPERVISOR' | 'LAB_MANAGER'

const LAB_ROLES: { value: LabRole; label: string }[] = [
  { value: 'LAB_TECH', label: 'Lab Tech' },
  { value: 'SENIOR_TECH', label: 'Senior Tech' },
  { value: 'SUPERVISOR', label: 'Supervisor' },
  { value: 'LAB_MANAGER', label: 'Lab Manager' },
]

interface LabOption {
  id: string
  labName: string
}

interface PractitionerResult {
  id: string
  name: string
  email: string
}

interface AssignStaffModalProps {
  /** Pre-fills and locks the lab field. Use from the per-lab staff page. */
  fixedLabId?: string
  /** Available labs for the dropdown. Use from the org-wide tab. */
  labs?: LabOption[]
  onAssigned: () => void
  onClose: () => void
}

export default function AssignStaffModal({
  fixedLabId,
  labs,
  onAssigned,
  onClose,
}: AssignStaffModalProps) {
  const [selectedLabId, setSelectedLabId] = useState(fixedLabId ?? '')
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<PractitionerResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedPractitioner, setSelectedPractitioner] = useState<PractitionerResult | null>(null)
  const [selectedRole, setSelectedRole] = useState<LabRole>('LAB_TECH')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced practitioner search
  useEffect(() => {
    if (search.length < 2) {
      setResults([])
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        setSearching(true)
        const result = await trpc.admin.listUsers.query({ page: 1, pageSize: 8, search })
        setResults(
          result.users.map((u: { id: string; name: string; email: string }) => ({
            id: u.id,
            name: u.name,
            email: u.email,
          })),
        )
      } catch {
        // search errors are non-critical; just clear results
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [search])

  const canSubmit = selectedLabId !== '' && selectedPractitioner !== null && !submitting

  async function handleSubmit() {
    if (!canSubmit || !selectedPractitioner) return
    try {
      setSubmitting(true)
      setError(null)
      await trpc.admin.assignStaffToLab.mutate({
        labId: selectedLabId,
        practitionerId: selectedPractitioner.id,
        initialRole: selectedRole,
      })
      onAssigned()
    } catch (err: any) {
      setError(err?.message ?? 'Failed to assign staff')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-surface-raised p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-text-primary">Assign Staff to Lab</h2>

        <div className="mt-4 space-y-4">
          {/* Lab selector — only shown in org-wide context */}
          {!fixedLabId && labs && (
            <div>
              <label
                htmlFor="assign-lab-select"
                className="block text-sm font-medium text-text-secondary mb-1"
              >
                Lab
              </label>
              <select
                id="assign-lab-select"
                aria-label="Lab"
                value={selectedLabId}
                onChange={(e) => setSelectedLabId(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="">Select a lab…</option>
                {labs.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.labName}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Practitioner search */}
          <div>
            <label
              htmlFor="assign-practitioner-search"
              className="block text-sm font-medium text-text-secondary mb-1"
            >
              Practitioner
            </label>
            <input
              id="assign-practitioner-search"
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setSelectedPractitioner(null)
              }}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent"
            />

            {/* Search results */}
            {search.length >= 2 && (
              <div className="mt-1 rounded-xl border border-border bg-surface-raised shadow-sm overflow-hidden">
                {searching ? (
                  <p className="px-3 py-2 text-sm text-text-secondary">Searching…</p>
                ) : results.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-text-secondary">No practitioners found</p>
                ) : (
                  <ul>
                    {results.map((p) => (
                      <li
                        key={p.id}
                        onClick={() => {
                          setSelectedPractitioner(p)
                          setSearch(p.name)
                          setResults([])
                        }}
                        className={`px-3 py-2 cursor-pointer text-sm hover:bg-accent-subtle ${
                          selectedPractitioner?.id === p.id ? 'bg-accent-subtle font-medium' : ''
                        }`}
                      >
                        <span className="text-text-primary">{p.name}</span>
                        <span className="ml-2 text-text-secondary">{p.email}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Role selector */}
          <div>
            <label
              htmlFor="assign-role-select"
              className="block text-sm font-medium text-text-secondary mb-1"
            >
              Initial role
            </label>
            <select
              id="assign-role-select"
              aria-label="Initial role"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as LabRole)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            >
              {LAB_ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl bg-danger-subtle p-3 text-sm text-danger">{error}</div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-full border border-border px-6 py-2.5 text-sm text-text-primary hover:bg-surface hover:scale-[1.02] transition-transform duration-200"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-text-primary disabled:opacity-50 hover:scale-[1.02] transition-transform duration-200"
          >
            {submitting ? 'Assigning…' : 'Assign'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
cd "c:/Users/malan/OneDrive/Documents/Ultranos"
pnpm -F admin-portal test -- --reporter=verbose 2>&1 | grep -E "(assign-staff-modal|PASS|FAIL)" | head -30
```
Expected: all 8 tests in `assign-staff-modal.test.tsx` pass.

- [ ] **Step 5: Run typecheck**

```bash
cd "c:/Users/malan/OneDrive/Documents/Ultranos"
pnpm -F admin-portal typecheck 2>&1 | head -20
```

- [ ] **Step 6: Commit**

```bash
cd "c:/Users/malan/OneDrive/Documents/Ultranos"
git add apps/admin-portal/src/components/lab-staff/AssignStaffModal.tsx
git add apps/admin-portal/src/__tests__/assign-staff-modal.test.tsx
git commit -m "feat(admin-portal): add AssignStaffModal shared component"
```

---

### Task 3: Wire CRUD into `/labs/[labId]/staff/page.tsx`

Add two capabilities to the per-lab staff page:
1. **"Add Staff" button** in the page header → opens `AssignStaffModal` with `fixedLabId`
2. **"Remove" button** per table row → opens an inline `RemoveStaffModal` confirmation

`RemoveStaffModal` is defined in the same file as `RoleChangeModal` (same pattern, same file).

**Files:**
- Modify: `apps/admin-portal/src/app/labs/[labId]/staff/page.tsx`
- Modify: `apps/admin-portal/src/__tests__/lab-staff.test.tsx`

- [ ] **Step 1: Add new tests to `lab-staff.test.tsx`**

The existing `vi.mock('@/lib/trpc', ...)` block only mocks `listLabStaff` and `updateLabStaffRole`. Add `assignStaffToLab` and `removeStaffFromLab` to it:

```typescript
// Update the existing vi.mock('@/lib/trpc', ...) block to:
vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      listLabStaff: { query: (...args: any[]) => mockQuery('listLabStaff', ...args) },
      updateLabStaffRole: { mutate: (...args: any[]) => mockMutate('updateLabStaffRole', ...args) },
      removeStaffFromLab: { mutate: (...args: any[]) => mockMutate('removeStaffFromLab', ...args) },
      listUsers: { query: (...args: any[]) => mockQuery('listUsers', ...args) },
      assignStaffToLab: { mutate: (...args: any[]) => mockMutate('assignStaffToLab', ...args) },
    },
  },
}))
```

Also add `mockQuery.mockReturnValue(Promise.resolve([]))` for `listUsers` in `beforeEach` since `AssignStaffModal` calls it when searching.

Then append these new tests to the existing `describe('Lab Staff Page', ...)` block:

```typescript
  it('renders "Add Staff" button', async () => {
    mockQuery.mockImplementation((name: string) => {
      if (name === 'listLabStaff') return Promise.resolve(mockStaffList)
      return Promise.resolve({ users: [], totalCount: 0 })
    })

    render(<LabStaffPage />)

    await waitFor(() => {
      expect(screen.getByText('tech1@lab.com')).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: 'Add Staff' })).toBeInTheDocument()
  })

  it('"Add Staff" button opens AssignStaffModal', async () => {
    mockQuery.mockImplementation((name: string) => {
      if (name === 'listLabStaff') return Promise.resolve(mockStaffList)
      return Promise.resolve({ users: [], totalCount: 0 })
    })
    const user = userEvent.setup()

    render(<LabStaffPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add Staff' })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Add Staff' }))

    await waitFor(() => {
      expect(screen.getByText('Assign Staff to Lab')).toBeInTheDocument()
    })
  })

  it('each staff row has a "Remove" button', async () => {
    mockQuery.mockImplementation((name: string) => {
      if (name === 'listLabStaff') return Promise.resolve(mockStaffList)
      return Promise.resolve({ users: [], totalCount: 0 })
    })

    render(<LabStaffPage />)

    await waitFor(() => {
      expect(screen.getByText('tech1@lab.com')).toBeInTheDocument()
    })

    const removeButtons = screen.getAllByRole('button', { name: 'Remove' })
    expect(removeButtons).toHaveLength(3)
  })

  it('"Remove" button opens confirmation modal', async () => {
    mockQuery.mockImplementation((name: string) => {
      if (name === 'listLabStaff') return Promise.resolve(mockStaffList)
      return Promise.resolve({ users: [], totalCount: 0 })
    })
    const user = userEvent.setup()

    render(<LabStaffPage />)

    await waitFor(() => {
      expect(screen.getByText('tech1@lab.com')).toBeInTheDocument()
    })

    const removeButtons = screen.getAllByRole('button', { name: 'Remove' })
    await user.click(removeButtons[0])

    await waitFor(() => {
      expect(screen.getByText('Remove Staff Member')).toBeInTheDocument()
      expect(screen.getByText(/are you sure/i)).toBeInTheDocument()
    })
  })

  it('confirmed removal calls removeStaffFromLab and refreshes list', async () => {
    mockQuery.mockImplementation((name: string) => {
      if (name === 'listLabStaff') return Promise.resolve(mockStaffList)
      return Promise.resolve({ users: [], totalCount: 0 })
    })
    mockMutate.mockImplementation((name: string) => {
      if (name === 'removeStaffFromLab') return Promise.resolve({ success: true })
      return Promise.resolve({})
    })
    const user = userEvent.setup()

    render(<LabStaffPage />)

    await waitFor(() => {
      expect(screen.getByText('tech1@lab.com')).toBeInTheDocument()
    })

    const removeButtons = screen.getAllByRole('button', { name: 'Remove' })
    await user.click(removeButtons[0])

    await waitFor(() => {
      expect(screen.getByText('Remove Staff Member')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Confirm Remove' }))

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith('removeStaffFromLab', {
        labId: 'lab-1',
        practitionerId: '11111111-aaaa-bbbb-cccc-dddddddddddd',
      })
    })

    // Refreshes after removal
    expect(mockQuery).toHaveBeenCalledWith('listLabStaff', { labId: 'lab-1' })
  })

  it('last-manager removal error shows error message', async () => {
    mockQuery.mockImplementation((name: string) => {
      if (name === 'listLabStaff') return Promise.resolve(mockStaffList)
      return Promise.resolve({ users: [], totalCount: 0 })
    })
    mockMutate.mockImplementation((name: string) => {
      if (name === 'removeStaffFromLab') {
        return Promise.reject(new Error('Cannot remove the last Lab Manager from this lab'))
      }
      return Promise.resolve({})
    })
    const user = userEvent.setup()

    render(<LabStaffPage />)

    await waitFor(() => {
      expect(screen.getByText('manager@lab.com')).toBeInTheDocument()
    })

    // Remove the LAB_MANAGER (index 1)
    const removeButtons = screen.getAllByRole('button', { name: 'Remove' })
    await user.click(removeButtons[1])

    await waitFor(() => {
      expect(screen.getByText('Remove Staff Member')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Confirm Remove' }))

    await waitFor(() => {
      expect(screen.getByText('Cannot remove the last Lab Manager from this lab')).toBeInTheDocument()
    })
  })
```

- [ ] **Step 2: Run tests to confirm new tests fail**

```bash
cd "c:/Users/malan/OneDrive/Documents/Ultranos"
pnpm -F admin-portal test -- --reporter=verbose 2>&1 | grep -E "(lab-staff|PASS|FAIL)" | head -20
```
Expected: existing 7 tests pass, new 6 tests FAIL.

- [ ] **Step 3: Modify `labs/[labId]/staff/page.tsx`**

Read the full current file first, then apply these changes:

**3a.** Add the `AssignStaffModal` import at the top:
```typescript
import AssignStaffModal from '@/components/lab-staff/AssignStaffModal'
```

**3b.** Add a `RemoveStaffModal` component definition in the file, immediately after `RoleChangeModal`:

```typescript
/** Confirmation modal for staff removal */
function RemoveStaffModal({
  email,
  onConfirm,
  onCancel,
  submitting,
}: {
  email: string
  onConfirm: () => void
  onCancel: () => void
  submitting: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div className="w-full max-w-md rounded-2xl bg-surface-raised p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-text-primary">Remove Staff Member</h2>
        <p className="mt-3 text-sm text-text-secondary">
          Are you sure you want to remove{' '}
          <span className="font-medium text-text-primary">{truncate(email, 30) || 'this staff member'}</span>{' '}
          from this lab? This cannot be undone.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-full border border-border text-text-primary px-6 py-2.5 text-sm hover:bg-surface hover:scale-[1.02] transition-transform duration-200"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting}
            className="rounded-full px-6 py-2.5 text-sm font-semibold bg-danger text-white disabled:opacity-50 hover:scale-[1.02] transition-transform duration-200"
            aria-label="Confirm Remove"
          >
            {submitting ? 'Removing…' : 'Confirm Remove'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

**3c.** In `LabStaffPage`, add state for both modals:

```typescript
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [pendingRemove, setPendingRemove] = useState<{
    practitionerId: string
    email: string
  } | null>(null)
```

**3d.** Add `handleConfirmRemove` function inside `LabStaffPage` (after `handleConfirmRoleChange`):

```typescript
  async function handleConfirmRemove() {
    if (!pendingRemove) return
    try {
      setSubmitting(true)
      setError(null)
      await trpc.admin.removeStaffFromLab.mutate({
        labId,
        practitionerId: pendingRemove.practitionerId,
      })
      setPendingRemove(null)
      setSuccessMessage('Staff member removed successfully')
      await fetchStaff()
      setTimeout(() => setSuccessMessage(null), 5000)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to remove staff member')
      setPendingRemove(null)
    } finally {
      setSubmitting(false)
    }
  }
```

**3e.** Add the "Add Staff" button in the JSX. Replace:
```typescript
        <button
          onClick={() => router.push(`/labs/${labId}`)}
          className="text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          &larr; Back to Lab Detail
        </button>
```
with:
```typescript
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.push(`/labs/${labId}`)}
            className="text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            &larr; Back to Lab Detail
          </button>
          <button
            onClick={() => setShowAssignModal(true)}
            className="rounded-full bg-brand-lime px-5 py-2 text-sm font-semibold text-black hover:bg-brand-lime/90 transition-colors"
            aria-label="Add Staff"
          >
            Add Staff
          </button>
        </div>
```

**3f.** Add a "Remove" button cell to each table row. In the `<thead>`, add a column:
```typescript
                <th className="px-4 py-3 text-start font-medium">Actions</th>
```

In the `<tbody>` row, add after the Assigned cell:
```typescript
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setPendingRemove({ practitionerId: member.practitionerId, email: member.email })}
                        className="rounded-full border border-danger px-3 py-1 text-xs font-medium text-danger hover:bg-danger-subtle transition-colors"
                        aria-label="Remove"
                      >
                        Remove
                      </button>
                    </td>
```

**3g.** Add both modals at the bottom of the returned JSX, after the existing `{pendingChange && <RoleChangeModal ... />}`:

```typescript
        {pendingRemove && (
          <RemoveStaffModal
            email={pendingRemove.email}
            onConfirm={handleConfirmRemove}
            onCancel={() => setPendingRemove(null)}
            submitting={submitting}
          />
        )}

        {showAssignModal && (
          <AssignStaffModal
            fixedLabId={labId}
            onAssigned={async () => {
              setShowAssignModal(false)
              setSuccessMessage('Staff member assigned successfully')
              await fetchStaff()
              setTimeout(() => setSuccessMessage(null), 5000)
            }}
            onClose={() => setShowAssignModal(false)}
          />
        )}
```

- [ ] **Step 4: Run the full lab-staff test suite**

```bash
cd "c:/Users/malan/OneDrive/Documents/Ultranos"
pnpm -F admin-portal test -- --reporter=verbose 2>&1 | grep -E "(lab-staff|PASS|FAIL)" | head -30
```
Expected: all 13 tests pass (7 original + 6 new).

- [ ] **Step 5: Run typecheck**

```bash
cd "c:/Users/malan/OneDrive/Documents/Ultranos"
pnpm -F admin-portal typecheck 2>&1 | head -20
```

- [ ] **Step 6: Commit**

```bash
cd "c:/Users/malan/OneDrive/Documents/Ultranos"
git add apps/admin-portal/src/app/labs/[labId]/staff/page.tsx
git add apps/admin-portal/src/__tests__/lab-staff.test.tsx
git commit -m "feat(admin-portal): add Add Staff and Remove Staff CRUD to per-lab staff page"
```

---

### Task 4: Wire "Assign to Lab" into `LabAssignmentsTab`

Add an "Assign to Lab" button to the org-wide tab. It opens `AssignStaffModal` with the `labs` prop (already loaded in the tab's state). After a successful assignment, refresh the staff list.

**Files:**
- Modify: `apps/admin-portal/src/app/users/_components/LabAssignmentsTab.tsx`
- Modify: `apps/admin-portal/src/__tests__/users-tabs.test.tsx`

- [ ] **Step 1: Add new tests to `users-tabs.test.tsx`**

The existing trpc mock in `users-tabs.test.tsx` needs `assignStaffToLab` and `listUsers` added. Update the `vi.mock('@/lib/trpc', ...)` block to include them:

```typescript
// Add to the existing trpc mock:
listUsers: { query: vi.fn().mockResolvedValue({ users: [], totalCount: 0 }) },
assignStaffToLab: { mutate: vi.fn().mockResolvedValue({ success: true }) },
```

Append these tests to the existing `describe('LabAssignmentsTab', ...)` block:

```typescript
  it('renders "Assign to Lab" button', async () => {
    const { default: LabAssignmentsTab } = await import('../app/users/_components/LabAssignmentsTab')
    mockListAllLabStaff.mockResolvedValue({ items: [], nextCursor: null })
    mockListLabsForFilter.mockResolvedValue([{ id: 'lab-1', labName: 'Lab Alpha' }])

    render(<LabAssignmentsTab />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Assign to Lab' })).toBeTruthy()
    })
  })

  it('"Assign to Lab" button opens AssignStaffModal with lab dropdown', async () => {
    const { default: LabAssignmentsTab } = await import('../app/users/_components/LabAssignmentsTab')
    mockListAllLabStaff.mockResolvedValue({ items: [], nextCursor: null })
    mockListLabsForFilter.mockResolvedValue([
      { id: 'lab-1', labName: 'Lab Alpha' },
      { id: 'lab-2', labName: 'Lab Beta' },
    ])
    const user = userEvent.setup()

    render(<LabAssignmentsTab />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Assign to Lab' })).toBeTruthy()
    })

    await user.click(screen.getByRole('button', { name: 'Assign to Lab' }))

    await waitFor(() => {
      expect(screen.getByText('Assign Staff to Lab')).toBeTruthy()
      // Lab dropdown is present (org-wide context)
      expect(screen.getByLabelText('Lab')).toBeTruthy()
    })
  })
```

- [ ] **Step 2: Run the tests to confirm new tests fail**

```bash
cd "c:/Users/malan/OneDrive/Documents/Ultranos"
pnpm -F admin-portal test -- --reporter=verbose 2>&1 | grep -E "(users-tabs|PASS|FAIL)" | head -20
```
Expected: existing 4 tests pass, 2 new tests FAIL — "Assign to Lab" button not found.

- [ ] **Step 3: Modify `LabAssignmentsTab.tsx`**

Read the current file first, then apply:

**3a.** Add the `AssignStaffModal` import at the top:
```typescript
import AssignStaffModal from '@/components/lab-staff/AssignStaffModal'
```

**3b.** Add `showAssignModal` state inside `LabAssignmentsTab`:
```typescript
  const [showAssignModal, setShowAssignModal] = useState(false)
```

**3c.** In the filter bar JSX, add the "Assign to Lab" button alongside the `ExportButton`. Replace:
```typescript
        {/* Export */}
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
```
with:
```typescript
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAssignModal(true)}
            className="rounded-full bg-brand-lime px-5 py-2 text-sm font-semibold text-black hover:bg-brand-lime/90 transition-colors"
            aria-label="Assign to Lab"
          >
            Assign to Lab
          </button>
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
```

**3d.** Add the `AssignStaffModal` at the end of the returned JSX, just before the closing `</div>`:
```typescript
      {showAssignModal && (
        <AssignStaffModal
          labs={labs}
          onAssigned={async () => {
            setShowAssignModal(false)
            resetPagination()
            await fetchStaff()
          }}
          onClose={() => setShowAssignModal(false)}
        />
      )}
```

- [ ] **Step 4: Run all tests**

```bash
cd "c:/Users/malan/OneDrive/Documents/Ultranos"
pnpm -F admin-portal test -- --reporter=verbose 2>&1 | grep -E "(users-tabs|assign-staff-modal|lab-staff|PASS|FAIL)" | head -40
```
Expected: all tests in `users-tabs.test.tsx`, `assign-staff-modal.test.tsx`, and `lab-staff.test.tsx` pass.

- [ ] **Step 5: Run typecheck**

```bash
cd "c:/Users/malan/OneDrive/Documents/Ultranos"
pnpm -F admin-portal typecheck 2>&1 | head -20
```

- [ ] **Step 6: Commit**

```bash
cd "c:/Users/malan/OneDrive/Documents/Ultranos"
git add apps/admin-portal/src/app/users/_components/LabAssignmentsTab.tsx
git add apps/admin-portal/src/__tests__/users-tabs.test.tsx
git commit -m "feat(admin-portal): add Assign to Lab button to LabAssignmentsTab (org-wide CRUD)"
```

---

## Self-Review

### Spec coverage

| Requirement | Task |
|-------------|------|
| `assignStaffToLab` backend mutation with duplicate guard | Task 1 |
| `removeStaffFromLab` backend mutation with last-manager guard | Task 1 |
| Both mutations emit audit events | Task 1 |
| `AssignStaffModal` shared component | Task 2 |
| Per-lab surface: "Add Staff" button → modal with `fixedLabId` | Task 3 |
| Per-lab surface: "Remove" button per row → confirmation modal | Task 3 |
| Org-wide surface: "Assign to Lab" button → modal with lab dropdown | Task 4 |
| Successful assign refreshes list in both surfaces | Tasks 3, 4 |
| Error messages surfaced for CONFLICT (duplicate / last-manager) | Tasks 2, 3 |

### Placeholder scan

No TBDs, TODOs, or "similar to above" references. All code blocks are complete and self-contained.

### Type consistency

- `LabRole` type (`'LAB_TECH' | 'SENIOR_TECH' | 'SUPERVISOR' | 'LAB_MANAGER'`) is defined locally in `AssignStaffModal.tsx` and `LabStaffPage` — consistent spelling throughout
- `LabOption` (`{ id: string; labName: string }`) is used in both `AssignStaffModal` props and `LabAssignmentsTab` state — field names match
- `assignStaffToLab` input `{ labId, practitionerId, initialRole }` matches between backend (Task 1) and modal call (Task 2)
- `removeStaffFromLab` input `{ labId, practitionerId }` matches between backend (Task 1) and per-lab page call (Task 3)
- `handleConfirmRemove` uses `pendingRemove.practitionerId` — matches the `pendingRemove` state shape `{ practitionerId, email }`
- `AssignStaffModal` prop `fixedLabId` used as `selectedLabId` initial value — correctly initialised as `fixedLabId ?? ''`
- `fetchStaff` is `async` in `LabAssignmentsTab` — awaited correctly in `onAssigned` callback
