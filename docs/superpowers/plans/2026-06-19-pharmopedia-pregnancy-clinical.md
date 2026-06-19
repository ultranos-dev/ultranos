# Pharmopedia Pregnancy-Clinical (PLLR) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the deprecated single-letter `pregnancyCategory` field with a PLLR-structured `pregnancyClinical` object (pregnancy / lactation / reproductivePotential / legacyCategory) end-to-end: shared-types → Hub Postgres → ETL → Hub API → Pharmopedia UI → i18n → tests.

**Architecture:** A vertical slice. `DrugPregnancyClinical` is added in `@ultranos/shared-types` (the canonical type), then propagated to: the Hub `drug_catalog` table (a `TEXT` column becomes a `JSONB` column via a tracked migration), the standalone ETL package (its own internal types + the openFDA adapter that now extracts structured SPL subsections), the Hub API row→entity mapper, and the Pharmopedia clinical section renderer + 4 i18n locales. Implements decision **D5/§6** of [`2026-06-19-pharmopedia-rxnav-enrichment-design.md`](../specs/2026-06-19-pharmopedia-rxnav-enrichment-design.md).

**Tech Stack:** TypeScript, pnpm workspaces, Vitest, Supabase (Postgres) via the Supabase MCP, Expo/React Native (Pharmopedia), i18n locale objects.

## Global Constraints

- **shared-types is consumed via `dist/`** (`"main": "./dist/index.js"`). After editing `packages/shared-types/src/**`, you MUST run `pnpm -F @ultranos/shared-types build` or dependent packages won't see the change.
- **All DB operations go through the Supabase MCP** (CLAUDE.md) — `apply_migration` for DDL, `execute_sql` for verification. Never run `psql`. The migration file is still committed to `supabase/migrations/` for repo tracking.
- **Pregnancy clinical subfields are plain `string`** (not `DrugLocalizedText`) — consistent with the other Tier-2 clinical fields (`contraindications`, `mechanismOfAction`, `renalAdjustment`). Localization is handled by the separate translation layer.
- **Keep the legacy `drug.clinical.pregnancyCategory` i18n key** (it now labels the optional `legacyCategory` badge). Add `lactation` + `reproductivePotential` keys.
- **Non-English i18n strings in this plan are first-pass** and must be verified by a native clinical translator before release (per the localization decision in the design spec).
- **Git (CLAUDE.md):** do NOT run `git add` / `git commit` without explicit user instruction. Treat each "Commit" step as a checkpoint to request approval, not an autonomous action.
- **Data note:** the migration DROPs `pregnancy_category` (lossy). This is acceptable — the field is repopulated by ETL re-enrichment (design §6).

---

### Task 1: shared-types — add `DrugPregnancyClinical`, swap the Tier-2 field

**Files:**
- Modify: `packages/shared-types/src/fhir/drug-catalog.ts`

**Interfaces:**
- Produces: `DrugPregnancyClinical { pregnancy?: string; lactation?: string; reproductivePotential?: string; legacyCategory?: string }`; `DrugEntryTier2.pregnancyClinical?: DrugPregnancyClinical` (replaces `pregnancyCategory?: string`).

- [ ] **Step 1: Add the `DrugPregnancyClinical` interface**

In `packages/shared-types/src/fhir/drug-catalog.ts`, insert this block immediately **after** the `DrugPharmacokinetics` interface (which ends at line 42, before `RecallAlert`):

```typescript
/** Structured clinical pregnancy/lactation info, aligned to the FDA PLLR label rule. */
export interface DrugPregnancyClinical {
  pregnancy?: string             // PLLR 8.1 — Pregnancy
  lactation?: string             // PLLR 8.2 — Lactation
  reproductivePotential?: string // PLLR 8.3 — Females & males of reproductive potential
  legacyCategory?: string        // legacy A/B/C/D/X letter, when a source still carries one
}
```

- [ ] **Step 2: Swap the field in `DrugEntryTier2`**

