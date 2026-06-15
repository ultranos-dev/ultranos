# Pharmopedia Plan 10 — Sync Progress + Auto-Sync on First Login

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a drug count during catalog sync, and automatically trigger the first sync immediately after login so new users don't see a perpetual "Catalog not yet synced" banner.

**Architecture:** `useSyncStore` gains a `syncedCount: number` field; `SyncStatusBanner` reads it to display "Syncing catalog… N drugs" while sync is active. A new `useAutoSync` hook (called from the tabs layout) fires `runSync` once when `isAuthenticated && lastVersion === 0`; `profile.tsx` passes `setSyncedCount` as the existing `onProgress` callback so manual syncs also update the counter. A one-line fix also corrects the missing `'ar'` lang in `searchDrugsApi`.

**Tech Stack:** Zustand, `expo-sqlite`, `@testing-library/react-native` (`renderHook` + `act`), Vitest, TypeScript.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/pharmopedia/src/i18n/locales/en.ts` | Modify | Add `sync.syncingCount` key |
| `apps/pharmopedia/src/i18n/locales/prs.ts` | Modify | Same — English fallback |
| `apps/pharmopedia/src/i18n/locales/ps.ts` | Modify | Same — English fallback |
| `apps/pharmopedia/src/i18n/locales/ar.ts` | Modify | Same — English fallback |
| `apps/pharmopedia/src/store/sync-store.ts` | Modify | Add `syncedCount` + `setSyncedCount` |
| `apps/pharmopedia/src/components/SyncStatusBanner.tsx` | Modify | Show drug count when `syncedCount > 0` |
| `apps/pharmopedia/src/api/drug-catalog.ts` | Modify | Fix `searchDrugsApi` lang type (add `'ar'`) |
| `apps/pharmopedia/src/__tests__/sync-status-banner.test.tsx` | Create | 5 tests for banner states including count |
| `apps/pharmopedia/src/hooks/useAutoSync.ts` | Create | Hook: trigger sync when `isAuthenticated && lastVersion === 0` |
| `apps/pharmopedia/app/(tabs)/_layout.tsx` | Modify | Call `useAutoSync()` |
| `apps/pharmopedia/app/(tabs)/profile.tsx` | Modify | Pass `setSyncedCount` as `onProgress` to `runSync`; reset count on new sync |
| `apps/pharmopedia/src/__tests__/use-auto-sync.test.ts` | Create | 6 tests for hook guard conditions + success/error |

---

## Key Types

```typescript
// Current sync-store.ts SyncState (before Task 1):
interface SyncState {
  status: 'idle' | 'syncing' | 'error'
  lastSyncAt: string | null
  lastVersion: number
  setStatus: (s: 'idle' | 'syncing' | 'error') => void
  setLastSync: (version: number, at: string) => void
  reset: () => void
}

// Target SyncState (after Task 1):
interface SyncState {
  status: 'idle' | 'syncing' | 'error'
  lastSyncAt: string | null
  lastVersion: number
  syncedCount: number                // ← NEW
  setStatus: (s: 'idle' | 'syncing' | 'error') => void
  setSyncedCount: (n: number) => void // ← NEW
  setLastSync: (version: number, at: string) => void
  reset: () => void
}

// runSync signature (already in catalog-sync.ts — no change needed):
export async function runSync(
  db: SQLite.SQLiteDatabase,
  token: string,
  onProgress?: (totalSynced: number) => void,
): Promise<SyncResult>
```

---

## Task 1: Sync Progress Count — Store, Banner, Bug Fix, Tests

**Files:**
- Modify: `apps/pharmopedia/src/i18n/locales/en.ts`
- Modify: `apps/pharmopedia/src/i18n/locales/prs.ts`
- Modify: `apps/pharmopedia/src/i18n/locales/ps.ts`
- Modify: `apps/pharmopedia/src/i18n/locales/ar.ts`
- Modify: `apps/pharmopedia/src/store/sync-store.ts`
- Modify: `apps/pharmopedia/src/components/SyncStatusBanner.tsx`
- Modify: `apps/pharmopedia/src/api/drug-catalog.ts`
- Create: `apps/pharmopedia/src/__tests__/sync-status-banner.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/pharmopedia/src/__tests__/sync-status-banner.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react-native'
import { SyncStatusBanner } from '@/components/SyncStatusBanner'
import { useSyncStore } from '@/store/sync-store'

