# Shared Patient Workflows Package — Design Spec

**Date:** 2026-05-25
**Status:** Draft
**Sub-project:** A of 3 (A: create package + migrate OPD-Lite, B: migrate Pharmacy-Lite, C: migrate Lab-Lite)

---

## Overview

Extract OPD-Lite's patient registration, edit, and banner components into `packages/patient-workflows/` so all spoke apps (OPD-Lite, Pharmacy-Lite, Lab-Lite) share identical patient workflows. OPD-Lite is the source of truth; changes propagate to all apps via the shared package.

## Motivation

Three separate patient registration forms exist today with different levels of completeness:
- OPD-Lite: Full MPI + geography + NID + consent + edit modal
- Lab-Lite: MPI + consent, no geography or edit modal
- Pharmacy-Lite: Local-only, no MPI

When a field like National ID# is added to OPD-Lite, it must be manually replicated across other apps. This guarantees drift. A shared package eliminates this problem.

## Scope

**In scope (Sub-project A):**
- Create `packages/patient-workflows/` with adapter pattern
- Move patient UI components from OPD-Lite into the shared package
- Export i18n message bundles for en/ar/prs
- Migrate OPD-Lite to consume from the shared package (proving it works)

**Out of scope (Sub-projects B & C):**
- Migrating Pharmacy-Lite to use the shared package
- Migrating Lab-Lite to use the shared package
- Unifying Hub API write endpoints (prerequisite for Sub-project C)
- Moving Button/Card to `packages/ui-kit/` (future cleanup)

---

## 1. Adapter Pattern

The shared components never import app-local infrastructure (`@/lib/supabase`, `@/lib/db`, `@/lib/audit`). Instead, each consuming app provides an adapter — a plain object of async functions.

### Adapter Interface

```typescript
import type { FhirPatient } from '@ultranos/shared-types'

export interface MpiCheckInput {
  nameGiven?: string
  nameFather?: string
  nameGrandfather?: string
  birthYear?: number
  gender?: string
  phone?: string
  nationalId?: string
  addressDistrictOrigin?: string
  addressProvinceOrigin?: string
}

export interface MpiCheckResult {
  decision: 'ALLOW' | 'WARN' | 'BLOCK'
  candidates: Array<{
    id: string
    nameGiven?: string
    nameFather?: string
    birthYear?: number
    gender?: string
    districtOrigin?: string
    mpiScore: number
    scoreBreakdown: Record<string, number>
  }>
  proceedToken?: string
}

export interface PatientWorkflowAdapter {
  /** Check for MPI duplicates before creation */
  checkDuplicates(input: MpiCheckInput): Promise<MpiCheckResult>

  /** Create patient on the Hub API */
  createPatient(input: Record<string, unknown>): Promise<{ id: string }>

  /** Update patient on the Hub API */
  updatePatient(input: Record<string, unknown>): Promise<{ lastUpdated: string }>

  /** Save patient to local offline store (IndexedDB/SQLite) */
  saveLocally(patient: FhirPatient): Promise<void>

  /** Get auth headers for Hub API calls (Bearer token) */
  getAuthHeaders(): Promise<Record<string, string>>
}
```

### React Context

```typescript
// packages/patient-workflows/src/context.ts
import { createContext, useContext } from 'react'
import type { PatientWorkflowAdapter } from './types'

const PatientWorkflowContext = createContext<PatientWorkflowAdapter | null>(null)

export function PatientWorkflowProvider({
  adapter,
  children,
}: {
  adapter: PatientWorkflowAdapter
  children: React.ReactNode
}) {
  return (
    <PatientWorkflowContext.Provider value={adapter}>
      {children}
    </PatientWorkflowContext.Provider>
  )
}

export function usePatientWorkflow(): PatientWorkflowAdapter {
  const ctx = useContext(PatientWorkflowContext)
  if (!ctx) {
    throw new Error('usePatientWorkflow must be used within PatientWorkflowProvider')
  }
  return ctx
}
```

---

## 2. Package Structure

```
packages/patient-workflows/
├── src/
│   ├── index.ts                        # Public API: all component + context exports
│   ├── types.ts                        # Adapter interface, MpiCheckInput, MpiCheckResult
│   ├── context.ts                      # PatientWorkflowProvider + usePatientWorkflow hook
│   ├── components/
│   │   ├── registration/
│   │   │   ├── PatientRegistrationForm.tsx  # Uses adapter for API calls
│   │   │   ├── NameInputSection.tsx
│   │   │   ├── GeographySection.tsx
│   │   │   ├── ConsentSection.tsx
│   │   │   ├── ConsentTextModal.tsx
│   │   │   └── MpiResultModal.tsx
│   │   ├── edit/
│   │   │   └── PatientEditModal.tsx     # Uses adapter for API calls
│   │   ├── banners/
│   │   │   ├── NidMissingBanner.tsx
│   │   │   └── MpiWarnBanner.tsx
│   │   ├── geography/
│   │   │   ├── ProvinceAutocomplete.tsx
│   │   │   └── DistrictAutocomplete.tsx
│   │   └── ui/
│   │       ├── Button.tsx               # Internal UI primitive
│   │       └── Card.tsx                 # Internal UI primitive
│   └── messages/
│       ├── en.ts                        # { registration: {...}, patient: {...} }
│       ├── ar.ts
│       └── prs.ts
├── package.json
└── tsconfig.json
```

