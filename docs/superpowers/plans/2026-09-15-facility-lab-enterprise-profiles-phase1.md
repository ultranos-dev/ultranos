# Enterprise Facility Profiles — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Admin Portal three parallel, org-scoped enterprise facility sections — Clinics & Hospitals (new), Pharmacies, and Labs — each with rich profile fields, full CRUD, a click-a-row profile modal, and soft-delete/archive.

**Architecture:** A new org-scoped `clinical_facilities` table plus enterprise-field enrichment of `pharmacy_facilities` (+ new `org_id`) and `labs`. A shared `makeFacilityCrud` hub-api factory backs three tRPC routers. The admin-portal shares React profile primitives and a config-driven `FacilityManager`/`FacilityFormModal`/`FacilityProfileModal` across clinics and pharmacies, with lab-specific modals. Google columns are added but unpopulated (UI degrades gracefully; live sync is Phase 4).

**Tech Stack:** PostgreSQL 16 (Supabase MCP migrations), Node.js + tRPC + Zod (hub-api), Next.js 15 + TypeScript + Tailwind + ShadCN/ui-kit (admin-portal), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-15-facility-lab-enterprise-profiles-design.md`

## Global Constraints

- **Git:** Per `CLAUDE.md`, **never `git add`/`git commit` without the user's explicit go-ahead.** Commit steps below are checkpoints — pause and ask before running them.
- **Database:** All schema/data changes via **Supabase MCP** (`apply_migration` for DDL, `execute_sql` for verification). Project id `hqgxvrjccmfjzkhotyib`. Never run raw `psql`/manual SQL files.
- **Org-scoping:** Every admin list/get/mutation filters/sets `org_id = ctx.user.orgId`. Cross-org `get`/`update`/`archive` must return `NOT_FOUND`.
- **PHI/logging:** Facilities are non-PHI, but never log row contents; audit via `@ultranos/audit-logger` with opaque ids only.
- **UI:** Semantic oklch tokens only (no hex/inline style); logical CSS props (RTL); `EmptyState` for empty/loading; box idiom `rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50`; import UI from `@/components/ui/*` (admin re-exports) and icons from `@ultranos/ui-kit/icons`; list pages follow the OPD-Lite list-page standard (full-width `<h1>`, one toolbar row ending in the primary action, one content box).
- **Soft-delete = archive.** No hard `DELETE`. Clinics/pharmacies set `archived_at`; labs set `status='ARCHIVED'`.
- **Backfill target org:** "Default Organization" `61dae3ca-dafc-4e2a-a333-0308f0e93974`.
- **Phase 1 excludes:** staff assignment (P2), approval/status workflow (P3), live Google Places (P4).

## Shared Enterprise Field Set (authoritative — reused by every task)

**DB columns (snake_case), all nullable unless a default is shown:**

`logo_url text`, `description text`, `license_ref text`, `registration_authority text`, `established_year int`, `phone text`, `alt_phone text`, `email text`, `website text`, `whatsapp text`, `address text`, `province text`, `district text`, `city text`, `postal_code text`, `country text`, `contact_person_name text`, `contact_person_role text`, `contact_person_phone text`, `opening_hours jsonb`, `timezone text`, `is_24_7 boolean not null default false`, `google_place_id text`, `google_maps_url text`, `google_rating numeric(2,1)`, `google_review_count int`, `google_hours jsonb`, `google_last_synced_at timestamptz`, `archived_at timestamptz`.

**Type-specific additions:**
- clinical: `bed_count int`, `departments text[]`, `specialties text[]`, `emergency_services boolean not null default false`
- pharmacy: `has_delivery boolean not null default false`, `accepts_insurance boolean not null default false`
- lab: `specialties text[]`, `turnaround_time_hours int`, `home_collection boolean not null default false`, `sample_collection boolean not null default false`, `cap_accredited boolean not null default false`

**TS profile shape (camelCase), authoritative for shared-types (Task 4):**
```typescript
export interface FacilityProfileBase {
  id: string
  orgId: string | null
  name: string
  isActive: boolean
  archivedAt: string | null
  createdAt: string
  updatedAt: string
  logoUrl: string | null
  description: string | null
  licenseRef: string | null
  registrationAuthority: string | null
  establishedYear: number | null
  phone: string | null
  altPhone: string | null
  email: string | null
  website: string | null
  whatsapp: string | null
  address: string | null
  province: string | null
  district: string | null
  city: string | null
  postalCode: string | null
  country: string | null
  contactPersonName: string | null
  contactPersonRole: string | null
  contactPersonPhone: string | null
  openingHours: unknown | null
  timezone: string | null
  is247: boolean
  googlePlaceId: string | null
  googleMapsUrl: string | null
  googleRating: number | null
  googleReviewCount: number | null
  googleHours: unknown | null
  googleLastSyncedAt: string | null
  latitude: number | null
  longitude: number | null
}
export type ClinicalFacilityType = 'clinic' | 'hospital' | 'opd'
export interface ClinicalFacilityProfile extends FacilityProfileBase {
  facilityType: ClinicalFacilityType
  bedCount: number | null
  departments: string[] | null
  specialties: string[] | null
  emergencyServices: boolean
}
export interface PharmacyProfile extends FacilityProfileBase {
  facilityType: 'pharmacy'
  hasDelivery: boolean
  acceptsInsurance: boolean
}
export interface LabProfile extends FacilityProfileBase {
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED' | 'ARCHIVED'
  accreditationRef: string | null
  capAccredited: boolean
  specialties: string[] | null
  turnaroundTimeHours: number | null
  homeCollection: boolean
  sampleCollection: boolean
}
```

---

# PART A — Data & Backend (hub-api)

### Task 1: Migration — create `clinical_facilities` table

**Files:**
- Migration (via MCP `apply_migration`, name `create_clinical_facilities`)

**Interfaces:**
- Produces: table `clinical_facilities` with columns per spec §4.1 + shared field set; org-scoped RLS; used by Task 6.

- [ ] **Step 1: Apply the migration**

Call `apply_migration` (project `hqgxvrjccmfjzkhotyib`, name `create_clinical_facilities`) with:
```sql
create table public.clinical_facilities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  name text not null,
  facility_type text not null check (facility_type in ('clinic','hospital','opd')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- shared enterprise fields
  logo_url text, description text, license_ref text, registration_authority text,
  established_year int, phone text, alt_phone text, email text, website text, whatsapp text,
  address text, province text, district text, city text, postal_code text, country text,
  latitude double precision, longitude double precision,
  contact_person_name text, contact_person_role text, contact_person_phone text,
  opening_hours jsonb, timezone text, is_24_7 boolean not null default false,
  google_place_id text, google_maps_url text, google_rating numeric(2,1),
  google_review_count int, google_hours jsonb, google_last_synced_at timestamptz,
  archived_at timestamptz,
  -- clinical-specific
  bed_count int, departments text[], specialties text[],
  emergency_services boolean not null default false
);
create index clinical_facilities_org_type_idx on public.clinical_facilities (org_id, facility_type);
create index clinical_facilities_org_active_idx on public.clinical_facilities (org_id) where archived_at is null;
alter table public.clinical_facilities enable row level security;
create policy clinical_facilities_org_isolation on public.clinical_facilities
  using (org_id = (auth.jwt() -> 'app_metadata' ->> 'org_id')::uuid);
```
> If `labs`' RLS uses a different org-claim path, copy that exact `using` expression instead — verify by reading `labs` policies first (`select pg_get_expr(polqual, polrelid) from pg_policy join pg_class on pg_class.oid=polrelid where relname='labs';`). Match labs; do not invent a new claim path.

- [ ] **Step 2: Verify the table exists with expected columns**

Run `execute_sql`:
```sql
select column_name from information_schema.columns
where table_schema='public' and table_name='clinical_facilities' order by ordinal_position;
```
Expected: all columns above present.

- [ ] **Step 3: Verify RLS matches labs**

Run `execute_sql` comparing `clinical_facilities` and `labs` policy `using` expressions; they must reference the same org-claim path. Fix the policy if not.

---

### Task 2: Migration — enrich `pharmacy_facilities` (+ `org_id`, backfill, relax coords)

**Files:**
- Migration (MCP `apply_migration`, name `enrich_pharmacy_facilities`)

**Interfaces:**
- Produces: `org_id` + shared/pharmacy fields on `pharmacy_facilities`; existing 8 rows backfilled; used by Task 7.

- [ ] **Step 1: Apply the migration**

`apply_migration` name `enrich_pharmacy_facilities`:
```sql
alter table public.pharmacy_facilities
  add column if not exists org_id uuid references public.organizations(id),
  add column if not exists logo_url text,
  add column if not exists description text,
  add column if not exists license_ref text,
  add column if not exists registration_authority text,
  add column if not exists established_year int,
  add column if not exists phone text,
  add column if not exists alt_phone text,
  add column if not exists email text,
  add column if not exists website text,
  add column if not exists whatsapp text,
  add column if not exists city text,
  add column if not exists postal_code text,
  add column if not exists country text,
  add column if not exists contact_person_name text,
  add column if not exists contact_person_role text,
  add column if not exists contact_person_phone text,
  add column if not exists opening_hours jsonb,
  add column if not exists timezone text,
  add column if not exists is_24_7 boolean not null default false,
  add column if not exists google_place_id text,
  add column if not exists google_maps_url text,
  add column if not exists google_rating numeric(2,1),
  add column if not exists google_review_count int,
  add column if not exists google_hours jsonb,
  add column if not exists google_last_synced_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists has_delivery boolean not null default false,
  add column if not exists accepts_insurance boolean not null default false;

update public.pharmacy_facilities
  set org_id = '61dae3ca-dafc-4e2a-a333-0308f0e93974'
  where org_id is null;

alter table public.pharmacy_facilities alter column latitude drop not null;
alter table public.pharmacy_facilities alter column longitude drop not null;
create index if not exists pharmacy_facilities_org_active_idx
  on public.pharmacy_facilities (org_id) where archived_at is null;
```

- [ ] **Step 2: Verify columns + backfill**

`execute_sql`:
```sql
select count(*) filter (where org_id is null) as null_org,
       count(*) filter (where org_id = '61dae3ca-dafc-4e2a-a333-0308f0e93974') as default_org
from public.pharmacy_facilities;
```
Expected: `null_org = 0`, `default_org = 8`.

---

### Task 3: Migration — enrich `labs` + add `ARCHIVED` status

**Files:**
- Migration (MCP `apply_migration`, name `enrich_labs`)

**Interfaces:**
- Produces: shared/lab fields + `ARCHIVED` status on `labs`; used by Task 8.

- [ ] **Step 1: Apply the migration**

`apply_migration` name `enrich_labs`:
```sql
alter table public.labs
  add column if not exists logo_url text,
  add column if not exists description text,
  add column if not exists registration_authority text,
  add column if not exists established_year int,
  add column if not exists phone text,
  add column if not exists alt_phone text,
  add column if not exists email text,
  add column if not exists website text,
  add column if not exists whatsapp text,
  add column if not exists address text,
  add column if not exists province text,
  add column if not exists district text,
  add column if not exists city text,
  add column if not exists postal_code text,
  add column if not exists country text,
  add column if not exists contact_person_name text,
  add column if not exists contact_person_role text,
  add column if not exists contact_person_phone text,
  add column if not exists opening_hours jsonb,
  add column if not exists timezone text,
  add column if not exists is_24_7 boolean not null default false,
  add column if not exists google_place_id text,
  add column if not exists google_maps_url text,
  add column if not exists google_rating numeric(2,1),
  add column if not exists google_review_count int,
  add column if not exists google_hours jsonb,
  add column if not exists google_last_synced_at timestamptz,
  add column if not exists specialties text[],
  add column if not exists turnaround_time_hours int,
  add column if not exists home_collection boolean not null default false,
  add column if not exists sample_collection boolean not null default false,
  add column if not exists cap_accredited boolean not null default false;

alter table public.labs drop constraint labs_status_check;
alter table public.labs add constraint labs_status_check
  check (status in ('PENDING','ACTIVE','SUSPENDED','REVOKED','ARCHIVED'));
```
> `labs` uses `status` for lifecycle (no `archived_at`; archive = `status='ARCHIVED'`).

- [ ] **Step 2: Verify constraint + columns**

`execute_sql`:
```sql
select pg_get_constraintdef(oid) from pg_constraint where conname='labs_status_check';
```
Expected: includes `'ARCHIVED'`.

---

### Task 4: Regenerate types + add shared-types interfaces

**Files:**
- Create: `packages/shared-types/src/facility.ts`
- Modify: `packages/shared-types/src/index.ts` (add `export * from './facility.js'`)

**Interfaces:**
- Produces: `FacilityProfileBase`, `ClinicalFacilityType`, `ClinicalFacilityProfile`, `PharmacyProfile`, `LabProfile` (exact shapes in "Shared Enterprise Field Set" above). Consumed by Tasks 6–8 and all frontend tasks.

- [ ] **Step 1: Regenerate Supabase types (sanity only)**

Call `generate_typescript_types` (project `hqgxvrjccmfjzkhotyib`); skim to confirm the new columns appear. (Informational — hand-written types below are authoritative.)

- [ ] **Step 2: Create `packages/shared-types/src/facility.ts`**

Paste the entire TS block from "Shared Enterprise Field Set" (the `FacilityProfileBase` … `LabProfile` interfaces + `ClinicalFacilityType`).

- [ ] **Step 3: Export from the package index**

Add to `packages/shared-types/src/index.ts`:
```typescript
export * from './facility.js'
```
(Match the existing extension convention in that file — if other exports omit `.js`, omit it here too.)

- [ ] **Step 4: Build the package**

Run: `pnpm --filter @ultranos/shared-types build`
Expected: builds with no type errors.

- [ ] **Step 5: Commit** (checkpoint — ask first)

```bash
git add packages/shared-types/src/facility.ts packages/shared-types/src/index.ts
git commit -m "feat(shared-types): enterprise facility profile interfaces"
```

---

### Task 5: `makeFacilityCrud` factory + row→profile mappers

**Files:**
- Create: `apps/hub-api/src/trpc/routers/_facility-crud.ts`
- Test: `apps/hub-api/src/__tests__/facility-crud.test.ts`

**Interfaces:**
- Consumes: Supabase client from `ctx`, `ctx.user.orgId`.
- Produces:
  - `mapFacilityRow(row): FacilityProfileBase` (+ passthrough of type-specific snake_case→camelCase).
  - `buildFacilityCrud({ table, typeColumn, typeValues, resourceType, extraColumns })` returning `{ list, getDetail, create, update, archive, restore }` — **plain async functions** taking `(ctx, input)`, org-scoped, used to compose routers. `archive` sets `archived_at=now()`; `restore` sets `archived_at=null`.

- [ ] **Step 1: Write the failing test**

`apps/hub-api/src/__tests__/facility-crud.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { buildFacilityCrud, mapFacilityRow } from '@/trpc/routers/_facility-crud'

const crud = buildFacilityCrud({
  table: 'clinical_facilities', typeColumn: 'facility_type',
  typeValues: ['clinic','hospital','opd'], resourceType: 'CLINICAL_FACILITY',
  extraColumns: ['bed_count','departments','specialties','emergency_services'],
})

function ctx(chain: Record<string, unknown>, role = 'ADMIN', orgId = 'org-1') {
  return { supabase: { from: vi.fn(() => chain) }, user: { role, orgId, sub: 'u1', sessionId: 's1' } } as never
}

describe('mapFacilityRow', () => {
  it('maps snake_case to camelCase', () => {
    const p = mapFacilityRow({ id: 'c1', org_id: 'org-1', name: 'Shifa', is_active: true, archived_at: null, google_rating: 4.6, is_24_7: false, created_at: 'T', updated_at: 'T' })
    expect(p).toMatchObject({ id: 'c1', orgId: 'org-1', name: 'Shifa', isActive: true, googleRating: 4.6, is247: false })
  })
})

describe('buildFacilityCrud.list', () => {
  it('org-scopes and excludes archived by default', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(), range: vi.fn().mockResolvedValue({ data: [], error: null }),
    }
    const c = ctx(chain)
    await crud.list(c, { facilityTypes: ['clinic'], cursor: 0, limit: 50 })
    expect(chain.eq).toHaveBeenCalledWith('org_id', 'org-1')
    expect(chain.is).toHaveBeenCalledWith('archived_at', null)
  })
})

describe('buildFacilityCrud.create', () => {
  it('sets org_id from ctx and inserts type', async () => {
    const row = { id: 'c9', org_id: 'org-1', name: 'New', facility_type: 'clinic', is_active: true, archived_at: null, created_at: 'T', updated_at: 'T', is_24_7: false }
    const chain = { insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: row, error: null }) }
    const c = ctx(chain)
    const res = await crud.create(c, { facilityType: 'clinic', name: 'New' })
    expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({ org_id: 'org-1', facility_type: 'clinic', name: 'New' }))
    expect(res.id).toBe('c9')
  })
})

describe('buildFacilityCrud.getDetail', () => {
  it('returns NOT_FOUND for a row in another org', async () => {
    const chain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }
    const c = ctx(chain)
    await expect(crud.getDetail(c, { id: 'x' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(chain.eq).toHaveBeenCalledWith('org_id', 'org-1')
  })
})
```

- [ ] **Step 2: Run it — expect failure**

Run: `pnpm --filter hub-api test facility-crud`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `_facility-crud.ts`**

```typescript
import { TRPCError } from '@trpc/server'
import { AuditLogger } from '@ultranos/audit-logger'
import type { FacilityProfileBase } from '@ultranos/shared-types'

type Ctx = { supabase: any; user: { role: string; orgId: string | null; sub: string; sessionId?: string } }

const CAMEL: Record<string, string> = {
  org_id: 'orgId', is_active: 'isActive', archived_at: 'archivedAt', created_at: 'createdAt',
  updated_at: 'updatedAt', logo_url: 'logoUrl', license_ref: 'licenseRef',
  registration_authority: 'registrationAuthority', established_year: 'establishedYear',
  alt_phone: 'altPhone', postal_code: 'postalCode', contact_person_name: 'contactPersonName',
  contact_person_role: 'contactPersonRole', contact_person_phone: 'contactPersonPhone',
  opening_hours: 'openingHours', is_24_7: 'is247', google_place_id: 'googlePlaceId',
  google_maps_url: 'googleMapsUrl', google_rating: 'googleRating',
  google_review_count: 'googleReviewCount', google_hours: 'googleHours',
  google_last_synced_at: 'googleLastSyncedAt', facility_type: 'facilityType',
  bed_count: 'bedCount', emergency_services: 'emergencyServices', has_delivery: 'hasDelivery',
  accepts_insurance: 'acceptsInsurance', turnaround_time_hours: 'turnaroundTimeHours',
  home_collection: 'homeCollection', sample_collection: 'sampleCollection',
  cap_accredited: 'capAccredited', accreditation_ref: 'accreditationRef',
}
export function mapFacilityRow(row: Record<string, unknown>): FacilityProfileBase & Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) out[CAMEL[k] ?? k] = v
  return out as FacilityProfileBase & Record<string, unknown>
}
function snake(camel: string): string {
  return camel.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase()).replace('is_247', 'is_24_7')
}

export function buildFacilityCrud(opts: {
  table: string; typeColumn: string; typeValues: string[]; resourceType: string; extraColumns: string[]
}) {
  const { table, typeColumn, typeValues, resourceType } = opts
  async function audit(ctx: Ctx, action: string, resourceId: string) {
    try {
      await new AuditLogger(ctx.supabase, ctx.user.orgId ?? undefined).emit({
        action, resourceType, resourceId, actorId: ctx.user.sub, actorRole: ctx.user.role,
        outcome: 'SUCCESS', sessionId: ctx.user.sessionId, metadata: { endpoint: `${table}.${action}` },
      })
    } catch { console.warn('[AUDIT_FAILURE]', { action, resourceType }) }
  }
  function toColumns(input: Record<string, unknown>): Record<string, unknown> {
    const cols: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(input)) {
      if (k === 'id' || k === 'facilityType') continue
      if (v !== undefined) cols[snake(k)] = v
    }
    return cols
  }
  return {
    async list(ctx: Ctx, input: { facilityTypes?: string[]; cursor: number; limit: number; q?: string; includeArchived?: boolean }) {
      let query = ctx.supabase.from(table).select('*')
        .eq('org_id', ctx.user.orgId)
        .in(typeColumn, input.facilityTypes?.length ? input.facilityTypes : typeValues)
        .order('name', { ascending: true })
        .range(input.cursor, input.cursor + input.limit - 1)
      if (!input.includeArchived) query = query.is('archived_at', null)
      if (input.q) {
        const safe = input.q.replace(/[,()"]/g, ' ').trim()
        if (safe) query = query.ilike('name', `%${safe}%`)
      }
      const { data, error } = await query
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
      const facilities = (data ?? []).map(mapFacilityRow)
      return { facilities, nextCursor: facilities.length === input.limit ? input.cursor + input.limit : null }
    },
    async getDetail(ctx: Ctx, input: { id: string }) {
      const { data, error } = await ctx.supabase.from(table).select('*')
        .eq('id', input.id).eq('org_id', ctx.user.orgId).maybeSingle()
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
      if (!data) throw new TRPCError({ code: 'NOT_FOUND' })
      return mapFacilityRow(data)
    },
    async create(ctx: Ctx, input: Record<string, unknown> & { facilityType?: string; name: string }) {
      const insert = { ...toColumns(input), org_id: ctx.user.orgId, is_active: true }
      if (opts.typeColumn && input.facilityType) insert[typeColumn] = input.facilityType
      const { data, error } = await ctx.supabase.from(table).insert(insert).select('*').single()
      if (error || !data) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
      await audit(ctx, 'CREATE', data.id)
      return mapFacilityRow(data)
    },
    async update(ctx: Ctx, input: Record<string, unknown> & { id: string }) {
      const { data, error } = await ctx.supabase.from(table)
        .update(toColumns(input)).eq('id', input.id).eq('org_id', ctx.user.orgId).select('*').maybeSingle()
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
      if (!data) throw new TRPCError({ code: 'NOT_FOUND' })
      await audit(ctx, 'UPDATE', data.id)
      return mapFacilityRow(data)
    },
    async archive(ctx: Ctx, input: { id: string }) {
      const { data, error } = await ctx.supabase.from(table)
        .update({ archived_at: new Date().toISOString() }).eq('id', input.id).eq('org_id', ctx.user.orgId).select('id').maybeSingle()
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
      if (!data) throw new TRPCError({ code: 'NOT_FOUND' })
      await audit(ctx, 'ARCHIVE', data.id)
      return { id: data.id }
    },
    async restore(ctx: Ctx, input: { id: string }) {
      const { data, error } = await ctx.supabase.from(table)
        .update({ archived_at: null }).eq('id', input.id).eq('org_id', ctx.user.orgId).select('id').maybeSingle()
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
      if (!data) throw new TRPCError({ code: 'NOT_FOUND' })
      await audit(ctx, 'RESTORE', data.id)
      return { id: data.id }
    },
  }
}
```
> `new Date().toISOString()` is fine in runtime code (the Date restriction applies only to Workflow scripts).

- [ ] **Step 4: Run tests — expect pass**

Run: `pnpm --filter hub-api test facility-crud`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit** (checkpoint — ask first)

```bash
git add apps/hub-api/src/trpc/routers/_facility-crud.ts apps/hub-api/src/__tests__/facility-crud.test.ts
git commit -m "feat(hub-api): org-scoped facility CRUD factory"
```

---

### Task 6: `clinicalFacilityRouter` + register in root

**Files:**
- Create: `apps/hub-api/src/trpc/routers/clinical-facility.ts`
- Modify: `apps/hub-api/src/trpc/routers/_app.ts` (import + register as `clinicalFacility`)
- Test: `apps/hub-api/src/__tests__/clinical-facility.test.ts`

**Interfaces:**
- Consumes: `buildFacilityCrud` (Task 5), `adminProcedure` pattern.
- Produces: tRPC procedures `clinicalFacility.{listForAdmin,getDetail,create,update,archive,restore,setActive}`. Consumed by frontend Task 13.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { clinicalFacilityRouter } from '@/trpc/routers/clinical-facility'

function ctx(chain: any, role = 'ADMIN', orgId = 'org-1') {
  return { supabase: { from: vi.fn(() => chain) }, user: { role, orgId, sub: 'u1', sessionId: 's1' } } as never
}

describe('clinicalFacility.create', () => {
  it('rejects non-admin', async () => {
    await expect(clinicalFacilityRouter.createCaller(ctx({}, 'DOCTOR')).create({ facilityType: 'clinic', name: 'X' }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
  it('inserts a clinic scoped to the org', async () => {
    const row = { id: 'c9', org_id: 'org-1', name: 'Shifa', facility_type: 'clinic', is_active: true, archived_at: null, created_at: 'T', updated_at: 'T', is_24_7: false }
    const chain = { insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: row, error: null }) }
    const res = await clinicalFacilityRouter.createCaller(ctx(chain)).create({ facilityType: 'clinic', name: 'Shifa' })
    expect(res.facilityType).toBe('clinic')
    expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({ org_id: 'org-1', facility_type: 'clinic' }))
  })
})
```

- [ ] **Step 2: Run — expect fail** — `pnpm --filter hub-api test clinical-facility` → FAIL (module not found).

- [ ] **Step 3: Implement the router**

```typescript
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '../init'
import { buildFacilityCrud } from './_facility-crud'

const adminProcedure = protectedProcedure.use(async (opts) => {
  if (opts.ctx.user.role !== 'ADMIN') throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' })
  return opts.next(opts)
})

const crud = buildFacilityCrud({
  table: 'clinical_facilities', typeColumn: 'facility_type',
  typeValues: ['clinic', 'hospital', 'opd'], resourceType: 'CLINICAL_FACILITY',
  extraColumns: ['bed_count', 'departments', 'specialties', 'emergency_services'],
})

const profileFields = {
  name: z.string().min(1).max(200),
  logoUrl: z.string().max(500).optional(), description: z.string().max(2000).optional(),
  licenseRef: z.string().max(100).optional(), registrationAuthority: z.string().max(200).optional(),
  establishedYear: z.number().int().min(1800).max(2100).optional(),
  phone: z.string().max(40).optional(), altPhone: z.string().max(40).optional(),
  email: z.string().max(200).optional(), website: z.string().max(300).optional(), whatsapp: z.string().max(40).optional(),
  address: z.string().max(300).optional(), province: z.string().max(120).optional(), district: z.string().max(120).optional(),
  city: z.string().max(120).optional(), postalCode: z.string().max(40).optional(), country: z.string().max(120).optional(),
  latitude: z.number().min(-90).max(90).optional(), longitude: z.number().min(-180).max(180).optional(),
  contactPersonName: z.string().max(200).optional(), contactPersonRole: z.string().max(120).optional(), contactPersonPhone: z.string().max(40).optional(),
  openingHours: z.any().optional(), timezone: z.string().max(60).optional(), is247: z.boolean().optional(),
  bedCount: z.number().int().min(0).optional(), departments: z.array(z.string().max(120)).optional(),
  specialties: z.array(z.string().max(120)).optional(), emergencyServices: z.boolean().optional(),
}
const facilityType = z.enum(['clinic', 'hospital', 'opd'])

export const clinicalFacilityRouter = createTRPCRouter({
  listForAdmin: adminProcedure
    .input(z.object({ facilityTypes: z.array(facilityType).optional(), cursor: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(100).default(50), q: z.string().max(100).optional(), includeArchived: z.boolean().optional() }))
    .query(({ ctx, input }) => crud.list(ctx as never, input)),
  getDetail: adminProcedure.input(z.object({ id: z.string().uuid() })).query(({ ctx, input }) => crud.getDetail(ctx as never, input)),
  create: adminProcedure.input(z.object({ facilityType, ...profileFields })).mutation(({ ctx, input }) => crud.create(ctx as never, input)),
  update: adminProcedure.input(z.object({ id: z.string().uuid(), ...profileFields }).partial({ /* name stays required via refine below */ }).extend({ name: z.string().min(1).max(200) })).mutation(({ ctx, input }) => crud.update(ctx as never, input)),
  archive: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(({ ctx, input }) => crud.archive(ctx as never, input)),
  restore: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(({ ctx, input }) => crud.restore(ctx as never, input)),
  setActive: adminProcedure.input(z.object({ id: z.string().uuid(), isActive: z.boolean() })).mutation(async ({ ctx, input }) => {
    const { data, error } = await ctx.supabase.from('clinical_facilities').update({ is_active: input.isActive }).eq('id', input.id).eq('org_id', ctx.user.orgId).select('id').maybeSingle()
    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
    if (!data) throw new TRPCError({ code: 'NOT_FOUND' })
    return { id: data.id }
  }),
})
```
> Keep the `update` input simple: `z.object({ id: uuid, name: required, ...all profile fields optional })`. If the `.partial().extend()` chain is awkward, write the object literal directly with `name` required and every other field `.optional()`.

- [ ] **Step 4: Register in `_app.ts`** — add `import { clinicalFacilityRouter } from './clinical-facility'` and `clinicalFacility: clinicalFacilityRouter,` in the `createTRPCRouter({...})` map.

- [ ] **Step 5: Run — expect pass** — `pnpm --filter hub-api test clinical-facility` → PASS.

- [ ] **Step 6: Commit** (checkpoint — ask first)

```bash
git add apps/hub-api/src/trpc/routers/clinical-facility.ts apps/hub-api/src/trpc/routers/_app.ts apps/hub-api/src/__tests__/clinical-facility.test.ts
git commit -m "feat(hub-api): clinical-facility router (Clinics & Hospitals)"
```

---

### Task 7: Org-scope + enrich pharmacy admin CRUD

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/pharmacy.ts`
- Test: `apps/hub-api/src/__tests__/pharmacy.test.ts` (extend)

