# Pharmopedia Plan 1 — Hub API Drug Catalog Service

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a centralized `/drug-catalog` tRPC service to the Hub API with role-scoped drug data, pharmacy pricing, and incremental sync — the foundation all other Pharmopedia plans depend on.

**Architecture:** A new `drugCatalogRouter` with 6 tRPC procedures follows the existing vocabulary/sync router pattern. Drug content is stored in a `drug_catalog` PostgreSQL table with an integer version watermark for incremental sync. Role-scoping (public/clinical/pharmacist tiers) is enforced in the service layer before returning data. Pharmacy pricing lives in a separate `pharmacy_prices` table joined to a new `pharmacy_facilities` table with GPS coordinates.

**Tech Stack:** Next.js App Router + tRPC (existing), Supabase PostgreSQL, Vitest, Zod, `@ultranos/shared-types`, `@ultranos/audit-logger`

---

## Plan Scope

This is Plan 1 of 4 for Pharmopedia. It produces the Hub API backend only — no app UI.

| Plan | What |
|---|---|
| **Plan 1 (this)** | Hub API + shared types + migrations |
| Plan 2 | ETL seed pipeline |
| Plan 3 | Pharmopedia React Native app |
| Plan 4 | OPD-Lite + Pharmacy-Lite integration |

---

## File Map

**Create:**
- `packages/shared-types/src/fhir/drug-catalog.ts` — TypeScript types for DrugEntry tiers, PharmacyPrice, PharmacyFacility
- `supabase/migrations/033_drug_catalog.sql` — drug_catalog table + version trigger + indexes
- `supabase/migrations/034_pharmacy_facilities.sql` — pharmacy_facilities table with GPS coords
- `supabase/migrations/035_pharmacy_prices.sql` — pharmacy_prices table
- `apps/hub-api/src/services/drug-catalog.service.ts` — tier-scoping logic + ETL field protection
- `apps/hub-api/src/services/drug-prices.service.ts` — haversine distance calculation + sort
- `apps/hub-api/src/trpc/routers/drug-catalog.ts` — tRPC router with all 6 procedures
- `apps/hub-api/src/__tests__/drug-catalog-service.test.ts` — unit tests for tier scoping
- `apps/hub-api/src/__tests__/drug-prices-service.test.ts` — unit tests for distance/sort
- `apps/hub-api/src/__tests__/drug-catalog.test.ts` — tRPC router integration tests

**Modify:**
- `packages/shared-types/src/index.ts` — export new drug-catalog types
- `apps/hub-api/src/trpc/routers/_app.ts` — add `drugCatalog: drugCatalogRouter`

---

## Task 1: Shared TypeScript Types

**Files:**
- Create: `packages/shared-types/src/fhir/drug-catalog.ts`
- Modify: `packages/shared-types/src/index.ts`

- [ ] **Step 1.1: Write the types file**

```typescript
// packages/shared-types/src/fhir/drug-catalog.ts

export interface DrugLocalizedText {
  en?: string
  prs?: string  // Dari Persian
  ps?: string   // Pashto
}

export interface DrugLocalNames {
  prs?: string
  ps?: string
}

export interface DrugDosing {
  indication: string
  adultDose?: string
  pediatricDose?: string  // weight-based e.g. "40mg/kg/day"
  frequency: string
  duration?: string
  route?: string
}

export interface DrugInteraction {
  drugAtcCode: string
  drugName: string
  severity: 'CONTRAINDICATED' | 'MAJOR' | 'MODERATE' | 'MINOR'
  mechanism: string
}

export interface AdverseEvent {
  effect: string
  frequency: 'common' | 'uncommon' | 'rare' | 'unknown'
  severity: 'mild' | 'moderate' | 'severe'
}

export interface DrugPharmacokinetics {
  halfLifeHours?: number
  proteinBindingPct?: number
  volumeOfDistribution?: string
  metabolism?: string
  excretion?: string
}

export interface RecallAlert {
  recallId: string
  description: string
  initiationDate: string
  status: string
}

/** Tier 1 — all authenticated users */
export interface DrugEntryTier1 {
  atcCode: string
  rxnormCui?: string
  innName: string
  brandNames: string[]
  doseForms: string[]
  therapeuticClass: string
  localNames: DrugLocalNames
  summaryPlain: DrugLocalizedText
  usedFor: DrugLocalizedText[]
  commonSideEffects: DrugLocalizedText[]
  whenToSeekHelp: DrugLocalizedText
  storageInstructions: DrugLocalizedText
  pregnancySummaryPlain: DrugLocalizedText
  warningsSummaryPlain: DrugLocalizedText
  version: number
  lastUpdated: string
}

/** Tier 2 — clinical roles (DOCTOR, NURSE, LAB_TECH) */
export interface DrugEntryTier2 extends DrugEntryTier1 {
  mechanismOfAction?: string
  indicationsClinical: string[]
  adultDosing: DrugDosing[]
  pediatricDosing: DrugDosing[]
  renalAdjustment?: string
  adverseEvents: AdverseEvent[]
  contraindications: string[]
  interactions: DrugInteraction[]
  pregnancyCategory?: string
  administrationNotes: DrugLocalizedText
  pharmacokinetics: DrugPharmacokinetics
}

/** Tier 3 — pharmacist role only */
export interface DrugEntryTier3 extends DrugEntryTier2 {
  formularyStatus?: 'on_formulary' | 'off_formulary' | 'restricted'
  dispensingNotes?: string
  substitutes: string[]  // ATC codes of therapeutic equivalents
  recallAlerts: RecallAlert[]
  unitCost?: number
}

/** Lightweight search result — no tier content */
export interface DrugSearchResult {
  atcCode: string
  innName: string
  brandNames: string[]
  therapeuticClass: string
  doseForms: string[]
  localName?: string  // matched local name for the requested lang
}

/** Real-time pharmacy price entry (not cached offline) */
export interface PharmacyPrice {
  facilityId: string
  pharmacyName: string
  distanceKm: number
  retailPrice: number
  stockSignal: 'in_stock' | 'low_stock' | 'out_of_stock'
  doseForm?: string
  quantity?: number
}

export interface PharmacyFacility {
  id: string
  name: string
  latitude: number
  longitude: number
  address?: string
}
```

- [ ] **Step 1.2: Export from shared-types index**

Open `packages/shared-types/src/index.ts`. Add this line alongside existing exports:

```typescript
export * from './fhir/drug-catalog'
```

- [ ] **Step 1.3: Build shared-types to verify no TS errors**

```bash
pnpm --filter @ultranos/shared-types build
```

Expected: Build succeeds with no errors.

- [ ] **Step 1.4: Commit**

```bash
git add packages/shared-types/src/fhir/drug-catalog.ts packages/shared-types/src/index.ts
git commit -m "feat(shared-types): add DrugEntry tier types, PharmacyPrice, PharmacyFacility"
```

---

## Task 2: Migration 033 — drug_catalog Table

**Files:**
- Create: `supabase/migrations/033_drug_catalog.sql`

> ⚠️ Per CLAUDE.md, migrations are applied via `mcp__plugin_supabase_supabase__apply_migration`. Use that tool with the SQL below as the content. Do NOT run psql directly.

- [ ] **Step 2.1: Apply migration via Supabase MCP**