vi.mock('@/store/sync-store', () => ({
  useSyncStore: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (key === 'sync.syncingCount' && opts?.count !== undefined) {
        return `Syncing catalog\u2026 ${opts.count} drugs`
      }
      const map: Record<string, string> = {
        'sync.syncing': 'Syncing catalog\u2026',
        'sync.failed': 'Sync failed \u2014 showing cached data',
        'sync.notSynced': 'Catalog not yet synced \u2014 connect to network',
      }
      return map[key] ?? key
    },
  }),
}))

type BannerState = { status: 'idle' | 'syncing' | 'error'; lastSyncAt: string | null; syncedCount: number }

function setState(state: BannerState) {
  vi.mocked(useSyncStore).mockImplementation(
    (sel: (s: BannerState) => unknown) => sel(state),
  )
}

beforeEach(() => {
  setState({ status: 'idle', lastSyncAt: '2026-06-13T12:00:00Z', syncedCount: 0 })
})

describe('SyncStatusBanner', () => {
  it('renders nothing when idle and catalog is synced', () => {
    render(<SyncStatusBanner />)
    expect(screen.queryByText(/Syncing|Sync failed|not yet synced/i)).toBeNull()
  })

  it('renders plain syncing text when status=syncing and syncedCount=0', () => {
    setState({ status: 'syncing', lastSyncAt: null, syncedCount: 0 })
    render(<SyncStatusBanner />)
    expect(screen.getByText('Syncing catalog\u2026')).toBeTruthy()
  })

  it('renders syncing text with drug count when syncedCount > 0', () => {
    setState({ status: 'syncing', lastSyncAt: null, syncedCount: 200 })
    render(<SyncStatusBanner />)
    expect(screen.getByText('Syncing catalog\u2026 200 drugs')).toBeTruthy()
  })

  it('renders error text when status=error', () => {
    setState({ status: 'error', lastSyncAt: null, syncedCount: 0 })
    render(<SyncStatusBanner />)
    expect(screen.getByText('Sync failed \u2014 showing cached data')).toBeTruthy()
  })

  it('renders not-synced warning when idle and lastSyncAt is null', () => {
    setState({ status: 'idle', lastSyncAt: null, syncedCount: 0 })
    render(<SyncStatusBanner />)
    expect(screen.getByText('Catalog not yet synced \u2014 connect to network')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos && pnpm -F pharmopedia test src/__tests__/sync-status-banner.test.tsx 2>&1 | tail -20
```

Expected: FAIL — `syncedCount` does not exist on the current store state shape, `sync.syncingCount` key not found.

- [ ] **Step 3: Add `sync.syncingCount` to `en.ts`**

In `apps/pharmopedia/src/i18n/locales/en.ts`, inside the `sync` block, add after `notSynced`:

```typescript
    syncingCount: 'Syncing catalog\u2026 {{count}} drugs',
```

The updated `sync` block becomes:

```typescript
  sync: {
    syncing: 'Syncing catalog\u2026',
    failed: 'Sync failed \u2014 showing cached data',
    notSynced: 'Catalog not yet synced \u2014 connect to network',
    syncingCount: 'Syncing catalog\u2026 {{count}} drugs',
  },
```

- [ ] **Step 4: Add `sync.syncingCount` to `prs.ts`, `ps.ts`, `ar.ts`**

In each file, add `syncingCount` after `notSynced` in the `sync` block:

```typescript
    syncingCount: 'Syncing catalog\u2026 {{count}} drugs',
```

(English fallback string — same for all three.)

- [ ] **Step 5: Add `syncedCount` and `setSyncedCount` to `sync-store.ts`**

Replace the entire content of `apps/pharmopedia/src/store/sync-store.ts` with:

```typescript
import { create } from 'zustand'

interface SyncState {
  status: 'idle' | 'syncing' | 'error'
  lastSyncAt: string | null
  lastVersion: number
  /** Running count of drugs synced in the current active sync. Reset to 0 on sync end. */
  syncedCount: number
  setStatus: (s: 'idle' | 'syncing' | 'error') => void
  setSyncedCount: (n: number) => void
  /** Set status to idle and record the latest version + timestamp. Resets syncedCount. */
  setLastSync: (version: number, at: string) => void
  /** Reset to initial state (called on logout). */
  reset: () => void
}

export const useSyncStore = create<SyncState>((set) => ({
  status: 'idle',
  lastSyncAt: null,
  lastVersion: 0,
  syncedCount: 0,

  setStatus: (s) => set({ status: s }),
  setSyncedCount: (n) => set({ syncedCount: n }),
  setLastSync: (version, at) => set({ status: 'idle', lastVersion: version, lastSyncAt: at, syncedCount: 0 }),
  reset: () => set({ status: 'idle', lastSyncAt: null, lastVersion: 0, syncedCount: 0 }),
}))
```

- [ ] **Step 6: Update `SyncStatusBanner.tsx` to show drug count**

Replace the entire content of `apps/pharmopedia/src/components/SyncStatusBanner.tsx` with:

```typescript
import { View, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useSyncStore } from '@/store/sync-store'

export function SyncStatusBanner() {
  const { t } = useTranslation()
  const status = useSyncStore((s) => s.status)
  const lastSyncAt = useSyncStore((s) => s.lastSyncAt)
  const syncedCount = useSyncStore((s) => s.syncedCount)

  if (status === 'syncing') {
    return (
      <View style={[styles.banner, styles.syncing]}>
        <Text style={styles.text}>
          {syncedCount > 0
            ? t('sync.syncingCount', { count: syncedCount })
            : t('sync.syncing')}
        </Text>
      </View>
    )
  }

  if (status === 'error') {
    return (
      <View style={[styles.banner, styles.error]}>
        <Text style={styles.text}>{t('sync.failed')}</Text>
      </View>
    )
  }

  if (!lastSyncAt) {
    return (
      <View style={[styles.banner, styles.warning]}>
        <Text style={styles.text}>{t('sync.notSynced')}</Text>
      </View>
    )
  }

  return null
}

const styles = StyleSheet.create({
  banner: { paddingHorizontal: 16, paddingVertical: 8 },
  syncing: { backgroundColor: '#dbeafe' },
  error: { backgroundColor: '#fee2e2' },
  warning: { backgroundColor: '#fef9c3' },
  text: { fontSize: 13, textAlign: 'center' },
})
```

- [ ] **Step 7: Fix `searchDrugsApi` lang type in `drug-catalog.ts`**

In `apps/pharmopedia/src/api/drug-catalog.ts`, find:

```typescript
export function searchDrugsApi(
  q: string,
  lang: 'en' | 'prs' | 'ps',
  limit: number,
  token: string,
```

Replace with:

```typescript
export function searchDrugsApi(
  q: string,
  lang: 'en' | 'prs' | 'ps' | 'ar',
  limit: number,
  token: string,
```

- [ ] **Step 8: Run SyncStatusBanner tests**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos && pnpm -F pharmopedia test src/__tests__/sync-status-banner.test.tsx 2>&1 | tail -15
```

Expected: 5/5 PASS.

- [ ] **Step 9: Run full test suite**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos && pnpm -F pharmopedia test 2>&1 | tail -10
```

Expected: 71 existing + 5 new = 76 tests pass.

- [ ] **Step 10: Commit**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
git add "apps/pharmopedia/src/i18n/locales/en.ts" "apps/pharmopedia/src/i18n/locales/prs.ts" "apps/pharmopedia/src/i18n/locales/ps.ts" "apps/pharmopedia/src/i18n/locales/ar.ts" "apps/pharmopedia/src/store/sync-store.ts" "apps/pharmopedia/src/components/SyncStatusBanner.tsx" "apps/pharmopedia/src/api/drug-catalog.ts" "apps/pharmopedia/src/__tests__/sync-status-banner.test.tsx"
git commit -m "feat(pharmopedia): sync progress count in banner + fix searchDrugsApi lang type"
```

---

## Task 2: `useAutoSync` Hook + Tabs Layout + Profile `onProgress`

**Files:**
- Create: `apps/pharmopedia/src/hooks/useAutoSync.ts`
- Modify: `apps/pharmopedia/app/(tabs)/_layout.tsx`
- Modify: `apps/pharmopedia/app/(tabs)/profile.tsx`
- Create: `apps/pharmopedia/src/__tests__/use-auto-sync.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/pharmopedia/src/__tests__/use-auto-sync.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react-native'
import { useAutoSync } from '@/hooks/useAutoSync'
import { useAuthStore } from '@/store/auth-store'
import { useSyncStore } from '@/store/sync-store'

const mockSetStatus = vi.fn()
const mockSetSyncedCount = vi.fn()
const mockSetLastSync = vi.fn()
const mockRunSync = vi.fn()

vi.mock('@/db/migrations', () => ({ getDatabase: () => ({}) }))
vi.mock('@/sync/catalog-sync', () => ({
  runSync: (...args: unknown[]) => mockRunSync(...args),
}))
vi.mock('@/store/auth-store', () => ({ useAuthStore: vi.fn() }))
vi.mock('@/store/sync-store', () => ({ useSyncStore: vi.fn() }))

type AuthState = { isAuthenticated: boolean; token: string | null }
type SyncState = {
  lastVersion: number
  status: 'idle' | 'syncing' | 'error'
  setStatus: typeof mockSetStatus
  setSyncedCount: typeof mockSetSyncedCount
  setLastSync: typeof mockSetLastSync
}

function setAuth(state: AuthState) {
  vi.mocked(useAuthStore).mockImplementation((sel: (s: AuthState) => unknown) => sel(state))
}
function setSync(state: SyncState) {
  vi.mocked(useSyncStore).mockImplementation((sel: (s: SyncState) => unknown) => sel(state))
}

const defaultSync: SyncState = {
  lastVersion: 0,
  status: 'idle',
  setStatus: mockSetStatus,
  setSyncedCount: mockSetSyncedCount,
  setLastSync: mockSetLastSync,
}

beforeEach(() => {
  vi.clearAllMocks()
  setAuth({ isAuthenticated: true, token: 'tok' })
  setSync(defaultSync)
})

describe('useAutoSync', () => {
  it('triggers sync when authenticated, token present, lastVersion=0', async () => {
    mockRunSync.mockResolvedValue({ synced: 100, version: 1 })
    await act(async () => { renderHook(() => useAutoSync()) })
    expect(mockSetStatus).toHaveBeenCalledWith('syncing')
    expect(mockRunSync).toHaveBeenCalledTimes(1)
  })

  it('calls setLastSync with version and ISO timestamp on success', async () => {
    mockRunSync.mockResolvedValue({ synced: 100, version: 3 })
    await act(async () => { renderHook(() => useAutoSync()) })
    expect(mockSetLastSync).toHaveBeenCalledWith(3, expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/))
  })

  it('calls setStatus("error") when runSync rejects', async () => {
    mockRunSync.mockRejectedValue(new Error('network'))
    await act(async () => { renderHook(() => useAutoSync()) })
    expect(mockSetStatus).toHaveBeenCalledWith('error')
  })

  it('does NOT trigger when lastVersion > 0', async () => {
    setSync({ ...defaultSync, lastVersion: 5 })
    await act(async () => { renderHook(() => useAutoSync()) })
    expect(mockRunSync).not.toHaveBeenCalled()
  })

  it('does NOT trigger when not authenticated', async () => {
    setAuth({ isAuthenticated: false, token: null })
    await act(async () => { renderHook(() => useAutoSync()) })
    expect(mockRunSync).not.toHaveBeenCalled()
  })

  it('does NOT trigger when already syncing', async () => {
    setSync({ ...defaultSync, status: 'syncing' })
    await act(async () => { renderHook(() => useAutoSync()) })
    expect(mockRunSync).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos && pnpm -F pharmopedia test src/__tests__/use-auto-sync.test.ts 2>&1 | tail -15
```

Expected: FAIL — `useAutoSync` module not found.

- [ ] **Step 3: Create `useAutoSync.ts`**

Create `apps/pharmopedia/src/hooks/useAutoSync.ts`:

```typescript
import { useEffect } from 'react'
import { useAuthStore } from '@/store/auth-store'
import { useSyncStore } from '@/store/sync-store'
import { runSync } from '@/sync/catalog-sync'
import { getDatabase } from '@/db/migrations'

/**
 * Auto-triggers a full catalog sync once per session when the user is
 * authenticated and has never synced (lastVersion === 0).
 *
 * Call this hook from the tabs layout so it runs as soon as the user
 * reaches the main app. The effect fires at most once — it guards against
 * re-runs while a sync is already in progress.
 */
export function useAutoSync() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const token = useAuthStore((s) => s.token)
  const lastVersion = useSyncStore((s) => s.lastVersion)
  const status = useSyncStore((s) => s.status)
  const setStatus = useSyncStore((s) => s.setStatus)
  const setSyncedCount = useSyncStore((s) => s.setSyncedCount)
  const setLastSync = useSyncStore((s) => s.setLastSync)

  useEffect(() => {
    if (!isAuthenticated || !token || lastVersion > 0 || status === 'syncing') return

    let cancelled = false
    setStatus('syncing')

    runSync(getDatabase(), token, (count) => {
      if (!cancelled) setSyncedCount(count)
    })
      .then(({ version }) => {
        if (!cancelled) setLastSync(version, new Date().toISOString())
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => { cancelled = true }
  // isAuthenticated and token are the only reactive triggers.
  // lastVersion/status are read once as guards, not subscribed reactively.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, token])
}
```

- [ ] **Step 4: Run `useAutoSync` tests**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos && pnpm -F pharmopedia test src/__tests__/use-auto-sync.test.ts 2>&1 | tail -15
```

Expected: 6/6 PASS.

- [ ] **Step 5: Wire `useAutoSync` into the tabs layout**

In `apps/pharmopedia/app/(tabs)/_layout.tsx`, add the import and hook call:

```typescript
import { Tabs } from 'expo-router'
import { Search, Folder, Bookmark, User } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useAutoSync } from '@/hooks/useAutoSync'

export default function TabsLayout() {
  const { t } = useTranslation()
  useAutoSync()

  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: '#2563eb' }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.search'),
          tabBarIcon: ({ color, size }) => <Search color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="browse"
        options={{
          title: t('tabs.browse'),
          tabBarIcon: ({ color, size }) => <Folder color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          title: t('tabs.saved'),
          tabBarIcon: ({ color, size }) => <Bookmark color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
    </Tabs>
  )
}
```

- [ ] **Step 6: Update `profile.tsx` — add `setSyncedCount` and pass `onProgress` to `runSync`**

In `apps/pharmopedia/app/(tabs)/profile.tsx`, add `setSyncedCount` to the store selectors (after `setLastSync`):

```typescript
  const setSyncedCount = useSyncStore((s) => s.setSyncedCount)
```

Then replace `handleSyncNow` with:

```typescript
  async function handleSyncNow() {
    if (!token || status === 'syncing') return
    setStatus('syncing')
    setSyncedCount(0)
    try {
      const { version } = await runSync(getDatabase(), token, setSyncedCount)
      setLastSync(version, new Date().toISOString())
    } catch {
      setStatus('error')
    }
  }
```

The `setSyncedCount(0)` at the top resets the counter before each new manual sync so the banner starts fresh.

- [ ] **Step 7: Run full test suite**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos && pnpm -F pharmopedia test 2>&1 | tail -10
```

Expected: 76 existing + 6 new = 82 tests pass.

- [ ] **Step 8: Commit**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
git add "apps/pharmopedia/src/hooks/useAutoSync.ts" "apps/pharmopedia/app/(tabs)/_layout.tsx" "apps/pharmopedia/app/(tabs)/profile.tsx" "apps/pharmopedia/src/__tests__/use-auto-sync.test.ts"
git commit -m "feat(pharmopedia): auto-sync on first login + onProgress wired to profile sync"
```

---

## Self-Review

### Spec Coverage

| Requirement | Task |
|---|---|
| Drug count shown during sync | Task 1 — `syncedCount` in store + `sync.syncingCount` i18n + `SyncStatusBanner` |
| New users auto-synced on login | Task 2 — `useAutoSync` called from tabs layout |
| Manual sync also shows progress | Task 2 — profile.tsx passes `setSyncedCount` as `onProgress` |
| `'ar'` lang supported in search API | Task 1 — one-line fix to `searchDrugsApi` |
| `SyncStatusBanner` has test coverage | Task 1 — 5 tests covering all 4 render states |

### Placeholder Scan

No TBDs. All code blocks are complete. Mock patterns are fully specified.

### Type Consistency

- `SyncState.syncedCount: number` — used as-is in `setSyncedCount(n: number)`, `setSyncedCount(0)`, and the banner `syncedCount > 0` guard.
- `runSync(..., onProgress?: (totalSynced: number) => void)` — `setSyncedCount` signature is `(n: number) => void`. Direct assignment `runSync(db, token, setSyncedCount)` is type-safe.
- `useAutoSync` `useEffect` dep array omits `lastVersion`, `status`, `setStatus`, `setSyncedCount`, `setLastSync` intentionally — they are read once as guards, not reactive subscriptions. The ESLint disable comment explains this.
- `searchDrugsApi` `lang: 'en' | 'prs' | 'ps' | 'ar'` now matches `Lang = 'en' | 'prs' | 'ps' | 'ar'` from `lang-store.ts`.

### Note on `setLastSync` reset behaviour

`setLastSync` now also resets `syncedCount` to `0`. This means when the tabs layout auto-sync completes, the banner immediately stops showing the count (correct). When a manual sync completes from profile, same behaviour (correct).
