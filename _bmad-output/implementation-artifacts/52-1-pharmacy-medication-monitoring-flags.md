# Story 52.1: Pharmacy-Lite Medication Monitoring Flags

Status: draft

## Story

As a lab technician,
I want to see which patients need follow-up labs based on their medications,
So that I can proactively schedule monitoring tests for patients who might forget to return.

## Context

Many medications require periodic lab monitoring to ensure safety and efficacy. Warfarin requires INR monitoring, Metformin requires renal function checks, Lithium requires serum level monitoring, Methotrexate requires CBC and liver function tests. Currently, the ordering physician writes these monitoring orders manually, and the patient is expected to remember to return for testing. In low-resource settings with limited health literacy, patients frequently miss monitoring windows, leading to preventable adverse drug events.

This story connects Pharmacy-Lite dispensing events to Lab-Lite via the Hub, creating an automatic monitoring flag pipeline. When Pharmacy-Lite dispenses a monitored medication, the Hub notifies Lab-Lite, which surfaces a "Monitoring Due" dashboard section and can generate reminders when monitoring is overdue.

Lab-Lite remains data-minimized per CLAUDE.md Rule #7 — it receives only patient first name + age, medication name, required test, and monitoring schedule. No diagnosis, no prescriber details, no clinical context beyond what is necessary for scheduling the test.

