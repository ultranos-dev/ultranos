# Adaptive Sync — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse sync latency on healthy networks by making the drain worker connectivity-aware, event-driven, and batched — without touching the offline-first floor or any backend.

**Architecture:** Add a passive `ConnectivityManager` to `@ultranos/sync-engine` that classifies the link as `offline | degraded | healthy` from the outcomes of syncs the app already performs (no probes). The existing `DrainWorker` gains: (a) outcome-reporting into the manager, (b) an event-driven debounced `requestDrain()` fired on enqueue, (c) a self-rescheduling adaptive interval keyed off connectivity state, and (d) an opt-in batched push. All changes are backward-compatible; a worker with no `connectivity`/`syncBatchFn` behaves exactly as today. OPD-Lite wires it up first.

**Tech Stack:** TypeScript (ESM, NodeNext), Vitest, pnpm workspaces. Package built with `tsc`. Web app (OPD-Lite) is Next.js 15 consuming the compiled `dist/`.

**Spec:** `docs/superpowers/specs/2026-09-10-adaptive-realtime-sync-design.md` (this plan implements the **Phase 1** section only)

## Global Constraints

- **Offline-first floor is untouched.** The durable queue and the safety-net poll remain. Every new layer must degrade silently to today's behavior if it fails; a failed/absent `ConnectivityManager` or `syncBatchFn` must not break sync. (Spec: "Principle")
- **No dedicated network probes.** The `ConnectivityManager` is passive — it emits no timers or requests of its own; state derives only from sync outcomes + the platform online flag. (Spec: §1.1 — the target environment is metered/low-resource.)
- **No PHI in logs/errors.** Any new log line uses opaque ids/counts only — never payload content, resource content, or patient identifiers beyond the opaque `resourceId` already used. (CLAUDE.md safety rule #1.)
- **Tier-1 priority preserved.** Allergies, active meds, and consent (`getConflictTier` → `TIER_1` / `CONSENT`) drain first and trigger an immediate (non-debounced) drain. Conflict-resolution tiers and Tier-1 prescription-blocking are unchanged. (CLAUDE.md sync tiers; Spec §1.2.)
- **Backward compatibility.** `createSyncQueue(storage)` and `new DrainWorker({ queue, syncFn })` must keep working with no new options. New config fields are all optional.
- **Build after edits:** `pnpm -F @ultranos/sync-engine build` before OPD-Lite can pick up changes (apps resolve `dist/`, not `src/`). (CLAUDE.md UI-kit/package build rule — same applies to sync-engine.)
- **Test/build commands:** package tests `pnpm -F @ultranos/sync-engine test`; single file `pnpm -F @ultranos/sync-engine exec vitest run src/__tests__/<file>.test.ts`; typecheck `pnpm -F @ultranos/sync-engine typecheck`.
- **No autonomous commits.** Commit steps are written for the executor, but only run them when the user has authorized committing. (CLAUDE.md git rule.)

---

## File Structure

**Created:**
- `packages/sync-engine/src/connectivity-manager.ts` — the passive state machine. One responsibility: classify connectivity from samples + online flag, notify subscribers on change.
- `packages/sync-engine/src/__tests__/connectivity-manager.test.ts` — unit tests for the state machine.

**Modified:**
- `packages/sync-engine/src/drain-worker.ts` — outcome reporting, `requestDrain()` debounce, adaptive rescheduling, opt-in `syncBatchFn`, `handleResult` refactor.
- `packages/sync-engine/src/queue.ts` — optional `onEnqueued` hook fired after a successful enqueue.
- `packages/sync-engine/src/index.ts` — export `ConnectivityManager` + its types.
- `packages/sync-engine/src/__tests__/drain-worker.test.ts` — new cases for outcomes, debounce, adaptive interval, batching.
- `packages/sync-engine/src/__tests__/queue.test.ts` — `onEnqueued` hook case.
- `apps/opd-lite/src/lib/sync-queue.ts` — pass `onEnqueued` bridge into `createSyncQueue`.
- `apps/opd-lite/src/lib/sync-worker.ts` — construct/own the `ConnectivityManager`, wire `requestDrain` to enqueue, add `syncBatchFn`, adaptive intervals.

---

### Task 1: ConnectivityManager (passive state machine)

**Files:**
- Create: `packages/sync-engine/src/connectivity-manager.ts`
- Create/Test: `packages/sync-engine/src/__tests__/connectivity-manager.test.ts`
- Modify: `packages/sync-engine/src/index.ts`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces:
  - `type ConnectivityState = 'offline' | 'degraded' | 'healthy'`
  - `interface ConnectivitySample { ok: boolean; latencyMs?: number }`
  - `class ConnectivityManager` with:
    - `constructor(config?: ConnectivityManagerConfig)`
    - `getState(): ConnectivityState`
    - `recordResult(sample: ConnectivitySample): void`
    - `setOnline(online: boolean): void`
    - `subscribe(listener: (state: ConnectivityState) => void): () => void`
  - `interface ConnectivityManagerConfig { latencyAlpha?; failureAlpha?; degradedLatencyMs?; degradedFailureRate?; isOnline?: () => boolean }`

- [ ] **Step 1: Write the failing tests**

Create `packages/sync-engine/src/__tests__/connectivity-manager.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { ConnectivityManager } from '../connectivity-manager.js'

describe('ConnectivityManager', () => {
  it('is optimistically healthy when online with no samples yet', () => {
    const cm = new ConnectivityManager({ isOnline: () => true })
    expect(cm.getState()).toBe('healthy')
  })

  it('is offline when the platform reports offline, regardless of samples', () => {
    const cm = new ConnectivityManager({ isOnline: () => false })
    cm.recordResult({ ok: true, latencyMs: 10 })
    expect(cm.getState()).toBe('offline')
  })

  it('stays healthy on fast successful samples', () => {
    const cm = new ConnectivityManager({ isOnline: () => true, degradedLatencyMs: 2000 })
    cm.recordResult({ ok: true, latencyMs: 100 })
    cm.recordResult({ ok: true, latencyMs: 150 })
    expect(cm.getState()).toBe('healthy')
  })

  it('degrades when the smoothed failure rate crosses the threshold', () => {
    const cm = new ConnectivityManager({
      isOnline: () => true,
      failureAlpha: 1, // no smoothing — latest sample dominates for a deterministic test
      degradedFailureRate: 0.3,
    })
    cm.recordResult({ ok: false })
    expect(cm.getState()).toBe('degraded')
  })

  it('degrades when smoothed latency crosses the threshold', () => {
    const cm = new ConnectivityManager({
      isOnline: () => true,
      latencyAlpha: 1,
      degradedLatencyMs: 2000,
    })
    cm.recordResult({ ok: true, latencyMs: 5000 })
    expect(cm.getState()).toBe('degraded')
  })

  it('recovers to healthy after conditions improve', () => {
    const cm = new ConnectivityManager({
      isOnline: () => true,
      failureAlpha: 1,
      latencyAlpha: 1,
      degradedFailureRate: 0.3,
    })
    cm.recordResult({ ok: false })
    expect(cm.getState()).toBe('degraded')
    cm.recordResult({ ok: true, latencyMs: 100 })
    expect(cm.getState()).toBe('healthy')
  })

  it('notifies subscribers only on state change', () => {
    const cm = new ConnectivityManager({ isOnline: () => true, failureAlpha: 1, degradedFailureRate: 0.3 })
    const listener = vi.fn()
    cm.subscribe(listener)
    cm.recordResult({ ok: true, latencyMs: 100 }) // stays healthy — no emit
    cm.recordResult({ ok: false })                // healthy -> degraded — emit
    cm.recordResult({ ok: false })                // stays degraded — no emit
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenLastCalledWith('degraded')
  })

  it('emits offline transition on setOnline(false) and back on setOnline(true)', () => {
    const online = { value: true }
    const cm = new ConnectivityManager({ isOnline: () => online.value })
    const listener = vi.fn()
    cm.subscribe(listener)
    online.value = false
    cm.setOnline(false)
    expect(cm.getState()).toBe('offline')
    online.value = true
    cm.setOnline(true)
    expect(cm.getState()).toBe('healthy')
    expect(listener).toHaveBeenCalledWith('offline')
    expect(listener).toHaveBeenCalledWith('healthy')
  })

  it('emits no timers or network calls (passive)', () => {
    // Guard: constructing and recording must not schedule timers.
    const spy = vi.spyOn(globalThis, 'setInterval')
    const cm = new ConnectivityManager({ isOnline: () => true })
    cm.recordResult({ ok: true, latencyMs: 100 })
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm -F @ultranos/sync-engine exec vitest run src/__tests__/connectivity-manager.test.ts`
Expected: FAIL — cannot find module `../connectivity-manager.js`.

- [ ] **Step 3: Implement the module**

Create `packages/sync-engine/src/connectivity-manager.ts`:

```ts
/**
 * Passive connectivity classifier for adaptive sync.
 *
 * Emits NO timers and makes NO network calls of its own. State is derived only
 * from (a) the outcomes/latency of syncs the app already performs and (b) the
 * platform online flag. This keeps it cheap on metered, low-resource networks.
 */

export type ConnectivityState = 'offline' | 'degraded' | 'healthy'

export interface ConnectivitySample {
  ok: boolean
  latencyMs?: number
}

export interface ConnectivityManagerConfig {
  /** EWMA smoothing for latency (0..1]; 1 = latest sample only. Default 0.3. */
  latencyAlpha?: number
  /** EWMA smoothing for failure rate (0..1]; 1 = latest sample only. Default 0.3. */
  failureAlpha?: number
  /** Smoothed latency (ms) at/above which an online link is 'degraded'. Default 2000. */
  degradedLatencyMs?: number
  /** Smoothed failure rate (0..1) at/above which an online link is 'degraded'. Default 0.3. */
  degradedFailureRate?: number
  /** Reads the platform online flag. Default: navigator.onLine (true when unavailable). */
  isOnline?: () => boolean
}

const defaultIsOnline = (): boolean =>
  typeof navigator === 'undefined' ? true : navigator.onLine

export class ConnectivityManager {
  private readonly latencyAlpha: number
  private readonly failureAlpha: number
  private readonly degradedLatencyMs: number
  private readonly degradedFailureRate: number
  private readonly isOnline: () => boolean

  private ewmaLatency: number | null = null
  private ewmaFailure = 0
  private hasSample = false
  private lastState: ConnectivityState
  private readonly listeners = new Set<(s: ConnectivityState) => void>()

  constructor(config: ConnectivityManagerConfig = {}) {
    this.latencyAlpha = config.latencyAlpha ?? 0.3
    this.failureAlpha = config.failureAlpha ?? 0.3
    this.degradedLatencyMs = config.degradedLatencyMs ?? 2000
    this.degradedFailureRate = config.degradedFailureRate ?? 0.3
    this.isOnline = config.isOnline ?? defaultIsOnline
    this.lastState = this.compute()
  }

  getState(): ConnectivityState {
    return this.compute()
  }

  recordResult(sample: ConnectivitySample): void {
    this.hasSample = true
    const failed = sample.ok ? 0 : 1
    this.ewmaFailure = this.failureAlpha * failed + (1 - this.failureAlpha) * this.ewmaFailure
    if (typeof sample.latencyMs === 'number') {
      this.ewmaLatency =
        this.ewmaLatency === null
          ? sample.latencyMs
          : this.latencyAlpha * sample.latencyMs + (1 - this.latencyAlpha) * this.ewmaLatency
    }
    this.emitIfChanged()
  }

  setOnline(_online: boolean): void {
    // The flag itself is read via isOnline(); this just triggers re-evaluation
    // so callers can bridge 'online'/'offline' DOM events into a state emit.
    this.emitIfChanged()
  }

  subscribe(listener: (state: ConnectivityState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private compute(): ConnectivityState {
    if (!this.isOnline()) return 'offline'
    if (!this.hasSample) return 'healthy' // optimistic until first real sync corrects it
    const latencyBad = this.ewmaLatency !== null && this.ewmaLatency >= this.degradedLatencyMs
    const failureBad = this.ewmaFailure >= this.degradedFailureRate
    return latencyBad || failureBad ? 'degraded' : 'healthy'
  }

  private emitIfChanged(): void {
    const next = this.compute()
    if (next === this.lastState) return
    this.lastState = next
    for (const l of this.listeners) l(next)
  }
}
```

- [ ] **Step 4: Export from index**

In `packages/sync-engine/src/index.ts`, add after the queue exports (around line 47):

```ts
export { ConnectivityManager } from './connectivity-manager.js'
export type {
  ConnectivityState,
  ConnectivitySample,
  ConnectivityManagerConfig,
} from './connectivity-manager.js'
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm -F @ultranos/sync-engine exec vitest run src/__tests__/connectivity-manager.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 6: Typecheck**

Run: `pnpm -F @ultranos/sync-engine typecheck`
Expected: no errors.

- [ ] **Step 7: Commit** (only if committing is authorized)

```bash
git add packages/sync-engine/src/connectivity-manager.ts packages/sync-engine/src/__tests__/connectivity-manager.test.ts packages/sync-engine/src/index.ts
git commit -m "feat(sync-engine): passive ConnectivityManager state machine"
```

---

### Task 2: Report sync outcomes into ConnectivityManager

**Files:**
- Modify: `packages/sync-engine/src/drain-worker.ts`
- Test: `packages/sync-engine/src/__tests__/drain-worker.test.ts`

**Interfaces:**
- Consumes: `ConnectivityManager` (Task 1).
- Produces: `DrainWorkerConfig.connectivity?: ConnectivityManager` — when present, the worker calls `connectivity.recordResult({ ok, latencyMs })` after every `syncFn` attempt (success/failure/throw), measuring wall-clock latency around the call. No behavior change when absent.

- [ ] **Step 1: Write the failing test**

Add to `packages/sync-engine/src/__tests__/drain-worker.test.ts` (inside the `describe('DrainWorker', ...)` block):

```ts
  it('reports a successful sync outcome to the ConnectivityManager', async () => {
    const { ConnectivityManager } = await import('../connectivity-manager.js')
    const cm = new ConnectivityManager({ isOnline: () => true })
    const recordSpy = vi.spyOn(cm, 'recordResult')

    await queue.enqueue({
      resourceType: 'Encounter', resourceId: 'enc-1', action: 'create',
      payload: '{}', hlcTimestamp: '000001700000000:00000:node-1',
    })
    syncFn.mockResolvedValue({ success: true })

    const worker = new DrainWorker({ queue, syncFn, connectivity: cm })
    await worker.drain()

    expect(recordSpy).toHaveBeenCalledWith(expect.objectContaining({ ok: true }))
  })

  it('reports a failed sync outcome to the ConnectivityManager', async () => {
    const { ConnectivityManager } = await import('../connectivity-manager.js')
    const cm = new ConnectivityManager({ isOnline: () => true })
    const recordSpy = vi.spyOn(cm, 'recordResult')

    await queue.enqueue({
      resourceType: 'Encounter', resourceId: 'enc-1', action: 'create',
      payload: '{}', hlcTimestamp: '000001700000000:00000:node-1',
    })
    syncFn.mockRejectedValue(new Error('network down'))

    const worker = new DrainWorker({ queue, syncFn, connectivity: cm })
    await worker.drain()

    expect(recordSpy).toHaveBeenCalledWith(expect.objectContaining({ ok: false }))
  })
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F @ultranos/sync-engine exec vitest run src/__tests__/drain-worker.test.ts -t "ConnectivityManager"`
Expected: FAIL — `connectivity` not accepted / `recordResult` never called.

- [ ] **Step 3: Implement**

In `packages/sync-engine/src/drain-worker.ts`:

Add the import at the top (after the existing type imports):

```ts
import type { ConnectivityManager } from './connectivity-manager.js'
```

Add to `DrainWorkerConfig` (after `isKeyAvailable?`):

```ts
  /** Optional connectivity classifier fed by sync outcomes. Absent = no reporting. */
  connectivity?: ConnectivityManager
```

Wrap the per-entry `syncFn` call (currently line 133 `const result = await this.config.syncFn(entryForSync)`) with latency measurement and outcome reporting. Replace the `try { ... } catch (err) { ... }` body around the sync call so that BOTH the success and throw paths record an outcome. Concretely, change:

```ts
          const result = await this.config.syncFn(entryForSync)
```
to:
```ts
          const startedAt = Date.now()
          let result: SyncResult
          try {
            result = await this.config.syncFn(entryForSync)
            this.config.connectivity?.recordResult({ ok: result.success, latencyMs: Date.now() - startedAt })
          } catch (syncErr) {
            this.config.connectivity?.recordResult({ ok: false, latencyMs: Date.now() - startedAt })
            throw syncErr
          }
```

(The outer `catch (err)` that marks the entry failed remains unchanged and still runs after the re-throw.)

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -F @ultranos/sync-engine exec vitest run src/__tests__/drain-worker.test.ts`
Expected: PASS (existing cases + 2 new).

- [ ] **Step 5: Commit** (if authorized)

```bash
git add packages/sync-engine/src/drain-worker.ts packages/sync-engine/src/__tests__/drain-worker.test.ts
git commit -m "feat(sync-engine): report drain outcomes to ConnectivityManager"
```

---

### Task 3: Event-driven push (debounced requestDrain + onEnqueued hook)

**Files:**
- Modify: `packages/sync-engine/src/queue.ts`
- Modify: `packages/sync-engine/src/drain-worker.ts`
- Test: `packages/sync-engine/src/__tests__/queue.test.ts`, `packages/sync-engine/src/__tests__/drain-worker.test.ts`

**Interfaces:**
- Consumes: `ConnectivityManager` (for the online gate), `getConflictTier` from `./conflict-tiers.js`.
- Produces:
  - `createSyncQueue(storage, maxRetries?, options?: { onEnqueued?: (input: EnqueueInput) => void })` — third optional arg; `onEnqueued` fires after every successful enqueue (new **and** dedup-replace). Wrapped in try/catch so it never breaks enqueue.
  - `DrainWorker.requestDrain(opts?: { immediate?: boolean }): void` — schedules a debounced drain (`enqueueDebounceMs`, default 300); `immediate: true` bypasses the debounce (Tier-1). No-op when `connectivity` reports `offline`.
  - `DrainWorkerConfig.enqueueDebounceMs?: number`.

- [ ] **Step 1: Write the failing queue test**

Add to `packages/sync-engine/src/__tests__/queue.test.ts`:

```ts
  it('fires onEnqueued after a new enqueue and after a dedup-replace', async () => {
    const { createSyncQueue } = await import('../queue.js')
    const storage = createInMemoryStorage() // reuse the file's existing helper
    const onEnqueued = vi.fn()
    const q = createSyncQueue(storage, undefined, { onEnqueued })

    await q.enqueue({ resourceType: 'Observation', resourceId: 'obs-1', action: 'create', payload: '{}', hlcTimestamp: '000001700000000:00000:node-1' })
    await q.enqueue({ resourceType: 'Observation', resourceId: 'obs-1', action: 'update', payload: '{"v":2}', hlcTimestamp: '000001700000001:00000:node-1' })

    expect(onEnqueued).toHaveBeenCalledTimes(2)
    expect(onEnqueued).toHaveBeenLastCalledWith(expect.objectContaining({ resourceId: 'obs-1', action: 'update' }))
  })
```

> If `queue.test.ts` lacks a `createInMemoryStorage` helper, copy the one from `drain-worker.test.ts` (lines 6–39) into this file's top, or import a shared one if the file already defines storage inline. Confirm by opening the file first.

- [ ] **Step 2: Write the failing drain-worker tests**

Add to `packages/sync-engine/src/__tests__/drain-worker.test.ts`:

```ts
  it('requestDrain debounces multiple calls into a single drain', async () => {
    vi.useFakeTimers()
    const { ConnectivityManager } = await import('../connectivity-manager.js')
    const cm = new ConnectivityManager({ isOnline: () => true })
    await queue.enqueue({ resourceType: 'Observation', resourceId: 'o1', action: 'create', payload: '{}', hlcTimestamp: '000001700000000:00000:node-1' })
    syncFn.mockResolvedValue({ success: true })

    const worker = new DrainWorker({ queue, syncFn, connectivity: cm, enqueueDebounceMs: 300 })
    const drainSpy = vi.spyOn(worker, 'drain')

    worker.requestDrain()
    worker.requestDrain()
    worker.requestDrain()
    expect(drainSpy).not.toHaveBeenCalled() // debounced

    await vi.advanceTimersByTimeAsync(300)
    expect(drainSpy).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('requestDrain({ immediate: true }) drains without waiting for the debounce', async () => {
    vi.useFakeTimers()
    const { ConnectivityManager } = await import('../connectivity-manager.js')
    const cm = new ConnectivityManager({ isOnline: () => true })
    syncFn.mockResolvedValue({ success: true })
    const worker = new DrainWorker({ queue, syncFn, connectivity: cm, enqueueDebounceMs: 300 })
    const drainSpy = vi.spyOn(worker, 'drain')

    worker.requestDrain({ immediate: true })
    await Promise.resolve()
    expect(drainSpy).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('requestDrain is a no-op when connectivity is offline', async () => {
    vi.useFakeTimers()
    const { ConnectivityManager } = await import('../connectivity-manager.js')
    const cm = new ConnectivityManager({ isOnline: () => false })
    const worker = new DrainWorker({ queue, syncFn, connectivity: cm, enqueueDebounceMs: 300 })
    const drainSpy = vi.spyOn(worker, 'drain')

    worker.requestDrain()
    worker.requestDrain({ immediate: true })
    await vi.advanceTimersByTimeAsync(1000)
    expect(drainSpy).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
```

- [ ] **Step 3: Run to verify they fail**

Run: `pnpm -F @ultranos/sync-engine exec vitest run src/__tests__/queue.test.ts src/__tests__/drain-worker.test.ts`
Expected: FAIL — `options` arg ignored / `requestDrain` not a function.

- [ ] **Step 4: Implement the queue hook**

In `packages/sync-engine/src/queue.ts`, change the factory signature and fire the hook. Replace line 55:

```ts
export function createSyncQueue(storage: SyncQueueStorage, maxRetries = DEFAULT_MAX_RETRIES) {
```
with:
```ts
export interface CreateSyncQueueOptions {
  /** Fired after every successful enqueue (new or dedup-replace). Never throws upstream. */
  onEnqueued?: (input: EnqueueInput) => void
}

export function createSyncQueue(
  storage: SyncQueueStorage,
  maxRetries = DEFAULT_MAX_RETRIES,
  options: CreateSyncQueueOptions = {},
) {
```

Inside `enqueue`, fire `onEnqueued` on both return paths. In the dedup branch, after `await storage.put({...})` and before `return`, add:

```ts
        try { options.onEnqueued?.(input) } catch { /* hook must never break enqueue */ }
        return
```
and at the end of the new-entry branch, after `await storage.put(entry)`, add:

```ts
      try { options.onEnqueued?.(input) } catch { /* hook must never break enqueue */ }
```

- [ ] **Step 5: Implement requestDrain in the worker**

In `packages/sync-engine/src/drain-worker.ts`:

Add the import:
```ts
import { getConflictTier } from './conflict-tiers.js'
```

Add to `DrainWorkerConfig`:
```ts
  /** Debounce window (ms) for event-driven drains via requestDrain(). Default 300. */
  enqueueDebounceMs?: number
```

Add a private field near `intervalId`:
```ts
  private debounceId: ReturnType<typeof setTimeout> | null = null
```

Add the public method (after `stop()`):
```ts
  /**
   * Request a drain in response to a local write. Debounced to batch bursts.
   * `immediate` bypasses the debounce (used for Tier-1 safety-critical writes).
   * No-op while connectivity is offline — the queue is durable and the online
   * event / adaptive poll will drain later.
   */
  requestDrain(opts?: { immediate?: boolean }): void {
    if (this.config.connectivity?.getState() === 'offline') return
    if (opts?.immediate) {
      if (this.debounceId !== null) { clearTimeout(this.debounceId); this.debounceId = null }
      void this.drain()
      return
    }
    if (this.debounceId !== null) clearTimeout(this.debounceId)
    const wait = this.config.enqueueDebounceMs ?? 300
    this.debounceId = setTimeout(() => {
      this.debounceId = null
      void this.drain()
    }, wait)
  }
```

Clear the debounce timer in `stop()` (add inside the existing `stop()` body):
```ts
    if (this.debounceId !== null) { clearTimeout(this.debounceId); this.debounceId = null }
```

> Note on Tier-1 immediacy: the *caller* decides `immediate` by mapping resource type → tier. Export a tiny helper so app wiring stays DRY — add to `drain-worker.ts` and export via index in Task 6's build step:
> ```ts
> export function isImmediateSyncTier(resourceType: string): boolean {
>   const tier = getConflictTier(resourceType)
>   return tier === 'TIER_1' || tier === 'CONSENT'
> }
> ```
> Confirm `'TIER_1'` and `'CONSENT'` are the literals returned by `getConflictTier` by opening `conflict-tiers.ts` before relying on them; adjust the comparison to the actual union values if they differ.

- [ ] **Step 6: Run to verify they pass**

Run: `pnpm -F @ultranos/sync-engine exec vitest run src/__tests__/queue.test.ts src/__tests__/drain-worker.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck + commit** (commit if authorized)

```bash
pnpm -F @ultranos/sync-engine typecheck
git add packages/sync-engine/src/queue.ts packages/sync-engine/src/drain-worker.ts packages/sync-engine/src/__tests__/queue.test.ts packages/sync-engine/src/__tests__/drain-worker.test.ts
git commit -m "feat(sync-engine): event-driven debounced requestDrain + onEnqueued hook"
```

---

### Task 4: Adaptive cadence (self-rescheduling interval)

**Files:**
- Modify: `packages/sync-engine/src/drain-worker.ts`
- Test: `packages/sync-engine/src/__tests__/drain-worker.test.ts`

**Interfaces:**
- Consumes: `ConnectivityManager.getState()`.
- Produces: `DrainWorkerConfig.intervals?: { healthyMs?: number; degradedMs?: number }` (defaults 15000 / 60000) and `DrainWorkerConfig.jitterRatio?: number` (default 0.2). The fixed `setInterval` in `start()` is replaced with a self-rescheduling `setTimeout` loop that reads connectivity state to choose its delay; when state is `offline` it pauses (no reschedule) and relies on the `online` event to resume. `pollIntervalMs` remains the fallback delay when no `connectivity`/`intervals` are provided (full backward compatibility).

- [ ] **Step 1: Write the failing tests**

Add to `packages/sync-engine/src/__tests__/drain-worker.test.ts`:

```ts
  it('polls on the healthy interval when connectivity is healthy', async () => {
    vi.useFakeTimers()
    const { ConnectivityManager } = await import('../connectivity-manager.js')
    const cm = new ConnectivityManager({ isOnline: () => true })
    syncFn.mockResolvedValue({ success: true })
    const worker = new DrainWorker({
      queue, syncFn, connectivity: cm,
      intervals: { healthyMs: 15000, degradedMs: 60000 },
      jitterRatio: 0, // deterministic
    })
    const drainSpy = vi.spyOn(worker, 'drain')
    worker.start()
    drainSpy.mockClear() // ignore the immediate start() drain

    await vi.advanceTimersByTimeAsync(15000)
    expect(drainSpy).toHaveBeenCalledTimes(1)
    worker.stop()
    vi.useRealTimers()
  })

  it('backs off to the degraded interval when connectivity is degraded', async () => {
    vi.useFakeTimers()
    const { ConnectivityManager } = await import('../connectivity-manager.js')
    const cm = new ConnectivityManager({ isOnline: () => true, failureAlpha: 1, degradedFailureRate: 0.3 })
    cm.recordResult({ ok: false }) // force degraded
    expect(cm.getState()).toBe('degraded')
    syncFn.mockResolvedValue({ success: true })
    const worker = new DrainWorker({
      queue, syncFn, connectivity: cm,
      intervals: { healthyMs: 15000, degradedMs: 60000 }, jitterRatio: 0,
    })
    const drainSpy = vi.spyOn(worker, 'drain')
    worker.start()
    drainSpy.mockClear()

    await vi.advanceTimersByTimeAsync(15000)
    expect(drainSpy).not.toHaveBeenCalled() // not yet — degraded waits 60s
    await vi.advanceTimersByTimeAsync(45000)
    expect(drainSpy).toHaveBeenCalledTimes(1)
    worker.stop()
    vi.useRealTimers()
  })

  it('does not reschedule a poll while offline', async () => {
    vi.useFakeTimers()
    const { ConnectivityManager } = await import('../connectivity-manager.js')
    const cm = new ConnectivityManager({ isOnline: () => false })
    const worker = new DrainWorker({ queue, syncFn, connectivity: cm, intervals: { healthyMs: 15000, degradedMs: 60000 }, jitterRatio: 0 })
    const drainSpy = vi.spyOn(worker, 'drain')
    worker.start()
    await vi.advanceTimersByTimeAsync(120000)
    expect(drainSpy).not.toHaveBeenCalled() // offline: start() drain gated + no reschedule
    worker.stop()
    vi.useRealTimers()
  })
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm -F @ultranos/sync-engine exec vitest run src/__tests__/drain-worker.test.ts -t "interval|offline|degraded"`
Expected: FAIL — worker still uses fixed `setInterval`; `intervals`/`jitterRatio` ignored.

- [ ] **Step 3: Implement adaptive rescheduling**

In `packages/sync-engine/src/drain-worker.ts`:

Add to `DrainWorkerConfig`:
```ts
  /** Adaptive poll delays by connectivity state. Defaults: healthy 15000, degraded 60000. */
  intervals?: { healthyMs?: number; degradedMs?: number }
  /** Random jitter fraction applied to each delay (0..1). Default 0.2. Set 0 in tests. */
  jitterRatio?: number
```

Replace the `intervalId` field type usage: keep the field but it now holds a `setTimeout` handle. Rename for clarity is optional; if kept, ensure `stop()` clears it via `clearTimeout`.

Replace the body of `start()` (lines 67–81) with:
```ts
  start(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline)
    }
    this.scheduleNext()
    // Initial drain if we believe we're online.
    if (this.isOnline()) {
      void this.drain()
    }
  }