**Interfaces:**
- Produces: `pharmacy.{listForAdmin,getDetail,create,update,archive,restore,setActive}` — org-scoped, enterprise fields. `listForAdmin` returns `{ facilities, nextCursor }` (renamed from `pharmacies` for consistency; update the frontend consumer in Task 12). Keeps `pharmacy.search`/`pharmacy.sync` unchanged.

- [ ] **Step 1: Write failing tests** (append to `pharmacy.test.ts`)

```typescript
import { pharmacyRouter } from '@/trpc/routers/pharmacy'
// (vi already imported at top of file)

describe('pharmacy.listForAdmin — org scoping', () => {
  it('filters by caller org and excludes archived', async () => {
    const chain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), range: vi.fn().mockResolvedValue({ data: [], error: null }) }
    const c = { supabase: { from: vi.fn(() => chain) }, user: { role: 'ADMIN', orgId: 'org-1', sub: 'u1' } } as never
    await pharmacyRouter.createCaller(c).listForAdmin({ cursor: 0, limit: 50 })
    expect(chain.eq).toHaveBeenCalledWith('org_id', 'org-1')
    expect(chain.is).toHaveBeenCalledWith('archived_at', null)
  })
})

describe('pharmacy.getDetail — cross-org', () => {
  it('returns NOT_FOUND for another org row', async () => {
    const chain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }
    const c = { supabase: { from: vi.fn(() => chain) }, user: { role: 'ADMIN', orgId: 'org-1', sub: 'u1' } } as never
    await expect(pharmacyRouter.createCaller(c).getDetail({ id: '00000000-0000-0000-0000-000000000000' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
```

