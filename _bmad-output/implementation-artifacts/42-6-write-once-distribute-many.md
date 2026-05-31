# Story 42.6: Write-Once, Distribute-Many Result Delivery

Status: draft

## Story

As a lab technician,
I want to enter a result once and have it automatically distributed to all relevant systems,
So that I eliminate triple-copy transcription to doctor, patient record, logbook, and monthly statistics.

## Context

Today, lab results entered in Lab-Lite exist in a single location. Once a result is authorized and released (Story 42.5), it must fan out to four distinct destinations — each with different data minimization requirements. This story builds the distribution engine that sits between Story 42.5's authorization release event and the downstream consumers.

Lab-Lite is a push-only, data-minimized spoke. It must never accumulate clinical data beyond what it needs for its own operations. The distribution engine queues outbound deliveries, not inbound data.

**PRD Requirements:** FR42 (write-once distribute-many)
**Depends on:** Story 42.4 (structured result templates), Story 42.5 (authorization workflow), Story 42.8 (digital logbook schema)
**Consumed by:** OPD-Lite (Epic 20 — Lab Results Viewer), Patient-Lite Mobile (Epic 18 — Health Passport), Story 42.8 (logbook), Story 50 (reporting/surveillance)

## Acceptance Criteria

1. [ ] When a result is authorized and released (Story 42.5), the distribution engine is triggered automatically.
2. [ ] The result is delivered as a FHIR DiagnosticReport to OPD-Lite, embedded in the patient encounter timeline.
3. [ ] The result is made available in Patient-Lite for the patient health passport view, with a simplified projection (no performer details, no internal annotations).
4. [ ] The result is appended to the digital lab logbook (Story 42.8) as an append-only entry.
5. [ ] The result is counted in the monthly statistics aggregation counters.
6. [ ] Each destination receives only the data its minimization rules allow — no destination receives more than its permitted field set.
7. [ ] If any destination is unreachable (offline, Hub down, network error), the delivery is queued locally in Dexie and retried automatically when connectivity is restored.
8. [ ] Distribution status is tracked per-destination — partial delivery (e.g., logbook succeeded but Hub sync failed) is visible to the tech.
9. [ ] All distribution actions are audit-logged with destination, outcome, and timestamp.
10. [ ] Critical/abnormal results are distributed with priority flag so downstream consumers can surface them prominently.

## Tasks / Subtasks

- [ ] **Task 1: Distribution Event Trigger** (AC: 1)
  - [ ] Define `ResultReleasedEvent` interface: `{ reportId, sampleId, patientRef, authorizedBy, authorizedAt, resultData, templateVersion, flagLevel }`
  - [ ] Hook into Story 42.5's authorization release — when status transitions to `released`, emit the event to the distribution engine.
  - [ ] Gate: distribution MUST NOT fire unless `status === 'released'` and `authorizedBy` is set. Reject `preliminary` or `entered-in-error` statuses.

- [ ] **Task 2: Distribution Projection Builder** (AC: 2, 3, 5, 6)
  - [ ] Create `apps/lab-lite/src/lib/distribution/projections.ts`.
  - [ ] Implement four projection functions, each producing a destination-specific payload:
    - [ ] `buildOpdProjection()` — Full FHIR DiagnosticReport (see Dev Notes for structure).
    - [ ] `buildPatientProjection()` — Simplified view: test name, result summary, flag level, date. No performer, no annotations, no internal IDs.
    - [ ] `buildLogbookProjection()` — MoPH register columns: sequential number, date, patient reference, test type, result summary, technician ID, authorization status. (Consumed by Story 42.8.)
    - [ ] `buildStatsProjection()` — Aggregate-only: test category LOINC code, flag level (normal/abnormal/critical), date, turnaround time. No patient reference, no result values.
  - [ ] Each projection function validates its output against an allow-list of fields — any field not in the allow-list is stripped with a warning log (shape only, no PHI).

- [ ] **Task 3: Distribution Queue (Dexie)** (AC: 7, 8)
  - [ ] Add `distributionQueue` table to `apps/lab-lite/src/lib/db.ts` (Dexie v4 schema migration).
  - [ ] Schema: `id` (auto-increment), `reportId`, `destination` (enum: `OPD_LITE` | `PATIENT_LITE` | `LOGBOOK` | `STATS`), `payload` (JSON string), `status` (`pending` | `delivering` | `delivered` | `failed`), `retryCount`, `lastAttemptAt`, `createdAt`, `priority` (number — lower = higher priority).
  - [ ] Index on `[status+priority]` for efficient drain ordering.
  - [ ] Queue limit: 200 items per destination (800 total). Reject with clear error when full.

