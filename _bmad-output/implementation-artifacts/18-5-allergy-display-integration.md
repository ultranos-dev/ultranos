# Story 18.5: Allergy Display Integration

Status: done

## Story

As a patient,
I want to see my allergies prominently in the app,
so that I can inform healthcare providers about my allergies and stay safe.

## Acceptance Criteria

1. Allergies are fetched from the local SQLCipher database (`medical_history` table, type `AllergyIntolerance`)
2. On the Home dashboard, a red allergy banner displays at the top listing ALL active allergy substances — never collapsed, never behind a tab, renders first in DOM
3. Each allergy entry shows: substance name, severity (CRITICAL/HIGH/MODERATE/LOW), and reaction type if available
4. Allergies with `criticality: 'high'` or `severity: 'severe'` are visually distinguished with a bold red border and exclamation icon
5. On the Timeline screen, allergy entries appear as timeline items with a red warning icon and the substance name, sorted by recorded date
6. If no allergy data exists, a gray "No Known Allergies" indicator is shown on both Home and Timeline screens
7. Allergy data is included in the FHIR R4 Bundle export (Story 18.8)
8. Tapping an allergy entry on the Timeline shows a detail view with: substance, reaction, severity, onset date, recorded by (provider name), and clinical notes
9. Allergy data syncs from Hub via the sync engine and is stored encrypted in SQLCipher
10. Allergy section triggers a subtle haptic feedback on first render if critical allergies exist (attention-getting)

## Dependencies

- Story 18.4 (Home Dashboard — provides the dashboard layout and allergy section placement)
- Story 18.1 (Tab Navigation — provides Timeline tab and stack navigation for detail views)

## Existing Code Context

- `apps/patient-lite-mobile/src/components/PatientHealthCard.tsx` — has `allergy` variant (red background, warning icon)
- `apps/patient-lite-mobile/src/lib/encrypted-db.ts` — `medical_history` table exists with schema supporting AllergyIntolerance entries
- `packages/shared-types/src/fhir/` — FHIR AllergyIntolerance type definitions exist
- `apps/patient-lite-mobile/src/screens/TimelineScreen.tsx` — timeline screen exists but may need allergy item rendering

## Tasks / Subtasks

