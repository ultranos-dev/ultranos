# Multi-Location SP1a — Facility Sub-Locations (Hub + Admin) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each `pharmacy_facilities` facility a Hub-defined, admin-managed set of named sub-locations, exposed through a facility-scoped read endpoint the pharmacy-lite spoke will later pull.

**Architecture:** A new `facility_locations` Postgres table (child of `pharmacy_facilities`) with a one-primary-per-facility invariant; a `facilityLocationsRouter` tRPC router (facility-scoped read for the spoke + admin-gated CRUD); an admin-portal management page mirroring `PharmacyManager`; a `FacilityLocation` type in shared-types; `facilityLocations` i18n across 4 locales. No spoke code — that is SP1b.

**Tech Stack:** PostgreSQL 17 (Supabase), tRPC + Zod (hub-api), Next.js 15 + ShadCN/ui-kit + next-intl (admin-portal), Vitest, `@ultranos/shared-types`.

**Spec:** `docs/superpowers/specs/2026-09-13-multilocation-sp1a-facility-sublocations-hub-admin-design.md`

## Global Constraints

- **One-facility-per-JWT.** Facility scoping is enforced in the tRPC layer via `ctx.user.facilityId` (from JWT `user_metadata.facility_id`), NOT in Postgres RLS. `ctx.user.facilityId` can be `null` → treat as a hard `FORBIDDEN`, never a silent unscoped read.
- **No `org_id`** on `facility_locations` — consistent with `pharmacy_facilities`.
- **Exactly one `is_primary` per facility.** Enforced by a partial unique index (DB backstop) AND cleared-before-set service logic. The first sub-location of a facility is forced primary. The primary cannot be deactivated or un-primaried in isolation.
- **Migrations are append-only.** New file `061_facility_locations.sql`; never edit a prior migration. Applied via Supabase MCP `apply_migration`. **Applying to the shared remote Supabase project is a side-effect outside the worktree — the controller must get explicit user go-ahead before running Task 2's migration.**
- **shared-types:** string-union enums (not TS `enum`), camelCase props, added to `packages/shared-types/src/fhir/drug-catalog.ts`; rebuild the package before hub-api can import the new type.
- **admin-portal design system:** OPD list-page layout (page root `flex flex-col gap-4`, standalone `<h1>`, one toolbar row, one content box `overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50`); ShadCN from `@/components/ui/*` proxies; icons from `@ultranos/ui-kit/icons`; semantic oklch tokens only; `EmptyState` for empty states; next-intl `useTranslations`.
- **i18n:** identical key sets across `en/ar/prs/ps`; **ar** MSA, **prs** Dari, **ps** genuine Pashto (never Arabic-copied); preserve any `{placeholder}` tokens.
- **No PHI:** sub-location names/kinds are operational facility-layout data. Do not log patient data (none is touched here).

---

### Task 1: shared-types — `FacilityLocation` entity

