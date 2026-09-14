# Multi-Location SP1a — Facility Sub-Locations: Hub table + endpoints + admin management

**Date:** 2026-09-13
**Apps:** `apps/hub-api`, `apps/admin-portal`, `packages/shared-types` (+ `supabase/migrations`)
**Status:** Design — awaiting review before implementation plan
**Program:** Track 2 — Multi-location stock/reorder for pharmacy-lite. This is
**SP1a**, the Hub + admin-portal half of the SP1 foundation. **SP1b** (the
pharmacy-lite spoke: pull + current-location selector + write-tagging + legacy
reconciliation) is a separate spec that consumes the `listForFacility` endpoint
defined here. SP2 (location-scoped stock views) and SP3 (location-aware reorder)
build on SP1.

## Context

"Multi-location" for a pharmacy-lite install means **sub-locations inside one
facility** (main store, dispensary, satellite room, cold-chain fridge, ward
cabinet) — *not* multiple facilities under one org. That decision was made
because the platform is **one-facility-per-JWT**: a pharmacist's access token
carries a single `facility_id` claim (`apps/hub-api/src/trpc/init.ts`), and the
Hub enforces facility-scoping from it. A true multi-facility chain would require
a Hub tenancy/auth redesign (org↔facility linkage, multi-facility JWT/RLS) and is
explicitly out of scope.

Ground truth verified in the current codebase:

- **`pharmacy_facilities`** (Hub table, migration `034`, 8 rows) is the facility
  registry: `id uuid`, `name`, `latitude`, `longitude`, `address`, `province`,
  `district`, `facility_type`, `is_active`, `created_at`, `updated_at`. It has
  **no `org_id`** — facility scoping is by JWT claim, not by a DB org column.
- **No sub-location concept exists.** `stockBatches.locationId` in the spoke is
  loose text hardcoded to `'default'` on receipt; `zoneId`/`enableZones` are
  vestigial stubs (never written, no CRUD, no queries). There is no
  `facility_locations` table, type, endpoint, or admin surface anywhere (verified
  net-new).
- **admin-portal already manages `pharmacy_facilities`** via
  `PharmacyManager.tsx` (list + add + deactivate) behind an `adminProcedure`
  Hub router (`pharmacy.listForAdmin` / `create` / `update` / `setActive`). This
  is the direct template for the new sub-location management page.

## Goal

Give each `pharmacy_facilities` facility a Hub-defined, admin-managed set of
named **sub-locations**, and expose them through a facility-scoped read endpoint
the pharmacy-lite spoke can pull. After SP1a: an admin can define a facility's
sub-locations (one marked primary); a pharmacist's app can list its own
facility's sub-locations by calling one endpoint. SP1a delivers no spoke UI — it
delivers the source of truth and its management + read surfaces.

## Entity

A sub-location is FHIR-R4-`Location`-inspired (`partOf` = the facility,
`physicalType` ≈ `kind`, `status` ≈ `isActive`) but modeled as a pragmatic
plain interface, matching the existing non-strict-FHIR pharmacy types
(`PharmacyFacility` in `packages/shared-types/src/fhir/drug-catalog.ts`).

**`packages/shared-types/src/fhir/drug-catalog.ts`** (add + barrel already
re-exports the file):

```ts
export type FacilityLocationKind = 'store' | 'room' | 'fridge' | 'cabinet' | 'other'

export interface FacilityLocation {
  id: string
  facilityId: string          // → pharmacy_facilities.id
  name: string
  kind: FacilityLocationKind
  isPrimary: boolean          // exactly one true per facility
  isActive: boolean
  createdAt?: string          // ISO 8601 (Ultranos extension, not FHIR meta)
  updatedAt?: string          // ISO 8601
}
```

String-union enum (not a TS `enum`) and camelCase props follow the file's
existing convention.

## Data model — migration `061_facility_locations.sql`

Applied via Supabase MCP (`apply_migration`). Mirrors the `034`/`050` conventions
(uuid PK default, `TIMESTAMPTZ NOT NULL DEFAULT NOW()`, two-tier RLS).

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

-- One primary per facility, enforced at the DB (backstop for the service logic).
CREATE UNIQUE INDEX IF NOT EXISTS uq_facility_locations_one_primary
  ON facility_locations(facility_id) WHERE is_primary;

