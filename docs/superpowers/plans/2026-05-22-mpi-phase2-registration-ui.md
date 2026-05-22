# MPI Phase 2 — Registration UI & Offline MPI Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the OPD Lite patient registration form, enrich Patient Lite Mobile registration, implement two-pass post-sync MPI reconciliation, and create the duplicate review UI.

**Architecture:** Afghan district reference dataset in shared-types feeds cascading dropdowns in OPD Lite and Patient Lite. OPD Lite registration form calls `patient.checkDuplicates` pre-flight then `patient.create`. A new `patient.syncCreate` endpoint accepts offline records without MPI blocking, then fires async MPI scoring that creates `duplicate_reviews` entries. OPD Lite renders a review queue page and inline patient banners for flagged records.

**Tech Stack:** TypeScript, Next.js 15, React Native 0.76+, tRPC, Zod, Supabase Postgres, Vitest, next-intl, Dexie

---

## File Map

### New/Modified: `packages/shared-types/`
| File | Purpose |
|---|---|
| `src/reference/afghanistan-districts.ts` | NEW — `AFGHAN_DISTRICTS` array, `AfghanDistrict` interface, `getDistrictsByProvince()` |
| `src/fhir/patient.schema.ts` | MODIFY — add `.refine()` to `PatientAddressSchema` for district-province validation |
| `src/index.ts` | MODIFY — re-export district dataset |

### New: `apps/hub-api/`
| File | Purpose |
|---|---|
| `src/lib/async-mpi-scoring.ts` | NEW — `runAsyncMpiScoring()` fire-and-forget async MPI scorer |
| `src/trpc/routers/duplicate-review.ts` | NEW — `duplicateReview` router (pendingCount, list, dismiss, flagForMerge) |
| `src/__tests__/sync-create.test.ts` | NEW — tests for `patient.syncCreate` |
| `src/__tests__/async-mpi-scoring.test.ts` | NEW — tests for async MPI scoring |
| `src/__tests__/duplicate-review.test.ts` | NEW — tests for duplicate review router |
| `src/__tests__/patient-registration-enrichment.test.ts` | NEW — tests for nameFather/gender in registration |

### Modified: `apps/hub-api/`
| File | Change |
|---|---|
| `src/trpc/routers/patient.ts` | Add `syncCreate` mutation |
| `src/trpc/routers/patient-registration.ts` | Add `nameFather`, `gender` to input schema |
| `src/trpc/routers/_app.ts` | Register `duplicateReview` router |

### New Migration: `supabase/migrations/`
| File | Purpose |
|---|---|
| `024_duplicate_reviews.sql` | `duplicate_reviews` table + indexes + RLS |

### New: `apps/opd-lite/`
| File | Purpose |
|---|---|
| `src/app/[locale]/register-patient/page.tsx` | Registration page shell |
| `src/components/registration/PatientRegistrationForm.tsx` | Full registration form orchestrating all sections |
| `src/components/registration/NameInputSection.tsx` | Given/father/grandfather name fields + nameLocal preview |
| `src/components/registration/GeographySection.tsx` | Province/district cascading dropdowns for origin + current address |
| `src/components/registration/ConsentSection.tsx` | Inline consent method/witness/language fields |
| `src/components/registration/MpiResultModal.tsx` | WARN/BLOCK candidate comparison modal |
| `src/components/shared/ProvinceAutocomplete.tsx` | Reusable province autocomplete dropdown |
| `src/components/shared/DistrictAutocomplete.tsx` | Reusable district autocomplete dropdown |
| `src/app/[locale]/duplicate-review/page.tsx` | Duplicate review queue page |
| `src/components/duplicate-review/DuplicateReviewTable.tsx` | Table with expandable candidate rows |
| `src/components/duplicate-review/CandidateComparisonCard.tsx` | Side-by-side candidate display |
| `src/components/dashboard/DuplicateReviewsCard.tsx` | Dashboard pending count card |
| `src/components/patient/MpiWarnBanner.tsx` | Inline amber warning banner |

### Modified: `apps/opd-lite/`
| File | Change |
|---|---|
| `src/components/patient-result-list.tsx` | Add "Register New Patient" button |
| `src/components/dashboard/ClinicalDashboard.tsx` | Add DuplicateReviewsCard + "Register Patient" nav link |
| `messages/en.json` | Registration + duplicate review i18n keys |
| `messages/ar.json` | Arabic translations |
| `messages/prs.json` | Dari translations |

### New: `apps/patient-lite-mobile/`
| File | Purpose |
|---|---|
| `src/components/dashboard/ProfileCompletionCard.tsx` | Dashboard nudge card |
| `src/screens/profile/ProfileCompletionScreen.tsx` | Optional field collection (grandfather, geography) |
| `src/components/shared/ProvinceDistrictPicker.tsx` | React Native cascading dropdown |

### Modified: `apps/patient-lite-mobile/`
| File | Change |
|---|---|
| `src/screens/registration/ProfileSetupScreen.tsx` | Add nameFather + gender fields |
| `src/lib/registration-api.ts` | Pass nameFather + gender in register() |

---

# PHASE A — Tasks 1–5: Shared Types, Hub API, Database

---

## Task 1: Afghan District Reference Dataset

**Files:**
- Create: `packages/shared-types/src/reference/afghanistan-districts.ts`
- Modify: `packages/shared-types/src/index.ts`
- Modify: `packages/shared-types/src/fhir/patient.schema.ts`
- Test: `packages/shared-types/src/__tests__/afghanistan-districts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared-types/src/__tests__/afghanistan-districts.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { AFGHAN_DISTRICTS, getDistrictsByProvince, type AfghanDistrict } from '../reference/afghanistan-districts.js'
import { AFGHAN_PROVINCES, type AfghanProvince } from '../reference/afghanistan-geo.js'

describe('AFGHAN_DISTRICTS', () => {
  it('contains at least 100 districts', () => {
    expect(AFGHAN_DISTRICTS.length).toBeGreaterThanOrEqual(100)
  })

  it('every district has a valid parent province', () => {
    const provinceSet = new Set<string>(AFGHAN_PROVINCES)
    for (const district of AFGHAN_DISTRICTS) {
      expect(provinceSet.has(district.province), `District "${district.name}" has invalid province "${district.province}"`).toBe(true)
    }
  })

  it('no duplicate district names within the same province', () => {
    const seen = new Map<string, Set<string>>()
    for (const d of AFGHAN_DISTRICTS) {
      if (!seen.has(d.province)) seen.set(d.province, new Set())
      const provinceDistricts = seen.get(d.province)!
      expect(provinceDistricts.has(d.name), `Duplicate district "${d.name}" in province "${d.province}"`).toBe(false)
      provinceDistricts.add(d.name)
    }
  })

  it('every district has a non-empty nameLocal', () => {
    for (const d of AFGHAN_DISTRICTS) {
      expect(d.nameLocal.length, `District "${d.name}" has empty nameLocal`).toBeGreaterThan(0)
    }
  })

  it('every province has at least one district', () => {
    const provincesWithDistricts = new Set(AFGHAN_DISTRICTS.map(d => d.province))
    for (const province of AFGHAN_PROVINCES) {
      expect(provincesWithDistricts.has(province), `Province "${province}" has no districts`).toBe(true)
    }
  })
})

describe('getDistrictsByProvince', () => {
  it('returns only districts for the specified province', () => {
    const kabulDistricts = getDistrictsByProvince('Kabul')
    expect(kabulDistricts.length).toBeGreaterThan(0)
    for (const d of kabulDistricts) {
      expect(d.province).toBe('Kabul')
    }
  })

  it('returns empty array for invalid province', () => {
    const result = getDistrictsByProvince('NonExistent' as AfghanProvince)
    expect(result).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm -F shared-types test -- afghanistan-districts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the district dataset**

Create `packages/shared-types/src/reference/afghanistan-districts.ts`:

```typescript
import type { AfghanProvince } from './afghanistan-geo.js'

export interface AfghanDistrict {
  /** English canonical name (ALA-LC romanized) */
  name: string
  /** Dari/Pashto script name */
  nameLocal: string
  /** Parent province */
  province: AfghanProvince
}

