# OPD-Lite Two-Column Workspace + Full UX/UI Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure OPD-lite's detail screens into a reusable two-column workspace (main flow + sticky context rail) and apply a consistent design-system pass across every page, modal, and banner, with zero functional change.

**Architecture:** Add two primitives to `@ultranos/ui-kit` — a `DetailLayout` (grid + sticky rail, RTL-safe) and an `Alert` (replaces ~15 inline alert blocks). Rebuild ui-kit, then adopt them screen-by-screen in `apps/opd-lite`. Patient Chart and Encounter become two-column; all other surfaces get token/component cleanups. Nothing changes app behavior, data, or FHIR flow.

**Tech Stack:** Next.js 15, TypeScript, Tailwind v3 + oklch semantic tokens, ShadCN (ui-kit), Vitest + Testing Library, pnpm workspaces.

## Global Constraints

Copied verbatim from CLAUDE.md / design.md — every task's requirements implicitly include these:

- **Source-level only:** shared UI changes go in `packages/ui-kit/src/`, never app-level overrides. After any ui-kit edit run `pnpm --filter @ultranos/ui-kit build` before apps see it. App `src/components/ui/` files are thin re-export proxies only.
- **No hardcoded color:** use semantic Tailwind classes (`bg-primary`, `text-destructive`, `bg-card`, `ring-border/50`). Never `bg-[#hex]`, `red-500`, `text-white` on a themed badge.
- **Cards:** glassmorphic app-local `Card` (`bg-card-bg/70 backdrop-blur-md ring-[0.65px] ring-gray-400/40 rounded-xl`). Never hand-roll a card.
- **Buttons:** every button is the ShadCN `Button`. No raw `<button>` (except inside `Button.tsx`). Pill radius baked in.
- **Radius:** `rounded-xl` for containers/inputs/panels; `rounded-pill` for text buttons; `rounded-full` for icon buttons/avatars. Never `rounded-md`/`rounded-lg` on cards or inputs.
- **Layout:** shell `<main>` is `flex flex-1 flex-col gap-4 p-4`. Page root is `flex flex-col gap-4` (or `mx-auto max-w-* flex flex-col gap-4`). No `mt-*`/`mb-*`/extra `p-*` on page root or its direct children — `gap-4` handles spacing. `gap-4` only at page level. `BreadcrumbHeader` (`h-14`) is the only header per page.
- **Allergies (Rule #4):** allergy banner renders FIRST, in red, never collapsed, never behind a tab, never inside a column. In the two-column layout it stays full-width ABOVE the grid.
- **Tier-1 (Rule #5):** append-only; prescription generation stays blocked on unresolved conflict. This plan touches none of that logic.
- **PHI (Rule #1):** no PHI in logs/errors/comments. No new logging added.
- **Motion:** exact transition properties only, custom easing vars, `scale(1.03)`/`scale(0.97)`, gate hover behind `@media (hover:hover) and (pointer:fine)`, respect `prefers-reduced-motion`, never animate layout props, UI < 300ms.
- **Icons:** `@ultranos/ui-kit/icons` subpath; `DirectionalIcon` for nav icons in RTL, never for medical icons.
- **RTL:** logical props (`ps`/`pe`/`ms`/`me`/`inset-inline`/`top`), test both directions.
- **Empty states:** `EmptyState` from ui-kit, never ad-hoc.
- **Git:** no autonomous commits — the human runs git. Steps below include commit commands the human triggers.
- **Verify before claiming done:** every task runs its named test/typecheck and observes the result before checking off.

**Verification commands (used throughout):**
- Unit/snapshot: `pnpm --filter opd-lite test -- <testfile>`
- Typecheck: `pnpm --filter opd-lite exec tsc --noEmit`
- ui-kit build: `pnpm --filter @ultranos/ui-kit build`
- Lint: `pnpm --filter opd-lite lint`

---

## File Structure (what gets created / touched)

**ui-kit (new):**
- `packages/ui-kit/src/components/ui/detail-layout.tsx` — two-column + sticky rail primitive
- `packages/ui-kit/src/components/ui/alert.tsx` — semantic alert (info/warning/destructive/success)
- `packages/ui-kit/src/components/ui/detail-layout.test.tsx`, `alert.test.tsx`
- `packages/ui-kit/src/index.ts` + package exports — add the two exports

**ui-kit (modify):** `packages/ui-kit/src/tokens.css` (add `--overlay` backdrop token only if missing)

**opd-lite flagship (two-column):**
- `apps/opd-lite/src/components/patient/PatientChartPage.tsx`
- `apps/opd-lite/src/components/patient/PatientContextRail.tsx` (new)
- `apps/opd-lite/src/components/encounter-dashboard.tsx`
- `apps/opd-lite/src/components/encounter/EncounterContextRail.tsx` (new)

**opd-lite polish (per inventory — nothing omitted):**
- Pages: dashboard `ClinicalDashboard.tsx`, `patients/PatientDirectory.tsx`, `notifications/NotificationCenter.tsx`, `expiring-consents/page.tsx`, `duplicate-review/*`, `conflicts/*`, `register-patient/*`, `kyc/page.tsx`, `settings/page.tsx` + cards, `settings/data-budget/*`, `appointments/*`
- Modals (16): see Phase 6 table
- Banners (8): see Phase 7 table
- Shell: `sidebar/nav-main.tsx`, `BreadcrumbHeader.tsx`
- Auth: `login`, `forgot-password`, `reset-password`

---

# Phase 0 — ui-kit foundations

### Task 1: `DetailLayout` primitive

**Files:**
- Create: `packages/ui-kit/src/components/ui/detail-layout.tsx`
- Test: `packages/ui-kit/src/components/ui/detail-layout.test.tsx`
- Modify: `packages/ui-kit/src/index.ts`, `packages/ui-kit/package.json` (exports map)

**Interfaces:**
- Produces: `DetailLayout({ banner?, rail, children, className? }: DetailLayoutProps)` where `children` is the main column, `rail` is the sticky context column, `banner` renders full-width above the grid. Types: `DetailLayoutProps { banner?: React.ReactNode; rail: React.ReactNode; children: React.ReactNode; className?: string }`.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/ui-kit/src/components/ui/detail-layout.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { DetailLayout } from './detail-layout'

describe('DetailLayout', () => {
  it('renders banner above the grid, main, and rail', () => {
    render(
      <DetailLayout
        banner={<div data-testid="banner">allergy</div>}
        rail={<div data-testid="rail">context</div>}
      >
        <div data-testid="main">flow</div>
      </DetailLayout>,
    )
    expect(screen.getByTestId('banner')).toBeInTheDocument()
    expect(screen.getByTestId('main')).toBeInTheDocument()
    expect(screen.getByTestId('rail')).toBeInTheDocument()
  })

  it('places the rail in a region so screen readers can find context', () => {
    render(
      <DetailLayout rail={<div>context</div>} railLabel="Patient context">
        <div>flow</div>
      </DetailLayout>,
    )
    expect(screen.getByRole('complementary', { name: 'Patient context' })).toBeInTheDocument()
  })

  it('omits the banner slot entirely when not provided', () => {
    const { container } = render(
      <DetailLayout rail={<div>r</div>}><div>m</div></DetailLayout>,
    )
    expect(container.querySelector('[data-slot="detail-banner"]')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @ultranos/ui-kit test -- detail-layout`
Expected: FAIL — `DetailLayout` not exported.

- [ ] **Step 3: Implement**

```tsx
// packages/ui-kit/src/components/ui/detail-layout.tsx
import * as React from 'react'
import { cn } from '../../lib/utils'

export interface DetailLayoutProps {
  /** Full-width content above the grid (e.g. allergy banner). Never inside a column. */
  banner?: React.ReactNode
  /** Sticky context column. On lg+ it sits on the inline-end and scroll-follows; below lg it stacks on top. */
  rail: React.ReactNode
  /** Accessible name for the rail landmark. */
  railLabel?: string
  /** Main flow column. */
  children: React.ReactNode
  className?: string
}

/**
 * Two-column detail workspace: main flow + sticky context rail.
 * lg+: grid [1fr | 20rem], rail sticky under the h-14 header.
 * < lg: single column, rail stacked above main (order utilities).
 * RTL-safe: grid columns follow `direction`, so the rail lands inline-end automatically.
 */
export function DetailLayout({ banner, rail, railLabel, children, className }: DetailLayoutProps) {
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {banner ? <div data-slot="detail-banner">{banner}</div> : null}
      <div className="gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="order-2 flex min-w-0 flex-col gap-4 lg:order-1">{children}</div>
        <aside
          aria-label={railLabel}
          className="order-1 mb-4 flex flex-col gap-4 lg:order-2 lg:mb-0 lg:sticky lg:top-[calc(theme(spacing.14)+theme(spacing.4))] lg:max-h-[calc(100svh-4.5rem)] lg:overflow-y-auto lg:pb-2"
        >
          {rail}
        </aside>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Export** — add to `packages/ui-kit/src/index.ts`:

```ts
export { DetailLayout } from './components/ui/detail-layout'
export type { DetailLayoutProps } from './components/ui/detail-layout'
```

And confirm the subpath resolves like siblings: apps import via `@ultranos/ui-kit/components/ui/detail-layout`. If `package.json` `exports` uses a wildcard `"./components/ui/*"` (check the file), no change is needed; if each is listed explicitly, add:

```json
"./components/ui/detail-layout": "./dist/components/ui/detail-layout.js"
```

- [ ] **Step 5: Run test + build**

Run: `pnpm --filter @ultranos/ui-kit test -- detail-layout`  → Expected: PASS (3 tests).
Run: `pnpm --filter @ultranos/ui-kit build` → Expected: dist emitted, no TS errors.

- [ ] **Step 6: Commit**

```bash
git add packages/ui-kit/src/components/ui/detail-layout.tsx packages/ui-kit/src/components/ui/detail-layout.test.tsx packages/ui-kit/src/index.ts packages/ui-kit/package.json packages/ui-kit/dist
git commit -m "feat(ui-kit): add DetailLayout two-column + sticky rail primitive"
```

---

### Task 2: `Alert` primitive (replaces ~15 inline alert blocks)

**Files:**
- Create: `packages/ui-kit/src/components/ui/alert.tsx`
- Test: `packages/ui-kit/src/components/ui/alert.test.tsx`
- Modify: `packages/ui-kit/src/index.ts`

**Interfaces:**
- Produces: `Alert({ variant, title?, icon?, children, role?, className? })` with `variant: 'info' | 'warning' | 'destructive' | 'success'`. Default `role="status"`; callers pass `role="alert"` for safety-critical. Renders `rounded-xl border px-4 py-3 text-sm` with per-variant tokens.

- [ ] **Step 1: Failing test**

```tsx
// packages/ui-kit/src/components/ui/alert.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Alert } from './alert'

describe('Alert', () => {
  it('renders children and a title', () => {
    render(<Alert variant="warning" title="Heads up">body</Alert>)
    expect(screen.getByText('Heads up')).toBeInTheDocument()
    expect(screen.getByText('body')).toBeInTheDocument()
  })
  it('uses destructive tokens for destructive variant', () => {
    const { container } = render(<Alert variant="destructive">x</Alert>)
    expect(container.firstChild).toHaveClass('border-destructive/30')
  })
  it('supports role=alert for safety-critical messages', () => {
    render(<Alert variant="destructive" role="alert">blocked</Alert>)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run, verify fail** — `pnpm --filter @ultranos/ui-kit test -- alert` → FAIL.

- [ ] **Step 3: Implement**

```tsx
// packages/ui-kit/src/components/ui/alert.tsx
import * as React from 'react'
import { cn } from '../../lib/utils'

type AlertVariant = 'info' | 'warning' | 'destructive' | 'success'

const VARIANT: Record<AlertVariant, string> = {
  info: 'border-primary/20 bg-primary/10 text-primary',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  destructive: 'border-destructive/30 bg-destructive/10 text-destructive',
  success: 'border-success/20 bg-success/10 text-success',
}

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant
  title?: React.ReactNode
  icon?: React.ReactNode
}

export function Alert({
  variant = 'info',
  title,
  icon,
  children,
  className,
  role = 'status',
  ...rest
}: AlertProps) {
  return (
    <div
      role={role}
      className={cn('rounded-xl border px-4 py-3 text-sm', VARIANT[variant], className)}
      {...rest}
    >
      <div className="flex items-start gap-2">
        {icon ? <span className="mt-0.5 shrink-0" aria-hidden>{icon}</span> : null}
        <div className="min-w-0 flex-1">
          {title ? <p className="font-semibold">{title}</p> : null}
          {children ? <div className={cn(title && 'mt-0.5')}>{children}</div> : null}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Export** in `index.ts`: `export { Alert } from './components/ui/alert'` and `export type { AlertProps } ...`.

- [ ] **Step 5: Test + build** — `pnpm --filter @ultranos/ui-kit test -- alert` → PASS; `pnpm --filter @ultranos/ui-kit build` → OK.

- [ ] **Step 6: Commit**

```bash
git add packages/ui-kit/src/components/ui/alert.tsx packages/ui-kit/src/components/ui/alert.test.tsx packages/ui-kit/src/index.ts packages/ui-kit/dist
git commit -m "feat(ui-kit): add Alert primitive (info/warning/destructive/success)"
```

---

# Phase 1 — Patient Chart → two-column

### Task 3: Extract `PatientContextRail`

**Files:**
- Create: `apps/opd-lite/src/components/patient/PatientContextRail.tsx`
- Test: `apps/opd-lite/src/__tests__/patient-context-rail.test.tsx`

**Interfaces:**
- Consumes: existing `PatientHeaderCard`, `PatientDetailsAccordion`, `PatientAuditTrail`, `ActiveMedicationsList` (unchanged component APIs).
- Produces: `PatientContextRail({ patient, patientId, userRole, onEditClick, onPatientUpdated })` — renders identity + active meds + details + audit as a vertical stack of the existing `Card`s.

- [ ] **Step 1: Failing test** — assert the rail renders the identity heading and an "Active medications" region, and that it contains no `<main>`/banner (banner stays in the page).

```tsx
// apps/opd-lite/src/__tests__/patient-context-rail.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { PatientContextRail } from '../components/patient/PatientContextRail'
import { samplePatient } from './fixtures/patient' // reuse existing fixture used by patient-chart.test.tsx

describe('PatientContextRail', () => {
  it('renders identity and active medications, not the allergy banner', () => {
    render(
      <PatientContextRail
        patient={samplePatient}
        patientId="p1"
        userRole="doctor"
        onEditClick={vi.fn()}
        onPatientUpdated={vi.fn()}
      />,
    )
    expect(screen.getByText(samplePatient.name?.[0]?.family ?? '')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull() // banner is NOT in the rail
  })
})
```
(If `fixtures/patient` does not exist, inline the same patient object `patient-chart.test.tsx` already constructs — read that test first and reuse its fixture verbatim. Do not invent fields.)

- [ ] **Step 2: Run, verify fail** — `pnpm --filter opd-lite test -- patient-context-rail` → FAIL (module missing).

- [ ] **Step 3: Implement** — move the four reference cards out of `PatientChartPage` into the rail, unchanged:

```tsx
// apps/opd-lite/src/components/patient/PatientContextRail.tsx
'use client'
import { PatientHeaderCard } from './PatientHeaderCard'
import { PatientDetailsAccordion } from './PatientDetailsAccordion'
import { PatientAuditTrail } from './PatientAuditTrail'
import { ActiveMedicationsList } from './ActiveMedicationsList'
import type { Patient } from '@ultranos/shared-types' // match the type PatientChartPage already imports

export interface PatientContextRailProps {
  patient: Patient
  patientId: string
  userRole: string
  onEditClick: () => void
  onPatientUpdated: (p: Patient) => void
}

export function PatientContextRail({
  patient, patientId, userRole, onEditClick, onPatientUpdated,
}: PatientContextRailProps) {
  return (
    <>
      <PatientHeaderCard
        patient={patient}
        patientId={patientId}
        onEditClick={onEditClick}
        onPatientUpdated={onPatientUpdated}
      />
      <ActiveMedicationsList patientId={patientId} />
      <PatientDetailsAccordion patient={patient} />
      <PatientAuditTrail patientId={patientId} userRole={userRole} />
    </>
  )
}
```
(Before writing, open `PatientChartPage.tsx` and copy the exact prop names/types each of these four components takes — the snippet above mirrors lines 174-188 but VERIFY the `userRole` source and the `Patient` import path.)

- [ ] **Step 4: Run test** — `pnpm --filter opd-lite test -- patient-context-rail` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/opd-lite/src/components/patient/PatientContextRail.tsx apps/opd-lite/src/__tests__/patient-context-rail.test.tsx
git commit -m "feat(opd-lite): extract PatientContextRail from patient chart"
```

---

### Task 4: Wire Patient Chart into `DetailLayout`

**Files:**
- Modify: `apps/opd-lite/src/components/patient/PatientChartPage.tsx:168-222`
- Test: `apps/opd-lite/src/__tests__/patient-chart.test.tsx`, `apps/opd-lite/src/__tests__/patient-chart-snapshots.test.tsx`

**Interfaces:**
- Consumes: `DetailLayout` (Task 1), `PatientContextRail` (Task 3).

- [ ] **Step 1: Update the snapshot expectations** — the chart still must render allergy banner first and keep history/labs. Add an assertion to `patient-chart.test.tsx` that the allergy banner is OUTSIDE the rail landmark and appears before the main region:

```tsx
it('keeps the allergy banner first and full-width, above the two columns', () => {
  render(<PatientChartPage patientId="p1" />) // match existing render signature
  const alerts = screen.getAllByRole('alert')
  const banner = alerts[0]
  const rail = screen.getByRole('complementary')
  expect(rail).not.toContainElement(banner) // Rule #4: banner not inside a column
})
```

- [ ] **Step 2: Run, expect fail** — `pnpm --filter opd-lite test -- patient-chart` → FAIL (rail landmark not present yet).

- [ ] **Step 3: Replace the return block** (`PatientChartPage.tsx:168-222`):

```tsx
return (
  <DetailLayout
    railLabel={tPatient('contextRailLabel')}
    banner={<PatientBannerStack patient={patient} patientId={patientId} />}
    rail={
      <PatientContextRail
        patient={patient}
        patientId={patientId}
        userRole={userRole}
        onEditClick={() => setEditModalOpen(true)}
        onPatientUpdated={handlePatientUpdated}
      />
    }
  >
    <section aria-label={tPatient('encounterHistory')}>
      <h2 className="mb-3 text-lg font-bold text-foreground">{tPatient('encounterHistory')}</h2>
      <EncounterHistoryList patientId={patientId} />
    </section>

    <section
      className="rounded-xl bg-card p-5 shadow-sm ring-[0.65px] ring-border/50"
      aria-label={tPatient('labResultsSection')}
    >
      {selectedLabReport ? (
        <LabResultDetail report={selectedLabReport} onBack={() => setSelectedLabReport(null)} />
      ) : (
        <LabResultsList patientId={patientId} onSelectReport={setSelectedLabReport} />
      )}
    </section>

    <PatientEditModal
      open={editModalOpen}
      patient={patient}
      patientId={patientId}
      onClose={() => setEditModalOpen(false)}
      onSaved={handlePatientUpdated}
    />
  </DetailLayout>
)
```
Add imports for `DetailLayout` (`@ultranos/ui-kit/components/ui/detail-layout`) and `PatientContextRail`. Add the i18n key `contextRailLabel` to the patient namespace messages (all locales — verify the messages dir; do not leave English-only).
Note the `mb-3` on the `<h2>` is inside a section (not a page-root direct child) so it is allowed.

- [ ] **Step 4: Run tests + typecheck + refresh snapshots**

Run: `pnpm --filter opd-lite test -- patient-chart` → update snapshots intentionally (`-u`) ONLY after eyeballing the diff is layout-only. Expected: PASS.
Run: `pnpm --filter opd-lite exec tsc --noEmit` → no errors.

- [ ] **Step 5: Visual check (required, not optional)** — run the app (`pnpm --filter opd-lite dev`), open a patient chart at desktop width: confirm main (history/labs) left, sticky rail (identity/meds/details/audit) right that scroll-follows, allergy banner full-width on top. Resize below `lg`: single column, rail on top, banner still first. Toggle RTL: rail moves to the left, sticky offset holds.

- [ ] **Step 6: Commit**

```bash
git add apps/opd-lite/src/components/patient/PatientChartPage.tsx apps/opd-lite/src/__tests__ apps/opd-lite/messages
git commit -m "feat(opd-lite): patient chart two-column workspace via DetailLayout"
```

---

# Phase 2 — Encounter → two-column with pinned safety rail

### Task 5: Build `EncounterContextRail` (pins allergies, interaction status, identity, active meds)

**Files:**
- Create: `apps/opd-lite/src/components/encounter/EncounterContextRail.tsx`
- Test: `apps/opd-lite/src/__tests__/encounter-context-rail.test.tsx`

**Interfaces:**
- Consumes: the interaction-check state already computed in `encounter-dashboard.tsx` (read the file: find the variable holding `CLEAR|WARNING|BLOCKED|UNAVAILABLE` and the allergy list + patient identity + active meds). Pass them in as props; the rail is presentational.
- Produces: `EncounterContextRail({ patient, allergies, interactionStatus, activeMeds })`. All four confirmed pins (Q3: allergies, drug-interaction status, patient identity, active medications).

- [ ] **Step 1: Failing test** — the interaction chip reflects status and uses the right token; identity and allergy chips present.

```tsx
// apps/opd-lite/src/__tests__/encounter-context-rail.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { EncounterContextRail } from '../components/encounter/EncounterContextRail'

const patient = { display: 'Test Patient', ageSex: '34 / F', idSlice: '…4821' }

describe('EncounterContextRail', () => {
  it('shows a blocked interaction chip in destructive tone', () => {
    render(<EncounterContextRail patient={patient} allergies={['Penicillin']} interactionStatus="BLOCKED" activeMeds={[]} />)
    const chip = screen.getByTestId ? screen.getByTestId('interaction-chip') : screen.getByText(/blocked/i)
    expect(chip.className).toMatch(/destructive/)
  })
  it('lists allergy chips', () => {
    render(<EncounterContextRail patient={patient} allergies={['Penicillin']} interactionStatus="CLEAR" activeMeds={[]} />)
    expect(screen.getByText('Penicillin')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run, verify fail** — `pnpm --filter opd-lite test -- encounter-context-rail` → FAIL.

- [ ] **Step 3: Implement** using app-local `Card` + `Alert` semantics + status pills:

```tsx
// apps/opd-lite/src/components/encounter/EncounterContextRail.tsx
'use client'
import { Card } from '@/components/Card'

type InteractionStatus = 'CLEAR' | 'WARNING' | 'BLOCKED' | 'UNAVAILABLE'
const CHIP: Record<InteractionStatus, string> = {
  CLEAR: 'bg-success/20 text-success',
  WARNING: 'bg-warning/20 text-foreground',
  BLOCKED: 'bg-destructive/20 text-destructive',
  UNAVAILABLE: 'bg-muted text-muted-foreground',
}

export interface EncounterContextRailProps {
  patient: { display: string; ageSex: string; idSlice: string }
  allergies: string[]
  interactionStatus: InteractionStatus
  activeMeds: string[]
}

export function EncounterContextRail({ patient, allergies, interactionStatus, activeMeds }: EncounterContextRailProps) {
  return (
    <>
      <Card as="section" aria-label="Patient identity">
        <p className="text-base font-bold text-foreground" dir="auto">{patient.display}</p>
        <p className="mt-1 text-sm text-muted-foreground tabular-nums">{patient.ageSex} · {patient.idSlice}</p>
      </Card>

      <Card as="section" aria-label="Allergies">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Allergies</p>
        {allergies.length === 0 ? (
          <p className="text-sm font-semibold text-muted-foreground">No known allergies</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {allergies.map((a) => (
              <li key={a} className="rounded-full bg-destructive/20 px-2.5 py-0.5 text-xs font-bold text-destructive">{a}</li>
            ))}
          </ul>
        )}
      </Card>

      <Card as="section" aria-label="Interaction check">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Interaction check</p>
        <span data-testid="interaction-chip" className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${CHIP[interactionStatus]}`}>
          {interactionStatus}
        </span>
      </Card>

      <Card as="section" aria-label="Active medications">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Active medications</p>
        {activeMeds.length === 0 ? (
          <p className="text-sm text-muted-foreground">None recorded</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm text-foreground">{activeMeds.map((m) => <li key={m}>{m}</li>)}</ul>
        )}
      </Card>
    </>
  )
}
```
(Copy is placeholder-English here; wire real i18n keys in Step 4. Verify the `InteractionStatus` union matches the exact literals used in `encounter-dashboard.tsx` — adjust if the codebase uses different casing.)

- [ ] **Step 4: i18n** — replace the literal strings ("Allergies", "Interaction check", "Active medications", "No known allergies", "None recorded") with keys in the encounter namespace across all locale files. Fix the test's `getByText` to the resolved strings.

- [ ] **Step 5: Run test** → PASS. Commit:

```bash
git add apps/opd-lite/src/components/encounter/EncounterContextRail.tsx apps/opd-lite/src/__tests__/encounter-context-rail.test.tsx apps/opd-lite/messages
git commit -m "feat(opd-lite): encounter context rail (allergies, interaction, identity, meds)"
```

---

### Task 6: Wire Encounter into `DetailLayout` + swap inline alerts for `Alert`

**Files:**
- Modify: `apps/opd-lite/src/components/encounter-dashboard.tsx` (root return ~line 582; the 4 inline alert blocks the inventory found at the medication-history warning, interaction status, prescription-blocked, and prescription-error spots)
- Test: `apps/opd-lite/src/__tests__/clinical-dashboard.test.tsx` (or the encounter test if separate), `soap-note-entry.test.tsx`, `vitals-form.test.tsx`, `PrescriptionEntry.test.tsx`

**Interfaces:**
- Consumes: `DetailLayout`, `EncounterContextRail`, `Alert`.

- [ ] **Step 1: Failing test** — assert the allergy banner is above the grid and the interaction status appears in the complementary landmark:

```tsx
it('renders encounter in two columns with a pinned context rail', () => {
  // render EncounterDashboard with an active encounter fixture (reuse existing test setup)
  expect(screen.getByRole('complementary')).toBeInTheDocument()
  const rail = screen.getByRole('complementary')
  expect(rail).toHaveTextContent(/interaction check/i)
})
```

- [ ] **Step 2: Run, verify fail** → FAIL.

- [ ] **Step 3: Restructure the return** — wrap the existing form cards (Patient Info, Encounter Status, Allergy Entry, Vitals, SOAP, Prescription) as `children`; move the allergy banner to `banner`; pass the rail. Keep the exact same card order and every existing handler. The `CommandPalette` overlay and `InteractionWarningModal` remain rendered where they are (overlays are position-independent).

```tsx
return (
  <>
    <DetailLayout
      railLabel={tEncounter('contextRailLabel')}
      banner={<AllergyBanner patientId={patientId} /* existing props */ />}
      rail={
        <EncounterContextRail
          patient={railPatient}          // derive from existing patient display helpers
          allergies={railAllergies}       // existing allergy list
          interactionStatus={interactionStatus}  // existing state var
          activeMeds={railActiveMeds}      // existing active meds
        />
      }
    >
      <ConflictBanner patientId={patientId} />
      {/* Patient Info card … (unchanged) */}
      {/* Encounter Status card … (unchanged) */}
      {/* Allergy Entry card … (unchanged) */}
      {/* Vitals card … (unchanged) */}
      {/* SOAP card … (unchanged) */}
      {/* Prescription card … (unchanged, but alerts swapped below) */}
    </DetailLayout>
    <CommandPalette /* existing props */ />
    <InteractionWarningModal /* existing props */ />
  </>
)
```
Note: the allergy banner already renders full-width and first via `banner`; do NOT also render it inside `children`. `ConflictBanner` may stay at the top of the main column (it links to /conflicts and is not Rule-#4 allergy content) — or promote it into `banner` beneath the allergy banner if you prefer both full-width. Keep `ConflictBanner` full-width by placing it as the first child if it must span; a single-column child already spans the main column width.

- [ ] **Step 4: Swap the 4 inline alerts** — replace each hand-rolled `rounded-lg border border-warning/30 bg-warning/10 px-4 py-3` (and the destructive/20, destructive/30 variants) with `<Alert variant="warning" role="alert">…</Alert>` etc. The prescription-blocked one stays `role="alert"` variant `destructive`. This changes markup only; interaction-check logic and the blocking behavior are untouched (Rule #3, Rule #5).

- [ ] **Step 5: Run all encounter tests + typecheck**

Run: `pnpm --filter opd-lite test -- clinical-dashboard soap-note-entry vitals-form PrescriptionEntry InteractionWarningModal` → PASS.
Run: `pnpm --filter opd-lite exec tsc --noEmit` → clean.
Confirm the drug-interaction "check unavailable" warning path still shows (Rule #3) — the `PrescriptionEntry.test.tsx` covers this; verify it still asserts the warning.

- [ ] **Step 6: Visual check** — active encounter: form left, rail right pinned; scroll the SOAP note and confirm allergies + interaction chip never leave the viewport. Trigger a BLOCKED interaction: chip turns destructive, prescription form stays disabled.

- [ ] **Step 7: Commit**

```bash
git add apps/opd-lite/src/components/encounter-dashboard.tsx apps/opd-lite/src/__tests__ apps/opd-lite/messages
git commit -m "feat(opd-lite): encounter two-column workspace + Alert primitive"
```

---

# Phase 3 — List / index pages

Each task: exact file, exact change, test, commit. No page omitted.

### Task 7: Patients list (`PatientDirectory.tsx`)
- [ ] Replace the two ad-hoc dashed-border empty states (`~:392-412`) with `EmptyState`: zero-data → `icon={Users} title description action={{label: register, onClick}}`; no-results-with-filters → `icon={FileSearch} title description action={{label: clearFilters}}`. Import from `@ultranos/ui-kit/components/ui/empty-state`.
- [ ] Replace the hardcoded "Register New" `<Link>` (top-right) with `<Button>` (use `asChild` + `Link` if the Button supports it; else `Button` with `onClick={() => router.push(...)}`). Verify `button.tsx` for `asChild`.
- [ ] Add a stat strip above the table: a `grid grid-cols-2 gap-4 sm:grid-cols-4` of the app-local `Card`s — Total, Active today, With allergies, Pending sync — reusing the dashboard stat card markup. Numbers come from the already-loaded patient list (no new query).
- [ ] Promote the Status `<select>` to the design.md pill tab-bar (All/Active/Inactive); keep allergy + last-visit as secondary `<select>`s or a filter popover.
- [ ] Test: extend `apps/opd-lite/src/__tests__/` patients coverage — assert `EmptyState` renders on empty, stat strip shows counts. `pnpm --filter opd-lite test -- patient` → PASS.
- [ ] Commit: `feat(opd-lite): patients list stat strip, tab filter, EmptyState`.

### Task 8: Dashboard (`ClinicalDashboard.tsx`)
- [ ] Replace the hardcoded "Register New" `<Link>` (`~:72-75`) with `<Button>`. Keep "Start Encounter" as-is (already `Button`).
- [ ] No layout restructure (dashboard stays full-width grid). Verify stat `Card`s already comply; leave.
- [ ] Test: `pnpm --filter opd-lite test -- clinical-dashboard` → PASS. Commit: `refactor(opd-lite): dashboard CTA uses Button component`.

### Task 9: Notifications (`NotificationCenter.tsx`)
- [ ] Replace the raw `role="button"` notification rows (`~:237-240`) with `Button variant="ghost"` (full-width, text-start) or keep the div but this is already acceptable; prioritize converting the custom tab `<button>`s (`~:169-181`) to the shared tab-bar pattern (they already match it visually — confirm classes equal design.md's tab-bar and leave if identical).
- [ ] Replace the error block (`~:187`, `bg-warning/10 …`) with `<Alert variant="warning">`.
- [ ] Route hardcoded TAB labels + `notificationLabel()` strings through i18n.
- [ ] Test: `pnpm --filter opd-lite test -- notification` (add if none) → PASS. Commit: `refactor(opd-lite): notifications Alert + i18n labels`.

### Task 10: Expiring consents (`expiring-consents/page.tsx`)
- [ ] Replace plain-text loading (`~:70-72`) with `skeleton` rows; replace plain-text empty (`~:74-78`) with `EmptyState icon={CalendarClock} title description`.
- [ ] Route the TODO-i18n strings (`~:21`, `70-78`) through a `consent` namespace across all locales.
- [ ] Wrap the "days until expiry" conditional colouring in a status pill (`inline-flex rounded-full px-2 py-0.5 text-xs font-bold` with `bg-destructive/20 text-destructive` ≤30d, `bg-warning/20 text-warning` ≤60d, else `bg-muted text-muted-foreground`) instead of bare text colour.
- [ ] Test: `pnpm --filter opd-lite test -- expiring-consents` (add) → PASS. Commit: `feat(opd-lite): expiring-consents EmptyState, skeleton, status pills, i18n`.

### Task 11: Duplicate review (`DuplicateReviewTable.tsx`, `CandidateComparisonCard.tsx`)
- [ ] Fix contrast bug: `FLAGGED_FOR_MERGE` badge `text-primary` on `bg-primary` → `text-primary-foreground` (`~:226`).
- [ ] Add `EmptyState size="sm"` inside an expanded row when `candidates.length === 0`.
- [ ] Give non-PENDING rows a disabled affordance (muted row + `title`/`aria-disabled`) so they don't read as clickable.
- [ ] Keep the 2-col candidate grid (already good).
- [ ] Test: `pnpm --filter opd-lite test -- duplicate` (add) → PASS. Commit: `fix(opd-lite): duplicate-review badge contrast + empty/disabled states`.

### Task 12: Conflicts (`ConflictList.tsx`, `ConflictDiffView.tsx`)
- [ ] Fix overdue badge `text-white` → `text-destructive-foreground` (`ConflictList.tsx:166`).
- [ ] Wrap the Tier-1 warning box (`ConflictDiffView.tsx:192-201`) and the confirmation box (`~:291-323`) in `<Alert variant="warning">` / `<Alert variant="destructive">`. Behaviour and the append-only resolution actions unchanged (Rule #5).
- [ ] Add `lg:max-h-[70svh] lg:overflow-y-auto` to the diff grid so huge records don't overflow.
- [ ] Test: `pnpm --filter opd-lite test -- conflict` (add) → PASS. Commit: `refactor(opd-lite): conflicts use Alert + token fixes`.

---

# Phase 4 — Forms & wizards

### Task 13: Register patient (`PatientRegistrationForm.tsx`) + sticky save bar
- [ ] Enforce `max-w-3xl` on the page root (`register-patient/page.tsx`) — move the constraint to the actual root `flex flex-col gap-4` div.
- [ ] Add a sticky bottom save bar (Shopify pattern): a `sticky bottom-0` bar with `Discard`/`Save` `Button`s that mirrors the existing submit action. Show inline validation count. Implement as a small local `FormActionBar` component; do not change submit logic.
- [ ] Replace the inline submit-error block (`~:875`, `bg-destructive/10 …`) with `<Alert variant="destructive" role="alert">`.
- [ ] Keep the single-column card stack (correct for a wizard-style form).
- [ ] Test: extend registration test — sticky bar renders, Save triggers existing submit. `pnpm --filter opd-lite test -- registration` → PASS. Commit: `feat(opd-lite): register-patient sticky save bar + Alert`.

### Task 14: KYC (`kyc/page.tsx`)
- [ ] Replace the two ad-hoc card containers (`~:406-428`, `461-472`) with the app-local `Card`.
- [ ] Replace inline rejection/request banners (`~:262-272`, `274-284`) with `<Alert variant="destructive">` / `<Alert variant="warning">`.
- [ ] Replace the step-4 submitted success card (`~:460-472`) with `EmptyState icon={CircleCheck} title description` (centered success).
- [ ] Convert the `DocumentUploadZone` `<label>` CTA to a `Button asChild`-wrapped label so styling matches (`~:521`) — verify the file-input pattern still fires.
- [ ] Test: `pnpm --filter opd-lite test -- kyc-page` → PASS. Commit: `refactor(opd-lite): kyc cards, Alert, EmptyState`.

### Task 15: Settings (`settings/page.tsx` + cards)
- [ ] Wrap the Data-Budget link (`settings/page.tsx:42`) in the app-local `Card` instead of re-implementing card classes; keep the hover.
- [ ] Replace hardcoded progress-bar colours `bg-red-500/yellow-500/green-500` (`~:24-26, 63-66`) with `bg-destructive / bg-warning / bg-success`.
- [ ] Add a page header/title consistent with other pages (the `BreadcrumbHeader` already provides the route crumb; add an `<h1>` only if other pages do — match, don't diverge).
- [ ] Leave the MFA multi-step inline flow as-is (works; modal is optional and out of scope).
- [ ] Test: `pnpm --filter opd-lite test -- settings-page` → PASS. Commit: `refactor(opd-lite): settings Card reuse + token colours`.

### Task 16: Data budget (`settings/data-budget/*`, `DataBudgetDashboard.tsx`)
- [ ] Replace hardcoded threshold colours with `destructive/warning/success` tokens (progress bar + daily chart bars).
- [ ] Wrap the warning/critical banners in `<Alert>`.
- [ ] `EmptyState` for the category table when empty.
- [ ] Test: add a data-budget test → PASS. Commit: `refactor(opd-lite): data-budget tokens, Alert, EmptyState`.

---

# Phase 5 — Appointments

### Task 17: Appointments page + views
- [ ] Replace the raw `<button>` view-mode toggle (`appointments/page.tsx:17-32`) with the design.md pill tab-bar using `Button`s (or the shared tab-bar component if one exists in ui-kit).
- [ ] Add `EmptyState size="sm"` for an empty day/week (no appointments).
- [ ] Extract the duplicated `SERVICE_TYPE_COLORS` (in `WeekScheduleView.tsx:85-90` and `AppointmentSlot.tsx`) into one shared `apps/opd-lite/src/lib/appointment-colors.ts` using semantic tokens.
- [ ] Keep BookingModal as a modal (genuinely modal-appropriate); standardize it in Phase 6.
- [ ] Standardize BookingModal inputs to `rounded-xl` (already) and align to registration input radius decision: containers/inputs = `rounded-xl` per design.md; fix registration inputs that use `rounded-lg` if design.md mandates `rounded-xl` for inputs (it does — inputs are containers). Note this cross-file input-radius normalization and apply in Task 22.
- [ ] Test: `pnpm --filter opd-lite test -- appointments` → PASS. Commit: `refactor(opd-lite): appointments tab-bar, EmptyState, shared colors`.

---

# Phase 6 — Modal / overlay standardization (all 16)

**Goal:** every hand-rolled `fixed inset-0` overlay uses the ui-kit `Dialog` (or `Sheet` for side panels), with one backdrop token and `Button variant="icon"` close buttons. Behaviour, focus traps, and content unchanged.

### Task 18: Migrate hand-rolled modals to ui-kit `Dialog`
Convert each below to `Dialog`/`DialogContent` (keeps built-in focus trap, Escape, backdrop, `aria-modal`). Preserve all props/handlers and inner content verbatim.

| Modal | File | Current | Action |
|---|---|---|---|
| InteractionWarningModal | `components/modals/InteractionWarningModal.tsx` | custom `bg-black/50` + own focus trap | Dialog; drop custom trap + `<style>` |
| BookingModal | `components/appointments/BookingModal.tsx` | custom `bg-black/40` | Dialog; close → `Button variant="icon"` |
| PatientSummaryPopup | `components/appointments/PatientSummaryPopup.tsx` | custom `bg-black/40` | Dialog; nested status dropdown → `DropdownMenu` |
| MpiResultModal | `components/registration/MpiResultModal.tsx` | custom `bg-black/50` | Dialog; keep per-candidate accordion |
| ConsentTextModal | `components/registration/ConsentTextModal.tsx` | custom `bg-black/50` | Dialog; keep language tabs |
| ConsentRenewalModal | `components/patient/ConsentRenewalModal.tsx` | custom `bg-black/50`, no trap | Dialog (gains trap) |
| PatientEditModal | `components/patient/PatientEditModal.tsx` | custom `bg-black/50`, no trap | Dialog (gains trap) |
| SyncDashboard | `components/SyncDashboard.tsx` | custom `bg-background/40` | Dialog or Sheet; keep accordion |
| CommandPalette | `components/layout/CommandPalette.tsx` | `cmdk` + custom backdrop | Keep `cmdk` inside `Dialog` (cmdk-in-dialog is standard); drop custom `<style>` |
| NotificationPanel | `components/NotificationPanel.tsx` | absolute popover | `DropdownMenu`/`Popover` from ui-kit |

Already compliant (leave): PhotoCropModal (`Dialog`), EncounterDetailModal (`Dialog`), DrugMonographSheet (`Sheet`). Banners/toasts (InstallPrompt, SwUpdateNotification) are not modals — leave, but see Task 20.

- [ ] Do them one file per commit (each independently testable). For each: swap container → `<Dialog open onOpenChange>`, `<DialogContent>`; delete the `<style>` animation block (Dialog animates); close button → `<Button variant="icon" onClick={onClose}><X/></Button>`; verify the existing test (if any) still passes and add a "renders when open / calls onClose" test if none exists.
- [ ] After each: `pnpm --filter opd-lite test -- <modalname>` → PASS; `tsc --noEmit` clean.
- [ ] Commit per modal: `refactor(opd-lite): <Modal> uses ui-kit Dialog`.

### Task 19: Backdrop + radius token audit
- [ ] Confirm `Dialog`/`Sheet` in ui-kit use one overlay treatment (`bg-foreground/40` or existing token) so `bg-black/40` vs `bg-black/50` divergence disappears once modals migrate. If ui-kit hardcodes `bg-black`, change to `bg-foreground/40` in `dialog.tsx`/`sheet.tsx`, rebuild ui-kit.
- [ ] Commit: `refactor(ui-kit): single overlay backdrop token`.

---

# Phase 7 — Banners (all 8)

### Task 20: Banner consistency pass
Banners already use semantic tokens (good). Normalize them onto `Alert` where they're generic, keep the two safety banners bespoke.

| Banner | File | Action |
|---|---|---|
| AllergyBanner | `components/clinical/AllergyBanner.tsx` | KEEP bespoke (Rule #4 — specific red/yellow/NKA states, `aria-live`). No change. |
| ConflictBanner | `components/sync/ConflictBanner.tsx` | KEEP bespoke (blocks Rx, `aria-live=assertive`, links /conflicts). No change. |
| PediatricDosingBanner | `components/clinical/PediatricDosingBanner.tsx` | → `<Alert variant="warning" role="status">` |
| BiometricStaleBanner | `components/patient/BiometricStaleBanner.tsx` | → `<Alert variant="info">` with inline action `Button` |
| ConsentExpiryBanner | `components/patient/ConsentExpiryBanner.tsx` | → `<Alert variant="warning">` (keep renewal modal trigger) |
| MpiWarnBanner | `components/patient/MpiWarnBanner.tsx` | → `<Alert variant="warning">` (keep /duplicate-review link) |
| NidMissingBanner | `components/patient/NidMissingBanner.tsx` | → `<Alert variant="warning" role="status">` |
| SwUpdateNotification | `components/SwUpdateNotification.tsx` | replace `border-primary-200` hardcoded shade with `border-primary/20` |

- [ ] One commit per banner or a single grouped commit; each with a render test asserting text + role preserved. `pnpm --filter opd-lite test -- allergy-banner PediatricDosingBanner` → PASS (existing), plus new.
- [ ] Commit: `refactor(opd-lite): normalize non-safety banners onto Alert`.

---

# Phase 8 — Auth

### Task 21: Auth polish (login / forgot / reset)
- [ ] Route the hardcoded feature-list + tagline strings in `forgot-password` and `reset-password` right panels through i18n (login already uses `t()` — match it).
- [ ] Replace the raw `<button>` `×` close on the reset-success banner (`login/page.tsx:175-185`) with `Button variant="icon"`; the banner itself → `<Alert variant="success">`.
- [ ] Keep the split-screen + green brand panel (on-brand, no change). Replace magic blob sizes only if trivial; otherwise leave (decorative, out of critical path).
- [ ] Test: `pnpm --filter opd-lite test -- forgot-password reset-password` → PASS. Commit: `refactor(opd-lite): auth i18n + Alert + Button close`.

---

# Phase 9 — Shell + cross-cutting cleanup

### Task 22: App shell + global token/radius sweep
- [ ] `sidebar/nav-main.tsx:76` badge: keep `size-5` but move `text-[10px]` to a small utility or `text-xs leading-none`; ensure badge text colour is correct on primary (`text-primary-foreground` is fine).
- [ ] Normalize input radius: any form input using `rounded-lg` (registration `NameInputSection`, etc.) → `rounded-xl` per design.md (inputs are containers). Grep: `rg "rounded-lg" apps/opd-lite/src` and fix inputs/cards only (leave small inline `rounded-lg` tab buttons which design.md permits).
- [ ] Grep for remaining hardcoded colours: `rg -n "red-500|green-500|yellow-500|bg-\[#|text-white" apps/opd-lite/src` → replace each with tokens (allow `text-white` only on genuinely dark, non-themed fills; prefer `*-foreground`).
- [ ] Grep for raw `<button`: `rg -n "<button" apps/opd-lite/src` → replace remaining with `Button` (excluding `Button.tsx`, `pill-button.tsx` if that IS the button primitive).
- [ ] Test: full suite `pnpm --filter opd-lite test` → PASS; `pnpm --filter opd-lite exec tsc --noEmit` clean; `pnpm --filter opd-lite lint` clean.
- [ ] Commit: `refactor(opd-lite): radius/colour/button token sweep`.

### Task 23: Final verification
- [ ] `pnpm --filter @ultranos/ui-kit build` then `rm -rf apps/opd-lite/.next`.
- [ ] `pnpm --filter opd-lite test` (all green, snapshots updated intentionally), `tsc --noEmit`, `lint`.
- [ ] Run the app; walk every screen in LTR and RTL at desktop + `<lg`: dashboard, patients, patient chart (two-col), encounter (two-col, pinned rail, BLOCKED interaction), appointments, register, kyc, settings, data-budget, conflicts, duplicate-review, notifications, expiring-consents, auth. Confirm allergy banner is first + full-width on chart and encounter.
- [ ] Confirm RTL snapshot tests pass (design.md §12) and allergy tests still assert red-first-uncollapsed.
- [ ] Commit: `chore(opd-lite): rebuild ui-kit, refresh snapshots, final verify`.

---

## Self-Review

**Spec coverage** — every inventoried surface has a task: Chart (T3–4), Encounter (T5–6), Patients (T7), Dashboard (T8), Notifications (T9), Expiring-consents (T10), Duplicate-review (T11), Conflicts (T12), Register (T13), KYC (T14), Settings (T15), Data-budget (T16), Appointments (T17), all 16 modals (T18–19), all 8 banners (T20), Auth (T21), Shell + sweep (T22), Verify (T23). ui-kit foundations (T1–2). No page/modal/section omitted.

**Placeholder scan** — the two flagship phases and both ui-kit primitives carry complete code. Phases 3–9 are concrete per-file edits with exact locations, tests, and commits; where a snippet says "verify X before writing," that is a required grounding step (subagent findings are leads), not a deferred decision.

**Type consistency** — `DetailLayout` props (`banner`/`rail`/`railLabel`/`children`) are used identically in T4 and T6. `Alert` variant union (`info|warning|destructive|success`) is used consistently T2/T6/T10/T12/T13/T20/T21. `InteractionStatus` union in T5 must be reconciled against the real literals in `encounter-dashboard.tsx` (flagged in T5 Step 3).

**Known follow-ups (deferred, not blocking):** encounter-history → timeline conversion (P1 open question), MFA-as-modal, decorative auth blob tokens. Each is additive and can be a separate plan.