**Files:**
- Modify: `packages/shared-types/src/fhir/drug-catalog.ts` (add after the existing `PharmacyFacility` interface, ~line 158)
- Test: `packages/shared-types/src/__tests__/facility-location.test.ts` (create — mirror the package's existing test layout; if the package has no `__tests__` dir, create it)

**Interfaces:**
- Produces: `FacilityLocationKind = 'store' | 'room' | 'fridge' | 'cabinet' | 'other'`; `interface FacilityLocation { id; facilityId; name; kind: FacilityLocationKind; isPrimary; isActive; createdAt?; updatedAt? }`. Consumed by Task 3/4 (hub-api router) and Task 6 (admin page).

- [ ] **Step 1: Write the failing test**

Create `packages/shared-types/src/__tests__/facility-location.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import type { FacilityLocation, FacilityLocationKind } from '../index.js'

describe('FacilityLocation type', () => {
  it('accepts a well-formed sub-location value', () => {
    const kinds: FacilityLocationKind[] = ['store', 'room', 'fridge', 'cabinet', 'other']
    const loc: FacilityLocation = {
      id: 'l1', facilityId: 'f1', name: 'Main store', kind: 'store',
      isPrimary: true, isActive: true,
    }
    expect(loc.kind).toBe('store')
    expect(kinds).toContain(loc.kind)
    expect(loc.isPrimary).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @ultranos/shared-types test -- facility-location`
Expected: FAIL — `FacilityLocation` / `FacilityLocationKind` are not exported.

- [ ] **Step 3: Add the type**

In `packages/shared-types/src/fhir/drug-catalog.ts`, immediately after the `PharmacyFacility` interface, add:
```ts
/**
 * A named sub-location inside one pharmacy facility (main store, dispensary,
 * cold-chain fridge, ward cabinet). FHIR-R4-Location-inspired: partOf = the
 * facility, physicalType ≈ kind, status ≈ isActive. Exactly one isPrimary=true
 * per facility. `createdAt` is an Ultranos extension (not FHIR meta).
 */
export type FacilityLocationKind = 'store' | 'room' | 'fridge' | 'cabinet' | 'other'

export interface FacilityLocation {
  id: string
  facilityId: string          // → pharmacy_facilities.id
  name: string
  kind: FacilityLocationKind
  isPrimary: boolean
  isActive: boolean
  createdAt?: string          // ISO 8601
  updatedAt?: string          // ISO 8601
}
```
(The barrel `packages/shared-types/src/index.ts` already does `export * from './fhir/drug-catalog.js'`, so no barrel edit is needed. Verify that line exists; if not, add `export * from './fhir/drug-catalog.js'`.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @ultranos/shared-types test -- facility-location`
Expected: PASS.

- [ ] **Step 5: Build the package so hub-api/admin can import the new type**

Run: `pnpm --filter @ultranos/shared-types build`
Expected: build succeeds; `packages/shared-types/dist/` now exports `FacilityLocation`.

- [ ] **Step 6: Commit**
```bash
git add packages/shared-types/src/fhir/drug-catalog.ts packages/shared-types/src/__tests__/facility-location.test.ts
git commit -m "feat(shared-types): FacilityLocation entity for facility sub-locations"
```

---

### Task 2: Migration `061_facility_locations.sql`

**Files:**
- Create (conceptually): `supabase/migrations/061_facility_locations.sql` — but the migration is **applied via Supabase MCP `apply_migration`** (name: `facility_locations`), which also writes the file. Do NOT hand-write the file and run `psql`.

**Interfaces:**
- Produces: the `facility_locations` table + `idx_facility_locations_facility`, `uq_facility_locations_one_primary` (partial unique), `facility_locations_kind_chk` CHECK, RLS policies, `updated_at` trigger. Consumed at runtime by Task 3/4's router.

> **Controller note:** applying to the shared remote Supabase project is a side-effect outside the worktree. Get explicit user go-ahead before Step 2. There is no unit test — verification is schema introspection (Step 3).

- [ ] **Step 1: Confirm the target name is free**

Use `mcp__plugin_supabase_supabase__list_migrations` and confirm no `facility_locations` migration exists and the latest is `060`. Use `list_tables` (schemas `["public"]`) and confirm there is no `facility_locations` table.
Expected: absent (net-new).

- [ ] **Step 2: Apply the migration**

Call `mcp__plugin_supabase_supabase__apply_migration` with name `facility_locations` and this SQL:
```sql
CREATE TABLE IF NOT EXISTS facility_locations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES pharmacy_facilities(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'store',
  is_primary  BOOLEAN NOT NULL DEFAULT false,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_facility_locations_facility
  ON facility_locations(facility_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_facility_locations_one_primary
  ON facility_locations(facility_id) WHERE is_primary;

ALTER TABLE facility_locations
  ADD CONSTRAINT facility_locations_kind_chk
  CHECK (kind IN ('store','room','fridge','cabinet','other'));

ALTER TABLE facility_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY facility_locations_service_all ON facility_locations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY facility_locations_authenticated_read ON facility_locations
  FOR SELECT TO authenticated USING (is_active = true);

CREATE OR REPLACE FUNCTION update_facility_locations_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_facility_locations_updated_at
  BEFORE UPDATE ON facility_locations
  FOR EACH ROW EXECUTE FUNCTION update_facility_locations_updated_at();
```

- [ ] **Step 3: Verify the schema**

Run via `mcp__plugin_supabase_supabase__execute_sql`:
```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='facility_locations'
ORDER BY ordinal_position;

SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname='public' AND tablename='facility_locations';

SELECT conname FROM pg_constraint
WHERE conrelid='public.facility_locations'::regclass;
```
Expected: 8 columns with the right types/defaults; both indexes present (incl. the `WHERE is_primary` partial unique); the FK, PK, and `facility_locations_kind_chk` constraints present; RLS enabled.

- [ ] **Step 4: Regenerate DB types (if the repo tracks them)**

If the repo has a generated Supabase types file (search for `supabase/types` or a `Database` type import in hub-api), run `mcp__plugin_supabase_supabase__generate_typescript_types` and update it. If no such tracked file exists (hub-api uses untyped `ctx.supabase.from(...)`), skip — note this in the task report.

- [ ] **Step 5: Commit the migration file**

The `apply_migration` call writes `supabase/migrations/*_facility_locations.sql`. Commit it (and the regenerated types, if any):
```bash
git add supabase/migrations/
git commit -m "feat(hub): facility_locations table (facility sub-locations, one-primary invariant)"
```

---

### Task 3: `facilityLocationsRouter` — read procedures + registration

**Files:**
- Create: `apps/hub-api/src/trpc/routers/facility-locations.ts`
- Modify: `apps/hub-api/src/trpc/routers/_app.ts` (import + register `facilityLocations`)
- Test: `apps/hub-api/src/__tests__/facility-locations.test.ts`

**Interfaces:**
- Consumes: `FacilityLocation`, `FacilityLocationKind` (Task 1); `createTRPCRouter`, `protectedProcedure` from `../init`; `ctx.supabase`, `ctx.user.{role,facilityId}`.
- Produces: `facilityLocationsRouter` with `listForFacility()` and `listForAdmin({ facilityId })`; the `toFacilityLocation(row)` mapper and the local `adminProcedure` guard (Task 4 extends this same file with the write procedures).

- [ ] **Step 1: Write the failing tests**

Create `apps/hub-api/src/__tests__/facility-locations.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { facilityLocationsRouter } from '@/trpc/routers/facility-locations'

// A chainable supabase-query mock whose terminal call resolves to { data, error }.
function queryMock(result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue(result),
  }
}

describe('facilityLocations.listForFacility', () => {
  it('FORBIDDEN when the JWT has no facilityId', async () => {
    const c = { supabase: { from: vi.fn() }, user: { role: 'PHARMACIST', facilityId: null } } as never
    await expect(facilityLocationsRouter.createCaller(c).listForFacility())
      .rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('returns the caller-facility rows mapped, primary first', async () => {
    const rows = [
      { id: 'l1', facility_id: 'f1', name: 'Fridge', kind: 'fridge', is_primary: false, is_active: true, created_at: 'c', updated_at: 'u' },
      { id: 'l2', facility_id: 'f1', name: 'Main', kind: 'store', is_primary: true, is_active: true, created_at: 'c', updated_at: 'u' },
    ]
    const q = queryMock({ data: rows, error: null })
    const c = { supabase: { from: vi.fn(() => q) }, user: { role: 'PHARMACIST', facilityId: 'f1' } } as never
    const res = await facilityLocationsRouter.createCaller(c).listForFacility()
    expect(q.eq).toHaveBeenCalledWith('facility_id', 'f1')
    expect(res).toHaveLength(2)
    expect(res[0]).toEqual({ id: 'l1', facilityId: 'f1', name: 'Fridge', kind: 'fridge', isPrimary: false, isActive: true, createdAt: 'c', updatedAt: 'u' })
  })
})

describe('facilityLocations.listForAdmin', () => {
  it('rejects a non-admin caller', async () => {
    const c = { supabase: { from: vi.fn() }, user: { role: 'PHARMACIST', facilityId: 'f1' } } as never
    await expect(facilityLocationsRouter.createCaller(c).listForAdmin({ facilityId: '11111111-1111-1111-1111-111111111111' }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('returns rows for the requested facility for an admin', async () => {
    const rows = [{ id: 'l1', facility_id: 'f9', name: 'Main', kind: 'store', is_primary: true, is_active: true, created_at: 'c', updated_at: 'u' }]
    const q = queryMock({ data: rows, error: null })
    const c = { supabase: { from: vi.fn(() => q) }, user: { role: 'ADMIN', facilityId: null } } as never
    const res = await facilityLocationsRouter.createCaller(c).listForAdmin({ facilityId: 'f9' })
    expect(q.eq).toHaveBeenCalledWith('facility_id', 'f9')
    expect(res[0]!.name).toBe('Main')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @ultranos/hub-api test -- facility-locations`
Expected: FAIL — module `facility-locations` not found.

- [ ] **Step 3: Create the router (read procedures)**

Create `apps/hub-api/src/trpc/routers/facility-locations.ts`:
```ts
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '../init'
import type { FacilityLocation, FacilityLocationKind } from '@ultranos/shared-types'

/** ADMIN-role-only guard (mirrors pharmacy.ts). */
const adminProcedure = protectedProcedure.use(async (opts) => {
  if (opts.ctx.user?.role !== 'ADMIN') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' })
  }
  return opts.next(opts)
})

export function toFacilityLocation(row: Record<string, unknown>): FacilityLocation {
  return {
    id: row.id as string,
    facilityId: row.facility_id as string,
    name: row.name as string,
    kind: row.kind as FacilityLocationKind,
    isPrimary: row.is_primary as boolean,
    isActive: row.is_active as boolean,
    createdAt: (row.created_at as string) ?? undefined,
    updatedAt: (row.updated_at as string) ?? undefined,
  }
}

const kindSchema = z.enum(['store', 'room', 'fridge', 'cabinet', 'other'])

async function selectByFacility(supabase: any, facilityId: string): Promise<FacilityLocation[]> {
  const { data, error } = await supabase
    .from('facility_locations')
    .select('*')
    .eq('facility_id', facilityId)
    .order('is_primary', { ascending: false })
    .order('name', { ascending: true })
  if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
  return (data ?? []).map(toFacilityLocation)
}

export const facilityLocationsRouter = createTRPCRouter({
  // Spoke pull contract: caller's own facility, active AND inactive rows.
  listForFacility: protectedProcedure.query(async ({ ctx }): Promise<FacilityLocation[]> => {
    const facilityId = ctx.user?.facilityId
    if (!facilityId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'MISSING_FACILITY_CONTEXT' })
    }
    return selectByFacility(ctx.supabase, facilityId)
  }),

  listForAdmin: adminProcedure
    .input(z.object({ facilityId: z.string().uuid() }))
    .query(async ({ ctx, input }): Promise<FacilityLocation[]> => {
      return selectByFacility(ctx.supabase, input.facilityId)
    }),
})

export { kindSchema, adminProcedure }
```
(Note: the second `.order(...)` in the mock chain resolves the promise — the test's `queryMock` resolves on the first `order` call, so implement the query with the terminal awaited call being an `.order`. The two `.order` calls both return the chain; the LAST awaited one resolves. In the test mock, `order` is `mockResolvedValue`, so BOTH calls return the resolved value — the first `.order()` call already resolves. That is fine because the code `await`s the whole builder once; adjust the mock if needing two orders — see Step 4.)

- [ ] **Step 4: Reconcile the test mock with two `.order()` calls**

Because the implementation chains `.order().order()`, update `queryMock` so the FIRST `.order()` returns `this` and the SECOND resolves:
```ts
function queryMock(result: { data: unknown; error: unknown }) {
  const q: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
  }
  q.order = vi.fn()
    .mockReturnValueOnce(q)          // first .order('is_primary', …)
    .mockResolvedValueOnce(result)   // second .order('name', …) resolves
  return q
}
```
Apply this to `facility-locations.test.ts` (both `listForFacility` and `listForAdmin` success cases build a fresh `queryMock`).

- [ ] **Step 5: Register the router in `_app.ts`**

In `apps/hub-api/src/trpc/routers/_app.ts`: add the import beside the others:
```ts
import { facilityLocationsRouter } from './facility-locations'
```
and add the key inside `createTRPCRouter({ … })` (next to `pharmacy: pharmacyRouter`):
```ts
  facilityLocations: facilityLocationsRouter,
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @ultranos/hub-api test -- facility-locations`
Expected: PASS (4 tests). Then `pnpm --filter @ultranos/hub-api typecheck` — no new errors in touched files.

- [ ] **Step 7: Commit**
```bash
git add apps/hub-api/src/trpc/routers/facility-locations.ts apps/hub-api/src/trpc/routers/_app.ts apps/hub-api/src/__tests__/facility-locations.test.ts
git commit -m "feat(hub): facilityLocations router reads (listForFacility + listForAdmin)"
```

---

### Task 4: `facilityLocationsRouter` — write procedures + primary invariant

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/facility-locations.ts` (add `create`, `update`, `setActive`)
- Test: `apps/hub-api/src/__tests__/facility-locations.test.ts` (extend)

