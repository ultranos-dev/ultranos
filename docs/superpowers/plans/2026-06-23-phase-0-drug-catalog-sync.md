# Phase 0 — Shared Drug-Catalog Sync Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a storage-agnostic, unit-tested `@ultranos/drug-catalog-sync` package that delta-syncs the enriched drug catalog + branded medications from the hub-api into any local store, and exposes field-coverage helpers — the shared foundation OPD-Lite and Pharmacy-Lite both consume in later phases.

**Architecture:** A new workspace package with four pure modules — (1) a tRPC GET **client** over `drugCatalog.sync` / `syncBrands` / `syncBrandPresentations` with injectable fetch + token; (2) a `DrugCatalogStore` **interface** + an `InMemoryDrugCatalogStore` reference impl; (3) a **sync orchestrator** (paged delta loop, per-table version watermarks, non-advancing-server guard); (4) **coverage** helpers so every UI can render an honest "no data" state instead of implying "none/safe". No app wiring, no Dexie — apps provide a `DrugCatalogStore` adapter in Phase 1/2.

**Tech Stack:** TypeScript (ESM, NodeNext), Vitest, `@ultranos/shared-types` (workspace types). Mirrors `packages/drug-db` conventions.

## Global Constraints

- Package name: `@ultranos/drug-catalog-sync`, `"private": true`, `"type": "module"`, version `0.1.0`.
- ESM with **explicit `.js` extensions** on all relative imports (e.g. `import { x } from './client.js'`) — matches `packages/drug-db/src/index.ts`.
- Build via `tsc` to `dist/`; tests live in `src/__tests__/` and are excluded from the build.
- `tsconfig.json` extends `../../tsconfig.base.json`; `rootDir: src`, `outDir: dist`, `lib: ["ES2022", "DOM"]` (DOM is required for `fetch`/`Response`/`RequestInit`/`URL` types — this is the one deliberate difference from drug-db's tsconfig).
- Dependencies: `@ultranos/shared-types": "workspace:*"`. DevDeps: `typescript: ^5.5.0`, `vitest: ^2.0.0`.
- **Reference data is non-PHI, but never log entry/brand contents** — orchestrator logs nothing; callers log counts only (Rule #1 discipline).
- The catalog is read-only on device: the package never writes back to the hub.
- Throttle / online-gating / single-flight are **out of scope** here — they belong to each app's sync hook in Phase 1/2 (as Pharmopedia's `useAutoSync` does). Phase 0 ships the deterministic, unit-testable core.

---

### Task 1: Scaffold the `@ultranos/drug-catalog-sync` package

**Files:**
- Create: `packages/drug-catalog-sync/package.json`
- Create: `packages/drug-catalog-sync/tsconfig.json`
- Create: `packages/drug-catalog-sync/vitest.config.ts`
- Create: `packages/drug-catalog-sync/src/index.ts`
- Test: `packages/drug-catalog-sync/src/__tests__/smoke.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a buildable, test-runnable package skeleton. Later tasks add modules under `src/` and re-export them from `src/index.ts`.

- [ ] **Step 1: Write the failing test**

`packages/drug-catalog-sync/src/__tests__/smoke.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { PACKAGE_NAME } from '../index.js'

describe('@ultranos/drug-catalog-sync', () => {
  it('exposes its package name', () => {
    expect(PACKAGE_NAME).toBe('@ultranos/drug-catalog-sync')
  })
})
```

- [ ] **Step 2: Create the package manifest and configs**

`packages/drug-catalog-sync/package.json`:
```json
{
  "name": "@ultranos/drug-catalog-sync",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" }
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "dev": "tsc --watch",
    "test": "vitest run",
    "lint": "eslint ."
  },
  "dependencies": {
    "@ultranos/shared-types": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

`packages/drug-catalog-sync/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "lib": ["ES2022", "DOM"]
  },
  "include": ["src"],
  "exclude": ["src/__tests__"]
}
```

`packages/drug-catalog-sync/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
  },
})
```

- [ ] **Step 3: Write the minimal barrel export**

`packages/drug-catalog-sync/src/index.ts`:
```typescript
export const PACKAGE_NAME = '@ultranos/drug-catalog-sync'
```

- [ ] **Step 4: Link the workspace and run the test**

Run:
```bash
pnpm install
pnpm -F @ultranos/drug-catalog-sync test
```
Expected: `pnpm install` links the new package; Vitest reports the smoke test PASS (1 passed).

- [ ] **Step 5: Verify the build compiles**

Run: `pnpm -F @ultranos/drug-catalog-sync build`
Expected: `tsc` exits 0; `packages/drug-catalog-sync/dist/index.js` exists.

- [ ] **Step 6: Commit**

```bash
git add packages/drug-catalog-sync pnpm-lock.yaml
git commit -m "feat(drug-catalog-sync): scaffold shared catalog sync package"
```

---

### Task 2: tRPC sync client (`client.ts`)

**Files:**
- Create: `packages/drug-catalog-sync/src/client.ts`
- Modify: `packages/drug-catalog-sync/src/index.ts`
- Test: `packages/drug-catalog-sync/src/__tests__/client.test.ts`

**Interfaces:**
- Consumes: `DrugEntryTier1 | DrugEntryTier2 | DrugEntryTier3`, `DrugBrand`, `DrugBrandPresentation` from `@ultranos/shared-types`.
- Produces:
  - `type DrugEntry = DrugEntryTier1 | DrugEntryTier2 | DrugEntryTier3`
  - `interface DrugSyncPage { entries: DrugEntry[]; latestVersion: number }`
  - `interface BrandSyncPage { brands: DrugBrand[]; latestVersion: number }`
  - `interface PresentationSyncPage { presentations: DrugBrandPresentation[]; latestVersion: number }`
  - `interface CatalogClient { syncDrugs(sinceVersion, limit): Promise<DrugSyncPage>; syncBrands(sinceVersion, limit): Promise<BrandSyncPage>; syncBrandPresentations(sinceVersion, limit): Promise<PresentationSyncPage> }`
  - `interface CatalogClientConfig { baseUrl: string; getToken: () => Promise<string | null>; fetchImpl?: typeof fetch }`
  - `function createCatalogClient(config: CatalogClientConfig): CatalogClient`

- [ ] **Step 1: Write the failing test**

`packages/drug-catalog-sync/src/__tests__/client.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { createCatalogClient } from '../client.js'

function fakeResponse(json: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => json } as unknown as Response
}

describe('createCatalogClient', () => {
  it('syncDrugs calls drugCatalog.sync with a bearer token and decodes the json envelope', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    const client = createCatalogClient({
      baseUrl: 'http://hub.test/api/trpc',
      getToken: async () => 'tok123',
      fetchImpl: (async (url: string, init?: RequestInit) => {
        calls.push({ url, init })
        return fakeResponse({
          result: { data: { json: { entries: [{ atcCode: 'J01CA04' }], latestVersion: 42 } } },
        })
      }) as unknown as typeof fetch,
    })

    const page = await client.syncDrugs(0, 200)

    expect(page.latestVersion).toBe(42)
    expect(page.entries).toHaveLength(1)
    const u = new URL(calls[0]!.url)
    expect(u.pathname).toBe('/api/trpc/drugCatalog.sync')
    expect(JSON.parse(u.searchParams.get('input')!)).toEqual({ json: { sinceVersion: 0, limit: 200 } })
    expect((calls[0]!.init!.headers as Record<string, string>).Authorization).toBe('Bearer tok123')
  })

  it('syncBrands and syncBrandPresentations target their own paths', async () => {
    const paths: string[] = []
    const client = createCatalogClient({
      baseUrl: 'http://hub.test/api/trpc',
      getToken: async () => 'tok',
      fetchImpl: (async (url: string) => {
        paths.push(new URL(url).pathname)
        return fakeResponse({ result: { data: { json: { brands: [], presentations: [], latestVersion: 0 } } } })
      }) as unknown as typeof fetch,
    })
    await client.syncBrands(0, 200)
    await client.syncBrandPresentations(0, 200)
    expect(paths).toEqual(['/api/trpc/drugCatalog.syncBrands', '/api/trpc/drugCatalog.syncBrandPresentations'])
  })

  it('throws when no token is available', async () => {
    const client = createCatalogClient({
      baseUrl: 'http://hub.test/api/trpc',
      getToken: async () => null,
      fetchImpl: (async () => fakeResponse({})) as unknown as typeof fetch,
    })
    await expect(client.syncDrugs(0, 200)).rejects.toThrow('authentication required')
  })

  it('throws on a non-ok response', async () => {
    const client = createCatalogClient({
      baseUrl: 'http://hub.test/api/trpc',
      getToken: async () => 'tok',
      fetchImpl: (async () => fakeResponse({}, false, 500)) as unknown as typeof fetch,
    })
    await expect(client.syncDrugs(0, 200)).rejects.toThrow('failed: 500')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F @ultranos/drug-catalog-sync test client`
Expected: FAIL — `Cannot find module '../client.js'`.

- [ ] **Step 3: Write the implementation**

`packages/drug-catalog-sync/src/client.ts`:
```typescript
import type {
  DrugEntryTier1,
  DrugEntryTier2,
  DrugEntryTier3,
  DrugBrand,
  DrugBrandPresentation,
} from '@ultranos/shared-types'

export type DrugEntry = DrugEntryTier1 | DrugEntryTier2 | DrugEntryTier3

export interface DrugSyncPage {
  entries: DrugEntry[]
  latestVersion: number
}
export interface BrandSyncPage {
  brands: DrugBrand[]
  latestVersion: number
}
export interface PresentationSyncPage {
  presentations: DrugBrandPresentation[]
  latestVersion: number
}

export interface CatalogClient {
  syncDrugs(sinceVersion: number, limit: number): Promise<DrugSyncPage>
  syncBrands(sinceVersion: number, limit: number): Promise<BrandSyncPage>
  syncBrandPresentations(sinceVersion: number, limit: number): Promise<PresentationSyncPage>
}

export interface CatalogClientConfig {
  /** tRPC base, e.g. http://localhost:3004/api/trpc */
  baseUrl: string
  /** App-injected auth — Supabase session (OPD) or auth-session-store (Pharmacy). */
  getToken: () => Promise<string | null>
  /** Injectable fetch — standard `fetch` in web apps, a pinned fetch elsewhere; overridable in tests. */
  fetchImpl?: typeof fetch
}

function buildUrl(baseUrl: string, path: string, input: object): string {
  const url = new URL(baseUrl)
  url.pathname = url.pathname.replace(/\/$/, '') + '/' + path
  url.searchParams.set('input', JSON.stringify({ json: input }))
  return url.toString()
}

export function createCatalogClient(config: CatalogClientConfig): CatalogClient {
  const doFetch = config.fetchImpl ?? fetch

  async function get<T>(path: string, input: object): Promise<T> {
    const token = await config.getToken()
    if (!token) throw new Error('drug-catalog-sync: authentication required')
    const res = await doFetch(buildUrl(config.baseUrl, path, input), {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error(`drug-catalog-sync: ${path} failed: ${res.status}`)
    const body = (await res.json()) as { result: { data: { json: T } } }
    return body.result.data.json
  }

  return {
    syncDrugs: (sinceVersion, limit) =>
      get<DrugSyncPage>('drugCatalog.sync', { sinceVersion, limit }),
    syncBrands: (sinceVersion, limit) =>
      get<BrandSyncPage>('drugCatalog.syncBrands', { sinceVersion, limit }),
    syncBrandPresentations: (sinceVersion, limit) =>
      get<PresentationSyncPage>('drugCatalog.syncBrandPresentations', { sinceVersion, limit }),
  }
}
```

- [ ] **Step 4: Re-export from the barrel**

Replace `packages/drug-catalog-sync/src/index.ts` with:
```typescript
export const PACKAGE_NAME = '@ultranos/drug-catalog-sync'

export { createCatalogClient } from './client.js'
export type {
  CatalogClient,
  CatalogClientConfig,
  DrugEntry,
  DrugSyncPage,
  BrandSyncPage,
  PresentationSyncPage,
} from './client.js'
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm -F @ultranos/drug-catalog-sync test`
Expected: PASS (smoke + 4 client tests).

- [ ] **Step 6: Commit**

```bash
git add packages/drug-catalog-sync/src
git commit -m "feat(drug-catalog-sync): tRPC delta-sync client for catalog + brands"
```

---

### Task 3: Store interface + in-memory reference store (`store.ts`, `memory-store.ts`)

**Files:**
- Create: `packages/drug-catalog-sync/src/store.ts`
- Create: `packages/drug-catalog-sync/src/memory-store.ts`
- Modify: `packages/drug-catalog-sync/src/index.ts`
- Test: `packages/drug-catalog-sync/src/__tests__/memory-store.test.ts`

**Interfaces:**
- Consumes: `DrugEntry` (Task 2); `DrugBrand`, `DrugBrandPresentation` (`@ultranos/shared-types`).
- Produces:
  - `type CursorKey = 'catalogVersion' | 'brandsVersion' | 'presentationsVersion' | 'lastSyncAt'`
  - `interface DrugCatalogStore { getCursor(key: CursorKey): Promise<string | null>; setCursor(key: CursorKey, value: string): Promise<void>; upsertDrugs(entries: DrugEntry[]): Promise<void>; upsertBrands(brands: DrugBrand[]): Promise<void>; upsertPresentations(presentations: DrugBrandPresentation[]): Promise<void> }`
  - `class InMemoryDrugCatalogStore implements DrugCatalogStore` with public readonly `drugs: Map<string, DrugEntry>`, `brands: Map<string, DrugBrand>`, `presentations: Map<string, DrugBrandPresentation>`.

- [ ] **Step 1: Write the failing test**

`packages/drug-catalog-sync/src/__tests__/memory-store.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { InMemoryDrugCatalogStore } from '../memory-store.js'
import type { DrugEntry } from '../client.js'

const entry = (atcCode: string): DrugEntry =>
  ({ atcCode, innName: 'x', brandNames: [], doseForms: [], therapeuticClass: '' }) as unknown as DrugEntry

describe('InMemoryDrugCatalogStore', () => {
  it('round-trips cursors', async () => {
    const store = new InMemoryDrugCatalogStore()
    expect(await store.getCursor('catalogVersion')).toBeNull()
    await store.setCursor('catalogVersion', '17')
    expect(await store.getCursor('catalogVersion')).toBe('17')
  })

  it('upserts drugs keyed by atcCode (last write wins)', async () => {
    const store = new InMemoryDrugCatalogStore()
    await store.upsertDrugs([entry('A'), entry('B')])
    await store.upsertDrugs([entry('A')])
    expect(store.drugs.size).toBe(2)
    expect(store.drugs.get('A')?.atcCode).toBe('A')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F @ultranos/drug-catalog-sync test memory-store`
Expected: FAIL — `Cannot find module '../memory-store.js'`.

- [ ] **Step 3: Write the implementations**

`packages/drug-catalog-sync/src/store.ts`:
```typescript
import type { DrugBrand, DrugBrandPresentation } from '@ultranos/shared-types'
import type { DrugEntry } from './client.js'

export type CursorKey =
  | 'catalogVersion'
  | 'brandsVersion'
  | 'presentationsVersion'
  | 'lastSyncAt'

/**
 * Platform-agnostic local mirror. Each app provides a Dexie/SQLite-backed
 * implementation (Phase 1/2); tests and adapter unit tests use InMemoryDrugCatalogStore.
 */
export interface DrugCatalogStore {
  getCursor(key: CursorKey): Promise<string | null>
  setCursor(key: CursorKey, value: string): Promise<void>
  upsertDrugs(entries: DrugEntry[]): Promise<void>
  upsertBrands(brands: DrugBrand[]): Promise<void>
  upsertPresentations(presentations: DrugBrandPresentation[]): Promise<void>
}
```

`packages/drug-catalog-sync/src/memory-store.ts`:
```typescript
import type { DrugBrand, DrugBrandPresentation } from '@ultranos/shared-types'
import type { DrugEntry } from './client.js'
import type { CursorKey, DrugCatalogStore } from './store.js'

export class InMemoryDrugCatalogStore implements DrugCatalogStore {
  readonly drugs = new Map<string, DrugEntry>()
  readonly brands = new Map<string, DrugBrand>()
  readonly presentations = new Map<string, DrugBrandPresentation>()
  private readonly cursors = new Map<CursorKey, string>()

  async getCursor(key: CursorKey): Promise<string | null> {
    return this.cursors.get(key) ?? null
  }

  async setCursor(key: CursorKey, value: string): Promise<void> {
    this.cursors.set(key, value)
  }

  async upsertDrugs(entries: DrugEntry[]): Promise<void> {
    for (const e of entries) this.drugs.set(e.atcCode, e)
  }

  async upsertBrands(brands: DrugBrand[]): Promise<void> {
    for (const b of brands) this.brands.set(b.id, b)
  }

  async upsertPresentations(presentations: DrugBrandPresentation[]): Promise<void> {
    for (const p of presentations) this.presentations.set(p.id, p)
  }
}
```

- [ ] **Step 4: Re-export from the barrel**

Append to `packages/drug-catalog-sync/src/index.ts`:
```typescript
export type { DrugCatalogStore, CursorKey } from './store.js'
export { InMemoryDrugCatalogStore } from './memory-store.js'
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm -F @ultranos/drug-catalog-sync test`
Expected: PASS (smoke + client + 2 memory-store tests).

- [ ] **Step 6: Commit**

```bash
git add packages/drug-catalog-sync/src
git commit -m "feat(drug-catalog-sync): DrugCatalogStore interface + in-memory reference store"
```

---

### Task 4: Sync orchestrator (`sync.ts`)

**Files:**
- Create: `packages/drug-catalog-sync/src/sync.ts`
- Modify: `packages/drug-catalog-sync/src/index.ts`
- Test: `packages/drug-catalog-sync/src/__tests__/sync.test.ts`

**Interfaces:**
- Consumes: `CatalogClient`, `DrugSyncPage`, `BrandSyncPage`, `PresentationSyncPage` (Task 2); `DrugCatalogStore` (Task 3).
- Produces:
  - `const CATALOG_SYNC_PAGE_SIZE = 200`
  - `interface CatalogSyncResult { drugsSynced: number; latestVersion: number }`
  - `interface BrandSyncResult { brandsSynced: number; presentationsSynced: number; brandsVersion: number; presentationsVersion: number }`
  - `function runCatalogSync(store: DrugCatalogStore, client: CatalogClient, pageSize?: number): Promise<CatalogSyncResult>`
  - `function runBrandSync(store: DrugCatalogStore, client: CatalogClient, pageSize?: number): Promise<BrandSyncResult>`

Behavior contract: read the per-table cursor (default 0); page until a short/empty page; upsert each page then persist the cursor; throw if the server returns rows but a non-advancing `latestVersion` (stalled-server guard); `runCatalogSync` stamps `lastSyncAt` (ISO) at the end.

- [ ] **Step 1: Write the failing test**

`packages/drug-catalog-sync/src/__tests__/sync.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { runCatalogSync, runBrandSync } from '../sync.js'
import { InMemoryDrugCatalogStore } from '../memory-store.js'
import type {
  CatalogClient,
  DrugEntry,
  DrugSyncPage,
  BrandSyncPage,
  PresentationSyncPage,
} from '../client.js'

const entry = (atcCode: string): DrugEntry =>
  ({ atcCode, innName: 'x', brandNames: [], doseForms: [], therapeuticClass: '' }) as unknown as DrugEntry

function clientFrom(opts: {
  drugPages?: DrugSyncPage[]
  brandPages?: BrandSyncPage[]
  presentationPages?: PresentationSyncPage[]
  drugSinceArgs?: number[]
}): CatalogClient {
  let d = 0
  let b = 0
  let p = 0
  return {
    async syncDrugs(sinceVersion) {
      opts.drugSinceArgs?.push(sinceVersion)
      return opts.drugPages?.[d++] ?? { entries: [], latestVersion: sinceVersion }
    },
    async syncBrands() {
      return opts.brandPages?.[b++] ?? { brands: [], latestVersion: 0 }
    },
    async syncBrandPresentations() {
      return opts.presentationPages?.[p++] ?? { presentations: [], latestVersion: 0 }
    },
  }
}

describe('runCatalogSync', () => {
  it('pages through a cold sync, accumulates rows, and advances the cursor', async () => {
    const store = new InMemoryDrugCatalogStore()
    const client = clientFrom({
      drugPages: [
        { entries: [entry('A'), entry('B')], latestVersion: 10 }, // full page (size 2)
        { entries: [entry('C')], latestVersion: 11 }, // short page → stop
      ],
    })
    const result = await runCatalogSync(store, client, 2)
    expect(result).toEqual({ drugsSynced: 3, latestVersion: 11 })
    expect(store.drugs.size).toBe(3)
    expect(await store.getCursor('catalogVersion')).toBe('11')
    expect(await store.getCursor('lastSyncAt')).not.toBeNull()
  })

  it('resumes a delta sync from the stored cursor', async () => {
    const store = new InMemoryDrugCatalogStore()
    await store.setCursor('catalogVersion', '11')
    const drugSinceArgs: number[] = []
    const client = clientFrom({
      drugPages: [{ entries: [entry('D')], latestVersion: 12 }],
      drugSinceArgs,
    })
    await runCatalogSync(store, client, 200)
    expect(drugSinceArgs[0]).toBe(11)
    expect(await store.getCursor('catalogVersion')).toBe('12')
  })

  it('throws when the server returns rows but a non-advancing version', async () => {
    const store = new InMemoryDrugCatalogStore()
    const client = clientFrom({ drugPages: [{ entries: [entry('A')], latestVersion: 0 }] })
    await expect(runCatalogSync(store, client, 200)).rejects.toThrow('non-advancing')
  })

  it('no-ops cleanly when the server has nothing new', async () => {
    const store = new InMemoryDrugCatalogStore()
    const client = clientFrom({ drugPages: [{ entries: [], latestVersion: 0 }] })
    const result = await runCatalogSync(store, client, 200)
    expect(result.drugsSynced).toBe(0)
  })
})

describe('runBrandSync', () => {
  it('syncs brands and presentations on independent cursors', async () => {
    const store = new InMemoryDrugCatalogStore()
    const client = clientFrom({
      brandPages: [{ brands: [{ id: 'b1' } as never], latestVersion: 5 }],
      presentationPages: [{ presentations: [{ id: 'p1' } as never], latestVersion: 9 }],
    })
    const result = await runBrandSync(store, client, 200)
    expect(result).toEqual({
      brandsSynced: 1,
      presentationsSynced: 1,
      brandsVersion: 5,
      presentationsVersion: 9,
    })
    expect(await store.getCursor('brandsVersion')).toBe('5')
    expect(await store.getCursor('presentationsVersion')).toBe('9')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F @ultranos/drug-catalog-sync test sync`
Expected: FAIL — `Cannot find module '../sync.js'`.

- [ ] **Step 3: Write the implementation**

`packages/drug-catalog-sync/src/sync.ts`:
```typescript
import type { CatalogClient } from './client.js'
import type { DrugCatalogStore } from './store.js'

export const CATALOG_SYNC_PAGE_SIZE = 200

export interface CatalogSyncResult {
  drugsSynced: number
  latestVersion: number
}

export interface BrandSyncResult {
  brandsSynced: number
  presentationsSynced: number
  brandsVersion: number
  presentationsVersion: number
}

/** Paged delta pull of the generic catalog. Persists the cursor after each page. */
export async function runCatalogSync(
  store: DrugCatalogStore,
  client: CatalogClient,
  pageSize: number = CATALOG_SYNC_PAGE_SIZE,
): Promise<CatalogSyncResult> {
  let since = Number((await store.getCursor('catalogVersion')) ?? '0')
  let totalSynced = 0
  let latestVersion = since

  for (;;) {
    const page = await client.syncDrugs(since, pageSize)
    if (page.entries.length === 0) break
    if (page.latestVersion <= since) {
      throw new Error('drug-catalog-sync: server returned a non-advancing catalog version')
    }
    await store.upsertDrugs(page.entries)
    since = page.latestVersion
    latestVersion = page.latestVersion
    totalSynced += page.entries.length
    await store.setCursor('catalogVersion', String(latestVersion))
    if (page.entries.length < pageSize) break
  }

  await store.setCursor('lastSyncAt', new Date().toISOString())
  return { drugsSynced: totalSynced, latestVersion }
}

/** Paged delta pull of brands + presentations on their own independent cursors. */
export async function runBrandSync(
  store: DrugCatalogStore,
  client: CatalogClient,
  pageSize: number = CATALOG_SYNC_PAGE_SIZE,
): Promise<BrandSyncResult> {
  let brandsVersion = Number((await store.getCursor('brandsVersion')) ?? '0')
  let brandsSynced = 0
  for (;;) {
    const page = await client.syncBrands(brandsVersion, pageSize)
    if (page.brands.length === 0) break
    if (page.latestVersion <= brandsVersion) {
      throw new Error('drug-catalog-sync: server returned a non-advancing brands version')
    }
    await store.upsertBrands(page.brands)
    brandsVersion = page.latestVersion
    brandsSynced += page.brands.length
    await store.setCursor('brandsVersion', String(brandsVersion))
    if (page.brands.length < pageSize) break
  }

  let presentationsVersion = Number((await store.getCursor('presentationsVersion')) ?? '0')
  let presentationsSynced = 0
  for (;;) {
    const page = await client.syncBrandPresentations(presentationsVersion, pageSize)
    if (page.presentations.length === 0) break
    if (page.latestVersion <= presentationsVersion) {
      throw new Error('drug-catalog-sync: server returned a non-advancing presentations version')
    }
    await store.upsertPresentations(page.presentations)
    presentationsVersion = page.latestVersion
    presentationsSynced += page.presentations.length
    await store.setCursor('presentationsVersion', String(presentationsVersion))
    if (page.presentations.length < pageSize) break
  }

  return { brandsSynced, presentationsSynced, brandsVersion, presentationsVersion }
}
```

- [ ] **Step 4: Re-export from the barrel**

Append to `packages/drug-catalog-sync/src/index.ts`:
```typescript
export { runCatalogSync, runBrandSync, CATALOG_SYNC_PAGE_SIZE } from './sync.js'
export type { CatalogSyncResult, BrandSyncResult } from './sync.js'
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm -F @ultranos/drug-catalog-sync test`
Expected: PASS (smoke + client + memory-store + 5 sync tests).

- [ ] **Step 6: Commit**

```bash
git add packages/drug-catalog-sync/src
git commit -m "feat(drug-catalog-sync): paged delta-sync orchestrator with watermarks + stalled-server guard"
```

---

### Task 5: Coverage helpers (`coverage.ts`)

**Files:**
- Create: `packages/drug-catalog-sync/src/coverage.ts`
- Modify: `packages/drug-catalog-sync/src/index.ts`
- Test: `packages/drug-catalog-sync/src/__tests__/coverage.test.ts`

**Interfaces:**
- Consumes: `DrugEntryTier2`, `DrugEntryTier3`, `DrugLocalizedText` (`@ultranos/shared-types`); `DrugEntry` (Task 2).
- Produces:
  - `type FieldPresence = 'present' | 'absent'`
  - `function hasText(field?: DrugLocalizedText): boolean` — true if any language value is a non-empty string.
  - `function hasList<T>(arr?: T[]): boolean`
  - `function hasValue(v?: string | number | null): boolean`
  - `function isTier2(entry: DrugEntry): entry is DrugEntryTier2` — narrows via `'interactions' in entry`.
  - `function isTier3(entry: DrugEntry): entry is DrugEntryTier3` — narrows via `'recallAlerts' in entry`.
  - `function presence(value: unknown): FieldPresence` — generic present/absent for arrays, localized objects, scalars.

These give callers an explicit `absent` state so a 45–60%-covered field renders "No data for this drug" rather than implying "none/safe" (Rule #3).

- [ ] **Step 1: Write the failing test**

`packages/drug-catalog-sync/src/__tests__/coverage.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { hasText, hasList, hasValue, isTier2, isTier3, presence } from '../coverage.js'
import type { DrugEntry } from '../client.js'

describe('coverage helpers', () => {
  it('hasText is true only when some language value is non-empty', () => {
    expect(hasText(undefined)).toBe(false)
    expect(hasText({ en: '' } as never)).toBe(false)
    expect(hasText({ en: '   ' } as never)).toBe(false)
    expect(hasText({ en: 'Take with food' } as never)).toBe(true)
    expect(hasText({ en: '', prs: 'با غذا' } as never)).toBe(true)
  })

  it('hasList / hasValue distinguish empty from present', () => {
    expect(hasList(undefined)).toBe(false)
    expect(hasList([])).toBe(false)
    expect(hasList(['x'])).toBe(true)
    expect(hasValue('')).toBe(false)
    expect(hasValue('rx')).toBe(true)
    expect(hasValue(0)).toBe(true)
    expect(hasValue(null)).toBe(false)
  })

  it('tier guards narrow by sentinel fields', () => {
    const tier1 = { atcCode: 'A' } as unknown as DrugEntry
    const tier2 = { atcCode: 'A', interactions: [] } as unknown as DrugEntry
    const tier3 = { atcCode: 'A', interactions: [], recallAlerts: [] } as unknown as DrugEntry
    expect(isTier2(tier1)).toBe(false)
    expect(isTier2(tier2)).toBe(true)
    expect(isTier3(tier2)).toBe(false)
    expect(isTier3(tier3)).toBe(true)
  })

  it('presence reports absent for empty arrays, objects, and scalars', () => {
    expect(presence([])).toBe('absent')
    expect(presence(['x'])).toBe('present')
    expect(presence({ en: '' })).toBe('absent')
    expect(presence({ en: 'hi' })).toBe('present')
    expect(presence('')).toBe('absent')
    expect(presence(undefined)).toBe('absent')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F @ultranos/drug-catalog-sync test coverage`
Expected: FAIL — `Cannot find module '../coverage.js'`.

- [ ] **Step 3: Write the implementation**

`packages/drug-catalog-sync/src/coverage.ts`:
```typescript
import type {
  DrugEntryTier2,
  DrugEntryTier3,
  DrugLocalizedText,
} from '@ultranos/shared-types'
import type { DrugEntry } from './client.js'

export type FieldPresence = 'present' | 'absent'

function someNonEmptyString(obj: Record<string, unknown>): boolean {
  return Object.values(obj).some((v) => typeof v === 'string' && v.trim().length > 0)
}

/** True when a localized text field carries a non-empty value in any language. */
export function hasText(field?: DrugLocalizedText): boolean {
  if (!field) return false
  return someNonEmptyString(field as unknown as Record<string, unknown>)
}

export function hasList<T>(arr?: T[]): boolean {
  return Array.isArray(arr) && arr.length > 0
}

export function hasValue(v?: string | number | null): boolean {
  if (typeof v === 'number') return Number.isFinite(v)
  return typeof v === 'string' && v.trim().length > 0
}

/** Narrows to the clinical tier (sentinel: `interactions` is Tier-2+). */
export function isTier2(entry: DrugEntry): entry is DrugEntryTier2 {
  return 'interactions' in entry
}

/** Narrows to the pharmacist tier (sentinel: `recallAlerts` is Tier-3 only). */
export function isTier3(entry: DrugEntry): entry is DrugEntryTier3 {
  return 'recallAlerts' in entry
}

/** Generic present/absent classifier for arrays, localized objects, and scalars. */
export function presence(value: unknown): FieldPresence {
  if (Array.isArray(value)) return value.length > 0 ? 'present' : 'absent'
  if (value && typeof value === 'object') {
    return someNonEmptyString(value as Record<string, unknown>) ? 'present' : 'absent'
  }
  return hasValue(value as string | number | null | undefined) ? 'present' : 'absent'
}
```

- [ ] **Step 4: Re-export from the barrel**

Append to `packages/drug-catalog-sync/src/index.ts`:
```typescript
export { hasText, hasList, hasValue, isTier2, isTier3, presence } from './coverage.js'
export type { FieldPresence } from './coverage.js'
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm -F @ultranos/drug-catalog-sync test`
Expected: PASS (all suites).

- [ ] **Step 6: Commit**

```bash
git add packages/drug-catalog-sync/src
git commit -m "feat(drug-catalog-sync): field-coverage helpers for honest empty-state rendering"
```

---

### Task 6: Final verification (typecheck + build + full test)

**Files:**
- No new files. Verifies the whole package.

**Interfaces:**
- Consumes: everything from Tasks 1–5.
- Produces: a green, buildable package ready for app consumption in Phase 1/2.

- [ ] **Step 1: Typecheck**

Run: `pnpm -F @ultranos/drug-catalog-sync typecheck`
Expected: `tsc --noEmit` exits 0 with no errors.

- [ ] **Step 2: Full test run**

Run: `pnpm -F @ultranos/drug-catalog-sync test`
Expected: All suites PASS (smoke, client, memory-store, sync, coverage).

- [ ] **Step 3: Build**

Run: `pnpm -F @ultranos/drug-catalog-sync build`
Expected: `tsc` exits 0; `dist/index.js` + `dist/index.d.ts` present.

- [ ] **Step 4: Monorepo-wide typecheck (catch consumer resolution issues early)**

Run: `pnpm typecheck`
Expected: exits 0 — the new package resolves cleanly across the workspace.

- [ ] **Step 5: Commit (only if any config/lockfile changed during verification)**

```bash
git add -A
git commit -m "chore(drug-catalog-sync): verify build, typecheck, and tests green"
```

---

## Self-Review

**1. Spec coverage** (against the Phase 0 acceptance: *"reusable local mirror + delta sync of the three tables; per-table watermark cursors; role scope server-side; coverage() honest-empty helper; cold + delta green; non-PHI"*):
- Local mirror + delta sync → Tasks 2–4 (client + store + orchestrator). ✓
- Three tables, independent cursors → `runCatalogSync` (`catalogVersion`) + `runBrandSync` (`brandsVersion`, `presentationsVersion`). ✓
- Role scope server-side → client sends only the bearer token; the hub's `scopeEntryToTier` decides the tier; the store persists whatever tier arrives (no client-side tiering). ✓
- coverage / honest-empty → Task 5. ✓
- Cold + delta sync → Task 4 tests cover both (cold paging + cursor-resume). ✓
- Non-PHI discipline → orchestrator logs nothing; constraint documented. ✓
- **Deferred (documented, not a gap):** Dexie adapters, schema bumps (OPD v24 / Pharmacy v13), and the app sync hooks (throttle/online-gate/single-flight) land in Phase 1/2 where the mirror is consumed.

**2. Placeholder scan:** No TBD/TODO/"add error handling"/"similar to Task N". Every code step is complete. ✓

**3. Type consistency:** `DrugEntry` defined in Task 2 and reused verbatim in Tasks 3–5. `DrugCatalogStore`/`CursorKey` defined in Task 3, consumed in Task 4. `CatalogClient` method names (`syncDrugs`/`syncBrands`/`syncBrandPresentations`) consistent across client, fakes, and orchestrator. Cursor keys (`catalogVersion`/`brandsVersion`/`presentationsVersion`/`lastSyncAt`) consistent between `CursorKey`, the in-memory store, and the orchestrator. ✓

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-23-phase-0-drug-catalog-sync.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session with checkpoints for review.

Which approach?
