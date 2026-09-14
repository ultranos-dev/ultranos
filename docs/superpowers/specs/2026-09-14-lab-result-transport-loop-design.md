# Lab Result Transport Loop — Design

**Date:** 2026-09-14
**Status:** Draft — awaiting review
**Author:** Claude (with Ultranos Dev)

## Goal

Close the structured lab-result loop so a result entered in **Lab-Lite** reaches the **Hub** and is visible — with per-analyte structured values, reference ranges, and flags — to the ordering physician in **OPD-Lite**.

## Problem (verified end-to-end)

The loop is **unwired at every tier**, not merely missing one endpoint. Verified against source:

| Tier | Finding | Evidence |
|------|---------|----------|
| **Producer** | `mapResultToFhirBundle` correctly builds `{ diagnosticReport, observations[] }` with structured values (LOINC, `valueQuantity`, interpretation flags). `handleSave` enqueues it to `syncQueue` as `resourceType:'DiagnosticReport'` — but **nothing drains those entries.** | `apps/lab-lite/src/lib/result-to-fhir.ts:78-81`; `.../results/[sampleId]/enter/page.tsx:244-249` |
| **Producer (dead code)** | `distribution/` drain worker is **never wired** in the app (`enqueueSyncFn` never provided → throws), and its OPD projection is **report-level only** (no observations). `authorization-sync.ts` is **dead code** POSTing to the **nonexistent** `lab.authorizeResult` / `lab.createNotification`. | `apps/lab-lite/src/lib/distribution/drain-worker.ts:206-209`; `projections.ts:41-71`; `authorization-sync.ts:42,112` |
| **Hub** | Only `uploadResult` writes `diagnostic_reports` (file path; **no** observations). `sync.push` cannot persist a `DiagnosticReport` (absent from `RESOURCE_TABLE_MAP`, no `flattenDiagnosticReport`). The `observations` table is keyed by **bare patient UUID** with **no `diagnostic_report_id` FK**; `diagnostic_reports.patient_ref` is a **blind HMAC index**. No `lab.authorizeResult` exists. | `apps/hub-api/src/trpc/routers/lab.ts:657` (uploadResult); `sync.ts:21-49,221`; `resource-mappers.ts:154-174` (flattenObservation); `migrations/007_diagnostic_reports.sql:12-28` |
| **Reader (OPD)** | Lab UI reads **only** `db.diagnosticReports`. It never reads `db.observations` for analytes — it **regex-extracts numbers from the `conclusion` text** to draw trends. | `apps/opd-lite/src/lib/trpc.ts:416-454`; `lib/lab-results/result-grouper.ts:125-146` |

### The linchpin constraint (Rule #7)

The lab only ever holds the patient's **opaque blind HMAC ref**, never the real UUID. The **report** path already uses that blind ref as its join key end-to-end (lab stores it as `patient_ref` → Hub matches `encounters.patient_ref` by it → OPD queries with the real `Patient/<id>` which the Hub blind-indexes via `patientBlindRef()` to match). The shared `observations` table is keyed by **real UUID**, so lab-authored analytes **cannot** be written there. They must hang off the report.

## Design

Three coordinated parts. Data flow:

```
Lab-Lite result entry
  → handleSave builds LabFhirBundle → syncQueue (resourceType='DiagnosticReport')   [exists]
  → [NEW] result-sync drain worker POSTs bundle to Hub lab.submitResult
Hub lab.submitResult
  → upsert diagnostic_reports row (blind-ref keyed; reuse uploadResult write + dispatchResultNotifications)
  → [NEW] insert analytes into diagnostic_report_observations (FK diagnostic_report_id)
OPD-Lite
  → diagnosticReport.listByPatient (report metadata; existing)
  → diagnosticReport.read [EXTENDED] returns analytes
  → [CHANGED] LabReportDetail / result-grouper render structured values instead of regex-from-conclusion
```

### Part 1 — Hub: `lab.submitResult` + analyte storage

**New migration** `NNN_diagnostic_report_observations.sql` — child table mirroring the `lab_result_files` pattern:

```sql
CREATE TABLE IF NOT EXISTS diagnostic_report_observations (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  diagnostic_report_id UUID NOT NULL REFERENCES diagnostic_reports(id) ON DELETE CASCADE,
  loinc_code           TEXT NOT NULL,
  loinc_display        TEXT,
  value_quantity       JSONB,          -- { value, unit, system?, code? }
  value_string         TEXT,           -- encrypted if PHI-bearing free text
  interpretation       JSONB,          -- FHIR interpretation coding (abnormal flags)
  reference_range      JSONB,          -- { low?, high?, text? } from _ultranos.referenceRange
  note                 JSONB,          -- [{ text }]
  observation_id       UUID NOT NULL,  -- the client-generated Observation.id (idempotency)
  effective_date_time  TIMESTAMPTZ,
  _ultranos_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON diagnostic_report_observations (diagnostic_report_id);
CREATE UNIQUE INDEX ON diagnostic_report_observations (diagnostic_report_id, observation_id);
```

Rationale for a child table (vs. reusing `observations`): blind-ref-safe (no real patient UUID needed), clean report→analytes link the shared table lacks, and keeps lab analytes out of the UUID-keyed vitals stream.

**New procedure** `lab.submitResult` — `labRestrictedProcedure` with the same middleware chain as `uploadResult` (`enforceVerifiedOrg()` → `enforceEntitlement('LAB_LITE')` → `enforceLabActive()`):

