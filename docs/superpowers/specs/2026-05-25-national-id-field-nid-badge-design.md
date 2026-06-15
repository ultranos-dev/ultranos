# National ID Field + "NID Missing" Badge — Design Spec

**Date:** 2026-05-25
**Status:** Draft

---

## Overview

Add a National ID# field to the patient registration form and edit profile modal, and display an "NID Missing" amber warning badge on patient profiles and list/search results when no national ID is on file. Also align both forms to a consistent field order by adding Nomadic, Blood Group, and Preferred Language to registration.

## Motivation

National ID is the primary patient identifier, but many population members don't have one yet. Clinicians need to:
1. Capture the ID during registration when available
2. See at a glance which patients are missing it, so they can prompt for it on subsequent visits
3. Have the same fields available in registration and edit flows

## Scope

- **In scope:** Registration form field additions, edit modal field additions, NID Missing badge (profile + list), form flow consistency, MPI integration for national ID
- **Out of scope:** National ID format validation (formats vary), admin workflows for ID verification, bulk NID status reports

---

## 1. Consistent Form Flow

Both `PatientRegistrationForm` and `PatientEditModal` will share this section order:

| # | Section | Fields | Required? |
|---|---------|--------|-----------|
| 1 | **Name** | Given name, Father's name, Grandfather's name | Given: required |
| 2 | **Demographics & Identity** | Gender, Birth year/date, National ID#, Phone, Preferred Language | Gender + birth: required |
| 3 | **Geography** | Origin address, Current address, Nomadic toggle | Origin province + district: required |
| 4 | **Clinical** | Blood Group | Optional (write-once after non-Unknown) |
| 5 | **Consent** | Method, language, version | Registration only |

### Changes from current state

**Registration form gains:**
- National ID# (new text input in Demographics section)
- Preferred Language (dropdown, was edit-only)
- Nomadic toggle (moves into GeographySection, was edit-only)
- Blood Group (new Clinical section, was edit-only)

**Edit modal gains:**
- National ID# (new text input in Demographics section)

**Edit modal reorg:**
- Nomadic toggle moves from standalone Card into GeographySection (consistency with registration)

---

## 2. National ID# Field

### Registration Form

- **Placement:** Demographics & Identity section, after Phone, before Preferred Language
- **Input type:** Text, `inputMode="text"`, max 200 chars
- **Label:** "National ID#" with "(Optional)" helper text
- **Validation:** Optional string, max 200 chars (matches `CreatePatientMpiInputSchema.nationalId`)
- **MPI integration:** Value is passed to `patient.checkDuplicates` as `nationalId` parameter. An exact national ID hash match is the strongest dedup signal.
- **On submit:** Passed to `patient.create` as `nationalId`. Backend hashes via HMAC blind index before storage.

### Edit Profile Modal

- **Placement:** Demographics & Identity section, same position as registration
- **Behavior when empty:** Editable text input, same as registration
- **Behavior when populated:** Read-only display showing masked hash (first 6 + last 4 chars from `nationalIdHash`). Rationale: changing a national ID is sensitive; the raw value is never stored so it can't be displayed back. If the clinician needs to update it, they can clear and re-enter via a dedicated "Change" button that reveals the input.
- **On save:** Passed to `patient.update` as `nationalId`. Backend re-hashes and checks for duplicates before updating.

---

## 3. "NID Missing" Badge

### Patient Profile Page

- **Component:** `NidMissingBanner` (new, in `components/patient/`)
- **Visual:** Amber treatment matching `MpiWarnBanner` — `border-amber-300 bg-amber-50 text-amber-800`
- **Text:** "National ID missing — update patient profile when available."
- **Condition:** Renders when `patient._ultranos.nationalIdHash` is falsy
- **Position in `PatientBannerStack`:** After MpiWarnBanner, before ConsentExpiryBanner (priority order: allergies > conflicts > MPI warn > NID missing > consent expiry > biometric stale)

### Patient List/Search Results

- **Visual:** Small inline amber pill badge next to patient name — `bg-amber-100 text-amber-800 text-xs font-semibold rounded-full px-2 py-0.5`
- **Text:** "NID Missing"
- **Condition:** Renders when `nationalIdHash` is falsy in the patient list item
- **Data availability:** `patient.list` and `patient.search` already return `nationalIdHash`

---

## 4. Nomadic Toggle Relocation

Move the nomadic checkbox from a standalone `<Card>` in the edit modal body into the `GeographySection` component, placed after the Current Address subsection. This:
- Groups all location-related fields together
- Makes registration and edit forms use the same `GeographySection` with the same fields
- Requires adding `isNomadic` + `onIsNomadicChange` props to `GeographySection`

---

## 5. Data Flow

### No backend changes needed

- `national_id_hash` column already exists in `patients` table
- `CreatePatientMpiInputSchema` already accepts `nationalId` (optional string)
- `patient.create` already hashes and stores it
- `patient.update` already accepts `nationalId` with dedup checking
- `patient.checkDuplicates` already accepts `nationalId` for MPI scoring
- `patient.list` / `patient.search` already return `nationalIdHash`
- `blood_group`, `is_nomadic`, `preferred_language` columns already exist

### Frontend wiring only

- Registration form: pass `nationalId`, `isNomadic`, `bloodGroup`, `preferredLanguage` to the create payload
- Edit modal: add `nationalId` field, wire to existing `patient.update` payload
- GeographySection: accept `isNomadic` prop
- PatientBannerStack: add NidMissingBanner
- Patient list component: add NID Missing pill badge

---

## 6. Files to Modify

| File | Change |
|------|--------|
| `apps/opd-lite/src/components/registration/PatientRegistrationForm.tsx` | Add National ID#, Preferred Language, Blood Group fields; pass `isNomadic` to GeographySection; pass `nationalId` to MPI check and create payloads |
| `apps/opd-lite/src/components/registration/GeographySection.tsx` | Add `isNomadic`/`onIsNomadicChange` props; render nomadic checkbox after Current Address |
| `apps/opd-lite/src/components/patient/PatientEditModal.tsx` | Add National ID# field; remove standalone nomadic Card; pass `isNomadic` to GeographySection |
| `apps/opd-lite/src/components/patient/PatientBannerStack.tsx` | Import and render NidMissingBanner |
| `apps/opd-lite/src/components/patient/NidMissingBanner.tsx` | **New file** — amber banner component |
| Patient list/search result component (TBD — identify during implementation) | Add NID Missing pill badge |

## 7. i18n Keys

New translation keys needed:
- `registration.nationalId` — "National ID#"
- `registration.nationalIdPlaceholder` — "Enter national ID number"
- `registration.clinicalSection` — "Clinical"
- `registration.bloodGroup` — (may already exist in edit modal keys)
- `registration.bloodGroupLocked` — (may already exist)
- `patient.nidMissing` — "National ID missing — update patient profile when available."
- `patient.nidMissingBadge` — "NID Missing"
- `registration.changeNationalId` — "Change"
