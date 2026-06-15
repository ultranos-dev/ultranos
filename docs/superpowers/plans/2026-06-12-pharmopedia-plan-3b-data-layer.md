# Pharmopedia Plan 3b — Data Layer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the SQLite CRUD + FTS query layer, Zustand stores, Hub API drug catalog client, and sync orchestrator.

**Architecture:** Pure TypeScript / data-layer tasks. No React Native UI. All four tasks are independently testable with mocked dependencies.

**Tech Stack:** expo-sqlite ~14, zustand ~5, @supabase/supabase-js ^2.49, TypeScript 5

**Spec:** `docs/superpowers/specs/2026-06-12-pharmopedia-plan-3-design.md`
**Requires:** `2026-06-12-pharmopedia-plan-3a-hub-api-foundation.md` complete
**Continues with:** `2026-06-12-pharmopedia-plan-3c-screens.md`

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `apps/pharmopedia/src/db/drug-catalog.ts` | Create | upsertDrug, getDrugByAtcCode, clearCatalog, getSyncMeta, setSyncMeta |
| `apps/pharmopedia/src/db/fts.ts` | Create | searchDrugs (FTS5 MATCH query → DrugSearchResult[]) |
| `apps/pharmopedia/__tests__/db/drug-catalog.test.ts` | Create | Upsert round-trip, clearCatalog, syncMeta reads |
| `apps/pharmopedia/__tests__/db/fts.test.ts` | Create | FTS brand-name + INN-name search |
| `apps/pharmopedia/src/store/auth-store.ts` | Create | token (memory), user, role, login, logout |
| `apps/pharmopedia/src/store/sync-store.ts` | Create | status, lastVersion, lastSyncAt |
| `apps/pharmopedia/src/lib/supabase.ts` | Create | Supabase client (memory-only auth, no AsyncStorage) |
| `apps/pharmopedia/__tests__/store/auth-store.test.ts` | Create | login sets token, logout clears DB + sync_meta |
| `apps/pharmopedia/__tests__/store/sync-store.test.ts` | Create | setStatus, setLastSync, reset |
| `apps/pharmopedia/src/api/drug-catalog.ts` | Create | search, getByAtcCode, sync, getPrices, enrich |
| `apps/pharmopedia/__tests__/api/drug-catalog.test.ts` | Create | URL construction, response parsing, error handling |
| `apps/pharmopedia/src/sync/catalog-sync.ts` | Create | runSync: initial (blocking) + incremental (background) |
| `apps/pharmopedia/__tests__/sync/catalog-sync.test.ts` | Create | Pagination loop, incremental sync, error recovery |

---

## Task 5: DB Queries — CRUD + FTS

**Context:** Two files. `drug-catalog.ts` handles CRUD and sync-meta reads/writes. `fts.ts` handles the FTS5 search query. The `upsertDrug` function sets `brand_names_flat` and `local_names_flat` in application code (not generated columns) and also runs an FTS5 `REBUILD` after the upsert so the index stays current. Since sync runs in batches, `upsertDrugBatch` accepts an array and calls `REBUILD` once after the whole batch.

**Key type:** `DrugSearchResult` from `@ultranos/shared-types`:
```typescript
{ atcCode: string; innName: string; brandNames: string[]; therapeuticClass: string; doseForms: string[]; localName?: string }
```

**Files:**
- Create: `apps/pharmopedia/src/db/drug-catalog.ts`
- Create: `apps/pharmopedia/src/db/fts.ts`
- Create: `apps/pharmopedia/__tests__/db/drug-catalog.test.ts`
- Create: `apps/pharmopedia/__tests__/db/fts.test.ts`

- [ ] **Step 1: Write failing CRUD tests**

Create `apps/pharmopedia/__tests__/db/drug-catalog.test.ts`:

```typescript
import * as SQLite from 'expo-sqlite'
import { openDatabase } from '@/db/migrations'
import {
  upsertDrugBatch,
  getDrugByAtcCode,
  clearCatalog,
  getSyncMeta,
  setSyncMeta,
} from '@/db/drug-catalog'
import type { DrugEntryTier1 } from '@ultranos/shared-types'

const AMOX: DrugEntryTier1 = {
  atcCode: 'J01CA04',
  innName: 'amoxicillin',
  brandNames: ['Augmentin', 'Amoxil'],
  doseForms: ['tablet', 'capsule'],
  therapeuticClass: 'Antibiotic',
  localNames: { prs: 'آموکسیسیلین' },
  summaryPlain: { en: 'Antibiotic used to treat bacterial infections.' },
  usedFor: [{ en: 'Bacterial infections' }],
  commonSideEffects: [{ en: 'Nausea' }],
  whenToSeekHelp: { en: 'If rash develops' },
  storageInstructions: { en: 'Store below 25°C' },
  pregnancySummaryPlain: { en: 'Category B' },
  warningsSummaryPlain: { en: 'Allergy risk' },
  version: 1,
  lastUpdated: '2026-06-12T00:00:00Z',
}

describe('drug-catalog CRUD', () => {
  let db: SQLite.SQLiteDatabase

  beforeEach(async () => {
    db = await SQLite.openDatabaseAsync(':memory:')
    await openDatabase(':memory:', db)
  })

  afterEach(async () => { await db.closeAsync() })

  it('upsertDrugBatch inserts a drug and retrieves it by atcCode', async () => {
    await upsertDrugBatch(db, [AMOX])
    const result = await getDrugByAtcCode(db, 'J01CA04')
    expect(result).not.toBeNull()
    expect(result?.innName).toBe('amoxicillin')
    expect(result?.brandNames).toEqual(['Augmentin', 'Amoxil'])
  })

  it('upsertDrugBatch replaces existing entry on second call', async () => {
    await upsertDrugBatch(db, [AMOX])
    const updated = { ...AMOX, version: 2 }
    await upsertDrugBatch(db, [updated])
    const result = await getDrugByAtcCode(db, 'J01CA04')
    expect(result?.version).toBe(2)
  })

  it('getDrugByAtcCode returns null for unknown ATC code', async () => {
    const result = await getDrugByAtcCode(db, 'UNKNOWN')
    expect(result).toBeNull()
  })

  it('clearCatalog removes all rows from drug_catalog and sync_meta', async () => {
    await upsertDrugBatch(db, [AMOX])
    await setSyncMeta(db, 'lastVersion', '5')
    await clearCatalog(db)
    const drug = await getDrugByAtcCode(db, 'J01CA04')
    const version = await getSyncMeta(db, 'lastVersion')
    expect(drug).toBeNull()
    expect(version).toBeNull()
  })

  it('setSyncMeta and getSyncMeta round-trip', async () => {
    await setSyncMeta(db, 'lastVersion', '42')
    expect(await getSyncMeta(db, 'lastVersion')).toBe('42')
    await setSyncMeta(db, 'lastVersion', '99')
    expect(await getSyncMeta(db, 'lastVersion')).toBe('99')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm -F @ultranos/pharmopedia test -- --testPathPattern drug-catalog
```
Expected: FAIL — `Cannot find module '@/db/drug-catalog'`

- [ ] **Step 3: Create drug-catalog.ts**

Create `apps/pharmopedia/src/db/drug-catalog.ts`:

```typescript
import * as SQLite from 'expo-sqlite'
import type { DrugEntryTier1, DrugEntryTier2, DrugEntryTier3 } from '@ultranos/shared-types'

type DrugEntry = DrugEntryTier1 | DrugEntryTier2 | DrugEntryTier3

const PHARMACIST_ROLES = new Set(['PHARMACIST', 'ADMIN'])
const CLINICAL_ROLES = new Set(['DOCTOR', 'NURSE', 'LAB_TECH'])

function getTier(role: string): 'public' | 'clinical' | 'pharmacist' {
  if (PHARMACIST_ROLES.has(role)) return 'pharmacist'
  if (CLINICAL_ROLES.has(role)) return 'clinical'
  return 'public'
}

/** Returns the DrugEntry from the appropriate tier column for the given role. */
export function scopeEntryForRole(
  row: DbRow,
  role: string,
): DrugEntryTier1 | DrugEntryTier2 | DrugEntryTier3 {
  const tier = getTier(role)
  if (tier === 'pharmacist' && row.tier3_json) return JSON.parse(row.tier3_json)
  if ((tier === 'pharmacist' || tier === 'clinical') && row.tier2_json) return JSON.parse(row.tier2_json)
  return JSON.parse(row.tier1_json) as DrugEntryTier1
}

interface DbRow {
  atc_code: string
  inn_name: string
  brand_names: string | null
  dose_forms: string | null
  therapeutic_class: string | null
  local_names: string | null
  tier1_json: string
  tier2_json: string | null
  tier3_json: string | null
  version: number
  brand_names_flat: string
  local_names_flat: string
}

/** Upsert a batch of drug entries, then rebuild the FTS5 index. */
export async function upsertDrugBatch(
  db: SQLite.SQLiteDatabase,
  entries: DrugEntry[],
): Promise<void> {
  for (const entry of entries) {
    const brandNamesFlat = entry.brandNames.join(' ')
    const localNamesFlat = Object.values(entry.localNames ?? {}).filter(Boolean).join(' ')

    const hasTier2 = 'mechanismOfAction' in entry || 'indicationsClinical' in entry
    const hasTier3 = 'formularyStatus' in entry || 'dispensingNotes' in entry

    await db.runAsync(
      `INSERT OR REPLACE INTO drug_catalog
         (atc_code, inn_name, brand_names, dose_forms, therapeutic_class, local_names,
          tier1_json, tier2_json, tier3_json, version, brand_names_flat, local_names_flat)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.atcCode,
        entry.innName,
        JSON.stringify(entry.brandNames),
        JSON.stringify(entry.doseForms),
        entry.therapeuticClass,
        JSON.stringify(entry.localNames),
        JSON.stringify(entry),
        hasTier2 ? JSON.stringify(entry) : null,
        hasTier3 ? JSON.stringify(entry) : null,
        entry.version,
        brandNamesFlat,
        localNamesFlat,
      ]
    )
  }
  // Rebuild FTS index once after the whole batch
  if (entries.length > 0) {
    await db.runAsync(`INSERT INTO drug_catalog_fts(drug_catalog_fts) VALUES('rebuild')`)
  }
}

