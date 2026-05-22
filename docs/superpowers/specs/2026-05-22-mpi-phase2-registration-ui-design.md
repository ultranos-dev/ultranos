# MPI Phase 2 — Registration UI & Offline MPI Reconciliation

**Date:** 2026-05-22  
**Status:** Approved for implementation planning  
**Scope:** Phase 2 of 3 — Registration UI  
**Depends on:** Phase 1 (Identity Foundation) — fully implemented  
**Author:** Ultranos Dev / Claude (brainstorming session)

---

## Problem Statement

Phase 1 delivered the MPI engine, database schema, and Hub API endpoints. But no UI exists to use them:

1. **OPD Lite has no patient registration form.** Clinicians can search for existing patients but cannot create new ones. There is no way to enter patronymic names, geography, or collect consent through the UI.

2. **Patient Lite Mobile registration is minimal.** It collects phone + first name + DOB + language. No father's name, no gender, no geography — all high-value MPI signals missing.

3. **No offline MPI reconciliation.** When a patient is created offline in OPD Lite and synced later, no MPI scoring runs. Duplicates created offline go undetected.

Phase 2 delivers the registration UIs and the async MPI reconciliation to address all three.

---

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| OPD Lite registration entry points | "New Patient" button in search results + sidebar nav link | Contextual discovery (search → no match → register) plus intentional path (sidebar). Both route to the same page. |
| Name input approach | Three separate fields (given/father/grandfather), any script | Clinician enters in natural script; mpi-engine handles romanization. `nameLocal` auto-composed from the three fields. |
| District selection | Cascading dropdowns with autocomplete, validated dataset | Prevents typos that weaken MPI matching. ~400 districts mapped to 34 provinces. No free-text fallback — dataset is authoritative. |
| Consent collection | Inline at bottom of registration form | Consent is required, not optional. Separate step/modal adds friction for a 3-field section. |
| Patient Lite enrichment | Progressive — father's name + gender at registration, rest via profile completion nudge | Long forms kill completion rates on basic mobile devices. Father's name alone is 25 MPI weight points. |
| Post-sync MPI strategy | Two-pass: sync always succeeds, async MPI scoring flags duplicates | Blocking sync is dangerous — offline records may have clinical data attached. Always accept, flag for review. |
| Duplicate review UI | Review queue page + inline patient banner | Queue for supervisors; banner catches clinicians during encounters. Phase 2 = dismiss only; merge is Phase 3. |

---

## 1. Afghan District Reference Dataset

### 1.1 Data Structure

New file: `packages/shared-types/src/reference/afghanistan-districts.ts`

```typescript
export interface AfghanDistrict {
  name: string        // English canonical name
  nameLocal: string   // Dari/Pashto script
  province: AfghanProvince  // parent province from AFGHAN_PROVINCES
}

export const AFGHAN_DISTRICTS: readonly AfghanDistrict[] = [
  { name: 'Kabul', nameLocal: 'کابل', province: 'Kabul' },
  { name: 'Paghman', nameLocal: 'پغمان', province: 'Kabul' },
  // ... ~400 entries total
] as const

export function getDistrictsByProvince(province: AfghanProvince): AfghanDistrict[] {
  return AFGHAN_DISTRICTS.filter(d => d.province === province)
}
```

The dataset is compiled from the Afghanistan Central Statistics Organization (CSO) district list. The `name` field is the ALA-LC romanized canonical form — the same normalization pipeline used by mpi-engine.

### 1.2 Schema Update

The `address_district_origin` and `address_district_current` columns on `patients` remain `TEXT` (not an enum) since district names may evolve. But the UI enforces selection from the validated dataset. The Zod schema `PatientAddressSchema` is updated to validate district against the dataset for a given province:

```typescript
const PatientAddressSchema = z.object({
  province: z.enum(AFGHAN_PROVINCES),
  district: z.string().min(1).max(100),
  village: z.string().max(200).optional(),
}).refine(
  (val) => getDistrictsByProvince(val.province).some(d => d.name === val.district),
  { message: 'District must be valid for the selected province', path: ['district'] }
)
```

### 1.3 Exports

`packages/shared-types/src/index.ts` re-exports `AFGHAN_DISTRICTS`, `AfghanDistrict`, and `getDistrictsByProvince`.

---

## 2. OPD Lite Patient Registration

### 2.1 Entry Points

**Search results "New Patient" button:**
- Appears in `PatientResultList` when results are empty or below a threshold (< 3 results)
- Button text: "Register New Patient" (i18n key: `search.registerNew`)
- Clicking navigates to `/register-patient?nameGiven=<searchQuery>` — pre-populates the given name field

**Sidebar navigation:**
- "Register Patient" link added to the OPD Lite sidebar/nav, below "Patient Search"
- Navigates to `/register-patient` with no pre-fill
- Visible to roles: Doctor, Nurse, Admin (not Receptionist-only roles unless configured)

### 2.2 Registration Page

Route: `/[locale]/register-patient`

**Form sections:**

**A. Name Section**
- Given name (required, max 200, placeholder: "e.g. Ahmad / احمد")
- Father's name (required, max 200)
- Grandfather's name (optional, max 200)
- Each field accepts Arabic or Latin script — `mpi-engine.normalizeNameComponent()` handles both
- Below the fields: auto-composed `nameLocal` preview (read-only, concatenation of three fields in entered script) and `nameLatin` preview (romanized if Arabic input detected)

