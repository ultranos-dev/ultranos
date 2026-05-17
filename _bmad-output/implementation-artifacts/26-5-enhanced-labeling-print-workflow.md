# Story 26.5: Enhanced Labeling & Print Workflow

Status: done

## Story

As a pharmacist,
I want to preview medication labels before printing and print in the patient's language,
so that patients receive clear, accurate labeling.

## Acceptance Criteria

1. **Given** a completed fulfillment, **When** the pharmacist proceeds to the labeling step, **Then** a print preview shows the `MedicationLabel` component for each dispensed medication
2. **Given** the print preview, **When** displayed, **Then** the label language defaults to the patient's preferred language (English, Arabic, or Dari/Persian)
3. **Given** the print preview, **When** the pharmacist switches the label language, **Then** all labels re-render in the selected language
4. **Given** the print preview, **When** "Print All Labels" is tapped, **Then** all labels are sent to the printer in sequence
5. **Given** a printed label, **Then** it includes: medication name, dosage, frequency, duration, timing icons, pharmacy name, date, batch/lot number

## Tasks / Subtasks

- [x] Task 1: Create label preview step in fulfillment flow (AC: #1, #5)
  - [x] 1.1 Create `src/components/pharmacy/LabelPreviewPanel.tsx` — renders a list of `MedicationLabel` components for all dispensed medications
  - [x] 1.2 Integrate into the fulfillment workflow: after `phase === 'completed'` in `FulfillmentChecklist`, show a "Preview Labels" button that opens `LabelPreviewPanel`
  - [x] 1.3 Each label uses the existing `MedicationLabel` component (already supports RTL/Arabic/Dari)
- [x] Task 2: Language selection (AC: #2, #3)
  - [x] 2.1 Add a language dropdown at the top of `LabelPreviewPanel`: English, Arabic (العربية), Dari/Persian (دری)
  - [x] 2.2 Default language: derive from patient's preferred language if available via `patientLanguage` prop; fallback to English
  - [x] 2.3 Switching language re-renders all `MedicationLabel` components with the new `locale` and `dir` props
- [x] Task 3: Print functionality (AC: #4)
  - [x] 3.1 "Print All Labels" button triggers `window.print()` with a print-specific CSS media query
  - [x] 3.2 `@media print` styles already existed in `globals.css` — hide all but `.print-label`, page breaks per label
  - [x] 3.3 Each label already has `page-break-after: always` CSS rule in existing `globals.css`
  - [x] 3.4 Skipped iframe approach — `window.print()` + existing CSS is sufficient
- [x] Task 4: Enhance MedicationLabel with missing fields (AC: #5)
  - [x] 4.1 Reviewed existing `MedicationLabel.tsx` — already had: medication name, dosage, frequency, duration, timing icons, batch/lot. Missing: pharmacy name, date
  - [x] 4.2 Added `pharmacyName` prop to `MedicationLabel`
  - [x] 4.3 Added `dispensingDate` prop to `MedicationLabel`
  - [x] 4.4 `batchLot` was already wired from `FulfillmentItem.batchLot`
- [x] Task 5: Tests (AC: all)
  - [x] 5.1 Unit test `LabelPreviewPanel` renders labels for all dispensed items (6 tests)
  - [x] 5.2 Unit test language switcher updates all label locales (8 tests)
  - [x] 5.3 Snapshot test labels in English, Arabic, and Dari (3 tests)
  - [x] 5.4 Unit test print button calls `window.print()` (3 tests)

## Dev Notes

### Architecture & Patterns

- **Existing `MedicationLabel` component** at `src/components/pharmacy/MedicationLabel.tsx` already handles:
  - Medication name, brand name, dosage, frequency
  - Visual timing icons: Sun (morning), Food/Plate (noon), Moon (night)
  - RTL support via `dir` and `locale` props
  - Currently supports English, Arabic, and Dari
- **What may need adding:** pharmacy name, dispensing date, batch/lot number — verify the existing component props before adding.
- **Print approach:** The simplest approach is `window.print()` with `@media print` CSS. This avoids any third-party print libraries. Add print styles in `globals.css` or a dedicated `print.css`.
- **Language codes:** Use `en` for English, `ar` for Arabic, `fa` for Dari/Persian (Dari uses the Persian/Farsi ISO 639-1 code).
- **RTL direction:** Arabic and Dari are RTL. When the language is switched to `ar` or `fa`, set `dir="rtl"` on the label container.

### Existing Files to UPDATE

| File | What Changes |
|------|-------------|
| `src/components/pharmacy/MedicationLabel.tsx` | Add any missing props (pharmacyName, date, batchLot) |
| `src/components/pharmacy/PharmacyScannerView.tsx` OR fulfillment flow | Add "Preview Labels" step after completion |
| `src/app/globals.css` | Add `@media print` styles |

### New Files to CREATE

| File | Purpose |
|------|---------|
| `src/components/pharmacy/LabelPreviewPanel.tsx` | Label preview with language switcher and print button |

### Important Constraints

- **No PHI in print styling CSS.** The print stylesheet should only control layout (hide nav, page breaks). Label content is rendered by React components.
- **Labels must work offline.** No network calls during label preview/print — all data comes from the fulfilled dispense records in local state.
- **Timing icons must NOT mirror in RTL.** Per CLAUDE.md: medical icons (pill, stethoscope) must NOT mirror in RTL. Timing icons (sun, moon, food) are medical context icons — keep them as-is regardless of text direction.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 26.5]
- [Source: apps/pharmacy-lite/src/components/pharmacy/MedicationLabel.tsx — existing label component]
- [Source: CLAUDE.md — RTL Support: medical icons must NOT mirror]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

None — clean implementation, no debugging required.

### Completion Notes List

- Created `LabelPreviewPanel.tsx` — renders MedicationLabel for each dispensed item with language selector and print button
- Enhanced `MedicationLabel.tsx` — added `pharmacyName` and `dispensingDate` optional props
- Integrated into `FulfillmentChecklist.tsx` — "Preview Labels" button appears after `phase === 'completed'`, toggles LabelPreviewPanel
- Language selector defaults to patient language (en/ar/fa), switches dir to RTL for Arabic/Dari
- Print uses existing `@media print` CSS in `globals.css` (was already in place with `page-break-after` rules)
- 20 new tests in `LabelPreviewPanel.test.tsx` covering all ACs: label rendering, language switching, RTL direction, print button, snapshots in all 3 languages
- All 59 tests pass across MedicationLabel, LabelPreviewPanel, and FulfillmentChecklist test files
- Pre-existing test failures in unrelated files (dispense-sync, medication-dispense, prescription-verify) confirmed NOT caused by this story

### Review Findings

- [x] [Review][Decision] `patientLanguage` not wired to LabelPreviewPanel — resolved: added `patientLanguage` prop to FulfillmentChecklist, threaded to LabelPreviewPanel
- [x] [Review][Decision] Static English text ("Lot:", "days") not localized — resolved: added LABEL_TEXT translation map for en/ar/fa
- [x] [Review][Patch] `pharmacyName` not passed to LabelPreviewPanel — fixed: read from useAuthSessionStore, passed to LabelPreviewPanel
- [x] [Review][Patch] Frequency not displayed for freqN ≤ 3 — fixed: now shows "(Nx daily)" for all freqN > 0
- [x] [Review][Patch] `new Date().toLocaleDateString()` is locale-dependent — fixed: uses ISO format `.toISOString().slice(0, 10)`
- [x] [Review][Patch] No close/dismiss button on LabelPreviewPanel — fixed: added "Back" button with onClose callback
- [x] [Review][Patch] RTL direction not set on LabelPreviewPanel header — fixed: set dir={dir} on outer wrapper
- [x] [Review][Defer] `patientLanguage` prop change after mount ignored (stale useState) — edge case, patient language won't change while panel is open in practice [LabelPreviewPanel.tsx:38]
- [x] [Review][Defer] Duplicate `prescription.id` causes React key collision — pre-existing fulfillment store concern [LabelPreviewPanel.tsx:84, FulfillmentChecklist.tsx:112]
- [x] [Review][Defer] Selection state mutable after dispensing phase — toggleItem/selectAll not phase-gated in store [fulfillment-store.ts]
- [x] [Review][Defer] Offline banner doesn't show on sync error state (queued=false, synced=false) — belongs to Story 19.3 scope [FulfillmentChecklist.tsx:85]

### Change Log

- 2026-05-12: Story 26.5 implemented — all tasks complete

### File List

- `apps/pharmacy-lite/src/components/pharmacy/LabelPreviewPanel.tsx` (NEW)
- `apps/pharmacy-lite/src/components/pharmacy/MedicationLabel.tsx` (MODIFIED — added pharmacyName, dispensingDate props)
- `apps/pharmacy-lite/src/components/pharmacy/FulfillmentChecklist.tsx` (MODIFIED — added Preview Labels button + LabelPreviewPanel integration)
- `apps/pharmacy-lite/src/__tests__/LabelPreviewPanel.test.tsx` (NEW — 20 tests)
- `apps/pharmacy-lite/src/__tests__/__snapshots__/LabelPreviewPanel.test.tsx.snap` (NEW)
- `apps/pharmacy-lite/src/__tests__/__snapshots__/MedicationLabel.test.tsx.snap` (MODIFIED — whitespace-only snapshot update)