/** Get a raw DB row by ATC code. Returns null if not found. */
export async function getDrugByAtcCode(
  db: SQLite.SQLiteDatabase,
  atcCode: string,
): Promise<DrugEntryTier1 | null> {
  const row = await db.getFirstAsync<DbRow>(
    'SELECT * FROM drug_catalog WHERE atc_code = ?',
    [atcCode]
  )
  if (!row) return null
  return JSON.parse(row.tier1_json) as DrugEntryTier1
}

/** Get raw DB row (all tier columns) — used by drug detail screen. */
export async function getDrugRowByAtcCode(
  db: SQLite.SQLiteDatabase,
  atcCode: string,
): Promise<DbRow | null> {
  return db.getFirstAsync<DbRow>(
    'SELECT * FROM drug_catalog WHERE atc_code = ?',
    [atcCode]
  )
}

/** Clear all drug_catalog rows, FTS index, and sync_meta. Called on logout. */
export async function clearCatalog(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    DELETE FROM drug_catalog;
    INSERT INTO drug_catalog_fts(drug_catalog_fts) VALUES('rebuild');
    DELETE FROM sync_meta;
  `)
}

/** Read a sync_meta value by key. Returns null if not set. */
export async function getSyncMeta(
  db: SQLite.SQLiteDatabase,
  key: string,
): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM sync_meta WHERE key = ?',
    [key]
  )
  return row?.value ?? null
}

/** Write a sync_meta value. */
export async function setSyncMeta(
  db: SQLite.SQLiteDatabase,
  key: string,
  value: string,
): Promise<void> {
  await db.runAsync(
    'INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)',
    [key, value]
  )
}
```

- [ ] **Step 4: Write failing FTS tests**

Create `apps/pharmopedia/__tests__/db/fts.test.ts`:

```typescript
import * as SQLite from 'expo-sqlite'
import { openDatabase } from '@/db/migrations'
import { upsertDrugBatch } from '@/db/drug-catalog'
import { searchDrugs } from '@/db/fts'
import type { DrugEntryTier1 } from '@ultranos/shared-types'

const DRUGS: DrugEntryTier1[] = [
  {
    atcCode: 'J01CA04', innName: 'amoxicillin', brandNames: ['Augmentin', 'Amoxil'],
    doseForms: ['tablet'], therapeuticClass: 'Antibiotic',
    localNames: { prs: 'آموکسیسیلین' },
    summaryPlain: {}, usedFor: [], commonSideEffects: [],
    whenToSeekHelp: {}, storageInstructions: {}, pregnancySummaryPlain: {},
    warningsSummaryPlain: {}, version: 1, lastUpdated: '2026-06-12T00:00:00Z',
  },
  {
    atcCode: 'N02BE01', innName: 'paracetamol', brandNames: ['Panadol', 'Calpol'],
    doseForms: ['tablet'], therapeuticClass: 'Analgesic',
    localNames: { prs: 'پاراستامول' },
    summaryPlain: {}, usedFor: [], commonSideEffects: [],
    whenToSeekHelp: {}, storageInstructions: {}, pregnancySummaryPlain: {},
    warningsSummaryPlain: {}, version: 1, lastUpdated: '2026-06-12T00:00:00Z',
  },
]

describe('FTS search', () => {
  let db: SQLite.SQLiteDatabase

  beforeEach(async () => {
    db = await SQLite.openDatabaseAsync(':memory:')
    await openDatabase(':memory:', db)
    await upsertDrugBatch(db, DRUGS)
  })

  afterEach(async () => { await db.closeAsync() })

  it('finds drug by INN name prefix', async () => {
    const results = await searchDrugs(db, 'amox', 'en', 10)
    expect(results).toHaveLength(1)
    expect(results[0].atcCode).toBe('J01CA04')
  })

  it('finds drug by brand name', async () => {
    const results = await searchDrugs(db, 'Panadol', 'en', 10)
    expect(results).toHaveLength(1)
    expect(results[0].atcCode).toBe('N02BE01')
  })

  it('finds drug by ATC code prefix', async () => {
    const results = await searchDrugs(db, 'J01CA', 'en', 10)
    expect(results).toHaveLength(1)
    expect(results[0].atcCode).toBe('J01CA04')
  })

  it('returns empty array for no match', async () => {
    const results = await searchDrugs(db, 'zzzznotarealdrugxxx', 'en', 10)
    expect(results).toHaveLength(0)
  })

  it('respects limit', async () => {
    const results = await searchDrugs(db, 'a', 'en', 1)
    expect(results.length).toBeLessThanOrEqual(1)
  })

  it('includes localName for prs lang when available', async () => {
    const results = await searchDrugs(db, 'amox', 'prs', 10)
    expect(results[0].localName).toBe('آموکسیسیلین')
  })
})
```

- [ ] **Step 5: Run FTS tests to verify they fail**

```bash
pnpm -F @ultranos/pharmopedia test -- --testPathPattern fts
```
Expected: FAIL — `Cannot find module '@/db/fts'`

- [ ] **Step 6: Create fts.ts**

Create `apps/pharmopedia/src/db/fts.ts`:

```typescript
import * as SQLite from 'expo-sqlite'
import type { DrugSearchResult } from '@ultranos/shared-types'

interface FtsRow {
  atc_code: string
  inn_name: string
  brand_names: string | null
  dose_forms: string | null
  therapeutic_class: string | null
  local_names: string | null
}

/** Sanitise FTS5 query: strip special chars, append prefix wildcard. */
function toFtsQuery(q: string): string {
  return q.replace(/["*^()]/g, '').trim() + '*'
}

/**
 * Full-text search against the local FTS5 index.
 * Searches inn_name, atc_code, brand_names_flat, local_names_flat.
 * Returns DrugSearchResult[] ordered by relevance rank.
 */
export async function searchDrugs(
  db: SQLite.SQLiteDatabase,
  q: string,
  lang: 'en' | 'prs' | 'ps',
  limit: number,
): Promise<DrugSearchResult[]> {
  const ftsQuery = toFtsQuery(q)
  const rows = await db.getAllAsync<FtsRow>(
    `SELECT dc.atc_code, dc.inn_name, dc.brand_names, dc.dose_forms,
            dc.therapeutic_class, dc.local_names
     FROM drug_catalog dc
     JOIN drug_catalog_fts fts ON fts.rowid = dc.rowid
     WHERE drug_catalog_fts MATCH ?
     ORDER BY fts.rank
     LIMIT ?`,
    [ftsQuery, limit]
  )

  return rows.map((row) => {
    const localNames: Record<string, string> = row.local_names
      ? JSON.parse(row.local_names)
      : {}
    return {
      atcCode: row.atc_code,
      innName: row.inn_name,
      brandNames: row.brand_names ? JSON.parse(row.brand_names) : [],
      doseForms: row.dose_forms ? JSON.parse(row.dose_forms) : [],
      therapeuticClass: row.therapeutic_class ?? '',
      localName: localNames[lang],
    }
  })
}
```

- [ ] **Step 7: Run all DB tests**

```bash
pnpm -F @ultranos/pharmopedia test -- --testPathPattern "drug-catalog|fts|schema"
```
Expected: All tests PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/pharmopedia/src/db/ apps/pharmopedia/__tests__/db/
git commit -m "feat(pharmopedia): SQLite CRUD + FTS5 search layer"
```

---

## Task 6: Zustand Stores + Supabase Auth Client

**Context:** Two zustand stores. `auth-store` holds the JWT access token in memory (never persisted). `sync-store` holds sync status. Both are plain zustand stores with no side effects beyond their state. The Supabase client is configured with `persistSession: false` so Supabase Auth does not write to AsyncStorage — token lives in auth-store memory only. Logout calls `clearCatalog` to wipe the local DB and reset the sync-store.

**Files:**
- Create: `apps/pharmopedia/src/lib/supabase.ts`
- Create: `apps/pharmopedia/src/store/auth-store.ts`
- Create: `apps/pharmopedia/src/store/sync-store.ts`
- Create: `apps/pharmopedia/__tests__/store/auth-store.test.ts`
- Create: `apps/pharmopedia/__tests__/store/sync-store.test.ts`

- [ ] **Step 1: Write failing store tests**

Create `apps/pharmopedia/__tests__/store/auth-store.test.ts`:

```typescript
import { act, renderHook } from '@testing-library/react-native'
import { useAuthStore } from '@/store/auth-store'
import { clearCatalog } from '@/db/drug-catalog'
import * as SQLite from 'expo-sqlite'

jest.mock('@/db/drug-catalog', () => ({ clearCatalog: jest.fn() }))
jest.mock('expo-sqlite')

describe('auth-store', () => {
  beforeEach(() => useAuthStore.setState({
    token: null, user: null, isAuthenticated: false, initialized: false,
  }))

  it('starts unauthenticated', () => {
    const { result } = renderHook(() => useAuthStore())
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.token).toBeNull()
  })

  it('login sets token, user, and isAuthenticated', () => {
    const { result } = renderHook(() => useAuthStore())
    act(() => {
      result.current.login(
        'test-jwt-token',
        { sub: 'user-123', role: 'DOCTOR', facilityId: undefined }
      )
    })
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.token).toBe('test-jwt-token')
    expect(result.current.user?.role).toBe('DOCTOR')
  })

  it('logout clears token and user', async () => {
    const mockDb = {} as SQLite.SQLiteDatabase
    const { result } = renderHook(() => useAuthStore())
    act(() => {
      result.current.login('tok', { sub: 'u1', role: 'PATIENT' })
    })
    await act(async () => {
      await result.current.logout(mockDb)
    })
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.token).toBeNull()
    expect(clearCatalog).toHaveBeenCalledWith(mockDb)
  })
})
```

Create `apps/pharmopedia/__tests__/store/sync-store.test.ts`:

```typescript
import { act, renderHook } from '@testing-library/react-native'
import { useSyncStore } from '@/store/sync-store'

