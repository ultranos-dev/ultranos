# Patient Identity & MPI — Phase 1 Design

**Date:** 2026-05-21  
**Status:** Approved for implementation planning  
**Scope:** Phase 1 of 3 — Identity Foundation  
**Author:** Ultranos Dev / Claude (brainstorming session)

---

## Context & Problem Statement

The Ultranos platform serves low-resource clinical environments in Afghanistan and Central Asia. Patient deduplication across the hub-and-spoke architecture has three compounding failure modes:

1. **Missing hard identifiers.** Most patients in rural Afghanistan lack a national ID (e-Tazkira), have a shared family phone number, and do not know their exact date of birth. The current system uses phone as a primary auth key (unique constraint in application code) and national ID as the only duplicate-detection signal — both assumptions are wrong for this population.

2. **Incomplete identity model.** The Afghan naming convention is a patronymic chain (given name + father's name + grandfather's name), not a surname. The current schema stores `name_local` as a single unstructured blob, making phonetic matching and meaningful disambiguation impossible.

3. **No consent at registration.** The `enforceConsent` middleware gates all PHI access. No code currently creates a consent record at patient creation — leaving newly registered patients permanently inaccessible to clinicians until a consent record is manually created by an unknown party.

Phase 1 delivers the data model, matching engine, and API changes to address all three. Phase 2 (OPD Lite registration UI) and Phase 3 (spoke app completeness) consume the outputs of this phase.

---

## Decisions Made During Design

| Decision | Choice | Rationale |
|---|---|---|
| MPI engine architecture | Shared TypeScript package (`packages/mpi-engine`) | Must run offline in Phase 2 service worker; business logic must be testable without DB |
| Script normalisation | Script-agnostic intermediate form (ALA-LC + Double Metaphone) | Arabic and Latin inputs for the same name must produce identical tokens |
| Geographic collection | Province dropdown + district dropdown + village free text; two separate structures (origin vs. current) | Origin is stable identity signal; current address is logistics only |
| Biometric enrollment | Optional at registration, re-offered at every visit | Avoids registration blockers; hardware may be absent |
| Consent timing | Atomic with patient creation (single Postgres RPC) | Decoupled consent creates permanently inaccessible patients on crash/timeout |
| Phone as identity | Removed as unique key; downgraded to 25-pt MPI signal | Shared family SIMs are the norm, not the exception |
| Self-registration BLOCK | Non-PHI message only; no candidate data exposed | Unverified user on a shared phone must not see another patient's data |

---

## Architecture Overview

```
Patient creation request (any app)
        │
        ▼
Hub API: patient.create / patientRegistration.register
        │
        ├─ 1. Normalize name components       ─┐
        ├─ 2. Compute phonetic tokens           │  packages/mpi-engine
        ├─ 3. Score DB candidates               │  (pure TypeScript, no DB deps)
        └─ 4. Decide: BLOCK / WARN / ALLOW     ─┘
                │
                ├─ BLOCK → return 409 + candidates (no record created)
                ├─ WARN  → return proceedToken + candidates (clinician must review)
                └─ ALLOW → proceed to insert
                                │
                                ▼
                    Postgres RPC: create_patient_with_consent()
                    ┌─────────────────────────────────┐
                    │  INSERT INTO patients (...)      │
                    │  INSERT INTO consents (...)      │  ← atomic transaction
                    └─────────────────────────────────┘
                                │
                                ▼
                    Audit event: PHI_WRITE
                    { mpiDecision, mpiScore, mpiCandidateIds, consentMethod }
```

---

## Section 1 — Data Model & Schema

### 1.1 New Patient Table Columns

All new columns added as nullable. No existing records break.

```sql
-- Structured patronymic name
name_given            TEXT,
name_father           TEXT,
name_grandfather      TEXT,
name_given_enc        TEXT,       -- AES-256-GCM encrypted
name_father_enc       TEXT,
name_grandfather_enc  TEXT,

-- Phonetic token arrays (Double Metaphone, GIN-indexed, plaintext)
name_phonetic_given        TEXT[],
name_phonetic_father       TEXT[],
name_phonetic_grandfather  TEXT[],

-- Birth year (standalone; backfilled from birth_date for existing records)
birth_year   SMALLINT,

-- Geographic identity (origin = stable MPI signal; current = logistics only)
address_province_origin   TEXT,
address_district_origin   TEXT,
address_village_origin    TEXT,
address_province_current  TEXT,
address_district_current  TEXT,
address_village_current   TEXT,
is_nomadic                BOOLEAN NOT NULL DEFAULT FALSE,

-- Biometric
biometric_fingerprint_hash     TEXT,
biometric_algorithm_version    TEXT,

-- Paper Tazkira blind index (HMAC of jild+safa+shumara)
tazkira_paper_hash   TEXT,

-- FHIR R4 identifier array (JSONB)
identifiers   JSONB,

-- MPI state (mpi_warn already existed; mpi_score is new)
mpi_score   INTEGER,
```