**Interfaces:**
- Consumes: `adminProcedure`, `kindSchema`, `toFacilityLocation` (Task 3, same file).
- Produces: `create({ facilityId, name, kind?, isPrimary? })`, `update({ id, name?, kind?, isPrimary? })`, `setActive({ id, isActive })` — all admin-gated, all returning a `FacilityLocation`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/hub-api/src/__tests__/facility-locations.test.ts`:
```ts
describe('facilityLocations.create', () => {
  it('forces the first sub-location of a facility to be primary', async () => {
    const existing = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: [], error: null }) }
    let inserted: Record<string, unknown> | undefined
    const insertChain = {
      insert: vi.fn((row: Record<string, unknown>) => { inserted = row; return insertChain }),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'l1', facility_id: 'f1', name: 'Main', kind: 'store', is_primary: true, is_active: true }, error: null }),
    }
    const from = vi.fn().mockReturnValueOnce(existing).mockReturnValueOnce(insertChain)
    const c = { supabase: { from }, user: { role: 'ADMIN' } } as never
    const res = await facilityLocationsRouter.createCaller(c).create({ facilityId: 'f1', name: 'Main' })
    expect(inserted).toMatchObject({ facility_id: 'f1', name: 'Main', kind: 'store', is_primary: true })
    expect(res.isPrimary).toBe(true)
  })

  it('clears the existing primary when a later create is marked primary', async () => {
    const existing = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: [{ id: 'l0', is_primary: true }], error: null }) }
    const clear = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockResolvedValue({ error: null }) }
    const insertChain = { insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: 'l1', facility_id: 'f1', name: 'B', kind: 'room', is_primary: true, is_active: true }, error: null }) }
    const from = vi.fn().mockReturnValueOnce(existing).mockReturnValueOnce(clear).mockReturnValueOnce(insertChain)
    const c = { supabase: { from }, user: { role: 'ADMIN' } } as never
    const res = await facilityLocationsRouter.createCaller(c).create({ facilityId: 'f1', name: 'B', kind: 'room', isPrimary: true })
    expect(clear.update).toHaveBeenCalledWith({ is_primary: false })
    expect(res.isPrimary).toBe(true)
  })

  it('maps a FK violation to NOT_FOUND (unknown facility)', async () => {
    const existing = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: [], error: null }) }
    const insertChain = { insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: { code: '23503' } }) }
    const from = vi.fn().mockReturnValueOnce(existing).mockReturnValueOnce(insertChain)
    const c = { supabase: { from }, user: { role: 'ADMIN' } } as never
    await expect(facilityLocationsRouter.createCaller(c).create({ facilityId: 'nope', name: 'X' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('facilityLocations.update', () => {
  it('rejects isPrimary:false (cannot un-primary in isolation)', async () => {
    const c = { supabase: { from: vi.fn() }, user: { role: 'ADMIN' } } as never
    await expect(facilityLocationsRouter.createCaller(c).update({ id: 'l1', isPrimary: false }))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })
})

describe('facilityLocations.setActive', () => {
  it('rejects deactivating the primary', async () => {
    const lookup = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { is_primary: true }, error: null }) }
    const c = { supabase: { from: vi.fn(() => lookup) }, user: { role: 'ADMIN' } } as never
    await expect(facilityLocationsRouter.createCaller(c).setActive({ id: 'l1', isActive: false }))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })
})
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `pnpm --filter @ultranos/hub-api test -- facility-locations`
Expected: FAIL — `create`/`update`/`setActive` are not defined on the router.

