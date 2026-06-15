# Pharmopedia — Architecture & Specification

**App:** `apps/pharmopedia/`
**Last updated:** 2026-06-13
**Branch:** `ux-v1.5`

---

## What Is Pharmopedia?

Pharmopedia is an offline-capable drug reference application for clinicians and patients operating in Afghanistan and the broader MENA/Central Asia region. It provides role-scoped drug information — from basic patient-safe overviews to full clinical and formulary details — in four languages (English, Dari, Pashto, Arabic).

The app is designed for low-connectivity environments: the full drug catalog syncs to an on-device SQLite database on first login and updates incrementally. All core workflows — search, browse, drug detail, bookmarks — function with zero network access after the initial sync.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Expo 52 (Expo Router 4, file-based routing) |
| **Language** | TypeScript |
| **UI** | React Native core components (no ShadCN — mobile app) |
| **Local DB** | expo-sqlite v2 (SQLite 3.x with FTS5 extension) |
| **State** | Zustand (auth, sync, language, bookmarks) |
| **Auth** | Supabase JS client (`persistSession: false, autoRefreshToken: false`) |
| **API** | tRPC-over-REST bridge to the Central Hub API |
| **i18n** | i18next + react-i18next (4 locales: en, prs, ps, ar) |
| **Security** | hubFetch — certificate-pinned, compromise-aware fetch wrapper |
| **Secure storage** | expo-secure-store (language preference persistence) |
| **Location** | expo-location (pharmacy pricing tab — nearest pharmacies) |
| **Deep links** | `pharmopedia://` custom URI scheme via Expo Router |
| **Testing** | Vitest + @testing-library/react-native (82 tests, 16 test files) |
| **Fonts** | `@expo-google-fonts/manrope` + `@expo-google-fonts/public-sans` (loaded in `_layout.tsx`) |
| **Design tokens** | `@ultranos/ui-kit/tokens.native` — shared JS token file for all React Native apps |

---

## Design Tokens

Pharmopedia uses a shared JS-based design token system, exported from `packages/ui-kit/src/tokens.native.ts`. This is the React Native equivalent of `tokens.css` (which is web-only and not usable in RN). **All colors, fonts, spacing, radius, and shadow values must come from this file — never use hardcoded hex values or raw style values in components.**

Import path:
```typescript
import { Colors, FontFamily, FontSize, Spacing, Radius, Shadow } from '@ultranos/ui-kit/tokens.native'
```

### Colors

| Export key | Value | Semantic role |
|---|---|---|
| `Colors.primary500` | `#2e9e71` | Ultranos Wise Green — buttons, active states, links |
| `Colors.primary400` | `#47b587` | Hover/lighter primary |
| `Colors.primary600` | `#1e7a55` | Pressed/darker primary |
| `Colors.primaryLight` | `#e8f7f2` | Primary tinted backgrounds |
| `Colors.danger` | `#dc2626` | Errors, CONTRAINDICATED severity |
| `Colors.dangerLight` | `#fee2e2` | Danger backgrounds |
| `Colors.dangerDark` | `#991b1b` | Danger text on light bg |
| `Colors.warning` | `#d97706` | Warnings, MAJOR severity |
| `Colors.warningLight` | `#fef3c7` | Warning backgrounds, recall cards |
| `Colors.warningDark` | `#92400e` | Warning text on light bg |
| `Colors.success` | `#16a34a` | Success states |
| `Colors.successLight` | `#dcfce7` | On-formulary badge background |
| `Colors.successDark` | `#166534` | On-formulary badge text |
| `Colors.neutral50–900` | various | Surface, text, border hierarchy |
| `Colors.white` | `#ffffff` | White |

### Font families

Fonts are registered in `app/_layout.tsx` via `useFonts()` using these exact names:

| `FontFamily` key | Registered name | Source package |
|---|---|---|
| `FontFamily.sans` | `'Manrope'` | `@expo-google-fonts/manrope` |
| `FontFamily.sansMedium` | `'Manrope-Medium'` | `@expo-google-fonts/manrope` |
| `FontFamily.sansSemibold` | `'Manrope-SemiBold'` | `@expo-google-fonts/manrope` |
| `FontFamily.sansBold` | `'Manrope-Bold'` | `@expo-google-fonts/manrope` |
| `FontFamily.heading` | `'PublicSans'` | `@expo-google-fonts/public-sans` |
| `FontFamily.headingBold` | `'PublicSans-Bold'` | `@expo-google-fonts/public-sans` |
| `FontFamily.arabic` | `'NotoNaskhArabic'` | bundled in app assets |

