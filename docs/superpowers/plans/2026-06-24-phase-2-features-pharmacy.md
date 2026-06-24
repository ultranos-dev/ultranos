# Phase 2 — Features (Pharmacy-Lite branded workflow) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Pharmacy-Lite branded-medication features on the Phase 2 Foundation mirror — **2A** brand/generic substitution picker at fulfillment, **2B** recall-alert guard, **2C** reference-price card, and **2D (offline half)** a pharmacist interaction recheck (intra-prescription DDI + local allergies). All client-only and offline-capable.

**Architecture:** Read brands / recall alerts / reference prices from the synced on-device mirror (Foundation), keyed by the prescription's `atc` field. Reuse the existing `InteractionCheckBanner` and mirror-backed `resolveDrugAdapter` for 2D. Recall mirrors the `AllergyBanner` safety pattern. The new pharmacist Hub endpoint for 2D's *online* active-meds cross-check is a SEPARATE follow-up unit (not in this plan).

**Tech Stack:** Next.js 15 PWA, TypeScript, Dexie, Vitest + `fake-indexeddb`, Zustand, `@ultranos/drug-db`, `@ultranos/drug-catalog-sync`.

## Decisions (locked)
- **2A** resolves brands offline from `drugBrandsMirror` by `genericAtcCode = rx.atc`; free-text fallback when `atc` is absent or no brands match.
- **2D (this plan)** = offline only: intra-prescription DDI + local `activePatient.allergies`, via `resolveDrugAdapter()`. The Hub active-meds fetch (a new PHARMACIST endpoint) is a follow-up.
- Block dispense confirmation on a `BLOCKED`/contraindicated interaction; `UNAVAILABLE` warns but does not block (matches OPD).

## Global Constraints
- **Rule #3:** never imply "no interactions" on missing data. If `resolveDrugAdapter()` returns `null` (empty mirror), the banner shows `UNAVAILABLE` — never CLEAR. The `@ultranos/drug-db` checker is unchanged.
- **Rule #4:** allergy + recall banners render with high prominence (red, not collapsed). Recall mirrors `AllergyBanner`.
- Prices are integers in minor currency units; reference prices from the mirror are **major-unit numbers** (`DrugBrandPresentation.referencePrice`) — format with the existing currency helpers and label them **indicative**, distinct from retail.
- Tests: `pnpm -F pharmacy-lite test <pattern>` (`fake-indexeddb/auto` in setup).
- No new mirror sync here — the Foundation already syncs `drugCatalogMirror` / `drugBrandsMirror` / `drugBrandPresentationsMirror`.

---

### Task 1: Fulfillment store — brand/presentation substitution state

**Files:**
- Modify: `apps/pharmacy-lite/src/stores/fulfillment-store.ts`
- Test: `apps/pharmacy-lite/src/__tests__/fulfillment-substitution.test.ts`

**Interfaces:**
- Adds to `FulfillmentItem`: `brandId?: string`, `presentationId?: string`.
- Adds actions: `setBrandSelection(prescriptionId, sel: { brandId?: string; brandName: string; presentationId?: string })`.

- [ ] **Step 1: Write the failing test**

`apps/pharmacy-lite/src/__tests__/fulfillment-substitution.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { useFulfillmentStore } from '@/stores/fulfillment-store'
import type { VerifiedPrescription } from '@/lib/prescription-verify'

const rx = (id: string): VerifiedPrescription =>
  ({ id, med: 'J01CA04', atc: 'J01CA04', medN: 'Amoxicillin', medT: 'Amoxicillin 500mg', dos: { qty: 1, unit: 'capsule' }, dur: 7, req: 'r', pat: 'p', at: '2026-06-24T00:00:00Z' })

beforeEach(() => {
  useFulfillmentStore.setState({ items: [{ prescription: rx('rx-1'), selected: true, brandName: '', batchLot: '' }] } as never)
})

describe('fulfillment substitution state', () => {
  it('records a brand selection (id + name + presentation)', () => {
    useFulfillmentStore.getState().setBrandSelection('rx-1', { brandId: 'b-1', brandName: 'Amoxil', presentationId: 'p-1' })
    const item = useFulfillmentStore.getState().items[0]!
    expect(item.brandId).toBe('b-1')
    expect(item.brandName).toBe('Amoxil')
    expect(item.presentationId).toBe('p-1')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F pharmacy-lite test fulfillment-substitution`