```

Add private helpers:
```ts
  private isOnline(): boolean {
    const state = this.config.connectivity?.getState()
    if (state) return state !== 'offline'
    return typeof navigator === 'undefined' || navigator.onLine
  }

  private nextDelayMs(): number {
    const state = this.config.connectivity?.getState()
    const healthy = this.config.intervals?.healthyMs ?? this.config.pollIntervalMs
    const degraded = this.config.intervals?.degradedMs ?? this.config.pollIntervalMs
    const base = state === 'degraded' ? degraded : healthy
    const jitter = this.config.jitterRatio ?? 0.2
    if (jitter <= 0) return base
    // ±jitter fraction, deterministic-safe (Math.random is fine at runtime; tests pass jitterRatio: 0)
    const delta = base * jitter
    return Math.round(base - delta + Math.random() * 2 * delta)
  }

  private scheduleNext(): void {
    if (this.intervalId !== null) { clearTimeout(this.intervalId); this.intervalId = null }
    // While offline, pause polling entirely (battery/data). The 'online' event resumes.
    if (!this.isOnline()) return
    this.intervalId = setTimeout(() => {
      this.intervalId = null
      void this.drain().finally(() => this.scheduleNext())
    }, this.nextDelayMs())
  }
```

Update `handleOnline` to resume scheduling:
```ts
  private handleOnline = (): void => {
    this.config.connectivity?.setOnline(true)
    void this.drain()
    this.scheduleNext()
  }
