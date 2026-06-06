# Patient Registration — Extended Demographics & HMIS Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the patient registration form and data model to capture marital status, emergency contacts, displacement/population category, nationality, occupation, education level, disability status, phone use type, and Pashto language support — covering all fields required for national HMIS compliance (WHO DHIS2 / Afghanistan MoPH).

**Architecture:** Changes flow in four layers: (1) `packages/shared-types` gets new TS types + updated Zod schemas, (2) a Supabase DB migration adds the new columns, (3) `apps/hub-api` updates both the `create`/`syncCreate` endpoints and the `list`/`search` mappers, (4) `apps/opd-lite` gets two new section components wired into the main registration form, with all four locale files updated in lockstep.

**Tech Stack:** TypeScript, Zod, Next.js 15, next-intl, Supabase MCP (`apply_migration`, `execute_sql`), tRPC, Tailwind CSS v3, oklch semantic tokens.

---

## Deferred Fields (intentionally absent from registration)

These fields exist in the FHIR type but are set outside the registration workflow — do not add form fields for them:

| Field | Reason deferred |
|---|---|
| `_ultranos.photoUrl` | Separate photo capture workflow post-registration |
| `_ultranos.biometricFingerprintHash` | V2 biometric hardware workflow |
| `_ultranos.nameLatin`, `_ultranos.namePhonetic` | System-derived server-side (ALA-LC + Double Metaphone) |
| `_ultranos.mpiScore` | Computed by MPI engine during deduplication |
| `_ultranos.updatedByName`, `_ultranos.updatedByRole` | Resolved at read time from practitioner record |
| `meta.versionId` | Managed by Supabase / DB trigger |

---

## File Map

| File | Action | What changes |
|---|---|---|
| `packages/shared-types/src/fhir/patient.ts` | Modify | Add `MaritalStatus`, `PatientContact`, `ContactRelationship`, `DisplacementCategory`, `EducationLevel` types; extend `FhirPatient` (top-level + `_ultranos`); extend `CreatePatientInput` |
| `packages/shared-types/src/fhir/patient.schema.ts` | Modify | Add Zod schemas for new types; update `PatientUltranosExtSchema`, `FhirPatientSchema`, `CreatePatientMpiInputSchema`; add `'ps'` to all language enums; update `ConsentInputSchema` |
| `packages/shared-types/src/__tests__/patient.schema.test.ts` | Modify | Update fixtures; add tests for new fields + Pashto language |
| *(Supabase migration — no file)* | Create via MCP | Add 8 new columns to `patients` table |
| `apps/hub-api/src/trpc/routers/patient.ts` | Modify | Add new columns to `list` + `search` SELECTs; update both row mappers; add new fields to `create` and `syncCreate` `db.toRow()` calls |
| `apps/hub-api/src/trpc/routers/patient-registration.ts` | Modify | Add `'ps'` to `SUPPORTED_LOCALES` |
| `apps/opd-lite/src/components/registration/SocialInfoSection.tsx` | Create | New card: displacement category, nationality, occupation, education level, disability |
| `apps/opd-lite/src/components/registration/EmergencyContactSection.tsx` | Create | New card: up to 2 emergency contacts (name, relationship, phone) |
| `apps/opd-lite/src/components/registration/ConsentSection.tsx` | Modify | Add Pashto (`'ps'`) to `ConsentLanguage` type + `CONSENT_LANGUAGES` array |
| `apps/opd-lite/src/components/registration/PatientRegistrationForm.tsx` | Modify | New state, updated Zod schema, new sections, updated `buildPayload()`, updated `savePatientLocally()`, Pashto in preferred language dropdown |
| `apps/opd-lite/messages/en.json` | Modify | Add i18n keys for all new fields |
| `apps/opd-lite/messages/ar.json` | Modify | Add Arabic translations |
| `apps/opd-lite/messages/prs.json` | Modify | Add Dari translations |
| `apps/opd-lite/messages/ps.json` | Modify | Add Pashto translations |

---

## Task 1 — Shared Types: Add new demographic types and extend `FhirPatient`

**Files:**
- Modify: `packages/shared-types/src/fhir/patient.ts`

- [ ] **Step 1: Add new type declarations and update `FhirPatient` + `CreatePatientInput`**

Replace the entire contents of `packages/shared-types/src/fhir/patient.ts` with:

```typescript
import type { AdministrativeGender } from '../enums.js'
import type { AfghanProvince } from '../reference/afghanistan-geo.js'

/** Patient subscription tier. Defaults to FREE on self-registration. */
export type PatientTier = 'FREE' | 'PREMIUM'

// ── New types for MPI Phase 1 ─────────────────────────────────────────

export interface PatientAddress {
  province: AfghanProvince
  district: string
  village?: string
}

export type PatientIdentifierSystem =
  | 'AFGHAN_ETAZKIRA'
  | 'AFGHAN_TAZKIRA_PAPER'
  | 'PASSPORT'
  | 'HEALTH_PASSPORT_QR'

export interface PatientIdentifier {
  system: PatientIdentifierSystem
  valueHash: string      // HMAC blind index — never raw document number
  displayType: string
  /** Paper Tazkira only — AES-GCM encrypted Jild number */
  jild?: string
  /** Paper Tazkira only — AES-GCM encrypted Safa number */
  safa?: string
  /** Paper Tazkira only — AES-GCM encrypted Shumara number */
  shumara?: string
}

// ── Extended demographics ─────────────────────────────────────────────

/**
 * FHIR R4 marital status value set (v2-0002).
 * Polygamous excluded for this deployment context.
 * M=Married, S=Single/Never Married, D=Divorced, W=Widowed, U=Unknown
 */
export type MaritalStatus = 'M' | 'S' | 'D' | 'W' | 'U'

/** Relationship of an emergency contact to the patient */
export type ContactRelationship =
  | 'SPOUSE'
  | 'PARENT'
  | 'SIBLING'
  | 'CHILD'
  | 'GUARDIAN'
  | 'FRIEND'
  | 'OTHER'

/** FHIR R4 Patient.contact — emergency / next-of-kin contact party */
export interface PatientContact {
  relationship: ContactRelationship
  name: string
  phone?: string
  gender?: AdministrativeGender
}

/**
 * WHO DHIS2 / Afghanistan MoPH population category.
 * Distinct from isNomadic (which is an address-logic flag).
 */
export type DisplacementCategory =
  | 'IDP'            // Internally Displaced Person
  | 'RETURNEE'       // Returned from abroad / repatriated
  | 'REFUGEE'        // Recognized refugee
  | 'HOST_COMMUNITY' // Non-displaced host community member

/**
 * Education level — WHO DHIS2 standard for HMIS disaggregation.
 */
export type EducationLevel = 'NONE' | 'PRIMARY' | 'SECONDARY' | 'TERTIARY' | 'UNKNOWN'

// ── Supported patient-facing languages ───────────────────────────────
export type PatientLanguage = 'en' | 'ar' | 'prs' | 'ps'

// FHIR R4 Patient resource + Ultranos extensions
// Ref: https://hl7.org/fhir/R4/patient.html
export interface FhirPatient {
  id: string // UUID — system generated, never displayed to users
  resourceType: 'Patient'

  // FHIR R4 name
  name: {
    family?: string
    given?: string[]
    text?: string // full name string
  }[]

  gender: AdministrativeGender
  birthDate?: string // ISO 8601 date or year-only (YYYY)
  birthYearOnly: boolean // true when exact DOB unknown

  /** FHIR R4 Patient.maritalStatus — M/S/D/W/U (no Polygamous in this deployment) */
  maritalStatus?: MaritalStatus

  telecom?: {
    system: 'phone' | 'email'
    value: string
    use?: 'home' | 'work' | 'mobile'
  }[]

  identifier?: {
    system: string // e.g. 'UAE_NATIONAL_ID', 'PASSPORT'
    value: string  // stored encrypted; hash used for matching
  }[]

  /**
   * FHIR R4 Patient.contact — emergency / next-of-kin.
   * Up to 2 contacts captured at registration; more can be added later.
   */
  contact?: PatientContact[]

  /**
   * FHIR R4 Patient.communication — patient language preferences.
   * The `preferredLanguage` field in _ultranos is the single-value shorthand;
   * this array supports multi-language patients in future.
   */
  communication?: { language: PatientLanguage; preferred: boolean }[]

  /**
   * FHIR R4 Patient.deceased.
   * Set post-registration; never captured at initial registration.
   */
  deceasedBoolean?: boolean
  deceasedDateTime?: string

  // Ultranos extensions
  _ultranos: {
    nameLocal: string        // name in patient's preferred script (NFD-normalized)
    nameLatin?: string       // ALA-LC romanization — DEFERRED: system-derived server-side
    namePhonetic?: string    // Double Metaphone hash — DEFERRED: system-derived server-side
    nationalIdHash?: string  // SHA-256 of national ID for MPI matching
    guardianId?: string      // UUID → another Patient (guardian)
    consentVersion?: string  // version of consent terms at registration
    /** Subscription tier — defaults to 'FREE' on self-registration */
    patient_tier: PatientTier
    /** Patient's preferred language */
    preferredLanguage?: PatientLanguage
    isActive: boolean
    createdBy?: string       // practitioner UUID
    createdAt: string        // ISO 8601 — Ultranos extension
    // ── MPI Phase 1 additions ──────────────────────────────────
    nameGiven?: string
    nameFather?: string
    nameGrandfather?: string
    birthYear?: number
    addressOrigin?: PatientAddress
    addressCurrent?: PatientAddress
    isNomadic: boolean
    /** SHA-256 of biometric template — DEFERRED: V2 biometric workflow */
    biometricFingerprintHash?: string
    biometricAlgorithmVersion?: string
    /** Soft MPI score — DEFERRED: computed by MPI engine */
    mpiScore?: number
    identifiers?: PatientIdentifier[]
    /** Patient photo path — DEFERRED: separate photo capture workflow */
    photoUrl?: string
    bloodGroup?: string
    /** Display name of last updater — DEFERRED: resolved at read time */
    updatedByName?: string
    /** Role of last updater — DEFERRED: resolved at read time */
    updatedByRole?: string
    // ── Extended demographics (HMIS Phase) ────────────────────
    /** WHO DHIS2 / MoPH population/displacement category */
    displacementCategory?: DisplacementCategory
    /** ISO 3166-1 alpha-2 country code (e.g. 'AF', 'PK', 'IR') */
    nationality?: string
    /** Free-text occupation for HMIS occupational disease surveillance */
    occupation?: string
    /** WHO DHIS2 education level for health literacy stratification */
    educationLevel?: EducationLevel
    /** True if patient self-reports a disability */
    disability?: boolean
  }

  // FHIR R4 Meta — canonical field names
  meta: {
    lastUpdated: string      // ISO 8601 instant
    versionId?: string       // DEFERRED: managed by DB trigger
  }
}

// Shape used when creating a new patient via API
export interface CreatePatientInput {
  // ── Existing fields (unchanged) ──────────────────────────────
  nameLocal: string
  nameLatin?: string
  gender: AdministrativeGender
  birthDate?: string
  birthYearOnly?: boolean
  phone?: string
  phoneUse?: 'home' | 'work' | 'mobile'
  nationalId?: string
  guardianId?: string
  // ── MPI Phase 1 additions ─────────────────────────────────────
  firstName?: string  // deprecated alias for nameGiven
  nameGiven?: string
  nameFather?: string
  nameGrandfather?: string
  birthYear?: number
  addressOrigin?: PatientAddress
  addressCurrent?: PatientAddress
  isNomadic?: boolean
  biometricFingerprintHash?: string
  biometricAlgorithmVersion?: string
  identifiers?: PatientIdentifier[]
  mpiProceedToken?: string
  consent: {
    method: 'WRITTEN' | 'VERBAL_WITNESSED'
    witnessedBy?: string
    language: PatientLanguage
    version: string
  }
  // ── Extended demographics (HMIS Phase) ────────────────────────
  maritalStatus?: MaritalStatus
  contacts?: PatientContact[]
  displacementCategory?: DisplacementCategory
  nationality?: string
  occupation?: string
  educationLevel?: EducationLevel
  disability?: boolean
  preferredLanguage?: PatientLanguage
}
```

