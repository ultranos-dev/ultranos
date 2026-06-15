# Pharmopedia Plan 3a — Hub API Fix + App Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix brand-name search in the Hub API, scaffold the Pharmopedia Expo app, copy the security fetch stack, and create the SQLite schema with FTS5.

**Architecture:** Four independent foundation tasks that must be completed before Plans 3b/3c. Tasks 1–2 are backend + scaffold; Tasks 3–4 are pure TypeScript with no runtime dependencies on each other.

**Tech Stack:** Supabase MCP (migrations), Expo SDK ~52, expo-sqlite ~14, TypeScript 5, Vitest/Jest

**Spec:** `docs/superpowers/specs/2026-06-12-pharmopedia-plan-3-design.md`
**Continues with:** `2026-06-12-pharmopedia-plan-3b-data-layer.md`

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `apps/hub-api/src/trpc/routers/drug-catalog.ts` | Modify | Add `brand_names_text` to search OR filter |
| `apps/pharmopedia/package.json` | Create | Expo app dependencies |
| `apps/pharmopedia/app.config.ts` | Create | Expo config (scheme, plugins) |
| `apps/pharmopedia/tsconfig.json` | Create | TypeScript config |
| `apps/pharmopedia/babel.config.js` | Create | Babel with module-resolver for `@/` alias |
| `apps/pharmopedia/jest.config.js` | Create | jest-expo preset |
| `apps/pharmopedia/src/config/certificate-pins.ts` | Create | SHA-256 SPKI pins (copied from patient-lite-mobile) |
| `apps/pharmopedia/src/lib/pinned-fetch.ts` | Create | SSL-pinned fetch (copied from patient-lite-mobile) |
| `apps/pharmopedia/src/stores/device-security-store.ts` | Create | Device compromise state (copied from patient-lite-mobile) |
| `apps/pharmopedia/src/lib/hub-fetch.ts` | Create | Certificate-pinned Hub API fetch (adapted from patient-lite-mobile) |
| `apps/pharmopedia/src/db/schema.ts` | Create | SQLite DDL: drug_catalog, drug_catalog_fts, sync_meta |
| `apps/pharmopedia/src/db/migrations.ts` | Create | Schema version management via PRAGMA user_version |
| `apps/pharmopedia/__tests__/db/schema.test.ts` | Create | Schema creation + FTS5 smoke tests |

---

## Task 1: Brand-Name Search — Hub API Migration + Router Update

**Context:** The `drugCatalog.search` tRPC endpoint currently searches `inn_name`, `atc_code`, and `local_names` only. Brand name search requires a generated column on the Supabase `drug_catalog` table. This also enables brand-name search in the API fallback path used by Pharmopedia before its first sync completes.

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/drug-catalog.ts:38-43`
- Migration: applied via Supabase MCP tool

- [ ] **Step 1: Check pg_trgm extension is enabled**

Use the Supabase MCP tool:
```
mcp__plugin_supabase_supabase__list_extensions
```
Verify `pg_trgm` appears in the result with `installed_version` set. Supabase enables pg_trgm by default — if missing, run `CREATE EXTENSION IF NOT EXISTS pg_trgm;` as a migration first.

- [ ] **Step 2: Apply the migration**

Use `mcp__plugin_supabase_supabase__apply_migration` with name `add_drug_catalog_brand_names_text`:

```sql
-- Add generated column that flattens brand_names TEXT[] to a single searchable string
ALTER TABLE drug_catalog
  ADD COLUMN IF NOT EXISTS brand_names_text TEXT
  GENERATED ALWAYS AS (array_to_string(brand_names, ' ')) STORED;

-- Trigram index supports ILIKE queries (required for PostgREST .ilike. filter)
CREATE INDEX IF NOT EXISTS idx_drug_catalog_brand_names_trgm
  ON drug_catalog USING gin(brand_names_text gin_trgm_ops);