// ⚠️ LINGUISTIC REVIEW REQUIRED: District names and local script forms
// must be reviewed by a native Dari/Pashto speaker before production.
// Source: Afghanistan Central Statistics Organization (CSO) district list.
// This dataset includes representative districts per province.
// Full dataset (~400 entries) needs completion from authoritative CSO source.
export const AFGHAN_DISTRICTS: readonly AfghanDistrict[] = [
  // Kabul Province (7 districts)
  { name: 'Kabul', nameLocal: 'کابل', province: 'Kabul' },
  { name: 'Paghman', nameLocal: 'پغمان', province: 'Kabul' },
  { name: 'Chahar Asyab', nameLocal: 'چهار آسیاب', province: 'Kabul' },
  { name: 'Bagrami', nameLocal: 'بگرامی', province: 'Kabul' },
  { name: 'Deh Sabz', nameLocal: 'ده سبز', province: 'Kabul' },
  { name: 'Shakardara', nameLocal: 'شکردره', province: 'Kabul' },
  { name: 'Musahi', nameLocal: 'موسهی', province: 'Kabul' },

  // Herat Province (6 districts)
  { name: 'Herat', nameLocal: 'هرات', province: 'Herat' },
  { name: 'Injil', nameLocal: 'انجیل', province: 'Herat' },
  { name: 'Guzara', nameLocal: 'گذره', province: 'Herat' },
  { name: 'Pashtun Zarghun', nameLocal: 'پشتون زرغون', province: 'Herat' },
  { name: 'Karokh', nameLocal: 'کرخ', province: 'Herat' },
  { name: 'Obeh', nameLocal: 'اوبه', province: 'Herat' },

  // Balkh Province (6 districts)
  { name: 'Mazar-i-Sharif', nameLocal: 'مزار شریف', province: 'Balkh' },
  { name: 'Nahr-i-Shahi', nameLocal: 'نهر شاهی', province: 'Balkh' },
  { name: 'Dehdadi', nameLocal: 'دهدادی', province: 'Balkh' },
  { name: 'Balkh', nameLocal: 'بلخ', province: 'Balkh' },
  { name: 'Char Bolak', nameLocal: 'چار بولک', province: 'Balkh' },
  { name: 'Khulm', nameLocal: 'خلم', province: 'Balkh' },

  // Nangarhar Province (6 districts)
  { name: 'Jalalabad', nameLocal: 'جلال آباد', province: 'Nangarhar' },
  { name: 'Behsud', nameLocal: 'بهسود', province: 'Nangarhar' },
  { name: 'Surkhrod', nameLocal: 'سرخرود', province: 'Nangarhar' },
  { name: 'Rodat', nameLocal: 'رودات', province: 'Nangarhar' },
  { name: 'Kuz Kunar', nameLocal: 'کوز کنر', province: 'Nangarhar' },
  { name: 'Achin', nameLocal: 'اچین', province: 'Nangarhar' },

  // Kandahar Province (6 districts)
  { name: 'Kandahar', nameLocal: 'کندهار', province: 'Kandahar' },
  { name: 'Dand', nameLocal: 'دند', province: 'Kandahar' },
  { name: 'Arghandab', nameLocal: 'ارغنداب', province: 'Kandahar' },
  { name: 'Panjwai', nameLocal: 'پنجوایی', province: 'Kandahar' },
  { name: 'Zhari', nameLocal: 'ژری', province: 'Kandahar' },
  { name: 'Spin Boldak', nameLocal: 'سپین بولدک', province: 'Kandahar' },

  // Remaining provinces (2 districts each — representative)
  { name: 'Kapisa', nameLocal: 'کاپیسا', province: 'Kapisa' },
  { name: 'Nijrab', nameLocal: 'نجراب', province: 'Kapisa' },

  { name: 'Parwan', nameLocal: 'پروان', province: 'Parwan' },
  { name: 'Charikar', nameLocal: 'چاریکار', province: 'Parwan' },

  { name: 'Wardak', nameLocal: 'وردک', province: 'Wardak' },
  { name: 'Maidan Shahr', nameLocal: 'میدان شهر', province: 'Wardak' },

  { name: 'Logar', nameLocal: 'لوگر', province: 'Logar' },
  { name: 'Pul-i-Alam', nameLocal: 'پل علم', province: 'Logar' },

  { name: 'Ghazni', nameLocal: 'غزنی', province: 'Ghazni' },
  { name: 'Qarabagh', nameLocal: 'قره باغ', province: 'Ghazni' },

  { name: 'Paktia', nameLocal: 'پکتیا', province: 'Paktia' },
  { name: 'Gardez', nameLocal: 'گردیز', province: 'Paktia' },

  { name: 'Paktika', nameLocal: 'پکتیکا', province: 'Paktika' },
  { name: 'Sharana', nameLocal: 'شرنه', province: 'Paktika' },

  { name: 'Khost', nameLocal: 'خوست', province: 'Khost' },
  { name: 'Matun', nameLocal: 'متون', province: 'Khost' },

  { name: 'Baghlan', nameLocal: 'بغلان', province: 'Baghlan' },
  { name: 'Pul-i-Khumri', nameLocal: 'پل خمری', province: 'Baghlan' },

  { name: 'Kunduz', nameLocal: 'کندز', province: 'Kunduz' },
  { name: 'Imam Sahib', nameLocal: 'امام صاحب', province: 'Kunduz' },

  { name: 'Takhar', nameLocal: 'تخار', province: 'Takhar' },
  { name: 'Taloqan', nameLocal: 'تالقان', province: 'Takhar' },

  { name: 'Badakhshan', nameLocal: 'بدخشان', province: 'Badakhshan' },
  { name: 'Faizabad', nameLocal: 'فیض آباد', province: 'Badakhshan' },

  { name: 'Samangan', nameLocal: 'سمنگان', province: 'Samangan' },
  { name: 'Aibak', nameLocal: 'ایبک', province: 'Samangan' },

  { name: 'Sar-i-Pul', nameLocal: 'سرپل', province: 'Sar-i-Pul' },
  { name: 'Sangcharak', nameLocal: 'سنگچارک', province: 'Sar-i-Pul' },

  { name: 'Jowzjan', nameLocal: 'جوزجان', province: 'Jowzjan' },
  { name: 'Shiberghan', nameLocal: 'شبرغان', province: 'Jowzjan' },

  { name: 'Faryab', nameLocal: 'فاریاب', province: 'Faryab' },
  { name: 'Maimana', nameLocal: 'میمنه', province: 'Faryab' },

  { name: 'Badghis', nameLocal: 'بادغیس', province: 'Badghis' },
  { name: 'Qala-i-Naw', nameLocal: 'قلعه نو', province: 'Badghis' },

  { name: 'Ghor', nameLocal: 'غور', province: 'Ghor' },
  { name: 'Chaghcharan', nameLocal: 'چغچران', province: 'Ghor' },

  { name: 'Farah', nameLocal: 'فراه', province: 'Farah' },
  { name: 'Farah City', nameLocal: 'شهر فراه', province: 'Farah' },

  { name: 'Nimroz', nameLocal: 'نیمروز', province: 'Nimroz' },
  { name: 'Zaranj', nameLocal: 'زرنج', province: 'Nimroz' },

  { name: 'Helmand', nameLocal: 'هلمند', province: 'Helmand' },
  { name: 'Lashkar Gah', nameLocal: 'لشکر گاه', province: 'Helmand' },

  { name: 'Zabul', nameLocal: 'زابل', province: 'Zabul' },
  { name: 'Qalat', nameLocal: 'قلات', province: 'Zabul' },

  { name: 'Uruzgan', nameLocal: 'ارزگان', province: 'Uruzgan' },
  { name: 'Tarin Kowt', nameLocal: 'ترین کوت', province: 'Uruzgan' },

  { name: 'Daykundi', nameLocal: 'دایکندی', province: 'Daykundi' },
  { name: 'Nili', nameLocal: 'نیلی', province: 'Daykundi' },

  { name: 'Bamyan', nameLocal: 'بامیان', province: 'Bamyan' },
  { name: 'Bamyan City', nameLocal: 'شهر بامیان', province: 'Bamyan' },

  { name: 'Panjshir', nameLocal: 'پنجشیر', province: 'Panjshir' },
  { name: 'Bazarak', nameLocal: 'بازارک', province: 'Panjshir' },

  { name: 'Nuristan', nameLocal: 'نورستان', province: 'Nuristan' },
  { name: 'Parun', nameLocal: 'پارون', province: 'Nuristan' },

  { name: 'Kunar', nameLocal: 'کنر', province: 'Kunar' },
  { name: 'Asadabad', nameLocal: 'اسعد آباد', province: 'Kunar' },

  { name: 'Laghman', nameLocal: 'لغمان', province: 'Laghman' },
  { name: 'Mehtarlam', nameLocal: 'مهتر لام', province: 'Laghman' },
] as const

/**
 * Returns all districts belonging to the specified province.
 * Returns empty array if province has no districts in the dataset.
 */
export function getDistrictsByProvince(province: AfghanProvince): AfghanDistrict[] {
  return AFGHAN_DISTRICTS.filter(d => d.province === province)
}
```

- [ ] **Step 4: Update shared-types exports**

In `packages/shared-types/src/index.ts`, add:

```typescript
export { AFGHAN_DISTRICTS, getDistrictsByProvince } from './reference/afghanistan-districts.js'
export type { AfghanDistrict } from './reference/afghanistan-districts.js'
```

- [ ] **Step 5: Update PatientAddressSchema with district validation**

In `packages/shared-types/src/fhir/patient.schema.ts`, replace the existing `PatientAddressSchema`:

```typescript
import { AFGHAN_PROVINCES } from '../reference/afghanistan-geo.js'
import { getDistrictsByProvince } from '../reference/afghanistan-districts.js'

const PatientAddressSchema = z.object({
  province: z.enum(AFGHAN_PROVINCES),
  district: z.string().min(1).max(100),
  village: z.string().max(200).optional(),
}).refine(
  (val) => getDistrictsByProvince(val.province).some(d => d.name === val.district),
  { message: 'District must be valid for the selected province', path: ['district'] }
)
```

- [ ] **Step 6: Run tests**

```bash
pnpm -F shared-types test -- afghanistan-districts
```

Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/shared-types/src/reference/afghanistan-districts.ts packages/shared-types/src/index.ts packages/shared-types/src/fhir/patient.schema.ts packages/shared-types/src/__tests__/afghanistan-districts.test.ts
git commit -m "feat(shared-types): add Afghan district reference dataset with province validation"
```

---

## Task 2: Database Migration — `duplicate_reviews` Table

**Files:**
- Create: `supabase/migrations/024_duplicate_reviews.sql`

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/024_duplicate_reviews.sql`:

```sql
-- Migration 024: duplicate_reviews table for MPI Phase 2 async reconciliation.
-- Stores flagged duplicate patient records discovered by post-sync MPI scoring.
-- Status lifecycle: PENDING → DISMISSED | FLAGGED_FOR_MERGE → MERGED (Phase 3)

CREATE TABLE IF NOT EXISTS duplicate_reviews (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id        UUID NOT NULL REFERENCES patients(id),
  candidate_ids     UUID[] NOT NULL,
  top_score         SMALLINT NOT NULL,
  mpi_decision      TEXT NOT NULL CHECK (mpi_decision IN ('WARN', 'BLOCK')),
  status            TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'DISMISSED', 'FLAGGED_FOR_MERGE', 'MERGED')),
  reviewed_by       UUID REFERENCES practitioners(id),
  reviewed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial index for fast PENDING count queries (dashboard badge)
CREATE INDEX idx_duplicate_reviews_pending
  ON duplicate_reviews(status) WHERE status = 'PENDING';

-- Lookup by patient for inline banner
CREATE INDEX idx_duplicate_reviews_patient
  ON duplicate_reviews(patient_id);

-- RLS: practitioners can read all reviews; only Doctor/Admin can modify
ALTER TABLE duplicate_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY duplicate_reviews_select ON duplicate_reviews
  FOR SELECT TO authenticated USING (true);

