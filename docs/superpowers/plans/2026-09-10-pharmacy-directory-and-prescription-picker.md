# Pharmacy Directory & Prescription Pharmacy Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins manage a global pharmacy directory, and let doctors optionally attach a preferred pharmacy to a prescription via an offline-capable search dropdown.

**Architecture:** A new Hub `pharmacy` tRPC router exposes admin CRUD + a clinical `search`/`sync` over the existing global `pharmacy_facilities` table. Admin-portal gets a Pharmacy management page (producer). OPD-Lite mirrors the directory into Dexie, searches it (Hub online / Fuse.js offline), and records the choice on `MedicationRequest.dispenseRequest.performer` (a non-binding hint).

**Tech Stack:** Next.js 15, TypeScript, tRPC, Supabase Postgres, Dexie, Fuse.js, Vitest, ui-kit (ShadCN/Radix).

**Spec:** `docs/superpowers/specs/2026-09-10-pharmacy-directory-and-prescription-picker-design.md`

## Global Constraints

- **DB ops via Supabase MCP only** — migrations through `mcp__plugin_supabase_supabase__apply_migration` (project_id `hqgxvrjccmfjzkhotyib`); never hand-run SQL files.
- **No autonomous commits** — per repo policy, only commit when the user has authorized it. The commit steps below are the intended boundaries; batch/hold them per the user's instruction at execution time.
- **TDD**: failing test first, watch it fail, minimal code, watch it pass.
- **Pharmacy directory is non-PHI reference data** — no audit event on search/sync; no PHI in logs.
- **FHIR field names** — `dispenseRequest.performer` is a `Reference(Organization)`; ref format `Organization/<facilityId>`.
- **UI**: import ui-kit from `@ultranos/ui-kit/components/ui/*`; semantic tokens only; follow the OPD list-page layout standard for the admin page.
- **Scope**: `facility_type = 'pharmacy'` only; global directory; ADMIN-gated CRUD; manual lat/long entry.
- **Test commands**: `pnpm -F hub-api exec vitest run <path>`, `pnpm -F opd-lite exec vitest run <path>`, `pnpm -F admin-portal exec vitest run <path>`, `pnpm -F @ultranos/shared-types exec vitest run <path>`.

---

## PHASE 1 — Pharmacy Directory (producer)

### Task 1: Shared types — directory entry + PharmacyFacility fields

**Files:**
- Modify: `packages/shared-types/src/fhir/drug-catalog.ts`
- Test: `packages/shared-types/src/__tests__/pharmacy-directory.test.ts`

**Interfaces:**
- Produces: `PharmacyDirectoryEntry { id, name, address?, province?, district?, facilityType, updatedAt? }`; `PharmacyFacility` gains optional `province?`, `district?`, `facilityType?`, `isActive?`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared-types/src/__tests__/pharmacy-directory.test.ts
import { describe, it, expect } from 'vitest'
import type { PharmacyDirectoryEntry } from '../fhir/drug-catalog'