```

- [ ] **Step 3: Verify the migration**

Use `mcp__plugin_supabase_supabase__execute_sql`:
```sql
SELECT atc_code, brand_names, brand_names_text
FROM drug_catalog
LIMIT 5;
```
Expected: `brand_names_text` column exists and contains space-joined brand name strings.

- [ ] **Step 4: Write the failing test for brand-name search**

Add to `apps/hub-api/src/trpc/routers/__tests__/drug-catalog.test.ts` (or create it if it doesn't exist yet — check first with `ls apps/hub-api/src/trpc/routers/__tests__/`):

```typescript
it('search returns results matching brand name', async () => {
  // This test verifies brand_names_text is included in the search OR filter.
  // Uses a mock supabase that captures the .or() argument.
  const orArg = capturedOrArgument // set up mock to capture this
  expect(orArg).toContain('brand_names_text.ilike.')
})
```

Run: `pnpm -F hub-api test -- --testPathPattern drug-catalog`
Expected: FAIL (brand_names_text not in OR filter yet)

- [ ] **Step 5: Update the search router**

In `apps/hub-api/src/trpc/routers/drug-catalog.ts`, update the `.or()` call at line ~38:

```typescript
// Before:
.or([
  `inn_name.ilike.${likeQ}`,
  `atc_code.ilike.${likeQ}`,
  `local_names::text.ilike.${likeQ}`,
].join(','))

// After:
.or([
  `inn_name.ilike.${likeQ}`,
  `atc_code.ilike.${likeQ}`,
  `local_names::text.ilike.${likeQ}`,
  `brand_names_text.ilike.${likeQ}`,
].join(','))
```

- [ ] **Step 6: Run tests**

```bash
pnpm -F hub-api test -- --testPathPattern drug-catalog
```
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/hub-api/src/trpc/routers/drug-catalog.ts
git commit -m "feat(hub-api): add brand_names_text generated column and include in drug search"
```

---

## Task 2: App Scaffold

**Context:** Create the `apps/pharmopedia/` Expo app. This app uses expo-router (file-based navigation, standard for Expo SDK 52) instead of react-navigation. The `pnpm-workspace.yaml` already includes `apps/*` so no workspace change is needed.

**Files:** All created fresh under `apps/pharmopedia/`

- [ ] **Step 1: Create package.json**

Create `apps/pharmopedia/package.json`:

```json
{
  "name": "@ultranos/pharmopedia",
  "version": "0.1.0",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "test": "jest",
    "test:watch": "jest --watch",
    "typecheck": "tsc --noEmit",
    "lint": "eslint . --ext .ts,.tsx"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.49.0",
    "@ultranos/shared-types": "workspace:*",
    "expo": "~52.0.0",
    "expo-location": "~18.0.0",
    "expo-router": "~4.0.0",
    "expo-secure-store": "~14.0.0",
    "expo-sqlite": "~14.0.0",
    "expo-status-bar": "~2.0.0",
    "i18next": "^26.2.0",
    "react": "^19.0.0",
    "react-i18next": "^17.0.8",
    "react-native": "~0.76.0",
    "react-native-safe-area-context": "4.12.0",
    "react-native-screens": "~4.4.0",
    "react-native-ssl-pinning": "^1.8.0",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@babel/core": "^7.24.0",
    "@testing-library/react-native": "^12.0.0",
    "@types/react": "^19.0.0",
    "babel-plugin-module-resolver": "^5.0.0",
    "jest": "^29.0.0",
    "jest-expo": "~52.0.0",
    "react-test-renderer": "^19.0.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create app.config.ts**

Create `apps/pharmopedia/app.config.ts`:

```typescript
import type { ExpoConfig, ConfigContext } from 'expo/config'

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Pharmopedia',
  slug: 'pharmopedia',
  version: '0.1.0',
  scheme: 'pharmopedia',
  web: { bundler: 'metro', output: 'static' },
  plugins: [
    'expo-router',
    'expo-sqlite',
    'expo-secure-store',
    ['expo-location', { locationAlwaysAndWhenInUsePermission: 'Allow Pharmopedia to use your location to find nearby pharmacies.' }],
  ],
  experiments: { typedRoutes: true },
})
```

- [ ] **Step 3: Create tsconfig.json**

Create `apps/pharmopedia/tsconfig.json`:

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.d.ts", "expo-env.d.ts"]
}
```

- [ ] **Step 4: Create babel.config.js**

Create `apps/pharmopedia/babel.config.js`:

```javascript
module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['.'],
          alias: { '@': './src' },
          extensions: ['.ios.js', '.android.js', '.js', '.ts', '.tsx', '.json'],
        },
      ],
    ],
  }
}
```

- [ ] **Step 5: Create jest.config.js**

Create `apps/pharmopedia/jest.config.js`:

```javascript
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterFramework: ['@testing-library/react-native/extend-expect'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
}
```

- [ ] **Step 6: Install dependencies**

```bash
pnpm install
```
Expected: workspace resolves `@ultranos/shared-types` locally; no errors.

- [ ] **Step 7: Verify TypeScript compiles**