describe('sync-store', () => {
  beforeEach(() => useSyncStore.setState({
    status: 'idle', lastSyncAt: null, lastVersion: 0,
  }))

  it('starts idle with version 0', () => {
    const { result } = renderHook(() => useSyncStore())
    expect(result.current.status).toBe('idle')
    expect(result.current.lastVersion).toBe(0)
  })

  it('setStatus updates status', () => {
    const { result } = renderHook(() => useSyncStore())
    act(() => result.current.setStatus('syncing'))
    expect(result.current.status).toBe('syncing')
  })

  it('setLastSync updates version and timestamp', () => {
    const { result } = renderHook(() => useSyncStore())
    act(() => result.current.setLastSync(42, '2026-06-12T10:00:00Z'))
    expect(result.current.lastVersion).toBe(42)
    expect(result.current.lastSyncAt).toBe('2026-06-12T10:00:00Z')
    expect(result.current.status).toBe('idle')
  })

  it('reset returns to initial state', () => {
    const { result } = renderHook(() => useSyncStore())
    act(() => { result.current.setStatus('error'); result.current.setLastSync(5, 'ts') })
    act(() => result.current.reset())
    expect(result.current.status).toBe('idle')
    expect(result.current.lastVersion).toBe(0)
    expect(result.current.lastSyncAt).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm -F @ultranos/pharmopedia test -- --testPathPattern "auth-store|sync-store"
```
Expected: FAIL — modules not found.

- [ ] **Step 3: Create supabase.ts**

Create `apps/pharmopedia/src/lib/supabase.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('Pharmopedia: EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY not set.')
}

/**
 * Supabase client for authentication only.
 * persistSession: false — tokens never go to AsyncStorage.
 * Token is managed by auth-store (memory only).
 * autoRefreshToken: false — refresh is triggered manually on API 401.
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: undefined,
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
})
```

- [ ] **Step 4: Create auth-store.ts**

Create `apps/pharmopedia/src/store/auth-store.ts`:

```typescript
import { create } from 'zustand'
import type * as SQLite from 'expo-sqlite'
import { clearCatalog } from '@/db/drug-catalog'
import { useSyncStore } from './sync-store'

export interface AuthUser {
  sub: string
  role: string
  facilityId?: string
}

interface AuthState {
  /** JWT access token — in memory only, never written to AsyncStorage or SecureStore */
  token: string | null
  user: AuthUser | null
  isAuthenticated: boolean
  initialized: boolean
  /**
   * Set session after successful login.
   * token: Supabase session.access_token (JWT RS256)
   */
  login: (token: string, user: AuthUser) => void
  /**
   * Clear session and wipe local drug catalog + sync meta.
   * Role change on next login forces a fresh sync.
   */
  logout: (db: SQLite.SQLiteDatabase) => Promise<void>
  /** Mark as initialized (called by root layout after session check). */
  initialize: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  initialized: false,

  login: (token, user) => {
    set({ token, user, isAuthenticated: true })
  },

  logout: async (db) => {
    set({ token: null, user: null, isAuthenticated: false })
    useSyncStore.getState().reset()
    await clearCatalog(db)
  },

  initialize: () => {
    set({ initialized: true })
  },
}))
```

- [ ] **Step 5: Create sync-store.ts**

Create `apps/pharmopedia/src/store/sync-store.ts`:

```typescript
import { create } from 'zustand'