In the same file, replace line 90:

```typescript
  pregnancyCategory?: string
```

with:

```typescript
  pregnancyClinical?: DrugPregnancyClinical
```

- [ ] **Step 3: Build shared-types and verify it compiles**

Run: `pnpm -F @ultranos/shared-types build`
Expected: `tsc` exits 0, `packages/shared-types/dist/` regenerated with the new type. (Monorepo-wide typecheck will fail until Tasks 4–5 land — that is expected.)

- [ ] **Step 4: Commit** *(checkpoint — request approval first)*

```bash
git add packages/shared-types/src/fhir/drug-catalog.ts
git commit -m "feat(shared-types): add DrugPregnancyClinical (PLLR), replace pregnancyCategory"
```

---

### Task 2: ETL — structured pregnancy extraction (openFDA adapter + types + normalizer)

**Files:**
- Modify: `scripts/etl/drug-catalog/__tests__/openfda.test.ts`
- Modify: `scripts/etl/drug-catalog/types.ts`
- Modify: `scripts/etl/drug-catalog/sources/openfda.ts`
- Modify: `scripts/etl/drug-catalog/normalizer.ts`

**Interfaces:**
- Consumes: openFDA `drug/label` SPL fields `pregnancy[]`, `nursing_mothers[]`.
- Produces: `SourceDrugData.pregnancyClinical?` and `NormalizedDrugRow.pregnancy_clinical?`, both shaped `{ pregnancy?, lactation?, reproductivePotential?, legacyCategory? }`. (The ETL package has its own internal types — it does NOT import `@ultranos/shared-types`, so Task 1 is not a prerequisite here.)

- [ ] **Step 1: Update the failing test**

In `scripts/etl/drug-catalog/__tests__/openfda.test.ts`, add a `nursing_mothers` line to the `AMOXICILLIN_RESPONSE` mock (it currently ends the result object after `mechanism_of_action`). Change the `pregnancy` block of the mock to:

```typescript
    pregnancy: ['Pregnancy Category B. Animal reproduction studies.'],
    nursing_mothers: ['Amoxicillin is excreted in breast milk. Caution advised.'],
    mechanism_of_action: ['Amoxicillin is a beta-lactam antibiotic that inhibits cell wall synthesis.'],
```

Then replace the existing `it('extracts pregnancy category letter', ...)` test (lines 52–61) with:

```typescript
  it('extracts structured pregnancy clinical info', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => AMOXICILLIN_RESPONSE,
    } as Response)

    const result = await fetchFromOpenFda('J01CA04', 'amoxicillin')

    expect(result.pregnancyClinical?.legacyCategory).toBe('B')
    expect(result.pregnancyClinical?.pregnancy).toContain('Animal reproduction studies')
    expect(result.pregnancyClinical?.lactation).toContain('breast milk')
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F @ultranos/drug-catalog-etl test __tests__/openfda.test.ts`
Expected: FAIL — `result.pregnancyClinical` is undefined / type error on `pregnancyCategory` removal.

- [ ] **Step 3: Update ETL types**

In `scripts/etl/drug-catalog/types.ts`, in `SourceDrugData` replace line 55:

```typescript
  pregnancyCategory?: string
```

with:

```typescript
  pregnancyClinical?: {
    pregnancy?: string
    lactation?: string
    reproductivePotential?: string
    legacyCategory?: string
  }
```

In `NormalizedDrugRow` replace line 92:

```typescript
  pregnancy_category?: string
```

with:

```typescript
  pregnancy_clinical?: {
    pregnancy?: string
    lactation?: string
    reproductivePotential?: string
    legacyCategory?: string
  }
```

- [ ] **Step 4: Update the openFDA adapter**

In `scripts/etl/drug-catalog/sources/openfda.ts`, add `nursing_mothers` to the `OpenFdaResult` interface (after `pregnancy?: string[]`):

```typescript
  pregnancy?: string[]
  nursing_mothers?: string[]
```