```bash
pnpm -F @ultranos/pharmopedia typecheck
```
Expected: No errors (only config files exist so far).

- [ ] **Step 8: Commit**

```bash
git add apps/pharmopedia/
git commit -m "feat(pharmopedia): scaffold Expo app with expo-router, expo-sqlite, zustand"
```

---

## Task 3: Security Stack

**Context:** All Hub API calls go through a certificate-pinned fetch wrapper. Copy the security stack from `apps/patient-lite-mobile/src/` verbatim — it uses `react-native-ssl-pinning` on mobile and standard `fetch` on web. The `hub-fetch.ts` additionally gates write operations on device compromise state. The device-security-store starts unchecked (writes blocked until initialized); Task 9 (root layout) will call `setResult` on app startup to unblock writes.

**Files:**
- Create: `apps/pharmopedia/src/config/certificate-pins.ts`
- Create: `apps/pharmopedia/src/lib/pinned-fetch.ts`
- Create: `apps/pharmopedia/src/stores/device-security-store.ts`
- Create: `apps/pharmopedia/src/lib/hub-fetch.ts`

- [ ] **Step 1: Create certificate-pins.ts**

Create `apps/pharmopedia/src/config/certificate-pins.ts`:

```typescript
/**
 * Certificate Pinning Configuration — Pharmopedia.
 * Copied from apps/patient-lite-mobile/src/config/certificate-pins.ts.
 *
 * PIN ROTATION PROCEDURE:
 * 1. Add new pin hash, deploy app with both pins
 * 2. After all clients update, remove old pin
 *
 * To compute a pin from a PEM certificate:
 *   openssl x509 -in cert.pem -pubkey -noout |
 *     openssl pkey -pubin -outform der |
 *     openssl dgst -sha256 -binary |
 *     openssl enc -base64
 */

export interface CertificatePin {
  hash: string   // Base64-encoded SHA-256 SPKI hash
  label: string
}

export const HUB_API_PINS: CertificatePin[] = [
  {
    hash: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    label: 'Hub API leaf certificate (placeholder — replace before production)',
  },
  {
    hash: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=',
    label: 'CA intermediate backup pin (placeholder — replace before production)',
  },
]

export const MIN_TLS_VERSION = 'TLSv1.3' as const
export const LAST_ROTATED = '2026-06-12'

export function validatePins(): void {
  if (__DEV__) return
  const validBase64Pin = /^[A-Za-z0-9+/]{43}=$/
  for (const pin of HUB_API_PINS) {
    if (!validBase64Pin.test(pin.hash)) {
      throw new Error(`FATAL: Certificate pin "${pin.label}" has invalid hash format.`)
    }
    const uniqueChars = new Set(pin.hash.replace(/=+$/, '')).size
    if (uniqueChars < 4) {
      throw new Error(`FATAL: Certificate pin "${pin.label}" appears to be a placeholder.`)
    }
  }
}
```

- [ ] **Step 2: Create pinned-fetch.ts**

Create `apps/pharmopedia/src/lib/pinned-fetch.ts`:

```typescript
/**
 * Certificate-pinned HTTP client — Pharmopedia.
 * Copied from apps/patient-lite-mobile/src/lib/pinned-fetch.ts.
 */
import { Platform } from 'react-native'
import { HUB_API_PINS, MIN_TLS_VERSION } from '@/config/certificate-pins'

export interface PinnedFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  headers?: Record<string, string>
  body?: string
}

export interface PinnedFetchResponse {
  status: number
  headers: Record<string, string>
  json: <T>() => Promise<T>
  text: () => Promise<string>
}

export class CertificatePinningError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CertificatePinningError'
  }
}

export async function pinnedFetch(
  url: string,
  options: PinnedFetchOptions = {},
): Promise<PinnedFetchResponse> {
  if (Platform.OS === 'web') {
    return webFallback(url, options)
  }
  return mobilePinnedFetch(url, options)
}

async function mobilePinnedFetch(
  url: string,
  options: PinnedFetchOptions,
): Promise<PinnedFetchResponse> {
  try {
    const { fetch: sslFetch } = require('react-native-ssl-pinning')
    const pinHashes = HUB_API_PINS.map((pin) => pin.hash)
    const response = await sslFetch(url, {
      method: options.method ?? 'GET',
      headers: options.headers ?? {},
      body: options.body,
      sslPinning: { certs: pinHashes },
      timeoutInterval: 30000,
      pkPinning: true,
    })
    let bodyText: string
    if (typeof response.bodyString === 'string') {
      bodyText = response.bodyString
    } else if (response.json != null) {
      bodyText = JSON.stringify(response.json)
    } else if (response.data != null) {
      bodyText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
    } else {
      bodyText = ''
    }
    return {
      status: response.status,
      headers: response.headers ?? {},
      json: async <T>() => JSON.parse(bodyText) as T,
      text: async () => bodyText,
    }
  } catch (error: unknown) {
    throw new CertificatePinningError(
      `Certificate pinning validation failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