### Spacing, Radius, Shadow

```typescript
Spacing = { 1:4, 2:8, 3:12, 4:16, 5:20, 6:24, 8:32, 10:40, 12:48, 16:64 }
Radius  = { sm:4, md:8, lg:12, xl:16, full:9999 }
Shadow  = { sm: {...}, md: {...}, lg: {...} }  // platform-aware elevation + shadowColor
```

---

## Directory Structure

```
apps/pharmopedia/
├── app/                         # Expo Router — file-based routes
│   ├── (auth)/
│   │   ├── _layout.tsx          # Stack navigator for auth screens
│   │   ├── login.tsx            # Clinical email/password login
│   │   └── register.tsx         # Patient phone OTP registration
│   ├── (tabs)/
│   │   ├── _layout.tsx          # Tab navigator (calls useAutoSync)
│   │   ├── index.tsx            # Search tab
│   │   ├── browse.tsx           # Browse by therapeutic class
│   │   ├── saved.tsx            # Bookmarked drugs
│   │   └── profile.tsx          # Language, sync controls, sign-out
│   ├── drug/
│   │   └── [atcCode].tsx        # Drug detail screen (5 tabs)
│   └── _layout.tsx              # Root layout (auth guard, i18n provider)
├── src/
│   ├── api/
│   │   └── drug-catalog.ts      # tRPC API client (5 endpoints)
│   ├── components/
│   │   ├── DrugDetail/
│   │   │   ├── OverviewTab.tsx  # Names, description, indications, side effects
│   │   │   ├── ClinicalTab.tsx  # Dosing, interactions, severity badges, pediatric, PK (Tier 2)
│   │   │   ├── PricingTab.tsx   # Nearest pharmacy prices (geolocation)
│   │   │   ├── EnrichTab.tsx    # Edit localNames/formulary data (Tier 2/3)
│   │   │   ├── FormularyTab.tsx # Formulary status, dispensing notes, substitutes, recall alerts (Tier 3)
│   │   │   └── ShareButton.tsx  # Native share sheet → deep link
│   │   ├── DrugCard.tsx         # Search/browse result row
│   │   ├── SearchBar.tsx        # Debounced search input
│   │   ├── TherapeuticClassCard.tsx  # Browse accordion row
│   │   ├── PriceCard.tsx        # Pharmacy price list item
│   │   ├── RoleBadge.tsx        # Displays current user role
│   │   └── SyncStatusBanner.tsx # Syncing/error/not-synced status bar
│   ├── db/
│   │   ├── migrations.ts        # Schema creation + migration runner
│   │   ├── schema.ts            # DDL constants (schema version 2)
│   │   ├── drug-catalog.ts      # CRUD: upsert, getByAtcCode, scopeEntryForRole
│   │   ├── fts.ts               # Full-text search (FTS5, unicode61)
│   │   ├── bookmarks.ts         # add/remove/get/clearBookmarks
│   │   ├── browse.ts            # getTherapeuticClasses, getDrugsByTherapeuticClass
│   │   └── sync.ts              # runSync — paginated incremental sync
│   ├── hooks/
│   │   └── useAutoSync.ts       # Triggers sync once on first authenticated session
│   ├── i18n/
│   │   ├── index.ts             # i18next setup
│   │   └── locales/
│   │       ├── en.ts            # English (canonical, drives type inference)
│   │       ├── prs.ts           # Dari (RTL)
│   │       ├── ps.ts            # Pashto (RTL)
│   │       └── ar.ts            # Arabic (RTL)
│   ├── lib/
│   │   ├── hub-fetch.ts         # Certificate-pinned, compromise-aware fetch
│   │   └── supabase.ts          # Supabase client (in-memory sessions only)
│   └── store/
│       ├── auth-store.ts        # JWT token + user claims (in-memory)
│       ├── sync-store.ts        # Sync status, progress counter, version
│       ├── lang-store.ts        # Active language + RTL enforcement (isRtlLang helper)
│       └── bookmark-store.ts    # Bookmarked ATC codes (SQLite-backed)
├── app.config.ts                # scheme: 'pharmopedia', plugins
└── package.json
```

