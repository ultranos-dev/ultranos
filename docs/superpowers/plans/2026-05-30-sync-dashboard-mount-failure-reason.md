# Sync Dashboard Mount & Failure Reason Persistence

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mount the existing SyncDashboard modal so it renders when users click the SyncPulse icon, and thread failure reasons from the DrainWorker through to the queue so the dashboard shows meaningful error messages.

**Architecture:** The SyncDashboard component already exists and is fully implemented but never mounted. We add it to the locale layout. For failure reasons, we add an optional `failureReason` field to the sync-engine's `SyncQueueEntry`, extend `markFailed` to accept a reason string, and pass it from `DrainWorker.drain()`.

**Tech Stack:** TypeScript, React, Next.js 15, Vitest, sync-engine package, Dexie (OPD-Lite)

---

### Task 1: Add `failureReason` to sync-engine `SyncQueueEntry` and `markFailed`

**Files:**
- Modify: `packages/sync-engine/src/queue.ts:10-21` (SyncQueueEntry interface)
- Modify: `packages/sync-engine/src/queue.ts:131-155` (markFailed method)
- Test: `packages/sync-engine/src/__tests__/queue.test.ts`

- [ ] **Step 1: Write the failing test for `markFailed` with reason**

Add to `packages/sync-engine/src/__tests__/queue.test.ts` inside the `describe('markFailed')` block:

```typescript
it('persists failureReason when provided', async () => {
  await queue.enqueue({
    resourceType: 'Encounter',
    resourceId: 'enc-1',
    action: 'create',
    payload: '{}',
    hlcTimestamp: '000001700000000:00000:node-1',
  })

  const pending = await queue.getPending()
  const entryId = pending[0]!.id

  // Fail 5 times to reach permanently failed state
  for (let i = 0; i < 5; i++) {
    await queue.markFailed(entryId, 'HTTP 500')
  }

  // Retrieve the failed entry via storage to inspect failureReason
  const failed = await storage.getByStatus('failed')
  expect(failed).toHaveLength(1)
  expect(failed[0]!.failureReason).toBe('HTTP 500')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F @ultranos/sync-engine test -- --run queue.test.ts`
Expected: FAIL — `failureReason` is not a property on `SyncQueueEntry`

- [ ] **Step 3: Add `failureReason` to `SyncQueueEntry` and update `markFailed`**

In `packages/sync-engine/src/queue.ts`, add to the `SyncQueueEntry` interface:

```typescript
export interface SyncQueueEntry {
  id: string
  resourceType: string
  resourceId: string
  action: 'create' | 'update' | 'sync:conflict_resolved' | 'pull-conflict'
  payload: string
  status: 'pending' | 'syncing' | 'failed' | 'synced' | 'resolved'
  hlcTimestamp: string
  createdAt: string
  retryCount: number
  lastAttemptAt?: string
  failureReason?: string
}
```

Update the `markFailed` method signature and body to accept and persist the reason:

```typescript
async markFailed(id: string, reason?: string): Promise<void> {
  const pending = await storage.getByStatus('pending')
  const syncing = await storage.getByStatus('syncing')
  const entry = [...pending, ...syncing].find((e) => e.id === id)
  if (!entry) return

  const newRetryCount = entry.retryCount + 1
  const nowIso = new Date().toISOString()

  if (newRetryCount >= maxRetries) {
    await storage.put({
      ...entry,
      status: 'failed',
      retryCount: newRetryCount,
      lastAttemptAt: nowIso,
      failureReason: reason,
    })
  } else {
    await storage.put({
      ...entry,
      status: 'pending',
      retryCount: newRetryCount,
      lastAttemptAt: nowIso,
      failureReason: reason,
    })
  }
},
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm -F @ultranos/sync-engine test -- --run queue.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/sync-engine/src/queue.ts packages/sync-engine/src/__tests__/queue.test.ts
git commit -m "feat(sync-engine): add failureReason to SyncQueueEntry and markFailed"
```

---

### Task 2: Pass failure reason from `DrainWorker.drain()` to `markFailed`

**Files:**
- Modify: `packages/sync-engine/src/drain-worker.ts:84-135` (drain method)
- Test: `packages/sync-engine/src/__tests__/drain-worker.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/sync-engine/src/__tests__/drain-worker.test.ts`:

```typescript
it('persists failureReason from syncFn error string', async () => {
  const storage = createInMemoryStorage()
  const q = createSyncQueue(storage, 1) // maxRetries=1 so first failure is permanent

  await q.enqueue({
    resourceType: 'Encounter',
    resourceId: 'enc-1',
    action: 'create',
    payload: '{}',
    hlcTimestamp: '000001700000000:00000:node-1',
  })

  const sf = vi.fn<(entry: SyncQueueEntry) => Promise<SyncResult>>()
    .mockResolvedValue({ success: false, error: 'HTTP 502' })

  const worker = new DrainWorker({ queue: q, syncFn: sf })
  await worker.drain()

  const failed = await storage.getByStatus('failed')
  expect(failed).toHaveLength(1)
  expect(failed[0]!.failureReason).toBe('HTTP 502')
})

it('persists failureReason when syncFn throws', async () => {
  const storage = createInMemoryStorage()
  const q = createSyncQueue(storage, 1) // maxRetries=1

  await q.enqueue({
    resourceType: 'Encounter',
    resourceId: 'enc-1',
    action: 'create',
    payload: '{}',
    hlcTimestamp: '000001700000000:00000:node-1',
  })

  const sf = vi.fn<(entry: SyncQueueEntry) => Promise<SyncResult>>()
    .mockRejectedValue(new Error('network timeout'))

  const worker = new DrainWorker({ queue: q, syncFn: sf })
  await worker.drain()

  const failed = await storage.getByStatus('failed')
  expect(failed).toHaveLength(1)
  expect(failed[0]!.failureReason).toBe('network timeout')
})
```

Note: These tests use `createInMemoryStorage()` directly (not `queue` from `beforeEach`) so they can set `maxRetries=1` and access the storage adapter for assertions.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F @ultranos/sync-engine test -- --run drain-worker.test.ts`
Expected: FAIL — `failureReason` is `undefined` on the failed entries

- [ ] **Step 3: Update `drain()` to pass error reasons to `markFailed`**

In `packages/sync-engine/src/drain-worker.ts`, update the three `markFailed` call sites in the `drain()` method:

Line ~120 (onConflict handler failed):
```typescript
catch {
  // onConflict handler failed — mark as failed so it retries
  await this.config.queue.markFailed(entry.id, 'Conflict handler failed')
  this.config.onAudit?.(entry, 'failure')
}
```

Line ~128 (syncFn returned failure, not a conflict):
```typescript
} else {
  await this.config.queue.markFailed(entry.id, result.error ?? 'Sync failed')
  this.config.onAudit?.(entry, 'failure')
}
```

Line ~131-133 (syncFn threw an exception):
```typescript
} catch (err) {
  const reason = err instanceof Error ? err.message : 'Sync error'
  await this.config.queue.markFailed(entry.id, reason)
  this.config.onAudit?.(entry, 'failure')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm -F @ultranos/sync-engine test -- --run drain-worker.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/sync-engine/src/drain-worker.ts packages/sync-engine/src/__tests__/drain-worker.test.ts
git commit -m "feat(sync-engine): thread failureReason from DrainWorker to markFailed"
```

---

### Task 3: Mount `SyncDashboard` in the OPD-Lite locale layout

**Files:**
- Modify: `apps/opd-lite/src/app/[locale]/layout.tsx`

- [ ] **Step 1: Update the locale layout to import and render SyncDashboard**

Replace the contents of `apps/opd-lite/src/app/[locale]/layout.tsx` with:

```tsx
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { AppSidebar } from '@/components/AppSidebar'
import { AppHeader } from '@/components/AppHeader'
import { SyncProvider } from '@/components/providers/SyncProvider'
import { SyncDashboard } from '@/components/SyncDashboard'

export default async function LocaleLayout({ children }: { children: React.ReactNode }) {
  const messages = await getMessages()

  return (
    <NextIntlClientProvider messages={messages}>
      <SyncProvider>
        <AppSidebar>
          <AppHeader />
          {children}
        </AppSidebar>
        <SyncDashboard />
      </SyncProvider>
    </NextIntlClientProvider>
  )
}
```

`SyncDashboard` is a `'use client'` component that renders `null` when `isDashboardOpen` is `false`, so it's safe to include unconditionally. It uses `fixed inset-0 z-50` positioning to overlay the entire viewport.

- [ ] **Step 2: Verify the app compiles**

Run: `pnpm -F opd-lite build`
Expected: Build succeeds with no type errors

- [ ] **Step 3: Commit**

```bash
git add apps/opd-lite/src/app/\[locale\]/layout.tsx
git commit -m "feat(opd-lite): mount SyncDashboard in locale layout"
```

---

### Task 4: Run full test suite

- [ ] **Step 1: Run sync-engine tests**

Run: `pnpm -F @ultranos/sync-engine test -- --run`
Expected: ALL PASS

- [ ] **Step 2: Run OPD-Lite tests**

Run: `pnpm -F opd-lite test -- --run`
Expected: ALL PASS (existing SyncDashboard tests should still pass since the component logic is unchanged)

- [ ] **Step 3: Commit (if any test fixes were needed)**

Only if test fixes were required — otherwise skip.