- [ ] **Step 2: Run — expect fail** — `pnpm --filter hub-api test pharmacy` → new tests FAIL.

- [ ] **Step 3: Implement** — in `pharmacy.ts`: import `buildFacilityCrud` from `./_facility-crud`; instantiate `const crud = buildFacilityCrud({ table: 'pharmacy_facilities', typeColumn: 'facility_type', typeValues: ['pharmacy'], resourceType: 'PHARMACY', extraColumns: ['has_delivery','accepts_insurance'] })`. Replace the existing `listForAdmin`/`create`/`update`/`setActive` bodies to delegate to `crud` (org-scoped), and add `getDetail`/`archive`/`restore`. Use the same `profileFields` zod shape as Task 6 minus clinical-specific, plus `hasDelivery`/`acceptsInsurance`. `create` input omits `facilityType` (helper defaults insert with no type column change; pass `typeValues:['pharmacy']` so `list` filters correctly, and set `facility_type:'pharmacy'` explicitly in create by passing `facilityType:'pharmacy'` through the input, OR add `facility_type` in an extra insert — simplest: keep `crud.create` and pass `{ ...input, facilityType: 'pharmacy' }`). Leave `search`/`sync` untouched.

- [ ] **Step 4: Run — expect pass** — `pnpm --filter hub-api test pharmacy` → PASS (old + new).

