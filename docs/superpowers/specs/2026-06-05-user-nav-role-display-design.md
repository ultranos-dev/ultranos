# User Nav Role Display — Design Spec
**Date:** 2026-06-05
**Branch:** ux-v1.0
**Scope:** Admin Portal, OPD Lite, Pharmacy Lite, Lab Lite

---

## Problem

The `formatRole` function is copy-pasted into each app's `nav-user.tsx`. It has drifted: `DOCTOR` (used in OPD lite) is missing from the map and falls back to the raw string `'DOCTOR'`. Lab lite's `LabRole` sub-roles (`SENIOR_TECH`, `SUPERVISOR`, `LAB_MANAGER`) are also unmapped. Additionally, lab lite's `AppSidebar.tsx` passes `session.role` (always `'LAB_TECH'`) to `NavLabUser`, so all lab users see "Lab Technician" regardless of their actual sub-role.

---

## Required Behaviour

### Sidebar (collapsed trigger)
- Line 1: User's full name (`session.name`, falling back to email prefix)
- Line 2: Formatted role label

### Dropdown menu header
- Line 1: User's full name
- Line 2: User's email

### Role label logic per app

| App | Role source | Example display |
|-----|-------------|-----------------|
| Admin Portal | `session.role` | "Administrator" |
| OPD Lite | `session.role` | "Doctor" |
| Pharmacy Lite | `session.role` | "Pharmacist" |
| Lab Lite | `session.labRole ?? session.role` | "Lab Manager", "Supervisor", "Senior Technician", "Lab Technician" |

---

## Design

### 1. Shared `formatUserRole` utility in `ui-kit`

**New file:** `packages/ui-kit/src/format-role.ts`

```typescript
export function formatUserRole(role: string): string {
  const map: Record<string, string> = {
    // UserRole enum values
    ADMIN: 'Administrator',
    DOCTOR: 'Doctor',
    PHARMACIST: 'Pharmacist',
    LAB_TECH: 'Lab Technician',
    CLINICIAN: 'Clinician',       // legacy value — kept for graceful fallback
    // LabRole enum sub-values
    SENIOR_TECH: 'Senior Technician',
    SUPERVISOR: 'Supervisor',
    LAB_MANAGER: 'Lab Manager',
  }
  return map[role?.toUpperCase()] ?? role
}
```

**Export:** Add `export { formatUserRole } from './format-role'` to `packages/ui-kit/src/index.ts`.

**Build required** after this change: `pnpm --filter @ultranos/ui-kit build`

---

### 2. Admin Portal — `apps/admin-portal/src/components/sidebar/nav-user.tsx`

- Remove local `formatRole` function.
- Add import: `import { formatUserRole } from '@ultranos/ui-kit'`
- Replace all `formatRole(role)` calls with `formatUserRole(role)`.
- No structural changes — behaviour is unchanged (ADMIN was already mapped correctly).

---

### 3. OPD Lite — `apps/opd-lite/src/components/sidebar/nav-user.tsx`

- Remove local `formatRole` function.
- Add import: `import { formatUserRole } from '@ultranos/ui-kit'`
- Replace all `formatRole(role)` calls with `formatUserRole(role)`.
- **Fixes:** `DOCTOR` now maps to "Doctor" instead of falling back to raw `'DOCTOR'`.

---

### 4. Pharmacy Lite — `apps/pharmacy-lite/src/components/sidebar/nav-user.tsx`

- Remove local `formatRole` function.
- Add import: `import { formatUserRole } from '@ultranos/ui-kit'`
- Replace all `formatRole(role)` calls with `formatUserRole(role)`.
- No structural changes — behaviour is unchanged (PHARMACIST was already mapped correctly).

---

### 5. Lab Lite — two files

#### `apps/lab-lite/src/components/AppSidebar.tsx`

Change the `role` prop passed to `NavLabUser`:

```typescript
// Before
role={session?.role ?? ''}

// After
role={session?.labRole ?? session?.role ?? ''}
```

This means the displayed role uses the specific sub-role when available (`labRole` is fetched from the Hub API in `AuthGuard` and cached in localStorage). Falls back to `'LAB_TECH'` (→ "Lab Technician") only when `labRole` is null (e.g., during initial load before the Hub API responds).

#### `apps/lab-lite/src/components/sidebar/NavLabUser.tsx`

- Remove local `formatRole` function.
- Add import: `import { formatUserRole } from '@ultranos/ui-kit'`
- Replace `formatRole(role)` with `formatUserRole(role)`.
- **Fixes:** `SENIOR_TECH`, `SUPERVISOR`, `LAB_MANAGER` now display correctly.

---

## Files Changed

| File | Change |
|------|--------|
| `packages/ui-kit/src/format-role.ts` | **New** — `formatUserRole` utility |
| `packages/ui-kit/src/index.ts` | Add export for `formatUserRole` |
| `apps/admin-portal/src/components/sidebar/nav-user.tsx` | Remove local `formatRole`, import shared utility |
| `apps/opd-lite/src/components/sidebar/nav-user.tsx` | Remove local `formatRole`, import shared utility |
| `apps/pharmacy-lite/src/components/sidebar/nav-user.tsx` | Remove local `formatRole`, import shared utility |
| `apps/lab-lite/src/components/sidebar/NavLabUser.tsx` | Remove local `formatRole`, import shared utility |
| `apps/lab-lite/src/components/AppSidebar.tsx` | Pass `labRole ?? role` instead of `role` |

---

## Out of Scope

- Adding `labRole` to the OPD lite / pharmacy-lite / admin-portal session types — lab roles are only meaningful in lab-lite.
- Changing the dropdown header layout in any app.
- RTL/i18n of role label strings — role labels are internal UI chrome, not patient-facing clinical data.