- **Input:** the `LabFhirBundle` (`{ diagnosticReport, observations[] }`), with `observations[]._ultranos.referenceRange` optional (attached at runtime in Lab-Lite). Zod schema mirrors `result-to-fhir.ts` interfaces.
- **Behavior:**
  1. Resolve `lab_id` / `performer_id` from `ctx.lab` (as `uploadResult` does).
  2. Upsert `diagnostic_reports` by `diagnosticReport.id`: **preserve the bundle's status** (a completed result is `preliminary`; a draft `registered` → `preliminary`) — never force `final` (there is no verification/authorization gate yet). `loinc_code`/`loinc_display` from `code`, `patient_ref` = the bundle's blind subject ref stored **identically to `uploadResult`'s `patient_ref`** (see Risk R1), `issued`, `collection_date`, `report_conclusion` (encrypt if present via the field-encryption row wrapper). Idempotent on re-delivery (same `id`).
  3. Replace-then-insert analytes into `diagnostic_report_observations` for that `diagnostic_report_id` (delete existing rows for the report, insert current set) so re-delivery/edits converge.
  4. Fire-and-forget `dispatchResultNotifications(ctx.supabase, {...})` (existing helper) → `LAB_RESULT_AVAILABLE` to the ordering clinician + patient.
  5. Emit audit event (Rule #6): PHI write.
- **Output:** `{ diagnosticReportId, observationCount }`.

**Extend `diagnosticReport.read`** to include `observations: [...]` from `diagnostic_report_observations` (decrypt any PHI fields via `db.fromRow`). `listByPatient` stays report-level (data-minimized list).

### Part 2 — Lab-Lite: wire a real result-sync drain

Add a small drain worker (mirrors existing per-domain sync workers):

- Reads `syncQueue` where `resourceType='DiagnosticReport'` and `status='pending'`.
- POSTs the stored `payload` (the full `LabFhirBundle`) to `${getHubApiUrl()}/lab.submitResult`.
- On success → `status='synced'`; on failure → increment `retryCount`, set `lastAttemptAt`, keep `pending` (fields already exist on `SyncQueueEntry`). Bounded retries with backoff.
- Started from `SyncProvider` (online + interval trigger), alongside the existing sync wiring.

Leave the dead `distribution/` and `authorization-sync.ts` code untouched (out of scope; the syncQueue bundle path already carries observations, which the report-only distribution projection does not).

### Part 3 — OPD-Lite: read + render structured values

- Extend `LocalDiagnosticReport` (`apps/opd-lite/src/lib/db.ts`) + `mapHubReportToFhir` (`lib/trpc.ts`) to carry `result` analytes fetched via `diagnosticReport.read` (value · unit · ref range · flag · LOINC).
- Add `fetchDiagnosticReportDetail(id, patientRef)` calling `diagnosticReport.read`; cache analytes in a **new linked encrypted Dexie store `diagnosticReportObservations`** (mirrors the Hub child table, keyed by report id) — keeps list-metadata separate from detail data.
- Replace the regex-from-conclusion extraction in `result-grouper.ts` with real `valueQuantity` values when analytes are present (keep regex as fallback for legacy file-only reports).
- Render an analyte table (value · unit · reference range · flag) in `LabReportDetail.tsx`; drive `ResultTrendChart` / `PatientResultTimeline` from structured values.

## PHI / Safety / Conflict tier

- **Rule #7:** the endpoint stores only the blind ref; analytes carry LOINC + values, no patient identity. No National ID, no real UUID crosses the lab boundary.
- **Rule #6:** `submitResult` and the extended `read` emit audit events.
- **Rule #1:** no PHI in logs; error paths log shape only.
- **Conflict tier:** lab results are **Tier 2 (Clinical)** — timestamp merge, newer wins, both kept as addenda. New reports are append; corrections use the existing amendment flow (`amendment-service.ts`) and are out of scope here. `submitResult`'s replace-then-insert is scoped to a single report id (idempotent re-delivery), not cross-device merge.

## Risks

- **R1 (correctness-critical): join-key match.** `diagnostic_reports.patient_ref` must be the *exact* blind HMAC that OPD's `diagnosticReport.listByPatient` computes via `patientBlindRef(Patient/<realId>)`. Confirm the bundle's `subject.reference` normalization (prefix handling) matches `uploadResult`'s `patient_ref` and `lib/patient-ref` during implementation, with a test asserting a lab-submitted report is retrievable by the OPD query for the same patient.
- **R2:** `referenceRange` lives only in `_ultranos.referenceRange` at runtime — the input schema and `mapResultToFhirBundle`/`handleSave` snapshot code must agree.
- **R3:** re-delivery idempotency — dedupe on `diagnosticReport.id` (report) and `(diagnostic_report_id, observation_id)` (analytes).

## Testing

- Hub: `submitResult` writes report + analytes; idempotent re-delivery; RBAC (non-lab rejected); notification dispatched; audit emitted; **R1 round-trip** (submit → `listByPatient`/`read` returns it for the real patient). Rule #7: no real UUID / National ID in any response.
- Lab-Lite: drain posts pending `DiagnosticReport` entries, marks synced, retries on failure, offline-safe (queue survives reload).
- OPD: `read` analytes render as a value/unit/range/flag table; trend chart uses structured values; legacy file-only reports still render.
- Offline integration: disconnect mid-submit → queue persists → drains on reconnect.

## Out of scope

- Result amendments/corrections (existing `amendment-service` flow).
- Reviving `distribution/` or `authorization-sync.ts` dead code.
- Patient-Lite delivery.
- File/photo attachments (already handled by `uploadResult` / `uploadSpecimenFile`).

## Resolved decisions

1. **Report status:** preserve the bundle's status — a completed result is stored `preliminary`, never force `final` (no verification/authorization gate exists yet; revisit when one is built).
2. **OPD analyte cache:** new linked encrypted Dexie store `diagnosticReportObservations`, mirroring the Hub child table (keyed by report id).