Use `mcp__plugin_supabase_supabase__apply_migration` with:
- **name:** `033_drug_catalog`
- **query:** (the SQL below)

```sql
-- Migration 033: Drug catalog — centralized drug reference database
-- Non-PHI table: no field-level encryption required.
-- version column is an epoch-ms integer used as a sync watermark.

CREATE TABLE IF NOT EXISTS drug_catalog (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Core identity
  atc_code TEXT NOT NULL UNIQUE,
  rxnorm_cui TEXT,
  drugbank_id TEXT,
  inn_name TEXT NOT NULL,
  brand_names TEXT[] NOT NULL DEFAULT '{}',
  dose_forms TEXT[] NOT NULL DEFAULT '{}',
  therapeutic_class TEXT NOT NULL DEFAULT '',

  -- Local enrichment (curated by OPD-Lite / Pharmacy-Lite, never overwritten by ETL)
  local_names JSONB NOT NULL DEFAULT '{}',

  -- Tier 1 fields (all authenticated users)
  summary_plain JSONB NOT NULL DEFAULT '{}',
  used_for JSONB NOT NULL DEFAULT '[]',
  common_side_effects JSONB NOT NULL DEFAULT '[]',
  when_to_seek_help JSONB NOT NULL DEFAULT '{}',
  storage_instructions JSONB NOT NULL DEFAULT '{}',
  pregnancy_summary_plain JSONB NOT NULL DEFAULT '{}',
  warnings_summary_plain JSONB NOT NULL DEFAULT '{}',

  -- Tier 2 fields (clinical roles)
  mechanism_of_action TEXT,
  indications_clinical JSONB NOT NULL DEFAULT '[]',
  adult_dosing JSONB NOT NULL DEFAULT '[]',
  pediatric_dosing JSONB NOT NULL DEFAULT '[]',
  renal_adjustment TEXT,
  adverse_events JSONB NOT NULL DEFAULT '[]',
  contraindications JSONB NOT NULL DEFAULT '[]',
  interactions JSONB NOT NULL DEFAULT '[]',
  pregnancy_category TEXT,
  administration_notes JSONB NOT NULL DEFAULT '{}',
  pharmacokinetics JSONB NOT NULL DEFAULT '{}',

  -- Tier 3 fields (pharmacist — enrichment columns)
  formulary_status TEXT CHECK (formulary_status IN ('on_formulary', 'off_formulary', 'restricted')),
  dispensing_notes TEXT,
  substitutes TEXT[] NOT NULL DEFAULT '{}',
  recall_alerts JSONB NOT NULL DEFAULT '[]',
  unit_cost NUMERIC(10, 2),

  -- ETL source tracking
  etl_source TEXT,
  last_etl_refresh TIMESTAMPTZ,

  -- Sync watermark (epoch-ms, auto-incremented on every update)
  version BIGINT NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS drug_catalog_atc_code_idx ON drug_catalog (atc_code);
CREATE INDEX IF NOT EXISTS drug_catalog_version_idx ON drug_catalog (version);
CREATE INDEX IF NOT EXISTS drug_catalog_inn_name_fts_idx
  ON drug_catalog USING gin(to_tsvector('simple', inn_name));

-- Auto-increment version on every row update
CREATE OR REPLACE FUNCTION increment_drug_catalog_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version := EXTRACT(EPOCH FROM NOW())::BIGINT * 1000 +
                 floor(random() * 1000)::BIGINT;
  NEW.last_updated := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER drug_catalog_version_trigger
  BEFORE UPDATE ON drug_catalog
  FOR EACH ROW EXECUTE FUNCTION increment_drug_catalog_version();

-- RLS: service_role can do everything; authenticated users read-only
ALTER TABLE drug_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY drug_catalog_service_all ON drug_catalog
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY drug_catalog_authenticated_read ON drug_catalog
  FOR SELECT TO authenticated USING (true);
```

- [ ] **Step 2.2: Verify table was created**

Use `mcp__plugin_supabase_supabase__list_tables` and confirm `drug_catalog` appears.

- [ ] **Step 2.3: Commit**

```bash
git add supabase/migrations/033_drug_catalog.sql
git commit -m "feat(db): add drug_catalog table with version watermark and RLS"
```

---

## Task 3: Migration 034 — pharmacy_facilities Table

**Files:**
- Create: `supabase/migrations/034_pharmacy_facilities.sql`

- [ ] **Step 3.1: Apply migration via Supabase MCP**

Use `mcp__plugin_supabase_supabase__apply_migration` with:
- **name:** `034_pharmacy_facilities`
- **query:**

```sql
-- Migration 034: Pharmacy facilities — GPS-registered pharmacy locations
-- Used by the Pharmopedia pharmacy finder (distance calculation).
-- This table is managed by Pharmacy-Lite (pharmacists register their facility).

CREATE TABLE IF NOT EXISTS pharmacy_facilities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  address TEXT,
  province TEXT,
  district TEXT,
  facility_type TEXT NOT NULL DEFAULT 'pharmacy'
    CHECK (facility_type IN ('pharmacy', 'clinic', 'hospital')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pharmacy_facilities_coords_idx
  ON pharmacy_facilities (latitude, longitude);

ALTER TABLE pharmacy_facilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY pharmacy_facilities_service_all ON pharmacy_facilities
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY pharmacy_facilities_authenticated_read ON pharmacy_facilities
  FOR SELECT TO authenticated USING (is_active = true);
```

- [ ] **Step 3.2: Commit**

```bash
git add supabase/migrations/034_pharmacy_facilities.sql
git commit -m "feat(db): add pharmacy_facilities table with GPS coordinates"
```

---

## Task 4: Migration 035 — pharmacy_prices Table

**Files:**
- Create: `supabase/migrations/035_pharmacy_prices.sql`

- [ ] **Step 4.1: Apply migration via Supabase MCP**

Use `mcp__plugin_supabase_supabase__apply_migration` with:
- **name:** `035_pharmacy_prices`
- **query:**

```sql
-- Migration 035: Pharmacy prices — per-facility retail prices for drugs
-- Written by Pharmacy-Lite when pharmacists update drug pricing.
-- Queried by Pharmopedia for the real-time pharmacy finder.

CREATE TABLE IF NOT EXISTS pharmacy_prices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  atc_code TEXT NOT NULL REFERENCES drug_catalog(atc_code) ON DELETE CASCADE,
  facility_id UUID NOT NULL REFERENCES pharmacy_facilities(id) ON DELETE CASCADE,
  retail_price NUMERIC(10, 2) NOT NULL CHECK (retail_price >= 0),
  stock_signal TEXT NOT NULL DEFAULT 'in_stock'
    CHECK (stock_signal IN ('in_stock', 'low_stock', 'out_of_stock')),
  dose_form TEXT,
  quantity INTEGER,
  updated_by UUID NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(atc_code, facility_id, dose_form)
);

CREATE INDEX IF NOT EXISTS pharmacy_prices_atc_code_idx ON pharmacy_prices (atc_code);
CREATE INDEX IF NOT EXISTS pharmacy_prices_facility_id_idx ON pharmacy_prices (facility_id);

ALTER TABLE pharmacy_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY pharmacy_prices_service_all ON pharmacy_prices
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY pharmacy_prices_authenticated_read ON pharmacy_prices
  FOR SELECT TO authenticated USING (true);
```

