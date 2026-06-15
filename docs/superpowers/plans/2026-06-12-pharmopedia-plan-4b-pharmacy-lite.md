# Pharmopedia Plan 4b — Pharmacy-Lite Drug Catalog Integration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Pharmacy-Lite to the Hub drug catalog: surface drug catalog search in the catalog browse page with Pharmopedia deep links, and write the pharmacist's retail price to the network-wide `pharmacy_prices` table when a goods receipt is confirmed.

**Architecture:** Three additive changes. (1) Two new functions in `trpc.ts` call `drugCatalog.search` and `drugCatalog.setPrice`. (2) `CatalogBrowsePage` shows Hub search results when local search returns nothing, each row linking out to Pharmopedia. (3) `ReceiveStockForm` fires `setDrugPrice` (best-effort, non-blocking) after a successful goods receipt for each item whose catalog entry carries an `atcCode`. `atcCode` is added as an optional field to `CatalogItem`.

**Tech Stack:** Vitest, @testing-library/react (jsdom), Next.js 15, `useAuthSessionStore` (Supabase session access).

**Spec:** `docs/superpowers/specs/2026-06-12-pharmopedia-design.md` §8 (Pharmacy-Lite changes)
**Requires:** Hub `drugCatalog` router deployed (`_app.ts` already includes it).

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `apps/pharmacy-lite/src/lib/trpc.ts` | Modify | Add `searchDrugCatalog()` and `setDrugPrice()` |
| `apps/pharmacy-lite/src/lib/inventory/types.ts` | Modify | Add `atcCode?: string` to `CatalogItem` |
| `apps/pharmacy-lite/src/components/pharmacy/inventory/CatalogBrowsePage.tsx` | Modify | Hub search fallback section + Pharmopedia deep links |
| `apps/pharmacy-lite/src/components/pharmacy/inventory/ReceiveStockForm.tsx` | Modify | Call `setDrugPrice` best-effort after receipt |
| `apps/pharmacy-lite/src/__tests__/drug-catalog-trpc.test.ts` | Create | Unit tests for two new trpc functions |
| `apps/pharmacy-lite/src/__tests__/catalog-browse-hub-search.test.tsx` | Create | Component tests for Hub search section |
| `apps/pharmacy-lite/src/__tests__/receive-stock-price-write.test.tsx` | Create | Component tests for price write on receipt |

---

## Task 4: Hub API functions — `searchDrugCatalog` and `setDrugPrice`

**Context:** `apps/pharmacy-lite/src/lib/trpc.ts` currently only exports `getHubApiUrl()` and `reportAuthEvent()`. Auth comes from `useAuthSessionStore.getState().getAccessToken()`. The Hub tRPC endpoint for `setPrice` is `drugCatalog.setPrice` (POST mutation). `sellingPrice` in `ReceiveLineItem` is stored as minor currency units (e.g., 350 = 3.50 AFN for `currencyMinorUnits=2`). `setDrugPrice` receives it already converted to AFN (caller divides before calling).

`DrugSearchResult` from `@ultranos/shared-types`:
```typescript
interface DrugSearchResult {
  atcCode: string
  innName: string
  brandNames: string[]
  therapeuticClass: string
  doseForms: string[]
  localName?: string
}
```