- [ ] **Step 5: Commit** (checkpoint — ask first)

```bash
git add apps/hub-api/src/trpc/routers/pharmacy.ts apps/hub-api/src/__tests__/pharmacy.test.ts
git commit -m "feat(hub-api): org-scope + enrich pharmacy admin CRUD"
```

---

### Task 8: Lab enrichment — `updateLab`, `archiveLab`, list excludes ARCHIVED

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/admin.ts` (`createLab`, `getLabDetail`, `listLabs`; add `updateLab`, `archiveLab`)
- Test: `apps/hub-api/src/__tests__/lab-approval-workflow.test.ts` (extend) or new `apps/hub-api/src/__tests__/lab-enrichment.test.ts`

**Interfaces:**
- Produces: `admin.updateLab({ labId, ...enterpriseFields })`, `admin.archiveLab({ labId })` (status→ARCHIVED + `lab_status_history` row), `admin.listLabs({..., includeArchived? })` excluding ARCHIVED by default, enriched `getLabDetail`/`createLab`.

- [ ] **Step 1: Write failing test** (`apps/hub-api/src/__tests__/lab-enrichment.test.ts`)

```typescript
import { describe, it, expect, vi } from 'vitest'
import { adminRouter } from '@/trpc/routers/admin'

function adminCtx(chain: any) {
  return { supabase: { from: vi.fn(() => chain) }, user: { role: 'ADMIN', orgId: 'org-1', sub: 'u1', sessionId: 's1' } } as never
}

