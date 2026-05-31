# Story 43.2: QC-Result Temporal Binding

Status: draft

## Story

As a lab supervisor,
I want every patient result to be stamped with the QC status that was active at the time of processing,
So that I can prove QC was passing when any specific result was produced.

## Acceptance Criteria

1. **Given** a tech enters a patient result, **when** the result is saved, **then** the system records the most recent QC run for the relevant analyte/instrument: QC run ID, timestamp, result (pass/fail), control values, and whether it was within acceptable range
2. **And** this QC snapshot is immutably linked to the patient result
3. **And** if no QC has been run today for that analyte, the system shows a warning: "No QC recorded for [analyte] today -- run QC before releasing patient results"
4. **And** if QC was failing, the result is flagged: "QC advisory -- verify result"
5. **And** the temporal QC linkage is visible in the result detail view and audit trail

## Tasks / Subtasks

- [ ] Task 1: Define QC Run Dexie table and TypeScript interfaces (AC: #1, #2)
  - [ ] 1.1 Create `QcRun` interface in `apps/lab-lite/src/lib/db.ts`:
    ```typescript
    export interface QcRun {
      id: string             // UUID — primary key
      analyte: string        // LOINC code of the analyte being QC'd
      instrumentId: string   // identifier of the analyzer/instrument
      controlLevel: string   // e.g., 'L1', 'L2', 'L3' (low/normal/high control)
      controlValues: Record<string, number>  // measured values keyed by parameter name
      expectedRange: { low: number; high: number }  // acceptable range for the control
      passOrFail: 'PASS' | 'FAIL'
      timestamp: string      // HLC serialized timestamp (from hlc.ts)
      calendarDate: string   // ISO date YYYY-MM-DD for "today" lookups
      techId: string         // practitioner ID who ran QC
      metadata?: Record<string, unknown>  // optional: lot number, reagent batch, notes
    }
    ```
  - [ ] 1.2 Create `QcSnapshot` interface (the immutable binding attached to patient results):
    ```typescript
    export interface QcSnapshot {
      qcRunId: string        // FK to QcRun.id
      analyte: string
      instrumentId: string
      controlLevel: string
      passOrFail: 'PASS' | 'FAIL'
      controlValues: Record<string, number>
      expectedRange: { low: number; high: number }
      qcTimestamp: string    // HLC timestamp of the QC run (copied, not referenced)
      snapshotTakenAt: string  // HLC timestamp when snapshot was captured
    }
    ```
  - [ ] 1.3 Add `qcRuns` table to Dexie schema in `db.ts` — increment to version 4:
    ```typescript
    this.version(4).stores({
      uploadQueue: '++id, status, queuedAt',
      practitioner_keys: '&practitionerId, cachedAt',
      verified_patients: '&patientId, verifiedAt',
      patients: '&id, _ultranos.nameLocal, _ultranos.nameLatin, meta.lastUpdated',
      syncQueue: '&id, resourceType, resourceId, status, createdAt',
      qcRuns: '&id, analyte, instrumentId, calendarDate, [analyte+instrumentId+calendarDate], timestamp',
    })
    ```
  - [ ] 1.4 Add compound index `[analyte+instrumentId+calendarDate]` for efficient "most recent QC for this analyte today" queries

- [ ] Task 2: QC Run CRUD service (AC: #1)
  - [ ] 2.1 Create `apps/lab-lite/src/services/qc-run-service.ts` with:
    - `saveQcRun(run: QcRun): Promise<void>` — persist to Dexie, emit audit event
    - `getLatestQcRun(analyte: string, instrumentId: string): Promise<QcRun | undefined>` — most recent QC run for analyte/instrument regardless of date
    - `getTodayQcRun(analyte: string, instrumentId: string): Promise<QcRun | undefined>` — most recent QC run for today only
    - `getQcRunHistory(analyte: string, instrumentId: string, limit?: number): Promise<QcRun[]>` — ordered by timestamp desc, for history view and drift detection
  - [ ] 2.2 Audit event on QC run save: emit via `@ultranos/audit-logger/client` with `{ action: AuditAction.CREATE, resourceType: 'QC_RUN', resourceId: run.id }` — no PHI in metadata (QC data is operational, not patient data, but audit is still required for traceability)
  - [ ] 2.3 `calendarDate` is derived from `new Date().toISOString().slice(0, 10)` at save time, not from the HLC (HLC is for ordering, calendar date is for "has QC been run today" checks)

- [ ] Task 3: QC Snapshot capture mechanism (AC: #1, #2)
  - [ ] 3.1 Create `apps/lab-lite/src/services/qc-snapshot-service.ts` with:
    - `captureQcSnapshot(analyte: string, instrumentId: string): Promise<QcSnapshot | null>` — looks up latest QC run, deep-copies all values into a `QcSnapshot`, stamps `snapshotTakenAt` with current HLC. Returns `null` if no QC run exists.
  - [ ] 3.2 The snapshot is a **deep copy** of the QC run data, not a reference. This ensures immutability — if a QC run is later corrected, the snapshot preserves what was known at result-save time.
  - [ ] 3.3 Integrate snapshot capture into the result save flow (Story 42.4 result entry). When a patient result is saved:
    1. Call `captureQcSnapshot(analyte, instrumentId)`
    2. Attach the returned `QcSnapshot` to the result record (new field: `qcSnapshot: QcSnapshot | null`)
    3. If snapshot is `null`, set `qcWarning: 'NO_QC_TODAY'`
    4. If snapshot `passOrFail === 'FAIL'`, set `qcWarning: 'QC_FAILING'`
    5. The `qcSnapshot` and `qcWarning` fields are write-once — never updated after initial save
  - [ ] 3.4 Emit audit event for snapshot binding: `{ action: AuditAction.CREATE, resourceType: 'QC_SNAPSHOT', resourceId: resultId, metadata: { qcRunId, analyte, passOrFail, qcWarning } }`

- [ ] Task 4: "No QC today" warning UI (AC: #3)
  - [ ] 4.1 Create `apps/lab-lite/src/components/qc/QcWarningBanner.tsx`:
    - Accepts `analyte: string` and `instrumentId: string` props
    - On mount, calls `getTodayQcRun(analyte, instrumentId)`
    - If no QC run found today, renders amber warning banner: "No QC recorded for [analyte display name] today -- run QC before releasing patient results"
    - If QC run found but `passOrFail === 'FAIL'`, renders red warning: "QC advisory -- verify result. Last QC for [analyte] FAILED at [time]."
    - If QC passing, renders nothing (or a subtle green indicator)
  - [ ] 4.2 Mount `QcWarningBanner` in the result entry form (Story 42.4 template) — visible while the tech is entering values, before save
  - [ ] 4.3 Mount `QcWarningBanner` in the result authorization view (Story 42.5) — supervisor sees QC status before approving
  - [ ] 4.4 RTL support: use logical CSS properties (`margin-inline-start`, `padding-inline-end`). Warning icons do not mirror (medical/safety icons).

- [ ] Task 5: QC advisory flag on results (AC: #4)
  - [ ] 5.1 Add `qcWarning` field to the result data model: `'NO_QC_TODAY' | 'QC_FAILING' | null`
  - [ ] 5.2 In result list views, results with `qcWarning` display a badge:
    - `NO_QC_TODAY`: amber badge "No QC"
    - `QC_FAILING`: red badge "QC Advisory"
  - [ ] 5.3 In the result detail view, if `qcWarning` is set, display a prominent callout box:
    - `NO_QC_TODAY`: "This result was produced without a passing QC run on [date]. Run QC and verify before releasing."
    - `QC_FAILING`: "QC advisory -- this result was produced while QC was failing for [analyte]. Verify result accuracy before releasing."
  - [ ] 5.4 Auto-verification rules (Story 42.5) must check `qcWarning` — results with any `qcWarning` set are **never auto-verified** and always require manual supervisor authorization

- [ ] Task 6: QC History view component (AC: #5)
  - [ ] 6.1 Create `apps/lab-lite/src/components/qc/QcHistoryView.tsx`:
    - Accepts `analyte: string` and `instrumentId: string` props
    - Fetches QC run history via `getQcRunHistory(analyte, instrumentId)`
    - Renders a table/list: date, time, control level, measured values, expected range, pass/fail status, tech name
    - Levey-Jennings style trend visualization (simple line chart showing control values over time with +/- 2SD and 3SD lines) — can use a lightweight charting approach (SVG or canvas)
  - [ ] 6.2 Create `apps/lab-lite/src/components/qc/QcRunEntryForm.tsx`:
    - Form for entering a new QC run: analyte (dropdown from configured test menu), instrument (dropdown), control level, measured values, expected range (pre-filled from configuration if available)
    - Auto-calculates pass/fail based on whether measured values fall within expected range
    - Saves via `saveQcRun()` — triggers audit event
    - After save, refreshes any mounted `QcWarningBanner` components
  - [ ] 6.3 Create route `apps/lab-lite/src/app/[locale]/qc/page.tsx` — QC dashboard with:
    - QC run entry form (Task 6.2)
    - QC history view per analyte/instrument (Task 6.1)
    - Today's QC status summary (all analytes: which have passing QC, which are missing, which are failing)
  - [ ] 6.4 Add QC navigation item to `AppSidebar.tsx` — icon: beaker/flask, label: i18n key `sidebar.qc`

- [ ] Task 7: Result detail view — QC linkage display (AC: #5)
  - [ ] 7.1 In the result detail view, add a "QC Status at Time of Processing" section:
    - If `qcSnapshot` exists: show QC run ID, QC timestamp, control level, measured values, expected range, pass/fail
    - If `qcSnapshot` is null: show "No QC data recorded for this result"
    - Link to the full QC history for that analyte/instrument
  - [ ] 7.2 The QC snapshot section is read-only — no edit controls. The snapshot is immutable.
  - [ ] 7.3 Include QC snapshot data in the audit trail view for the result (visible in Story 43.1 audit chain)

- [ ] Task 8: Integration hook for Story 43.6 (Drift Detection) (AC: #4)
  - [ ] 8.1 Export a function from `qc-run-service.ts`: `getRecentQcRuns(analyte: string, instrumentId: string, count: number): Promise<QcRun[]>` — returns the last N QC runs ordered by timestamp, for drift detection algorithms to consume
  - [ ] 8.2 Export a function: `isQcDriftWarningActive(analyte: string, instrumentId: string): Promise<boolean>` — stub that returns `false` for now; Story 43.6 will implement the drift detection logic
  - [ ] 8.3 In the snapshot capture (Task 3), also check `isQcDriftWarningActive()` — if `true`, set `qcWarning: 'QC_DRIFT'` on the result (additional warning level beyond PASS/FAIL)
  - [ ] 8.4 Add `'QC_DRIFT'` to the `qcWarning` union type and add corresponding UI treatment:
    - Orange badge "QC Drift" in result lists
    - Callout: "QC advisory -- produced during drift warning for [analyte]. Recommend recalibration."

- [ ] Task 9: Tests (AC: all)
  - [ ] 9.1 **QC Run CRUD:** save, retrieve latest, retrieve today, retrieve history — verify Dexie operations
  - [ ] 9.2 **QC Snapshot capture:** verify deep copy (mutating original QC run does not affect snapshot), verify null return when no QC exists, verify correct `passOrFail` propagation
  - [ ] 9.3 **QC warning derivation:** `null` QC snapshot -> `NO_QC_TODAY`, failing QC -> `QC_FAILING`, passing QC -> `null` warning, drift active -> `QC_DRIFT`
  - [ ] 9.4 **QcWarningBanner rendering:** snapshot tests for all warning states (no QC, QC failing, QC passing, QC drift) in both LTR and RTL
  - [ ] 9.5 **QC advisory badges:** verify badges render in result list for each warning type
  - [ ] 9.6 **Auto-verification block:** results with any `qcWarning` are never auto-verified (mock the authorization flow, assert manual review required)
  - [ ] 9.7 **Immutability:** verify `qcSnapshot` and `qcWarning` fields cannot be updated after initial save (attempt update, assert rejection or no-op)
  - [ ] 9.8 **QcHistoryView:** renders table with correct columns, handles empty state
  - [ ] 9.9 **QcRunEntryForm:** validates required fields, auto-calculates pass/fail, saves to Dexie
  - [ ] 9.10 **Audit events:** QC run save emits audit event, snapshot binding emits audit event, both with correct metadata and no PHI
  - [ ] 9.11 **Offline:** QC runs persist in Dexie and are available offline; snapshot capture works without network

## Dev Notes

### Dexie Schema Changes

The `qcRuns` table is added at version 4 (current is version 3). The compound index `[analyte+instrumentId+calendarDate]` enables the critical query: "What is the most recent QC run for hemoglobin on analyzer-01 today?" This must be a single indexed lookup, not a table scan, because it runs on every patient result save.

```typescript
// In apps/lab-lite/src/lib/db.ts
qcRuns!: Dexie.Table<QcRun, string>

this.version(4).stores({
  // ... existing tables unchanged ...
  qcRuns: '&id, analyte, instrumentId, calendarDate, [analyte+instrumentId+calendarDate], timestamp',
})
```

### QC Snapshot Architecture

The snapshot is intentionally denormalized. When a patient result is saved, the system:

1. Queries `qcRuns` for the latest run matching `(analyte, instrumentId)` — no date filter (we want the most recent QC regardless)
2. Deep-copies the QC run data into a `QcSnapshot` object
3. Attaches the snapshot directly to the patient result record

Why deep copy instead of FK reference?
- **Immutability:** If a QC run were later amended (unlikely but possible via admin correction), the snapshot preserves what was known at result-save time
- **Offline resilience:** No join needed at display time — the snapshot is self-contained
- **Legal defensibility:** The snapshot is a point-in-time attestation: "At the moment this result was saved, QC status was X"

```
Result Save Flow:
  Tech enters result values
    -> captureQcSnapshot(analyte, instrumentId)
      -> getLatestQcRun(analyte, instrumentId)
      -> Deep copy QC run fields into QcSnapshot
      -> Stamp snapshotTakenAt = hlc.now()
    -> Attach QcSnapshot to result record
    -> Derive qcWarning from snapshot state
    -> Save result (with snapshot + warning) to Dexie
    -> Emit audit events (result save + QC binding)
```

### "Today" Check Logic

The "No QC recorded today" warning uses `calendarDate` (ISO date string `YYYY-MM-DD`), not HLC timestamps. This is intentional:
- HLC timestamps are for causal ordering across distributed nodes
- "Has QC been run today?" is a calendar question, not a causality question
- The tech's local date determines "today" — no server round-trip needed
- Edge case: if the lab operates across midnight, the date boundary uses the local timezone

### QC Warning Priority

When multiple conditions apply, use the highest-severity warning:

| Priority | Warning | Color | Meaning |
|----------|---------|-------|---------|
| 1 (highest) | `QC_FAILING` | Red | Most recent QC run failed |
| 2 | `QC_DRIFT` | Orange | Drift detection triggered (Story 43.6) |
| 3 | `NO_QC_TODAY` | Amber | No QC run recorded today |
| -- | `null` | -- | QC passing, no issues |

### Integration Points

**Story 42.4 (Result Templates):** The result save handler must call `captureQcSnapshot()` before persisting. The `qcSnapshot` and `qcWarning` fields are added to the result data model.

**Story 42.5 (Authorization Workflow):** Auto-verification rules must check `qcWarning !== null` and block auto-release if any QC warning is active.

**Story 43.1 (Audit Chain):** QC snapshot binding produces an audit event that links to the result's audit chain. The `qcRunId` in the audit metadata creates a cross-reference between the result audit chain and the QC audit trail.

**Story 43.6 (Drift Detection):** Story 43.6 will implement the drift detection algorithms (Westgard rules) and call `isQcDriftWarningActive()`. The hook point is already prepared in this story:
- `getRecentQcRuns()` provides the data feed for drift algorithms
- `isQcDriftWarningActive()` is the query point for the snapshot capture flow
- `QC_DRIFT` warning type is pre-defined in the union type
- The QC history view (Task 6.1) with Levey-Jennings visualization is where drift alerts will be displayed

**Story 43.7 (Pre-Release Checklist):** The checklist item "QC passed today for this analyte" will query `getTodayQcRun()` to auto-check or flag the item.

### Audit Events

Two new audit event types:

1. **QC_RUN_CREATED:** Emitted when a tech saves a new QC run
   ```typescript
   {
     action: AuditAction.CREATE,
     resourceType: 'QC_RUN',  // may need to add to AuditResourceType enum
     resourceId: qcRun.id,
     metadata: { analyte, instrumentId, controlLevel, passOrFail, source: 'lab-lite' }
   }
   ```

2. **QC_SNAPSHOT_BOUND:** Emitted when a QC snapshot is attached to a patient result
   ```typescript
   {
     action: AuditAction.CREATE,
     resourceType: 'QC_SNAPSHOT',
     resourceId: resultId,
     metadata: { qcRunId, analyte, passOrFail, qcWarning, source: 'lab-lite' }
   }
   ```

Both use `@ultranos/audit-logger/client` via `emitClientAudit()` following the pattern in `apps/lab-lite/src/lib/audit-client.ts`. Neither event contains PHI — QC data is operational quality data, not patient data. The `resultId` in the snapshot event is an opaque ID (CLAUDE.md Rule #1).

### Data Minimization (CLAUDE.md Rule #7)

QC data is operational, not patient-specific. However, the `QcSnapshot` is attached to a patient result. The snapshot itself contains no patient identifiers — only QC run data (analyte, instrument, control values, pass/fail). The link to the patient is through the result record, not through the snapshot.

### Project Structure

**New files:**
- `apps/lab-lite/src/services/qc-run-service.ts` — QC run CRUD + snapshot capture
- `apps/lab-lite/src/services/qc-snapshot-service.ts` — snapshot capture logic
- `apps/lab-lite/src/components/qc/QcWarningBanner.tsx` — warning banner component
- `apps/lab-lite/src/components/qc/QcHistoryView.tsx` — QC history table + Levey-Jennings chart
- `apps/lab-lite/src/components/qc/QcRunEntryForm.tsx` — QC run entry form
- `apps/lab-lite/src/app/[locale]/qc/page.tsx` — QC dashboard page
- `apps/lab-lite/src/__tests__/qc-run-service.test.ts` — service tests
- `apps/lab-lite/src/__tests__/qc-snapshot.test.ts` — snapshot capture tests
- `apps/lab-lite/src/__tests__/qc-warning-banner.test.tsx` — component snapshot tests (LTR + RTL)
- `apps/lab-lite/src/__tests__/qc-history-view.test.tsx` — history view tests

**Modified files:**
- `apps/lab-lite/src/lib/db.ts` — add `QcRun` interface, `qcRuns` table (version 4), `QcSnapshot` interface
- `apps/lab-lite/src/lib/audit-client.ts` — add `reportQcAuditEvent()` helper
- `apps/lab-lite/src/components/AppSidebar.tsx` — add QC nav item
- Result entry form (Story 42.4) — integrate `QcWarningBanner` + snapshot capture on save
- Result authorization view (Story 42.5) — integrate `QcWarningBanner` + block auto-verify on qcWarning
- Result detail view — add QC snapshot display section
- Result list views — add QC advisory badges

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-43.2] — Story acceptance criteria
- [Source: _bmad-output/planning-artifacts/epics.md#Story-43.6] — Drift detection integration (downstream dependency)
- [Source: _bmad-output/planning-artifacts/epics.md#Story-42.4] — Result templates (upstream dependency for result save hook)
- [Source: _bmad-output/planning-artifacts/epics.md#Story-42.5] — Authorization workflow (upstream dependency for auto-verify block)
- [Source: _bmad-output/planning-artifacts/epics.md#Story-43.7] — Pre-release checklist (downstream consumer of QC status)
- [Source: apps/lab-lite/src/lib/db.ts] — Current Dexie schema (version 3)
- [Source: apps/lab-lite/src/lib/audit-client.ts] — Audit event emission pattern
- [Source: apps/lab-lite/src/lib/hlc.ts] — HLC singleton for timestamps
- [Source: CLAUDE.md#Rule-1] — No PHI in logs or metadata
- [Source: CLAUDE.md#Rule-6] — Audit every PHI access
- [Source: CLAUDE.md#Rule-7] — Lab portal data minimization
