# Pharmopedia — Architecture & Specification

**App:** `apps/pharmopedia/`
**Last updated:** 2026-06-17
**Branch:** `ux-v1.5`

---

## What Is Pharmopedia?

Pharmopedia is an offline-capable drug reference application for clinicians and patients operating in Afghanistan and the broader MENA/Central Asia region. It provides role-scoped drug information — from basic patient-safe overviews to full clinical and formulary details — in four languages (English, Dari, Pashto, Arabic).

The app is designed for low-connectivity environments: the full drug catalog syncs to an on-device SQLite database on first login and updates incrementally. All core workflows — search, browse, drug detail, bookmarks — function with zero network access after the initial sync.

Since the **UX overhaul (epics E1–E6 + O1–O3)**, the app is built on a shared **Clinical-Calm** native component kit (`@ultranos/ui-kit/native`), opens to a **Home dashboard with inline search**, has a **light/dark theme system**, a multi-step **onboarding & identity** flow (member sign-in vs public signup wizard, with account discovery/claim), a full **profile** screen backed by an **encrypted offline profile cache**, and a completed **accessibility / reduced-motion** pass with all four locales fully translated.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Expo (Expo Router, file-based routing) |
| **Language** | TypeScript |
| **UI** | React Native core components + **`@ultranos/ui-kit/native`** (shared Clinical-Calm RN component kit) |
| **Theming** | Theme-aware **light / dark / system** via `theme-store` + `useThemeColors()` (no static palette in components) |
| **Local DB** | expo-sqlite (SQLite 3.x with FTS5 extension) — schema **version 3** |
| **State** | Zustand (auth, sync, language, bookmarks, theme, recent searches, coach marks) |
| **Auth** | Supabase JS client (`persistSession: false, autoRefreshToken: false`) |
| **API** | tRPC-over-REST bridge to the Central Hub API |
| **Profile crypto** | **`@noble/ciphers`** AES-256-GCM + **`expo-crypto`** CSPRNG (encrypted offline profile cache; key in `expo-secure-store`) |
| **i18n** | i18next + react-i18next (4 locales: en, prs, ps, ar — all fully translated) |
| **Security** | hubFetch — certificate-pinned, compromise-aware fetch wrapper |
| **Secure storage** | expo-secure-store (language preference, recent searches, coach marks, profile-cache key) |
| **Image picker** | expo-image-picker (signup photo capture) |
| **Location** | expo-location (pharmacy pricing tab — nearest pharmacies) |
| **Motion** | Reduced-motion aware — `useReducedMotion()` gates all autonomous animations |
| **Deep links** | `pharmopedia://` custom URI scheme via Expo Router |
| **Testing** | Vitest + @testing-library/react-native (**294 tests across 70 test files**); a Jest mirror suite also exists |
| **Fonts** | `@expo-google-fonts/manrope` + `@expo-google-fonts/public-sans` (loaded in `_layout.tsx`) |
| **Design tokens** | `@ultranos/ui-kit/tokens.native` — shared JS token file for all React Native apps |

---

## Design Tokens

Pharmopedia uses a shared JS-based design token system, exported from `packages/ui-kit/src/tokens.native.ts`. This is the React Native equivalent of `tokens.css` (which is web-only and not usable in RN). **All colors, fonts, spacing, radius, and shadow values must come from this file — never use hardcoded hex values or raw style values in components.**

Import path:
```typescript
import { Colors, ColorsDark, FontFamily, FontSize, Spacing, Radius, Shadow } from '@ultranos/ui-kit/tokens.native'
```

