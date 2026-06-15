# Pharmopedia — Plan 3: Standalone App Design

## Overview

A standalone Expo (React Native) app — `apps/pharmopedia/` — serving as an offline-first drug reference tool for all authenticated Ultranos roles. Content is role-tiered: patients see plain-language summaries, clinical staff see full pharmacological detail, pharmacists see formulary and pricing data.

This is Plan 3 in the Pharmopedia series:
- Plan 1 (complete): Hub API drug catalog service — tRPC endpoints, tier-scoped responses, sync, enrich, pricing
- Plan 2 (complete): ETL seed pipeline — `@ultranos/drug-catalog-etl`, WHO EML seed, OpenFDA/NLM/DrugBank adapters
- **Plan 3 (this spec)**: Pharmopedia standalone React Native app
- Plan 4 (future): OPD-Lite + Pharmacy-Lite integration

---

## Decisions

| Decision | Choice |
|----------|--------|
| App type | Standalone Expo app (`apps/pharmopedia/`) |
| Auth | Authenticated — OTP for patients, credentials for clinical staff |
| Roles | All roles — content scoped by tier |
| Offline | Full catalog sync on first launch; incremental thereafter |
| Navigation | expo-router (file-based) |
| Local DB | expo-sqlite with FTS5 virtual table |
| State | Zustand (auth-store + sync-store) |
| Search | FTS5 offline (INN name + brand names + ATC code + local names) |
| Brand name API fix | Generated column migration on `drug_catalog` in this plan |
| In-scope features | Search, Drug detail (4 inner tabs), Pricing (online-only), Enrich (role-gated) |

---

## Architecture

### Directory structure

```
apps/pharmopedia/
├── app/
│   ├── _layout.tsx               # Root layout: AuthGuard + font loading
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   └── login.tsx             # OTP (patient) or credentials (clinical staff)
│   ├── (tabs)/
│   │   ├── _layout.tsx           # 2-tab bar: Search + Profile
│   │   ├── index.tsx             # Search tab
│   │   └── profile.tsx           # Role badge, sync status, logout
│   └── drug/
│       └── [atcCode].tsx         # Drug detail screen (pushed from search results)
├── src/
│   ├── db/
│   │   ├── schema.ts             # CREATE TABLE + FTS5 DDL
│   │   ├── migrations.ts         # DB version management
│   │   ├── drug-catalog.ts       # CRUD queries (upsert, getByAtcCode)
│   │   └── fts.ts                # FTS5 MATCH search queries
│   ├── store/
│   │   ├── auth-store.ts         # Zustand: token (memory), user, role
│   │   └── sync-store.ts         # Zustand: syncStatus, lastVersion, lastSyncAt
│   ├── api/
│   │   ├── hub-fetch.ts          # Certificate-pinned fetch (copied from patient-lite-mobile)
│   │   └── drug-catalog.ts       # Manual tRPC-REST client for all drug catalog endpoints
│   ├── sync/
│   │   └── catalog-sync.ts       # Sync orchestrator: initial (blocking) + incremental (background)
│   └── components/
│       ├── SearchBar.tsx          # Debounced input + language selector
│       ├── SyncStatusBanner.tsx   # Reads sync-store; shows syncing/cached/offline strip
│       ├── DrugCard.tsx           # List item: INN name, ATC code, dose forms, class
│       ├── PriceCard.tsx          # Pharmacy name, distance, retail price, stock signal
│       ├── RoleBadge.tsx          # Colored role pill
│       └── DrugDetail/
│           ├── OverviewTab.tsx    # Tier 1 fields (all roles)
│           ├── ClinicalTab.tsx    # Tier 2 fields (clinical + pharmacist only)
│           ├── PricingTab.tsx     # getPrices + GPS (all roles, online-only)
│           └── EnrichTab.tsx      # enrich form, role-gated fields
├── package.json                  # Expo ~52, expo-router, expo-sqlite, zustand, i18next
└── app.config.ts
```

---

## Navigation

expo-router file-based routing. Screens are files; deep links are free.

**Root `_layout.tsx`**: Checks auth-store for a valid token. No token → redirect to `(auth)/login`. Token present → render `(tabs)`.

**`(auth)/login.tsx`**: Two flows on one screen, toggled by a segmented control:
- Patient: phone number → OTP → token
- Clinical staff: username + password → token (+ TOTP prompt if MFA is enabled)
Token stored in auth-store memory only — never written to AsyncStorage.