Expected: FAIL — `setBrandSelection` is not a function.

- [ ] **Step 3: Implement**

In `apps/pharmacy-lite/src/stores/fulfillment-store.ts`, add to the `FulfillmentItem` interface:
```typescript
  brandId?: string
  presentationId?: string
```

Add to the store's type (alongside `setBrandName`) and implementation (alongside the existing `setBrandName` action):
```typescript
  setBrandSelection: (prescriptionId: string, sel: { brandId?: string; brandName: string; presentationId?: string }) => void
```
```typescript
setBrandSelection: (prescriptionId, sel) => {
  set((state) => {
    const item = state.items.find((i) => i.prescription.id === prescriptionId)
    if (item) {
      item.brandId = sel.brandId
      item.brandName = sel.brandName
      item.presentationId = sel.presentationId
    }
  })
},
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm -F pharmacy-lite test fulfillment-substitution`
Expected: PASS.

- [ ] **Step 5: Commit** — SKIP.

---

### Task 2: Local mirror query helpers (brands, recalls, reference price)

**Files:**
- Create: `apps/pharmacy-lite/src/lib/drug-catalog-queries.ts`
- Test: `apps/pharmacy-lite/src/__tests__/drug-catalog-queries.test.ts`

**Interfaces:**
- `getLocalBrandsByAtc(atc: string): Promise<Array<{ brand: DrugBrand; presentations: DrugBrandPresentation[] }>>`
- `getRecallAlertsForAtc(atc: string): Promise<RecallAlert[]>`
- `getReferencePriceForAtc(atc: string): Promise<{ min: number; currency: string } | null>`

- [ ] **Step 1: Write the failing test**

`apps/pharmacy-lite/src/__tests__/drug-catalog-queries.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '@/lib/db'
import { getLocalBrandsByAtc, getRecallAlertsForAtc, getReferencePriceForAtc } from '@/lib/drug-catalog-queries'

beforeEach(async () => {
  await db.open()
  await db.drugCatalogMirror.clear(); await db.drugBrandsMirror.clear(); await db.drugBrandPresentationsMirror.clear()
})

describe('drug-catalog-queries', () => {
  it('returns brands + presentations for an ATC', async () => {
    await db.drugBrandsMirror.put({ id: 'b1', genericAtcCode: 'J01CA04', brandName: 'Amoxil' } as never)
    await db.drugBrandPresentationsMirror.bulkPut([
      { id: 'p1', brandId: 'b1', strength: '500mg', referencePrice: 12.5, currency: 'AFN' } as never,
      { id: 'p2', brandId: 'b1', strength: '250mg', referencePrice: 8, currency: 'AFN' } as never,
    ])
    const brands = await getLocalBrandsByAtc('J01CA04')
    expect(brands).toHaveLength(1)
    expect(brands[0]!.brand.brandName).toBe('Amoxil')
    expect(brands[0]!.presentations).toHaveLength(2)
  })

  it('returns the minimum reference price for an ATC', async () => {
    await db.drugBrandsMirror.put({ id: 'b1', genericAtcCode: 'J01CA04', brandName: 'Amoxil' } as never)
    await db.drugBrandPresentationsMirror.bulkPut([
      { id: 'p1', brandId: 'b1', referencePrice: 12.5, currency: 'AFN' } as never,
      { id: 'p2', brandId: 'b1', referencePrice: 8, currency: 'AFN' } as never,
    ])
    expect(await getReferencePriceForAtc('J01CA04')).toEqual({ min: 8, currency: 'AFN' })
  })

  it('returns active recall alerts for an ATC', async () => {
    await db.drugCatalogMirror.put({
      atcCode: 'J01CA04', innName: 'Amoxicillin', brandNames: [], doseForms: [], therapeuticClass: '',
      recallAlerts: [{ recallId: 'r1', description: 'Lot recall', initiationDate: '2026-01-01', status: 'ongoing' }],
    } as never)
    const recalls = await getRecallAlertsForAtc('J01CA04')
    expect(recalls).toHaveLength(1)
    expect(recalls[0]!.recallId).toBe('r1')
  })

  it('returns empty/null for an ATC with no data', async () => {
    expect(await getLocalBrandsByAtc('X')).toEqual([])
    expect(await getRecallAlertsForAtc('X')).toEqual([])
    expect(await getReferencePriceForAtc('X')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F pharmacy-lite test drug-catalog-queries`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`apps/pharmacy-lite/src/lib/drug-catalog-queries.ts`:
```typescript
import type { DrugBrand, DrugBrandPresentation, RecallAlert } from '@ultranos/shared-types'
import { db } from './db'

/** All brands (with their presentations) marketed for a generic ATC, from the local mirror. */
export async function getLocalBrandsByAtc(
  atc: string,
): Promise<Array<{ brand: DrugBrand; presentations: DrugBrandPresentation[] }>> {
  if (!atc) return []
  const brands = await db.drugBrandsMirror.where('genericAtcCode').equals(atc).toArray()
  if (brands.length === 0) return []
  const result: Array<{ brand: DrugBrand; presentations: DrugBrandPresentation[] }> = []
  for (const brand of brands) {
    const presentations = await db.drugBrandPresentationsMirror.where('brandId').equals(brand.id).toArray()
    result.push({ brand, presentations })
  }
  return result
}

/** Active recall alerts for a generic ATC, from the local Tier-3 mirror entry. */
export async function getRecallAlertsForAtc(atc: string): Promise<RecallAlert[]> {
  if (!atc) return []
  const entry = (await db.drugCatalogMirror.get(atc)) as unknown as { recallAlerts?: RecallAlert[] } | undefined
  return (entry?.recallAlerts ?? []).filter((r) => r.status !== 'terminated' && r.status !== 'completed')
}

/** Minimum indicative reference price across a generic's brand presentations. */
export async function getReferencePriceForAtc(atc: string): Promise<{ min: number; currency: string } | null> {
  const brands = await getLocalBrandsByAtc(atc)
  let min: number | null = null
  let currency = ''
  for (const { presentations } of brands) {
    for (const p of presentations) {
      if (typeof p.referencePrice === 'number' && (min === null || p.referencePrice < min)) {
        min = p.referencePrice
        currency = p.currency ?? ''
      }
    }
  }
  return min === null ? null : { min, currency }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm -F pharmacy-lite test drug-catalog-queries`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit** — SKIP.

---

### Task 3: 2A — brand substitution picker at fulfillment

**Files:**
- Create: `apps/pharmacy-lite/src/components/pharmacy/BrandSubstitutionPicker.tsx`
- Modify: `apps/pharmacy-lite/src/components/pharmacy/FulfillmentChecklist.tsx:111-149`
- Modify: `apps/pharmacy-lite/src/lib/medication-dispense.ts` (persist `brandId`/`presentationId`)
- Test: `apps/pharmacy-lite/src/__tests__/brand-substitution-picker.test.tsx`

**Interfaces:**
- `BrandSubstitutionPicker({ atc, value, onSelect })` — async-loads brands via `getLocalBrandsByAtc`; renders a `<select>` of brand · strength options; falls back to a free-text input (calling `onSelect({ brandName })`) when `atc` is empty or no brands exist.

- [ ] **Step 1: Write the failing test**

`apps/pharmacy-lite/src/__tests__/brand-substitution-picker.test.tsx`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { db } from '@/lib/db'
import { BrandSubstitutionPicker } from '@/components/pharmacy/BrandSubstitutionPicker'

beforeEach(async () => {
  await db.open(); await db.drugBrandsMirror.clear(); await db.drugBrandPresentationsMirror.clear()
})