Replace the extraction lines 62–63:

```typescript
    const pregnancyCategoryMatch = (r.pregnancy?.[0] ?? '').match(/Category ([A-DX])/)
    const pregnancyCategory = pregnancyCategoryMatch?.[1]
```

with:

```typescript
    const pregnancyText = r.pregnancy?.[0]?.trim()
    const lactationText = r.nursing_mothers?.[0]?.trim()
    const legacyCategory = (r.pregnancy?.[0] ?? '').match(/Category ([A-DX])/)?.[1]
    const pregnancyClinical =
      pregnancyText || lactationText || legacyCategory
        ? {
            ...(pregnancyText ? { pregnancy: pregnancyText } : {}),
            ...(lactationText ? { lactation: lactationText } : {}),
            ...(legacyCategory ? { legacyCategory } : {}),
          }
        : undefined
```

Then replace the return-object line 74:

```typescript
      pregnancyCategory,
```

with:

```typescript
      pregnancyClinical,
```

- [ ] **Step 5: Update the normalizer**

In `scripts/etl/drug-catalog/normalizer.ts`, replace line 48:

```typescript
    pregnancy_category: firstDefined(...sorted.map(s => s.pregnancyCategory)),
```

with:

```typescript
    pregnancy_clinical: firstDefined(...sorted.map(s => s.pregnancyClinical)),
```

- [ ] **Step 6: Run the full ETL test suite to verify it passes**

Run: `pnpm -F @ultranos/drug-catalog-etl test`
Expected: all tests PASS (openfda includes the new structured-pregnancy test).

- [ ] **Step 7: Commit** *(checkpoint)*

```bash
git add scripts/etl/drug-catalog/types.ts scripts/etl/drug-catalog/sources/openfda.ts scripts/etl/drug-catalog/normalizer.ts scripts/etl/drug-catalog/__tests__/openfda.test.ts
git commit -m "feat(etl): extract structured pregnancyClinical (PLLR) from openFDA SPL"
```

---

### Task 3: Hub Postgres migration — `pregnancy_category` → `pregnancy_clinical jsonb`

**Files:**
- Create: `supabase/migrations/037_drug_catalog_pregnancy_clinical.sql`

**Interfaces:**
- Produces: `drug_catalog.pregnancy_clinical JSONB NOT NULL DEFAULT '{}'`; removes `drug_catalog.pregnancy_category`.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/037_drug_catalog_pregnancy_clinical.sql`:

```sql
-- 037: Replace the PLLR-deprecated single-letter pregnancy_category with a
-- structured pregnancy_clinical JSONB column
-- ({ pregnancy, lactation, reproductivePotential, legacyCategory }).
-- Lossy by design — repopulated by ETL re-enrichment.

ALTER TABLE drug_catalog DROP COLUMN IF EXISTS pregnancy_category;
ALTER TABLE drug_catalog ADD COLUMN IF NOT EXISTS pregnancy_clinical JSONB NOT NULL DEFAULT '{}';
```

- [ ] **Step 2: Apply the migration via the Supabase MCP**

Use the `mcp__plugin_supabase_supabase__apply_migration` tool with:
- `name`: `drug_catalog_pregnancy_clinical`
- `query`: the SQL body from Step 1.

Expected: migration applies without error.

- [ ] **Step 3: Verify the schema change**

Use `mcp__plugin_supabase_supabase__execute_sql` with:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'drug_catalog'
  AND column_name IN ('pregnancy_category', 'pregnancy_clinical');
```

Expected: one row — `pregnancy_clinical | jsonb`; `pregnancy_category` absent.

- [ ] **Step 4: Commit** *(checkpoint)*

```bash
git add supabase/migrations/037_drug_catalog_pregnancy_clinical.sql
git commit -m "feat(db): replace drug_catalog.pregnancy_category with pregnancy_clinical jsonb"
```

---

### Task 4: Hub API — map `pregnancy_clinical` into the Tier-2 entity