- [ ] **Step 3: Add the write procedures**

In `apps/hub-api/src/trpc/routers/facility-locations.ts`, add these three procedures inside `createTRPCRouter({ … })` (after `listForAdmin`):
```ts
  create: adminProcedure
    .input(z.object({
      facilityId: z.string().uuid(),
      name: z.string().trim().min(1).max(200),
      kind: kindSchema.default('store'),
      isPrimary: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }): Promise<FacilityLocation> => {
      const { data: existing, error: exErr } = await ctx.supabase
        .from('facility_locations').select('id, is_primary').eq('facility_id', input.facilityId)
      if (exErr) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
      const rows = (existing ?? []) as { id: string; is_primary: boolean }[]
      const forcePrimary = rows.length === 0
      const effectivePrimary = forcePrimary || input.isPrimary === true

      if (effectivePrimary && rows.some((r) => r.is_primary)) {
        const { error: clrErr } = await ctx.supabase
          .from('facility_locations').update({ is_primary: false })
          .eq('facility_id', input.facilityId).is('is_primary', true)
        if (clrErr) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
      }

      const { data, error } = await ctx.supabase
        .from('facility_locations')
        .insert({ facility_id: input.facilityId, name: input.name, kind: input.kind, is_primary: effectivePrimary, is_active: true })
        .select('*').single()
      if (error?.code === '23503') throw new TRPCError({ code: 'NOT_FOUND', message: 'FACILITY_NOT_FOUND' })
      if (error || !data) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
      return toFacilityLocation(data)
    }),

  update: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(200).optional(),
      kind: kindSchema.optional(),
      isPrimary: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }): Promise<FacilityLocation> => {
      if (input.isPrimary === false) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'CANNOT_UNSET_PRIMARY' })
      }
      // If promoting to primary, find this row's facility and clear the old primary.
      if (input.isPrimary === true) {
        const { data: row, error: rErr } = await ctx.supabase
          .from('facility_locations').select('facility_id').eq('id', input.id).single()
        if (rErr || !row) throw new TRPCError({ code: 'NOT_FOUND' })
        const { error: clrErr } = await ctx.supabase
          .from('facility_locations').update({ is_primary: false })
          .eq('facility_id', (row as { facility_id: string }).facility_id).is('is_primary', true)
        if (clrErr) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
      }
      const fields: Record<string, unknown> = {}
      if (input.name !== undefined) fields.name = input.name
      if (input.kind !== undefined) fields.kind = input.kind
      if (input.isPrimary === true) fields.is_primary = true
      const { data, error } = await ctx.supabase
        .from('facility_locations').update(fields).eq('id', input.id).select('*').single()
      if (error || !data) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
      return toFacilityLocation(data)
    }),

  setActive: adminProcedure
    .input(z.object({ id: z.string().uuid(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }): Promise<FacilityLocation> => {
      if (!input.isActive) {
        const { data: row, error: rErr } = await ctx.supabase
          .from('facility_locations').select('is_primary').eq('id', input.id).single()
        if (rErr || !row) throw new TRPCError({ code: 'NOT_FOUND' })
        if ((row as { is_primary: boolean }).is_primary) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'CANNOT_DEACTIVATE_PRIMARY' })
        }
      }
      const { data, error } = await ctx.supabase
        .from('facility_locations').update({ is_active: input.isActive }).eq('id', input.id).select('*').single()
      if (error || !data) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
      return toFacilityLocation(data)
    }),
```

