# Lab Result Transport Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A structured lab result entered in Lab-Lite reaches the Hub and is visible — with per-analyte values, reference ranges, and flags — to the ordering physician in OPD-Lite.

**Architecture:** New Hub `lab.submitResult` endpoint writes the `diagnostic_reports` row (blind-ref keyed, reusing `uploadResult`'s write + notification code) and fans analytes into a new `diagnostic_report_observations` child table; `diagnosticReport.read` is extended to return them. Lab-Lite gains a real drain worker over the existing `syncQueue` (`resourceType='DiagnosticReport'`) that POSTs the bundle to the new endpoint, wired from `SyncProvider`. OPD caches analytes in a new linked Dexie store and renders them (value·unit·range·flag), preferring structured values over the legacy regex-from-conclusion trend hack.

**Tech Stack:** TypeScript, tRPC, Zod, PostgreSQL/Supabase (Hub); Next.js PWA + Dexie/IndexedDB (spokes); Vitest.

**Spec:** `docs/superpowers/specs/2026-09-14-lab-result-transport-loop-design.md`

## Global Constraints

- **Rule #7 (data-minimization):** the endpoint stores only the opaque blind `patient_ref`; analytes carry LOINC + values only — never the real patient UUID or National ID. No lab-facing response may include them.
- **Rule #6 (audit):** `lab.submitResult` and the extended `diagnosticReport.read` MUST emit an audit event for the PHI write/read.
- **Rule #1 (no PHI in logs):** error paths log shape only (codes, counts) — never patient refs, values, or names.
- **R1 (join-key correctness):** `diagnostic_reports.patient_ref` MUST be stored **verbatim** from the bundle's `diagnosticReport.subject.reference`, identical to how `uploadResult` stores `patient_ref: input.patientRef`. That value is the proven join key OPD already reads (uploaded files reach OPD via exactly this value). Do not blind-index, prefix-strip, or transform it.
- **Conflict tier:** lab results are Tier 2 (Clinical) — newer wins, both kept as addenda. `submitResult` is idempotent per report id (replace-then-insert analytes); cross-device merge/amendment is out of scope.
- **Status:** store report `status: 'preliminary'` (never `final`) — there is no verification/authorization gate yet.
- **Migrations:** use the Supabase MCP (`apply_migration`) — do NOT hand-edit SQL into the running DB. The migration file is committed for repo record; the applied name is `diagnostic_report_observations` and the repo file is `062_diagnostic_report_observations.sql` (061 is taken by `facility_locations`).
- **No autonomous commits/pushes** beyond the per-task commit each task specifies. Never `--no-verify`.

---

## File Structure

**Hub (`apps/hub-api`)**
- Create `supabase/migrations/062_diagnostic_report_observations.sql` — child table for per-analyte values.
- Modify `apps/hub-api/src/trpc/routers/lab.ts` — add `submitResult` procedure (reuses `dispatchResultNotifications`, mirrors `uploadResult`'s report write + ownership check).
- Modify `apps/hub-api/src/trpc/routers/diagnostic-report.ts` — extend `read` to return `observations`.
- Create `apps/hub-api/src/__tests__/lab-submit-result.test.ts`.
- Create `apps/hub-api/src/__tests__/diagnostic-report-read-observations.test.ts`.

**Lab-Lite (`apps/lab-lite`)**
- Create `apps/lab-lite/src/lib/result-sync.ts` — drain `syncQueue` (`resourceType='DiagnosticReport'`) → POST `lab.submitResult`.
- Modify `apps/lab-lite/src/components/providers/SyncProvider.tsx` — trigger the drain on startup / interval / online.
- Create `apps/lab-lite/src/__tests__/result-sync.test.ts`.

**OPD-Lite (`apps/opd-lite`)**
- Modify `apps/opd-lite/src/lib/db.ts` — add `diagnosticReportObservations` store + `LocalReportObservation` type + version bump.
- Modify `apps/opd-lite/src/lib/trpc.ts` — add `fetchDiagnosticReportDetail` (calls `diagnosticReport.read`, caches analytes).
- Modify `apps/opd-lite/src/lib/lab-results/result-grouper.ts` — prefer structured analyte value; keep regex fallback.
- Modify `apps/opd-lite/src/components/clinical/LabReportDetail.tsx` — render analyte table.
- Modify/extend `apps/opd-lite/src/__tests__/result-grouper.test.ts` and `apps/opd-lite/src/__tests__/lab-report-detail-viewer.test.tsx`.

---

## Task 1: Hub migration — `diagnostic_report_observations` child table

**Files:**
- Create: `supabase/migrations/062_diagnostic_report_observations.sql`

**Interfaces:**
- Produces: table `diagnostic_report_observations` with FK `diagnostic_report_id → diagnostic_reports(id) ON DELETE CASCADE`, unique `(diagnostic_report_id, observation_id)`.

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/062_diagnostic_report_observations.sql`:

```sql
-- ============================================================
-- Migration 062: Diagnostic Report Observations (structured analytes)
-- Per-analyte lab result values hanging off a diagnostic_reports row.
-- Blind-ref-safe: no patient UUID here — the parent report holds the
-- opaque patient_ref. FHIR R4 DiagnosticReport.result -> Observation.
-- ============================================================
CREATE TABLE IF NOT EXISTS diagnostic_report_observations (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  diagnostic_report_id UUID NOT NULL REFERENCES diagnostic_reports(id) ON DELETE CASCADE,
  observation_id       UUID NOT NULL,          -- client-generated Observation.id (idempotency)
  loinc_code           TEXT NOT NULL,
  loinc_display        TEXT,
  value_quantity       JSONB,                  -- { value, unit?, system?, code? }
  value_string         TEXT,
  interpretation       JSONB,                  -- FHIR interpretation coding (abnormal flags)
  reference_range      JSONB,                  -- { low?, high?, text? }
  note                 JSONB,                  -- [{ text }]
  effective_date_time  TIMESTAMPTZ,
  _ultranos_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dro_report
  ON diagnostic_report_observations (diagnostic_report_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dro_report_obs
  ON diagnostic_report_observations (diagnostic_report_id, observation_id);
```

- [ ] **Step 2: Apply via Supabase MCP**

Apply with `mcp__plugin_supabase_supabase__apply_migration` (name: `061_diagnostic_report_observations`, the SQL above). Then confirm with `mcp__plugin_supabase_supabase__list_tables` that `diagnostic_report_observations` exists with the columns above.
Expected: table present; FK + unique index created.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/061_diagnostic_report_observations.sql
git commit -m "feat(hub): diagnostic_report_observations child table for structured lab analytes"
```

---

## Task 2: Hub — `lab.submitResult` endpoint

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/lab.ts` (add `submitResult` procedure; place it directly after `uploadResult`, ~line 1005)
- Test: `apps/hub-api/src/__tests__/lab-submit-result.test.ts`

**Interfaces:**
- Consumes: `diagnostic_report_observations` (Task 1); existing `dispatchResultNotifications` (lab.ts:22), `labRestrictedProcedure`, middleware chain `enforceVerifiedOrg()/enforceEntitlement('LAB_LITE')/enforceLabActive()`.
- Produces: `lab.submitResult({ diagnosticReport, observations }) → { diagnosticReportId, observationCount }`. Wire contract for the bundle mirrors `apps/lab-lite/src/lib/result-to-fhir.ts` (`LabFhirBundle`).

- [ ] **Step 1: Write the failing test**

Create `apps/hub-api/src/__tests__/lab-submit-result.test.ts`. Mirror the mock harness in `apps/hub-api/src/__tests__/lab-order-patient-details.test.ts` (env stubs, `AuditLogger` mock, `@/lib/supabase` mock with `db.toRow*` identity fns, `createTRPCRouter`/`createCallerFactory`, `setupLab()` for `labRestrictedProcedure`). Add table mocks for `diagnostic_reports`, `diagnostic_report_observations`, `labs`, `encounters`, `notifications`.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))

const mockAuditEmit = vi.fn().mockResolvedValue({ id: 'audit-1' })
vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({ emit: mockAuditEmit })),
}))

const REPORT_ID = '33333333-3333-3333-3333-333333333333'
const PATIENT_REF = 'Patient/hmac-abc123'   // opaque blind ref the lab holds

// lab_technicians (labRestrictedProcedure)
const mockTechSingle = vi.fn()
const mockTechSelect = vi.fn(() => ({ eq: vi.fn(() => ({ single: mockTechSingle })) }))
// diagnostic_reports: ownership lookup (.select().eq().maybeSingle()) + upsert()
const drMaybeSingle = vi.fn()
const drUpsert = vi.fn(() => ({ error: null }))
const drSelect = vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: drMaybeSingle })) }))
// diagnostic_report_observations: delete().eq() + insert()
const droDeleteEq = vi.fn(() => ({ error: null }))
const droInsert = vi.fn(() => ({ error: null }))
// labs: name lookup
const labsSingle = vi.fn().mockResolvedValue({ data: { name: 'Central Lab' }, error: null })
const labsSelect = vi.fn(() => ({ eq: vi.fn(() => ({ single: labsSingle })) }))
// encounters: ordering doctor lookup
const encSingle = vi.fn().mockResolvedValue({ data: { practitioner_id: 'doc-1' }, error: null })
const encSelect = vi.fn(() => ({ eq: vi.fn(() => ({ order: vi.fn(() => ({ limit: vi.fn(() => ({ single: encSingle })) })) })) }))
// notifications: insert().select('id')
const notifInsert = vi.fn(() => ({ select: vi.fn().mockResolvedValue({ data: [{ id: 'n1' }], error: null }) }))

const mockFrom = vi.fn((table: string) => {
  if (table === 'lab_technicians') return { select: mockTechSelect }
  if (table === 'diagnostic_reports') return { select: drSelect, upsert: drUpsert }
  if (table === 'diagnostic_report_observations') return { delete: vi.fn(() => ({ eq: droDeleteEq })), insert: droInsert }
  if (table === 'labs') return { select: labsSelect }
  if (table === 'encounters') return { select: encSelect }
  if (table === 'notifications') return { insert: notifInsert }
  return { select: vi.fn() }
})

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({ from: mockFrom })),
  db: { toRow: (d: any) => d, toRowRaw: (d: any) => d, fromRow: (d: any) => d, fromRowRaw: (d: any) => d, fromRows: (d: any[]) => d },
}))
vi.mock('@ultranos/crypto/server', () => ({
  generateBlindIndex: vi.fn((i: string) => `hmac-${i}`),
  encryptField: vi.fn((i: string) => `enc-${i}`),
}))
vi.mock('@/lib/field-encryption', () => ({
  getFieldEncryptionKeys: vi.fn(() => ({ encryptionKey: 'k', hmacKey: 'h' })),
}))

const { createTRPCRouter, createCallerFactory } = await import('../trpc/init')
const { labRouter } = await import('../trpc/routers/lab')

function makeCtx(user: { sub: string; role: string; sessionId: string; orgId?: string } | null) {
  return { supabase: { from: mockFrom } as never, user, headers: new Headers() }
}
function setupLab(status = 'ACTIVE') {
  mockTechSingle.mockResolvedValue({
    data: { id: 'tech-rec', lab_id: 'lab-1', practitioner_id: 'tech-1', labs: { id: 'lab-1', status } },
    error: null,
  })
}

function makeBundle() {
  return {
    diagnosticReport: {
      id: REPORT_ID, resourceType: 'DiagnosticReport' as const, status: 'preliminary' as const,
      code: { coding: [{ system: 'http://loinc.org', code: '58410-2', display: 'CBC' }], text: 'CBC' },
      subject: { reference: PATIENT_REF }, issued: '2026-09-14T09:00:00.000Z',
      _ultranos: { createdAt: '2026-09-14T09:00:00.000Z', hlcTimestamp: 'hlc', isOfflineCreated: true, templateVersion: 'v1' },
      meta: { lastUpdated: '2026-09-14T09:00:00.000Z', versionId: '1' },
    },
    observations: [
      {
        id: '44444444-4444-4444-4444-444444444444', resourceType: 'Observation' as const, status: 'preliminary' as const,
        code: { coding: [{ system: 'http://loinc.org', code: '718-7', display: 'Hemoglobin' }], text: 'Hemoglobin' },
        valueQuantity: { value: 12.5, unit: 'g/dL' },
        interpretation: [{ coding: [{ system: 'x', code: 'L', display: 'Low' }] }],
        _ultranos: { isOfflineCreated: true, hlcTimestamp: 'hlc', createdAt: '2026-09-14T09:00:00.000Z', templateVersion: 'v1', referenceRange: { low: 13, high: 17 } },
        meta: { lastUpdated: '2026-09-14T09:00:00.000Z', versionId: '1' },
      },
    ],
  }
}

describe('lab.submitResult', () => {
  beforeEach(() => { vi.clearAllMocks(); drMaybeSingle.mockResolvedValue({ data: null, error: null }) })

  it('writes the report with status preliminary and patient_ref stored verbatim (R1)', async () => {
    setupLab()
    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-1' }))
    const res = await caller.lab.submitResult(makeBundle())

    expect(res).toEqual({ diagnosticReportId: REPORT_ID, observationCount: 1 })
    const upserted = drUpsert.mock.calls[0]![0]
    expect(upserted).toMatchObject({ id: REPORT_ID, status: 'preliminary', patient_ref: PATIENT_REF, loinc_code: '58410-2', lab_id: 'lab-1' })
  })

  it('fans analytes into diagnostic_report_observations (replace-then-insert)', async () => {
    setupLab()
    const caller = createCallerFactory(createTRPCRouter({ lab: labRouter }))(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-1' }))
    await caller.lab.submitResult(makeBundle())
    expect(droDeleteEq).toHaveBeenCalled() // idempotent: clears prior analytes for this report
    const rows = droInsert.mock.calls[0]![0]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      diagnostic_report_id: REPORT_ID, observation_id: '44444444-4444-4444-4444-444444444444',
      loinc_code: '718-7', value_quantity: { value: 12.5, unit: 'g/dL' }, reference_range: { low: 13, high: 17 },
    })
  })

  it('dispatches a LAB_RESULT_AVAILABLE notification to the ordering doctor', async () => {
    setupLab()
    const caller = createCallerFactory(createTRPCRouter({ lab: labRouter }))(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-1' }))
    await caller.lab.submitResult(makeBundle())
    await new Promise((r) => setTimeout(r, 0)) // notification is fire-and-forget
    const inserted = notifInsert.mock.calls[0]![0]
    expect(inserted.some((n: any) => n.recipientRole === 'CLINICIAN' && n.type === 'LAB_RESULT_AVAILABLE')).toBe(true)
  })

  it('emits a PHI write audit event (Rule #6)', async () => {
    setupLab()
    const caller = createCallerFactory(createTRPCRouter({ lab: labRouter }))(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-1' }))
    await caller.lab.submitResult(makeBundle())
    expect(mockAuditEmit).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE', resourceType: 'LAB_RESULT', resourceId: REPORT_ID }))
  })

  it('rejects an existing report owned by another lab', async () => {
    setupLab()
    drMaybeSingle.mockResolvedValue({ data: { id: REPORT_ID, lab_id: 'other-lab' }, error: null })
    const caller = createCallerFactory(createTRPCRouter({ lab: labRouter }))(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-1' }))
    await expect(caller.lab.submitResult(makeBundle())).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('rejects non-lab roles', async () => {
    const caller = createCallerFactory(createTRPCRouter({ lab: labRouter }))(makeCtx({ sub: 'doc-1', role: 'DOCTOR', sessionId: 's1', orgId: 'org-1' }))
    await expect(caller.lab.submitResult(makeBundle())).rejects.toBeDefined()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F hub-api test lab-submit-result`
Expected: FAIL — `caller.lab.submitResult is not a function` (procedure not defined yet).

- [ ] **Step 3: Add the `submitResult` procedure**

In `apps/hub-api/src/trpc/routers/lab.ts`, add these zod schemas near the top (after imports, before `dispatchResultNotifications` or above the router). They mirror `LabFhirBundle` in `apps/lab-lite/src/lib/result-to-fhir.ts` — keep them in sync:

```ts
const submitCodeSchema = z.object({
  coding: z.array(z.object({ system: z.string().optional(), code: z.string(), display: z.string().optional() })).optional(),
  text: z.string().optional(),
})
const submitObservationSchema = z.object({
  id: z.string().uuid(),
  resourceType: z.literal('Observation'),
  status: z.enum(['preliminary', 'registered']),
  code: submitCodeSchema,
  subject: z.object({ reference: z.string() }).optional(),
  valueQuantity: z.object({ value: z.number(), unit: z.string().optional(), system: z.string().optional(), code: z.string().optional() }).optional(),
  valueString: z.string().optional(),
  interpretation: z.array(z.object({ coding: z.array(z.object({ system: z.string(), code: z.string(), display: z.string() })).optional() })).optional(),
  note: z.array(z.object({ text: z.string() })).optional(),
  _ultranos: z.object({
    isOfflineCreated: z.boolean().optional(),
    hlcTimestamp: z.string().optional(),
    createdAt: z.string().optional(),
    templateVersion: z.string().optional(),
    referenceRange: z.object({ low: z.number().optional(), high: z.number().optional(), text: z.string().optional() }).optional(),
    effectiveDateTime: z.string().optional(),
  }).passthrough(),
  meta: z.object({ lastUpdated: z.string(), versionId: z.string() }),
})
const submitDiagnosticReportSchema = z.object({
  id: z.string().uuid(),
  resourceType: z.literal('DiagnosticReport'),
  status: z.enum(['preliminary', 'registered']),
  code: submitCodeSchema,
  subject: z.object({ reference: z.string().min(1) }),
  issued: z.string(),
  result: z.array(z.object({ reference: z.string() })).optional(),
  conclusion: z.string().optional(),
  _ultranos: z.object({}).passthrough(),
  meta: z.object({ lastUpdated: z.string(), versionId: z.string() }),
})
```

Then add the procedure inside the `labRouter` object, right after `uploadResult` (~line 1005):

```ts
  submitResult: labRestrictedProcedure
    .use(enforceVerifiedOrg())
    .use(enforceEntitlement('LAB_LITE'))
    .use(enforceLabActive())
    .input(z.object({
      diagnosticReport: submitDiagnosticReportSchema,
      observations: z.array(submitObservationSchema),
    }))
    .mutation(async ({ ctx, input }) => {
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      const technicianId = ctx.lab?.technicianId ?? ctx.user.sub
      const labId = ctx.lab?.labId
      if (!labId) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Lab affiliation required' })
      }

      const dr = input.diagnosticReport
      const reportId = dr.id
      const patientRef = dr.subject.reference            // R1: store VERBATIM (proven join key)
      const loincCode = dr.code.coding?.[0]?.code ?? dr.code.text ?? 'UNKNOWN'
      const loincDisplay = dr.code.coding?.[0]?.display ?? dr.code.text ?? loincCode
      const collectionDate = dr.issued.slice(0, 10)      // date-only (NOT NULL); result date as collection default

      // Ownership guard: if a report with this id exists, it must belong to this lab.
      const { data: existing, error: lookupError } = await ctx.supabase
        .from('diagnostic_reports')
        .select('id, lab_id')
        .eq('id', reportId)
        .maybeSingle()
      if (lookupError) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to look up report' })
      }
      if (existing && existing.lab_id !== labId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Report belongs to another lab' })
      }

      // Upsert the report row (idempotent on id). Status is always 'preliminary'.
      const reportRow: Record<string, unknown> = {
        id: reportId,
        status: 'preliminary',
        loinc_code: loincCode,
        loinc_display: loincDisplay,
        patient_ref: patientRef,
        performer_id: technicianId,
        lab_id: labId,
        issued: dr.issued,
        collection_date: collectionDate,
        virus_scan_status: 'clean',        // structured entry has no file to scan
      }
      if (dr.conclusion) reportRow.report_conclusion = encryptField(dr.conclusion, getFieldEncryptionKeys().encryptionKey)
      const { error: upsertError } = await ctx.supabase
        .from('diagnostic_reports')
        .upsert(reportRow, { onConflict: 'id' })
      if (upsertError) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to write diagnostic report' })
      }

      // Replace-then-insert analytes (idempotent re-delivery).
      await ctx.supabase.from('diagnostic_report_observations').delete().eq('diagnostic_report_id', reportId)
      const analyteRows = input.observations.map((o) => ({
        diagnostic_report_id: reportId,
        observation_id: o.id,
        loinc_code: o.code.coding?.[0]?.code ?? o.code.text ?? 'UNKNOWN',
        loinc_display: o.code.coding?.[0]?.display ?? o.code.text ?? null,
        value_quantity: o.valueQuantity ?? null,
        value_string: o.valueString ?? null,
        interpretation: o.interpretation ?? null,
        reference_range: (o._ultranos as { referenceRange?: unknown })?.referenceRange ?? null,
        note: o.note ?? null,
        effective_date_time: (o._ultranos as { effectiveDateTime?: string })?.effectiveDateTime ?? dr.issued,
      }))
      if (analyteRows.length > 0) {
        const { error: obsError } = await ctx.supabase.from('diagnostic_report_observations').insert(analyteRows)
        if (obsError) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to write analytes' })
        }
      }

      // Audit the PHI write (Rule #6). Best-effort — data is already persisted.
      try {
        await audit.emit({
          action: 'CREATE', resourceType: 'LAB_RESULT', resourceId: reportId,
          actorId: technicianId, actorRole: ctx.user.role, outcome: 'SUCCESS', sessionId: ctx.user.sessionId,
          metadata: { submitAction: 'structured_result_submitted', loincCode, observationCount: analyteRows.length, labId },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'CREATE', resourceType: 'LAB_RESULT', resourceId: reportId })
      }

      // Resolve lab name + dispatch notifications (reuses uploadResult's helper). Fire-and-forget.
      let labName = 'Laboratory'
      try {
        const { data: labRecord } = await ctx.supabase.from('labs').select('name').eq('id', labId).single()
        if (labRecord?.name) labName = labRecord.name
      } catch { /* default */ }
      dispatchResultNotifications(ctx.supabase, {
        patientRef,
        payload: { testCategory: loincDisplay, labName, uploadTimestamp: new Date().toISOString(), diagnosticReportId: reportId },
        actorId: technicianId, actorRole: ctx.user.role, sessionId: ctx.user.sessionId,
      }).catch(() => { /* notification failure must not block */ })

      return { diagnosticReportId: reportId, observationCount: analyteRows.length }
    }),
```

Confirm `encryptField` and `getFieldEncryptionKeys` are already imported in lab.ts (they are, used by `uploadResult`). If not, add: `import { getFieldEncryptionKeys } from '@/lib/field-encryption'`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm -F hub-api test lab-submit-result`
Expected: PASS (all 6 cases).

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm -F hub-api typecheck
git add apps/hub-api/src/trpc/routers/lab.ts apps/hub-api/src/__tests__/lab-submit-result.test.ts
git commit -m "feat(hub): lab.submitResult ingests structured result bundle (report + analytes + notify)"
```

---

## Task 3: Hub — extend `diagnosticReport.read` to return analytes

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/diagnostic-report.ts` (the `read` query, ~line 38-114)
- Test: `apps/hub-api/src/__tests__/diagnostic-report-read-observations.test.ts`

**Interfaces:**
- Consumes: `diagnostic_report_observations` (Task 1).
- Produces: `diagnosticReport.read(...)` return object gains `observations: Array<{ id, observationId, loincCode, loincDisplay, valueQuantity, valueString, interpretation, referenceRange, note, effectiveDateTime }>`. OPD (Task 6) consumes this shape.

- [ ] **Step 1: Write the failing test**

Create `apps/hub-api/src/__tests__/diagnostic-report-read-observations.test.ts`. Mirror the harness in `lab-order-patient-details.test.ts`, mocking `diagnostic_reports` (`.select().eq().eq().single()`), `lab_result_files` (`.select().eq()`), and `diagnostic_report_observations` (`.select().eq()`). Assert the `read` output includes an `observations` array with the analyte fields:

```ts
it('read() returns the report plus its structured analytes', async () => {
  // report row resolves; patient_ref matches patientBlindRef(input.patientRef)
  // diagnostic_report_observations returns one analyte row
  const res = await caller.diagnosticReport.read({ id: REPORT_ID, patientRef: 'Patient/real-1' })
  expect(res.observations).toEqual([
    expect.objectContaining({
      observationId: 'obs-1', loincCode: '718-7', loincDisplay: 'Hemoglobin',
      valueQuantity: { value: 12.5, unit: 'g/dL' }, referenceRange: { low: 13, high: 17 },
    }),
  ])
})
```

(Reuse the existing `patientBlindRef` mock so `data.patient_ref === patientBlindRef(input.patientRef)` passes the guard at diagnostic-report.ts:58.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F hub-api test diagnostic-report-read-observations`
Expected: FAIL — `res.observations` is undefined.

- [ ] **Step 3: Implement**

In `apps/hub-api/src/trpc/routers/diagnostic-report.ts` `read`, after the `lab_result_files` fetch (~line 73) add an analyte fetch, and include `observations` in the returned object (~line 91):

```ts
      // Structured analytes (Task 3)
      const { data: analytes } = await ctx.supabase
        .from('diagnostic_report_observations')
        .select('id, observation_id, loinc_code, loinc_display, value_quantity, value_string, interpretation, reference_range, note, effective_date_time')
        .eq('diagnostic_report_id', input.id)
```

Add to the `return { ... }` object:

```ts
        observations: (analytes ?? []).map((a) => ({
          id: a.id as string,
          observationId: a.observation_id as string,
          loincCode: a.loinc_code as string,
          loincDisplay: (a.loinc_display as string | null) ?? null,
          valueQuantity: a.value_quantity as { value: number; unit?: string } | null,
          valueString: (a.value_string as string | null) ?? null,
          interpretation: a.interpretation as unknown[] | null,
          referenceRange: a.reference_range as { low?: number; high?: number; text?: string } | null,
          note: a.note as Array<{ text: string }> | null,
          effectiveDateTime: (a.effective_date_time as string | null) ?? null,
        })),
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm -F hub-api test diagnostic-report-read-observations`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm -F hub-api typecheck
git add apps/hub-api/src/trpc/routers/diagnostic-report.ts apps/hub-api/src/__tests__/diagnostic-report-read-observations.test.ts
git commit -m "feat(hub): diagnosticReport.read returns structured analytes"
```

---

## Task 4: Lab-Lite — result-sync drain worker + SyncProvider wiring

**Files:**
- Create: `apps/lab-lite/src/lib/result-sync.ts`
- Modify: `apps/lab-lite/src/components/providers/SyncProvider.tsx`
- Test: `apps/lab-lite/src/__tests__/result-sync.test.ts`

**Interfaces:**
- Consumes: `lab.submitResult` (Task 2); local `syncQueue` (entries enqueued at `results/[sampleId]/enter/page.tsx:244` with `resourceType='DiagnosticReport'`, `payload` = `LabFhirBundle`); `getHubApiUrl` from `@/lib/trpc`; `getDb` from `@/lib/db`.
- Produces: `drainResultSyncQueue(getToken: () => Promise<string>): Promise<{ synced: number; failed: number }>`.

- [ ] **Step 1: Write the failing test**

Create `apps/lab-lite/src/__tests__/result-sync.test.ts`. Mock `@/lib/db` `getDb` to return a fake `syncQueue` Dexie table (a `where().equals().filter().toArray()` chain + `update`), mock `@/lib/trpc` `getHubApiUrl`, and stub `global.fetch`.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const entries = [
  { id: 'DiagnosticReport-r1-1', resourceType: 'DiagnosticReport', resourceId: 'r1', status: 'pending', payload: { diagnosticReport: { id: 'r1' }, observations: [] }, createdAt: 't', lastAttemptAt: null, retryCount: 0 },
]
const update = vi.fn()
const fakeQueue = {
  where: () => ({ equals: () => ({ filter: (fn: any) => ({ toArray: async () => entries.filter(fn) }) }) }),
  update,
}
vi.mock('@/lib/db', () => ({ getDb: () => ({ syncQueue: fakeQueue }) }))
vi.mock('@/lib/trpc', () => ({ getHubApiUrl: () => 'http://hub' }))

const { drainResultSyncQueue } = await import('../lib/result-sync')

beforeEach(() => { vi.clearAllMocks(); (global as any).fetch = vi.fn() })

it('POSTs pending DiagnosticReport entries to lab.submitResult and marks them synced', async () => {
  ;(global.fetch as any).mockResolvedValue({ ok: true })
  const res = await drainResultSyncQueue(async () => 'tok')
  expect(global.fetch).toHaveBeenCalledWith('http://hub/lab.submitResult', expect.objectContaining({ method: 'POST' }))
  const body = JSON.parse((global.fetch as any).mock.calls[0][1].body)
  expect(body.json.diagnosticReport.id).toBe('r1')   // tRPC input envelope { json: <bundle> }
  expect(update).toHaveBeenCalledWith('DiagnosticReport-r1-1', { status: 'synced' })
  expect(res).toEqual({ synced: 1, failed: 0 })
})

it('leaves entries pending and increments retryCount on failure', async () => {
  ;(global.fetch as any).mockResolvedValue({ ok: false, status: 500 })
  const res = await drainResultSyncQueue(async () => 'tok')
  expect(update).toHaveBeenCalledWith('DiagnosticReport-r1-1', expect.objectContaining({ retryCount: 1 }))
  expect(res).toEqual({ synced: 0, failed: 1 })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F lab-lite test result-sync`
Expected: FAIL — cannot find module `../lib/result-sync`.

- [ ] **Step 3: Implement the drain**

Create `apps/lab-lite/src/lib/result-sync.ts` (mirrors `authorization-sync.ts`'s `drainAuthorizationNotifications`):

```ts
/**
 * Result Sync — drains structured lab-result bundles to the Hub.
 *
 * Result entry enqueues a full LabFhirBundle into syncQueue with
 * resourceType='DiagnosticReport' (results/[sampleId]/enter/page.tsx). This
 * worker POSTs each pending entry to lab.submitResult and marks it synced.
 * Never throws — sync must not block clinical work. PHI-safe logging (shape only).
 */
import { getDb } from './db'
import { getHubApiUrl } from './trpc'

export async function drainResultSyncQueue(
  getToken: () => Promise<string>,
): Promise<{ synced: number; failed: number }> {
  const result = { synced: 0, failed: 0 }
  try {
    const db = getDb()
    const pending = await db.syncQueue
      .where('resourceType')
      .equals('DiagnosticReport')
      .filter((e: { status: string }) => e.status === 'pending')
      .toArray()
    if (pending.length === 0) return result

    const token = await getToken()
    for (const entry of pending) {
      try {
        const res = await fetch(`${getHubApiUrl()}/lab.submitResult`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ json: entry.payload }),
          signal: AbortSignal.timeout(15_000),
        })
        if (res.ok) {
          await db.syncQueue.update(entry.id, { status: 'synced' })
          result.synced++
        } else {
          await db.syncQueue.update(entry.id, { retryCount: (entry.retryCount ?? 0) + 1, lastAttemptAt: new Date().toISOString() })
          result.failed++
        }
      } catch {
        await db.syncQueue.update(entry.id, { retryCount: (entry.retryCount ?? 0) + 1, lastAttemptAt: new Date().toISOString() })
        result.failed++
      }
    }
  } catch {
    // Non-fatal — retried next cycle.
  }
  return result
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm -F lab-lite test result-sync`
Expected: PASS (both cases).

- [ ] **Step 5: Wire into SyncProvider**

In `apps/lab-lite/src/components/providers/SyncProvider.tsx`: import the drain and trigger it wherever `triggerUploadDrain()` runs (startup, the 30s `drainInterval`, and the `online` handler). Add near the top:

```ts
import { drainResultSyncQueue } from '@/lib/result-sync'
```

Inside the effect (after `startUploadDrain(...)`), add a startup drain and fold the result drain into the existing triggers:

```ts
    const runResultDrain = () => { void drainResultSyncQueue(getToken) }
    if (typeof navigator !== 'undefined' && navigator.onLine) runResultDrain()
```

Then in the existing `drainInterval` callback add `runResultDrain()` alongside `triggerUploadDrain()`, and in `handleOnline()` add `runResultDrain()`. (No new interval — reuse the 30s one.)

- [ ] **Step 6: Typecheck + commit**

```bash
pnpm -F lab-lite typecheck
git add apps/lab-lite/src/lib/result-sync.ts apps/lab-lite/src/components/providers/SyncProvider.tsx apps/lab-lite/src/__tests__/result-sync.test.ts
git commit -m "feat(lab-lite): drain structured results to lab.submitResult via existing syncQueue"
```

---

## Task 5: OPD — Dexie store for report analytes

**Files:**
- Modify: `apps/opd-lite/src/lib/db.ts` (add type + table + version bump + encryption registration)

**Interfaces:**
- Produces: `LocalReportObservation` type; `db.diagnosticReportObservations` table keyed by `id`, indexed by `diagnosticReportId`. Consumed by Tasks 6/7/8.

- [ ] **Step 1: Write the failing test**

Create `apps/opd-lite/src/__tests__/diagnostic-report-observations-store.test.ts` (uses `fake-indexeddb` as other db tests do — check an existing db test for the setup import):

```ts
import { describe, it, expect } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '@/lib/db'

it('stores and queries analytes by diagnosticReportId', async () => {
  await db.diagnosticReportObservations.bulkPut([
    { id: 'a1', diagnosticReportId: 'r1', loincCode: '718-7', loincDisplay: 'Hemoglobin', valueQuantity: { value: 12.5, unit: 'g/dL' }, valueString: null, interpretation: null, referenceRange: { low: 13, high: 17 }, note: null, effectiveDateTime: '2026-09-14' },
  ])
  const rows = await db.diagnosticReportObservations.where('diagnosticReportId').equals('r1').toArray()
  expect(rows).toHaveLength(1)
  expect(rows[0]!.valueQuantity).toEqual({ value: 12.5, unit: 'g/dL' })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F opd-lite test diagnostic-report-observations-store`
Expected: FAIL — `db.diagnosticReportObservations` is undefined.

- [ ] **Step 3: Implement**

In `apps/opd-lite/src/lib/db.ts`, add the type near `LocalDiagnosticReport` (~line 187):

```ts
export interface LocalReportObservation {
  id: string
  diagnosticReportId: string
  loincCode: string
  loincDisplay: string | null
  valueQuantity: { value: number; unit?: string } | null
  valueString: string | null
  interpretation: unknown[] | null
  referenceRange: { low?: number; high?: number; text?: string } | null
  note: Array<{ text: string }> | null
  effectiveDateTime: string | null
}
```

Add the table field to the Dexie class (near `diagnosticReports!` ~line 219):

```ts
  diagnosticReportObservations!: EntityTable<LocalReportObservation, 'id'>
```

Add a new version bump (use the next version number after the current highest; the lab report cache is v20, so use the next unused version — inspect the file for the current max and add +1):

```ts
    this.version(<NEXT>).stores({
      diagnosticReportObservations: 'id, diagnosticReportId',
    })
```

If the file maintains an encrypted-table registry (the `diagnosticReports`/`observations` tables are registered as encrypted ~line 812), add `diagnosticReportObservations` there too so analyte values are encrypted at rest, consistent with `diagnosticReports`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm -F opd-lite test diagnostic-report-observations-store`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm -F opd-lite typecheck
git add apps/opd-lite/src/lib/db.ts apps/opd-lite/src/__tests__/diagnostic-report-observations-store.test.ts
git commit -m "feat(opd): local encrypted store for structured lab analytes"
```

---

## Task 6: OPD — `fetchDiagnosticReportDetail` (read analytes into cache)

**Files:**
- Modify: `apps/opd-lite/src/lib/trpc.ts` (add fetcher after `fetchDiagnosticReportsForPatient`, ~line 454)
- Test: `apps/opd-lite/src/__tests__/lab-results-trpc.test.ts` (extend) or new `fetch-report-detail.test.ts`

**Interfaces:**
- Consumes: Hub `diagnosticReport.read` (Task 3) returning `{ ..., observations: [...] }`; `db.diagnosticReportObservations` (Task 5).
- Produces: `fetchDiagnosticReportDetail(reportId: string, patientId: string): Promise<void>` — fetches `read`, upserts analytes into the local store.

- [ ] **Step 1: Write the failing test**

New `apps/opd-lite/src/__tests__/fetch-report-detail.test.ts`. Stub `fetch` to return a `read` envelope with `observations`, mock the Supabase session token path (mirror how `lab-results-trpc.test.ts` stubs `getSupabaseBrowserClient`), and assert analytes land in `db.diagnosticReportObservations`:

```ts
it('fetches diagnosticReport.read and caches its analytes', async () => {
  ;(global.fetch as any).mockResolvedValue({ ok: true, json: async () => ({
    result: { data: { json: { id: 'r1', observations: [
      { id: 'a1', observationId: 'o1', loincCode: '718-7', loincDisplay: 'Hemoglobin', valueQuantity: { value: 12.5, unit: 'g/dL' }, valueString: null, interpretation: null, referenceRange: { low: 13, high: 17 }, note: null, effectiveDateTime: '2026-09-14' },
    ] } } },
  }) })
  await fetchDiagnosticReportDetail('r1', 'patient-1')
  const rows = await db.diagnosticReportObservations.where('diagnosticReportId').equals('r1').toArray()
  expect(rows[0]!.loincCode).toBe('718-7')
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F opd-lite test fetch-report-detail`
Expected: FAIL — `fetchDiagnosticReportDetail` is not exported.

- [ ] **Step 3: Implement**

In `apps/opd-lite/src/lib/trpc.ts`, add after `fetchDiagnosticReportsForPatient` (mirror its auth-header + envelope-unwrap pattern):

```ts
/**
 * Fetch a single report's detail (incl. structured analytes) via
 * diagnosticReport.read and cache the analytes in the local store.
 * Offline-first: on any failure the existing cache is left intact.
 */
export async function fetchDiagnosticReportDetail(reportId: string, patientId: string): Promise<void> {
  try {
    const headers: Record<string, string> = {}
    if (typeof window !== 'undefined') {
      const { getSupabaseBrowserClient } = await import('@/lib/supabase')
      const { data } = await getSupabaseBrowserClient().auth.getSession()
      const token = data.session?.access_token
      if (token) headers['Authorization'] = `Bearer ${token}`
    }
    const input = encodeURIComponent(JSON.stringify({ json: { id: reportId, patientRef: `Patient/${patientId}` } }))
    const res = await fetch(`${getHubApiUrl()}/diagnosticReport.read?input=${input}`, { method: 'GET', headers })
    if (!res.ok) return
    const body = (await res.json()) as { result?: { data?: { json?: { observations?: Array<Record<string, unknown>> } } } }
    const observations = body?.result?.data?.json?.observations ?? []
    const rows = observations.map((o) => ({
      id: o.id as string,
      diagnosticReportId: reportId,
      loincCode: o.loincCode as string,
      loincDisplay: (o.loincDisplay as string | null) ?? null,
      valueQuantity: (o.valueQuantity as { value: number; unit?: string } | null) ?? null,
      valueString: (o.valueString as string | null) ?? null,
      interpretation: (o.interpretation as unknown[] | null) ?? null,
      referenceRange: (o.referenceRange as { low?: number; high?: number; text?: string } | null) ?? null,
      note: (o.note as Array<{ text: string }> | null) ?? null,
      effectiveDateTime: (o.effectiveDateTime as string | null) ?? null,
    }))
    if (rows.length > 0) await db.diagnosticReportObservations.bulkPut(rows as never)
  } catch {
    // Network/parse failure — keep the existing cache (offline-first).
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm -F opd-lite test fetch-report-detail`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm -F opd-lite typecheck
git add apps/opd-lite/src/lib/trpc.ts apps/opd-lite/src/__tests__/fetch-report-detail.test.ts
git commit -m "feat(opd): fetch + cache structured analytes via diagnosticReport.read"
```

---

## Task 7: OPD — prefer structured analyte values in trend extraction

**Files:**
- Modify: `apps/opd-lite/src/lib/lab-results/result-grouper.ts`
- Test: `apps/opd-lite/src/__tests__/result-grouper.test.ts` (extend)

**Interfaces:**
- Consumes: `LocalReportObservation` (Task 5).
- Produces: `buildTrendData` (and `groupReportsByLoinc`) accept an optional `analytesByReportId?: Map<string, LocalReportObservation[]>`. When present, the numeric value for a report is taken from the analyte whose `loincCode` equals the report's LOINC (or the sole analyte); falls back to the existing `extractNumericFromConclusion` regex when no structured analyte matches.

- [ ] **Step 1: Write the failing test**

Add to `apps/opd-lite/src/__tests__/result-grouper.test.ts`:

```ts
it('prefers a structured analyte value over regex-from-conclusion', () => {
  const report = { id: 'r1', resourceType: 'DiagnosticReport', status: 'preliminary',
    code: { coding: [{ code: '718-7', display: 'Hemoglobin' }] }, subject: {}, issued: '2026-09-14',
    conclusion: 'see attached', _ultranos: { flagLevel: 'normal' } } as any
  const analytes = new Map([['r1', [
    { id: 'a1', diagnosticReportId: 'r1', loincCode: '718-7', loincDisplay: 'Hemoglobin', valueQuantity: { value: 12.5, unit: 'g/dL' }, valueString: null, interpretation: null, referenceRange: null, note: null, effectiveDateTime: '2026-09-14' },
  ]]])
  const report2 = { ...report, id: 'r2', issued: '2026-09-15' } as any
  analytes.set('r2', [{ ...analytes.get('r1')![0]!, id: 'a2', diagnosticReportId: 'r2', valueQuantity: { value: 13.1, unit: 'g/dL' } }])
  const groups = groupReportsByLoinc([report2, report], analytes)
  const g = groups.find((x) => x.loincCode === '718-7')!
  expect(g.trendData).not.toBeNull()
  expect(g.trendData!.map((p) => p.value)).toEqual([13.1, 12.5]) // structured values, not regex
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F opd-lite test result-grouper`
Expected: FAIL — `groupReportsByLoinc` takes one arg; structured values ignored.

- [ ] **Step 3: Implement**

In `result-grouper.ts`, thread an optional analyte map through `groupReportsByLoinc` → `buildTrendData`:

```ts
export function groupReportsByLoinc(
  reports: LocalDiagnosticReport[],
  analytesByReportId?: Map<string, import('@/lib/db').LocalReportObservation[]>,
): GroupedResults[] {
```

Pass it into the `buildTrendData(groupReports, loincCode, analytesByReportId)` call, and update `buildTrendData`:

```ts
function buildTrendData(
  reports: LocalDiagnosticReport[],
  loincCode: string,
  analytesByReportId?: Map<string, import('@/lib/db').LocalReportObservation[]>,
): TrendDataPoint[] | null {
  const points: TrendDataPoint[] = []
  for (const report of reports) {
    const date = report.effectiveDateTime ?? report.issued
    if (!date) continue

    // Prefer a structured analyte value (matching this group's LOINC, or the sole analyte).
    let value: number | undefined
    let unit = ''
    const analytes = analytesByReportId?.get(report.id)
    if (analytes && analytes.length > 0) {
      const match = analytes.find((a) => a.loincCode === loincCode) ?? (analytes.length === 1 ? analytes[0] : undefined)
      if (match?.valueQuantity && typeof match.valueQuantity.value === 'number') {
        value = match.valueQuantity.value
        unit = match.valueQuantity.unit ?? ''
      }
    }
    // Fallback: legacy file-only reports — regex-extract from conclusion.
    if (value === undefined) {
      const numeric = report.conclusion ? extractNumericFromConclusion(report.conclusion) : null
      if (!numeric) continue
      value = numeric.value
      unit = numeric.unit
    }

    points.push({
      date, value, unit,
      flagLevel: report._ultranos?.flagLevel ?? 'normal',
      labName: report.performer?.[0]?.display ?? report._ultranos?.labId ?? 'Unknown Lab',
    })
  }
  return points.length >= 2 ? points : null
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm -F opd-lite test result-grouper`
Expected: PASS (new case + all existing regex-fallback cases still green).

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm -F opd-lite typecheck
git add apps/opd-lite/src/lib/lab-results/result-grouper.ts apps/opd-lite/src/__tests__/result-grouper.test.ts
git commit -m "feat(opd): prefer structured analyte values over conclusion regex in trends"
```

---

## Task 8: OPD — render the analyte table in `LabReportDetail`

**Files:**
- Modify: `apps/opd-lite/src/components/clinical/LabReportDetail.tsx`
- Test: `apps/opd-lite/src/__tests__/lab-report-detail-viewer.test.tsx` (extend)

**Interfaces:**
- Consumes: `db.diagnosticReportObservations` (Task 5), `fetchDiagnosticReportDetail` (Task 6).
- Produces: an analyte table (LOINC · value · unit · reference range · flag) rendered when analytes exist for the open report.

- [ ] **Step 1: Write the failing test**

Add to `apps/opd-lite/src/__tests__/lab-report-detail-viewer.test.tsx` (mirror the file's existing render/mocking setup). Seed `db.diagnosticReportObservations` with one analyte for the report id, render `LabReportDetail`, and assert the value/unit/flag show:

```ts
it('renders structured analytes (value, unit, reference range, flag)', async () => {
  await db.diagnosticReportObservations.bulkPut([
    { id: 'a1', diagnosticReportId: REPORT.id, loincCode: '718-7', loincDisplay: 'Hemoglobin', valueQuantity: { value: 12.5, unit: 'g/dL' }, valueString: null, interpretation: [{ coding: [{ code: 'L', display: 'Low' }] }], referenceRange: { low: 13, high: 17 }, note: null, effectiveDateTime: '2026-09-14' },
  ])
  render(<LabReportDetail report={REPORT} onBack={() => {}} />)
  expect(await screen.findByText('Hemoglobin')).toBeDefined()
  expect(screen.getByText(/12\.5/)).toBeDefined()
  expect(screen.getByText(/g\/dL/)).toBeDefined()
  expect(screen.getByText(/13\s*[–-]\s*17/)).toBeDefined() // reference range
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F opd-lite test lab-report-detail-viewer`
Expected: FAIL — analyte values not rendered.

- [ ] **Step 3: Implement**

In `LabReportDetail.tsx`:
- On mount, call `fetchDiagnosticReportDetail(report.id, <patientIdderivedfrom report.subject.reference>)` (best-effort refresh) and load analytes from the store via `useLiveQuery(() => db.diagnosticReportObservations.where('diagnosticReportId').equals(report.id).toArray(), [report.id])` (or the file's existing Dexie-read idiom).
- Render an analyte `<table>` when `analytes.length > 0`, one row per analyte: `loincDisplay ?? loincCode` · `valueQuantity.value valueQuantity.unit` (or `valueString`) · reference range `low–high` (or `text`) · flag from `interpretation[0].coding[0].display` (critical/abnormal styled with the `destructive` token, per allergy/critical prominence conventions). Place it above the existing PDF/attachment section. Keep the existing report-level metadata and the `presentedForm` viewer intact for legacy file reports (analyte table simply renders empty/absent when there are no analytes).

Follow the Content Area / table conventions from CLAUDE.md (`<thead className="bg-muted">`, `th` = `px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide`, `<tbody className="divide-y divide-border">`, rows `hover:bg-muted/50`).

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm -F opd-lite test lab-report-detail-viewer`
Expected: PASS.

- [ ] **Step 5: Typecheck + RTL snapshot + commit**

```bash
pnpm -F opd-lite typecheck
pnpm -F opd-lite test lab-report-detail
git add apps/opd-lite/src/components/clinical/LabReportDetail.tsx apps/opd-lite/src/__tests__/lab-report-detail-viewer.test.tsx
git commit -m "feat(opd): render structured lab analytes (value/unit/range/flag) in report detail"
```

---

## Task 9: End-to-end verification (R1 join-key + full loop)

**Files:** none (verification only).

- [ ] **Step 1: R1 integration check (real Supabase).** Using the Supabase MCP, confirm a row written by `lab.submitResult` (patient_ref stored verbatim) is returned by `diagnosticReport.listByPatient` when queried with the real `Patient/<id>` — i.e. `diagnostic_reports.patient_ref === patientBlindRef('Patient/'+realId)`. Read `apps/hub-api/src/lib/patient-ref.ts` to confirm the exact normalization, and verify the lab's `sample.subject.reference` equals that value (it must, since `uploadResult` reports already appear in OPD via the same field). If they do NOT match, STOP — this is the R1 risk; the fix is to normalize `patient_ref` in `submitResult` to match `uploadResult`'s stored value, not to change the read path.

- [ ] **Step 2: Full-loop manual smoke.** In dev: enter a structured result in Lab-Lite → confirm a `diagnostic_reports` row + `diagnostic_report_observations` rows appear (Supabase MCP `execute_sql`) → open the patient in OPD-Lite → confirm the report and its analyte table (value/unit/range/flag) render. Use client-side navigation in OPD (not `goto`) to avoid PHI-cleanup wipes.

- [ ] **Step 3: Run the full affected suites.**

```bash
pnpm -F hub-api test lab-submit-result diagnostic-report-read-observations
pnpm -F lab-lite test result-sync
pnpm -F opd-lite test diagnostic-report-observations-store fetch-report-detail result-grouper lab-report-detail-viewer
pnpm -F hub-api typecheck && pnpm -F lab-lite typecheck && pnpm -F opd-lite typecheck
```
Expected: all green.

- [ ] **Step 4: Update the memory note.** Update `project_lab_result_transport_gap` (memory) to reflect that the loop is now closed via `lab.submitResult` + `diagnostic_report_observations`, or delete it if fully resolved.

---

## Self-Review

**Spec coverage:**
- Hub `lab.submitResult` + child table + notifications → Tasks 1, 2. ✅
- Extended `diagnosticReport.read` → Task 3. ✅
- Lab-Lite drain over existing `syncQueue`, wired in `SyncProvider` → Task 4. ✅
- OPD store + read + render + structured-trend → Tasks 5–8. ✅
- Rule #7 / #6 / #1, R1, status=preliminary, Tier 2 idempotency → Global Constraints + Task 2 tests + Task 9. ✅
- Out-of-scope (amendments, distribution/authorization dead code, Patient-Lite, files) → untouched. ✅

**Placeholder scan:** `<NEXT>` in Task 5 (Dexie version) is an explicit "inspect current max + 1" instruction, not a placeholder — the executor must read the file. patientId derivation in Task 8 references `report.subject.reference` (the existing field). No TBDs.

**Type consistency:** `submitResult` output `{ diagnosticReportId, observationCount }` used in Task 4's fetch envelope check; analyte wire shape (`observationId, loincCode, loincDisplay, valueQuantity, valueString, interpretation, referenceRange, note, effectiveDateTime`) is identical across Task 3 (Hub `read`), Task 6 (OPD fetch), and Task 5 (`LocalReportObservation`, which uses `id` for the local row + the same value fields). `analytesByReportId: Map<string, LocalReportObservation[]>` consistent in Task 7. ✅