**PRD Requirements:** FR52 (brainstorm #24)
**Epic:** 52 — Cross-App Integration & Pharmacy Awareness
**Depends on:** Story 42.2 (test order reception), Story 42.6 (write-once distribute-many for result delivery back to OPD/Patient)
**Related:** Epic 40 (Pharmacy-Lite inventory/POS), Story 48.2 (predictive burndown)

## Acceptance Criteria

1. [ ] A medication-to-lab-test mapping table exists with clinically validated entries (e.g., Warfarin -> INR, Metformin -> Creatinine/eGFR, Lithium -> Serum Lithium + TSH + Creatinine).
2. [ ] When Pharmacy-Lite dispenses a medication that requires lab monitoring, the dispensing event syncs to the Hub and the Hub pushes a monitoring flag to Lab-Lite.
3. [ ] Lab-Lite receives and persists monitoring flags locally in Dexie, surviving offline periods.
4. [ ] A "Monitoring Due" section appears on the Lab-Lite dashboard, listing patients with upcoming or overdue monitoring tests.
5. [ ] Each monitoring flag displays: patient first name + age (data minimization), medication name, required test type, monitoring frequency, due date, and overdue status.
6. [ ] The system generates reminders when monitoring is overdue — notification to the ordering physician via Hub, and optionally to the patient via Patient-Lite.
7. [ ] When a monitoring test is completed (result authorized via Story 42.5), the monitoring flag is updated with the completion date and the next due date is calculated automatically.
8. [ ] Monitoring flags respect data minimization — Lab-Lite receives NO diagnosis, NO prescriber identity beyond opaque ID, NO clinical notes.
9. [ ] All monitoring flag access and updates are audit-logged via `@ultranos/audit-logger`.
10. [ ] The monitoring pipeline works offline — flags are cached locally and the dashboard renders from Dexie even without Hub connectivity.

## Tasks / Subtasks

- [ ] **Task 1: Medication-to-Lab-Test Mapping Table** (AC: 1)
  - [ ] Create `apps/lab-lite/src/lib/monitoring/medication-lab-map.ts`.
  - [ ] Define `MedicationLabMapping` interface:
    ```typescript
    interface MedicationLabMapping {
      medicationCode: string        // RxNorm or local formulary code
      medicationDisplay: string     // human-readable name
      requiredTests: {
        loincCode: string           // LOINC code for the required test
        testDisplay: string         // human-readable test name
        frequencyDays: number       // monitoring interval in days
        initialDelayDays: number    // days after first dispense before first test
        priority: 'routine' | 'urgent'  // urgency of the monitoring
      }[]
    }
    ```
  - [ ] Populate with clinically validated mappings:
    - Warfarin -> INR (every 7-28 days depending on stability, initial at 3 days)
    - Metformin -> Creatinine/eGFR (every 90 days, initial at 90 days)
    - Lithium -> Serum Lithium + TSH + Creatinine (Lithium every 90 days, TSH every 180 days)
    - Methotrexate -> CBC + LFTs (every 30 days, initial at 14 days)
    - ACE Inhibitors -> Potassium + Creatinine (every 90 days, initial at 14 days)
    - Carbamazepine -> CBC + LFTs + Drug Level (every 90 days, initial at 30 days)
    - Amiodarone -> Thyroid Function + LFTs (every 180 days, initial at 90 days)
  - [ ] Design for Hub-updateable configuration — local mapping is a fallback, Hub can push updated mappings.

- [ ] **Task 2: Monitoring Flag Data Model (Dexie)** (AC: 3, 5)
  - [ ] Add Dexie schema version increment in `apps/lab-lite/src/lib/db.ts` with new `monitoringFlags` table.
  - [ ] Define `MonitoringFlag` interface:
    ```typescript
    interface MonitoringFlag {
      id?: number                   // auto-increment
      patientRef: string            // opaque patient ID
      patientFirstName: string      // data-minimized: first name only
      patientAge: number            // computed age, NOT DOB
      medicationCode: string        // RxNorm or formulary code
      medicationDisplay: string     // human-readable medication name
      dispensedAt: string           // ISO 8601 — when pharmacy dispensed
      dispensingEventId: string     // reference to MedicationDispense.id
      testRequired: string          // LOINC code
      testDisplay: string           // human-readable test name
      frequencyDays: number         // monitoring interval
      dueDate: string               // ISO 8601 date — when next test is due
      status: 'upcoming' | 'due' | 'overdue' | 'completed'
      lastCompletedAt: string | null  // ISO 8601 — last time this test was done
      reminderSentAt: string | null   // ISO 8601 — last reminder sent
      orderingPractitionerRef: string // opaque practitioner ID for notifications
      hlcTimestamp: string          // HLC for sync ordering
      syncedFromHub: boolean        // whether this was received from Hub
      createdAt: string             // ISO 8601
      updatedAt: string             // ISO 8601
    }
    ```
  - [ ] Indexes: `++id, patientRef, status, dueDate, [status+dueDate], medicationCode, dispensingEventId`.
  - [ ] Unique constraint on `[patientRef+medicationCode+testRequired]` to prevent duplicate flags for the same patient-medication-test combination.

- [ ] **Task 3: Hub Sync — Dispensing Event Receiver** (AC: 2, 8, 10)
  - [ ] Create `apps/lab-lite/src/lib/monitoring/dispense-receiver.ts`.
  - [ ] Define the inbound payload from Hub (data-minimized projection of `MedicationDispense`):
    ```typescript
    interface DispenseMonitoringPayload {
      dispensingEventId: string
      patientRef: string
      patientFirstName: string      // first name only — Rule #7
      patientAge: number            // age only — Rule #7
      medicationCode: string
      medicationDisplay: string
      dispensedAt: string
      orderingPractitionerRef: string
      hlcTimestamp: string
    }
    ```
  - [ ] On receiving a dispensing event from Hub sync: look up `medicationCode` in the mapping table (Task 1). If the medication requires monitoring, create `MonitoringFlag` entries for each required test.
  - [ ] Calculate initial `dueDate` = `dispensedAt + initialDelayDays` from the mapping.
  - [ ] If a flag already exists for this patient-medication-test combination (dedup check), update the existing flag rather than creating a duplicate.
  - [ ] Audit-log: `MONITORING_FLAG_CREATED` with `patientRef` (opaque), `medicationCode`, `testRequired`.

- [ ] **Task 4: Monitoring Status Lifecycle** (AC: 7)
  - [ ] Create `apps/lab-lite/src/lib/monitoring/status-lifecycle.ts`.
  - [ ] Status transitions:
    - `upcoming` -> `due` when current date >= `dueDate - 7 days` (1 week warning window)
    - `due` -> `overdue` when current date > `dueDate`
    - `due`/`overdue` -> `completed` when a matching result is authorized (match by `patientRef` + `testRequired` LOINC code)
    - `completed` -> `upcoming` with new `dueDate = completionDate + frequencyDays`
  - [ ] Hook into Story 42.5 authorization release — when a result is released, check if it matches any active monitoring flag for that patient and test type.
  - [ ] Status recalculation runs on: app startup, periodic timer (every 15 minutes), and on result authorization.
  - [ ] Audit-log: `MONITORING_FLAG_COMPLETED`, `MONITORING_FLAG_OVERDUE`.

- [ ] **Task 5: "Monitoring Due" Dashboard Section** (AC: 4, 5, 10)
  - [ ] Create `apps/lab-lite/src/components/dashboard/MonitoringDueCard.tsx`.
  - [ ] Query Dexie for flags with `status` in `['due', 'overdue']`, ordered by `dueDate` ascending (most overdue first).
  - [ ] Display as a card in the dashboard with:
    - Title: "Monitoring Due" with count badge
    - Each row: patient first name + age, medication name, test required, due date, overdue indicator (red badge with days overdue)
    - Tap a row to navigate to the patient's monitoring detail or initiate sample reception
  - [ ] Overdue items render with red background/border per allergy display precedent (high-visibility for safety-critical info).
  - [ ] Empty state: "No monitoring tests due" with a brief explanation of the feature.
  - [ ] RTL-ready: use logical CSS properties (`margin-inline-start`, `padding-inline-end`).

- [ ] **Task 6: Reminder Generation** (AC: 6)
  - [ ] Create `apps/lab-lite/src/lib/monitoring/reminder-generator.ts`.
  - [ ] When a flag transitions to `overdue`:
    - Generate a notification payload for the ordering physician: `{ type: 'MONITORING_OVERDUE', patientRef, medicationDisplay, testDisplay, dueDate, daysOverdue }`.
    - Enqueue via sync engine (`enqueueSyncAction`) to Hub, which routes to the physician's notification queue in OPD-Lite.
    - Optionally generate a patient notification (simplified, plain-language) via Hub to Patient-Lite.
  - [ ] Reminder throttling: do not re-send a reminder for the same flag within 48 hours.
  - [ ] Track `reminderSentAt` on the flag to enforce throttling.
  - [ ] Audit-log: `MONITORING_REMINDER_SENT` with destination (physician/patient), `patientRef` (opaque).

- [ ] **Task 7: Monitoring Detail View** (AC: 5, 7)
  - [ ] Create `apps/lab-lite/src/components/patients/MonitoringHistory.tsx`.
  - [ ] Show all monitoring flags for a given patient, grouped by medication.
  - [ ] For each medication: list required tests, current status, last completed date, next due date, completion history.
  - [ ] Link to result detail when a completed test has a linked DiagnosticReport.

- [ ] **Task 8: Tests** (AC: 1-10)
  - [ ] Unit tests for medication-lab mapping lookups — verify all mappings return correct tests and frequencies.
  - [ ] Unit tests for status lifecycle transitions — all state transitions including edge cases (e.g., test completed same day as due, multiple tests for same medication).
  - [ ] Unit tests for dispense receiver — verify flag creation, deduplication, data minimization enforcement.
  - [ ] Unit tests for reminder generator — verify throttling (no re-send within 48h), correct payload structure.
  - [ ] Integration test: simulate dispensing event -> flag creation -> result authorization -> flag completion -> next due date calculation.
  - [ ] Test that monitoring flag payloads contain NO diagnosis, NO DOB, NO prescriber name — only opaque refs and first name + age.
  - [ ] RTL snapshot test for MonitoringDueCard component.
  - [ ] Offline test: verify dashboard renders from Dexie cache when Hub is unreachable.

## Dev Notes

### Medication-to-Lab-Test Mapping — Clinical Source

The mapping table is a clinically validated, physician-curated reference. It is NOT AI-generated. The initial set covers the most commonly monitored medications in MENA primary care settings. The mapping should be:

1. **Bundled offline** — the mapping ships with the PWA as a static TypeScript module.
2. **Hub-updateable** — the Hub can push updated mappings (new medications, changed frequencies) which override the bundled defaults. Updates stored in Dexie.
3. **Versioned** — each mapping entry has a version stamp so updates can be tracked.

### Data Flow

```
Pharmacy-Lite                    Hub                         Lab-Lite
  |                               |                           |
  | dispenses Warfarin            |                           |
  | enqueue MedicationDispense    |                           |
  |------- sync ----------------->|                           |
  |                               | lookup: Warfarin needs    |
  |                               | INR monitoring            |
  |                               | build monitoring payload  |
  |                               |------- push ------------->|
  |                               |                           | receive payload
  |                               |                           | lookup mapping
  |                               |                           | create MonitoringFlag
  |                               |                           | dashboard shows "INR due"
  |                               |                           |
  |                               |                 (patient returns for INR)
  |                               |                           | result authorized
  |                               |                           | flag -> completed
  |                               |                           | calculate next due date
```

**Design decision:** The mapping lookup happens at Lab-Lite (not Hub) because Lab-Lite needs the mapping offline anyway. The Hub pushes the raw dispensing event; Lab-Lite determines what monitoring is needed. This keeps the Hub lightweight and allows Lab-Lite to function with its bundled mapping even when the Hub mapping update is unavailable.

### Data Minimization

Lab-Lite receives a **monitoring-specific projection** of the `MedicationDispense`, not the full FHIR resource. The projection strips:

- Prescriber name (replaced with opaque `orderingPractitionerRef`)
- Patient DOB (replaced with computed `age`)
- Patient full name (only `firstName`)
- Diagnosis / indication
- Prescription details beyond medication code and name
- Dosage instructions (not relevant for lab monitoring scheduling)

This aligns with CLAUDE.md Rule #7: Lab Portal sees only patient name + age.

### Sync Priority

Monitoring flags are operational data, not safety-critical. They sync at priority 5 (same as Observation/Appointment in `sync-priority.ts`). However, overdue reminders to physicians route through the Hub notification system which has its own priority handling.

### Relationship to Existing Upload Queue

The monitoring pipeline does NOT use the existing upload queue (`apps/lab-lite/src/lib/upload-queue-worker.ts`). That queue handles binary file uploads. Monitoring flags are received via the sync engine and stored directly in Dexie. Outbound reminders are enqueued via `enqueueSyncAction()` from `packages/sync-engine/src/enqueue.ts`.

### FHIR Alignment

The inbound dispensing event maps to FHIR `MedicationDispense` (defined in `packages/shared-types/src/fhir/medication-dispense.schema.ts`). The monitoring flag itself is a Lab-Lite-internal construct — it does not map to a FHIR resource directly. If a FHIR representation is needed in the future, `ServiceRequest` with `intent: 'plan'` and a monitoring category would be the closest fit.

### Hub API Endpoint (Future — Hub-Side Work)

The Hub needs an endpoint or sync handler that:
1. Receives `MedicationDispense` events from Pharmacy-Lite.
2. Identifies the patient's assigned lab(s).
3. Pushes a `DispenseMonitoringPayload` to each relevant Lab-Lite instance.

This Hub-side work is outside Lab-Lite's scope but must be coordinated. For initial implementation, Lab-Lite should expose a handler that can process the payload regardless of delivery mechanism (push notification, sync pull, or manual import).

## Project Structure Notes

### New Files
- `apps/lab-lite/src/lib/monitoring/medication-lab-map.ts` — mapping table
- `apps/lab-lite/src/lib/monitoring/dispense-receiver.ts` — inbound event handler
- `apps/lab-lite/src/lib/monitoring/status-lifecycle.ts` — flag status transitions
- `apps/lab-lite/src/lib/monitoring/reminder-generator.ts` — overdue reminder pipeline
- `apps/lab-lite/src/components/dashboard/MonitoringDueCard.tsx` — dashboard card
- `apps/lab-lite/src/components/patients/MonitoringHistory.tsx` — patient monitoring detail
- `apps/lab-lite/src/__tests__/monitoring-flags.test.ts` — unit tests
- `apps/lab-lite/src/__tests__/monitoring-lifecycle.test.ts` — lifecycle tests
- `apps/lab-lite/src/__tests__/monitoring-reminders.test.ts` — reminder tests

### Modified Files
- `apps/lab-lite/src/lib/db.ts` — add `monitoringFlags` Dexie table (schema version increment)
- `apps/lab-lite/src/components/dashboard/` — integrate MonitoringDueCard into dashboard layout

### Dependencies
- `packages/sync-engine/src/enqueue.ts` — for outbound reminder sync
- `packages/shared-types/src/fhir/medication-dispense.schema.ts` — inbound event schema reference
- `packages/audit-logger/` — audit event emission

## References

- FHIR R4 MedicationDispense: https://hl7.org/fhir/R4/medicationdispense.html
- FHIR R4 ServiceRequest: https://hl7.org/fhir/R4/servicerequest.html
- CLAUDE.md Rule #7 (Lab Portal data minimization)
- CLAUDE.md Rule #6 (audit every PHI access)
- Story 42.5 (result authorization — hook for monitoring completion)
- Story 42.6 (write-once distribute-many — result delivery back to OPD/Patient)
- Epic 40 (Pharmacy-Lite inventory/POS — source of dispensing events)
- `packages/sync-engine/src/sync-priority.ts` — sync priority definitions