---

## Screens & Navigation

### Auth Screens `(auth)/`

**`login.tsx` — Clinical Login**
- Email + password form
- Calls `supabase.auth.signInWithPassword()`
- On success: stores JWT + decoded claims in `useAuthStore`, routes to `/(tabs)`
- Link to `/register` for new patients

**`register.tsx` — Patient OTP Registration**
- Two-step flow: phone entry → 6-digit OTP verification
- Calls `supabase.auth.signInWithOtp({ phone })` then `verifyOtp({ phone, token, type: 'sms' })`
- On success: extracts `role` and `facilityId` from `app_metadata`, logs in, routes to `/(tabs)`
- Creates account automatically if phone is new (Supabase Phone Auth behavior)
- Link back to `/login` for existing clinical users

### Tab Screens `(tabs)/`

**`index.tsx` — Search**
- Real-time FTS5 search with 300ms debounce
- Calls `searchDrugs(db, query, lang, 20)` — local SQLite first
- Falls back to `searchDrugsApi(q, lang, 20, token)` when online and authenticated
- Results show INN name + therapeutic class + bookmark indicator

**`browse.tsx` — Browse**
- Accordion list of therapeutic classes → drugs within that class
- `getTherapeuticClasses(db)` + `getDrugsByTherapeuticClass(db, class, lang)`
- Local-only — no API call

**`saved.tsx` — Saved / Bookmarks**
- Reads `useBookmarkStore` (SQLite-backed, no API)
- Shows bookmarked drugs with one-tap navigation to drug detail

**`profile.tsx` — Profile**
- Language selector: en / prs / ps / ar (persisted to SecureStore, RTL triggers app reload)
- Sync status: last synced time, count of drugs synced
- Manual "Sync Now" button (calls `runSync` with progress callback)
- Sign-out: clears auth store + resets sync/bookmark stores

### Drug Detail `drug/[atcCode].tsx`

Loads drug entry from SQLite first; falls back to Hub API if not found locally. Tabs rendered depend on the user's role:

| Tab | Who Sees It | Source |
|---|---|---|
| **Overview** | Everyone | Tier 1 data |
| **Clinical** | DOCTOR, NURSE, LAB_TECH, PHARMACIST, ADMIN | Tier 2 data |
| **Formulary** | PHARMACIST, ADMIN | Tier 3 data |
| **Pricing** | Everyone | Real-time API (geolocation required) |
| **Enrich** | DOCTOR, NURSE, LAB_TECH, PHARMACIST, ADMIN | POST mutation to Hub |

Header shows: primary name (localized if non-English), INN name, ATC code, therapeutic class, bookmark toggle, share button.

**Deep link:** `pharmopedia://drug/A02BC01` navigates directly to this screen.

**Share:** Native share sheet sends `"${drugName}\npharmopedia://drug/${atcCode}"`.

#### ClinicalTab sections (Tier 2)

- **Dosing** — standard adult dosing with route and frequency
- **Drug interactions** — list with severity badges: CONTRAINDICATED (red), MAJOR (orange), MODERATE (yellow), MINOR (grey)
- **Contraindications** — absolute contraindications list
- **Pediatric dosing** — weight-based and age-based dosing tables
- **Pharmacokinetics** — onset, peak, half-life, protein binding, metabolism, excretion
- **Localized admin notes** — translated dispensing and administration guidance

#### FormularyTab sections (Tier 3)

- **Formulary status** — badge: On Formulary / Off Formulary / Restricted
- **Dispensing notes** — pharmacist-entered free text
- **Therapeutic substitutes** — alternative drugs in the same class
- **Unit cost** — facility-entered cost per unit
- **Recall alerts** — active recall or safety alert notices for this drug

---

## Data Layer

### SQLite Schema (Version 2)

**`drug_catalog`** — One row per drug, columns partitioned by tier:

```sql
CREATE TABLE drug_catalog (
  atcCode          TEXT PRIMARY KEY,
  innName          TEXT NOT NULL,
  therapeuticClass TEXT NOT NULL,
  -- Tier 1 (public)
  description      TEXT,
  indications      TEXT,    -- JSON array
  sideEffects      TEXT,    -- JSON array
  localNames       TEXT,    -- JSON: { en, prs, ps, ar }
  -- Tier 2 (clinical)
  dosing           TEXT,    -- JSON
  interactions     TEXT,    -- JSON array
  contraindications TEXT,   -- JSON array
  -- Tier 3 (pharmacist/admin)
  dispensingNotes  TEXT,
  formularyStatus  TEXT,    -- 'on_formulary' | 'off_formulary' | 'restricted'
  unitCost         REAL,
  -- Sync metadata
  catalogVersion   INTEGER NOT NULL DEFAULT 0,
  updatedAt        TEXT NOT NULL
)
```

**`drug_catalog_fts`** — FTS5 virtual table for full-text search:

```sql
CREATE VIRTUAL TABLE drug_catalog_fts USING fts5(
  atcCode UNINDEXED,
  innName,
  localNameEn, localNamePrs, localNamePs, localNameAr,
  therapeuticClass,
  content='drug_catalog',
  tokenize='unicode61'
)
```

Search uses prefix wildcards: `SELECT * FROM drug_catalog_fts WHERE drug_catalog_fts MATCH 'amox*'`.

**`sync_meta`** — Single-row key-value table tracking sync state:

```sql
CREATE TABLE sync_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
)
-- Keys: 'version' (integer string), 'lastSyncAt' (ISO 8601)
```

**`bookmarks`** — User-saved drugs (survives sign-out, cleared on explicit reset):

```sql
CREATE TABLE bookmarks (
  atcCode          TEXT PRIMARY KEY,
  innName          TEXT NOT NULL,
  therapeuticClass TEXT NOT NULL,
  savedAt          TEXT NOT NULL
)
```

### Three-Tier Data Scoping

`scopeEntryForRole(row, role)` strips columns the caller is not authorized to see before exposing the object to the UI:

| Tier | Columns included | Roles |
|---|---|---|
| **Tier 1** | atcCode, innName, therapeuticClass, description, indications, sideEffects, localNames | PATIENT (and unauthenticated) |
| **Tier 2** | + dosing, interactions, contraindications | DOCTOR, NURSE, LAB_TECH, PHARMACIST, ADMIN |
| **Tier 3** | + dispensingNotes, formularyStatus, unitCost | PHARMACIST, ADMIN |

The Hub API enforces the same scoping server-side — the client-side scoping is an additional defense layer, not a security boundary.

---

## Authentication System

Three distinct auth flows share a single Supabase project:

### Flow 1 — Clinical Login (email/password)
- Used by: DOCTOR, NURSE, LAB_TECH, PHARMACIST, ADMIN
- `supabase.auth.signInWithPassword({ email, password })`
- Role and facilityId extracted from `session.user.app_metadata`
- JWT stored in `useAuthStore` (Zustand, in-memory only — no persistence)

### Flow 2 — Patient OTP Login
- Used by: existing PATIENT accounts
- `supabase.auth.signInWithOtp({ phone })` → `verifyOtp({ phone, token, type: 'sms' })`
- Role defaults to PATIENT from `app_metadata`

### Flow 3 — Public Registration (OTP auto-create)
- Used by: new patients with no prior account
- Same Supabase OTP flow — Supabase creates the account if the phone is new
- Indistinguishable from Flow 2 at the client level; the `register.tsx` screen provides the registration-branded UI

### Session Security

- `persistSession: false` — JWT never written to AsyncStorage or SecureStore
- `autoRefreshToken: false` — no silent token refresh; user re-authenticates on app restart
- Token stored only in `useAuthStore` Zustand store (JS heap; cleared on app termination)
- All API calls send `Authorization: Bearer <token>` via `authHeaders()` in `src/api/drug-catalog.ts`

### Role Claims

```typescript
interface UserClaims {
  sub: string           // Supabase user UUID
  role: string          // 'PATIENT' | 'DOCTOR' | 'NURSE' | 'LAB_TECH' | 'PHARMACIST' | 'ADMIN'
  facilityId?: string   // Present for clinical staff; absent for patients
}
```