- [ ] **Step 4: Run to verify all tests pass**

Run: `pnpm --filter @ultranos/hub-api test -- facility-locations`
Expected: PASS (all read + write tests). Then `pnpm --filter @ultranos/hub-api typecheck` — no new errors.

- [ ] **Step 5: Commit**
```bash
git add apps/hub-api/src/trpc/routers/facility-locations.ts apps/hub-api/src/__tests__/facility-locations.test.ts
git commit -m "feat(hub): facilityLocations write procedures + one-primary invariant"
```

---

### Task 5: admin-portal i18n — `facilityLocations` namespace (4 locales)

**Files:**
- Modify: `apps/admin-portal/messages/{en,ar,prs,ps}.json`

**Interfaces:**
- Produces: a top-level `facilityLocations` namespace. Consumed by Task 6.

- [ ] **Step 1: Add the keys to `en.json`**

Add a new top-level `"facilityLocations"` object (place it near the existing `"pharmacies"` namespace):
```json
"facilityLocations": {
  "title": "Sub-locations",
  "add": "Add sub-location",
  "searchPlaceholder": "Search sub-locations…",
  "colName": "Name",
  "colKind": "Kind",
  "colPrimary": "Primary",
  "colStatus": "Status",
  "kindStore": "Store",
  "kindRoom": "Room",
  "kindFridge": "Fridge",
  "kindCabinet": "Cabinet",
  "kindOther": "Other",
  "primary": "Primary",
  "setPrimary": "Set primary",
  "active": "Active",
  "inactive": "Inactive",
  "deactivate": "Deactivate",
  "reactivate": "Reactivate",
  "edit": "Edit",
  "fieldName": "Name",
  "fieldKind": "Kind",
  "fieldPrimary": "Primary sub-location",
  "save": "Save",
  "cancel": "Cancel",
  "saveError": "Could not save. Please try again.",
  "cannotDeactivatePrimary": "Reassign the primary sub-location first.",
  "empty": "No sub-locations yet",
  "emptyDescription": "Add the facility's stores, rooms, and fridges here.",
  "loading": "Loading…"
}
```

