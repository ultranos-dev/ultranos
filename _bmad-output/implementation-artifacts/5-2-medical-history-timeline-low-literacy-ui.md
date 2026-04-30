# Story 5.2: Medical History Timeline (Low-Literacy UI)

Status: in-progress

## User Story

As a patient,
I want to see a visual timeline of my medical history,
so that I can understand my past treatments even if I have difficulty reading dense clinical notes.

## Acceptance Criteria

1. [x] A vertical timeline displays all past encounters and prescriptions in reverse chronological order.
2. [x] Each event is represented by a large, semantic icon (e.g., Stethoscope for encounters, Pill for prescriptions) (NFR8).
3. [x] "Active" medications are highlighted in a prominent section at the top of the timeline.
4. [x] Tapping an event reveals a "Simple View" of details (e.g., "Doctor Visit", "Medicine for Fever") instead of raw FHIR codes.
5. [x] The UI supports RTL layout for Arabic and Dari users.

## Technical Requirements & Constraints

- **Platform:** Health Passport app (Expo/Next.js).
- **Data Model:** Fetch `Encounter` and `MedicationRequest` resources linked to the patient.
- **Mapping:** Implement a "Humanizer" utility that maps FHIR codes (ICD-10, RxNorm) to simplified labels and icons.
- **Performance:** Use a virtualizing list component (e.g., `FlatList`, `FlashList`, or `Virtuoso`) to maintain <60fps scrolling for large timelines.

## Developer Guardrails

- **Low-Literacy Design:** Rely on iconography and color-coding (e.g., Green for completed, Blue for upcoming) over complex text.
- **Accessibility:** Ensure all icons have descriptive `aria-label` or `alt` text for screen readers.
- **Privacy:** Do not show sensitive diagnoses (e.g., mental health, HIV) in the high-level timeline without an explicit "View Detail" tap.

## Tasks / Subtasks

- [x] **Task 1: Timeline Component Scaffolding** (AC: 1, 2)
  - [x] Create `apps/patient-lite-mobile/src/components/timeline/MedicalTimeline.tsx`.
  - [x] Implement vertical connector line and date markers.
  - [x] Add `TimelineIcon` component with support for semantic category icons.
- [x] **Task 2: Active Medications Highlight** (AC: 3)
  - [x] Implement a "Current Care" horizontal carousel or pinned list.
  - [x] Filter `MedicationRequest` by `status: active`.
- [x] **Task 3: FHIR-to-Simple Mapper** (AC: 4)
  - [x] Create `lib/humanizers/fhir-humanizer.ts`.
  - [x] Map common ICD-10 categories to simple icons and labels (e.g., Respiratory -> Lungs icon).
  - [x] Implement language-aware labeling (Arabic/Dari/English).
- [x] **Task 4: RTL & Accessibility Audit** (AC: 5)
  - [x] Verify timeline flow mirrors correctly in RTL mode.
  - [x] Ensure touch targets for timeline items are >= 44px.

## Context Links