- [ ] **Task 4: Distribution Orchestrator** (AC: 1, 2, 3, 4, 5, 7, 10)
  - [ ] Create `apps/lab-lite/src/lib/distribution/orchestrator.ts`.
  - [ ] On `ResultReleasedEvent`: build all four projections, enqueue each as a separate distribution queue entry.
  - [ ] Priority assignment: critical results get priority 1, abnormal get priority 2, normal get priority 3.
  - [ ] Logbook and stats projections are processed locally (Dexie writes) — they do not require Hub connectivity.
  - [ ] OPD-Lite and Patient-Lite projections are synced to Hub via the sync engine (`packages/sync-engine`).
  - [ ] Emit audit event for each enqueue: `DISTRIBUTION_ENQUEUED` with destination, reportId, priority.

- [ ] **Task 5: Distribution Drain Worker** (AC: 7, 8, 9)
  - [ ] Create `apps/lab-lite/src/lib/distribution/drain-worker.ts`.
  - [ ] Modeled after `apps/lab-lite/src/lib/upload-queue-worker.ts` — same backoff pattern (1s, 4s, 16s), max 5 retries.
  - [ ] Drain pending items in priority order (critical first), then FIFO within same priority.
  - [ ] For `LOGBOOK` destination: write to local Dexie logbook table (Story 42.8). Always succeeds locally.
  - [ ] For `STATS` destination: increment local Dexie stats counters. Always succeeds locally.
  - [ ] For `OPD_LITE` destination: enqueue a sync action via `enqueueSyncAction()` from `packages/sync-engine/src/enqueue.ts` with `resourceType: 'DiagnosticReport'` (sync priority 3).
  - [ ] For `PATIENT_LITE` destination: enqueue a sync action via `enqueueSyncAction()` with a dedicated resource type `DiagnosticReport:PatientView` or use the Hub API notification endpoint to push to the patient's notification queue.
  - [ ] Listen for `online` event + periodic polling (30s) when online.
  - [ ] Emit audit events: `DISTRIBUTION_DELIVERED`, `DISTRIBUTION_FAILED` per item.

- [ ] **Task 6: Distribution Status UI** (AC: 8)
  - [ ] Add a "Distribution Status" section to the result detail view.
  - [ ] Show 4 destination rows with status badges: Pending (yellow), Delivered (green), Failed (red).
  - [ ] Failed items show retry count and a manual "Retry" button.
  - [ ] Use polling (5s) to refresh status while any destination is pending.

- [ ] **Task 7: Audit Logging** (AC: 9)
  - [ ] Audit events: `DISTRIBUTION_ENQUEUED`, `DISTRIBUTION_DELIVERED`, `DISTRIBUTION_FAILED`, `DISTRIBUTION_RETRY`.
  - [ ] Each event includes: `reportId`, `destination`, `actorId` (technician or system), `timestamp`, `priority`.
  - [ ] Emit via the lab-lite audit pattern (fire-and-forget to Hub, local fallback).

- [ ] **Task 8: Tests** (AC: 1-10)
  - [ ] Unit tests for each projection builder — verify field allow-lists are enforced and no extra fields leak.
  - [ ] Unit tests for orchestrator — verify all 4 destinations are enqueued on release, none on non-release status.
  - [ ] Unit tests for drain worker — verify priority ordering, backoff, retry limits.
  - [ ] Integration test: simulate offline during distribution, verify queue persistence and drain on reconnect.
  - [ ] Test that stats projection contains zero PHI (no patient ref, no result values).
  - [ ] Test that patient projection contains no performer or annotation data.

## Dev Notes

### The Four Distribution Targets

| # | Destination | Delivery Mechanism | Sync Priority | Data Minimization |
|---|-------------|-------------------|---------------|-------------------|
| 1 | **OPD-Lite** (DiagnosticReport) | Sync engine -> Hub -> OPD-Lite pull | Priority 3 (same as lab notifications in `sync-priority.ts`) | Full FHIR DiagnosticReport: all clinical fields, performer, result references, annotations. Subject reference is opaque `patientRef`. |
| 2 | **Patient-Lite** (Health Passport) | Hub API notification / sync | Priority 3 | Simplified: test display name, result summary text, flag level, issued date. NO performer identity, NO internal annotations, NO raw observation references. |
| 3 | **Digital Logbook** (Story 42.8) | Local Dexie write | Immediate (local) | MoPH register columns: sequential number, date, patient first name + age (already cached from verification), test type display, result summary, technician ID, authorization status. Append-only. |
| 4 | **Monthly Stats** (Story 50) | Local Dexie counter increment | Immediate (local) | Aggregate only: LOINC category code, normal/abnormal/critical flag, date, turnaround time (received-to-released delta). ZERO patient identifiers. ZERO result values. |

