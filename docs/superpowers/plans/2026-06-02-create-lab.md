# Create Lab & Schema Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix broken lab query column references (`name` → `lab_name`), add org-scoped filtering, and give admins a Create Lab form in the Admin Portal.

**Architecture:** Three tasks: (1) fix existing hub-api queries to use the renamed column and new `org_id`, (2) add a `createLab` mutation, (3) build the Create Lab page with sidebar/list-page wiring. Admin-created labs set `status: 'ACTIVE'` immediately, bypassing the Lab Lite registration-approval workflow.

**Tech Stack:** Node.js tRPC, Supabase PostgREST, Next.js 15 App Router, TypeScript, Vitest, @testing-library/react

---

## Schema state (migrations already applied)

- `labs.name` renamed to `labs.lab_name`
- `labs.org_id uuid` added (nullable, FK to `organizations`)
- `lab_technicians.credential_ref` now nullable

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| **Modify** | `apps/hub-api/src/trpc/routers/admin.ts` | Fix `listLabs` / `getLabDetail` / `exportLabs`; add `createLab` |
| **Create** | `apps/admin-portal/src/app/labs/create/page.tsx` | Create Lab form page |
| **Modify** | `apps/admin-portal/src/app/labs/page.tsx` | Add "Create Lab" button |
| **Modify** | `apps/admin-portal/src/components/Sidebar.tsx` | Add "Create Lab" sub-link |
| **Create** | `apps/admin-portal/src/__tests__/create-lab.test.tsx` | Tests for Create Lab page |

---

### Task 1: Fix hub-api lab queries + add `createLab` mutation

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/admin.ts`

**Context for the implementer:**

Three procedures need fixing. Use `grep -n` to find line numbers; the approximate locations are:
- `listLabs` ~line 316
- `getLabDetail` ~line 381
- `exportLabs` ~line 3430

`assignStaffToLab` and `removeStaffFromLab` already have the org_id check on labs — those are correct as-is.

- [ ] **Step 1: Fix `listLabs`**

Replace the entire `listLabs` procedure body with:

```typescript
  listLabs: adminProcedure
    .input(
      z.object({
        status: z.enum(['ALL', 'ACTIVE', 'SUSPENDED', 'PENDING']).default('ALL'),
        cursor: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(100).default(25),
      }),
    )
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from('labs')
        .select(`
          id, lab_name, license_ref, accreditation_ref, status, created_at,
          lab_technicians(practitioner_id, practitioners!inner(given_name, family_name))
        `, { count: 'exact' })
        .eq('org_id', ctx.user.orgId)
        .order('created_at', { ascending: false })
        .range(input.cursor, input.cursor + input.limit - 1)

      if (input.status !== 'ALL') {
        query = query.eq('status', input.status)
      }

      const { data: rows, error, count } = await query

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to query lab registrations',
        })
      }

      const labs = (rows ?? []).map((row: Record<string, unknown>) => {
        const techs = row.lab_technicians as Array<{
          practitioner_id: string
          practitioners: { given_name: string; family_name: string }
        }> | null
        const tech = techs?.[0]
        const techName = tech?.practitioners
          ? `${tech.practitioners.given_name ?? ''} ${tech.practitioners.family_name ?? ''}`.trim()
          : '—'

        return {
          id: row.id as string,
          labName: row.lab_name as string,
          licenseReference: row.license_ref as string,
          accreditationReference: (row.accreditation_ref as string) ?? null,
          technicianName: techName,
          technicianId: tech?.practitioner_id ?? null,
          registeredAt: row.created_at as string,
          status: row.status as string,
        }
      })

      return {
        labs,
        total: count ?? 0,
        cursor: input.cursor,
        limit: input.limit,
      }
    }),
```

Changes from previous version:
- `name` → `lab_name` in select string
- `lab_technicians!inner(...)` → `lab_technicians(...)` (left join so labs with no staff appear)
- Added `.eq('org_id', ctx.user.orgId)`
- `row.name` → `row.lab_name`
- `technicianName` falls back to `'—'` instead of `'Unknown'`

- [ ] **Step 2: Fix `getLabDetail`**

In `getLabDetail`, change the select string from:
```
id, name, license_ref, accreditation_ref, status, created_at,
```
to:
```
id, lab_name, license_ref, accreditation_ref, status, created_at,
```

And in the return statement change:
```typescript
        labName: lab.name,
```
to:
```typescript
        labName: (lab as any).lab_name,
