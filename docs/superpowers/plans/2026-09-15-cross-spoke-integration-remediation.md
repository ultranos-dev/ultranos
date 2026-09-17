# Cross-Spoke Integration Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the verified cross-spoke integration gaps — complete the pharmacy→lab Therapeutic Drug Monitoring (TDM) feature end-to-end, enforce the drug-interaction gate on the pharmacy dispense server path, and harden two P1 reliability items.

**Architecture:** Hub-and-spoke. Pharmacy `recordDispense` emits a data-minimized monitoring event into a new Hub table; lab-lite pulls it via a new `labRestrictedProcedure` endpoint (keyset cursor, mirroring `lab.pullOrders`) and feeds the already-written `processBatchDispenseEvents`. Drug identity is unified on **ATC codes** (the catalog's canonical key). Lab-side monitoring persistence (missing today — tests mock the db) is built as a prerequisite.

**Tech Stack:** Next.js 15 (hub-api tRPC + spoke PWAs), TypeScript, PostgreSQL 16 via Supabase MCP, Dexie (IndexedDB), Vitest, prom-client, Zod.

**Spec:** `docs/superpowers/specs/2026-09-15-cross-spoke-integration-remediation-design.md` (read it first — the plan argues from it).

## Global Constraints

- **Rule #3 (no silent safety failures):** unmapped/unresolved drug codes and skipped notifications must be *observable* (prom-client metric + audit), never a silent `return`.
- **Rule #6 (audit all PHI):** every new endpoint/producer emits a structured audit event via `new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined).emit({ action, resourceType, resourceId, actorId, actorRole, outcome, sessionId, metadata })`; best-effort try/catch-and-`console.warn('[AUDIT_FAILURE]', …)` for read/side-effect paths.
- **Rule #7 (lab data minimization):** lab-facing output = first name + age + opaque `Patient/<blindIndex>` only. **Never** the real patient UUID or National ID. Blind index via `patientBlindRef()` / `generateBlindIndex(patient_id, hmacKey)`. Enforce with strict Zod `.output()` schemas.
- **Offline-first:** all transport pull-based; delivery at-least-once; consumers idempotent.
- **HLC ordering:** carry `hlcTimestamp` end-to-end; never `Date.now()` for clinical ordering.
- **DB ops:** schema changes ONLY via Supabase MCP (`mcp__plugin_supabase_supabase__apply_migration`). Never hand-run SQL/psql.
- **Lab endpoints** use `labRestrictedProcedure.use(enforceLabActive())` — NOT `enforceEntitlement` (match `lab.pullOrders`).
- **Git:** per CLAUDE.md, the executor commits ONLY when the user explicitly instructs. The commit step in each task is the intended boundary; do not auto-commit without that instruction.
- **ui-kit:** no UI-component work here; if any dashboard tweak is needed it goes in `packages/ui-kit/src` + rebuild, never app-local.

---

## Phase A — P0.2: Enforce interaction check on `recordDispense`

Independent of everything else. Smallest pure-safety win. Do first.

### Task 1: Server-side interaction gate on the pharmacy dispense path

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/medication.ts` (`recordDispense`, prescription fetch ~line 824 + gate insertion before the dispense insert ~line 917)
- Test: `apps/hub-api/src/__tests__/record-dispense-interaction-gate.test.ts` (create)

**Interfaces:**
- Consumes: existing `recordDispense` input `{ prescriptionId, dispenseId, overrideReason?, … }`; the `complete` gate at `medication.ts:1215-1226` is the reference behavior.
- Produces: no new exported symbols; behavioral change only.

- [ ] **Step 1: Write the failing test**

```ts
// apps/hub-api/src/__tests__/record-dispense-interaction-gate.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { appRouter } from '../trpc/routers/_app'
import { makeTestCtx, seedPrescription } from './helpers/medication-test-utils' // existing test harness

describe('recordDispense interaction gate (P0.2)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects a BLOCKED prescription with no override', async () => {
    const ctx = makeTestCtx({ role: 'PHARMACIST' })
    await seedPrescription(ctx, { id: 'rx-blocked', interaction_check: 'BLOCKED', prescription_status: 'ACTIVE' })
    const caller = appRouter.createCaller(ctx)
    await expect(
      caller.medication.recordDispense({ prescriptionId: 'rx-blocked', dispenseId: crypto.randomUUID(), medicationCode: 'B01AA03', medicationDisplay: 'Warfarin', patientRef: 'Patient/p1', pharmacistRef: 'Practitioner/ph1', whenHandedOver: new Date().toISOString(), hlcTimestamp: '1', status: 'completed' }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' })
  })

  it('rejects UNAVAILABLE with no override', async () => {
    const ctx = makeTestCtx({ role: 'PHARMACIST' })
    await seedPrescription(ctx, { id: 'rx-unavail', interaction_check: 'UNAVAILABLE', prescription_status: 'ACTIVE' })
    const caller = appRouter.createCaller(ctx)
    await expect(
      caller.medication.recordDispense({ prescriptionId: 'rx-unavail', dispenseId: crypto.randomUUID(), medicationCode: 'B01AA03', medicationDisplay: 'Warfarin', patientRef: 'Patient/p1', pharmacistRef: 'Practitioner/ph1', whenHandedOver: new Date().toISOString(), hlcTimestamp: '1', status: 'completed' }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' })
  })

  it('ALLOWS a BLOCKED prescription WITH an overrideReason', async () => {
    const ctx = makeTestCtx({ role: 'PHARMACIST' })
    await seedPrescription(ctx, { id: 'rx-ovr', interaction_check: 'BLOCKED', prescription_status: 'ACTIVE' })
    const caller = appRouter.createCaller(ctx)
    const res = await caller.medication.recordDispense({ prescriptionId: 'rx-ovr', dispenseId: crypto.randomUUID(), medicationCode: 'B01AA03', medicationDisplay: 'Warfarin', patientRef: 'Patient/p1', pharmacistRef: 'Practitioner/ph1', whenHandedOver: new Date().toISOString(), hlcTimestamp: '1', status: 'completed', overrideReason: 'Prescriber consulted; benefit outweighs risk' })
    expect(res.success).toBe(true)
  })

  it('allows CLEAR without override', async () => {
    const ctx = makeTestCtx({ role: 'PHARMACIST' })
    await seedPrescription(ctx, { id: 'rx-clear', interaction_check: 'CLEAR', prescription_status: 'ACTIVE' })
    const caller = appRouter.createCaller(ctx)
    const res = await caller.medication.recordDispense({ prescriptionId: 'rx-clear', dispenseId: crypto.randomUUID(), medicationCode: 'B01AA03', medicationDisplay: 'Warfarin', patientRef: 'Patient/p1', pharmacistRef: 'Practitioner/ph1', whenHandedOver: new Date().toISOString(), hlcTimestamp: '1', status: 'completed' })
    expect(res.success).toBe(true)
  })
})
```

> If `makeTestCtx`/`seedPrescription` helpers don't exist under that path, mirror the harness used by the nearest existing `medication.ts` router test (find it with: search `__tests__` for `recordDispense`). Reuse that file's setup verbatim rather than inventing a new one.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F hub-api test record-dispense-interaction-gate`
Expected: FAIL — BLOCKED/UNAVAILABLE dispenses currently succeed (no gate).

- [ ] **Step 3: Add `interaction_check` to the prescription fetch**

In `recordDispense`, extend the select (currently `medication.ts:824`):

```ts
const { data: currentRx, error: fetchError } = await ctx.supabase
  .from('medication_requests')
  .select('id, prescription_status, status, hlc_timestamp, requester_id, interaction_check')
  .eq('id', input.prescriptionId)
  .single()
```

- [ ] **Step 4: Insert the gate (after status checks, before the dispense insert ~line 917)**

```ts
// CLAUDE.md Rule #3: mirror the `complete` gate — do not let the pharmacy dispense
// path bypass the interaction check the prescriber recorded. The legitimate
// override flow (supervisor reason captured client-side) is preserved via
// input.overrideReason, which already creates a PENDING dispense_reviews row below.
if (!input.overrideReason) {
  if (currentRx.interaction_check === 'BLOCKED') {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Prescription has a blocked drug interaction — dispense requires a supervisor override.' })
  }
  if (currentRx.interaction_check === 'UNAVAILABLE') {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Drug interaction check was unavailable — dispense requires a supervisor override.' })
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm -F hub-api test record-dispense-interaction-gate`
Expected: PASS (all 4). Then `pnpm -F hub-api test medication` to confirm no regression in existing dispense tests.

- [ ] **Step 6: Commit** (only on user instruction)

```bash
git add apps/hub-api/src/trpc/routers/medication.ts apps/hub-api/src/__tests__/record-dispense-interaction-gate.test.ts
git commit -m "fix(hub): enforce interaction_check on recordDispense (defense-in-depth, Rule #3)"
```

---

## Phase B — P0.1: Complete the pharmacy→lab TDM transport

### Task 2: Shared types for monitoring transport

**Files:**
- Create: `packages/shared-types/src/monitoring.ts`
- Modify: `packages/shared-types/src/index.ts` (re-export)
- Test: `packages/shared-types/src/__tests__/monitoring.test.ts` (create — type-shape smoke test)

**Interfaces:**
- Produces (consumed by Tasks 4,5,6,7,9,10):
  - `MonitoringTestSpec { loincCode: string; testDisplay: string; frequencyDays: number; initialDelayDays: number; priority: 'routine' | 'urgent' }`
  - `MedicationLabMapping { atcCode: string; medicationDisplay: string; version: number; requiredTests: MonitoringTestSpec[] }`
  - `DispenseMonitoringEventDTO { dispensingEventId: string; patientRef: string; patientFirstName: string; patientAge: number | null; atcCode: string; medicationDisplay: string; dispensedAt: string; orderingPractitionerRef: string; hlcTimestamp: string }`

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared-types/src/__tests__/monitoring.test.ts
import { describe, it, expect } from 'vitest'
import type { MedicationLabMapping, DispenseMonitoringEventDTO } from '../monitoring'

describe('monitoring shared types', () => {
  it('MedicationLabMapping is ATC-keyed', () => {
    const m: MedicationLabMapping = { atcCode: 'B01AA03', medicationDisplay: 'Warfarin', version: 1, requiredTests: [{ loincCode: '6301-6', testDisplay: 'INR', frequencyDays: 14, initialDelayDays: 3, priority: 'urgent' }] }
    expect(m.atcCode).toBe('B01AA03')
  })
  it('DispenseMonitoringEventDTO carries a blind patientRef, never a raw uuid field', () => {
    const e: DispenseMonitoringEventDTO = { dispensingEventId: 'd1', patientRef: 'Patient/abc', patientFirstName: 'Ali', patientAge: 40, atcCode: 'B01AA03', medicationDisplay: 'Warfarin', dispensedAt: '2026-09-15', orderingPractitionerRef: 'ref', hlcTimestamp: '1' }
    expect('patientId' in e).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F @ultranos/shared-types test monitoring`
Expected: FAIL — module `../monitoring` not found.

- [ ] **Step 3: Create the types**

```ts
// packages/shared-types/src/monitoring.ts
export interface MonitoringTestSpec {
  loincCode: string
  testDisplay: string
  frequencyDays: number
  initialDelayDays: number
  priority: 'routine' | 'urgent'
}

export interface MedicationLabMapping {
  atcCode: string
  medicationDisplay: string
  version: number
  requiredTests: MonitoringTestSpec[]
}

/** Data-minimized dispense→monitoring event as delivered to the lab (Rule #7). */
export interface DispenseMonitoringEventDTO {
  dispensingEventId: string
  patientRef: string          // "Patient/<blindIndex>" — never the raw UUID
  patientFirstName: string
  patientAge: number | null
  atcCode: string
  medicationDisplay: string
  dispensedAt: string
  orderingPractitionerRef: string
  hlcTimestamp: string
}
```

- [ ] **Step 4: Re-export from the package index**

Add to `packages/shared-types/src/index.ts`:

```ts
export * from './monitoring'
```

- [ ] **Step 5: Run test + build**

Run: `pnpm -F @ultranos/shared-types test monitoring && pnpm -F @ultranos/shared-types build`
Expected: PASS + clean build (dist emitted).

- [ ] **Step 6: Commit** (only on user instruction)

```bash
git add packages/shared-types/src/monitoring.ts packages/shared-types/src/index.ts packages/shared-types/src/__tests__/monitoring.test.ts
git commit -m "feat(shared-types): add ATC-keyed monitoring transport types"
```

### Task 3: Database migrations — `medication_lab_mappings` + `dispense_monitoring_events`

**Files:**
- Migration applied via Supabase MCP `apply_migration` (name: `cross_spoke_tdm_monitoring`)
- Reference-only note: record the SQL in `docs/superpowers/plans/2026-09-15-cross-spoke-integration-remediation.md` (this file) for review.

**Interfaces:**
- Produces: tables `medication_lab_mappings`, `dispense_monitoring_events` (consumed by Tasks 4,5,6).

- [ ] **Step 1: Inspect current schema**

Use `mcp__plugin_supabase_supabase__list_tables` and confirm `medication_requests`, `patients`, `drug_catalog`, `drug_brands` exist and note the `patients` columns used for name/age (`name_given`, `birth_date`, `birth_year` — per `lab.pullOrders`).

- [ ] **Step 2: Apply the migration**

Use `mcp__plugin_supabase_supabase__apply_migration` with name `cross_spoke_tdm_monitoring` and SQL:

```sql
-- Hub-authoritative medication→lab monitoring reference (non-PHI clinical reference data)
create table if not exists medication_lab_mappings (
  atc_code text primary key,
  medication_display text not null,
  required_tests jsonb not null,        -- MonitoringTestSpec[]
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

-- Hub-internal dispense→monitoring event log; projected data-minimized to lab on pull
create table if not exists dispense_monitoring_events (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  dispensing_event_id uuid not null,
  patient_id uuid not null references patients(id),   -- Hub-internal ONLY; never serialized to lab
  atc_code text not null,
  medication_display text not null,
  dispensed_at timestamptz not null,
  ordering_practitioner_ref text,
  hlc_timestamp text not null,
  created_at timestamptz not null default now()
);
create index if not exists dme_seq_idx on dispense_monitoring_events (seq);
create index if not exists dme_dispensing_event_idx on dispense_monitoring_events (dispensing_event_id);
```

- [ ] **Step 3: Verify + regenerate types**

Run `mcp__plugin_supabase_supabase__list_migrations` (confirm applied) and `mcp__plugin_supabase_supabase__generate_typescript_types`; update the hub-api generated types file if the repo checks it in.

- [ ] **Step 4: Advisors check**

Run `mcp__plugin_supabase_supabase__get_advisors` (security + performance) and address any RLS/index warning the new tables raise, matching the RLS posture of neighboring tables (`service_requests`, `medication_dispenses`).

- [ ] **Step 5: Commit** (only on user instruction — commit any checked-in generated types)

```bash
git add apps/hub-api/src/**/database.types.ts
git commit -m "feat(hub): add medication_lab_mappings + dispense_monitoring_events tables"
```

> The `medication_lab_mappings` **seed** is Task 8 (blocked on clinical sign-off of ATC codes). This task creates the empty tables only.

### Task 4: ATC resolver + monitoring event producer in `recordDispense`

**Files:**
- Create: `apps/hub-api/src/lib/atc-resolver.ts`
- Create: `apps/hub-api/src/lib/clinical-safety-metrics.ts` additions (append counters)
- Modify: `apps/hub-api/src/trpc/routers/medication.ts` (`recordDispense`, after the prescriber-notification block ~line 1152)
- Test: `apps/hub-api/src/__tests__/atc-resolver.test.ts`, `apps/hub-api/src/__tests__/dispense-monitoring-producer.test.ts`

**Interfaces:**
- Consumes: `drug_catalog` (`atc_code`), `drug_brands` (`generic_atc_code`), `medication_lab_mappings`, `dispense_monitoring_events` (Task 3); `recordDispense` input.
- Produces: `resolveCanonicalAtc(supabase, medicationCode): Promise<string | null>`; counters `dispenseMonitoringEventsTotal`, `dispenseMonitoringUnresolvedCodeTotal`.

- [ ] **Step 1: Write the failing resolver test**

```ts
// apps/hub-api/src/__tests__/atc-resolver.test.ts
import { describe, it, expect } from 'vitest'
import { resolveCanonicalAtc } from '../lib/atc-resolver'

const fakeSupabase = (rows: Record<string, any>) => ({
  from: (table: string) => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: rows[table] ?? null }) }) }),
  }),
}) as any

