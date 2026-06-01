# Story 54.2: Community Health Worker Collection Module

Status: review

## Story

As a village health worker at a remote health post,
I want an ultra-simplified sample collection interface,
so that I can register patients and collect samples without lab training.

## Acceptance Criteria

1. **Given** a non-tech health worker with a basic smartphone or tablet, **when** they open Lab-Lite in CHW mode, **then** they see an ultra-simplified interface with large touch targets, minimal text, and pictographic navigation.
2. **And** the CHW can identify a patient via: (a) QR code scan from Health Passport, or (b) manual entry of name + father's name (the standard Afghan patient identification method).
3. **And** sample type selection uses a pictographic menu with large icons: blood tube, urine cup, swab, stool container — each icon is labeled in the user's locale but icon comprehension does not depend on reading ability.
4. **And** after selecting sample type, a label is generated: either a handwritten barcode number (displayed large for copying) or printed via connected label printer if available.
5. **And** a "Samples Collected" log shows all samples collected today with timestamps, patient reference (first name + age only), and sample type icon.
6. **And** when the courier arrives, each sample barcode is scanned (camera or external scanner) to create a handoff record with: courier ID, timestamp, sample count, and temperature if available.
7. **And** the module syncs store-and-forward when connectivity appears — all collected samples and handoff records queue for upload.
8. **And** NO result entry, QC, or inventory functions are available in CHW mode — these sections are completely absent from the UI, not merely disabled.
9. **And** every sample collection and courier handoff emits an audit event via `@ultranos/audit-logger`.
10. **And** no PHI beyond first name + age appears in any log, error, or UI display (CLAUDE.md Rule #7).

## Tasks / Subtasks

- [x] **Task 1: CHW mode types and configuration** (AC: 1, 8)
  - [x] 1.1 Create `apps/lab-lite/src/types/chw-mode.ts` defining:
    - `CHWSampleCollection` interface: `id` (UUID), `patientRef` (opaque patient reference), `patientFirstName`, `patientAge`, `sampleType` ('blood' | 'urine' | 'swab' | 'stool' | 'other'), `labelNumber` (generated barcode number), `collectedBy` (CHW practitioner ID), `collectedAt` (HLC timestamp), `location` (optional GPS coordinates), `syncStatus` ('pending' | 'synced').
    - `CourierHandoff` interface: `id` (UUID), `courierId`, `sampleIds` (array of sample IDs), `sampleCount`, `pickupTimestamp` (HLC), `temperatureAtPickup` (optional number), `notes` (optional), `syncStatus` ('pending' | 'synced').
  - [x] 1.2 Export types from `apps/lab-lite/src/types/index.ts`.

- [x] **Task 2: Dexie schema migration — `chw_samples` and `courier_handoffs` tables** (AC: 5, 6, 7)
  - [x] 2.1 Add new Dexie version to `apps/lab-lite/src/lib/db.ts` with:
    - `chw_samples`: `&id, patientRef, sampleType, labelNumber, collectedAt, syncStatus`
    - `courier_handoffs`: `&id, courierId, pickupTimestamp, syncStatus`
  - [x] 2.2 Add typed `Dexie.Table` properties.
  - [x] 2.3 Add CRUD helpers: `addCHWSample()`, `getTodayCHWSamples()`, `addCourierHandoff()`, `getPendingSyncItems()`.

- [x] **Task 3: Label number generation** (AC: 4)
  - [x] 3.1 Create `apps/lab-lite/src/lib/chw-label-generator.ts`.
  - [x] 3.2 `generateLabelNumber(): string` — generates a short, easy-to-handwrite number: format `CHW-MMDD-NNN` (month-day-sequence). Designed for manual copying when no printer is available.
  - [x] 3.3 Collision check against today's Dexie entries.
  - [x] 3.4 `printLabel(labelNumber: string, patientAge: number, sampleType: string): void` — formats and sends to connected label printer via Web Print API. Falls back gracefully if no printer detected (shows the label number large on screen for handwriting).

- [x] **Task 4: CHW collection service** (AC: 2, 3, 4, 6, 7, 9)
  - [x] 4.1 Create `apps/lab-lite/src/lib/chw-service.ts`.
  - [x] 4.2 `identifyPatientByQR(qrData: string): Promise<{ pid: string, firstName: string, age: number }>` — parses Health Passport QR (format: `{ pid, iat, exp, v, sig? }`), validates signature if present, returns patient reference. No additional patient data is fetched (data minimization).
  - [x] 4.3 `identifyPatientByName(firstName: string, fatherName: string): Promise<{ pid: string, firstName: string, age: number } | null>` — searches local patient cache by name + father's name. Returns null if not found (CHW can still collect with manual entry — sample links on sync).
  - [x] 4.4 `collectSample(input: CollectSampleInput): Promise<CHWSampleCollection>` — validates input, generates label number, persists to Dexie, emits audit event, returns record.
  - [x] 4.5 `recordCourierHandoff(input: CourierHandoffInput): Promise<CourierHandoff>` — validates that all scanned sample IDs exist in today's log, creates handoff record, marks samples as "handed-off", emits audit event.
  - [x] 4.6 `getSyncQueue(): Promise<Array<CHWSampleCollection | CourierHandoff>>` — returns all items with `syncStatus: 'pending'`.

- [x] **Task 5: CHW mode activation and gate** (AC: 1, 8)
  - [x] 5.1 Create `apps/lab-lite/src/lib/chw-mode.ts`.
  - [x] 5.2 `isCHWMode(): boolean` — checks if current user's role is `chw` or current location mode is `chw-collection`. Reads from auth session store and location config.
  - [x] 5.3 Create `apps/lab-lite/src/components/chw/CHWModeGate.tsx` — wrapper that renders CHW-specific layout when active. Completely removes (not hides) result entry, QC, inventory, and advanced settings from the component tree.

- [x] **Task 6: CHW Dashboard page** (AC: 1, 5)
  - [x] 6.1 Create `apps/lab-lite/src/app/[locale]/chw/page.tsx` — CHW home screen.
  - [x] 6.2 Layout: three large action buttons stacked vertically:
    - "Collect Sample" (large test-tube icon)
    - "Courier Pickup" (large truck icon)
    - "Today's Log" (large clipboard icon)
  - [x] 6.3 Bottom bar: sample count badge ("12 samples today"), sync status indicator.
  - [x] 6.4 All touch targets minimum 48x48px. Font sizes minimum 18px for body text.

- [x] **Task 7: Patient Identification screen** (AC: 2)
  - [x] 7.1 Create `apps/lab-lite/src/components/chw/PatientIdentifyScreen.tsx`.
  - [x] 7.2 Two large buttons: "Scan QR" (camera icon) and "Enter Name" (keyboard icon).
  - [x] 7.3 QR scan: opens camera viewfinder using existing `PatientVerifyScanner.tsx` pattern, parses Health Passport QR.
  - [x] 7.4 Name entry: two large text fields — "Patient Name" and "Father's Name" — with large keyboard-friendly input.
  - [x] 7.5 On successful identification: shows confirmation with first name + age, then proceeds to sample type selection.

- [x] **Task 8: Pictographic Sample Type Selector** (AC: 3)
  - [x] 8.1 Create `apps/lab-lite/src/components/chw/SampleTypeSelector.tsx`.
  - [x] 8.2 Grid of large icon cards (minimum 80x80px icon area):
    - Blood: red tube icon
    - Urine: yellow cup icon
    - Swab: white swab icon
    - Stool: brown container icon
  - [x] 8.3 Each card shows the icon prominently with localized label below (but comprehension relies on icon, not text).
  - [x] 8.4 Single-select: tapping a card highlights it. "Confirm" button proceeds.
  - [x] 8.5 Icons must NOT mirror in RTL (medical/semantic icons per CLAUDE.md RTL rules).

- [x] **Task 9: Label Display / Print screen** (AC: 4)
  - [x] 9.1 Create `apps/lab-lite/src/components/chw/LabelDisplay.tsx`.
  - [x] 9.2 Shows generated label number in very large font (minimum 32px) with clear visual hierarchy for handwriting.
  - [x] 9.3 "Print Label" button if printer is detected (via `navigator.usb` or Web Print API check).
  - [x] 9.4 Visual instruction: icon showing "write this number on the tube" in pictographic style.
  - [x] 9.5 "Done" button returns to CHW dashboard.

- [x] **Task 10: Samples Collected Log** (AC: 5)
  - [x] 10.1 Create `apps/lab-lite/src/components/chw/SamplesCollectedLog.tsx`.
  - [x] 10.2 List of today's samples: each row shows sample type icon, label number, patient first name + age, timestamp.
  - [x] 10.3 Sort by most recent first.
  - [x] 10.4 Count badge at top: "12 samples collected today".
  - [x] 10.5 No edit or delete functionality (append-only for safety).

- [x] **Task 11: Courier Handoff screen** (AC: 6)
  - [x] 11.1 Create `apps/lab-lite/src/components/chw/CourierHandoffScreen.tsx`.
  - [x] 11.2 Step 1: Enter courier ID (text field or scan courier badge).
  - [x] 11.3 Step 2: Scan each sample barcode — camera viewfinder with list of scanned samples building in real time. Each scan plays a confirmation sound/vibration.
  - [x] 11.4 Step 3: Optional temperature entry (numeric input with unit selector: C/F).
  - [x] 11.5 Step 4: Summary — courier ID, sample count, timestamp. "Confirm Handoff" button.
  - [x] 11.6 On confirmation: calls `recordCourierHandoff()`, shows success screen, returns to dashboard.

- [x] **Task 12: Store-and-forward sync integration** (AC: 7)
  - [x] 12.1 Extend `apps/lab-lite/src/lib/upload-queue-worker.ts` to handle CHW sample and handoff records.
  - [x] 12.2 CHW records sync at lower priority than lab results but higher than metadata (sync priority tier aligned with vitals/notes — Tier 2 in sync engine priority order).
  - [x] 12.3 On successful sync, update `syncStatus` to 'synced' in Dexie.
  - [x] 12.4 Sync status indicator on CHW dashboard: "All synced" (green) vs "3 pending" (amber) vs "Offline — 12 queued" (red).

- [x] **Task 13: CHW audit events** (AC: 9)
  - [x] 13.1 Add CHW-specific audit event types in `apps/lab-lite/src/lib/audit-client.ts`: `CHW_SAMPLE_COLLECTED`, `CHW_PATIENT_IDENTIFIED`, `CHW_COURIER_HANDOFF`, `CHW_LABEL_PRINTED`.
  - [x] 13.2 All events include `chwPractitionerId`, `locationId`, `timestamp`.
  - [x] 13.3 Patient identification events log method used (QR vs name) but never log patient name content.

- [x] **Task 14: Tests** (AC: 1-10)
  - [x] 14.1 Unit tests for `chw-service.ts`: patient identification (QR and name), sample collection, courier handoff, sync queue.
  - [x] 14.2 Unit tests for `chw-label-generator.ts`: format, collision detection.
  - [x] 14.3 Component tests for `SampleTypeSelector.tsx`: icon rendering, single-select behavior, RTL layout.
  - [x] 14.4 Component tests for `CourierHandoffScreen.tsx`: barcode scanning flow, summary validation.
  - [x] 14.5 Component tests for `SamplesCollectedLog.tsx`: today's filter, data minimization (first name + age only).
  - [x] 14.6 Integration test: CHW mode gate hides restricted UI sections completely.
  - [x] 14.7 Audit event emission assertions for all CHW operations.

## Dev Notes

- **Ultra-simplified UI** is the core design principle. The CHW user is assumed to be a non-technical health worker with basic smartphone literacy. Every screen must be usable with minimal reading. Icons carry the meaning; text is supplementary.
- **Pictographic sample type selection** uses large, color-coded medical icons. These icons must NOT mirror in RTL (they represent physical objects, not directional concepts).
- **Patient identification** supports QR from Health Passport (Story 5.1) or manual name + father's name entry. Father's name is the standard second identifier in Afghanistan (not surname).
- **Label generation** assumes no printer is available by default. The generated number is displayed large enough to hand-copy onto a sample tube. Printer support is a progressive enhancement.
- **"Samples Collected" log** is append-only. CHWs cannot edit or delete entries — this maintains chain of custody integrity.
- **Store-and-forward sync** means all data persists locally in Dexie and uploads when connectivity appears. The CHW can collect samples all day without any network connection.
- **NO result entry, QC, or inventory** in CHW mode. These sections are completely removed from the component tree (not hidden with CSS) to prevent accidental access and reduce cognitive load.
- **Touch targets**: All interactive elements must be minimum 48x48px per WCAG touch target guidelines. This is critical for use with gloves or in bright sunlight.

## Project Structure Notes

New files:
- `apps/lab-lite/src/types/chw-mode.ts`
- `apps/lab-lite/src/lib/chw-service.ts`
- `apps/lab-lite/src/lib/chw-label-generator.ts`
- `apps/lab-lite/src/lib/chw-mode.ts`
- `apps/lab-lite/src/app/[locale]/chw/page.tsx`
- `apps/lab-lite/src/components/chw/CHWModeGate.tsx`
- `apps/lab-lite/src/components/chw/PatientIdentifyScreen.tsx`
- `apps/lab-lite/src/components/chw/SampleTypeSelector.tsx`
- `apps/lab-lite/src/components/chw/LabelDisplay.tsx`
- `apps/lab-lite/src/components/chw/SamplesCollectedLog.tsx`
- `apps/lab-lite/src/components/chw/CourierHandoffScreen.tsx`

Modified files:
- `apps/lab-lite/src/lib/db.ts` (new Dexie version with `chw_samples`, `courier_handoffs` tables)
- `apps/lab-lite/src/lib/upload-queue-worker.ts` (CHW record sync handling)
- `apps/lab-lite/src/lib/audit-client.ts` (CHW audit event types)

## References

- Epic 54 definition: `_bmad-output/planning-artifacts/epics.md` (line 6593)
- CLAUDE.md: Data minimization Rule #7 (first name + age only)
- CLAUDE.md: RTL rules (medical icons must NOT mirror)
- Story 5.1: Patient Profile & QR Identity (Health Passport QR format)
- Story 42.3: Sample Accessioning & Chain of Custody (sample ID patterns, custody events)
- Story 54.1: Multi-Branch Lab Network (Collection Only mode, satellite concept)
- Existing scanner component: `apps/lab-lite/src/components/PatientVerifyScanner.tsx`
- Existing upload queue: `apps/lab-lite/src/lib/upload-queue-worker.ts`
- Auth session store: `apps/lab-lite/src/stores/auth-session-store.ts`

## Dev Agent Record

### Implementation Plan
- Tasks 1-5: Created core type definitions, Dexie schema v36, label generator, CHW service, and mode gate. Established offline-first data layer for all CHW operations.
- Tasks 6-10: Built CHW dashboard page, patient identification flow (QR + name), pictographic sample type selector, label display screen, and samples collected log.
- Task 11: Built 4-step courier handoff wizard (courier ID → barcode scan → temperature → confirm). Inline barcode scanner with vibration feedback and real-time sample list.
- Task 12: Extended upload-queue-worker.ts with `drainCHWQueue()` for Tier 2 store-and-forward sync of CHW samples and handoffs.
- Task 13: Added CHW audit events to audit-client.ts: CHW_PATIENT_IDENTIFIED, CHW_SAMPLE_COLLECTED, CHW_COURIER_HANDOFF, CHW_LABEL_PRINTED. All events follow data minimization (no patient names in metadata).
- Task 14: 56 tests written and passing across 6 test files.

### Completion Notes
- ✅ All 14 tasks and 56 subtasks complete. 56/56 tests pass.
- ✅ CHW mode gate removes restricted UI completely from component tree (not CSS-hidden) — AC #8.
- ✅ Data minimization: patientFirstName + patientAge ONLY stored and displayed — AC #10, CLAUDE.md Rule #7.
- ✅ Audit events emitted for all CHW operations without blocking the workflow — AC #9.
- ✅ All touch targets ≥ 48px, font sizes ≥ 18px — AC #1, CLAUDE.md WCAG.
- ✅ Medical icons (sample types) use DirectionalIcon category=medical — never mirror in RTL — AC #3, CLAUDE.md RTL rules.
- ✅ Append-only log (no edit/delete) — AC #5, #10.
- ✅ Store-and-forward offline sync via Dexie + upload-queue-worker at Tier 2 — AC #7.
- Note: Dexie schema version 36 (CHW tables added as v36 migration).
- Note: Sub-route pages created for /chw/collect, /chw/handoff, /chw/log routes.

## File List

### New Files
- apps/lab-lite/src/types/chw-mode.ts
- apps/lab-lite/src/lib/chw-service.ts
- apps/lab-lite/src/lib/chw-label-generator.ts
- apps/lab-lite/src/lib/chw-mode.ts
- apps/lab-lite/src/app/[locale]/chw/page.tsx
- apps/lab-lite/src/app/[locale]/chw/collect/page.tsx
- apps/lab-lite/src/app/[locale]/chw/handoff/page.tsx
- apps/lab-lite/src/app/[locale]/chw/log/page.tsx
- apps/lab-lite/src/components/chw/CHWModeGate.tsx
- apps/lab-lite/src/components/chw/PatientIdentifyScreen.tsx
- apps/lab-lite/src/components/chw/SampleTypeSelector.tsx
- apps/lab-lite/src/components/chw/LabelDisplay.tsx
- apps/lab-lite/src/components/chw/SamplesCollectedLog.tsx
- apps/lab-lite/src/components/chw/CourierHandoffScreen.tsx
- apps/lab-lite/src/__tests__/chw-service.test.ts
- apps/lab-lite/src/__tests__/chw-label-generator.test.ts
- apps/lab-lite/src/__tests__/chw-mode-gate.test.tsx
- apps/lab-lite/src/__tests__/chw-sample-type-selector.test.tsx
- apps/lab-lite/src/__tests__/chw-samples-log.test.tsx
- apps/lab-lite/src/__tests__/chw-handoff-screen.test.tsx

### Modified Files
- apps/lab-lite/src/types/index.ts (added CHW type exports)
- apps/lab-lite/src/lib/db.ts (v36 schema: chw_samples, courier_handoffs tables + CRUD helpers)
- apps/lab-lite/src/lib/upload-queue-worker.ts (added drainCHWQueue, CHWSyncDependencies)
- apps/lab-lite/src/lib/audit-client.ts (added CHW audit event functions)
- apps/lab-lite/messages/en.json (added chw namespace)
- apps/lab-lite/messages/ar.json (added chw namespace — Arabic)
- apps/lab-lite/messages/prs.json (added chw namespace — Dari)
- apps/lab-lite/messages/ps.json (added chw namespace — Pashto)

## Change Log

- 2026-06-01: Story 54.2 implemented — CHW Collection Module (all 14 tasks, 56 tests pass). Status → review.