**`(tabs)/index.tsx` — Search tab**: SearchBar at top, SyncStatusBanner below it, DrugCard list beneath. FTS5 offline search when synced; falls back to `drugCatalog.search` API before first sync completes.

**`(tabs)/profile.tsx` — Profile tab**: Role badge, facility name (if applicable), last-synced timestamp, manual "Sync now" button, language preference selector (EN / Dari / Pashto), logout button (clears token + wipes `drug_catalog` and `sync_meta`).

**`drug/[atcCode].tsx` — Drug detail**: Pushed from search results. Header shows INN name, ATC code, therapeutic class. Inner tabs rendered conditionally by role:

| Tab | Visible to |
|-----|-----------|
| Overview | All roles |
| Clinical | DOCTOR, NURSE, LAB_TECH, PHARMACIST, ADMIN |
| Pricing | All roles (online-only; shows offline warning if no network) |
| Enrich | DOCTOR, NURSE, LAB_TECH, PHARMACIST, ADMIN |

---

## Data Layer

### SQLite schema (`src/db/schema.ts`)

**`drug_catalog` table**
```sql
CREATE TABLE IF NOT EXISTS drug_catalog (
  atc_code        TEXT PRIMARY KEY,
  inn_name        TEXT NOT NULL,
  brand_names     TEXT,          -- JSON array
  dose_forms      TEXT,          -- JSON array
  therapeutic_class TEXT,
  local_names     TEXT,          -- JSON object {en, prs, ps}
  tier1_json      TEXT NOT NULL, -- full DrugEntryTier1 payload as JSON
  tier2_json      TEXT,          -- DrugEntryTier2 payload; NULL for PATIENT role
  tier3_json      TEXT,          -- DrugEntryTier3 payload; NULL for non-pharmacist
  version         INTEGER NOT NULL
);
```

**`drug_catalog_fts` FTS5 virtual table**
```sql
CREATE VIRTUAL TABLE IF NOT EXISTS drug_catalog_fts USING fts5(
  inn_name,
  atc_code,
  brand_names_flat,    -- brand_names JSON array joined as space-separated text
  local_names_flat,    -- local_names JSON values joined as space-separated text
  content='drug_catalog',
  content_rowid='rowid'
);
```

FTS triggers keep `drug_catalog_fts` in sync with inserts/updates/deletes on `drug_catalog`.

**`sync_meta` table**
```sql
CREATE TABLE IF NOT EXISTS sync_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- Keys: 'lastVersion' (integer string), 'lastSyncAt' (ISO 8601)
```

### Tier payload storage strategy

Each row stores the full tier-scoped JSON payload returned by the Hub API at sync time. The app never re-scopes data locally — it trusts the server's tier enforcement. `tier2_json` and `tier3_json` are NULL when the server doesn't include that tier for the user's role. If a user's role changes, logout clears the local DB and a fresh sync repopulates with the new tier payloads.

### Sync flow (`src/sync/catalog-sync.ts`)

1. App foregrounds → check network availability
2. Read `lastVersion` from `sync_meta` (default 0 if first run)
3. Loop: call `drugCatalog.sync({ sinceVersion: lastVersion, limit: 200 })`
4. For each page: upsert rows into `drug_catalog`; rebuild FTS content via triggers
5. Save `latestVersion` to `sync_meta`
6. Repeat until `entries.length === 0`

**First run**: blocking with a progress bar on a splash-like screen. User cannot navigate until initial sync completes (or they explicitly skip — shown a "Offline mode" warning).

**Subsequent runs**: background, non-blocking. `SyncStatusBanner` shows status.

Sync state (status: `'idle' | 'syncing' | 'error'`, `lastSyncAt`) held in zustand `sync-store`.

---

## API Client

### `src/api/hub-fetch.ts`

Copied verbatim from `apps/patient-lite-mobile/src/lib/hub-fetch.ts`. Certificate-pinned fetch wrapper. Injects `Authorization: Bearer <token>` header from auth-store. Base URL from `process.env.EXPO_PUBLIC_HUB_API_URL`.

### `src/api/drug-catalog.ts`

Manual tRPC-REST client following the same pattern as Patient Lite Mobile's API clients.