- [ ] **Step 2: Mirror into `ar.json`, `prs.json`, `ps.json`**

Add the same key set with accurate native translations: **ar** Modern Standard Arabic, **prs** Dari, **ps** genuine Pashto (Pashto-specific letters, never Arabic-copied). Identical key sets across all four files.

- [ ] **Step 3: Verify parity + JSON validity**

Run:
```bash
node -e "const l=['en','ar','prs','ps'].map(x=>JSON.parse(require('fs').readFileSync('apps/admin-portal/messages/'+x+'.json','utf8')));const k=o=>Object.keys(o).sort().join(',');console.log(l.every(m=>k(m.facilityLocations)===k(l[0].facilityLocations))?'PARITY OK':'PARITY FAIL')"
```
Expected: `PARITY OK`.

Then confirm Pashto is genuine (no key equals its Arabic or English counterpart):
```bash
node -e "const r=x=>JSON.parse(require('fs').readFileSync('apps/admin-portal/messages/'+x+'.json','utf8')).facilityLocations;const en=r('en'),ar=r('ar'),ps=r('ps');const k=Object.keys(en);const same=(a,b)=>k.filter(x=>a[x]===b[x]).length;console.log('ps==en:',same(ps,en),'ps==ar:',same(ps,ar))"
```
Expected: `ps==en: 0 ps==ar: 0`.

