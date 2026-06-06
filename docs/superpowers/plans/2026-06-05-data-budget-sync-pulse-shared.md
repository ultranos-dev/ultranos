# Data Budget & SyncPulse — Shared Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the `data-meter` and `data-budget-calc` pure libs to `packages/sync-engine`; port full DataBudget (Dexie schema + store + settings page) and SyncPulse (replacing OnlineStatusIndicator) to opd-lite and pharmacy-lite; wire metered fetch into opd-lite and pharmacy-lite sync workers.

**Architecture:** The pure, zero-dependency calculation and metering libs live in `packages/sync-engine` and are imported by all three spoke apps. Each app retains its own Dexie instance with per-app schema versions for the new tables. Stores and UI components are duplicated per app (no sharing possible due to app-local Dexie). SyncPulse replaces OnlineStatusIndicator in lab-lite's PageHeader; DataBudgetIndicator is added to all three apps' page headers.

**Tech Stack:** Dexie v3 (IndexedDB), Zustand, Next.js 15 (App Router), `next-intl` i18n, `fake-indexeddb` for testing, `@ultranos/sync-engine` (pnpm workspace package, `type:module`), TypeScript 5.4

---

## File Structure

**Created:**
- `packages/sync-engine/src/data-meter.ts` — moved from lab-lite (pure, zero-dep)
- `packages/sync-engine/src/data-budget-calc.ts` — moved from lab-lite (pure, zero-dep)
- `apps/opd-lite/src/stores/data-budget-store.ts`
- `apps/opd-lite/src/components/DataBudgetIndicator.tsx`
- `apps/opd-lite/src/components/settings/DataBudgetDashboard.tsx`
- `apps/opd-lite/src/app/[locale]/settings/data-budget/page.tsx`
- `apps/pharmacy-lite/src/stores/data-budget-store.ts`
- `apps/pharmacy-lite/src/components/DataBudgetIndicator.tsx`
- `apps/pharmacy-lite/src/components/settings/DataBudgetDashboard.tsx`
- `apps/pharmacy-lite/src/app/[locale]/settings/data-budget/page.tsx`
- `apps/lab-lite/src/components/SyncPulse.tsx`
- `apps/opd-lite/src/__tests__/data-budget.test.ts`
- `apps/pharmacy-lite/src/__tests__/data-budget.test.ts`

**Modified:**
- `packages/sync-engine/src/index.ts` — add exports for data-meter and data-budget-calc
- `apps/lab-lite/src/lib/db.ts` — update `DataUsageCategory` import from sync-engine, remove local data-meter/data-budget-calc files
- `apps/lab-lite/src/stores/data-budget-store.ts` — update import path to `@ultranos/sync-engine`
- `apps/lab-lite/src/stores/sync-store.ts` — add `conflictCount`, `isDashboardOpen`, `setConflictCount`, `setDashboardOpen`
- `apps/lab-lite/src/components/PageHeader.tsx` — replace `OnlineStatusIndicator` with `SyncPulse` + add `DataBudgetIndicator`
- `apps/opd-lite/src/lib/db.ts` — add DataBudget types + v21 schema + helpers
- `apps/opd-lite/src/lib/sync-worker.ts` — wrap fetch with `createMeterFetch`
- `apps/opd-lite/src/components/BreadcrumbHeader.tsx` — add `DataBudgetIndicator`
- `apps/pharmacy-lite/src/lib/db.ts` — add DataBudget types + v11 schema + helpers
- `apps/pharmacy-lite/src/lib/drain-sync-fn.ts` — wrap fetch with `createMeterFetch`
- `apps/pharmacy-lite/src/components/BreadcrumbHeader.tsx` — add `DataBudgetIndicator`
- `apps/pharmacy-lite/src/stores/sync-store.ts` — add `conflictCount`, `isDashboardOpen`, `setConflictCount`, `setDashboardOpen`
- `apps/opd-lite/messages/en.json` + `ar.json` + `prs.json` + `ps.json` — add `dataBudget` key
- `apps/pharmacy-lite/messages/en.json` + `ar.json` + `prs.json` + `ps.json` — add `dataBudget` key

**Deleted:**
- `apps/lab-lite/src/lib/data-meter.ts` — moved to sync-engine
- `apps/lab-lite/src/lib/data-budget-calc.ts` — moved to sync-engine

---

## Task 1: Extract pure libs to packages/sync-engine

**Files:**
- Create: `packages/sync-engine/src/data-meter.ts`
- Create: `packages/sync-engine/src/data-budget-calc.ts`
- Modify: `packages/sync-engine/src/index.ts`

- [ ] **Step 1: Write the unit test for extractability**

Create `packages/sync-engine/src/__tests__/data-budget-calc.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  getThresholdLevel,
  calculateProjectedExhaustion,
  getCycleStartDate,
  getCycleEndDate,
  isCycleBoundaryCrossed,
} from '../data-budget-calc.js'

describe('getThresholdLevel', () => {
  it('returns normal below 75%', () => {
    expect(getThresholdLevel(300, 500)).toBe('normal')
  })
  it('returns warning at 75%', () => {
    expect(getThresholdLevel(375, 500)).toBe('warning')
  })
  it('returns critical at 90%', () => {
    expect(getThresholdLevel(450, 500)).toBe('critical')
  })
  it('returns normal when planSizeMB is 0', () => {
    expect(getThresholdLevel(100, 0)).toBe('normal')
  })
})

describe('calculateProjectedExhaustion', () => {
  it('returns null when avgDailyUsageMB is 0', () => {
    expect(calculateProjectedExhaustion({ planSizeMB: 500, usedMB: 100, avgDailyUsageMB: 0, cycleEndDate: '2026-06-30' })).toBeNull()
  })
  it('returns current date when already exhausted', () => {
    const today = new Date().toISOString().slice(0, 10)
    expect(calculateProjectedExhaustion({ planSizeMB: 500, usedMB: 600, avgDailyUsageMB: 10, cycleEndDate: '2026-06-30' })).toBe(today)
  })
  it('caps projection at cycle end date', () => {
    // Only 0.1 MB/day, 400 MB remaining → would take 4000 days, exceeds any cycle end
    const cycleEndDate = '2026-06-30'
    expect(calculateProjectedExhaustion({ planSizeMB: 500, usedMB: 100, avgDailyUsageMB: 0.1, cycleEndDate })).toBe(cycleEndDate)
  })
})

describe('getCycleStartDate', () => {
  it('returns current month start if day has passed', () => {
    const ref = new Date('2026-06-15')
    expect(getCycleStartDate(1, ref)).toBe('2026-06-01')
  })
  it('returns previous month start if day has not arrived', () => {
    const ref = new Date('2026-06-05')
    expect(getCycleStartDate(10, ref)).toBe('2026-05-10')
  })
})

describe('isCycleBoundaryCrossed', () => {
  it('returns false when still in same cycle', () => {
    expect(isCycleBoundaryCrossed('2026-06-01', 1, new Date('2026-06-15'))).toBe(false)
  })
  it('returns true when next cycle has started', () => {
    expect(isCycleBoundaryCrossed('2026-05-01', 1, new Date('2026-06-05'))).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails (file not yet created)**

```bash
cd apps/lab-lite && pnpm vitest run src/__tests__/data-budget-calc.test.ts 2>&1 | head -20
```

Expected: error — cannot find module `../data-budget-calc.js`

Actually these go in sync-engine, so:

```bash
cd packages/sync-engine && pnpm vitest run src/__tests__/data-budget-calc.test.ts 2>&1 | head -20
```

Expected: FAIL — `Cannot find module '../data-budget-calc.js'`

- [ ] **Step 3: Create `packages/sync-engine/src/data-budget-calc.ts`**

Copy exact content from `apps/lab-lite/src/lib/data-budget-calc.ts` (no imports, fully self-contained):

```typescript
/**
 * Pure calculation functions for Data Budget Mode.
 * No side effects — used by the Zustand store and tests.
 */

export type ThresholdLevel = 'normal' | 'warning' | 'critical'

export function getThresholdLevel(usedMB: number, planSizeMB: number): ThresholdLevel {
  if (planSizeMB <= 0) return 'normal'
  const pct = usedMB / planSizeMB
  if (pct >= 0.9) return 'critical'
  if (pct >= 0.75) return 'warning'
  return 'normal'
}

export function calculateProjectedExhaustion(params: {
  planSizeMB: number
  usedMB: number
  avgDailyUsageMB: number
  cycleEndDate: string
}): string | null {
  const { planSizeMB, usedMB, avgDailyUsageMB, cycleEndDate } = params
  if (avgDailyUsageMB <= 0) return null
  const remainingMB = planSizeMB - usedMB
  if (remainingMB <= 0) {
    return new Date().toISOString().slice(0, 10)
  }
  const daysRemaining = remainingMB / avgDailyUsageMB
  const projectedDate = new Date()
  projectedDate.setDate(projectedDate.getDate() + Math.round(daysRemaining))
  const cycleEnd = new Date(cycleEndDate)
  if (projectedDate > cycleEnd) {
    return cycleEndDate
  }
  return projectedDate.toISOString().slice(0, 10)
}

export function getCycleStartDate(billingCycleDay: number, referenceDate: Date = new Date()): string {
  const year = referenceDate.getFullYear()
  const month = referenceDate.getMonth()
  const day = referenceDate.getDate()
  if (day >= billingCycleDay) {
    return new Date(year, month, billingCycleDay).toISOString().slice(0, 10)
  }
  return new Date(year, month - 1, billingCycleDay).toISOString().slice(0, 10)
}

export function getCycleEndDate(billingCycleDay: number, cycleStart: string): string {
  const start = new Date(cycleStart)
  const nextStart = new Date(start.getFullYear(), start.getMonth() + 1, billingCycleDay)
  const end = new Date(nextStart)
  end.setDate(end.getDate() - 1)
  return end.toISOString().slice(0, 10)
}

