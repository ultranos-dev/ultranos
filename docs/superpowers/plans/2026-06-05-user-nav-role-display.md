# User Nav Role Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four copy-pasted `formatRole` functions across app nav-user components with a single shared `formatUserRole` utility in `ui-kit`, and fix lab-lite to display the user's specific `labRole` sub-role instead of always showing "Lab Technician".

**Architecture:** A new `format-role.ts` module is added to `packages/ui-kit/src/`, exported from the barrel `index.ts`, and imported by each app's nav-user component in place of its local function. Lab-lite's `AppSidebar.tsx` is updated to prefer `session.labRole` over `session.role` when building the prop for `NavLabUser`.

**Tech Stack:** TypeScript, Vitest (tests), pnpm workspaces, `@ultranos/ui-kit`

---

## File Map

| Action | Path |
|--------|------|
| **Create** | `packages/ui-kit/src/format-role.ts` |
| **Create** | `packages/ui-kit/src/__tests__/format-role.test.ts` |
| **Modify** | `packages/ui-kit/src/index.ts` |
| **Modify** | `apps/admin-portal/src/components/sidebar/nav-user.tsx` |
| **Modify** | `apps/opd-lite/src/components/sidebar/nav-user.tsx` |
| **Modify** | `apps/pharmacy-lite/src/components/sidebar/nav-user.tsx` |
| **Modify** | `apps/lab-lite/src/components/sidebar/NavLabUser.tsx` |
| **Modify** | `apps/lab-lite/src/components/AppSidebar.tsx` |

---

## Task 1: Write the failing tests for `formatUserRole`

**Files:**
- Create: `packages/ui-kit/src/__tests__/format-role.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
// packages/ui-kit/src/__tests__/format-role.test.ts
import { describe, it, expect } from 'vitest'
import { formatUserRole } from '../format-role'

describe('formatUserRole', () => {
  it('maps ADMIN to Administrator', () => {
    expect(formatUserRole('ADMIN')).toBe('Administrator')
  })

  it('maps DOCTOR to Doctor', () => {
    expect(formatUserRole('DOCTOR')).toBe('Doctor')
  })

  it('maps PHARMACIST to Pharmacist', () => {
    expect(formatUserRole('PHARMACIST')).toBe('Pharmacist')
  })

  it('maps LAB_TECH to Lab Technician', () => {
    expect(formatUserRole('LAB_TECH')).toBe('Lab Technician')
  })

  it('maps CLINICIAN to Clinician (legacy value)', () => {
    expect(formatUserRole('CLINICIAN')).toBe('Clinician')
  })

  it('maps SENIOR_TECH to Senior Technician', () => {
    expect(formatUserRole('SENIOR_TECH')).toBe('Senior Technician')
  })

  it('maps SUPERVISOR to Supervisor', () => {
    expect(formatUserRole('SUPERVISOR')).toBe('Supervisor')
  })

  it('maps LAB_MANAGER to Lab Manager', () => {
    expect(formatUserRole('LAB_MANAGER')).toBe('Lab Manager')
  })

  it('is case-insensitive', () => {
    expect(formatUserRole('admin')).toBe('Administrator')
    expect(formatUserRole('Doctor')).toBe('Doctor')
  })

  it('returns the raw value for unknown roles', () => {
    expect(formatUserRole('UNKNOWN_ROLE')).toBe('UNKNOWN_ROLE')
  })

  it('handles empty string gracefully', () => {
    expect(formatUserRole('')).toBe('')
  })
})
```

- [ ] **Step 2: Run the test — verify it fails with "Cannot find module"**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
pnpm --filter @ultranos/ui-kit test -- --reporter=verbose format-role
```

Expected output: `Error: Cannot find module '../format-role'`

---

## Task 2: Implement `formatUserRole` and make tests pass

**Files:**
- Create: `packages/ui-kit/src/format-role.ts`

- [ ] **Step 1: Create the implementation file**

```typescript
// packages/ui-kit/src/format-role.ts

/**
 * Maps internal role enum values to human-readable display labels.
 * Covers all active UserRole and LabRole values from @ultranos/shared-types.
 * Case-insensitive. Returns the raw role string for any unrecognised value.
 */
export function formatUserRole(role: string): string {
  const map: Record<string, string> = {
    // UserRole enum values
    ADMIN: 'Administrator',
    DOCTOR: 'Doctor',
    PHARMACIST: 'Pharmacist',
    LAB_TECH: 'Lab Technician',
    CLINICIAN: 'Clinician',        // legacy — kept for graceful fallback
    // LabRole sub-role values
    SENIOR_TECH: 'Senior Technician',
    SUPERVISOR: 'Supervisor',
    LAB_MANAGER: 'Lab Manager',
  }
  return map[role?.toUpperCase()] ?? role
}
```

- [ ] **Step 2: Run the tests — verify they all pass**

```bash
pnpm --filter @ultranos/ui-kit test -- --reporter=verbose format-role
```

Expected output: `✓ formatUserRole > maps ADMIN to Administrator` … 11 tests pass.

- [ ] **Step 3: Commit**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
git add packages/ui-kit/src/format-role.ts packages/ui-kit/src/__tests__/format-role.test.ts
git commit -m "feat(ui-kit): add formatUserRole shared utility"
```

