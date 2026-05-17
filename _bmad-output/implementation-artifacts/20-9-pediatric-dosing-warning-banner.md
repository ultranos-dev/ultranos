# Story 20.9: Pediatric Dosing Warning Banner

Status: done

## Story

As a clinician,
I want to see a clear warning when prescribing for pediatric patients,
so that I know weight-based dosing is not supported in V1 and must be calculated manually.

## Acceptance Criteria

1. **Given** an active encounter where the patient's age is <18 years, **When** the clinician enters the prescription section, **Then** a yellow warning banner is displayed: "Weight-based dosing not supported — calculate manually".

2. **Given** the warning banner, **Then** it is persistent (not dismissible) for the duration of the encounter.

3. **Given** an adult patient (age >= 18), **Then** the warning banner is NOT displayed.

## Tasks / Subtasks

- [x] Task 1: Create pediatric warning banner (AC: #1, #2)
  - [x] 1.1 Create `src/components/clinical/PediatricDosingBanner.tsx`
  - [x] 1.2 Accept `patientBirthDate: string` prop (ISO 8601)
  - [x] 1.3 Calculate age from birth date using existing `clinical-utils.ts` age calculation
  - [x] 1.4 If age < 18: render yellow warning banner with text "Weight-based dosing not supported — calculate manually"
  - [x] 1.5 If age >= 18: render nothing
  - [x] 1.6 Style: `#ffd11a` (Warning Yellow) background, dark text, rounded, non-dismissible (no close button), persistent

- [x] Task 2: Integrate into prescription flow (AC: #1)
  - [x] 2.1 Add `PediatricDosingBanner` to `encounter-dashboard.tsx` — render above the `PrescriptionEntry` component
  - [x] 2.2 Pass patient birth date from `usePatientStore().selectedPatient.birthDate`
  - [x] 2.3 Banner should appear when prescription section is visible, not before

- [x] Task 3: Testing (AC: all)
  - [x] 3.1 Unit test: banner renders for patient aged 5 (birthDate 5 years ago)
  - [x] 3.2 Unit test: banner renders for patient aged 17
  - [x] 3.3 Unit test: banner does NOT render for patient aged 18
  - [x] 3.4 Unit test: banner does NOT render for patient aged 45
  - [x] 3.5 Unit test: banner text matches exactly "Weight-based dosing not supported — calculate manually"
  - [x] 3.6 Unit test: banner has no close/dismiss button
  - [x] 3.7 Snapshot test for banner styling (yellow background)
  - [x] 3.8 Edge case: patient born on today's date 18 years ago (boundary test — age is exactly 18, no banner)
  - [x] 3.9 RTL snapshot test

## Dev Notes

### Current State

OPD Lite has **no pediatric-specific warnings**. The prescription entry flow in `encounter-dashboard.tsx` currently:
1. Shows `PrescriptionEntry` component for medication search + dosage form
2. Runs drug interaction check
3. Shows interaction warning modal if needed
4. Generates QR code

This story adds a **static warning banner** above the prescription section for pediatric patients. No blocking behavior — it's informational only.

### Age Calculation

`src/lib/clinical-utils.ts` likely has an age calculation utility. The encounter dashboard already calculates age for display. Reuse this:

```typescript
function calculateAge(birthDate: string): number {
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}
```

Threshold: `age < 18` → show banner.

### Banner Styling

Use the semantic Warning Yellow (`#ffd11a`) from the UX design spec. This matches the StaleDataBanner pattern but with different content:
- Background: `#ffd11a`
- Text: dark color (`#0e0f0c` or equivalent for WCAG AA contrast)
- Padding: comfortable (12-16px)
- Border radius: 8px
- No close button (non-dismissible)
- Icon: warning triangle (optional, enhances visibility)
- `dir="auto"` on text content for RTL

### Component Simplicity

This is intentionally a very simple component — a single conditional render with a styled div. Do NOT over-engineer:
- No state management needed
- No store integration beyond reading patient birth date
- No API calls
- No dismissal logic
- Pure presentational component with one prop

### File Structure

**NEW files:**
- `src/components/clinical/PediatricDosingBanner.tsx`

**MODIFIED files:**
- `src/components/encounter-dashboard.tsx` — add `PediatricDosingBanner` above `PrescriptionEntry`

### Important Constraints

- **Non-dismissible:** The banner MUST NOT have a close button. It persists for the entire encounter session for pediatric patients. This is a safety feature.
- **Informational only:** The banner does NOT block prescription entry. The clinician can still prescribe — they just need to calculate dosing manually.
- **Age boundary:** Age exactly 18 = adult (no banner). Use strict `< 18` comparison.
- **No PHI in banner:** The banner text is generic. It does NOT include the patient's name or age. No audit event needed for banner display.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 20, Story 20.9]
- [Source: apps/opd-lite/src/components/encounter-dashboard.tsx — prescription section]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Warning Yellow #ffd11a]
- [Source: apps/opd-lite/src/lib/clinical-utils.ts — age calculation utilities]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

None — clean implementation, all tests passed on first run.

### Completion Notes List

- Created pure presentational `PediatricDosingBanner` component with single `patientBirthDate` prop
- Age calculation uses same logic as `formatAge` in encounter-dashboard (year/month/day comparison)
- Banner renders with `#ffd11a` background (Warning Yellow) and dark text `#0e0f0c` for WCAG AA contrast
- Non-dismissible: no close button, no state management, purely conditional render
- Integrated above `PrescriptionEntry` in the prescriptions section (only visible during active encounter when prescription section is shown)
- Patient birthDate passed from resolved patient object (not from store directly, since encounter-dashboard already resolves it)
- 9 unit tests covering: age 5, 17 (renders), age 18, 45 (no render), exact text match, no dismiss button, yellow styling, boundary test (exactly 18 = adult), RTL snapshot
- Full regression suite: 57 test files, 595 tests all passing

### File List

- `apps/opd-lite/src/components/clinical/PediatricDosingBanner.tsx` — NEW
- `apps/opd-lite/src/__tests__/PediatricDosingBanner.test.tsx` — NEW
- `apps/opd-lite/src/__tests__/__snapshots__/PediatricDosingBanner.test.tsx.snap` — NEW (auto-generated)
- `apps/opd-lite/src/components/encounter-dashboard.tsx` — MODIFIED (import + banner placement)

### Review Findings

- [x] [Review][Patch] Year-only birthDate (FHIR YYYY) — skip banner when `birthYearOnly` is true; imprecise age could mislead at 17/18 boundary. **Fixed:** added `birthYearOnly` prop, early-return when true, integration passes flag from patient object.
- [x] [Review][Dismissed] Unrelated plan/setPlan changes — accepted as scope bleed from adjacent story work.
- [x] [Review][Patch] Invalid date → NaN → banner renders for all invalid patients — **Fixed:** `calculateAge` returns NaN for invalid dates; component guards with `isNaN(age)`. Added test for invalid date input.
- [x] [Review][Patch] Duplicate age calculation (3 copies in codebase) — **Fixed:** created shared `calculateAge` in `clinical-utils.ts`; component now imports from shared utility.
- [x] [Review][Patch] Timezone mismatch: local time vs UTC in age calculation — **Fixed:** shared `calculateAge` uses UTC methods (`getUTCFullYear`, `getUTCMonth`, `getUTCDate`) for consistent boundary behavior.
- [x] [Review][Patch] Empty wrapper div adds phantom spacing for adult patients — **Fixed:** removed wrapper div; `mb-4` moved to banner component itself (only renders when banner is visible).