export function isCycleBoundaryCrossed(
  currentCycleStart: string,
  billingCycleDay: number,
  today: Date = new Date(),
): boolean {
  const expectedCycleStart = getCycleStartDate(billingCycleDay, today)
  return expectedCycleStart !== currentCycleStart
}
```

- [ ] **Step 4: Create `packages/sync-engine/src/data-meter.ts`**

Copy exact content from `apps/lab-lite/src/lib/data-meter.ts`:

```typescript
/**
 * Network usage metering layer for Data Budget Mode.
 * Estimates payload sizes for outgoing/incoming requests and records usage.
 * Never blocks or fails network requests — metering errors are swallowed.
 */

const OVERHEAD_MULTIPLIER = 1.15

export type DataUsageCategory = 'upload' | 'audit' | 'notification' | 'other'

export interface RecordUsageFn {
  (entry: {
    date: string
    category: DataUsageCategory
    bytesOut: number
    bytesIn: number
    requestCount: number
  }): Promise<void>
}

export function estimateRequestSize(body: BodyInit | null | undefined): number {
  if (!body) return 0
  let raw = 0
  if (typeof body === 'string') {
    raw = typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(body).byteLength : body.length
  } else if (body instanceof Blob) {
    raw = body.size
  } else if (body instanceof ArrayBuffer) {
    raw = body.byteLength
  } else if (body instanceof FormData) {
    let size = 0
    body.forEach((value) => {
      if (typeof value === 'string') {
        size += value.length
      } else {
        size += value.size
      }
    })
    raw = size
  } else {
    raw = String(body).length
  }
  return Math.round(raw * OVERHEAD_MULTIPLIER)
}

export function estimateResponseSize(
  headers: Headers,
  responseBody: string | null,
): number {
  const contentLength = headers.get('Content-Length')
  if (contentLength) {
    const parsed = parseInt(contentLength, 10)
    if (!isNaN(parsed)) return parsed
  }
  if (responseBody) return responseBody.length
  return 0
}

export function categorizeUrl(url: string): DataUsageCategory {
  if (url.includes('audit.sync') || url.includes('audit')) return 'audit'
  if (url.includes('upload') || url.includes('uploadResult')) return 'upload'
  if (url.includes('notification')) return 'notification'
  return 'other'
}

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function createMeterFetch(
  baseFetch: typeof fetch,
  recordUsage: RecordUsageFn,
): typeof fetch {
  return async function meterFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const category = categorizeUrl(url)
    const bytesOut = estimateRequestSize(init?.body)

    let response: Response
    try {
      response = await baseFetch(input, init)
    } catch (err) {
      try {
        void recordUsage({ date: todayISO(), category, bytesOut, bytesIn: 0, requestCount: 1 }).catch(() => {})
      } catch { /* Swallow */ }
      throw err
    }

    try {
      let bytesIn = estimateResponseSize(response.headers, null)
      if (bytesIn === 0) {
        try {
          const clone = response.clone()
          const text = await clone.text()
          bytesIn = typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(text).byteLength : text.length
        } catch { /* Stream may not be cloneable — accept 0 */ }
      }
      void recordUsage({
        date: todayISO(),
        category,
        bytesOut,
        bytesIn,
        requestCount: 1,
      }).catch(() => {})
    } catch {
      // Swallow
    }

    return response
  }
}
```

- [ ] **Step 5: Add exports to `packages/sync-engine/src/index.ts`**

Append to the end of `packages/sync-engine/src/index.ts`:

```typescript
export {
  createMeterFetch,
  estimateRequestSize,
  estimateResponseSize,
  categorizeUrl,
} from './data-meter.js'
export type { DataUsageCategory, RecordUsageFn } from './data-meter.js'

export {
  getThresholdLevel,
  calculateProjectedExhaustion,
  getCycleStartDate,
  getCycleEndDate,
  isCycleBoundaryCrossed,
} from './data-budget-calc.js'
export type { ThresholdLevel } from './data-budget-calc.js'
```

- [ ] **Step 6: Build sync-engine and run tests**

```bash
pnpm -F @ultranos/sync-engine build
```

Expected: no TypeScript errors, `dist/index.js` and `dist/index.d.ts` regenerated.

```bash
pnpm -F @ultranos/sync-engine test
```

Expected: all tests PASS including new data-budget-calc tests.

- [ ] **Step 7: Update lab-lite to import from sync-engine**

In `apps/lab-lite/src/lib/db.ts`, find `export type DataUsageCategory = 'upload' | 'audit' | 'notification' | 'other'` and remove it (it's now exported from sync-engine). Then add import at top of file:

```typescript
import type { DataUsageCategory } from '@ultranos/sync-engine'
export type { DataUsageCategory }  // re-export for existing consumers
```

In `apps/lab-lite/src/stores/data-budget-store.ts`, update the import:

```typescript
// Before:
import {
  calculateProjectedExhaustion,
  getThresholdLevel,
  getCycleEndDate,
  type ThresholdLevel,
} from '@/lib/data-budget-calc'

// After:
import {
  calculateProjectedExhaustion,
  getThresholdLevel,
  getCycleEndDate,
  type ThresholdLevel,
} from '@ultranos/sync-engine'
```

In `apps/lab-lite/src/lib/upload-queue-worker.ts`, update the import:

```typescript
// Before:
import { createMeterFetch } from '@/lib/data-meter'

// After:
import { createMeterFetch } from '@ultranos/sync-engine'
```

- [ ] **Step 8: Delete redundant lab-lite source files**

```bash
rm apps/lab-lite/src/lib/data-meter.ts
rm apps/lab-lite/src/lib/data-budget-calc.ts
```

- [ ] **Step 9: Verify lab-lite TypeScript still passes**

```bash
pnpm -F lab-lite typecheck
```

Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add packages/sync-engine/src/data-meter.ts packages/sync-engine/src/data-budget-calc.ts packages/sync-engine/src/index.ts packages/sync-engine/src/__tests__/data-budget-calc.test.ts apps/lab-lite/src/lib/db.ts apps/lab-lite/src/stores/data-budget-store.ts apps/lab-lite/src/lib/upload-queue-worker.ts
git rm apps/lab-lite/src/lib/data-meter.ts apps/lab-lite/src/lib/data-budget-calc.ts
git commit -m "refactor(sync-engine): extract data-meter and data-budget-calc from lab-lite to shared package"
```

---

## Task 2: opd-lite Dexie schema — DataBudget tables (v21)

**Files:**
- Modify: `apps/opd-lite/src/lib/db.ts:177`

- [ ] **Step 1: Write the failing test**

Create `apps/opd-lite/src/__tests__/data-budget.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import {
  getDb,
  getDataBudgetConfig,
  updateDataBudgetConfig,
  recordDataUsage,
  getUsageForCycle,
  getUsageByDay,
  checkAndRolloverCycle,
  type DataBudgetConfig,
  type DataUsageRecord,
} from '../lib/db'

describe('Data Budget — Dexie Schema & Helpers (opd-lite)', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.table('dataBudgetConfig').clear()
    await db.table('dataUsage').clear()
  })

  afterEach(async () => {
    const db = getDb()
    await db.table('dataBudgetConfig').clear()
    await db.table('dataUsage').clear()
  })

  it('returns default config when no row exists', async () => {
    const config = await getDataBudgetConfig()
    expect(config).toEqual({
      id: 'config',
      planSizeMB: 500,
      billingCycleDay: 1,
      lowDataMode: false,
      currentCycleStart: expect.any(String),
    })
  })

  it('updates config fields without overwriting others', async () => {
    await updateDataBudgetConfig({ planSizeMB: 1000, lowDataMode: true })
    const config = await getDataBudgetConfig()
    expect(config.planSizeMB).toBe(1000)
    expect(config.lowDataMode).toBe(true)
    expect(config.billingCycleDay).toBe(1)
  })

  it('records data usage entries', async () => {
    await recordDataUsage({ date: '2026-06-05', category: 'upload', bytesOut: 2048, bytesIn: 512, requestCount: 1 })
    await recordDataUsage({ date: '2026-06-05', category: 'audit', bytesOut: 256, bytesIn: 64, requestCount: 1 })
    const db = getDb()
    const rows = await db.table('dataUsage').toArray()
    expect(rows).toHaveLength(2)
  })

  it('getUsageByDay filters by date range', async () => {
    await recordDataUsage({ date: '2026-06-01', category: 'upload', bytesOut: 1000, bytesIn: 100, requestCount: 1 })
    await recordDataUsage({ date: '2026-06-10', category: 'upload', bytesOut: 2000, bytesIn: 200, requestCount: 1 })
    await recordDataUsage({ date: '2026-06-20', category: 'upload', bytesOut: 3000, bytesIn: 300, requestCount: 1 })
    const results = await getUsageByDay('2026-06-05', '2026-06-15')
    expect(results).toHaveLength(1)
    expect(results[0].date).toBe('2026-06-10')
  })

  it('checkAndRolloverCycle rolls over when cycle has expired', async () => {
    await updateDataBudgetConfig({
      billingCycleDay: 1,
      currentCycleStart: '2026-04-01', // old cycle
    })
    const rolled = await checkAndRolloverCycle()
    expect(rolled).toBe(true)
    const config = await getDataBudgetConfig()
    expect(config.currentCycleStart).not.toBe('2026-04-01')
  })

  it('checkAndRolloverCycle does not roll over within current cycle', async () => {
    const today = new Date()
    const thisMonthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
    await updateDataBudgetConfig({ billingCycleDay: 1, currentCycleStart: thisMonthStart })
    const rolled = await checkAndRolloverCycle()
    expect(rolled).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm -F opd-lite vitest run src/__tests__/data-budget.test.ts 2>&1 | head -30
```

Expected: FAIL — `db.table('dataBudgetConfig') is not a table`

- [ ] **Step 3: Add types to `apps/opd-lite/src/lib/db.ts`**

After the `LocalDiagnosticReport` type (around line 145), add:

```typescript
// Data Budget types — Story 48.x / Data Connectivity
// ---------------------------------------------------------------------------

export type DataUsageCategory = 'upload' | 'audit' | 'notification' | 'other'

export interface DataBudgetConfig {
  id: 'config'
  planSizeMB: number
  billingCycleDay: number   // 1-28: day of month cycle resets
  lowDataMode: boolean
  currentCycleStart: string // ISO 8601 date of current cycle start
}

export interface DataUsageRecord {
  date: string
  category: DataUsageCategory
  bytesOut: number
  bytesIn: number
  requestCount: number
}
```

- [ ] **Step 4: Declare tables on the `OpdLiteDatabase` class**

After `syncMeta!: EntityTable<SyncMetaEntry, 'patientId'>` (line 177), add:

```typescript
  dataBudgetConfig!: Dexie.Table<DataBudgetConfig, string>
  dataUsage!: Dexie.Table<DataUsageRecord & { id?: number }, number>
```

- [ ] **Step 5: Add v21 schema version**

After the closing brace of `this.version(20).stores(...)` block (around line 553), add:

```typescript
    // v21: Data Budget tables — track network usage per billing cycle (Story 48.x)
    // No PHI — contains only byte counts, dates, and category labels.
    this.version(21).stores({
      dataBudgetConfig: '&id',
      dataUsage: '++id, date, category, [date+category]',
    })
```

- [ ] **Step 6: Add helper functions to `apps/opd-lite/src/lib/db.ts`**

At the bottom of the file (before any `export const db` singleton declaration), add:

```typescript
// ---------------------------------------------------------------------------
// Data Budget helpers (v21) — Story 48.x
// No PHI — network usage metrics only.
// ---------------------------------------------------------------------------

const DATA_BUDGET_CONFIG_ID = 'config' as const

const DEFAULT_DATA_BUDGET_CONFIG: DataBudgetConfig = {
  id: DATA_BUDGET_CONFIG_ID,
  planSizeMB: 500,
  billingCycleDay: 1,
  lowDataMode: false,
  currentCycleStart: new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1,
  ).toISOString().slice(0, 10),
}

export async function getDataBudgetConfig(): Promise<DataBudgetConfig> {
  const stored = await db.dataBudgetConfig.get(DATA_BUDGET_CONFIG_ID)
  return stored ?? { ...DEFAULT_DATA_BUDGET_CONFIG }
}

export async function updateDataBudgetConfig(
  updates: Partial<Omit<DataBudgetConfig, 'id'>>,
): Promise<void> {
  const current = await getDataBudgetConfig()
  await db.dataBudgetConfig.put({ ...current, ...updates, id: DATA_BUDGET_CONFIG_ID })
}

export async function recordDataUsage(record: DataUsageRecord): Promise<void> {
  await db.dataUsage.add(record)
}

export async function getUsageByDay(startDate: string, endDate: string): Promise<DataUsageRecord[]> {
  return db.dataUsage
    .where('date')
    .between(startDate, endDate, true, true)
    .toArray()
}

export async function getUsageForCycle(): Promise<DataUsageRecord[]> {
  const config = await getDataBudgetConfig()
  const today = new Date().toISOString().slice(0, 10)
  return db.dataUsage
    .where('date')
    .between(config.currentCycleStart, today, true, true)
    .toArray()
}

export async function checkAndRolloverCycle(): Promise<boolean> {
  return db.transaction('rw', db.dataBudgetConfig, async () => {
    const stored = await db.dataBudgetConfig.get(DATA_BUDGET_CONFIG_ID)
    const config = stored ?? { ...DEFAULT_DATA_BUDGET_CONFIG }
    const today = new Date()
    const cycleStart = new Date(config.currentCycleStart)
    const nextCycleDate = new Date(
      cycleStart.getFullYear(),
      cycleStart.getMonth() + 1,
      Math.min(config.billingCycleDay, 28),
    )
    if (today >= nextCycleDate) {
      const newCycleStart = new Date(
        today.getFullYear(),
        today.getMonth(),
        Math.min(config.billingCycleDay, 28),
      )
      if (newCycleStart > today) {
        newCycleStart.setMonth(newCycleStart.getMonth() - 1)
      }
      await db.dataBudgetConfig.put({
        ...config,
        currentCycleStart: newCycleStart.toISOString().slice(0, 10),
      })
      return true
    }
    return false
  })
}
```

**Important:** The `db` variable must be in scope. In opd-lite, check how `db` is exported — look for `export const db = new OpdLiteDatabase()` or similar pattern, and verify the helper functions reference it correctly. Use `getDb()` if opd-lite uses a lazy initializer like lab-lite; otherwise use `db` directly.

- [ ] **Step 7: Run test to verify it passes**

```bash
pnpm -F opd-lite vitest run src/__tests__/data-budget.test.ts
```

Expected: all 5 tests PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/opd-lite/src/lib/db.ts apps/opd-lite/src/__tests__/data-budget.test.ts
git commit -m "feat(opd-lite): add DataBudget Dexie schema (v21) and helper functions"
```

---

## Task 3: pharmacy-lite Dexie schema — DataBudget tables (v11)

**Files:**
- Modify: `apps/pharmacy-lite/src/lib/db.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/pharmacy-lite/src/__tests__/data-budget.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import {
  getDb,
  getDataBudgetConfig,
  updateDataBudgetConfig,
  recordDataUsage,
  getUsageForCycle,
  getUsageByDay,
  checkAndRolloverCycle,
  type DataBudgetConfig,
  type DataUsageRecord,
} from '../lib/db'

describe('Data Budget — Dexie Schema & Helpers (pharmacy-lite)', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.table('dataBudgetConfig').clear()
    await db.table('dataUsage').clear()
  })

  afterEach(async () => {
    const db = getDb()
    await db.table('dataBudgetConfig').clear()
    await db.table('dataUsage').clear()
  })

  it('returns default config when no row exists', async () => {
    const config = await getDataBudgetConfig()
    expect(config).toEqual({
      id: 'config',
      planSizeMB: 500,
      billingCycleDay: 1,
      lowDataMode: false,
      currentCycleStart: expect.any(String),
    })
  })

  it('updates config without overwriting unspecified fields', async () => {
    await updateDataBudgetConfig({ planSizeMB: 250 })
    const config = await getDataBudgetConfig()
    expect(config.planSizeMB).toBe(250)
    expect(config.billingCycleDay).toBe(1)
    expect(config.lowDataMode).toBe(false)
  })

  it('records and retrieves usage entries', async () => {
    await recordDataUsage({ date: '2026-06-05', category: 'audit', bytesOut: 512, bytesIn: 128, requestCount: 1 })
    const results = await getUsageByDay('2026-06-01', '2026-06-30')
    expect(results).toHaveLength(1)
    expect(results[0].category).toBe('audit')
  })

  it('getUsageForCycle only returns records since cycle start', async () => {
    await updateDataBudgetConfig({ currentCycleStart: '2026-06-01' })
    await recordDataUsage({ date: '2026-05-20', category: 'other', bytesOut: 100, bytesIn: 50, requestCount: 1 })
    await recordDataUsage({ date: '2026-06-05', category: 'upload', bytesOut: 200, bytesIn: 100, requestCount: 1 })
    const results = await getUsageForCycle()
    expect(results).toHaveLength(1)
    expect(results[0].date).toBe('2026-06-05')
  })

  it('checkAndRolloverCycle rolls over when cycle has expired', async () => {
    await updateDataBudgetConfig({ billingCycleDay: 1, currentCycleStart: '2026-03-01' })
    const rolled = await checkAndRolloverCycle()
    expect(rolled).toBe(true)
  })
})
```

**Note:** pharmacy-lite's `db.ts` uses `export const db = new PharmacyLiteDatabase()` directly (no `getDb()` lazy pattern like lab-lite). Adapt the test to import `db` directly if needed — check the file's export pattern first.

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm -F pharmacy-lite vitest run src/__tests__/data-budget.test.ts 2>&1 | head -30
```

Expected: FAIL — `dataBudgetConfig` table not found.

- [ ] **Step 3: Add types to `apps/pharmacy-lite/src/lib/db.ts`**

Before the `PharmacyLiteDatabase` class declaration (around line 94), add:

```typescript
// Data Budget types — Story 48.x / Data Connectivity
// ---------------------------------------------------------------------------

export type DataUsageCategory = 'upload' | 'audit' | 'notification' | 'other'

export interface DataBudgetConfig {
  id: 'config'
  planSizeMB: number
  billingCycleDay: number
  lowDataMode: boolean
  currentCycleStart: string
}

export interface DataUsageRecord {
  date: string
  category: DataUsageCategory
  bytesOut: number
  bytesIn: number
  requestCount: number
}
```

- [ ] **Step 4: Declare tables on the `PharmacyLiteDatabase` class**

After `stockTransfers!: EntityTable<StockTransfer, 'id'>` (line 116), add:

```typescript
  dataBudgetConfig!: Dexie.Table<DataBudgetConfig, string>
  dataUsage!: Dexie.Table<DataUsageRecord & { id?: number }, number>
```

- [ ] **Step 5: Add v11 schema version**

After the closing brace of `this.version(10).stores(...)` block (around line 174), add:

```typescript
    // v11: Data Budget tables — track network usage per billing cycle (Story 48.x)
    // No PHI — contains only byte counts, dates, and category labels.
    this.version(11).stores({
      dataBudgetConfig: '&id',
      dataUsage: '++id, date, category, [date+category]',
    })
```

- [ ] **Step 6: Add helper functions**

Export singleton `db` is `export const db = new PharmacyLiteDatabase()`. The helper functions reference `db` directly. Add at the bottom of `apps/pharmacy-lite/src/lib/db.ts`:

