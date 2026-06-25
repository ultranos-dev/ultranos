# Phase 2 — Pharmacist active-meds Hub endpoint + 2D online cross-check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Phase 2 feature 2D's online half — a new PHARMACIST-scoped Hub endpoint that returns a patient's active medications, wired into the pharmacy dispense interaction recheck so it cross-checks the prescribed meds against the patient's active medication history (in addition to the existing offline intra-prescription + local-allergy check).

**Architecture:** A new `medicationStatement.listActiveForPharmacist` tRPC query, role-scoped to PHARMACIST via `roleRestrictedProcedure` (NOT by broadening the global `ROLE_PERMISSIONS` — keeps the grant to this one read endpoint). Pharmacy-Lite calls it online (best-effort), merges the returned med display names into `runDispenseInteractionCheck`, which already degrades safely when offline/empty.

**Tech Stack:** Node tRPC (hub-api), Vitest; Next.js PWA (pharmacy-lite), Vitest + fake-indexeddb; `@ultranos/audit-logger`.

## Decisions (locked / documented)
- **D1 — scoped endpoint, not global RBAC:** use `roleRestrictedProcedure(['PHARMACIST','ADMIN'])` on the new procedure; do NOT add `MedicationStatement` to `ROLE_PERMISSIONS.PHARMACIST` (that would expose `listActive`/`create`/`updateStatus` to pharmacists too). Matches the user's "dedicated endpoint, don't broaden globally" choice.
- **D2 — no per-access consent gate:** consistent with the existing clinician `listActive` (which has none) and the consent-scope map (which does not cover `MedicationStatement`). Access is governed by org verification + `PHARMACY_LITE` entitlement + PHARMACIST role + a `PHI_READ` audit event. Treatment-essential access for dispensing.
- **D3 — entitlement:** `enforceEntitlement('PHARMACY_LITE')` (pharmacists carry PHARMACY_LITE, NOT OPD_LITE).
- **D4 — online-only, best-effort:** the pharmacy client returns `[]` on no-token/offline/error; the offline check (intra-prescription + local allergies) still runs regardless. No new PHI is persisted on the device.

## Global Constraints
- **Rule #1 (PHI):** the endpoint logs only counts (never med content); the audit event uses opaque patient/actor IDs.
- **Rule #3 (safety):** merging Hub active meds only ADDS to the interaction peer set — it never weakens the existing offline result. An empty/failed Hub fetch must not turn a real interaction into CLEAR.
- Hub tests: `pnpm -F hub-api test`. Pharmacy tests: `pnpm -F pharmacy-lite test`.
- The new procedure returns the same shape as `listActive`: `{ statements: <camelCased rows>, count: number }`, where each statement carries `medicationDisplay`.

---