async function webFallback(
  url: string,
  options: PinnedFetchOptions,
): Promise<PinnedFetchResponse> {
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: options.headers,
    body: options.body,
  })
  const text = await response.text()
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    json: async <T>() => JSON.parse(text) as T,
    text: async () => text,
  }
}
```

- [ ] **Step 3: Create device-security-store.ts**

Create `apps/pharmopedia/src/stores/device-security-store.ts`:

```typescript
/**
 * Device Security Store — Pharmopedia.
 * Copied from apps/patient-lite-mobile/src/stores/device-security-store.ts.
 *
 * Stores device integrity state. hub-fetch blocks write operations until
 * `checked` is true. The root layout (_layout.tsx) must call setResult()
 * on app startup to unblock writes.
 */
import { create } from 'zustand'

export interface DeviceIntegrityResult {
  isCompromised: boolean
  reasons: string[]
}

interface DeviceSecurityState {
  checked: boolean
  isCompromised: boolean
  reasons: string[]
  checkedAt: string | null
  setResult: (result: DeviceIntegrityResult) => void
}

export const useDeviceSecurityStore = create<DeviceSecurityState>((set) => ({
  checked: false,
  isCompromised: false,
  reasons: [],
  checkedAt: null,
  setResult: (result) =>
    set((state) => ({
      checked: true,
      isCompromised: state.isCompromised || result.isCompromised,
      reasons: state.isCompromised ? state.reasons : result.reasons,
      checkedAt: new Date().toISOString(),
    })),
}))
```

- [ ] **Step 4: Create hub-fetch.ts**

Create `apps/pharmopedia/src/lib/hub-fetch.ts`:

```typescript
/**
 * Hub API fetch wrapper — certificate-pinned, compromise-aware.
 * Adapted from apps/patient-lite-mobile/src/lib/hub-fetch.ts.
 *
 * Drop-in replacement for native fetch. All Hub API calls must use hubFetch.
 */
import { pinnedFetch } from '@/lib/pinned-fetch'
import { useDeviceSecurityStore } from '@/stores/device-security-store'

export class CompromisedDeviceError extends Error {
  constructor() {
    super('Write operations are blocked on compromised devices.')
    this.name = 'CompromisedDeviceError'
  }
}

export async function hubFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase()

  const { checked, isCompromised } = useDeviceSecurityStore.getState()
  if (method !== 'GET' && (isCompromised || !checked)) {
    throw new CompromisedDeviceError()
  }

  const headers: Record<string, string> = {}
  if (init?.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((value, key) => { headers[key] = value })
    } else if (Array.isArray(init.headers)) {
      for (const [key, value] of init.headers) { headers[key] = value }
    } else {
      Object.assign(headers, init.headers)
    }
  }

  if (init?.body != null && typeof init.body !== 'string') {
    throw new TypeError('hubFetch only supports string bodies. Use JSON.stringify() for objects.')
  }

  const response = await pinnedFetch(url, {
    method: method as 'GET' | 'POST' | 'PUT' | 'DELETE',
    headers,
    body: init?.body as string | undefined,
  })

  const bodyText = await response.text()

  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    statusText: '',
    headers: new Headers(response.headers),
    json: async () => JSON.parse(bodyText),
    text: async () => bodyText,
    body: null,
    bodyUsed: true,
    redirected: false,
    type: 'basic' as ResponseType,
    url,
    clone: () => { throw new Error('clone() not supported on hubFetch response') },
    arrayBuffer: async () => new TextEncoder().encode(bodyText).buffer as ArrayBuffer,
    blob: async () => new Blob([bodyText]),
    formData: async () => { throw new Error('formData() not supported') },
    bytes: async () => new TextEncoder().encode(bodyText),
  } as Response
}
```

- [ ] **Step 5: Typecheck**

```bash
pnpm -F @ultranos/pharmopedia typecheck
```
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add apps/pharmopedia/src/config/ apps/pharmopedia/src/lib/hub-fetch.ts apps/pharmopedia/src/lib/pinned-fetch.ts apps/pharmopedia/src/stores/device-security-store.ts
git commit -m "feat(pharmopedia): add certificate-pinned fetch stack"
```