- [ ] **Step 4.2: Commit**

```bash
git add supabase/migrations/035_pharmacy_prices.sql
git commit -m "feat(db): add pharmacy_prices table for Pharmopedia finder"
```

---

## Task 5: Drug Catalog Service (Tier Scoping) — TDD

**Files:**
- Create: `apps/hub-api/src/__tests__/drug-catalog-service.test.ts`
- Create: `apps/hub-api/src/services/drug-catalog.service.ts`

- [ ] **Step 5.1: Write the failing tests**

```typescript
// apps/hub-api/src/__tests__/drug-catalog-service.test.ts
import { describe, it, expect } from 'vitest'
import {
  getTierForRole,
  scopeEntryToTier,
  ETL_PROTECTED_FIELDS,
  ENRICHMENT_FIELDS_BY_ROLE,
} from '@/services/drug-catalog.service'

const FULL_ROW = {
  atc_code: 'J01CA04',
  rxnorm_cui: '723',
  inn_name: 'Amoxicillin',
  brand_names: ['Amoxil'],
  dose_forms: ['capsule', 'suspension'],
  therapeutic_class: 'Aminopenicillin antibiotic',
  local_names: { prs: 'آموکسیسیلین' },
  summary_plain: { en: 'An antibiotic for bacterial infections.' },
  used_for: [{ en: 'Chest infection' }],
  common_side_effects: [{ en: 'Nausea' }],
  when_to_seek_help: { en: 'Seek help if rash is severe.' },
  storage_instructions: { en: 'Store below 25°C.' },
  pregnancy_summary_plain: { en: 'Use with caution.' },
  warnings_summary_plain: { en: 'Penicillin allergy risk.' },
  mechanism_of_action: 'Inhibits cell wall synthesis.',
  indications_clinical: ['J06.9'],
  adult_dosing: [{ indication: 'CAP', adultDose: '500mg', frequency: 'TDS' }],
  pediatric_dosing: [{ indication: 'AOM', pediatricDose: '80mg/kg/day', frequency: 'BD' }],
  renal_adjustment: 'CrCl <30: reduce dose',
  adverse_events: [{ effect: 'Diarrhoea', frequency: 'common', severity: 'mild' }],
  contraindications: ['Penicillin hypersensitivity'],
  interactions: [{ drugAtcCode: 'B01AA03', drugName: 'Warfarin', severity: 'MODERATE', mechanism: 'CYP2C9' }],
  pregnancy_category: 'B',
  administration_notes: { en: 'Take with food.' },
  pharmacokinetics: { halfLifeHours: 1.3 },
  formulary_status: 'on_formulary',
  dispensing_notes: 'Dispense with water.',
  substitutes: ['J01CA01'],
  recall_alerts: [],
  unit_cost: 3.2,
  version: 1718000000000,
  last_updated: '2026-06-12T00:00:00Z',
}

describe('getTierForRole', () => {
  it('returns pharmacist for PHARMACIST role', () => {
    expect(getTierForRole('PHARMACIST')).toBe('pharmacist')
  })

  it('returns pharmacist for ADMIN role', () => {
    expect(getTierForRole('ADMIN')).toBe('pharmacist')
  })

  it('returns clinical for DOCTOR role', () => {
    expect(getTierForRole('DOCTOR')).toBe('clinical')
  })

  it('returns clinical for NURSE role', () => {
    expect(getTierForRole('NURSE')).toBe('clinical')
  })

  it('returns clinical for LAB_TECH role', () => {
    expect(getTierForRole('LAB_TECH')).toBe('clinical')
  })

  it('returns public for PATIENT role', () => {
    expect(getTierForRole('PATIENT')).toBe('public')
  })

  it('returns public for unknown role', () => {
    expect(getTierForRole('UNKNOWN')).toBe('public')
  })
})

describe('scopeEntryToTier', () => {
  it('returns only tier-1 fields for PATIENT role', () => {
    const result = scopeEntryToTier(FULL_ROW, 'PATIENT')
    expect(result.atcCode).toBe('J01CA04')
    expect(result.innName).toBe('Amoxicillin')
    expect(result.summaryPlain).toEqual({ en: 'An antibiotic for bacterial infections.' })
    // Tier 2 fields must be absent
    expect((result as Record<string, unknown>).mechanismOfAction).toBeUndefined()
    expect((result as Record<string, unknown>).adultDosing).toBeUndefined()
    expect((result as Record<string, unknown>).interactions).toBeUndefined()
    // Tier 3 fields must be absent
    expect((result as Record<string, unknown>).formularyStatus).toBeUndefined()
    expect((result as Record<string, unknown>).unitCost).toBeUndefined()
  })

  it('returns tier-1 + tier-2 fields for DOCTOR role', () => {
    const result = scopeEntryToTier(FULL_ROW, 'DOCTOR') as Record<string, unknown>
    expect(result.atcCode).toBe('J01CA04')
    expect(result.mechanismOfAction).toBe('Inhibits cell wall synthesis.')
    expect(result.adultDosing).toBeDefined()
    expect(result.interactions).toBeDefined()
    // Tier 3 must be absent
    expect(result.formularyStatus).toBeUndefined()
    expect(result.unitCost).toBeUndefined()
  })

  it('returns all tiers for PHARMACIST role', () => {
    const result = scopeEntryToTier(FULL_ROW, 'PHARMACIST') as Record<string, unknown>
    expect(result.atcCode).toBe('J01CA04')
    expect(result.mechanismOfAction).toBe('Inhibits cell wall synthesis.')
    expect(result.formularyStatus).toBe('on_formulary')
    expect(result.unitCost).toBe(3.2)
    expect(result.substitutes).toEqual(['J01CA01'])
  })

  it('includes localNames and version in all tiers', () => {
    for (const role of ['PATIENT', 'DOCTOR', 'PHARMACIST'] as const) {
      const result = scopeEntryToTier(FULL_ROW, role)
      expect(result.localNames).toEqual({ prs: 'آموکسیسیلین' })
      expect(result.version).toBe(1718000000000)
    }
  })
})

describe('ETL_PROTECTED_FIELDS', () => {
  it('includes inn_name', () => {
    expect(ETL_PROTECTED_FIELDS.has('inn_name')).toBe(true)
  })

  it('includes interactions', () => {
    expect(ETL_PROTECTED_FIELDS.has('interactions')).toBe(true)
  })

  it('does NOT include local_names (enrichment)', () => {
    expect(ETL_PROTECTED_FIELDS.has('local_names')).toBe(false)
  })

  it('does NOT include formulary_status (enrichment)', () => {
    expect(ETL_PROTECTED_FIELDS.has('formulary_status')).toBe(false)
  })
})

describe('ENRICHMENT_FIELDS_BY_ROLE', () => {
  it('clinical role can only set local_names', () => {
    expect(ENRICHMENT_FIELDS_BY_ROLE.clinical.has('local_names')).toBe(true)
    expect(ENRICHMENT_FIELDS_BY_ROLE.clinical.has('formulary_status')).toBe(false)
    expect(ENRICHMENT_FIELDS_BY_ROLE.clinical.has('unit_cost')).toBe(false)
  })

  it('pharmacist role can set all enrichment fields', () => {
    for (const field of ['local_names', 'dispensing_notes', 'formulary_status', 'unit_cost']) {
      expect(ENRICHMENT_FIELDS_BY_ROLE.pharmacist.has(field)).toBe(true)
    }
  })
})
```