---

## Task 3: Export `formatUserRole` from `ui-kit` barrel and rebuild

**Files:**
- Modify: `packages/ui-kit/src/index.ts`

- [ ] **Step 1: Add the export line to `packages/ui-kit/src/index.ts`**

Open the file. After the last `export` line (currently `export { PasswordStrengthBar, getPasswordStrength } from './components/PasswordStrengthBar.js'`), add:

```typescript
export { formatUserRole } from './format-role.js'
```

- [ ] **Step 2: Build the ui-kit package**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
pnpm --filter @ultranos/ui-kit build
```

Expected: build completes with no errors. The `packages/ui-kit/dist/` directory is updated.

- [ ] **Step 3: Verify the export is present in the build output**

```bash
grep -l "formatUserRole" packages/ui-kit/dist/index.*
```

Expected: at least one file listed (the built barrel includes the export).

- [ ] **Step 4: Commit**

```bash
git add packages/ui-kit/src/index.ts packages/ui-kit/dist/
git commit -m "feat(ui-kit): export formatUserRole from barrel"
```

---

## Task 4: Update admin-portal `nav-user.tsx`

**Files:**
- Modify: `apps/admin-portal/src/components/sidebar/nav-user.tsx`

- [ ] **Step 1: Replace the local function with the shared import**

Remove the entire `formatRole` function (lines 31–39):

```typescript
// DELETE this block:
function formatRole(role: string): string {
  const map: Record<string, string> = {
    ADMIN: 'Administrator',
    CLINICIAN: 'Clinician',
    PHARMACIST: 'Pharmacist',
    LAB_TECH: 'Lab Technician',
  }
  return map[role.toUpperCase()] ?? role
}
```

Add the import alongside the existing imports at the top of the file:

```typescript
import { formatUserRole } from '@ultranos/ui-kit'
```

Replace the two usages of `formatRole(role)` in the JSX with `formatUserRole(role)`.

The sidebar trigger (around line 77) becomes:
```tsx
<span className="truncate text-xs text-muted-foreground">{formatUserRole(role)}</span>
```

- [ ] **Step 2: TypeCheck**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
pnpm --filter admin-portal typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/admin-portal/src/components/sidebar/nav-user.tsx
git commit -m "feat(admin-portal): use shared formatUserRole in NavUser"
```

---

## Task 5: Update OPD lite `nav-user.tsx`

**Files:**
- Modify: `apps/opd-lite/src/components/sidebar/nav-user.tsx`

- [ ] **Step 1: Replace the local `formatRole` function with the shared import**

Remove only the `formatRole` function (lines 41–49) — leave `getInitials` (lines 51–58) in place, the component uses it directly:

```typescript
// DELETE this block only:
function formatRole(role: string): string {
  const map: Record<string, string> = {
    ADMIN: 'Administrator',
    CLINICIAN: 'Clinician',
    PHARMACIST: 'Pharmacist',
    LAB_TECH: 'Lab Technician',
  }
  return map[role.toUpperCase()] ?? role
}
```

Add the import:

```typescript
import { formatUserRole } from '@ultranos/ui-kit'
```

Replace the two usages of `formatRole(role)` in the JSX with `formatUserRole(role)`.

The sidebar trigger becomes:
```tsx
<span className="truncate text-xs text-muted-foreground">{formatUserRole(role)}</span>
```

- [ ] **Step 2: TypeCheck**

```bash
pnpm --filter opd-lite typecheck
```

Expected: no errors.

- [ ] **Step 3: Confirm `DOCTOR` now resolves correctly**

`session.role` for OPD users is `'DOCTOR'`. With `formatUserRole('DOCTOR')` returning `'Doctor'` instead of the raw string `'DOCTOR'`, the display is now correct. No runtime test needed beyond typecheck — the unit test in Task 1 covers this case.

- [ ] **Step 4: Commit**

```bash
git add apps/opd-lite/src/components/sidebar/nav-user.tsx
git commit -m "fix(opd-lite): show Doctor label via shared formatUserRole"
```

---

## Task 6: Update pharmacy-lite `nav-user.tsx`

**Files:**
- Modify: `apps/pharmacy-lite/src/components/sidebar/nav-user.tsx`

- [ ] **Step 1: Replace the local `formatRole` function with the shared import**