```typescript
// ---------------------------------------------------------------------------
// Data Budget helpers (v11) — Story 48.x
// No PHI — network usage metrics only.
// ---------------------------------------------------------------------------

const DATA_BUDGET_CONFIG_ID = 'config' as const

const DEFAULT_DATA_BUDGET_CONFIG: DataBudgetConfig = {
  id: DATA_BUDGET_CONFIG_ID,
  planSizeMB: 500,
  billingCycleDay: 1,
  lowDataMode: false,
  currentCycleStart: new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1,
  ).toISOString().slice(0, 10),
}

export async function getDataBudgetConfig(): Promise<DataBudgetConfig> {
  const stored = await db.dataBudgetConfig.get(DATA_BUDGET_CONFIG_ID)
  return stored ?? { ...DEFAULT_DATA_BUDGET_CONFIG }
}

export async function updateDataBudgetConfig(
  updates: Partial<Omit<DataBudgetConfig, 'id'>>,
): Promise<void> {
  const current = await getDataBudgetConfig()
  await db.dataBudgetConfig.put({ ...current, ...updates, id: DATA_BUDGET_CONFIG_ID })
}

export async function recordDataUsage(record: DataUsageRecord): Promise<void> {
  await db.dataUsage.add(record)
}

export async function getUsageByDay(startDate: string, endDate: string): Promise<DataUsageRecord[]> {
  return db.dataUsage
    .where('date')
    .between(startDate, endDate, true, true)
    .toArray()
}

export async function getUsageForCycle(): Promise<DataUsageRecord[]> {
  const config = await getDataBudgetConfig()
  const today = new Date().toISOString().slice(0, 10)
  return db.dataUsage
    .where('date')
    .between(config.currentCycleStart, today, true, true)
    .toArray()
}

export async function checkAndRolloverCycle(): Promise<boolean> {
  return db.transaction('rw', db.dataBudgetConfig, async () => {
    const stored = await db.dataBudgetConfig.get(DATA_BUDGET_CONFIG_ID)
    const config = stored ?? { ...DEFAULT_DATA_BUDGET_CONFIG }
    const today = new Date()
    const cycleStart = new Date(config.currentCycleStart)
    const nextCycleDate = new Date(
      cycleStart.getFullYear(),
      cycleStart.getMonth() + 1,
      Math.min(config.billingCycleDay, 28),
    )
    if (today >= nextCycleDate) {
      const newCycleStart = new Date(
        today.getFullYear(),
        today.getMonth(),
        Math.min(config.billingCycleDay, 28),
      )
      if (newCycleStart > today) {
        newCycleStart.setMonth(newCycleStart.getMonth() - 1)
      }
      await db.dataBudgetConfig.put({
        ...config,
        currentCycleStart: newCycleStart.toISOString().slice(0, 10),
      })
      return true
    }
    return false
  })
}
```

- [ ] **Step 7: Run tests**

```bash
pnpm -F pharmacy-lite vitest run src/__tests__/data-budget.test.ts
```

Expected: all 5 tests PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/pharmacy-lite/src/lib/db.ts apps/pharmacy-lite/src/__tests__/data-budget.test.ts
git commit -m "feat(pharmacy-lite): add DataBudget Dexie schema (v11) and helper functions"
```

---

## Task 4: opd-lite DataBudgetStore

**Files:**
- Create: `apps/opd-lite/src/stores/data-budget-store.ts`

- [ ] **Step 1: Create the store**

```typescript
// apps/opd-lite/src/stores/data-budget-store.ts
import { create } from 'zustand'
import {
  getDataBudgetConfig,
  updateDataBudgetConfig,
  getUsageForCycle,
  getUsageByDay,
  checkAndRolloverCycle,
} from '@/lib/db'
import {
  calculateProjectedExhaustion,
  getThresholdLevel,
  getCycleEndDate,
  type ThresholdLevel,
} from '@ultranos/sync-engine'

export interface DataBudgetState {
  planSizeMB: number
  billingCycleDay: number
  lowDataMode: boolean
  currentCycleUsedMB: number
  projectedExhaustionDate: string | null
  dailyUsage: Array<{ date: string; totalMB: number }>
  categoryBreakdown: Record<string, number>
  thresholdLevel: ThresholdLevel
  isLoaded: boolean
  _loading: boolean
  loadFromDexie: () => Promise<void>
  updateConfig: (
    config: Partial<{ planSizeMB: number; billingCycleDay: number; lowDataMode: boolean }>,
  ) => Promise<void>
  refreshUsageStats: () => Promise<void>
}

export const useDataBudgetStore = create<DataBudgetState>()((set, get) => ({
  planSizeMB: 500,
  billingCycleDay: 1,
  lowDataMode: false,
  currentCycleUsedMB: 0,
  projectedExhaustionDate: null,
  dailyUsage: [],
  categoryBreakdown: {},
  thresholdLevel: 'normal' as ThresholdLevel,
  isLoaded: false,
  _loading: false,

  loadFromDexie: async () => {
    if (get()._loading) return
    set({ _loading: true })
    try {
      await checkAndRolloverCycle()
      const config = await getDataBudgetConfig()
      set({
        planSizeMB: config.planSizeMB,
        billingCycleDay: config.billingCycleDay,
        lowDataMode: config.lowDataMode,
        isLoaded: true,
      })
      await get().refreshUsageStats()
    } finally {
      set({ _loading: false })
    }
  },

  updateConfig: async (updates) => {
    await updateDataBudgetConfig(updates)
    const config = await getDataBudgetConfig()
    set({
      planSizeMB: config.planSizeMB,
      billingCycleDay: config.billingCycleDay,
      lowDataMode: config.lowDataMode,
    })
    await get().refreshUsageStats()
  },

  refreshUsageStats: async () => {
    const config = await getDataBudgetConfig()
    const cycleUsage = await getUsageForCycle()

    const totalBytes = cycleUsage.reduce((sum, r) => sum + r.bytesOut + r.bytesIn, 0)
    const currentCycleUsedMB = totalBytes / (1024 * 1024)

    const categoryBreakdown: Record<string, number> = {}
    for (const r of cycleUsage) {
      const mb = (r.bytesOut + r.bytesIn) / (1024 * 1024)
      categoryBreakdown[r.category] = (categoryBreakdown[r.category] ?? 0) + mb
    }

    const toLocalISO = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const today = new Date()
    const fourteenDaysAgo = new Date(today)
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13)
    const startDate = toLocalISO(fourteenDaysAgo)
    const endDate = toLocalISO(today)

    const recentUsage = await getUsageByDay(startDate, endDate)
    const dailyMap = new Map<string, number>()
    for (const r of recentUsage) {
      const mb = (r.bytesOut + r.bytesIn) / (1024 * 1024)
      dailyMap.set(r.date, (dailyMap.get(r.date) ?? 0) + mb)
    }

    const dailyUsage: Array<{ date: string; totalMB: number }> = []
    for (let i = 0; i < 14; i++) {
      const d = new Date(fourteenDaysAgo)
      d.setDate(d.getDate() + i)
      const dateStr = toLocalISO(d)
      dailyUsage.push({ date: dateStr, totalMB: dailyMap.get(dateStr) ?? 0 })
    }

    const last7 = dailyUsage.slice(-7)
    const avgDailyUsageMB =
      last7.length > 0
        ? last7.reduce((sum, d) => sum + d.totalMB, 0) / last7.length
        : 0

    const cycleEndDate = getCycleEndDate(config.billingCycleDay, config.currentCycleStart)
    const projectedExhaustionDate = calculateProjectedExhaustion({
      planSizeMB: config.planSizeMB,
      usedMB: currentCycleUsedMB,
      avgDailyUsageMB,
      cycleEndDate,
    })

    const thresholdLevel = getThresholdLevel(currentCycleUsedMB, config.planSizeMB)

    set({ currentCycleUsedMB, projectedExhaustionDate, dailyUsage, categoryBreakdown, thresholdLevel })
  },
}))
```

- [ ] **Step 2: Typecheck**

```bash
pnpm -F opd-lite typecheck 2>&1 | grep -E "error|data-budget-store"
```

Expected: no errors for this file.

- [ ] **Step 3: Commit**

```bash
git add apps/opd-lite/src/stores/data-budget-store.ts
git commit -m "feat(opd-lite): add DataBudgetStore (Zustand + Dexie)"
```

---

## Task 5: pharmacy-lite DataBudgetStore

**Files:**
- Create: `apps/pharmacy-lite/src/stores/data-budget-store.ts`

- [ ] **Step 1: Create the store**

```typescript
// apps/pharmacy-lite/src/stores/data-budget-store.ts
import { create } from 'zustand'
import {
  getDataBudgetConfig,
  updateDataBudgetConfig,
  getUsageForCycle,
  getUsageByDay,
  checkAndRolloverCycle,
} from '@/lib/db'
import {
  calculateProjectedExhaustion,
  getThresholdLevel,
  getCycleEndDate,
  type ThresholdLevel,
} from '@ultranos/sync-engine'

export interface DataBudgetState {
  planSizeMB: number
  billingCycleDay: number
  lowDataMode: boolean
  currentCycleUsedMB: number
  projectedExhaustionDate: string | null
  dailyUsage: Array<{ date: string; totalMB: number }>
  categoryBreakdown: Record<string, number>
  thresholdLevel: ThresholdLevel
  isLoaded: boolean
  _loading: boolean
  loadFromDexie: () => Promise<void>
  updateConfig: (
    config: Partial<{ planSizeMB: number; billingCycleDay: number; lowDataMode: boolean }>,
  ) => Promise<void>
  refreshUsageStats: () => Promise<void>
}