- [ ] **Step 5.2: Run test to confirm it fails**

```bash
pnpm -F hub-api test src/__tests__/drug-catalog-service.test.ts
```

Expected: FAIL — `Cannot find module '@/services/drug-catalog.service'`

- [ ] **Step 5.3: Implement the service**

```typescript
// apps/hub-api/src/services/drug-catalog.service.ts
import type {
  DrugEntryTier1,
  DrugEntryTier2,
  DrugEntryTier3,
  DrugLocalNames,
  DrugLocalizedText,
  DrugDosing,
  AdverseEvent,
  DrugInteraction,
  DrugPharmacokinetics,
  RecallAlert,
} from '@ultranos/shared-types'

export type UserRole = string

const PHARMACIST_ROLES = new Set(['PHARMACIST', 'ADMIN'])
const CLINICAL_ROLES = new Set(['DOCTOR', 'NURSE', 'LAB_TECH'])

export function getTierForRole(role: UserRole): 'public' | 'clinical' | 'pharmacist' {
  if (PHARMACIST_ROLES.has(role)) return 'pharmacist'
  if (CLINICAL_ROLES.has(role)) return 'clinical'
  return 'public'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawRow = Record<string, any>

export function scopeEntryToTier(
  row: RawRow,
  role: UserRole
): DrugEntryTier1 | DrugEntryTier2 | DrugEntryTier3 {
  const tier = getTierForRole(role)

  const tier1: DrugEntryTier1 = {
    atcCode: row.atc_code as string,
    rxnormCui: row.rxnorm_cui as string | undefined,
    innName: row.inn_name as string,
    brandNames: (row.brand_names ?? []) as string[],
    doseForms: (row.dose_forms ?? []) as string[],
    therapeuticClass: (row.therapeutic_class ?? '') as string,
    localNames: (row.local_names ?? {}) as DrugLocalNames,
    summaryPlain: (row.summary_plain ?? {}) as DrugLocalizedText,
    usedFor: (row.used_for ?? []) as DrugLocalizedText[],
    commonSideEffects: (row.common_side_effects ?? []) as DrugLocalizedText[],
    whenToSeekHelp: (row.when_to_seek_help ?? {}) as DrugLocalizedText,
    storageInstructions: (row.storage_instructions ?? {}) as DrugLocalizedText,
    pregnancySummaryPlain: (row.pregnancy_summary_plain ?? {}) as DrugLocalizedText,
    warningsSummaryPlain: (row.warnings_summary_plain ?? {}) as DrugLocalizedText,
    version: row.version as number,
    lastUpdated: row.last_updated as string,
  }

  if (tier === 'public') return tier1

  const tier2: DrugEntryTier2 = {
    ...tier1,
    mechanismOfAction: row.mechanism_of_action as string | undefined,
    indicationsClinical: (row.indications_clinical ?? []) as string[],
    adultDosing: (row.adult_dosing ?? []) as DrugDosing[],
    pediatricDosing: (row.pediatric_dosing ?? []) as DrugDosing[],
    renalAdjustment: row.renal_adjustment as string | undefined,
    adverseEvents: (row.adverse_events ?? []) as AdverseEvent[],
    contraindications: (row.contraindications ?? []) as string[],
    interactions: (row.interactions ?? []) as DrugInteraction[],
    pregnancyCategory: row.pregnancy_category as string | undefined,
    administrationNotes: (row.administration_notes ?? {}) as DrugLocalizedText,
    pharmacokinetics: (row.pharmacokinetics ?? {}) as DrugPharmacokinetics,
  }

  if (tier === 'clinical') return tier2

  const tier3: DrugEntryTier3 = {
    ...tier2,
    formularyStatus: row.formulary_status as 'on_formulary' | 'off_formulary' | 'restricted' | undefined,
    dispensingNotes: row.dispensing_notes as string | undefined,
    substitutes: (row.substitutes ?? []) as string[],
    recallAlerts: (row.recall_alerts ?? []) as RecallAlert[],
    unitCost: row.unit_cost as number | undefined,
  }

  return tier3
}

/** ETL-sourced fields that must never be overwritten by the /enrich endpoint */
export const ETL_PROTECTED_FIELDS = new Set([
  'inn_name', 'brand_names', 'dose_forms', 'therapeutic_class',
  'rxnorm_cui', 'drugbank_id', 'mechanism_of_action', 'indications_clinical',
  'adult_dosing', 'pediatric_dosing', 'renal_adjustment', 'adverse_events',
  'contraindications', 'interactions', 'pregnancy_category', 'administration_notes',
  'pharmacokinetics', 'summary_plain', 'used_for', 'common_side_effects',
  'when_to_seek_help', 'storage_instructions', 'pregnancy_summary_plain',
  'warnings_summary_plain', 'substitutes', 'recall_alerts',
])

/** Enrichment fields each role is permitted to write */
export const ENRICHMENT_FIELDS_BY_ROLE: Record<'clinical' | 'pharmacist', Set<string>> = {
  clinical: new Set(['local_names']),
  pharmacist: new Set(['local_names', 'dispensing_notes', 'formulary_status', 'unit_cost']),
}
```

- [ ] **Step 5.4: Run tests to confirm they pass**

```bash
pnpm -F hub-api test src/__tests__/drug-catalog-service.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5.5: Commit**

```bash
git add apps/hub-api/src/services/drug-catalog.service.ts apps/hub-api/src/__tests__/drug-catalog-service.test.ts
git commit -m "feat(hub-api): add drug catalog tier-scoping service with ETL field protection"
```

---

## Task 6: Drug Prices Service (Distance Calculation) — TDD

**Files:**
- Create: `apps/hub-api/src/__tests__/drug-prices-service.test.ts`
- Create: `apps/hub-api/src/services/drug-prices.service.ts`

- [ ] **Step 6.1: Write the failing tests**

```typescript
// apps/hub-api/src/__tests__/drug-prices-service.test.ts
import { describe, it, expect } from 'vitest'
import { haversineDistanceKm, sortPrices } from '@/services/drug-prices.service'
import type { PharmacyPrice } from '@ultranos/shared-types'

describe('haversineDistanceKm', () => {
  it('returns 0 for identical coordinates', () => {
    expect(haversineDistanceKm(34.5, 69.2, 34.5, 69.2)).toBe(0)
  })

  it('calculates approximate distance between Kabul and Parwan (~80km)', () => {
    // Kabul: 34.5260, 69.1763 — Charikar (Parwan): 35.0136, 69.1678
    const km = haversineDistanceKm(34.526, 69.1763, 35.0136, 69.1678)
    expect(km).toBeGreaterThan(50)
    expect(km).toBeLessThan(100)
  })

  it('returns a positive value when coordinates differ', () => {
    expect(haversineDistanceKm(34.0, 69.0, 35.0, 70.0)).toBeGreaterThan(0)
  })
})