### Data Minimization Per Destination

This is the critical safety aspect of this story. Each projection function MUST strip fields not in its allow-list.

**OPD-Lite projection (full clinical):**
```typescript
interface OpdProjection {
  // Standard FHIR DiagnosticReport fields
  id: string                          // report UUID
  resourceType: 'DiagnosticReport'
  status: 'final' | 'amended' | 'corrected'
  code: CodeableConcept               // test type (LOINC)
  category: CodeableConcept[]         // lab category
  subject: Reference                  // opaque patientRef — NOT name/DOB
  encounter?: Reference               // linked OPD encounter if available
  effectiveDateTime: string           // specimen collection time
  issued: string                      // authorization timestamp
  performer: Reference[]              // lab + authorizing supervisor
  result: Reference[]                 // linked Observation resources
  conclusion?: string                 // narrative summary
  presentedForm?: Attachment[]        // PDF/image if file-based result
  _ultranos: {
    createdAt: string
    hlcTimestamp: string
    isOfflineCreated: boolean
    labId: string
    templateVersion: string           // which result template was used
    flagLevel: 'normal' | 'abnormal' | 'critical'
    sampleId: string                  // LAB-YYYYMMDD-NNNN
  }
  meta: FhirMeta
}
```

**Patient-Lite projection (simplified, privacy-safe):**
```typescript
interface PatientProjection {
  reportId: string
  testName: string                    // human-readable display name
  resultSummary: string               // "Normal" / "Hemoglobin: 12.5 g/dL (Normal)"
  flagLevel: 'normal' | 'abnormal' | 'critical'
  issuedDate: string                  // date only, no time
  labName?: string                    // facility name, not individual tech
  // NO performer identity
  // NO annotations or comments
  // NO observation references
  // NO raw numeric values beyond summary
}
```

**Logbook projection (MoPH register columns):**
```typescript
interface LogbookProjection {
  sequentialNumber: number            // auto-incrementing per lab
  date: string                        // ISO date
  patientRef: string                  // first name + age (already minimized)
  testType: string                    // LOINC display name
  resultSummary: string               // abbreviated result text
  technicianId: string                // who entered
  authorizationStatus: string         // 'authorized' + authorizer ID
  sampleId: string                    // LAB-YYYYMMDD-NNNN
}
```

**Stats projection (zero PHI):**
```typescript
interface StatsProjection {
  loincCode: string                   // test category code
  flagLevel: 'normal' | 'abnormal' | 'critical'
  date: string                        // ISO date
  turnaroundMinutes: number           // received-to-released delta
  // ZERO patient identifiers
  // ZERO result values
  // ZERO technician identity
}
```

### FHIR DiagnosticReport Structure

The existing schema at `packages/shared-types/src/fhir/diagnostic-report.schema.ts` defines the base `FhirDiagnosticReport` type. Story 42.6 extends the `_ultranos` namespace with additional fields needed for distribution:

- `templateVersion: string` — links to the result template used (Story 42.4)
- `flagLevel: 'normal' | 'abnormal' | 'critical'` — aggregated flag from individual observations
- `sampleId: string` — chain of custody reference (Story 42.3)

These extensions should be added to `DiagnosticReportUltranosExtSchema` in the shared-types package as optional fields (backward compatible with existing reports from Story 12.x).

### Sync Priority Ordering

From `packages/sync-engine/src/sync-priority.ts`, `DiagnosticReport` has sync priority **3** — same tier as `MedicationDispense`. This means lab results sync after allergies/consent (1) and prescriptions (2), but before encounters/notes (4), vitals (5), and demographics (6).