### Task 1: Hub endpoint `medicationStatement.listActiveForPharmacist`

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/medication-statement.ts` (add the procedure; import `roleRestrictedProcedure`)
- Test: `apps/hub-api/src/__tests__/medication-statement.test.ts` (add cases)

**Interfaces:**
- `medicationStatement.listActiveForPharmacist({ patientRef: string }) → { statements: MedicationStatement[]; count: number }`; PHARMACIST/ADMIN only.

- [ ] **Step 1: Write the failing tests**

Add to `apps/hub-api/src/__tests__/medication-statement.test.ts` (reuse the file's existing `createTestContext`, `mockOrganizationsTable`, `mockOrgSubscriptionsTable`, and caller setup):
```typescript
describe('listActiveForPharmacist', () => {
  const PHARMACIST_USER = { sub: 'pharm-001', role: 'PHARMACIST', sessionId: 'sess-2', orgId: 'org-test-001' }

  it('allows a PHARMACIST to list a patient\'s active medication statements', async () => {
    const mockStatements = [{ id: 'ms-1', status: 'active', medication_display: 'Warfarin 5mg', subject_reference: 'Patient/pat-001' }]
    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: mockStatements, error: null }) }),
    })
    const auditMock = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'audit-1' }, error: null }) }) })
    const callCount = { n: 0 }
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'organizations') return mockOrganizationsTable()
      if (table === 'org_subscriptions') return mockOrgSubscriptionsTable()
      callCount.n++
      return callCount.n === 1 ? { select: mockSelect } : { insert: auditMock }
    })
    const caller = createCaller(createTestContext({ supabaseFrom: mockFrom, user: PHARMACIST_USER }))
    const result = await caller.medicationStatement.listActiveForPharmacist({ patientRef: 'Patient/pat-001' })
    expect(result.count).toBe(1)
    expect(result.statements).toHaveLength(1)
    expect(mockFrom).toHaveBeenCalledWith('medication_statements')
  })

  it('denies a PATIENT role (FORBIDDEN)', async () => {
    const caller = createCaller(createTestContext({ user: { sub: 'pat-001', role: 'PATIENT', sessionId: 's1', orgId: 'org-1' } }))
    await expect(caller.medicationStatement.listActiveForPharmacist({ patientRef: 'Patient/pat-001' })).rejects.toThrow()
  })

  it('requires authentication (UNAUTHORIZED)', async () => {
    const caller = createCaller(createTestContext({ user: null }))
    await expect(caller.medicationStatement.listActiveForPharmacist({ patientRef: 'Patient/pat-001' })).rejects.toThrow()
  })
})
```
(If the existing test file's helpers are named/scoped differently, adapt to match — the file already has equivalents used by the `listActive` tests.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm -F hub-api test -- medication-statement`
Expected: FAIL — `listActiveForPharmacist` is not a function on the router.

- [ ] **Step 3: Implement the procedure**

In `apps/hub-api/src/trpc/routers/medication-statement.ts`, add `roleRestrictedProcedure` to the imports:
```typescript
import { roleRestrictedProcedure } from '../rbac'
```
Add this procedure inside `createTRPCRouter({ ... })` (alongside `listActive`):
```typescript
  /**
   * List active MedicationStatements for a patient — PHARMACIST-scoped.
   * Used by Pharmacy-Lite's dispense interaction recheck (treatment-essential).
   * Scoped to this read endpoint only (roleRestrictedProcedure) — does NOT grant
   * pharmacists access to other MedicationStatement operations. No per-access
   * consent gate (consistent with the clinician listActive); access is governed by
   * org verification + PHARMACY_LITE entitlement + role + a PHI_READ audit event.
   */
  listActiveForPharmacist: roleRestrictedProcedure(['PHARMACIST', 'ADMIN'])
    .use(enforceVerifiedOrg())
    .use(enforceEntitlement('PHARMACY_LITE'))
    .input(z.object({ patientRef: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('medication_statements')
        .select('*')
        .eq('subject_reference', input.patientRef)
        .eq('status', 'active')

      if (error) {
        console.error('MedicationStatement (pharmacist) list error:', { code: error.code })
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to retrieve active medication statements' })
      }

      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_READ',
          resourceType: 'MEDICATION_STATEMENT',
          resourceId: input.patientRef,
          patientId: input.patientRef.replace('Patient/', ''),
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { count: data.length, via: 'pharmacist_dispense' },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_READ', resourceType: 'MEDICATION_STATEMENT', patientRef: input.patientRef })
      }

      return { statements: db.fromRows(data), count: data.length }
    }),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm -F hub-api test -- medication-statement`
Expected: PASS (the 3 new cases + the existing suite). Confirm the existing `listActive` PHARMACIST-denial test still passes (the global RBAC was not changed).

- [ ] **Step 5: Commit** — SKIP.

---

### Task 2: Pharmacy client — fetch active medications

**Files:**
- Create: `apps/pharmacy-lite/src/lib/active-medications.ts`
- Test: `apps/pharmacy-lite/src/__tests__/active-medications.test.ts`

**Interfaces:**
- `fetchActiveMedicationDisplays(patientId: string): Promise<string[]>` — calls `medicationStatement.listActiveForPharmacist`, returns each statement's `medicationDisplay`; returns `[]` on no-token / offline / non-ok / error (best-effort, never throws).

- [ ] **Step 1: Write the failing test**