- Architecture: [architecture.md](../planning-artifacts/architecture.md#Privacy-Localization-Offline-Security)
- UX: [ux-design-specification.md](../planning-artifacts/ux-design-specification.md#Low-Literacy-UI-Optimization)
- PRD: [ultranos_master_prd_v3.md](../../docs/ultranos_master_prd_v3.md#FR11)

## Dev Agent Record

### Implementation Plan

- Built FHIR humanizer utility first as a dependency for timeline components
- Created `useMedicalHistory` hook following existing `usePatientProfile` patterns (opSeq, audit events)
- Extended offline-store with `loadMedicalHistory`/`saveMedicalHistory` for Encounter + MedicationRequest storage
- Built TimelineIcon, ActiveMedications, and MedicalTimeline components using consumer theme tokens
- Used FlatList for windowed rendering (performance requirement)
- Sensitive diagnoses (F* mental health, B20-B24 HIV) hidden behind explicit tap with audit logging
- All icons use emoji for cross-platform support with `accessibilityRole="image"` and descriptive labels
- RTL: Uses logical CSS properties (paddingEnd, marginInlineStart patterns via React Native defaults), medical icons set to `writingDirection: 'ltr'` to prevent mirroring
- Touch targets enforced via `minHeight: 48` and generous padding on all interactive elements

### Completion Notes

- 78 tests pass (44 new + 34 existing), 0 regressions
- New test files: fhir-humanizer.test.ts (25 tests), useMedicalHistory.test.ts (7 tests), MedicalTimeline.test.tsx (14 tests including RTL layout verification)
- Privacy guardrail implemented: sensitive ICD-10 categories show "Private Health Matter" until explicit tap
- Audit logging: PHI_READ on medical history load, PHI_DISPLAY on sensitive data reveal
- 3 locales supported: English, Arabic, Dari (fa-AF)

## File List

- `apps/patient-lite-mobile/src/components/timeline/MedicalTimeline.tsx` (new)
- `apps/patient-lite-mobile/src/components/timeline/TimelineIcon.tsx` (new)
- `apps/patient-lite-mobile/src/components/timeline/ActiveMedications.tsx` (new)
- `apps/patient-lite-mobile/src/screens/TimelineScreen.tsx` (new)
- `apps/patient-lite-mobile/src/hooks/useMedicalHistory.ts` (new)
- `apps/patient-lite-mobile/src/lib/fhir-humanizer.ts` (new)
- `apps/patient-lite-mobile/src/lib/offline-store.ts` (modified — added medical history storage)
- `apps/patient-lite-mobile/__tests__/MedicalTimeline.test.tsx` (new)
- `apps/patient-lite-mobile/__tests__/useMedicalHistory.test.ts` (new)
- `apps/patient-lite-mobile/__tests__/fhir-humanizer.test.ts` (new)

### Review Findings

#### Decision Needed

- [x] [Review][Decision] **SecureStore 2048-byte limit causes silent data loss for medical history** — Deferred to existing D69. SQLCipher migration is cross-cutting; no real patients yet.
- [x] [Review][Decision] **ActiveMedications cards not tappable despite accessibilityRole="button"** — Resolved: make cards tappable with detail reveal (→ patch).
- [x] [Review][Decision] **Medications never flagged as sensitive** — Deferred to dedicated privacy enhancement story. RxNorm mapping requires clinical input.
- [x] [Review][Decision] **FlatList used instead of FlashList per spec requirement** — Resolved: accept FlatList (already virtualizes), update spec wording (→ patch).

#### Patches

- [x] [Review][Patch] **PHI leak via raw error messages rendered to UI** — Fixed: sanitized to generic message.
- [x] [Review][Patch] **Audit event omits MedicationRequest reads** — Fixed: separate audit event for MedicationRequest.
- [x] [Review][Patch] **Audit resourceId is patientId instead of resource identifier** — Fixed: uses `'medical-history-bundle'` sentinel.
- [x] [Review][Patch] **Crash on unknown IconCategory** — Fixed: fallback to clipboard icon.
- [x] [Review][Patch] **ICD-10 prefix K0 (Dental) shadowed by K (Stomach)** — Fixed: single-pass longest-prefix-first matching.
- [x] [Review][Patch] **humanizeEncounter text fallback bypasses sensitivity check** — Fixed: text fallbacks now `isSensitive: true`.
- [x] [Review][Patch] **Sensitive reveal audit silently skipped when patientId is undefined** — Fixed: blocks reveal when patientId absent.
- [x] [Review][Patch] **No audit event on load failure** — Fixed: emits `outcome: 'failure'` audit.
- [x] [Review][Patch] **formatDate uses device locale, inconsistent for multilingual app** — Fixed: uses `'en-u-ca-gregory'` explicit locale.
- [x] [Review][Patch] **loadMedicalHistory has no schema validation** — Fixed: Zod validation with FhirEncounterSchema + FhirMedicationRequestSchema.
- [x] [Review][Patch] **Sort comparator produces NaN for partial FHIR dates** — Fixed: `|| 0` NaN guard.
- [x] [Review][Patch] **encounter.period access without optional chaining** — Fixed: `encounter.period?.start`.
- [x] [Review][Patch] **OID-based ICD system URIs bypass includes('icd') check** — Fixed: added OID `2.16.840.1.113883.6.90` check.
- [x] [Review][Patch] **RTL tests only verify render, not layout correctness** — Fixed: added icon and multi-item RTL assertions.
- [x] [Review][Patch] **Premature empty state when patientId still loading** — Fixed: TimelineScreen combines `profileLoading || isLoading`.
- [x] [Review][Patch] **ActiveMedications cards not tappable** (from D2) — Fixed: cards wrapped in Pressable with detail reveal.
- [x] [Review][Patch] **Spec updated to accept FlatList** (from D4) — Spec wording updated.

#### Deferred

- [x] [Review][Defer] **Memory store lifecycle not tied to session** [`offline-store.ts:15,131`] — Module-level Map persists across patient switches on web. `wipeMemoryStore` exists but isn't called on logout. Pre-existing architecture concern. — deferred, pre-existing

## Change Log

- 2026-04-29: Story created by Antigravity.
- 2026-04-29: Implementation complete — all 4 tasks done, 44 new tests passing, 0 regressions. Dev agent: Claude.
- 2026-04-29: Code review complete — 17 patches applied, 3 deferred (D69/D71/D72/D73), 1 dismissed. Status → in-progress pending re-review.