```

- [ ] **Step 3: Fix `exportLabs`**

Replace the entire `exportLabs` procedure with:

```typescript
  exportLabs: adminProcedure.query(async ({ ctx }) => {
    const { data: rows, error } = await ctx.supabase
      .from('labs')
      .select('id, lab_name, license_ref, accreditation_ref, status, created_at')
      .eq('org_id', ctx.user.orgId)
      .order('created_at', { ascending: false })

    if (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to query labs for export',
      })
    }

    const headers = ['ID', 'Lab Name', 'License Ref', 'Accreditation Ref', 'Status', 'Created At']
    const csvRows = (rows ?? []).map((row: Record<string, unknown>) => [
      row.id as string,
      (row.lab_name as string) ?? '',
      (row.license_ref as string) ?? '',
      (row.accreditation_ref as string) ?? '',
      (row.status as string) ?? '',
      (row.created_at as string) ?? '',
    ])

    return buildCsvExport(headers, csvRows, 'labs')
  }),
```

Changes: `name` → `lab_name`, added `.eq('org_id', ctx.user.orgId)`, removed `verified_at` (column doesn't exist).

- [ ] **Step 4: Add `createLab` mutation**

Insert this procedure immediately after the closing `}),` of `getLabDetail` (before `updateLabStatus` or whichever procedure follows it):

```typescript
  createLab: adminProcedure
    .input(
      z.object({
        labName: z.string().min(1).max(200),
        licenseRef: z.string().min(1).max(100),
        accreditationRef: z.string().max(100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data: lab, error } = await ctx.supabase
        .from('labs')
        .insert({
          lab_name: input.labName,
          license_ref: input.licenseRef,
          accreditation_ref: input.accreditationRef ?? null,
          org_id: ctx.user.orgId,
          status: 'ACTIVE',
        })
        .select('id')
        .single()

      if (error || !lab) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create lab',
        })
      }

      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'CREATE',
          resourceType: 'LAB',
          resourceId: lab.id,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { endpoint: 'admin.createLab' },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'CREATE', resourceType: 'LAB' })
      }

      return { id: lab.id }
    }),
```

- [ ] **Step 5: Run typecheck on hub-api**

```bash
cd "c:/Users/malan/OneDrive/Documents/Ultranos"
pnpm -F hub-api typecheck 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
cd "c:/Users/malan/OneDrive/Documents/Ultranos"
git add apps/hub-api/src/trpc/routers/admin.ts
git commit -m "$(cat <<'EOF'
fix(hub-api): fix lab queries for lab_name column rename, add org_id filter, add createLab mutation

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Create Lab page

**Files:**
- Create: `apps/admin-portal/src/app/labs/create/page.tsx`
- Create: `apps/admin-portal/src/__tests__/create-lab.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/admin-portal/src/__tests__/create-lab.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

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

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/labs/create',
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a>,
}))

const mockCreateLab = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      createLab: { mutate: (...args: any[]) => mockCreateLab(...args) },
    },
  },
  setAccessToken: vi.fn(),
}))

const { default: CreateLabPage } = await import('../app/labs/create/page')

describe('Create Lab Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the form with all fields and buttons', () => {
    render(<CreateLabPage />)
    expect(screen.getByLabelText('Lab Name')).toBeTruthy()
    expect(screen.getByLabelText('License Reference')).toBeTruthy()
    expect(screen.getByLabelText('Accreditation Reference')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create Lab' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy()
  })

  it('Create Lab button is disabled when required fields are empty', () => {
    render(<CreateLabPage />)
    expect(screen.getByRole('button', { name: 'Create Lab' })).toBeDisabled()
  })

  it('Create Lab button enables when both required fields are filled', async () => {
    const user = userEvent.setup()
    render(<CreateLabPage />)

    await user.type(screen.getByLabelText('Lab Name'), 'Central Lab')
    await user.type(screen.getByLabelText('License Reference'), 'LIC-2026-001')

    expect(screen.getByRole('button', { name: 'Create Lab' })).not.toBeDisabled()
  })

  it('submits with all fields and redirects to /labs', async () => {
    mockCreateLab.mockResolvedValue({ id: 'lab-new-uuid' })
    const user = userEvent.setup()
    render(<CreateLabPage />)

    await user.type(screen.getByLabelText('Lab Name'), 'Central Lab')
    await user.type(screen.getByLabelText('License Reference'), 'LIC-2026-001')
    await user.type(screen.getByLabelText('Accreditation Reference'), 'ACCR-001')
    await user.click(screen.getByRole('button', { name: 'Create Lab' }))

    await waitFor(() => {
      expect(mockCreateLab).toHaveBeenCalledWith({
        labName: 'Central Lab',
        licenseRef: 'LIC-2026-001',
        accreditationRef: 'ACCR-001',
      })
    })
    expect(mockPush).toHaveBeenCalledWith('/labs')
  })

  it('omits accreditationRef when left blank', async () => {
    mockCreateLab.mockResolvedValue({ id: 'lab-new-uuid' })
    const user = userEvent.setup()
    render(<CreateLabPage />)

    await user.type(screen.getByLabelText('Lab Name'), 'Central Lab')
    await user.type(screen.getByLabelText('License Reference'), 'LIC-2026-001')
    await user.click(screen.getByRole('button', { name: 'Create Lab' }))

    await waitFor(() => {
      expect(mockCreateLab).toHaveBeenCalledWith({
        labName: 'Central Lab',
        licenseRef: 'LIC-2026-001',
      })
    })
    expect(mockPush).toHaveBeenCalledWith('/labs')
  })

  it('shows error message on failure, does not redirect', async () => {
    mockCreateLab.mockRejectedValue(new Error('Failed to create lab'))
    const user = userEvent.setup()
    render(<CreateLabPage />)

    await user.type(screen.getByLabelText('Lab Name'), 'Central Lab')
    await user.type(screen.getByLabelText('License Reference'), 'LIC-2026-001')
    await user.click(screen.getByRole('button', { name: 'Create Lab' }))

    await waitFor(() => {
      expect(screen.getByText('Failed to create lab')).toBeTruthy()
    })
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('Cancel button navigates to /labs', async () => {
    const user = userEvent.setup()
    render(<CreateLabPage />)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(mockPush).toHaveBeenCalledWith('/labs')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd "c:/Users/malan/OneDrive/Documents/Ultranos"
pnpm -F admin-portal test -- --run src/__tests__/create-lab.test.tsx 2>&1 | tail -10
```