```typescript
search(q: string, lang: 'en' | 'prs' | 'ps', limit?: number): Promise<DrugSearchResult[]>
getByAtcCode(atcCode: string): Promise<DrugEntryTier1 | DrugEntryTier2 | DrugEntryTier3>
sync(sinceVersion: number, limit?: number): Promise<{ entries: DrugEntry[], latestVersion: number }>
getPrices(atcCode: string, lat: number, lng: number, sort?: 'distance' | 'price', limit?: number): Promise<PharmacyPrice[]>
enrich(atcCode: string, fields: EnrichFields): Promise<DrugEntryTier1 | DrugEntryTier2 | DrugEntryTier3>
```

All functions call `hubFetch` with the appropriate tRPC URL pattern: GET for queries, POST for mutations.

---

## State Management

### `src/store/auth-store.ts` (zustand)

```typescript
{
  token: string | null      // memory only — never persisted
  user: { sub: string, role: string, facilityId?: string } | null
  login(credentials): Promise<void>
  logout(): void            // clears token + wipes drug_catalog AND sync_meta (so lastVersion resets for next login)
  refreshToken(): Promise<void>
}
```

### `src/store/sync-store.ts` (zustand)

```typescript
{
  status: 'idle' | 'syncing' | 'error'
  lastSyncAt: string | null   // ISO 8601
  lastVersion: number
  setStatus(s): void
  setLastSync(version: number, at: string): void
}
```

---

## Screen: Drug Detail

Data source priority:
1. Local SQLite — always checked first
2. `drugCatalog.getByAtcCode` API — called if not in local DB (first run) or if online

**OverviewTab** (Tier 1): `summaryPlain`, `usedFor`, `commonSideEffects`, `whenToSeekHelp`, `storageInstructions`, `pregnancySummaryPlain`, `warningsSummaryPlain`. All fields localized by selected language.

**ClinicalTab** (Tier 2): `mechanismOfAction`, `indicationsClinical`, `adultDosing`, `pediatricDosing`, `renalAdjustment`, `adverseEvents`, `contraindications`, `interactions`, `pregnancyCategory`, `pharmacokinetics`.

**PricingTab**: Calls `drugCatalog.getPrices` with device GPS coordinates. Displays `PriceCard` list sortable by distance or price. Shows explicit "Interaction check unavailable" pattern for offline state — never silently shows empty results.

**EnrichTab** (role-gated):
- DOCTOR / NURSE / LAB_TECH: `localNames` field only
- PHARMACIST / ADMIN: `localNames` + `dispensingNotes` + `formularyStatus` + `unitCost`
- On successful mutation: updates the local SQLite row optimistically

---

## Hub API + DB Changes (in scope for Plan 3)

### 1. Supabase migration — `brand_names_text` generated column

```sql
ALTER TABLE drug_catalog
  ADD COLUMN brand_names_text TEXT
  GENERATED ALWAYS AS (array_to_string(brand_names, ' ')) STORED;

-- pg_trgm extension required (already enabled in Supabase); trigram index supports ILIKE
CREATE INDEX idx_drug_catalog_brand_names_trgm
  ON drug_catalog USING gin(brand_names_text gin_trgm_ops);
```

This unblocks brand name search via the API (pre-sync fallback path).

### 2. Update `drugCatalog.search` router

Add `brand_names_text.ilike.${likeQ}` to the PostgREST `.or()` filter:

```typescript
.or([
  `inn_name.ilike.${likeQ}`,
  `atc_code.ilike.${likeQ}`,
  `local_names::text.ilike.${likeQ}`,
  `brand_names_text.ilike.${likeQ}`,   // new
].join(','))
```

---

## Tech Stack

- Expo ~52.0
- expo-router ~4.x (file-based navigation, bundled with Expo SDK 52)
- expo-sqlite (FTS5 virtual tables)
- zustand ~5.x
- i18next + react-i18next (EN / Dari / Pashto)
- `@ultranos/shared-types` (DrugEntryTier1/2/3, PharmacyPrice, DrugSearchResult)

---

## Testing

- `src/db/`: unit tests for schema migrations, FTS5 queries (insert a row → search by brand name → assert match)
- `src/sync/`: unit tests with mocked `drug-catalog` API client — initial sync pagination loop, incremental sync, error handling
- `src/api/drug-catalog.ts`: unit tests with mocked `hubFetch` — verify correct URL construction for each endpoint
- `src/store/auth-store.ts`: unit tests for login/logout flow (logout must clear SQLite)
- Drug detail screen: snapshot tests confirming Clinical + Enrich tabs hidden for PATIENT role
- EnrichTab: unit tests for role-gated field visibility (DOCTOR vs PHARMACIST vs PATIENT)
- PricingTab: test that offline state shows explicit warning, never empty results