- [ ] **Step 2: Build the package to verify no TS errors**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
pnpm --filter @ultranos/shared-types build
```

Expected: build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/shared-types/src/fhir/patient.ts
git commit -m "feat(shared-types): add HMIS demographic types — MaritalStatus, PatientContact, DisplacementCategory, EducationLevel"
```

---

## Task 2 — Shared Types: Update Zod schemas and tests

**Files:**
- Modify: `packages/shared-types/src/fhir/patient.schema.ts`
- Modify: `packages/shared-types/src/__tests__/patient.schema.test.ts`

- [ ] **Step 1: Update `patient.schema.ts` — add Zod schemas for new types and update all schemas**

In `packages/shared-types/src/fhir/patient.schema.ts`, apply these changes:

1. **After the `PatientIdentifierInputSchema` definition (around line 47), add:**

```typescript
const MaritalStatusSchema = z.enum(['M', 'S', 'D', 'W', 'U'])

const ContactRelationshipSchema = z.enum([
  'SPOUSE', 'PARENT', 'SIBLING', 'CHILD', 'GUARDIAN', 'FRIEND', 'OTHER',
])

const PatientContactSchema = z.object({
  relationship: ContactRelationshipSchema,
  name: z.string().min(1).max(200),
  phone: z.string().max(50).optional(),
  gender: z.nativeEnum(AdministrativeGender).optional(),
})

const DisplacementCategorySchema = z.enum([
  'IDP', 'RETURNEE', 'REFUGEE', 'HOST_COMMUNITY',
])

const EducationLevelSchema = z.enum([
  'NONE', 'PRIMARY', 'SECONDARY', 'TERTIARY', 'UNKNOWN',
])

const PatientLanguageSchema = z.enum(['en', 'ar', 'prs', 'ps'])
```

2. **In `PatientUltranosExtSchema`, add these fields after `mpiScore`:**

```typescript
    identifiers: z.array(PatientIdentifierInputSchema).optional(),
    // ── Extended demographics (HMIS Phase) ───────────────
    displacementCategory: DisplacementCategorySchema.optional(),
    nationality: z.string().length(2).toUpperCase().optional(),
    occupation: z.string().max(200).optional(),
    educationLevel: EducationLevelSchema.optional(),
    disability: z.boolean().optional(),
```

3. **In `FhirPatientSchema`, add after `birthYearOnly`:**

```typescript
  maritalStatus: MaritalStatusSchema.optional(),
```

4. **In `FhirPatientSchema`, add after `identifier`:**

```typescript
  contact: z.array(PatientContactSchema).max(10).optional(),
  communication: z.array(z.object({
    language: PatientLanguageSchema,
    preferred: z.boolean(),
  })).optional(),
  deceasedBoolean: z.boolean().optional(),
  deceasedDateTime: z.string().datetime().optional(),
```

5. **Update `ConsentInputSchema` — change the language enum to include 'ps':**

```typescript
const ConsentInputSchema = z.object({
  method: z.enum(['WRITTEN', 'VERBAL_WITNESSED']),
  witnessedBy: z.string().optional(),
  language: PatientLanguageSchema,
  version: z.string().min(1),
})
```

6. **In `CreatePatientMpiInputSchema`, add after `mpiProceedToken`:**

```typescript
    maritalStatus:        MaritalStatusSchema.optional(),
    contacts:             z.array(PatientContactSchema).max(2).optional(),
    phoneUse:             z.enum(['home', 'work', 'mobile']).optional(),
    displacementCategory: DisplacementCategorySchema.optional(),
    nationality:          z.string().length(2).optional(),
    occupation:           z.string().max(200).optional(),
    educationLevel:       EducationLevelSchema.optional(),
    disability:           z.boolean().optional(),
    preferredLanguage:    PatientLanguageSchema.optional(),
```

7. **Also update the `consent` field in `CreatePatientMpiInputSchema`** (it already uses `ConsentInputSchema` which was updated above — no extra change needed there).

- [ ] **Step 2: Run existing schema tests to confirm nothing broke**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
pnpm --filter @ultranos/shared-types test -- --run packages/shared-types/src/__tests__/patient.schema.test.ts
```

Expected: all existing tests pass (no Pashto tests yet — those come next).

- [ ] **Step 3: Add new tests for the HMIS demographic fields and Pashto language**

In `packages/shared-types/src/__tests__/patient.schema.test.ts`, add these test blocks after the existing tests:

```typescript
describe('CreatePatientMpiInputSchema — HMIS demographic fields', () => {
  const base = {
    nameLocal: 'Ahmad Karimi',
    nameGiven: 'Ahmad',
    gender: 'male',
    birthYearOnly: true,
    birthYear: 1985,
    isNomadic: false,
    consent: { method: 'WRITTEN', language: 'en', version: '1.0' },
    addressOrigin: { province: 'Kabul', district: 'Kabul' },
  }

  it('accepts maritalStatus M', () => {
    const result = CreatePatientMpiInputSchema.safeParse({ ...base, maritalStatus: 'M' })
    expect(result.success).toBe(true)
  })

  it('rejects polygamous maritalStatus P', () => {
    const result = CreatePatientMpiInputSchema.safeParse({ ...base, maritalStatus: 'P' })
    expect(result.success).toBe(false)
  })

  it('accepts all valid marital status codes', () => {
    for (const code of ['M', 'S', 'D', 'W', 'U'] as const) {
      const result = CreatePatientMpiInputSchema.safeParse({ ...base, maritalStatus: code })
      expect(result.success).toBe(true)
    }
  })

  it('accepts a single emergency contact', () => {
    const result = CreatePatientMpiInputSchema.safeParse({
      ...base,
      contacts: [{ relationship: 'SPOUSE', name: 'Fatima Ahmad', phone: '+93701234567' }],
    })
    expect(result.success).toBe(true)
  })

  it('rejects more than 2 emergency contacts', () => {
    const contact = { relationship: 'SPOUSE' as const, name: 'Test' }
    const result = CreatePatientMpiInputSchema.safeParse({
      ...base,
      contacts: [contact, contact, contact],
    })
    expect(result.success).toBe(false)
  })

  it('accepts displacement categories', () => {
    for (const cat of ['IDP', 'RETURNEE', 'REFUGEE', 'HOST_COMMUNITY'] as const) {
      const result = CreatePatientMpiInputSchema.safeParse({ ...base, displacementCategory: cat })
      expect(result.success).toBe(true)
    }
  })

  it('accepts education levels', () => {
    for (const lvl of ['NONE', 'PRIMARY', 'SECONDARY', 'TERTIARY', 'UNKNOWN'] as const) {
      const result = CreatePatientMpiInputSchema.safeParse({ ...base, educationLevel: lvl })
      expect(result.success).toBe(true)
    }
  })

  it('accepts nationality as 2-char ISO code', () => {
    const result = CreatePatientMpiInputSchema.safeParse({ ...base, nationality: 'AF' })
    expect(result.success).toBe(true)
  })

  it('rejects nationality longer than 2 chars', () => {
    const result = CreatePatientMpiInputSchema.safeParse({ ...base, nationality: 'AFG' })
    expect(result.success).toBe(false)
  })

  it('accepts disability boolean', () => {
    const result = CreatePatientMpiInputSchema.safeParse({ ...base, disability: true })
    expect(result.success).toBe(true)
  })

  it('accepts phoneUse values', () => {
    for (const use of ['home', 'work', 'mobile'] as const) {
      const result = CreatePatientMpiInputSchema.safeParse({ ...base, phoneUse: use })
      expect(result.success).toBe(true)
    }
  })
})

describe('CreatePatientMpiInputSchema — Pashto language support', () => {
  const base = {
    nameLocal: 'احمد کریمي',
    nameGiven: 'احمد',
    gender: 'male',
    birthYearOnly: true,
    birthYear: 1985,
    isNomadic: false,
    addressOrigin: { province: 'Kabul', district: 'Kabul' },
  }

  it('accepts ps (Pashto) as consent language', () => {
    const result = CreatePatientMpiInputSchema.safeParse({
      ...base,
      consent: { method: 'WRITTEN', language: 'ps', version: '1.0' },
    })
    expect(result.success).toBe(true)
  })

  it('accepts ps (Pashto) as preferredLanguage', () => {
    const result = CreatePatientMpiInputSchema.safeParse({
      ...base,
      preferredLanguage: 'ps',
      consent: { method: 'WRITTEN', language: 'en', version: '1.0' },
    })
    expect(result.success).toBe(true)
  })
})
```

- [ ] **Step 4: Run all schema tests to confirm new tests pass**

```bash
pnpm --filter @ultranos/shared-types test -- --run packages/shared-types/src/__tests__/patient.schema.test.ts
```

Expected: all tests pass including the new HMIS + Pashto tests.

- [ ] **Step 5: Build the package**

```bash
pnpm --filter @ultranos/shared-types build
```

Expected: clean build.

- [ ] **Step 6: Commit**

```bash
git add packages/shared-types/src/fhir/patient.schema.ts packages/shared-types/src/__tests__/patient.schema.test.ts
git commit -m "feat(shared-types): extend Zod schemas for HMIS demographics + Pashto language support"
```

---

## Task 3 — Database Migration: Add new columns to `patients` table

**Files:** None (executed via Supabase MCP)

- [ ] **Step 1: Apply the migration using Supabase MCP**

Use `mcp__plugin_supabase_supabase__apply_migration` with:

- **name:** `add_patient_hmis_demographics`
- **query:**

```sql
-- HMIS extended demographics: marital status, displacement, nationality,
-- occupation, education, disability, phone use type, emergency contacts.
-- All new columns are nullable — existing rows unaffected.

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS marital_status        VARCHAR(1),
  ADD COLUMN IF NOT EXISTS displacement_category VARCHAR(20),
  ADD COLUMN IF NOT EXISTS nationality           CHAR(2),
  ADD COLUMN IF NOT EXISTS occupation            VARCHAR(200),
  ADD COLUMN IF NOT EXISTS education_level       VARCHAR(10),
  ADD COLUMN IF NOT EXISTS disability            BOOLEAN,
  ADD COLUMN IF NOT EXISTS telecom_phone_use     VARCHAR(10),
  ADD COLUMN IF NOT EXISTS emergency_contacts    JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Add check constraints to enforce controlled vocabulary