Claims are read from `session.user.app_metadata` (set server-side via Supabase admin API or Edge Functions — never settable by the client).

---

## API Layer

All API calls go through `src/api/drug-catalog.ts`, which bridges tRPC-style URL encoding over standard HTTP.

**URL encoding:**
- GET queries: `?input={"json":{"key":"value"}}`
- POST mutations: body `{"json":{"key":"value"}}`
- Response envelope: `{ result: { data: { json: T } } }`

**Base URL:** `process.env.EXPO_PUBLIC_HUB_API_URL` (defaults to `http://localhost:3004/api/trpc`)

### Endpoints

| Function | Method | tRPC Path | Description |
|---|---|---|---|
| `searchDrugsApi` | GET | `drugCatalog.search` | Text search across en/prs/ps/ar name fields |
| `getDrugByAtcCodeApi` | GET | `drugCatalog.getByAtcCode` | Full drug entry, scoped to caller's role |
| `syncDrugsApi` | GET | `drugCatalog.sync` | Paginated incremental sync (`sinceVersion`, `limit`) |
| `getDrugPricesApi` | GET | `drugCatalog.getPrices` | Pharmacy prices near lat/lng, sorted by distance or price |
| `enrichDrugApi` | POST | `drugCatalog.enrich` | Update localNames, dispensingNotes, formularyStatus, unitCost |

All calls use `hubFetch` (not native `fetch`) to enforce certificate pinning and compromise detection.

---

## Hub API Backend (Plan 1)

The Hub API drug catalog service lives in `apps/hub-api/` and is consumed by Pharmopedia, OPD Lite, and Pharmacy Lite.

### PostgreSQL Schema

**`drug_catalog`** — Source of truth; shared with all spokes via tRPC:

```sql
CREATE TABLE drug_catalog (
  atc_code          TEXT PRIMARY KEY,
  inn_name          TEXT NOT NULL,
  therapeutic_class TEXT NOT NULL,
  -- Tier 1
  description       TEXT,
  indications       JSONB,
  side_effects      JSONB,
  local_names       JSONB,   -- { en, prs, ps, ar }
  -- Tier 2
  dosing            JSONB,
  interactions      JSONB,
  contraindications JSONB,
  -- Tier 3
  dispensing_notes  TEXT,
  formulary_status  TEXT,
  unit_cost         NUMERIC,
  -- Sync
  catalog_version   INTEGER NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
)
```

**`pharmacy_facilities`** — Registered pharmacy locations:

```sql
CREATE TABLE pharmacy_facilities (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  lat          NUMERIC NOT NULL,
  lng          NUMERIC NOT NULL,
  facility_id  TEXT REFERENCES facilities(id)
)
```

**`pharmacy_prices`** — Real-time price submissions from pharmacies:

```sql
CREATE TABLE pharmacy_prices (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  atc_code    TEXT REFERENCES drug_catalog(atc_code),
  pharmacy_id UUID REFERENCES pharmacy_facilities(id),
  price       NUMERIC NOT NULL,
  currency    TEXT NOT NULL DEFAULT 'AFN',
  reported_at TIMESTAMPTZ NOT NULL DEFAULT now()
)
```

### tRPC Procedures (Hub side)

| Procedure | Type | Role guard | What it does |
|---|---|---|---|
| `drugCatalog.search` | query | public | Brand name + INN full-text search, returns Tier 1 results |
| `drugCatalog.getByAtcCode` | query | public | Returns entry scoped to caller's role (Tier 1/2/3) |
| `drugCatalog.sync` | query | authenticated | Paginated `sinceVersion` delta; returns entries + `latestVersion` |
| `drugCatalog.enrich` | mutation | Tier 2+ | Updates localNames, dispensingNotes, formularyStatus, unitCost |
| `drugCatalog.getPrices` | query | public | Nearest pharmacies with prices, sorted by distance or price |
| `drugCatalog.setPrice` | mutation | PHARMACIST/ADMIN | Upsert a pharmacy price for an ATC code |

---

## ETL Seed Pipeline (Plan 2)

