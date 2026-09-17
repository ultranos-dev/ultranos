# Enterprise Facility Profiles — Admin Portal (Design Spec)

**Date:** 2026-09-15
**Status:** Draft for review (rev 2 — org-scoped three-entity model)
**Module:** admin-portal, hub-api, shared-types, database
**Author:** Brainstorming session (Ultranos Dev)

---

## 1. Background & Goal

The **Admin Portal is the org admin's console** — the person who runs an
**organization** (one client) manages all of that org's facilities from here.
An organization operates **many facilities of three kinds**, each a **tenant of a
different spoke app**:

| Facility kind | Spoke app | DB table (target) | Today |
|---|---|---|---|
| **Clinic / Hospital** (incl. OPD) | **OPD-Lite** | `clinical_facilities` (**NEW**) | No table, no section |
| **Pharmacy** | **Pharmacy-Lite** | `pharmacy_facilities` | List + basic add modal; no `org_id` |
| **Lab** | **Lab-Lite** | `labs` | List + detail/create **pages**; has `org_id` |

Each kind must be a **separate, org-scoped section with its own workflow**
(exactly as Labs work today) — **not** conflated into a single generic table.
They **share** the enterprise-profile UI building blocks and field conventions.

**Goal of this work (all phases):** turn each facility kind into an
**enterprise-grade profile** with full CRUD, a click-a-row **profile modal**,
live Google Maps/ratings, staff assignment, and lifecycle — all scoped to the
admin's organization.

### Data-model ground truth (verified)

- `organizations` = the client/tenant (billing, subscription, status, timezone).
- `encounters.org_id → organizations`, `practitioners.org_id → organizations`,
  `labs.org_id → organizations` — clinical data & staff are **org-scoped**.
- `pharmacy_facilities` holds **only pharmacies today** (8 rows) and has **no
  `org_id`**. `facility_locations` are inventory sub-locations under a pharmacy.
- **No** `clinical_facilities` / `clinics` / `hospitals` table exists yet.
- The admin JWT carries `orgId` (and a loose `facility_id` claim).

**Cardinality:** `organization (1) → many clinical_facilities`, `→ many
pharmacy_facilities`, `→ many labs`. One org, many facilities per kind.

---

## 2. Phasing (this spec = Phase 1 only)

Each phase is its own spec → plan → implement cycle. Google is **last** (blocked
on `GOOGLE_PLACES_API_KEY`, provided later).

| Phase | Scope |
|---|---|
| **P1 (THIS SPEC)** | New `clinical_facilities` table + **Clinics & Hospitals** section. Enterprise-profile enrichment for all three kinds. Create/edit/detail **modals**; row-click → profile modal; soft-delete/archive. **Org-scoping** of all admin queries; add `org_id` to `pharmacy_facilities`. Google columns added but unpopulated (UI degrades gracefully). Staff & approval workflow **not** yet. |
| **P2** | **Staff subsystem** for clinical facilities and pharmacies — `clinical_facility_staff` + `pharmacy_staff` tables (mirroring `lab_technicians`), roles, generalized `AssignStaffModal`, staff section in each profile. (Labs already have staff.) This delivers "assign staff to them." |
| **P3** | **Approval/status workflow** + status-history for clinical facilities and pharmacies (approve/suspend/reactivate), matching labs. |
| **P4** | **Live Google Places** — server-side proxy using `GOOGLE_PLACES_API_KEY`, cached rating/reviews/hours, "last synced" + refresh, offline-safe, for all three kinds. |

> The **Clinics & Hospitals section ships in P1** (add/edit/profile/CRUD).
> **Staff assignment** for it (and for pharmacies) lands in **P2**. Called out so
> the increment is explicit: P1 = "add & manage the facilities", P2 = "assign
> staff to them".

---

## 3. Architecture Overview

Three **parallel** managers/routers/tables, one shared primitive layer:

```
organizations (client / tenant)
   ├── clinical_facilities   ──► Clinics & Hospitals section  ──► clinicalFacilityRouter
   ├── pharmacy_facilities    ──► Pharmacies section           ──► pharmacyRouter (admin CRUD)
   └── labs                   ──► Labs section                 ──► admin.* lab procedures

shared:  enterprise field set (zod) · profile UI primitives · CRUD helper factory
```

- **No single generic "facility" table.** Each kind keeps its own table so the
  sections evolve independently (clinics have departments/beds/OPD services;
  pharmacies have delivery/insurance; labs have test menus/TAT).
- **Shared, not duplicated, at the seams:** a common zod `enterpriseProfileFields`
  fragment, a common `crudHelpers` factory (list/get/create/update/archive/restore
  parameterized by table + type), and shared React profile primitives.
- **Every admin query is org-scoped** to `ctx.user.orgId`.

---

## 4. Data Model Changes

All new columns nullable / safe-defaulted. Migrations via Supabase MCP
(`apply_migration`), split into reviewable units. Regenerate TS types after.

### 4.0 Shared enterprise field set (applies to all three tables)

Identity: `logo_url`, `description`, `license_ref`†, `registration_authority`,
`established_year`.
Contact: `phone`, `alt_phone`, `email`, `website`, `whatsapp`.
Location: `address`, `province`, `district`, `city`, `postal_code`, `country`,
`latitude`, `longitude` (nullable).
Contact person: `contact_person_name`, `contact_person_role`,
`contact_person_phone`.
Operations: `opening_hours` (jsonb), `timezone`, `is_24_7` (bool).
Google (added now, populated in P4): `google_place_id`, `google_maps_url`,
`google_rating` numeric(2,1), `google_review_count` int, `google_hours` jsonb,
`google_last_synced_at` timestamptz.
Lifecycle: `archived_at` timestamptz (soft delete).

† `labs` already has `license_ref`/`accreditation_ref`; don't duplicate.

### 4.1 NEW `clinical_facilities` table

```
id                uuid pk default gen_random_uuid()
org_id            uuid NOT NULL references organizations(id)
name              text NOT NULL
facility_type     text NOT NULL check in ('clinic','hospital','opd')
is_active         boolean NOT NULL default true
created_at        timestamptz NOT NULL default now()
updated_at        timestamptz NOT NULL default now()
-- + all shared enterprise fields (4.0)
-- clinical-specific:
bed_count             int                 -- hospitals
departments           text[]              -- e.g. Cardiology, Pediatrics
specialties           text[]              -- OPD/clinic specialties
emergency_services    boolean default false
```
Index: `(org_id, facility_type)`, `(org_id) where archived_at is null`.
RLS: org-scoped (mirror `labs` policies — verify via advisors).

### 4.2 `pharmacy_facilities` — add `org_id` + enterprise fields

- **Add `org_id uuid references organizations(id)`** — **nullable** (existing 8
  rows have no org). See **D7** for how the admin list treats null-org rows.
- Add all shared enterprise fields (4.0) not already present, plus pharmacy-
  specific: `has_delivery` (bool), `accepts_insurance` (bool).
- Add `'opd'`? **No** — OPD is a clinical facility, not a pharmacy. The
  `facility_type` check on this table stays `pharmacy | clinic | hospital` (or is
  narrowed to `pharmacy`; leave as-is to avoid churn — this table is pharmacies).
- **Drop `NOT NULL`** on `latitude`/`longitude` (facilities may be created before
  coordinates exist). Mappers must tolerate null coords.

### 4.3 `labs` — add enterprise fields

Add shared enterprise fields (4.0) not already present (labs currently have **no**
contact/address fields), plus lab-specific: `specialties` text[] (test menu),
`turnaround_time_hours` int, `home_collection` bool, `sample_collection` bool,
`cap_accredited` bool. Add `'ARCHIVED'` to `labs_status_check`
(PENDING/ACTIVE/SUSPENDED/REVOKED → + ARCHIVED) for soft-delete; archiving writes
a `lab_status_history` row.