ALTER TABLE patients
  ADD CONSTRAINT chk_marital_status
    CHECK (marital_status IS NULL OR marital_status IN ('M','S','D','W','U')),
  ADD CONSTRAINT chk_displacement_category
    CHECK (displacement_category IS NULL OR displacement_category IN ('IDP','RETURNEE','REFUGEE','HOST_COMMUNITY')),
  ADD CONSTRAINT chk_education_level
    CHECK (education_level IS NULL OR education_level IN ('NONE','PRIMARY','SECONDARY','TERTIARY','UNKNOWN')),
  ADD CONSTRAINT chk_telecom_phone_use
    CHECK (telecom_phone_use IS NULL OR telecom_phone_use IN ('home','work','mobile'));

-- Index displacement_category for HMIS population-level reporting queries
CREATE INDEX IF NOT EXISTS idx_patients_displacement_category
  ON patients (displacement_category)
  WHERE displacement_category IS NOT NULL;

-- Index nationality for reporting
CREATE INDEX IF NOT EXISTS idx_patients_nationality
  ON patients (nationality)
  WHERE nationality IS NOT NULL;
```

- [ ] **Step 2: Verify columns exist**

Use `mcp__plugin_supabase_supabase__execute_sql` with:

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'patients'
  AND column_name IN (
    'marital_status','displacement_category','nationality',
    'occupation','education_level','disability',
    'telecom_phone_use','emergency_contacts'
  )
ORDER BY column_name;
```

Expected: 8 rows returned, each showing the correct type and `is_nullable = YES` (except `emergency_contacts` which has `column_default = '[]'`).

- [ ] **Step 3: Commit (migration is tracked in Supabase — no file to commit)**

```bash
git commit --allow-empty -m "feat(db): migration add_patient_hmis_demographics — 8 new columns on patients table"
```

---

## Task 4 — Hub API: Update `patient.ts` router

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/patient.ts`
- Modify: `apps/hub-api/src/trpc/routers/patient-registration.ts`

- [ ] **Step 1: Update `SUPPORTED_LOCALES` in `patient-registration.ts`**

In `apps/hub-api/src/trpc/routers/patient-registration.ts`, change line:

```typescript
const SUPPORTED_LOCALES = ['en', 'ar', 'prs'] as const
```

to:

```typescript
const SUPPORTED_LOCALES = ['en', 'ar', 'prs', 'ps'] as const
```

- [ ] **Step 2: Update the `list` SELECT and mapper in `patient.ts`**

In `apps/hub-api/src/trpc/routers/patient.ts`, locate the `list` procedure's `.select(...)` call (around line 48). Append the new columns to the SELECT string:

Change:
```typescript
'mpi_score, mpi_warn'
```
to:
```typescript
'mpi_score, mpi_warn, ' +
'marital_status, displacement_category, nationality, occupation, ' +
'education_level, disability, telecom_phone_use, emergency_contacts'
```

Then in the `list` mapper (`patients: rows.map(...)`), add the new fields inside `_ultranos` (after `mpiScore`):

```typescript
            mpiScore:    row.mpi_score,
            mpiWarn:     (row.mpi_warn as boolean) ?? false,
            displacementCategory: (row.displacement_category as string) ?? undefined,
            nationality: (row.nationality as string) ?? undefined,
            occupation:  (row.occupation as string) ?? undefined,
            educationLevel: (row.education_level as string) ?? undefined,
            disability:  (row.disability as boolean) ?? undefined,
```

And update the `telecom` mapping to include `use`:

```typescript
          telecom: row.telecom_phone
            ? [{ system: 'phone' as const, value: row.telecom_phone as string, use: (row.telecom_phone_use as 'home' | 'work' | 'mobile') ?? undefined }]
            : [],
```

Also add `maritalStatus` and `contact` at the top-level patient object (after `birthYearOnly`):

```typescript
          maritalStatus: (row.marital_status as string) ?? undefined,
          contact: Array.isArray(row.emergency_contacts) && row.emergency_contacts.length > 0
            ? row.emergency_contacts
            : undefined,
```

- [ ] **Step 3: Apply the same SELECT + mapper changes to the `search` procedure**

The `search` procedure (around line 183) has an identical SELECT string and identical mapper. Apply the same changes from Step 2 to both the SELECT and the mapper in `search`.

- [ ] **Step 4: Update `patient.create` — add new fields to `db.toRow()`**

In `apps/hub-api/src/trpc/routers/patient.ts`, locate the `create` mutation's `db.toRow({...})` call (around line 469). After the existing `guardian_id` line, add:

```typescript
        marital_status:       input.maritalStatus ?? null,
        displacement_category: input.displacementCategory ?? null,
        nationality:          input.nationality?.toUpperCase() ?? null,
        occupation:           input.occupation ?? null,
        education_level:      input.educationLevel ?? null,
        disability:           input.disability ?? null,
        telecom_phone_use:    input.phoneUse ?? null,
        emergency_contacts:   input.contacts ? JSON.stringify(input.contacts) : JSON.stringify([]),
        preferred_language:   input.preferredLanguage ?? null,
```

Note: the existing `preferred_language: null` hard-code on line 506 must be **replaced** by the `preferred_language: input.preferredLanguage ?? null` line above (do not leave both).

- [ ] **Step 5: Apply the same `db.toRow()` additions to `patient.syncCreate`**

The `syncCreate` mutation (around line 580) has the same `db.toRow({...})` pattern. Apply the identical additions from Step 4 to the `syncCreate` row builder.

- [ ] **Step 6: Run the patient router tests**

```bash
pnpm --filter hub-api test -- --run src/__tests__/patient-crud.test.ts src/__tests__/patient-registration.test.ts src/__tests__/patient-registration-mpi.test.ts
```

Expected: all pass. If tests fail because they don't include the new fields in their fixtures, update each fixture to include the new columns in the expected DB insert (add `marital_status: null, displacement_category: null, ...` etc. in the test's `toRow` expectation).

- [ ] **Step 7: Commit**

```bash
git add apps/hub-api/src/trpc/routers/patient.ts apps/hub-api/src/trpc/routers/patient-registration.ts
git commit -m "feat(hub-api): persist HMIS demographic fields + Pashto language in patient create/list/search"
```

---

## Task 5 — New Component: `SocialInfoSection.tsx`

**Files:**
- Create: `apps/opd-lite/src/components/registration/SocialInfoSection.tsx`

This card collects the WHO DHIS2 / MoPH HMIS fields: displacement category, nationality, occupation, education level, and disability.

- [ ] **Step 1: Create the component**

```typescript
'use client'

import { useTranslations } from 'next-intl'
import { Card } from '@/components/Card'
import type { DisplacementCategory, EducationLevel } from '@ultranos/shared-types'

// ISO 3166-1 alpha-2 codes for the primary nationalities in this deployment context.
// Extend for other deployments. 'OTHER' triggers the free-text fallback.
const NATIONALITY_OPTIONS = [
  { value: 'AF', labelKey: 'nationalityAF' },
  { value: 'PK', labelKey: 'nationalityPK' },
  { value: 'IR', labelKey: 'nationalityIR' },
  { value: 'TJ', labelKey: 'nationalityTJ' },
  { value: 'UZ', labelKey: 'nationalityUZ' },
  { value: 'TM', labelKey: 'nationalityTM' },
  { value: 'IN', labelKey: 'nationalityIN' },
  { value: 'SA', labelKey: 'nationalitySA' },
  { value: 'AE', labelKey: 'nationalityAE' },
] as const

const DISPLACEMENT_OPTIONS: { value: DisplacementCategory; labelKey: string }[] = [
  { value: 'IDP',            labelKey: 'displacementIDP' },
  { value: 'RETURNEE',       labelKey: 'displacementReturnee' },
  { value: 'REFUGEE',        labelKey: 'displacementRefugee' },
  { value: 'HOST_COMMUNITY', labelKey: 'displacementHostCommunity' },
]

const EDUCATION_OPTIONS: { value: EducationLevel; labelKey: string }[] = [
  { value: 'NONE',      labelKey: 'educationNone' },
  { value: 'PRIMARY',   labelKey: 'educationPrimary' },
  { value: 'SECONDARY', labelKey: 'educationSecondary' },
  { value: 'TERTIARY',  labelKey: 'educationTertiary' },
  { value: 'UNKNOWN',   labelKey: 'educationUnknown' },
]

interface SocialInfoSectionProps {
  displacementCategory: DisplacementCategory | ''
  nationality: string
  occupation: string
  educationLevel: EducationLevel | ''
  disability: boolean
  onDisplacementCategoryChange: (value: DisplacementCategory | '') => void
  onNationalityChange: (value: string) => void
  onOccupationChange: (value: string) => void
  onEducationLevelChange: (value: EducationLevel | '') => void
  onDisabilityChange: (value: boolean) => void
}

