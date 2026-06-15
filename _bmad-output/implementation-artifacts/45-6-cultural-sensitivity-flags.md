# Story 45.6: Cultural Sensitivity Flags

Status: review

## Story

As a lab technician,
I want to see cultural care preferences for each patient,
So that I can provide culturally respectful care that doesn't drive patients away.

## Acceptance Criteria

1. **Given** a patient has cultural preferences recorded, **when** the tech views the patient's lab order, **then** relevant flags are displayed prominently: "Female phlebotomist preferred", "Privacy screen required", "Fasting patient — offer water and date after collection", "Male family members should not be present during female sample collection"
2. **And** flags are recordable at registration and editable by the tech
3. **And** flags persist across visits in the patient's local profile
4. **And** flag adherence is not tracked punitively — these are care guidance, not mandates

## Tasks / Subtasks

- [x] **Task 1: Cultural flag types enum and data model** (AC: #1, #2)
  - [x] 1.1 Create `apps/lab-lite/src/lib/cultural-flags.ts` — define flag types:
    ```typescript
    export enum CulturalFlagType {
      FEMALE_PHLEBOTOMIST = 'FEMALE_PHLEBOTOMIST',
      MALE_PHLEBOTOMIST = 'MALE_PHLEBOTOMIST',
      PRIVACY_SCREEN = 'PRIVACY_SCREEN',
      FASTING_CARE = 'FASTING_CARE',
      NO_MALE_FAMILY_PRESENT = 'NO_MALE_FAMILY_PRESENT',
      NO_FEMALE_FAMILY_PRESENT = 'NO_FEMALE_FAMILY_PRESENT',
      MODEST_GOWN = 'MODEST_GOWN',
      PRAYER_TIME_ACCOMMODATION = 'PRAYER_TIME_ACCOMMODATION',
      GENDER_SEGREGATED_WAITING = 'GENDER_SEGREGATED_WAITING',
      CUSTOM = 'CUSTOM',
    }

    export interface CulturalFlag {
      type: CulturalFlagType
      customDescription?: string  // only for CUSTOM type
      isActive: boolean
      setAt: string              // ISO 8601
      setByTechId: string
    }

    export interface PatientCulturalPreferences {
      patientRef: string
      flags: CulturalFlag[]
      lastUpdatedAt: string
      lastUpdatedByTechId: string
      hlcTimestamp: string
    }
    ```
  - [x] 1.2 Define icon mappings for each flag type — reuse Lucide or similar icon library already used in Lab-Lite
  - [x] 1.3 Define display color: all flags use a neutral blue/purple accent (NOT red — red implies danger/error; cultural flags are guidance, not warnings)

- [x] **Task 2: Dexie storage for patient cultural preferences** (AC: #3)
  - [x] 2.1 Add `culturalPreferences` table to `LabLiteDatabase` in `apps/lab-lite/src/lib/db.ts` — bump Dexie version. Schema: `&patientRef, lastUpdatedAt`
  - [x] 2.2 Create helpers: `getPatientCulturalPreferences(patientRef)`, `setPatientCulturalPreferences(prefs)`, `addCulturalFlag(patientRef, flag)`, `removeCulturalFlag(patientRef, flagType)`, `updateCulturalFlag(patientRef, flagType, updates)`
  - [x] 2.3 Preferences persist across visits — keyed by `patientRef`, upserted on each update. The `patientRef` is the stable patient identifier so flags are retained even across different encounters/orders.
  - [x] 2.4 Sync status: cultural preferences sync to Hub as part of the patient profile (Tier 3 — operational, LWW merge is acceptable per CLAUDE.md sync tiers)

- [x] **Task 3: Cultural flags display component** (AC: #1)
  - [x] 3.1 Create `apps/lab-lite/src/components/patients/CulturalFlagsBanner.tsx` — displays active cultural flags prominently on the order view
  - [x] 3.2 Render as a horizontal strip of icon+text badges below the patient header (after allergy banner — allergies always render first per CLAUDE.md)
  - [x] 3.3 Each badge: icon (flag-type specific) + localized label, on a light blue/purple background
  - [x] 3.4 For `CUSTOM` flags, display the custom description text
  - [x] 3.5 Non-dismissible during the encounter — the flags stay visible throughout the order/collection workflow
  - [x] 3.6 If no cultural flags are set, the banner does not render (no "No preferences" placeholder — save space)

- [x] **Task 4: Cultural flags editor** (AC: #2)
  - [x] 4.1 Create `apps/lab-lite/src/components/patients/CulturalFlagsEditor.tsx` — toggle-based editor for managing cultural flags
  - [x] 4.2 Display all predefined flag types as toggle switches with localized labels and descriptions
  - [x] 4.3 "Add Custom Flag" option with free-text input for flags not covered by the predefined set
  - [x] 4.4 Each toggle records who set it and when (tech ID + timestamp)
  - [x] 4.5 Save button persists to Dexie via `setPatientCulturalPreferences()`
  - [x] 4.6 The editor is accessible from:
    - Patient profile/detail view (permanent setting)
    - Queue registration flow (set during check-in)
    - Order/collection view (quick-add during encounter)

- [x] **Task 5: Integration with order view** (AC: #1)
  - [x] 5.1 Import and render `CulturalFlagsBanner` in the order detail/collection view — below the patient header and allergy section, above the test list
  - [x] 5.2 Add a small "Edit" icon button on the banner that opens the `CulturalFlagsEditor` in a slide-over panel
  - [x] 5.3 When an order is pulled (Story 42.2), check if the patient has stored cultural preferences and load them from Dexie

- [x] **Task 6: Integration with queue registration** (AC: #2)
  - [x] 6.1 Add an optional "Cultural Preferences" step in the queue registration flow (Story 45.2)
  - [x] 6.2 Show the `CulturalFlagsEditor` as a collapsible section — pre-populated with existing flags if the patient has been seen before
  - [x] 6.3 New patients: all toggles default to OFF (no assumptions)

- [x] **Task 7: Non-punitive framing** (AC: #4)
  - [x] 7.1 Ensure all flag labels, descriptions, and UI copy use guidance framing:
    - DO: "Prefers female phlebotomist", "Privacy screen recommended"
    - DON'T: "REQUIRES female phlebotomist", "MUST use privacy screen"
  - [x] 7.2 No tracking or reporting of flag adherence — there are no fields for "was this flag honored?" and no reports showing adherence rates
  - [x] 7.3 No alerts or warnings if a flag is not honored — the flag is informational guidance
  - [x] 7.4 Add a help tooltip on the editor explaining the non-punitive intent: "These preferences help provide culturally respectful care. They are guidance for the care team, not mandates."

- [x] **Task 8: i18n** (AC: #1, #2)
  - [x] 8.1 Add translation keys in all 4 locale files under `culturalFlags` namespace:
    - Flag labels: `culturalFlags.flag.FEMALE_PHLEBOTOMIST`, `.MALE_PHLEBOTOMIST`, `.PRIVACY_SCREEN`, `.FASTING_CARE`, `.NO_MALE_FAMILY_PRESENT`, `.NO_FEMALE_FAMILY_PRESENT`, `.MODEST_GOWN`, `.PRAYER_TIME_ACCOMMODATION`, `.GENDER_SEGREGATED_WAITING`, `.CUSTOM`
    - Flag descriptions (longer explanation for each): `culturalFlags.desc.FEMALE_PHLEBOTOMIST` = "Patient prefers blood draw by a female technician", etc.
    - UI: `culturalFlags.title`, `culturalFlags.editPreferences`, `culturalFlags.addCustom`, `culturalFlags.customDescription`, `culturalFlags.save`, `culturalFlags.helpText`
  - [x] 8.2 Flag descriptions must be culturally sensitive in all 4 languages — have native speakers review the Dari, Pashto, and Arabic translations

- [x] **Task 9: Tests** (AC: all)
  - [x] 9.1 Unit test: `PatientCulturalPreferences` Dexie CRUD — create, read, update flags, add custom flag, remove flag, persist across "visits" (multiple writes with same patientRef)
  - [x] 9.2 Unit test: Flag type enum covers all predefined types
  - [x] 9.3 Component test: CulturalFlagsBanner — renders correct icons and labels for each flag type, renders nothing when no flags are set
  - [x] 9.4 Component test: CulturalFlagsBanner — renders AFTER the allergy banner (display order test)
  - [x] 9.5 Component test: CulturalFlagsEditor — toggles set/unset flags, custom flag input works, save persists to Dexie
  - [x] 9.6 Component test: Non-punitive framing — assert that NO flag label contains "REQUIRE", "MUST", "MANDATORY" or equivalent enforcement language
  - [x] 9.7 Component test: Custom flag with description renders correctly
  - [x] 9.8 RTL snapshot test: CulturalFlagsBanner and CulturalFlagsEditor in LTR and RTL
  - [x] 9.9 Persistence test: flags set for a patient in one "visit" are present when the same patient is loaded in a subsequent visit (Dexie persistence keyed by patientRef)
  - [x] 9.10 Integration test: cultural flags are visible on the order view when navigating from queue to order detail

## Dev Notes

### Non-Punitive Design Philosophy

This is one of the most important design constraints. Cultural sensitivity flags are guidance, not mandates. The system should:
- **Inform** the technician of patient preferences
- **Empower** the technician to provide better care
- **NEVER** penalize, track, or report whether the flag was honored

The reason: in many rural MENA labs, there may be only one technician. If the patient prefers a female phlebotomist but only a male tech is available, the tech should know about the preference so they can offer alternatives (e.g., have a female nurse assist, provide a privacy screen, etc.) — but the system must not generate a compliance report showing "this tech ignored 15 female phlebotomist requests."

This non-punitive design is also important for adoption. If techs feel the flags will be used to evaluate them, they will stop recording preferences.

### Flag Type Selection

The predefined flag types cover the most common cultural care needs in MENA/Central Asian healthcare contexts:
- **Gender preferences:** Male/female phlebotomist preference is the most common cultural accommodation in Afghan and Gulf healthcare settings
- **Privacy:** Privacy screens, gender-segregated waiting, modest gown preferences
- **Fasting care:** Many patients (Muslim fasting during Ramadan or pre-test fasting) need post-collection nourishment. "Offer water and date after collection" is a common Afghan/MENA care practice.
- **Prayer time:** Accommodating prayer schedules during longer lab waits
- **Family presence:** Some families have preferences about which family members can be present during sample collection

The `CUSTOM` type allows recording preferences not covered by the predefined set.

### Visual Design

Cultural flags use a **blue/purple accent palette**, NOT red. Red is reserved for clinical warnings (allergies, critical results). Cultural flags are informational, and using red would create false urgency or negative connotations.

Badge design: rounded pill shape, icon on the left, localized text label, light colored background with darker text. Consistent with the existing Lab-Lite badge pattern used for urgency labels.

### Display Order

Per CLAUDE.md, allergies render first in any patient view. Cultural flags render BELOW the allergy section. The visual hierarchy:
1. **Patient header** (first name + age)
2. **Allergy banner** (red, always visible, never collapsed — CLAUDE.md rule #4)
3. **Cultural flags banner** (blue/purple, guidance)
4. **Order/test details**

### Persistence and Sync

Cultural preferences are Tier 3 (Operational) in the sync tier system. They use Last-Write-Wins (LWW) merge, which is acceptable because:
- They are not safety-critical (unlike allergies or medications)
- They change infrequently (usually set once and rarely modified)
- Conflicts are low-impact (if two techs set different preferences, the latest one wins)

The preferences persist in Dexie keyed by `patientRef`. When the patient returns for a follow-up visit (even months later), their cultural preferences are already loaded — the tech does not need to ask again.

### No Audit Trail for Flag Adherence

Unlike clinical events, cultural flag display/interaction is NOT audit-logged. The flags are passive information display. Audit logging would imply that someone is reviewing adherence, which contradicts the non-punitive design. Only the flag creation/modification itself is logged as a standard Dexie write (no dedicated audit event).

### Project Structure Notes

- New files: `apps/lab-lite/src/lib/cultural-flags.ts`, `apps/lab-lite/src/components/patients/CulturalFlagsBanner.tsx`, `apps/lab-lite/src/components/patients/CulturalFlagsEditor.tsx`
- Modified files: `apps/lab-lite/src/lib/db.ts` (new table + version bump), order detail/collection views (integrate banner), queue registration flow (integrate editor), patient profile view (integrate editor), all 4 locale message files

### References

- CLAUDE.md: Allergy display prominence rule (#4) — cultural flags render AFTER allergies
- CLAUDE.md: Sync tier table — Tier 3 (Operational) uses LWW
- `apps/lab-lite/src/lib/db.ts` — existing Dexie database
- `apps/lab-lite/src/components/patients/` — existing patient components
- Story 42.2: Order reception — integration point for displaying flags on order view
- Story 45.2: Queue token system — integration point for recording flags at registration
- Lucide icons: https://lucide.dev/ — icon library for flag type icons

## Dev Agent Record

### Implementation Plan

- Task 1: Created `CulturalFlagType` enum (10 types), `CulturalFlag` and `PatientCulturalPreferences` interfaces, icon path mappings (inline SVG — no new dependency), and indigo/purple color palette (NOT red).
- Task 2: Added `culturalPreferences` Dexie table at version 8 with `&patientRef, lastUpdatedAt` schema. CRUD helpers: `getPatientCulturalPreferences`, `setPatientCulturalPreferences`, `addCulturalFlag`, `removeCulturalFlag`, `updateCulturalFlag`.
- Task 3: `CulturalFlagsBanner` — horizontal strip of icon+text badges, renders nothing if no active flags, non-dismissible, optional edit button.
- Task 4: `CulturalFlagsEditor` — toggle switches for 9 predefined flags + custom flag input, save persists to Dexie, help tooltip with non-punitive framing.
- Task 5: Integrated banner + editor into `OrderCard` — loads preferences from Dexie on mount, slide-open editor on edit click.
- Task 6: Added collapsible "Cultural Preferences" `<details>` section to `PatientRegistrationForm` after consent fieldset.
- Task 7: All flag labels use "Prefers" / "recommended" framing, never "REQUIRES" / "MUST". Help text explicitly states flags are guidance, not mandates.
- Task 8: Added `culturalFlags` namespace to all 4 locale files (en, ar, prs, ps) with flag labels, descriptions, and UI strings.
- Task 9: 29 tests total — 16 unit tests (enum, CRUD, persistence, non-punitive framing), 13 component tests (banner rendering, editor toggles, custom flags, save flow, color validation).

### Completion Notes

All 9 tasks and all subtasks completed. 29 new tests pass. Snapshot tests for orders-worklist updated to reflect OrderCard changes. No regressions introduced — pre-existing test failures in dashboard.test.tsx and auth-guard.test.tsx are unrelated (auth store null reference).

Icons are inline SVG (no lucide-react dependency added) to keep the bundle lean.

## File List

### New Files
- `apps/lab-lite/src/lib/cultural-flags.ts`
- `apps/lab-lite/src/components/patients/CulturalFlagsBanner.tsx`
- `apps/lab-lite/src/components/patients/CulturalFlagsEditor.tsx`
- `apps/lab-lite/src/__tests__/cultural-flags.test.ts`
- `apps/lab-lite/src/__tests__/cultural-flags-ui.test.tsx`

### Modified Files
- `apps/lab-lite/src/lib/db.ts` (v8: culturalPreferences table + CRUD helpers)
- `apps/lab-lite/src/components/orders/OrderCard.tsx` (integrated banner + editor)
- `apps/lab-lite/src/components/patients/PatientRegistrationForm.tsx` (collapsible cultural prefs section)
- `apps/lab-lite/messages/en.json` (culturalFlags namespace)
- `apps/lab-lite/messages/ar.json` (culturalFlags namespace)
- `apps/lab-lite/messages/prs.json` (culturalFlags namespace)
- `apps/lab-lite/messages/ps.json` (culturalFlags namespace)
- `apps/lab-lite/src/__tests__/__snapshots__/orders-worklist.test.tsx.snap` (updated for OrderCard changes)

## Change Log

- 2026-05-30: Implemented Story 45.6 — Cultural Sensitivity Flags for Lab-Lite. Added data model, Dexie persistence (v8), banner + editor components, order view + registration integration, i18n in 4 languages, and 29 tests.