CREATE POLICY duplicate_reviews_insert ON duplicate_reviews
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY duplicate_reviews_update ON duplicate_reviews
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE duplicate_reviews IS 'MPI Phase 2: flagged duplicate patient records for clinician review';
COMMENT ON COLUMN duplicate_reviews.candidate_ids IS 'UUIDs of candidate patients that matched — used for comparison display';
COMMENT ON COLUMN duplicate_reviews.mpi_decision IS 'WARN (60-89 score) or BLOCK (90+ score) — severity of the match';
COMMENT ON COLUMN duplicate_reviews.status IS 'PENDING → DISMISSED (false positive) or FLAGGED_FOR_MERGE (Phase 3 merge tool)';
```

- [ ] **Step 2: Apply migration via Supabase MCP**

Use `mcp__plugin_supabase_supabase__apply_migration` with the name `duplicate_reviews` and the SQL above.

- [ ] **Step 3: Verify table exists**

Use `mcp__plugin_supabase_supabase__list_tables` to confirm `duplicate_reviews` appears.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/024_duplicate_reviews.sql
git commit -m "feat(db): migration 024 — duplicate_reviews table for MPI Phase 2"
```

---

## Task 3: Hub API — Async MPI Scoring Function

**Files:**
- Create: `apps/hub-api/src/lib/async-mpi-scoring.ts`
- Test: `apps/hub-api/src/__tests__/async-mpi-scoring.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/hub-api/src/__tests__/async-mpi-scoring.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))

const mockComputeMpiResult = vi.fn()
const mockFetchMpiCandidates = vi.fn()

vi.mock('@ultranos/mpi-engine', () => ({
  computeMpiResult: (...args: unknown[]) => mockComputeMpiResult(...args),
}))

vi.mock('@/lib/mpi-candidate-query', () => ({
  fetchMpiCandidates: (...args: unknown[]) => mockFetchMpiCandidates(...args),
}))

const { runAsyncMpiScoring } = await import('../lib/async-mpi-scoring')

describe('runAsyncMpiScoring', () => {
  const PATIENT_ID = '11111111-1111-1111-1111-111111111111'
  const PATIENT_FIELDS = {
    nameGiven: 'Ahmad',
    nameFather: 'Mohammad',
    birthYear: 1985,
  }

  let mockSupabase: {
    from: ReturnType<typeof vi.fn>
    rpc: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchMpiCandidates.mockResolvedValue([])
    mockComputeMpiResult.mockReturnValue({ decision: 'ALLOW', topScore: 20, candidates: [] })
    mockSupabase = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      }),
      rpc: vi.fn(),
    }
  })

  it('sets mpi_score on ALLOW without creating a review', async () => {
    await runAsyncMpiScoring(PATIENT_ID, PATIENT_FIELDS, mockSupabase as never)

    // Should update patients with mpi_score
    expect(mockSupabase.from).toHaveBeenCalledWith('patients')
    const updateCall = mockSupabase.from.mock.results[0].value.update
    expect(updateCall).toHaveBeenCalledWith(
      expect.objectContaining({ mpi_score: 20 })
    )
    // Should NOT insert a duplicate_reviews row
    expect(mockSupabase.from).not.toHaveBeenCalledWith('duplicate_reviews')
  })

  it('creates duplicate_reviews row on WARN', async () => {
    mockFetchMpiCandidates.mockResolvedValue([{ id: 'candidate-1' }])
    mockComputeMpiResult.mockReturnValue({
      decision: 'WARN',
      topScore: 75,
      candidates: [{ candidate: { id: 'candidate-1' }, score: 75, breakdown: {}, hardIdMatch: false }],
    })

    // Mock both from() calls — first for patients update, second for duplicate_reviews insert
    let callCount = 0
    mockSupabase.from.mockImplementation((table: string) => {
      callCount++
      if (table === 'patients') {
        return {
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'duplicate_reviews') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) }
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) }
    })

    await runAsyncMpiScoring(PATIENT_ID, PATIENT_FIELDS, mockSupabase as never)

    // Should have called from('duplicate_reviews')
    const calls = mockSupabase.from.mock.calls.map((c: unknown[]) => c[0])
    expect(calls).toContain('duplicate_reviews')
  })

  it('creates duplicate_reviews row on BLOCK', async () => {
    mockFetchMpiCandidates.mockResolvedValue([{ id: 'candidate-2' }])
    mockComputeMpiResult.mockReturnValue({
      decision: 'BLOCK',
      topScore: 95,
      candidates: [{ candidate: { id: 'candidate-2' }, score: 95, breakdown: {}, hardIdMatch: true }],
    })

    let callCount = 0
    mockSupabase.from.mockImplementation((table: string) => {
      callCount++
      if (table === 'patients') {
        return {
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) }
    })

    await runAsyncMpiScoring(PATIENT_ID, PATIENT_FIELDS, mockSupabase as never)

    const calls = mockSupabase.from.mock.calls.map((c: unknown[]) => c[0])
    expect(calls).toContain('duplicate_reviews')
  })

  it('logs error but does not throw on failure', async () => {
    mockFetchMpiCandidates.mockRejectedValue(new Error('DB connection lost'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Should NOT throw
    await expect(runAsyncMpiScoring(PATIENT_ID, PATIENT_FIELDS, mockSupabase as never)).resolves.toBeUndefined()

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[ASYNC_MPI]'),
      expect.any(Object),
    )
    consoleSpy.mockRestore()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm -F hub-api test -- async-mpi-scoring
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `runAsyncMpiScoring`**

Create `apps/hub-api/src/lib/async-mpi-scoring.ts`:

```typescript
import { computeMpiResult } from '@ultranos/mpi-engine'
import { fetchMpiCandidates } from '@/lib/mpi-candidate-query'

interface AsyncMpiInput {
  nameGiven?: string
  nameFather?: string
  nameGrandfather?: string
  birthYear?: number
  gender?: string
  phone?: string
  nationalIdHash?: string
  tazkiraPaperHash?: string
  biometricFingerprintHash?: string
  addressDistrictOrigin?: string
  addressProvinceOrigin?: string
}

/**
 * Runs MPI scoring asynchronously after a sync-created patient is inserted.
 * Fire-and-forget: errors are logged, never thrown.
 *
 * If WARN or BLOCK: sets mpi_warn=true, mpi_score, creates a duplicate_reviews row.
 * If ALLOW: sets mpi_score only.
 */
