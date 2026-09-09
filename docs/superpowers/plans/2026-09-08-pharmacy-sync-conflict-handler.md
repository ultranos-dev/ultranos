# Pharmacy-Lite Sync Conflict Handler (Story 26.4, light scope) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make pharmacy-lite handle a Hub sync conflict *principledly* (route it through the existing tiered conflict-resolver instead of silently swallowing it as success) and make conflicts *observable* (a count + a dashboard section) — scoped to the Tier-2/Tier-3 data pharmacy actually syncs. Pharmacy authors NO Tier-1 (allergies/prescriptions/med-statements/conditions) data, so NO Tier-1 append-only review UI / prescription-block is built.

**Architecture:** The Hub's `sync.push` signals a conflict as `200 { results: [{ success:false, conflict:{ remoteVersion } }] }` (never HTTP 409). Today `drain-sync-fn.ts` swallows that as `{ success:true }` (silent LWW), so the DrainWorker's conflict path never runs. This plan (1) returns the conflict from `drain-sync-fn` so the DrainWorker invokes `resolveConflict` + `onConflict`; (2) wires a small, extracted `recordSyncConflict` observer that flags the entry + updates the `conflictCount` store slot when the resolution is a genuine concurrent conflict; (3) surfaces flagged conflicts in the existing `SyncQueueDashboard`. The entry is still `markSynced` after `onConflict` (the obsolete local push is dropped, not retried) — correct for pharmacy's non-Tier-1 data where a conflict always means the Hub's version is newer-or-concurrent.

**Tech Stack:** Next.js 15 PWA, Dexie, Zustand, `@ultranos/sync-engine`, Vitest.

**Spec:** No formal "Story 26.4" card exists — the label is a deferral marker in `drain-sync-fn.ts`. Authority is PRD §17.1 (`docs/ultranos_master_prd_v3.md:504-511`): Tier-2 timestamp-wins + notify, Tier-3 LWW no-review. This plan implements the pharmacy-appropriate subset (observability, no Tier-1 review).

## Global Constraints

- **NO PHI at rest.** Do NOT persist the remote version's `data` (it may contain Patient demographics / invoice medication names) into IndexedDB as a plaintext field. Store only a `conflictFlag: boolean` on the entry and rely on the opaque `resourceType`/`resourceId` (a UUID) for display. (This is the deliberate divergence from OPD-Lite, which stores `conflictData`.) No PHI in logs/audit metadata either — the existing `onAudit(entry, 'conflict')` already emits only `{ outcome, resourceType }` + opaque `resourceId`.
- **No retry storm.** A conflict must NOT put the entry back to `pending` for infinite retries. The DrainWorker `markSynced`s the entry after `onConflict` — keep that; do not change it. The local push is obsolete once the Hub reports a conflict.
- **Only flag genuine concurrent conflicts.** Set `conflictFlag`/increment the count ONLY when `resolution.conflictFlag === true` (the resolver marks concurrent-within-60s-window). A routine stale overwrite (resolver `conflictFlag:false`) is normal LWW — accept it silently (still `markSynced`), do not surface it as a "conflict" (avoids badge noise).
- **`onConflict` must never throw** — the DrainWorker `markFailed`s the entry if it does. Wrap the observer body so it is best-effort.
- **No Dexie version bump** — `conflictFlag?` is a new OPTIONAL non-indexed field on `SyncQueueEntry`; Dexie stores full objects, so no `version().stores()` change and no migration.
- **Layout/token/RTL/i18n standards** for the dashboard addition; new strings via the `sync` i18n namespace in all four `messages/*.json`.
- **NO-COMMIT mode.**

---

### Task 1: Route conflicts through the resolver + flag them (engine wiring)

**Files:**
- Modify: `apps/pharmacy-lite/src/lib/drain-sync-fn.ts` (return the conflict instead of swallowing it)
- Modify: `apps/pharmacy-lite/src/lib/db.ts` (`SyncQueueEntry` += `conflictFlag?: boolean`)
- Create: `apps/pharmacy-lite/src/lib/sync-conflict-observer.ts` (`recordSyncConflict`)
- Modify: `apps/pharmacy-lite/src/lib/sync-drain-init.ts` (wire `onConflict: recordSyncConflict`)
- Modify: `apps/pharmacy-lite/src/__tests__/drain-sync-fn.test.ts` (update the conflict-case expectation)
- Test: `apps/pharmacy-lite/src/__tests__/sync-conflict-observer.test.ts`