const PRICES: PharmacyPrice[] = [
  { facilityId: 'f1', pharmacyName: 'Alpha', distanceKm: 2.5, retailPrice: 95, stockSignal: 'in_stock' },
  { facilityId: 'f2', pharmacyName: 'Beta', distanceKm: 0.4, retailPrice: 120, stockSignal: 'in_stock' },
  { facilityId: 'f3', pharmacyName: 'Gamma', distanceKm: 5.1, retailPrice: 80, stockSignal: 'low_stock' },
]

describe('sortPrices', () => {
  it('sorts by distance ascending when sort=distance', () => {
    const sorted = sortPrices(PRICES, 'distance')
    expect(sorted[0].pharmacyName).toBe('Beta')   // 0.4 km
    expect(sorted[1].pharmacyName).toBe('Alpha')  // 2.5 km
    expect(sorted[2].pharmacyName).toBe('Gamma')  // 5.1 km
  })

  it('sorts by price ascending when sort=price', () => {
    const sorted = sortPrices(PRICES, 'price')
    expect(sorted[0].pharmacyName).toBe('Gamma')  // 80 AFN
    expect(sorted[1].pharmacyName).toBe('Alpha')  // 95 AFN
    expect(sorted[2].pharmacyName).toBe('Beta')   // 120 AFN
  })

  it('does not mutate the original array', () => {
    const original = [...PRICES]
    sortPrices(PRICES, 'distance')
    expect(PRICES).toEqual(original)
  })
})
```

- [ ] **Step 6.2: Run test to confirm it fails**

```bash
pnpm -F hub-api test src/__tests__/drug-prices-service.test.ts
```

Expected: FAIL — `Cannot find module '@/services/drug-prices.service'`

- [ ] **Step 6.3: Implement the service**

```typescript
// apps/hub-api/src/services/drug-prices.service.ts
import type { PharmacyPrice } from '@ultranos/shared-types'

const EARTH_RADIUS_KM = 6371

export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function sortPrices(
  prices: PharmacyPrice[],
  sort: 'distance' | 'price'
): PharmacyPrice[] {
  return [...prices].sort((a, b) =>
    sort === 'distance' ? a.distanceKm - b.distanceKm : a.retailPrice - b.retailPrice
  )
}
```

- [ ] **Step 6.4: Run tests to confirm they pass**

```bash
pnpm -F hub-api test src/__tests__/drug-prices-service.test.ts
```

Expected: All tests PASS.

- [ ] **Step 6.5: Commit**

```bash
git add apps/hub-api/src/services/drug-prices.service.ts apps/hub-api/src/__tests__/drug-prices-service.test.ts
git commit -m "feat(hub-api): add drug prices service with haversine distance and sort"
```

---

## Task 7: drug-catalog tRPC Router — Search & Get — TDD

**Files:**
- Create: `apps/hub-api/src/__tests__/drug-catalog.test.ts`
- Create: `apps/hub-api/src/trpc/routers/drug-catalog.ts` (partial — search + get only)

- [ ] **Step 7.1: Write failing tests for search and getByAtcCode**

```typescript
// apps/hub-api/src/__tests__/drug-catalog.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock supabase BEFORE importing the router
vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => mockSupabase),
  db: {
    fromRowRaw: (row: Record<string, unknown>) => row,
    fromRows: (rows: Record<string, unknown>[]) => rows,
    toRowRaw: (data: Record<string, unknown>) => data,
  },
}))

const mockFrom = vi.fn()
const mockSupabase = { from: mockFrom }

const { createCallerFactory } = await import('../trpc/init')
const { appRouter } = await import('../trpc/routers/_app')
const createCaller = createCallerFactory(appRouter)

const DOCTOR_USER = { sub: 'doc-001', role: 'DOCTOR', sessionId: 's1', orgId: null, status: 'active' }
const PHARMACIST_USER = { sub: 'ph-001', role: 'PHARMACIST', sessionId: 's2', orgId: null, status: 'active' }
const PATIENT_USER = { sub: 'pat-001', role: 'PATIENT', sessionId: 's3', orgId: null, status: 'active' }

function ctx(user = DOCTOR_USER) {
  return { supabase: mockSupabase as never, user, headers: new Headers() }
}

const AMOX_ROW = {
  atc_code: 'J01CA04',
  inn_name: 'Amoxicillin',
  brand_names: ['Amoxil'],
  dose_forms: ['capsule'],
  therapeutic_class: 'Aminopenicillin',
  local_names: { prs: 'آموکسیسیلین' },
  summary_plain: { en: 'An antibiotic.' },
  used_for: [],
  common_side_effects: [],
  when_to_seek_help: {},
  storage_instructions: {},
  pregnancy_summary_plain: {},
  warnings_summary_plain: {},
  mechanism_of_action: 'Inhibits cell wall synthesis.',
  indications_clinical: [],
  adult_dosing: [],
  pediatric_dosing: [],
  renal_adjustment: null,
  adverse_events: [],
  contraindications: [],
  interactions: [],
  pregnancy_category: 'B',
  administration_notes: {},
  pharmacokinetics: {},
  formulary_status: 'on_formulary',
  dispensing_notes: null,
  substitutes: [],
  recall_alerts: [],
  unit_cost: 3.2,
  version: 1718000000000,
  last_updated: '2026-06-12T00:00:00Z',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('drugCatalog.search', () => {
  it('returns search results for a query', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        or: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: [AMOX_ROW], error: null }),
        }),
      }),
    })

    const caller = createCaller(ctx())
    const result = await caller.drugCatalog.search({ q: 'amox', lang: 'en' })
    expect(result).toHaveLength(1)
    expect(result[0].atcCode).toBe('J01CA04')
    expect(result[0].innName).toBe('Amoxicillin')
    // Search results must NOT include tier content
    expect((result[0] as Record<string, unknown>).mechanismOfAction).toBeUndefined()
  })

  it('requires authentication', async () => {
    const caller = createCaller({ ...ctx(), user: null as never })
    await expect(caller.drugCatalog.search({ q: 'amox', lang: 'en' })).rejects.toThrow()
  })
})