`name_local`, `name_latin`, `name_phonetic`, `national_id_hash`, `telecom_phone`, `birth_date`, `birth_year_only`, `mpi_warn` — all preserved unchanged.

### 1.2 New Indexes

```sql
CREATE INDEX idx_patients_phonetic_given
  ON patients USING GIN (name_phonetic_given);

CREATE INDEX idx_patients_phonetic_father
  ON patients USING GIN (name_phonetic_father);

CREATE INDEX idx_patients_phonetic_grandfather
  ON patients USING GIN (name_phonetic_grandfather);

CREATE INDEX idx_patients_birth_year
  ON patients (birth_year);

CREATE INDEX idx_patients_district_origin
  ON patients (address_district_origin);

CREATE INDEX idx_patients_biometric
  ON patients (biometric_fingerprint_hash)
  WHERE biometric_fingerprint_hash IS NOT NULL;

CREATE INDEX idx_patients_tazkira_paper
  ON patients (tazkira_paper_hash)
  WHERE tazkira_paper_hash IS NOT NULL;

CREATE INDEX idx_patients_mpi_warn
  ON patients (mpi_warn)
  WHERE mpi_warn = TRUE;
```

### 1.3 Consent Table Additions

```sql
ALTER TABLE consents
  ADD COLUMN IF NOT EXISTS consent_method   TEXT
    CHECK (consent_method IN ('WRITTEN','VERBAL_WITNESSED','SELF_REGISTERED')),
  ADD COLUMN IF NOT EXISTS witnessed_by     UUID REFERENCES practitioners(id),
  ADD COLUMN IF NOT EXISTS consent_language TEXT
    CHECK (consent_language IN ('en','ar','prs')),
  ADD COLUMN IF NOT EXISTS consent_version  TEXT NOT NULL DEFAULT 'v1.0-en';

ALTER TABLE consents
  ADD CONSTRAINT consent_witness_required CHECK (
    (consent_method = 'VERBAL_WITNESSED' AND witnessed_by IS NOT NULL)
    OR (consent_method != 'VERBAL_WITNESSED')
  );
```

### 1.4 FHIR Patient Type (`packages/shared-types`)

```typescript
export interface FhirPatient {
  // existing fields unchanged ...
  _ultranos: {
    // EXISTING (unchanged)
    nameLocal: string
    nameLatin?: string
    nationalIdHash?: string
    guardianId?: string
    patientTier: PatientTier
    preferredLanguage?: 'en' | 'ar' | 'prs'
    birthYearOnly: boolean
    mpiWarn: boolean

    // NEW — patronymic chain
    nameGiven?: string
    nameFather?: string
    nameGrandfather?: string

    // NEW — birth year
    birthYear?: number

    // NEW — geography
    addressOrigin?: PatientAddress
    addressCurrent?: PatientAddress
    isNomadic: boolean

    // NEW — biometric
    biometricFingerprintHash?: string
    biometricAlgorithmVersion?: string

    // NEW — MPI state
    mpiScore?: number

    // NEW — identifiers
    identifiers?: PatientIdentifier[]
  }
}

export interface PatientAddress {
  province: string
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
  valueHash: string        // HMAC blind index
  displayType: string
  jild?: string            // Paper Tazkira only — AES-GCM encrypted
  safa?: string
  shumara?: string
}
```

### 1.5 Afghan Province Reference