- [ ] **Step 4: Commit**
```bash
git add apps/admin-portal/messages/en.json apps/admin-portal/messages/ar.json apps/admin-portal/messages/prs.json apps/admin-portal/messages/ps.json
git commit -m "feat(admin-portal): i18n for facility sub-locations (4 locales)"
```

---

### Task 6: admin-portal — `FacilityLocationsManager` page + route + nav

**Files:**
- Create: `apps/admin-portal/src/components/pharmacies/FacilityLocationsManager.tsx`
- Create: `apps/admin-portal/src/app/[locale]/pharmacies/[facilityId]/locations/page.tsx`
- Modify: `apps/admin-portal/src/components/pharmacies/PharmacyManager.tsx` (add a "Manage locations" row action)
- Modify: `apps/admin-portal/src/lib/route-map.ts` (breadcrumb labels)
- Test: `apps/admin-portal/src/__tests__/facility-locations-manager.test.tsx`

**Interfaces:**
- Consumes: `trpc.facilityLocations.listForAdmin/create/update/setActive` (Tasks 3/4); the `facilityLocations` i18n (Task 5); ShadCN from `@/components/ui/*`; icons from `@ultranos/ui-kit/icons`.

- [ ] **Step 1: Write the failing test**

Create `apps/admin-portal/src/__tests__/facility-locations-manager.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { FacilityLocationsManager } from '@/components/pharmacies/FacilityLocationsManager'

vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k, useLocale: () => 'en' }))
const listForAdmin = vi.fn()
const create = vi.fn()
vi.mock('@/lib/trpc', () => ({
  trpc: { facilityLocations: {
    listForAdmin: { query: (...a: unknown[]) => listForAdmin(...a) },
    create: { mutate: (...a: unknown[]) => create(...a) },
    update: { mutate: vi.fn() },
    setActive: { mutate: vi.fn() },
  } },
}))

describe('FacilityLocationsManager', () => {
  it('lists a facility’s sub-locations', async () => {
    listForAdmin.mockResolvedValue([{ id: 'l1', facilityId: 'f1', name: 'Main store', kind: 'store', isPrimary: true, isActive: true }])
    render(<FacilityLocationsManager facilityId="f1" />)
    await waitFor(() => expect(screen.getByText('Main store')).toBeInTheDocument())
    expect(listForAdmin).toHaveBeenCalledWith({ facilityId: 'f1' })
  })

  it('shows the empty state when the facility has no sub-locations', async () => {
    listForAdmin.mockResolvedValue([])
    render(<FacilityLocationsManager facilityId="f1" />)
    await waitFor(() => expect(screen.getByText('empty')).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @ultranos/admin-portal test -- facility-locations-manager`
Expected: FAIL — component not found.

- [ ] **Step 3: Create the component**

Create `apps/admin-portal/src/components/pharmacies/FacilityLocationsManager.tsx`, mirroring `PharmacyManager` (list + toolbar + content box) plus a shared create/edit `Dialog` (discriminated by `editing !== null`, like the suppliers page). Props: `{ facilityId: string }`. Use `const t = useTranslations('facilityLocations')`. Load with `trpc.facilityLocations.listForAdmin.query({ facilityId })` in `useEffect`. Table columns: name; kind (localized via `t('kind' + Capitalized)`); primary (a `Badge` for the primary row, else a `Set primary` `Button` calling `update({ id, isPrimary: true })`); status (`Badge` + a Deactivate/Reactivate `Button` calling `setActive`; on the primary row the Deactivate button is disabled with the `cannotDeactivatePrimary` title); edit (`Button` opening the Dialog). The Dialog has a name `Input`, a kind `<select>` (options store/room/fridge/cabinet/other), and a `Primary` checkbox; Save calls `create({ facilityId, name, kind, isPrimary })` for a new row or `update({ id, name, kind, ...(isPrimary?{isPrimary:true}:{}) })` when editing. Reload after each mutation. Errors caught into state and shown with `role="alert" className="text-sm text-destructive"`. Page root `<div className="flex flex-col gap-4">`, standalone `<h1>{t('title')}</h1>`, one toolbar row (`SearchInput` `min-w-[200px] flex-1` + `Add` `Button`), one content box `overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50` with loading/`EmptyState` inside. Semantic tokens only; icons from `@ultranos/ui-kit/icons` (e.g. `Warehouse`/`FileSearch`).

  > Follow `apps/admin-portal/src/components/pharmacies/PharmacyManager.tsx` for the exact imports (from `@/components/ui/*`), toolbar, table, and Dialog structure, and `apps/admin-portal/src/app/[locale]/inventory/suppliers/page.tsx` for the shared create/edit Dialog `editing` discriminant + `window.confirm` deactivate.

