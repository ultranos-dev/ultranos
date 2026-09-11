# Pharmacy Directory & Prescription Pharmacy Picker — Design

Date: 2026-09-10
Status: Draft for review
Apps touched: `hub-api`, `admin-portal`, `opd-lite`, `shared-types`, DB migration

## 1. Goal

Let a doctor optionally choose a **preferred pharmacy** to send a prescription
to, via a search-as-you-type dropdown in the OPD-Lite prescription section, and
give platform admins a way to **manage the pharmacy directory** that feeds it.

Two connected halves, built in two phases:

- **Phase 1 — Directory (producer):** admin-portal CRUD for pharmacies, backed
  by new Hub endpoints, writing the existing `pharmacy_facilities` table.
- **Phase 2 — Picker (consumer):** OPD-Lite offline-capable pharmacy search that
  reads the directory and records the chosen pharmacy on the prescription as a
  non-binding hint.

## 2. Locked decisions (from brainstorming)

1. **Offline-capable** picker: a synced Dexie mirror + Fuse.js fallback, online
   path hits the Hub. (Selection is optional, so prescribing still works with an
   empty/cold mirror — never blocked.)
2. **Non-binding preference:** the chosen pharmacy is stored on the prescription
   as `dispenseRequest.performer`. It does **not** restrict dispensing — any
   pharmacy can still fill it. No change to how pharmacy-lite pulls prescriptions.
3. **Search by name + address/region text.** Rows show name, address,
   province/district, facility type. No distance/geo sorting (no clinic/patient
   lat-lng source in OPD-Lite today).
4. **Picker UI is its own section** in `PrescriptionEntry`, above the "Add
   Prescription" button.
5. **Admin CRUD is in scope** (this project), so admin-created pharmacies feed
   the picker end to end.

## 3. Ground truth (verified 2026-09-10)

- `pharmacy_facilities` exists (migration 034): `id uuid`, `name text`,
  `latitude/longitude double NOT NULL`, `address text?`, `province text?`,
  `district text?`, `facility_type text NOT NULL` (pharmacy | clinic | hospital),
  `is_active bool NOT NULL`, `created_at`, `updated_at`. **No org/tenant column →
  global directory. Table is empty (0 rows).**
- No endpoint inserts into `pharmacy_facilities` today; only a read-only JOIN in
  `drugCatalog.getPrices`. Admin-portal's location switcher lists **labs only**.
- Hub admin writes use `adminProcedure` (`role === 'ADMIN'`); `createLab` is the
  model to mirror for `createPharmacy`.
- Reference-data sync precedent: `drug-catalog-sync.ts` (`syncDrugCatalog()` —
  online-gated, single-flight, 15-min throttle) wired in `SyncProvider`.
- FHIR `DispenseRequestSchema` has no `performer` field yet; the medication
  mapper writes only `expectedSupplyDuration`.

## 4. Scope decisions & assumptions (please confirm on review)