```typescript
// packages/shared-types/src/reference/afghanistan-geo.ts
export const AFGHAN_PROVINCES = [
  'Badakhshan','Badghis','Baghlan','Balkh','Bamyan',
  'Daykundi','Farah','Faryab','Ghazni','Ghor',
  'Helmand','Herat','Jawzjan','Kabul','Kandahar',
  'Kapisa','Khost','Kunar','Kunduz','Laghman',
  'Logar','Nangarhar','Nimroz','Nuristan','Paktia',
  'Paktika','Panjshir','Parwan','Samangan','Sar-e-Pol',
  'Takhar','Urozgan','Wardak','Zabul',
] as const
export type AfghanProvince = typeof AFGHAN_PROVINCES[number]
```

Districts are free-text strings (400+ values, subject to administrative change).

### 1.6 Migration Sequence

| Migration | File | Purpose |
|---|---|---|
| 014 | `patient_mpi_fields.sql` | All new nullable patient columns |
| 015 | `patient_birth_year_backfill.sql` | Backfill `birth_year` from `birth_date` |
| 016 | `patient_encrypted_name_fields.sql` | `name_given_enc`, `name_father_enc`, `name_grandfather_enc` |
| 017 | `patient_indexes_phonetic.sql` | All new indexes (GIN + scalar) |
| 018 | `consent_registration_fields.sql` | Consent method/witness/language/version columns |
| 019 | `fn_create_patient_with_consent.sql` | Atomic RPC function |

---

## Section 2 — `packages/mpi-engine`

### 2.1 Package Structure

```
packages/mpi-engine/
├── src/
│   ├── normalization/
│   │   ├── unicode.ts          -- NFD normalisation, script detection
│   │   ├── romanization.ts     -- ALA-LC table (~180 entries, hand-authored)
│   │   ├── variants.ts         -- Mohammad→muhammad, Ahmed→ahmad, etc.
│   │   └── index.ts
│   ├── phonetic/
│   │   ├── double-metaphone.ts -- vendored DM (typed wrapper around npm package)
│   │   └── index.ts
│   ├── scoring/
│   │   ├── weights.ts          -- all scoring constants
│   │   ├── jaro-winkler.ts     -- vendored ~45-line implementation
│   │   ├── score-candidate.ts
│   │   └── index.ts
│   ├── decision/
│   │   ├── thresholds.ts
│   │   ├── proceed-token.ts    -- RS256 sign/verify
│   │   └── index.ts
│   ├── types.ts
│   └── index.ts                -- public API
└── src/__tests__/
    ├── normalization.test.ts
    ├── scoring.test.ts
    ├── decision.test.ts
    └── fixtures/afghan-names.ts  -- 200+ synthetic name pairs
```

**Dependency:** `double-metaphone@^1.0.4` only. Jaro-Winkler and ALA-LC romanization are vendored.

**Token signing is NOT in this package.** `MpiProceedTokenPayload` (the type) is exported from mpi-engine for shared typing. The actual `signProceedToken()` and `verifyProceedToken()` functions live in `apps/hub-api/src/lib/mpi-proceed-token.ts` — they require the Hub API's RS256 private key at runtime and must never be bundled into client-side code.

### 2.2 Normalisation Pipeline

Every name component passes through this pipeline before scoring or storage:

```
Raw input (any script)
  → Unicode NFD normalisation
  → Script detection (arabic / latin / mixed)
  → ALA-LC romanisation (arabic input only)
  → Variant normalisation (Mohammad→muhammad, Ahmed→ahmad, ...)
  → Trim, lowercase, collapse whitespace
  → Normalised Latin string
```

Both `"محمد"` and `"Mohammed"` and `"Muhammad"` produce `"muhammad"` after this pipeline. Jaro-Winkler runs on the normalised Latin string. Double Metaphone tokens are computed from the same normalised string.

### 2.3 Scoring Weights

```typescript
export const WEIGHTS = {
  GIVEN_NAME_HIGH:        30,  // Jaro-Winkler ≥ 0.92 on normalised form
  GIVEN_NAME_LOW:         15,  // Jaro-Winkler 0.85–0.91
  FATHER_NAME_HIGH:       30,
  FATHER_NAME_LOW:        15,
  GRANDFATHER_NAME_HIGH:  20,
  GRANDFATHER_NAME_LOW:   10,
  BIRTH_YEAR_EXACT:       20,
  BIRTH_YEAR_NEAR:         8,  // ±2 years
  GENDER_EXACT:           10,
  DISTRICT_ORIGIN_EXACT:  20,
  PROVINCE_ORIGIN_EXACT:   5,  // only if district does NOT match
  PHONE_EXACT:            25,
} as const

export const THRESHOLDS = {
  BLOCK: 90,
  WARN:  60,
} as const
```