describe('BrandSubstitutionPicker', () => {
  it('falls back to free-text when no atc is given', () => {
    const selected: unknown[] = []
    render(<BrandSubstitutionPicker atc={undefined} value="" onSelect={(s) => selected.push(s)} />)
    const input = screen.getByTestId('brand-freetext')
    fireEvent.change(input, { target: { value: 'Generic Co' } })
    expect(selected.at(-1)).toEqual({ brandName: 'Generic Co' })
  })

  it('renders brand options from the mirror and emits a selection', async () => {
    await db.drugBrandsMirror.put({ id: 'b1', genericAtcCode: 'J01CA04', brandName: 'Amoxil' } as never)
    await db.drugBrandPresentationsMirror.put({ id: 'p1', brandId: 'b1', strength: '500mg', referencePrice: 12.5, currency: 'AFN' } as never)
    const selected: unknown[] = []
    render(<BrandSubstitutionPicker atc="J01CA04" value="" onSelect={(s) => selected.push(s)} />)
    const select = await waitFor(() => screen.getByTestId('brand-select'))
    fireEvent.change(select, { target: { value: 'b1::p1' } })
    expect(selected.at(-1)).toMatchObject({ brandId: 'b1', brandName: 'Amoxil', presentationId: 'p1' })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F pharmacy-lite test brand-substitution-picker`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the picker**

`apps/pharmacy-lite/src/components/pharmacy/BrandSubstitutionPicker.tsx`:
```typescript
'use client'

import { useEffect, useState } from 'react'
import { getLocalBrandsByAtc } from '@/lib/drug-catalog-queries'

export interface BrandSelection {
  brandId?: string
  brandName: string
  presentationId?: string
}

interface Option { key: string; label: string; sel: BrandSelection }

export function BrandSubstitutionPicker({
  atc, value, onSelect,
}: { atc?: string; value: string; onSelect: (sel: BrandSelection) => void }) {
  const [options, setOptions] = useState<Option[] | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!atc) { setOptions([]); return }
    void getLocalBrandsByAtc(atc).then((brands) => {
      if (cancelled) return
      const opts: Option[] = []
      for (const { brand, presentations } of brands) {
        if (presentations.length === 0) {
          opts.push({ key: `${brand.id}::`, label: brand.brandName, sel: { brandId: brand.id, brandName: brand.brandName } })
        }
        for (const p of presentations) {
          const label = `${brand.brandName}${p.strength ? ` ${p.strength}` : ''}${p.doseForm ? ` ${p.doseForm}` : ''}`
          opts.push({ key: `${brand.id}::${p.id}`, label, sel: { brandId: brand.id, brandName: brand.brandName, presentationId: p.id } })
        }
      }
      setOptions(opts)
    }).catch(() => { if (!cancelled) setOptions([]) })
    return () => { cancelled = true }
  }, [atc])

  // Free-text fallback: no atc, or atc resolved to zero brands.
  if (options !== null && options.length === 0) {
    return (
      <input
        data-testid="brand-freetext"
        type="text"
        value={value}
        onChange={(e) => onSelect({ brandName: e.target.value })}
        placeholder="Brand name"
        className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
      />
    )
  }

  return (
    <select
      data-testid="brand-select"
      className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
      defaultValue=""
      onChange={(e) => {
        const opt = (options ?? []).find((o) => o.key === e.target.value)
        if (opt) onSelect(opt.sel)
      }}
    >
      <option value="" disabled>{options === null ? 'Loading brands…' : 'Select a brand'}</option>
      {(options ?? []).map((o) => (
        <option key={o.key} value={o.key}>{o.label}</option>
      ))}
    </select>
  )
}
```

- [ ] **Step 4: Wire the picker into `FulfillmentChecklist.tsx`**

Add the import:
```typescript
import { BrandSubstitutionPicker } from './BrandSubstitutionPicker'
```
Replace the brand `<input>` block (lines 121-129 — the `id={`brand-...`}` input) with:
```typescript
                      <BrandSubstitutionPicker
                        atc={item.prescription.atc}
                        value={item.brandName}
                        onSelect={(sel) => setBrandSelection(item.prescription.id, sel)}
                      />
```
Update the destructured store actions on line 27 to include `setBrandSelection` (and drop `setBrandName` if no longer used elsewhere in the file — keep it if other call sites remain):
```typescript
  const { phase, items, practitionerName, patientName, patientAge, toggleItem, selectAll, deselectAll, setBrandSelection, setBatchLot } =
    useFulfillmentStore()
```

- [ ] **Step 5: Persist brand/presentation IDs in the dispense record**

In `apps/pharmacy-lite/src/lib/medication-dispense.ts`, destructure the new fields (line 16) and add them to `_ultranos` (after the `batchLot` spread, line 54):
```typescript
  const { prescription, brandName, batchLot, brandId, presentationId } = item
```
```typescript
      ...(brandId ? { brandId } : {}),
      ...(presentationId ? { presentationId } : {}),
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm -F pharmacy-lite test brand-substitution-picker fulfillment-substitution`
Expected: PASS. Confirm no regression in fulfillment: `pnpm -F pharmacy-lite test FulfillmentChecklist` (if such a suite exists) → PASS.

- [ ] **Step 7: Commit** — SKIP.

---

### Task 4: 2B — recall-alert guard

**Files:**
- Create: `apps/pharmacy-lite/src/components/pharmacy/RecallAlertBanner.tsx`
- Modify: `apps/pharmacy-lite/src/components/pharmacy/DispensingConfirmationModal.tsx`
- Test: `apps/pharmacy-lite/src/__tests__/recall-alert-banner.test.tsx`

**Interfaces:**
- `RecallAlertBanner({ alerts })` — renders nothing when `alerts` is empty; a prominent red banner listing each recall otherwise (mirrors `AllergyBanner`).

- [ ] **Step 1: Write the failing test**

`apps/pharmacy-lite/src/__tests__/recall-alert-banner.test.tsx`:
```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RecallAlertBanner } from '@/components/pharmacy/RecallAlertBanner'

