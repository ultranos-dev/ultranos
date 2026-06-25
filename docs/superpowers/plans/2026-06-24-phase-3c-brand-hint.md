# Phase 3C — OPD brand hint on the prescription QR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an OPD clinician optionally express a **preferred brand** when prescribing; carry it through the signed QR to Pharmacy-Lite, where it pre-fills/surfaces as the "prescribed brand" in the fulfillment substitution flow. Completes the last deferred integration item (3C).

**Architecture:** The brand is carried as a **second FHIR coding** (`system: 'urn:ultranos:brand'`) on `medicationCodeableConcept` — so it rides the existing FHIR→`CompactRx`→signed-QR→`VerifiedPrescription` path with **no shared-types change** (the primary `coding[0]` stays the ATC). OPD's brand picker reads `drugBrandsMirror` (already synced in Phase 1). Pharmacy initializes the fulfillment item's brand from the hint and shows a "Prescribed: X" label.

**Tech Stack:** Next.js PWAs, TypeScript, Dexie, Vitest (+ fake-indexeddb / RTL).

## Decisions (locked)
- **Brand carried via a 2nd coding** (`urn:ultranos:brand`), not a new `_ultranos` field — avoids touching the shared FHIR Zod type; `coding[0]` remains the ATC for `med`/`atc`.
- **Optional + non-blocking:** the brand picker defaults to "— Any brand —"; omitting it changes nothing (backward compatible with existing prescriptions).
- **Hint, not a mandate:** Pharmacy pre-fills the hinted brand but the pharmacist can still substitute (2A unchanged).

## Global Constraints
- Backward compatible: prescriptions without a brand hint produce identical QR payloads (no `brand` key).
- Tests: `pnpm -F opd-lite test <pattern>`, `pnpm -F pharmacy-lite test <pattern>`.
- ⛔ No `git` state-changing commands in the implementer (no stash/reset/checkout/add/commit) — leave changes in the working tree.

---

### Task 1: OPD brand-names reader

**Files:**
- Modify: `apps/opd-lite/src/lib/drug-entry.ts` (add `getBrandNamesForAtc`)
- Test: `apps/opd-lite/src/__tests__/drug-entry.test.ts` (add a case)

**Interfaces:**
- `getBrandNamesForAtc(atc: string): Promise<string[]>` — distinct, sorted brand names from `drugBrandsMirror` by `genericAtcCode`; `[]` when none/empty.