`apps/pharmacy-lite/src/__tests__/active-medications.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getAccessToken = vi.fn(async () => 'tok')
vi.mock('@/stores/auth-session-store', () => ({ useAuthSessionStore: { getState: () => ({ getAccessToken }) } }))

beforeEach(() => { vi.restoreAllMocks(); getAccessToken.mockResolvedValue('tok') })

describe('fetchActiveMedicationDisplays', () => {
  it('returns medication display names from the hub', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ result: { data: { json: { statements: [{ medicationDisplay: 'Warfarin 5mg' }, { medicationDisplay: 'Aspirin 75mg' }], count: 2 } } } }),
    })) as unknown as typeof fetch)
    const { fetchActiveMedicationDisplays } = await import('@/lib/active-medications')
    expect(await fetchActiveMedicationDisplays('pat-1')).toEqual(['Warfarin 5mg', 'Aspirin 75mg'])
  })

  it('returns [] when there is no token (best-effort, never throws)', async () => {
    getAccessToken.mockResolvedValue(null)
    const { fetchActiveMedicationDisplays } = await import('@/lib/active-medications')
    expect(await fetchActiveMedicationDisplays('pat-1')).toEqual([])
  })

  it('returns [] on a network error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }) as unknown as typeof fetch)
    const { fetchActiveMedicationDisplays } = await import('@/lib/active-medications')
    expect(await fetchActiveMedicationDisplays('pat-1')).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F pharmacy-lite test active-medications`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`apps/pharmacy-lite/src/lib/active-medications.ts`:
```typescript
import { getHubApiUrl } from './trpc'
import { useAuthSessionStore } from '@/stores/auth-session-store'

interface ActiveStatement { medicationDisplay?: string }

/**
 * Fetch a patient's active medication display names from the Hub (PHARMACIST-scoped).
 * Best-effort: returns [] on no-token / offline / error — never throws. Online only.
 */
export async function fetchActiveMedicationDisplays(patientId: string): Promise<string[]> {
  try {
    if (typeof window !== 'undefined' && !navigator.onLine) return []
    const token = await useAuthSessionStore.getState().getAccessToken()
    if (!token) return []

    const url = new URL(getHubApiUrl())
    url.pathname = url.pathname.replace(/\/$/, '') + '/medicationStatement.listActiveForPharmacist'
    url.searchParams.set('input', JSON.stringify({ json: { patientRef: `Patient/${patientId}` } }))

    const res = await fetch(url.toString(), { method: 'GET', headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return []
    const body = (await res.json()) as { result: { data: { json: { statements: ActiveStatement[] } } } }
    return body.result.data.json.statements.map((s) => s.medicationDisplay ?? '').filter((d) => d.length > 0)
  } catch {
    return []
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm -F pharmacy-lite test active-medications`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit** — SKIP.

---

### Task 3: Wire active meds into the dispense recheck

**Files:**
- Modify: `apps/pharmacy-lite/src/lib/dispense-interaction-check.ts`
- Modify: `apps/pharmacy-lite/src/components/pharmacy/DispensingConfirmationModal.tsx`
- Test: `apps/pharmacy-lite/src/__tests__/dispense-interaction-check.test.ts` (add a case)

**Interfaces:**
- `runDispenseInteractionCheck(medDisplays: string[], allergies: string[], activeMedDisplays?: string[]): Promise<InteractionStatus>` — the active meds are added to the peer set each prescribed med is checked against (and deduped).

- [ ] **Step 1: Write the failing test**

Add to `apps/pharmacy-lite/src/__tests__/dispense-interaction-check.test.ts`:
```typescript
  it('detects an interaction against the patient\'s active (Hub) medications', async () => {
    await db.drugCatalogMirror.put(warfarin() as never)
    await db.drugCatalogSyncMeta.put({ key: 'lastSyncAt', value: new Date().toISOString() })
    // Prescribing Aspirin; Warfarin is an existing active med fetched from the Hub.
    const status = await runDispenseInteractionCheck(['Aspirin'], [], ['Warfarin'])
    expect(status.state).toBe('contraindicated')
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F pharmacy-lite test dispense-interaction-check`
Expected: FAIL — the active-meds arg is ignored (status is `clear`, not `contraindicated`).