export const useDataBudgetStore = create<DataBudgetState>()((set, get) => ({
  planSizeMB: 500,
  billingCycleDay: 1,
  lowDataMode: false,
  currentCycleUsedMB: 0,
  projectedExhaustionDate: null,
  dailyUsage: [],
  categoryBreakdown: {},
  thresholdLevel: 'normal' as ThresholdLevel,
  isLoaded: false,
  _loading: false,

  loadFromDexie: async () => {
    if (get()._loading) return
    set({ _loading: true })
    try {
      await checkAndRolloverCycle()
      const config = await getDataBudgetConfig()
      set({
        planSizeMB: config.planSizeMB,
        billingCycleDay: config.billingCycleDay,
        lowDataMode: config.lowDataMode,
        isLoaded: true,
      })
      await get().refreshUsageStats()
    } finally {
      set({ _loading: false })
    }
  },

  updateConfig: async (updates) => {
    await updateDataBudgetConfig(updates)
    const config = await getDataBudgetConfig()
    set({
      planSizeMB: config.planSizeMB,
      billingCycleDay: config.billingCycleDay,
      lowDataMode: config.lowDataMode,
    })
    await get().refreshUsageStats()
  },

  refreshUsageStats: async () => {
    const config = await getDataBudgetConfig()
    const cycleUsage = await getUsageForCycle()

    const totalBytes = cycleUsage.reduce((sum, r) => sum + r.bytesOut + r.bytesIn, 0)
    const currentCycleUsedMB = totalBytes / (1024 * 1024)

    const categoryBreakdown: Record<string, number> = {}
    for (const r of cycleUsage) {
      const mb = (r.bytesOut + r.bytesIn) / (1024 * 1024)
      categoryBreakdown[r.category] = (categoryBreakdown[r.category] ?? 0) + mb
    }

    const toLocalISO = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const today = new Date()
    const fourteenDaysAgo = new Date(today)
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13)
    const recentUsage = await getUsageByDay(toLocalISO(fourteenDaysAgo), toLocalISO(today))
    const dailyMap = new Map<string, number>()
    for (const r of recentUsage) {
      const mb = (r.bytesOut + r.bytesIn) / (1024 * 1024)
      dailyMap.set(r.date, (dailyMap.get(r.date) ?? 0) + mb)
    }

    const dailyUsage: Array<{ date: string; totalMB: number }> = []
    for (let i = 0; i < 14; i++) {
      const d = new Date(fourteenDaysAgo)
      d.setDate(d.getDate() + i)
      const dateStr = toLocalISO(d)
      dailyUsage.push({ date: dateStr, totalMB: dailyMap.get(dateStr) ?? 0 })
    }

    const last7 = dailyUsage.slice(-7)
    const avgDailyUsageMB = last7.length > 0
      ? last7.reduce((sum, d) => sum + d.totalMB, 0) / last7.length
      : 0

    const cycleEndDate = getCycleEndDate(config.billingCycleDay, config.currentCycleStart)
    const projectedExhaustionDate = calculateProjectedExhaustion({
      planSizeMB: config.planSizeMB,
      usedMB: currentCycleUsedMB,
      avgDailyUsageMB,
      cycleEndDate,
    })

    const thresholdLevel = getThresholdLevel(currentCycleUsedMB, config.planSizeMB)
    set({ currentCycleUsedMB, projectedExhaustionDate, dailyUsage, categoryBreakdown, thresholdLevel })
  },
}))
```

- [ ] **Step 2: Typecheck**

```bash
pnpm -F pharmacy-lite typecheck 2>&1 | grep -E "error|data-budget-store"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/pharmacy-lite/src/stores/data-budget-store.ts
git commit -m "feat(pharmacy-lite): add DataBudgetStore (Zustand + Dexie)"
```

---

## Task 6: Upgrade lab-lite sync-store (SyncPulse prerequisites)

**Files:**
- Modify: `apps/lab-lite/src/stores/sync-store.ts`

The lab-lite SyncPulse needs `conflictCount`, `isDashboardOpen`, `setConflictCount`, `setDashboardOpen` on the store — currently absent.

- [ ] **Step 1: Replace `apps/lab-lite/src/stores/sync-store.ts` with full store**

```typescript
import { create } from 'zustand'

interface SyncStatus {
  isPending: boolean
  isError: boolean
  lastSyncedAt: string | null
  pendingCount: number
  failedCount: number
}

interface SyncState extends SyncStatus {
  conflictCount: number
  isDashboardOpen: boolean
  updateSyncStatus: (status: SyncStatus) => void
  setConflictCount: (count: number) => void
  setDashboardOpen: (open: boolean) => void
}

export const useSyncStore = create<SyncState>()((set) => ({
  isPending: false,
  isError: false,
  lastSyncedAt: null,
  pendingCount: 0,
  failedCount: 0,
  conflictCount: 0,
  isDashboardOpen: false,

  updateSyncStatus: (status) => {
    set(status)
  },

  setConflictCount: (count) => {
    set({ conflictCount: count })
  },

  setDashboardOpen: (open) => {
    set({ isDashboardOpen: open })
  },
}))
```

- [ ] **Step 2: Typecheck lab-lite**

```bash
pnpm -F lab-lite typecheck 2>&1 | grep error | head -10
```

Expected: no new errors from this change.

- [ ] **Step 3: Commit**

```bash
git add apps/lab-lite/src/stores/sync-store.ts
git commit -m "feat(lab-lite): upgrade SyncStore with conflictCount and isDashboardOpen"
```

---

## Task 7: Upgrade pharmacy-lite sync-store

**Files:**
- Modify: `apps/pharmacy-lite/src/stores/sync-store.ts`

- [ ] **Step 1: Replace with upgraded store**

```typescript
import { create } from 'zustand'

export interface SyncStatus {
  isPending: boolean
  isError: boolean
  lastSyncedAt: string | null
  pendingCount: number
  failedCount: number
}

interface SyncState extends SyncStatus {
  conflictCount: number
  isDashboardOpen: boolean
  updateSyncStatus: (status: Partial<SyncStatus>) => void
  markSynced: () => void
  setConflictCount: (count: number) => void
  setDashboardOpen: (open: boolean) => void
}

export const useSyncStore = create<SyncState>()((set) => ({
  isPending: false,
  isError: false,
  lastSyncedAt: null,
  pendingCount: 0,
  failedCount: 0,
  conflictCount: 0,
  isDashboardOpen: false,

  updateSyncStatus: (status) => {
    set(status)
  },

  markSynced: () => {
    set({ lastSyncedAt: new Date().toISOString() })
  },

  setConflictCount: (count) => {
    set({ conflictCount: count })
  },

  setDashboardOpen: (open) => {
    set({ isDashboardOpen: open })
  },
}))
```

- [ ] **Step 2: Typecheck pharmacy-lite**

```bash
pnpm -F pharmacy-lite typecheck 2>&1 | grep error | head -10
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/pharmacy-lite/src/stores/sync-store.ts
git commit -m "feat(pharmacy-lite): upgrade SyncStore with conflictCount and isDashboardOpen"
```

---

## Task 8: Create lab-lite SyncPulse (replaces OnlineStatusIndicator)

**Files:**
- Create: `apps/lab-lite/src/components/SyncPulse.tsx`

The lab-lite upload queue is `db.uploadQueue` (not `db.syncQueue`). Upload entries have `status: 'pending' | 'uploading' | 'failed' | 'completed'`. Clicking opens `/upload` route (no overlay in lab-lite).

- [ ] **Step 1: Create the component**

```typescript
// apps/lab-lite/src/components/SyncPulse.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSyncStore } from '@/stores/sync-store'
import { db } from '@/lib/db'

function formatSyncTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/**
 * Global Sync Pulse indicator for Lab Lite.
 *
 * Polls db.uploadQueue every 10s for pending/failed counts.
 * Shows pulsing dot: green (all clear), amber (pending), red (failed).
 * Clicking navigates to /upload to view queue detail.
 */