- [ ] **Step 1: Write the failing test** — add to `apps/opd-lite/src/__tests__/drug-entry.test.ts`:
```typescript
import { getBrandNamesForAtc } from '@/lib/drug-entry'

describe('getBrandNamesForAtc', () => {
  it('returns distinct sorted brand names for an ATC', async () => {
    await db.drugBrandsMirror.clear()
    await db.drugBrandsMirror.bulkPut([
      { id: 'b1', genericAtcCode: 'J01CA04', brandName: 'Moxil' },
      { id: 'b2', genericAtcCode: 'J01CA04', brandName: 'Amoxil' },
      { id: 'b3', genericAtcCode: 'C07AB07', brandName: 'Concor' },
    ] as never[])
    expect(await getBrandNamesForAtc('J01CA04')).toEqual(['Amoxil', 'Moxil'])
    expect(await getBrandNamesForAtc('')).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `pnpm -F opd-lite test drug-entry` → FAIL (export missing).

- [ ] **Step 3: Implement** — append to `apps/opd-lite/src/lib/drug-entry.ts`:
```typescript
/** Distinct, sorted brand names marketed for a generic ATC, from the on-device brands mirror. */
export async function getBrandNamesForAtc(atc: string): Promise<string[]> {
  if (!atc) return []
  const brands = await db.drugBrandsMirror.where('genericAtcCode').equals(atc).toArray()
  return Array.from(new Set(brands.map((b) => b.brandName))).sort()
}
```

- [ ] **Step 4: Run to verify it passes** — `pnpm -F opd-lite test drug-entry` → PASS.

- [ ] **Step 5: Commit** — SKIP.

---

### Task 2: Carry the brand hint through form → FHIR → CompactRx

**Files:**
- Modify: `apps/opd-lite/src/lib/prescription-config.ts` (form field)
- Modify: `apps/opd-lite/src/lib/medication-request-mapper.ts` (2nd coding)
- Modify: `apps/opd-lite/src/lib/compress-prescription.ts` (read brand → `CompactRx.brand`)
- Test: `apps/opd-lite/src/__tests__/compress-prescription-atc.test.ts` (add a case)

**Interfaces:**
- `PrescriptionFormData.brandHint?: string`; `CompactRx.brand?: string`.

- [ ] **Step 1: Write the failing test** — add to `apps/opd-lite/src/__tests__/compress-prescription-atc.test.ts`:
```typescript
  it('carries a brand hint from a urn:ultranos:brand coding', () => {
    const r = {
      id: 'rx-2', resourceType: 'MedicationRequest', status: 'active', intent: 'order',
      medicationCodeableConcept: {
        coding: [
          { system: 'urn:ultranos:formulary', code: 'J01CA04', display: 'Amoxicillin' },
          { system: 'urn:ultranos:brand', code: 'Amoxil', display: 'Amoxil' },
        ],
        text: 'Amoxicillin 500mg (Capsule)',
      },
      subject: { reference: 'Patient/p-1' }, requester: { reference: 'Practitioner/dr-1' },
      authoredOn: '2026-06-24T00:00:00.000Z',
      dosageInstruction: [{ sequence: 1, text: '1', doseAndRate: [{ doseQuantity: { value: 1, unit: 'capsule' } }] }],
      dispenseRequest: { expectedSupplyDuration: { value: 7, unit: 'd' } },
    } as unknown as import('@ultranos/shared-types').FhirMedicationRequestZod
    const compact = JSON.parse(compressPrescription([r]))
    expect(compact[0].brand).toBe('Amoxil')
    expect(compact[0].atc).toBe('J01CA04')
    expect(compact[0].med).toBe('J01CA04')
  })
```

- [ ] **Step 2: Run to verify it fails** — `pnpm -F opd-lite test compress-prescription-atc` → FAIL (`brand` undefined).

- [ ] **Step 3: Implement**

In `apps/opd-lite/src/lib/prescription-config.ts`, add to `PrescriptionFormData` (after `notes`):
```typescript
  brandHint?: string
```
(`EMPTY_PRESCRIPTION_FORM` needs no change — the field is optional.)

In `apps/opd-lite/src/lib/medication-request-mapper.ts`, replace the `coding` array (lines 53–59) so a brand coding is appended when `form.brandHint` is set:
```typescript
      coding: [
        {
          system: 'urn:ultranos:formulary',
          code: form.medicationCode,
          display: form.medicationDisplay,
        },
        ...(form.brandHint
          ? [{ system: 'urn:ultranos:brand', code: form.brandHint, display: form.brandHint }]
          : []),
      ],
```

In `apps/opd-lite/src/lib/compress-prescription.ts`, add `brand?` to `CompactRx` (after `atc?`):
```typescript
  brand?: string   // clinician's preferred brand (Phase 3C), from the urn:ultranos:brand coding
```
And in the map (after the `atc` block), read the brand coding:
```typescript
    const brandCoding = rx.medicationCodeableConcept.coding?.find((c) => c.system === 'urn:ultranos:brand')
    if (brandCoding?.code) result.brand = brandCoding.code
