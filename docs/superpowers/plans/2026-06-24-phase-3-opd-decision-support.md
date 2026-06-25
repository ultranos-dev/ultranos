# Phase 3 — OPD-Lite clinical decision support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface clinical decision support at the point of prescribing in OPD-Lite — **3A** an inline safety panel (contraindications + pregnancy applicability) and **3B** a full drug monograph drawer — both reading the enriched Tier-2 data already on-device in `drugCatalogMirror` (synced in Phase 1). No new sync, no hub work.

**Architecture:** A shared `getMirrorDrugEntry(atc)` reader; a `DrugSafetyPanel` (3A, advisory — not a hard gate) and a `DrugMonographSheet` (3B, ui-kit `Sheet`), both fetching the mirror entry by the selected med's ATC. Wired into `PrescriptionEntry` (which already has `form.medicationCode = atcCode`), with patient sex/age threaded from `encounter-dashboard` for pregnancy gating. Graceful degradation throughout via the `@ultranos/drug-catalog-sync` coverage helpers (never imply "safe" on a data gap).

**Tech Stack:** Next.js 15 PWA, TypeScript, Dexie, Vitest + `fake-indexeddb` + @testing-library/react, `@ultranos/drug-catalog-sync` (coverage helpers + `DrugEntry`), `@ultranos/ui-kit` (`Sheet`).