-- kind domain guard (keeps the union honest without a Postgres enum type).
ALTER TABLE facility_locations
  ADD CONSTRAINT facility_locations_kind_chk
  CHECK (kind IN ('store','room','fridge','cabinet','other'));

ALTER TABLE facility_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY facility_locations_service_all ON facility_locations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY facility_locations_authenticated_read ON facility_locations
  FOR SELECT TO authenticated USING (is_active = true);

-- updated_at auto-maintenance (pharmacy_facilities has no trigger; we add one).
CREATE OR REPLACE FUNCTION update_facility_locations_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_facility_locations_updated_at
  BEFORE UPDATE ON facility_locations
  FOR EACH ROW EXECUTE FUNCTION update_facility_locations_updated_at();
```

**Why no `org_id`:** consistent with `pharmacy_facilities` — scoping is by
`facility_id` via the JWT, enforced in the tRPC layer (RLS on pharmacy/inventory
tables is `service_role`-only, defense-in-depth). Adding `org_id` here would
invent a tenancy column the parent table doesn't have.

**Partial unique index caveat:** Postgres allows only one `is_primary = true` row
per `facility_id`. The service must **clear the old primary before/within the
same operation** that sets a new one, or the insert/update will violate the
index. See the invariant handling below.

## Hub API — `facilityLocationsRouter`

New router `apps/hub-api/src/trpc/routers/facility-locations.ts`, registered in
`_app.ts` as `facilityLocations: facilityLocationsRouter`. All DB access via
`ctx.supabase` (service-role client). Uses the existing `protectedProcedure`;
defines a local `adminProcedure` guard inline exactly as `pharmacy.ts:22-30`
does.

### Procedures

1. **`listForFacility()` — the spoke pull contract.**
   - `protectedProcedure`. Reads `ctx.user.facilityId`. If null →
     `TRPCError('FORBIDDEN', 'MISSING_FACILITY_CONTEXT')` (a hard fail, unlike
     `setPrice`'s soft `if (jwtFacilityId && …)` — a pull with no facility must
     not silently return another facility's rows).
   - Returns **all** rows for that facility (active **and** inactive), ordered
     `is_primary DESC, name ASC`, mapped to the `FacilityLocation` shape. The
     spoke needs inactive rows too so it can render/annotate batches still tagged
     to a now-retired sub-location.
   - No role gate beyond authentication (any staff role scoped to the facility
     may read its own sub-locations; sub-location names are operational, not PHI).

2. **`listForAdmin({ facilityId })` — admin management list.**
   - `adminProcedure`. `facilityId: z.string().uuid()`. Returns all rows for the
     given facility, same ordering/shape. (Admins are not facility-scoped, so the
     facility is an explicit input.)

3. **`create({ facilityId, name, kind?, isPrimary? })`.**
   - `adminProcedure`. `name` trimmed, non-empty (`z.string().trim().min(1)`);
     `kind` defaults `'store'`; `isPrimary` optional.
   - **First-location rule:** if the facility currently has **zero** rows, the
     new row is forced `is_primary = true` regardless of input (a facility with
     any sub-locations must always have exactly one primary — this guarantees
     SP1b reconciliation always has a target).
   - **Primary invariant:** if the effective `is_primary` is true, clear the
     existing primary (`UPDATE … SET is_primary=false WHERE facility_id=? AND
     is_primary`) **before** inserting, so the partial unique index is never
     violated.
   - Returns the created `FacilityLocation`.

4. **`update({ id, name?, kind?, isPrimary? })`.**
   - `adminProcedure`. Patch semantics (only provided fields change). If
     `isPrimary` is set to `true`, clear the facility's existing primary first
     (same as create). **`isPrimary: false` is rejected** if it would leave the
     facility with no primary — to move the primary you set another location
     primary (which clears this one), you never un-primary in isolation.
   - Returns the updated row.

5. **`setActive({ id, isActive })`.**
   - `adminProcedure`. Deactivating the **primary** location is rejected
     (`TRPCError('BAD_REQUEST', 'CANNOT_DEACTIVATE_PRIMARY')`) — reassign primary
     first. Reactivating is always allowed. Returns the updated row.

**Facility existence:** `create`/`listForAdmin` validate the `facilityId` exists
in `pharmacy_facilities` (a `select id` check → `NOT_FOUND` if absent), mirroring
how the FK protects writes but giving a clean error to the admin UI.

## admin-portal — facility sub-location management page

**Route:** `apps/admin-portal/src/app/[locale]/pharmacies/[facilityId]/locations/page.tsx`
(a thin shell rendering the component), reached from a new **"Manage
locations"** row action added to `PharmacyManager.tsx`'s facility table.

**Component:** `apps/admin-portal/src/components/pharmacies/FacilityLocationsManager.tsx`
— mirrors `PharmacyManager.tsx` (list + add + deactivate) plus the
`inventory/suppliers/page.tsx` shared-Dialog **edit** pattern
(`editingLocation !== null` discriminant). OPD list-page standard, verified
against the shell in `AuthGuard.tsx:207-221`:

- Page root `<div className="flex flex-col gap-4">`; standalone
  `<h1>{t('title')}</h1>` (a generic localized "Sub-locations" heading). The
  facility is identified by the `[facilityId]` route segment and used only to
  scope the queries — SP1a does **not** display the facility name (there is no
  `pharmacy.getById` endpoint and inventing one is out of scope; YAGNI). A future
  polish can add a facility-name subheading.
- One toolbar row (`flex flex-wrap items-center gap-3`): `SearchInput`
  (`min-w-[200px] flex-1`) + the **Add location** `<Button>` at the end.
- One content box `overflow-hidden rounded-xl bg-card shadow-card
  ring-[0.65px] ring-border/50`; loading/empty states inside it
  (`min-h-[16rem]`, `EmptyState` from `@ultranos/ui-kit/components/ui/empty-state`).
- Table columns: **name**, **kind** (localized label), **primary** (a badge or a
  "Set primary" action for non-primary active rows), **status** (active/inactive
  with a Deactivate/Reactivate toggle button), **edit** (opens the Dialog).
- Create/edit via one `<Dialog>` (fields: name, kind `<select>`, "primary"
  checkbox). Deactivate via inline row button (`window.confirm`, per the suppliers
  page). "Set primary" calls `update({ id, isPrimary: true })`.
- Semantic oklch tokens only; icons from `@ultranos/ui-kit/icons`; ShadCN via the
  re-export proxies.

**Data flow:** vanilla tRPC client (`apps/admin-portal/src/lib/trpc.ts`), the same
`await trpc.<router>.<proc>.query/mutate({…})` + `useCallback`/`useEffect`
pattern `PharmacyManager` uses; auth token injected via the client's
`headers()`. List = `trpc.facilityLocations.listForAdmin.query({ facilityId })`;
mutations = `create` / `update` / `setActive`. Errors caught into component state
(no toast infra assumed).

**Registration:** add breadcrumb labels for `/pharmacies` and the new
`…/locations` segment to `apps/admin-portal/src/lib/route-map.ts` `ROUTE_LABELS`
(the report noted `/pharmacies` is currently missing there). No new top-level
sidebar entry — it is a drill-down from the Pharmacies list, not a nav root.

## i18n

New `facilityLocations` namespace added to **all four** admin-portal catalogs
(`apps/admin-portal/messages/{en,ar,prs,ps}.json`), consumed via
`useTranslations('facilityLocations')`. Keys (indicative): `title`, `add`,
`searchPlaceholder`, `colName`, `colKind`, `colPrimary`, `colStatus`,
`kindStore`/`kindRoom`/`kindFridge`/`kindCabinet`/`kindOther`, `primary`,
`setPrimary`, `active`, `inactive`, `deactivate`, `reactivate`, `edit`,
`fieldName`, `fieldKind`, `fieldPrimary`, `save`, `cancel`, `saveError`,
`empty`, `emptyDescription`, `loading`, `cannotDeactivatePrimary`. Identical key
sets across the four locales; **ar** Modern Standard Arabic, **prs** Dari, **ps**
genuine Pashto (not Arabic-copied).

## Error handling & edge cases

- **`facilityId` null in the JWT** → `listForFacility` hard-`FORBIDDEN`
  (`MISSING_FACILITY_CONTEXT`); never falls back to unscoped rows.
- **First location** is forced primary; a facility therefore never has
  sub-locations without exactly one primary.
- **Cannot deactivate / un-primary the primary** → `BAD_REQUEST` with a
  machine-readable code the admin UI maps to `cannotDeactivatePrimary`.
- **Duplicate primary race** → the partial unique index is the DB backstop; the
  service clears the old primary in the same request path.
- **Unknown `facilityId`** on admin CRUD → `NOT_FOUND`.
- **Non-admin** calling admin procedures → `FORBIDDEN` via `adminProcedure`.
- **No PHI:** sub-location names/kinds are operational facility layout data, not
  patient data — safe in logs/errors. (Rule #1 still forbids logging patient data
  generally; nothing here touches it.)

## Testing

- **Hub router tests** (`apps/hub-api`, mirroring existing router test setup):
  - `listForFacility` returns only the caller's facility rows (active+inactive,
    ordered) and hard-`FORBIDDEN`s when `ctx.user.facilityId` is null.
  - `create` forces the first row primary; a second `create` with
    `isPrimary:true` moves the primary (old one cleared; exactly one primary).
  - `update({isPrimary:true})` reassigns primary; `update({isPrimary:false})` on
    the sole primary is rejected.
  - `setActive` rejects deactivating the primary; allows reactivation.
  - `adminProcedure` rejects a non-ADMIN caller; unknown `facilityId` → NOT_FOUND.
  - Partial-unique-index invariant: never more than one `is_primary` per facility
    after any sequence of the above.
- **admin-portal page test** (Vitest + Testing Library, mirroring existing
  page tests): renders the list, opens the add Dialog and calls `create`, the
  edit Dialog calls `update`, the toggle calls `setActive`, "Set primary" calls
  `update({isPrimary:true})`, empty state shows when none.
- **i18n parity**: deterministic 4-locale key-set parity for the
  `facilityLocations` namespace; Pashto values differ from Arabic/English.

## FHIR alignment note

`facility_locations` corresponds to FHIR R4 `Location` with `partOf` referencing
the facility's `Location`/`Organization`, `physicalType` ≈ `kind`
(`si`/`ro`/`co`…), and `status` ≈ `isActive`. The codebase's pharmacy types are
deliberately *not* strict-FHIR (they are pragmatic app interfaces), so SP1a
follows suit and records the correspondence here rather than importing the full
FHIR `Location` shape. A future FHIR-export layer can map `FacilityLocation` →
`Location` losslessly.

## Out of scope (later sub-projects / explicitly excluded)

- **SP1b (pharmacy-lite spoke):** pulling `facility_locations` into a local
  read-only `stockLocations` Dexie cache; the current-sub-location context +
  shell selector; tagging writes (goods-receipt, transfers, adjustments) with the
  selected sub-location instead of `'default'`; reconciling legacy `'default'`
  batches onto the facility's primary sub-location. SP1b consumes
  `listForFacility` — that contract is frozen by this spec.
- **SP2 / SP3:** location-scoped stock views and location-aware reorder.
- **`zoneId`:** the finer intra-sub-location level stays a stub, untouched.
- **Multiple facilities per org / tenancy:** no org↔facility linkage, no
  multi-facility JWT/RLS. One facility per JWT stands.
- **Deleting sub-locations:** SP1a supports deactivate (`is_active=false`), not
  hard delete (batches may reference a retired sub-location).
- **Auditing admin sub-location CRUD:** consistent with existing
  `pharmacy_facilities` admin CRUD (not audited); can be added later if the Hub
  adds admin-config auditing broadly.

## Affected files (indicative)

- `supabase/migrations/061_facility_locations.sql` (new) — table, indexes,
  constraint, RLS, trigger.
- `packages/shared-types/src/fhir/drug-catalog.ts` — `FacilityLocation` +
  `FacilityLocationKind`.
- `apps/hub-api/src/trpc/routers/facility-locations.ts` (new) — the router.
- `apps/hub-api/src/trpc/routers/_app.ts` — register `facilityLocations`.
- `apps/admin-portal/src/components/pharmacies/FacilityLocationsManager.tsx` (new).
- `apps/admin-portal/src/app/[locale]/pharmacies/[facilityId]/locations/page.tsx` (new).
- `apps/admin-portal/src/components/pharmacies/PharmacyManager.tsx` — "Manage
  locations" row action.
- `apps/admin-portal/src/lib/route-map.ts` — breadcrumb labels.
- `apps/admin-portal/messages/{en,ar,prs,ps}.json` — `facilityLocations` namespace.
- Tests: hub-api router test, admin-portal page test.
