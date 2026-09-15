# Lab-Lite Specimen → Hub Sync — Design Spec

- **Date:** 2026-09-14
- **Status:** Approved (design); pending implementation plan
- **Branch:** `feat/adaptive-sync-phase1`
- **Author:** Claude (with Ultranos Dev)

## 1. Problem

Collected samples in Lab-Lite are saved to local IndexedDB (`db.samples`) but
**never reach the Hub / Supabase**. `accessionSample` (and the status-transition
and rejection paths) enqueue a `Specimen` sync event into the Dexie `syncQueue`
table, but **nothing drains `Specimen` entries** to the Hub:

- `SyncProvider` starts only the file `uploadQueue` drain, the audit drain, and
  (recently) a `DiagnosticReport` result drain.
- The only other `syncQueue` readers (`authorization-sync.ts`) handle
  `notification` / `labResultAuthorization` types and are not wired in.

There is also **no Hub endpoint and no table** to receive a structured
`Specimen`. The generic `sync.push` router does not map `Specimen`, does not
grant `LAB_TECH` RBAC for it, and has none of Lab-Lite's data-minimization
guardrails.

### 1a. Load-bearing discovery — the queue `status` gap (also breaks results)

`enqueueSyncEvent` ([db.ts:1848](../../../apps/lab-lite/src/lib/db.ts)) stores
`{ id, ...entry }` **without defaulting `status`**. The `Specimen` and
`DiagnosticReport` call sites pass `{ resourceType, resourceId, payload,
hlcTimestamp }` — **no `status: 'pending'`** (and a stray `hlcTimestamp` that is
not a `SyncQueueEntry` field). Both drains filter `.filter(e => e.status ===
'pending')`, so real entries (whose `status` is `undefined`) are silently
skipped.

**Consequence:** the just-landed result drain (`drainResultSyncQueue`) is a
**no-op in production** — its unit test passes only because the fixture
hand-stamps `status: 'pending'`. Any specimen drain built the same way would be
dead on arrival for the identical reason.

## 2. Goals

- Collected specimens (create + every pipeline status change + rejection)
  reliably reach the Hub/Supabase via the **offline-first queue** (enqueue →
  background drain), never a blocking synchronous write.
- Fix the queue `status` gap at the root so **both** specimens and results
  drain.