export function SocialInfoSection({
  displacementCategory,
  nationality,
  occupation,
  educationLevel,
  disability,
  onDisplacementCategoryChange,
  onNationalityChange,
  onOccupationChange,
  onEducationLevelChange,
  onDisabilityChange,
}: SocialInfoSectionProps) {
  const t = useTranslations('registration')

  return (
    <Card as="fieldset">
      <legend className="text-base font-bold text-foreground mb-4">
        {t('socialInfoSection')}
      </legend>

      <div className="space-y-4">
        {/* Displacement / population category */}
        <div>
          <label
            htmlFor="displacement-category"
            className="mb-1 block text-sm font-semibold text-foreground"
          >
            {t('displacementCategory')}
            <span className="ms-1 text-xs font-normal text-muted-foreground">
              ({t('optional')})
            </span>
          </label>
          <select
            id="displacement-category"
            value={displacementCategory}
            onChange={(e) => onDisplacementCategoryChange(e.target.value as DisplacementCategory | '')}
            className="w-full min-h-[44px] rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">{t('displacementNone')}</option>
            {DISPLACEMENT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(opt.labelKey)}
              </option>
            ))}
          </select>
        </div>

        {/* Nationality */}
        <div>
          <label
            htmlFor="nationality"
            className="mb-1 block text-sm font-semibold text-foreground"
          >
            {t('nationality')}
            <span className="ms-1 text-xs font-normal text-muted-foreground">
              ({t('optional')})
            </span>
          </label>
          <select
            id="nationality"
            value={nationality}
            onChange={(e) => onNationalityChange(e.target.value)}
            className="w-full min-h-[44px] rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">{t('nationalitySelectPlaceholder')}</option>
            {NATIONALITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(opt.labelKey)}
              </option>
            ))}
          </select>
        </div>

        {/* Occupation */}
        <div>
          <label
            htmlFor="occupation"
            className="mb-1 block text-sm font-semibold text-foreground"
          >
            {t('occupation')}
            <span className="ms-1 text-xs font-normal text-muted-foreground">
              ({t('optional')})
            </span>
          </label>
          <input
            id="occupation"
            type="text"
            dir="auto"
            maxLength={200}
            className="w-full min-h-[44px] rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder={t('occupationPlaceholder')}
            value={occupation}
            onChange={(e) => onOccupationChange(e.target.value)}
          />
        </div>

        {/* Education level */}
        <div>
          <label
            htmlFor="education-level"
            className="mb-1 block text-sm font-semibold text-foreground"
          >
            {t('educationLevel')}
            <span className="ms-1 text-xs font-normal text-muted-foreground">
              ({t('optional')})
            </span>
          </label>
          <select
            id="education-level"
            value={educationLevel}
            onChange={(e) => onEducationLevelChange(e.target.value as EducationLevel | '')}
            className="w-full min-h-[44px] rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">{t('educationSelectPlaceholder')}</option>
            {EDUCATION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(opt.labelKey)}
              </option>
            ))}
          </select>
        </div>

        {/* Disability */}
        <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
          <input
            type="checkbox"
            checked={disability}
            onChange={(e) => onDisabilityChange(e.target.checked)}
            className="h-5 w-5 rounded border-border text-primary focus:ring-ring"
          />
          <span className="text-sm font-medium text-foreground">
            {t('disability')}
          </span>
        </label>
      </div>
    </Card>
  )
}
```

- [ ] **Step 2: Verify the component compiles (no TS errors)**

```bash
pnpm --filter opd-lite typecheck
```

Expected: exits 0. If it fails because the i18n keys don't exist yet, that is expected and will be fixed in Task 8 — the typecheck will pass fully after translations are added.

- [ ] **Step 3: Commit**

```bash
git add apps/opd-lite/src/components/registration/SocialInfoSection.tsx
git commit -m "feat(opd-lite): add SocialInfoSection registration component (HMIS demographics)"
```

---

## Task 6 — New Component: `EmergencyContactSection.tsx`

**Files:**
- Create: `apps/opd-lite/src/components/registration/EmergencyContactSection.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client'

import { useTranslations } from 'next-intl'
import { Plus, Trash2 } from '@ultranos/ui-kit/icons'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/Card'
import type { ContactRelationship, PatientContact } from '@ultranos/shared-types'

const RELATIONSHIP_OPTIONS: { value: ContactRelationship; labelKey: string }[] = [
  { value: 'SPOUSE',   labelKey: 'contactSpouse' },
  { value: 'PARENT',   labelKey: 'contactParent' },
  { value: 'SIBLING',  labelKey: 'contactSibling' },
  { value: 'CHILD',    labelKey: 'contactChild' },
  { value: 'GUARDIAN', labelKey: 'contactGuardian' },
  { value: 'FRIEND',   labelKey: 'contactFriend' },
  { value: 'OTHER',    labelKey: 'contactOther' },
]

interface EmergencyContactSectionProps {
  contacts: PatientContact[]
  onContactsChange: (contacts: PatientContact[]) => void
}

function emptyContact(): PatientContact {
  return { relationship: 'OTHER', name: '' }
}

export function EmergencyContactSection({
  contacts,
  onContactsChange,
}: EmergencyContactSectionProps) {
  const t = useTranslations('registration')

  function addContact() {
    if (contacts.length < 2) {
      onContactsChange([...contacts, emptyContact()])
    }
  }

  function removeContact(index: number) {
    onContactsChange(contacts.filter((_, i) => i !== index))
  }

  function updateContact(index: number, patch: Partial<PatientContact>) {
    onContactsChange(contacts.map((c, i) => (i === index ? { ...c, ...patch } : c)))
  }

  return (
    <Card as="fieldset">
      <legend className="text-base font-bold text-foreground mb-4">
        {t('emergencyContactSection')}
        <span className="ms-1 text-xs font-normal text-muted-foreground">
          ({t('optional')})
        </span>
      </legend>

      <div className="space-y-4">
        {contacts.map((contact, index) => (
          <div
            key={index}
            className="rounded-lg border border-border p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">
                {t('emergencyContactN', { n: index + 1 })}
              </p>
              <button
                type="button"
                onClick={() => removeContact(index)}
                className="text-muted-foreground hover:text-destructive focus:outline-none focus:ring-1 focus:ring-ring rounded p-1"
                aria-label={t('removeContact')}
              >
                <Trash2 size={16} />
              </button>
            </div>

            {/* Relationship */}
            <div>
              <label
                htmlFor={`contact-relationship-${index}`}
                className="mb-1 block text-sm font-semibold text-foreground"
              >
                {t('contactRelationship')}
                <span className="text-destructive ms-0.5" aria-hidden="true">*</span>
              </label>
              <select
                id={`contact-relationship-${index}`}
                value={contact.relationship}
                onChange={(e) => updateContact(index, { relationship: e.target.value as ContactRelationship })}
                className="w-full min-h-[44px] rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {RELATIONSHIP_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t(opt.labelKey)}
                  </option>
                ))}
              </select>
            </div>

            {/* Name */}
            <div>
              <label
                htmlFor={`contact-name-${index}`}
                className="mb-1 block text-sm font-semibold text-foreground"
              >
                {t('contactName')}
                <span className="text-destructive ms-0.5" aria-hidden="true">*</span>
              </label>
              <input
                id={`contact-name-${index}`}
                type="text"
                dir="auto"
                maxLength={200}
                className="w-full min-h-[44px] rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder={t('contactNamePlaceholder')}
                value={contact.name}
                onChange={(e) => updateContact(index, { name: e.target.value })}
              />
            </div>

            {/* Phone */}
            <div>
              <label
                htmlFor={`contact-phone-${index}`}
                className="mb-1 block text-sm font-semibold text-foreground"
              >
                {t('contactPhone')}
                <span className="ms-1 text-xs font-normal text-muted-foreground">
                  ({t('optional')})
                </span>
              </label>
              <input
                id={`contact-phone-${index}`}
                type="tel"
                dir="ltr"
                inputMode="tel"
                maxLength={50}
                className="w-full min-h-[44px] rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder={t('phonePlaceholder')}
                value={contact.phone ?? ''}
                onChange={(e) => updateContact(index, { phone: e.target.value || undefined })}
              />
            </div>
          </div>
        ))}

        {contacts.length < 2 && (
          <Button
            type="button"
            variant="outline"
            onClick={addContact}
            className="gap-1.5"
          >
            <Plus size={16} />
            {t('addEmergencyContact')}
          </Button>
        )}
      </div>
    </Card>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/opd-lite/src/components/registration/EmergencyContactSection.tsx
git commit -m "feat(opd-lite): add EmergencyContactSection registration component"
```

---

## Task 7 — Update Registration Form and `ConsentSection`

**Files:**
- Modify: `apps/opd-lite/src/components/registration/ConsentSection.tsx`
- Modify: `apps/opd-lite/src/components/registration/PatientRegistrationForm.tsx`

- [ ] **Step 1: Add Pashto to `ConsentSection`**

In `apps/opd-lite/src/components/registration/ConsentSection.tsx`:

1. Change the `ConsentLanguage` type:
```typescript
type ConsentLanguage = 'en' | 'ar' | 'prs' | 'ps'
```

2. Add Pashto to the `CONSENT_LANGUAGES` array:
```typescript
const CONSENT_LANGUAGES: { value: ConsentLanguage; labelKey: string }[] = [
  { value: 'en',  labelKey: 'languageEnglish' },
  { value: 'ar',  labelKey: 'languageArabic' },
  { value: 'prs', labelKey: 'languageDari' },
  { value: 'ps',  labelKey: 'languagePashto' },
]
```

- [ ] **Step 2: Update `PatientRegistrationForm.tsx` — new state, Zod schema, payload, and render**

Replace the entire contents of `apps/opd-lite/src/components/registration/PatientRegistrationForm.tsx` with the following. The key changes are marked with `// NEW`:

```typescript
'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { z } from 'zod'
import { AdministrativeGender } from '@ultranos/shared-types'
import type {
  AfghanProvince,
  MaritalStatus,
  DisplacementCategory,
  EducationLevel,
  PatientContact,
  PatientLanguage,
} from '@ultranos/shared-types'
import { Button } from '@/components/ui/Button'
import { NameInputSection } from './NameInputSection'
import { GeographySection } from './GeographySection'
import { ConsentSection } from './ConsentSection'
import { MpiResultModal } from './MpiResultModal'
import { SocialInfoSection } from './SocialInfoSection'           // NEW
import { EmergencyContactSection } from './EmergencyContactSection' // NEW
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { Card } from '@/components/Card'
import { db } from '@/lib/db'
import { EncryptionKeyNotAvailableError } from '@/lib/encryption-key-store'
import type { FhirPatient } from '@ultranos/shared-types'

// ── Hub API helpers ──────────────────────────────────────────────────────────

function getHubApiUrl(): string {
  if (typeof window !== 'undefined') {
    return process.env.NEXT_PUBLIC_HUB_API_URL ?? 'http://localhost:3000/api/trpc'
  }
  return process.env.NEXT_PUBLIC_HUB_API_URL ?? 'http://localhost:3000/api/trpc'
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const supabase = getSupabaseBrowserClient()
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

interface CheckDuplicatesResult {
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

interface CreatePatientResult {
  id: string
}

async function checkDuplicates(input: Record<string, unknown>): Promise<CheckDuplicatesResult> {
  const url = new URL(getHubApiUrl())
  url.pathname = url.pathname.replace(/\/$/, '') + '/patient.checkDuplicates'
  url.searchParams.set('input', JSON.stringify({ json: input }))

  const headers = await getAuthHeaders()
  const res = await fetch(url.toString(), { headers })
  if (!res.ok) throw new Error(`Hub API error: ${res.status}`)
  const body = await res.json() as { result: { data: { json: CheckDuplicatesResult } } }
  return body.result.data.json
}

async function createPatient(input: Record<string, unknown>): Promise<CreatePatientResult> {
  const url = new URL(getHubApiUrl())
  url.pathname = url.pathname.replace(/\/$/, '') + '/patient.create'

  const headers = await getAuthHeaders()
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers,
    body: JSON.stringify({ json: input }),
  })
  if (!res.ok) throw new Error(`Hub API error: ${res.status}`)
  const body = await res.json() as { result: { data: { json: CreatePatientResult } } }
  return body.result.data.json
}

// ── Validation schema ────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear()

const ClientRegistrationSchema = z.object({
  nameGiven: z.string().min(1, 'required').max(200),
  nameFather: z.string().max(200).optional(),
  nameGrandfather: z.string().max(200).optional(),
  gender: z.nativeEnum(AdministrativeGender, { required_error: 'required' }),
  birthYearOnly: z.boolean(),
  birthYear: z.number().int().min(1900).max(CURRENT_YEAR).optional(),
  birthDate: z.string().optional(),
  phone: z.string().max(50).optional(),
  phoneUse: z.enum(['home', 'work', 'mobile']).optional(),       // NEW
  nationalId: z.string().max(200).optional(),
  preferredLanguage: z.enum(['en', 'ar', 'prs', 'ps']).optional(), // NEW: added 'ps'
  isNomadic: z.boolean().optional(),
  bloodGroup: z.string().optional(),
  maritalStatus: z.enum(['M', 'S', 'D', 'W', 'U']).optional(),  // NEW
  addressOriginProvince: z.string().min(1, 'required'),
  addressOriginDistrict: z.string().min(1, 'required'),
  addressOriginVillage: z.string().max(200).optional(),
  addressCurrentProvince: z.string().optional(),
  addressCurrentDistrict: z.string().optional(),
  addressCurrentVillage: z.string().max(200).optional(),
  // NEW: social / HMIS fields
  displacementCategory: z.enum(['IDP', 'RETURNEE', 'REFUGEE', 'HOST_COMMUNITY']).optional(),
  nationality: z.string().length(2).optional(),
  occupation: z.string().max(200).optional(),
  educationLevel: z.enum(['NONE', 'PRIMARY', 'SECONDARY', 'TERTIARY', 'UNKNOWN']).optional(),
  disability: z.boolean().optional(),
  consentMethod: z.enum(['WRITTEN', 'VERBAL_WITNESSED'], { required_error: 'required' }),
  consentWitnessedBy: z.string().optional(),
  consentLanguage: z.enum(['en', 'ar', 'prs', 'ps']),           // NEW: added 'ps'
}).superRefine((val, ctx) => {
  if (val.birthYearOnly && !val.birthYear) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['birthYear'], message: 'required' })
  }
  if (!val.birthYearOnly && !val.birthDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['birthDate'], message: 'required' })
  }
  if (val.consentMethod === 'VERBAL_WITNESSED' && !val.consentWitnessedBy) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['consentWitnessedBy'], message: 'required' })
  }
})

// ── Address state type ───────────────────────────────────────────────────────

interface AddressFields {
  province: AfghanProvince | ''
  district: string
  village: string
}

const EMPTY_ADDRESS: AddressFields = { province: '', district: '', village: '' }

const BLOOD_GROUPS = [
  'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown',
] as const

// ── Component ────────────────────────────────────────────────────────────────

interface PatientRegistrationFormProps {
  prefilledNameGiven?: string
}

export function PatientRegistrationForm({
  prefilledNameGiven = '',
}: PatientRegistrationFormProps) {
  const t = useTranslations('registration')
  const locale = useLocale()
  const isRtl = locale === 'ar' || locale === 'prs' || locale === 'ps'
  const router = useRouter()

  // ── Form state ──
  const [nameGiven, setNameGiven] = useState(prefilledNameGiven)
  const [nameFather, setNameFather] = useState('')
  const [nameGrandfather, setNameGrandfather] = useState('')
  const [gender, setGender] = useState<AdministrativeGender | ''>('')
  const [birthYearOnly, setBirthYearOnly] = useState(true)
  const [birthYear, setBirthYear] = useState<string>('')
  const [birthDate, setBirthDate] = useState('')
  const [phone, setPhone] = useState('')
  const [phoneUse, setPhoneUse] = useState<'home' | 'work' | 'mobile' | ''>('')  // NEW
  const [nationalId, setNationalId] = useState('')
  const [preferredLanguage, setPreferredLanguage] = useState<PatientLanguage>(
    locale === 'prs' ? 'prs' : locale === 'ar' ? 'ar' : locale === 'ps' ? 'ps' : 'en', // NEW: ps
  )
  const [isNomadic, setIsNomadic] = useState(false)
  const [bloodGroup, setBloodGroup] = useState<string>('Unknown')
  const [maritalStatus, setMaritalStatus] = useState<MaritalStatus | ''>('')  // NEW

  // Address
  const [addressOrigin, setAddressOrigin] = useState<AddressFields>(EMPTY_ADDRESS)
  const [addressCurrent, setAddressCurrent] = useState<AddressFields>(EMPTY_ADDRESS)
  const [sameAsOrigin, setSameAsOrigin] = useState(false)

  // NEW: Social / HMIS fields
  const [displacementCategory, setDisplacementCategory] = useState<DisplacementCategory | ''>('')
  const [nationality, setNationality] = useState('')
  const [occupation, setOccupation] = useState('')
  const [educationLevel, setEducationLevel] = useState<EducationLevel | ''>('')
  const [disability, setDisability] = useState(false)

  // NEW: Emergency contacts
  const [emergencyContacts, setEmergencyContacts] = useState<PatientContact[]>([])

  // Consent
  const [consentMethod, setConsentMethod] = useState<'WRITTEN' | 'VERBAL_WITNESSED' | ''>('')
  const [consentWitnessedBy, setConsentWitnessedBy] = useState('')
  const [consentLanguage, setConsentLanguage] = useState<PatientLanguage>(
    locale === 'prs' ? 'prs' : locale === 'ar' ? 'ar' : locale === 'ps' ? 'ps' : 'en', // NEW: ps
  )

  // UI state
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  // MPI modal state
  const [mpiModalOpen, setMpiModalOpen] = useState(false)
  const [mpiDecision, setMpiDecision] = useState<'WARN' | 'BLOCK'>('WARN')
  const [mpiCandidates, setMpiCandidates] = useState<CheckDuplicatesResult['candidates']>([])
  const [mpiProceedToken, setMpiProceedToken] = useState<string | undefined>()

  // ── Build submission payload ──

  const buildPayload = useCallback(
    (proceedToken?: string) => {
      const nameLocal = [nameGiven, nameFather, nameGrandfather]
        .filter(Boolean)
        .join(' ')

      const payload: Record<string, unknown> = {
        nameLocal,
        nameGiven,
        nameFather: nameFather || undefined,
        nameGrandfather: nameGrandfather || undefined,
        gender: gender || undefined,
        birthYearOnly,
        birthYear: birthYear ? parseInt(birthYear, 10) : undefined,
        birthDate: birthDate || undefined,
        phone: phone || undefined,
        phoneUse: phoneUse || undefined,           // NEW
        nationalId: nationalId || undefined,
        isNomadic,
        preferredLanguage: preferredLanguage || undefined,
        bloodGroup: bloodGroup !== 'Unknown' ? bloodGroup : undefined,
        maritalStatus: maritalStatus || undefined, // NEW
        addressOrigin: addressOrigin.province
          ? {
              province: addressOrigin.province,
              district: addressOrigin.district,
              village: addressOrigin.village || undefined,
            }
          : undefined,
        addressCurrent: sameAsOrigin
          ? (addressOrigin.province
              ? {
                  province: addressOrigin.province,
                  district: addressOrigin.district,
                  village: addressOrigin.village || undefined,
                }
              : undefined)
          : (addressCurrent.province
              ? {
                  province: addressCurrent.province,
                  district: addressCurrent.district,
                  village: addressCurrent.village || undefined,
                }
              : undefined),
        // NEW: HMIS fields
        displacementCategory: displacementCategory || undefined,
        nationality: nationality || undefined,
        occupation: occupation || undefined,
        educationLevel: educationLevel || undefined,
        disability: disability || undefined,
        contacts: emergencyContacts.length > 0 ? emergencyContacts : undefined,
        consent: {
          method: consentMethod,
          witnessedBy: consentMethod === 'VERBAL_WITNESSED' ? consentWitnessedBy : undefined,
          language: consentLanguage,
          version: '1.0',
        },
      }

      if (proceedToken) {
        payload.mpiProceedToken = proceedToken
      }

      return payload
    },
    [
      nameGiven, nameFather, nameGrandfather, gender, birthYearOnly,
      birthYear, birthDate, phone, phoneUse, nationalId, preferredLanguage,
      isNomadic, bloodGroup, maritalStatus,
      addressOrigin, addressCurrent, sameAsOrigin,
      displacementCategory, nationality, occupation, educationLevel, disability,
      emergencyContacts, consentMethod, consentWitnessedBy, consentLanguage,
    ],
  )

  // ── Validate ──

  const validate = useCallback((): boolean => {
    const result = ClientRegistrationSchema.safeParse({
      nameGiven,
      nameFather: nameFather || undefined,
      nameGrandfather: nameGrandfather || undefined,
      gender: gender || undefined,
      birthYearOnly,
      birthYear: birthYear ? parseInt(birthYear, 10) : undefined,
      birthDate: birthDate || undefined,
      phone: phone || undefined,
      phoneUse: phoneUse || undefined,
      nationalId: nationalId || undefined,
      preferredLanguage: preferredLanguage || undefined,
      isNomadic,
      bloodGroup: bloodGroup || undefined,
      maritalStatus: maritalStatus || undefined,
      addressOriginProvince: addressOrigin.province,
      addressOriginDistrict: addressOrigin.district,
      addressOriginVillage: addressOrigin.village || undefined,
      addressCurrentProvince: addressCurrent.province || undefined,
      addressCurrentDistrict: addressCurrent.district || undefined,
      addressCurrentVillage: addressCurrent.village || undefined,
      displacementCategory: displacementCategory || undefined,
      nationality: nationality || undefined,
      occupation: occupation || undefined,
      educationLevel: educationLevel || undefined,
      disability: disability || undefined,
      consentMethod: consentMethod || undefined,
      consentWitnessedBy: consentWitnessedBy || undefined,
      consentLanguage,
    })

    if (!result.success) {
      const errors: Record<string, string> = {}
      for (const issue of result.error.issues) {
        const key = issue.path.join('.')
        if (!errors[key]) {
          errors[key] = issue.message === 'required' ? t('fieldRequired') : issue.message
        }
      }
      setFieldErrors(errors)
      return false
    }

    setFieldErrors({})
    return true
  }, [
    nameGiven, nameFather, nameGrandfather, gender, birthYearOnly,
    birthYear, birthDate, phone, phoneUse, nationalId, preferredLanguage,
    isNomadic, bloodGroup, maritalStatus,
    addressOrigin, addressCurrent,
    displacementCategory, nationality, occupation, educationLevel, disability,
    consentMethod, consentWitnessedBy, consentLanguage, t,
  ])

  // ── Persist to local IndexedDB ──

  const savePatientLocally = useCallback(
    async (id: string, now: string) => {
      const nameLocal = [nameGiven, nameFather, nameGrandfather]
        .filter(Boolean)
        .join(' ')

      const patient: FhirPatient = {
        id,
        resourceType: 'Patient',
        name: [{ given: nameGiven ? [nameGiven] : [], text: nameLocal }],
        gender: (gender as AdministrativeGender) || AdministrativeGender.UNKNOWN,
        birthDate: birthDate || (birthYear ? birthYear : undefined) as string | undefined,
        birthYearOnly,
        maritalStatus: (maritalStatus as MaritalStatus) || undefined,  // NEW
        telecom: phone
          ? [{ system: 'phone', value: phone, use: phoneUse || undefined }]  // NEW: use
          : [],
        contact: emergencyContacts.length > 0 ? emergencyContacts : undefined, // NEW
        _ultranos: {
          nameLocal,
          nameGiven: nameGiven || undefined,
          nameFather: nameFather || undefined,
          nameGrandfather: nameGrandfather || undefined,
          birthYear: birthYear ? parseInt(birthYear, 10) : undefined,
          addressOrigin: addressOrigin.province
            ? { province: addressOrigin.province, district: addressOrigin.district, village: addressOrigin.village || undefined }
            : undefined,
          addressCurrent: sameAsOrigin
            ? (addressOrigin.province
                ? { province: addressOrigin.province, district: addressOrigin.district, village: addressOrigin.village || undefined }
                : undefined)
            : (addressCurrent.province
                ? { province: addressCurrent.province, district: addressCurrent.district, village: addressCurrent.village || undefined }
                : undefined),
          isNomadic,
          bloodGroup: bloodGroup !== 'Unknown' ? bloodGroup : undefined,
          preferredLanguage: preferredLanguage || undefined,
          nationalIdHash: undefined,
          isActive: true,
          patient_tier: 'FREE',
          createdAt: now,
          // NEW: HMIS fields
          displacementCategory: (displacementCategory as DisplacementCategory) || undefined,
          nationality: nationality || undefined,
          occupation: occupation || undefined,
          educationLevel: (educationLevel as EducationLevel) || undefined,
          disability: disability || undefined,
        },
        meta: { lastUpdated: now },
      }

      try {
        await db.patients.put(patient)
      } catch (err) {
        if (err instanceof EncryptionKeyNotAvailableError) {
          throw err
        }
      }
    },
    [
      nameGiven, nameFather, nameGrandfather, gender, birthDate, birthYear,
      birthYearOnly, phone, phoneUse, preferredLanguage, isNomadic, bloodGroup,
      maritalStatus, addressOrigin, addressCurrent, sameAsOrigin,
      displacementCategory, nationality, occupation, educationLevel, disability,
      emergencyContacts,
    ],
  )

  // ── Submit handler ──

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setSubmitError('')

      if (!validate()) return

      setSubmitting(true)
      try {
        const payload = buildPayload()

        const dupeCheckInput: Record<string, unknown> = {
          nameGiven: payload.nameGiven,
          nameFather: payload.nameFather,
          nameGrandfather: payload.nameGrandfather,
          birthYear: payload.birthYear,
          gender: payload.gender,
          phone: payload.phone,
          nationalId: payload.nationalId as string | undefined,
          addressDistrictOrigin: (payload.addressOrigin as { district?: string } | undefined)?.district,
          addressProvinceOrigin: (payload.addressOrigin as { province?: string } | undefined)?.province,
        }
        const dupeResult = await checkDuplicates(dupeCheckInput)

        if (dupeResult.decision === 'ALLOW') {
          const created = await createPatient(payload)
          try {
            await savePatientLocally(created.id, new Date().toISOString())
          } catch (saveErr) {
            if (saveErr instanceof EncryptionKeyNotAvailableError) {
              const returnUrl = encodeURIComponent(`/${locale}/patient/${created.id}`)
              window.location.href = `/${locale}/login?returnUrl=${returnUrl}`
              return
            }
          }
          router.push(`/${locale}/patient/${created.id}`)
        } else {
          setMpiDecision('WARN')
          setMpiCandidates(dupeResult.candidates)
          setMpiProceedToken(dupeResult.proceedToken)
          setMpiModalOpen(true)
        }
      } catch (err) {
        setSubmitError(
          err instanceof Error ? err.message : t('submitError'),
        )
      } finally {
        setSubmitting(false)
      }
    },
    [validate, buildPayload, savePatientLocally, router, locale, t],
  )

  // ── MPI modal handlers ──

  const handleMpiProceed = useCallback(
    async (token: string) => {
      setMpiModalOpen(false)
      setSubmitting(true)
      setSubmitError('')

      try {
        const payload = buildPayload(token)
        const created = await createPatient(payload)
        try {
          await savePatientLocally(created.id, new Date().toISOString())
        } catch (saveErr) {
          if (saveErr instanceof EncryptionKeyNotAvailableError) {
            const returnUrl = encodeURIComponent(`/${locale}/patient/${created.id}`)
            window.location.href = `/${locale}/login?returnUrl=${returnUrl}`
            return
          }
        }
        router.push(`/${locale}/patient/${created.id}`)
      } catch (err) {
        setSubmitError(
          err instanceof Error ? err.message : t('submitError'),
        )
      } finally {
        setSubmitting(false)
      }
    },
    [buildPayload, savePatientLocally, router, locale, t],
  )

  const handleMpiCancel = useCallback(() => {
    setMpiModalOpen(false)
  }, [])

  const handleGoToPatient = useCallback(
    (patientId: string) => {
      setMpiModalOpen(false)
      router.push(`/${locale}/patient/${patientId}`)
    },
    [router, locale],
  )

  return (
    <>
      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        {/* Name section */}
        <NameInputSection
          nameGiven={nameGiven}
          nameFather={nameFather}
          nameGrandfather={nameGrandfather}
          onNameGivenChange={setNameGiven}
          onNameFatherChange={setNameFather}
          onNameGrandfatherChange={setNameGrandfather}
          errors={{
            nameGiven: fieldErrors.nameGiven,
            nameFather: fieldErrors.nameFather,
            nameGrandfather: fieldErrors.nameGrandfather,
          }}
        />

        {/* Demographics section */}
        <Card as="fieldset">
          <legend className="text-base font-bold text-foreground mb-4">
            {t('demographicsSection')}
          </legend>

          <div className="space-y-4">
            {/* National ID */}
            <div>
              <label
                htmlFor="national-id"
                className="mb-1 block text-sm font-semibold text-foreground"
              >
                {t('nationalIdLabel')}
                <span className="ms-1 text-xs font-normal text-muted-foreground">
                  ({t('optional')})
                </span>
              </label>
              <input
                id="national-id"
                type="text"
                inputMode="text"
                maxLength={200}
                className="w-full min-h-[44px] rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder={t('nationalIdPlaceholder')}
                value={nationalId}
                onChange={(e) => setNationalId(e.target.value)}
              />
            </div>

            {/* Gender */}
            <div>
              <label
                htmlFor="gender"
                className="mb-1 block text-sm font-semibold text-foreground"
              >
                {t('gender')}
                <span className="text-destructive ms-0.5" aria-hidden="true">*</span>
              </label>
              <select
                id="gender"
                value={gender}
                onChange={(e) => setGender(e.target.value as AdministrativeGender)}
                aria-invalid={!!fieldErrors.gender}
                className={`w-full min-h-[44px] rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
                  fieldErrors.gender
                    ? 'border-destructive focus:border-destructive focus:ring-destructive'
                    : 'border-border focus:border-primary focus:ring-ring'
                }`}
              >
                <option value="">{t('genderPlaceholder')}</option>
                <option value={AdministrativeGender.MALE}>{t('genderMale')}</option>
                <option value={AdministrativeGender.FEMALE}>{t('genderFemale')}</option>
                <option value={AdministrativeGender.OTHER}>{t('genderOther')}</option>
                <option value={AdministrativeGender.UNKNOWN}>{t('genderUnknown')}</option>
              </select>
              {fieldErrors.gender && (
                <p className="mt-1 text-sm text-destructive" role="alert">
                  {fieldErrors.gender}
                </p>
              )}
            </div>

            {/* Marital status — NEW */}
            <div>
              <label
                htmlFor="marital-status"
                className="mb-1 block text-sm font-semibold text-foreground"
              >
                {t('maritalStatus')}
                <span className="ms-1 text-xs font-normal text-muted-foreground">
                  ({t('optional')})
                </span>
              </label>
              <select
                id="marital-status"
                value={maritalStatus}
                onChange={(e) => setMaritalStatus(e.target.value as MaritalStatus | '')}
                className="w-full min-h-[44px] rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">{t('maritalStatusPlaceholder')}</option>
                <option value="M">{t('maritalMarried')}</option>
                <option value="S">{t('maritalSingle')}</option>
                <option value="D">{t('maritalDivorced')}</option>
                <option value="W">{t('maritalWidowed')}</option>
                <option value="U">{t('maritalUnknown')}</option>
              </select>
            </div>

            {/* Birth year or full date toggle */}
            <div>
              <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
                <input
                  type="checkbox"
                  checked={birthYearOnly}
                  onChange={(e) => {
                    setBirthYearOnly(e.target.checked)
                    if (e.target.checked) setBirthDate('')
                    else setBirthYear('')
                  }}
                  className="h-5 w-5 border-border text-primary focus:ring-ring"
                />
                <span className="text-sm font-medium text-foreground">
                  {t('birthYearOnly')}
                </span>
              </label>

              {birthYearOnly ? (
                <div>
                  <label
                    htmlFor="birth-year"
                    className="mb-1 block text-sm font-semibold text-foreground"
                  >
                    {t('birthYear')}
                    <span className="text-destructive ms-0.5" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="birth-year"
                    type="number"
                    inputMode="numeric"
                    min={1900}
                    max={CURRENT_YEAR}
                    aria-invalid={!!fieldErrors.birthYear}
                    className={`w-full min-h-[44px] rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
                      fieldErrors.birthYear
                        ? 'border-destructive focus:border-destructive focus:ring-destructive'
                        : 'border-border focus:border-primary focus:ring-ring'
                    }`}
                    placeholder={t('birthYearPlaceholder')}
                    value={birthYear}
                    onChange={(e) => setBirthYear(e.target.value)}
                  />
                  {fieldErrors.birthYear && (
                    <p className="mt-1 text-sm text-destructive" role="alert">
                      {fieldErrors.birthYear}
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <label
                    htmlFor="birth-date"
                    className="mb-1 block text-sm font-semibold text-foreground"
                  >
                    {t('birthDate')}
                    <span className="text-destructive ms-0.5" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="birth-date"
                    type="date"
                    aria-invalid={!!fieldErrors.birthDate}
                    className={`w-full min-h-[44px] rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
                      fieldErrors.birthDate
                        ? 'border-destructive focus:border-destructive focus:ring-destructive'
                        : 'border-border focus:border-primary focus:ring-ring'
                    }`}
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                  />
                  {fieldErrors.birthDate && (
                    <p className="mt-1 text-sm text-destructive" role="alert">
                      {fieldErrors.birthDate}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Phone + phone use type — NEW: added phoneUse select */}
            <div>
              <label
                htmlFor="phone"
                className="mb-1 block text-sm font-semibold text-foreground"
              >
                {t('phone')}
                <span className="ms-1 text-xs font-normal text-muted-foreground">
                  ({t('optional')})
                </span>
              </label>
              <div className="flex gap-2">
                <select
                  id="phone-use"
                  value={phoneUse}
                  onChange={(e) => setPhoneUse(e.target.value as 'home' | 'work' | 'mobile' | '')}
                  aria-label={t('phoneUse')}
                  className="min-h-[44px] rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">{t('phoneUsePlaceholder')}</option>
                  <option value="mobile">{t('phoneUseMobile')}</option>
                  <option value="home">{t('phoneUseHome')}</option>
                  <option value="work">{t('phoneUseWork')}</option>
                </select>
                <input
                  id="phone"
                  type="tel"
                  dir="ltr"
                  inputMode="tel"
                  className="flex-1 min-h-[44px] rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder={t('phonePlaceholder')}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>

            {/* Preferred Language — NEW: added Pashto */}
            <div>
              <label
                htmlFor="preferred-language"
                className="mb-1 block text-sm font-semibold text-foreground"
              >
                {t('preferredLanguage')}
                <span className="ms-1 text-xs font-normal text-muted-foreground">
                  ({t('optional')})
                </span>
              </label>
              <select
                id="preferred-language"
                value={preferredLanguage}
                onChange={(e) => setPreferredLanguage(e.target.value as PatientLanguage)}
                className="w-full min-h-[44px] rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="en">{t('languageEnglish')}</option>
                <option value="ar">{t('languageArabic')}</option>
                <option value="prs">{t('languageDari')}</option>
                <option value="ps">{t('languagePashto')}</option>
              </select>
            </div>
          </div>
        </Card>

        {/* Geography section */}
        <GeographySection
          origin={addressOrigin}
          current={addressCurrent}
          sameAsOrigin={sameAsOrigin}
          onOriginChange={setAddressOrigin}
          onCurrentChange={setAddressCurrent}
          onSameAsOriginChange={setSameAsOrigin}
          isNomadic={isNomadic}
          onIsNomadicChange={setIsNomadic}
          errors={{
            originProvince: fieldErrors.addressOriginProvince,
            originDistrict: fieldErrors.addressOriginDistrict,
            currentProvince: fieldErrors.addressCurrentProvince,
            currentDistrict: fieldErrors.addressCurrentDistrict,
          }}
        />

        {/* Clinical section */}
        <Card as="fieldset">
          <legend className="text-base font-bold text-foreground mb-4">
            {t('clinicalSection')}
          </legend>

          <div>
            <label
              htmlFor="blood-group"
              className="mb-1 block text-sm font-semibold text-foreground"
            >
              {t('bloodGroup')}
              <span className="ms-1 text-xs font-normal text-muted-foreground">
                ({t('optional')})
              </span>
            </label>
            <select
              id="blood-group"
              value={bloodGroup}
              onChange={(e) => setBloodGroup(e.target.value)}
              className="w-full min-h-[44px] rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {BLOOD_GROUPS.map((bg) => (
                <option key={bg} value={bg}>
                  {bg}
                </option>
              ))}
            </select>
          </div>
        </Card>

        {/* Social / HMIS section — NEW */}
        <SocialInfoSection
          displacementCategory={displacementCategory}
          nationality={nationality}
          occupation={occupation}
          educationLevel={educationLevel}
          disability={disability}
          onDisplacementCategoryChange={setDisplacementCategory}
          onNationalityChange={setNationality}
          onOccupationChange={setOccupation}
          onEducationLevelChange={setEducationLevel}
          onDisabilityChange={setDisability}
        />

        {/* Emergency contact section — NEW */}
        <EmergencyContactSection
          contacts={emergencyContacts}
          onContactsChange={setEmergencyContacts}
        />

        {/* Consent section */}
        <ConsentSection
          method={consentMethod}
          witnessedBy={consentWitnessedBy}
          language={consentLanguage}
          onMethodChange={setConsentMethod}
          onWitnessedByChange={setConsentWitnessedBy}
          onLanguageChange={setConsentLanguage}
          errors={{
            method: fieldErrors.consentMethod,
            witnessedBy: fieldErrors.consentWitnessedBy,
            language: fieldErrors.consentLanguage,
          }}
        />

        {/* Submit error */}
        {submitError && (
          <div
            className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            role="alert"
          >
            {submitError}
          </div>
        )}

        {/* Submit button */}
        <Button variant="primary" type="submit" disabled={submitting} fullWidth>
          {submitting ? t('submitting') : t('submitRegistration')}
        </Button>
      </form>

      <MpiResultModal
        open={mpiModalOpen}
        decision={mpiDecision}
        candidates={mpiCandidates}
        proceedToken={mpiProceedToken}
        onProceed={handleMpiProceed}
        onCancel={handleMpiCancel}
        onGoToPatient={handleGoToPatient}
      />
    </>
  )
}
```