interface SyncState {
  status: 'idle' | 'syncing' | 'error'
  lastSyncAt: string | null
  lastVersion: number
  setStatus: (s: 'idle' | 'syncing' | 'error') => void
  /** Set status to idle and record the latest version + timestamp. */
  setLastSync: (version: number, at: string) => void
  /** Reset to initial state (called on logout). */
  reset: () => void
}

export const useSyncStore = create<SyncState>((set) => ({
  status: 'idle',
  lastSyncAt: null,
  lastVersion: 0,

  setStatus: (s) => set({ status: s }),

  setLastSync: (version, at) => set({ status: 'idle', lastVersion: version, lastSyncAt: at }),

  reset: () => set({ status: 'idle', lastSyncAt: null, lastVersion: 0 }),
}))
```

- [ ] **Step 6: Run store tests**

```bash
pnpm -F @ultranos/pharmopedia test -- --testPathPattern "auth-store|sync-store"
```
Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/pharmopedia/src/lib/supabase.ts apps/pharmopedia/src/store/ apps/pharmopedia/__tests__/store/
git commit -m "feat(pharmopedia): Zustand auth-store + sync-store + Supabase auth client"
```

---

## Task 7: Drug Catalog API Client

**Context:** Manual tRPC-REST client following the same pattern as `apps/patient-lite-mobile/src/lib/notification-api.ts`. GET queries use `url.searchParams.set('input', JSON.stringify({ json: input }))`. POST mutations use `body: JSON.stringify({ json: input })`. Response shape: `{ result: { data: { json: T } } }`. Token comes from caller (auth-store).