### Dependencies

```json
{
  "name": "@ultranos/patient-workflows",
  "peerDependencies": {
    "react": "^18 || ^19",
    "next-intl": "^3"
  },
  "dependencies": {
    "@ultranos/shared-types": "workspace:*",
    "zod": "^3"
  }
}
```

- `@ultranos/shared-types` — FhirPatient, AdministrativeGender, AfghanProvince, AFGHAN_PROVINCES, getDistrictsByProvince, CreatePatientMpiInputSchema
- `react` and `next-intl` — peer dependencies (each app provides its own version)
- `zod` — used internally for client-side validation schemas

---

## 3. Component Extraction — What Changes

### PatientRegistrationForm

**Before (OPD-Lite):** Inline `fetch()` to Hub API, direct Dexie `db.patients.put()`, inline `getSupabaseBrowserClient()`.

**After (shared):** Uses `usePatientWorkflow()` adapter:
- `adapter.checkDuplicates(input)` replaces inline fetch to `/patient.checkDuplicates`
- `adapter.createPatient(payload)` replaces inline fetch to `/patient.create`
- `adapter.saveLocally(patient)` replaces `db.patients.put(patient)`

**New props:**
```typescript
interface PatientRegistrationFormProps {
  prefilledNameGiven?: string
  /** Called after successful creation with the new patient ID */
  onSuccess: (patientId: string) => void
  /** Called on unrecoverable error (optional, defaults to inline error banner) */
  onError?: (error: Error) => void
}
```

The form no longer calls `router.push()` internally — it calls `onSuccess(id)` and the consuming app decides where to navigate.

### PatientEditModal

**Before:** Inline `fetch()` to Hub API, direct Dexie access, inline audit logging.

**After:** Uses `usePatientWorkflow()` adapter:
- `adapter.updatePatient(payload)` replaces inline fetch to `/patient.update`
- `adapter.saveLocally(patient)` replaces `db.patients.put(patient)`

**Props unchanged** — `open`, `patient`, `patientId`, `onClose`, `onSaved` remain the same.

Audit logging moves to the adapter layer — each app's adapter implementation can emit audit events appropriate to its context.

### Banners (NidMissingBanner, MpiWarnBanner)

No adapter dependency. These are pure presentational components reading from `next-intl` translations. Move as-is.

MpiWarnBanner's `Link` to `/duplicate-review?patient={id}` becomes a configurable `href` prop since the route may differ across apps:

```typescript
interface MpiWarnBannerProps {
  mpiScore: number
  patientId: string
  reviewHref?: string  // defaults to `/duplicate-review?patient=${patientId}`
}
```

### UI Primitives (Button, Card)

Copied into the shared package as internal components (`src/components/ui/`). Not exported from the public API. This avoids a circular dependency with ui-kit and keeps the package self-contained. Future cleanup can move these to ui-kit when all apps standardize.

### Geography Components (ProvinceAutocomplete, DistrictAutocomplete)

No adapter dependency. These depend only on `@ultranos/shared-types` for province/district data and `next-intl` for labels. Move as-is.

---

## 4. i18n Strategy

The package exports translation objects that apps merge into their `next-intl` message config.

### Message Export Format

```typescript
// packages/patient-workflows/src/messages/en.ts
export const patientWorkflowMessages = {
  registration: {
    nameSection: 'Patient Name',
    givenName: 'Given Name',
    nationalIdLabel: 'National ID#',
    // ... all registration keys currently in OPD-Lite's en.json
  },
  patient: {
    nidMissing: 'National ID missing — update patient profile when available.',
    nidMissingBadge: 'NID Missing',
  },
}
```

### App Integration

```typescript
// In OPD-Lite's next-intl config (e.g., i18n.ts or getMessages)
import { patientWorkflowMessages } from '@ultranos/patient-workflows/messages/en'

const messages = {
  ...localMessages,           // app-specific keys (encounter, vitals, etc.)
  ...patientWorkflowMessages, // patient workflow keys (registration, patient)
}
```

Apps can override specific keys by placing them after the spread.

---

## 5. OPD-Lite Migration

After the package is created, OPD-Lite changes to consume from it:

### New file: `apps/opd-lite/src/lib/patient-adapter.ts`