- Enforce data-minimization (Rule #7) and PHI audit (Rule #6) at the Hub
  boundary.

## 3. Non-goals (explicitly deferred)

- **The local "disappear" display bugs** (the *original* symptom), which are
  independent of Hub sync:
  - `usePrioritizedWorklist.ts:108` silently drops any collected sample whose
    linked order row is missing (`if (!order) continue`).
  - `accessionSample` never advances the local order off `RECEIVED`, and
    `useOrderSync.ts:134` flips such orders to `CANCELLED` on the periodic full
    sync — degrading the order↔sample link over time.
  → Recommended as a **separate follow-up**.
- Enabling RLS on the pre-existing `specimen_files` / `diagnostic_report_observations`
  tables (pre-existing advisory; out of scope). The **new** `specimens` table
  ships with RLS enabled + policy.
- Reworking the generic `sync.push` router.

## 4. Verified context

- Template to mirror: `lab.submitResult` ([lab.ts:1044](../../../apps/hub-api/src/trpc/routers/lab.ts)) —
  `labRestrictedProcedure` + `enforceVerifiedOrg` + `enforceEntitlement('LAB_LITE')`
  + `enforceLabActive`; ownership guard; idempotent upsert-by-id; **bare
  blind-index `patient_ref`** (`replace(/^Patient\//, '')`, the R1 fix); audit emit.
- Client drain to mirror: `result-sync.ts` (`drainResultSyncQueue`), wired in
  `SyncProvider` (on-start + 30s tick + `online`).
- No `specimens` table exists (verified via `list_tables`); `diagnostic_reports`
  is the column model.
- The lab only ever holds an **opaque blind-index** patientRef (from
  `pullOrders` / `verifyPatient`) — never the real patient UUID or National ID.

## 5. Design

### 5.0 Root fix — `enqueueSyncEvent` stamps queue metadata

Default the queue-management fields when a caller omits them:

```ts
export async function enqueueSyncEvent(
  entry: { resourceType: string; resourceId: string; payload: unknown
           status?: SyncQueueEntry['status']; createdAt?: string
           lastAttemptAt?: string | null; retryCount?: number
           hlcTimestamp?: string },
): Promise<void> {
  const db = getDb()
  const now = new Date().toISOString()
  const id = `${entry.resourceType}-${entry.resourceId}-${Date.now()}`
  await db.table('syncQueue').put({
    id,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    payload: entry.payload,
    status: entry.status ?? 'pending',
    createdAt: entry.createdAt ?? now,
    lastAttemptAt: entry.lastAttemptAt ?? null,
    retryCount: entry.retryCount ?? 0,
    ...(entry.hlcTimestamp ? { hlcTimestamp: entry.hlcTimestamp } : {}),
  })
}
```

Backward-compatible (callers already passing `status` are unaffected). This
alone **repairs the broken result drain** as a side effect. No call-site churn.

### 5.1 Data model — new `specimens` table

Migration via Supabase MCP (`apply_migration`). Modeled on `diagnostic_reports`.

```sql
CREATE TABLE IF NOT EXISTS specimens (
  id                 UUID PRIMARY KEY,            -- client-generated specimen UUID (no default)
  lab_sample_id      TEXT NOT NULL,               -- human id, e.g. LAB-2026-001
  pipeline_status    TEXT NOT NULL
                       CHECK (pipeline_status IN
                       ('received','in-processing','completed','reported','rejected')),
  fhir_status        TEXT NOT NULL,               -- FHIR Specimen.status
  specimen_type      TEXT,                        -- type code (nullable)
  patient_ref        TEXT NOT NULL,               -- BARE blind index (Patient/ stripped)
  service_request_id TEXT,                        -- bare order id; TEXT, no FK (offline robustness)
  received_from      TEXT,                        -- opaque practitioner ref (nullable)
  received_time      TIMESTAMPTZ,
  condition          TEXT,                        -- acceptable/hemolyzed/... (nullable)
  rejection_reason   TEXT,                        -- controlled vocabulary (nullable)
  note               TEXT,                        -- ENCRYPTED at rest (v1:<base64>), nullable
  performer_id       UUID NOT NULL REFERENCES practitioners(id),  -- server-stamped
  lab_id             UUID NOT NULL REFERENCES labs(id),           -- server-stamped
  hlc_timestamp      TEXT NOT NULL,               -- newer-wins guard
  _ultranos_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_specimens_patient_ref ON specimens (patient_ref);
CREATE INDEX IF NOT EXISTS idx_specimens_lab          ON specimens (lab_id);
CREATE INDEX IF NOT EXISTS idx_specimens_order        ON specimens (service_request_id);
CREATE INDEX IF NOT EXISTS idx_specimens_status       ON specimens (pipeline_status);

ALTER TABLE specimens ENABLE ROW LEVEL SECURITY;
-- Policies mirror diagnostic_reports: a lab technician may read/write only rows
-- where lab_id = their affiliated lab (resolved via lab_technicians).
```

- **No real patient UUID, no National ID** — `patient_ref` is the bare blind
  index (Rule #7).
- `service_request_id` is TEXT with **no FK** — an unsynced order must not block
  specimen ingest (offline robustness; mirrors that `diagnostic_reports` carries
  no order FK).
- `note` encrypted with the same field-encryption helper as
  `diagnostic_reports.report_conclusion`.

### 5.2 Hub endpoint — `lab.submitSpecimen`

`labRestrictedProcedure` + `enforceVerifiedOrg` + `enforceEntitlement('LAB_LITE')`
+ `enforceLabActive` (identical guard chain to `submitResult`).

Strict Zod input DTO (rejects unknown fields = data-min at the boundary):

```ts
{
  id: string,
  labSampleId: string,
  pipelineStatus: 'received'|'in-processing'|'completed'|'reported'|'rejected',
  fhirStatus: string,
  specimenType?: string,
  subjectReference: string,     // Patient/<blindIndex>
  serviceRequestRef?: string,   // ServiceRequest/<orderId>
  receivedFrom?: string,
  receivedTime?: string,
  condition?: string,
  rejectionReason?: string,
  note?: string,
  hlcTimestamp: string,
}
```

Server logic:
1. Resolve `labId = ctx.lab.labId` (else `PRECONDITION_FAILED`),
   `performerId = ctx.lab.technicianId ?? ctx.user.sub`.
2. **Ownership guard:** if a row with `id` exists and `lab_id !== labId` →
   `FORBIDDEN`.
3. **Newer-wins guard:** if the existing row's `hlc_timestamp` ≥ incoming, skip
   the write (idempotent no-op; return success) — prevents a retried stale
   status from clobbering a newer one.
4. Strip `Patient/` → `patient_ref`; strip `ServiceRequest/` → `service_request_id`.
5. Encrypt `note` if present.
6. Idempotent `upsert(..., { onConflict: 'id' })`; `lab_id` / `performer_id`
   **server-stamped** (never trusted from client).
7. Audit `resourceType: 'SPECIMEN'`, action `CREATE`, opaque IDs only (Rule #6).
8. Return `{ specimenId: id, pipelineStatus }`.

Client fetch wrapper `submitSpecimen(input, token)` added to `lab-lite/src/lib/trpc.ts`
(mirrors `uploadResult`).

### 5.3 Client drain — `drainSpecimenSyncQueue` (`lab-lite/src/lib/specimen-sync.ts`)

Mirrors `result-sync.ts`:
- Query `syncQueue.where('resourceType').equals('Specimen').filter(status ===
  'pending')`, **oldest-first** (order by `createdAt`), so status changes apply
  in order.
- Map the stored `FhirSpecimen` payload → the DTO:
  `id`, `labSampleId=_ultranos.labSampleId`, `pipelineStatus=_ultranos.pipelineStatus`,
  `fhirStatus=status`, `specimenType=type.coding[0].code`,
  `subjectReference=subject.reference`, `serviceRequestRef=request[0].reference`,
  `receivedFrom=collection.collector.reference`, `receivedTime`,
  `condition=_ultranos.sampleCondition`, `rejectionReason=_ultranos.rejectionReason`,
  `note=note[0].text`, `hlcTimestamp=_ultranos.hlcTimestamp`.
- POST to `lab.submitSpecimen`; on 2xx `update(id, { status: 'synced' })`, else
  increment `retryCount` + set `lastAttemptAt`. Never throws.

Wire into `SyncProvider` next to the result drain (initial online run, the 30s
tick, and the `online` handler).

### 5.4 Sync tier & semantics

Specimen pipeline status is **operational and monotonic-forward** → **Tier 3 /
newer-wins** (NOT Tier 1; no append-only merge). Idempotent upsert-by-id +
`hlc_timestamp` newer-wins guard is sufficient. Create, all four forward
transitions, and rejection all flow through the same `Specimen` drain because
all three service functions already enqueue `Specimen`.

## 6. Data minimization & security

- Rule #7: `patient_ref` stored as bare blind index; no real UUID / National ID
  ever crosses the boundary. DTO rejects unknown fields.
- Rule #6: every ingest emits a `SPECIMEN` audit event (opaque IDs only).
- Rule #1: `note` encrypted at rest; no PHI in logs (shape-only, like
  result-sync).
- `lab_id` / `performer_id` server-stamped; client cannot spoof lab ownership.
- New table ships with RLS enabled + lab-scoped policy.

## 7. Error handling / offline

- Collection never blocks on network: it writes IndexedDB + enqueues; the drain
  pushes when online (on-save, 30s tick, reconnect).
- Endpoint failures leave the entry `pending` with an incremented `retryCount`
  for the next cycle.
- A stale retry cannot overwrite newer state (newer-wins guard).

## 8. Testing (TDD)

- `enqueueSyncEvent` stamps `status:'pending'`, `createdAt`, `retryCount:0`,
  `lastAttemptAt:null` when omitted; preserves explicit values.
- `drainSpecimenSyncQueue`: maps `FhirSpecimen`→DTO; POSTs to `lab.submitSpecimen`;
  marks `synced` on 2xx; increments `retryCount` on failure; **uses a fixture
  WITHOUT a hand-stamped status** (i.e. relies on the real enqueue path) to
  guard against the result-drain masking bug.
- `lab.submitSpecimen`: ownership guard (`FORBIDDEN` cross-lab); newer-wins skip;
  data-min (rejects extra fields); `patient_ref` stored bare; `lab_id`/`performer_id`
  server-stamped; audit emitted.
- Regression: real result entry now drains (an integration test that enqueues
  via the real `enqueueSyncEvent` and asserts the drain picks it up).
- Migration applies cleanly.

## 9. Files touched

- `apps/lab-lite/src/lib/db.ts` — `enqueueSyncEvent` defaults.
- `apps/lab-lite/src/lib/specimen-sync.ts` — new drain (+ test).
- `apps/lab-lite/src/lib/trpc.ts` — `submitSpecimen` client fn.
- `apps/lab-lite/src/components/providers/SyncProvider.tsx` — wire drain.
- `apps/hub-api/src/trpc/routers/lab.ts` — `submitSpecimen` mutation (+ test).
- Supabase migration — `specimens` table + indexes + RLS (via MCP).

## 10. Open questions

- None blocking. (`rejection_reason` left unencrypted as a controlled
  vocabulary; revisit if free-text rejection notes are later allowed.)