- [ ] **Step 3: Run the opd-lite typecheck**

```bash
pnpm --filter opd-lite typecheck
```

Expected: exits 0 (translation key errors from next-intl may still show until Task 8).

- [ ] **Step 4: Commit**

```bash
git add apps/opd-lite/src/components/registration/ConsentSection.tsx apps/opd-lite/src/components/registration/PatientRegistrationForm.tsx
git commit -m "feat(opd-lite): wire SocialInfoSection + EmergencyContactSection into registration form; add Pashto + marital status + phone use"
```

---

## Task 8 — i18n: Add translation keys to all four locale files

**Files:**
- Modify: `apps/opd-lite/messages/en.json`
- Modify: `apps/opd-lite/messages/ar.json`
- Modify: `apps/opd-lite/messages/prs.json`
- Modify: `apps/opd-lite/messages/ps.json`

In each file, locate the `"registration"` object and add the following keys before the closing `}`. The keys are identical across all four files; only the translated values differ.

- [ ] **Step 1: Add keys to `en.json`**

```json
    "languagePashto": "Pashto",
    "maritalStatus": "Marital Status",
    "maritalStatusPlaceholder": "Select marital status...",
    "maritalMarried": "Married",
    "maritalSingle": "Single (Never Married)",
    "maritalDivorced": "Divorced",
    "maritalWidowed": "Widowed",
    "maritalUnknown": "Unknown",
    "phoneUse": "Phone type",
    "phoneUsePlaceholder": "Type",
    "phoneUseMobile": "Mobile",
    "phoneUseHome": "Home",
    "phoneUseWork": "Work",
    "socialInfoSection": "Social & Population Information",
    "displacementCategory": "Population Category",
    "displacementNone": "Not applicable / Host community",
    "displacementIDP": "Internally Displaced Person (IDP)",
    "displacementReturnee": "Returnee",
    "displacementRefugee": "Refugee",
    "displacementHostCommunity": "Host Community",
    "nationality": "Nationality",
    "nationalitySelectPlaceholder": "Select nationality...",
    "nationalityAF": "Afghan",
    "nationalityPK": "Pakistani",
    "nationalityIR": "Iranian",
    "nationalityTJ": "Tajik",
    "nationalityUZ": "Uzbek",
    "nationalityTM": "Turkmen",
    "nationalityIN": "Indian",
    "nationalitySA": "Saudi",
    "nationalityAE": "Emirati",
    "occupation": "Occupation",
    "occupationPlaceholder": "e.g. Farmer, Teacher, Merchant",
    "educationLevel": "Education Level",
    "educationSelectPlaceholder": "Select education level...",
    "educationNone": "No formal education",
    "educationPrimary": "Primary school",
    "educationSecondary": "Secondary school",
    "educationTertiary": "University / Higher education",
    "educationUnknown": "Unknown",
    "disability": "Patient has a disability",
    "emergencyContactSection": "Emergency Contact",
    "emergencyContactN": "Contact {n}",
    "contactRelationship": "Relationship",
    "contactName": "Full Name",
    "contactNamePlaceholder": "Contact's full name",
    "contactPhone": "Phone Number",
    "contactSpouse": "Spouse",
    "contactParent": "Parent",
    "contactSibling": "Sibling",
    "contactChild": "Child",
    "contactGuardian": "Guardian",
    "contactFriend": "Friend",
    "contactOther": "Other",
    "addEmergencyContact": "Add Emergency Contact",
    "removeContact": "Remove contact"
```