describe('resolveCanonicalAtc', () => {
  it('returns the ATC when the code matches a catalog row', async () => {
    expect(await resolveCanonicalAtc(fakeSupabase({ drug_catalog: { atc_code: 'B01AA03' } }), 'B01AA03')).toBe('B01AA03')
  })
  it('trusts an ATC-shaped code even when not in the catalog', async () => {
    expect(await resolveCanonicalAtc(fakeSupabase({}), 'N05AN01')).toBe('N05AN01')
  })
  it('returns null for an unresolvable local code', async () => {
    expect(await resolveCanonicalAtc(fakeSupabase({}), 'LOCAL-999')).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm -F hub-api test atc-resolver`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the resolver**

```ts
// apps/hub-api/src/lib/atc-resolver.ts
import type { SupabaseClient } from '@supabase/supabase-js'

// WHO ATC 5th-level shape, e.g. B01AA03, N05AN01
const ATC_SHAPE = /^[A-Z]\d{2}[A-Z]{2}\d{2}$/

/**
 * Resolve a dispensed medication code to its canonical ATC code.
 * Order: exact catalog match → ATC-shape trust → unresolvable (null).
 * Brand→generic resolution is intentionally omitted (YAGNI): dispenses carry
 * generic ATC-shaped codes today; an unresolved code is made observable by the
 * caller (metric + audit) so any real brand-code gap surfaces before we build it.
 */
export async function resolveCanonicalAtc(
  supabase: SupabaseClient,
  medicationCode: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('drug_catalog')
    .select('atc_code')
    .eq('atc_code', medicationCode)
    .maybeSingle()
  if (data?.atc_code) return data.atc_code as string
  if (ATC_SHAPE.test(medicationCode)) return medicationCode
  return null
}
```

- [ ] **Step 4: Add metrics**

Append to `apps/hub-api/src/lib/clinical-safety-metrics.ts` (follow the existing `new Counter({ name, help, labelNames })` pattern at line 18):

```ts
export const dispenseMonitoringEventsTotal = new Counter({
  name: 'dispense_monitoring_events_total',
  help: 'Monitoring events emitted on dispense of a monitored medication',
})
export const dispenseMonitoringUnresolvedCodeTotal = new Counter({
  name: 'dispense_monitoring_unresolved_code_total',
  help: 'Dispenses whose medication code could not be resolved to a canonical ATC (Rule #3 observability)',
})
```

- [ ] **Step 5: Write the failing producer test**

```ts
// apps/hub-api/src/__tests__/dispense-monitoring-producer.test.ts
// Assert: a completed dispense of a monitored ATC inserts exactly one
// dispense_monitoring_events row; a non-monitored drug inserts none;
// an unresolved code inserts none AND emits MONITORING_CODE_UNRESOLVED audit.
// Reuse the recordDispense test harness (Task 1). Spy on ctx.supabase.from('dispense_monitoring_events').insert.
```

Write the three concrete cases against the same harness Task 1 used (monitored ATC seeded in `medication_lab_mappings`; non-monitored ATC; a `LOCAL-999` code). Assert insert call counts and the audit spy.

- [ ] **Step 6: Run to verify fail**

Run: `pnpm -F hub-api test dispense-monitoring-producer`
Expected: FAIL — producer not yet added.

- [ ] **Step 7: Add the producer block in `recordDispense`**

After the prescriber-notification block (~`medication.ts:1152`), before `return`:

```ts
// Story 52.1: fan out a data-minimized monitoring event when a MONITORED drug is
// dispensed. Best-effort — the dispense is committed and must not roll back here.
if (input.status === 'completed') {
  try {
    const atc = await resolveCanonicalAtc(ctx.supabase, input.medicationCode)
    if (!atc) {
      dispenseMonitoringUnresolvedCodeTotal.inc()
      const a = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await a.emit({ action: 'MONITORING_CODE_UNRESOLVED', resourceType: 'MEDICATION_DISPENSE', resourceId: input.dispenseId, actorId: ctx.user.sub, actorRole: ctx.user.role, outcome: 'SUCCESS', sessionId: ctx.user.sessionId, metadata: { reason: 'atc_unresolved' } })
      } catch { console.warn('[AUDIT_FAILURE]', { action: 'MONITORING_CODE_UNRESOLVED' }) }
    } else {
      const { data: mapping } = await ctx.supabase
        .from('medication_lab_mappings').select('atc_code, medication_display').eq('atc_code', atc).maybeSingle()
      if (mapping) {
        const realPatientId = input.patientRef.replace(/^Patient\//, '')
        await ctx.supabase.from('dispense_monitoring_events').insert({
          dispensing_event_id: input.dispenseId,
          patient_id: realPatientId,
          atc_code: atc,
          medication_display: mapping.medication_display ?? input.medicationDisplay,
          dispensed_at: input.whenHandedOver,
          ordering_practitioner_ref: currentRx.requester_id ?? null,
          hlc_timestamp: input.hlcTimestamp,
        })
        dispenseMonitoringEventsTotal.inc()
        const a = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
        try {
          await a.emit({ action: 'CREATE', resourceType: 'DISPENSE_MONITORING_EVENT', resourceId: input.dispenseId, actorId: ctx.user.sub, actorRole: ctx.user.role, outcome: 'SUCCESS', sessionId: ctx.user.sessionId, metadata: { atcCode: atc } })
        } catch { console.warn('[AUDIT_FAILURE]', { action: 'CREATE', resourceType: 'DISPENSE_MONITORING_EVENT' }) }
      }
    }
  } catch {
    console.warn('[MONITORING] dispense monitoring emit failed', { dispenseId: input.dispenseId })
  }
}
```

Add the import at the top of `medication.ts`:

```ts
import { resolveCanonicalAtc } from '@/lib/atc-resolver'
import { dispenseMonitoringEventsTotal, dispenseMonitoringUnresolvedCodeTotal } from '@/lib/clinical-safety-metrics'
```

- [ ] **Step 8: Run tests**

Run: `pnpm -F hub-api test atc-resolver dispense-monitoring-producer && pnpm -F hub-api test record-dispense-interaction-gate`
Expected: PASS. The producer failure path must NOT fail a dispense (assert `recordDispense` still returns success when the monitoring insert throws — add a case forcing the insert to reject).

- [ ] **Step 9: Commit** (only on user instruction)

```bash
git add apps/hub-api/src/lib/atc-resolver.ts apps/hub-api/src/lib/clinical-safety-metrics.ts apps/hub-api/src/trpc/routers/medication.ts apps/hub-api/src/__tests__/atc-resolver.test.ts apps/hub-api/src/__tests__/dispense-monitoring-producer.test.ts
git commit -m "feat(hub): emit data-minimized dispense monitoring events (Story 52.1 producer)"
```

### Task 5: `lab.pullDispenseMonitoringEvents` endpoint

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/lab.ts` (add endpoint next to `pullOrders` ~line 1904)
- Modify: `apps/hub-api/src/lib/clinical-safety-metrics.ts` (add `monitoringPullEventsTotal`)
- Test: `apps/hub-api/src/__tests__/lab-pull-monitoring-events.test.ts`

**Interfaces:**
- Consumes: `dispense_monitoring_events` join `patients`; `patientBlindRef`/`generateBlindIndex`; `computeAge` (already used in `pullOrders`).
- Produces: query `lab.pullDispenseMonitoringEvents({ since?, cursor?, limit? }) → { events: DispenseMonitoringEventDTO[]; nextCursor: number | null }`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/hub-api/src/__tests__/lab-pull-monitoring-events.test.ts
// Assert: output rows carry patientRef = "Patient/<blindIndex>" (NOT the raw uuid),
// firstName + age only; the strict .output() schema rejects a patient_id field;
// keyset pagination advances by seq; a READ audit event is emitted.
// Model the harness on the existing lab.pullOrders test (order-data-minimization.test.ts).
```

Write concrete assertions: seed two events, pull with `limit: 1`, assert `nextCursor` non-null then null; assert `events[0].patientRef.startsWith('Patient/')` and does not equal the seeded raw uuid; assert no `patientId`/`patient_id` key on the event.

- [ ] **Step 2: Run to verify fail**

Run: `pnpm -F hub-api test lab-pull-monitoring-events`
Expected: FAIL — endpoint missing.

- [ ] **Step 3: Add the metric**

```ts
export const monitoringPullEventsTotal = new Counter({
  name: 'monitoring_pull_events_total',
  help: 'Dispense monitoring events served to labs via pullDispenseMonitoringEvents',
})
```

- [ ] **Step 4: Implement the endpoint** (mirror `pullOrders` — `medication.ts` blind-index + audit patterns)

```ts
pullDispenseMonitoringEvents: labRestrictedProcedure
  .use(enforceLabActive())
  .input(z.object({
    since: z.string().datetime({ offset: true }).optional(),
    cursor: z.number().int().nonnegative().optional(),
    limit: z.number().int().min(1).max(200).default(100),
  }))
  .output(z.object({
    events: z.array(z.object({
      dispensingEventId: z.string(),
      patientRef: z.string(),
      patientFirstName: z.string(),
      patientAge: z.number().nullable(),
      atcCode: z.string(),
      medicationDisplay: z.string(),
      dispensedAt: z.string(),
      orderingPractitionerRef: z.string(),
      hlcTimestamp: z.string(),
    })),
    nextCursor: z.number().nullable(),
  }))
  .query(async ({ ctx, input }) => {
    const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
    const labId = ctx.lab?.labId
    const technicianId = ctx.lab?.technicianId ?? ctx.user.sub

    let query = ctx.supabase
      .from('dispense_monitoring_events')
      .select('id, seq, dispensing_event_id, patient_id, atc_code, medication_display, dispensed_at, ordering_practitioner_ref, hlc_timestamp, created_at, patients!inner(name_given, birth_date, birth_year)')
      .order('seq', { ascending: true })
      .limit(input.limit)
    if (input.since) query = query.gte('created_at', input.since)
    if (input.cursor != null) query = query.gt('seq', input.cursor)

    const { data: rows, error } = await query
    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch monitoring events' })

    try {
      await audit.emit({ action: 'READ', resourceType: 'DISPENSE_MONITORING_EVENT', resourceId: 'monitoring-pull', actorId: technicianId, actorRole: ctx.user.role, outcome: 'SUCCESS', sessionId: ctx.user.sessionId, metadata: { eventCount: (rows ?? []).length, labId: labId ?? 'admin', since: input.since ?? null } })
    } catch { console.warn('[AUDIT_FAILURE]', { action: 'READ', resourceType: 'DISPENSE_MONITORING_EVENT' }) }

    const { hmacKey } = await getFieldEncryptionKeys()
    const events = (rows ?? []).map((r: any) => ({
      dispensingEventId: r.dispensing_event_id,
      patientRef: `Patient/${generateBlindIndex(r.patient_id, hmacKey)}`,
      patientFirstName: r.patients?.name_given ?? '',
      patientAge: computeAge(r.patients?.birth_date, r.patients?.birth_year),
      atcCode: r.atc_code,
      medicationDisplay: r.medication_display,
      dispensedAt: r.dispensed_at,
      orderingPractitionerRef: r.ordering_practitioner_ref ?? '',
      hlcTimestamp: r.hlc_timestamp,
    }))
    monitoringPullEventsTotal.inc((rows ?? []).length)
    const last = (rows ?? [])[(rows ?? []).length - 1] as any
    const nextCursor = (rows ?? []).length === input.limit && last ? (last.seq as number) : null
    return { events, nextCursor }
  }),
```

> `computeAge` is already imported/used by `pullOrders` in this file — reuse it. Do not re-import lucide/etc.

- [ ] **Step 5: Run tests**

Run: `pnpm -F hub-api test lab-pull-monitoring-events`
Expected: PASS — including the schema-rejects-`patient_id` assertion.

- [ ] **Step 6: Commit** (only on user instruction)

```bash
git add apps/hub-api/src/trpc/routers/lab.ts apps/hub-api/src/lib/clinical-safety-metrics.ts apps/hub-api/src/__tests__/lab-pull-monitoring-events.test.ts
git commit -m "feat(hub): lab.pullDispenseMonitoringEvents (data-minimized, keyset, audited)"
```

### Task 6: `lab.pullMonitoringMappings` endpoint

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/lab.ts`
- Test: `apps/hub-api/src/__tests__/lab-pull-monitoring-mappings.test.ts`

**Interfaces:**
- Consumes: `medication_lab_mappings` (Task 3).
- Produces: query `lab.pullMonitoringMappings({ sinceVersion?: number }) → { mappings: MedicationLabMapping[] }` (non-PHI reference data).

- [ ] **Step 1: Write the failing test** — seed two mappings; assert both returned; assert `sinceVersion` filters to only newer versions.

- [ ] **Step 2: Run to verify fail** — `pnpm -F hub-api test lab-pull-monitoring-mappings` → FAIL.

- [ ] **Step 3: Implement**

```ts
pullMonitoringMappings: labRestrictedProcedure
  .use(enforceLabActive())
  .input(z.object({ sinceVersion: z.number().int().nonnegative().optional() }))
  .output(z.object({ mappings: z.array(z.object({
    atcCode: z.string(), medicationDisplay: z.string(), version: z.number(),
    requiredTests: z.array(z.object({ loincCode: z.string(), testDisplay: z.string(), frequencyDays: z.number(), initialDelayDays: z.number(), priority: z.enum(['routine', 'urgent']) })),
  })) }))
  .query(async ({ ctx, input }) => {
    let q = ctx.supabase.from('medication_lab_mappings').select('atc_code, medication_display, required_tests, version')
    if (input.sinceVersion != null) q = q.gt('version', input.sinceVersion)
    const { data, error } = await q
    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch monitoring mappings' })
    return { mappings: (data ?? []).map((m: any) => ({ atcCode: m.atc_code, medicationDisplay: m.medication_display, version: m.version, requiredTests: m.required_tests })) }
  }),
```

- [ ] **Step 4: Run tests** — `pnpm -F hub-api test lab-pull-monitoring-mappings` → PASS.

- [ ] **Step 5: Commit** (only on user instruction)

```bash
git add apps/hub-api/src/trpc/routers/lab.ts apps/hub-api/src/__tests__/lab-pull-monitoring-mappings.test.ts
git commit -m "feat(hub): lab.pullMonitoringMappings for offline override refresh"
```

### Task 7: Lab persistence — Dexie `monitoringFlags` + `medicationLabMappings` stores (finding 1b)

**Files:**
- Modify: `apps/lab-lite/src/lib/db.ts` (new Dexie version bump; add `MonitoringFlag` type, `monitoringFlags` + `medicationLabMappings` stores, accessors)
- Test: `apps/lab-lite/src/__tests__/monitoring-flags-db.test.ts` (create — REAL fake-indexeddb, no `vi.mock('../lib/db')`)

**Interfaces:**
- Consumes: nothing new.
- Produces (consumed by Tasks 8,10 and the existing monitoring modules): `type MonitoringFlag`; store `monitoringFlags` with compound index `[patientRef+medicationCode+testRequired]` + `status` + `dueDate`; store `medicationLabMappings` keyed `atcCode`; accessors `getMonitoringFlags()`, `getDueMonitoringFlags()`, `putMedicationLabMappings(m: MedicationLabMapping[])`, `getMedicationLabMappingsMap(): Promise<Map<string, MedicationLabMapping>>`.

- [ ] **Step 1: Confirm the current gap**

Search `apps/lab-lite/src/lib/db.ts` for `monitoringFlags` — confirm ABSENT (this is the bug). Note the highest existing `this.version(N)` (46 at time of writing) so the new store is `version(N+1)`.

- [ ] **Step 2: Write the failing REAL-db test**

```ts
// apps/lab-lite/src/__tests__/monitoring-flags-db.test.ts
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { getDb } from '../lib/db'
import { processDispenseEvent } from '../lib/monitoring/dispense-receiver'

describe('monitoringFlags real Dexie store (finding 1b)', () => {
  beforeEach(async () => { await getDb().monitoringFlags.clear() })

  it('processDispenseEvent persists a flag to the REAL store', async () => {
    const overrides = new Map([['B01AA03', { atcCode: 'B01AA03', medicationDisplay: 'Warfarin', version: 1, requiredTests: [{ loincCode: '6301-6', testDisplay: 'INR', frequencyDays: 14, initialDelayDays: 3, priority: 'urgent' as const }] }]])
    const ids = await processDispenseEvent({ dispensingEventId: 'd1', patientRef: 'blind1', patientFirstName: 'Ali', patientAge: 40, medicationCode: 'B01AA03', medicationDisplay: 'Warfarin', dispensedAt: '2026-09-15', orderingPractitionerRef: 'ref', hlcTimestamp: '1' }, overrides)
    expect(ids.length).toBe(1)
    const stored = await getDb().monitoringFlags.toArray()
    expect(stored).toHaveLength(1)
    expect(stored[0].testRequired).toBe('6301-6')
  })

  it('dedups on [patientRef+medicationCode+testRequired]', async () => {
    const overrides = new Map([['B01AA03', { atcCode: 'B01AA03', medicationDisplay: 'Warfarin', version: 1, requiredTests: [{ loincCode: '6301-6', testDisplay: 'INR', frequencyDays: 14, initialDelayDays: 3, priority: 'urgent' as const }] }]])
    const p = { dispensingEventId: 'd1', patientRef: 'blind1', patientFirstName: 'Ali', patientAge: 40, medicationCode: 'B01AA03', medicationDisplay: 'Warfarin', dispensedAt: '2026-09-15', orderingPractitionerRef: 'ref', hlcTimestamp: '1' }
    await processDispenseEvent(p, overrides)
    await processDispenseEvent({ ...p, dispensingEventId: 'd2', dispensedAt: '2026-09-16' }, overrides)
    expect(await getDb().monitoringFlags.count()).toBe(1)
  })
})
```

> Note: `dispense-receiver.ts` currently keys the mapping lookup by `payload.medicationCode`. After Task 8 the map is ATC-keyed; the payload's `medicationCode` will carry the ATC (Task 10 maps `atcCode → medicationCode`). Keep that contract in mind — the receiver's field name stays `medicationCode` but the value is an ATC code.

- [ ] **Step 3: Run to verify fail**

Run: `pnpm -F lab-lite test monitoring-flags-db`
Expected: FAIL — `getDb().monitoringFlags` undefined (store missing).

- [ ] **Step 4: Add the type + stores + accessors to `db.ts`**

Add the type (near other entry types):

```ts
export interface MonitoringFlag {
  id?: number
  patientRef: string
  patientFirstName: string
  patientAge: number
  medicationCode: string   // canonical ATC code
  medicationDisplay: string
  dispensedAt: string
  dispensingEventId: string
  testRequired: string     // LOINC
  testDisplay: string
  frequencyDays: number
  dueDate: string
  status: 'upcoming' | 'due' | 'overdue' | 'completed'
  lastCompletedAt: string | null
  reminderSentAt: string | null
  orderingPractitionerRef: string
  hlcTimestamp: string
  syncedFromHub: boolean
  createdAt: string
  updatedAt: string
}
```

Declare the Dexie table properties on the db class:

```ts
monitoringFlags!: Table<MonitoringFlag, number>
medicationLabMappings!: Table<{ atcCode: string; medicationDisplay: string; version: number; requiredTests: unknown[] }, string>
```

Add the version bump (use the next integer after the current highest):

```ts
this.version(47).stores({
  monitoringFlags: '++id, [patientRef+medicationCode+testRequired], status, dueDate, patientRef',
  medicationLabMappings: '&atcCode, version',
})
```

Add accessors (near other exported db helpers):

```ts
export async function getMonitoringFlags(): Promise<MonitoringFlag[]> {
  return db.monitoringFlags.toArray()
}
export async function getDueMonitoringFlags(): Promise<MonitoringFlag[]> {
  return db.monitoringFlags.where('status').anyOf('due', 'overdue', 'upcoming').toArray()
}
export async function putMedicationLabMappings(
  mappings: Array<{ atcCode: string; medicationDisplay: string; version: number; requiredTests: unknown[] }>,
): Promise<void> {
  await db.medicationLabMappings.bulkPut(mappings)
}
export async function getMedicationLabMappingsMap(): Promise<Map<string, import('@ultranos/shared-types').MedicationLabMapping>> {
  const rows = await db.medicationLabMappings.toArray()
  return new Map(rows.map((r) => [r.atcCode, r as unknown as import('@ultranos/shared-types').MedicationLabMapping]))
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm -F lab-lite test monitoring-flags-db`
Expected: PASS. Then run the existing mock-based suites (`monitoring-lifecycle`, `monitoring-flags`, `monitoring-dashboard`, `monitoring-reminders`) — they should still pass (they mock the db and are unaffected). Leave them; the new file adds the real-store coverage the spec requires.

- [ ] **Step 6: Commit** (only on user instruction)

```bash
git add apps/lab-lite/src/lib/db.ts apps/lab-lite/src/__tests__/monitoring-flags-db.test.ts
git commit -m "fix(lab-lite): wire real monitoringFlags + medicationLabMappings Dexie stores (finding 1b)"
```

### Task 8: Re-key the bundled medication→lab map to ATC + seed the Hub table

**Files:**
- Modify: `apps/lab-lite/src/lib/monitoring/medication-lab-map.ts` (keys RxNorm → ATC)
- Migration (seed) via Supabase MCP `apply_migration` (name: `seed_medication_lab_mappings`)
- Test: `apps/lab-lite/src/__tests__/medication-lab-map.test.ts` (create or extend)

**Interfaces:**
- Consumes: nothing.
- Produces: `BUNDLED_MEDICATION_MAPPINGS` keyed by `atcCode`; `getMedicationMapping(atcCode, hubOverrides?)`.

> **BLOCKED ON CLINICAL SIGN-OFF.** The ATC codes below are candidates; a physician must confirm before merge (this file is explicitly non-AI-authored clinical content). Proposed: Warfarin `B01AA03`, Metformin `A10BA02`, Lithium `N05AN01`, Methotrexate `L01BA01`, Enalapril `C09AA02`, Carbamazepine `N03AF01`, Amiodarone `C01BD01`. Keep the RxNorm code in a comment for cross-reference.

- [ ] **Step 1: Write the failing test**

```ts
// apps/lab-lite/src/__tests__/medication-lab-map.test.ts
import { describe, it, expect } from 'vitest'
import { getMedicationMapping } from '../lib/monitoring/medication-lab-map'
describe('medication-lab-map ATC keys', () => {
  it('warfarin resolves by ATC B01AA03 → INR', () => {
    const m = getMedicationMapping('B01AA03')
    expect(m?.requiredTests[0].loincCode).toBe('6301-6')
  })
  it('does not resolve the old RxNorm key', () => {
    expect(getMedicationMapping('RxNorm:11289')).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify fail** — `pnpm -F lab-lite test medication-lab-map` → FAIL (still RxNorm-keyed).

- [ ] **Step 3: Re-key the interface + entries**

Change `MedicationLabMapping.medicationCode` → `atcCode` (and `BUNDLED_INDEX` / `getMedicationMapping` / `requiresMonitoring` param name to `atcCode`). Replace each entry's key with the ATC code; keep RxNorm in a trailing comment. Update `getMedicationMapping(atcCode, hubOverrides)` to import the `MedicationLabMapping` type from `@ultranos/shared-types` (single source) rather than the local interface.

- [ ] **Step 4: Run tests** — `pnpm -F lab-lite test medication-lab-map` → PASS.

- [ ] **Step 5: Seed the Hub table** (post sign-off)

Use `mcp__plugin_supabase_supabase__apply_migration` (name `seed_medication_lab_mappings`) inserting one row per bundled mapping into `medication_lab_mappings` (`atc_code`, `medication_display`, `required_tests` jsonb, `version` 1). The bundled TS map and the seed MUST stay identical — note this in a comment in both places.

- [ ] **Step 6: Commit** (only on user instruction)

```bash
git add apps/lab-lite/src/lib/monitoring/medication-lab-map.ts apps/lab-lite/src/__tests__/medication-lab-map.test.ts
git commit -m "fix(lab-lite): re-key medication→lab monitoring map to ATC + seed Hub table"
```

### Task 9: Lab tRPC client wrappers

**Files:**
- Modify: `apps/lab-lite/src/lib/trpc.ts` (add `pullDispenseMonitoringEvents`, `pullMonitoringMappings` — mirror `pullOrders` at line 562)
- Test: `apps/lab-lite/src/__tests__/monitoring-trpc-client.test.ts`

**Interfaces:**
- Consumes: Task 5 + 6 endpoints.
- Produces: `pullDispenseMonitoringEvents(token, since?, cursor?): Promise<{ events: DispenseMonitoringEventDTO[]; nextCursor: number | null }>`; `pullMonitoringMappings(token, sinceVersion?): Promise<{ mappings: MedicationLabMapping[] }>`.

- [ ] **Step 1: Write the failing test** — mock `global.fetch` (as `result-sync.test.ts` does), assert the GET URL is `…/lab.pullDispenseMonitoringEvents?input=…` and the decoded body shape.

- [ ] **Step 2: Run to verify fail** — `pnpm -F lab-lite test monitoring-trpc-client` → FAIL.

- [ ] **Step 3: Implement** (mirror `pullOrders` GET-with-encoded-input at `trpc.ts:562`)

```ts
export async function pullDispenseMonitoringEvents(token: string, since?: string, cursor?: number) {
  const input = encodeURIComponent(JSON.stringify({ json: { ...(since ? { since } : {}), ...(cursor != null ? { cursor } : {}) } }))
  const res = await fetch(`${getHubApiUrl()}/lab.pullDispenseMonitoringEvents?input=${input}`, { method: 'GET', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`Pull monitoring events failed: ${res.status}`)
  const body = (await res.json()) as { result: { data: { json: { events: import('@ultranos/shared-types').DispenseMonitoringEventDTO[]; nextCursor: number | null } } } }
  return { events: body.result.data.json.events ?? [], nextCursor: body.result.data.json.nextCursor ?? null }
}

export async function pullMonitoringMappings(token: string, sinceVersion?: number) {
  const input = encodeURIComponent(JSON.stringify({ json: { ...(sinceVersion != null ? { sinceVersion } : {}) } }))
  const res = await fetch(`${getHubApiUrl()}/lab.pullMonitoringMappings?input=${input}`, { method: 'GET', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`Pull monitoring mappings failed: ${res.status}`)
  const body = (await res.json()) as { result: { data: { json: { mappings: import('@ultranos/shared-types').MedicationLabMapping[] } } } }
  return { mappings: body.result.data.json.mappings ?? [] }
}
```

- [ ] **Step 4: Run tests** — `pnpm -F lab-lite test monitoring-trpc-client` → PASS.

- [ ] **Step 5: Commit** (only on user instruction)

```bash
git add apps/lab-lite/src/lib/trpc.ts apps/lab-lite/src/__tests__/monitoring-trpc-client.test.ts
git commit -m "feat(lab-lite): trpc client wrappers for monitoring pull endpoints"
```

### Task 10: `useMonitoringSync` hook + provider wiring

**Files:**
- Create: `apps/lab-lite/src/hooks/useMonitoringSync.ts` (mirror `useOrderSync.ts`)
- Modify: the lab-lite sync provider that mounts `useOrderSync` (find with: search for `useOrderSync(` usage — likely `apps/lab-lite/src/components/providers/SyncProvider.tsx`)
- Test: `apps/lab-lite/src/__tests__/use-monitoring-sync.test.ts`

**Interfaces:**
- Consumes: Task 9 client, Task 7 accessors (`putMedicationLabMappings`, `getMedicationLabMappingsMap`), existing `processBatchDispenseEvents`.
- Produces: `useMonitoringSync(): { loading: boolean; error: string | null; lastSyncedAt: string | null; refresh: () => void }`.

- [ ] **Step 1: Write the failing test** — mock the trpc client + `processBatchDispenseEvents`; assert on a poll it (a) refreshes mappings, (b) pages events by cursor, (c) calls `processBatchDispenseEvents` with the pulled payloads mapped so `medicationCode = event.atcCode`, (d) advances the in-memory cursor.

- [ ] **Step 2: Run to verify fail** — `pnpm -F lab-lite test use-monitoring-sync` → FAIL.

- [ ] **Step 3: Implement the hook** (mirror `useOrderSync` — in-memory watermark per CLAUDE.md "never localStorage"; idempotent processing makes a full re-pull on reload safe)

```ts
'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { pullDispenseMonitoringEvents, pullMonitoringMappings } from '@/lib/trpc'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { putMedicationLabMappings, getMedicationLabMappingsMap } from '@/lib/db'
import { processBatchDispenseEvents } from '@/lib/monitoring/dispense-receiver'
import type { DispenseMonitoringPayload } from '@/lib/monitoring/dispense-receiver'

const POLL_INTERVAL_MS = 120_000
let cursorCache: number | undefined
let mappingVersionCache: number | undefined

export function useMonitoringSync() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const inFlight = useRef(false)
  const cancelled = useRef(false)

  const sync = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      const supabase = getSupabaseBrowserClient()
      const { data } = await supabase.auth.getSession()
      if (!data.session) { if (!cancelled.current) setError('Session expired'); return }
      const token = data.session.access_token

      // 1. Refresh mappings (offline-tolerant; bundled map is the fallback)
      try {
        const { mappings } = await pullMonitoringMappings(token, mappingVersionCache)
        if (mappings.length) {
          await putMedicationLabMappings(mappings.map((m) => ({ atcCode: m.atcCode, medicationDisplay: m.medicationDisplay, version: m.version, requiredTests: m.requiredTests })))
          mappingVersionCache = mappings.reduce((mx, m) => Math.max(mx, m.version), mappingVersionCache ?? 0)
        }
      } catch { /* offline — use existing overrides + bundled fallback */ }

      const overrides = await getMedicationLabMappingsMap()

      // 2. Page monitoring events
      let cursor = cursorCache
      while (true) {
        const { events, nextCursor } = await pullDispenseMonitoringEvents(token, undefined, cursor)
        if (events.length) {
          const payloads: DispenseMonitoringPayload[] = events.map((e) => ({
            dispensingEventId: e.dispensingEventId,
            patientRef: e.patientRef.replace(/^Patient\//, ''), // R1: store bare blind index
            patientFirstName: e.patientFirstName,
            patientAge: e.patientAge ?? 0,
            medicationCode: e.atcCode,          // ATC is the map key (Task 8)
            medicationDisplay: e.medicationDisplay,
            dispensedAt: e.dispensedAt,
            orderingPractitionerRef: e.orderingPractitionerRef,
            hlcTimestamp: e.hlcTimestamp,
          }))
          await processBatchDispenseEvents(payloads, overrides)
        }
        if (nextCursor == null) break
        cursor = nextCursor
        cursorCache = nextCursor
      }
      if (!cancelled.current) { setError(null); setLastSyncedAt(new Date().toISOString()) }
    } catch {
      if (!cancelled.current) setError('Offline — monitoring will retry')
    } finally {
      inFlight.current = false
      if (!cancelled.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    cancelled.current = false
    void sync()
    const interval = setInterval(() => void sync(), POLL_INTERVAL_MS)
    const onOnline = () => void sync()
    window.addEventListener('online', onOnline)
    return () => { cancelled.current = true; clearInterval(interval); window.removeEventListener('online', onOnline) }
  }, [sync])

  const refresh = useCallback(() => { setError(null); setLoading(true); void sync() }, [sync])
  return { loading, error, lastSyncedAt, refresh }
}
```

- [ ] **Step 4: Wire into the provider**

In the same provider that calls `useOrderSync()`, add `useMonitoringSync()` alongside it (call the hook; no UI change required — flags surface via the existing `MonitoringDueCard`, now backed by the real store).

- [ ] **Step 5: Run tests**

Run: `pnpm -F lab-lite test use-monitoring-sync monitoring-flags-db`
Expected: PASS.

- [ ] **Step 6: Commit** (only on user instruction)

```bash
git add apps/lab-lite/src/hooks/useMonitoringSync.ts apps/lab-lite/src/components/providers/SyncProvider.tsx apps/lab-lite/src/__tests__/use-monitoring-sync.test.ts
git commit -m "feat(lab-lite): useMonitoringSync worker feeds dispense events into monitoring flags"
```

### Task 11: End-to-end verification (warfarin dispense → INR flag)

**Files:**
- Test: `apps/hub-api/src/__tests__/tdm-e2e.test.ts` (integration across producer + pull) OR a Playwright flow if the repo runs cross-app e2e.

**Interfaces:** consumes everything above.

- [ ] **Step 1: Write the integration test**

Drive the real flow with a test DB/harness: (1) seed `medication_lab_mappings` with warfarin `B01AA03`; (2) call `medication.recordDispense` for a warfarin dispense (status `completed`); (3) assert a `dispense_monitoring_events` row exists; (4) call `lab.pullDispenseMonitoringEvents` and assert one event with `patientRef` blind-prefixed and `atcCode = B01AA03`; (5) feed it through `processBatchDispenseEvents` against a real Dexie (fake-indexeddb) and assert an INR (`6301-6`) `monitoringFlags` row with the correct `dueDate` (dispensedAt + 3 days).

- [ ] **Step 2: Run** — `pnpm -F hub-api test tdm-e2e && pnpm -F lab-lite test` → PASS.

- [ ] **Step 3: Manual smoke (optional)** — per `docs/`, run pharmacy-lite + lab-lite locally, dispense warfarin, confirm the lab `MonitoringDueCard` shows an INR flag.

- [ ] **Step 4: Commit** (only on user instruction)

```bash
git add apps/hub-api/src/__tests__/tdm-e2e.test.ts
git commit -m "test: e2e verification for pharmacy→lab TDM (warfarin → INR flag)"
```

---

## Phase C — P1 reliability items

### Task 12: P1.4 — Verify (then fix) the MedicationStatement interaction-input loop

**Files:**
- Investigate: `apps/opd-lite/src/services/interactionService.ts`, `packages/drug-db/src/checker.ts` (`getMedicationNamesFromStatements`), the OPD prescription-entry active-med source.
- Test (only if a gap is confirmed): a test asserting a dispensed `MedicationStatement` appears in the next interaction check's active-med set.

**Interfaces:** none new unless a fix is needed.

- [ ] **Step 1: Trace the active-med source**

Find what populates `activeMedDisplayNames` passed to `checkInteractions`. Confirm whether it includes dispensed `MedicationStatement`s (created at `medication.ts:1040`). Use Grep for `getMedicationNamesFromStatements` and `checkInteractions(` call sites.

- [ ] **Step 2: Decide**

- If the loop is already closed → document as a non-finding in the spec's §6 and STOP (no code change). Record the evidence (file:line) proving statements feed the check.
- If a gap is confirmed → proceed to Step 3.

- [ ] **Step 3 (only if broken): Write the failing test, then wire the active-med input to the Tier-1 `MedicationStatement` source, then pass.**

Run: `pnpm -F opd-lite test interaction`

- [ ] **Step 4: Commit** (only on user instruction; only if code changed)

```bash
git commit -am "fix(opd-lite): feed MedicationStatement active meds into interaction checks"
```

### Task 13: P1.3 — Lab result → prescriber notification fallback + observability

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/lab.ts` (`dispatchResultNotifications`, ~line 26-55)
- Modify: `apps/hub-api/src/lib/clinical-safety-metrics.ts` (add `unlinkedLabResultTotal`)
- Test: `apps/hub-api/src/__tests__/lab-result-notification-fallback.test.ts`

**Interfaces:**
- Consumes: `service_requests`, `diagnostic_reports`.
- Produces: counter `unlinkedLabResultTotal`; behavioral change in `dispatchResultNotifications`.

- [ ] **Step 1: Verify the blast radius first**

Query how often results arrive without `orderId` (Supabase MCP `execute_sql` against `diagnostic_reports` for rows with no linked order) so the fallback depth matches reality. Record the number in the PR description.

- [ ] **Step 2: Write the failing test**

```ts
// Assert: (1) with orderId → prescriber notified (unchanged);
// (2) without orderId but a resolvable linked order on the report → notified via fallback;
// (3) no resolvable recipient → unlinkedLabResultTotal increments + an audit event,
//     and NO silent skip.
```

- [ ] **Step 3: Run to verify fail** — `pnpm -F hub-api test lab-result-notification-fallback` → FAIL.

- [ ] **Step 4: Add the metric + fallback chain**

```ts
export const unlinkedLabResultTotal = new Counter({
  name: 'unlinked_lab_result_total',
  help: 'Lab results with no resolvable ordering prescriber (Rule #3 observability)',
})
```

In `dispatchResultNotifications`, when `orderId` resolution yields no `requesterId`, attempt a fallback (resolve via the diagnostic report's linked order if present), and if still unresolved, `unlinkedLabResultTotal.inc()` + emit an audit `LAB_RESULT_UNLINKED` event instead of silently continuing. Keep patient notification unaffected.

- [ ] **Step 5: Run tests** — `pnpm -F hub-api test lab-result-notification-fallback` → PASS.

- [ ] **Step 6: Commit** (only on user instruction)

```bash
git add apps/hub-api/src/trpc/routers/lab.ts apps/hub-api/src/lib/clinical-safety-metrics.ts apps/hub-api/src/__tests__/lab-result-notification-fallback.test.ts
git commit -m "fix(hub): observable fallback for lab-result prescriber notification (P1.3)"
```

---

## Final verification

- [ ] `pnpm typecheck` (whole monorepo) — must pass. (Watch for the previously-unresolved `MonitoringFlag` import, now fixed by Task 7.)
- [ ] `pnpm -F hub-api test && pnpm -F lab-lite test && pnpm -F @ultranos/shared-types test` — all green.
- [ ] `pnpm lint`.
- [ ] Re-run `mcp__plugin_supabase_supabase__get_advisors` — no new security/perf regressions.
- [ ] Confirm no PHI in any new log/metric/audit-metadata line (grep the new code for patient name/uuid interpolation).

## P2 — Out of scope for this plan (future epics)

Per the spec §7, lab→pharmacy dosing awareness and pharmopedia deep-linking are documented as future epics with recommended direction and open clinical questions. They are NOT implemented here and get their own spec → plan cycle.

---

## Self-review notes (author)

- **Spec coverage:** P0.1 (Tasks 2-11 incl. finding 1b persistence), P0.2 (Task 1), P1.4 (Task 12), P1.3 (Task 13). P2 intentionally task-less. All spec §3-§6 items map to a task.
- **Type consistency:** `MedicationLabMapping`/`DispenseMonitoringEventDTO`/`MonitoringTestSpec` defined once (Task 2), imported everywhere; `MonitoringFlag` defined in `db.ts` (Task 7); the receiver's `medicationCode` field carries the ATC value (noted in Tasks 7 & 10).
- **Open dependency:** Task 8 (ATC re-key + seed) is blocked on clinical sign-off; Tasks 9-11 depend on it for real data but can be built/tested against seeded fixtures beforehand.