Maximum soft score: 155 pts.

### 2.4 Hard Identifiers

Any exact match on a hard identifier triggers BLOCK immediately, bypassing soft scoring:

| Identifier | Match field |
|---|---|
| e-Tazkira | `nationalIdHash` exact |
| Paper Tazkira | `tazkiraPaperHash` exact (HMAC of jild+`|`+safa+`|`+shumara) |
| Biometric fingerprint | `biometricFingerprintHash` exact |
| Health Passport QR | `id` exact (UUID from scanned QR payload) |

### 2.5 Threshold Calibration

| Scenario | Score | Decision |
|---|---|---|
| Full name triplet exact + same birth year | 100 | BLOCK ✓ |
| Full name triplet exact + different birth year (father/son) | 80 | WARN ✓ |
| Given + father match + same district | 80 | WARN ✓ |
| Given name only + phone match | 55 | ALLOW ✓ |
| Phone match only | 25 | ALLOW ✓ — shared SIM must not block |
| Completely different names | <30 | ALLOW ✓ |

### 2.6 MPI Candidate Retrieval Query

```sql
SELECT
  id, name_given, name_father, name_grandfather,
  name_phonetic_given, name_phonetic_father, name_phonetic_grandfather,
  birth_year, gender,
  address_district_origin, address_province_origin,
  telecom_phone, national_id_hash, tazkira_paper_hash, biometric_fingerprint_hash
FROM patients
WHERE is_active = TRUE AND (
  name_phonetic_given        && $1::text[]
  OR name_phonetic_father    && $2::text[]
  OR national_id_hash        =  $3
  OR tazkira_paper_hash      =  $4
  OR biometric_fingerprint_hash = $5
  OR (birth_year = $6 AND address_district_origin = $7)
  OR telecom_phone           =  $8
)
LIMIT 50
```

Node-side Jaro-Winkler scoring runs on the ≤50 candidates returned.

### 2.7 Decision Flow and proceedToken

```
computeMpiResult(candidates, input)
  ├─ Hard identifier match?       → BLOCK
  ├─ Top soft score ≥ 90?         → BLOCK
  ├─ Top soft score 60–89?        → WARN + proceedToken
  └─ Top soft score < 60?         → ALLOW
```

`proceedToken`: RS256 JWT signed with Hub API's existing private key.
- Payload: `{ jti: uuid, candidateIds: string[], maxScore: number, issuedTo: userId, exp: now+600 }`
- Consumed on use: Redis key `mpi:token:{jti}`, TTL 10 minutes
- One-time use: replay attempt returns `BAD_REQUEST`

### 2.8 Public API

```typescript
// packages/mpi-engine/src/index.ts
export { normalizeNameComponent, computePhoneticTokens } from './normalization'
export { scoreCandidate, computeMpiResult, decideMpiAction } from './scoring'
// NOTE: signProceedToken / verifyProceedToken are NOT exported from this package.
// They live in apps/hub-api/src/lib/mpi-proceed-token.ts (require RS256 private key).
export type {
  MpiInput, MpiCandidate, MpiResult, MpiDecision,
  MpiScoreBreakdown, MpiProceedTokenPayload
} from './types'
```

---

## Section 3 — Hub API Changes

### 3.1 `patient.create` — Updated Flow

1. Zod validation (new fields + cross-field rules)
2. Normalise name components → compute phonetic tokens (via mpi-engine)
3. Hash identifiers (e-Tazkira, paper Tazkira, passport)
4. Build `MpiInput`, query DB for candidates, call `computeMpiResult()`
5. Handle decision:
   - `BLOCK` → `TRPCError('CONFLICT', { candidates: top5 })`
   - `WARN` + no token → `TRPCError('PRECONDITION_FAILED', { candidates: top5, proceedToken })`
   - `WARN` + token present → verify (sig, expiry, not consumed); on failure `BAD_REQUEST`
   - `ALLOW` → proceed
6. Build patient row (all new fields + phonetic tokens)
7. Call `supabase.rpc('create_patient_with_consent', { p_patient, p_consent })`
8. On WARN path: mark `proceedToken` consumed in Redis
9. Emit audit: `{ action: 'PHI_WRITE', metadata: { operation: 'create', mpiDecision, mpiScore, mpiCandidateIds, consentMethod } }`
10. Return `{ id, resourceType: 'Patient', meta, mpiWarn }`