- [ ] **Step 2: Add keys to `ar.json`**

```json
    "languagePashto": "البشتو",
    "maritalStatus": "الحالة الاجتماعية",
    "maritalStatusPlaceholder": "اختر الحالة الاجتماعية...",
    "maritalMarried": "متزوج/متزوجة",
    "maritalSingle": "أعزب/عزباء (لم يتزوج قط)",
    "maritalDivorced": "مطلق/مطلقة",
    "maritalWidowed": "أرمل/أرملة",
    "maritalUnknown": "غير معروف",
    "phoneUse": "نوع الهاتف",
    "phoneUsePlaceholder": "النوع",
    "phoneUseMobile": "جوال",
    "phoneUseHome": "منزل",
    "phoneUseWork": "عمل",
    "socialInfoSection": "المعلومات الاجتماعية والسكانية",
    "displacementCategory": "الفئة السكانية",
    "displacementNone": "غير منطبق / مجتمع مضيف",
    "displacementIDP": "نازح داخلياً",
    "displacementReturnee": "عائد",
    "displacementRefugee": "لاجئ",
    "displacementHostCommunity": "المجتمع المضيف",
    "nationality": "الجنسية",
    "nationalitySelectPlaceholder": "اختر الجنسية...",
    "nationalityAF": "أفغاني",
    "nationalityPK": "باكستاني",
    "nationalityIR": "إيراني",
    "nationalityTJ": "طاجيكي",
    "nationalityUZ": "أوزبكي",
    "nationalityTM": "تركماني",
    "nationalityIN": "هندي",
    "nationalitySA": "سعودي",
    "nationalityAE": "إماراتي",
    "occupation": "المهنة",
    "occupationPlaceholder": "مثال: مزارع، معلم، تاجر",
    "educationLevel": "مستوى التعليم",
    "educationSelectPlaceholder": "اختر مستوى التعليم...",
    "educationNone": "لا تعليم رسمي",
    "educationPrimary": "المرحلة الابتدائية",
    "educationSecondary": "المرحلة الثانوية",
    "educationTertiary": "الجامعة / التعليم العالي",
    "educationUnknown": "غير معروف",
    "disability": "المريض لديه إعاقة",
    "emergencyContactSection": "جهة الاتصال في حالات الطوارئ",
    "emergencyContactN": "جهة الاتصال {n}",
    "contactRelationship": "العلاقة",
    "contactName": "الاسم الكامل",
    "contactNamePlaceholder": "الاسم الكامل لجهة الاتصال",
    "contactPhone": "رقم الهاتف",
    "contactSpouse": "الزوج/الزوجة",
    "contactParent": "الأب/الأم",
    "contactSibling": "الأخ/الأخت",
    "contactChild": "الابن/الابنة",
    "contactGuardian": "الوصي/الكفيل",
    "contactFriend": "صديق/صديقة",
    "contactOther": "أخرى",
    "addEmergencyContact": "إضافة جهة اتصال طارئة",
    "removeContact": "إزالة جهة الاتصال"
```