**Files:**
- Create: `apps/pharmopedia/src/api/drug-catalog.ts`
- Create: `apps/pharmopedia/__tests__/api/drug-catalog.test.ts`

- [ ] **Step 1: Write failing API client tests**

Create `apps/pharmopedia/__tests__/api/drug-catalog.test.ts`:

```typescript
import { searchDrugsApi, getDrugByAtcCodeApi, syncDrugsApi, getDrugPricesApi, enrichDrugApi } from '@/api/drug-catalog'

const TOKEN = 'test-token'
const BASE_URL = 'http://localhost:3004/api/trpc'

function makeResponse<T>(data: T): Response {
  const body = JSON.stringify({ result: { data: { json: data } } })
  return { ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body } as Response
}

beforeEach(() => {
  process.env.EXPO_PUBLIC_HUB_API_URL = BASE_URL
})

jest.mock('@/lib/hub-fetch', () => ({
  hubFetch: jest.fn(),
}))

describe('searchDrugsApi', () => {
  it('calls GET with encoded input and Authorization header', async () => {
    const { hubFetch } = jest.requireMock('@/lib/hub-fetch')
    hubFetch.mockResolvedValueOnce(makeResponse([]))

    await searchDrugsApi('amox', 'en', 20, TOKEN)

    expect(hubFetch).toHaveBeenCalledTimes(1)
    const [url, init] = hubFetch.mock.calls[0]
    expect(url).toContain('drugCatalog.search')
    expect(url).toContain('input=')
    expect(url).toContain(encodeURIComponent('"amox"') || 'amox')
    expect(init.headers['Authorization']).toBe(`Bearer ${TOKEN}`)
    expect(init.method).toBe('GET')
  })
})

describe('enrichDrugApi', () => {
  it('calls POST with JSON body', async () => {
    const { hubFetch } = jest.requireMock('@/lib/hub-fetch')
    hubFetch.mockResolvedValueOnce(makeResponse({ atcCode: 'J01CA04' }))

    await enrichDrugApi('J01CA04', { localNames: { prs: 'test' } }, TOKEN)

    const [url, init] = hubFetch.mock.calls[0]
    expect(url).toContain('drugCatalog.enrich')
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body)
    expect(body.json.atcCode).toBe('J01CA04')
  })
})

describe('syncDrugsApi', () => {
  it('returns entries and latestVersion', async () => {
    const { hubFetch } = jest.requireMock('@/lib/hub-fetch')
    hubFetch.mockResolvedValueOnce(makeResponse({ entries: [], latestVersion: 5 }))

    const result = await syncDrugsApi(0, 200, TOKEN)
    expect(result.latestVersion).toBe(5)
    expect(result.entries).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm -F @ultranos/pharmopedia test -- --testPathPattern "api/drug-catalog"
```
Expected: FAIL — module not found.

- [ ] **Step 3: Create drug-catalog.ts API client**

Create `apps/pharmopedia/src/api/drug-catalog.ts`:

```typescript
import { hubFetch } from '@/lib/hub-fetch'
import type {
  DrugSearchResult,
  DrugEntryTier1,
  DrugEntryTier2,
  DrugEntryTier3,
  PharmacyPrice,
} from '@ultranos/shared-types'

const HUB_API_URL = process.env.EXPO_PUBLIC_HUB_API_URL ?? 'http://localhost:3004/api/trpc'

function makeUrl(path: string, input?: object): string {
  const url = new URL(`${HUB_API_URL.replace(/\/$/, '')}/${path}`)
  if (input) url.searchParams.set('input', JSON.stringify({ json: input }))
  return url.toString()
}

function authHeaders(token: string): Record<string, string> {
  return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
}

async function trpcGet<T>(path: string, input: object, token: string): Promise<T> {
  const res = await hubFetch(makeUrl(path, input), { method: 'GET', headers: authHeaders(token) })
  if (!res.ok) throw new Error(`Hub API error ${res.status} on ${path}`)
  const body = await res.json() as { result: { data: { json: T } } }
  return body.result.data.json
}

async function trpcPost<T>(path: string, input: object, token: string): Promise<T> {
  const res = await hubFetch(makeUrl(path), {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ json: input }),
  })
  if (!res.ok) throw new Error(`Hub API error ${res.status} on ${path}`)
  const body = await res.json() as { result: { data: { json: T } } }
  return body.result.data.json
}

export function searchDrugsApi(
  q: string,
  lang: 'en' | 'prs' | 'ps',
  limit: number,
  token: string,
): Promise<DrugSearchResult[]> {
  return trpcGet('drugCatalog.search', { q, lang, limit }, token)
}

export function getDrugByAtcCodeApi(
  atcCode: string,
  token: string,
): Promise<DrugEntryTier1 | DrugEntryTier2 | DrugEntryTier3> {
  return trpcGet('drugCatalog.getByAtcCode', { atcCode }, token)
}

export function syncDrugsApi(
  sinceVersion: number,
  limit: number,
  token: string,
): Promise<{ entries: (DrugEntryTier1 | DrugEntryTier2 | DrugEntryTier3)[]; latestVersion: number }> {
  return trpcGet('drugCatalog.sync', { sinceVersion, limit }, token)
}

export function getDrugPricesApi(
  atcCode: string,
  lat: number,
  lng: number,
  sort: 'distance' | 'price',
  limit: number,
  token: string,
): Promise<PharmacyPrice[]> {
  return trpcGet('drugCatalog.getPrices', { atcCode, lat, lng, sort, limit }, token)
}

export interface EnrichFields {
  localNames?: Record<string, string>
  dispensingNotes?: string
  formularyStatus?: 'on_formulary' | 'off_formulary' | 'restricted'
  unitCost?: number
}

export function enrichDrugApi(
  atcCode: string,
  fields: EnrichFields,
  token: string,
): Promise<DrugEntryTier1 | DrugEntryTier2 | DrugEntryTier3> {
  return trpcPost('drugCatalog.enrich', { atcCode, fields }, token)
}
```

- [ ] **Step 4: Run API client tests**

```bash
pnpm -F @ultranos/pharmopedia test -- --testPathPattern "api/drug-catalog"
```
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/pharmopedia/src/api/ apps/pharmopedia/__tests__/api/
git commit -m "feat(pharmopedia): drug catalog API client (tRPC-REST)"
```

---

## Task 8: Sync Orchestrator

**Context:** `catalog-sync.ts` drives the full and incremental sync loop. It reads `lastVersion` from `sync_meta`, calls `syncDrugsApi` in pages of 200, upserts each batch, and saves `latestVersion` after each page. On the initial sync (`lastVersion === 0`), it calls `onProgress` with the count of synced entries so the UI can show a progress indicator. `runSync` is idempotent and safe to call when already in progress (the sync-store's `status` gate prevents concurrent runs at the call site — the orchestrator itself does not re-check).

**Files:**
- Create: `apps/pharmopedia/src/sync/catalog-sync.ts`
- Create: `apps/pharmopedia/__tests__/sync/catalog-sync.test.ts`

- [ ] **Step 1: Write failing sync tests**

Create `apps/pharmopedia/__tests__/sync/catalog-sync.test.ts`:

```typescript
import * as SQLite from 'expo-sqlite'
import { openDatabase } from '@/db/migrations'
import { runSync } from '@/sync/catalog-sync'
import * as api from '@/api/drug-catalog'
import { getSyncMeta } from '@/db/drug-catalog'
import type { DrugEntryTier1 } from '@ultranos/shared-types'

jest.mock('@/api/drug-catalog')
const mockSyncApi = api.syncDrugsApi as jest.Mock

function makeDrug(atcCode: string, version = 1): DrugEntryTier1 {
  return {
    atcCode, innName: `drug-${atcCode}`, brandNames: [], doseForms: [], therapeuticClass: '',
    localNames: {}, summaryPlain: {}, usedFor: [], commonSideEffects: [],
    whenToSeekHelp: {}, storageInstructions: {}, pregnancySummaryPlain: {},
    warningsSummaryPlain: {}, version, lastUpdated: '2026-06-12T00:00:00Z',
  }
}