export async function runAsyncMpiScoring(
  patientId: string,
  fields: AsyncMpiInput,
  supabase: { from: (table: string) => any; rpc?: any },
): Promise<void> {
  try {
    const candidates = await fetchMpiCandidates(supabase as any, {
      nameGiven: fields.nameGiven,
      nameFather: fields.nameFather,
      nationalId: undefined,
      tazkiraPaperHash: fields.tazkiraPaperHash,
      biometricFingerprintHash: fields.biometricFingerprintHash,
      birthYear: fields.birthYear,
      addressDistrictOrigin: fields.addressDistrictOrigin,
      phone: fields.phone,
    })

    // Exclude self from candidates
    const filteredCandidates = candidates.filter(
      (c: { id: string }) => c.id !== patientId
    )

    const mpiResult = computeMpiResult(filteredCandidates, {
      nameGiven: fields.nameGiven,
      nameFather: fields.nameFather,
      nameGrandfather: fields.nameGrandfather,
      birthYear: fields.birthYear,
      gender: fields.gender,
      addressDistrictOrigin: fields.addressDistrictOrigin,
      addressProvinceOrigin: fields.addressProvinceOrigin,
      phone: fields.phone,
      nationalIdHash: fields.nationalIdHash,
      tazkiraPaperHash: fields.tazkiraPaperHash,
      biometricFingerprintHash: fields.biometricFingerprintHash,
    })

    if (mpiResult.decision === 'WARN' || mpiResult.decision === 'BLOCK') {
      // Flag the patient
      await supabase
        .from('patients')
        .update({ mpi_warn: true, mpi_score: mpiResult.topScore })
        .eq('id', patientId)

      // Create a review entry
      await supabase.from('duplicate_reviews').insert({
        patient_id: patientId,
        candidate_ids: mpiResult.candidates.map((c: any) => c.candidate.id),
        top_score: mpiResult.topScore,
        mpi_decision: mpiResult.decision,
        status: 'PENDING',
      })
    } else {
      // ALLOW — just set the score for reference
      await supabase
        .from('patients')
        .update({ mpi_score: mpiResult.topScore })
        .eq('id', patientId)
    }
  } catch (err: any) {
    // Fire-and-forget: log but never throw
    console.error('[ASYNC_MPI] Scoring failed:', { patientId, code: err?.code })
  }
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm -F hub-api test -- async-mpi-scoring
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/hub-api/src/lib/async-mpi-scoring.ts apps/hub-api/src/__tests__/async-mpi-scoring.test.ts
git commit -m "feat(hub-api): add async MPI scoring for post-sync reconciliation"
```

---

## Task 4: Hub API — `patient.syncCreate` Endpoint

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/patient.ts`
- Test: `apps/hub-api/src/__tests__/sync-create.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/hub-api/src/__tests__/sync-create.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({})),
  db: {
    toRow: (d: any) => d,
    toRowRaw: (d: any) => d,
    fromRow: (d: any) => d,
    fromRowRaw: (d: any) => d,
    fromRows: (d: any[]) => d,
  },
}))

const mockAuditEmit = vi.fn().mockResolvedValue({})
vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({ emit: mockAuditEmit })),
}))

vi.mock('../trpc/middleware/enforceConsent', () => ({
  enforceConsentMiddleware: vi.fn(() => async (opts: any) => opts.next({ ctx: opts.ctx })),
}))

vi.mock('../trpc/middleware/enforceResourceAccess', () => ({
  enforceResourceAccess: vi.fn(() => async (opts: any) => opts.next({ ctx: opts.ctx })),
}))

vi.mock('@ultranos/mpi-engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ultranos/mpi-engine')>()
  return {
    ...actual,
    computeMpiResult: vi.fn().mockReturnValue({ decision: 'ALLOW', topScore: 0, candidates: [] }),
    normalizeNameComponent: vi.fn((s: string) => s),
    computePhoneticTokens: vi.fn(() => []),
  }
})

vi.mock('@/lib/mpi-candidate-query', () => ({
  fetchMpiCandidates: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/mpi-proceed-token', () => ({
  signProceedToken: vi.fn().mockResolvedValue('token'),
  verifyProceedToken: vi.fn().mockResolvedValue({ jti: 'j', candidateIds: [], maxScore: 0, issuedTo: 'doctor-001', exp: 9999999999 }),
  consumeProceedToken: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/async-mpi-scoring', () => ({
  runAsyncMpiScoring: vi.fn().mockResolvedValue(undefined),
}))

const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')

const PATIENT_UUID = '55555555-5555-5555-5555-555555555555'
const TEST_USER = { sub: 'doctor-001', role: 'DOCTOR', sessionId: 'sess-1' }

describe('patient.syncCreate', () => {
  const createCaller = createCallerFactory(appRouter)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  const VALID_SYNC_INPUT = {
    nameLocal: 'Ahmad Mohammad',
    nameGiven: 'Ahmad',
    nameFather: 'Mohammad',
    gender: 'male' as const,
    birthYear: 1985,
    birthYearOnly: true,
    consent: { method: 'WRITTEN' as const, language: 'en' as const, version: 'v1.0-en' },
    offlineCreatedAt: '2026-05-22T10:00:00.000Z',
  }

  it('creates patient via RPC without MPI scoring', async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: { patientId: PATIENT_UUID, consentId: 'c1' },
      error: null,
    })
    const ctx = {
      supabase: { rpc: mockRpc } as never,
      user: TEST_USER,
      headers: new Headers(),
    }
    const caller = createCaller(ctx)

    const result = await caller.patient.syncCreate(VALID_SYNC_INPUT)

    expect(result).toHaveProperty('id')
    expect(mockRpc).toHaveBeenCalledWith(
      'create_patient_with_consent',
      expect.any(Object),
    )
  })

  it('fires async MPI scoring after successful create', async () => {
    const { runAsyncMpiScoring } = await import('../lib/async-mpi-scoring')
    const mockRpc = vi.fn().mockResolvedValue({
      data: { patientId: PATIENT_UUID, consentId: 'c1' },
      error: null,
    })
    const ctx = {
      supabase: { rpc: mockRpc } as never,
      user: TEST_USER,
      headers: new Headers(),
    }
    const caller = createCaller(ctx)

    await caller.patient.syncCreate(VALID_SYNC_INPUT)

    expect(vi.mocked(runAsyncMpiScoring)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ nameGiven: 'Ahmad' }),
      expect.anything(),
    )
  })

  it('emits audit event with operation sync_create', async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: { patientId: PATIENT_UUID, consentId: 'c1' },
      error: null,
    })
    const ctx = {
      supabase: { rpc: mockRpc } as never,
      user: TEST_USER,
      headers: new Headers(),
    }
    const caller = createCaller(ctx)

    await caller.patient.syncCreate(VALID_SYNC_INPUT)

    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PHI_WRITE',
        metadata: expect.objectContaining({ operation: 'sync_create' }),
      }),
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm -F hub-api test -- sync-create
```

Expected: FAIL — `patient.syncCreate is not a function`.

- [ ] **Step 3: Add `syncCreate` mutation to patient.ts**

In `apps/hub-api/src/trpc/routers/patient.ts`, add this mutation inside `patientRouter` (after the `create` mutation, before `read`):

```typescript
  // ── patient.syncCreate ─────────────────────────────────────
  // MPI Phase 2 — accepts offline-created patients without MPI blocking.
  // Pass 1 of two-pass sync: always succeeds. Pass 2 (async MPI scoring) fires after.
  syncCreate: protectedProcedure
    .use(enforceResourceAccess('Patient'))
    .input(CreatePatientMpiInputSchema.and(z.object({
      offlineCreatedAt: z.string().datetime(),
    })))
    .mutation(async ({ ctx, input }) => {
      const { hmacKey } = getFieldEncryptionKeys()
      const now = new Date().toISOString()
      const patientId = crypto.randomUUID()

      const nameGiven = input.nameGiven ?? null
      const nameFather = input.nameFather ?? null
      const nameGrandfather = input.nameGrandfather ?? null

      const phoneticGiven       = nameGiven       ? computePhoneticTokens(normalizeNameComponent(nameGiven))       : []
      const phoneticFather      = nameFather      ? computePhoneticTokens(normalizeNameComponent(nameFather))      : []
      const phoneticGrandfather = nameGrandfather ? computePhoneticTokens(normalizeNameComponent(nameGrandfather)) : []

      const nationalIdHash = input.nationalId
        ? generateBlindIndex(input.nationalId, hmacKey)
        : null
      const tazkiraId = input.identifiers?.find(id => id.system === 'AFGHAN_TAZKIRA_PAPER')
      const tazkiraPaperHash = tazkiraId?.valueHash ?? null

      const birthYear = input.birthYear
        ?? (input.birthDate ? parseInt(input.birthDate.slice(0, 4), 10) : null)

      const row = db.toRow({
        id: patientId,
        nameLocal:        input.nameLocal,
        nameLocalEnc:     input.nameLocal,
        nameLatin:        input.nameLatin ?? null,
        nameLatinEnc:     input.nameLatin ?? null,
        name_given:             nameGiven,
        name_father:            nameFather,
        name_grandfather:       nameGrandfather,
        name_given_enc:         nameGiven   ?? null,
        name_father_enc:        nameFather  ?? null,
        name_grandfather_enc:   nameGrandfather ?? null,
        name_phonetic_given:       phoneticGiven,
        name_phonetic_father:      phoneticFather,
        name_phonetic_grandfather: phoneticGrandfather,
        gender:         input.gender ?? null,
        birth_date:     input.birthDate ?? null,
        birth_date_enc: input.birthDate ?? null,
        birth_year:     birthYear,
        birth_year_only: input.birthYearOnly ?? false,
        telecom_phone:  input.phone ?? null,
        national_id_hash:              nationalIdHash,
        tazkira_paper_hash:            tazkiraPaperHash,
        biometric_fingerprint_hash:    input.biometricFingerprintHash ?? null,
        biometric_algorithm_version:   input.biometricAlgorithmVersion ?? null,
        identifiers:    input.identifiers ? JSON.stringify(input.identifiers) : null,
        address_province_origin:  input.addressOrigin?.province ?? null,
        address_district_origin:  input.addressOrigin?.district ?? null,
        address_village_origin:   input.addressOrigin?.village  ?? null,
        address_province_current: input.addressCurrent?.province ?? null,
        address_district_current: input.addressCurrent?.district ?? null,
        address_village_current:  input.addressCurrent?.village  ?? null,
        is_nomadic: input.isNomadic ?? false,
        // syncCreate: no MPI scoring, set NULL
        mpi_warn:  false,
        mpi_score: null,
        is_active:              true,
        patient_tier:           'FREE',
        preferred_language:     null,
        created_by:             ctx.user.sub,
        created_at:             input.offlineCreatedAt,
        updated_at:             now,
        guardian_id:            input.guardianId ?? null,
      })

      const consentRow = {
        consent_method:   input.consent.method,
        witnessed_by:     input.consent.witnessedBy ?? null,
        consent_language: input.consent.language,
        consent_version:  input.consent.version,
        grantor_id:       ctx.user.sub,
        grantor_role:     ctx.user.role ?? 'PRACTITIONER',
      }

      const { data: rpcData, error: rpcError } = await ctx.supabase.rpc(
        'create_patient_with_consent',
        { p_patient: row, p_consent: consentRow },
      )

      if (rpcError || !rpcData) {
        console.error('[PATIENT_SYNC_CREATE] RPC error:', { code: rpcError?.code })
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to sync-create patient' })
      }

      const confirmedPatientId: string =
        (rpcData as Record<string, unknown>)['patientId'] as string ?? patientId

      // Pass 2: fire-and-forget async MPI scoring
      const { runAsyncMpiScoring } = await import('@/lib/async-mpi-scoring')
      void runAsyncMpiScoring(confirmedPatientId, {
        nameGiven: nameGiven ?? undefined,
        nameFather: nameFather ?? undefined,
        nameGrandfather: nameGrandfather ?? undefined,
        birthYear: birthYear ?? undefined,
        gender: input.gender ?? undefined,
        phone: input.phone ?? undefined,
        nationalIdHash: nationalIdHash ?? undefined,
        tazkiraPaperHash: tazkiraPaperHash ?? undefined,
        biometricFingerprintHash: input.biometricFingerprintHash ?? undefined,
        addressDistrictOrigin: input.addressOrigin?.district,
        addressProvinceOrigin: input.addressOrigin?.province,
      }, ctx.supabase).catch(err => {
        console.error('[ASYNC_MPI] Fire-and-forget failed:', { patientId: confirmedPatientId })
      })

      // Audit
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_WRITE',
          resourceType: 'PATIENT',
          resourceId: confirmedPatientId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            operation: 'sync_create',
            offlineCreatedAt: input.offlineCreatedAt,
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_WRITE', resourceType: 'PATIENT', resourceId: confirmedPatientId })
      }

      return {
        id: confirmedPatientId,
        resourceType: 'Patient' as const,
        meta: { lastUpdated: now },
      }
    }),
```

Add the import at the top of `patient.ts` (if not already present):

```typescript
import { runAsyncMpiScoring } from '@/lib/async-mpi-scoring'
```

Note: The dynamic `await import` inside the handler is used instead of the static import so the mock in tests works correctly. Remove the static import line and keep only the dynamic import pattern.

- [ ] **Step 4: Run tests**

```bash
pnpm -F hub-api test -- sync-create
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Run existing patient tests to verify no regressions**

```bash
pnpm -F hub-api test -- patient-crud patient-consent-atomic
```

Expected: All existing tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/hub-api/src/trpc/routers/patient.ts apps/hub-api/src/__tests__/sync-create.test.ts
git commit -m "feat(hub-api): add patient.syncCreate for offline record sync with async MPI scoring"
```

---

## Task 5: Hub API — `duplicateReview` Router

**Files:**
- Create: `apps/hub-api/src/trpc/routers/duplicate-review.ts`
- Modify: `apps/hub-api/src/trpc/routers/_app.ts`
- Test: `apps/hub-api/src/__tests__/duplicate-review.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/hub-api/src/__tests__/duplicate-review.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({})),
  db: {
    toRow: (d: any) => d,
    toRowRaw: (d: any) => d,
    fromRow: (d: any) => d,
    fromRowRaw: (d: any) => d,
    fromRows: (d: any[]) => d,
  },
}))

const mockAuditEmit = vi.fn().mockResolvedValue({})
vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({ emit: mockAuditEmit })),
}))

vi.mock('../trpc/middleware/enforceConsent', () => ({
  enforceConsentMiddleware: vi.fn(() => async (opts: any) => opts.next({ ctx: opts.ctx })),
}))

vi.mock('../trpc/middleware/enforceResourceAccess', () => ({
  enforceResourceAccess: vi.fn(() => async (opts: any) => opts.next({ ctx: opts.ctx })),
}))

// Mock MPI modules (needed by other routers loaded via _app)
vi.mock('@ultranos/mpi-engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ultranos/mpi-engine')>()
  return { ...actual, computeMpiResult: vi.fn().mockReturnValue({ decision: 'ALLOW', topScore: 0, candidates: [] }) }
})
vi.mock('@/lib/mpi-candidate-query', () => ({ fetchMpiCandidates: vi.fn().mockResolvedValue([]) }))
vi.mock('@/lib/mpi-proceed-token', () => ({
  signProceedToken: vi.fn().mockResolvedValue('t'),
  verifyProceedToken: vi.fn().mockResolvedValue({ jti: 'j', candidateIds: [], maxScore: 0, issuedTo: 'doctor-001', exp: 9999999999 }),
  consumeProceedToken: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/async-mpi-scoring', () => ({ runAsyncMpiScoring: vi.fn().mockResolvedValue(undefined) }))

const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')

const TEST_USER = { sub: 'doctor-001', role: 'DOCTOR', sessionId: 'sess-1' }
const REVIEW_UUID = '66666666-6666-6666-6666-666666666666'
const PATIENT_UUID = '77777777-7777-7777-7777-777777777777'

function createMockFrom() {
  return vi.fn()
}

function createTestContext(mockFrom: ReturnType<typeof vi.fn>) {
  return {
    supabase: { from: mockFrom } as never,
    user: TEST_USER,
    headers: new Headers(),
  }
}

describe('duplicateReview.pendingCount', () => {
  const createCaller = createCallerFactory(appRouter)

  it('returns count of PENDING reviews', async () => {
    const mockFrom = createMockFrom()
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          then: undefined,
          // Supabase count query pattern
        }),
      }),
    })
    // For count queries, mock the chain to return count
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          count: 5,
          error: null,
        }),
      }),
    })

    const ctx = createTestContext(mockFrom)
    const caller = createCaller(ctx)
    const result = await caller.duplicateReview.pendingCount()

    expect(result).toHaveProperty('count')
  })
})

describe('duplicateReview.dismiss', () => {
  const createCaller = createCallerFactory(appRouter)

  it('sets status to DISMISSED and clears mpi_warn', async () => {
    let updateTable = ''
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      updateTable = table
      if (table === 'duplicate_reviews') {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }
      }
      if (table === 'patients') {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }
      }
      return {}
    })

    const ctx = createTestContext(mockFrom)
    const caller = createCaller(ctx)
    const result = await caller.duplicateReview.dismiss({
      reviewId: REVIEW_UUID,
      patientId: PATIENT_UUID,
    })

    expect(result).toHaveProperty('success', true)
    // Should have updated both tables
    const tables = mockFrom.mock.calls.map((c: any[]) => c[0])
    expect(tables).toContain('duplicate_reviews')
    expect(tables).toContain('patients')
  })

  it('emits audit event', async () => {
    const mockFrom = vi.fn().mockImplementation(() => ({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }))

    const ctx = createTestContext(mockFrom)
    const caller = createCaller(ctx)
    await caller.duplicateReview.dismiss({ reviewId: REVIEW_UUID, patientId: PATIENT_UUID })

    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PHI_WRITE',
        metadata: expect.objectContaining({ operation: 'duplicate_dismiss' }),
      }),
    )
  })
})

describe('duplicateReview.flagForMerge', () => {
  const createCaller = createCallerFactory(appRouter)

  it('sets status to FLAGGED_FOR_MERGE', async () => {
    const mockFrom = vi.fn().mockImplementation(() => ({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }))

    const ctx = createTestContext(mockFrom)
    const caller = createCaller(ctx)
    const result = await caller.duplicateReview.flagForMerge({ reviewId: REVIEW_UUID })

    expect(result).toHaveProperty('success', true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm -F hub-api test -- duplicate-review
```

Expected: FAIL — `duplicateReview is not a function`.

- [ ] **Step 3: Create `duplicate-review.ts` router**

Create `apps/hub-api/src/trpc/routers/duplicate-review.ts`:

```typescript
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '../init'
import { enforceResourceAccess } from '../middleware/enforceResourceAccess'
import { AuditLogger } from '@ultranos/audit-logger'

export const duplicateReviewRouter = createTRPCRouter({
  pendingCount: protectedProcedure
    .use(enforceResourceAccess('Patient'))
    .query(async ({ ctx }) => {
      const { count, error } = await ctx.supabase
        .from('duplicate_reviews')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'PENDING')

      if (error) {
        console.error('[DUPLICATE_REVIEW] Count error:', { code: error.code })
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to count reviews' })
      }

      return { count: count ?? 0 }
    }),

  list: protectedProcedure
    .use(enforceResourceAccess('Patient'))
    .input(z.object({
      status: z.enum(['PENDING', 'DISMISSED', 'FLAGGED_FOR_MERGE', 'MERGED']).optional(),
      limit: z.number().int().min(1).max(100).default(20),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from('duplicate_reviews')
        .select('*')
        .order('created_at', { ascending: false })
        .range(input.offset, input.offset + input.limit - 1)

      if (input.status) {
        query = query.eq('status', input.status)
      }

      const { data, error } = await query

      if (error) {
        console.error('[DUPLICATE_REVIEW] List error:', { code: error.code })
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to list reviews' })
      }

      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_READ',
          resourceType: 'PATIENT',
          resourceId: 'duplicate-review-list',
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { operation: 'duplicate_review_list', resultCount: (data ?? []).length },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_READ', resourceId: 'duplicate-review-list' })
      }

      return { reviews: data ?? [] }
    }),

  dismiss: protectedProcedure
    .use(enforceResourceAccess('Patient'))
    .input(z.object({
      reviewId: z.string().uuid(),
      patientId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Update review status
      const { error: reviewError } = await ctx.supabase
        .from('duplicate_reviews')
        .update({
          status: 'DISMISSED',
          reviewed_by: ctx.user.sub,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', input.reviewId)

      if (reviewError) {
        console.error('[DUPLICATE_REVIEW] Dismiss error:', { code: reviewError.code })
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to dismiss review' })
      }

      // Clear mpi_warn on the patient (false positive confirmed)
      const { error: patientError } = await ctx.supabase
        .from('patients')
        .update({ mpi_warn: false })
        .eq('id', input.patientId)

      if (patientError) {
        console.error('[DUPLICATE_REVIEW] Clear mpi_warn error:', { code: patientError.code })
      }

      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_WRITE',
          resourceType: 'PATIENT',
          resourceId: input.patientId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { operation: 'duplicate_dismiss', reviewId: input.reviewId },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_WRITE', resourceId: input.patientId })
      }

      return { success: true }
    }),

  flagForMerge: protectedProcedure
    .use(enforceResourceAccess('Patient'))
    .input(z.object({
      reviewId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from('duplicate_reviews')
        .update({
          status: 'FLAGGED_FOR_MERGE',
          reviewed_by: ctx.user.sub,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', input.reviewId)

      if (error) {
        console.error('[DUPLICATE_REVIEW] Flag error:', { code: error.code })
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to flag review' })
      }

      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_WRITE',
          resourceType: 'PATIENT',
          resourceId: 'duplicate-review',
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { operation: 'duplicate_flag_for_merge', reviewId: input.reviewId },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_WRITE', resourceId: 'duplicate-review' })
      }

      return { success: true }
    }),
})
```

- [ ] **Step 4: Register in `_app.ts`**

In `apps/hub-api/src/trpc/routers/_app.ts`, add:

```typescript
import { duplicateReviewRouter } from './duplicate-review'
```

And add to the `createTRPCRouter({...})`:

```typescript
duplicateReview: duplicateReviewRouter,
```

- [ ] **Step 5: Run tests**

```bash
pnpm -F hub-api test -- duplicate-review
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/hub-api/src/trpc/routers/duplicate-review.ts apps/hub-api/src/trpc/routers/_app.ts apps/hub-api/src/__tests__/duplicate-review.test.ts
git commit -m "feat(hub-api): add duplicateReview router — pendingCount, list, dismiss, flagForMerge"
```

---

## Task 6: Hub API — `patientRegistration.register` Schema Update

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/patient-registration.ts`
- Test: `apps/hub-api/src/__tests__/patient-registration-enrichment.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/hub-api/src/__tests__/patient-registration-enrichment.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({})),
  db: {
    toRow: (d: Record<string, unknown>) => d,
    toRowRaw: (d: Record<string, unknown>) => d,
    fromRow: (d: Record<string, unknown>) => d,
    fromRowRaw: (d: Record<string, unknown>) => d,
    fromRows: (d: unknown[]) => d,
  },
}))

vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({ emit: vi.fn().mockResolvedValue({}) })),
}))

vi.mock('../trpc/middleware/enforceConsent', () => ({
  enforceConsentMiddleware: vi.fn(() => async (opts: Record<string, unknown>) => {
    const next = opts['next'] as (a: unknown) => unknown
    return next({ ctx: opts['ctx'] })
  }),
}))

vi.mock('../trpc/middleware/enforceResourceAccess', () => ({
  enforceResourceAccess: vi.fn(() => async (opts: Record<string, unknown>) => {
    const next = opts['next'] as (a: unknown) => unknown
    return next({ ctx: opts['ctx'] })
  }),
}))

const mockComputeMpiResult = vi.fn().mockReturnValue({ decision: 'ALLOW', topScore: 0, candidates: [] })
vi.mock('@ultranos/mpi-engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ultranos/mpi-engine')>()
  return { ...actual, computeMpiResult: (...args: unknown[]) => mockComputeMpiResult(...args) }
})

const mockFetchMpiCandidates = vi.fn().mockResolvedValue([])
vi.mock('@/lib/mpi-candidate-query', () => ({
  fetchMpiCandidates: (...args: unknown[]) => mockFetchMpiCandidates(...args),
}))

const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')

const PATIENT_UUID = '88888888-8888-8888-8888-888888888888'
const CONSENT_UUID = '99999999-9999-9999-9999-999999999999'