- [ ] **Step 3: Add keys to `prs.json`**

```json
    "languagePashto": "پښتو",
    "maritalStatus": "وضعیت تأهل",
    "maritalStatusPlaceholder": "وضعیت تأهل را انتخاب کنید...",
    "maritalMarried": "متأهل",
    "maritalSingle": "مجرد (هرگز ازدواج نکرده)",
    "maritalDivorced": "طلاق گرفته",
    "maritalWidowed": "بیوه",
    "maritalUnknown": "نامعلوم",
    "phoneUse": "نوع تلیفون",
    "phoneUsePlaceholder": "نوع",
    "phoneUseMobile": "موبایل",
    "phoneUseHome": "منزل",
    "phoneUseWork": "کار",
    "socialInfoSection": "معلومات اجتماعی و جمعیتی",
    "displacementCategory": "طبقه‌بندی جمعیتی",
    "displacementNone": "قابل اجرا نیست / جامعه میزبان",
    "displacementIDP": "بیجا شده داخلی (IDP)",
    "displacementReturnee": "برگشت‌کننده",
    "displacementRefugee": "پناهنده",
    "displacementHostCommunity": "جامعه میزبان",
    "nationality": "تابعیت",
    "nationalitySelectPlaceholder": "تابعیت را انتخاب کنید...",
    "nationalityAF": "افغانی",
    "nationalityPK": "پاکستانی",
    "nationalityIR": "ایرانی",
    "nationalityTJ": "تاجیکستانی",
    "nationalityUZ": "ازبکستانی",
    "nationalityTM": "ترکمنستانی",
    "nationalityIN": "هندی",
    "nationalitySA": "سعودی",
    "nationalityAE": "اماراتی",
    "occupation": "شغل",
    "occupationPlaceholder": "مثلاً دهقان، معلم، تاجر",
    "educationLevel": "سطح تحصیل",
    "educationSelectPlaceholder": "سطح تحصیل را انتخاب کنید...",
    "educationNone": "بدون تحصیل رسمی",
    "educationPrimary": "دوره ابتدایی",
    "educationSecondary": "دوره متوسطه",
    "educationTertiary": "دانشگاه / تحصیلات عالی",
    "educationUnknown": "نامعلوم",
    "disability": "مریض دارای معلولیت است",
    "emergencyContactSection": "مخابره اضطراری",
    "emergencyContactN": "مخابره {n}",
    "contactRelationship": "رابطه",
    "contactName": "نام کامل",
    "contactNamePlaceholder": "نام کامل مخابره",
    "contactPhone": "شماره تلیفون",
    "contactSpouse": "همسر",
    "contactParent": "پدر/مادر",
    "contactSibling": "برادر/خواهر",
    "contactChild": "پسر/دختر",
    "contactGuardian": "سرپرست",
    "contactFriend": "دوست",
    "contactOther": "دیگر",
    "addEmergencyContact": "افزودن مخابره اضطراری",
    "removeContact": "حذف مخابره"
```

- [ ] **Step 4: Add keys to `ps.json`**

```json
    "languagePashto": "پښتو",
    "maritalStatus": "د واده حالت",
    "maritalStatusPlaceholder": "د واده حالت وټاکئ...",
    "maritalMarried": "واده شوی/شوې",
    "maritalSingle": "مجرد (هیڅکله واده نه دی شوی/شوې)",
    "maritalDivorced": "طلاق شوی/شوې",
    "maritalWidowed": "کونډ/کونډه",
    "maritalUnknown": "نامعلوم",
    "phoneUse": "د تلیفون ډول",
    "phoneUsePlaceholder": "ډول",
    "phoneUseMobile": "موبایل",
    "phoneUseHome": "کور",
    "phoneUseWork": "کار",
    "socialInfoSection": "ټولنیز او نفوسي معلومات",
    "displacementCategory": "د نفوسو طبقه‌بندي",
    "displacementNone": "د پلي کیدو وړ نه دی / کوربه ټولنه",
    "displacementIDP": "داخلي ځای پرځای شوی (IDP)",
    "displacementReturnee": "ستنیدلی",
    "displacementRefugee": "مهاجر",
    "displacementHostCommunity": "کوربه ټولنه",
    "nationality": "ملیت",
    "nationalitySelectPlaceholder": "ملیت وټاکئ...",
    "nationalityAF": "افغان",
    "nationalityPK": "پاکستاني",
    "nationalityIR": "ایراني",
    "nationalityTJ": "تاجیکستاني",
    "nationalityUZ": "ازبکستاني",
    "nationalityTM": "ترکمنستاني",
    "nationalityIN": "هندي",
    "nationalitySA": "سعودي",
    "nationalityAE": "اماراتي",
    "occupation": "دنده",
    "occupationPlaceholder": "لکه، کرنه‌کار، ښوونکی، سوداګر",
    "educationLevel": "د زده‌کړې کچه",
    "educationSelectPlaceholder": "د زده‌کړې کچه وټاکئ...",
    "educationNone": "رسمي زده‌کړه نشته",
    "educationPrimary": "لومړنۍ ښوونځی",
    "educationSecondary": "منځنۍ ښوونځی",
    "educationTertiary": "پوهنتون / لوړه زده‌کړه",
    "educationUnknown": "نامعلوم",
    "disability": "ناروغ معلول دی",
    "emergencyContactSection": "بیړني اتصال",
    "emergencyContactN": "اتصال {n}",
    "contactRelationship": "اړیکه",
    "contactName": "بشپړ نوم",
    "contactNamePlaceholder": "د اتصال بشپړ نوم",
    "contactPhone": "تلیفون شمیره",
    "contactSpouse": "میرمن/میړه",
    "contactParent": "پلار/مور",
    "contactSibling": "وروڼه/خویندې",
    "contactChild": "زوی/لور",
    "contactGuardian": "سرپرست",
    "contactFriend": "ملګری",
    "contactOther": "نور",
    "addEmergencyContact": "بیړني اتصال زیات کړئ",
    "removeContact": "اتصال لرې کړئ"
```

- [ ] **Step 5: Run the full typecheck to confirm all i18n keys resolve**

```bash
pnpm --filter opd-lite typecheck
```

Expected: exits 0 with no errors.

- [ ] **Step 6: Start dev server and manually verify the form renders all new sections**

```bash
pnpm --filter opd-lite dev
```

Navigate to `http://localhost:3001/register-patient` and confirm:
- Demographics card shows Marital Status dropdown and phone use type selector
- Preferred Language dropdown shows English, Arabic, Dari, Pashto
- Social & Population Information card renders with all 5 fields
- Emergency Contact card renders with "Add Emergency Contact" button; adding a contact shows the name/relationship/phone fields; a second contact can be added but not a third
- Consent language dropdown includes Pashto

- [ ] **Step 7: Commit**

```bash
git add apps/opd-lite/messages/en.json apps/opd-lite/messages/ar.json apps/opd-lite/messages/prs.json apps/opd-lite/messages/ps.json
git commit -m "feat(i18n): add registration i18n keys for HMIS demographics in all 4 locales (en/ar/prs/ps)"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** All fields from the gap analysis are covered: marital status (Task 1+7), emergency contacts (Task 6+7), displacement category + nationality + occupation + education + disability (Task 5+7), phone use type (Task 7), Pashto language (Tasks 1+2+4+7+8).
- [x] **Deferred fields documented:** photoUrl, biometricFingerprintHash, nameLatin, namePhonetic, mpiScore, updatedByName/Role, meta.versionId all noted in the types file comments and in the "Deferred Fields" table at the top of this plan.
- [x] **No polygamous:** `MaritalStatus` type is `'M' | 'S' | 'D' | 'W' | 'U'` — no `'P'`.
- [x] **Placeholder scan:** No TBDs or vague steps found.
- [x] **Type consistency:** `PatientLanguage`, `MaritalStatus`, `DisplacementCategory`, `EducationLevel`, `PatientContact`, `ContactRelationship` — all defined in Task 1, referenced identically in Tasks 2, 5, 6, 7.
- [x] **syncCreate in hub-api:** Task 4 Step 5 explicitly covers the `syncCreate` endpoint to keep it in sync with `create`.
- [x] **Both list and search mappers:** Task 4 Steps 2 and 3 explicitly cover both.
- [x] **DB constraints:** Check constraints added for all controlled-vocabulary columns.