describe('PharmacyDirectoryEntry', () => {
  it('accepts a directory row shape', () => {
    const e: PharmacyDirectoryEntry = {
      id: 'p1', name: 'Kabul City Pharmacy', address: 'Shahr-e Naw',
      province: 'Kabul', district: 'District 10', facilityType: 'pharmacy',
      updatedAt: '2026-09-10T00:00:00Z',
    }
    expect(e.facilityType).toBe('pharmacy')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F @ultranos/shared-types exec vitest run src/__tests__/pharmacy-directory.test.ts`
Expected: FAIL — `PharmacyDirectoryEntry` not exported.

- [ ] **Step 3: Add the types**

In `packages/shared-types/src/fhir/drug-catalog.ts`, extend `PharmacyFacility` and add the entry type near it:

```ts
export interface PharmacyFacility {
  id: string
  name: string
  latitude: number
  longitude: number
  address?: string
  province?: string
  district?: string
  facilityType?: 'pharmacy' | 'clinic' | 'hospital'
  isActive?: boolean
}

/** Lightweight directory row for search results and the OPD offline mirror. */
export interface PharmacyDirectoryEntry {
  id: string
  name: string
  address?: string
  province?: string
  district?: string
  facilityType: 'pharmacy' | 'clinic' | 'hospital'
  updatedAt?: string
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F @ultranos/shared-types exec vitest run src/__tests__/pharmacy-directory.test.ts`
Expected: PASS. Then build the package: `pnpm -F @ultranos/shared-types build`.

- [ ] **Step 5: Commit**

```bash
git add packages/shared-types/src/fhir/drug-catalog.ts packages/shared-types/src/__tests__/pharmacy-directory.test.ts
git commit -m "feat(shared-types): pharmacy directory entry type"
```

---

### Task 2: DB migration — trigram search index

**Files:**
- Apply migration via Supabase MCP (no repo file edit).

- [ ] **Step 1: Apply the migration**

Call `mcp__plugin_supabase_supabase__apply_migration` with project_id `hqgxvrjccmfjzkhotyib`, name `058_pharmacy_facilities_search_index`, query:

```sql
create extension if not exists pg_trgm;
create index if not exists idx_pharmacy_facilities_name_trgm
  on pharmacy_facilities using gin (name gin_trgm_ops);
create index if not exists idx_pharmacy_facilities_address_trgm
  on pharmacy_facilities using gin (address gin_trgm_ops);
create index if not exists idx_pharmacy_facilities_province_trgm
  on pharmacy_facilities using gin (province gin_trgm_ops);
```

- [ ] **Step 2: Verify**

Run `mcp__plugin_supabase_supabase__execute_sql`:
```sql
select indexname from pg_indexes where tablename='pharmacy_facilities' and indexname like 'idx_pharmacy_facilities_%trgm';
```
Expected: three rows.

---

### Task 3: DB seed — starter pharmacies

**Files:**
- Apply migration via Supabase MCP.

- [ ] **Step 1: Apply the seed migration**

`apply_migration` name `059_seed_pharmacy_facilities`, query (idempotent on fixed UUIDs):

```sql
insert into pharmacy_facilities (id, name, latitude, longitude, address, province, district, facility_type, is_active)
values
  ('11111111-1111-1111-1111-111111111101','Kabul City Pharmacy',34.5553,69.2075,'Shahr-e Naw','Kabul','District 10','pharmacy',true),
  ('11111111-1111-1111-1111-111111111102','Green Cross Pharmacy',34.5261,69.1777,'Karte Se','Kabul','District 6','pharmacy',true),
  ('11111111-1111-1111-1111-111111111103','Herat Central Drug Store',34.3529,62.2040,'Central Bazaar','Herat','Injil','pharmacy',true),
  ('11111111-1111-1111-1111-111111111104','Balkh Health Pharmacy',36.7090,67.1109,'Main Road','Balkh','Mazar-e Sharif','pharmacy',true),
  ('11111111-1111-1111-1111-111111111105','Kandahar Care Pharmacy',31.6289,65.7372,'Shahr-e Naw','Kandahar','District 1','pharmacy',true),
  ('11111111-1111-1111-1111-111111111106','Nangarhar Family Pharmacy',34.4265,70.4515,'Jalalabad Center','Nangarhar','Jalalabad','pharmacy',true),
  ('11111111-1111-1111-1111-111111111107','Kunduz Relief Pharmacy',36.7286,68.8681,'City Center','Kunduz','Kunduz','pharmacy',true),
  ('11111111-1111-1111-1111-111111111108','Bamyan Community Pharmacy',34.8100,67.8210,'Bazaar Street','Bamyan','Bamyan','pharmacy',true)
on conflict (id) do nothing;
```

- [ ] **Step 2: Verify**

`execute_sql`: `select count(*) from pharmacy_facilities where is_active and facility_type='pharmacy';`
Expected: `>= 8`.

---

### Task 4: Hub `pharmacy` router — `search`

**Files:**
- Create: `apps/hub-api/src/trpc/routers/pharmacy.ts`
- Modify: `apps/hub-api/src/trpc/routers/_app.ts`
- Test: `apps/hub-api/src/__tests__/pharmacy.test.ts`

**Interfaces:**
- Produces: `pharmacyRouter.search({ q, limit }) -> PharmacyDirectoryEntry[]`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/hub-api/src/__tests__/pharmacy.test.ts
import { describe, it, expect, vi } from 'vitest'
import { pharmacyRouter } from '@/trpc/routers/pharmacy'

function ctx(rows: unknown[]) {
  const q = {
    select: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
  }
  return { supabase: { from: vi.fn(() => q) }, user: { role: 'DOCTOR' } } as never
}

describe('pharmacy.search', () => {
  it('maps facility rows to directory entries', async () => {
    const caller = pharmacyRouter.createCaller(ctx([
      { id: 'p1', name: 'Kabul City Pharmacy', address: 'Shahr-e Naw', province: 'Kabul', district: 'D10', facility_type: 'pharmacy', updated_at: '2026-09-10T00:00:00Z' },
    ]))
    const res = await caller.search({ q: 'kabul', limit: 20 })
    expect(res[0]).toEqual({ id: 'p1', name: 'Kabul City Pharmacy', address: 'Shahr-e Naw', province: 'Kabul', district: 'D10', facilityType: 'pharmacy', updatedAt: '2026-09-10T00:00:00Z' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F hub-api exec vitest run src/__tests__/pharmacy.test.ts`
Expected: FAIL — module `pharmacy` not found.

- [ ] **Step 3: Create the router with `search`**

```ts
// apps/hub-api/src/trpc/routers/pharmacy.ts
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '../init'
import type { PharmacyDirectoryEntry } from '@ultranos/shared-types'

function toDirectoryEntry(row: Record<string, unknown>): PharmacyDirectoryEntry {
  return {
    id: row.id as string,
    name: row.name as string,
    address: (row.address as string) ?? undefined,
    province: (row.province as string) ?? undefined,
    district: (row.district as string) ?? undefined,
    facilityType: (row.facility_type as PharmacyDirectoryEntry['facilityType']),
    updatedAt: (row.updated_at as string) ?? undefined,
  }
}

export const pharmacyRouter = createTRPCRouter({
  search: protectedProcedure
    .input(z.object({ q: z.string().min(1).max(100), limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }): Promise<PharmacyDirectoryEntry[]> => {
      const likeQ = `%${input.q.toLowerCase()}%`
      const { data, error } = await ctx.supabase
        .from('pharmacy_facilities')
        .select('id, name, address, province, district, facility_type, updated_at')
        .eq('facility_type', 'pharmacy')
        .eq('is_active', true)
        .or([`name.ilike.${likeQ}`, `address.ilike.${likeQ}`, `province.ilike.${likeQ}`, `district.ilike.${likeQ}`].join(','))
        .limit(input.limit)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
      return (data ?? []).map(toDirectoryEntry)
    }),
})
```

Register in `_app.ts`: add `import { pharmacyRouter } from './pharmacy'` and `pharmacy: pharmacyRouter,` in `createTRPCRouter({...})`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F hub-api exec vitest run src/__tests__/pharmacy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/hub-api/src/trpc/routers/pharmacy.ts apps/hub-api/src/trpc/routers/_app.ts apps/hub-api/src/__tests__/pharmacy.test.ts
git commit -m "feat(hub-api): pharmacy.search endpoint"
```

---

### Task 5: Hub `pharmacy.sync` (incremental watermark)

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/pharmacy.ts`
- Test: `apps/hub-api/src/__tests__/pharmacy.test.ts`

**Interfaces:**
- Produces: `sync({ since?, limit }) -> { pharmacies: PharmacyDirectoryEntry[]; latestUpdatedAt: string | null }`.

- [ ] **Step 1: Write the failing test** (append)

```ts
describe('pharmacy.sync', () => {
  it('returns rows and the latest watermark', async () => {
    const rows = [
      { id: 'p1', name: 'A', address: null, province: null, district: null, facility_type: 'pharmacy', updated_at: '2026-09-10T01:00:00Z' },
      { id: 'p2', name: 'B', address: null, province: null, district: null, facility_type: 'pharmacy', updated_at: '2026-09-10T02:00:00Z' },
    ]
    const chain = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
    }
    const c = { supabase: { from: vi.fn(() => chain) }, user: { role: 'DOCTOR' } } as never
    const res = await pharmacyRouter.createCaller(c).sync({ limit: 500 })
    expect(res.pharmacies).toHaveLength(2)
    expect(res.latestUpdatedAt).toBe('2026-09-10T02:00:00Z')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F hub-api exec vitest run src/__tests__/pharmacy.test.ts`
Expected: FAIL — `sync` undefined.

- [ ] **Step 3: Add `sync`** to `pharmacyRouter`:

```ts
  sync: protectedProcedure
    .input(z.object({ since: z.string().optional(), limit: z.number().int().min(1).max(1000).default(500) }))
    .query(async ({ ctx, input }): Promise<{ pharmacies: PharmacyDirectoryEntry[]; latestUpdatedAt: string | null }> => {
      let query = ctx.supabase
        .from('pharmacy_facilities')
        .select('id, name, address, province, district, facility_type, updated_at')
        .eq('facility_type', 'pharmacy')
        .eq('is_active', true)
        .order('updated_at', { ascending: true })
        .limit(input.limit)
      if (input.since) query = query.gt('updated_at', input.since)
      const { data, error } = await query
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
      const pharmacies = (data ?? []).map(toDirectoryEntry)
      const latestUpdatedAt = pharmacies.length ? pharmacies[pharmacies.length - 1]!.updatedAt ?? null : null
      return { pharmacies, latestUpdatedAt }
    }),
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -F hub-api exec vitest run src/__tests__/pharmacy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/hub-api/src/trpc/routers/pharmacy.ts apps/hub-api/src/__tests__/pharmacy.test.ts
git commit -m "feat(hub-api): pharmacy.sync incremental watermark"
```

---

### Task 6: Hub `pharmacy` admin CRUD (ADMIN-gated)

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/pharmacy.ts`
- Test: `apps/hub-api/src/__tests__/pharmacy.test.ts`

**Interfaces:**
- Produces: `listForAdmin`, `create`, `update`, `setActive` (all `adminProcedure`). Returns full `PharmacyFacility`.

- [ ] **Step 1: Write the failing tests** (append)

```ts
describe('pharmacy admin CRUD', () => {
  it('rejects non-admin create', async () => {
    const c = { supabase: { from: vi.fn() }, user: { role: 'DOCTOR' } } as never
    await expect(pharmacyRouter.createCaller(c).create({
      name: 'X', latitude: 34.5, longitude: 69.2,
    })).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('inserts a pharmacy for admin', async () => {
    const row = { id: 'p9', name: 'New Pharmacy', latitude: 34.5, longitude: 69.2, facility_type: 'pharmacy', is_active: true }
    const chain = { insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: row, error: null }) }
    const c = { supabase: { from: vi.fn(() => chain) }, user: { role: 'ADMIN' } } as never
    const res = await pharmacyRouter.createCaller(c).create({ name: 'New Pharmacy', latitude: 34.5, longitude: 69.2 })
    expect(res.id).toBe('p9')
    expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({ facility_type: 'pharmacy', is_active: true }))
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F hub-api exec vitest run src/__tests__/pharmacy.test.ts`
Expected: FAIL — `create` undefined / no admin guard.

- [ ] **Step 3: Add `adminProcedure` + CRUD**

At the top of `pharmacy.ts`, add the ADMIN guard (mirroring `admin.ts`):

```ts
const adminProcedure = protectedProcedure.use(async (opts) => {
  if (opts.ctx.user?.role !== 'ADMIN') throw new TRPCError({ code: 'FORBIDDEN' })
  return opts.next()
})

const pharmacyInput = z.object({
  name: z.string().min(1).max(200),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  address: z.string().max(300).optional(),
  province: z.string().max(120).optional(),
  district: z.string().max(120).optional(),
})

function toFacility(row: Record<string, unknown>) {
  return {
    id: row.id as string, name: row.name as string,
    latitude: row.latitude as number, longitude: row.longitude as number,
    address: (row.address as string) ?? undefined, province: (row.province as string) ?? undefined,
    district: (row.district as string) ?? undefined,
    facilityType: (row.facility_type as 'pharmacy' | 'clinic' | 'hospital'),
    isActive: row.is_active as boolean,
  }
}
```

Add to the router:

```ts
  listForAdmin: adminProcedure
    .input(z.object({ cursor: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(100).default(50), q: z.string().max(100).optional() }))
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from('pharmacy_facilities')
        .select('*')
        .eq('facility_type', 'pharmacy')
        .order('name', { ascending: true })
        .range(input.cursor, input.cursor + input.limit - 1)
      if (input.q) query = query.ilike('name', `%${input.q.toLowerCase()}%`)
      const { data, error } = await query
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
      const pharmacies = (data ?? []).map(toFacility)
      const nextCursor = pharmacies.length === input.limit ? input.cursor + input.limit : null
      return { pharmacies, nextCursor }
    }),

  create: adminProcedure
    .input(pharmacyInput)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('pharmacy_facilities')
        .insert({ ...input, facility_type: 'pharmacy', is_active: true })
        .select('*').single()
      if (error || !data) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
      return toFacility(data)
    }),

  update: adminProcedure
    .input(pharmacyInput.extend({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input
      const { data, error } = await ctx.supabase
        .from('pharmacy_facilities').update(fields).eq('id', id).select('*').single()
      if (error || !data) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
      return toFacility(data)
    }),

  setActive: adminProcedure
    .input(z.object({ id: z.string().uuid(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('pharmacy_facilities').update({ is_active: input.isActive }).eq('id', input.id).select('*').single()
      if (error || !data) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
      return toFacility(data)
    }),
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -F hub-api exec vitest run src/__tests__/pharmacy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/hub-api/src/trpc/routers/pharmacy.ts apps/hub-api/src/__tests__/pharmacy.test.ts
git commit -m "feat(hub-api): pharmacy admin CRUD (ADMIN-gated)"
```

---

### Task 7: Admin-portal — Pharmacy management page

**Files:**
- Create: `apps/admin-portal/src/app/[locale]/pharmacies/page.tsx`
- Create: `apps/admin-portal/src/components/pharmacies/PharmacyManager.tsx`
- Modify: admin sidebar nav (add a "Pharmacies" entry next to the labs/locations items — follow the existing nav file), and `messages/*.json` (labels).
- Test: `apps/admin-portal/src/__tests__/pharmacies.test.tsx`

**Interfaces:**
- Consumes: `trpc.pharmacy.listForAdmin`, `trpc.pharmacy.create`, `trpc.pharmacy.setActive`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/admin-portal/src/__tests__/pharmacies.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { PharmacyManager } from '@/components/pharmacies/PharmacyManager'

vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k, useLocale: () => 'en' }))
vi.mock('@/lib/trpc', () => ({
  trpc: {
    pharmacy: {
      listForAdmin: { query: vi.fn().mockResolvedValue({ pharmacies: [
        { id: 'p1', name: 'Kabul City Pharmacy', province: 'Kabul', district: 'D10', address: 'Shahr-e Naw', facilityType: 'pharmacy', isActive: true, latitude: 34.5, longitude: 69.2 },
      ], nextCursor: null }) },
      create: { mutate: vi.fn() }, setActive: { mutate: vi.fn() },
    },
  },
}))

describe('PharmacyManager', () => {
  it('lists pharmacies from the admin endpoint', async () => {
    render(<PharmacyManager />)
    await waitFor(() => expect(screen.getByText('Kabul City Pharmacy')).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F admin-portal exec vitest run src/__tests__/pharmacies.test.tsx`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement the component + page**

`PharmacyManager.tsx` — follow the OPD list-page standard (standalone `<h1>`, one toolbar row with a search input + an "Add pharmacy" button folded into the end, one content box with a table). Load via `trpc.pharmacy.listForAdmin.query({cursor:0,limit:50})` in an effect; render rows (name, province/district, address, active badge) with an "edit"/"toggle active" action; an "Add pharmacy" `Dialog` (from `@ultranos/ui-kit/components/ui/dialog`) with fields name/province/district/address/latitude/longitude that calls `trpc.pharmacy.create.mutate` then refetches. Use semantic tokens; `EmptyState` for the empty list.

`page.tsx`:

```tsx
import { PharmacyManager } from '@/components/pharmacies/PharmacyManager'
export default function PharmaciesPage() {
  return <PharmacyManager />
}
```

Add the sidebar nav item and i18n keys (`pharmacies.title`, `.add`, `.name`, `.province`, `.district`, `.address`, `.latitude`, `.longitude`, `.active`, `.searchPlaceholder`) to each `messages/*.json`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -F admin-portal exec vitest run src/__tests__/pharmacies.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin-portal/src/app/[locale]/pharmacies apps/admin-portal/src/components/pharmacies apps/admin-portal/src/__tests__/pharmacies.test.tsx apps/admin-portal/messages
git commit -m "feat(admin-portal): pharmacy management page"
```

---

## PHASE 2 — Prescription Pharmacy Picker (consumer)

### Task 8: FHIR schema — `dispenseRequest.performer`

**Files:**
- Modify: `packages/shared-types/src/fhir/medication-request.schema.ts`
- Test: `packages/shared-types/src/__tests__/medication-request.schema.test.ts`

**Interfaces:**
- Produces: `DispenseRequestSchema` accepts optional `performer: Reference`.

- [ ] **Step 1: Write the failing test** (append to the existing schema test)

```ts
it('accepts an optional dispenseRequest.performer', () => {
  const base = validMedicationRequest() // existing helper in this file
  const withPerformer = { ...base, dispenseRequest: { ...base.dispenseRequest, performer: { reference: 'Organization/p1', display: 'Kabul City Pharmacy' } } }
  expect(FhirMedicationRequestSchema.safeParse(withPerformer).success).toBe(true)
})
```

(If no `validMedicationRequest` helper exists, build the object inline from an existing passing test in the file.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F @ultranos/shared-types exec vitest run src/__tests__/medication-request.schema.test.ts`
Expected: FAIL — `performer` stripped/invalid.

- [ ] **Step 3: Add the field**

In `DispenseRequestSchema`, add: `performer: ReferenceSchema.optional(),` (import/confirm `ReferenceSchema` is defined in the file; it's already used for `subject`/`requester`).

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -F @ultranos/shared-types exec vitest run src/__tests__/medication-request.schema.test.ts`
Expected: PASS. Then `pnpm -F @ultranos/shared-types build`.

- [ ] **Step 5: Commit**

```bash
git add packages/shared-types/src/fhir/medication-request.schema.ts packages/shared-types/src/__tests__/medication-request.schema.test.ts
git commit -m "feat(shared-types): MedicationRequest dispenseRequest.performer"
```

---

### Task 9: OPD-Lite Dexie — `pharmaciesMirror` table

**Files:**
- Modify: `apps/opd-lite/src/lib/db.ts`
- Modify: `apps/opd-lite/src/lib/phi-cleanup.ts`
- Test: `apps/opd-lite/src/__tests__/pharmacy-mirror-schema.test.ts`

**Interfaces:**
- Produces: `db.pharmaciesMirror: EntityTable<PharmacyDirectoryEntry, 'id'>`; `pharmaciesMirror` in `PRESERVE_TABLES`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/opd-lite/src/__tests__/pharmacy-mirror-schema.test.ts
import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { db } from '@/lib/db'
import { PRESERVE_TABLES } from '@/lib/phi-cleanup'

describe('pharmaciesMirror', () => {
  it('exists and is a preserved (non-PHI) table', async () => {
    await db.open()
    expect(db.tables.map((t) => t.name)).toContain('pharmaciesMirror')
    expect(PRESERVE_TABLES as readonly string[]).toContain('pharmaciesMirror')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F opd-lite exec vitest run src/__tests__/pharmacy-mirror-schema.test.ts`
Expected: FAIL — table/preserve entry missing.

- [ ] **Step 3: Add the table + preserve entry**

In `db.ts`: add the field `pharmaciesMirror!: EntityTable<PharmacyDirectoryEntry, 'id'>` (import `PharmacyDirectoryEntry` from `@ultranos/shared-types`), and a **new `.version(N+1).stores({...})`** block adding `pharmaciesMirror: '&id, name, province'` (keep all existing table definitions in the new version block per Dexie rules). In `phi-cleanup.ts`, add `'pharmaciesMirror'` to `PRESERVE_TABLES` with a comment `// pharmacy directory — non-PHI reference data`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -F opd-lite exec vitest run src/__tests__/pharmacy-mirror-schema.test.ts src/__tests__/phi-cleanup.test.ts src/__tests__/drug-catalog-mirror-schema.test.ts`
Expected: PASS (update the drug-catalog-mirror-schema coverage list if it enumerates all tables).

- [ ] **Step 5: Commit**

```bash
git add apps/opd-lite/src/lib/db.ts apps/opd-lite/src/lib/phi-cleanup.ts apps/opd-lite/src/__tests__/pharmacy-mirror-schema.test.ts
git commit -m "feat(opd-lite): pharmaciesMirror Dexie table"
```

---

### Task 10: OPD-Lite pharmacy sync

**Files:**
- Create: `apps/opd-lite/src/lib/pharmacy-sync.ts`
- Modify: `apps/opd-lite/src/components/providers/SyncProvider.tsx`
- Test: `apps/opd-lite/src/__tests__/pharmacy-sync.test.ts`

**Interfaces:**
- Consumes: `db.pharmaciesMirror`, Hub `pharmacy.sync`.
- Produces: `runPharmacySync(store, client)` (testable core) and `syncPharmacyDirectory()` (wired entry).

- [ ] **Step 1: Write the failing test**

```ts
// apps/opd-lite/src/__tests__/pharmacy-sync.test.ts
import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { db } from '@/lib/db'
import { runPharmacySync } from '@/lib/pharmacy-sync'

describe('runPharmacySync', () => {
  it('upserts pulled pharmacies and advances the watermark', async () => {
    await db.open(); await db.pharmaciesMirror.clear()
    const client = {
      sync: async (_since?: string) => ({
        pharmacies: [{ id: 'p1', name: 'Kabul City Pharmacy', facilityType: 'pharmacy', province: 'Kabul', updatedAt: '2026-09-10T02:00:00Z' }],
        latestUpdatedAt: '2026-09-10T02:00:00Z',
      }),
    }
    const store = {
      getCursor: async () => undefined,
      setCursor: async () => {},
      upsert: async (rows: unknown[]) => { await db.pharmaciesMirror.bulkPut(rows as never[]) },
    }
    const res = await runPharmacySync(store as never, client as never)
    expect(res.synced).toBe(1)
    expect(await db.pharmaciesMirror.get('p1')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F opd-lite exec vitest run src/__tests__/pharmacy-sync.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement** `pharmacy-sync.ts`

Mirror `drug-catalog-sync.ts`: a `PharmacyStore` (getCursor/setCursor/upsert over `db.pharmaciesMirror` + a `syncMeta`-style cursor row) and a `PharmacyClient` (`sync(since?)` → Hub `pharmacy.sync`, built like `createCatalogClient`/`searchDrugCatalog` with the Supabase token). `runPharmacySync(store, client)` reads the cursor, calls `client.sync(cursor)`, `store.upsert(pharmacies)`, advances cursor to `latestUpdatedAt`, returns `{ synced }`. `syncPharmacyDirectory()` is online-gated + single-flight + throttled (own cursor key), same shape as `syncDrugCatalog`. Wire it into `SyncProvider` next to `syncDrugCatalog` (call in `triggerCatalogSyncOnAuth`).

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -F opd-lite exec vitest run src/__tests__/pharmacy-sync.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/opd-lite/src/lib/pharmacy-sync.ts apps/opd-lite/src/components/providers/SyncProvider.tsx apps/opd-lite/src/__tests__/pharmacy-sync.test.ts
git commit -m "feat(opd-lite): pharmacy directory sync"
```

---

### Task 11: OPD-Lite pharmacy search (online + offline)

**Files:**
- Create: `apps/opd-lite/src/lib/pharmacy-search.ts`
- Modify: `apps/opd-lite/src/lib/trpc.ts` (add `searchPharmacies` Hub call)
- Test: `apps/opd-lite/src/__tests__/pharmacy-search.test.ts`

**Interfaces:**
- Produces: `searchPharmacies(query: string, signal?: AbortSignal) -> Promise<PharmacyDirectoryEntry[]>`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/opd-lite/src/__tests__/pharmacy-search.test.ts
import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { searchPharmacies } from '@/lib/pharmacy-search'

beforeEach(async () => {
  await db.open(); await db.pharmaciesMirror.clear()
  vi.stubGlobal('navigator', { onLine: false }) // force offline Fuse path
})

describe('searchPharmacies (offline mirror)', () => {
  it('finds a pharmacy by name from the mirror', async () => {
    await db.pharmaciesMirror.bulkPut([
      { id: 'p1', name: 'Kabul City Pharmacy', province: 'Kabul', facilityType: 'pharmacy' },
      { id: 'p2', name: 'Herat Central Drug Store', province: 'Herat', facilityType: 'pharmacy' },
    ] as never[])
    const res = await searchPharmacies('kabul')
    expect(res[0]!.id).toBe('p1')
  })

  it('returns [] for queries under 2 chars', async () => {
    expect(await searchPharmacies('k')).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F opd-lite exec vitest run src/__tests__/pharmacy-search.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement** mirroring `medication-search.ts`

Add `searchPharmacies` in `trpc.ts` (manual GET to `/pharmacy.search`, same auth-header pattern as `searchDrugCatalog`). In `pharmacy-search.ts`: `<2` chars → `[]`; if `navigator.onLine`, call the Hub `searchPharmacies`; on error/offline, Fuse.js over `db.pharmaciesMirror.toArray()` with keys `['name','address','province','district']`, threshold 0.4, limit 20; return `PharmacyDirectoryEntry[]`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -F opd-lite exec vitest run src/__tests__/pharmacy-search.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/opd-lite/src/lib/pharmacy-search.ts apps/opd-lite/src/lib/trpc.ts apps/opd-lite/src/__tests__/pharmacy-search.test.ts
git commit -m "feat(opd-lite): pharmacy search (online + offline)"
```

---

### Task 12: Prescription form fields + mapper `performer`

**Files:**
- Modify: `apps/opd-lite/src/lib/prescription-config.ts`
- Modify: `apps/opd-lite/src/lib/medication-request-mapper.ts`
- Test: `apps/opd-lite/src/__tests__/medication-request-mapper.test.ts`

**Interfaces:**
- Produces: `PrescriptionFormData` gains `pharmacyId?`, `pharmacyName?`; mapper writes `dispenseRequest.performer`; `readPerformerFromDispenseRequest(rx)` helper.

- [ ] **Step 1: Write the failing tests** (append)

```ts
it('writes dispenseRequest.performer when a pharmacy is chosen', () => {
  const result = mapFormToMedicationRequest({ ...baseForm, pharmacyId: 'ph1', pharmacyName: 'Kabul City Pharmacy' }, context)
  expect(result.dispenseRequest?.performer).toEqual({ reference: 'Organization/ph1', display: 'Kabul City Pharmacy' })
})
it('omits performer when no pharmacy is chosen', () => {
  const result = mapFormToMedicationRequest(baseForm, context)
  expect(result.dispenseRequest?.performer).toBeUndefined()
})
it('readPerformerFromDispenseRequest returns the pharmacy id and name', () => {
  const result = mapFormToMedicationRequest({ ...baseForm, pharmacyId: 'ph1', pharmacyName: 'Kabul City Pharmacy' }, context)
  expect(readPerformerFromDispenseRequest(result)).toEqual({ pharmacyId: 'ph1', pharmacyName: 'Kabul City Pharmacy' })
})
```

Add `readPerformerFromDispenseRequest` to the import line.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F opd-lite exec vitest run src/__tests__/medication-request-mapper.test.ts`
Expected: FAIL — field/helper missing.

- [ ] **Step 3: Implement**

In `prescription-config.ts`: add `pharmacyId?: string` and `pharmacyName?: string` to `PrescriptionFormData`. In `medication-request-mapper.ts`: in the `dispenseRequest` object add `performer: form.pharmacyId ? { reference: 'Organization/' + form.pharmacyId, display: form.pharmacyName } : undefined,` and export:

```ts
export function readPerformerFromDispenseRequest(
  rx: { dispenseRequest?: { performer?: { reference?: string; display?: string } } },
): { pharmacyId?: string; pharmacyName?: string } {
  const ref = rx.dispenseRequest?.performer?.reference
  return { pharmacyId: ref?.startsWith('Organization/') ? ref.slice('Organization/'.length) : undefined, pharmacyName: rx.dispenseRequest?.performer?.display }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -F opd-lite exec vitest run src/__tests__/medication-request-mapper.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/opd-lite/src/lib/prescription-config.ts apps/opd-lite/src/lib/medication-request-mapper.ts apps/opd-lite/src/__tests__/medication-request-mapper.test.ts
git commit -m "feat(opd-lite): prescription performer (preferred pharmacy)"
```

---

### Task 13: PrescriptionEntry — pharmacy picker section

**Files:**
- Modify: `apps/opd-lite/src/components/clinical/PrescriptionEntry.tsx`
- Create: `apps/opd-lite/src/components/clinical/PharmacyPicker.tsx`
- Modify: `apps/opd-lite/messages/*.json`
- Test: `apps/opd-lite/src/__tests__/pharmacy-picker.test.tsx`

**Interfaces:**
- Consumes: `searchPharmacies`, `PrescriptionFormData.pharmacyId/pharmacyName`.
- Produces: `PharmacyPicker({ value, name, onSelect, onClear })`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/opd-lite/src/__tests__/pharmacy-picker.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PharmacyPicker } from '@/components/clinical/PharmacyPicker'

vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k, useLocale: () => 'en' }))
const searchMock = vi.fn()
vi.mock('@/lib/pharmacy-search', () => ({ searchPharmacies: (...a: unknown[]) => searchMock(...a) }))

describe('PharmacyPicker', () => {
  it('selecting a result calls onSelect with id and name', async () => {
    searchMock.mockResolvedValue([{ id: 'p1', name: 'Kabul City Pharmacy', province: 'Kabul', district: 'D10', address: 'Shahr-e Naw', facilityType: 'pharmacy' }])
    const onSelect = vi.fn()
    render(<PharmacyPicker value={undefined} name={undefined} onSelect={onSelect} onClear={vi.fn()} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'kab' } })
    await waitFor(() => screen.getByText('Kabul City Pharmacy'))
    fireEvent.mouseDown(screen.getByText('Kabul City Pharmacy'))
    expect(onSelect).toHaveBeenCalledWith('p1', 'Kabul City Pharmacy')
  })

  it('shows the chosen pharmacy as a clearable chip', () => {
    const onClear = vi.fn()
    render(<PharmacyPicker value="p1" name="Kabul City Pharmacy" onSelect={vi.fn()} onClear={onClear} />)
    fireEvent.click(screen.getByRole('button', { name: /clear/i }))
    expect(onClear).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F opd-lite exec vitest run src/__tests__/pharmacy-picker.test.tsx`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement `PharmacyPicker`** and wire into `PrescriptionEntry`

Build `PharmacyPicker` reusing the medication autocomplete pattern (debounced query via `searchPharmacies`, `role="combobox"` input, `role="listbox"`/`role="option"` rows showing `name` + `address · province/district · facilityType`, blur-close, keyboard nav). When `value` is set, render a chip `name` with a clear button (`aria-label` = `t('clearPharmacy')`) instead of the input. Props: `{ value?: string; name?: string; onSelect: (id: string, name: string) => void; onClear: () => void }`.

In `PrescriptionEntry.tsx`, render a new **"Pharmacy (optional)"** section (label `t('pharmacyOptional')`) **immediately above the "Add Prescription" submit button**, inside the dosage `<form>`:

```tsx
<div>
  <label className="mb-1 block text-sm font-semibold text-foreground">{t('pharmacyOptional')}</label>
  <PharmacyPicker
    value={form.pharmacyId}
    name={form.pharmacyName}
    onSelect={(id, name) => setForm((prev) => ({ ...prev, pharmacyId: id, pharmacyName: name }))}
    onClear={() => setForm((prev) => ({ ...prev, pharmacyId: undefined, pharmacyName: undefined }))}
  />
</div>
```

Add i18n keys `pharmacyOptional`, `pharmacySearchPlaceholder`, `clearPharmacy`, `pharmacyAria` to each `messages/*.json`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -F opd-lite exec vitest run src/__tests__/pharmacy-picker.test.tsx src/__tests__/prescription-entry.test.tsx src/__tests__/prescription-entry-presentation.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/opd-lite/src/components/clinical/PharmacyPicker.tsx apps/opd-lite/src/components/clinical/PrescriptionEntry.tsx apps/opd-lite/messages apps/opd-lite/src/__tests__/pharmacy-picker.test.tsx
git commit -m "feat(opd-lite): optional pharmacy picker in prescription entry"
```

---

### Task 14: Pending list — show chosen pharmacy

**Files:**
- Modify: `apps/opd-lite/src/components/encounter-dashboard.tsx`
- Test: covered via `readPerformerFromDispenseRequest` (Task 12); this task is display-only.

- [ ] **Step 1: Render the pharmacy in the pending row**

In the pending-prescription row (where the brand chip already renders), add — using `readPerformerFromDispenseRequest(rx)` (import from `@/lib/medication-request-mapper`):

```tsx
{(() => {
  const { pharmacyName } = readPerformerFromDispenseRequest(rx)
  return pharmacyName ? (
    <span className="ms-2 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {tPrescription('sendTo', { pharmacy: pharmacyName })}
    </span>
  ) : null
})()}
```

Add i18n key `sendTo` (`"→ {pharmacy}"`) to each `messages/*.json`.

- [ ] **Step 2: Run the dashboard suite**

Run: `pnpm -F opd-lite exec vitest run src/__tests__/encounter-dashboard.test.tsx`
Expected: PASS (no regressions).

- [ ] **Step 3: Commit**

```bash
git add apps/opd-lite/src/components/encounter-dashboard.tsx apps/opd-lite/messages
git commit -m "feat(opd-lite): show preferred pharmacy on pending prescriptions"
```

---

### Task 15: Full verification

- [ ] **Step 1: Typecheck changed packages**

Run: `pnpm -F @ultranos/shared-types build && pnpm -F hub-api exec tsc --noEmit && pnpm -F opd-lite exec tsc --noEmit && pnpm -F admin-portal exec tsc --noEmit`
Expected: no new errors in the files this plan touched (pre-existing unrelated errors may remain — confirm none are in pharmacy/prescription files).

- [ ] **Step 2: Run the affected suites**

Run: `pnpm -F hub-api exec vitest run src/__tests__/pharmacy.test.ts` and `pnpm -F opd-lite test` and `pnpm -F admin-portal exec vitest run src/__tests__/pharmacies.test.tsx`
Expected: all green.

- [ ] **Step 3: Live smoke (optional, if a running stack is available)**

Admin-portal: create a pharmacy → appears in the list. OPD-Lite: on the encounter page, type in the Pharmacy box → results appear; pick one → shows as a chip; add the prescription → pending row shows "→ <pharmacy>".

---

## Self-Review Notes

- **Spec coverage:** §5.1 (T1), §10 index/seed (T2/T3), §5.3 search/sync/CRUD (T4/T5/T6), §5.4 admin page (T7), §5.2 performer (T8), §5.5 mirror (T9), §5.5 sync (T10), §5.6 search (T11), §5.8 mapper + form fields (T12), §5.7 UI (T13), pending-row display (T14). All spec sections map to a task.
- **Assumptions carried from spec §4:** global directory, ADMIN role, pharmacies-only, manual lat/long, `Organization/<id>` ref.
- **Type consistency:** `PharmacyDirectoryEntry` (T1) is the single row type used by search (T4/T11), sync (T5/T10), and mirror (T9). Admin CRUD returns full `PharmacyFacility` (T6/T7). `readPerformerFromDispenseRequest` name consistent T12/T14.