## Decisions (locked / documented)
- **D1 — advisory, not blocking:** catalog contraindications are general (not patient-specific), so 3A *displays* them prominently but does NOT block submission. The allergy match + interaction check (Phase 1) remain the hard gates.
- **D2 — pregnancy gating:** pregnancy status is not tracked in OPD. The inline pregnancy *alert* (3A) shows only for `female` patients of reproductive age (13–55) with a "confirm applicability" note; the monograph *drawer* (3B) always shows the full pregnancy section as reference. So the data is never hidden — only the proactive alert is scoped.
- **D3 — graceful degradation (Rule #3):** when the mirror entry exists but a field is empty, show an explicit "No … data on file" line rather than nothing/implied-safe. When the med isn't in the mirror at all (e.g. pre-sync vocab fallback), the panel/⨯ render nothing.
- **D4 — deferred:** 3C brand hint (no OPD brand-picker UI; Pharmacy 2A already substitutes from the QR `atc`) and renal gating (eGFR not tracked). Pediatric/adult **dosing** surfaces are built but data-blocked (0% coverage) → render "No dosing data on file" until ETL fills.

## Global Constraints
- **Rule #3:** never imply "no interactions/contraindications = safe" on absent data — explicit "no data" copy.
- **Rule #4:** allergy/contraindication content renders with prominence (the existing allergy gate is unchanged; the contraindication panel is red-accented, not collapsed).
- UI imports: Button from `@/components/ui/Button` (existing OPD proxy, capital B); Sheet from `@ultranos/ui-kit/components/ui/sheet` (verify exact exports — `Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle`; adapt if the app uses a local proxy).
- Coverage helpers from `@ultranos/drug-catalog-sync`: `hasText, hasList, isTier2`.
- Tests: `pnpm -F opd-lite test <pattern>` (fake-indexeddb/auto + jsdom in setup).
- No new Dexie schema, no new deps (drug-catalog-sync + ui-kit already in OPD).

---

### Task 1: `getMirrorDrugEntry` reader

**Files:**
- Create: `apps/opd-lite/src/lib/drug-entry.ts`
- Test: `apps/opd-lite/src/__tests__/drug-entry.test.ts`

**Interfaces:**
- `getMirrorDrugEntry(atcCode: string): Promise<DrugEntry | null>` — reads `db.drugCatalogMirror.get(atcCode)`; returns null when absent or atc empty.

- [ ] **Step 1: Write the failing test**

`apps/opd-lite/src/__tests__/drug-entry.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { getMirrorDrugEntry } from '@/lib/drug-entry'
import type { DrugEntry } from '@ultranos/drug-catalog-sync'

const entry = (atcCode: string): DrugEntry =>
  ({ atcCode, innName: 'Amoxicillin', brandNames: [], doseForms: ['capsule'], therapeuticClass: 'Penicillins',
     contraindications: ['Hypersensitivity to penicillins'] }) as unknown as DrugEntry

beforeEach(async () => { await db.open(); await db.drugCatalogMirror.clear() })

describe('getMirrorDrugEntry', () => {
  it('returns the entry for a known ATC', async () => {
    await db.drugCatalogMirror.put(entry('J01CA04') as never)
    const e = await getMirrorDrugEntry('J01CA04')
    expect(e?.innName).toBe('Amoxicillin')
  })
  it('returns null for an unknown ATC or empty input', async () => {
    expect(await getMirrorDrugEntry('X')).toBeNull()
    expect(await getMirrorDrugEntry('')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F opd-lite test drug-entry`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`apps/opd-lite/src/lib/drug-entry.ts`:
```typescript
import type { DrugEntry } from '@ultranos/drug-catalog-sync'
import { db } from './db'

/** Read a full tiered drug entry from the on-device mirror by ATC. Null when absent. */
export async function getMirrorDrugEntry(atcCode: string): Promise<DrugEntry | null> {
  if (!atcCode) return null
  const row = await db.drugCatalogMirror.get(atcCode)
  return (row as DrugEntry | undefined) ?? null
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm -F opd-lite test drug-entry`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit** — SKIP.

---

### Task 2: `DrugSafetyPanel` (3A — contraindications + pregnancy applicability)

**Files:**
- Create: `apps/opd-lite/src/components/clinical/DrugSafetyPanel.tsx`
- Test: `apps/opd-lite/src/__tests__/DrugSafetyPanel.test.tsx`

**Interfaces:**
- `DrugSafetyPanel({ atcCode, patientSex, patientAge })` — fetches the entry; renders contraindications (advisory red panel; "No contraindication data on file" when the entry exists but the list is empty) + a pregnancy applicability note for `female` + age 13–55. Renders nothing when the entry is absent.

- [ ] **Step 1: Write the failing test**

`apps/opd-lite/src/__tests__/DrugSafetyPanel.test.tsx`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { db } from '@/lib/db'
import { DrugSafetyPanel } from '@/components/clinical/DrugSafetyPanel'
import type { DrugEntry } from '@ultranos/drug-catalog-sync'

const entry = (over: Partial<DrugEntry> = {}): DrugEntry =>
  ({ atcCode: 'J01CA04', innName: 'Amoxicillin', brandNames: [], doseForms: [], therapeuticClass: '',
     contraindications: ['Hypersensitivity to penicillins'],
     pregnancyClinical: { pregnancy: 'Generally considered safe in pregnancy.' },
     interactions: [], adverseEvents: [], adultDosing: [], pediatricDosing: [], indicationsClinical: [],
     administrationNotes: {}, pharmacokinetics: {}, ...over }) as unknown as DrugEntry

beforeEach(async () => { await db.open(); await db.drugCatalogMirror.clear() })

describe('DrugSafetyPanel', () => {
  it('renders contraindications from the mirror', async () => {
    await db.drugCatalogMirror.put(entry() as never)
    render(<DrugSafetyPanel atcCode="J01CA04" patientSex="male" patientAge={40} />)
    await waitFor(() => expect(screen.getByText(/Hypersensitivity to penicillins/)).toBeInTheDocument())
  })

  it('shows the pregnancy applicability note for a female patient of reproductive age', async () => {
    await db.drugCatalogMirror.put(entry() as never)
    render(<DrugSafetyPanel atcCode="J01CA04" patientSex="female" patientAge={30} />)
    await waitFor(() => expect(screen.getByTestId('pregnancy-note')).toBeInTheDocument())
  })

  it('does NOT show the pregnancy note for a male patient', async () => {
    await db.drugCatalogMirror.put(entry() as never)
    render(<DrugSafetyPanel atcCode="J01CA04" patientSex="male" patientAge={30} />)
    await waitFor(() => expect(screen.getByText(/Hypersensitivity/)).toBeInTheDocument())
    expect(screen.queryByTestId('pregnancy-note')).toBeNull()
  })

  it('shows an explicit "no data" line when contraindications are empty (rule #3)', async () => {
    await db.drugCatalogMirror.put(entry({ contraindications: [] }) as never)
    render(<DrugSafetyPanel atcCode="J01CA04" patientSex="male" patientAge={40} />)
    await waitFor(() => expect(screen.getByText(/No contraindication data on file/i)).toBeInTheDocument())
  })

  it('renders nothing when the drug is not in the mirror', async () => {
    const { container } = render(<DrugSafetyPanel atcCode="ZZZ" patientSex="male" patientAge={40} />)
    await waitFor(() => expect(container.querySelector('[data-testid="drug-safety-panel"]')).toBeNull())
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F opd-lite test DrugSafetyPanel`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`apps/opd-lite/src/components/clinical/DrugSafetyPanel.tsx`:
```typescript
'use client'

import { useEffect, useState } from 'react'
import { isTier2, hasList } from '@ultranos/drug-catalog-sync'
import type { DrugEntry } from '@ultranos/drug-catalog-sync'
import { getMirrorDrugEntry } from '@/lib/drug-entry'

function isReproductiveAgeFemale(sex?: string, age?: number): boolean {
  return sex?.toLowerCase() === 'female' && typeof age === 'number' && age >= 13 && age <= 55
}

export function DrugSafetyPanel({
  atcCode, patientSex, patientAge,
}: { atcCode: string; patientSex?: string; patientAge?: number }) {
  const [entry, setEntry] = useState<DrugEntry | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoaded(false)
    void getMirrorDrugEntry(atcCode).then((e) => { if (!cancelled) { setEntry(e); setLoaded(true) } })
    return () => { cancelled = true }
  }, [atcCode])

  if (!loaded || !entry) return null // absent from mirror → render nothing (no implied-safe)

  const tier2 = isTier2(entry) ? entry : null
  const showPregnancy = isReproductiveAgeFemale(patientSex, patientAge)
  const pregText = tier2?.pregnancyClinical?.pregnancy || tier2?.pregnancyClinical?.lactation

  return (
    <div
      data-testid="drug-safety-panel"
      className="rounded-xl ring-[0.65px] ring-destructive/30 bg-destructive/5 p-4 space-y-2"
    >
      <h4 className="text-sm font-bold text-destructive">Clinical safety</h4>
      {tier2 && hasList(tier2.contraindications) ? (
        <div>
          <p className="text-xs font-semibold text-foreground">Contraindications</p>
          <ul className="mt-1 space-y-0.5">
            {tier2.contraindications.map((c) => (
              <li key={c} className="text-sm text-destructive">&bull; {c}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No contraindication data on file for this drug.</p>
      )}
      {showPregnancy && (
        <div data-testid="pregnancy-note" className="border-t border-border pt-2">
          <p className="text-xs font-semibold text-foreground">Pregnancy / lactation</p>
          <p className="text-sm text-foreground">{pregText || 'No pregnancy data on file for this drug.'}</p>
          <p className="mt-1 text-xs text-muted-foreground italic">
            Pregnancy status not recorded — confirm applicability with the patient.
          </p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm -F opd-lite test DrugSafetyPanel`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit** — SKIP.

---

### Task 3: `DrugMonographSheet` (3B — full monograph drawer)

**Files:**
- Create: `apps/opd-lite/src/components/clinical/DrugMonographSheet.tsx`
- Test: `apps/opd-lite/src/__tests__/DrugMonographSheet.test.tsx`

**Interfaces:**
- `DrugMonographSheet({ atcCode, label })` — an "ⓘ Drug info" trigger opening a `Sheet`; on open, fetches the entry and renders the Tier-2 monograph (mechanism, indications, contraindications, adverse events, full pregnancy, pharmacokinetics, dosing), each section gated by coverage helpers with an explicit empty line; a "Limited data available" hint when the entry is missing.

- [ ] **Step 1: Write the failing test**

`apps/opd-lite/src/__tests__/DrugMonographSheet.test.tsx`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { db } from '@/lib/db'
import { DrugMonographSheet } from '@/components/clinical/DrugMonographSheet'
import type { DrugEntry } from '@ultranos/drug-catalog-sync'

const entry = (): DrugEntry =>
  ({ atcCode: 'J01CA04', innName: 'Amoxicillin', brandNames: [], doseForms: [], therapeuticClass: '',
     mechanismOfAction: 'Inhibits bacterial cell-wall synthesis.',
     contraindications: ['Penicillin hypersensitivity'], adverseEvents: [], interactions: [],
     adultDosing: [], pediatricDosing: [], indicationsClinical: ['Bacterial infections'],
     pregnancyClinical: {}, administrationNotes: {}, pharmacokinetics: { halfLife: '1 hour' } }) as unknown as DrugEntry

beforeEach(async () => { await db.open(); await db.drugCatalogMirror.clear() })

describe('DrugMonographSheet', () => {
  it('opens the drawer and shows monograph content from the mirror', async () => {
    await db.drugCatalogMirror.put(entry() as never)
    render(<DrugMonographSheet atcCode="J01CA04" label="Amoxicillin 500mg" />)
    fireEvent.click(screen.getByTestId('monograph-trigger'))
    await waitFor(() => expect(screen.getByText(/Inhibits bacterial cell-wall synthesis/)).toBeInTheDocument())
    expect(screen.getByText(/Bacterial infections/)).toBeInTheDocument()
  })

  it('shows a limited-data hint when the drug is not in the mirror', async () => {
    render(<DrugMonographSheet atcCode="ZZZ" label="Unknown" />)
    fireEvent.click(screen.getByTestId('monograph-trigger'))
    await waitFor(() => expect(screen.getByText(/Limited data available/i)).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F opd-lite test DrugMonographSheet`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`apps/opd-lite/src/components/clinical/DrugMonographSheet.tsx`:
```typescript
'use client'

import { useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@ultranos/ui-kit/components/ui/sheet'
import { isTier2 } from '@ultranos/drug-catalog-sync'
import type { DrugEntry } from '@ultranos/drug-catalog-sync'
import { getMirrorDrugEntry } from '@/lib/drug-entry'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <h4 className="text-sm font-bold text-foreground">{title}</h4>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  )
}

const NoData = () => <p className="text-xs text-muted-foreground italic">No data on file.</p>

export function DrugMonographSheet({ atcCode, label }: { atcCode: string; label: string }) {
  const [entry, setEntry] = useState<DrugEntry | null>(null)
  const [loaded, setLoaded] = useState(false)

  function onOpenChange(open: boolean) {
    if (open && !loaded) {
      void getMirrorDrugEntry(atcCode).then((e) => { setEntry(e); setLoaded(true) })
    }
  }

  const t2 = entry && isTier2(entry) ? entry : null

  return (
    <Sheet onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <button type="button" data-testid="monograph-trigger" className="text-sm font-medium text-primary-700 underline underline-offset-2">
          ⓘ Drug info
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{label}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          {!loaded && <p className="text-sm text-muted-foreground">Loading…</p>}
          {loaded && !entry && <p className="text-sm text-muted-foreground">Limited data available for this drug.</p>}
          {t2 && (
            <>
              <Section title="Mechanism of action">{t2.mechanismOfAction || <NoData />}</Section>
              <Section title="Indications">{t2.indicationsClinical.length ? t2.indicationsClinical.join('; ') : <NoData />}</Section>
              <Section title="Contraindications">
                {t2.contraindications.length ? (
                  <ul className="space-y-0.5">{t2.contraindications.map((c) => <li key={c}>&bull; {c}</li>)}</ul>
                ) : <NoData />}
              </Section>
              <Section title="Adult dosing">{t2.adultDosing.length ? t2.adultDosing.map((d, i) => <p key={i}>{d.indication}: {d.adultDose ?? d.frequency}</p>) : <NoData />}</Section>
              <Section title="Pediatric dosing">{t2.pediatricDosing.length ? t2.pediatricDosing.map((d, i) => <p key={i}>{d.indication}: {d.pediatricDose ?? d.frequency}</p>) : <NoData />}</Section>
              <Section title="Pregnancy / lactation">{t2.pregnancyClinical?.pregnancy || t2.pregnancyClinical?.lactation || <NoData />}</Section>
              <Section title="Adverse effects">{t2.adverseEvents.length ? t2.adverseEvents.map((a) => a.effect).join(', ') : <NoData />}</Section>
              <Section title="Pharmacokinetics">{t2.pharmacokinetics?.halfLife ? `Half-life: ${t2.pharmacokinetics.halfLife}` : <NoData />}</Section>
            </>
          )}
          {loaded && entry && !t2 && <p className="text-sm text-muted-foreground">Clinical detail not available at your access level.</p>}
        </div>
      </SheetContent>
    </Sheet>
  )
}
```
(If the ui-kit `Sheet` export names differ, adapt the import to the actual exports — verify in `packages/ui-kit/src/components/ui/sheet.tsx`.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm -F opd-lite test DrugMonographSheet`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit** — SKIP.

---

### Task 4: Wire into PrescriptionEntry + encounter-dashboard

**Files:**
- Modify: `apps/opd-lite/src/components/clinical/PrescriptionEntry.tsx` (add props + render the panel/monograph)
- Modify: `apps/opd-lite/src/components/encounter-dashboard.tsx:739` (pass patient sex/age)
- Test: `apps/opd-lite/src/__tests__/PrescriptionEntry-decision-support.test.tsx`

**Interfaces:**
- `PrescriptionEntry` gains `patientSex?: string` and `patientAge?: number` props; renders `DrugSafetyPanel` + `DrugMonographSheet` when a medication is selected.

- [ ] **Step 1: Write the failing test**

`apps/opd-lite/src/__tests__/PrescriptionEntry-decision-support.test.tsx`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { db } from '@/lib/db'
import { PrescriptionEntry } from '@/components/clinical/PrescriptionEntry'
import type { DrugEntry } from '@ultranos/drug-catalog-sync'

const entry = (): DrugEntry =>
  ({ atcCode: 'J01CA04', innName: 'Amoxicillin', brandNames: ['Amoxil'], doseForms: ['capsule'], therapeuticClass: '',
     contraindications: ['Penicillin hypersensitivity'], interactions: [], adverseEvents: [],
     adultDosing: [], pediatricDosing: [], indicationsClinical: [], pregnancyClinical: {},
     administrationNotes: {}, pharmacokinetics: {} }) as unknown as DrugEntry

beforeEach(async () => {
  await db.open()
  await db.drugCatalogMirror.clear()
  await db.drugCatalogMirror.put(entry() as never)
  await db.vocabularyMedications.clear()
  await db.vocabularyMedications.put({ code: 'J01CA04', display: 'Amoxicillin', form: 'capsule', strength: '500mg', version: 1 } as never)
})

describe('PrescriptionEntry decision support', () => {
  it('shows the safety panel after selecting a medication', async () => {
    render(<PrescriptionEntry onSubmit={() => {}} patientSex="male" patientAge={40} />)
    fireEvent.change(screen.getByLabelText(/Search medications/i), { target: { value: 'Amox' } })
    const option = await waitFor(() => screen.getByText('Amoxicillin'))
    fireEvent.mouseDown(option)
    await waitFor(() => expect(screen.getByTestId('drug-safety-panel')).toBeInTheDocument())
    expect(screen.getByText(/Penicillin hypersensitivity/)).toBeInTheDocument()
    expect(screen.getByTestId('monograph-trigger')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F opd-lite test PrescriptionEntry-decision-support`
Expected: FAIL — `patientSex` prop unknown / panel not rendered.

- [ ] **Step 3: Modify `PrescriptionEntry.tsx`**

Add imports:
```typescript
import { DrugSafetyPanel } from '@/components/clinical/DrugSafetyPanel'
import { DrugMonographSheet } from '@/components/clinical/DrugMonographSheet'
```
Extend the props interface + signature:
```typescript
interface PrescriptionEntryProps {
  onSubmit: (form: PrescriptionFormData) => void | Promise<void>
  disabled?: boolean
  canEnrich?: boolean
  patientSex?: string
  patientAge?: number
}
```
```typescript
export function PrescriptionEntry({ onSubmit, disabled, canEnrich = false, patientSex, patientAge }: PrescriptionEntryProps) {
```
Replace the existing `hasMedication` "Open in Pharmopedia" block (lines 330–340) with one that also renders the monograph trigger + safety panel:
```typescript
      {hasMedication && (
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={`pharmopedia://drug/${form.medicationCode}`}
            className="text-sm font-medium text-primary-700 underline underline-offset-2"
            aria-label="Open in Pharmopedia"
          >
            Open in Pharmopedia
          </a>
          <DrugMonographSheet atcCode={form.medicationCode} label={`${form.medicationDisplay} ${form.medicationStrength}`} />
        </div>
      )}

      {hasMedication && (
        <DrugSafetyPanel atcCode={form.medicationCode} patientSex={patientSex} patientAge={patientAge} />
      )}
```

- [ ] **Step 4: Pass patient sex/age in `encounter-dashboard.tsx`**

Add a numeric-age helper near `formatAge` (line 42):
```typescript
function ageYears(birthDate?: string): number | undefined {
  if (!birthDate) return undefined
  const b = new Date(birthDate)
  if (Number.isNaN(b.getTime())) return undefined
  const now = new Date()
  let age = now.getFullYear() - b.getFullYear()
  const m = now.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--
  return age
}
```
Update the render at line 739:
```typescript
          <PrescriptionEntry
            onSubmit={handleAddPrescription}
            patientSex={patient.gender}
            patientAge={ageYears(patient.birthDate)}
          />
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm -F opd-lite test PrescriptionEntry-decision-support`
Expected: PASS. Then confirm no regression in the existing PrescriptionEntry suite:
Run: `pnpm -F opd-lite test PrescriptionEntry`
Expected: PASS (the existing tests render without `patientSex`/`patientAge` — both optional).

- [ ] **Step 6: Commit** — SKIP.

---

### Task 5: Phase verification

- [ ] **Step 1: All new suites**

Run:
```bash
pnpm -F opd-lite test drug-entry DrugSafetyPanel DrugMonographSheet PrescriptionEntry-decision-support
```
Expected: all green.

- [ ] **Step 2: Full suite + typecheck (no new regressions)**

Run:
```bash
pnpm -F opd-lite test
pnpm -F opd-lite typecheck
```
Expected: no NEW failures vs. the pre-existing baseline; no new type errors. (The full suite has pre-existing ambient ux-v1.5 failures — distinguish, don't fix.)

- [ ] **Step 3: Commit** — SKIP (leave changes in the working tree for review/staging).

---

## Self-Review

**1. Spec coverage:** 3A safety panel (contraindications + pregnancy applicability, advisory) — Tasks 2 & 4 ✓; 3B monograph drawer — Tasks 3 & 4 ✓; shared reader — Task 1 ✓. Deferred (documented): 3C brand hint, renal gating; dosing surfaces built but data-blocked.

**2. Placeholder scan:** No TBD/TODO. Complete code throughout. The Sheet-export caveat is an explicit verify-and-adapt instruction, not a placeholder.

**3. Type consistency:** `DrugEntry` + `isTier2`/`hasList` from `@ultranos/drug-catalog-sync`. `getMirrorDrugEntry` (Task 1) consumed by Tasks 2 & 3. `DrugSafetyPanel`/`DrugMonographSheet` props match the wiring in Task 4. `form.medicationCode` is the ATC (Phase 1). Patient `gender`/`birthDate` → `patientSex`/`patientAge` (optional, additive — existing PrescriptionEntry callers unaffected).

**Safety:** D1 advisory (no new block; existing allergy/interaction gates unchanged); D3 graceful "no data" (Rule #3); pregnancy alert scoped but full data always in the drawer (D2).

---

## Execution Handoff

Phase 3 plan complete. Execution: **subagent-driven, no commits** (leave changes in the working tree for review/staging). This completes the OPD decision-support layer; remaining roadmap items (3C brand hint, renal gating, dosing/counseling/translation surfaces) are data- or scope-gated wire-now/light-up-later work.
