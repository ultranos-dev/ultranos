# Dispense Review Hub Router Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build the missing Hub `dispenseReview` tRPC router (`list` + `updateStatus`) so the already-built pharmacy-lite `/unverified` page (unverified-dispense review queue) becomes functional end-to-end for the read + resolve flow.

**Architecture:** A new tRPC router mirroring the existing `duplicate-review.ts` sibling, reading/updating the already-migrated `dispense_reviews` table (migration 026). `list` returns the raw snake_case rows the client already expects; `updateStatus` resolves a PENDING review to APPROVED/FLAGGED with reviewer + timestamp. RBAC via `enforceResourceAccess('MedicationDispense')`; audit via `@ultranos/audit-logger`. Scope is **router only** (read + resolve) — populating the queue (offline-grace override → PENDING row) is a deliberate follow-up slice, NOT in scope.

**Tech Stack:** Node.js, tRPC, Supabase (Postgres), Vitest. Hub API at `apps/hub-api`.

**Spec:** No separate spec doc — the design was brainstormed and scope-approved inline (Router only). This plan is the authority; the binding contract is the client's existing consumer.

## Global Constraints

- **Exact client contract (verified in `apps/pharmacy-lite/src/components/pharmacy/UnverifiedDispensesView.tsx`):**
  - `dispenseReview.list` is a **GET/query**, input `{ statuses: string[] }` (via `{json:{statuses}}`), and the client reads `body.result.data.json` typed as a **bare `DispenseReview[]`**. Therefore `list` MUST return the array directly — NOT wrapped in `{ reviews }`.
  - Each returned row MUST be **snake_case** with these fields: `id, dispense_id, override_reason, override_supervisor, status, reviewed_by, reviewed_at, created_at` (client also reads `prescription_id` is unused by UI but harmless to include).
  - `dispenseReview.updateStatus` is a **POST/mutation**, input `{ reviewId: string, status: 'APPROVED' | 'FLAGGED' }`; the client only checks `res.ok` (ignores the body on success).
- **`dispense_reviews` table (migration 026, verified live, currently 0 rows):** columns `id uuid PK`, `dispense_id uuid NOT NULL`, `prescription_id uuid`, `override_reason text NOT NULL`, `override_supervisor uuid NOT NULL → practitioners(id)`, `status text CHECK IN ('PENDING','APPROVED','FLAGGED') default 'PENDING'`, `reviewed_by uuid → practitioners(id)`, `reviewed_at timestamptz`, `created_at timestamptz default now()`. No `org_id`; RLS permissive (`USING(true)`).
- **Mirror the sibling `apps/hub-api/src/trpc/routers/duplicate-review.ts` exactly** for: procedure builder (`protectedProcedure.use(enforceResourceAccess(...))`), error handling (`console.error('[DISPENSE_REVIEW] ...', { code: error.code })` + `throw new TRPCError({ code:'INTERNAL_SERVER_ERROR', ... })`), audit emission (construct `new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)`, `await audit.emit({...})` wrapped in try/catch with `console.warn('[AUDIT_FAILURE]', ...)`), and `reviewed_by: ctx.user.sub` / `reviewed_at: new Date().toISOString()`.
- **PHI:** never log `override_reason`/`override_supervisor`/patient content — logs carry only error `code`, counts, and ids. `override_reason` may be clinical → `list` audits as `PHI_READ`, `updateStatus` as `PHI_WRITE`.
- **No DB schema change** in this slice (table already exists). No new migration.
- **NO-COMMIT mode** (controller commits at the end).

---

### Task 1: `dispenseReview` router (`list` + `updateStatus`) + registration + unit tests

**Files:**
- Create: `apps/hub-api/src/trpc/routers/dispense-review.ts`
- Modify: `apps/hub-api/src/trpc/routers/_app.ts` (import + register `dispenseReview`)
- Test: `apps/hub-api/src/__tests__/dispense-review.test.ts`

**Interfaces:**
- Produces: `dispenseReviewRouter` (exported), registered as `dispenseReview` on `appRouter`, exposing:
  - `list(input: { statuses: ('PENDING'|'APPROVED'|'FLAGGED')[] }) => Promise<DispenseReviewRow[]>` where `DispenseReviewRow` is the snake_case row `{ id, dispense_id, prescription_id, override_reason, override_supervisor, status, reviewed_by, reviewed_at, created_at }`.
  - `updateStatus(input: { reviewId: string, status: 'APPROVED'|'FLAGGED' }) => Promise<{ success: true }>`.
- Consumes: `createTRPCRouter`, `protectedProcedure` from `../init`; `enforceResourceAccess` from `../middleware/enforceResourceAccess`; `AuditLogger` from `@ultranos/audit-logger`.