- [ ] **Step 4: Create the route**

Create `apps/admin-portal/src/app/[locale]/pharmacies/[facilityId]/locations/page.tsx`:
```tsx
import { FacilityLocationsManager } from '@/components/pharmacies/FacilityLocationsManager'

export default async function Page({ params }: { params: Promise<{ facilityId: string }> }) {
  const { facilityId } = await params
  return <FacilityLocationsManager facilityId={facilityId} />
}
```
(Confirm the Next.js version's `params` shape against a sibling dynamic route in admin-portal — if `params` is synchronous there, drop the `await`/`Promise<>`. Match the existing convention exactly.)

- [ ] **Step 5: Add the "Manage locations" row action to `PharmacyManager`**

In `PharmacyManager.tsx`, in the actions cell of each facility row (beside the active toggle), add a link/button navigating to the sub-locations route. Use the app's existing navigation primitive (a `next-intl`/`next/link` `Link` if the file/siblings use one; otherwise a `Button` with `onClick={() => router.push(\`/pharmacies/${pharmacy.id}/locations\`)}` using the router hook already imported in sibling pages). Label it with a new `pharmacies` i18n key `manageLocations` (add `"manageLocations": "Locations"` to all 4 `pharmacies` namespaces — mirror the Task 5 parity check for the `pharmacies` namespace).

- [ ] **Step 6: Register breadcrumb labels**

In `apps/admin-portal/src/lib/route-map.ts` `ROUTE_LABELS`, add entries so the breadcrumb reads correctly: a `pharmacies` label (currently missing) and a `locations` label. Follow the existing `ROUTE_LABELS` shape in that file.

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm --filter @ultranos/admin-portal test -- facility-locations-manager`
Expected: PASS (2 tests). Then `pnpm --filter @ultranos/admin-portal typecheck` — no new errors in touched files.

- [ ] **Step 8: Commit**
```bash
git add apps/admin-portal/src/components/pharmacies/FacilityLocationsManager.tsx "apps/admin-portal/src/app/[locale]/pharmacies/[facilityId]/locations/page.tsx" apps/admin-portal/src/components/pharmacies/PharmacyManager.tsx apps/admin-portal/src/lib/route-map.ts apps/admin-portal/src/__tests__/facility-locations-manager.test.tsx apps/admin-portal/messages/en.json apps/admin-portal/messages/ar.json apps/admin-portal/messages/prs.json apps/admin-portal/messages/ps.json
git commit -m "feat(admin-portal): facility sub-locations management page + nav"
```

---

## Final Verification (after all tasks)

- [ ] `pnpm --filter @ultranos/shared-types build` — succeeds (the new type is in `dist/`).
- [ ] `pnpm --filter @ultranos/hub-api test -- facility-locations` — all router tests green.
- [ ] `pnpm --filter @ultranos/admin-portal test -- facility-locations-manager` — green.
- [ ] `pnpm --filter @ultranos/hub-api typecheck` and `pnpm --filter @ultranos/admin-portal typecheck` — no NEW errors in touched files (record any pre-existing baseline errors).
- [ ] i18n parity: `facilityLocations` (and `pharmacies.manageLocations`) key sets identical across en/ar/prs/ps; Pashto genuine.
- [ ] DB: `facility_locations` exists with the partial unique index; a manual sanity insert of two rows for one facility with `is_primary=true` twice is rejected by `uq_facility_locations_one_primary` (proves the invariant at the DB).
- [ ] End-to-end sanity (manual, optional): as an admin, open a facility's `/pharmacies/[id]/locations`, add "Main store" (auto-primary), add "Fridge", set "Fridge" primary (Main clears), deactivate "Main" (allowed, non-primary), try deactivating "Fridge" (blocked — primary).
- [ ] No PHI in logs; no `org_id` added; migration is additive (061, prior migrations untouched); `_app.ts` is the only routing wiring change.

## Notes / deliberate deviations from the spec

- **`listForAdmin` on an unknown facility returns `[]`** (not `NOT_FOUND`). The admin always reaches the page from a real facility row, and `create` still maps the FK violation to `NOT_FOUND`; an explicit existence pre-check would add a round-trip for no user-visible benefit. (Spec §Hub API mentioned a NOT_FOUND validation; this is the pragmatic equivalent.)
- **`create` maps the Postgres FK error (`23503`) to `NOT_FOUND`** rather than doing a separate `pharmacy_facilities` existence query — one fewer round-trip, same result.