```

Update the field declaration (line 56) to reflect setTimeout:
```ts
  private intervalId: ReturnType<typeof setTimeout> | null = null
```

Update `stop()` to `clearTimeout(this.intervalId)` instead of `clearInterval` (change the call; the null-guard stays).

> Note: `Math.random()` at runtime is acceptable here (jitter is cosmetic anti-stampede). Tests set `jitterRatio: 0` for determinism, so no reliance on randomness in tests.

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm -F @ultranos/sync-engine exec vitest run src/__tests__/drain-worker.test.ts`
Expected: PASS (all existing + new; the original "30s polling" test, if any asserts `setInterval`, must be updated to the new `setTimeout` model — open and adjust if it fails).

- [ ] **Step 5: Typecheck + commit** (commit if authorized)

```bash
pnpm -F @ultranos/sync-engine typecheck
git add packages/sync-engine/src/drain-worker.ts packages/sync-engine/src/__tests__/drain-worker.test.ts
git commit -m "feat(sync-engine): adaptive connectivity-driven poll cadence"
```

---

### Task 5: Batched drain (opt-in syncBatchFn)

**Files:**
- Modify: `packages/sync-engine/src/drain-worker.ts`
- Test: `packages/sync-engine/src/__tests__/drain-worker.test.ts`