describe('drugCatalog.getByAtcCode', () => {
  it('returns tier-1 only for PATIENT role', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: AMOX_ROW, error: null }),
        }),
      }),
    })

    const caller = createCaller(ctx(PATIENT_USER))
    const result = await caller.drugCatalog.getByAtcCode({ atcCode: 'J01CA04' }) as Record<string, unknown>
    expect(result.innName).toBe('Amoxicillin')
    expect(result.mechanismOfAction).toBeUndefined()
    expect(result.formularyStatus).toBeUndefined()
  })

  it('returns tier-1+2 for DOCTOR role', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: AMOX_ROW, error: null }),
        }),
      }),
    })

    const caller = createCaller(ctx(DOCTOR_USER))
    const result = await caller.drugCatalog.getByAtcCode({ atcCode: 'J01CA04' }) as Record<string, unknown>
    expect(result.mechanismOfAction).toBe('Inhibits cell wall synthesis.')
    expect(result.formularyStatus).toBeUndefined()
  })

  it('returns all tiers for PHARMACIST role', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: AMOX_ROW, error: null }),
        }),
      }),
    })

    const caller = createCaller(ctx(PHARMACIST_USER))
    const result = await caller.drugCatalog.getByAtcCode({ atcCode: 'J01CA04' }) as Record<string, unknown>
    expect(result.mechanismOfAction).toBe('Inhibits cell wall synthesis.')
    expect(result.formularyStatus).toBe('on_formulary')
    expect(result.unitCost).toBe(3.2)
  })

  it('throws NOT_FOUND when drug does not exist', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
        }),
      }),
    })

    const caller = createCaller(ctx())
    await expect(caller.drugCatalog.getByAtcCode({ atcCode: 'UNKNOWN' })).rejects.toThrow(/NOT_FOUND/)
  })
})
```

- [ ] **Step 7.2: Run to confirm tests fail**

```bash
pnpm -F hub-api test src/__tests__/drug-catalog.test.ts
```

Expected: FAIL — `Cannot find router 'drugCatalog' on appRouter`

- [ ] **Step 7.3: Create the router with search + getByAtcCode**

```typescript
// apps/hub-api/src/trpc/routers/drug-catalog.ts
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { protectedProcedure, createTRPCRouter } from '../init'
import {
  scopeEntryToTier,
  getTierForRole,
  ETL_PROTECTED_FIELDS,
  ENRICHMENT_FIELDS_BY_ROLE,
} from '@/services/drug-catalog.service'
import { haversineDistanceKm, sortPrices } from '@/services/drug-prices.service'
import { auditLogger } from '@/lib/audit'
import type { DrugSearchResult, PharmacyPrice } from '@ultranos/shared-types'

const langSchema = z.enum(['en', 'prs', 'ps']).default('en')

export const drugCatalogRouter = createTRPCRouter({
  /**
   * Fuzzy drug search by name, brand, or ATC code.
   * Returns identity fields only — no tier content.
   * Used by OPD-Lite, Pharmacy-Lite, and Pharmopedia.
   */
  search: protectedProcedure
    .input(z.object({
      q: z.string().min(1).max(100),
      lang: langSchema,
      limit: z.number().int().min(1).max(50).default(20),
    }))
    .query(async ({ ctx, input }): Promise<DrugSearchResult[]> => {
      const { q, lang, limit } = input
      const likeQ = `%${q.toLowerCase()}%`

      const { data, error } = await ctx.supabase
        .from('drug_catalog')
        .select('atc_code, inn_name, brand_names, dose_forms, therapeutic_class, local_names')
        .or(`inn_name.ilike.${likeQ},atc_code.ilike.${likeQ}`)
        .limit(limit)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })

      return (data ?? []).map((row) => ({
        atcCode: row.atc_code as string,
        innName: row.inn_name as string,
        brandNames: (row.brand_names ?? []) as string[],
        doseForms: (row.dose_forms ?? []) as string[],
        therapeuticClass: row.therapeutic_class as string,
        localName: ((row.local_names as Record<string, string>) ?? {})[lang],
      }))
    }),

  /**
   * Get full drug profile scoped to caller's role tier.
   * Used by Pharmopedia drug detail screen.
   */
  getByAtcCode: protectedProcedure
    .input(z.object({ atcCode: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('drug_catalog')
        .select('*')
        .eq('atc_code', input.atcCode)
        .single()

      if (error?.code === 'PGRST116' || !data) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Drug not found' })
      }
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })

      return scopeEntryToTier(data, ctx.user?.role ?? 'PATIENT')
    }),

  // sync, enrich, getPrice, setPrice added in Tasks 8 & 9
})
```

- [ ] **Step 7.4: Wire into _app.ts (temporary — will expand in Task 9)**

Open `apps/hub-api/src/trpc/routers/_app.ts`. Add:

```typescript
// Add import at top with other imports:
import { drugCatalogRouter } from './drug-catalog'

// Add to the createTRPCRouter call:
drugCatalog: drugCatalogRouter,
```

- [ ] **Step 7.5: Run tests for search + getByAtcCode**

```bash
pnpm -F hub-api test src/__tests__/drug-catalog.test.ts
```

Expected: `search` and `getByAtcCode` tests PASS. Sync/enrich/prices tests will not exist yet.

- [ ] **Step 7.6: Commit**

```bash
git add apps/hub-api/src/trpc/routers/drug-catalog.ts apps/hub-api/src/trpc/routers/_app.ts apps/hub-api/src/__tests__/drug-catalog.test.ts
git commit -m "feat(hub-api): add drugCatalog.search and getByAtcCode tRPC procedures"
```

---

## Task 8: drug-catalog Router — Sync & Enrich — TDD

**Files:**
- Modify: `apps/hub-api/src/__tests__/drug-catalog.test.ts` (add tests)
- Modify: `apps/hub-api/src/trpc/routers/drug-catalog.ts` (add procedures)

- [ ] **Step 8.1: Add failing tests for sync and enrich**

Append to `apps/hub-api/src/__tests__/drug-catalog.test.ts`:

```typescript
describe('drugCatalog.sync', () => {
  it('returns entries updated since sinceVersion for DOCTOR', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        gt: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [AMOX_ROW], error: null }),
          }),
        }),
      }),
    })

    const caller = createCaller(ctx(DOCTOR_USER))
    const result = await caller.drugCatalog.sync({ sinceVersion: 0 })
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].atcCode).toBe('J01CA04')
    // Clinical fields present for DOCTOR
    expect((result.entries[0] as Record<string, unknown>).mechanismOfAction).toBeDefined()
    // Pharmacist fields absent for DOCTOR
    expect((result.entries[0] as Record<string, unknown>).formularyStatus).toBeUndefined()
    expect(result.latestVersion).toBe(1718000000000)
  })

  it('returns empty array when no entries have been updated', async () => {
    mockFrom
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          gt: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { version: 500 }, error: null }),
            }),
          }),
        }),
      })

    const caller = createCaller(ctx(DOCTOR_USER))
    const result = await caller.drugCatalog.sync({ sinceVersion: 999 })
    expect(result.entries).toHaveLength(0)
    expect(result.latestVersion).toBe(500)
  })
})