A standalone Node.js script (`scripts/pharmopedia-etl/`) seeds the Hub PostgreSQL `drug_catalog` table from public drug databases. It runs as a one-time import and as a scheduled refresh.

### Data Sources (priority order)

1. **NLM RxNorm** (`src/sources/nlm.ts`) — Drug names, RxNorm CUIs, ingredient data. Highest priority — authoritative source for INN names.
2. **OpenFDA** (`src/sources/openfda.ts`) — FDA drug labels for indications, side effects, contraindications, dosing, and warnings.
3. **DrugBank** (`src/sources/drugbank.ts`) — Pharmacokinetics and drug interactions. **Currently a stub** — DrugBank requires a commercial license; stub returns empty arrays.

### ETL Logic

- `normalizer.ts` — Merges data from all three sources into a single `DrugCatalogEntry`. Priority order: NLM > OpenFDA > DrugBank. Fields are never overwritten by a lower-priority source; they are only filled in if the higher-priority source left them empty.
- `runner.ts` — Fetches, normalizes, and upserts in chunks of 100. Uses Supabase upsert with `onConflict: 'atc_code'` and `ignoreDuplicates: false` — enrichment fields (`dispensing_notes`, `formulary_status`, `unit_cost`, `local_names`) are preserved and never overwritten by the ETL.

### WHO EML Seed List

Phase 1 seed: 10 WHO Essential Medicines List drugs covering the most common conditions in the target region. Full list drives initial catalog; subsequent ETL runs are incremental by `catalog_version`.

---

## Cross-App Integrations (Plans 4a/4b)

### OPD Lite → Pharmopedia (Plan 4a)

OPD Lite (desktop PWA) integrates the drug catalog at two points:

1. **Prescription search** — `apps/opd-lite/src/lib/medication-search.ts` provides `searchMedication(q)`:
   - Online + authenticated: calls Hub `drugCatalog.search` tRPC via `trpc.ts` helpers
   - Offline or Hub unavailable: falls back to local Dexie (IndexedDB) medication store
   - Results merged and deduplicated

2. **Deep link to Pharmopedia** — From the `PrescriptionEntry` component, a "View in Pharmopedia" button opens `pharmopedia://drug/:atcCode`. Patients can tap through from their prescription to full drug detail.

3. **Inline enrich** — Clinical staff can enrich `localNames` and `dispensingNotes` directly in the OPD Lite prescription UI without switching to Pharmopedia. Uses `enrichDrug(atcCode, fields)` Hub API call. Fields shown are role-gated: Tier 2 roles see localNames; Tier 3 roles additionally see dispensingNotes, formularyStatus.

### Pharmacy Lite → Pharmopedia (Plan 4b)

Pharmacy Lite (inventory PWA) integrates at two points:

1. **Catalog browse with Hub fallback** — The catalog browse page shows local inventory first; when the Hub is reachable, it augments results with Hub drug entries not yet in local stock. Hub results include a "View in Pharmopedia" deep link.

2. **Price publishing on goods receipt** — `ReceiveStockForm` in Pharmacy Lite calls `drugCatalog.setPrice` (Hub tRPC mutation) when stock is received, reporting the unit cost for that pharmacy. This feeds the real-time pricing data surfaced in Pharmopedia's Pricing tab.

---

## Sync System

### How Sync Works

1. On first login (`lastVersion === 0`), `useAutoSync` fires automatically.
2. `runSync(db, token, onProgress)` fetches drugs in pages of 200 (`syncDrugsApi(sinceVersion, 200, token)`).
3. Each page is upserted into `drug_catalog` and indexed in `drug_catalog_fts` via `upsertDrugBatch`.
4. `onProgress(count)` fires after each page, updating `syncedCount` in `useSyncStore` → displayed in `SyncStatusBanner`.
5. On completion, `setSyncMeta(db, version, lastSyncAt)` records the latest catalog version.
6. On next sync, `getSyncMeta(db)` returns the stored version as `sinceVersion` — only changed drugs are downloaded.

### State Machine (`useSyncStore`)

```
idle → syncing → idle     (success: setLastSync resets syncedCount to 0)
idle → syncing → error    (failure: setStatus('error'))
```

### Auto-sync Guard (`useAutoSync`)