- [ ] **Step 1: Write the failing test** — `apps/hub-api/src/__tests__/dispense-review.test.ts`. Mirror the mock/caller harness from `duplicate-review.test.ts` (stub encryption env, mock `@/lib/supabase`, mock `@ultranos/audit-logger`, mock `enforceResourceAccess` + `enforceConsent` + the MPI modules that `_app` transitively loads — copy those `vi.mock` blocks verbatim from `duplicate-review.test.ts` so importing `_app` succeeds). Use:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({})),
  db: { toRow: (d: any) => d, toRowRaw: (d: any) => d, fromRow: (d: any) => d, fromRowRaw: (d: any) => d, fromRows: (d: any[]) => d },
}))

const mockAuditEmit = vi.fn().mockResolvedValue({})
vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({ emit: mockAuditEmit })),
}))

vi.mock('../trpc/middleware/enforceConsent', () => ({
  enforceConsentMiddleware: vi.fn(() => async (opts: any) => opts.next({ ctx: opts.ctx })),
}))
vi.mock('../trpc/middleware/enforceResourceAccess', () => ({
  enforceResourceAccess: vi.fn(() => async (opts: any) => opts.next({ ctx: opts.ctx })),
}))
// Copy the MPI vi.mock blocks (@ultranos/mpi-engine, @/lib/mpi-candidate-query,
// @/lib/mpi-proceed-token, @/lib/async-mpi-scoring) verbatim from duplicate-review.test.ts
// — they are required for `_app` to import cleanly.

const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')

const TEST_USER = { sub: 'pharm-001', role: 'PHARMACIST', sessionId: 'sess-1' }
const REVIEW_UUID = '11111111-1111-1111-1111-111111111111'
const DISPENSE_UUID = '22222222-2222-2222-2222-222222222222'

function createTestContext(mockFrom: ReturnType<typeof vi.fn>) {
  return { supabase: { from: mockFrom } as never, user: TEST_USER, headers: new Headers() }
}

const createCaller = createCallerFactory(appRouter)

describe('dispenseReview.list', () => {
  beforeEach(() => mockAuditEmit.mockClear())

  const ROW = {
    id: REVIEW_UUID, dispense_id: DISPENSE_UUID, prescription_id: null,
    override_reason: 'Offline grace: chronic med, network down',
    override_supervisor: '33333333-3333-3333-3333-333333333333',
    status: 'PENDING', reviewed_by: null, reviewed_at: null,
    created_at: '2026-07-01T00:00:00Z',
  }

  // list query chain: .from().select().in('status', statuses).order('created_at', { ascending:false })
  function listMockFrom(rows: any[], captureIn?: (col: string, vals: any) => void) {
    return vi.fn().mockImplementation((table: string) => {
      if (table !== 'dispense_reviews') return {}
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockImplementation((col: string, vals: any) => {
            captureIn?.(col, vals)
            return { order: vi.fn().mockResolvedValue({ data: rows, error: null }) }
          }),
        }),
      }
    })
  }

  it('returns the raw snake_case rows as a bare array (not wrapped)', async () => {
    const ctx = createTestContext(listMockFrom([ROW]))
    const caller = createCaller(ctx)
    const result = await caller.dispenseReview.list({ statuses: ['PENDING'] })

    expect(Array.isArray(result)).toBe(true)           // MUST be a bare array
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: REVIEW_UUID,
      dispense_id: DISPENSE_UUID,                       // snake_case preserved
      override_reason: 'Offline grace: chronic med, network down',
      override_supervisor: '33333333-3333-3333-3333-333333333333',
      status: 'PENDING',
      reviewed_by: null,
      reviewed_at: null,
      created_at: '2026-07-01T00:00:00Z',
    })
  })

  it('filters by the requested statuses via .in()', async () => {
    let capturedCol = ''
    let capturedVals: any = null
    const ctx = createTestContext(
      listMockFrom([], (col, vals) => { capturedCol = col; capturedVals = vals }),
    )
    const caller = createCaller(ctx)
    await caller.dispenseReview.list({ statuses: ['APPROVED', 'FLAGGED'] })
    expect(capturedCol).toBe('status')
    expect(capturedVals).toEqual(['APPROVED', 'FLAGGED'])
  })

  it('emits a PHI_READ audit event', async () => {
    const ctx = createTestContext(listMockFrom([]))
    const caller = createCaller(ctx)
    await caller.dispenseReview.list({ statuses: ['PENDING'] })
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PHI_READ',
        metadata: expect.objectContaining({ operation: 'dispense_review_list' }),
      }),
    )
  })

  it('throws INTERNAL_SERVER_ERROR when the query errors', async () => {
    const errFrom = vi.fn().mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: null, error: { code: 'XX000' } }),
        }),
      }),
    }))
    const ctx = createTestContext(errFrom)
    const caller = createCaller(ctx)
    await expect(caller.dispenseReview.list({ statuses: ['PENDING'] })).rejects.toThrow()
  })
})

