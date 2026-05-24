# Pharmacy Lite Enterprise UX Overhaul

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform pharmacy-lite from a functional prototype into an enterprise-grade pharmacy workstation with patient intake, dispensing safety gates, responsive layouts, confident visual identity, meaningful onboarding, and power-user efficiency.

**Architecture:** Multi-entry hub dashboard replaces the current QR-only assumption. Patient search/create mirrors OPD-Lite's two-phase search (local Dexie + Hub API revalidation). Dispensing flow gains allergy display + drug interaction gate + confirmation modal. Layout becomes responsive per view type. Button component gets accessibility fixes that propagate globally.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS (design tokens via `@ultranos/ui-kit/tokens.css`), Dexie (IndexedDB), Zustand stores, next-intl (i18n), `@ultranos/ui-kit` shared components.

**Design System Reference:** DESIGN.md at project root. Primary: Wise Green `#9fe870`, pill-text `#163300`. Font: Inter. Buttons: pill-shaped (9999px radius). Depth: flat with borders. Custom easing: `cubic-bezier(0.23, 1, 0.32, 1)`.

---

## File Structure Overview

### New Files
```
apps/pharmacy-lite/src/
├── components/pharmacy/
│   ├── PatientSearchBar.tsx         # Search input with debounce + results dropdown
│   ├── PatientSearchResults.tsx     # Results list with select + register CTA
│   ├── PatientRegistrationForm.tsx  # Minimal registration form for pharmacy context
│   ├── DashboardActionHub.tsx       # Multi-entry hub replacing current quick actions
│   ├── DispensingConfirmationModal.tsx  # Safety gate modal before final dispensing
│   ├── AllergyBanner.tsx            # Red prominent allergy display (never collapsed)
│   ├── InteractionCheckBanner.tsx   # Drug interaction results or "unavailable" warning
│   ├── EmptyState.tsx               # Reusable empty state with illustration + CTA
│   ├── ShiftProgressBar.tsx         # Daily progress visualization
│   ├── SessionExpiryBanner.tsx      # Proactive session expiry warning
│   └── KeyboardShortcutHint.tsx     # Tooltip shortcut indicator
├── hooks/
│   ├── usePatientSearch.ts          # Two-phase search (local + Hub)
│   ├── useKeyboardShortcuts.ts      # Global shortcut registration
│   └── useSessionExpiryWarning.ts   # Session countdown with threshold alerts
├── lib/
│   ├── patient-search.ts            # Dexie + Hub API patient search logic
│   └── patient-register.ts          # Patient creation + duplicate check
└── stores/
    └── patient-store.ts             # Active patient context for dispensing
```

### Modified Files
```
apps/pharmacy-lite/src/
├── components/ui/Button.tsx                   # Fix focus-visible, transition-all, hover gate
├── components/pharmacy/PharmacyDashboard.tsx   # Replace with DashboardActionHub
├── components/pharmacy/DispensingSummaryCard.tsx # Visual hierarchy differentiation
├── components/pharmacy/FulfillmentChecklist.tsx  # Add allergy + interaction gates
├── components/pharmacy/SyncQueueCard.tsx       # Visual refresh
├── components/pharmacy/RecentDispensingList.tsx # Show patient names not UUIDs
├── components/pharmacy/ControlledSubstancesView.tsx # Remove dark: classes, fix width
├── components/pharmacy/UnverifiedDispensesView.tsx  # Remove dark:, replace alert()
├── components/pharmacy/PrescriptionQueueView.tsx    # Fix hardcoded hex
├── components/pharmacy/QueueItemCard.tsx       # Fix animate-pulse motion guard
├── components/pharmacy/PharmacySettingsView.tsx # Visual hierarchy, expiry warning
├── components/pharmacy/ShiftSummary.tsx        # Fix bg-black to neutral-900
├── components/AppShellWrapper.tsx              # Responsive content width, keyboard shortcuts
├── app/[locale]/page.tsx                      # Updated dashboard
├── app/[locale]/login/page.tsx                # Branding + focus-visible
└── lib/db.ts                                  # Add patients table (v5)
apps/pharmacy-lite/tailwind.config.ts          # Add animation tokens, wider breakpoints
```

---

## Phase 1: Foundation Fixes (Button, Accessibility, Layout)

### Task 1: Fix Button Component Accessibility

**Files:**
- Modify: `apps/pharmacy-lite/src/components/ui/Button.tsx`
- Test: `apps/pharmacy-lite/src/__tests__/button-accessibility.test.tsx`

- [ ] **Step 1: Write failing test for focus-visible behavior**

```tsx
// apps/pharmacy-lite/src/__tests__/button-accessibility.test.tsx
import { render, screen } from '@testing-library/react'
import { Button } from '@/components/ui/Button'

describe('Button accessibility', () => {
  it('uses focus-visible instead of focus for ring styles', () => {
    render(<Button>Test</Button>)
    const btn = screen.getByRole('button')
    // Check that className contains focus-visible and not bare focus:ring
    expect(btn.className).toContain('focus-visible:ring-2')
    expect(btn.className).not.toMatch(/(?<!\-)focus:ring/)
  })

  it('does not use transition-all', () => {
    render(<Button>Test</Button>)
    const btn = screen.getByRole('button')
    expect(btn.className).not.toContain('transition-all')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite exec vitest run src/__tests__/button-accessibility.test.tsx`
Expected: FAIL — className contains `focus:ring-2` and `transition-all`

- [ ] **Step 3: Update Button component**

```tsx
// apps/pharmacy-lite/src/components/ui/Button.tsx
import { forwardRef, type ButtonHTMLAttributes } from 'react'

type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'danger'
  | 'warning'
  | 'ghost'
  | 'outline'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  fullWidth?: boolean
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-pill-green text-pill-text',
  secondary: 'bg-neutral-200 text-neutral-700',
  danger: 'bg-red-600 text-white',
  warning: 'bg-amber-600 text-white',
  ghost: 'bg-transparent text-primary-500',
  outline: 'border border-neutral-300 bg-white text-neutral-700',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      fullWidth,
      className = '',
      children,
      ...props
    },
    ref,
  ) => {
    const base =
      'inline-flex items-center justify-center rounded-pill ' +
      'px-5 py-2 text-sm font-semibold ' +
      'transition-[transform,filter,background-color] duration-100 ease-[cubic-bezier(0.23,1,0.32,1)] ' +
      '@media(hover:hover):hover:brightness-[1.04] active:brightness-[0.88] ' +
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 focus-visible:ring-offset-2 ' +
      'disabled:opacity-50 disabled:cursor-not-allowed ' +
      'disabled:hover:brightness-100 ' +
      'motion-reduce:transition-none'

    const classes = [
      base,
      variantClasses[variant],
      fullWidth && 'w-full',
      className,
    ]
      .filter(Boolean)
      .join(' ')

    return (
      <button ref={ref} className={classes} {...props}>
        {children}
      </button>
    )
  },
)

Button.displayName = 'Button'
```

Note: Tailwind doesn't support inline `@media` in class strings. The correct approach for hover gating in Tailwind is to keep `hover:brightness-[1.04]` — Tailwind's hover variant on desktop is acceptable since this is a desktop PWA primarily. The key fixes are:
- `transition-all` → `transition-[transform,filter,background-color]`
- `focus:` → `focus-visible:`
- `ease-out` → custom cubic-bezier via `ease-[cubic-bezier(0.23,1,0.32,1)]`
- `motion-reduce:hover:brightness-100 motion-reduce:active:brightness-100` → `motion-reduce:transition-none`