Expected: FAIL — Cannot find module `../app/labs/create/page`.

- [ ] **Step 3: Create the page**

Create `apps/admin-portal/src/app/labs/create/page.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { TopHeader } from '@/components/TopHeader'

export default function CreateLabPage() {
  const router = useRouter()
  const [labName, setLabName] = useState('')
  const [licenseRef, setLicenseRef] = useState('')
  const [accreditationRef, setAccreditationRef] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = labName.trim() !== '' && licenseRef.trim() !== '' && !submitting

  async function handleSubmit() {
    if (!canSubmit) return
    try {
      setSubmitting(true)
      setError(null)
      await trpc.admin.createLab.mutate({
        labName: labName.trim(),
        licenseRef: licenseRef.trim(),
        ...(accreditationRef.trim() && { accreditationRef: accreditationRef.trim() }),
      })
      router.push('/labs')
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create lab')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <TopHeader title="Create Lab" description="Register a new lab for your organisation." />
      <div className="mx-auto max-w-2xl px-8 py-6">
        <button
          onClick={() => router.push('/labs')}
          className="text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          &larr; Back to Labs
        </button>

        <div className="mt-6 rounded-2xl border border-border bg-surface-raised p-6">
          <div className="space-y-5">
            <div>
              <label
                htmlFor="lab-name"
                className="block text-sm font-medium text-text-secondary mb-1"
              >
                Lab Name <span className="text-danger">*</span>
              </label>
              <input
                id="lab-name"
                aria-label="Lab Name"
                type="text"
                value={labName}
                onChange={(e) => setLabName(e.target.value)}
                placeholder="e.g. Central Diagnostics Lab"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            <div>
              <label
                htmlFor="license-ref"
                className="block text-sm font-medium text-text-secondary mb-1"
              >
                License Reference <span className="text-danger">*</span>
              </label>
              <input
                id="license-ref"
                aria-label="License Reference"
                type="text"
                value={licenseRef}
                onChange={(e) => setLicenseRef(e.target.value)}
                placeholder="e.g. LIC-2026-001"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            <div>
              <label
                htmlFor="accreditation-ref"
                className="block text-sm font-medium text-text-secondary mb-1"
              >
                Accreditation Reference{' '}
                <span className="text-text-muted text-xs font-normal">(optional)</span>
              </label>
              <input
                id="accreditation-ref"
                aria-label="Accreditation Reference"
                type="text"
                value={accreditationRef}
                onChange={(e) => setAccreditationRef(e.target.value)}
                placeholder="e.g. ACCR-ISO15189-001"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-xl bg-danger-subtle p-3 text-sm text-danger">
              {error}
            </div>
          )}

          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={() => router.push('/labs')}
              className="rounded-full border border-border px-6 py-2.5 text-sm text-text-primary hover:bg-surface hover:scale-[1.02] transition-transform duration-200"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="rounded-full bg-brand-lime px-6 py-2.5 text-sm font-semibold text-black disabled:opacity-50 hover:scale-[1.02] transition-transform duration-200"
            >
              {submitting ? 'Creating…' : 'Create Lab'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd "c:/Users/malan/OneDrive/Documents/Ultranos"
pnpm -F admin-portal test -- --run src/__tests__/create-lab.test.tsx 2>&1 | tail -15
```