**Interfaces:**
- Produces: `recordSyncConflict(entry: SyncQueueEntry, resolution: ConflictResolution): Promise<void>` (from `@ultranos/sync-engine` types). Sets `conflictFlag` + updates the store count when `resolution.conflictFlag`.
- `SyncQueueEntry` (pharmacy `db.ts`) gains `conflictFlag?: boolean`.
- Consumes: `db.syncQueue`, `useSyncStore.setConflictCount`, sync-engine `ConflictResolution`/`SyncQueueEntry` types.

- [ ] **Step 1: Add `conflictFlag?` to the entry type** — in `apps/pharmacy-lite/src/lib/db.ts`, add to the `SyncQueueEntry` interface (after `lastAttemptAt?`):

```typescript
  lastAttemptAt?: string
  /** Set true when a Hub sync conflict for this entry was auto-resolved
   *  (Hub version kept). Observability only — no remote PHI is stored. */
  conflictFlag?: boolean
```

- [ ] **Step 2: Write the failing observer test** — `apps/pharmacy-lite/src/__tests__/sync-conflict-observer.test.ts`. Use fake-indexeddb (mirror `catalog-item-service.test.ts` setup: `beforeEach(() => db.syncQueue.clear())`). Build a minimal `ConflictResolution` object and a queued entry, then assert:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/lib/db'
import { recordSyncConflict } from '@/lib/sync-conflict-observer'
import { useSyncStore } from '@/stores/sync-store'
import type { ConflictResolution } from '@ultranos/sync-engine'

function resolution(over: Partial<ConflictResolution>): ConflictResolution {
  return { strategy: 'LWW', winner: 'remote', kept: [], conflictFlag: true, blocksPrescription: false, ...over }
}

async function seedEntry(id: string) {
  await db.syncQueue.put({
    id, resourceType: 'Invoice', resourceId: 'inv-1', action: 'create',
    payload: 'enc:v1:x', status: 'in-flight', hlcTimestamp: '000:000:n1',
    createdAt: '2026-01-01T00:00:00Z', retryCount: 0,
  })
}

beforeEach(async () => {
  await db.syncQueue.clear()
  useSyncStore.setState({ conflictCount: 0 })
})

describe('recordSyncConflict', () => {
  it('flags the entry and sets the store count for a genuine concurrent conflict', async () => {
    await seedEntry('e1')
    const entry = (await db.syncQueue.get('e1'))!
    await recordSyncConflict(entry, resolution({ conflictFlag: true }))
    expect((await db.syncQueue.get('e1'))!.conflictFlag).toBe(true)
    expect(useSyncStore.getState().conflictCount).toBe(1)
  })

  it('does NOT flag a routine (non-concurrent) LWW overwrite', async () => {
    await seedEntry('e2')
    const entry = (await db.syncQueue.get('e2'))!
    await recordSyncConflict(entry, resolution({ conflictFlag: false }))
    expect((await db.syncQueue.get('e2'))!.conflictFlag).toBeFalsy()
    expect(useSyncStore.getState().conflictCount).toBe(0)
  })

  it('never throws (best-effort) even if the entry is gone', async () => {
    const ghost = { id: 'missing', resourceType: 'Invoice', resourceId: 'x', action: 'create', payload: '', status: 'in-flight' as const, hlcTimestamp: 'h', createdAt: 'c', retryCount: 0 }
    await expect(recordSyncConflict(ghost as never, resolution({ conflictFlag: true }))).resolves.toBeUndefined()
  })

  it('does NOT persist any remote PHI payload (only the boolean flag)', async () => {
    await seedEntry('e3')
    const entry = (await db.syncQueue.get('e3'))!
    await recordSyncConflict(entry, resolution({ conflictFlag: true, kept: [{ id: 'remote', data: { secret: 'PHI' }, hlcTimestamp: { wallMs: 1, counter: 0, nodeId: 'n' }, version: 'v' }] }))
    const stored = await db.syncQueue.get('e3')
    expect(JSON.stringify(stored)).not.toContain('PHI') // no conflictData / remote payload persisted
  })
})
```

- [ ] **Step 3: Run to verify FAIL** — `pnpm -F pharmacy-lite test sync-conflict-observer` → FAIL (module missing).

- [ ] **Step 4: Implement `sync-conflict-observer.ts`:**

```typescript
import type { SyncQueueEntry, ConflictResolution } from '@ultranos/sync-engine'
import { db } from './db'
import { useSyncStore } from '@/stores/sync-store'