**Files:**
- Modify: `apps/hub-api/src/services/drug-catalog.service.ts`

**Interfaces:**
- Consumes: `DrugPregnancyClinical` from `@ultranos/shared-types` (Task 1 — rebuild required); `row.pregnancy_clinical` JSONB (Task 3).
- Produces: `DrugEntryTier2.pregnancyClinical` on the scoped entity; updated `ETL_PROTECTED_FIELDS`.

- [ ] **Step 1: Add the type import**

In `apps/hub-api/src/services/drug-catalog.service.ts`, add `DrugPregnancyClinical` to the import block (lines 1–12), e.g. after `DrugPharmacokinetics,`:

```typescript
  DrugPharmacokinetics,
  DrugPregnancyClinical,
```

- [ ] **Step 2: Update the Tier-2 row mapping**

Replace line 65:

```typescript
    pregnancyCategory: row.pregnancy_category as string | undefined,
```

with:

```typescript
    pregnancyClinical: (row.pregnancy_clinical ?? undefined) as DrugPregnancyClinical | undefined,
```

- [ ] **Step 3: Update `ETL_PROTECTED_FIELDS`**

In the `ETL_PROTECTED_FIELDS` set (lines 85–93), replace `'pregnancy_category'` with `'pregnancy_clinical'`:

```typescript
    'contraindications', 'interactions', 'pregnancy_clinical', 'administration_notes',
```

- [ ] **Step 4: Rebuild shared-types (if not already) and typecheck hub-api**

Run: `pnpm -F @ultranos/shared-types build` then `pnpm -F hub-api typecheck`
(If `hub-api` has no `typecheck` script, run `pnpm -F hub-api build`.)
Expected: no type errors referencing `pregnancyCategory` / `pregnancy_clinical`.

- [ ] **Step 5: Run hub-api tests**

Run: `pnpm -F hub-api test`
Expected: PASS (no regressions; the drug-catalog service scoping tests still pass).

- [ ] **Step 6: Commit** *(checkpoint)*

```bash
git add apps/hub-api/src/services/drug-catalog.service.ts
git commit -m "feat(hub-api): map pregnancy_clinical into Tier-2 drug entity"
```

---

### Task 5: Pharmopedia — render PLLR subsections + i18n + test fixtures

**Files:**
- Modify: `apps/pharmopedia/src/__tests__/drug-clinical-section.test.tsx`
- Modify: `apps/pharmopedia/src/components/DrugDetail/drug-detail-sections.tsx`
- Modify: `apps/pharmopedia/src/i18n/locales/en.ts`
- Modify: `apps/pharmopedia/src/i18n/locales/ar.ts`
- Modify: `apps/pharmopedia/src/i18n/locales/prs.ts`
- Modify: `apps/pharmopedia/src/i18n/locales/ps.ts`
- Modify: `apps/pharmopedia/src/__tests__/drug-detail-sections.test.tsx`
- Modify: `apps/pharmopedia/src/__tests__/drug-detail-rtl.test.tsx`

**Interfaces:**
- Consumes: `DrugEntryTier2.pregnancyClinical` (Task 1 — requires the shared-types `dist` rebuild); i18n keys `drug.clinical.lactation`, `drug.clinical.reproductivePotential`.

- [ ] **Step 1: Update the failing clinical-section test**

In `apps/pharmopedia/src/__tests__/drug-clinical-section.test.tsx`, replace the base-fixture line 29:

```typescript
  pregnancyCategory: 'B',
```

with:

```typescript
  pregnancyClinical: { legacyCategory: 'B', lactation: 'Excreted in breast milk.' },
```

Replace the empty-fixture line 65:

```typescript
      pregnancyCategory: undefined, indicationsClinical: [], renalAdjustment: undefined,
```

with:

```typescript
      pregnancyClinical: undefined, indicationsClinical: [], renalAdjustment: undefined,
```

Replace the test at lines 55–60 with:

```typescript
  it('Pregnancy renders the legacy category and lactation prose', () => {
    const sec = sectionBody('pregnancy')
    expect(sec).toBeTruthy()
    const { getByText } = render(<>{sec!.body}</>)
    expect(getByText('B')).toBeTruthy()
    expect(getByText('Excreted in breast milk.')).toBeTruthy()
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F @ultranos/pharmopedia test src/__tests__/drug-clinical-section.test.tsx`
Expected: FAIL — `Excreted in breast milk.` not found (renderer still reads `pregnancyCategory`).

- [ ] **Step 3: Update the renderer**

In `apps/pharmopedia/src/components/DrugDetail/drug-detail-sections.tsx`, replace the pregnancy block (lines 105–109):

```typescript
    // Pregnancy (plain summary + category)
    const pregCards: ReactNode[] = []
    if (pregnancy.text) pregCards.push(<SectionCard key="ps" title={t('drug.overview.pregnancy')} text={pregnancy.text} isRtl={pregnancy.isLocalized} severity="info" />)
    if (e2.pregnancyCategory) pregCards.push(<SectionCard key="pc" title={t('drug.clinical.pregnancyCategory')} text={e2.pregnancyCategory} />)
    if (pregCards.length) sections.push({ id: 'pregnancy', title: t('drug.overview.pregnancy'), defaultOpen: false, body: stack(pregCards) })
```

with:

```typescript
    // Pregnancy (plain summary + PLLR clinical subsections)
    const pregCards: ReactNode[] = []
    if (pregnancy.text) pregCards.push(<SectionCard key="ps" title={t('drug.overview.pregnancy')} text={pregnancy.text} isRtl={pregnancy.isLocalized} severity="info" />)
    const pc = e2.pregnancyClinical
    if (pc?.pregnancy) pregCards.push(<SectionCard key="pc-preg" title="" text={pc.pregnancy} />)
    if (pc?.lactation) pregCards.push(<SectionCard key="pc-lact" title={t('drug.clinical.lactation')} text={pc.lactation} />)
    if (pc?.reproductivePotential) pregCards.push(<SectionCard key="pc-repro" title={t('drug.clinical.reproductivePotential')} text={pc.reproductivePotential} />)
    if (pc?.legacyCategory) pregCards.push(<SectionCard key="pc-cat" title={t('drug.clinical.pregnancyCategory')} text={pc.legacyCategory} />)
    if (pregCards.length) sections.push({ id: 'pregnancy', title: t('drug.overview.pregnancy'), defaultOpen: false, body: stack(pregCards) })
```

- [ ] **Step 4: Add the i18n keys (4 locales)**

In each locale file, inside the `drug.clinical` block, immediately after the `pregnancyCategory:` line, add `lactation` and `reproductivePotential`.

`apps/pharmopedia/src/i18n/locales/en.ts`:
```typescript
      pregnancyCategory: 'Pregnancy category',
      lactation: 'Lactation',
      reproductivePotential: 'Females & males of reproductive potential',
```

`apps/pharmopedia/src/i18n/locales/ar.ts`:
```typescript
      pregnancyCategory: 'فئة الحمل',
      lactation: 'الرضاعة',
      reproductivePotential: 'الإناث والذكور في سن الإنجاب',
```

`apps/pharmopedia/src/i18n/locales/prs.ts`:
```typescript
      pregnancyCategory: 'رده بارداری',
      lactation: 'شیردهی',
      reproductivePotential: 'زنان و مردان در سن باروری',
```

`apps/pharmopedia/src/i18n/locales/ps.ts`:
```typescript
      pregnancyCategory: 'د حمل کټګوري',
      lactation: 'شیدول',
      reproductivePotential: 'د زیږون وړ ښځې او نارینه',
```

- [ ] **Step 5: Update the remaining test fixtures**

In `apps/pharmopedia/src/__tests__/drug-detail-sections.test.tsx`, replace line 87:

```typescript
    renalAdjustment: undefined, pregnancyCategory: 'C', administrationNotes: {},
```

with:

```typescript
    renalAdjustment: undefined, pregnancyClinical: { legacyCategory: 'C' }, administrationNotes: {},
```

and replace line 121:

```typescript
      contraindications: [], interactions: [], renalAdjustment: undefined, pregnancyCategory: undefined,
```

with:

```typescript
      contraindications: [], interactions: [], renalAdjustment: undefined, pregnancyClinical: undefined,
```

In `apps/pharmopedia/src/__tests__/drug-detail-rtl.test.tsx`, replace line 49:

```typescript
    pregnancyCategory: undefined, administrationNotes: {}, pharmacokinetics: {},
```

with:

```typescript
    pregnancyClinical: undefined, administrationNotes: {}, pharmacokinetics: {},
```

- [ ] **Step 6: Run the full Pharmopedia test suite**

Run: `pnpm -F @ultranos/pharmopedia test`
Expected: all tests PASS (clinical-section, drug-detail-sections, drug-detail-rtl all green).

- [ ] **Step 7: Typecheck Pharmopedia**

Run: `pnpm -F @ultranos/pharmopedia typecheck`
Expected: no errors referencing `pregnancyCategory`.

- [ ] **Step 8: Commit** *(checkpoint)*

```bash
git add apps/pharmopedia/src/components/DrugDetail/drug-detail-sections.tsx apps/pharmopedia/src/i18n/locales/en.ts apps/pharmopedia/src/i18n/locales/ar.ts apps/pharmopedia/src/i18n/locales/prs.ts apps/pharmopedia/src/i18n/locales/ps.ts apps/pharmopedia/src/__tests__/drug-clinical-section.test.tsx apps/pharmopedia/src/__tests__/drug-detail-sections.test.tsx apps/pharmopedia/src/__tests__/drug-detail-rtl.test.tsx
git commit -m "feat(pharmopedia): render PLLR pregnancyClinical subsections + i18n"
```

---

## Self-Review

**Spec coverage (design §6 touch-point table):**
- ✅ `shared-types` `DrugPregnancyClinical` + Tier-2 swap → Task 1
- ✅ Hub `drug_catalog` `pregnancy_category text → pregnancy_clinical jsonb` → Task 3
- ✅ ETL `types.ts` + `normalizer.ts` + openFDA SPL mapping (`pregnancy`/`nursing_mothers`) → Task 2
- ✅ Hub API row→entity mapping + `ETL_PROTECTED_FIELDS` → Task 4
- ✅ `drug-detail-sections.tsx` "summary + badge" → summary + 3 prose blocks + legacy badge → Task 5 Step 3
- ✅ i18n `lactation` + `reproductivePotential` in en/ar/prs/ps, legacy `pregnancyCategory` kept → Task 5 Step 4
- ✅ Test fixtures in all 3 app test files updated → Task 5 Steps 1 & 5
- ✅ Device SQLite: no schema migration (serialized blob); repopulation via re-enrichment noted in Global Constraints

**Placeholder scan:** No TBD/TODO. `reproductivePotential` is intentionally not extracted by the openFDA adapter (no reliable SPL field) — it remains a curated/optional field, surfaced in the UI only when present; this is a deliberate scope boundary, not a gap.

**Type consistency:** `pregnancyClinical` shape `{ pregnancy?, lactation?, reproductivePotential?, legacyCategory? }` is identical across shared-types (Task 1), ETL `SourceDrugData`/`NormalizedDrugRow` (Task 2), the Hub mapping (Task 4), and the renderer/fixtures (Task 5). Column name `pregnancy_clinical` matches between the migration (Task 3), `NormalizedDrugRow` (Task 2), and the Hub `row.pregnancy_clinical` read (Task 4).

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-19-pharmopedia-pregnancy-clinical.md`. Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task, two-stage review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session via executing-plans, batched with checkpoints.