Expected: all 6 tests pass.

- [ ] **Step 5: Run typecheck**

```bash
cd "c:/Users/malan/OneDrive/Documents/Ultranos"
pnpm -F admin-portal typecheck 2>&1 | head -20
```

- [ ] **Step 6: Commit**

```bash
cd "c:/Users/malan/OneDrive/Documents/Ultranos"
git add apps/admin-portal/src/app/labs/create/page.tsx
git add apps/admin-portal/src/__tests__/create-lab.test.tsx
git commit -m "$(cat <<'EOF'
feat(admin-portal): add Create Lab page with form validation and tests

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Wire Create Lab into labs list page and sidebar

**Files:**
- Modify: `apps/admin-portal/src/app/labs/page.tsx`
- Modify: `apps/admin-portal/src/components/Sidebar.tsx`

- [ ] **Step 1: Add "Create Lab" button to labs list page**

Read the current `apps/admin-portal/src/app/labs/page.tsx` first to get exact line content.

Replace the existing filter bar `<div className="flex items-center gap-3">` block (the one containing the status filter buttons and ExportButton) with:

```tsx
        {/* Filter tabs + actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-full bg-surface p-1 w-fit">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => handleFilterChange(s)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  filter === s
                    ? 'bg-accent text-text-primary'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/labs/create')}
              className="rounded-full bg-brand-lime px-5 py-2 text-sm font-semibold text-black hover:bg-brand-lime/90 transition-colors"
            >
              Create Lab
            </button>
            <ExportButton exportFn={() => trpc.admin.exportLabs.query()} filters={{}} />
          </div>
        </div>
```

- [ ] **Step 2: Add "Create Lab" sub-item to the sidebar**

In `apps/admin-portal/src/components/Sidebar.tsx`, in the `navItems` array, add `{ label: 'Create Lab', href: '/labs/create', icon: Plus, indent: true }` immediately after the Labs entry:

```typescript
  { label: 'Labs', href: '/labs', icon: FlaskConical },
  { label: 'Create Lab', href: '/labs/create', icon: Plus, indent: true },
  { label: 'Inventory', href: '/inventory', icon: Package },
```

`Plus` is already imported in the sidebar file.

- [ ] **Step 3: Run the full admin-portal test suite**

```bash
cd "c:/Users/malan/OneDrive/Documents/Ultranos"
pnpm -F admin-portal test -- --run 2>&1 | tail -20
```

Expected: all tests pass including the 6 new create-lab tests.

- [ ] **Step 4: Commit**

```bash
cd "c:/Users/malan/OneDrive/Documents/Ultranos"
git add apps/admin-portal/src/app/labs/page.tsx
git add apps/admin-portal/src/components/Sidebar.tsx
git commit -m "$(cat <<'EOF'
feat(admin-portal): wire Create Lab button into labs list page and sidebar

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

### Spec coverage

| Requirement | Task |
|-------------|------|
| Fix `lab_name` column references in `listLabs`, `getLabDetail`, `exportLabs` | Task 1 |
| Add `org_id` filter to `listLabs` and `exportLabs` | Task 1 |
| Fix `listLabs` left join so admin-created labs (no staff yet) appear | Task 1 |
| Remove nonexistent `verified_at` from `exportLabs` | Task 1 |
| `createLab` tRPC mutation with org_id, ACTIVE status, audit event | Task 1 |
| Create Lab form with Lab Name + License Ref (required) + Accreditation Ref (optional) | Task 2 |
| Disabled submit until required fields filled | Task 2 |
| Omits `accreditationRef` key when blank | Task 2 |
| Error message on failure, no redirect | Task 2 |
| "Create Lab" button on labs list page | Task 3 |
| "Create Lab" sidebar sub-link under Labs | Task 3 |

### Placeholder scan

No TBDs, TODOs, or "similar to above" references. All code blocks are complete and self-contained.

### Type consistency

- `createLab` input `{ labName, licenseRef, accreditationRef? }` used identically in mutation definition (Task 1) and page submit handler (Task 2)
- `row.lab_name` in `listLabs` and `(lab as any).lab_name` in `getLabDetail` both reference the renamed DB column
- `router.push('/labs')` on success and cancel (Task 2) matches the target route