**B. Demographics Section**
- Gender: dropdown (male/female/other/unknown)
- Date of birth: date picker (YYYY-MM-DD) with "Birth year only" toggle
- If birth year only: year picker replaces date picker, `birthYearOnly = true`
- Phone: optional E.164 input with country code selector (reuse Patient Lite's MENA selector)

**C. Identity Section**
- National ID: optional text input (hashed on submit via `generateBlindIndex`, raw value never sent to Hub)
- Tazkira paper reference: optional, expandable section with jild/safa/shumara sub-fields

**D. Geography Section**
- **Origin address** (required):
  - Province: autocomplete dropdown from `AFGHAN_PROVINCES` (34 options)
  - District: autocomplete dropdown from `getDistrictsByProvince(selectedProvince)` — disabled until province selected
  - Village: optional free text
- **Current address** (optional):
  - Same three fields, with a "Same as origin" checkbox that copies values

**E. Consent Section** (inline, bottom of form)
- Consent method: radio group — Written / Verbal Witnessed
- Witnessed by: practitioner dropdown (populated from cached practitioner list) — shown only when method = Verbal Witnessed
- Consent language: dropdown (en/ar/prs)
- Consent version: auto-set to current version (e.g., `v1.0-en`), read-only display

**Submit button:** "Check for Duplicates & Register"

### 2.3 MPI Pre-Flight Flow

On submit, the form does NOT directly call `patient.create`. Instead:

1. **Call `patient.checkDuplicates`** with the entered fields
2. **ALLOW (score < 60):** Proceed directly to `patient.create` with consent data. Show success message, navigate to patient detail.
3. **WARN (score 60–89):** Show a modal with candidate matches:
   - Side-by-side comparison: entered data vs. each candidate
   - Score breakdown per candidate
   - Two buttons: "This is a different person — Register" (uses `proceedToken` from checkDuplicates response) or "Cancel"
   - If "Register": call `patient.create` with `mpiProceedToken`
4. **BLOCK (score >= 90):** Show a modal with candidate matches:
   - Same comparison view
   - Message: "A very similar patient already exists. Please use the existing record."
   - Only action: "Go to Patient" (navigates to the matched patient) or "Cancel"
   - No "Register anyway" option — BLOCK is final for online registration

### 2.4 Offline Registration

OPD Lite is offline-first. When the clinician fills the registration form while offline:

- Form validation runs locally (Zod schema, district validation against cached dataset)
- Record is saved to Dexie `patients` table with a `syncStatus: 'pending'` flag
- No `checkDuplicates` call — the MPI pre-flight is skipped (no Hub access)
- A local notification warns: "Patient registered offline. Duplicate check will run when connected."
- The record appears in OPD Lite's patient search immediately (local Dexie)
- When connectivity returns, the sync engine pushes via `patient.syncCreate` (see Section 4)

### 2.5 Components

| Component | Path | Purpose |
|---|---|---|
| `RegisterPatientPage` | `apps/opd-lite/src/app/[locale]/register-patient/page.tsx` | Page shell, form orchestration |
| `PatientRegistrationForm` | `apps/opd-lite/src/components/registration/PatientRegistrationForm.tsx` | Full form with all sections |
| `NameInputSection` | `apps/opd-lite/src/components/registration/NameInputSection.tsx` | Three name fields + preview |
| `GeographySection` | `apps/opd-lite/src/components/registration/GeographySection.tsx` | Province/district cascading dropdowns |
| `ConsentSection` | `apps/opd-lite/src/components/registration/ConsentSection.tsx` | Inline consent fields |
| `MpiResultModal` | `apps/opd-lite/src/components/registration/MpiResultModal.tsx` | WARN/BLOCK candidate display |
| `ProvinceAutocomplete` | `apps/opd-lite/src/components/shared/ProvinceAutocomplete.tsx` | Reusable province dropdown |
| `DistrictAutocomplete` | `apps/opd-lite/src/components/shared/DistrictAutocomplete.tsx` | Reusable district dropdown |

### 2.6 i18n

All form labels, placeholders, validation messages, and modal text are i18n'd via `useTranslations('registration')`. Keys added to en.json, ar.json, prs.json for all three locales.

### 2.7 RTL

- Name fields support RTL script entry natively
- Geography dropdowns show `nameLocal` in RTL locales, `name` in LTR
- Form layout uses logical CSS properties (`margin-inline-start`, etc.)

---

## 3. Patient Lite Mobile Registration Enrichment

### 3.1 ProfileSetupScreen Changes

Add two fields to the existing `ProfileSetupScreen`:

- **Father's name** (required): text input, same constraints as first name (1–200 chars, RTL-supported). Positioned after first name.
- **Gender** (required): selector with 4 options (male/female/other/unknown). Positioned after DOB.

The `register` API call is updated to include `nameFather` and `gender` in the payload. The `patientRegistration.register` endpoint input schema adds these two fields.

### 3.2 Profile Completion Nudge

**Dashboard card** (`ProfileCompletionCard`):
- Appears on the patient home dashboard when profile is incomplete
- Shows: "Complete your profile for better care" with a progress ring (e.g., "3 of 6 fields completed")
- Tapping navigates to `ProfileCompletionScreen`
- Dismissible — but reappears on next app open (max 3 dismissals, then stays hidden)

**ProfileCompletionScreen** (new screen):
- Grandfather's name (optional)
- Province/district cascading autocomplete (same component pattern as OPD Lite, React Native version)
- Village free text (optional)
- "Save" button calls `patient.update` via Hub API
- Fields already filled are pre-populated and editable
- Skip button at top-right — returns to dashboard without saving

### 3.3 API Changes

**`patientRegistration.register` input schema update:**

Add to the existing Zod schema:
```typescript
nameFather: z.string().min(1).max(200).transform((s) => s.trim()),
gender: z.enum(['male', 'female', 'other', 'unknown']),
```

Both fields are required. The mutation passes `nameFather` and `gender` to the MPI check and to the `p_patient` RPC payload.

### 3.4 Components

| Component | Path | Purpose |
|---|---|---|
| `ProfileCompletionCard` | `apps/patient-lite-mobile/src/components/dashboard/ProfileCompletionCard.tsx` | Dashboard nudge card |
| `ProfileCompletionScreen` | `apps/patient-lite-mobile/src/screens/profile/ProfileCompletionScreen.tsx` | Optional field collection |
| `ProvinceDistrictPicker` | `apps/patient-lite-mobile/src/components/shared/ProvinceDistrictPicker.tsx` | React Native cascading dropdown |

---

## 4. Post-Sync MPI Reconciliation

### 4.1 Two-Pass Architecture

```
Offline Create → Dexie → [Connectivity Returns] → Pass 1: syncCreate → DB
                                                  → Pass 2: async MPI scoring → flag duplicates
```

### 4.2 Pass 1: `patient.syncCreate` Endpoint

New tRPC mutation: `patient.syncCreate`

- Input: same as `patient.create` (`CreatePatientMpiInputSchema`) plus `offlineCreatedAt: z.string().datetime()` — the HLC timestamp from the offline creation. Consent is still required — the OPD Lite registration form collects it before saving to Dexie, and it travels with the sync payload.
- **Skips MPI scoring entirely** — no `fetchMpiCandidates`, no `computeMpiResult`, no `checkDuplicates`
- Calls the same `create_patient_with_consent` RPC for atomic insert
- Sets `mpi_score = NULL` (signals "not yet scored")
- Returns `{ id, resourceType, meta }`
- Audit event: `PHI_WRITE` with `metadata.operation: 'sync_create'`

**Why a separate endpoint?** `patient.create` throws on BLOCK and PRECONDITION_FAILED. Sync must never fail due to duplicates — offline records may have clinical data attached.

### 4.3 Pass 2: Async MPI Scoring

After `syncCreate` returns success, the handler fires an async MPI job:

```typescript
// Fire-and-forget — do not await
void runAsyncMpiScoring(confirmedPatientId, row, ctx.supabase).catch(err => {
  console.error('[ASYNC_MPI] Scoring failed:', { code: err.code, patientId: confirmedPatientId })
})
```

`runAsyncMpiScoring` function:
1. Calls `fetchMpiCandidates` with the patient's identity fields
2. Calls `computeMpiResult` against the candidates (excluding self by ID)
3. If decision is WARN or BLOCK:
   - Updates `patients SET mpi_warn = true, mpi_score = <topScore> WHERE id = <patientId>`
   - Inserts a `duplicate_reviews` row with candidate IDs and scores
   - Broadcasts a notification via Supabase Realtime to the `dashboard:<practitionerId>` channel

If decision is ALLOW: updates `mpi_score = <topScore>` (for reference), no review created.

### 4.4 `duplicate_reviews` Table

New migration:

```sql
CREATE TABLE duplicate_reviews (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id        UUID NOT NULL REFERENCES patients(id),
  candidate_ids     UUID[] NOT NULL,
  top_score         SMALLINT NOT NULL,
  mpi_decision      TEXT NOT NULL CHECK (mpi_decision IN ('WARN', 'BLOCK')),
  status            TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'DISMISSED', 'FLAGGED_FOR_MERGE', 'MERGED')),
  reviewed_by       UUID REFERENCES practitioners(id),
  reviewed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_duplicate_reviews_status ON duplicate_reviews(status) WHERE status = 'PENDING';
CREATE INDEX idx_duplicate_reviews_patient ON duplicate_reviews(patient_id);
```

RLS: readable by authenticated practitioners (role-based); writable only by Doctor/Admin roles.

---

## 5. Duplicate Review UI (OPD Lite)

### 5.1 Review Queue Page

Route: `/[locale]/duplicate-review`

**Sidebar entry:**
- "Duplicate Reviews" link with a badge showing PENDING count
- Badge fetches count via `duplicateReview.pendingCount` tRPC query
- Visible to: Doctor, Admin roles

**Page layout:**
- Filter tabs: All / WARN / BLOCK
- Table columns: Patient Name (given + father), MPI Score, Decision, Flagged Date, Status
- Click row → expands inline to show candidate comparison cards
- Each candidate card shows: name, father, birth year, gender, district, score, score breakdown
- Actions per review:
  - **Dismiss** — "Not a duplicate" button. Sets `status = 'DISMISSED'`, `reviewed_by`, `reviewed_at`. Clears `mpi_warn` on the patient record.
  - **Flag for Merge** — "Likely duplicate — flag for admin merge" button. Sets `status = 'FLAGGED_FOR_MERGE'`. Patient `mpi_warn` stays true. Actual merge is Phase 3.

### 5.2 Inline Patient Banner

When viewing any patient with `mpi_warn = true`:

- Amber banner at top of patient detail/encounter page
- Text: "Possible duplicate detected (score: {score}). [Review]"
- "Review" link navigates to the duplicate review queue, filtered to this patient's review entry
- Banner disappears when the review is resolved (DISMISSED or MERGED)

### 5.3 Dashboard Card

New `DuplicateReviewsCard` component on the OPD Lite clinical dashboard:
- Shows: "N Pending Reviews" count
- Follows existing card pattern (TodayEncountersCard, UnresolvedConflictsCard)
- Click → navigates to `/duplicate-review`
- Updates via Supabase Realtime broadcast (same channel as OE-4)

### 5.4 Hub API Endpoints

| Endpoint | Type | Purpose |
|---|---|---|
| `duplicateReview.pendingCount` | query | Count of PENDING reviews |
| `duplicateReview.list` | query | Paginated list with filters |
| `duplicateReview.dismiss` | mutation | Set status=DISMISSED, clear mpi_warn |
| `duplicateReview.flagForMerge` | mutation | Set status=FLAGGED_FOR_MERGE |

All endpoints require `protectedProcedure` with `enforceResourceAccess('Patient')`. All emit audit events.

### 5.5 Components

| Component | Path | Purpose |
|---|---|---|
| `DuplicateReviewPage` | `apps/opd-lite/src/app/[locale]/duplicate-review/page.tsx` | Review queue page |
| `DuplicateReviewTable` | `apps/opd-lite/src/components/duplicate-review/DuplicateReviewTable.tsx` | Table with expandable rows |
| `CandidateComparisonCard` | `apps/opd-lite/src/components/duplicate-review/CandidateComparisonCard.tsx` | Side-by-side candidate display |
| `DuplicateReviewsCard` | `apps/opd-lite/src/components/dashboard/DuplicateReviewsCard.tsx` | Dashboard count card |
| `MpiWarnBanner` | `apps/opd-lite/src/components/patient/MpiWarnBanner.tsx` | Inline patient warning banner |

---

## 6. Testing Strategy

### 6.1 Unit Tests
- District dataset: validate all entries have valid parent province, no duplicate names per province
- Registration form: Zod validation, cross-field rules, district-province validation
- MPI pre-flight flow: mock checkDuplicates responses, verify ALLOW/WARN/BLOCK UI behavior
- Async MPI scoring: mock fetchMpiCandidates/computeMpiResult, verify duplicate_reviews creation
- Duplicate review endpoints: dismiss clears mpi_warn, flagForMerge preserves it

### 6.2 Integration Tests
- Full registration flow: form submission → checkDuplicates → create → patient appears in search
- Offline registration: form save to Dexie → sync → syncCreate → async MPI scoring
- Patient Lite: registration with nameFather/gender → profile completion → update

### 6.3 RTL Tests
- Registration form snapshot in both LTR and RTL
- Geography dropdowns show nameLocal in RTL mode

---

## 7. Out of Scope (Phase 3)

- Admin Portal patient management and merge tool
- Lab Lite offline verification fallback
- Pharmacy Lite manual Rx fallback
- Consent expiry warning
- Biometric re-enrolment
- Actual patient merge (Phase 2 only flags for merge)