---

## Task 4: SQLite Schema + Migrations

**Context:** The local database has three tables: `drug_catalog` (main data), `drug_catalog_fts` (FTS5 content table for offline search), and `sync_meta` (stores `lastVersion` and `lastSyncAt`). The FTS5 table uses `content='drug_catalog'` with a `REBUILD` command run after each sync batch — this keeps the approach simple without requiring per-row triggers. The `drug_catalog` table includes pre-computed `brand_names_flat` and `local_names_flat` columns (set in application code at upsert time) which the FTS5 index reads from. Schema version is tracked via SQLite's `PRAGMA user_version`.

**Files:**
- Create: `apps/pharmopedia/src/db/schema.ts`
- Create: `apps/pharmopedia/src/db/migrations.ts`
- Create: `apps/pharmopedia/__tests__/db/schema.test.ts`

- [ ] **Step 1: Write the failing schema tests**

Create `apps/pharmopedia/__tests__/db/schema.test.ts`:

```typescript
import * as SQLite from 'expo-sqlite'
import { openDatabase } from '@/db/migrations'

// expo-sqlite is mocked by jest-expo; we need a real in-process SQLite.
// Use jest.mock to provide an in-memory db backed by the bundled SQLite.
jest.mock('expo-sqlite', () => {
  const actual = jest.requireActual('expo-sqlite')
  return actual
})

describe('schema migrations', () => {
  let db: SQLite.SQLiteDatabase

  beforeEach(async () => {
    db = await SQLite.openDatabaseAsync(':memory:')
    await openDatabase(':memory:', db)
  })

  afterEach(async () => {
    await db.closeAsync()
  })

  it('creates drug_catalog table', async () => {
    const result = await db.getFirstAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='drug_catalog'`
    )
    expect(result?.name).toBe('drug_catalog')
  })

  it('creates drug_catalog_fts virtual table', async () => {
    const result = await db.getFirstAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='drug_catalog_fts'`
    )
    expect(result?.name).toBe('drug_catalog_fts')
  })

  it('creates sync_meta table', async () => {
    const result = await db.getFirstAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='sync_meta'`
    )
    expect(result?.name).toBe('sync_meta')
  })

  it('sets user_version to SCHEMA_VERSION after migration', async () => {
    const result = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version')
    expect(result?.user_version).toBe(1)
  })

  it('FTS5 MATCH query returns matching row after insert', async () => {
    await db.runAsync(
      `INSERT INTO drug_catalog
         (atc_code, inn_name, brand_names, dose_forms, therapeutic_class, local_names,
          tier1_json, version, brand_names_flat, local_names_flat)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['J01CA04', 'amoxicillin', '["Augmentin","Amoxil"]', '["tablet"]',
       'Antibiotic', '{}', '{}', 1, 'Augmentin Amoxil', '']
    )
    // Rebuild FTS index after insert
    await db.runAsync(`INSERT INTO drug_catalog_fts(drug_catalog_fts) VALUES('rebuild')`)

    const ftsResult = await db.getFirstAsync<{ atc_code: string }>(
      `SELECT dc.atc_code FROM drug_catalog dc
       JOIN drug_catalog_fts fts ON fts.rowid = dc.rowid
       WHERE drug_catalog_fts MATCH 'augmentin*'`
    )
    expect(ftsResult?.atc_code).toBe('J01CA04')
  })

  it('FTS5 MATCH on inn_name returns matching row', async () => {
    await db.runAsync(
      `INSERT INTO drug_catalog
         (atc_code, inn_name, brand_names, dose_forms, therapeutic_class, local_names,
          tier1_json, version, brand_names_flat, local_names_flat)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['N02BE01', 'paracetamol', '["Panadol"]', '["tablet"]',
       'Analgesic', '{}', '{}', 1, 'Panadol', '']
    )
    await db.runAsync(`INSERT INTO drug_catalog_fts(drug_catalog_fts) VALUES('rebuild')`)

    const ftsResult = await db.getFirstAsync<{ atc_code: string }>(
      `SELECT dc.atc_code FROM drug_catalog dc
       JOIN drug_catalog_fts fts ON fts.rowid = dc.rowid
       WHERE drug_catalog_fts MATCH 'para*'`
    )
    expect(ftsResult?.atc_code).toBe('N02BE01')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm -F @ultranos/pharmopedia test -- --testPathPattern schema
```
Expected: FAIL — `Cannot find module '@/db/migrations'`

- [ ] **Step 3: Create schema.ts**

Create `apps/pharmopedia/src/db/schema.ts`:

```typescript
export const DB_NAME = 'pharmopedia.db'
export const SCHEMA_VERSION = 1

/**
 * Full DDL for the Pharmopedia local database.
 *
 * drug_catalog: stores tier-scoped JSON payloads from Hub API sync.
 *   brand_names_flat / local_names_flat: pre-computed space-joined search text
 *   (populated by application code at upsert time, not generated columns).
 *
 * drug_catalog_fts: FTS5 content table over drug_catalog.
 *   Rebuilt via `INSERT INTO drug_catalog_fts(drug_catalog_fts) VALUES('rebuild')`
 *   after each sync batch. inn_name + atc_code + brand_names_flat + local_names_flat
 *   are indexed for full-text search.
 *
 * sync_meta: key-value store for sync state.
 *   Keys: 'lastVersion' (integer string), 'lastSyncAt' (ISO 8601 string)
 */
export const CREATE_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS drug_catalog (
    atc_code          TEXT PRIMARY KEY,
    inn_name          TEXT NOT NULL,
    brand_names       TEXT,          -- JSON array e.g. ["Augmentin"]
    dose_forms        TEXT,          -- JSON array e.g. ["tablet","syrup"]
    therapeutic_class TEXT,
    local_names       TEXT,          -- JSON object e.g. {"prs":"آموکسیسیلین","ps":"..."}
    tier1_json        TEXT NOT NULL, -- DrugEntryTier1 serialised (all roles)
    tier2_json        TEXT,          -- DrugEntryTier2 serialised (clinical+); NULL for PATIENT
    tier3_json        TEXT,          -- DrugEntryTier3 serialised (pharmacist); NULL for clinical-
    version           INTEGER NOT NULL,
    brand_names_flat  TEXT NOT NULL DEFAULT '',  -- brand_names array joined by space
    local_names_flat  TEXT NOT NULL DEFAULT ''   -- local_names object values joined by space
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS drug_catalog_fts USING fts5(
    inn_name,
    atc_code,
    brand_names_flat,
    local_names_flat,
    content='drug_catalog',
    content_rowid='rowid',
    tokenize='unicode61'
  );

  CREATE TABLE IF NOT EXISTS sync_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`
```

- [ ] **Step 4: Create migrations.ts**

Create `apps/pharmopedia/src/db/migrations.ts`:

```typescript
import * as SQLite from 'expo-sqlite'
import { DB_NAME, SCHEMA_VERSION, CREATE_SCHEMA_SQL } from './schema'

let _db: SQLite.SQLiteDatabase | null = null

/**
 * Open the database and run pending migrations.
 * Call once at app startup (root _layout.tsx).
 * Returns the database instance (singleton).
 *
 * Accepts an optional pre-opened db for testing (pass an in-memory db).
 */
export async function openDatabase(
  name = DB_NAME,
  existingDb?: SQLite.SQLiteDatabase,
): Promise<SQLite.SQLiteDatabase> {
  const db = existingDb ?? await SQLite.openDatabaseAsync(name)
  await runMigrations(db)
  if (!existingDb) _db = db
  return db
}

/** Get the already-opened database instance. Throws if openDatabase() was not called. */
export function getDatabase(): SQLite.SQLiteDatabase {
  if (!_db) throw new Error('Database not initialised — call openDatabase() first')
  return _db
}

async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  const result = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version')
  const currentVersion = result?.user_version ?? 0

  if (currentVersion < 1) {
    await db.execAsync(CREATE_SCHEMA_SQL)
    await db.execAsync('PRAGMA user_version = 1')
  }
  // Future: if (currentVersion < 2) { await db.execAsync(MIGRATION_V2_SQL) ... }
}
```

- [ ] **Step 5: Run tests**

```bash
pnpm -F @ultranos/pharmopedia test -- --testPathPattern schema
```
Expected: All 6 tests PASS.

- [ ] **Step 6: Typecheck**

```bash
pnpm -F @ultranos/pharmopedia typecheck
```
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add apps/pharmopedia/src/db/ apps/pharmopedia/__tests__/db/schema.test.ts
git commit -m "feat(pharmopedia): SQLite schema with FTS5 content table and migration runner"
```