**New input fields (additions only; all existing fields preserved):**

```typescript
nameGiven?: string            // replaces firstName (firstName kept as deprecated alias)
nameFather?: string
nameGrandfather?: string
birthYear?: number            // alternative to birthDate when YearOnly
addressOrigin?: PatientAddress
addressCurrent?: PatientAddress
isNomadic?: boolean
biometricFingerprintHash?: string
biometricAlgorithmVersion?: string
identifiers?: PatientIdentifierInput[]
mpiProceedToken?: string
consent: {
  method: 'WRITTEN' | 'VERBAL_WITNESSED'
  witnessedBy?: string        // required when method = VERBAL_WITNESSED
  language: 'en' | 'ar' | 'prs'
  version: string
}
```

### 3.2 `patientRegistration.register` — Updated (Patient Lite)

**Changes:**
- `firstName` → `nameGiven` (firstName kept as deprecated alias via Zod transform)
- `dateOfBirth` made optional when `birthYear` provided
- Phone uniqueness check **removed** (lines 137–149 deleted)
- MPI check added (same algorithm; BLOCK returns non-PHI message, no candidate data)
- `consent` object added to input (method always `SELF_REGISTERED` on this path)
- Consent record created atomically via RPC

**BLOCK behaviour on self-registration path:**
```
→ return { blocked: true, message: 'You may already be registered.
           Please ask your clinician to look up your record.' }
→ No record created. No PHI exposed. Audit: outcome = 'BLOCKED'.
```

**WARN behaviour on self-registration path:**
```
→ Proceed with creation (no proceedToken required from unverified user)
→ mpi_warn = true, mpi_score = topScore
→ Clinician resolves at first encounter
```

### 3.3 `patient.search` — Updated

Multi-word queries are parsed into name components and run through the phonetic pipeline. GIN candidate retrieval replaces ILIKE for the primary pass; ILIKE is retained as a fallback for single-character queries.

New response fields: `mpiScore: number`, `mpiWarn: boolean`, `nameGiven`, `nameFather`, `nameGrandfather`, `birthYear`, `addressDistrictOrigin`.

### 3.4 `patient.checkDuplicates` — New Procedure

- Access: `protectedProcedure` → `enforceResourceAccess('Patient')` (DOCTOR, CLINICIAN, ADMIN)
- Rate limit: 20 requests/user/minute
- Input: any combination of identity fields (at least one name field required)
- Output: `{ decision, candidates: [{ id, nameLocal, ..., mpiScore, scoreBreakdown }], proceedToken? }`
- Audit: `PHI_READ` with `{ operation: 'mpi_check', decision, topScore }`
- Candidate IDs not written to audit at check time; written at `patient.create` commit

The `scoreBreakdown` in the response tells the clinician exactly why a candidate matched ("father's name + district"), enabling an informed confirm-or-dismiss decision.

---

## Section 4 — Consent at Registration

### 4.1 Atomic RPC Function

```sql
CREATE OR REPLACE FUNCTION create_patient_with_consent(
  p_patient JSONB,
  p_consent JSONB
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_patient_id UUID;
  v_consent_id UUID;
BEGIN
  INSERT INTO patients (...) VALUES (...) RETURNING id INTO v_patient_id;
  INSERT INTO consents (
    id, patient_id, status, scope,
    provision_start, provision_end,
    consent_method, witnessed_by, consent_language, consent_version,
    created_at
  ) VALUES (
    gen_random_uuid(), v_patient_id, 'active', 'patient-privacy',
    NOW(), NOW() + INTERVAL '3 years',
    p_consent->>'consent_method',
    (p_consent->>'witnessed_by')::UUID,
    p_consent->>'consent_language',
    p_consent->>'consent_version',
    NOW()
  ) RETURNING id INTO v_consent_id;
  RETURN jsonb_build_object('patientId', v_patient_id, 'consentId', v_consent_id);
EXCEPTION WHEN OTHERS THEN RAISE;
END; $$;
```

Either both rows exist, or neither does.

### 4.2 Three Consent Methods