For critical results (flagLevel === 'critical'), the distribution engine should set priority 1 on the distribution queue entry (internal to Lab-Lite's distribution queue), but the sync engine priority remains 3 for the Hub sync. Critical value escalation via notifications (Story 42.5 AC: released results flow to ordering physician) handles the urgency at the notification layer, not the sync layer.

### Hooking Into Story 42.5 Authorization Release

Story 42.5 defines the authorization workflow with three outcomes: approve (release), reject, hold. The distribution engine hooks into the **approve** path only:

1. Supervisor taps "Approve" on a pending result.
2. Story 42.5 transitions the result status to `released` and audit-logs the authorization.
3. Story 42.5 emits a `ResultReleasedEvent` (or calls a callback/hook).
4. **This story's orchestrator** receives the event, builds four projections, enqueues them.
5. The distribution drain worker processes each queue entry independently.

The coupling point is intentionally loose — Story 42.5 should expose either:
- **Option A (recommended):** A callback hook in the authorization function: `onRelease?: (event: ResultReleasedEvent) => Promise<void>`. The distribution orchestrator registers as the handler.
- **Option B:** A Dexie-observable or event emitter pattern where the orchestrator watches for status changes on results.

Option A is recommended because it is explicit, testable, and avoids polling overhead.

### Offline Queuing of Distributions

The distribution queue is separate from both the upload queue (`apps/lab-lite/src/lib/upload-queue-worker.ts`) and the generic sync queue (`packages/sync-engine`). This separation exists because:

1. **Different payload types** — The upload queue handles binary files (Blob). The sync queue handles FHIR JSON. The distribution queue handles projection-specific payloads that are neither raw files nor standard FHIR resources.
2. **Multiple destinations per event** — A single authorization release produces 4 queue entries. The sync queue is designed for 1:1 resource-to-entry mapping.
3. **Local-only destinations** — Logbook and stats writes are local Dexie operations that never need Hub connectivity. They should not occupy sync queue slots.

The flow for Hub-bound destinations (OPD-Lite, Patient-Lite):
```
ResultReleasedEvent
  -> orchestrator builds projection
  -> distribution queue entry created (Dexie)
  -> drain worker picks up entry
  -> drain worker calls enqueueSyncAction() from sync-engine
  -> sync engine handles retry, backoff, conflict resolution
  -> on sync success: distribution queue entry marked 'delivered'
```

This means the distribution queue is a **staging queue** that feeds into the sync engine. It does not replace the sync engine — it orchestrates which projections enter it.

### Conflict Resolution

DiagnosticReport is classified as **TIER_2 (Clinical)** in `packages/sync-engine/src/conflict-tiers.ts`. This means:
- Timestamp-based merge: newer HLC wins
- Both versions kept as addenda
- No prescription blocking

This is appropriate for lab results — if two versions of the same DiagnosticReport conflict (e.g., an amendment was made offline while the original was syncing), the newer version wins but the original is preserved as an addendum.

### Relationship to Existing Upload Queue

The existing upload queue (`apps/lab-lite/src/lib/upload-queue-worker.ts`) handles **file uploads** for Story 12.x — raw PDF/image files uploaded by the tech before structured result entry existed. Story 42.6's distribution engine handles **structured result delivery** after authorization. These are distinct workflows:

| Aspect | Upload Queue (Story 12.5) | Distribution Queue (Story 42.6) |
|--------|--------------------------|-------------------------------|
| Trigger | Tech uploads a file | Supervisor authorizes a result |
| Payload | Binary file (Blob) + metadata | FHIR DiagnosticReport projections (JSON) |
| Destinations | Hub API (single) | 4 destinations (Hub + local) |
| Queue storage | Dexie `uploadQueue` table | Dexie `distributionQueue` table |
| Retry | 3 retries, exponential backoff | 5 retries, exponential backoff |
| Expiry | 48 hours | No expiry (results must eventually deliver) |

### Monthly Statistics Schema

The stats projection writes to a local Dexie counter table. Suggested schema for the `labStats` table:

```typescript
interface LabStatEntry {
  id?: number
  yearMonth: string        // "2026-05" — partition key
  loincCode: string        // test category
  flagLevel: string        // normal | abnormal | critical
  count: number            // increment per result
  totalTurnaroundMinutes: number  // sum for average calculation
}
// Compound index: [yearMonth+loincCode+flagLevel] for upsert
```

This table is consumed by Story 50 (Reporting & Surveillance Automation) for auto-compiled HMIS monthly reports.

### Security Considerations

- The distribution engine runs entirely in the Lab-Lite browser context. Projections are built client-side before being sent to the Hub.
- The OPD-Lite projection contains the most data — it is protected by the sync engine's JWT authentication and field-level encryption at the Hub.
- The Patient-Lite projection is deliberately sparse to minimize exposure if the patient's device is compromised.
- The stats projection contains zero PHI by design — it can be aggregated and exported without consent considerations.
- The logbook projection contains patient first name + age (already the maximum Lab-Lite is permitted to see per CLAUDE.md Rule #7). It is stored locally in Dexie with the same encryption posture as other Lab-Lite local data.