```

- [ ] **Step 4: Run to verify it passes** — `pnpm -F opd-lite test compress-prescription-atc` → PASS. Also `pnpm -F opd-lite typecheck` → no new errors.

- [ ] **Step 5: Commit** — SKIP.

---

### Task 3: OPD brand picker in PrescriptionEntry

**Files:**
- Modify: `apps/opd-lite/src/components/clinical/PrescriptionEntry.tsx`
- Test: `apps/opd-lite/src/__tests__/PrescriptionEntry-decision-support.test.tsx` (add a case)

**Interfaces:**
- After medication selection, an optional brand `<select>` (only when brands exist for the ATC) sets `form.brandHint`.

- [ ] **Step 1: Write the failing test** — add to `apps/opd-lite/src/__tests__/PrescriptionEntry-decision-support.test.tsx`:
```typescript
  it('offers a brand picker and records the brand hint', async () => {
    await db.drugBrandsMirror.clear()
    await db.drugBrandsMirror.put({ id: 'b1', genericAtcCode: 'J01CA04', brandName: 'Amoxil' } as never)
    let submitted: import('@/lib/prescription-config').PrescriptionFormData | null = null
    render(<PrescriptionEntry onSubmit={(f) => { submitted = f }} patientSex="male" patientAge={40} />)
    fireEvent.change(screen.getByLabelText(/Search medications/i), { target: { value: 'Amox' } })
    fireEvent.mouseDown(await waitFor(() => screen.getAllByRole('option')[0]!))
    const brandSelect = await waitFor(() => screen.getByTestId('brand-hint-select'))
    fireEvent.change(brandSelect, { target: { value: 'Amoxil' } })
    fireEvent.click(screen.getByRole('button', { name: /Add Prescription/i }))
    await waitFor(() => expect(submitted).not.toBeNull())
    expect(submitted!.brandHint).toBe('Amoxil')
  })
```

- [ ] **Step 2: Run to verify it fails** — `pnpm -F opd-lite test PrescriptionEntry-decision-support` → FAIL (no brand select).

- [ ] **Step 3: Implement** — in `PrescriptionEntry.tsx`:

Add the import:
```typescript
import { getBrandNamesForAtc } from '@/lib/drug-entry'
```
Add state (with the other `useState`s):
```typescript
  const [brandOptions, setBrandOptions] = useState<string[]>([])
```
Load brands when the selected medication changes (add an effect after the existing effects, ~line 222):
```typescript
  useEffect(() => {
    let cancelled = false
    if (!form.medicationCode) { setBrandOptions([]); return }
    void getBrandNamesForAtc(form.medicationCode).then((b) => { if (!cancelled) setBrandOptions(b) })
    return () => { cancelled = true }
  }, [form.medicationCode])