- **A. Global directory, ADMIN-managed.** Pharmacies are global (no tenancy).
  CRUD is gated by the existing `ADMIN` role. (If pharmacies should later be
  tenant-scoped, that's a separate migration — out of scope here.)
- **B. Facility type.** This feature manages and searches **`facility_type =
  'pharmacy'`** only. Clinics/hospitals are out of scope for both the admin page
  and the picker.
- **C. Lat/long are required** by the table (NOT NULL). The admin create form
  captures them as numeric inputs (manual entry). A map-based picker is a future
  enhancement, not in scope.
- **D. Performer reference format:** `dispenseRequest.performer = { reference:
  "Organization/<facilityId>", display: <pharmacyName> }` (FHIR performer is a
  Reference(Organization)). No PHI.
- **E. Sync cadence** for the pharmacy mirror reuses the drug-catalog approach
  (on sign-in + throttled), independent throttle key.
- **F. A small seed** (~8 real pharmacies across provinces) ships so the picker
  and admin list aren't empty on first run; thereafter admins own the data.

## 5. Architecture

### 5.1 Shared types (`packages/shared-types/src/fhir/drug-catalog.ts`)

- Extend `PharmacyFacility` with optional `province?`, `district?`,
  `facilityType?`, `isActive?` (all optional — existing consumers unaffected).
- Add a lightweight directory/search result type:

```ts
export interface PharmacyDirectoryEntry {
  id: string
  name: string
  address?: string
  province?: string
  district?: string
  facilityType: 'pharmacy' | 'clinic' | 'hospital'
  updatedAt?: string   // ISO; sync watermark
}
```

### 5.2 FHIR schema (`packages/shared-types/src/fhir/medication-request.schema.ts`)

- Add `performer: ReferenceSchema.optional()` to `DispenseRequestSchema`.
  Backward-compatible; existing prescriptions/tests unaffected.

### 5.3 Hub API — new `pharmacy` router (`apps/hub-api/src/trpc/routers/pharmacy.ts`)

Registered in the app router. Reads/writes `pharmacy_facilities`.

Consumer procedures (any authenticated clinical user — `protectedProcedure`):
- `search({ q: string(1..100), limit=20 }) -> PharmacyDirectoryEntry[]`
  ILIKE over `name/address/province/district`, `is_active = true`,
  `facility_type = 'pharmacy'`. Mirrors `drugCatalog.search`.
- `sync({ since?: string ISO, limit=500 }) -> { pharmacies: PharmacyDirectoryEntry[]; latestUpdatedAt: string | null }`
  Active pharmacies with `updated_at > since` (or all if `since` omitted),
  ordered by `updated_at`. Incremental watermark = `updated_at`.

Admin procedures (`adminProcedure`, `role === 'ADMIN'`):
- `listForAdmin({ cursor, limit, q? }) -> { pharmacies: PharmacyFacility[]; nextCursor }`
  (includes inactive; full fields for management).
- `create({ name, latitude, longitude, address?, province?, district? }) -> PharmacyFacility`
  (facility_type fixed to `'pharmacy'`, is_active defaults true).
- `update({ id, ...editableFields }) -> PharmacyFacility`.
- `setActive({ id, isActive }) -> PharmacyFacility` (deactivate/reactivate;
  soft-delete — never hard-delete, to preserve references from prescriptions).

Validation via zod (name non-empty; lat ∈ [-90,90]; long ∈ [-180,180]).

### 5.4 Admin-portal — Pharmacy management (`apps/admin-portal`)

- New page `src/app/[locale]/pharmacies/page.tsx` + sidebar entry, following the
  existing list-page layout standard (standalone h1, one toolbar row with search
  + "Add pharmacy" folded into the end, one content box/table). Mirrors the labs
  admin screens.
- Table columns: name, province/district, address, active badge; row action to
  edit / toggle active.
- Create/Edit dialog (ui-kit `Dialog`): name, province, district, address,
  latitude, longitude, active toggle. Client validation mirrors the zod schema.
- Data via the new `pharmacy.listForAdmin/create/update/setActive` procedures.
- i18n keys added for the page/dialog/labels.

### 5.5 OPD-Lite — offline mirror + sync

- Dexie: new table `pharmaciesMirror: EntityTable<PharmacyDirectoryEntry,'id'>`
  at a new schema version, indexed on `name` (and `province`). Added to
  `PRESERVE_TABLES` in `phi-cleanup.ts` (non-PHI reference data) and to the
  `drug-catalog-mirror-schema` coverage expectations.
- `src/lib/pharmacy-sync.ts`: `syncPharmacyDirectory()` — online-gated,
  single-flight, throttled (own cursor key), pulls `pharmacy.sync` since the
  stored `latestUpdatedAt` into `pharmaciesMirror`. Wired into `SyncProvider`
  alongside `syncDrugCatalog`.

### 5.6 OPD-Lite — search (`src/lib/pharmacy-search.ts`)

`searchPharmacies(query, signal?) -> PharmacyDirectoryEntry[]`, same structure as
`medication-search.ts`:
- Online: Hub `pharmacy.search`.
- Offline / Hub failure: Fuse.js over `pharmaciesMirror` (keys: name, address,
  province, district), capped ~20.
- `< 2 chars` returns `[]`.

### 5.7 OPD-Lite — PrescriptionEntry UI

- Add `pharmacyId?`, `pharmacyName?` to `PrescriptionFormData` (+
  `EMPTY_PRESCRIPTION_FORM`).
- New **"Pharmacy (optional)"** section rendered **above the "Add Prescription"
  button**: a combobox reusing the medication-search autocomplete pattern
  (debounced query, listbox, keyboard nav, blur-close). Rows show
  `name` + `address · province/district · facilityType`. A selected pharmacy
  shows as a chip with a clear (×) control to unset.
- Selecting sets `pharmacyId`/`pharmacyName`; clearing unsets them. Purely
  optional — never gates submit.

### 5.8 OPD-Lite — mapper (`medication-request-mapper.ts`)

- When `form.pharmacyId` is set, write
  `dispenseRequest.performer = { reference: "Organization/"+pharmacyId, display: pharmacyName }`.
- Add a `readPerformerFromDispenseRequest(rx)` helper (symmetry with
  `readBrandFromCoding`) for display surfaces (e.g. pending list can show the
  chosen pharmacy). Rendering the pharmacy in the pending row is included.

## 6. Data flow

```
Admin: admin-portal Pharmacy page --create/update--> Hub pharmacy.create/update --> pharmacy_facilities
OPD sync: SyncProvider --> syncPharmacyDirectory() --> Hub pharmacy.sync --> pharmaciesMirror (Dexie)
OPD search: doctor types --> searchPharmacies() --> Hub pharmacy.search (online) | Fuse(pharmaciesMirror) (offline)
OPD save: form.pharmacyId --> mapper --> MedicationRequest.dispenseRequest.performer (hint)
```

## 7. Offline / error handling

- Picker is optional and non-blocking; prescription saves with no pharmacy.
- Offline with a cold/empty mirror → picker shows an empty "no pharmacies
  available offline" state; does not block.
- Sync failure is non-fatal (mirror stays at last state), matching the
  drug-catalog sync behaviour.

## 8. Security / PHI

- Pharmacy directory is public reference data — **no PHI**. Search/sync need no
  audit event. Admin CRUD is ADMIN-gated and may reuse existing admin audit if
  present (mutations only).
- `performer` is an Organization reference + display name — no patient data.

## 9. Testing (TDD)

- Hub: `pharmacy.search` (matches name/address/province, filters inactive &
  non-pharmacy), `pharmacy.sync` (watermark), `create/update/setActive`
  (validation, ADMIN gate).
- shared-types: `DispenseRequestSchema` accepts `performer`; still validates
  without it.
- opd-lite: `pharmacy-search` (online + offline Fuse fallback, <2 char guard);
  `pharmacy-sync` store adapter (upsert into mirror, watermark advance);
  `PrescriptionEntry` (selecting a pharmacy sets form fields; clear unsets;
  submit works with none); mapper (`performer` written when set, omitted when
  not); PHI-cleanup + mirror-schema coverage includes `pharmaciesMirror`.
- admin-portal: Pharmacy page renders list, create dialog submits to
  `pharmacy.create`, toggle active calls `setActive`.

## 10. Migration & seed

- Migration: because `search` uses `ILIKE '%q%'` (substring, not prefix),
  enable `pg_trgm` and add a **GIN trigram index** on `name` (and optionally a
  combined generated text column over `name || address || province || district`,
  matching the `brand_names_text` precedent in `drug_catalog`). No column
  changes to `pharmacy_facilities` otherwise.
- Seed migration: ~8 active `facility_type='pharmacy'` rows across provinces
  (Kabul, Herat, Mazar, Kandahar, …) with plausible coordinates. Idempotent
  (guard on name or fixed UUIDs).

## 11. Build phases / sequencing

- **Phase 1 (Directory):** shared-types + Hub `pharmacy` router (CRUD + search) +
  admin-portal page + migration/seed. Deliverable: admins manage pharmacies;
  search endpoint live.
- **Phase 2 (Picker):** FHIR `performer` + opd-lite mirror/sync/search +
  PrescriptionEntry section + mapper + pending-row display. Deliverable: doctors
  attach an optional pharmacy.

Phase 2 depends only on Phase 1's `pharmacy.search`/`sync` endpoints existing.

## 12. Out of scope

- Tenant-scoping of pharmacies; map-based location entry; distance/geo sorting;
  hard routing/enforcement of prescriptions to a pharmacy; managing clinics/
  hospitals; pharmacy-lite consuming the `performer` for filtering.
