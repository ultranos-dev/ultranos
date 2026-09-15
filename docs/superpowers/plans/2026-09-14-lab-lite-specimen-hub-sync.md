# Lab-Lite Specimen → Hub Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make collected Lab-Lite specimens (create + status changes + rejection) reliably reach the Hub/Supabase via the offline sync queue, and fix the queue-`status` gap that also silently disables the result drain.

**Architecture:** Offline-first enqueue → background drain. `enqueueSyncEvent` is fixed to stamp queue metadata so entries are drainable. A new `drainSpecimenSyncQueue` worker (mirroring `result-sync.ts`) POSTs queued `Specimen` payloads to a new data-minimized `lab.submitSpecimen` Hub endpoint, which upserts into a new `specimens` table. Wired into `SyncProvider` beside the existing drains.

**Tech Stack:** TypeScript, Dexie (IndexedDB), Vitest, `fake-indexeddb`, tRPC, Supabase (Postgres 17, accessed via Supabase MCP), `@ultranos/sync-engine` (HLC), `@ultranos/crypto/server` (field encryption).

**Spec:** `docs/superpowers/specs/2026-09-14-lab-lite-specimen-hub-sync-design.md`

## Global Constraints

- **Data minimization (Rule #7):** `patient_ref` is stored as the **bare blind index** (strip `Patient/`). NEVER store/log the real patient UUID or National ID. The `submitSpecimen` input DTO must reject unknown fields.
- **Audit (Rule #6):** every specimen ingest emits a `SPECIMEN` audit event, opaque IDs only.
- **No PHI in logs (Rule #1):** drain logs shape only; `note` is encrypted at rest.
- **Server-stamped ownership:** `lab_id` and `performer_id` come from `ctx.lab`, never the client payload.
- **DB operations use the Supabase MCP** (`apply_migration`) — never raw psql / manual migration files.
- **Offline-first:** collection never blocks on network; the drain never throws.
- **No autonomous commits:** the commit steps below run only when the human executing the plan authorizes them (CLAUDE.md).
- **Project id (Supabase):** `hqgxvrjccmfjzkhotyib`.

---

## File Structure

- `apps/lab-lite/src/lib/db.ts` — MODIFY `enqueueSyncEvent` to stamp queue metadata defaults.
- `apps/lab-lite/src/__tests__/enqueue-sync-event.test.ts` — CREATE (Task 1).
- Supabase migration `specimens` table — CREATE via MCP (Task 2).
- `apps/hub-api/src/trpc/routers/lab.ts` — MODIFY: add `submitSpecimen` mutation + Zod schema.
- `apps/hub-api/src/__tests__/lab-submit-specimen.test.ts` — CREATE (Task 3).
- `apps/lab-lite/src/lib/specimen-sync.ts` — CREATE `drainSpecimenSyncQueue` (Task 4).
- `apps/lab-lite/src/__tests__/specimen-sync.test.ts` — CREATE (Task 4).
- `apps/lab-lite/src/components/providers/SyncProvider.tsx` — MODIFY: wire the drain (Task 5).

---

### Task 1: Fix `enqueueSyncEvent` to stamp queue metadata (un-breaks results + enables specimens)

**Files:**
- Modify: `apps/lab-lite/src/lib/db.ts` (`enqueueSyncEvent`, ~line 1848)
- Test: `apps/lab-lite/src/__tests__/enqueue-sync-event.test.ts` (create)

**Interfaces:**
- Consumes: `getDb()` from `@/lib/db`.
- Produces: `enqueueSyncEvent(entry)` — after this task, every stored `syncQueue` row has `status: 'pending'` (unless the caller set one), `createdAt: string`, `lastAttemptAt: null`, `retryCount: 0`. Drains that filter `status === 'pending'` now see real entries.

- [ ] **Step 1: Write the failing test**

Create `apps/lab-lite/src/__tests__/enqueue-sync-event.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { getDb, enqueueSyncEvent } from '../lib/db'

describe('enqueueSyncEvent', () => {
  beforeEach(async () => {
    await getDb().table('syncQueue').clear()
  })

  it('stamps status=pending and queue metadata when the caller omits them', async () => {
    await enqueueSyncEvent({
      resourceType: 'Specimen',
      resourceId: 'spec-1',
      payload: { id: 'spec-1' },
      hlcTimestamp: 'hlc-1',
    } as never)

    const rows = await getDb().table('syncQueue').toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      resourceType: 'Specimen',
      resourceId: 'spec-1',
      status: 'pending',
      retryCount: 0,
      lastAttemptAt: null,
      hlcTimestamp: 'hlc-1',
    })
    expect(typeof rows[0].createdAt).toBe('string')
  })

  it('preserves an explicitly provided status and metadata', async () => {
    await enqueueSyncEvent({
      resourceType: 'ShiftHandover',
      resourceId: 'r-2',
      status: 'pending',
      payload: {},
      createdAt: '2026-01-01T00:00:00.000Z',
      lastAttemptAt: null,
      retryCount: 3,
    })
    const row = (await getDb().table('syncQueue').toArray())[0]
    expect(row.retryCount).toBe(3)
    expect(row.createdAt).toBe('2026-01-01T00:00:00.000Z')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F lab-lite test -- enqueue-sync-event`
Expected: FAIL — first test's `status` is `undefined` (not `'pending'`), `retryCount`/`lastAttemptAt` missing.

- [ ] **Step 3: Write minimal implementation**

Replace `enqueueSyncEvent` in `apps/lab-lite/src/lib/db.ts` with:

```ts
/** Enqueue a resource change for sync to the Hub. Stamps queue-management
 * metadata (status/createdAt/retryCount/lastAttemptAt) when the caller omits
 * them so drains that filter on status:'pending' see the entry. */
export async function enqueueSyncEvent(
  entry: {
    resourceType: string
    resourceId: string
    payload: unknown
    status?: SyncQueueEntry['status']
    createdAt?: string
    lastAttemptAt?: string | null
    retryCount?: number
    hlcTimestamp?: string
  },
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

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F lab-lite test -- enqueue-sync-event`
Expected: PASS (both tests).

- [ ] **Step 5: Regression — confirm the result drain now sees real entries**

Append to the same test file:

```ts
import { vi } from 'vitest'
import { drainResultSyncQueue } from '../lib/result-sync'

describe('result drain regression (real enqueue path)', () => {
  beforeEach(async () => { await getDb().table('syncQueue').clear() })

  it('drains a DiagnosticReport enqueued via the real enqueueSyncEvent', async () => {
    ;(global as any).fetch = vi.fn().mockResolvedValue({ ok: true })
    await enqueueSyncEvent({
      resourceType: 'DiagnosticReport',
      resourceId: 'dr-1',
      payload: { diagnosticReport: { id: 'dr-1' }, observations: [] },
      hlcTimestamp: 'hlc',
    } as never)

    const res = await drainResultSyncQueue(async () => 'tok')
    expect(res).toEqual({ synced: 1, failed: 0 })
    const row = (await getDb().table('syncQueue').toArray())[0]
    expect(row.status).toBe('synced')
  })
})
```

Run: `pnpm -F lab-lite test -- enqueue-sync-event`
Expected: PASS — proves the previously-masked result drain now works through the real enqueue path.

- [ ] **Step 6: Commit** (on human authorization)

```bash
git add apps/lab-lite/src/lib/db.ts apps/lab-lite/src/__tests__/enqueue-sync-event.test.ts
git commit -m "fix(lab-lite): enqueueSyncEvent stamps queue metadata so results+specimens drain"
```

---

### Task 2: Create the `specimens` table (Supabase migration via MCP)

**Files:**
- Create: Supabase migration `create_specimens_table` (via `mcp__plugin_supabase__apply_migration`)

**Interfaces:**
- Produces: table `public.specimens` with columns used by Task 3's endpoint:
  `id, lab_sample_id, pipeline_status, fhir_status, specimen_type, patient_ref, service_request_id, received_from, received_time, condition, rejection_reason, note, performer_id, lab_id, hlc_timestamp, _ultranos_created_at, updated_at`.

- [ ] **Step 1: Inspect the current schema (confirm no `specimens` table)**

Call `mcp__plugin_supabase__list_tables` with `{ project_id: "hqgxvrjccmfjzkhotyib", schemas: ["public"], verbose: false }`.
Expected: no `public.specimens` in the list (matches spec §4).

- [ ] **Step 2: Apply the migration**

Call `mcp__plugin_supabase__apply_migration` with `project_id: "hqgxvrjccmfjzkhotyib"`, `name: "create_specimens_table"`, and this SQL:

```sql
CREATE TABLE IF NOT EXISTS specimens (
  id                   UUID PRIMARY KEY,
  lab_sample_id        TEXT NOT NULL,
  pipeline_status      TEXT NOT NULL
                         CHECK (pipeline_status IN
                         ('received','in-processing','completed','reported','rejected')),
  fhir_status          TEXT NOT NULL,
  specimen_type        TEXT,
  patient_ref          TEXT NOT NULL,               -- BARE blind index (Patient/ stripped)
  service_request_id   TEXT,                        -- bare order id; no FK (offline robustness)
  received_from        TEXT,
  received_time        TIMESTAMPTZ,
  condition            TEXT,
  rejection_reason     TEXT,
  note                 TEXT,                         -- encrypted at rest (v1:<base64>)
  performer_id         UUID NOT NULL REFERENCES practitioners(id),
  lab_id               UUID NOT NULL REFERENCES labs(id),
  hlc_timestamp        TEXT NOT NULL,
  _ultranos_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_specimens_patient_ref ON specimens (patient_ref);
CREATE INDEX IF NOT EXISTS idx_specimens_lab          ON specimens (lab_id);
CREATE INDEX IF NOT EXISTS idx_specimens_order        ON specimens (service_request_id);
CREATE INDEX IF NOT EXISTS idx_specimens_status       ON specimens (pipeline_status);

-- PHI table accessed ONLY via the service-role tRPC backend (lab.submitSpecimen).
-- Enable RLS with no anon/authenticated policy = deny-all to client roles;
-- the service role bypasses RLS. This clears the rls_disabled advisory for the
-- new table without exposing it to the anon key.
ALTER TABLE specimens ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 3: Verify the table exists**

Call `mcp__plugin_supabase__list_tables` again (verbose: true) and confirm `public.specimens` exists with the columns above and `rls_enabled: true`.
Expected: table present, RLS enabled, no advisory for `specimens`.

- [ ] **Step 4: (No commit)** — migrations are tracked in Supabase, not the repo. Proceed to Task 3.

---

### Task 3: Hub `lab.submitSpecimen` mutation

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/lab.ts` (add Zod schema near the other `submit*` schemas + the mutation near `submitResult`, ~line 1044)
- Test: `apps/hub-api/src/__tests__/lab-submit-specimen.test.ts` (create)

**Interfaces:**
- Consumes: `labRestrictedProcedure`, `enforceVerifiedOrg`, `enforceEntitlement`, `enforceLabActive`, `AuditLogger`, `encryptField` (`@ultranos/crypto/server`), `getFieldEncryptionKeys`, `compareHlc`/`deserializeHlc` (`@ultranos/sync-engine`), `ctx.lab.{labId,technicianId}`.
- Produces: `lab.submitSpecimen(input) -> { specimenId: string; pipelineStatus: string }`. Input DTO (strict):
  `{ id, labSampleId, pipelineStatus, fhirStatus, specimenType?, subjectReference, serviceRequestRef?, receivedFrom?, receivedTime?, condition?, rejectionReason?, note?, hlcTimestamp }`.

- [ ] **Step 1: Write the failing test**

Create `apps/hub-api/src/__tests__/lab-submit-specimen.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))

const mockAuditEmit = vi.fn().mockResolvedValue({ id: 'audit-1' })
vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({ emit: mockAuditEmit })),
}))
vi.mock('@ultranos/crypto/server', () => ({
  generateBlindIndex: vi.fn((i: string) => `hmac-${i}`),
  encryptField: vi.fn((i: string) => `enc-${i}`),
}))
vi.mock('@/lib/field-encryption', () => ({
  getFieldEncryptionKeys: vi.fn(() => ({ encryptionKey: 'k', hmacKey: 'h' })),
}))

const SPEC_ID = '55555555-5555-5555-5555-555555555555'
const PATIENT_REF = 'Patient/hmac-abc123'

const mockTechSingle = vi.fn()
const mockTechSelect = vi.fn(() => ({ eq: vi.fn(() => ({ single: mockTechSingle })) }))
// specimens: ownership/hlc lookup (.select().eq().maybeSingle()) + upsert()
const specMaybeSingle = vi.fn()
const specUpsert = vi.fn(() => ({ error: null }))
const specSelect = vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: specMaybeSingle })) }))

const mockFrom = vi.fn((table: string) => {
  if (table === 'lab_technicians') return { select: mockTechSelect }
  if (table === 'specimens') return { select: specSelect, upsert: specUpsert }
  if (table === 'organizations') return {
    select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: { id: 'org-1', status: 'ACTIVE', cancelled_at: null }, error: null }) }) }),
  }
  if (table === 'org_subscriptions') return {
    select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ in: vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'sub-1', status: 'ACTIVE' }, error: null }),
      limit: vi.fn().mockResolvedValue({ data: [{ id: 'sub-1', status: 'ACTIVE' }], error: null }),
    }) }) }) }),
  }
  return { select: vi.fn() }
})

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({ from: mockFrom })),
  db: { toRow: (d: any) => d, toRowRaw: (d: any) => d, fromRow: (d: any) => d, fromRows: (d: any[]) => d },
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
function makeInput(over: Record<string, unknown> = {}) {
  return {
    id: SPEC_ID, labSampleId: 'LAB-20260914-0001', pipelineStatus: 'received',
    fhirStatus: 'available', specimenType: 'blood', subjectReference: PATIENT_REF,
    serviceRequestRef: 'ServiceRequest/order-abc', receivedFrom: 'courier-1',
    receivedTime: '2026-09-14T09:00:00.000Z', condition: 'acceptable',
    note: 'left arm draw', hlcTimestamp: '2026-09-14T09:00:00.000Z-0000-node',
    ...over,
  }
}

describe('lab.submitSpecimen', () => {
  beforeEach(() => { vi.clearAllMocks(); specMaybeSingle.mockResolvedValue({ data: null, error: null }) })

  it('upserts a specimen with BARE blind-index patient_ref and server-stamped lab/performer', async () => {
    setupLab()
    const caller = createCallerFactory(createTRPCRouter({ lab: labRouter }))(
      makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-1' }))
    const res = await caller.lab.submitSpecimen(makeInput())
    expect(res).toEqual({ specimenId: SPEC_ID, pipelineStatus: 'received' })
    const row = specUpsert.mock.calls[0]![0]
    expect(row).toMatchObject({
      id: SPEC_ID, patient_ref: 'hmac-abc123', service_request_id: 'order-abc',
      lab_id: 'lab-1', performer_id: 'tech-1', pipeline_status: 'received',
      note: 'enc-left arm draw',
    })
  })

  it('rejects a specimen owned by another lab', async () => {
    setupLab()
    specMaybeSingle.mockResolvedValue({ data: { id: SPEC_ID, lab_id: 'other-lab', hlc_timestamp: 'x' }, error: null })
    const caller = createCallerFactory(createTRPCRouter({ lab: labRouter }))(
      makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-1' }))
    await expect(caller.lab.submitSpecimen(makeInput())).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('skips the write when the stored hlc is newer (newer-wins, idempotent success)', async () => {
    setupLab()
    specMaybeSingle.mockResolvedValue({
      data: { id: SPEC_ID, lab_id: 'lab-1', hlc_timestamp: '2026-09-14T10:00:00.000Z-0000-node' }, error: null })
    const caller = createCallerFactory(createTRPCRouter({ lab: labRouter }))(
      makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-1' }))
    const res = await caller.lab.submitSpecimen(makeInput()) // incoming 09:00 < stored 10:00
    expect(res).toEqual({ specimenId: SPEC_ID, pipelineStatus: 'received' })
    expect(specUpsert).not.toHaveBeenCalled()
  })

  it('emits a SPECIMEN audit event (Rule #6)', async () => {
    setupLab()
    const caller = createCallerFactory(createTRPCRouter({ lab: labRouter }))(
      makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-1' }))
    await caller.lab.submitSpecimen(makeInput())
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE', resourceType: 'SPECIMEN', resourceId: SPEC_ID }))
  })

  it('rejects unknown DTO fields (data minimization)', async () => {
    setupLab()
    const caller = createCallerFactory(createTRPCRouter({ lab: labRouter }))(
      makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-1' }))
    await expect(
      caller.lab.submitSpecimen(makeInput({ nationalId: '123' }) as never),
    ).rejects.toBeDefined()
  })

  it('rejects non-lab roles', async () => {
    const caller = createCallerFactory(createTRPCRouter({ lab: labRouter }))(
      makeCtx({ sub: 'doc-1', role: 'DOCTOR', sessionId: 's1', orgId: 'org-1' }))
    await expect(caller.lab.submitSpecimen(makeInput())).rejects.toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F hub-api test -- lab-submit-specimen`
Expected: FAIL — `caller.lab.submitSpecimen` is not a function.

- [ ] **Step 3: Add the Zod schema**

In `apps/hub-api/src/trpc/routers/lab.ts`, near the other `submit*` schemas, add:

```ts
const submitSpecimenSchema = z.object({
  id: z.string().uuid(),
  labSampleId: z.string().min(1).max(64),
  pipelineStatus: z.enum(['received', 'in-processing', 'completed', 'reported', 'rejected']),
  fhirStatus: z.string().min(1).max(32),
  specimenType: z.string().max(64).optional(),
  subjectReference: z.string().min(1),          // Patient/<blindIndex>
  serviceRequestRef: z.string().optional(),     // ServiceRequest/<orderId>
  receivedFrom: z.string().max(128).optional(),
  receivedTime: z.string().optional(),
  condition: z.string().max(32).optional(),
  rejectionReason: z.string().max(256).optional(),
  note: z.string().max(2000).optional(),
  hlcTimestamp: z.string().min(1),
}).strict()   // .strict() = data-minimization: reject unknown fields (Rule #7)
```

- [ ] **Step 4: Add the mutation**

In the same file, add to the `labRouter` object (mirroring `submitResult`):

```ts
  submitSpecimen: labRestrictedProcedure
    .use(enforceVerifiedOrg())
    .use(enforceEntitlement('LAB_LITE'))
    .use(enforceLabActive())
    .input(submitSpecimenSchema)
    .mutation(async ({ ctx, input }) => {
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      const technicianId = ctx.lab?.technicianId ?? ctx.user.sub
      const labId = ctx.lab?.labId
      if (!labId) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Lab affiliation required' })
      }

      // Ownership + newer-wins lookup.
      const { data: existing, error: lookupError } = await ctx.supabase
        .from('specimens')
        .select('id, lab_id, hlc_timestamp')
        .eq('id', input.id)
        .maybeSingle()
      if (lookupError) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to look up specimen' })
      }
      if (existing && existing.lab_id !== labId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Specimen belongs to another lab' })
      }
      if (existing?.hlc_timestamp) {
        const cmp = compareHlc(deserializeHlc(input.hlcTimestamp), deserializeHlc(existing.hlc_timestamp as string))
        if (cmp <= 0) {
          // Stored state is newer-or-equal — idempotent no-op (prevents stale retries clobbering).
          return { specimenId: input.id, pipelineStatus: input.pipelineStatus }
        }
      }

      const patientRefStored = input.subjectReference.replace(/^Patient\//, '')
      const serviceRequestId = input.serviceRequestRef?.replace(/^ServiceRequest\//, '') ?? null

      const specimenRow: Record<string, unknown> = {
        id: input.id,
        lab_sample_id: input.labSampleId,
        pipeline_status: input.pipelineStatus,
        fhir_status: input.fhirStatus,
        specimen_type: input.specimenType ?? null,
        patient_ref: patientRefStored,
        service_request_id: serviceRequestId,
        received_from: input.receivedFrom ?? null,
        received_time: input.receivedTime ?? null,
        condition: input.condition ?? null,
        rejection_reason: input.rejectionReason ?? null,
        note: input.note ? encryptField(input.note, getFieldEncryptionKeys().encryptionKey) : null,
        performer_id: technicianId,
        lab_id: labId,
        hlc_timestamp: input.hlcTimestamp,
        updated_at: new Date().toISOString(),
      }

      const { error: upsertError } = await ctx.supabase
        .from('specimens')
        .upsert(specimenRow, { onConflict: 'id' })
      if (upsertError) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to write specimen' })
      }

      try {
        await audit.emit({
          action: 'CREATE', resourceType: 'SPECIMEN', resourceId: input.id,
          actorId: technicianId, actorRole: ctx.user.role, outcome: 'SUCCESS', sessionId: ctx.user.sessionId,
          metadata: { submitAction: 'specimen_synced', pipelineStatus: input.pipelineStatus, labId },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'CREATE', resourceType: 'SPECIMEN', resourceId: input.id })
      }

      return { specimenId: input.id, pipelineStatus: input.pipelineStatus }
    }),
```

Ensure the imports exist at the top of `lab.ts` (add any missing):

```ts
import { compareHlc, deserializeHlc } from '@ultranos/sync-engine'
import { encryptField } from '@ultranos/crypto/server'
// getFieldEncryptionKeys, AuditLogger, TRPCError, z, and the enforce* middleware are already imported.
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm -F hub-api test -- lab-submit-specimen`
Expected: PASS (all 6 cases).

- [ ] **Step 6: Typecheck**

Run: `pnpm -F hub-api typecheck`
Expected: no errors.

- [ ] **Step 7: Commit** (on human authorization)

```bash
git add apps/hub-api/src/trpc/routers/lab.ts apps/hub-api/src/__tests__/lab-submit-specimen.test.ts
git commit -m "feat(hub): lab.submitSpecimen ingests data-minimized specimen (bare blind-index, newer-wins)"
```

---

### Task 4: Client `drainSpecimenSyncQueue` worker

**Files:**
- Create: `apps/lab-lite/src/lib/specimen-sync.ts`
- Test: `apps/lab-lite/src/__tests__/specimen-sync.test.ts`

**Interfaces:**
- Consumes: `getDb()` (`@/lib/db`), `getHubApiUrl()` (`@/lib/trpc`), the Hub `lab.submitSpecimen` endpoint (Task 3).
- Produces: `drainSpecimenSyncQueue(getToken: () => Promise<string>) => Promise<{ synced: number; failed: number }>`.

- [ ] **Step 1: Write the failing test**

Create `apps/lab-lite/src/__tests__/specimen-sync.test.ts` (mirrors `result-sync.test.ts`; fixture is a full `FhirSpecimen`, NOT hand-stamped shorthand):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const entries = [
  {
    id: 'Specimen-spec-1-1',
    resourceType: 'Specimen',
    resourceId: 'spec-1',
    status: 'pending',
    payload: {
      id: 'spec-1', resourceType: 'Specimen', status: 'available',
      type: { coding: [{ code: 'blood', display: 'blood' }] },
      subject: { reference: 'Patient/hmac-abc123' },
      request: [{ reference: 'ServiceRequest/order-abc' }],
      receivedTime: '2026-09-14T09:00:00.000Z',
      collection: { collector: { reference: 'Practitioner/courier-1' } },
      note: [{ text: 'left arm draw' }],
      _ultranos: {
        labSampleId: 'LAB-20260914-0001', pipelineStatus: 'received',
        sampleCondition: 'acceptable', hlcTimestamp: 'hlc-1',
      },
    },
    createdAt: 't', lastAttemptAt: null, retryCount: 0,
  },
]
const update = vi.fn()
const fakeQueue = {
  where: () => ({ equals: () => ({ filter: (fn: any) => ({ toArray: async () => entries.filter(fn) }) }) }),
  update,
}
vi.mock('@/lib/db', () => ({ getDb: () => ({ syncQueue: fakeQueue }) }))
vi.mock('@/lib/trpc', () => ({ getHubApiUrl: () => 'http://hub' }))

const { drainSpecimenSyncQueue } = await import('../lib/specimen-sync')

describe('drainSpecimenSyncQueue', () => {
  beforeEach(() => { vi.clearAllMocks(); ;(global as any).fetch = vi.fn() })

  it('maps FhirSpecimen → submitSpecimen DTO and marks synced on 2xx', async () => {
    ;(global.fetch as any).mockResolvedValue({ ok: true })
    const res = await drainSpecimenSyncQueue(async () => 'tok')
    expect(global.fetch).toHaveBeenCalledWith('http://hub/lab.submitSpecimen', expect.objectContaining({ method: 'POST' }))
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body)
    expect(body.json).toMatchObject({
      id: 'spec-1', labSampleId: 'LAB-20260914-0001', pipelineStatus: 'received',
      fhirStatus: 'available', specimenType: 'blood', subjectReference: 'Patient/hmac-abc123',
      serviceRequestRef: 'ServiceRequest/order-abc', receivedFrom: 'Practitioner/courier-1',
      condition: 'acceptable', note: 'left arm draw', hlcTimestamp: 'hlc-1',
    })
    expect(update).toHaveBeenCalledWith('Specimen-spec-1-1', { status: 'synced' })
    expect(res).toEqual({ synced: 1, failed: 0 })
  })

  it('increments retryCount and leaves pending on failure', async () => {
    ;(global.fetch as any).mockResolvedValue({ ok: false, status: 500 })
    const res = await drainSpecimenSyncQueue(async () => 'tok')
    expect(update).toHaveBeenCalledWith('Specimen-spec-1-1', expect.objectContaining({ retryCount: 1 }))
    expect(res).toEqual({ synced: 0, failed: 1 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F lab-lite test -- specimen-sync`
Expected: FAIL — cannot find module `../lib/specimen-sync`.

- [ ] **Step 3: Write the implementation**

Create `apps/lab-lite/src/lib/specimen-sync.ts`:

```ts
/**
 * Specimen Sync — drains collected specimens to the Hub.
 *
 * accessionSample / transitionSampleStatus / rejectSample enqueue the full
 * FhirSpecimen into syncQueue with resourceType='Specimen'. This worker maps
 * each pending entry to the lab.submitSpecimen DTO, POSTs it, and marks synced.
 * Never throws — sync must not block clinical work. PHI-safe logging (shape only).
 */
import { getDb } from './db'
import { getHubApiUrl } from './trpc'

interface FhirSpecimenLike {
  id: string
  status?: string
  type?: { coding?: Array<{ code?: string }> }
  subject?: { reference?: string }
  request?: Array<{ reference?: string }>
  receivedTime?: string
  collection?: { collector?: { reference?: string } }
  note?: Array<{ text?: string }>
  _ultranos?: {
    labSampleId?: string
    pipelineStatus?: string
    sampleCondition?: string
    rejectionReason?: string
    hlcTimestamp?: string
  }
}

function toDto(s: FhirSpecimenLike) {
  return {
    id: s.id,
    labSampleId: s._ultranos?.labSampleId ?? '',
    pipelineStatus: s._ultranos?.pipelineStatus ?? 'received',
    fhirStatus: s.status ?? 'available',
    specimenType: s.type?.coding?.[0]?.code,
    subjectReference: s.subject?.reference ?? '',
    serviceRequestRef: s.request?.[0]?.reference,
    receivedFrom: s.collection?.collector?.reference,
    receivedTime: s.receivedTime,
    condition: s._ultranos?.sampleCondition,
    rejectionReason: s._ultranos?.rejectionReason,
    note: s.note?.[0]?.text,
    hlcTimestamp: s._ultranos?.hlcTimestamp ?? '',
  }
}

export async function drainSpecimenSyncQueue(
  getToken: () => Promise<string>,
): Promise<{ synced: number; failed: number }> {
  const result = { synced: 0, failed: 0 }
  try {
    const db = getDb()
    const pending = await db.syncQueue
      .where('resourceType')
      .equals('Specimen')
      .filter((e: { status: string }) => e.status === 'pending')
      .toArray()
    if (pending.length === 0) return result

    // Oldest-first so status transitions apply in order.
    pending.sort((a: { createdAt?: string }, b: { createdAt?: string }) =>
      (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))

    const token = await getToken()
    for (const entry of pending) {
      try {
        const res = await fetch(`${getHubApiUrl()}/lab.submitSpecimen`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ json: toDto(entry.payload as FhirSpecimenLike) }),
          signal: AbortSignal.timeout(15_000),
        })
        if (res.ok) {
          await db.syncQueue.update(entry.id, { status: 'synced' })
          result.synced++
        } else {
          await db.syncQueue.update(entry.id, {
            retryCount: (entry.retryCount ?? 0) + 1,
            lastAttemptAt: new Date().toISOString(),
          })
          result.failed++
        }
      } catch {
        await db.syncQueue.update(entry.id, {
          retryCount: (entry.retryCount ?? 0) + 1,
          lastAttemptAt: new Date().toISOString(),
        })
        result.failed++
      }
    }
  } catch {
    // Non-fatal — retried next cycle.
  }
  return result
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F lab-lite test -- specimen-sync`
Expected: PASS (both cases).

- [ ] **Step 5: Commit** (on human authorization)

```bash
git add apps/lab-lite/src/lib/specimen-sync.ts apps/lab-lite/src/__tests__/specimen-sync.test.ts
git commit -m "feat(lab-lite): drainSpecimenSyncQueue pushes collected specimens to lab.submitSpecimen"
```

---

### Task 5: Wire `drainSpecimenSyncQueue` into `SyncProvider`

**Files:**
- Modify: `apps/lab-lite/src/components/providers/SyncProvider.tsx`

**Interfaces:**
- Consumes: `drainSpecimenSyncQueue` (Task 4), existing `getToken`, the existing drain triggers.
- Produces: specimens drain on initial-online, the 30s interval, and `online` reconnect (same triggers as the result drain).

- [ ] **Step 1: Add the import**

At the top of `SyncProvider.tsx`, next to the result-sync import:

```ts
import { drainSpecimenSyncQueue } from '@/lib/specimen-sync'
```

- [ ] **Step 2: Add the runner and triggers**

Update the runner block to also drain specimens:

```ts
    // Drain structured lab results (DiagnosticReport) AND collected specimens
    // (Specimen) to the Hub. Reuses the same triggers as the upload drain.
    const runResultDrain = () => {
      void drainResultSyncQueue(getToken)
      void drainSpecimenSyncQueue(getToken)
    }
    if (typeof navigator !== 'undefined' && navigator.onLine) runResultDrain()
```

(The existing `drainInterval` 30s tick and `handleOnline` already call `runResultDrain()`, so no further changes are needed there.)

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm -F lab-lite typecheck && pnpm -F lab-lite lint`
Expected: no errors.

- [ ] **Step 4: Full lab-lite + hub-api test run (no regressions)**

Run: `pnpm -F lab-lite test && pnpm -F hub-api test`
Expected: all green (including `enqueue-sync-event`, `specimen-sync`, `lab-submit-specimen`, and the previously-passing `result-sync`).

- [ ] **Step 5: Commit** (on human authorization)

```bash
git add apps/lab-lite/src/components/providers/SyncProvider.tsx
git commit -m "feat(lab-lite): wire specimen drain into SyncProvider"
```

---

## Self-Review

**Spec coverage:**
- §5.0 root fix → Task 1. ✅
- §5.1 `specimens` table (bare blind index, encrypted note, server-stamped, no order FK, RLS) → Task 2 + enforced in Task 3. ✅
- §5.2 `lab.submitSpecimen` (guard chain, ownership, newer-wins, idempotent upsert, data-min DTO, audit) → Task 3. ✅
- §5.3 `drainSpecimenSyncQueue` (mapping, oldest-first, marks synced/retry, SyncProvider wiring) → Tasks 4 + 5. ✅
- §5.4 Tier-3 newer-wins semantics → Task 3 (`compareHlc` guard). ✅
- §6 data-min/audit/encryption/server-stamp → Tasks 2 + 3. ✅
- §8 testing (incl. the "no hand-stamped status" guard) → Task 4 Step 1 uses a full FhirSpecimen fixture; Task 1 Step 5 regression proves the real enqueue path drains. ✅

**Placeholder scan:** No TBD/TODO; all code steps contain runnable code. ✅

**Type consistency:** DTO field names identical across Task 3 schema, Task 3 `specimenRow`, and Task 4 `toDto`; `drainSpecimenSyncQueue` signature matches the SyncProvider call and the test. Column names match the Task 2 DDL. ✅

**Deviation from spec §5.2 (noted):** the client posts inline via `fetch` (matching the `result-sync.ts` precedent) rather than adding a `submitSpecimen` wrapper to `trpc.ts` — DRY with the established drain pattern; the endpoint contract is unchanged.

---

## Out of scope (tracked follow-up)

The local "collected samples disappear from the UI" symptom is independent of Hub sync and is NOT addressed here:
- `usePrioritizedWorklist.ts:108` silent-drop of samples with a missing order row.
- `accessionSample` not advancing the local order + `useOrderSync.ts:134` tombstone flipping collected orders to `CANCELLED`.

Recommend a separate spec/plan for the display fixes.
