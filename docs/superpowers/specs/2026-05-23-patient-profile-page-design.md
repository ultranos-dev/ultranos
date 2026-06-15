# Patient Profile Page — Enterprise-Grade Rewrite

**Date:** 2026-05-23
**App:** OPD Lite (`apps/opd-lite`)
**Route:** `/patient/[patientId]`

## Overview

Rewrite the existing `PatientChartPage` from a monolithic component into a compositional shell that assembles focused sub-components. The page becomes a true enterprise-grade patient profile: safety banners, rich demographics with photo, baseline vitals, active medications, encounter history, and lab results — all offline-first from Dexie, revalidated from Hub.

Includes a patient edit workflow via modal and a fully functional patient photo upload backed by Supabase Storage.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Demographics density | Compact header + collapsible details accordion | Clinician mid-consultation needs identity at a glance, not full address |
| Banner order | Safety-first: Allergy → Conflict → MPI → Consent → Biometric | Life-threatening info first, operational last (CLAUDE.md Rule #4) |
| Encounter button | Embedded in header card | "See patient → act on patient" in one visual unit |
| Details accordion | Single accordion, internally sectioned | One click to expand, no accordion fatigue |
| Edit workflow | Modal (PatientEditModal) | Keeps profile page read-only, no view/edit state toggling |
| Active meds | Dedicated section between accordion and encounters | Cross-encounter aggregate view separate from per-encounter Rx |
| Baseline vitals | In header card (height, weight, BMI, blood group) | Semi-static attributes, not per-encounter data |
| Patient photo | Supabase Storage bucket, inline avatar upload | Circular avatar with camera overlay, client-side resize |

## Component Architecture

```
PatientChartPage (shell — loads patient from Dexie, passes down)
│
├── PatientBannerStack
│   ├── AllergyBanner              (exists)
│   ├── ConflictBanner             (exists)
│   ├── MpiWarnBanner              (exists, not wired)
│   ├── ConsentExpiryBanner        (exists, not wired)
│   └── BiometricStaleBanner       (exists, not wired)
│
├── PatientHeaderCard              (NEW)
│   ├── PatientAvatar              (NEW)
│   ├── Patronymic chain           (nameGiven / nameFather / nameGrandfather)
│   ├── Demographics row           (gender, age/DOB, phone)
│   ├── Baseline vitals row        (height, weight, BMI, blood group)
│   ├── "Edit Profile" button      → opens PatientEditModal
│   └── "Start New Encounter" link
│
├── PatientEditModal               (NEW)
│   ├── NameInputSection           (reuse from registration)
│   ├── Demographics fields        (gender, DOB/birth year, phone, language)
│   ├── GeographySection           (reuse from registration)
│   ├── Blood group dropdown       (locked after first save)
│   └── Save → Hub patient.update + Dexie + audit
│
├── PatientDetailsAccordion        (NEW, read-only)
│   ├── Address & Geography        (origin, current, nomadic flag)
│   └── Identity & Records         (tier, consent, identifiers, status, biometric)
│
├── ActiveMedicationsList          (NEW, read-only)
│   └── Cross-encounter active meds from medicationStatements
│
├── EncounterHistoryList           (exists)
│   └── EncounterDetail            (exists — per-visit vitals, SOAP, Rx, allergies)
│
└── LabResultsList                 (exists)
    └── LabResultDetail            (exists)
```

## New Components

### PatientBannerStack

**File:** `components/patient/PatientBannerStack.tsx`
**Props:** `patient: FhirPatient, patientId: string`

Renders all safety banners in fixed priority order. Each banner renders conditionally:

1. **AllergyBanner** — always rendered (shows "No Known Allergies" in gray when empty)
2. **ConflictBanner** — rendered when unresolved Tier 1 sync conflicts exist for this patient
3. **MpiWarnBanner** — rendered when `patient._ultranos.mpiScore` exceeds review threshold
4. **ConsentExpiryBanner** — rendered when the patient's latest active `consent_records.valid_until` is within 90 days. The shell queries `consent_records` from Hub via the existing `consent.expiringList` tRPC endpoint filtered by patient ID, or falls back to checking `_ultranos.consentVersion` presence as a proxy when offline.
5. **BiometricStaleBanner** — rendered when `patient._ultranos.biometricAlgorithmVersion` mismatches `NEXT_PUBLIC_BIOMETRIC_ALGORITHM_VERSION`

### PatientHeaderCard

**File:** `components/patient/PatientHeaderCard.tsx`
**Props:** `patient: FhirPatient, patientId: string, onEditClick: () => void`

Compact identity card layout:

```
┌─────────────────────────────────────────────────┐
│  ┌──────┐  مرجان ګل                            │
│  │avatar│  Father: قمر ګل · Grandfather: بادام ګل │
│  │ 80px │  Male · 27y · +93799473609            │
│  └──────┘  172cm · 68kg · BMI 23.0 · B+         │
│                                                 │
│  [✏ Edit Profile]          [Start New Encounter]│
└─────────────────────────────────────────────────┘
```

- Avatar: `PatientAvatar` sub-component (see below)
- Patronymic chain: `nameGiven` as primary heading, father/grandfather as subtitle
- Demographics: gender, age (calculated from birthDate or birthYear), phone
- Baseline vitals: height, weight (from latest observations), BMI (calculated), blood group (from `_ultranos.bloodGroup`)
- Missing values show as `--`

#### Baseline Vitals Data Source

Height and weight are pulled from Dexie `observations` table:
- Height: latest observation with LOINC code `8302-2`, `subject.reference = Patient/{id}`
- Weight: latest observation with LOINC code `29463-7`, `subject.reference = Patient/{id}`
- BMI: calculated client-side from height + weight (`weight / (height/100)^2`)
- Blood group: from `patient._ultranos.bloodGroup` (not an observation — it's a permanent attribute)

### PatientAvatar

**File:** `components/patient/PatientAvatar.tsx`
**Props:** `patient: FhirPatient, patientId: string, size?: number`

Display and upload behavior:

- **Display:** Circular avatar (default 80px). If `patient._ultranos.photoUrl` exists, fetch a signed URL from Supabase Storage and display the image. Otherwise, show initials derived from `nameGiven` on a colored background.
- **Upload overlay:** Camera icon appears on hover (desktop) or is always visible as a small badge (mobile). Clicking triggers a hidden `<input type="file" accept="image/*" capture="environment">`.
- **Client-side processing:** Resize to max 400x400px using canvas before upload. Convert to JPEG at 80% quality. This keeps file size under ~50KB for low-bandwidth environments.
- **Upload path:** `supabase.storage.from('patient-photos').upload('{patient_id}.jpg', blob, { upsert: true })`
- **Post-upload:** Update `patient._ultranos.photoUrl` on Hub via `patient.update` tRPC mutation + update local Dexie record.
- **Audit:** Emit `PHI_WRITE` event on photo upload (photos are biometric/PHI).
- **Offline:** Display works from cached image. Upload requires connectivity — show toast "Photo upload requires internet connection" if offline.
- **Error handling:** On upload failure, show inline error below avatar. On signed URL fetch failure, fall back to initials.

### PatientEditModal

**File:** `components/patient/PatientEditModal.tsx`
**Props:** `open: boolean, patient: FhirPatient, patientId: string, onClose: () => void, onSaved: (updated: FhirPatient) => void`

Full-screen on mobile, centered large modal on desktop. Pre-populated with current patient data.

**Sections (reusing registration components where possible):**

1. **Name & Demographics**
   - `NameInputSection` (reused from `components/registration/NameInputSection.tsx`)
   - Gender dropdown
   - DOB / birth year toggle (same pattern as registration)
   - Phone input
   - Preferred language dropdown (en / ar / prs)

2. **Address**
   - `GeographySection` (reused from `components/registration/GeographySection.tsx`)
   - Origin address (province → district → village cascading)
   - Current address + "Same as origin" checkbox
   - Nomadic toggle switch

3. **Clinical**
   - Blood group dropdown: A+, A-, B+, B-, AB+, AB-, O+, O-, Unknown
   - Once saved with a non-Unknown value, the dropdown becomes disabled (write-once field)

**Footer:** "Save Changes" (primary button) + "Cancel" (ghost button)

**Editable fields:**

| Field | Control | Required | Constraint |
|-------|---------|----------|------------|
| nameGiven | Text input | Yes | Max 200 chars |
| nameFather | Text input | No | Max 200 chars |
| nameGrandfather | Text input | No | Max 200 chars |
| gender | Dropdown | Yes | AdministrativeGender enum |
| birthDate / birthYear | Date or number input | Yes | Toggle between modes |
| phone | Tel input | No | Max 50 chars |
| preferredLanguage | Dropdown | No | en, ar, prs |
| addressOrigin | Cascading dropdowns | Yes (province + district) | AfghanProvince enum |
| addressCurrent | Cascading dropdowns | No | Same pattern |
| sameAsOrigin | Checkbox | N/A | Boolean |
| isNomadic | Toggle switch | N/A | Boolean |
| bloodGroup | Dropdown | No | Write-once after first save |

**Immutable fields (not shown in modal):**
Patient ID, registration date, consent version, tier, identifiers (hashes), biometric status, merged_into, MPI score, photo (edited via avatar overlay).

**Validation:** Client-side Zod schema mirroring the registration schema pattern.

**Save flow:**
1. Validate with Zod schema
2. Compute `nameLocal` from `[nameGiven, nameFather, nameGrandfather].filter(Boolean).join(' ')`
3. Build a partial update payload with only changed fields
4. Call Hub API `patient.update` tRPC mutation
5. Update local Dexie record via `db.patients.put(updatedPatient)`
6. Emit audit event: `PHI_WRITE` on `PATIENT` resource
7. Call `onSaved(updatedPatient)` — parent refreshes display
8. Close modal

**Offline behavior:** If offline, save to Dexie immediately (optimistic) and queue the Hub update in `syncQueue`. Show toast "Changes saved locally — will sync when online."

### PatientDetailsAccordion

**File:** `components/patient/PatientDetailsAccordion.tsx`
**Props:** `patient: FhirPatient`

Single collapsible section, collapsed by default. Chevron + "Patient Details" label. Internally uses subtle `<h4>` label headers and `<hr>` dividers to separate groups.

**Address & Geography section:**
- Origin: `{village}, {district}, {province}` (formatted from `_ultranos.addressOrigin`)
- Current: Same format from `_ultranos.addressCurrent`, or "Same as origin" if values match
- Nomadic badge: Shown if `_ultranos.isNomadic === true` — styled as an amber chip

**Identity & Records section:**
- **Tier:** FREE or PREMIUM badge
- **Registration Date:** Formatted from `_ultranos.createdAt`
- **Consent:** Version string + expiry status indicator
- **Identifiers:** List from `_ultranos.identifiers[]` — each shows `displayType` (e.g. "e-Tazkira", "Passport") with masked hash value. Paper Tazkira entries additionally show Jild/Safa/Shumara fields.
- **Record Status:** Active (green badge) or Inactive (gray badge). If patient has been merged, show "Merged into {survivor short ID}" as a clickable link routing to `/patient/{merged_into_id}`.
- **Biometric:** "Enrolled" (green) or "Not enrolled" (gray) based on `biometricFingerprintHash` presence. If enrolled but version is stale, show "Outdated" (amber).

Purely read-only. No edit controls.

### ActiveMedicationsList

**File:** `components/patient/ActiveMedicationsList.tsx`
**Props:** `patientId: string`

**Data source:** Dexie `medicationStatements` table, filtered by `subject.reference = Patient/{patientId}` and `status = 'active'`.

**Each medication row displays:**
- Drug name (display text from medication coding)
- Dosage + frequency (e.g. "500mg · twice daily")
- Start date (from prescribing encounter reference)
- Prescribing practitioner reference (opaque ID, no PHI in display)
- Override flag: amber chip if the prescription had an interaction override (cross-referenced from `interactionAuditLog` where `medicationRequestId` matches and `overrideReason` exists)

**Empty state:** "No active medications" in muted text.

**Read-only.** Medications are prescribed through the encounter workflow, not from the profile page.

## Backend Changes

### FhirPatient Type

Add to `_ultranos` in `packages/shared-types/src/fhir/patient.ts`:

```typescript
/** Patient photo path in Supabase Storage (patient-photos bucket) */
photoUrl?: string
/** Blood group — write-once after first save */
bloodGroup?: string
```

### Database Migration

Add columns to `patients` table:

```sql
ALTER TABLE patients ADD COLUMN photo_url TEXT;
ALTER TABLE patients ADD COLUMN blood_group TEXT;
```

### Supabase Storage

Create `patient-photos` bucket:
- **Public:** No (private bucket)
- **RLS:** Authenticated users with valid session can read/write
- **File size limit:** 500KB
- **Allowed MIME types:** `image/jpeg`, `image/png`, `image/webp`

### Hub API — patient.update Mutation

New tRPC mutation added to `apps/hub-api/src/trpc/routers/patient.ts` (the existing patient router):

**Input schema:** Partial patient fields (all optional except `patientId`):
```typescript
{
  patientId: z.string().uuid(),
  nameGiven?: string,
  nameFather?: string,
  nameGrandfather?: string,
  nameLocal?: string,
  gender?: AdministrativeGender,
  birthDate?: string,
  birthYear?: number,
  birthYearOnly?: boolean,
  phone?: string,
  preferredLanguage?: string,
  addressOrigin?: { province, district, village? },
  addressCurrent?: { province, district, village? },
  isNomadic?: boolean,
  bloodGroup?: string,
  photoUrl?: string,
}
```

**Behavior:**
- Validates input with Zod
- Checks authorization (practitioner must have active session)
- If `bloodGroup` is provided and patient already has a non-null `blood_group`, reject the change (write-once)
- Updates `patients` row with only the provided fields
- Updates `meta.lastUpdated` to current ISO timestamp
- Emits audit event
- Returns the full updated patient record

### Dexie

No schema version bump needed. The encrypted blob stores the full `FhirPatient` object — new fields are automatically included. Indexed fields remain unchanged.

## Audit Events

| Action | Resource Type | Trigger |
|--------|--------------|---------|
| `PHI_READ` | `PATIENT` | Patient chart page view (exists) |
| `PHI_WRITE` | `PATIENT` | Profile edit save (new) |
| `PHI_WRITE` | `PATIENT` | Photo upload (new) |

## Offline Behavior Summary

| Feature | Offline Support |
|---------|----------------|
| View patient profile | Yes — all data from Dexie |
| View baseline vitals | Yes — observations from Dexie |
| View active medications | Yes — medicationStatements from Dexie |
| View encounter history | Yes — encounters from Dexie |
| Edit profile (save) | Optimistic — save to Dexie, queue Hub update |
| Upload photo | No — requires connectivity, show toast |
| View existing photo | Yes — cached signed URL / browser cache |

## Component Reuse

| Existing Component | Reused In |
|-------------------|-----------|
| `AllergyBanner` | PatientBannerStack |
| `ConflictBanner` | PatientBannerStack |
| `MpiWarnBanner` | PatientBannerStack |
| `ConsentExpiryBanner` | PatientBannerStack |
| `BiometricStaleBanner` | PatientBannerStack |
| `ConsentRenewalModal` | Triggered from ConsentExpiryBanner |
| `NameInputSection` | PatientEditModal |
| `GeographySection` | PatientEditModal |
| `EncounterHistoryList` | PatientChartPage shell |
| `EncounterDetail` | Nested in EncounterHistoryList |
| `LabResultsList` | PatientChartPage shell |
| `LabResultDetail` | Nested in LabResultsList |

## Files to Create

| File | Purpose |
|------|---------|
| `components/patient/PatientBannerStack.tsx` | Banner composition in safety-first order |
| `components/patient/PatientHeaderCard.tsx` | Compact identity card with avatar, vitals, actions |
| `components/patient/PatientAvatar.tsx` | Photo display + upload with Supabase Storage |
| `components/patient/PatientDetailsAccordion.tsx` | Read-only collapsible demographics |
| `components/patient/PatientEditModal.tsx` | Modal form for editing patient profile |
| `components/patient/ActiveMedicationsList.tsx` | Cross-encounter active medications view |

## Files to Modify

| File | Change |
|------|--------|
| `components/patient/PatientChartPage.tsx` | Full rewrite as compositional shell |
| `packages/shared-types/src/fhir/patient.ts` | Add `photoUrl`, `bloodGroup` to `_ultranos` |
| `apps/hub-api/src/trpc/routers/patient.ts` | Add `patient.update` tRPC mutation |
| Supabase Storage | Create `patient-photos` bucket |
| Database | Migration: add `photo_url`, `blood_group` columns |