- [x] Task 1: Create allergy data access layer (AC: #1, #9)
  - [x] Create `src/data/allergy-queries.ts` with functions:
    - `getActiveAllergies(db): Promise<AllergyIntolerance[]>` — query `medical_history` WHERE `type = 'AllergyIntolerance'` AND `status = 'active'`
    - `getAllergyById(db, id): Promise<AllergyIntolerance | null>`
  - [x] Parse stored JSON data into FHIR `AllergyIntolerance` resource structure
  - [x] Sort: critical/severe allergies first, then alphabetical by substance
- [x] Task 2: Create AllergyBanner component (AC: #2, #3, #4, #10)
  - [x] Create `src/components/AllergyBanner.tsx`
  - [x] Renders a red background section listing all active allergies
  - [x] Each allergy shows: substance name (large text), severity badge (color-coded)
  - [x] Critical/severe allergies: bold red border, exclamation triangle icon, slightly larger font
  - [x] Moderate/low allergies: standard red background, warning icon
  - [x] Component renders as the FIRST child in any parent container
  - [x] On first render with critical allergies: trigger `Haptics.notificationAsync(NotificationFeedbackType.Warning)` via expo-haptics
  - [x] Never collapses, never hides, never scrolls off initial viewport without user action
- [x] Task 3: Integrate into Home Dashboard (AC: #2)
  - [x] Replace the allergy section in `HomeDashboardScreen.tsx` with the new `AllergyBanner` component
  - [x] Pass allergies from the DB query as props
  - [x] Ensure it remains the FIRST rendered section
- [x] Task 4: No-allergy state (AC: #6)
  - [x] When no active allergies exist: show a gray `PatientHealthCard` with checkmark icon and "No Known Allergies" text
  - [x] This state is still rendered at the top — not hidden
  - [x] Translated: `t('allergy.noKnown')` for all 3 locales
- [x] Task 5: Timeline allergy items (AC: #5)
  - [x] In `TimelineScreen.tsx`: include allergy entries in the timeline data
  - [x] Allergy timeline items: red warning icon, substance name, "Allergy Recorded" label, date
  - [x] Sorted chronologically with other timeline items (encounters, medications)
  - [x] Visual treatment: red left border stripe to distinguish from other timeline item types
- [x] Task 6: Allergy detail view (AC: #8)
  - [x] Create `src/screens/AllergyDetailScreen.tsx`
  - [x] Display: substance name, reaction description, severity, criticality, onset date, recorded date, recording provider name, clinical notes
  - [x] Navigation: push onto TimelineStack when allergy item is tapped
  - [x] No edit capability for patients — read-only view
  - [x] All text translated; clinical terms (substance names) remain in English per Story 11.3 policy
- [x] Task 7: FHIR Bundle inclusion (AC: #7)
  - [x] Ensure allergy data is available to the FHIR Bundle export function (Story 18.8)
  - [x] Export `getAllActiveAllergiesForExport(db)` that returns FHIR-compliant `AllergyIntolerance` resources
  - [x] Include all allergies (active and resolved) in the export bundle
- [x] Task 8: Testing (AC: all)
  - [x] Test: allergy banner renders first in Home dashboard DOM
  - [x] Test: critical allergies are visually distinguished (bold border, exclamation icon)
  - [x] Test: no-allergy state shows gray indicator
  - [x] Test: timeline includes allergy items with red styling
  - [x] Test: allergy detail screen shows all fields
  - [x] Test: haptic fires for critical allergies (mock expo-haptics)
  - [x] Test: data loads from encrypted DB, not network
  - [x] Snapshot tests for allergy banner in LTR and RTL

## Technical Notes

- CLAUDE.md rule #4: "Allergy data gets the highest display prominence. In any patient-facing view for clinicians, allergies render first, in red, never collapsed, never behind a tab. Allergy-related code paths get dedicated test coverage."
- FHIR AllergyIntolerance resource fields: `code.text` (substance), `reaction[].severity`, `criticality`, `onsetDateTime`, `recorder`, `note`
- Haptic feedback is a low-literacy accessibility feature — draws attention to critical information even if the text isn't read
- Allergy data is Tier 1 (safety-critical) in the sync engine — append-only merge, never LWW
- The "No Known Allergies" state is clinically important — it confirms the allergy field was populated, not just missing data

## Dev Agent Record

### Implementation Plan
- Created dedicated allergy data access layer (`allergy-queries.ts`) querying SQLCipher `medical_history` table
- Built `AllergyBanner` component with red styling, severity badges, and haptic feedback for critical allergies
- Replaced inline `AllergySection` in `HomeDashboardScreen` with reusable `AllergyBanner`
- Extended `TimelineEvent` type to support `'allergy'` type with red left border stripe
- Created `AllergyDetailScreen` with full FHIR field display and navigation integration
- Exported `getAllAllergiesForExport()` for Story 18.8 FHIR Bundle integration
- Added `'warning'` icon category to `fhir-humanizer.ts` and `TimelineIcon.tsx`

### Debug Log
- Installed `expo-haptics` as new dependency for haptic feedback
- Installed `react-i18next` and `i18next` as direct dependencies (were only transitive)
- Created `__mocks__/@react-navigation/` directory for Jest module resolution in pnpm strict mode
- Added expo-haptics mock to `jest.setup.js`
- Pre-existing test failures in `home-dashboard.test.tsx` (missing `@ultranos/ui-kit/utils/format` subpath) — not caused by this story

### Completion Notes
- All 44 allergy-specific tests pass across 4 test suites
- No regressions in previously-passing tests
- Translation keys added for all 3 locales (en, ar, prs)
- AllergyBanner renders FIRST in both Home and Timeline screens per CLAUDE.md rule #4

## File List

### New Files
- `apps/patient-lite-mobile/src/data/allergy-queries.ts`
- `apps/patient-lite-mobile/src/components/AllergyBanner.tsx`
- `apps/patient-lite-mobile/src/screens/AllergyDetailScreen.tsx`
- `apps/patient-lite-mobile/__tests__/allergy-queries.test.ts`
- `apps/patient-lite-mobile/__tests__/AllergyBanner.test.tsx`
- `apps/patient-lite-mobile/__tests__/AllergyDetailScreen.test.tsx`
- `apps/patient-lite-mobile/__mocks__/@react-navigation/native.js`
- `apps/patient-lite-mobile/__mocks__/@react-navigation/native-stack.js`

### Modified Files
- `apps/patient-lite-mobile/src/screens/HomeDashboardScreen.tsx` — replaced inline AllergySection with AllergyBanner
- `apps/patient-lite-mobile/src/screens/TimelineScreen.tsx` — passes activeAllergies to MedicalTimeline
- `apps/patient-lite-mobile/src/hooks/useMedicalHistory.ts` — added allergy type, allergyToEvent, activeAllergies
- `apps/patient-lite-mobile/src/components/timeline/MedicalTimeline.tsx` — allergy banner in header, red card styling, navigation
- `apps/patient-lite-mobile/src/components/timeline/TimelineIcon.tsx` — added 'warning' icon
- `apps/patient-lite-mobile/src/lib/fhir-humanizer.ts` — added 'warning' to IconCategory
- `apps/patient-lite-mobile/src/navigation/types.ts` — added AllergyDetailScreen to TimelineStackParamList
- `apps/patient-lite-mobile/src/navigation/TimelineStack.tsx` — registered AllergyDetailScreen
- `apps/patient-lite-mobile/messages/en.json` — allergy translation keys
- `apps/patient-lite-mobile/messages/ar.json` — allergy translation keys (Arabic)
- `apps/patient-lite-mobile/messages/prs.json` — allergy translation keys (Dari)
- `apps/patient-lite-mobile/jest.setup.js` — expo-haptics mock
- `apps/patient-lite-mobile/__tests__/MedicalTimeline.test.tsx` — removed inline nav mock (now global)

### Review Findings

#### Decision Needed (Resolved)
- [x] [Review][Decision] **AC #4/#3/#8: Severity vs criticality confusion** — Resolved: Add `reaction[].severity === 'severe'` as additional trigger for critical styling. Show both criticality and severity dimensions.
- [x] [Review][Decision] **"No Known Allergies" false-negative risk** — Resolved: Add `isLoading` and `error` props to AllergyBanner to distinguish NKA from loading/failure states.
- [x] [Review][Decision] **Allergy events marked `isSensitive: false`** — Dismissed: Correct per CLAUDE.md Rule #4 — allergies must ALWAYS be visible, never gated behind consent.

#### Patch (All Applied)
- [x] [Review][Patch] **CLAUDE.md Rule #6: Missing PHI_READ audit for bulk allergy load** — Added PHI_READ audit event for AllergyIntolerance in useMedicalHistory.ts
- [x] [Review][Patch] **Duplicate audit events in AllergyDetailScreen** — Added auditedRef to track emitted allergyId, preventing duplicate events on re-render
- [x] [Review][Patch] **Unsafe `clinicalStatus.coding[0]` access** — Added `coding?.[0]?.code` optional chaining in allergy-queries.ts and useMedicalHistory.ts
- [x] [Review][Patch] **`_ultranos.createdAt` accessed without null guard** — Added `_ultranos?.createdAt` with ISO fallback in allergyToEvent()
- [x] [Review][Patch] **AllergyDetailScreen only searches activeAllergies** — Now searches all allergy events (active + resolved) from events array
- [x] [Review][Patch] **AC #6: Timeline empty state missing allergy indicator** — AllergyBanner now renders in Timeline empty state
- [x] [Review][Patch] **RTL: Back button uses hardcoded left arrow** — Now uses RTL-aware arrow via I18nManager.isRTL
- [x] [Review][Patch] **Dark mode: allergyCard uses hardcoded colors** — Now uses theme colors (colors.error, colors.dangerBg)
- [x] [Review][Patch] **AC #4: severity check** — isCriticalAllergy now checks both `criticality === 'high'` and `reaction[].severity === 'severe'`
- [x] [Review][Patch] **AllergyBanner loading/error states** — Added isLoading/error props to distinguish NKA from loading/failure; wired in HomeDashboardScreen

#### Deferred (pre-existing)
- [x] [Review][Defer] **Hardcoded English strings in MedicalTimeline** — Multiple untranslated strings ("Loading your medical history...", "No medical history yet", etc.). Pre-existing before Story 18.5; belongs to Epic 11 i18n stories. [MedicalTimeline.tsx] — deferred, pre-existing

## Change Log

- 2026-05-18: Implemented Story 18.5 — Allergy Display Integration. Created allergy data access layer, AllergyBanner component with haptic feedback, AllergyDetailScreen, timeline integration with red visual treatment, FHIR export function, and comprehensive test coverage (44 tests).