Remove only the `formatRole` function (lines 34–42) — leave `getInitials` (lines 44–51) in place:

```typescript
// DELETE this block only:
function formatRole(role: string): string {
  const map: Record<string, string> = {
    ADMIN: 'Administrator',
    CLINICIAN: 'Clinician',
    PHARMACIST: 'Pharmacist',
    LAB_TECH: 'Lab Technician',
  }
  return map[role.toUpperCase()] ?? role
}
```

Add the import:

```typescript
import { formatUserRole } from '@ultranos/ui-kit'
```

Replace the two usages of `formatRole(role)` with `formatUserRole(role)`.

The sidebar trigger becomes:
```tsx
<span className="truncate text-xs text-muted-foreground">{formatUserRole(role)}</span>
```

- [ ] **Step 2: TypeCheck**

```bash
pnpm --filter pharmacy-lite typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/pharmacy-lite/src/components/sidebar/nav-user.tsx
git commit -m "feat(pharmacy-lite): use shared formatUserRole in NavUser"
```

---

## Task 7: Update lab-lite `NavLabUser.tsx`

**Files:**
- Modify: `apps/lab-lite/src/components/sidebar/NavLabUser.tsx`

- [ ] **Step 1: Replace the local function with the shared import**

Remove the entire `formatRole` function (lines 28–36):

```typescript
// DELETE this block:
function formatRole(role: string): string {
  const map: Record<string, string> = {
    ADMIN: 'Administrator',
    CLINICIAN: 'Clinician',
    PHARMACIST: 'Pharmacist',
    LAB_TECH: 'Lab Technician',
  }
  return map[role.toUpperCase()] ?? role
}
```

Add the import:

```typescript
import { formatUserRole } from '@ultranos/ui-kit'
```

Replace `formatRole(role)` in the JSX with `formatUserRole(role)`:

```tsx
<span className="truncate text-xs text-muted-foreground">{formatUserRole(role)}</span>
```

- [ ] **Step 2: TypeCheck**

```bash
pnpm --filter lab-lite typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/lab-lite/src/components/sidebar/NavLabUser.tsx
git commit -m "feat(lab-lite): use shared formatUserRole in NavLabUser"
```

---

## Task 8: Fix lab-lite `AppSidebar.tsx` to use `labRole`

**Files:**
- Modify: `apps/lab-lite/src/components/AppSidebar.tsx`

- [ ] **Step 1: Update the `role` prop passed to `NavLabUser`**

Find the `<NavLabUser ... />` block (around line 253–259):

```tsx
// Before:
<NavLabUser
  name={displayName}
  email={session?.email}
  role={session?.role ?? ''}
  initials={initials}
  onSignOut={handleSignOut}
/>
```

Change `role={session?.role ?? ''}` to prefer the lab sub-role when available:

```tsx
// After:
<NavLabUser
  name={displayName}
  email={session?.email}
  role={session?.labRole ?? session?.role ?? ''}
  initials={initials}
  onSignOut={handleSignOut}
/>
```

> **Why:** `session.labRole` holds the specific sub-role (`LAB_TECH`, `SENIOR_TECH`, `SUPERVISOR`, `LAB_MANAGER`) fetched from the Hub API in `AuthGuard` and cached in localStorage. `session.role` is always `'LAB_TECH'` (the umbrella role). Using `labRole ?? role` means a Lab Manager sees "Lab Manager" in the sidebar; a user whose `labRole` hasn't loaded yet sees "Lab Technician" as fallback.

- [ ] **Step 2: TypeCheck**

```bash
pnpm --filter lab-lite typecheck
```

Expected: no errors. `session?.labRole` is typed `LabRole | null` and `LabRole` is a string enum, so it is compatible with `NavLabUserProps.role: string`.

- [ ] **Step 3: Commit**

```bash
git add apps/lab-lite/src/components/AppSidebar.tsx
git commit -m "fix(lab-lite): display labRole sub-role in sidebar nav"
```

---

## Task 9: Full test run and cleanup

- [ ] **Step 1: Run all tests**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
pnpm test
```

Expected: all tests pass. No regressions.

- [ ] **Step 2: Run full typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Search for any remaining local `formatRole` functions**

```bash
grep -r "function formatRole" apps/
```

Expected: no output. All local copies should be gone.

- [ ] **Step 4: Verify `formatUserRole` import is present in all 4 nav files**

```bash
grep -r "formatUserRole" apps/
```

Expected: 4 matches — one in each of:
- `apps/admin-portal/src/components/sidebar/nav-user.tsx`
- `apps/opd-lite/src/components/sidebar/nav-user.tsx`
- `apps/pharmacy-lite/src/components/sidebar/nav-user.tsx`
- `apps/lab-lite/src/components/sidebar/NavLabUser.tsx`