**Interfaces:**
- Consumes: existing `SyncResult`, `SyncQueueEntry`, the entry pre-checks (encryption/key/decrypt) already in `drain()`.
- Produces:
  - `DrainWorkerConfig.syncBatchFn?: (entries: SyncQueueEntry[]) => Promise<Map<string, SyncResult>>` — keyed by `resourceId`. When present, `drain()` groups ready+decryptable entries into batches of `batchSize` and calls it once per batch. When absent, the per-entry `syncFn` path is used (today's behavior).
  - `DrainWorkerConfig.batchSize?: number` (default 50 — matches Hub `sync.push` `.max(50)`).
  - Private refactor: `handleResult(entry, decryptedPayload, result)` centralizes the markSynced/conflict/markFailed logic shared by both paths.

- [ ] **Step 1: Write the failing tests**

Add to `packages/sync-engine/src/__tests__/drain-worker.test.ts`:

```ts
  it('sends pending entries via syncBatchFn in one call and marks them synced', async () => {
    for (const id of ['a', 'b', 'c']) {
      await queue.enqueue({ resourceType: 'Observation', resourceId: id, action: 'create', payload: '{}', hlcTimestamp: `00000170000000${id.charCodeAt(0)}:00000:node-1` })
    }
    const syncBatchFn = vi.fn(async (entries: SyncQueueEntry[]) => {
      const m = new Map<string, SyncResult>()
      for (const e of entries) m.set(e.resourceId, { success: true })
      return m
    })
    const worker = new DrainWorker({ queue, syncFn, syncBatchFn, batchSize: 50 })
    await worker.drain()

    expect(syncBatchFn).toHaveBeenCalledOnce()
    expect(syncBatchFn.mock.calls[0][0]).toHaveLength(3)
    expect(await queue.getCounts()).toEqual({ pendingCount: 0, failedCount: 0 })
    expect(syncFn).not.toHaveBeenCalled() // batch path preferred
  })

  it('respects batchSize by chunking', async () => {
    for (let i = 0; i < 5; i++) {
      await queue.enqueue({ resourceType: 'Observation', resourceId: `r${i}`, action: 'create', payload: '{}', hlcTimestamp: `00000170000000${i}:00000:node-1` })
    }
    const syncBatchFn = vi.fn(async (entries: SyncQueueEntry[]) => {
      const m = new Map<string, SyncResult>()
      for (const e of entries) m.set(e.resourceId, { success: true })
      return m
    })
    const worker = new DrainWorker({ queue, syncFn, syncBatchFn, batchSize: 2 })
    await worker.drain()
    expect(syncBatchFn).toHaveBeenCalledTimes(3) // 2 + 2 + 1
  })

  it('marks an entry failed when the batch result omits it', async () => {
    await queue.enqueue({ resourceType: 'Observation', resourceId: 'x', action: 'create', payload: '{}', hlcTimestamp: '000001700000000:00000:node-1' })
    const syncBatchFn = vi.fn(async () => new Map<string, SyncResult>()) // empty — no result for 'x'
    const worker = new DrainWorker({ queue, syncFn, syncBatchFn })
    await worker.drain()
    expect((await queue.getCounts()).pendingCount).toBe(1) // retried (retryCount incremented, in backoff)
  })
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm -F @ultranos/sync-engine exec vitest run src/__tests__/drain-worker.test.ts -t "batch"`
Expected: FAIL — `syncBatchFn` ignored.

- [ ] **Step 3: Refactor post-processing into handleResult**

In `packages/sync-engine/src/drain-worker.ts`, extract the success/conflict/failure handling (currently lines 135–170) into a private method. Add:

```ts
  private async handleResult(
    entry: SyncQueueEntry,
    decryptedPayload: string,
    result: SyncResult,
  ): Promise<void> {
    if (result.success) {
      await this.config.queue.markSynced(entry.id)
      this.config.onAudit?.(entry, 'success')
      return
    }
    if (result.conflict?.remoteVersion) {
      this.config.onAudit?.(entry, 'conflict')
      if (this.config.onConflict) {
        const { resolveConflict } = await import('./conflict-resolver.js')
        let localData: unknown
        try {
          localData = JSON.parse(decryptedPayload)
        } catch {
          await this.config.queue.markFailed(entry.id, 'Payload parse error — cannot resolve conflict')
          this.config.onAudit?.(entry, 'failure')
          return
        }
        const localRecord: SyncRecord = {
          id: entry.resourceId,
          data: localData as Record<string, unknown>,
          hlcTimestamp: (await import('./hlc.js')).deserializeHlc(entry.hlcTimestamp),
          version: entry.hlcTimestamp,
        }
        const resolution = resolveConflict(localRecord, result.conflict.remoteVersion, entry.resourceType)
        try {
          await this.config.onConflict(entry, resolution)
          await this.config.queue.markSynced(entry.id)
        } catch {
          await this.config.queue.markFailed(entry.id, 'Conflict handler failed')
          this.config.onAudit?.(entry, 'failure')
        }
      } else {
        await this.config.queue.markSynced(entry.id)
      }
      return
    }
    await this.config.queue.markFailed(entry.id, result.error ?? 'Sync failed')
    this.config.onAudit?.(entry, 'failure')
  }
```

Then replace the inline success/conflict/failure block in the per-entry loop with a call to `await this.handleResult(entry, decryptedPayload, result)` (keeping the surrounding `try/catch` that marks failure on throw, and the connectivity reporting from Task 2).

- [ ] **Step 4: Add the batch path**

Add config fields:
```ts
  /** Optional batched push, keyed by resourceId. Preferred over syncFn when present. */
  syncBatchFn?: (entries: SyncQueueEntry[]) => Promise<Map<string, SyncResult>>
  /** Max operations per batch. Default 50 (Hub sync.push accepts up to 50). */
  batchSize?: number
```

In `drain()`, after building the `pending` list, branch: if `this.config.syncBatchFn` is set, run the batch path; else run the existing per-entry loop. The batch path reuses the SAME per-entry pre-checks (encrypted+key-unavailable → markAwaitingKey+skip; encrypted+no decryptFn → markSyncing+markFailed; otherwise markSyncing + decrypt-in-memory). Concretely, add a private method:

```ts
  private async drainBatched(pending: SyncQueueEntry[]): Promise<void> {
    const batchFn = this.config.syncBatchFn!
    const size = this.config.batchSize ?? 50

    // Build the list of sync-ready entries with decrypted payloads, applying the
    // same guards as the single path.
    const prepared: Array<{ entry: SyncQueueEntry; decrypted: string }> = []
    for (const entry of pending) {
      const isEncrypted = entry.payload.startsWith(ENCRYPTED_PAYLOAD_PREFIX)
      if (isEncrypted && this.config.isKeyAvailable && !this.config.isKeyAvailable()) {
        await this.config.queue.markAwaitingKey(entry.id)
        continue
      }
      if (isEncrypted && !this.config.decryptFn) {
        await this.config.queue.markSyncing(entry.id)
        await this.config.queue.markFailed(entry.id, 'No decryptFn configured for encrypted payload')
        this.config.onAudit?.(entry, 'failure')
        continue
      }
      await this.config.queue.markSyncing(entry.id)
      let decrypted = entry.payload
      if (isEncrypted && this.config.decryptFn) {
        try {
          decrypted = await this.config.decryptFn(entry.payload)
        } catch {
          await this.config.queue.markFailed(entry.id, 'Decrypt error')
          this.config.onAudit?.(entry, 'failure')
          continue
        }
      }
      const e = decrypted !== entry.payload ? { ...entry, payload: decrypted } : entry
      prepared.push({ entry: e, decrypted })
    }

    for (let i = 0; i < prepared.length; i += size) {
      const chunk = prepared.slice(i, i + size)
      const startedAt = Date.now()
      let results: Map<string, SyncResult>
      try {
        results = await batchFn(chunk.map((c) => c.entry))
        this.config.connectivity?.recordResult({ ok: true, latencyMs: Date.now() - startedAt })
      } catch {
        this.config.connectivity?.recordResult({ ok: false, latencyMs: Date.now() - startedAt })
        for (const { entry } of chunk) {
          await this.config.queue.markFailed(entry.id, 'Batch sync error')
          this.config.onAudit?.(entry, 'failure')
        }
        continue
      }
      for (const { entry, decrypted } of chunk) {
        const result = results.get(entry.resourceId) ?? { success: false, error: 'Missing batch result' }
        await this.handleResult(entry, decrypted, result)
      }
    }
  }
```

And in `drain()` replace the `for (const entry of pending) { ... }` loop with:
```ts
      if (this.config.syncBatchFn) {
        await this.drainBatched(pending)
      } else {
        for (const entry of pending) {
          // ...existing per-entry loop, now ending in handleResult + connectivity reporting...
        }
      }
```

- [ ] **Step 5: Run to verify they pass**

Run: `pnpm -F @ultranos/sync-engine exec vitest run src/__tests__/drain-worker.test.ts src/__tests__/drain-worker-encryption.test.ts`
Expected: PASS — batch cases green AND the existing encryption tests still pass (they use the single-path; batch path mirrors the same guards).

- [ ] **Step 6: Full package test + typecheck + commit** (commit if authorized)

```bash
pnpm -F @ultranos/sync-engine test
pnpm -F @ultranos/sync-engine typecheck
git add packages/sync-engine/src/drain-worker.ts packages/sync-engine/src/__tests__/drain-worker.test.ts
git commit -m "feat(sync-engine): opt-in batched drain via syncBatchFn"
```

---

### Task 6: OPD-Lite integration + build

**Files:**
- Modify: `packages/sync-engine/src/index.ts` (export `isImmediateSyncTier`)
- Modify: `apps/opd-lite/src/lib/sync-queue.ts` (pass `onEnqueued` bridge)
- Modify: `apps/opd-lite/src/lib/sync-worker.ts` (own the manager, wire requestDrain, add syncBatchFn, adaptive intervals)

**Interfaces:**
- Consumes: everything from Tasks 1–5.
- Produces: OPD-Lite drain worker that (a) drains within `enqueueDebounceMs` of any write, immediately for Tier-1; (b) polls adaptively (healthy ~15s, degraded ~60s, offline paused); (c) pushes in batches of up to 50.

> **First, open these files and confirm current shape before editing:** `apps/opd-lite/src/lib/sync-queue.ts` (how `createSyncQueue` is called and what it exports), and re-read `apps/opd-lite/src/lib/sync-worker.ts` (already read in planning — the single-op `syncFn` at lines 47–117 is the batch template).

- [ ] **Step 1: Export the tier helper**

In `packages/sync-engine/src/index.ts`, add to the drain-worker export line (line 40) / its neighbors:
```ts
export { DrainWorker, isImmediateSyncTier } from './drain-worker.js'
```

- [ ] **Step 2: Build the package so OPD-Lite resolves the new API**

Run: `pnpm -F @ultranos/sync-engine build`
Expected: clean `tsc` build; `dist/` updated. (Apps import from `dist/`.)

- [ ] **Step 3: Bridge onEnqueued in the OPD queue**

In `apps/opd-lite/src/lib/sync-queue.ts`, add a settable bridge and pass it to `createSyncQueue` (the queue is created at module load, before the worker exists, so we use a late-bound ref):

```ts
// Late-bound so sync-worker can attach requestDrain after the worker is constructed.
let onEnqueuedBridge: ((input: { resourceType: string; resourceId: string }) => void) | null = null
export function setOnEnqueuedBridge(fn: typeof onEnqueuedBridge): void {
  onEnqueuedBridge = fn
}
```
Then change the existing `createSyncQueue(storage, ...)` call to pass the third options arg:
```ts
export const syncQueue = createSyncQueue(storage, /* keep existing maxRetries or undefined */ undefined, {
  onEnqueued: (input) => { try { onEnqueuedBridge?.(input) } catch { /* never block enqueue */ } },
})
```
> Match the existing `storage`/`maxRetries` arguments actually used in the file — do not invent a `storage` name; reuse what's there.

- [ ] **Step 4: Wire the worker (manager + requestDrain + batch + intervals)**

In `apps/opd-lite/src/lib/sync-worker.ts`:

Add imports:
```ts
import { ConnectivityManager, isImmediateSyncTier } from '@ultranos/sync-engine'
import { setOnEnqueuedBridge } from './sync-queue'
```

Create a module-level manager:
```ts
const connectivity = new ConnectivityManager()
export function getConnectivity(): ConnectivityManager { return connectivity }
```

In `startSyncWorker`, pass `connectivity`, `intervals`, and a `syncBatchFn`, and attach the enqueue bridge after constructing the worker. Add to the `new DrainWorker({...})` config:
```ts
    connectivity,
    intervals: { healthyMs: 15_000, degradedMs: 60_000 },
    enqueueDebounceMs: 300,
    syncBatchFn: async (entries) => {
      const token = config.getAuthToken()
      const res = await meteredFetch(`${config.hubBaseUrl}/api/trpc/sync.push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          json: {
            operations: entries.map((entry) => ({
              resourceType: entry.resourceType,
              resourceId: entry.resourceId,
              action: entry.action,
              payload: entry.payload,
              hlcTimestamp: entry.hlcTimestamp,
            })),
          },
        }),
      })
      const out = new Map<string, SyncResult>()
      if (!res.ok) {
        for (const e of entries) out.set(e.resourceId, { success: false, error: `HTTP ${res.status}` })
        return out
      }
      const data = await res.json() as {
        result: { data: { json: { results: Array<{
          resourceId: string; success: boolean
          conflict?: { remoteVersion: SyncRecord }; error?: string; canonicalId?: string
        }> } } }
      }
      const results = data.result?.data?.json?.results ?? []
      const byId = new Map(results.map((r) => [r.resourceId, r]))
      for (const entry of entries) {
        const r = byId.get(entry.resourceId)
        if (!r) { out.set(entry.resourceId, { success: false, error: 'Empty response from Hub' }); continue }
        if (r.conflict) { out.set(entry.resourceId, { success: false, conflict: r.conflict }); continue }
        // Preserve the DUPLICATE_OPEN_ENCOUNTER reconcile backstop from the single path.
        if (!r.success && r.error === 'DUPLICATE_OPEN_ENCOUNTER' && entry.resourceType === 'Encounter' && r.canonicalId) {
          try {
            const { reconcileDuplicateEncounter } = await import('./reconcile-duplicate-encounter')
            await reconcileDuplicateEncounter(entry.resourceId, r.canonicalId)
            out.set(entry.resourceId, { success: true })
          } catch {
            out.set(entry.resourceId, { success: false, error: 'DUPLICATE_OPEN_ENCOUNTER_RECONCILE_FAILED' })
          }
          continue
        }
        out.set(entry.resourceId, r.success ? { success: true } : { success: false, error: r.error ?? 'Unknown error' })
      }
      return out
    },