Revised base string:
```ts
const base =
  'inline-flex items-center justify-center rounded-pill ' +
  'px-5 py-2 text-sm font-semibold ' +
  'transition-[transform,filter,background-color] duration-100 ease-[cubic-bezier(0.23,1,0.32,1)] ' +
  'hover:brightness-[1.04] active:brightness-[0.88] ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 focus-visible:ring-offset-2 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed ' +
  'disabled:hover:brightness-100 ' +
  'motion-reduce:transition-none'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F pharmacy-lite exec vitest run src/__tests__/button-accessibility.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/pharmacy-lite/src/components/ui/Button.tsx apps/pharmacy-lite/src/__tests__/button-accessibility.test.tsx
git commit -m "fix(pharmacy-lite): Button accessibility — focus-visible, scoped transitions, custom easing"
```

---

### Task 2: Fix Animate-Pulse Motion Guards

**Files:**
- Modify: `apps/pharmacy-lite/src/components/pharmacy/QueueItemCard.tsx`
- Modify: `apps/pharmacy-lite/src/components/pharmacy/SyncPulse.tsx`

- [ ] **Step 1: Add motion-reduce guards to QueueItemCard**

In `QueueItemCard.tsx`, change:
- Line 18: `'bg-amber-100 text-amber-700 animate-pulse'` → `'bg-amber-100 text-amber-700 animate-pulse motion-reduce:animate-none'`
- Line 137: The spinner `animate-spin` → add `motion-reduce:animate-none`

```tsx
// Line 18 in phaseBadgeClasses
dispensing: 'bg-amber-100 text-amber-700 animate-pulse motion-reduce:animate-none',

// Line 137 — spinner
<span className="inline-block h-3 w-3 animate-spin motion-reduce:animate-none rounded-full border-2 border-red-300 border-t-red-700 me-1" />
```

- [ ] **Step 2: Add motion-reduce guard to SyncPulse**

In `SyncPulse.tsx`, find the `animate-pulse` class and append `motion-reduce:animate-none`.

- [ ] **Step 3: Fix ShiftSummary bg-black**