Implements `PatientWorkflowAdapter` using OPD-Lite's existing infrastructure:
- `checkDuplicates` — fetch to `/patient.checkDuplicates`
- `createPatient` — fetch to `/patient.create`
- `updatePatient` — fetch to `/patient.update`
- `saveLocally` — `db.patients.put(patient)`
- `getAuthHeaders` — `getSupabaseBrowserClient().auth.getSession()`

### Layout wrapper

```tsx
// apps/opd-lite/src/app/[locale]/layout.tsx (or providers file)
import { PatientWorkflowProvider } from '@ultranos/patient-workflows'
import { opdPatientAdapter } from '@/lib/patient-adapter'

<PatientWorkflowProvider adapter={opdPatientAdapter}>
  {children}
</PatientWorkflowProvider>
```

### Import changes

All patient component imports change from `@/components/registration/*` and `@/components/patient/*` to `@ultranos/patient-workflows`:

```typescript
// Before
import { PatientRegistrationForm } from '@/components/registration/PatientRegistrationForm'
import { PatientEditModal } from '@/components/patient/PatientEditModal'
import { NidMissingBanner } from '@/components/patient/NidMissingBanner'

// After
import {
  PatientRegistrationForm,
  PatientEditModal,
  NidMissingBanner,
} from '@ultranos/patient-workflows'
```

### Files removed from OPD-Lite

After migration, these files are deleted from `apps/opd-lite/src/`:
- `components/registration/PatientRegistrationForm.tsx`
- `components/registration/NameInputSection.tsx`
- `components/registration/GeographySection.tsx`
- `components/registration/ConsentSection.tsx`
- `components/registration/ConsentTextModal.tsx`
- `components/registration/MpiResultModal.tsx`
- `components/patient/PatientEditModal.tsx`
- `components/patient/NidMissingBanner.tsx`
- `components/patient/MpiWarnBanner.tsx`
- `components/shared/ProvinceAutocomplete.tsx`
- `components/shared/DistrictAutocomplete.tsx`
- Registration/patient i18n keys from `messages/en.json`, `ar.json`, `prs.json` (now from package)

### Files that stay in OPD-Lite

- `components/patient/PatientBannerStack.tsx` — composes app-specific banners (imports NidMissingBanner and MpiWarnBanner from shared package, but AllergyBanner, ConflictBanner, etc. stay local)
- `components/patient/PatientChartPage.tsx` — page-level orchestrator
- `components/patient/PatientHeaderCard.tsx` — app-specific layout
- `components/patient/PatientDetailsAccordion.tsx` — app-specific display
- `components/ui/Button.tsx` — still used by non-patient components (kept locally; shared package has its own copy)
- `components/Card.tsx` — same reason

---

## 6. Files Summary

### Created (new package)

| File | Purpose |
|------|---------|
| `packages/patient-workflows/package.json` | Package manifest |
| `packages/patient-workflows/tsconfig.json` | TypeScript config |
| `packages/patient-workflows/src/index.ts` | Public exports |
| `packages/patient-workflows/src/types.ts` | Adapter interface + types |
| `packages/patient-workflows/src/context.ts` | React context + provider + hook |
| `packages/patient-workflows/src/components/registration/*` | 6 files moved from OPD-Lite |
| `packages/patient-workflows/src/components/edit/PatientEditModal.tsx` | Moved from OPD-Lite |
| `packages/patient-workflows/src/components/banners/*` | 2 files moved from OPD-Lite |
| `packages/patient-workflows/src/components/geography/*` | 2 files moved from OPD-Lite |
| `packages/patient-workflows/src/components/ui/*` | 2 files copied from OPD-Lite (Button, Card) |
| `packages/patient-workflows/src/messages/en.ts` | English i18n bundle |
| `packages/patient-workflows/src/messages/ar.ts` | Arabic i18n bundle |
| `packages/patient-workflows/src/messages/prs.ts` | Dari i18n bundle |

### Modified (OPD-Lite)

| File | Change |
|------|--------|
| `apps/opd-lite/src/lib/patient-adapter.ts` | New — adapter implementation |
| `apps/opd-lite/src/app/[locale]/layout.tsx` (or providers) | Wrap with PatientWorkflowProvider |
| `apps/opd-lite/src/components/patient/PatientBannerStack.tsx` | Import banners from shared package |
| `apps/opd-lite/src/components/patient/PatientChartPage.tsx` | Import PatientEditModal from shared package |
| `apps/opd-lite/src/app/[locale]/register-patient/page.tsx` | Import form from shared package, pass onSuccess |
| `apps/opd-lite/messages/en.json` | Remove patient-workflow keys (now from package) |
| `apps/opd-lite/messages/ar.json` | Same |
| `apps/opd-lite/messages/prs.json` | Same |

### Deleted (OPD-Lite)

12 component files that moved to the shared package (listed in Section 5).