describe('dispenseReview.updateStatus', () => {
  beforeEach(() => mockAuditEmit.mockClear())

  // update chain: .from().update({...}).eq('id', reviewId).eq('status', 'PENDING')
  function updateMockFrom(captureUpdate?: (payload: any) => void) {
    return vi.fn().mockImplementation((table: string) => {
      if (table !== 'dispense_reviews') return {}
      return {
        update: vi.fn().mockImplementation((payload: any) => {
          captureUpdate?.(payload)
          return {
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }
        }),
      }
    })
  }

  it('sets status + reviewed_by + reviewed_at and returns success', async () => {
    let payload: any = null
    const ctx = createTestContext(updateMockFrom((p) => { payload = p }))
    const caller = createCaller(ctx)
    const result = await caller.dispenseReview.updateStatus({ reviewId: REVIEW_UUID, status: 'APPROVED' })

    expect(result).toEqual({ success: true })
    expect(payload.status).toBe('APPROVED')
    expect(payload.reviewed_by).toBe('pharm-001')      // ctx.user.sub
    expect(typeof payload.reviewed_at).toBe('string')
  })

  it('emits a PHI_WRITE audit event with the reviewId', async () => {
    const ctx = createTestContext(updateMockFrom())
    const caller = createCaller(ctx)
    await caller.dispenseReview.updateStatus({ reviewId: REVIEW_UUID, status: 'FLAGGED' })
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PHI_WRITE',
        metadata: expect.objectContaining({ operation: 'dispense_review_update', reviewId: REVIEW_UUID }),
      }),
    )
  })

  it('rejects an invalid status value', async () => {
    const ctx = createTestContext(updateMockFrom())
    const caller = createCaller(ctx)
    // 'PENDING' is not an allowed target for updateStatus (only APPROVED/FLAGGED)
    await expect(
      caller.dispenseReview.updateStatus({ reviewId: REVIEW_UUID, status: 'PENDING' as never }),
    ).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run to verify FAIL** — `pnpm -F hub-api test dispense-review` → FAIL (`caller.dispenseReview` undefined / module not found).

- [ ] **Step 3: Implement the router** — create `apps/hub-api/src/trpc/routers/dispense-review.ts`:

```typescript
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '../init'
import { enforceResourceAccess } from '../middleware/enforceResourceAccess'
import { AuditLogger } from '@ultranos/audit-logger'

const REVIEW_COLUMNS =
  'id, dispense_id, prescription_id, override_reason, override_supervisor, status, reviewed_by, reviewed_at, created_at'

export const dispenseReviewRouter = createTRPCRouter({
  // GET — returns the raw snake_case rows as a BARE ARRAY (the /unverified page
  // reads body.result.data.json as DispenseReview[]; do NOT wrap in { reviews }).
  list: protectedProcedure
    .use(enforceResourceAccess('MedicationDispense'))
    .input(z.object({
      statuses: z.array(z.enum(['PENDING', 'APPROVED', 'FLAGGED'])).min(1),
    }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('dispense_reviews')
        .select(REVIEW_COLUMNS)
        .in('status', input.statuses)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('[DISPENSE_REVIEW] List error:', { code: error.code })
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to list dispense reviews' })
      }

      const rows = data ?? []

      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await audit.emit({
          action: 'PHI_READ',
          resourceType: 'MEDICATION_DISPENSE',
          resourceId: 'dispense-review-list',
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { operation: 'dispense_review_list', resultCount: rows.length },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_READ', resourceId: 'dispense-review-list' })
      }

      return rows
    }),

  // POST — resolve a PENDING review to APPROVED/FLAGGED with reviewer + timestamp.
  updateStatus: protectedProcedure
    .use(enforceResourceAccess('MedicationDispense'))
    .input(z.object({
      reviewId: z.string().uuid(),
      status: z.enum(['APPROVED', 'FLAGGED']),
    }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from('dispense_reviews')
        .update({
          status: input.status,
          reviewed_by: ctx.user.sub,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', input.reviewId)
        .eq('status', 'PENDING') // integrity guard: only a pending review may be resolved

      if (error) {
        console.error('[DISPENSE_REVIEW] Update error:', { code: error.code })
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to update dispense review' })
      }

      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await audit.emit({
          action: 'PHI_WRITE',
          resourceType: 'MEDICATION_DISPENSE',
          resourceId: input.reviewId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { operation: 'dispense_review_update', reviewId: input.reviewId, newStatus: input.status },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_WRITE', resourceId: input.reviewId })
      }

      return { success: true as const }
    }),
})
```

- [ ] **Step 4: Register in `_app.ts`** — add `import { dispenseReviewRouter } from './dispense-review'` alongside the other router imports, and add `dispenseReview: dispenseReviewRouter,` to the `createTRPCRouter({...})` call (place it next to `duplicateReview`).

- [ ] **Step 5: Run to verify PASS** — `pnpm -F hub-api test dispense-review` → all green.

- [ ] **Step 6: Typecheck** — `pnpm -F hub-api typecheck` → no NEW errors in `dispense-review.ts` / `_app.ts` / the new test (pre-existing repo noise out of scope).

- [ ] **Step 7: Commit** (skip in NO-COMMIT).

---

### Task 2: Live end-to-end verification against `/unverified`

**Files:** none (verification only; uses Supabase MCP + Playwright MCP).

This proves the real HTTP contract + DB round-trip, not just mocked units. The hub-api dev server runs on port 3004; pharmacy-lite on 3005.

- [ ] **Step 1: Seed a canary PENDING review** — via Supabase MCP `execute_sql`, insert ONE row into `dispense_reviews`. `override_supervisor` and `reviewed_by` are `uuid REFERENCES practitioners(id)`, so first `SELECT id FROM practitioners LIMIT 1` and use a real practitioner id for `override_supervisor` (and a real `dispense_id` if the FK is enforced — check; the table has no explicit FK on `dispense_id`, so a synthetic uuid is fine). Insert `status='PENDING'`, a clearly-labelled `override_reason` like `'CANARY dispense-review live-verify'`, and record the returned `id`.

- [ ] **Step 2: Ensure hub-api is running with the new router** — the hub dev server must be (re)started so `_app.ts` picks up `dispenseReview` (a code change requires a fresh `next dev`). Start/restart `pnpm -F hub-api dev` (port 3004) if not already serving the new route. Confirm the route exists (a direct GET to `…/dispenseReview.list?input=...` returns 200 with the canary row, OR proceed via the UI in the next step).

- [ ] **Step 3: Drive the UI** — with Playwright MCP: log into pharmacy-lite (port 3005) as a pharmacist, navigate to `/unverified`. Confirm the **Pending** tab renders the canary row (reason + supervisor + date visible), NOT the previous "review not connected" error. Screenshot.

- [ ] **Step 4: Resolve it** — click **Approve** on the canary row. Confirm the row disappears from Pending and the list refreshes without error. Switch to the **Resolved** tab and confirm the canary now shows with status APPROVED + a reviewed-by/reviewed-at. Screenshot.

- [ ] **Step 5: Confirm the DB round-trip** — via Supabase MCP, `SELECT status, reviewed_by, reviewed_at FROM dispense_reviews WHERE id = '<canary id>'` → `status='APPROVED'`, `reviewed_by` non-null, `reviewed_at` non-null. **If `reviewed_by` triggered an FK violation** (ctx.user.sub is not a `practitioners.id`), that is a real finding: record it — the fix is a follow-up decision (map sub→practitioner id, or relax the FK), not a silent pass.

- [ ] **Step 6: Clean up the canary** — `DELETE FROM dispense_reviews WHERE id = '<canary id>'`. Verify it's gone. Never leave canary data behind.

- [ ] **Step 7: Report** — PASS/FAIL with screenshots + the DB before/after. No PHI in the report (canary data only).

---

## Self-Review

**Coverage:** the two missing endpoints the client calls → Task 1 (built + unit-tested against the exact snake_case/bare-array contract); real HTTP + DB round-trip → Task 2 (live-verify). Registration in `_app.ts` folded into Task 1 (the router is untestable via `appRouter` without it). **Contract fidelity:** `list` returns a bare array (test asserts `Array.isArray`), snake_case preserved (test asserts `dispense_id` etc.), `.in('status', statuses)` filter (test captures args); `updateStatus` sets `reviewed_by=ctx.user.sub`+timestamp, guards on `status='PENDING'`, rejects non-APPROVED/FLAGGED targets. **Mirror fidelity:** procedure builder, error logging (`code` only), audit try/catch, `reviewed_by`/`reviewed_at` all copied from `duplicate-review.ts`. **Known limitations (surfaced, not silently accepted):** (1) no org scoping — `dispense_reviews` has no `org_id` and RLS is `USING(true)`, matching the sibling's reliance on the same permissive model; tightening multi-tenant isolation is a separate concern. (2) `reviewed_by` FK to `practitioners(id)` assumes `ctx.user.sub` is a practitioner id (as the working sibling assumes) — Task 2 Step 5 verifies this against the live FK. (3) Population of the queue is out of scope by decision. **Placeholder scan:** none — all code and test bodies are concrete. **Type consistency:** `statuses: ('PENDING'|'APPROVED'|'FLAGGED')[]` (list input) and `status: 'APPROVED'|'FLAGGED'` (updateStatus input) match the client's `statuses` arrays and `newStatus` values exactly.