Fires only when all are true:
- `isAuthenticated === true`
- `token` is non-null
- `lastVersion === 0` (first session — not re-triggered after successful sync)
- `status !== 'syncing'` (prevents double-trigger)

Manual sync via "Sync Now" button (`profile.tsx`) resets `syncedCount` to 0 before calling `runSync`, allowing the progress counter to restart cleanly.

### `SyncStatusBanner`

Renders a persistent banner at the top of every tab screen:

| State | Display |
|---|---|
| `syncing`, `syncedCount === 0` | "Syncing catalog…" |
| `syncing`, `syncedCount > 0` | "Syncing catalog… 450 drugs" |
| `error` | Error banner with warning |
| `idle`, `lastSyncAt === null` | "Catalog not yet synced" warning |
| `idle`, `lastSyncAt` set | Hidden (no banner) |

---

## Internationalization

**Supported languages:**

| Code | Language | Direction | Phone OTP prefix |
|---|---|---|---|
| `en` | English | LTR | — |
| `prs` | Dari (Farsi of Afghanistan) | RTL | `\u200f` (RLM) |
| `ps` | Pashto | RTL | `\u200f` (RLM) |
| `ar` | Arabic | RTL | `\u200f` (RLM) |

**Language switching** (`lang-store.ts`):
- Selection persisted to SecureStore
- RTL languages call `I18nManager.forceRTL(true)` + `Updates.reloadAsync()` — full app reload required for RN RTL to apply globally
- LTR-to-LTR switches apply without reload

**Localized drug content:**
- `localNames` JSON column holds translated drug names per language code
- `OverviewTab` uses `localText(field, lang)` helper: tries `field[lang]`, falls back to `field['en']`
- `getDrugsByTherapeuticClass` returns the appropriate `localName` column per language

**Translation namespace keys (top-level):**

```
common, tabs, login, register, drug, sync, search, browse, saved, profile
```

All 4 locale files (`en.ts`, `prs.ts`, `ps.ts`, `ar.ts`) must stay structurally identical — `Translations = typeof en` enforces this at compile time.

---

## Security

### hubFetch (`src/lib/hub-fetch.ts`)

All API traffic goes through `hubFetch`, which layers two protections on top of native `fetch`:

1. **Certificate pinning** (`pinnedFetch`): Validates TLS certificate fingerprint against a hardcoded expected value. Rejects connections if the certificate doesn't match — protects against MITM attacks.

2. **Compromise detection**: Reads device compromise state (rooted/jailbroken detection from a platform-specific module). Write operations (POST/PUT/PATCH/DELETE) are **blocked entirely** if the device is compromised. Read operations are permitted with a warning.

### JWT Handling

- Tokens live in `useAuthStore` (Zustand in-memory store) — cleared on app termination
- Never written to AsyncStorage, SecureStore, or any persistent storage
- Sent as `Authorization: Bearer <token>` on every API request
- Supabase client configured with `persistSession: false` — no session recovery across restarts

### Data at Rest

- SQLite database file on device contains drug catalog data (not PHI)
- Bookmarks store ATC codes and drug names only — no patient data
- No patient health information is stored locally in Pharmopedia

---

## Test Coverage

**Total: 82 tests across 16 test files**
**Runner:** Vitest + @testing-library/react-native

| Test file | What it covers |
|---|---|
| `login-screen.test.tsx` | Login form, error states, register-link navigation |
| `register-screen.test.tsx` | Phone/OTP steps, success/failure paths, back/sign-in links |
| `search-screen.test.tsx` | Debounced search, results rendering, empty state |
| `browse-screen.test.tsx` | Therapeutic class accordion, drug list |
| `saved-screen.test.tsx` | Bookmark list, empty state |
| `profile-screen.test.tsx` | Language selector, sync controls, sign-out |
| `drug-detail-screen.test.tsx` | Tab rendering by role, bookmark toggle, not-found state |
| `overview-tab.test.tsx` | Localized name display, fallback to English |
| `clinical-tab.test.tsx` | Dosing/interactions/contraindications render |
| `pricing-tab.test.tsx` | Geolocation request, price list, sort toggle |
| `enrich-tab.test.tsx` | Edit form by role (clinical vs pharmacist fields) |
| `sync-status-banner.test.tsx` | All 5 banner states (idle, syncing w/o count, syncing with count, error, not-synced) |
| `use-auto-sync.test.ts` | Trigger conditions, success, error, guard conditions (3 guards) |
| `drug-catalog-db.test.ts` | upsert, getByAtcCode, scopeEntryForRole tier scoping |
| `fts-search.test.ts` | FTS5 prefix search, multilingual name matching |
| `sync-store.test.ts` | State transitions, setLastSync resets syncedCount |