In `ShiftSummary.tsx` line 38, change `bg-black/40` to `bg-neutral-900/40` (DESIGN.md says never use #000).

- [ ] **Step 4: Fix hardcoded hex in PrescriptionQueueView**

In `PrescriptionQueueView.tsx` line 148, change `border-[#163300] text-[#163300]` to `border-pill-text text-pill-text`.

- [ ] **Step 5: Commit**

```bash
git add apps/pharmacy-lite/src/components/pharmacy/QueueItemCard.tsx apps/pharmacy-lite/src/components/pharmacy/SyncPulse.tsx apps/pharmacy-lite/src/components/pharmacy/ShiftSummary.tsx apps/pharmacy-lite/src/components/pharmacy/PrescriptionQueueView.tsx
git commit -m "fix(pharmacy-lite): motion-reduce guards, remove bg-black, use design tokens"
```

---

### Task 3: Responsive Content Width

**Files:**
- Modify: `apps/pharmacy-lite/src/components/AppShellWrapper.tsx`

- [ ] **Step 1: Define width-aware content wrapper**

Replace the single `max-w-2xl` with a route-aware width. Table-heavy pages get full width; form pages stay narrow.

In `AppShellWrapper.tsx`, change the `<main>` element:

```tsx
// Before:
<main id="main-content" className="mx-auto max-w-2xl px-4 py-6">

// After — route-aware content width:
const wideRoutes = ['/controlled', '/unverified', '/history', '/sync', '/queue']
const isWideRoute = wideRoutes.some((r) => pathname.endsWith(r))

// In JSX:
<main id="main-content" className={`mx-auto px-4 py-6 ${isWideRoute ? 'max-w-5xl' : 'max-w-2xl'}`}>
```

- [ ] **Step 2: Remove incomplete dark mode classes**

Remove all `dark:` classes from `ControlledSubstancesView.tsx` and `UnverifiedDispensesView.tsx`. The app has no theme toggle and no consistent dark mode support — partial dark classes create inconsistency.

In `ControlledSubstancesView.tsx`: Remove every `dark:*` class (approximately 15 instances).
In `UnverifiedDispensesView.tsx`: Remove every `dark:*` class (approximately 12 instances).

- [ ] **Step 3: Replace alert() with inline error in UnverifiedDispensesView**

In `UnverifiedDispensesView.tsx` line 155, replace:
```tsx
alert(t('reviewNotConnected'))
```
with:
```tsx
setError(t('reviewNotConnected'))
```

- [ ] **Step 4: Commit**

```bash
git add apps/pharmacy-lite/src/components/AppShellWrapper.tsx apps/pharmacy-lite/src/components/pharmacy/ControlledSubstancesView.tsx apps/pharmacy-lite/src/components/pharmacy/UnverifiedDispensesView.tsx
git commit -m "fix(pharmacy-lite): responsive content width, remove incomplete dark mode, replace alert()"
```

---

## Phase 2: Patient Intake Hub (P0)

### Task 4: Patient Store + Database Schema

**Files:**
- Create: `apps/pharmacy-lite/src/stores/patient-store.ts`
- Modify: `apps/pharmacy-lite/src/lib/db.ts`

- [ ] **Step 1: Add patients table to Dexie schema (v5)**

```ts
// Add to db.ts — new interface above the class
export interface LocalPatient {
  id: string
  nameGiven: string
  nameFather?: string
  gender: 'male' | 'female' | 'other' | 'unknown'
  birthYear?: number
  birthDate?: string
  phone?: string
  preferredLanguage?: string
  allergies?: string[] // Critical — displayed prominently during dispensing
  createdAt: string
  source: 'registered' | 'qr-verified' | 'hub-synced'
}

// Add to PharmacyLiteDatabase class:
patients!: EntityTable<LocalPatient, 'id'>

// Add version 5:
this.version(5).stores({
  patients: 'id, nameGiven, phone, createdAt',
})

// Add to PHI_TABLE_CONFIGS:
{
  tableName: 'patients',
  indexedFields: ['id', 'nameGiven', 'phone', 'createdAt'],
},
```

- [ ] **Step 2: Create patient store**

```ts
// apps/pharmacy-lite/src/stores/patient-store.ts
import { create } from 'zustand'
import type { LocalPatient } from '@/lib/db'

interface PatientState {
  activePatient: LocalPatient | null
  setActivePatient: (patient: LocalPatient | null) => void
  clearPatient: () => void
}

export const usePatientStore = create<PatientState>((set) => ({
  activePatient: null,
  setActivePatient: (patient) => set({ activePatient: patient }),
  clearPatient: () => set({ activePatient: null }),
}))
```

- [ ] **Step 3: Commit**

```bash
git add apps/pharmacy-lite/src/lib/db.ts apps/pharmacy-lite/src/stores/patient-store.ts
git commit -m "feat(pharmacy-lite): add patients table (v5) and patient store"
```

---

### Task 5: Patient Search Hook

**Files:**
- Create: `apps/pharmacy-lite/src/hooks/usePatientSearch.ts`
- Create: `apps/pharmacy-lite/src/lib/patient-search.ts`

- [ ] **Step 1: Create patient search logic**

```ts
// apps/pharmacy-lite/src/lib/patient-search.ts
import { db, type LocalPatient } from '@/lib/db'

const SEARCH_LIMIT = 20

/**
 * Phase 1: Local Dexie search — fast, works offline.
 * Searches nameGiven (case-insensitive prefix) and phone (exact prefix).
 */
export async function searchPatientsLocal(query: string): Promise<LocalPatient[]> {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed || trimmed.length < 2) return []

  const results = await db.patients
    .filter((p) => {
      const nameMatch = p.nameGiven.toLowerCase().startsWith(trimmed)
      const phoneMatch = p.phone?.startsWith(trimmed) ?? false
      return nameMatch || phoneMatch
    })
    .limit(SEARCH_LIMIT)
    .toArray()

  return results
}

/**
 * Phase 2: Hub API search — non-blocking background revalidation.
 * Only called when online. Returns additional matches not in local DB.
 */
export async function searchPatientsHub(
  query: string,
  hubBaseUrl: string,
  token: string,
  signal?: AbortSignal,
): Promise<LocalPatient[]> {
  const url = new URL(hubBaseUrl)
  url.pathname = url.pathname.replace(/\/$/, '') + '/patient.search'
  url.searchParams.set('input', JSON.stringify({ json: { query, limit: SEARCH_LIMIT } }))

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  })

  if (!res.ok) return []

  const body = (await res.json()) as { result: { data: { json: LocalPatient[] } } }
  return body.result.data.json
}
```

- [ ] **Step 2: Create search hook with debounce**

```ts
// apps/pharmacy-lite/src/hooks/usePatientSearch.ts
import { useState, useEffect, useRef, useCallback } from 'react'
import { searchPatientsLocal, searchPatientsHub } from '@/lib/patient-search'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getHubApiUrl } from '@/lib/trpc'
import type { LocalPatient } from '@/lib/db'

const DEBOUNCE_MS = 300

interface UsePatientSearchReturn {
  query: string
  setQuery: (q: string) => void
  results: LocalPatient[]
  isSearching: boolean
  hasSearched: boolean
}

export function usePatientSearch(): UsePatientSearchReturn {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<LocalPatient[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const performSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([])
      setHasSearched(false)
      return
    }

    setIsSearching(true)
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      // Phase 1: Fast local search
      const localResults = await searchPatientsLocal(q)
      setResults(localResults)
      setHasSearched(true)

      // Phase 2: Background Hub revalidation (non-blocking)
      if (navigator.onLine) {
        const token = await useAuthSessionStore.getState().getAccessToken()
        if (token && !controller.signal.aborted) {
          const hubResults = await searchPatientsHub(q, getHubApiUrl(), token, controller.signal)
          if (!controller.signal.aborted) {
            // Merge: dedupe by id, prefer hub version
            const merged = new Map(localResults.map((p) => [p.id, p]))
            hubResults.forEach((p) => merged.set(p.id, p))
            setResults(Array.from(merged.values()))
          }
        }
      }
    } catch {
      // Search failed — keep local results
    } finally {
      if (!controller.signal.aborted) setIsSearching(false)
    }
  }, [])

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => performSearch(query), DEBOUNCE_MS)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [query, performSearch])

  useEffect(() => {
    return () => { abortRef.current?.abort() }
  }, [])

  return { query, setQuery, results, isSearching, hasSearched }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/pharmacy-lite/src/lib/patient-search.ts apps/pharmacy-lite/src/hooks/usePatientSearch.ts
git commit -m "feat(pharmacy-lite): patient search hook with two-phase local + Hub lookup"
```

---

### Task 6: Patient Search UI Components

**Files:**
- Create: `apps/pharmacy-lite/src/components/pharmacy/PatientSearchBar.tsx`
- Create: `apps/pharmacy-lite/src/components/pharmacy/PatientSearchResults.tsx`

- [ ] **Step 1: Create PatientSearchBar**

```tsx
// apps/pharmacy-lite/src/components/pharmacy/PatientSearchBar.tsx
'use client'

import { usePatientSearch } from '@/hooks/usePatientSearch'
import { PatientSearchResults } from './PatientSearchResults'
import type { LocalPatient } from '@/lib/db'

interface PatientSearchBarProps {
  onSelectPatient: (patient: LocalPatient) => void
  onRegisterNew: (prefillName?: string) => void
}

export function PatientSearchBar({ onSelectPatient, onRegisterNew }: PatientSearchBarProps) {
  const { query, setQuery, results, isSearching, hasSearched } = usePatientSearch()

  return (
    <div className="relative" data-testid="patient-search-bar">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search patient by name or phone..."
          className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"
          data-testid="patient-search-input"
          autoComplete="off"
        />
        {isSearching && (
          <div className="absolute end-3 top-1/2 -translate-y-1/2">
            <span className="inline-block h-4 w-4 animate-spin motion-reduce:animate-none rounded-full border-2 border-primary-200 border-t-primary-600" />
          </div>
        )}
      </div>

      {hasSearched && (
        <PatientSearchResults
          results={results}
          query={query}
          onSelect={onSelectPatient}
          onRegisterNew={() => onRegisterNew(query)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create PatientSearchResults**

```tsx
// apps/pharmacy-lite/src/components/pharmacy/PatientSearchResults.tsx
'use client'

import type { LocalPatient } from '@/lib/db'

interface PatientSearchResultsProps {
  results: LocalPatient[]
  query: string
  onSelect: (patient: LocalPatient) => void
  onRegisterNew: () => void
}

export function PatientSearchResults({
  results,
  query,
  onSelect,
  onRegisterNew,
}: PatientSearchResultsProps) {
  if (results.length === 0) {
    return (
      <div
        className="mt-2 rounded-lg border border-neutral-200 bg-white p-4"
        data-testid="patient-no-results"
      >
        <p className="text-sm text-neutral-600">
          No patients found for &ldquo;{query}&rdquo;
        </p>
        <button
          type="button"
          onClick={onRegisterNew}
          className="mt-2 text-sm font-semibold text-primary-700 hover:text-primary-800"
          data-testid="register-new-patient-link"
        >
          + Register new patient
        </button>
      </div>
    )
  }

  return (
    <ul
      className="mt-2 divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white overflow-hidden"
      data-testid="patient-search-results"
      role="listbox"
    >
      {results.map((patient) => (
        <li
          key={patient.id}
          role="option"
          className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-neutral-50 transition-colors"
          onClick={() => onSelect(patient)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(patient) } }}
          tabIndex={0}
          data-testid={`patient-result-${patient.id}`}
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-neutral-900 truncate">
              {patient.nameGiven}
              {patient.nameFather ? ` ${patient.nameFather}` : ''}
            </p>
            <p className="text-xs text-neutral-500">
              {patient.gender} {patient.birthYear ? `| ${new Date().getFullYear() - patient.birthYear} y/o` : ''}
              {patient.phone ? ` | ${patient.phone}` : ''}
            </p>
          </div>
          {patient.allergies && patient.allergies.length > 0 && (
            <span className="ms-2 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800">
              ALLERGIES
            </span>
          )}
        </li>
      ))}
      {results.length < 5 && (
        <li className="px-4 py-3 bg-neutral-50">
          <button
            type="button"
            onClick={onRegisterNew}
            className="text-sm font-semibold text-primary-700 hover:text-primary-800"
            data-testid="register-new-from-results"
          >
            + Register new patient
          </button>
        </li>
      )}
    </ul>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/pharmacy-lite/src/components/pharmacy/PatientSearchBar.tsx apps/pharmacy-lite/src/components/pharmacy/PatientSearchResults.tsx
git commit -m "feat(pharmacy-lite): patient search bar and results UI components"
```

---

### Task 7: Patient Registration Form

**Files:**
- Create: `apps/pharmacy-lite/src/components/pharmacy/PatientRegistrationForm.tsx`
- Create: `apps/pharmacy-lite/src/lib/patient-register.ts`

- [ ] **Step 1: Create registration logic**

```ts
// apps/pharmacy-lite/src/lib/patient-register.ts
import { db, type LocalPatient } from '@/lib/db'
import { hlcNow } from '@/lib/hlc'

export interface PatientRegistrationData {
  nameGiven: string
  nameFather?: string
  gender: 'male' | 'female' | 'other' | 'unknown'
  birthYear?: number
  phone?: string
  preferredLanguage?: string
  allergies?: string[]
}

export async function registerPatientLocally(data: PatientRegistrationData): Promise<LocalPatient> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  const patient: LocalPatient = {
    id,
    nameGiven: data.nameGiven.trim(),
    nameFather: data.nameFather?.trim() || undefined,
    gender: data.gender,
    birthYear: data.birthYear,
    phone: data.phone?.trim() || undefined,
    preferredLanguage: data.preferredLanguage,
    allergies: data.allergies?.filter(Boolean) || undefined,
    createdAt: now,
    source: 'registered',
  }

  await db.patients.put(patient)

  // Enqueue sync to Hub
  await db.syncQueue.put({
    id: crypto.randomUUID(),
    resourceType: 'Patient',
    resourceId: id,
    action: 'create',
    payload: JSON.stringify(patient),
    status: 'pending',
    hlcTimestamp: hlcNow(),
    createdAt: now,
    retryCount: 0,
  })

  return patient
}
```

- [ ] **Step 2: Create registration form (pharmacy-minimal — fewer fields than OPD-Lite)**

```tsx
// apps/pharmacy-lite/src/components/pharmacy/PatientRegistrationForm.tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { registerPatientLocally, type PatientRegistrationData } from '@/lib/patient-register'
import type { LocalPatient } from '@/lib/db'