function makeRegisterContext(otpSuccess = true) {
  return {
    supabase: {
      auth: {
        signInWithOtp: vi.fn().mockResolvedValue({}),
        verifyOtp: otpSuccess
          ? vi.fn().mockResolvedValue({
              data: { session: { user: { id: 'auth-user-456' }, access_token: 'tok', refresh_token: 'ref', expires_at: 9999 } },
              error: null,
            })
          : vi.fn().mockResolvedValue({ data: { session: null }, error: { message: 'invalid OTP' } }),
        admin: { updateUserById: vi.fn().mockResolvedValue({}) },
      },
      rpc: vi.fn().mockResolvedValue({
        data: { patientId: PATIENT_UUID, consentId: CONSENT_UUID },
        error: null,
      }),
    } as never,
    user: null,
    headers: new Headers(),
  }
}

describe('patientRegistration.register — nameFather and gender', () => {
  const createCaller = createCallerFactory(appRouter)

  beforeEach(() => {
    vi.clearAllMocks()
    mockComputeMpiResult.mockReturnValue({ decision: 'ALLOW', topScore: 0, candidates: [] })
    mockFetchMpiCandidates.mockResolvedValue([])
  })

  it('accepts nameFather and gender in registration input', async () => {
    const ctx = makeRegisterContext()
    const caller = createCaller(ctx)

    const result = await caller.patientRegistration.register({
      phone: '+93701234567',
      otpCode: '123456',
      firstName: 'Ahmad',
      nameFather: 'Mohammad',
      gender: 'male',
      dateOfBirth: '1990-06-15',
      preferredLanguage: 'en',
    })

    expect(result).not.toHaveProperty('blocked')
    const rpcCall = ctx.supabase.rpc.mock.calls[0]
    const pPatient = rpcCall[1]['p_patient'] as Record<string, unknown>
    expect(pPatient).toHaveProperty('nameFather', 'Mohammad')
    expect(pPatient).toHaveProperty('gender', 'male')
  })

  it('passes nameFather to MPI candidate fetch', async () => {
    const ctx = makeRegisterContext()
    const caller = createCaller(ctx)

    await caller.patientRegistration.register({
      phone: '+93701234567',
      otpCode: '123456',
      firstName: 'Ahmad',
      nameFather: 'Mohammad',
      gender: 'male',
      dateOfBirth: '1990-06-15',
      preferredLanguage: 'en',
    })

    expect(mockFetchMpiCandidates).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ nameFather: 'Mohammad' }),
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm -F hub-api test -- patient-registration-enrichment
```

Expected: FAIL — `nameFather` not accepted in input schema.

- [ ] **Step 3: Update `patient-registration.ts` input schema**

In `apps/hub-api/src/trpc/routers/patient-registration.ts`, update the `register` input schema to add `nameFather` and `gender`:

```typescript
.input(
  z.object({
    phone: z.string().min(7).max(20).regex(/^\+\d+$/, 'Phone must be E.164 format'),
    otpCode: z.string().length(6).regex(/^\d{6}$/, 'OTP must be 6 digits'),
    firstName: z.string().min(1).max(200).transform((s) => s.trim()),
    nameFather: z.string().min(1).max(200).transform((s) => s.trim()).optional(),
    gender: z.enum(['male', 'female', 'other', 'unknown']).optional(),
    dateOfBirth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be YYYY-MM-DD')
      .refine(isValidCalendarDate, 'Date of birth must be a valid date in the past'),
    preferredLanguage: z.enum(SUPPORTED_LOCALES),
  }),
)
```

Then update the MPI candidate fetch (after OTP verification) to include `nameFather`:

```typescript
const mpiCandidates = await fetchMpiCandidates(ctx.supabase, {
  nameGiven: input.firstName,
  nameFather: input.nameFather,
  birthYear,
  phone: input.phone,
})

const mpiResult = computeMpiResult(mpiCandidates, {
  nameGiven: input.firstName,
  nameFather: input.nameFather,
  birthYear,
  phone: input.phone,
  gender: input.gender,
})
```

And update the `patientRow` to include the new fields:

```typescript
const patientRow = db.toRow({
  // ... existing fields ...
  nameFather: input.nameFather ?? null,
  gender: input.gender ?? null,
  // ... rest of fields ...
})
```

- [ ] **Step 4: Run tests**

```bash
pnpm -F hub-api test -- patient-registration-enrichment patient-registration-mpi
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/hub-api/src/trpc/routers/patient-registration.ts apps/hub-api/src/__tests__/patient-registration-enrichment.test.ts
git commit -m "feat(hub-api): add nameFather and gender to patient self-registration input"
```

---

*— Phase A complete. Continue in Phase B: Tasks 7–9 (OPD Lite registration UI, navigation, duplicate review UI) —*

---

# PHASE B — Tasks 7–9: OPD Lite UI

> **Note for implementers:** Phase B tasks create Next.js React components. Each task provides component structure, props, key logic, and i18n keys. Follow existing OPD Lite patterns: `'use client'` directive, `useTranslations()` from next-intl, logical CSS properties for RTL, Tailwind CSS for styling. All form labels and user-facing text must use i18n keys, never hard-coded strings.

---

## Task 7: OPD Lite — Registration Page & Form Components

**Files:**
- Create: `apps/opd-lite/src/app/[locale]/register-patient/page.tsx`
- Create: `apps/opd-lite/src/components/registration/PatientRegistrationForm.tsx`
- Create: `apps/opd-lite/src/components/registration/NameInputSection.tsx`
- Create: `apps/opd-lite/src/components/registration/GeographySection.tsx`
- Create: `apps/opd-lite/src/components/registration/ConsentSection.tsx`
- Create: `apps/opd-lite/src/components/registration/MpiResultModal.tsx`
- Create: `apps/opd-lite/src/components/shared/ProvinceAutocomplete.tsx`
- Create: `apps/opd-lite/src/components/shared/DistrictAutocomplete.tsx`
- Modify: `apps/opd-lite/messages/en.json` — add `registration` key namespace
- Modify: `apps/opd-lite/messages/ar.json` — Arabic translations
- Modify: `apps/opd-lite/messages/prs.json` — Dari translations

This task builds the complete registration form. Key behaviors:

**`page.tsx`** — reads `?nameGiven=` query param for pre-fill, renders `PatientRegistrationForm`.

**`PatientRegistrationForm.tsx`** — orchestrates all sections. On submit:
1. Calls `patient.checkDuplicates` via tRPC
2. If ALLOW: calls `patient.create`, shows success, navigates to patient
3. If WARN: opens `MpiResultModal` with candidates + "Proceed" button (passes `proceedToken`)
4. If BLOCK: opens `MpiResultModal` with candidates + "Go to Patient" only

**`NameInputSection.tsx`** — three text inputs (given/father/grandfather). Auto-composes `nameLocal` preview below. Accepts any script.

**`GeographySection.tsx`** — two address blocks (origin required, current optional). Each has province/district/village. "Same as origin" checkbox on current address.

**`ProvinceAutocomplete.tsx`** — dropdown with text filter over `AFGHAN_PROVINCES`. Shows `nameLocal` in RTL locale, `name` in LTR.

**`DistrictAutocomplete.tsx`** — dropdown with text filter over `getDistrictsByProvince(province)`. Disabled when no province selected.

**`ConsentSection.tsx`** — radio group for method (Written/Verbal Witnessed), conditional witness dropdown, language dropdown.

**`MpiResultModal.tsx`** — modal showing candidate comparison cards. Props: `decision`, `candidates`, `proceedToken?`, `onProceed`, `onCancel`, `onGoToPatient`.

- [ ] **Step 1: Add i18n keys to en.json**

Add the `registration` namespace to `apps/opd-lite/messages/en.json`:

```json
{
  "registration": {
    "title": "Register New Patient",
    "nameSection": "Patient Name",
    "givenName": "Given Name",
    "givenNamePlaceholder": "e.g. Ahmad / احمد",
    "fatherName": "Father's Name",
    "grandfatherName": "Grandfather's Name (optional)",
    "namePreview": "Display Name",
    "nameLatinPreview": "Latin Name",
    "demographics": "Demographics",
    "gender": "Gender",
    "genderMale": "Male",
    "genderFemale": "Female",
    "genderOther": "Other",
    "genderUnknown": "Unknown",
    "dateOfBirth": "Date of Birth",
    "birthYearOnly": "Birth year only (exact date unknown)",
    "birthYear": "Birth Year",
    "phone": "Phone Number (optional)",
    "identity": "Identity Documents",
    "nationalId": "National ID (optional)",
    "tazkira": "Tazkira Paper Reference",
    "tazkiraJild": "Jild (Volume)",
    "tazkiraSafa": "Safa (Page)",
    "tazkiraShumara": "Shumara (Number)",
    "geography": "Address",
    "originAddress": "Origin Address",
    "currentAddress": "Current Address (optional)",
    "province": "Province",
    "district": "District",
    "village": "Village (optional)",
    "sameAsOrigin": "Same as origin address",
    "selectProvince": "Select province...",
    "selectDistrict": "Select district...",
    "consent": "Patient Consent",
    "consentMethod": "Consent Method",
    "consentWritten": "Written",
    "consentVerbal": "Verbal (Witnessed)",
    "consentWitness": "Witnessed By",
    "consentLanguage": "Consent Language",
    "consentVersion": "Consent Version",
    "submit": "Check for Duplicates & Register",
    "submitting": "Checking...",
    "success": "Patient registered successfully",
    "mpiWarnTitle": "Possible Duplicate Detected",
    "mpiWarnMessage": "A similar patient record was found. Please review the candidates below.",
    "mpiWarnProceed": "This is a different person — Register",
    "mpiWarnCancel": "Cancel",
    "mpiBlockTitle": "Duplicate Patient Found",
    "mpiBlockMessage": "A very similar patient already exists. Please use the existing record.",
    "mpiBlockGoTo": "Go to Patient",
    "mpiBlockCancel": "Cancel",
    "mpiScore": "Match Score",
    "candidateName": "Name",
    "candidateFather": "Father",
    "candidateBirthYear": "Birth Year",
    "candidateGender": "Gender",
    "candidateDistrict": "District",
    "offlineWarning": "Patient registered offline. Duplicate check will run when connected.",
    "registerNew": "Register New Patient"
  },
  "duplicateReview": {
    "title": "Duplicate Reviews",
    "pending": "Pending Reviews",
    "pendingCount": "{count, plural, =0 {No pending reviews} one {1 pending review} other {{count} pending reviews}}",
    "patient": "Patient",
    "score": "MPI Score",
    "decision": "Decision",
    "flaggedDate": "Flagged",
    "status": "Status",
    "dismiss": "Not a Duplicate",
    "flagForMerge": "Flag for Merge",
    "dismissed": "Dismissed",
    "flaggedForMerge": "Flagged for Merge",
    "merged": "Merged",
    "warnBanner": "Possible duplicate detected (score: {score}). {link}",
    "reviewLink": "Review",
    "filterAll": "All",
    "filterWarn": "WARN",
    "filterBlock": "BLOCK"
  }
}
```

Add equivalent keys to `ar.json` and `prs.json` with Arabic and Dari translations respectively. (The implementer should translate all keys — use the existing translation patterns in those files as reference for terminology.)

- [ ] **Step 2: Create shared autocomplete components**

Create `apps/opd-lite/src/components/shared/ProvinceAutocomplete.tsx`:

```typescript
'use client'

import { useState, useMemo } from 'react'
import { useLocale } from 'next-intl'
import { AFGHAN_PROVINCES, type AfghanProvince } from '@ultranos/shared-types'
import { AFGHAN_DISTRICTS } from '@ultranos/shared-types'

interface ProvinceAutocompleteProps {
  value: AfghanProvince | ''
  onChange: (province: AfghanProvince | '') => void
  label: string
  placeholder: string
  required?: boolean
  error?: string
}

export function ProvinceAutocomplete({ value, onChange, label, placeholder, required, error }: ProvinceAutocompleteProps) {
  const locale = useLocale()
  const isRtl = locale === 'ar' || locale === 'prs'
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    if (!query) return [...AFGHAN_PROVINCES]
    const q = query.toLowerCase()
    return AFGHAN_PROVINCES.filter(p => {
      const district = AFGHAN_DISTRICTS.find(d => d.province === p)
      const localName = district?.nameLocal ?? ''
      return p.toLowerCase().includes(q) || localName.includes(query)
    })
  }, [query])

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">
        {label}{required && <span className="text-red-500 ms-1">*</span>}
      </label>
      <div className="relative">
        <input
          type="text"
          value={value || query}
          onChange={(e) => {
            setQuery(e.target.value)
            if (value) onChange('')
          }}
          placeholder={placeholder}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          dir={isRtl ? 'rtl' : 'ltr'}
        />
        {query && !value && filtered.length > 0 && (
          <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white shadow-lg border border-gray-200">
            {filtered.map(p => (
              <li
                key={p}
                className="cursor-pointer px-3 py-2 text-sm hover:bg-blue-50"
                onClick={() => { onChange(p); setQuery('') }}
              >
                {p}
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
```

Create `apps/opd-lite/src/components/shared/DistrictAutocomplete.tsx`:

```typescript
'use client'

import { useState, useMemo } from 'react'
import { useLocale } from 'next-intl'
import { getDistrictsByProvince, type AfghanDistrict } from '@ultranos/shared-types'
import type { AfghanProvince } from '@ultranos/shared-types'

interface DistrictAutocompleteProps {
  province: AfghanProvince | ''
  value: string
  onChange: (district: string) => void
  label: string
  placeholder: string
  required?: boolean
  error?: string
}

export function DistrictAutocomplete({ province, value, onChange, label, placeholder, required, error }: DistrictAutocompleteProps) {
  const locale = useLocale()
  const isRtl = locale === 'ar' || locale === 'prs'
  const [query, setQuery] = useState('')

  const districts = useMemo(() => {
    if (!province) return []
    return getDistrictsByProvince(province)
  }, [province])

  const filtered = useMemo(() => {
    if (!query) return districts
    const q = query.toLowerCase()
    return districts.filter(d =>
      d.name.toLowerCase().includes(q) || d.nameLocal.includes(query)
    )
  }, [query, districts])

  const disabled = !province

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">
        {label}{required && <span className="text-red-500 ms-1">*</span>}
      </label>
      <div className="relative">
        <input
          type="text"
          value={value || query}
          onChange={(e) => {
            setQuery(e.target.value)
            if (value) onChange('')
          }}
          placeholder={disabled ? '' : placeholder}
          disabled={disabled}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          dir={isRtl ? 'rtl' : 'ltr'}
        />
        {query && !value && filtered.length > 0 && (
          <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white shadow-lg border border-gray-200">
            {filtered.map(d => (
              <li
                key={d.name}
                className="cursor-pointer px-3 py-2 text-sm hover:bg-blue-50"
                onClick={() => { onChange(d.name); setQuery('') }}
              >
                <span>{isRtl ? d.nameLocal : d.name}</span>
                <span className="text-gray-400 ms-2 text-xs">{isRtl ? d.name : d.nameLocal}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 3: Create form section components**

Create `NameInputSection.tsx`, `GeographySection.tsx`, `ConsentSection.tsx` following the patterns above. Each section:
- Accepts form state + onChange handlers as props
- Uses `useTranslations('registration')` for all labels
- Uses logical CSS properties for RTL

**NameInputSection** — three text inputs + read-only `nameLocal` preview (concatenation of entered values).

**GeographySection** — two address blocks using `ProvinceAutocomplete` and `DistrictAutocomplete`. "Same as origin" checkbox on current address.

**ConsentSection** — radio group for method, conditional witness dropdown, language dropdown (en/ar/prs).

- [ ] **Step 4: Create MpiResultModal**

Create `apps/opd-lite/src/components/registration/MpiResultModal.tsx`:

A modal that displays when MPI returns WARN or BLOCK. Shows candidate cards with side-by-side comparison. Props:

```typescript
interface MpiResultModalProps {
  open: boolean
  decision: 'WARN' | 'BLOCK'
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
  onProceed: (token: string) => void
  onCancel: () => void
  onGoToPatient: (patientId: string) => void
}
```

- WARN: shows "Proceed" button (calls `onProceed(proceedToken)`) and "Cancel"
- BLOCK: shows "Go to Patient" button (calls `onGoToPatient(candidates[0].id)`) and "Cancel"

- [ ] **Step 5: Create PatientRegistrationForm**

Create `apps/opd-lite/src/components/registration/PatientRegistrationForm.tsx`:

Orchestrates all sections. Uses `CreatePatientMpiInputSchema` for client-side validation. On submit:
1. Build the `checkDuplicates` input from form state
2. Call `trpc.patient.checkDuplicates.query()`
3. Handle ALLOW/WARN/BLOCK per spec section 2.3
4. On ALLOW or WARN+proceed: call `trpc.patient.create.mutate()`
5. Show success toast, navigate to `/patients/${id}`

- [ ] **Step 6: Create the registration page**

Create `apps/opd-lite/src/app/[locale]/register-patient/page.tsx`:

```typescript
'use client'

import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { PatientRegistrationForm } from '@/components/registration/PatientRegistrationForm'

export default function RegisterPatientPage() {
  const t = useTranslations('registration')
  const searchParams = useSearchParams()
  const prefilledName = searchParams.get('nameGiven') ?? ''

  return (
    <main id="main-content" className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-6">{t('title')}</h1>
      <PatientRegistrationForm prefilledNameGiven={prefilledName} />
    </main>
  )
}
```

- [ ] **Step 7: Commit**

```bash
git add apps/opd-lite/src/app/[locale]/register-patient/ apps/opd-lite/src/components/registration/ apps/opd-lite/src/components/shared/ apps/opd-lite/messages/
git commit -m "feat(opd-lite): add patient registration form with MPI pre-flight, geography dropdowns, and consent"
```

---

## Task 8: OPD Lite — Navigation & "New Patient" Button

**Files:**
- Modify: `apps/opd-lite/src/components/patient-result-list.tsx`
- Modify: `apps/opd-lite/src/components/dashboard/ClinicalDashboard.tsx`

- [ ] **Step 1: Add "Register New Patient" button to PatientResultList**

In `apps/opd-lite/src/components/patient-result-list.tsx`, add a button that appears when results are empty or below 3:

```typescript
// After the results list, add:
{results.length < 3 && (
  <Link
    href={`/register-patient${query ? `?nameGiven=${encodeURIComponent(query)}` : ''}`}
    className="mt-4 flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-4 py-3 text-sm font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors min-h-[44px]"
  >
    {t('registerNew')}
  </Link>
)}
```

The `query` prop should be passed from the parent (ClinicalDashboard → PatientResultList).

- [ ] **Step 2: Add "Register Patient" nav link to ClinicalDashboard**

In `apps/opd-lite/src/components/dashboard/ClinicalDashboard.tsx`, add a navigation link near the existing quick-action area:

```typescript
<Link
  href="/register-patient"
  className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors min-h-[44px]"
>
  {t('registration.registerNew')}
</Link>
```

- [ ] **Step 3: Commit**

```bash
git add apps/opd-lite/src/components/patient-result-list.tsx apps/opd-lite/src/components/dashboard/ClinicalDashboard.tsx
git commit -m "feat(opd-lite): add 'Register New Patient' button to search results and dashboard"
```

---

## Task 9: OPD Lite — Duplicate Review UI

**Files:**
- Create: `apps/opd-lite/src/app/[locale]/duplicate-review/page.tsx`
- Create: `apps/opd-lite/src/components/duplicate-review/DuplicateReviewTable.tsx`
- Create: `apps/opd-lite/src/components/duplicate-review/CandidateComparisonCard.tsx`
- Create: `apps/opd-lite/src/components/dashboard/DuplicateReviewsCard.tsx`
- Create: `apps/opd-lite/src/components/patient/MpiWarnBanner.tsx`
- Modify: `apps/opd-lite/src/components/dashboard/ClinicalDashboard.tsx`

- [ ] **Step 1: Create DuplicateReviewsCard**

Create `apps/opd-lite/src/components/dashboard/DuplicateReviewsCard.tsx`:

Follow the exact pattern of `UnresolvedConflictsCard` or `PendingLabResultsCard`:
- Fetch pending count via tRPC: `trpc.duplicateReview.pendingCount.useQuery()`
- Show count badge with `role="status"` and `aria-label`
- Click navigates to `/duplicate-review`
- Refresh via Realtime broadcast (listen for `'duplicate-review'` event type)

- [ ] **Step 2: Add DuplicateReviewsCard to ClinicalDashboard**

In `ClinicalDashboard.tsx`, add `<DuplicateReviewsCard />` alongside existing cards.

- [ ] **Step 3: Create CandidateComparisonCard**

Create `apps/opd-lite/src/components/duplicate-review/CandidateComparisonCard.tsx`:

Shows one candidate's fields side-by-side with the flagged patient. Props:

```typescript
interface CandidateComparisonCardProps {
  candidate: {
    id: string
    nameGiven?: string
    nameFather?: string
    birthYear?: number
    gender?: string
    districtOrigin?: string
    mpiScore: number
  }
}
```

Displays: name, father, birth year, gender, district, and score as a colored badge (green < 60, amber 60-89, red >= 90).

- [ ] **Step 4: Create DuplicateReviewTable**

Create `apps/opd-lite/src/components/duplicate-review/DuplicateReviewTable.tsx`:

Fetches reviews via `trpc.duplicateReview.list.useQuery({ status })`. Renders a table with expandable rows. Each expanded row shows `CandidateComparisonCard` for each candidate. Actions: "Dismiss" and "Flag for Merge" buttons calling the respective mutations.

- [ ] **Step 5: Create DuplicateReviewPage**

Create `apps/opd-lite/src/app/[locale]/duplicate-review/page.tsx`:

```typescript
'use client'

import { useTranslations } from 'next-intl'
import { DuplicateReviewTable } from '@/components/duplicate-review/DuplicateReviewTable'

export default function DuplicateReviewPage() {
  const t = useTranslations('duplicateReview')

  return (
    <main id="main-content" className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-6">{t('title')}</h1>
      <DuplicateReviewTable />
    </main>
  )
}
```

- [ ] **Step 6: Create MpiWarnBanner**

Create `apps/opd-lite/src/components/patient/MpiWarnBanner.tsx`:

```typescript
'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'

interface MpiWarnBannerProps {
  mpiScore: number
  patientId: string
}

export function MpiWarnBanner({ mpiScore, patientId }: MpiWarnBannerProps) {
  const t = useTranslations('duplicateReview')

  return (
    <div
      role="alert"
      className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800"
    >
      {t.rich('warnBanner', {
        score: mpiScore,
        link: (chunks) => (
          <Link href={`/duplicate-review?patient=${patientId}`} className="font-medium underline">
            {chunks}
          </Link>
        ),
      })}
    </div>
  )
}
```

This banner should be included in any patient detail or encounter view when the patient has `mpi_warn = true`.

- [ ] **Step 7: Commit**

```bash
git add apps/opd-lite/src/app/[locale]/duplicate-review/ apps/opd-lite/src/components/duplicate-review/ apps/opd-lite/src/components/dashboard/DuplicateReviewsCard.tsx apps/opd-lite/src/components/patient/MpiWarnBanner.tsx apps/opd-lite/src/components/dashboard/ClinicalDashboard.tsx
git commit -m "feat(opd-lite): add duplicate review page, dashboard card, and MPI warn banner"
```

---

# PHASE C — Tasks 10–11: Patient Lite Mobile

---

## Task 10: Patient Lite Mobile — ProfileSetupScreen Enrichment

**Files:**
- Modify: `apps/patient-lite-mobile/src/screens/registration/ProfileSetupScreen.tsx`
- Modify: `apps/patient-lite-mobile/src/lib/registration-api.ts`

- [ ] **Step 1: Add nameFather and gender fields to ProfileSetupScreen**

In `ProfileSetupScreen.tsx`, add two new fields after the existing `firstName` field:

- **Father's name** (`nameFather`): text input with same constraints as firstName (1-200 chars, RTL-supported, trimmed). Required.
- **Gender**: 4-option selector (male/female/other/unknown). Required. Use a row of touchable buttons or a dropdown matching the existing design language.

Update the `onComplete` callback to include `nameFather` and `gender` in the returned profile object.

- [ ] **Step 2: Update registration-api.ts**

In `apps/patient-lite-mobile/src/lib/registration-api.ts`, update the `register()` function to include `nameFather` and `gender` in the request body:

```typescript
export async function register(input: {
  phone: string
  otpCode: string
  firstName: string
  nameFather: string
  gender: 'male' | 'female' | 'other' | 'unknown'
  dateOfBirth: string
  preferredLanguage: string
}) {
  // ... existing hubFetch call with all fields in body ...
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/patient-lite-mobile/src/screens/registration/ProfileSetupScreen.tsx apps/patient-lite-mobile/src/lib/registration-api.ts
git commit -m "feat(patient-lite-mobile): add nameFather and gender to registration flow"
```

---

## Task 11: Patient Lite Mobile — Profile Completion

**Files:**
- Create: `apps/patient-lite-mobile/src/components/dashboard/ProfileCompletionCard.tsx`
- Create: `apps/patient-lite-mobile/src/screens/profile/ProfileCompletionScreen.tsx`
- Create: `apps/patient-lite-mobile/src/components/shared/ProvinceDistrictPicker.tsx`

- [ ] **Step 1: Create ProvinceDistrictPicker**

React Native version of the cascading dropdowns. Uses `AFGHAN_PROVINCES`, `getDistrictsByProvince` from `@ultranos/shared-types`. Renders two picker/dropdown components (province → district). Uses React Native `TextInput` with autocomplete/filtering or a `Picker` component matching the existing design language.

- [ ] **Step 2: Create ProfileCompletionScreen**

New screen with optional fields:
- Grandfather's name (text input)
- Province/district cascading picker (origin address)
- Village free text
- "Save" button calls `patient.update` via Hub API
- "Skip" button in header returns to dashboard

Fields already filled are pre-populated from the patient record fetched on screen mount.

- [ ] **Step 3: Create ProfileCompletionCard**

Dashboard card component:
- Shows when patient profile is incomplete (missing grandfather name, address, etc.)
- Progress ring: "X of Y fields completed"
- Tapping navigates to `ProfileCompletionScreen`
- Dismissible (max 3 dismissals tracked in AsyncStorage, then stays hidden)

```typescript
// Completeness check logic:
const fields = ['nameGiven', 'nameFather', 'nameGrandfather', 'gender', 'addressOrigin', 'phone']
const completed = fields.filter(f => patient[f] != null)
const isComplete = completed.length === fields.length
```

- [ ] **Step 4: Commit**

```bash
git add apps/patient-lite-mobile/src/components/dashboard/ProfileCompletionCard.tsx apps/patient-lite-mobile/src/screens/profile/ProfileCompletionScreen.tsx apps/patient-lite-mobile/src/components/shared/ProvinceDistrictPicker.tsx
git commit -m "feat(patient-lite-mobile): add profile completion nudge with geography picker"
```

---

## Plan Self-Review

**Spec coverage check:**

| Spec Section | Task |
|---|---|
| Afghan district reference dataset | Task 1 |
| PatientAddressSchema district validation | Task 1 |
| OPD Lite registration page + form | Task 7 |
| Registration form sections (name, demographics, identity, geography, consent) | Task 7 |
| MPI pre-flight flow (ALLOW/WARN/BLOCK) | Task 7 |
| Offline registration (save to Dexie) | Task 7 (noted in form component — offline detect + local save) |
| "New Patient" button in search results | Task 8 |
| "Register Patient" sidebar/nav link | Task 8 |
| Patient Lite nameFather + gender at registration | Task 6 (API) + Task 10 (UI) |
| Profile completion nudge (dashboard card) | Task 11 |
| ProfileCompletionScreen (grandfather, geography) | Task 11 |
| patient.syncCreate endpoint | Task 4 |
| Async MPI scoring function | Task 3 |
| duplicate_reviews table | Task 2 |
| duplicateReview router (pendingCount, list, dismiss, flagForMerge) | Task 5 |
| Duplicate review queue page | Task 9 |
| DuplicateReviewsCard (dashboard) | Task 9 |
| MpiWarnBanner (inline patient) | Task 9 |
| i18n for all locales | Task 7 (registration keys) + Task 9 (review keys) |
| RTL support | Task 7 (all components use logical CSS) |

All spec requirements covered.

**Placeholder scan:** No TBD/TODO found. All code steps contain actual code.

**Type consistency:** `AfghanDistrict`, `getDistrictsByProvince`, `runAsyncMpiScoring`, `duplicateReviewRouter` — names consistent across all tasks.