```
Render the picker (only when brands exist) — place it right after the `DrugSafetyPanel` block added in Phase 3:
```typescript
      {hasMedication && brandOptions.length > 0 && (
        <div>
          <label htmlFor="brand-hint" className="mb-1 block text-sm font-semibold text-foreground">
            Preferred brand (optional)
          </label>
          <select
            id="brand-hint"
            data-testid="brand-hint-select"
            value={form.brandHint ?? ''}
            onChange={(e) => setForm((prev) => ({ ...prev, brandHint: e.target.value || undefined }))}
            disabled={disabled}
            className={inputClasses}
            aria-label="Preferred brand"
          >
            <option value="">— Any brand —</option>
            {brandOptions.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
      )}
```
Ensure `handleClearMedication` also clears the hint — add `brandHint: undefined` is implicit via `EMPTY_PRESCRIPTION_FORM` (it resets the whole form), so no change needed.

- [ ] **Step 4: Run to verify it passes** — `pnpm -F opd-lite test PrescriptionEntry-decision-support` → PASS. Existing PrescriptionEntry suite still green: `pnpm -F opd-lite test PrescriptionEntry`.

- [ ] **Step 5: Commit** — SKIP.

---

### Task 4: Pharmacy — receive + surface the prescribed brand

**Files:**
- Modify: `apps/pharmacy-lite/src/lib/prescription-verify.ts` (`VerifiedPrescription.brand?`)
- Modify: `apps/pharmacy-lite/src/stores/fulfillment-store.ts` (seed `brandName` from `rx.brand`)
- Modify: `apps/pharmacy-lite/src/components/pharmacy/FulfillmentChecklist.tsx` (show "Prescribed: X")
- Test: `apps/pharmacy-lite/src/__tests__/fulfillment-substitution.test.ts` (add a case)

**Interfaces:**
- `VerifiedPrescription.brand?: string`; the fulfillment item's `brandName` defaults to `rx.brand` when present.

- [ ] **Step 1: Write the failing test** — add to `apps/pharmacy-lite/src/__tests__/fulfillment-substitution.test.ts`:
```typescript
  it('seeds the fulfillment brand from a prescribed brand hint', () => {
    const withBrand = { ...rx('rx-2'), brand: 'Amoxil' }
    useFulfillmentStore.getState().loadPrescriptions([withBrand as never], undefined, undefined)
    const item = useFulfillmentStore.getState().items.find((i) => i.prescription.id === 'rx-2')!
    expect(item.brandName).toBe('Amoxil')
  })
```
(Adapt to the actual `loadPrescriptions` signature — check the store.)

- [ ] **Step 2: Run to verify it fails** — `pnpm -F pharmacy-lite test fulfillment-substitution` → FAIL (brandName empty).

- [ ] **Step 3: Implement**

In `apps/pharmacy-lite/src/lib/prescription-verify.ts`, add to the `VerifiedPrescription` interface (after `atc?`):
```typescript
  brand?: string    // clinician's preferred brand carried from the QR (Phase 3C)
```

In `apps/pharmacy-lite/src/stores/fulfillment-store.ts`, where `loadPrescriptions` maps prescriptions to items (the `brandName: ''` line), seed from the hint:
```typescript
      brandName: rx.brand ?? '',
```

In `apps/pharmacy-lite/src/components/pharmacy/FulfillmentChecklist.tsx`, show the prescribed brand when present (inside the selected-item block, near the brand picker):
```typescript
                    {item.prescription.brand && (
                      <p className="text-xs text-muted-foreground">
                        Prescribed brand: <span className="font-semibold text-foreground">{item.prescription.brand}</span>
                      </p>
                    )}
```

- [ ] **Step 4: Run to verify it passes** — `pnpm -F pharmacy-lite test fulfillment-substitution` → PASS. `pnpm -F pharmacy-lite typecheck` → no new errors.

- [ ] **Step 5: Commit** — SKIP.

---

### Task 5: Phase verification

- [ ] **Step 1: All affected suites**
```bash
pnpm -F opd-lite test drug-entry compress-prescription-atc PrescriptionEntry
pnpm -F pharmacy-lite test fulfillment-substitution
```
Expected: all green.

- [ ] **Step 2: Full suites + typecheck (no new regressions)**
```bash
pnpm -F opd-lite test
pnpm -F opd-lite typecheck
pnpm -F pharmacy-lite test
pnpm -F pharmacy-lite typecheck
```
Expected: no NEW failures vs. baseline; no new type errors.

- [ ] **Step 3: Commit** — SKIP (leave changes in the working tree for review/staging).

---

## Self-Review
**Coverage:** brand reader (T1) → form/FHIR/CompactRx carry (T2) → OPD picker (T3) → Pharmacy receive+surface (T4). Backward compatible (optional throughout; no `brand` key when unset). No shared-types change (2nd coding). 
**Types:** `CompactRx.brand`/`VerifiedPrescription.brand` are app-local, flow via JSON. `form.brandHint` optional → existing callers unaffected. `getBrandNamesForAtc` reads the existing `drugBrandsMirror`.

## Execution Handoff
Final integration item. Execution: **subagent-driven, no commits, no git state-changing commands**. After this, the drug-catalog app integration is 100% complete (Phases 0–3 + 3C); only ETL data-population remains.