**Files:**
- Modify: `apps/pharmacy-lite/src/lib/trpc.ts`
- Create: `apps/pharmacy-lite/src/__tests__/drug-catalog-trpc.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/pharmacy-lite/src/__tests__/drug-catalog-trpc.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetAccessToken = vi.fn().mockResolvedValue('pharm-token')

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: {
    getState: () => ({ getAccessToken: mockGetAccessToken }),
  },
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const { searchDrugCatalog, setDrugPrice } = await import('@/lib/trpc')

function mockOkJson(json: unknown) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => json,
  })
}

describe('searchDrugCatalog', () => {
  beforeEach(() => { mockFetch.mockReset() })

  it('GETs drugCatalog.search with q, lang, limit in input param', async () => {
    mockOkJson({ result: { data: { json: [] } } })
    await searchDrugCatalog('metro')
    const [calledUrl, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(calledUrl).toContain('drugCatalog.search')
    expect(opts.method).toBe('GET')
    const inputParam = JSON.parse(new URL(calledUrl).searchParams.get('input')!)
    expect(inputParam.json.q).toBe('metro')
    expect(inputParam.json.lang).toBe('en')
  })

  it('passes Authorization header', async () => {
    mockOkJson({ result: { data: { json: [] } } })
    await searchDrugCatalog('amox')
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect((opts.headers as Record<string, string>)['Authorization']).toBe('Bearer pharm-token')
  })

  it('returns DrugSearchResult array', async () => {
    mockOkJson({
      result: {
        data: {
          json: [
            { atcCode: 'A02BC01', innName: 'Omeprazole', brandNames: [], therapeuticClass: 'PPIs', doseForms: ['Capsule'], localName: undefined },
          ],
        },
      },
    })
    const results = await searchDrugCatalog('ome')
    expect(results).toHaveLength(1)
    expect(results[0].atcCode).toBe('A02BC01')
  })

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 502 })
    await expect(searchDrugCatalog('ome')).rejects.toThrow('502')
  })
})

describe('setDrugPrice', () => {
  beforeEach(() => { mockFetch.mockReset() })

  it('POSTs to drugCatalog.setPrice with correct body', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    await setDrugPrice({
      atcCode: 'A02BC01',
      facilityId: 'fac-uuid-1234',
      retailPrice: 35.5,
      stockSignal: 'in_stock',
      doseForm: 'Capsule',
    })
    const [calledUrl, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(calledUrl).toContain('drugCatalog.setPrice')
    expect(opts.method).toBe('POST')
    const body = JSON.parse(opts.body as string)
    expect(body.json.atcCode).toBe('A02BC01')
    expect(body.json.retailPrice).toBe(35.5)
    expect(body.json.stockSignal).toBe('in_stock')
  })

  it('does nothing when getAccessToken returns null', async () => {
    mockGetAccessToken.mockResolvedValueOnce(null)
    await setDrugPrice({ atcCode: 'A02BC01', facilityId: 'fac-1', retailPrice: 10, stockSignal: 'in_stock' })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('does not throw on non-ok response (best-effort)', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403 })
    await expect(setDrugPrice({ atcCode: 'A02BC01', facilityId: 'fac-1', retailPrice: 10, stockSignal: 'in_stock' })).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/pharmacy-lite
pnpm test src/__tests__/drug-catalog-trpc.test.ts
```

Expected: FAIL — `searchDrugCatalog` and `setDrugPrice` not found

- [ ] **Step 3: Add functions to trpc.ts**

Open `apps/pharmacy-lite/src/lib/trpc.ts` and append after the existing exports:

```typescript
import type { DrugSearchResult } from '@ultranos/shared-types'

/**
 * Search the Hub drug catalog by INN name, ATC code, brand name, or local name.
 * Returns identity fields only (no tier content).
 */
export async function searchDrugCatalog(
  q: string,
  lang: 'en' | 'prs' | 'ps' = 'en',
  signal?: AbortSignal,
): Promise<DrugSearchResult[]> {
  const token = await useAuthSessionStore.getState().getAccessToken()
  if (!token) return []

  const url = new URL(getHubApiUrl())
  url.pathname = url.pathname.replace(/\/$/, '') + '/drugCatalog.search'
  url.searchParams.set('input', JSON.stringify({ json: { q, lang, limit: 20 } }))

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    signal,
  })
  if (!res.ok) throw new Error(`Drug catalog search failed: ${res.status}`)
  const body = await res.json() as { result: { data: { json: DrugSearchResult[] } } }
  return body.result.data.json
}

export interface SetDrugPriceInput {
  atcCode: string
  facilityId: string
  retailPrice: number          // AFN (not minor units)
  stockSignal: 'in_stock' | 'low_stock' | 'out_of_stock'
  doseForm?: string
  quantity?: number
}

/**
 * Publish a pharmacy's retail price for a drug to the Hub.
 * Best-effort: swallows Hub errors — never propagates to UI.
 * Pharmacist role only; Hub enforces facility-scoping via JWT.
 */
export async function setDrugPrice(input: SetDrugPriceInput): Promise<void> {
  const token = await useAuthSessionStore.getState().getAccessToken()
  if (!token) return

  try {
    await fetch(`${getHubApiUrl()}/drugCatalog.setPrice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ json: input }),
    })
  } catch {
    // Best-effort: price sync failure must never block a goods receipt
  }
}
```

Note: `useAuthSessionStore` is already imported implicitly via the existing `reportAuthEvent` in this file — confirm the import exists at the top. If not, add:
```typescript
import { useAuthSessionStore } from '@/stores/auth-session-store'
```

- [ ] **Step 4: Run tests**

```bash
pnpm test src/__tests__/drug-catalog-trpc.test.ts
```

Expected: PASS — all 8 tests green

- [ ] **Step 5: Commit**

```bash
git add apps/pharmacy-lite/src/lib/trpc.ts apps/pharmacy-lite/src/__tests__/drug-catalog-trpc.test.ts
git commit -m "feat(pharmacy-lite): add searchDrugCatalog and setDrugPrice API functions"
```

---

## Task 5: Add `atcCode` to CatalogItem type

**Context:** `CatalogItem` in `apps/pharmacy-lite/src/lib/inventory/types.ts` models the pharmacy's local inventory catalog. Adding an optional `atcCode?: string` lets the Hub catalog sync include the ATC linkage when the backend provides it. The field is optional — existing code is unaffected. `ReceiveStockForm` uses `CatalogItem` to populate `ReceiveLineItem`, which also needs the field passed through for price writing.

**Files:**
- Modify: `apps/pharmacy-lite/src/lib/inventory/types.ts`

No new test file needed — type change is additive and breaks no existing tests. Run the full test suite to confirm.

- [ ] **Step 1: Add `atcCode` to `CatalogItem`**

Open `apps/pharmacy-lite/src/lib/inventory/types.ts`. Find the `CatalogItem` interface and add one line after `barcode?: string`:

```typescript
export interface CatalogItem {
  id: string
  name: string
  nameLocal?: string
  form: MedicationForm
  strength: string
  strengthUnit: string
  packSize: number
  barcode?: string
  atcCode?: string           // ATC code linking to global drug catalog (optional)
  category: string
  controlledSchedule?: ControlledSchedule
  defaultSellingPrice: number
  reorderPoint: number
  minStock?: number
  maxStock?: number
  isActive: boolean
  lastSyncedAt: string
}
```

- [ ] **Step 2: Run full test suite**

```bash
pnpm test
```

Expected: PASS — all existing tests pass (additive change)

- [ ] **Step 3: Commit**

```bash
git add apps/pharmacy-lite/src/lib/inventory/types.ts
git commit -m "feat(pharmacy-lite): add optional atcCode field to CatalogItem"
```

---

## Task 6: CatalogBrowsePage — Hub drug catalog search + Pharmopedia deep links

**Context:** `CatalogBrowsePage` currently searches `db.catalogItems` in-memory with client-side filtering. When `filtered.length === 0` and the search string is non-empty, show a "Global drug catalog" section that queries `searchDrugCatalog`. Each Hub result row shows ATC code, INN name, dose forms, and an "Open in Pharmopedia" anchor (`pharmopedia://drug/{atcCode}`). Also add deep links to existing local catalog rows for items that have an `atcCode`.

A new state variable `hubResults: DrugSearchResult[]` holds the Hub search results. The Hub search runs in a `useEffect` debounced to 300ms, triggered when `filtered.length === 0` and `search.trim().length >= 2`.

**Files:**
- Modify: `apps/pharmacy-lite/src/components/pharmacy/inventory/CatalogBrowsePage.tsx`
- Create: `apps/pharmacy-lite/src/__tests__/catalog-browse-hub-search.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `apps/pharmacy-lite/src/__tests__/catalog-browse-hub-search.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CatalogBrowsePage } from '@/components/pharmacy/inventory/CatalogBrowsePage'
import type { DrugSearchResult } from '@ultranos/shared-types'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/lib/db', () => ({
  db: {
    catalogItems: {
      toArray: vi.fn().mockResolvedValue([]),
    },
  },
}))

vi.mock('@/hooks/useCatalogSync', () => ({ useCatalogSync: vi.fn() }))
vi.mock('@/stores/inventory-store', () => ({ useInventoryStore: (fn: (s: { isSyncingCatalog: boolean }) => boolean) => fn({ isSyncingCatalog: false }) }))
vi.mock('@/lib/inventory/fefo', () => ({ getTotalStockOnHand: vi.fn().mockResolvedValue(0) }))

const mockSearchDrugCatalog = vi.fn()
vi.mock('@/lib/trpc', () => ({
  getHubApiUrl: vi.fn(),
  reportAuthEvent: vi.fn(),
  searchDrugCatalog: mockSearchDrugCatalog,
  setDrugPrice: vi.fn(),
}))