- [ ] **Step 3: Implement the merge**

In `apps/pharmacy-lite/src/lib/dispense-interaction-check.ts`, extend the signature and peer set:
```typescript
export async function runDispenseInteractionCheck(
  medDisplays: string[],
  allergies: string[],
  activeMedDisplays: string[] = [],
): Promise<InteractionStatus> {
```
Then, where each med is checked, include the active meds in `others` (deduped, excluding the med itself):
```typescript
  for (let i = 0; i < meds.length; i++) {
    const peers = Array.from(new Set([...meds.filter((_, j) => j !== i), ...activeMedDisplays]))
      .filter((p) => p && p.trim().length > 0 && p !== meds[i])
    const summary = await checkInteractions(meds[i]!, peers, { activeAllergies: allergyResources }, adapter)
```
(Replace the existing `const others = meds.filter((_, j) => j !== i)` + the `checkInteractions(meds[i]!, others, ...)` call with the above.)

- [ ] **Step 4: Fetch + pass active meds in `DispensingConfirmationModal.tsx`**

Add the import:
```typescript
import { fetchActiveMedicationDisplays } from '@/lib/active-medications'
```
Replace the interaction `useEffect` so it fetches active meds (best-effort) before running the check:
```typescript
  useEffect(() => {
    let cancelled = false
    const meds = items.map((i) => i.prescription.medN)
    const patientId = items[0]?.prescription.pat
    void (async () => {
      const active = patientId ? await fetchActiveMedicationDisplays(patientId) : []
      const status = await runDispenseInteractionCheck(meds, patientAllergies ?? [], active)
      if (!cancelled) setInteraction(status)
    })()
    return () => { cancelled = true }
  }, [items, patientAllergies])
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm -F pharmacy-lite test dispense-interaction-check`
Expected: PASS (the new active-meds case + the existing 4). The DispensingConfirmationModal change keeps the offline behavior (active = [] when offline/no patient) intact.

- [ ] **Step 6: Commit** — SKIP.

---

### Task 4: Phase verification

- [ ] **Step 1: Hub + pharmacy suites**

Run:
```bash
pnpm -F hub-api test -- medication-statement
pnpm -F pharmacy-lite test active-medications dispense-interaction-check
```
Expected: all green.

- [ ] **Step 2: Full suites + typecheck (no new regressions)**

Run:
```bash
pnpm -F pharmacy-lite test
pnpm -F pharmacy-lite typecheck
pnpm -F hub-api typecheck
```
Expected: no NEW failures vs. the pre-existing baseline; no new type errors.

- [ ] **Step 3: Commit** — SKIP (leave changes in the working tree for review/staging).

---

## Self-Review

**1. Spec coverage:** New PHARMACIST-scoped endpoint (Task 1) ✓; pharmacy best-effort client (Task 2) ✓; merge active meds into the recheck (Task 3) ✓. Completes 2D's online half.

**2. Placeholder scan:** No TBD/TODO; complete code throughout. Test-helper names in Task 1 are explicitly flagged to adapt to the existing file's equivalents.

**3. Type consistency:** Endpoint returns `{ statements, count }` (camelCased via `db.fromRows`); the client reads `medicationDisplay`. `runDispenseInteractionCheck`'s new optional `activeMedDisplays` is additive (existing 2-arg callers unaffected). `roleRestrictedProcedure(['PHARMACIST','ADMIN'])` composes with `.use(enforceVerifiedOrg()).use(enforceEntitlement('PHARMACY_LITE'))`.

**Safety/governance:** No global RBAC broadening (D1); no consent-map change (D2); PHI_READ audit emitted; client is best-effort online-only and never weakens the offline result (Rule #3); logs counts only (Rule #1).

---

## Execution Handoff

Final Phase 2 unit. Execution: **subagent-driven, no commits**. After it lands + is reviewed, Phase 2 is complete (Foundation + Features + online recheck).