describe('drugCatalog.enrich', () => {
  it('allows PHARMACIST to set formulary_status', async () => {
    mockFrom.mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { ...AMOX_ROW, formulary_status: 'on_formulary' },
              error: null,
            }),
          }),
        }),
      }),
    })

    const caller = createCaller(ctx(PHARMACIST_USER))
    const result = await caller.drugCatalog.enrich({
      atcCode: 'J01CA04',
      fields: { formularyStatus: 'on_formulary' },
    })
    expect(result.atcCode).toBe('J01CA04')
  })

  it('rejects DOCTOR attempting to set formulary_status', async () => {
    const caller = createCaller(ctx(DOCTOR_USER))
    await expect(
      caller.drugCatalog.enrich({
        atcCode: 'J01CA04',
        fields: { formularyStatus: 'on_formulary' },
      })
    ).rejects.toThrow(/FORBIDDEN/)
  })

  it('allows DOCTOR to set local_names', async () => {
    mockFrom.mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { ...AMOX_ROW, local_names: { prs: 'آموکسیسیلین' } },
              error: null,
            }),
          }),
        }),
      }),
    })

    const caller = createCaller(ctx(DOCTOR_USER))
    const result = await caller.drugCatalog.enrich({
      atcCode: 'J01CA04',
      fields: { localNames: { prs: 'آموکسیسیلین' } },
    })
    expect(result).toBeDefined()
  })

  it('rejects PATIENT role entirely', async () => {
    const caller = createCaller(ctx(PATIENT_USER))
    await expect(
      caller.drugCatalog.enrich({ atcCode: 'J01CA04', fields: { localNames: {} } })
    ).rejects.toThrow()
  })
})
```

- [ ] **Step 8.2: Run to confirm new tests fail**

```bash
pnpm -F hub-api test src/__tests__/drug-catalog.test.ts
```

Expected: `sync` and `enrich` tests FAIL — procedures do not exist yet.

- [ ] **Step 8.3: Add sync and enrich to the router**

Add these procedures inside `drugCatalogRouter` in `apps/hub-api/src/trpc/routers/drug-catalog.ts`:

```typescript
  /**
   * Incremental sync for Pharmopedia offline cache.
   * Returns all entries with version > sinceVersion, scoped to caller's role.
   * Follows vocabulary.sync pattern.
   */
  sync: protectedProcedure
    .input(z.object({
      sinceVersion: z.number().int().min(0),
      limit: z.number().int().min(1).max(500).default(200),
    }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('drug_catalog')
        .select('*')
        .gt('version', input.sinceVersion)
        .order('version', { ascending: true })
        .limit(input.limit)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })

      const role = ctx.user?.role ?? 'PATIENT'
      const entries = (data ?? []).map((row) => scopeEntryToTier(row, role))

      let latestVersion: number
      if (data && data.length > 0) {
        latestVersion = (data[data.length - 1] as { version: number }).version
      } else {
        const { data: maxRow, error: maxError } = await ctx.supabase
          .from('drug_catalog')
          .select('version')
          .order('version', { ascending: false })
          .limit(1)
          .single()

        if (maxError) return { entries: [], latestVersion: input.sinceVersion }
        latestVersion = maxRow?.version ?? input.sinceVersion
      }

      return { entries, latestVersion }
    }),

  /**
   * Write local enrichment fields to a drug entry.
   * Never overwrites ETL-sourced fields.
   * Emits an audit event on every write.
   * - DOCTOR role: can set localNames only
   * - PHARMACIST role: can set localNames, dispensingNotes, formularyStatus, unitCost
   */
  enrich: protectedProcedure
    .input(z.object({
      atcCode: z.string().min(1),
      fields: z.object({
        localNames: z.record(z.string()).optional(),
        dispensingNotes: z.string().max(500).optional(),
        formularyStatus: z.enum(['on_formulary', 'off_formulary', 'restricted']).optional(),
        unitCost: z.number().min(0).optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const role = ctx.user?.role ?? ''
      const tier = getTierForRole(role)

      if (tier === 'public') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Enrichment requires clinical or pharmacist role' })
      }

      const allowedFields = ENRICHMENT_FIELDS_BY_ROLE[tier]

      // Build the update payload — only include fields the role is permitted to write
      const update: Record<string, unknown> = {}

      if (input.fields.localNames !== undefined) {
        if (!allowedFields.has('local_names')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Role cannot set localNames' })
        }
        update.local_names = input.fields.localNames
      }

      if (input.fields.dispensingNotes !== undefined) {
        if (!allowedFields.has('dispensing_notes')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Role cannot set dispensingNotes' })
        }
        update.dispensing_notes = input.fields.dispensingNotes
      }

      if (input.fields.formularyStatus !== undefined) {
        if (!allowedFields.has('formulary_status')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Role cannot set formularyStatus' })
        }
        update.formulary_status = input.fields.formularyStatus
      }

      if (input.fields.unitCost !== undefined) {
        if (!allowedFields.has('unit_cost')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Role cannot set unitCost' })
        }
        update.unit_cost = input.fields.unitCost
      }

      if (Object.keys(update).length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No valid enrichment fields provided' })
      }

      const { data, error } = await ctx.supabase
        .from('drug_catalog')
        .update(update)
        .eq('atc_code', input.atcCode)
        .select('*')
        .single()

      if (error?.code === 'PGRST116' || !data) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Drug not found' })
      }
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })

      // Emit audit event — drug enrichment is a data write that must be traceable
      await auditLogger(ctx.supabase).emit({
        action: 'DRUG_CATALOG_ENRICH',
        resourceType: 'DrugCatalog',
        resourceId: input.atcCode,
        actorId: ctx.user!.sub,
        metadata: { fields: Object.keys(update) },
      })

      return scopeEntryToTier(data, role)
    }),
```

> **Note:** `auditLogger` import — check the existing pattern in `apps/hub-api/src/lib/audit.ts` or wherever audit logging is exported. In allergy.ts or encounter.ts, look for how `AuditLogger` is instantiated and match that pattern exactly.

- [ ] **Step 8.4: Run tests**

```bash
pnpm -F hub-api test src/__tests__/drug-catalog.test.ts
```

Expected: All `search`, `getByAtcCode`, `sync`, `enrich` tests PASS.

- [ ] **Step 8.5: Commit**

```bash
git add apps/hub-api/src/trpc/routers/drug-catalog.ts apps/hub-api/src/__tests__/drug-catalog.test.ts
git commit -m "feat(hub-api): add drugCatalog.sync and enrich procedures"
```

---

## Task 9: drug-catalog Router — Pharmacy Prices — TDD

**Files:**
- Modify: `apps/hub-api/src/__tests__/drug-catalog.test.ts` (add tests)
- Modify: `apps/hub-api/src/trpc/routers/drug-catalog.ts` (add procedures)

- [ ] **Step 9.1: Add failing tests for getPrices and setPrice**

Append to `apps/hub-api/src/__tests__/drug-catalog.test.ts`:

```typescript
describe('drugCatalog.getPrices', () => {
  const PRICES_ROWS = [
    {
      atc_code: 'J01CA04',
      retail_price: 85,
      stock_signal: 'in_stock',
      dose_form: 'capsule',
      quantity: 20,
      pharmacy_facilities: {
        id: 'f1',
        name: 'Al-Shifa Pharmacy',
        latitude: 34.527,
        longitude: 69.179,
      },
    },
    {
      atc_code: 'J01CA04',
      retail_price: 120,
      stock_signal: 'in_stock',
      dose_form: 'capsule',
      quantity: 20,
      pharmacy_facilities: {
        id: 'f2',
        name: 'Ibn Sina Drugs',
        latitude: 34.541,
        longitude: 69.202,
      },
    },
  ]

  it('returns prices sorted by distance', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: PRICES_ROWS, error: null }),
        }),
      }),
    })

    const caller = createCaller(ctx())
    const result = await caller.drugCatalog.getPrices({
      atcCode: 'J01CA04',
      lat: 34.526,
      lng: 69.176,
      sort: 'distance',
    })

    expect(result).toHaveLength(2)
    // Al-Shifa (34.527, 69.179) is closer to (34.526, 69.176) than Ibn Sina (34.541, 69.202)
    expect(result[0].pharmacyName).toBe('Al-Shifa Pharmacy')
    expect(result[0].retailPrice).toBe(85)
    expect(result[0].distanceKm).toBeGreaterThanOrEqual(0)
  })

  it('returns prices sorted by price ascending', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: PRICES_ROWS, error: null }),
        }),
      }),
    })

    const caller = createCaller(ctx())
    const result = await caller.drugCatalog.getPrices({
      atcCode: 'J01CA04',
      lat: 34.526,
      lng: 69.176,
      sort: 'price',
    })

    expect(result[0].retailPrice).toBe(85)
    expect(result[1].retailPrice).toBe(120)
  })

  it('returns empty array when no prices exist', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    })

    const caller = createCaller(ctx())
    const result = await caller.drugCatalog.getPrices({
      atcCode: 'J01CA04',
      lat: 34.526,
      lng: 69.176,
      sort: 'distance',
    })

    expect(result).toHaveLength(0)
  })
})