const METRO_RESULT: DrugSearchResult = {
  atcCode: 'P01AB01',
  innName: 'Metronidazole',
  brandNames: ['Flagyl'],
  therapeuticClass: 'Antiprotozoals',
  doseForms: ['Tablet 400mg'],
  localName: undefined,
}

describe('CatalogBrowsePage — Hub search fallback', () => {
  beforeEach(() => { mockSearchDrugCatalog.mockReset() })

  it('does not show Hub section when local results exist', async () => {
    // No search entered — local items shown, no Hub query
    render(<CatalogBrowsePage />)
    await waitFor(() => {})
    expect(mockSearchDrugCatalog).not.toHaveBeenCalled()
    expect(screen.queryByText(/global drug catalog/i)).toBeNull()
  })

  it('shows Hub results when local search returns nothing', async () => {
    mockSearchDrugCatalog.mockResolvedValueOnce([METRO_RESULT])
    render(<CatalogBrowsePage />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'metro' } })
    await waitFor(() => screen.getByText('Metronidazole'), { timeout: 500 })
    expect(screen.getByText('P01AB01')).toBeTruthy()
  })

  it('shows Pharmopedia link for Hub results', async () => {
    mockSearchDrugCatalog.mockResolvedValueOnce([METRO_RESULT])
    render(<CatalogBrowsePage />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'metro' } })
    await waitFor(() => screen.getByText('Metronidazole'))
    const link = screen.getByRole('link', { name: /pharmopedia/i })
    expect(link).toHaveAttribute('href', 'pharmopedia://drug/P01AB01')
  })

  it('does not query Hub for searches shorter than 2 chars', async () => {
    render(<CatalogBrowsePage />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'm' } })
    await waitFor(() => {})
    expect(mockSearchDrugCatalog).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test src/__tests__/catalog-browse-hub-search.test.tsx
```

Expected: FAIL — Hub section doesn't exist yet in `CatalogBrowsePage`

- [ ] **Step 3: Update CatalogBrowsePage.tsx**

Replace the full content of `apps/pharmacy-lite/src/components/pharmacy/inventory/CatalogBrowsePage.tsx`:

```tsx
'use client'