| Method | When used | `witnessed_by` |
|---|---|---|
| `SELF_REGISTERED` | Patient Lite self-registration | NULL |
| `WRITTEN` | OPD Lite — patient reads and confirms | NULL |
| `VERBAL_WITNESSED` | OPD Lite — clinician reads aloud to patient | Clinician's practitioner ID (required) |

### 4.3 Consent Text

Short, plain-language, three sentences maximum. Stored as static constants in each app bundle. Versioned as `v{major}.{minor}-{lang}` (e.g., `v1.0-en`).

**v1.0-en:**
> "Your health information will be stored securely and used by the care team providing your treatment. You may request access to your records at any time. This consent is valid for three years."

Dari (`v1.0-prs`) and Arabic (`v1.0-ar`) translations required before launch.

### 4.4 Consent Expiry

`provision_end` = 3 years from registration. The `enforceConsent` middleware already enforces this. A `consentExpiryWarning` flag (within 90 days of expiry) is a Phase 3 concern; the column being set here makes it implementable without schema changes.

---

## Section 5 — Cross-Cutting Concerns

### 5.1 Zod Cross-Field Validation

```typescript
// Birth date / birth year mutual exclusivity
if (val.birthYearOnly && val.birthDate) → error
if (!val.birthDate && !val.birthYear)  → error
if (birthYear < 1900 || > currentYear) → error

// Verbal consent requires a witness
if (consent.method === 'VERBAL_WITNESSED' && !consent.witnessedBy) → error
```

### 5.2 Backward Compatibility

- `firstName` accepted as deprecated alias for `nameGiven` via Zod transform — current Patient Lite builds continue working without a forced update
- `dateOfBirth` unchanged — `birthYear` is additive
- All new columns nullable — existing records unaffected
- `consent_version` on patient table (existing) populated from `consent.version` input — no collision

### 5.3 What Does Not Change

- `enforceConsent` middleware
- `packages/sync-engine` conflict tiers (Patient remains Tier 3 LWW; post-sync MPI reconciliation is Phase 2)
- `packages/crypto` field encryption helpers
- Auth flow (RS256 keys reused for proceedToken)
- Audit logger schema
- RLS policies
- Allergy, prescription, encounter endpoints

### 5.4 Testing Requirements

**`packages/mpi-engine` unit tests (no DB):**
- All 180 ALA-LC romanization table entries produce expected output
- Variant table: 30+ name pairs collapse correctly
- `"محمد"` and `"Muhammad"` produce identical phonetic tokens
- `"Mohammed Ahmadi"` vs `"Muhammad Ahmad"` scores above WARN threshold
- Father/son same name chain scores WARN not BLOCK
- Phone match only scores ALLOW
- `decideMpiAction` at boundary values: 59→ALLOW, 60→WARN, 89→WARN, 90→BLOCK
- proceedToken: sign, verify, expired rejection, replay prevention

**Hub API integration tests (requires DB):**
- BLOCK path: returns 409 with candidates, no record created
- WARN path: returns 412 with proceedToken, no record created
- WARN + valid token: creates patient with `mpi_warn=true`, token consumed
- WARN + expired token: returns 400
- WARN + consumed token: returns 400 (replay prevention)
- Patient created → consent row exists (atomicity confirmed)
- Consent insert failure → patient row does not exist (rollback confirmed)
- Newly registered patient immediately accessible via `enforceConsent`
- Self-registration BLOCK: response contains no candidate PHI
- Self-registration WARN: record created with `mpi_warn=true`
- Shared phone (existing patient same phone): does NOT block registration
- `patient.checkDuplicates` rate limit: 21st request returns 429

---

## Out of Scope (Phase 2 and Phase 3)

- OPD Lite inline patient registration UI (Phase 2)
- Patient Lite registration form enrichment — surname field, geography dropdowns, consent screen UI (Phase 2)
- Post-sync MPI reconciliation for offline-created records (Phase 2)
- Lab Lite offline verification fallback (Phase 3)
- Pharmacy Lite manual QR fallback (Phase 3)
- Admin Portal patient management surface and merge tool (Phase 3)
- Consent renewal / expiry warning prompt (Phase 3)
- Biometric re-enrolment on algorithm version change (Phase 3)
- Pashto language support — current `preferredLanguage` enum is `en|ar|prs`; Pashto (`ps`) is a future addition

---

## Open Questions (None — all resolved during design session)

All design decisions were settled during the brainstorming session. No deferred decisions remain for Phase 1.