describe('RecallAlertBanner', () => {
  it('renders nothing when there are no alerts', () => {
    const { container } = render(<RecallAlertBanner alerts={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders a prominent banner listing each recall', () => {
    render(<RecallAlertBanner alerts={[{ recallId: 'r1', description: 'Contamination recall', initiationDate: '2026-01-01', status: 'ongoing' }]} />)
    const banner = screen.getByTestId('recall-banner')
    expect(banner).toHaveAttribute('role', 'alert')
    expect(banner.textContent).toContain('Contamination recall')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F pharmacy-lite test recall-alert-banner`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the banner**

`apps/pharmacy-lite/src/components/pharmacy/RecallAlertBanner.tsx`:
```typescript
'use client'

import { AlertTriangle } from '@ultranos/ui-kit/icons'
import type { RecallAlert } from '@ultranos/shared-types'

/**
 * SAFETY: surfaces active drug recalls at dispense with high prominence
 * (red, not collapsed) — mirrors the AllergyBanner pattern (rule #4).
 */
export function RecallAlertBanner({ alerts }: { alerts: RecallAlert[] }) {
  if (!alerts || alerts.length === 0) return null
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="rounded-xl bg-destructive/10 backdrop-blur-md p-5 shadow-card ring-[0.65px] ring-destructive/40"
      data-testid="recall-banner"
    >
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle size={20} className="text-destructive shrink-0" />
        <span className="text-sm font-bold text-destructive uppercase tracking-wide">
          Active recall{alerts.length > 1 ? 's' : ''}
        </span>
      </div>
      <ul className="space-y-1">
        {alerts.map((a) => (
          <li key={a.recallId} className="text-sm font-semibold text-destructive">
            &bull; {a.description}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Surface recalls in `DispensingConfirmationModal.tsx`**

Add imports:
```typescript
import { useEffect, useState } from 'react'
import { RecallAlertBanner } from './RecallAlertBanner'
import { getRecallAlertsForAtc } from '@/lib/drug-catalog-queries'
import type { RecallAlert } from '@ultranos/shared-types'
```
Inside the component, load recalls for all selected items' ATCs:
```typescript
  const [recalls, setRecalls] = useState<RecallAlert[]>([])
  useEffect(() => {
    let cancelled = false
    void Promise.all(
      items.map((i) => (i.prescription.atc ? getRecallAlertsForAtc(i.prescription.atc) : Promise.resolve([]))),
    ).then((lists) => { if (!cancelled) setRecalls(lists.flat()) })
    return () => { cancelled = true }
  }, [items])
```
Render the banner immediately above the existing `AllergyBanner` block:
```typescript
        <div className="mb-4">
          <RecallAlertBanner alerts={recalls} />
        </div>
        <div className="mb-4">
          <AllergyBanner allergies={patientAllergies} patientName={patientName} />
        </div>
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm -F pharmacy-lite test recall-alert-banner`
Expected: PASS (2 tests). `pnpm -F pharmacy-lite typecheck` → no new errors.

- [ ] **Step 6: Commit** — SKIP.

---

### Task 5: 2C — reference-price card at stock receipt

**Files:**
- Create: `apps/pharmacy-lite/src/components/pharmacy/PriceCard.tsx`
- Modify: `apps/pharmacy-lite/src/components/pharmacy/inventory/ReceiveStockItemRow.tsx`
- Test: `apps/pharmacy-lite/src/__tests__/price-card.test.tsx`

**Interfaces:**
- `PriceCard({ atc, currency })` — async-loads `getReferencePriceForAtc(atc)`; renders nothing when no reference price; otherwise an inline note "Indicative ref: {currency} {min}". Distinct from retail (a muted info chip, not a price input).

- [ ] **Step 1: Write the failing test**

`apps/pharmacy-lite/src/__tests__/price-card.test.tsx`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { render, screen, waitFor } from '@testing-library/react'
import { db } from '@/lib/db'
import { PriceCard } from '@/components/pharmacy/PriceCard'

beforeEach(async () => {
  await db.open(); await db.drugBrandsMirror.clear(); await db.drugBrandPresentationsMirror.clear()
})

describe('PriceCard', () => {
  it('renders nothing when there is no reference price', async () => {
    const { container } = render(<PriceCard atc="X" />)
    await waitFor(() => expect(container.querySelector('[data-testid="price-card"]')).toBeNull())
  })

  it('shows the indicative minimum reference price', async () => {
    await db.drugBrandsMirror.put({ id: 'b1', genericAtcCode: 'J01CA04', brandName: 'Amoxil' } as never)
    await db.drugBrandPresentationsMirror.put({ id: 'p1', brandId: 'b1', referencePrice: 8.25, currency: 'AFN' } as never)
    render(<PriceCard atc="J01CA04" />)
    const card = await waitFor(() => screen.getByTestId('price-card'))
    expect(card.textContent).toContain('AFN')
    expect(card.textContent).toContain('8.25')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F pharmacy-lite test price-card`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the card**

`apps/pharmacy-lite/src/components/pharmacy/PriceCard.tsx`:
```typescript
'use client'

import { useEffect, useState } from 'react'
import { getReferencePriceForAtc } from '@/lib/drug-catalog-queries'

/** Indicative reference price for a generic (from brand presentations) — distinct from retail. */
export function PriceCard({ atc }: { atc?: string }) {
  const [ref, setRef] = useState<{ min: number; currency: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!atc) { setRef(null); return }
    void getReferencePriceForAtc(atc).then((r) => { if (!cancelled) setRef(r) }).catch(() => { if (!cancelled) setRef(null) })
    return () => { cancelled = true }
  }, [atc])

  if (!ref) return null
  return (
    <span
      data-testid="price-card"
      className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
      title="Indicative trade price — not the retail price"
    >
      Indicative ref: {ref.currency} {ref.min.toFixed(2)}
    </span>
  )
}
```

- [ ] **Step 4: Surface it in `ReceiveStockItemRow.tsx`**

Add the import:
```typescript
import { PriceCard } from '@/components/pharmacy/PriceCard'
```
Render it near the price inputs, passing the catalog item's ATC (the row has `item.catalogItem.atcCode`):
```typescript
        <PriceCard atc={item.catalogItem.atcCode} />
```
(Place it adjacent to the selling-price input so the pharmacist sees the indicative reference beside their own price.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm -F pharmacy-lite test price-card`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit** — SKIP.

---

### Task 6: 2D (offline) — pharmacist interaction recheck at dispense

**Files:**
- Create: `apps/pharmacy-lite/src/lib/dispense-interaction-check.ts`
- Modify: `apps/pharmacy-lite/src/components/pharmacy/DispensingConfirmationModal.tsx`
- Test: `apps/pharmacy-lite/src/__tests__/dispense-interaction-check.test.ts`

**Interfaces:**
- `runDispenseInteractionCheck(medDisplays: string[], allergies: string[]): Promise<InteractionStatus>` — maps the `@ultranos/drug-db` summary to the `InteractionCheckBanner`'s `InteractionStatus`. Uses `resolveDrugAdapter()`; `null` adapter → `{ state: 'unavailable' }` (Rule #3). Checks each med against the others (intra-prescription) + allergies.

- [ ] **Step 1: Write the failing test**

`apps/pharmacy-lite/src/__tests__/dispense-interaction-check.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '@/lib/db'
import { runDispenseInteractionCheck } from '@/lib/dispense-interaction-check'
import type { DrugEntry } from '@ultranos/drug-catalog-sync'

const warfarin = (): DrugEntry =>
  ({ atcCode: 'B01AA03', innName: 'Warfarin', brandNames: [], doseForms: [], therapeuticClass: '',
     interactions: [{ drugAtcCode: 'N02BA01', drugName: 'Aspirin', severity: 'MAJOR', mechanism: 'Bleeding risk' }] }) as unknown as DrugEntry

beforeEach(async () => {
  await db.open(); await db.drugCatalogMirror.clear(); await db.drugCatalogSyncMeta.clear()
})

describe('runDispenseInteractionCheck', () => {
  it('returns unavailable when the mirror is empty (never CLEAR — rule #3)', async () => {
    const status = await runDispenseInteractionCheck(['Warfarin', 'Aspirin'], [])
    expect(status.state).toBe('unavailable')
  })

  it('flags a MAJOR intra-prescription interaction as contraindicated/blocking', async () => {
    await db.drugCatalogMirror.put(warfarin() as never)
    await db.drugCatalogSyncMeta.put({ key: 'lastSyncAt', value: new Date().toISOString() })
    const status = await runDispenseInteractionCheck(['Warfarin', 'Aspirin'], [])
    expect(status.state).toBe('contraindicated')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F pharmacy-lite test dispense-interaction-check`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the check**

`apps/pharmacy-lite/src/lib/dispense-interaction-check.ts`:
```typescript
import { checkInteractions } from '@ultranos/drug-db'
import type { InteractionResult } from '@ultranos/drug-db'
import type { FhirAllergyIntolerance } from '@ultranos/shared-types'
import { resolveDrugAdapter } from './mirror-drug-adapter'
import type { InteractionStatus } from '@/components/pharmacy/InteractionCheckBanner'

function toAllergyResources(allergies: string[]): FhirAllergyIntolerance[] {
  return allergies.map((substance) => ({ code: { text: substance }, _ultranos: { substanceFreeText: substance } }) as unknown as FhirAllergyIntolerance)
}

function describe(i: InteractionResult): string {
  return `${i.drugA} + ${i.drugB}: ${i.description}`
}

/**
 * Re-check the prescribed meds against each other + the patient's local allergies.
 * Rule #3: an empty/unavailable mirror yields 'unavailable' — never 'clear'.
 */
export async function runDispenseInteractionCheck(
  medDisplays: string[],
  allergies: string[],
): Promise<InteractionStatus> {
  const adapter = await resolveDrugAdapter()
  if (!adapter) return { state: 'unavailable', reason: 'Drug data not yet synced to this device.' }

  const allergyResources = toAllergyResources(allergies)
  const all: InteractionResult[] = []
  let worst: 'CLEAR' | 'WARNING' | 'BLOCKED' | 'UNAVAILABLE' = 'CLEAR'

  for (let i = 0; i < medDisplays.length; i++) {
    const others = medDisplays.filter((_, j) => j !== i)
    const summary = await checkInteractions(medDisplays[i]!, others, { activeAllergies: allergyResources }, adapter)
    if (summary.result === 'UNAVAILABLE') return { state: 'unavailable', reason: 'Interaction check unavailable.' }
    if (summary.result === 'BLOCKED') worst = 'BLOCKED'
    else if (summary.result === 'WARNING' && worst !== 'BLOCKED') worst = 'WARNING'
    all.push(...summary.interactions)
  }

  const messages = Array.from(new Set(all.map(describe)))
  if (worst === 'BLOCKED') return { state: 'contraindicated', interactions: messages }
  if (worst === 'WARNING') return { state: 'warning', interactions: messages }
  return { state: 'clear' }
}
```

- [ ] **Step 4: Integrate into `DispensingConfirmationModal.tsx`**

Add imports:
```typescript
import { InteractionCheckBanner, type InteractionStatus } from './InteractionCheckBanner'
import { runDispenseInteractionCheck } from '@/lib/dispense-interaction-check'
```
Run the check on mount and block confirmation when contraindicated:
```typescript
  const [interaction, setInteraction] = useState<InteractionStatus>({ state: 'checking' })
  useEffect(() => {
    let cancelled = false
    const meds = items.map((i) => i.prescription.medN)
    void runDispenseInteractionCheck(meds, patientAllergies ?? []).then((s) => { if (!cancelled) setInteraction(s) })
    return () => { cancelled = true }
  }, [items, patientAllergies])

  const blockedByInteraction = interaction.state === 'contraindicated'
```
Render the banner under the recall + allergy banners:
```typescript
        <div className="mb-4">
          <InteractionCheckBanner status={interaction} />
        </div>
```
Update the confirm button's `disabled` to also block on a contraindication:
```typescript
            disabled={!acknowledged || blockedByInteraction}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm -F pharmacy-lite test dispense-interaction-check`
Expected: PASS (2 tests). `pnpm -F pharmacy-lite typecheck` → no new errors.

- [ ] **Step 6: Commit** — SKIP.

---

### Task 7: Phase verification

- [ ] **Step 1: Run all new Features suites**

Run:
```bash
pnpm -F pharmacy-lite test fulfillment-substitution drug-catalog-queries brand-substitution-picker recall-alert-banner price-card dispense-interaction-check
```
Expected: all green.

- [ ] **Step 2: Full suite + typecheck (no new regressions)**

Run:
```bash
pnpm -F pharmacy-lite test
pnpm -F pharmacy-lite typecheck
```
Expected: no NEW failures vs. the pre-existing baseline; no new type errors.

- [ ] **Step 3: Commit** — SKIP (leave all changes in the working tree for review/staging).

---

## Self-Review

**1. Spec coverage:** 2A substitution (Tasks 1–3) ✓; 2B recall guard (Task 4) ✓; 2C PriceCard (Task 5) ✓; 2D offline recheck with block-on-contraindication (Task 6) ✓. Deferred: 2D's Hub active-meds fetch (separate follow-up — needs the new PHARMACIST endpoint).

**2. Placeholder scan:** No TBD/TODO; every code step is complete.

**3. Type consistency:** `BrandSelection` (Task 3) matches `setBrandSelection` (Task 1). `getLocalBrandsByAtc`/`getRecallAlertsForAtc`/`getReferencePriceForAtc` (Task 2) consumed by Tasks 3/4/5. `InteractionStatus` (from `InteractionCheckBanner`) is the return type of `runDispenseInteractionCheck` (Task 6). `resolveDrugAdapter` (Foundation) returns `null` on empty mirror → Task 6 maps to `unavailable` (Rule #3). `prescription.atc` (Foundation QR field) drives Tasks 3/4. `RecallAlert` shape from `@ultranos/shared-types`.

**Safety check:** Rule #3 preserved end-to-end — empty mirror → `unavailable`, never `clear`; BLOCKED disables the dispense confirm. Rule #4 — recall + allergy banners render prominently above the item list.

---

## Execution Handoff

Features (client-only) plan complete. Execution: **subagent-driven, no commits**. After this lands + is reviewed, the final Phase 2 unit is the **PHARMACIST active-meds Hub endpoint** (`medicationStatement.listActiveForPharmacist`, role-scoped + audited) wired into `runDispenseInteractionCheck` for the online cross-check (Decision 2).