export function SyncPulse() {
  const router = useRouter()
  const { pendingCount, failedCount, lastSyncedAt, updateSyncStatus } = useSyncStore()
  const [, setTick] = useState(0)

  // Tick every 30s so timestamp ages correctly
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(interval)
  }, [])

  // Refresh counts from Dexie on mount and every 10s
  useEffect(() => {
    const refresh = async () => {
      const pending = await db.uploadQueue.where('status').anyOf(['pending', 'uploading']).count()
      const failed = await db.uploadQueue.where('status').equals('failed').count()
      updateSyncStatus({
        isPending: pending > 0,
        isError: failed > 0,
        lastSyncedAt: useSyncStore.getState().lastSyncedAt,
        pendingCount: pending,
        failedCount: failed,
      })
    }
    void refresh()
    const interval = setInterval(() => void refresh(), 10_000)
    return () => clearInterval(interval)
  }, [updateSyncStatus])

  const hasErrors = failedCount > 0
  const hasPending = pendingCount > 0
  const totalBadge = pendingCount + failedCount

  let pulseColor: string
  let ariaStatus: string
  if (hasErrors) {
    pulseColor = 'bg-destructive'
    ariaStatus = `${failedCount} upload${failedCount !== 1 ? 's' : ''} failed`
  } else if (hasPending) {
    pulseColor = 'bg-warning'
    ariaStatus = `${pendingCount} upload${pendingCount !== 1 ? 's' : ''} pending`
  } else {
    pulseColor = 'bg-success'
    ariaStatus = 'All uploads synced'
  }

  return (
    <button
      type="button"
      className="relative flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent transition-colors"
      onClick={() => router.push('/upload')}
      aria-label={`Sync status: ${ariaStatus}`}
      data-testid="sync-pulse"
    >
      <span className="relative flex h-4 w-4 shrink-0">
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${pulseColor}`}
        />
        <span
          className={`relative inline-flex h-4 w-4 rounded-full ${pulseColor}`}
          data-testid="sync-pulse-dot"
        />
        {totalBadge > 0 && (
          <span
            className="absolute -end-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-0.5 text-[10px] font-bold text-foreground"
            data-testid="sync-pulse-badge"
          >
            {totalBadge > 99 ? '99+' : totalBadge}
          </span>
        )}
      </span>
      <span className="text-xs text-muted-foreground">
        {lastSyncedAt ? formatSyncTime(lastSyncedAt) : 'never synced'}
      </span>
    </button>
  )
}
```

**Note:** `bg-warning` and `bg-success` must be defined in the ui-kit tailwind tokens. If they're not, check `packages/ui-kit/src/tokens.css` and use `bg-yellow-500` / `bg-green-500` as fallbacks. Verify by checking if `bg-warning` appears in the OPD-lite SyncPulse component currently in use.

- [ ] **Step 2: Typecheck**

```bash
pnpm -F lab-lite typecheck 2>&1 | grep -E "error|SyncPulse"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/lab-lite/src/components/SyncPulse.tsx
git commit -m "feat(lab-lite): add SyncPulse component (replaces OnlineStatusIndicator)"
```

---

## Task 9: Wire createMeterFetch into opd-lite sync worker

**Files:**
- Modify: `apps/opd-lite/src/lib/sync-worker.ts`

The raw `fetch` on line 38 needs to be replaced with a metered version.

- [ ] **Step 1: Create a metered fetch factory helper in sync-worker.ts**

At the top of `apps/opd-lite/src/lib/sync-worker.ts`, add the import:

```typescript
import { createMeterFetch } from '@ultranos/sync-engine'
import { recordDataUsage } from './db'
```

Then create a module-level metered fetch instance:

```typescript
// Metered fetch — records network usage to Dexie DataBudget tables.
// Created once at module init; errors are swallowed inside createMeterFetch.
const meteredFetch = createMeterFetch(fetch, (entry) =>
  recordDataUsage({
    date: entry.date,
    category: entry.category,
    bytesOut: entry.bytesOut,
    bytesIn: entry.bytesIn,
    requestCount: entry.requestCount,
  }).catch(() => {
    // Swallow — metering must never block sync
  }),
)
```

Then replace the `fetch(` call inside `syncFn` (around line 38) with `meteredFetch(`:

```typescript
      const res = await meteredFetch(`${config.hubBaseUrl}/api/trpc/sync.push`, {
```

- [ ] **Step 2: Typecheck**

```bash
pnpm -F opd-lite typecheck 2>&1 | grep error | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/opd-lite/src/lib/sync-worker.ts
git commit -m "feat(opd-lite): wire createMeterFetch into sync worker"
```

---

## Task 10: Wire createMeterFetch into pharmacy-lite drain-sync-fn

**Files:**
- Modify: `apps/pharmacy-lite/src/lib/drain-sync-fn.ts`

The raw `fetch` on line 31 needs to be metered.

- [ ] **Step 1: Add metered fetch**

At the top of `apps/pharmacy-lite/src/lib/drain-sync-fn.ts`, add:

```typescript
import { createMeterFetch } from '@ultranos/sync-engine'
import { recordDataUsage } from '@/lib/db'
```

After the imports, add a module-level metered fetch:

```typescript
const meteredFetch = createMeterFetch(fetch, (entry) =>
  recordDataUsage({
    date: entry.date,
    category: entry.category,
    bytesOut: entry.bytesOut,
    bytesIn: entry.bytesIn,
    requestCount: entry.requestCount,
  }).catch(() => {}),
)
```

Replace `const res = await fetch(url.toString(), {` (line 31) with:

```typescript
  const res = await meteredFetch(url.toString(), {
```

- [ ] **Step 2: Typecheck**

```bash
pnpm -F pharmacy-lite typecheck 2>&1 | grep error | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/pharmacy-lite/src/lib/drain-sync-fn.ts
git commit -m "feat(pharmacy-lite): wire createMeterFetch into drain sync function"
```

---

## Task 11: DataBudgetIndicator + DataBudgetDashboard for opd-lite

**Files:**
- Create: `apps/opd-lite/src/components/DataBudgetIndicator.tsx`
- Create: `apps/opd-lite/src/components/settings/DataBudgetDashboard.tsx`
- Create: `apps/opd-lite/src/app/[locale]/settings/data-budget/page.tsx`

- [ ] **Step 1: Create `apps/opd-lite/src/components/DataBudgetIndicator.tsx`**

```typescript
'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useDataBudgetStore } from '@/stores/data-budget-store'

export function DataBudgetIndicator() {
  const t = useTranslations('dataBudget')
  const { planSizeMB, currentCycleUsedMB, thresholdLevel, isLoaded, loadFromDexie } = useDataBudgetStore()

  useEffect(() => {
    if (!isLoaded) void loadFromDexie()
  }, [isLoaded, loadFromDexie])

  if (!isLoaded) return null

  const usedPct = planSizeMB > 0 ? Math.min((currentCycleUsedMB / planSizeMB) * 100, 100) : 0

  const barColor =
    thresholdLevel === 'critical'
      ? 'bg-red-500'
      : thresholdLevel === 'warning'
        ? 'bg-yellow-500'
        : 'bg-green-500'

  const textColor =
    thresholdLevel === 'critical'
      ? 'text-red-400'
      : thresholdLevel === 'warning'
        ? 'text-yellow-400'
        : 'text-muted-foreground'

  return (
    <Link href="/settings/data-budget" className="block" title={t('viewDashboard')}>
      <div className="flex items-center gap-2">
        <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${usedPct}%` }} />
        </div>
        <span className={`text-[10px] font-mono ${textColor} whitespace-nowrap`}>
          {t('sidebarUsed', { used: currentCycleUsedMB.toFixed(0) })}
        </span>
      </div>
    </Link>
  )
}
```

- [ ] **Step 2: Create `apps/opd-lite/src/components/settings/DataBudgetDashboard.tsx`**

```typescript
'use client'

import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { useDataBudgetStore } from '@/stores/data-budget-store'