/**
 * DrainWorker onConflict observer for pharmacy-lite. Pharmacy authors no
 * Tier-1 data, so a Hub conflict here means the Hub's version is newer-or-
 * concurrent for a Tier-2/3 resource; the tiered resolver's policy applies and
 * the worker markSynced's the (now obsolete) local push. We only RECORD the
 * event for observability — and only when the resolver marks it a genuine
 * concurrent conflict. No remote PHI is persisted; best-effort, never throws.
 */
export async function recordSyncConflict(
  entry: SyncQueueEntry,
  resolution: ConflictResolution,
): Promise<void> {
  if (!resolution.conflictFlag) return
  try {
    await db.syncQueue.update(entry.id, { conflictFlag: true })
    const count = await db.syncQueue.filter((e) => e.conflictFlag === true).count()
    useSyncStore.getState().setConflictCount(count)
  } catch {
    // observability is best-effort — never throw (would markFailed the entry)
  }
}
```

- [ ] **Step 5: Wire it into the DrainWorker** — in `apps/pharmacy-lite/src/lib/sync-drain-init.ts`: `import { recordSyncConflict } from './sync-conflict-observer'` and add `onConflict: recordSyncConflict,` to the `new DrainWorker({ ... })` config (alongside `onAudit`).

- [ ] **Step 6: Return the conflict from `drain-sync-fn.ts`** — change the sync.push success-parse block (currently lines 95-101). Replace the line `if (result?.conflict) return { success: true } // LWW — obsolete local push dropped, Hub version wins` with:

```typescript
    // Surface the conflict so the DrainWorker runs the tiered resolveConflict +
    // onConflict observer (the Hub already applied its resolution; the local
    // push is obsolete and the worker will markSynced without retrying).
    if (result?.conflict) return { success: false, conflict: result.conflict }
```

Keep the `if (result?.success) return { success: true }` line above it and the `return { success: false, error: result?.error ?? 'sync-push-failed' }` line below it unchanged. Also update the stale comment on the HTTP-`409` branch (lines 72-76): drop the "deferred to Story 26.4" note — genuine HTTP 409s (not the app-level conflict path) still return a retryable error, which is fine; just refresh the comment to say application-level conflicts are handled via the response body.

- [ ] **Step 7: Update the existing drain-sync-fn conflict test** — in `apps/pharmacy-lite/src/__tests__/drain-sync-fn.test.ts`, find the test asserting a `sync.push` conflict result yields `{ success: true }` (the Story 26.4 reference near line 98/203) and update it to expect `{ success: false, conflict: { remoteVersion: ... } }`. Feed the fetch mock a `results:[{ success:false, conflict:{ remoteVersion:{ id, data, hlcTimestamp:{wallMs,counter,nodeId}, version } } }]` body and assert the returned `SyncResult` carries `conflict.remoteVersion`.

- [ ] **Step 8: Run to verify PASS** — `pnpm -F pharmacy-lite test sync-conflict-observer drain-sync-fn` → green (new observer tests + updated drain test).

- [ ] **Step 9: Typecheck** — `pnpm -F pharmacy-lite typecheck` → no NEW errors in the touched files.
- [ ] **Step 10: Commit** (skip in NO-COMMIT).

---

### Task 2: Observability surface — conflicts section in `SyncQueueDashboard`

**Files:**
- Modify: `apps/pharmacy-lite/src/components/pharmacy/SyncQueueDashboard.tsx`
- Modify: `apps/pharmacy-lite/messages/{en,ar,prs,ps}.json` (`sync` namespace)
- Test: `apps/pharmacy-lite/src/__tests__/SyncQueueDashboard.test.tsx` (extend the existing file)