`Colors` is the light palette and `ColorsDark` is the dark palette. **Components do not import these directly for color** — they read resolved colors via `useThemeColors()` (see [Theme System](#theme-system)), which returns `Colors` or `ColorsDark` based on the resolved theme.

### Colors (light palette)

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

Semantic surface/text aliases used by the native kit (`surface`, `surfaceSubtle`, `textPrimary`, `textSecondary`, `textMuted`, `border`, `borderSubtle`, plus `info`/`infoLight`) resolve per-theme from the same token file.

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

## Shared Native UI Kit

The UX overhaul (E1–E3) introduced a **shared React Native component kit** that all Pharmopedia screens are built on. It lives in the monorepo's `packages/ui-kit` under a new `native/` subtree and is consumed by import path:

```typescript
import {
  UiKitProvider, useThemeColors, useRtl, useReducedMotion,
  Screen, ScreenHeader, Card, CardSection, ListRow, Button,
  Avatar, Chip, Banner, EmptyState, CollapsibleList, CollapsibleScreen,
} from '@ultranos/ui-kit/native'
```

### Shipped as source, not `dist/`

Unlike the web ShadCN components (which resolve through `packages/ui-kit/dist/` and require a build step), the native subtree is **exported as TypeScript source** and compiled in-app by Metro/Babel — identical to the existing `tokens.native` export. The package export declared in `packages/ui-kit/package.json`:

```json
"./native": "./src/native/index.ts"
```

**No ui-kit build step is required** for native changes to take effect — editing a file under `packages/ui-kit/src/native/` is picked up directly by the Expo app.

### Exports

| Export | Kind | Purpose |
|---|---|---|
| `UiKitProvider` | provider | Supplies resolved theme `mode` + `rtl` to all primitives via context. Wraps the app tree in `app/_layout.tsx`. |
| `useThemeColors()` | hook | Returns the resolved (`Colors`/`ColorsDark`) palette for the active theme. |
| `useRtl()` | hook | Returns RTL direction state for logical alignment / Arabic font. |
| `useReducedMotion()` | hook | `AccessibilityInfo`-based boolean (subscribes to `reduceMotionChanged`); gates animations. |
| `Screen` | component | SafeArea + `surfaceSubtle` background page scaffold. |
| `ScreenHeader` | component | Static title/subtitle/action header (Public Sans bold). |
| `Card` / `CardSection` | components | Bordered rounded surface; `CardSection` is a labeled group of hairline-divided rows. |
| `ListRow` | component | Settings-list row: leading icon tile, label, trailing value/chevron/custom; `minHeight: 48`, `hitSlop`, full a11y. |
| `Button` | component | `primary` / `secondary` / `destructive` variants; loading + disabled states. |
| `Avatar` | component | Photo or up-to-2-letter initials circle. |
| `Chip` | component | Selectable pill. |
| `Banner` | component | `info` / `warning` / `error` / `success` status banner, optionally tappable. |
| `EmptyState` | component | Centered icon + title + description + optional action button. |
| `CollapsibleList<T>` | component | `Animated.FlatList` screen with a collapsing large title (Apple-Health style); used by Browse/Saved. |
| `CollapsibleScreen` | component | `Animated.ScrollView` variant of the collapsing header; used by Home/Profile. |

Every primitive is **theme-aware** (`useThemeColors`), **RTL-aware** (logical alignment, Arabic font, navigation icons via `DirectionalIcon`), and **accessible** (roles, composed labels, `accessibilityState`, ≥44px targets).

The app keeps a thin `apps/pharmopedia/src/hooks/useThemeColors.ts` that reads `theme-store.resolvedTheme` and returns `Colors`/`ColorsDark` — used by screen files that aren't yet inside the provider's color context.

---

## Theme System

Pharmopedia supports **light, dark, and system** themes.

- **`theme-store.ts`** (`useThemeStore`) holds `mode: 'light' | 'dark' | 'system'` and a derived `resolvedTheme: 'light' | 'dark'`. The mode is persisted; `resolvedTheme` resolves `system` against the OS appearance.
- `app/_layout.tsx` wraps the tree in `<UiKitProvider mode={resolvedTheme} rtl={isRtlLang(lang)}>`, so every native-kit component resolves its palette through context.
- Components read colors via **`useThemeColors()`**, never static `Colors`. A dark-mode render differs from light by construction.
- The theme selector (light / dark / system) lives on the Profile screen (`theme-{light|dark|system}` testIDs).

---

## Directory Structure

```
apps/pharmopedia/
├── app/                          # Expo Router — file-based routes
│   ├── _layout.tsx               # Root layout: fonts/i18n, store init, UiKitProvider, ErrorBoundary, root Stack
│   ├── welcome.tsx               # One-time brand intro (gated by hasSeenWelcome) → onboarding
│   ├── (auth)/
│   │   ├── _layout.tsx           # Auth Stack — initial route: onboarding
│   │   ├── onboarding.tsx        # Entry chooser: "Ultranos member" vs "Public"
│   │   ├── login.tsx             # Ultranos member sign-in (email/password + forgot-password) on AuthShell
│   │   └── register.tsx          # Public signup WIZARD (phone → OTP → discover branch → name → DOB → photo → address → finish)
│   ├── (tabs)/
│   │   ├── _layout.tsx           # Tab navigator (Home · Browse · Saved · Profile; calls useAutoSync)
│   │   ├── index.tsx             # HOME dashboard with INLINE search (replaced the old Search tab)
│   │   ├── browse.tsx            # Browse by therapeutic class
│   │   ├── saved.tsx             # Bookmarked drugs
│   │   └── profile.tsx           # Full profile (identity, cards, preferences, sync, logout)
│   └── drug/
│       └── [atcCode].tsx         # Drug detail screen (4 tabs: Overview · Clinical · Pricing · Enrich)
│   # NOTE: app/search.tsx was REMOVED (E5) — search is inline on Home; there is no standalone search route
├── src/
│   ├── api/
│   │   ├── drug-catalog.ts        # tRPC drug-catalog client (6 endpoints; getDrugByAtcCodeApi is 3-arg)
│   │   ├── account.ts             # discoverAccount / claimAccount / registerFromSession
│   │   └── users.ts               # getProfile + UserProfile discriminated-union type
│   ├── components/
│   │   ├── AuthShell.tsx          # Shared auth shell: icon-chip + wordmark + LanguageChips header, centered content, footer
│   │   ├── LanguageChips.tsx      # en/prs/ps/ar language selector chips (auth screens)
│   │   ├── DrugCard.tsx           # Search/browse result row — built on ui-kit Card
│   │   ├── SearchBar.tsx          # Debounced search input
│   │   ├── TherapeuticClassCard.tsx  # Browse category row — built on ui-kit ListRow
│   │   ├── PriceCard.tsx          # Pharmacy price list item
│   │   ├── RoleBadge.tsx          # Displays current user role
│   │   ├── SyncStatusBanner.tsx   # Syncing/error/not-synced status bar
│   │   ├── NetStatusBanner.tsx    # Offline banner
│   │   ├── CoachMark.tsx          # Dismissible coach-mark hint
│   │   ├── SkeletonCard.tsx       # Loading skeleton
│   │   ├── ErrorBoundary.tsx / CrashFallback.tsx  # Error boundary + fallback UI
│   │   ├── DrugDetail/
│   │   │   ├── OverviewTab.tsx     # Names, description, indications, side effects (Tier 1)
│   │   │   ├── ClinicalTab.tsx     # Full clinical view, takes a `lang` prop (Tier 2)
│   │   │   ├── PricingTab.tsx      # Nearest pharmacy prices (geolocation)
│   │   │   ├── EnrichTab.tsx       # Edit localNames/formulary data (Tier 2/3)
│   │   │   ├── FormularyTab.tsx    # Formulary component (present but NOT currently mounted in [atcCode].tsx)
│   │   │   ├── SafetyBanner.tsx    # Elevates CONTRAINDICATED + MAJOR interactions at top of detail
│   │   │   ├── SeverityBadge.tsx   # Interaction severity badge (color-mapped)
│   │   │   ├── SectionCard.tsx     # Clinical section container with severity tinting
│   │   │   └── ShareButton.tsx     # Native share sheet → deep link
│   │   └── signup/
│   │       ├── PickerField.tsx     # Searchable modal picker primitive
│   │       ├── ProvincePicker.tsx  # Afghan province picker (AFGHAN_PROVINCES)
│   │       ├── DistrictPicker.tsx  # District picker (getDistrictsByProvince; disabled until province)
│   │       ├── PhotoPicker.tsx     # expo-image-picker camera/library + preview + skip
│   │       └── WizardProgress.tsx  # "Step N of M" progress indicator
│   ├── db/
│   │   ├── migrations.ts          # Schema creation + migration runner (PRAGMA user_version → 3)
│   │   ├── schema.ts              # DDL constants (SCHEMA_VERSION = 3)
│   │   ├── drug-catalog.ts        # upsert, getDrugRowByAtcCode, scopeEntryForRole (tier JSON columns)
│   │   ├── fts.ts                 # Full-text search (FTS5, unicode61) — searchDrugs(lang includes 'ar')
│   │   ├── bookmarks.ts           # add/remove/get/clearBookmarks
│   │   ├── browse.ts              # getTherapeuticClasses, getDrugsByTherapeuticClass (localNames[lang] incl. 'ar')
│   │   └── recalls.ts             # getActiveRecalls(db, role, limit) — Home safety-alerts source
│   ├── hooks/
│   │   ├── useAutoSync.ts          # Triggers sync once on first authenticated session
│   │   ├── useDrugSearch.ts        # Shared offline-first (FTS → API) debounced search hook
│   │   ├── useProfile.ts           # Cache-first → network profile loader
│   │   └── useThemeColors.ts       # Resolves Colors/ColorsDark from theme-store
│   ├── i18n/
│   │   ├── index.ts               # i18next setup
│   │   └── locales/
│   │       ├── en.ts              # English (canonical, drives type inference)
│   │       ├── prs.ts             # Dari (RTL) — fully translated
│   │       ├── ps.ts              # Pashto (RTL) — fully translated
│   │       └── ar.ts             # Arabic (RTL) — fully translated
│   ├── lib/
│   │   ├── hub-fetch.ts           # Certificate-pinned, compromise-aware fetch
│   │   ├── pinned-fetch.ts        # Certificate-pinning transport
│   │   ├── supabase.ts            # Supabase client (in-memory sessions only)
│   │   ├── haptics.ts             # Haptic feedback helper
│   │   ├── secure-crypto.ts       # AES-256-GCM (@noble/ciphers + expo-crypto); key in expo-secure-store
│   │   ├── profile-cache.ts       # Encrypted profile_cache read/write/clear
│   │   └── profile-photo.ts       # uploadProfilePhoto → private bucket object path
│   ├── store/
│   │   ├── auth-store.ts          # JWT token + user claims (in-memory)
│   │   ├── sync-store.ts          # Sync status, progress counter, version
│   │   ├── lang-store.ts          # Active language + RTL enforcement (isRtlLang helper)
│   │   ├── bookmark-store.ts      # Bookmarked drugs (SQLite-backed)
│   │   ├── theme-store.ts         # mode + resolvedTheme (light/dark/system)
│   │   ├── recent-search-store.ts # Persisted recent search queries (capped at 10)
│   │   └── coach-mark-store.ts    # Dismissed coach-mark keys (persisted)
│   ├── stores/
│   │   └── device-security-store.ts  # Device compromise state
│   ├── sync/
│   │   └── catalog-sync.ts        # runSync — paginated incremental sync
│   └── config/
│       └── certificate-pins.ts    # Pinned TLS fingerprints
├── app.config.ts                  # scheme: 'pharmopedia', plugins
└── package.json
```

---

## Screens & Navigation

### Welcome `welcome.tsx`

One-time brand intro gated by `hasSeenWelcome`. "Get Started" routes to `/(auth)/onboarding`.

### Auth Screens `(auth)/`

The auth stack's initial route is **`onboarding`**. The onboarding chooser, member login, and signup wizard are all built on the shared **`AuthShell`** (branded icon-chip + "Pharmopedia" wordmark + `LanguageChips` header, centered content, "Ultranos Healthcare Platform" footer; theme- and RTL-aware).

**`onboarding.tsx` — Entry Chooser**
- Two large tappable cards:
  - **Ultranos member** ("I use an Ultranos app") → `router.push('/(auth)/login')`.
  - **Public member** ("I'm new here") → `router.push('/(auth)/register')`.
- `LanguageChips` lets the user set the language before authenticating.

**`login.tsx` — Ultranos Member Sign-in**
- Email + password form (no clinical/patient toggle, no OTP path — those moved to the public flow).
- `supabase.auth.signInWithPassword()`; on success stores JWT + claims in `useAuthStore`, routes to `/(tabs)`.
- **Forgot-password** flow (`resetPasswordForEmail`) with a reset-sent status banner.
- Back affordance returns to the chooser.

**`register.tsx` — Public Signup Wizard**
A single screen driving a step state machine with `WizardProgress` ("Step N of M"), Back/Continue, and per-step validation:

1. **Phone** → `supabase.auth.signInWithOtp({ phone })` (60s resend cooldown).
2. **Verify** → `supabase.auth.verifyOtp({ phone, token, type: 'sms' })`; on success the session exists and is stored via `login(...)`.
3. **Account discovery branch** (O3) — immediately after verify, `discoverAccount({ phone })` runs:
   - **`staff`** match → info screen → `supabase.auth.signOut()` + route to member login (staff accounts are **not claimable**).
   - **`patient`** match → "We found your record" card (masked name + birth year) gated by a **birth-year second factor** → `claimAccount({ ref, phone, birthYear })` → on success `/(tabs)`; DOB mismatch shows an inline error.
   - **`none`** → continue the wizard.
4. **Name** — given name + father's name.
5. **DOB** — date of birth (required for the no-match `registerFromSession` path).
6. **Photo (skippable)** — `PhotoPicker` (expo-image-picker); skipping yields an initials avatar.
7. **Address** — `ProvincePicker` → `DistrictPicker` (province required → enables districts) → village (optional).
8. **Finish** — if a photo was chosen, `uploadProfilePhoto` to the private bucket; then `registerFromSession(...)` creates a Hub patient record linked via `patients.auth_user_id`; routes to `/(tabs)`.

### Tab Screens `(tabs)/`

Tab bar: **Home (`index`) · Browse · Saved · Profile** (lucide icons `Home`, `Folder`, `Bookmark`, `User`). **There is no Search tab.**

**`index.tsx` — Home (with inline search)**
Built on `CollapsibleScreen` with a time-of-day greeting title.
- An inline `SearchBar` (real `TextInput`, 300ms debounce) wired to the shared `useDrugSearch` hook.
- **Empty query →** dashboard sections: safety alerts, recent searches, saved shortcuts.
- **Non-empty query →** `DrugCard` results rendered **inline**; tapping a result records the query (`addRecent`) and `router.push('/drug/[atcCode]')`. A no-results `EmptyState` shows when appropriate.
- **Safety alerts** — `getActiveRecalls(db, role)`; each active recall is a tappable `Banner` → drug detail. Rendered **only** when `role ∈ {PHARMACIST, ADMIN}` and there are active recalls.
- **Recent** — `Chip`s from `recent-search-store`; tapping a chip sets the inline query (no navigation).
- **Saved** — up to 5 bookmarks; empty → "Browse medicines" prompt.
- The app **never navigates to a standalone search page/tab** — search is always inline on Home.

**`browse.tsx` — Browse**
`CollapsibleList` of therapeutic classes (`TherapeuticClassCard`, on ui-kit `ListRow`) → drugs within that class (`DrugCard`). Drill-down keeps internal state with an Android hardware-back handler returning to the class list. Local-only — no API call. Back button is accessible (`accessibilityRole`/`accessibilityLabel`/`hitSlop`).

**`saved.tsx` — Saved / Bookmarks**
`CollapsibleList` over `useBookmarkStore` (SQLite-backed, no API). Empty state uses `EmptyState` with a "Browse medicines" action.

**`profile.tsx` — Full Profile**
See [Profile & Identity](#profile--identity). Clinical-Calm full profile built from native-kit primitives inside `CollapsibleScreen`, driven by `useProfile` (cache-first → network).

### Drug Detail `drug/[atcCode].tsx`

Loads the drug from SQLite first (`getDrugRowByAtcCode` + `scopeEntryForRole`); falls back to the Hub API (`getDrugByAtcCodeApi(code, lang, token)`) if not found locally. The screen is restyled to the Clinical-Calm token system.

Header shows: primary name (localized if non-English), INN name + ATC code (clinical roles only), a therapeutic-class `Chip`, a bookmark toggle, and the share button.

**SafetyBanner:** when the entry has interactions, `SafetyBanner` renders **above the tab bar**, elevating CONTRAINDICATED + MAJOR interactions (CLAUDE.md safety rule).

Tabs rendered depend on role:

| Tab | Who Sees It | Source |
|---|---|---|
| **Overview** | Everyone | Tier 1 data |
| **Clinical** | DOCTOR, NURSE, LAB_TECH, PHARMACIST, ADMIN | Tier 2 data |
| **Pricing** | Everyone | Real-time API (geolocation required) |
| **Enrich** | DOCTOR, NURSE, LAB_TECH, PHARMACIST, ADMIN | POST mutation to Hub |

> The on-screen `Tab` type is `'overview' | 'clinical' | 'pricing' | 'enrich'`. **`FormularyTab.tsx` still exists as a component but is not currently mounted** in `[atcCode].tsx` — formulary status/recalls are surfaced via the Home safety-alerts section and `EnrichTab`. The tab indicator and bookmark spring animations honor `useReducedMotion()`.

**Deep link:** `pharmopedia://drug/A02BC01` navigates directly to this screen.

**Share:** Native share sheet sends `"${drugName}\npharmopedia://drug/${atcCode}"`.

#### ClinicalTab sections (Tier 2)

`ClinicalTab` takes `{ entry: DrugEntryTier2; lang: Lang }` and renders, in order (each section omitted when its data is absent), localized via a `localText(field, lang)` helper with English fallback:

- **Contraindications** — absolute contraindications (danger styling)
- **Drug interactions** — list with `SeverityBadge` (CONTRAINDICATED / MAJOR / MODERATE / MINOR) and the interaction **mechanism**
- **Mechanism of action**
- **Clinical indications**
- **Adverse events**
- **Adult dosing**
- **Pediatric dosing**
- **Pharmacokinetics** — half-life, protein binding, volume of distribution, metabolism, excretion
- **Administration notes** — localized
- **Pregnancy category**
- **Renal adjustment**

---

## Data Layer

### SQLite Schema (Version 3)

The local store is plain `expo-sqlite` (`pharmopedia.db`). Drug data is stored as **tier-partitioned JSON blobs** (not per-field columns), with flattened name columns for FTS. All column names are snake_case.

**`drug_catalog`** — one row per drug:

```sql
CREATE TABLE IF NOT EXISTS drug_catalog (
  atc_code          TEXT PRIMARY KEY,
  inn_name          TEXT NOT NULL,
  brand_names       TEXT,           -- JSON array, e.g. ["Augmentin"]
  dose_forms        TEXT,           -- JSON array, e.g. ["tablet","syrup"]
  therapeutic_class TEXT,
  local_names       TEXT,           -- JSON object, e.g. {"prs":"…","ps":"…"}
  tier1_json        TEXT NOT NULL,  -- DrugEntryTier1 serialized (all roles)
  tier2_json        TEXT,           -- DrugEntryTier2 serialized (clinical+); NULL for PATIENT
  tier3_json        TEXT,           -- DrugEntryTier3 serialized (pharmacist); NULL for clinical-
  version           INTEGER NOT NULL,
  brand_names_flat  TEXT NOT NULL DEFAULT '',  -- brand_names joined by space (FTS)
  local_names_flat  TEXT NOT NULL DEFAULT ''   -- local_names values joined by space (FTS)
)
```

**`drug_catalog_fts`** — FTS5 virtual table for full-text search:

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS drug_catalog_fts USING fts5(
  inn_name,
  atc_code,
  brand_names_flat,
  local_names_flat,
  content='drug_catalog',
  content_rowid='rowid',
  tokenize='unicode61'
)
```

Search uses prefix wildcards: `SELECT … FROM drug_catalog_fts WHERE drug_catalog_fts MATCH 'amox*'`.

**`sync_meta`** — single-row key-value table tracking sync state:

```sql
CREATE TABLE IF NOT EXISTS sync_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
)
-- Keys: 'lastVersion' (integer string), 'lastSyncAt' (ISO 8601)
```

**`bookmarks`** — user-saved drugs (survives sign-out, cleared on explicit reset):

```sql
CREATE TABLE IF NOT EXISTS bookmarks (
  atc_code          TEXT PRIMARY KEY,
  inn_name          TEXT NOT NULL,
  therapeutic_class TEXT,
  saved_at          TEXT NOT NULL
)
```

**`profile_cache`** — encrypted offline profile cache (added in v3):

```sql
CREATE TABLE IF NOT EXISTS profile_cache (
  sub        TEXT PRIMARY KEY,   -- auth user id
  ciphertext TEXT NOT NULL,      -- AES-256-GCM ciphertext (hex)
  iv         TEXT NOT NULL,      -- 12-byte GCM nonce (hex)
  updated_at TEXT NOT NULL
)
```

### Migrations

`migrations.ts` opens the DB (singleton) and runs forward migrations keyed off `PRAGMA user_version`:

- `< 1` → create base schema (drug_catalog, FTS, sync_meta) → `user_version = 1`
- `< 2` → create `bookmarks` → `user_version = 2`
- `< 3` → create `profile_cache` → `user_version = 3`

### Three-Tier Data Scoping

Drug data is pre-partitioned into `tier1_json` / `tier2_json` / `tier3_json` at sync time. `scopeEntryForRole(row, role)` selects the highest tier the caller is authorized for:

| Role group | Roles | Returned blob |
|---|---|---|
| **Pharmacist** | PHARMACIST, ADMIN | `tier3_json` → `tier2_json` → `tier1_json` |
| **Clinical** | DOCTOR, NURSE, LAB_TECH | `tier2_json` → `tier1_json` |
| **Patient / other** | PATIENT (and unauthenticated) | `tier1_json` |

At sync time, `tier2_json` is populated when the entry carries clinical fields (e.g. mechanism / clinical indications) and `tier3_json` when it carries pharmacist fields (formulary status / dispensing notes). The Hub API enforces the same scoping server-side — client-side scoping is an additional defense layer, not a security boundary.

### Encrypted Offline Profile Cache

The full profile renders offline from an **encrypted on-device cache**:

- **`secure-crypto.ts`** — AES-256-GCM via `@noble/ciphers` with a 12-byte CSPRNG nonce from `expo-crypto`. `getOrCreateCacheKey()` generates a 256-bit key once and stores it in **`expo-secure-store`** under key `'pharmopedia.profileCacheKey.v1'`. `encryptJson(obj)` → `{ ciphertext, iv }`; `decryptJson(blob)` → object; `clearCacheKey()` removes the key.
- **`profile-cache.ts`** — `writeProfileCache(db, sub, profile)` (encrypt + upsert into `profile_cache`), `readProfileCache(db, sub)` (select + decrypt; returns `null` on miss or decrypt failure), `clearProfileCache(db)` (delete all rows).
- **Wipe on logout:** both `clearProfileCache(db)` (rows) and `clearCacheKey()` (key) are called, so no PHI persists past logout.
- **Patient profile photos are PHI** — the `profile-photos` bucket is **private**; the Hub serves them via short-lived signed URLs (TTL ~3600s).

---

## Authentication System

The app distinguishes two audiences at the door via the **onboarding chooser**, then routes to one of two paths. All flows share a single Supabase project.

### Member path (Ultranos staff)

- Used by DOCTOR, NURSE, LAB_TECH, PHARMACIST, ADMIN (existing Ultranos accounts).
- `login.tsx`: `supabase.auth.signInWithPassword({ email, password })` + forgot-password (`resetPasswordForEmail`).
- Role and facilityId extracted from `session.user.app_metadata`.
- Members are backed by `practitioners` records (linked via `practitioners.auth_user_id`).

### Public path (self-registration)

- Used by new patients via the `register.tsx` signup wizard (phone → OTP → … → finish).
- OTP via `supabase.auth.signInWithOtp` / `verifyOtp`; the verified session is authenticated (`role: PATIENT`).
- A completed signup creates a real Hub `patients` record linked via `patients.auth_user_id` (`registerFromSession`).

### Account discovery & claim (O3 — identity model)

Because patient `telecom_phone` is **plaintext + unique** on `patients`, post-OTP discovery is an **exact phone match**:

- **`discover({ phone })`** → `{ matchType: 'none' | 'patient' | 'staff', candidate? }`.
  - **Staff** matched via a new **`practitioners.telecom_phone_index`** HMAC blind index (practitioner phone is AES-256-GCM encrypted, so equality lookup needs the blind index). Staff matches are **not claimable** — the wizard signs out and routes to member login.
  - **Patient** matched by exact phone; if unclaimed (or already the caller's), returns an **opaque `ref`** + masked name + birth year.
- **`claim({ ref, phone, birthYear })`** — re-resolves the caller's phone match, requires the supplied `ref` to match, and enforces a **birth-year second factor** before linking `patients.auth_user_id = ctx.user.sub`. DOB mismatch → `FORBIDDEN`.
- **`registerFromSession(...)`** (no match) — creates a new linked patient (mirrors the encrypted-insert path of `register`, runs MPI fuzzy dedup), without OTP re-verify.
- All three emit `AuditLogger` events with **opaque ids only** (no name/phone/DOB).

Identity model: public users are real `patients` rows linked via **`patients.auth_user_id`** (unique); staff are `practitioners` linked via `practitioners.auth_user_id`. Discover/claim are bound to the session's OTP-verified phone.

### Session Security

- `persistSession: false` — JWT never written to AsyncStorage or SecureStore.
- `autoRefreshToken: false` — no silent token refresh; user re-authenticates on app restart.
- Token stored only in `useAuthStore` (JS heap; cleared on app termination).
- All API calls send `Authorization: Bearer <token>` via `authHeaders()` in the API clients.

### Role Claims

```typescript
interface UserClaims {
  sub: string           // Supabase user UUID
  role: string          // 'PATIENT' | 'DOCTOR' | 'NURSE' | 'LAB_TECH' | 'PHARMACIST' | 'ADMIN'
  facilityId?: string   // Present for clinical staff; absent for patients
}
```

Claims are read from `session.user.app_metadata` (set server-side — never settable by the client).

---

## Profile & Identity

The Profile tab (`app/(tabs)/profile.tsx`) is a Clinical-Calm **full profile**, built from native-kit primitives inside `CollapsibleScreen` and driven by **`useProfile`**:

**Data flow (offline-first):**
1. On mount, `readProfileCache(db, sub)` → if present, render immediately (`source: 'cache'`).
2. If online, call `getProfile(token)` → render + `writeProfileCache(db, sub, profile)` (`source: 'network'`).
3. Network failure never blanks an already-rendered cached profile.

**Layout:**
- **Identity header** — `Avatar` (signed photo or initials) + display name + role `Chip` (+ tier `Chip` for patients).
- **Account / personal cards** — patient: phone, gender, age/DOB, blood group, current address, preferred language, tier (FREE/PREMIUM). Practitioner: role, email, phone, organization, facility, qualification, license + expiry, status.
- **Preferences card** — language + theme selectors.
- **Catalog sync card** — last-synced time + manual "Sync Now".
- **Log out** — destructive `Button`; also wipes the profile cache (rows + key).

The profile is fed by the Hub `users.getProfile` endpoint (see [API Layer](#api-layer)) — patient branch decrypts PHI and signs the photo URL; practitioner branch returns plaintext + decrypted phone + resolved org/facility names. Both audit the read with opaque ids only.

---

## API Layer

App-side API clients live in `apps/pharmopedia/src/api/`. All bridge tRPC-style URL encoding over standard HTTP and use **`hubFetch`** (certificate pinning + compromise detection), not native `fetch`.

**URL encoding:**
- GET queries: `?input={"json":{"key":"value"}}`
- POST mutations: body `{"json":{"key":"value"}}`
- Response envelope: `{ result: { data: { json: T } } }`

**Base URL:** `process.env.EXPO_PUBLIC_HUB_API_URL` (defaults to `http://localhost:3004/api/trpc`).

### `drug-catalog.ts`

| Function | Method | tRPC Path | Description |
|---|---|---|---|
| `searchDrugsApi(q, lang, limit, token)` | GET | `drugCatalog.search` | Text search across name fields (all 4 locales) |
| `getDrugByAtcCodeApi(atcCode, lang, token)` | GET | `drugCatalog.getByAtcCode` | Full entry, scoped to caller's role (**3-arg** signature) |
| `syncDrugsApi(sinceVersion, limit, token)` | GET | `drugCatalog.sync` | Paginated incremental sync (returns `latestVersion`) |
| `getDrugPricesApi(atcCode, lat, lng, sort, limit, token)` | GET | `drugCatalog.getPrices` | Pharmacy prices near lat/lng |
| `enrichDrugApi(atcCode, fields, token)` | POST | `drugCatalog.enrich` | Update localNames, dispensingNotes, formularyStatus, unitCost |

### `account.ts`

| Function | tRPC Path | Returns |
|---|---|---|
| `discoverAccount(token, { phone })` | `patientRegistration.discover` | `{ matchType: 'none'\|'patient'\|'staff', candidate? }` |
| `claimAccount(token, { ref, phone, birthYear })` | `patientRegistration.claim` | `{ ok: true }` |
| `registerFromSession(token, input)` | `patientRegistration.registerFromSession` | `{ patientId?, blocked? }` |

### `users.ts`

`getProfile(token)` → `users.getProfile` (GET). Exports the `UserProfile` discriminated union consumed by the profile screen and cache:

```typescript
export type UserProfile =
  | {
      kind: 'patient'; displayName: string; givenName: string; photoUrl?: string
      phone?: string; gender?: string; birthDate?: string; age?: number; bloodGroup?: string
      currentAddress?: { province?: string; district?: string; village?: string }
      preferredLanguage?: string; tier: 'FREE' | 'PREMIUM'
    }
  | {
      kind: 'practitioner'; displayName: string; givenName: string; familyName: string; role: string
      email?: string; phone?: string; organization?: string; facility?: string
      qualificationDisplay?: string; licenseId?: string; licenseExpiry?: string; status: string
    }
```

### Hub routers consumed

All registered in `apps/hub-api/src/trpc/routers/_app.ts`:

- **`drugCatalog`** — `search`, `getByAtcCode`, `sync`, `enrich`, `getPrices`, `setPrice` (see [Hub API Backend](#hub-api-backend-plan-1)).
- **`patientRegistration`** — existing `register` plus the new `discover`, `claim`, `registerFromSession` (`protectedProcedure`; blind-index staff lookup, birth-year-gated claim, opaque-id audits).
- **`users`** — `getProfile` (`protectedProcedure`; patient branch decrypts PHI + signs photo URL with `PHI_READ` audit; practitioner branch returns plaintext + decrypted phone + org/facility names with `READ` audit; never throws on a missing record).

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

> Identity-side schema additions from O3/E4: **`patients.auth_user_id`** (unique; links a public auth user to their record) and **`practitioners.telecom_phone_index`** (HMAC blind index for staff phone equality lookup). The patient `photo_url` column holds a private-bucket **object path** (signed on read), not a public URL.

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
2. `runSync(...)` fetches drugs in pages via `syncDrugsApi(sinceVersion, limit, token)`.
3. Each page is upserted into `drug_catalog` and indexed in `drug_catalog_fts`.
4. `onProgress(count)` fires after each page, updating `syncedCount` in `useSyncStore` → displayed in `SyncStatusBanner`.
5. On completion, the latest catalog version is recorded in `sync_meta`.
6. On next sync, the stored version is the `sinceVersion` — only changed drugs are downloaded.

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
- the database is ready (`isDatabaseReady()`)

Manual sync via the Profile "Sync Now" button resets `syncedCount` to 0 before syncing, so the progress counter restarts cleanly.

### `SyncStatusBanner`

Renders a status banner across tab screens:

| State | Display |
|---|---|
| `syncing`, `syncedCount === 0` | "Syncing catalog…" |
| `syncing`, `syncedCount > 0` | "Syncing catalog… 450 drugs" |
| `error` | Error banner with warning |
| `idle`, `lastSyncAt === null` | "Catalog not yet synced" warning |
| `idle`, `lastSyncAt` set | Hidden (no banner) |

The count fade animation honors `useReducedMotion()`.

---

## Internationalization

**Supported languages:**

| Code | Language | Direction | Phone OTP prefix |
|---|---|---|---|
| `en` | English | LTR | — |
| `prs` | Dari (Farsi of Afghanistan) | RTL | `‏` (RLM) |
| `ps` | Pashto | RTL | `‏` (RLM) |
| `ar` | Arabic | RTL | `‏` (RLM) |

All four locales are now **fully translated** (the prs/ps/ar English stubs that previously remained in `formulary`, `register`, and `drug.clinical` pharmacokinetics/severity were completed in E6).

**Language switching** (`lang-store.ts`):
- Selection persisted to SecureStore.
- RTL languages call `I18nManager.forceRTL(true)` + `Updates.reloadAsync()` — full app reload required for RN RTL to apply globally.
- LTR-to-LTR switches apply without reload.

**Localized drug content:**
- `local_names` JSON holds translated drug names per language code.
- `OverviewTab` / `ClinicalTab` use a `localText(field, lang)` helper: tries `field[lang]`, falls back to `field['en']`.
- `getDrugsByTherapeuticClass` returns `localNames[lang]` per language — including `'ar'` (the prior Arabic fallback bug is fixed).

**Translation namespace keys (top-level):**

```
tabs, home, search, sync, drug, pricing, enrich, formulary, browse, saved,
common, net, welcome, coach, profile, login, register, onboarding, signup
```

All 4 locale files (`en.ts`, `prs.ts`, `ps.ts`, `ar.ts`) must stay structurally identical — `Translations = typeof en` enforces this at compile time, and a runtime **`locale-parity.test.ts`** asserts deep key parity AND that no `prs/ps/ar` leaf value equals its `en` value (except an explicit allowlist of legitimately-identical tokens, e.g. language-selector labels).

---

## Accessibility & Reduced Motion

The E6 polish pass brought the app to an accessibility + motion bar:

- **Roles & labels** — interactive controls carry `accessibilityRole` and composed `accessibilityLabel`s with `hitSlop` for ≥44px targets. Drug-detail tabs are `role="tab"` with `accessibilityState={{ selected }}`; single-select groups use `role="radio"` inside `role="radiogroup"`; buttons expose `accessibilityState` (`disabled`/`busy`). `ListRow` enforces `minHeight: 48` + `hitSlop`. The Browse back button and `TherapeuticClassCard` (previously gaps) now expose roles + labels.
- **Reduced motion** — the shared **`useReducedMotion()`** hook (in `@ultranos/ui-kit/native`, `AccessibilityInfo`-based with a `reduceMotionChanged` subscription) gates **all autonomous animations**: drug-detail tab indicator + bookmark spring, `SkeletonCard` shimmer, `SyncStatusBanner` count fade, `TherapeuticClassCard`/`NetStatusBanner`/`PriceCard`/`CoachMark` entry animations. The one intentional exception is the scroll-linked `CollapsibleScreen` header fade, which is **driven by user scroll** (not autonomous) and is therefore exempt.

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

- SQLite database file on device contains drug catalog data (not PHI).
- Bookmarks store ATC codes and drug names only — no patient data.
- The **`profile_cache`** table is the only on-device store of patient PHI; it is **AES-256-GCM encrypted** with a key held in `expo-secure-store`, and is wiped (rows + key) on logout.
- Recent search queries (drug-name strings, not PHI) are persisted in SecureStore, capped at 10.
- Patient profile photos are PHI: served from a **private** bucket via short-lived signed URLs; the stored value is an object path, never a public URL.

---

## Test Coverage

**Total: 294 tests across 70 test files**
**Runner:** Vitest + @testing-library/react-native (a Jest mirror suite also exists)

Notable test files added during the overhaul:

| Test file | What it covers |
|---|---|
| `ui-native/*.test.tsx` | The native-kit primitives (Screen, ScreenHeader, Card, ListRow, Button, Avatar, Chip, Banner, EmptyState, CollapsibleList, CollapsibleScreen, theme) |
| `ui-native/use-reduced-motion.test.ts` | `useReducedMotion` hook (mocked `AccessibilityInfo`) |
| `reduced-motion.test.tsx` | Static-path rendering under reduced motion |
| `locale-parity.test.ts` | Deep key parity + no untranslated stubs (with allowlist) |
| `drug-card-restyle.test.tsx` | DrugCard on ui-kit Card (LTR + RTL) |
| `therapeutic-class-card.test.tsx` | TherapeuticClassCard on ui-kit ListRow + a11y |
| `accessibility-roles.test.tsx` | Roles/labels across controls incl. Browse back button |
| `onboarding-screen.test.tsx` | Entry chooser routes to login/register |
| `auth-shell.test.tsx` | Shared auth shell |
| `signup-wizard.test.tsx` | Wizard step navigation/validation + discovery branches |
| `picker-field.test.tsx` / `address-pickers.test.tsx` / `photo-picker.test.tsx` | Signup components |
| `account-api.test.ts` | `discover`/`claim`/`registerFromSession` client encoding |
| `users-api.test.ts` | `getProfile` client encoding + `UserProfile` |
| `secure-crypto.test.ts` | AES-256-GCM encrypt→decrypt round-trip |
| `profile-cache.test.ts` | Encrypted cache write/read/clear |
| `use-profile.test.ts` | Cache-first → network profile flow |
| `profile-screen.test.tsx` / `profile-rtl.test.tsx` | Full profile (patient/practitioner, offline, RTL) |
| `use-drug-search.test.ts` | Inline search hook (debounce, FTS vs API branch, graceful failure) |
| `home-screen.test.tsx` | Home dashboard + inline search results / navigation |
| `clinical-tab-extended.test.tsx` | Completed ClinicalTab sections + safety elevation |
| `safety-banner.test.tsx` / `severity-badge.test.tsx` / `section-card.test.tsx` | Drug-detail safety surfaces |
| `recalls.test.ts` | `getActiveRecalls` role-gating + malformed-JSON tolerance |
| `recent-search-store.test.ts` / `theme-store.test.ts` / `coach-mark-store.test.ts` | New stores |
| `password-reset.test.tsx` | Login forgot-password flow |
| `arabic-search.test.ts` | Arabic FTS search (fixed `'ar'` lang) |

(Plus the carried-over suites: login/welcome screens, browse/saved tabs, drug-detail, overview/pricing/enrich/formulary tabs, sync-status-banner, use-auto-sync, drug-catalog db/api, bookmark/lang/sync stores, etc.)

> Hub-side O3/E4 tests (`discover`/`claim`/`registerFromSession`, `users.getProfile`, blind-index backfill) live under `apps/hub-api/` and run via `pnpm -F @ultranos/hub-api test`.

---

## What's Next

### Resolved during the overhaul

The two prior "Known Bugs" are **fixed**:
- `fts.ts` `searchDrugs` now accepts `lang: 'en' | 'prs' | 'ps' | 'ar'` — Arabic search uses the correct columns.
- `browse.ts` `getDrugsByTherapeuticClass` returns `localNames[lang]` for all non-English languages including `'ar'`.

Also shipped: **password reset** (forgot-password on member login), **light/dark theming**, **full prs/ps/ar translation**, inline Home search, the encrypted profile cache, and the reduced-motion pass.

### Open items (near/medium-term)

1. **Re-mount or retire `FormularyTab`** — the component exists but is no longer wired into the drug-detail tab bar; decide whether to surface it again (e.g. a Formulary tab for pharmacist/admin) or remove it.
2. **Language change doesn't re-fetch drug detail** — content fetched on mount is stale after an in-place language switch until navigation away and back.
3. **Pagination on search results** — inline search returns a fixed limit with no load-more.
4. **Notifications infrastructure** — push delivery for drug recalls / formulary changes (the deep-link scheme + Home safety-alerts surface exist; the backend delivery pipeline is not built).
5. **Offline enrich queue** — `enrichDrugApi` (POST) fails silently offline; a durable offline queue should buffer and replay.
6. **Deeper OPD Lite / Pharmacy Lite integration** — return-to-caller after deep link; inline formulary status in OPD Lite; pulling Pharmopedia pricing into Pharmacy Lite valuation; formulary substitutes in dispensing.
7. **Conflict resolution for enrich fields** — concurrent pharmacist enrichment is last-write-wins; Tier 2 keep-both-as-addenda should apply to `localNames`/`dispensingNotes`.
8. **Audit logging for app-side enrich** — `enrichDrugApi` mutations should emit `@ultranos/audit-logger` events.
9. **Native-speaker translation QA** — AI-generated Dari/Pashto/Arabic clinical terms are flagged for verification before release.
10. **DrugBank integration** — the ETL `drugbank.ts` source remains a stub pending a commercial license.
11. **Full SQLCipher migration** of the local store (today only `profile_cache` is encrypted) and **address-at-rest encryption** on patients remain dedicated cross-cutting stories.

---

## Appendix: Key Constants & Identifiers

| Item | Value |
|---|---|
| Deep link scheme | `pharmopedia://` |
| Drug detail URL pattern | `pharmopedia://drug/:atcCode` |
| Hub API default URL | `http://localhost:3004/api/trpc` |
| Env var for Hub URL | `EXPO_PUBLIC_HUB_API_URL` |
| SQLite schema version | `3` |
| Search debounce delay | `300ms` |
| Recent searches cap | `10` |
| Profile-cache key (SecureStore) | `'pharmopedia.profileCacheKey.v1'` |
| Profile cache crypto | AES-256-GCM (`@noble/ciphers`), 12-byte CSPRNG nonce (`expo-crypto`) |
| Signed-URL TTL (profile photos) | `3600s` (1 hour) |
| Profile photo bucket | `profile-photos` (private) |
| Identity link columns | `patients.auth_user_id` (unique); `practitioners.telecom_phone_index` (HMAC blind index) |
| ui-kit native export | `@ultranos/ui-kit/native` → `packages/ui-kit/src/native/index.ts` (source, not `dist/`) |
| Clinical roles | `DOCTOR, NURSE, LAB_TECH, PHARMACIST, ADMIN` |
| Pharmacist roles | `PHARMACIST, ADMIN` |
| Patient role | `PATIENT` |
</content>
</invoke>