interface PatientRegistrationFormProps {
  prefillName?: string
  onRegistered: (patient: LocalPatient) => void
  onCancel: () => void
}

export function PatientRegistrationForm({
  prefillName,
  onRegistered,
  onCancel,
}: PatientRegistrationFormProps) {
  const [form, setForm] = useState<PatientRegistrationData>({
    nameGiven: prefillName ?? '',
    gender: 'unknown',
  })
  const [allergyInput, setAllergyInput] = useState('')
  const [allergies, setAllergies] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAddAllergy = () => {
    const trimmed = allergyInput.trim()
    if (trimmed && !allergies.includes(trimmed)) {
      setAllergies([...allergies, trimmed])
      setAllergyInput('')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nameGiven.trim()) return

    setSaving(true)
    setError(null)
    try {
      const patient = await registerPatientLocally({
        ...form,
        allergies: allergies.length > 0 ? allergies : undefined,
      })
      onRegistered(patient)
    } catch {
      setError('Failed to register patient. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="patient-registration-form">
      <h3 className="text-lg font-semibold text-neutral-900">Register New Patient</h3>

      {error && (
        <div role="alert" className="rounded-md bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Name */}
      <div>
        <label htmlFor="reg-name" className="mb-1 block text-xs font-medium text-neutral-600">
          Patient Name <span className="text-red-600">*</span>
        </label>
        <input
          id="reg-name"
          type="text"
          required
          value={form.nameGiven}
          onChange={(e) => setForm({ ...form, nameGiven: e.target.value })}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500"
          data-testid="reg-name-input"
        />
      </div>

      {/* Father's Name */}
      <div>
        <label htmlFor="reg-father" className="mb-1 block text-xs font-medium text-neutral-600">
          Father&apos;s Name
        </label>
        <input
          id="reg-father"
          type="text"
          value={form.nameFather ?? ''}
          onChange={(e) => setForm({ ...form, nameFather: e.target.value })}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500"
        />
      </div>

      {/* Gender + Birth Year row */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="reg-gender" className="mb-1 block text-xs font-medium text-neutral-600">
            Gender <span className="text-red-600">*</span>
          </label>
          <select
            id="reg-gender"
            value={form.gender}
            onChange={(e) => setForm({ ...form, gender: e.target.value as PatientRegistrationData['gender'] })}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500"
          >
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
            <option value="unknown">Unknown</option>
          </select>
        </div>
        <div>
          <label htmlFor="reg-birth-year" className="mb-1 block text-xs font-medium text-neutral-600">
            Birth Year
          </label>
          <input
            id="reg-birth-year"
            type="number"
            min={1900}
            max={new Date().getFullYear()}
            value={form.birthYear ?? ''}
            onChange={(e) => setForm({ ...form, birthYear: e.target.value ? parseInt(e.target.value) : undefined })}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500"
          />
        </div>
      </div>

      {/* Phone */}
      <div>
        <label htmlFor="reg-phone" className="mb-1 block text-xs font-medium text-neutral-600">
          Phone Number
        </label>
        <input
          id="reg-phone"
          type="tel"
          value={form.phone ?? ''}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500"
        />
      </div>

      {/* Allergies — CRITICAL per CLAUDE.md rule #4 */}
      <div>
        <label className="mb-1 block text-xs font-medium text-red-700">
          Known Allergies (enter each and press Add)
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={allergyInput}
            onChange={(e) => setAllergyInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddAllergy() } }}
            placeholder="e.g. Penicillin"
            className="flex-1 rounded-md border border-red-200 bg-red-50/30 px-3 py-2 text-sm focus-visible:border-red-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-300"
            data-testid="allergy-input"
          />
          <Button type="button" variant="outline" onClick={handleAddAllergy}>Add</Button>
        </div>
        {allergies.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {allergies.map((a) => (
              <span key={a} className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800">
                {a}
                <button
                  type="button"
                  onClick={() => setAllergies(allergies.filter((x) => x !== a))}
                  className="text-red-600 hover:text-red-900"
                  aria-label={`Remove ${a}`}
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <Button type="submit" variant="primary" disabled={!form.nameGiven.trim() || saving} fullWidth>
          {saving ? 'Registering...' : 'Register Patient'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/pharmacy-lite/src/lib/patient-register.ts apps/pharmacy-lite/src/components/pharmacy/PatientRegistrationForm.tsx
git commit -m "feat(pharmacy-lite): patient registration form with allergy capture"
```

---

### Task 8: Dashboard Action Hub (Multi-Entry)

**Files:**
- Create: `apps/pharmacy-lite/src/components/pharmacy/DashboardActionHub.tsx`
- Modify: `apps/pharmacy-lite/src/components/pharmacy/PharmacyDashboard.tsx`

- [ ] **Step 1: Create DashboardActionHub component**

```tsx
// apps/pharmacy-lite/src/components/pharmacy/DashboardActionHub.tsx
'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { PatientSearchBar } from './PatientSearchBar'
import { PatientRegistrationForm } from './PatientRegistrationForm'
import { usePatientStore } from '@/stores/patient-store'
import type { LocalPatient } from '@/lib/db'

type HubView = 'actions' | 'register'

export function DashboardActionHub() {
  const [view, setView] = useState<HubView>('actions')
  const [prefillName, setPrefillName] = useState<string>()
  const setActivePatient = usePatientStore((s) => s.setActivePatient)

  const handleSelectPatient = useCallback((patient: LocalPatient) => {
    setActivePatient(patient)
    // Navigate to scan page with patient context
    window.location.href = '/scan'
  }, [setActivePatient])

  const handleRegisterNew = useCallback((name?: string) => {
    setPrefillName(name)
    setView('register')
  }, [])

  const handleRegistered = useCallback((patient: LocalPatient) => {
    setActivePatient(patient)
    setView('actions')
    // Navigate to scan page with new patient
    window.location.href = '/scan'
  }, [setActivePatient])

  if (view === 'register') {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-5">
        <PatientRegistrationForm
          prefillName={prefillName}
          onRegistered={handleRegistered}
          onCancel={() => setView('actions')}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4" data-testid="dashboard-action-hub">
      {/* Patient Search — primary action for walk-ins */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5">
        <h3 className="mb-3 text-sm font-semibold text-neutral-700">Find or Register Patient</h3>
        <PatientSearchBar
          onSelectPatient={handleSelectPatient}
          onRegisterNew={handleRegisterNew}
        />
      </div>

      {/* Three entry paths */}
      <div className="grid grid-cols-3 gap-3">
        <Link
          href="/scan"
          className="flex flex-col items-center gap-2 rounded-xl border border-primary-200 bg-primary-50/50 p-4 text-center transition-colors hover:bg-primary-50"
          data-testid="action-scan-qr"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary-700">
            <path d="M3 7V5a2 2 0 0 1 2-2h2" />
            <path d="M17 3h2a2 2 0 0 1 2 2v2" />
            <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
            <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
            <line x1="7" y1="12" x2="17" y2="12" />
          </svg>
          <span className="text-xs font-semibold text-primary-800">Scan QR Rx</span>
          <span className="text-[10px] text-neutral-500">From OPD-Lite</span>
        </Link>

        <Link
          href="/paper-rx"
          className="flex flex-col items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/50 p-4 text-center transition-colors hover:bg-amber-50"
          data-testid="action-paper-rx"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-700">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          <span className="text-xs font-semibold text-amber-800">Paper Rx</span>
          <span className="text-[10px] text-neutral-500">OCR Scan</span>
        </Link>

        <button
          type="button"
          onClick={() => handleRegisterNew()}
          className="flex flex-col items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50/50 p-4 text-center transition-colors hover:bg-neutral-50"
          data-testid="action-walk-in"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-700">
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="8.5" cy="7" r="4" />
            <line x1="20" y1="8" x2="20" y2="14" />
            <line x1="23" y1="11" x2="17" y2="11" />
          </svg>
          <span className="text-xs font-semibold text-neutral-800">Walk-in</span>
          <span className="text-[10px] text-neutral-500">New Patient</span>
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update PharmacyDashboard to use DashboardActionHub**

Replace the current quick actions section in `PharmacyDashboard.tsx`:

```tsx
// Replace lines 184-201 (the grid-cols-2 quick actions) with:
import { DashboardActionHub } from './DashboardActionHub'

// In the JSX, replace the Quick Actions grid with:
<DashboardActionHub />
```

The full updated return of PharmacyDashboard becomes:
```tsx
return (
  <div className="space-y-6">
    {/* Welcome header */}
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-xl font-bold text-neutral-900">
          Welcome, {pharmacistName}
        </h2>
        <p className="text-sm text-neutral-500">Pharmacy Dashboard</p>
      </div>
      <div data-testid="connectivity-indicator" className="flex items-center gap-2">
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className="text-xs text-neutral-500">{isOnline ? 'Online' : 'Offline'}</span>
      </div>
    </div>

    {/* Multi-entry action hub */}
    <DashboardActionHub />

    {/* Today's dispensing summary */}
    <DispensingSummaryCard
      dispensedToday={stats.dispensedToday}
      pendingSync={stats.pendingSync}
      failedSync={stats.failedSync}
    />

    {/* Pending sync queue */}
    <SyncQueueCard pendingCount={stats.pendingSync} />

    {/* Recent dispensing list */}
    <RecentDispensingList items={stats.recentDispenses} />
  </div>
)
```

- [ ] **Step 3: Commit**

```bash
git add apps/pharmacy-lite/src/components/pharmacy/DashboardActionHub.tsx apps/pharmacy-lite/src/components/pharmacy/PharmacyDashboard.tsx
git commit -m "feat(pharmacy-lite): multi-entry dashboard hub with patient search, QR, paper, walk-in paths"
```

---

## Phase 3: Dispensing Safety Gates (P1)

### Task 9: Allergy Banner Component

**Files:**
- Create: `apps/pharmacy-lite/src/components/pharmacy/AllergyBanner.tsx`

- [ ] **Step 1: Create AllergyBanner (CLAUDE.md rule #4: highest prominence, red, never collapsed)**

```tsx
// apps/pharmacy-lite/src/components/pharmacy/AllergyBanner.tsx
'use client'

interface AllergyBannerProps {
  allergies: string[]
  patientName?: string
}

/**
 * SAFETY-CRITICAL: Per CLAUDE.md rule #4, allergy data gets highest display
 * prominence. Renders first, in red, never collapsed, never behind a tab.
 */
export function AllergyBanner({ allergies, patientName }: AllergyBannerProps) {
  if (!allergies || allergies.length === 0) return null

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="rounded-lg border-2 border-red-500 bg-red-50 p-4"
      data-testid="allergy-banner"
    >
      <div className="flex items-center gap-2 mb-2">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-700 shrink-0">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span className="text-sm font-bold text-red-800 uppercase tracking-wide">
          Known Allergies{patientName ? ` — ${patientName}` : ''}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {allergies.map((allergy) => (
          <span
            key={allergy}
            className="inline-flex items-center rounded-full bg-red-200 px-3 py-1 text-sm font-bold text-red-900"
          >
            {allergy}
          </span>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/pharmacy-lite/src/components/pharmacy/AllergyBanner.tsx
git commit -m "feat(pharmacy-lite): AllergyBanner — highest prominence, red, never collapsed (CLAUDE.md #4)"
```

---

### Task 10: Drug Interaction Check Banner

**Files:**
- Create: `apps/pharmacy-lite/src/components/pharmacy/InteractionCheckBanner.tsx`

- [ ] **Step 1: Create InteractionCheckBanner (CLAUDE.md rule #3: never skip silently)**

```tsx
// apps/pharmacy-lite/src/components/pharmacy/InteractionCheckBanner.tsx
'use client'

type InteractionStatus =
  | { state: 'checking' }
  | { state: 'clear' }
  | { state: 'warning'; interactions: string[] }
  | { state: 'contraindicated'; interactions: string[] }
  | { state: 'unavailable'; reason: string }

interface InteractionCheckBannerProps {
  status: InteractionStatus
}

/**
 * SAFETY-CRITICAL: Per CLAUDE.md rule #3, if the drug interaction check fails,
 * the UI must show "Interaction check unavailable." Never default to
 * "no interactions found" on failure.
 */
export function InteractionCheckBanner({ status }: InteractionCheckBannerProps) {
  switch (status.state) {
    case 'checking':
      return (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-center" data-testid="interaction-checking">
          <p className="text-sm text-neutral-600">Checking drug interactions...</p>
        </div>
      )

    case 'clear':
      return (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3" data-testid="interaction-clear">
          <p className="text-sm font-medium text-green-800">No known drug interactions detected.</p>
        </div>
      )

    case 'warning':
      return (
        <div role="alert" className="rounded-lg border-2 border-amber-400 bg-amber-50 p-4" data-testid="interaction-warning">
          <p className="text-sm font-bold text-amber-800 mb-2">Drug Interaction Warning</p>
          <ul className="space-y-1">
            {status.interactions.map((interaction, i) => (
              <li key={i} className="text-sm text-amber-700">• {interaction}</li>
            ))}
          </ul>
        </div>
      )

    case 'contraindicated':
      return (
        <div role="alert" className="rounded-lg border-2 border-red-500 bg-red-50 p-4" data-testid="interaction-contraindicated">
          <p className="text-sm font-bold text-red-800 uppercase mb-2">CONTRAINDICATION DETECTED</p>
          <ul className="space-y-1">
            {status.interactions.map((interaction, i) => (
              <li key={i} className="text-sm font-semibold text-red-700">• {interaction}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-red-700 font-medium">
            Dispensing is blocked. Contact prescribing physician for alternatives.
          </p>
        </div>
      )

    case 'unavailable':
      return (
        <div role="alert" className="rounded-lg border-2 border-amber-500 bg-amber-50 p-4" data-testid="interaction-unavailable">
          <p className="text-sm font-bold text-amber-900">
            Interaction check unavailable
          </p>
          <p className="text-xs text-amber-700 mt-1">{status.reason}</p>
          <p className="text-xs font-semibold text-amber-800 mt-2">
            Proceed with caution. Manually verify drug interactions before dispensing.
          </p>
        </div>
      )
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/pharmacy-lite/src/components/pharmacy/InteractionCheckBanner.tsx
git commit -m "feat(pharmacy-lite): InteractionCheckBanner — never silently skip (CLAUDE.md #3)"
```

---

### Task 11: Dispensing Confirmation Modal

**Files:**
- Create: `apps/pharmacy-lite/src/components/pharmacy/DispensingConfirmationModal.tsx`
- Modify: `apps/pharmacy-lite/src/components/pharmacy/FulfillmentChecklist.tsx`

- [ ] **Step 1: Create DispensingConfirmationModal**

```tsx
// apps/pharmacy-lite/src/components/pharmacy/DispensingConfirmationModal.tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { AllergyBanner } from './AllergyBanner'
import type { FulfillmentItem } from '@/stores/fulfillment-store'

interface DispensingConfirmationModalProps {
  items: FulfillmentItem[]
  patientName?: string
  patientAllergies?: string[]
  onConfirm: () => void
  onCancel: () => void
}

export function DispensingConfirmationModal({
  items,
  patientName,
  patientAllergies,
  onConfirm,
  onCancel,
}: DispensingConfirmationModalProps) {
  const [acknowledged, setAcknowledged] = useState(false)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/50"
      role="dialog"
      aria-modal="true"
      aria-label="Confirm Dispensing"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-lg mx-4 max-h-[80vh] overflow-y-auto">
        <h3 className="text-lg font-bold text-neutral-900 mb-4">Confirm Dispensing</h3>

        {/* Allergies — always first, always visible */}
        {patientAllergies && patientAllergies.length > 0 && (
          <div className="mb-4">
            <AllergyBanner allergies={patientAllergies} patientName={patientName} />
          </div>
        )}

        {/* Medication summary */}
        <div className="mb-4">
          <p className="text-xs font-medium text-neutral-500 mb-2 uppercase tracking-wide">
            Dispensing {items.length} medication{items.length !== 1 ? 's' : ''} to:
          </p>
          <p className="text-sm font-semibold text-neutral-900 mb-3">{patientName ?? 'Unknown Patient'}</p>

          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.prescription.id} className="flex items-center justify-between rounded-md border border-neutral-200 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-neutral-900">{item.prescription.medT}</p>
                  <p className="text-xs text-neutral-500">
                    {item.prescription.dos.qty} {item.prescription.dos.unit} | {item.prescription.dur} days
                  </p>
                </div>
                {item.brandName && (
                  <span className="text-xs text-neutral-500">{item.brandName}</span>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* Acknowledgement checkbox */}
        <label className="flex items-start gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 cursor-pointer mb-4">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-primary-600"
            data-testid="dispensing-ack-checkbox"
          />
          <span className="text-sm text-neutral-700">
            I confirm that I have verified the patient identity, checked for allergies and interactions, and the medications are correct.
          </span>
        </label>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            variant="primary"
            type="button"
            fullWidth
            disabled={!acknowledged}
            onClick={onConfirm}
            data-testid="modal-confirm-dispensing-btn"
          >
            Dispense Medication
          </Button>
          <Button variant="secondary" type="button" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Integrate into FulfillmentChecklist**

In `FulfillmentChecklist.tsx`, add the modal trigger. Replace the direct `onConfirm?.()` call with a state toggle:

Add to imports:
```tsx
import { DispensingConfirmationModal } from './DispensingConfirmationModal'
import { usePatientStore } from '@/stores/patient-store'
```

Add state and patient store:
```tsx
const [showConfirmModal, setShowConfirmModal] = useState(false)
const activePatient = usePatientStore((s) => s.activePatient)
```

Add the allergy banner before the medication list:
```tsx
import { AllergyBanner } from './AllergyBanner'

// Before the medication items list:
{activePatient?.allergies && activePatient.allergies.length > 0 && (
  <AllergyBanner allergies={activePatient.allergies} patientName={activePatient.nameGiven} />
)}
```

Replace the Confirm Dispensing button onClick:
```tsx
onClick={() => setShowConfirmModal(true)}
```

Add modal at the end of the component JSX (before the closing `</div>`):
```tsx
{showConfirmModal && (
  <DispensingConfirmationModal
    items={items.filter((i) => i.selected)}
    patientName={activePatient?.nameGiven ?? patientName}
    patientAllergies={activePatient?.allergies}
    onConfirm={() => {
      setShowConfirmModal(false)
      const selected = items.filter((i) => i.selected)
      onConfirm?.(selected)
    }}
    onCancel={() => setShowConfirmModal(false)}
  />
)}
```

- [ ] **Step 3: Commit**

```bash
git add apps/pharmacy-lite/src/components/pharmacy/DispensingConfirmationModal.tsx apps/pharmacy-lite/src/components/pharmacy/FulfillmentChecklist.tsx
git commit -m "feat(pharmacy-lite): dispensing confirmation modal with allergy display and acknowledgement gate"
```

---

## Phase 4: Empty States & Onboarding (P3)

### Task 12: Reusable Empty State Component

**Files:**
- Create: `apps/pharmacy-lite/src/components/pharmacy/EmptyState.tsx`

- [ ] **Step 1: Create EmptyState**

```tsx
// apps/pharmacy-lite/src/components/pharmacy/EmptyState.tsx
'use client'

import { Button } from '@/components/ui/Button'

interface EmptyStateProps {
  icon: 'queue' | 'history' | 'scan' | 'sync' | 'controlled' | 'dispensing'
  title: string
  description: string
  actionLabel?: string
  actionHref?: string
  onAction?: () => void
}

const iconPaths: Record<EmptyStateProps['icon'], string> = {
  queue: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  history: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 6v6l4 2',
  scan: 'M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2M7 12h10',
  sync: 'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M20.49 15a9 9 0 01-14.85 3.36L1 14',
  controlled: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM12 8v4M12 16h.01',
  dispensing: 'M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z',
}

export function EmptyState({ icon, title, description, actionLabel, actionHref, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center" data-testid="empty-state">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary-50">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary-600">
          <path d={iconPaths[icon]} />
        </svg>
      </div>
      <h3 className="text-sm font-semibold text-neutral-800 mb-1">{title}</h3>
      <p className="text-xs text-neutral-500 max-w-xs mb-4">{description}</p>
      {actionLabel && (actionHref || onAction) && (
        actionHref ? (
          <a href={actionHref}>
            <Button variant="primary" type="button">{actionLabel}</Button>
          </a>
        ) : (
          <Button variant="primary" type="button" onClick={onAction}>{actionLabel}</Button>
        )
      )}
    </div>
  )
}
```

- [ ] **Step 2: Replace empty states across the app**

Update `PrescriptionQueueView.tsx` empty messages:
```tsx
// Replace the <p> empty state with:
import { EmptyState } from './EmptyState'

// In the empty state render:
<EmptyState
  icon="queue"
  title={emptyMessages[activeTab]}
  description={activeTab === 'active' ? 'Scan a prescription QR code to start filling orders.' : 'Completed and failed items will appear here.'}
  actionLabel={activeTab === 'active' ? 'Scan Prescription' : undefined}
  actionHref={activeTab === 'active' ? '/scan' : undefined}
/>
```

Update `RecentDispensingList.tsx`:
```tsx
// Replace the <p> empty state:
import { EmptyState } from './EmptyState'

<EmptyState
  icon="dispensing"
  title="No dispensing activity today"
  description="Dispensed medications will appear here as you fill prescriptions throughout your shift."
  actionLabel="Start Scanning"
  actionHref="/scan"
/>
```

- [ ] **Step 3: Commit**

```bash
git add apps/pharmacy-lite/src/components/pharmacy/EmptyState.tsx apps/pharmacy-lite/src/components/pharmacy/PrescriptionQueueView.tsx apps/pharmacy-lite/src/components/pharmacy/RecentDispensingList.tsx
git commit -m "feat(pharmacy-lite): reusable EmptyState component with icons and CTAs"
```

---

## Phase 5: Visual Confidence & Shift Progress (P4)

### Task 13: Dispensing Summary Card Visual Hierarchy

**Files:**
- Modify: `apps/pharmacy-lite/src/components/pharmacy/DispensingSummaryCard.tsx`

- [ ] **Step 1: Redesign DispensingSummaryCard with visual differentiation**

The current design treats all 3 metrics identically. Failed sync should scream; dispensed today should feel accomplishing.

```tsx
// apps/pharmacy-lite/src/components/pharmacy/DispensingSummaryCard.tsx
'use client'

import { memo } from 'react'

interface DispensingSummaryCardProps {
  dispensedToday: number
  pendingSync: number
  failedSync: number
}

export const DispensingSummaryCard = memo(function DispensingSummaryCard({
  dispensedToday,
  pendingSync,
  failedSync,
}: DispensingSummaryCardProps) {
  return (
    <div data-testid="dispensing-summary-card" className="space-y-3">
      {/* Primary metric — dispensed today (largest, most prominent) */}
      <div className="rounded-xl border border-primary-200 bg-primary-50/40 p-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-primary-700 uppercase tracking-wide">Dispensed Today</p>
          <p className="text-sm text-neutral-600 mt-0.5">Prescriptions fulfilled this shift</p>
        </div>
        <div data-testid="dispensed-today-count" className="text-3xl font-bold text-primary-800 tabular-nums">
          {dispensedToday}
        </div>
      </div>

      {/* Secondary metrics row */}
      <div className="grid grid-cols-2 gap-3">
        {/* Pending sync — informational */}
        <div className={`rounded-lg border p-3 flex items-center justify-between ${
          pendingSync > 0 ? 'border-amber-200 bg-amber-50/40' : 'border-neutral-200 bg-white'
        }`}>
          <p className="text-xs font-medium text-neutral-600">Pending Sync</p>
          <span
            data-testid="pending-sync-count"
            className={`text-lg font-bold tabular-nums ${pendingSync > 0 ? 'text-amber-700' : 'text-neutral-400'}`}
          >
            {pendingSync}
          </span>
        </div>

        {/* Failed sync — critical, needs attention */}
        <div className={`rounded-lg border p-3 flex items-center justify-between ${
          failedSync > 0 ? 'border-red-300 bg-red-50' : 'border-neutral-200 bg-white'
        }`}>
          <p className="text-xs font-medium text-neutral-600">Failed</p>
          <span
            data-testid="failed-sync-count"
            className={`text-lg font-bold tabular-nums ${failedSync > 0 ? 'text-red-700' : 'text-neutral-400'}`}
          >
            {failedSync}
          </span>
        </div>
      </div>
    </div>
  )
})
```

- [ ] **Step 2: Commit**

```bash
git add apps/pharmacy-lite/src/components/pharmacy/DispensingSummaryCard.tsx
git commit -m "refactor(pharmacy-lite): DispensingSummaryCard with visual hierarchy — primary metric prominent, failures alarming"
```

---

### Task 14: Session Expiry Warning Banner

**Files:**
- Create: `apps/pharmacy-lite/src/hooks/useSessionExpiryWarning.ts`
- Create: `apps/pharmacy-lite/src/components/pharmacy/SessionExpiryBanner.tsx`
- Modify: `apps/pharmacy-lite/src/components/AppShellWrapper.tsx`

- [ ] **Step 1: Create session expiry hook**

```ts
// apps/pharmacy-lite/src/hooks/useSessionExpiryWarning.ts
import { useState, useEffect } from 'react'
import { useAuthSessionStore } from '@/stores/auth-session-store'

const MAX_SESSION_MS = 12 * 60 * 60 * 1000
const WARNING_THRESHOLD_MS = 15 * 60 * 1000 // Warn at 15 minutes remaining

export function useSessionExpiryWarning() {
  const session = useAuthSessionStore((s) => s.session)
  const [remainingMs, setRemainingMs] = useState<number | null>(null)

  const loginAtMs = session?.loginAt ? new Date(session.loginAt).getTime() : null

  useEffect(() => {
    if (!loginAtMs) return

    const update = () => {
      const elapsed = Date.now() - loginAtMs
      setRemainingMs(Math.max(0, MAX_SESSION_MS - elapsed))
    }
    update()
    const interval = setInterval(update, 30_000) // Check every 30s
    return () => clearInterval(interval)
  }, [loginAtMs])

  const showWarning = remainingMs !== null && remainingMs <= WARNING_THRESHOLD_MS && remainingMs > 0
  const isExpired = remainingMs !== null && remainingMs <= 0

  return { remainingMs, showWarning, isExpired }
}
```

- [ ] **Step 2: Create SessionExpiryBanner**

```tsx
// apps/pharmacy-lite/src/components/pharmacy/SessionExpiryBanner.tsx
'use client'

import { useSessionExpiryWarning } from '@/hooks/useSessionExpiryWarning'

export function SessionExpiryBanner() {
  const { remainingMs, showWarning } = useSessionExpiryWarning()

  if (!showWarning || remainingMs === null) return null

  const minutes = Math.ceil(remainingMs / 60_000)

  return (
    <div
      role="alert"
      className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800"
      data-testid="session-expiry-banner"
    >
      <span className="font-semibold">Session expiring in {minutes} minute{minutes !== 1 ? 's' : ''}.</span>
      {' '}Save your work and re-authenticate to continue.
    </div>
  )
}
```

- [ ] **Step 3: Add to AppShellWrapper**

In `AppShellWrapper.tsx`, add `<SessionExpiryBanner />` inside the `<main>` element, after `<SyncCapacityBanner />`:

```tsx
import { SessionExpiryBanner } from './pharmacy/SessionExpiryBanner'

// In JSX:
<main id="main-content" className={`mx-auto px-4 py-6 ${isWideRoute ? 'max-w-5xl' : 'max-w-2xl'}`}>
  <SyncCapacityBanner />
  <SessionExpiryBanner />
  {children}
</main>
```

- [ ] **Step 4: Commit**

```bash
git add apps/pharmacy-lite/src/hooks/useSessionExpiryWarning.ts apps/pharmacy-lite/src/components/pharmacy/SessionExpiryBanner.tsx apps/pharmacy-lite/src/components/AppShellWrapper.tsx
git commit -m "feat(pharmacy-lite): proactive session expiry warning banner"
```

---

## Phase 6: Keyboard Shortcuts (P4)

### Task 15: Keyboard Shortcuts System

**Files:**
- Create: `apps/pharmacy-lite/src/hooks/useKeyboardShortcuts.ts`
- Modify: `apps/pharmacy-lite/src/components/AppShellWrapper.tsx`

- [ ] **Step 1: Create keyboard shortcuts hook**

```ts
// apps/pharmacy-lite/src/hooks/useKeyboardShortcuts.ts
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Shortcut {
  key: string
  ctrl?: boolean
  alt?: boolean
  description: string
  action: () => void
}

export function useKeyboardShortcuts() {
  const router = useRouter()

  useEffect(() => {
    const shortcuts: Shortcut[] = [
      { key: '1', alt: true, description: 'Go to Dashboard', action: () => router.push('/') },
      { key: '2', alt: true, description: 'Scan Prescription', action: () => router.push('/scan') },
      { key: '3', alt: true, description: 'Prescription Queue', action: () => router.push('/queue') },
      { key: '4', alt: true, description: 'Dispensing History', action: () => router.push('/history') },
    ]

    function handleKeyDown(e: KeyboardEvent) {
      // Don't trigger in input fields
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return
      if (target.isContentEditable) return

      for (const shortcut of shortcuts) {
        const ctrlMatch = shortcut.ctrl ? (e.ctrlKey || e.metaKey) : !e.ctrlKey && !e.metaKey
        const altMatch = shortcut.alt ? e.altKey : !e.altKey
        if (e.key === shortcut.key && ctrlMatch && altMatch) {
          e.preventDefault()
          shortcut.action()
          return
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [router])
}
```

- [ ] **Step 2: Register shortcuts in AppShellWrapper**

In `AppShellWrapper.tsx`, add inside the component (after the hooks section):

```tsx
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'

// Inside AppShellWrapper component body, before the if (!isAuthenticated) guard:
useKeyboardShortcuts()
```

Note: The hook must be called unconditionally but its `useEffect` will only register listeners when the component is mounted (which is only when authenticated, since AppShellWrapper renders children directly when unauthenticated).

Actually, since the hook uses `useRouter`, place it after the authentication check to avoid calling hooks conditionally. Instead, extract the keyboard shortcuts into a child component:

```tsx
function KeyboardShortcutProvider({ children }: { children: React.ReactNode }) {
  useKeyboardShortcuts()
  return <>{children}</>
}
```

Wrap the authenticated content with it.

- [ ] **Step 3: Commit**

```bash
git add apps/pharmacy-lite/src/hooks/useKeyboardShortcuts.ts apps/pharmacy-lite/src/components/AppShellWrapper.tsx
git commit -m "feat(pharmacy-lite): keyboard shortcuts (Alt+1-4 for primary navigation)"
```

---

## Phase 7: Login Branding & Final Polish

### Task 16: Login Page Branding

**Files:**
- Modify: `apps/pharmacy-lite/src/app/[locale]/login/page.tsx`

- [ ] **Step 1: Add branding and fix accessibility**

Update the login page wrapper:

```tsx
// Replace the outer div and card header (lines 164-170):
<div className="flex min-h-[80vh] flex-col items-center justify-center px-4">
  {/* Brand mark */}
  <div className="mb-6 text-center">
    <h1 className="text-2xl font-bold text-neutral-900">Pharmacy Lite</h1>
    <p className="text-sm text-neutral-500 mt-1">Powered by Ultranos</p>
  </div>

  <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
    <h2 className="mb-6 text-center text-lg font-semibold text-neutral-800">
      Sign In
    </h2>
    {/* ... rest of form ... */}
  </div>

  <p className="mt-6 text-xs text-neutral-400">Secure healthcare platform</p>
</div>
```

Also fix all `focus:` to `focus-visible:` on the login page inputs (lines 192, 208, 240).

- [ ] **Step 2: Commit**

```bash
git add apps/pharmacy-lite/src/app/[locale]/login/page.tsx
git commit -m "fix(pharmacy-lite): login page branding, focus-visible on inputs"
```

---

### Task 17: Replace RecentDispensingList Patient UUIDs with Names

**Files:**
- Modify: `apps/pharmacy-lite/src/components/pharmacy/PharmacyDashboard.tsx`
- Modify: `apps/pharmacy-lite/src/components/pharmacy/RecentDispensingList.tsx`

- [ ] **Step 1: Update RecentDispenseItem to include patient name**

In `RecentDispensingList.tsx`, the `patientRef` field currently shows FHIR reference IDs. Update the interface and rendering:

```tsx
export interface RecentDispenseItem {
  id: string
  patientRef: string
  patientName?: string  // Add this field
  medicationName: string
  whenHandedOver: string
  syncStatus: 'synced' | 'pending' | 'failed'
}
```

In the display, update the patient line:
```tsx
<div className="text-xs text-neutral-500 truncate">
  {item.patientName ?? item.patientRef} &middot; {formatTime(item.whenHandedOver)}
</div>
```

- [ ] **Step 2: Populate patient name from Dexie in PharmacyDashboard**

In `queryDashboardStats()`, after building `recentDispenses`, look up patient names:

```tsx
// After building recentDispenses array, enrich with names:
const patientIds = recentDispenses.map((d) => d.patientRef).filter(Boolean)
const patients = await db.patients.where('id').anyOf(patientIds).toArray()
const patientNameMap = new Map(patients.map((p) => [p.id, p.nameGiven]))

recentDispenses = recentDispenses.map((d) => ({
  ...d,
  patientName: patientNameMap.get(d.patientRef),
}))
```

- [ ] **Step 3: Commit**

```bash
git add apps/pharmacy-lite/src/components/pharmacy/RecentDispensingList.tsx apps/pharmacy-lite/src/components/pharmacy/PharmacyDashboard.tsx
git commit -m "fix(pharmacy-lite): show patient names instead of FHIR UUIDs in recent dispensing list"
```

---

## Summary of Changes

| Phase | Tasks | Focus |
|-------|-------|-------|
| 1 | Tasks 1-3 | Foundation: Button a11y, motion guards, responsive width |
| 2 | Tasks 4-8 | Patient intake hub (P0): DB schema, search, register, dashboard |
| 3 | Tasks 9-11 | Dispensing safety (P1): Allergy banner, interaction check, confirmation modal |
| 4 | Task 12 | Empty states & onboarding (P3) |
| 5 | Tasks 13-14 | Visual confidence (P4): Summary card hierarchy, session warning |
| 6 | Task 15 | Keyboard shortcuts (P4) |
| 7 | Tasks 16-17 | Polish: Login branding, patient name display |

**Total: 17 tasks, ~50 steps, 7 phases.**

After all tasks complete, re-run `/impeccable critique` to verify improvement. Target: 28+/40 on heuristics (up from 20/40).