```
Keep the existing single-op `syncFn` in place (harmless fallback; the worker prefers `syncBatchFn`).

After `worker.start()`, attach the bridge:
```ts
  setOnEnqueuedBridge((input) => worker!.requestDrain({ immediate: isImmediateSyncTier(input.resourceType) }))
```
And in `stopSyncWorker`, detach: `setOnEnqueuedBridge(null)`.

Bridge the browser online/offline events into the manager (so state flips promptly). In `startSyncWorker`, add:
```ts
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => connectivity.setOnline(true))
    window.addEventListener('offline', () => connectivity.setOnline(false))
  }
```
> Ensure `SyncRecord` and `SyncResult` are imported in this file (they already are — line 9). Add `SyncResult` to the import if the batch code needs it and it's missing.

- [ ] **Step 5: Typecheck OPD-Lite**

Run: `pnpm -F opd-lite typecheck`
Expected: no errors.

- [ ] **Step 6: Manual verification (real app)**

Follow the `run` skill / `pnpm -F opd-lite dev`. With DevTools open:
1. Create/edit a clinical resource → confirm a `sync.push` fires within ~300ms (Network tab), not on the old 30s tick.
2. Create an allergy (Tier-1) → confirm `sync.push` fires near-immediately.
3. Make several edits quickly → confirm they coalesce into batched `operations[]` arrays (inspect request body count > 1 where applicable).
4. Toggle DevTools "Offline" → confirm no repeated failed pushes fire (polling paused); toggle back online → confirm an immediate drain.
5. Confirm no PHI appears in console/network logs beyond the opaque `resourceId` already used.

- [ ] **Step 7: Commit** (if authorized)

```bash
git add packages/sync-engine/src/index.ts apps/opd-lite/src/lib/sync-queue.ts apps/opd-lite/src/lib/sync-worker.ts
git commit -m "feat(opd-lite): adaptive event-driven batched sync wiring"
```

---

## Self-Review

**Spec coverage (Phase 1 section):**
- §1.1 Connectivity Manager (passive, no probes, 3 states, subscribe) → Task 1 ✅ (passive guard test included)
- §1.2 Event-driven push (debounce, Tier-1 near-zero, 30s safety net retained) → Task 3 + Task 4 (safety-net poll retained as adaptive interval) ✅
- §1.3 Batched drain (≤50/request) → Task 5 ✅
- §1.4 Passive adaptive cadence (healthy/degraded/offline, jitter, offline pause) → Task 4 ✅
- Backward compatibility → every new field optional; asserted implicitly by keeping existing tests green (Tasks 4–5 steps re-run the full suite) ✅
- OPD-Lite integration → Task 6 ✅
- Out of scope (other 3 apps, Phase 2 Realtime, patient-mobile realtime) → correctly excluded; noted as follow-on plans ✅

**Placeholder scan:** No "TBD"/"add error handling"/"similar to Task N". Two explicit *verify-before-relying* notes (getConflictTier literals in Task 3; exact `createSyncQueue` args in Task 6) are ground-truth confirmations, not deferred work — code is written for both.

**Type consistency:** `ConnectivityState`/`ConnectivitySample`/`ConnectivityManager` names match across Tasks 1–6. `syncBatchFn` returns `Map<string, SyncResult>` keyed by `resourceId` in both the worker (Task 5) and OPD wiring (Task 6). `SyncResult`/`SyncRecord` reused from existing exports. `requestDrain({ immediate })` signature identical in Task 3 (definition) and Task 6 (call). `onEnqueued`/`CreateSyncQueueOptions` consistent between queue (Task 3) and OPD bridge (Task 6).

**Known follow-ups (not gaps in this plan):** the existing "30s polling" drain-worker test may assert `setInterval` and need updating to the `setTimeout` model (called out in Task 4 Step 4); Phase 1 rollout to Pharmacy/Lab/Patient-mobile and all of Phase 2 are separate plans.