**Interfaces:**
- Consumes: `SyncQueueEntry.conflictFlag` (Task 1); the `sync` i18n namespace.

- [ ] **Step 1: Write/extend the failing test** — in `apps/pharmacy-lite/src/__tests__/SyncQueueDashboard.test.tsx`, add a case: seed `db.syncQueue` with one entry `{ status: 'synced', conflictFlag: true, resourceType: 'Invoice', ... }` and one normal entry; render `<SyncQueueDashboard />`; assert a conflicts section heading (query by the i18n key text or a `data-testid="sync-conflicts-section"`) is present and lists the flagged entry. Mirror the existing mocks in that test file (it already mocks `@/lib/db` / renders the dashboard). Assert a normal (non-flagged) synced entry does NOT appear in the conflicts section.

- [ ] **Step 2: Run to verify FAIL** — `pnpm -F pharmacy-lite test SyncQueueDashboard` → FAIL (no conflicts section).

- [ ] **Step 3: Implement the conflicts section** — in `SyncQueueDashboard.tsx`:
  - Extend `categorize` (or add a derived list) to collect `conflicts = all.filter((e) => e.conflictFlag === true)` (independent of status — a flagged entry is usually `synced`).
  - Render a new `<section data-testid="sync-conflicts-section">` (only when `conflicts.length > 0`), placed ABOVE the "recently synced" section, using the same box idiom (`rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50`). Heading: `t('conflictsAutoResolved', { count: conflicts.length })` in `text-warning` (a resolved-but-noteworthy state; not `text-destructive` — nothing is broken). Under it, a one-line explainer `t('conflictsAutoResolvedHint')` ("The Hub already had a newer version; your device kept the Hub copy.") and the flagged entries rendered with the existing `SyncQueueEntry` component (shows opaque resourceType/resourceId only — no PHI).
  - Keep everything else unchanged.

- [ ] **Step 4: i18n** — add to the `sync` namespace in all four `messages/*.json`: `conflictsAutoResolved` (ICU `{count}` — e.g. English "{count} conflict(s) auto-resolved") and `conflictsAutoResolvedHint`. Native ar/prs/ps where straightforward; English fallback OK (note which). Maintain key parity.

- [ ] **Step 5: Run to verify PASS** — `pnpm -F pharmacy-lite test SyncQueueDashboard` → green.
- [ ] **Step 6: Typecheck + parity** — `pnpm -F pharmacy-lite typecheck` (no NEW errors in touched files); confirm the two keys exist in all four message files.
- [ ] **Step 7: Commit** (skip).

---

## Self-Review

**Coverage:** principled routing (return conflict → resolver → onConflict) + flag/count observer → T1; visible surface → T2. **Correctness of the core change:** returning `{ success:false, conflict }` from `drain-sync-fn` triggers the DrainWorker's existing conflict path (`resolveConflict` + `onConflict` + `markSynced`); the entry is dropped-not-retried (no storm) because for pharmacy's non-Tier-1 data a Hub conflict always means Hub-is-newer. **PHI-at-rest:** only a boolean `conflictFlag` is persisted; the remote version's `data` is never written to IndexedDB (the deliberate divergence from OPD-Lite's `conflictData`); the T1 test `does NOT persist any remote PHI payload` pins this. **Noise control:** only `resolution.conflictFlag === true` (concurrent-within-window) is surfaced; routine stale LWW is accepted silently. **No storm / no throw:** `recordSyncConflict` is best-effort (never throws → never `markFailed`); `markSynced` retained. **No migration:** `conflictFlag?` is non-indexed optional — no `version()` bump. **Type consistency:** `recordSyncConflict(entry, resolution)` matches the DrainWorker `onConflict(entry, ConflictResolution)` contract; `SyncQueueEntry.conflictFlag` written by T1 observer is read by the T2 dashboard filter. **Placeholder scan:** none — observer + tests are concrete; the dashboard change specifies the exact section, tokens, testid, and i18n keys. **Deferred (noted):** no Tier-1 append-only review UI / prescription-block (pharmacy authors no Tier-1 data) and no client→Hub `sync_conflicts.status` resolution feedback (out of scope for observability).