describe('runSync', () => {
  let db: SQLite.SQLiteDatabase

  beforeEach(async () => {
    db = await SQLite.openDatabaseAsync(':memory:')
    await openDatabase(':memory:', db)
    mockSyncApi.mockReset()
  })

  afterEach(async () => { await db.closeAsync() })

  it('fetches first page and saves latestVersion', async () => {
    mockSyncApi.mockResolvedValueOnce({ entries: [makeDrug('J01CA04')], latestVersion: 1 })
    mockSyncApi.mockResolvedValueOnce({ entries: [], latestVersion: 1 })

    const result = await runSync(db, 'tok')

    expect(result.synced).toBe(1)
    expect(result.version).toBe(1)
    expect(await getSyncMeta(db, 'lastVersion')).toBe('1')
  })

  it('paginates: fetches until entries is empty', async () => {
    mockSyncApi
      .mockResolvedValueOnce({ entries: [makeDrug('A'), makeDrug('B')], latestVersion: 2 })
      .mockResolvedValueOnce({ entries: [makeDrug('C')], latestVersion: 3 })
      .mockResolvedValueOnce({ entries: [], latestVersion: 3 })

    const result = await runSync(db, 'tok')

    expect(result.synced).toBe(3)
    expect(mockSyncApi).toHaveBeenCalledTimes(3)
  })

  it('incremental sync starts from stored lastVersion', async () => {
    // Simulate prior sync at version 10
    await db.runAsync(`INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('lastVersion', '10')`)
    mockSyncApi.mockResolvedValueOnce({ entries: [makeDrug('X', 11)], latestVersion: 11 })
    mockSyncApi.mockResolvedValueOnce({ entries: [], latestVersion: 11 })

    await runSync(db, 'tok')

    // First call should start from version 10
    expect(mockSyncApi.mock.calls[0][0]).toBe(10)
  })

  it('returns synced 0 and current version when no new entries', async () => {
    await db.runAsync(`INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('lastVersion', '5')`)
    mockSyncApi.mockResolvedValueOnce({ entries: [], latestVersion: 5 })

    const result = await runSync(db, 'tok')
    expect(result.synced).toBe(0)
    expect(result.version).toBe(5)
  })

  it('calls onProgress with running total during initial sync', async () => {
    mockSyncApi
      .mockResolvedValueOnce({ entries: [makeDrug('A'), makeDrug('B')], latestVersion: 2 })
      .mockResolvedValueOnce({ entries: [], latestVersion: 2 })

    const progress: number[] = []
    await runSync(db, 'tok', (n) => progress.push(n))

    expect(progress).toContain(2)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm -F @ultranos/pharmopedia test -- --testPathPattern "catalog-sync"
```
Expected: FAIL — module not found.

- [ ] **Step 3: Create catalog-sync.ts**

Create `apps/pharmopedia/src/sync/catalog-sync.ts`:

```typescript
import type * as SQLite from 'expo-sqlite'
import { syncDrugsApi } from '@/api/drug-catalog'
import { upsertDrugBatch, getSyncMeta, setSyncMeta } from '@/db/drug-catalog'

const SYNC_PAGE_SIZE = 200

export interface SyncResult {
  synced: number
  version: number
}

/**
 * Run the drug catalog sync.
 *
 * Initial sync (lastVersion === 0): fetches all pages, calls onProgress after each batch.
 * Incremental sync: fetches only entries newer than the stored lastVersion.
 *
 * Saves latestVersion to sync_meta after each page so a crash mid-sync is recoverable.
 * The caller (root layout / profile screen) must set sync-store status before and after.
 */
export async function runSync(
  db: SQLite.SQLiteDatabase,
  token: string,
  onProgress?: (totalSynced: number) => void,
): Promise<SyncResult> {
  const storedVersion = await getSyncMeta(db, 'lastVersion')
  let sinceVersion = storedVersion ? parseInt(storedVersion, 10) : 0
  let totalSynced = 0
  let latestVersion = sinceVersion

  while (true) {
    const { entries, latestVersion: pageVersion } = await syncDrugsApi(
      sinceVersion,
      SYNC_PAGE_SIZE,
      token,
    )

    if (entries.length === 0) {
      // No new entries — update version in case server advanced without new entries
      if (pageVersion > latestVersion) {
        latestVersion = pageVersion
        await setSyncMeta(db, 'lastVersion', String(latestVersion))
      }
      break
    }

    await upsertDrugBatch(db, entries)
    latestVersion = pageVersion
    totalSynced += entries.length
    sinceVersion = latestVersion

    await setSyncMeta(db, 'lastVersion', String(latestVersion))
    await setSyncMeta(db, 'lastSyncAt', new Date().toISOString())

    onProgress?.(totalSynced)
  }

  return { synced: totalSynced, version: latestVersion }
}
```

- [ ] **Step 4: Run sync tests**

```bash
pnpm -F @ultranos/pharmopedia test -- --testPathPattern "catalog-sync"
```
Expected: All tests PASS.

- [ ] **Step 5: Run the full test suite**

```bash
pnpm -F @ultranos/pharmopedia test
```
Expected: All tests PASS.

- [ ] **Step 6: Typecheck**

```bash
pnpm -F @ultranos/pharmopedia typecheck
```
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add apps/pharmopedia/src/sync/ apps/pharmopedia/__tests__/sync/
git commit -m "feat(pharmopedia): catalog sync orchestrator with pagination and incremental support"
```