describe('admin.archiveLab', () => {
  it('sets status ARCHIVED', async () => {
    const chain = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'lab1' }, error: null }), insert: vi.fn().mockResolvedValue({ error: null }) }
    const res = await adminRouter.createCaller(adminCtx(chain)).archiveLab({ labId: 'lab1' })
    expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'ARCHIVED' }))
    expect(res).toMatchObject({ id: 'lab1' })
  })
})
```
> Adjust the mock chain to match whatever query shape you implement; the assertion that matters is `status: 'ARCHIVED'`.

- [ ] **Step 2: Run — expect fail** — `pnpm --filter hub-api test lab-enrichment` → FAIL.

- [ ] **Step 3: Implement** in `admin.ts`:
  - `createLab`: extend the zod input with the enterprise fields (optional) and include them in the insert (snake_case).
  - `getLabDetail`: add the new columns to the `.select(...)` and to the returned object.
  - `listLabs`: add `includeArchived: z.boolean().optional()`; when false/absent, add `.neq('status','ARCHIVED')` (keep existing status filter logic intact — if a specific status is requested, that still wins).
  - `updateLab`: `adminProcedure.input(z.object({ labId: uuid, labName?, ...enterprise fields })).mutation(...)` → org-scoped `update` (`.eq('org_id', ctx.user.orgId)`), emit `UPDATE`/`LAB` audit.
  - `archiveLab`: `adminProcedure.input(z.object({ labId: uuid, reason: z.string().max(500).optional() }))` → set `status='ARCHIVED'` (org-scoped), insert a `lab_status_history` row `{ lab_id, status:'ARCHIVED', changed_by: ctx.user.sub, reason }`, emit `ARCHIVE`/`LAB` audit.

- [ ] **Step 4: Run — expect pass** — `pnpm --filter hub-api test lab-enrichment` and `pnpm --filter hub-api test lab-approval` → PASS.

- [ ] **Step 5: Commit** (checkpoint — ask first)

```bash
git add apps/hub-api/src/trpc/routers/admin.ts apps/hub-api/src/__tests__/lab-enrichment.test.ts
git commit -m "feat(hub-api): lab enterprise fields, update + archive"
```

---

# PART B — Frontend (admin-portal)

> All components: `'use client'`, tokens-only, logical CSS, ui-kit imports, icons from `@ultranos/ui-kit/icons`. tRPC via `@/lib/trpc` (`trpc.<router>.<proc>.query/mutate`).

### Task 9: Shared profile primitives

**Files:**
- Create: `apps/admin-portal/src/components/facilities/primitives.tsx`
- Test: `apps/admin-portal/src/__tests__/facility-primitives.test.tsx`

**Interfaces:**
- Produces: `ProfileSection`, `ProfileField`, `StarRating`, `MapLink`, `HoursTable`, `TagList`, `LogoAvatar`. Consumed by Tasks 11 & 14.

- [ ] **Step 1: Failing test**

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StarRating, MapLink, TagList } from '@/components/facilities/primitives'

describe('facility primitives', () => {
  it('StarRating shows dash when no rating', () => {
    render(<StarRating rating={null} reviewCount={null} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })
  it('MapLink hidden when no url/coords', () => {
    const { container } = render(<MapLink url={null} latitude={null} longitude={null} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('TagList renders chips', () => {
    render(<TagList items={['Cardiology','Pediatrics']} />)
    expect(screen.getByText('Cardiology')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run — expect fail** — `pnpm --filter admin-portal test facility-primitives` → FAIL.

- [ ] **Step 3: Implement `primitives.tsx`**

```tsx
'use client'
import type { ReactNode } from 'react'
import { Star, MapPin } from '@ultranos/ui-kit/icons'