import { useState, useEffect, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { db } from '@/lib/db'
import { useCatalogSync } from '@/hooks/useCatalogSync'
import { useInventoryStore } from '@/stores/inventory-store'
import { getTotalStockOnHand } from '@/lib/inventory/fefo'
import { searchDrugCatalog } from '@/lib/trpc'
import type { CatalogItem } from '@/lib/inventory/types'
import type { DrugSearchResult } from '@ultranos/shared-types'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'

interface CatalogRowData {
  item: CatalogItem
  stockOnHand: number
}

export function CatalogBrowsePage() {
  const t = useTranslations('inventory')
  useCatalogSync()
  const isSyncingCatalog = useInventoryStore((s) => s.isSyncingCatalog)

  const [rows, setRows] = useState<CatalogRowData[]>([])
  const [search, setSearch] = useState('')
  const [hubResults, setHubResults] = useState<DrugSearchResult[]>([])

  useEffect(() => {
    async function load() {
      const items = await db.catalogItems.toArray()
      const withStock = await Promise.all(
        items.map(async (item) => ({
          item,
          stockOnHand: await getTotalStockOnHand(item.id),
        }))
      )
      setRows(withStock)
    }
    load()
  }, [isSyncingCatalog])

  const filtered = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.toLowerCase()
    return rows.filter((r) => {
      const name = r.item.name.toLowerCase()
      const nameLocal = r.item.nameLocal?.toLowerCase() ?? ''
      const barcode = r.item.barcode?.toLowerCase() ?? ''
      const category = r.item.category.toLowerCase()
      return name.includes(q) || nameLocal.includes(q) || barcode.includes(q) || category.includes(q)
    })
  }, [rows, search])

  // Hub drug catalog fallback: query when local search returns nothing
  useEffect(() => {
    const trimmed = search.trim()
    if (filtered.length > 0 || trimmed.length < 2) {
      setHubResults([])
      return
    }

    const timer = setTimeout(async () => {
      try {
        const results = await searchDrugCatalog(trimmed)
        setHubResults(results)
      } catch {
        setHubResults([])
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [search, filtered.length])

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">{t('catalog')}</h1>
        {isSyncingCatalog && (
          <span className="text-sm text-muted-foreground">{t('syncing')}</span>
        )}
      </div>

      {/* Search */}
      <div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchByName')}
          className="w-full rounded-lg border border-border px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        />
      </div>

      {/* Local catalog table */}
      {filtered.length === 0 && !search.trim() ? (
        <EmptyState title={t('noCatalogItems')} />
      ) : filtered.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t('nameCol')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t('formCol')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t('strengthCol')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t('categoryCol')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t('stockCol')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t('reorderPointCol')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {/* actions */}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => (
                <tr key={r.item.id} className="hover:bg-accent">
                  <td className="px-4 py-3">
                    <span className="font-medium text-foreground">{r.item.name}</span>
                    {r.item.controlledSchedule && (
                      <span className="ms-2 inline-flex items-center rounded bg-destructive/10 px-1.5 py-0.5 text-xs font-semibold text-destructive">
                        C{r.item.controlledSchedule}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 capitalize text-muted-foreground">{r.item.form}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.item.strength} {r.item.strengthUnit}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.item.category}</td>
                  <td
                    className={`px-4 py-3 font-medium ${
                      r.stockOnHand <= r.item.reorderPoint
                        ? 'text-warning'
                        : 'text-foreground'
                    }`}
                  >
                    {r.stockOnHand}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.item.reorderPoint}</td>
                  <td className="px-4 py-3">
                    {r.item.atcCode && (
                      <a
                        href={`pharmopedia://drug/${r.item.atcCode}`}
                        className="text-xs font-medium text-primary-700 underline underline-offset-2"
                        aria-label="Open in Pharmopedia"
                      >
                        Pharmopedia
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* Hub drug catalog fallback section */}
      {filtered.length === 0 && search.trim().length >= 2 && hubResults.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Global drug catalog
          </h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-muted-foreground">Name</th>
                  <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-muted-foreground">ATC Code</th>
                  <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-muted-foreground">Dose Forms</th>
                  <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-muted-foreground">{/* link */}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {hubResults.map((r) => (
                  <tr key={r.atcCode} className="hover:bg-accent">
                    <td className="px-4 py-3 font-medium text-foreground">{r.innName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.atcCode}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.doseForms.join(', ')}</td>
                    <td className="px-4 py-3">
                      <a
                        href={`pharmopedia://drug/${r.atcCode}`}
                        className="text-xs font-medium text-primary-700 underline underline-offset-2"
                        aria-label="Open in Pharmopedia"
                      >
                        Pharmopedia
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm test src/__tests__/catalog-browse-hub-search.test.tsx
```

Expected: PASS — all 4 tests green

- [ ] **Step 5: Commit**

```bash
git add apps/pharmacy-lite/src/components/pharmacy/inventory/CatalogBrowsePage.tsx apps/pharmacy-lite/src/__tests__/catalog-browse-hub-search.test.tsx
git commit -m "feat(pharmacy-lite): Hub drug catalog fallback search and Pharmopedia deep links in CatalogBrowsePage"
```

---

## Task 7: ReceiveStockForm — write retail price to Hub on receipt confirmation

**Context:** `ReceiveStockForm` calls `processGoodsReceipt(...)` on submit. After success, for each item in `items` where `item.catalogItem.atcCode` is defined, call `setDrugPrice` with the item's `sellingPrice` (converted from minor units to AFN by dividing by `10^currencyMinorUnits`), stock signal `in_stock`, and `locationId` as `facilityId`.

`setDrugPrice` is already best-effort (it swallows errors internally). The call happens after `onComplete()` — it must never delay or fail the receipt confirmation. Because `setDrugPrice` is best-effort and fire-and-forget, call it with `void` (no `await`).

**Files:**
- Modify: `apps/pharmacy-lite/src/components/pharmacy/inventory/ReceiveStockForm.tsx`
- Create: `apps/pharmacy-lite/src/__tests__/receive-stock-price-write.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `apps/pharmacy-lite/src/__tests__/receive-stock-price-write.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ReceiveStockForm } from '@/components/pharmacy/inventory/ReceiveStockForm'
import type { CatalogItem } from '@/lib/inventory/types'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const mockProcessGoodsReceipt = vi.fn()
vi.mock('@/lib/inventory/goods-receipt-service', () => ({
  processGoodsReceipt: mockProcessGoodsReceipt,
}))

const mockSetDrugPrice = vi.fn()
vi.mock('@/lib/trpc', () => ({
  getHubApiUrl: vi.fn(),
  reportAuthEvent: vi.fn(),
  searchDrugCatalog: vi.fn(),
  setDrugPrice: mockSetDrugPrice,
}))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: (fn: (s: { session: { practitionerId: string } }) => unknown) =>
    fn({ session: { practitionerId: 'pract-1' } }),
}))

const mockCatalogItemWithAtc: CatalogItem = {
  id: 'cat-1',
  name: 'Metronidazole',
  form: 'tablet',
  strength: '400',
  strengthUnit: 'mg',
  packSize: 100,
  category: 'Antiprotozoals',
  defaultSellingPrice: 3500,
  reorderPoint: 50,
  isActive: true,
  lastSyncedAt: '2026-06-01T00:00:00Z',
  atcCode: 'P01AB01',
}

const mockCatalogItemNoAtc: CatalogItem = {
  ...mockCatalogItemWithAtc,
  id: 'cat-2',
  name: 'Unknown Drug',
  atcCode: undefined,
}

// CatalogSearchInput is an inner component — mock it to let us control item selection
vi.mock('@/components/pharmacy/inventory/CatalogSearchInput', () => ({
  CatalogSearchInput: ({ onSelect }: { onSelect: (item: CatalogItem) => void }) => (
    <button data-testid="add-item" onClick={() => onSelect(mockCatalogItemWithAtc)}>
      Add item
    </button>
  ),
}))

describe('ReceiveStockForm — price write on receipt', () => {
  beforeEach(() => {
    mockProcessGoodsReceipt.mockReset()
    mockSetDrugPrice.mockReset()
    mockProcessGoodsReceipt.mockResolvedValue(undefined)
    mockSetDrugPrice.mockResolvedValue(undefined)
  })

  async function fillAndSubmit() {
    render(<ReceiveStockForm locationId="fac-uuid-1234" currencyMinorUnits={2} onComplete={vi.fn()} />)
    fireEvent.click(screen.getByTestId('add-item'))
    // Fill required fields on the row
    await waitFor(() => screen.getByTestId('receive-item-0'))
    fireEvent.change(screen.getByLabelText(/batchNoRequired/i), { target: { value: 'BATCH-001' } })
    fireEvent.change(screen.getByLabelText(/expiryDateRequired/i), { target: { value: '2028-12-31' } })
    fireEvent.change(screen.getByLabelText(/quantityRequired/i), { target: { value: '100' } })
    fireEvent.change(screen.getByLabelText(/costPriceRequired/i), { target: { value: '25.00' } })
    fireEvent.change(screen.getByLabelText(/sellingPriceRequired/i), { target: { value: '35.50' } })
    fireEvent.click(screen.getByTestId('confirm-receipt-btn'))
  }

  it('calls setDrugPrice with atcCode and converted sellingPrice after successful receipt', async () => {
    await fillAndSubmit()
    await waitFor(() => expect(mockProcessGoodsReceipt).toHaveBeenCalledOnce())
    expect(mockSetDrugPrice).toHaveBeenCalledWith({
      atcCode: 'P01AB01',
      facilityId: 'fac-uuid-1234',
      retailPrice: 35.5,
      stockSignal: 'in_stock',
      doseForm: 'tablet',
    })
  })

  it('does not call setDrugPrice when catalogItem has no atcCode', async () => {
    vi.doMock('@/components/pharmacy/inventory/CatalogSearchInput', () => ({
      CatalogSearchInput: ({ onSelect }: { onSelect: (item: CatalogItem) => void }) => (
        <button data-testid="add-item" onClick={() => onSelect(mockCatalogItemNoAtc)}>
          Add item
        </button>
      ),
    }))
    await fillAndSubmit()
    await waitFor(() => expect(mockProcessGoodsReceipt).toHaveBeenCalledOnce())
    expect(mockSetDrugPrice).not.toHaveBeenCalled()
  })

  it('calls onComplete even if setDrugPrice would fail (best-effort)', async () => {
    mockSetDrugPrice.mockRejectedValueOnce(new Error('Hub down'))
    const onComplete = vi.fn()
    render(<ReceiveStockForm locationId="fac-1" currencyMinorUnits={2} onComplete={onComplete} />)
    fireEvent.click(screen.getByTestId('add-item'))
    await waitFor(() => screen.getByTestId('receive-item-0'))
    fireEvent.change(screen.getByLabelText(/batchNoRequired/i), { target: { value: 'B1' } })
    fireEvent.change(screen.getByLabelText(/expiryDateRequired/i), { target: { value: '2028-01-01' } })
    fireEvent.change(screen.getByLabelText(/quantityRequired/i), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText(/costPriceRequired/i), { target: { value: '5.00' } })
    fireEvent.change(screen.getByLabelText(/sellingPriceRequired/i), { target: { value: '8.00' } })
    fireEvent.click(screen.getByTestId('confirm-receipt-btn'))
    await waitFor(() => expect(onComplete).toHaveBeenCalledOnce())
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test src/__tests__/receive-stock-price-write.test.tsx
```

Expected: FAIL — `setDrugPrice` not called after receipt

- [ ] **Step 3: Update ReceiveStockForm.tsx**

Open `apps/pharmacy-lite/src/components/pharmacy/inventory/ReceiveStockForm.tsx`.

**a) Add import at the top:**
```typescript
import { setDrugPrice } from '@/lib/trpc'
```

**b) Update `handleSubmit`** — replace the existing `handleSubmit` async function:

```typescript
const handleSubmit = async () => {
  if (!isValid || !session) return
  setSaving(true)
  setError(null)
  try {
    await processGoodsReceipt({
      items: items.map((item) => ({
        catalogItemId: item.catalogItem.id,
        batchNumber: item.batchNumber.trim(),
        lotNumber: item.lotNumber.trim() || undefined,
        expiryDate: item.expiryDate,
        quantity: item.quantity,
        costPrice: item.costPrice,
        sellingPrice: item.sellingPrice,
      })),
      receivedBy: session.practitionerId ?? session.userId,
      locationId,
      notes: notes.trim() || undefined,
    })

    // Best-effort: publish retail prices to the Hub drug catalog.
    // Never awaited in serial — fire-and-forget to avoid blocking onComplete.
    for (const item of items) {
      if (item.catalogItem.atcCode && item.sellingPrice > 0) {
        void setDrugPrice({
          atcCode: item.catalogItem.atcCode,
          facilityId: locationId,
          retailPrice: item.sellingPrice / Math.pow(10, currencyMinorUnits),
          stockSignal: 'in_stock',
          doseForm: item.catalogItem.form,
        })
      }
    }

    onComplete()
  } catch {
    setError(t('failedProcessReceipt'))
  } finally {
    setSaving(false)
  }
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm test src/__tests__/receive-stock-price-write.test.tsx
```

Expected: PASS — all 3 tests green

- [ ] **Step 5: Run full test suite**

```bash
pnpm test
```

Expected: all existing tests still pass

- [ ] **Step 6: Commit**

```bash
git add apps/pharmacy-lite/src/components/pharmacy/inventory/ReceiveStockForm.tsx apps/pharmacy-lite/src/__tests__/receive-stock-price-write.test.tsx
git commit -m "feat(pharmacy-lite): publish retail price to Hub drug catalog on goods receipt"
```

---

## Self-Review

### 1. Spec coverage

| Spec requirement | Task |
|---|---|
| "Catalog browse: switch to GET /drug-catalog/search" | Task 6 (Hub fallback section) |
| "Inventory receive: write retail price to PUT /drug-catalog/:atcCode/prices/:facilityId" | Tasks 4 + 7 |
| "Stock signal write: update stockSignal via same prices endpoint when stock changes" | Task 7 (`in_stock` on receipt) |
| "Add deep-link button from catalog item → opens Pharmopedia" | Task 6 (local rows + Hub rows) |

All four Pharmacy-Lite spec requirements are covered. ✅

### 2. Placeholder scan

No TBD, no vague error handling references — every code block is complete. ✅

### 3. Type consistency

- `CatalogItem.atcCode?: string` defined in Task 5 → used in `ReceiveStockForm` (`item.catalogItem.atcCode`) in Task 7 → consistent.
- `SetDrugPriceInput` defined in `trpc.ts` (Task 4) → used in `ReceiveStockForm` (Task 7) → fields match.
- `setDrugPrice` call passes `retailPrice: item.sellingPrice / Math.pow(10, currencyMinorUnits)` — `sellingPrice` and `currencyMinorUnits` both exist in scope at the call site. ✅
- `searchDrugCatalog` returns `DrugSearchResult[]` → rendered in `CatalogBrowsePage` as `r.atcCode`, `r.innName`, `r.doseForms.join(', ')` — all fields on `DrugSearchResult`. ✅