describe('drugCatalog.setPrice', () => {
  it('allows PHARMACIST to set a price', async () => {
    mockFrom.mockReturnValue({
      upsert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              atc_code: 'J01CA04',
              facility_id: 'f1',
              retail_price: 85,
              stock_signal: 'in_stock',
            },
            error: null,
          }),
        }),
      }),
    })

    const caller = createCaller(ctx(PHARMACIST_USER))
    const result = await caller.drugCatalog.setPrice({
      atcCode: 'J01CA04',
      facilityId: 'f1',
      retailPrice: 85,
      stockSignal: 'in_stock',
    })

    expect(result.retailPrice).toBe(85)
    expect(result.stockSignal).toBe('in_stock')
  })

  it('rejects DOCTOR role from setting prices', async () => {
    const caller = createCaller(ctx(DOCTOR_USER))
    await expect(
      caller.drugCatalog.setPrice({
        atcCode: 'J01CA04',
        facilityId: 'f1',
        retailPrice: 85,
        stockSignal: 'in_stock',
      })
    ).rejects.toThrow(/FORBIDDEN/)
  })
})
```

- [ ] **Step 9.2: Run to confirm new tests fail**

```bash
pnpm -F hub-api test src/__tests__/drug-catalog.test.ts
```

Expected: `getPrices` and `setPrice` tests FAIL.

- [ ] **Step 9.3: Add getPrices and setPrice to the router**

Append these procedures inside `drugCatalogRouter` in `drug-catalog.ts`:

```typescript
  /**
   * Real-time pharmacy prices for a drug near a location.
   * NOT included in /sync — online only.
   * Used by Pharmopedia Pricing & Savings tab.
   */
  getPrices: protectedProcedure
    .input(z.object({
      atcCode: z.string().min(1),
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      sort: z.enum(['distance', 'price']).default('distance'),
      limit: z.number().int().min(1).max(20).default(10),
    }))
    .query(async ({ ctx, input }): Promise<PharmacyPrice[]> => {
      const { data, error } = await ctx.supabase
        .from('pharmacy_prices')
        .select(`
          atc_code,
          retail_price,
          stock_signal,
          dose_form,
          quantity,
          pharmacy_facilities!inner (
            id,
            name,
            latitude,
            longitude
          )
        `)
        .eq('atc_code', input.atcCode)
        .limit(50)  // Fetch more than limit to allow client-side sort

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })

      const withDistance: PharmacyPrice[] = (data ?? []).map((row) => {
        const facility = row.pharmacy_facilities as {
          id: string
          name: string
          latitude: number
          longitude: number
        }
        return {
          facilityId: facility.id,
          pharmacyName: facility.name,
          distanceKm: haversineDistanceKm(
            input.lat, input.lng,
            facility.latitude, facility.longitude
          ),
          retailPrice: row.retail_price as number,
          stockSignal: row.stock_signal as 'in_stock' | 'low_stock' | 'out_of_stock',
          doseForm: row.dose_form as string | undefined,
          quantity: row.quantity as number | undefined,
        }
      })

      return sortPrices(withDistance, input.sort).slice(0, input.limit)
    }),

  /**
   * Create or update a pharmacy's retail price for a drug.
   * Pharmacist role only — facility-scoped to caller's facilityId from JWT.
   * Used by Pharmacy-Lite when pharmacist saves a drug price.
   */
  setPrice: protectedProcedure
    .input(z.object({
      atcCode: z.string().min(1),
      facilityId: z.string().uuid(),
      retailPrice: z.number().min(0),
      stockSignal: z.enum(['in_stock', 'low_stock', 'out_of_stock']),
      doseForm: z.string().optional(),
      quantity: z.number().int().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const role = ctx.user?.role ?? ''
      if (getTierForRole(role) !== 'pharmacist') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only pharmacists can set prices' })
      }

      const { data, error } = await ctx.supabase
        .from('pharmacy_prices')
        .upsert({
          atc_code: input.atcCode,
          facility_id: input.facilityId,
          retail_price: input.retailPrice,
          stock_signal: input.stockSignal,
          dose_form: input.doseForm ?? null,
          quantity: input.quantity ?? null,
          updated_by: ctx.user!.sub,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'atc_code,facility_id,dose_form',
        })
        .select('*')
        .single()

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })

      return {
        atcCode: data.atc_code as string,
        facilityId: data.facility_id as string,
        retailPrice: data.retail_price as number,
        stockSignal: data.stock_signal as 'in_stock' | 'low_stock' | 'out_of_stock',
      }
    }),
```

- [ ] **Step 9.4: Run all tests**

```bash
pnpm -F hub-api test src/__tests__/drug-catalog.test.ts
```

Expected: All tests PASS (search, getByAtcCode, sync, enrich, getPrices, setPrice).

- [ ] **Step 9.5: Commit**

```bash
git add apps/hub-api/src/trpc/routers/drug-catalog.ts apps/hub-api/src/__tests__/drug-catalog.test.ts
git commit -m "feat(hub-api): add drugCatalog.getPrices and setPrice procedures"
```

---

## Task 10: Full Test Suite + Typecheck

- [ ] **Step 10.1: Run all hub-api tests**

```bash
pnpm -F hub-api test
```

Expected: All tests pass. No regressions in existing routers.

- [ ] **Step 10.2: Run TypeScript typecheck across the monorepo**

```bash
pnpm typecheck
```

Expected: No type errors. If there are errors in `drug-catalog.ts` or `drug-catalog.service.ts`, fix them before proceeding.

- [ ] **Step 10.3: Run lint**

```bash
pnpm -F hub-api lint
```

Expected: No lint errors.

- [ ] **Step 10.4: Commit final cleanup if needed**

```bash
git add -p  # stage only lint/typecheck fixes
git commit -m "fix(hub-api): typecheck and lint cleanup for drug catalog router"
```

---

## Self-Review Checklist

- [ ] All 6 tRPC procedures are implemented: `search`, `getByAtcCode`, `sync`, `enrich`, `getPrices`, `setPrice`
- [ ] `scopeEntryToTier` strips Tier 2 fields from PATIENT/PUBLIC responses
- [ ] `scopeEntryToTier` strips Tier 3 fields from DOCTOR responses
- [ ] `enrich` rejects PATIENT role
- [ ] `enrich` rejects DOCTOR attempting to set `formularyStatus`
- [ ] `setPrice` rejects DOCTOR role
- [ ] ETL-protected fields cannot be set via `enrich`
- [ ] `sync` follows the `vocabulary.sync` version watermark pattern exactly
- [ ] All 3 migrations applied and verified
- [ ] `packages/shared-types` exports all new types
- [ ] `drugCatalog` is registered in `_app.ts`
- [ ] Audit event emitted on `enrich`