export function DataBudgetDashboard() {
  const t = useTranslations('dataBudget')
  const {
    planSizeMB,
    currentCycleUsedMB,
    projectedExhaustionDate,
    dailyUsage,
    categoryBreakdown,
    thresholdLevel,
    isLoaded,
    loadFromDexie,
    refreshUsageStats,
  } = useDataBudgetStore()

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!isLoaded) void loadFromDexie()
    intervalRef.current = setInterval(() => void refreshUsageStats(), 60_000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [isLoaded, loadFromDexie, refreshUsageStats])

  const usedPct = planSizeMB > 0 ? Math.min((currentCycleUsedMB / planSizeMB) * 100, 100) : 0
  const remainingMB = Math.max(planSizeMB - currentCycleUsedMB, 0)

  const barColor =
    thresholdLevel === 'critical' ? 'bg-red-500'
    : thresholdLevel === 'warning' ? 'bg-yellow-500'
    : 'bg-green-500'

  const maxDailyMB = Math.max(...dailyUsage.map((d) => d.totalMB), 0.01)

  return (
    <div className="flex flex-col gap-4">
      {thresholdLevel === 'warning' && (
        <div role="alert" className="rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800" data-testid="data-budget-warning">
          {t('warningBanner')}
        </div>
      )}
      {thresholdLevel === 'critical' && (
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" data-testid="data-budget-critical">
          {t('criticalBanner')}
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-muted-foreground mb-3">{t('usageTitle')}</h2>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="h-4 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${barColor}`}
                style={{ width: `${usedPct}%` }}
                role="progressbar"
                aria-valuenow={Math.round(usedPct)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={t('usageAriaLabel', { used: currentCycleUsedMB.toFixed(0), total: planSizeMB })}
              />
            </div>
          </div>
          <div className="text-right text-sm">
            <div className="font-semibold text-foreground">{currentCycleUsedMB.toFixed(1)} MB <span className="text-muted-foreground font-normal">{t('used')}</span></div>
            <div className="text-muted-foreground">{remainingMB.toFixed(1)} MB {t('remaining')}</div>
          </div>
        </div>
        {projectedExhaustionDate && (
          <p className="mt-2 text-xs text-muted-foreground">{t('projectionExhaustion', { date: projectedExhaustionDate })}</p>
        )}
        {!projectedExhaustionDate && (
          <p className="mt-2 text-xs text-muted-foreground">{t('projectionNoData')}</p>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-muted-foreground mb-3">{t('dailyUsageTitle')}</h2>
        <div className="flex items-end gap-0.5 h-16">
          {dailyUsage.map((d) => (
            <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5">
              <div
                className={`w-full rounded-sm ${barColor} opacity-80`}
                style={{ height: `${Math.max((d.totalMB / maxDailyMB) * 48, d.totalMB > 0 ? 2 : 0)}px` }}
                title={`${d.date}: ${d.totalMB.toFixed(2)} MB`}
              />
            </div>
          ))}
        </div>
      </div>

      {Object.keys(categoryBreakdown).length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">{t('categoryTitle')}</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="pb-2 text-start font-medium text-muted-foreground">{t('categoryHeader')}</th>
                <th className="pb-2 text-end font-medium text-muted-foreground">MB</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(categoryBreakdown).map(([cat, mb]) => (
                <tr key={cat} className="border-b border-border last:border-0">
                  <td className="py-1.5 text-foreground">{t(`category.${cat}`)}</td>
                  <td className="py-1.5 text-end text-muted-foreground font-mono">{mb.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create `apps/opd-lite/src/app/[locale]/settings/data-budget/page.tsx`**

```typescript
'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { DirectionalIcon } from '@ultranos/ui-kit'
import { ChevronLeft } from '@ultranos/ui-kit/icons'
import { DataBudgetDashboard } from '@/components/settings/DataBudgetDashboard'

export default function DataBudgetPage() {
  const t = useTranslations('dataBudget')

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/settings" className="text-muted-foreground hover:text-foreground" aria-label="Back">
          <DirectionalIcon category="navigation">
            <ChevronLeft size={20} />
          </DirectionalIcon>
        </Link>
        <h1 className="text-2xl font-bold text-foreground">{t('usageTitle')}</h1>
      </div>
      <DataBudgetDashboard />
    </div>
  )
}
```

- [ ] **Step 4: Typecheck opd-lite**

```bash
pnpm -F opd-lite typecheck 2>&1 | grep error | head -10
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/opd-lite/src/components/DataBudgetIndicator.tsx apps/opd-lite/src/components/settings/DataBudgetDashboard.tsx "apps/opd-lite/src/app/[locale]/settings/data-budget/page.tsx"
git commit -m "feat(opd-lite): add DataBudgetIndicator, DataBudgetDashboard, and settings page"
```

---

## Task 12: DataBudgetIndicator + DataBudgetDashboard for pharmacy-lite

**Files:**
- Create: `apps/pharmacy-lite/src/components/DataBudgetIndicator.tsx`
- Create: `apps/pharmacy-lite/src/components/settings/DataBudgetDashboard.tsx`
- Create: `apps/pharmacy-lite/src/app/[locale]/settings/data-budget/page.tsx`

- [ ] **Step 1: Create `apps/pharmacy-lite/src/components/DataBudgetIndicator.tsx`**

Identical structure to opd-lite — copy verbatim:

```typescript
'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useDataBudgetStore } from '@/stores/data-budget-store'

export function DataBudgetIndicator() {
  const t = useTranslations('dataBudget')
  const { planSizeMB, currentCycleUsedMB, thresholdLevel, isLoaded, loadFromDexie } = useDataBudgetStore()

  useEffect(() => {
    if (!isLoaded) void loadFromDexie()
  }, [isLoaded, loadFromDexie])

  if (!isLoaded) return null

  const usedPct = planSizeMB > 0 ? Math.min((currentCycleUsedMB / planSizeMB) * 100, 100) : 0

  const barColor =
    thresholdLevel === 'critical' ? 'bg-red-500'
    : thresholdLevel === 'warning' ? 'bg-yellow-500'
    : 'bg-green-500'

  const textColor =
    thresholdLevel === 'critical' ? 'text-red-400'
    : thresholdLevel === 'warning' ? 'text-yellow-400'
    : 'text-muted-foreground'

  return (
    <Link href="/settings/data-budget" className="block" title={t('viewDashboard')}>
      <div className="flex items-center gap-2">
        <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${usedPct}%` }} />
        </div>
        <span className={`text-[10px] font-mono ${textColor} whitespace-nowrap`}>
          {t('sidebarUsed', { used: currentCycleUsedMB.toFixed(0) })}
        </span>
      </div>
    </Link>
  )
}
```

- [ ] **Step 2: Create `apps/pharmacy-lite/src/components/settings/DataBudgetDashboard.tsx`**

Copy the same `DataBudgetDashboard` implementation from Task 11 Step 2 verbatim — only the import path differs (`@/stores/data-budget-store` is correct for both).

- [ ] **Step 3: Create `apps/pharmacy-lite/src/app/[locale]/settings/data-budget/page.tsx`**

Copy the same page from Task 11 Step 3 verbatim.

- [ ] **Step 4: Typecheck pharmacy-lite**

```bash
pnpm -F pharmacy-lite typecheck 2>&1 | grep error | head -10
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/pharmacy-lite/src/components/DataBudgetIndicator.tsx apps/pharmacy-lite/src/components/settings/DataBudgetDashboard.tsx "apps/pharmacy-lite/src/app/[locale]/settings/data-budget/page.tsx"
git commit -m "feat(pharmacy-lite): add DataBudgetIndicator, DataBudgetDashboard, and settings page"
```

---

## Task 13: Add i18n dataBudget strings to opd-lite (all 4 locales)

**Files:**
- Modify: `apps/opd-lite/messages/en.json`
- Modify: `apps/opd-lite/messages/ar.json`
- Modify: `apps/opd-lite/messages/prs.json`
- Modify: `apps/opd-lite/messages/ps.json`

- [ ] **Step 1: Add to `apps/opd-lite/messages/en.json`**

Append before the closing `}`:

```json
  "dataBudget": {
    "usageTitle": "Data Usage",
    "usageAriaLabel": "{used} of {total} MB used",
    "used": "used",
    "remaining": "remaining",
    "projectionTitle": "Projection",
    "projectionExhaustion": "At current rate, data runs out on {date}.",
    "projectionNoData": "Not enough data to project exhaustion.",
    "dailyUsageTitle": "Daily Usage (14 days)",
    "categoryTitle": "Usage by Category",
    "categoryHeader": "Category",
    "category": {
      "upload": "Uploads",
      "audit": "Audit Sync",
      "notification": "Notifications",
      "other": "Other"
    },
    "warningBanner": "Data usage is high. Consider enabling Low Data Mode.",
    "criticalBanner": "Data critically low. Enable Low Data Mode to preserve connectivity.",
    "settingsTitle": "Data & Connectivity",
    "planSize": "Data Plan Size (MB)",
    "billingCycleDay": "Billing Cycle Start Day",
    "lowDataMode": "Low Data Mode",
    "lowDataModeDesc": "Batches syncs and reduces polling to conserve data.",
    "viewDashboard": "View Data Dashboard",
    "sidebarLabel": "Data",
    "sidebarUsed": "{used} MB"
  }
```

- [ ] **Step 2: Add to `apps/opd-lite/messages/ar.json`**

Append before the closing `}`:

```json
  "dataBudget": {
    "usageTitle": "استخدام البيانات",
    "usageAriaLabel": "تم استخدام {used} من {total} ميغابايت",
    "used": "مستخدم",
    "remaining": "متبقي",
    "projectionTitle": "التوقعات",
    "projectionExhaustion": "بالمعدل الحالي، ستنفد البيانات في {date}.",
    "projectionNoData": "لا توجد بيانات كافية للتوقع.",
    "dailyUsageTitle": "الاستخدام اليومي (14 يوماً)",
    "categoryTitle": "الاستخدام حسب الفئة",
    "categoryHeader": "الفئة",
    "category": {
      "upload": "التحميلات",
      "audit": "مزامنة التدقيق",
      "notification": "الإشعارات",
      "other": "أخرى"
    },
    "warningBanner": "استخدام البيانات مرتفع. فكّر في تفعيل وضع البيانات المنخفضة.",
    "criticalBanner": "البيانات منخفضة جداً. فعّل وضع البيانات المنخفضة للحفاظ على الاتصال.",
    "settingsTitle": "البيانات والاتصال",
    "planSize": "حجم خطة البيانات (ميغابايت)",
    "billingCycleDay": "يوم بدء دورة الفوترة",
    "lowDataMode": "وضع البيانات المنخفضة",
    "lowDataModeDesc": "يجمع المزامنات ويقلل الاستطلاع للحفاظ على البيانات.",
    "viewDashboard": "عرض لوحة البيانات",
    "sidebarLabel": "البيانات",
    "sidebarUsed": "{used} ميغابايت"
  }
```

- [ ] **Step 3: Add to `apps/opd-lite/messages/prs.json`**

Append before the closing `}`:

```json
  "dataBudget": {
    "usageTitle": "مصرف داده",
    "usageAriaLabel": "{used} از {total} مگابایت استفاده شده",
    "used": "استفاده شده",
    "remaining": "باقی‌مانده",
    "projectionTitle": "پیش‌بینی",
    "projectionExhaustion": "با نرخ فعلی، داده‌ها در {date} تمام می‌شوند.",
    "projectionNoData": "داده‌های کافی برای پیش‌بینی وجود ندارد.",
    "dailyUsageTitle": "مصرف روزانه (۱۴ روز)",
    "categoryTitle": "مصرف بر اساس دسته",
    "categoryHeader": "دسته",
    "category": {
      "upload": "بارگذاری‌ها",
      "audit": "همگام‌سازی حسابرسی",
      "notification": "اعلان‌ها",
      "other": "سایر"
    },
    "warningBanner": "مصرف داده بالاست. استفاده از حالت داده کم را در نظر بگیرید.",
    "criticalBanner": "داده‌ها بحرانی کم است. حالت داده کم را فعال کنید.",
    "settingsTitle": "داده و اتصال",
    "planSize": "اندازه برنامه داده (مگابایت)",
    "billingCycleDay": "روز شروع دوره صورت‌حساب",
    "lowDataMode": "حالت داده کم",
    "lowDataModeDesc": "همگام‌سازی‌ها را دسته‌بندی می‌کند و نظرسنجی را کاهش می‌دهد.",
    "viewDashboard": "مشاهده داشبورد داده",
    "sidebarLabel": "داده",
    "sidebarUsed": "{used} مگابایت"
  }
```

- [ ] **Step 4: Add to `apps/opd-lite/messages/ps.json`**

Append before the closing `}`:

```json
  "dataBudget": {
    "usageTitle": "د ډاټا کارونه",
    "usageAriaLabel": "{used} له {total} MB کارول شوي",
    "used": "کارول شوی",
    "remaining": "پاتې",
    "projectionTitle": "وړاندوینه",
    "projectionExhaustion": "د اوسني کچې سره، ډاټا به د {date} نیټې پورې ختمیږي.",
    "projectionNoData": "د وړاندوینې لپاره کافي ډاټا نشته.",
    "dailyUsageTitle": "ورځنۍ کارونه (۱۴ ورځې)",
    "categoryTitle": "د کټګورۍ له مخې کارونه",
    "categoryHeader": "کټګوري",
    "category": {
      "upload": "آپلوډونه",
      "audit": "د آډیټ همغږي",
      "notification": "خبرتیاوې",
      "other": "نور"
    },
    "warningBanner": "د ډاټا کارونه لوړه ده. د کم ډاټا حالت فعالول وګورئ.",
    "criticalBanner": "ډاټا خورا کمه ده. د اتصال ساتلو لپاره د کم ډاټا حالت فعال کړئ.",
    "settingsTitle": "ډاټا او اتصال",
    "planSize": "د ډاټا پلان اندازه (MB)",
    "billingCycleDay": "د بلینګ سایکل د پیل ورځ",
    "lowDataMode": "د کم ډاټا حالت",
    "lowDataModeDesc": "همغږي یو ځای کوي او د ډاټا ساتلو لپاره پولینګ کموي.",
    "viewDashboard": "د ډاټا ډشبورډ وګورئ",
    "sidebarLabel": "ډاټا",
    "sidebarUsed": "{used} MB"
  }
```

- [ ] **Step 5: Verify JSON validity**

```bash
node -e "require('./apps/opd-lite/messages/en.json'); require('./apps/opd-lite/messages/ar.json'); require('./apps/opd-lite/messages/prs.json'); require('./apps/opd-lite/messages/ps.json'); console.log('All valid')"
```

Expected: `All valid`

- [ ] **Step 6: Commit**

```bash
git add apps/opd-lite/messages/en.json apps/opd-lite/messages/ar.json apps/opd-lite/messages/prs.json apps/opd-lite/messages/ps.json
git commit -m "feat(opd-lite): add dataBudget i18n strings for all 4 locales"
```

---

## Task 14: Add i18n dataBudget strings to pharmacy-lite (all 4 locales)

**Files:**
- Modify: `apps/pharmacy-lite/messages/en.json`
- Modify: `apps/pharmacy-lite/messages/ar.json`
- Modify: `apps/pharmacy-lite/messages/prs.json`
- Modify: `apps/pharmacy-lite/messages/ps.json`

- [ ] **Step 1: Add English strings to pharmacy-lite**

Append to `apps/pharmacy-lite/messages/en.json` before the closing `}`:

```json
  "dataBudget": {
    "usageTitle": "Data Usage",
    "usageAriaLabel": "{used} of {total} MB used",
    "used": "used",
    "remaining": "remaining",
    "projectionTitle": "Projection",
    "projectionExhaustion": "At current rate, data runs out on {date}.",
    "projectionNoData": "Not enough data to project exhaustion.",
    "dailyUsageTitle": "Daily Usage (14 days)",
    "categoryTitle": "Usage by Category",
    "categoryHeader": "Category",
    "category": {
      "upload": "Uploads",
      "audit": "Audit Sync",
      "notification": "Notifications",
      "other": "Other"
    },
    "warningBanner": "Data usage is high. Consider enabling Low Data Mode.",
    "criticalBanner": "Data critically low. Enable Low Data Mode to preserve connectivity.",
    "settingsTitle": "Data & Connectivity",
    "planSize": "Data Plan Size (MB)",
    "billingCycleDay": "Billing Cycle Start Day",
    "lowDataMode": "Low Data Mode",
    "lowDataModeDesc": "Batches syncs and reduces polling to conserve data.",
    "viewDashboard": "View Data Dashboard",
    "sidebarLabel": "Data",
    "sidebarUsed": "{used} MB"
  }
```

- [ ] **Step 2: Add Arabic, Dari, Pashto strings to pharmacy-lite**

Add the same Arabic block from Task 13 Step 2 to `apps/pharmacy-lite/messages/ar.json`.
Add the same Dari block from Task 13 Step 3 to `apps/pharmacy-lite/messages/prs.json`.
Add the same Pashto block from Task 13 Step 4 to `apps/pharmacy-lite/messages/ps.json`.

- [ ] **Step 3: Verify JSON validity**

```bash
node -e "require('./apps/pharmacy-lite/messages/en.json'); require('./apps/pharmacy-lite/messages/ar.json'); require('./apps/pharmacy-lite/messages/prs.json'); require('./apps/pharmacy-lite/messages/ps.json'); console.log('All valid')"
```

Expected: `All valid`

- [ ] **Step 4: Commit**

```bash
git add apps/pharmacy-lite/messages/en.json apps/pharmacy-lite/messages/ar.json apps/pharmacy-lite/messages/prs.json apps/pharmacy-lite/messages/ps.json
git commit -m "feat(pharmacy-lite): add dataBudget i18n strings for all 4 locales"
```

---

## Task 15: Wire SyncPulse + DataBudgetIndicator into page headers

**Files:**
- Modify: `apps/lab-lite/src/components/PageHeader.tsx`
- Modify: `apps/opd-lite/src/components/BreadcrumbHeader.tsx`
- Modify: `apps/pharmacy-lite/src/components/BreadcrumbHeader.tsx`

### lab-lite — Replace OnlineStatusIndicator with SyncPulse, add DataBudgetIndicator

- [ ] **Step 1: Update `apps/lab-lite/src/components/PageHeader.tsx`**

Replace:
```typescript
import { OnlineStatusIndicator } from '@/components/OnlineStatusIndicator'
import { LanguageSelectorClient } from '@/components/LanguageSelectorClient'
```
With:
```typescript
import { SyncPulse } from '@/components/SyncPulse'
import { DataBudgetIndicator } from '@/components/DataBudgetIndicator'
import { LanguageSelectorClient } from '@/components/LanguageSelectorClient'
```

Replace:
```tsx
      <div className="ms-auto flex items-center gap-2">
        <OnlineStatusIndicator />
        <LanguageSelectorClient />
      </div>
```
With:
```tsx
      <div className="ms-auto flex items-center gap-2">
        <DataBudgetIndicator />
        <SyncPulse />
        <LanguageSelectorClient />
      </div>
```

### opd-lite — Add DataBudgetIndicator to BreadcrumbHeader

- [ ] **Step 2: Update `apps/opd-lite/src/components/BreadcrumbHeader.tsx`**

Add import after existing imports:
```typescript
import { DataBudgetIndicator } from '@/components/DataBudgetIndicator'
```

Update the right-side div:
```tsx
      <div className="ms-auto flex items-center gap-2">
        <DataBudgetIndicator />
        <SyncPulse />
        <LanguageSelectorClient />
      </div>
```

**Note:** `SyncPulse` is already imported and present from the previous session's work. Verify it's there before adding — if not present, add:
```typescript
import { SyncPulse } from '@/components/SyncPulse'
```

### pharmacy-lite — Add DataBudgetIndicator to BreadcrumbHeader

- [ ] **Step 3: Update `apps/pharmacy-lite/src/components/BreadcrumbHeader.tsx`**

Add import:
```typescript
import { DataBudgetIndicator } from '@/components/DataBudgetIndicator'
```

Update the right-side div:
```tsx
      <div className="ms-auto flex items-center gap-2">
        <DataBudgetIndicator />
        <SyncPulse />
        <LanguageSelectorClient />
      </div>
```

**Note:** `SyncPulse` is already imported from previous session work. Verify first.

- [ ] **Step 4: Typecheck all three apps**

```bash
pnpm -F lab-lite typecheck 2>&1 | grep error | head -5
pnpm -F opd-lite typecheck 2>&1 | grep error | head -5
pnpm -F pharmacy-lite typecheck 2>&1 | grep error | head -5
```

Expected: no errors in any app.

- [ ] **Step 5: Commit**

```bash
git add apps/lab-lite/src/components/PageHeader.tsx apps/opd-lite/src/components/BreadcrumbHeader.tsx apps/pharmacy-lite/src/components/BreadcrumbHeader.tsx
git commit -m "feat: wire SyncPulse and DataBudgetIndicator into all three app page headers"
```

---

## Task 16: Final typecheck and test run

- [ ] **Step 1: Full monorepo typecheck**

```bash
pnpm typecheck 2>&1 | grep error | head -20
```

Expected: no errors.

- [ ] **Step 2: Run all data-budget tests**

```bash
pnpm -F @ultranos/sync-engine test
pnpm -F opd-lite vitest run src/__tests__/data-budget.test.ts
pnpm -F pharmacy-lite vitest run src/__tests__/data-budget.test.ts
```

Expected: all tests PASS.

- [ ] **Step 3: Run lab-lite full test suite to confirm no regressions**

```bash
pnpm -F lab-lite test 2>&1 | tail -20
```

Expected: no regressions (same pass/fail as before this plan).

- [ ] **Step 4: Commit any fixes found**

If typecheck or tests reveal any issues, fix them and commit before proceeding.

---

## Self-Review

**Spec coverage check:**
- ✅ `data-meter.ts` and `data-budget-calc.ts` extracted to `packages/sync-engine` (Task 1)
- ✅ lab-lite updated to import from `@ultranos/sync-engine` (Task 1)
- ✅ opd-lite Dexie v21 with `dataBudgetConfig` + `dataUsage` + helpers (Task 2)
- ✅ pharmacy-lite Dexie v11 with same tables + helpers (Task 3)
- ✅ opd-lite DataBudgetStore (Task 4)
- ✅ pharmacy-lite DataBudgetStore (Task 5)
- ✅ lab-lite sync-store upgraded with `conflictCount`, `isDashboardOpen` (Task 6)
- ✅ pharmacy-lite sync-store upgraded (Task 7)
- ✅ lab-lite SyncPulse created (Task 8)
- ✅ opd-lite sync worker metered (Task 9)
- ✅ pharmacy-lite drain sync function metered (Task 10)
- ✅ opd-lite DataBudgetIndicator + Dashboard + settings page (Task 11)
- ✅ pharmacy-lite DataBudgetIndicator + Dashboard + settings page (Task 12)
- ✅ opd-lite i18n for all 4 locales (Task 13)
- ✅ pharmacy-lite i18n for all 4 locales (Task 14)
- ✅ All three app headers wired (Task 15)
- ✅ Final typecheck + tests (Task 16)

**Placeholder scan:** None found.

**Type consistency check:**
- `DataUsageCategory` defined once in `packages/sync-engine/src/data-meter.ts`, re-exported from sync-engine index, re-exported from lab-lite `db.ts` for backward compat, declared locally in opd-lite and pharmacy-lite `db.ts`
- `DataBudgetConfig`, `DataUsageRecord` declared in each app's `db.ts` (deliberate — app-local Dexie)
- `ThresholdLevel` from `@ultranos/sync-engine` used consistently in all three stores
- Helper function signatures identical across opd-lite and pharmacy-lite: `getDataBudgetConfig()`, `updateDataBudgetConfig(updates)`, `recordDataUsage(record)`, `getUsageByDay(start, end)`, `getUsageForCycle()`, `checkAndRolloverCycle()`
- `DataBudgetState` interface identical in both new stores