export function ProfileSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="mt-3 flex flex-col gap-2 text-sm">{children}</div>
    </div>
  )
}
export function ProfileField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-end font-medium text-foreground">{value ?? '—'}</dd>
    </div>
  )
}
export function StarRating({ rating, reviewCount }: { rating: number | null; reviewCount: number | null }) {
  if (rating == null) return <span className="text-muted-foreground">—</span>
  return (
    <span className="inline-flex items-center gap-1 text-foreground">
      <Star size={16} className="fill-warning text-warning" />
      <span className="font-medium">{rating.toFixed(1)}</span>
      {reviewCount != null && <span className="text-muted-foreground">({reviewCount})</span>}
    </span>
  )
}
export function MapLink({ url, latitude, longitude }: { url: string | null; latitude: number | null; longitude: number | null }) {
  const href = url ?? (latitude != null && longitude != null ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}` : null)
  if (!href) return null
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
      <MapPin size={16} /> View on Google Maps
    </a>
  )
}
export function HoursTable({ hours, is247 }: { hours: unknown | null; is247: boolean }) {
  if (is247) return <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">24 / 7</span>
  if (!hours || typeof hours !== 'object') return <span className="text-muted-foreground">—</span>
  const days = ['mon','tue','wed','thu','fri','sat','sun']
  const h = hours as Record<string, { open?: string; close?: string } | undefined>
  return (
    <dl className="flex flex-col gap-1">
      {days.map((d) => (
        <div key={d} className="flex justify-between"><dt className="uppercase text-muted-foreground">{d}</dt>
          <dd className="text-foreground">{h[d]?.open ? `${h[d]!.open}–${h[d]!.close}` : 'Closed'}</dd></div>
      ))}
    </dl>
  )
}
export function TagList({ items }: { items: string[] | null | undefined }) {
  if (!items?.length) return <span className="text-muted-foreground">—</span>
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((t) => <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">{t}</span>)}
    </div>
  )
}
export function LogoAvatar({ url, name, size = 48 }: { url: string | null; name: string; size?: number }) {
  const initials = name.split(' ').slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase()
  return url
    ? <img src={url} alt="" width={size} height={size} className="rounded-xl object-cover" style={{ width: size, height: size }} />
    : <span className="inline-flex items-center justify-center rounded-xl bg-muted font-semibold text-muted-foreground" style={{ width: size, height: size }}>{initials}</span>
}
```
> `warning`/`success` are existing semantic tokens (used elsewhere in the app). `LogoAvatar` uses inline `width/height` only for the pixel box — this is a sizing exception, not styling/color; keep colors token-based.

- [ ] **Step 4: Run — expect pass** — `pnpm --filter admin-portal test facility-primitives` → PASS.

- [ ] **Step 5: Commit** (checkpoint — ask first)

```bash
git add apps/admin-portal/src/components/facilities/primitives.tsx apps/admin-portal/src/__tests__/facility-primitives.test.tsx
git commit -m "feat(admin-portal): shared facility profile primitives"
```

---

### Task 10: `FacilityFormModal` (create/edit, config-driven)

**Files:**
- Create: `apps/admin-portal/src/components/facilities/FacilityFormModal.tsx`
- Create: `apps/admin-portal/src/components/facilities/config.ts` (field/section config + kind configs)
- Test: `apps/admin-portal/src/__tests__/facility-form-modal.test.tsx`

**Interfaces:**
- Consumes: `@/components/ui/{dialog,input,label,button,textarea}`.
- Produces: `FacilityFormModal({ open, onOpenChange, kindConfig, initial?, onSaved })`; `config.ts` exports `pharmacyKind`, `clinicalKind` (`FacilityKindConfig`: `{ key, i18nNs, typeOptions?, extraFields, createFn, updateFn }`). Consumed by Tasks 12 & 13.

- [ ] **Step 1: Failing test**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { FacilityFormModal } from '@/components/facilities/FacilityFormModal'

vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k }))
const createFn = vi.fn().mockResolvedValue({ id: 'c1' })
const kindConfig = { key: 'clinical', i18nNs: 'clinics', typeOptions: ['clinic','hospital','opd'], extraFields: [], createFn, updateFn: vi.fn() }