### 4.4 Data-modeling decision (discrete columns vs JSONB)

**Chosen: discrete typed columns** (matches existing tables), `jsonb` only for
`opening_hours`/`google_hours`, `text[]` for tag lists. Rationale: type-safety,
queryability (filter by city/rating), DB validation, clean generated types.

---

## 5. Backend API Design (hub-api / tRPC)

**Org-scoping rule:** every admin list/get/mutation filters/sets
`org_id = ctx.user.orgId`. `get`/`update`/`archive` must verify the target row
belongs to the caller's org (404 otherwise) — prevents cross-org access.

### 5.1 Shared CRUD helper factory

A `makeFacilityCrud({ table, typeColumn, typeValues })` helper in hub-api
generates org-scoped `list / getDetail / create / update / archive / restore`
against a given table, so the three routers don't duplicate logic. Each router
adds its entity-specific fields/validation and audit `resourceType`.

### 5.2 New `clinicalFacilityRouter` (`routers/clinical-facility.ts`)

Admin-only, org-scoped. Procedures: `listForAdmin({ facilityTypes?, cursor,
limit, q?, includeArchived? })`, `getDetail({ id })`, `create({ facilityType,
...fields })`, `update({ id, ...fields })`, `archive({ id })`, `restore({ id })`,
`setActive({ id, isActive })`. `create` sets `org_id = ctx.user.orgId`. Audit
`resourceType='CLINICAL_FACILITY'` on mutations. Register in root `_app.ts`.

### 5.3 `pharmacyRouter` — org-scope admin CRUD + enrichment

- Keep pharmacy-facing `search`/`sync` (patient/pharmacy directory). **Decision
  D7** governs whether these stay cross-org or become org-scoped; default: leave
  directory search as-is, org-scope only the **admin** procedures.
- `listForAdmin` / `create` / `update` / `setActive`: **org-scope** them
  (`org_id = ctx.user.orgId`); accept the enterprise fields; add `getDetail`,
  `archive`, `restore`. Audit `resourceType='PHARMACY'`.

### 5.4 Lab procedures (`routers/admin.ts`) — enrichment

`createLab` (extend input with enterprise fields), `getLabDetail` (select new
columns), **`updateLab`** (new), **`archiveLab`** (new; status→ARCHIVED + history),
`listLabs` (exclude ARCHIVED unless `includeArchived`). `reviewLab` unchanged.
All already org-scoped via `org_id`.

### 5.5 Audit

Facilities are non-PHI, but mirror the existing `createLab` audit pattern: emit
CREATE/UPDATE/ARCHIVE/RESTORE events via `@ultranos/audit-logger`
(`resourceType` ∈ CLINICAL_FACILITY | PHARMACY | LAB) on every mutation. Reads
not audited. No PHI in logs.

---

## 6. Shared Types (`packages/shared-types`)

- `ClinicalFacilityType = 'clinic' | 'hospital' | 'opd'`.
- `ClinicalFacilityProfile`, `PharmacyProfile`, `LabProfile` interfaces (full
  enterprise shapes, camelCase, mapping snake_case columns).
- Keep `PharmacyDirectoryEntry` as-is for the patient directory.
- Rebuild the package so hub-api + admin-portal pick up the types. Reconcile with
  Supabase-generated types after migrations.

---

## 7. Frontend Architecture (admin-portal)

### 7.1 Shared profile primitives — `src/components/facilities/`

`LogoAvatar`, `StarRating` (Google rating; "—" when unpopulated pre-P4),
`MapLink` (hidden when no maps URL/coords), `HoursTable` (+ 24/7 badge),
`ProfileSection`/`ProfileField` (box idiom), `TagList` (services/specialties/
departments). Used by all three profile modals.

### 7.2 Per-kind manager + modals (three parallel, sharing primitives)