---

## What's Next

### Known Bugs (small fixes)

1. **`fts.ts` missing `'ar'` in lang type** — `searchDrugs(db, q, lang, limit)` has `lang: 'en' | 'prs' | 'ps'` (same bug fixed in `drug-catalog.ts` but not yet in `fts.ts`). Arabic search falls back to English name column.

2. **`browse.ts` excludes `'ar'` from localName** — `getDrugsByTherapeuticClass` returns `localNameEn` for Arabic rather than `localNameAr`. Browse tab shows English names for Arabic users.

### Missing Features (near-term)

3. **Password reset for clinical users** — No "Forgot password?" flow on `login.tsx`. Clinical staff locked out of their account have no self-service recovery path.

4. **Lang change doesn't re-fetch drug detail** — If a user changes language while a drug detail screen is open, the displayed content (fetched on mount) is stale until navigation away and back.

5. **Pagination on Search results** — `searchDrugsApi` currently returns a fixed limit of 20 results with no load-more mechanism.

6. **No deep link from notification** — Push notifications for drug recalls or formulary changes (planned feature) would need to deep-link to `pharmopedia://drug/:atcCode`. The scheme is registered; the link handling works; notifications infrastructure is not yet built.

### Planned Features (medium-term)

7. **Recall & safety alerts** — Push notification channel for drug recalls, market withdrawals, and safety alerts. Tied to ATC codes in local catalog; tappable notification → drug detail. (FormularyTab already has a recall alerts section; backend delivery pipeline is not yet built.)

8. **Offline enrich queue** — Currently `enrichDrugApi` (POST mutation) fails silently offline. An offline queue (similar to `packages/sync-engine`) should buffer enrich mutations and replay on reconnect.

9. **Deeper OPD Lite integration** — Plan 4a wired search + deep links + inline enrich. Remaining gaps: return-to-caller callback after deep link, OPD Lite displaying Pharmopedia formulary status inline on the prescription entry.

10. **Deeper Pharmacy Lite integration** — Plan 4b wired catalog browse + price publishing. Remaining gaps: pulling real-time Pharmopedia pricing into Pharmacy Lite inventory valuation; exposing formulary substitutes in the dispensing workflow.

11. **Conflict resolution for enrich fields** — Multiple pharmacists enriching the same drug entry concurrently will cause last-write-wins overwrites. Tier 2 sync logic (keep both versions as addenda) should be applied to `localNames` and `dispensingNotes`.

12. **Audit logging for PHI-adjacent actions** — `enrichDrugApi` mutations are not yet emitting audit events via `@ultranos/audit-logger`. Once the app connects to clinical facilities, this becomes a compliance requirement.

13. **DrugBank integration** — `scripts/pharmopedia-etl/src/sources/drugbank.ts` is currently a stub. A commercial DrugBank license would unlock pharmacokinetics and high-quality drug interaction data for the ETL pipeline.

---

## Appendix: Key Constants & Identifiers

| Item | Value |
|---|---|
| Deep link scheme | `pharmopedia://` |
| Drug detail URL pattern | `pharmopedia://drug/:atcCode` |
| Hub API default URL | `http://localhost:3004/api/trpc` |
| Env var for Hub URL | `EXPO_PUBLIC_HUB_API_URL` |
| SQLite schema version | `2` |
| Sync page size | `200` entries per page |
| Search result limit | `20` |
| Pharmacy price result limit | `10` |
| Search debounce delay | `300ms` |
| Clinical roles | `DOCTOR, NURSE, LAB_TECH, PHARMACIST, ADMIN` |
| Pharmacist roles | `PHARMACIST, ADMIN` |
| Patient role | `PATIENT` |