describe('FacilityFormModal', () => {
  it('requires a name and calls createFn on save', async () => {
    render(<FacilityFormModal open kindConfig={kindConfig as never} onOpenChange={() => {}} onSaved={() => {}} />)
    fireEvent.change(screen.getByLabelText('name'), { target: { value: 'Shifa Clinic' } })
    fireEvent.click(screen.getByRole('button', { name: 'save' }))
    await waitFor(() => expect(createFn).toHaveBeenCalledWith(expect.objectContaining({ name: 'Shifa Clinic' })))
  })
})
```

- [ ] **Step 2: Run — expect fail** — `pnpm --filter admin-portal test facility-form-modal` → FAIL.

- [ ] **Step 3: Implement `config.ts`**

```typescript
import { trpc } from '@/lib/trpc'
export interface FacilityKindConfig {
  key: 'pharmacy' | 'clinical'
  i18nNs: 'pharmacies' | 'clinics'
  typeOptions?: string[]
  extraBooleanFields: { name: string; label: string }[]
  extraArrayFields: { name: string; label: string }[]
  createFn: (input: Record<string, unknown>) => Promise<{ id: string }>
  updateFn: (input: Record<string, unknown>) => Promise<unknown>
  archiveFn: (input: { id: string }) => Promise<unknown>
  restoreFn: (input: { id: string }) => Promise<unknown>
  listFn: (input: { cursor: number; limit: number; q?: string; includeArchived?: boolean }) => Promise<{ facilities: any[]; nextCursor: number | null }>
}
export const pharmacyKind: FacilityKindConfig = {
  key: 'pharmacy', i18nNs: 'pharmacies',
  extraBooleanFields: [{ name: 'hasDelivery', label: 'hasDelivery' }, { name: 'acceptsInsurance', label: 'acceptsInsurance' }],
  extraArrayFields: [],
  createFn: (i) => trpc.pharmacy.create.mutate(i as never),
  updateFn: (i) => trpc.pharmacy.update.mutate(i as never),
  archiveFn: (i) => trpc.pharmacy.archive.mutate(i),
  restoreFn: (i) => trpc.pharmacy.restore.mutate(i),
  listFn: (i) => trpc.pharmacy.listForAdmin.query(i as never),
}
export const clinicalKind: FacilityKindConfig = {
  key: 'clinical', i18nNs: 'clinics', typeOptions: ['clinic', 'hospital', 'opd'],
  extraBooleanFields: [{ name: 'emergencyServices', label: 'emergencyServices' }],
  extraArrayFields: [{ name: 'departments', label: 'departments' }, { name: 'specialties', label: 'specialties' }],
  createFn: (i) => trpc.clinicalFacility.create.mutate(i as never),
  updateFn: (i) => trpc.clinicalFacility.update.mutate(i as never),
  archiveFn: (i) => trpc.clinicalFacility.archive.mutate(i),
  restoreFn: (i) => trpc.clinicalFacility.restore.mutate(i),
  listFn: (i) => trpc.clinicalFacility.listForAdmin.query(i as never),
}
```

- [ ] **Step 4: Implement `FacilityFormModal.tsx`** — a `Dialog` with sectioned inputs for the shared fields (Identity: name*, description, licenseRef, logoUrl, establishedYear; Contact: phone, altPhone, email, website, whatsapp; Location: address, province, district, city, postalCode, country, latitude, longitude; Contact person: contactPersonName/Role/Phone; plus `typeOptions` `<select>` when present, `extraBooleanFields` as checkboxes, `extraArrayFields` as comma-split text inputs). State seeded from `initial` (edit) or blank (create). On save: build a payload of non-empty fields (numbers parsed; arrays split on comma/trim; booleans from checkboxes), then `initial ? updateFn({ id: initial.id, ...payload }) : createFn(payload)`; call `onSaved()`. Name required to enable Save. Use `EmptyState`-free plain inputs; label every input with `<Label htmlFor>` using i18n keys under `kindConfig.i18nNs`. Google fields are **not** rendered.

- [ ] **Step 5: Run — expect pass** — `pnpm --filter admin-portal test facility-form-modal` → PASS.

- [ ] **Step 6: Commit** (checkpoint — ask first)

```bash
git add apps/admin-portal/src/components/facilities/FacilityFormModal.tsx apps/admin-portal/src/components/facilities/config.ts apps/admin-portal/src/__tests__/facility-form-modal.test.tsx
git commit -m "feat(admin-portal): config-driven facility create/edit modal"
```

---

### Task 11: `FacilityProfileModal` (detail view)

**Files:**
- Create: `apps/admin-portal/src/components/facilities/FacilityProfileModal.tsx`
- Test: `apps/admin-portal/src/__tests__/facility-profile-modal.test.tsx`

**Interfaces:**
- Consumes: primitives (Task 9), `FacilityKindConfig` (Task 10).
- Produces: `FacilityProfileModal({ open, onOpenChange, facilityId, kindConfig, onEdit, onChanged })` — fetches detail via `kindConfig` getDetail (add `getDetailFn` to config), renders sections, exposes Edit + Archive/Restore. Consumed by Task 12 & 13.

- [ ] **Step 1: Add `getDetailFn` to `FacilityKindConfig` + both kinds** (`trpc.pharmacy.getDetail.query` / `trpc.clinicalFacility.getDetail.query`).

- [ ] **Step 2: Failing test**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { FacilityProfileModal } from '@/components/facilities/FacilityProfileModal'
vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k }))
const getDetailFn = vi.fn().mockResolvedValue({ id: 'c1', name: 'Shifa Clinic', facilityType: 'clinic', isActive: true, archivedAt: null, googleRating: 4.6, googleReviewCount: 12, is247: false })
const kindConfig = { key: 'clinical', i18nNs: 'clinics', getDetailFn, archiveFn: vi.fn(), restoreFn: vi.fn() }

describe('FacilityProfileModal', () => {
  it('renders the facility name and rating', async () => {
    render(<FacilityProfileModal open facilityId="c1" kindConfig={kindConfig as never} onOpenChange={() => {}} onEdit={() => {}} onChanged={() => {}} />)
    await waitFor(() => expect(screen.getByText('Shifa Clinic')).toBeInTheDocument())
    expect(screen.getByText('4.6')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run — expect fail** → FAIL.

- [ ] **Step 4: Implement** — `Dialog` (wide, `max-w-2xl`) that on open calls `getDetailFn({ id: facilityId })`, stores the profile. Header: `LogoAvatar` + name + type badge + active/archived `Badge` + `StarRating`. Sections via `ProfileSection`/`ProfileField`: Contact (phone/email/website/whatsapp), Location (address/city/province/district/country + `MapLink`), Hours (`HoursTable`), Services (`TagList` for services/specialties/departments as present), Contact Person. Footer: **Edit** (calls `onEdit(profile)`), **Archive** (if not archived) / **Restore** (if archived) → calls `kindConfig.archiveFn/restoreFn` then `onChanged()`; wrap archive in a confirm `Dialog` (destructive). Loading state uses a centered spinner text.

- [ ] **Step 5: Run — expect pass** → PASS.

- [ ] **Step 6: Commit** (checkpoint — ask first)

```bash
git add apps/admin-portal/src/components/facilities/FacilityProfileModal.tsx apps/admin-portal/src/components/facilities/config.ts apps/admin-portal/src/__tests__/facility-profile-modal.test.tsx
git commit -m "feat(admin-portal): facility profile detail modal"
```

---

### Task 12: `FacilityManager` + repoint Pharmacies section

**Files:**
- Create: `apps/admin-portal/src/components/facilities/FacilityManager.tsx`
- Modify: `apps/admin-portal/src/components/pharmacies/PharmacyManager.tsx` (replace body with `<FacilityManager kindConfig={pharmacyKind} .../>`) — or repoint `pharmacies/page.tsx` directly and delete the old manager.
- Test: `apps/admin-portal/src/__tests__/pharmacies.test.tsx` (update)

**Interfaces:**
- Consumes: `FacilityKindConfig`, `FacilityFormModal`, `FacilityProfileModal`.
- Produces: `FacilityManager({ kindConfig, titleKey, icon, showTypeColumn? })` — list-page-standard toolbar (search → Include-archived toggle → **Add**), one content box table, row-click → profile modal, Add/Edit → form modal.

- [ ] **Step 1: Update the pharmacies test** — the mock now returns `{ facilities: [...] , nextCursor: null }` from `trpc.pharmacy.listForAdmin.query`, and asserts a pharmacy name renders. Update the existing mock in `pharmacies.test.tsx` accordingly (rename `pharmacies` → `facilities` in the mock payload, add `getDetail`, `archive`, `restore`, `update` mocks). Assert row text appears.

- [ ] **Step 2: Run — expect fail** — `pnpm --filter admin-portal test pharmacies` → FAIL (old component reads `.pharmacies`).

- [ ] **Step 3: Implement `FacilityManager.tsx`** — follows `PharmacyManager`'s existing layout (full-width `<h1>` from `titleKey`, one toolbar row: `SearchInput` (`min-w-[200px] flex-1`) → Include-archived `<label><input type=checkbox>` → `<Button>` Add at the end; one content box `overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50` containing loading / `EmptyState` / table). Columns: Name, [Type — when `showTypeColumn`], Location (`city/province`), Status badge (Active/Inactive/Archived). Row `onClick` → open `FacilityProfileModal` with that id. Add button → `FacilityFormModal` (create). Profile modal `onEdit` → open form modal (edit, seeded). `onSaved`/`onChanged` → refetch via `kindConfig.listFn`. Data fetch: `kindConfig.listFn({ cursor:0, limit:50, q, includeArchived })`.

- [ ] **Step 4: Repoint Pharmacies** — set `pharmacies/page.tsx` (or `PharmacyManager`) to render `<FacilityManager kindConfig={pharmacyKind} titleKey="pharmacies.title" icon={Building2} />`.

- [ ] **Step 5: Run — expect pass** — `pnpm --filter admin-portal test pharmacies` → PASS.

- [ ] **Step 6: Commit** (checkpoint — ask first)

```bash
git add apps/admin-portal/src/components/facilities/FacilityManager.tsx apps/admin-portal/src/components/pharmacies/PharmacyManager.tsx apps/admin-portal/src/app/\[locale\]/pharmacies/page.tsx apps/admin-portal/src/__tests__/pharmacies.test.tsx
git commit -m "feat(admin-portal): FacilityManager + enterprise Pharmacies section"
```

---

### Task 13: Clinics & Hospitals section + nav

**Files:**
- Create: `apps/admin-portal/src/app/[locale]/clinics/page.tsx`
- Modify: `apps/admin-portal/src/components/sidebar/nav-config.ts` (add nav item + `Hospital` icon)
- Modify: `apps/admin-portal/src/__tests__/sidebar-updated.test.tsx` (assert new item) — check the existing sidebar test's expectations first.
- Test: `apps/admin-portal/src/__tests__/clinics.test.tsx`

**Interfaces:**
- Consumes: `FacilityManager`, `clinicalKind`.

- [ ] **Step 1: Failing test** (`clinics.test.tsx`)

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import ClinicsPage from '@/app/[locale]/clinics/page'
vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k, useLocale: () => 'en' }))
vi.mock('@/lib/trpc', () => ({ trpc: { clinicalFacility: {
  listForAdmin: { query: vi.fn().mockResolvedValue({ facilities: [{ id: 'c1', name: 'Shifa Clinic', facilityType: 'clinic', isActive: true, archivedAt: null, city: 'Kabul' }], nextCursor: null }) },
  getDetail: { query: vi.fn() }, create: { mutate: vi.fn() }, update: { mutate: vi.fn() }, archive: { mutate: vi.fn() }, restore: { mutate: vi.fn() },
} } }))
describe('ClinicsPage', () => {
  it('lists clinical facilities', async () => {
    render(<ClinicsPage />)
    await waitFor(() => expect(screen.getByText('Shifa Clinic')).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run — expect fail** → FAIL.

- [ ] **Step 3: Implement `clinics/page.tsx`**

```tsx
'use client'
import { FacilityManager } from '@/components/facilities/FacilityManager'
import { clinicalKind } from '@/components/facilities/config'
import { Hospital } from '@ultranos/ui-kit/icons'
export default function ClinicsPage() {
  return <FacilityManager kindConfig={clinicalKind} titleKey="clinics.title" icon={Hospital} showTypeColumn />
}
```

- [ ] **Step 4: Add nav item** — in `nav-config.ts` import `Hospital`; add `{ title: 'Clinics & Hospitals', url: '/clinics', icon: Hospital }` to the **Operations** group. If `Hospital` isn't exported by `@ultranos/ui-kit/icons`, add it to `packages/ui-kit/src/icons.ts` (appropriate medical group) and rebuild ui-kit (`pnpm --filter @ultranos/ui-kit build`).

- [ ] **Step 5: Update sidebar test** if it asserts an exhaustive item list.

- [ ] **Step 6: Run — expect pass** — `pnpm --filter admin-portal test clinics` and `... test sidebar` → PASS.

- [ ] **Step 7: Commit** (checkpoint — ask first)

```bash
git add apps/admin-portal/src/app/\[locale\]/clinics/page.tsx apps/admin-portal/src/components/sidebar/nav-config.ts apps/admin-portal/src/__tests__/clinics.test.tsx apps/admin-portal/src/__tests__/sidebar-updated.test.tsx
git commit -m "feat(admin-portal): Clinics & Hospitals section + nav"
```

---

### Task 14: Lab modals + repoint Labs list

**Files:**
- Create: `apps/admin-portal/src/components/labs/LabFormModal.tsx`, `apps/admin-portal/src/components/labs/LabProfileModal.tsx`
- Modify: `apps/admin-portal/src/app/[locale]/labs/page.tsx` (row-click → `LabProfileModal`; Add → `LabFormModal`)
- Modify: `apps/admin-portal/src/components/sidebar/nav-config.ts` (remove "Create Lab" item)
- Test: `apps/admin-portal/src/__tests__/lab-modals.test.tsx`

**Interfaces:**
- Consumes: shared primitives; `trpc.admin.{getLabDetail,createLab,updateLab,archiveLab,reviewLab,listLabs}`.

- [ ] **Step 1: Failing test** — mock `trpc.admin.getLabDetail.query` returning an enriched lab; assert `LabProfileModal` renders the lab name + license ref; mock `createLab` and assert `LabFormModal` submit calls it with `labName`/`licenseRef`.

- [ ] **Step 2: Run — expect fail** → FAIL.

- [ ] **Step 3: Implement** — `LabProfileModal` mirrors `FacilityProfileModal` but with lab sections (License/Accreditation incl. `accreditationRef`/`capAccredited`, Test Menu = `specialties` `TagList`, TAT = `turnaroundTimeHours`, Collection = home/sample booleans) and the existing status badge + approval buttons (Approve/Suspend/Reactivate via `trpc.admin.reviewLab.mutate`) + **Archive** (`trpc.admin.archiveLab.mutate`) + buttons linking to `/labs/[labId]` and `/labs/[labId]/staff`. `LabFormModal` = create/edit with `labName`*, `licenseRef`*, `accreditationRef`, and the shared enterprise fields (reuse the same input layout as `FacilityFormModal`; a small lab-specific variant is fine). Update `labs/page.tsx`: replace `router.push('/labs/${lab.id}')` row handler with opening `LabProfileModal`; replace `router.push('/labs/create')` with opening `LabFormModal`. Delete the "Create Lab" nav item.

- [ ] **Step 4: Run — expect pass** — `pnpm --filter admin-portal test lab-modals` → PASS.

- [ ] **Step 5: Commit** (checkpoint — ask first)

```bash
git add apps/admin-portal/src/components/labs/ apps/admin-portal/src/app/\[locale\]/labs/page.tsx apps/admin-portal/src/components/sidebar/nav-config.ts apps/admin-portal/src/__tests__/lab-modals.test.tsx
git commit -m "feat(admin-portal): lab profile + create/edit modals"
```

---

### Task 15: i18n keys (4 locales)

**Files:**
- Modify: `apps/admin-portal/messages/{en,ar,prs,ps}.json`

**Interfaces:**
- Produces: `clinics.*` namespace + new `pharmacies.*` / `labs.*` keys referenced by Tasks 10–14.

- [ ] **Step 1: Add keys to `en.json`** — a `clinics` block (`title`, `add`, `searchPlaceholder`, `empty`, column headers, all form field labels used in `FacilityFormModal`, section headings, `includeArchived`, `archive`, `restore`, type labels `clinic`/`hospital`/`opd`) and the new `pharmacies.*`/`labs.*` field-label keys. Gather the exact key list by grepping the components for `t('...')` after Tasks 10–14.

- [ ] **Step 2: Mirror the keys into `ar.json`, `prs.json`, `ps.json`** — translated values (Arabic/Dari/Pashto). If a professional translation isn't available in-session, copy the English string as a placeholder value **and note it** — do not leave the key missing (a missing key throws at runtime).

- [ ] **Step 3: Verify no missing keys** — run the admin-portal dev build or `pnpm --filter admin-portal test` and confirm no `MISSING_MESSAGE` warnings for the new namespaces.

- [ ] **Step 4: Commit** (checkpoint — ask first)

```bash
git add apps/admin-portal/messages/en.json apps/admin-portal/messages/ar.json apps/admin-portal/messages/prs.json apps/admin-portal/messages/ps.json
git commit -m "i18n(admin-portal): facility/clinic/lab profile keys (en/ar/prs/ps)"
```

---

### Task 16: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Typecheck** — `pnpm typecheck` → no errors. Fix any snake/camel or import mismatches.
- [ ] **Step 2: Run affected suites** — `pnpm --filter hub-api test` and `pnpm --filter admin-portal test` → green.
- [ ] **Step 3: Security advisors** — call Supabase `get_advisors` (type `security`); confirm no new RLS gaps on `clinical_facilities` or the new `pharmacy_facilities.org_id`. Fix policies if flagged.
- [ ] **Step 4: Manual smoke (optional, Playwright/dev):** log into admin-portal, open **Clinics & Hospitals** → Add a clinic → row-click opens profile → Edit → Archive → toggle Include-archived → Restore. Repeat spot-check on **Pharmacies** and **Labs**.
- [ ] **Step 5: Report** — summarize what passed with the actual command output; do not claim done for anything not observed green.

---

## Self-Review (author's coverage check)

- **Spec §4 (schema):** Tasks 1–3 create `clinical_facilities`, enrich pharmacies (+org_id/backfill/coords), enrich labs (+ARCHIVED). ✓
- **Spec §5 (backend, org-scoping, factory, three routers, lab enrichment, audit):** Tasks 5–8. Cross-org NOT_FOUND tested in Tasks 5 & 7. ✓
- **Spec §6 (shared-types):** Task 4. ✓
- **Spec §7 (primitives, form/profile modals, managers, three sections, nav, lab modals):** Tasks 9–14. ✓
- **Spec §8 (soft-delete UX):** archive/restore in factory (Task 5), lab archive (Task 8), Include-archived toggle + Archive/Restore actions (Tasks 11–12, 14). ✓
- **Spec §9 (i18n, 4 locales):** Task 15. ✓
- **Spec §10 (testing + advisors):** per-task tests + Task 16. ✓
- **Google (P4):** columns added (Tasks 1–3), never rendered/settable in P1 (Tasks 10–11). ✓
- **Type consistency:** `listForAdmin` returns `{ facilities, nextCursor }` for both pharmacy (Task 7) and clinical (Task 6); frontend consumes `.facilities` (Tasks 12–13, and the updated pharmacies mock in Task 12). `mapFacilityRow` camelCase matches `FacilityProfileBase` (Task 4/5). ✓
- **Out of scope confirmed absent:** no staff, no facility approval workflow, no live Google calls. ✓