For each kind (**Clinical**, **Pharmacy**, **Lab**):
- **`<Kind>Manager`** — list page (OPD-Lite list-page standard: full-width `<h1>`,
  one toolbar row `search → filters → Add`, one content box). Toolbar gains
  **Include archived** toggle. Row-click → profile modal. Clinical & Pharmacy
  managers can be one **`FacilityManager`** component parameterized by
  `{ router, kind, columns, typeOptions, i18nNs }` since their CRUD shape is
  identical; Labs keeps a lab-specific manager (approval/status differences).
- **`<Kind>ProfileModal`** — read view (header: logo, name, type/status badges,
  rating; sections: Contact, Location+MapLink, Hours, Services/Specialties/
  Departments, Contact Person, Meta). Actions: Edit, Archive/Restore, and a
  P2-placeholder **Manage Staff**. Clinical adds beds/departments/emergency;
  Lab adds license/accreditation/test-menu/TAT + approval buttons (reviewLab).
- **`<Kind>FormModal`** — create + edit (sectioned form). `name` (+ lab
  `licenseRef`) required; rest optional. Google section read-only/hidden in P1.

### 7.3 Sections, routing, nav

- **Pharmacies** (`/pharmacies`): replace `PharmacyManager` with the shared
  `FacilityManager` (pharmacy config). Keep the "Manage Locations" action
  (`/pharmacies/[facilityId]/locations`).
- **Clinics & Hospitals** (NEW, `/clinics`): `FacilityManager` (clinical config,
  type column shows Clinic/Hospital/OPD). New nav item under **Operations**
  (icon `Hospital`).
- **Labs** (`/labs`): row-click opens `LabProfileModal`; Add opens `LabFormModal`
  (retire `/labs/create` page + its nav item). Keep `/labs/[labId]` and
  `/labs/[labId]/staff` pages, reachable from the modal (approval history + staff
  stay there in P1; unified in P2/P3). **(D3)**
- Icons (`Hospital`, `Star`, `MapPin`, `Clock`, `Phone`, `Globe`, `Stethoscope`)
  added to the ui-kit catalog if missing; import via `@ultranos/ui-kit/icons`.

### 7.4 Compliance

Semantic oklch tokens only, logical CSS props (RTL), `EmptyState` for empty/
loading, box idiom for cards, ui-kit imports for Button/Dialog/etc., list-page
standard for managers.

---

## 8. Soft-Delete UX

Delete = **Archive** (no hard deletes — healthcare, referential integrity, audit).
Clinical/pharmacy set `archived_at`; labs set `status='ARCHIVED'`. Default lists
exclude archived; an **Include archived** filter reveals them with an "Archived"
badge + **Restore**. Archive/Restore confirmed via Dialog (destructive styling).

---

## 9. Internationalization

New `clinics` message namespace; extend `pharmacies`/`labs` namespaces with new
field labels; add all keys to every locale file present in the admin-portal
messages dir (`en`, `ar`, `prs`, `ps`, …). No hardcoded user-facing strings.

---

## 10. Testing

- **hub-api (Vitest):** `clinicalFacilityRouter` (admin guard; **org-scoping** —
  cross-org get/update/archive returns 404; type filtering; includeArchived;
  create/update/archive/restore; audit emitted). Pharmacy admin CRUD org-scoping
  + enrichment. Lab `updateLab`/`archiveLab`/list-excludes-ARCHIVED. Shared
  `makeFacilityCrud` unit tests.
- **admin-portal (Vitest + Testing Library):** FormModal validation/submit;
  ProfileModal render/actions; FacilityManager row-click opens modal + archived
  toggle; Clinics section lists only clinical rows. Update existing
  `pharmacies.test.tsx`, `create-lab.test.tsx`, `lab-approval.test.tsx`.
- **RTL:** logical CSS props; parity assertions where admin tests already do.
- Run `pnpm typecheck` + affected suites; green before "done". Run `get_advisors`
  (security) after migrations to confirm RLS on the new table.

---

## 11. Decisions & Recommendations (flagged for review)

| # | Decision | Recommendation | Alternative |
|---|---|---|---|
| D1 | Clinics & Hospitals backing entity | **New org-scoped `clinical_facilities` table** (own section/workflow, `facility_type ∈ clinic/hospital/opd`). | Reuse `pharmacy_facilities` by type (rejected — user wants separation); Clinics = organizations (rejected — org is the tenant, not the facility). |
| D2 | OPD modeling | **Sub-type of `clinical_facilities`** (`facility_type='opd'`), same section. | Separate table/section for OPD. |
| D3 | Lab detail/staff pages | **Keep** pages in P1; modal is quick profile + entry point; unify in P2/P3. | Rebuild staff/approval in the modal now (larger P1). |
| D4 | Facility approval workflow | **Defer to P3**; P1 uses `is_active` + `archived_at`. | Add `status` + history to clinical/pharmacy in P1. |
| D5 | Router shape | **Three routers** sharing a `makeFacilityCrud` factory. | One generic router with a table param. |
| D6 | `pharmacy_facilities` rename | **Do not rename** (risk); it stays the pharmacy table. | Rename to `pharmacies`. |
| **D7** | **Pharmacy `org_id` + admin org-scoping** | **RESOLVED:** Add nullable `org_id`; org-scope admin CRUD. **Backfill the existing 8 pharmacies to "Default Organization"** (`61dae3ca-dafc-4e2a-a333-0308f0e93974`, slug `default`, ACTIVE) — the catch-all, not the real clinic/hospital orgs. Backfill target confirmable at migration execution. Keep patient directory `search`/`sync` cross-org. | Make pharmacies fully global (not org-scoped) — contradicts the org-tenant model. |
| D8 | Admin identity | **Admin Portal = org admin**; all admin queries scoped to `ctx.user.orgId`. | Platform super-admin (cross-org) — not the stated model. |

---

## 12. Risks & Open Questions

- **RESOLVED (D7):** existing 8 org-less pharmacies backfilled to "Default
  Organization" (`61dae3ca-dafc-4e2a-a333-0308f0e93974`) during the pharmacy
  migration.
- **OPD-Lite ↔ clinical_facility linkage:** OPD-Lite currently scopes clinical
  data to `org_id`, not to a specific clinical facility. If a clinic/hospital
  must map to a spoke tenant (facility_id claim), P2/P3 will need to define how an
  OPD-Lite install resolves to a `clinical_facilities` row (out of scope for P1,
  but noted so P1's schema anticipates it — `clinical_facilities.id` is the future
  facility identity).
- **Column volume:** ~30 nullable columns per table; split migrations per unit for
  reviewable rollback.
- **RLS:** add org-scoped RLS to `clinical_facilities` and (new) `org_id` on
  pharmacies; verify with `get_advisors` after applying.
- **Generated types:** regenerate Supabase types post-migration; reconcile with
  hand-written shared-types.
- **Out of scope for P1:** staff assignment (P2), approval/status workflow (P3),
  live Google API (P4).

---

## 13. Implementation Order (for the writing-plans step)

1. Migrations: create `clinical_facilities` (+RLS, indexes); add `org_id` +
   enterprise fields to `pharmacy_facilities` (drop lat/lng NOT NULL); add
   enterprise fields + `ARCHIVED` to `labs`. Regenerate types.
2. shared-types: `ClinicalFacilityType`, `*Profile` interfaces; rebuild.
3. hub-api: `makeFacilityCrud` helper; `clinicalFacilityRouter` (+register);
   org-scope + enrich pharmacy admin CRUD; lab `updateLab`/`archiveLab`; tests.
4. admin-portal: shared primitives → `FacilityManager` + `FacilityFormModal` +
   `FacilityProfileModal` (clinical + pharmacy) → Clinics & Hospitals section +
   nav → repoint Pharmacies → Lab modals + repoint Labs list → i18n → tests.
5. Typecheck + tests + `get_advisors`; manual smoke.
