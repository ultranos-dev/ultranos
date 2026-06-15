# Sync Engine Activation Design

**Date:** 2026-05-23
**Status:** Approved
**Scope:** OPD-Lite PWA sync lifecycle — bootstrap, pull mechanism, conflict resolution UI, reconnect behavior

## Problem

The sync engine infrastructure is built but never activated:

1. `startSyncWorker()` is exported but never called — no bootstrap
2. `sync.pull` Hub endpoint exists but no client code calls it — no pull path
3. `onConflict` handler is empty — conflicts detected but not persisted or surfaced
4. Background Sync API tags are registered but not wired to the drain worker

The push path (local writes enqueued to sync queue) and Hub endpoints (sync.push, sync.pull) are complete. This design activates the full bidirectional sync lifecycle.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Bootstrap timing | Hybrid: push on login, pull on chart open | Pending writes sync ASAP; heavy per-patient pulls deferred to when needed |
| Pull strategy | Always incremental (sinceHlc = last known or "0") | Single code path; first pull for unknown patient is effectively a full snapshot |
| Conflict UI | Inline banner on patient chart | Impossible to miss, non-blocking for emergency chart access, same prominence as allergies |
| Pull debounce | 5-minute staleness window per patient | Prevents redundant pulls during rapid chart switching |
| Reconnect behavior | Push queue drain + pull active patient | Covers the common scenario without burst of requests |

## Section 1: Sync Lifecycle & Bootstrap

### SyncProvider Component

A new client component `<SyncProvider>` is mounted inside the authenticated layout's provider tree, after `AuthProvider` (it depends on auth token) and after `IntlProvider` (conflict banner uses i18n).

**On mount:**
1. Calls `startSyncWorker(config)` with:
   - `hubBaseUrl` from environment
   - `getAuthToken` from auth context
   - `onStatusUpdate` piped into existing `useSyncStore` Zustand store
   - `onConflict` piped into conflict persistence layer (Section 3)
2. DrainWorker immediately drains push queue (pending offline writes go up)
3. 30s polling begins for continued push drain
4. `online` event handler registered for reconnect

**On unmount (logout / session expiry):**
- Calls `stopSyncWorker()` — clears intervals, removes event listeners

### File: `apps/opd-lite/src/components/providers/SyncProvider.tsx`

```
<SyncProvider>        // mounted in authenticated layout
  ├── startSyncWorker()   // on mount
  ├── useSyncStore()      // receives status updates
  ├── onConflict()        // persists to syncConflicts table
  └── stopSyncWorker()    // on unmount
</SyncProvider>
```

## Section 2: Pull Mechanism

### New Module: `apps/opd-lite/src/lib/sync-pull.ts`

Exports `pullPatientChanges(patientId: string, token: string): Promise<PullResult>`.

**Flow:**
1. Look up `lastPulledHlc` for this patient from new `syncMeta` Dexie table
2. Call `sync.pull` tRPC query: `{ patientId, sinceHlc: lastPulledHlc || "0" }`
3. For each returned change:
   - Look up existing local record in the corresponding Dexie table
   - If no local record: straight insert
   - If local record exists and differs: run `resolveConflict(local, remote, resourceType)`
     - Tier 1: persist both versions, flag conflict in `syncConflicts` table
     - Tier 2: newer wins, keep both as addenda
     - Tier 3: upsert (LWW)
4. Update local HLC via `hlc.receive(remoteHlc)` for causal ordering
5. Persist highest returned HLC as new `lastPulledHlc` for this patient
6. Emit audit events for each PHI read

### New Dexie Table: `syncMeta`

Schema: `{ patientId (PK), lastPulledHlc, lastPulledAt }`

Tracks per-patient pull watermark. Used for incremental pull and staleness checks.

### New Hook: `usePatientSync`

Used by the patient chart layout.

**On mount (chart open):**
- Check if `lastPulledAt` for this patient is older than 5 minutes
- If stale (or never pulled): trigger `pullPatientChanges()` in background
- Expose `{ isSyncing, lastPulledAt, pullError }` to chart UI

**On `online` event:**
- If this chart is currently mounted, trigger a pull
- Reset staleness timer

### Resource-to-Table Mapping (Pull Apply)

| Resource Type | Dexie Table | Conflict Tier |
|---------------|-------------|---------------|
| AllergyIntolerance | allergyIntolerances | Tier 1 |
| MedicationRequest (active) | medications | Tier 1 |
| MedicationStatement | medicationStatements | Tier 1 |
| Condition (active) | conditions | Tier 1 |
| Consent | consents | Consent (append-only) |
| Encounter | encounters | Tier 2 |
| ClinicalImpression | soapLedger | Tier 2 |
| Observation | observations | Tier 2 |
| DiagnosticReport | (future) | Tier 2 |
| MedicationDispense | (future) | Tier 2 |
| Patient | patients | Tier 3 |

## Section 3: Conflict Persistence & Resolution UI

### New Dexie Table: `syncConflicts`

```
{
  id: string (PK),
  patientId: string (indexed),
  resourceType: string (indexed),
  resourceId: string,
  localVersion: object,
  remoteVersion: object,
  conflictTier: 1 | 2 | 'consent',
  status: 'pending' | 'resolved' (indexed),
  resolution: 'accepted_local' | 'accepted_remote' | 'merged' | null,
  resolvedAt: string | null,
  resolvedBy: string | null,
  createdAt: string
}
```

Populated by:
- **Push path:** `onConflict` callback in `sync-worker.ts` when Hub returns a conflict
- **Pull path:** when `resolveConflict()` returns `conflictFlag: true` during pull apply

### ConflictBanner Component

Mounted at the top of the patient chart layout.

**Tier 1 conflicts (red, uncollapsible):**
- "X unresolved safety-critical conflicts -- prescription generation blocked"
- "Review Conflicts" button opens `<ConflictReviewPanel />`

**Tier 2 conflicts (yellow, informational):**
- "X clinical records updated from another device, review addenda"
- Non-blocking

**Tier 3:** No banner (LWW resolved silently)

### ConflictReviewPanel Component

Side-by-side diff view showing local vs. remote versions.

**Resolution flow:**
1. Clinician reviews both versions
2. Chooses: accept local, accept remote, or edit to merge
3. Resolution writes to `syncConflicts` table: sets `resolution`, `resolvedAt`, `resolvedBy`
4. Emits audit event for the resolution decision
5. Resolved record re-enqueued to push queue so Hub receives the physician's final decision
6. Conflict flag cleared, prescription workflow unblocked

### Prescription Blocking

The prescription creation workflow queries `syncConflicts` for unresolved Tier 1 conflicts on the current patient. If any exist:
- "Create Prescription" action disabled
- Tooltip: "Resolve safety-critical conflicts before prescribing"

## Section 4: Reconnect & Service Worker Integration

### On Reconnect (`online` event)

1. DrainWorker immediately drains push queue (existing behavior)
2. If a patient chart is mounted, `usePatientSync` triggers `pullPatientChanges()` for that patient
3. Staleness timer reset for active patient

### Service Worker Wiring

1. `<SyncProvider>` listens for `ultranos:sync-now` custom event and calls `triggerDrain()`
2. Service worker `sync` event handler posts `ULTRANOS_SYNC_TRIGGER` to all clients via `self.clients.matchAll()`
3. Periodic Background Sync (5-minute minimum interval) as fallback when app is backgrounded

### Offline Behavior

- **Push:** entries accumulate in sync queue (IndexedDB-backed, survives restart) -- no change from current behavior
- **Pull:** `pullPatientChanges()` silently fails with logged warning. Local stale data served. Staleness timer NOT updated on failure, so next chart open or reconnect retries.
- **Conflict banner:** only shows conflicts detected before going offline. New conflicts from pull path won't appear until connectivity returns.

## No Hub API Changes

The existing `sync.push` and `sync.pull` endpoints are complete and sufficient. No modifications needed.

## New Files Summary

| File | Purpose |
|------|---------|
| `apps/opd-lite/src/components/providers/SyncProvider.tsx` | Bootstrap sync worker on login, teardown on logout |
| `apps/opd-lite/src/lib/sync-pull.ts` | Pull changes from Hub, apply to Dexie with conflict resolution |
| `apps/opd-lite/src/hooks/usePatientSync.ts` | Per-patient pull trigger with 5-min staleness gate |
| `apps/opd-lite/src/components/sync/ConflictBanner.tsx` | Red/yellow inline banner for unresolved conflicts |
| `apps/opd-lite/src/components/sync/ConflictReviewPanel.tsx` | Side-by-side diff view for conflict resolution |

## Modified Files Summary

| File | Change |
|------|--------|
| `apps/opd-lite/src/lib/db.ts` | Add `syncMeta` and `syncConflicts` tables, bump DB version |
| `apps/opd-lite/src/lib/sync-worker.ts` | Wire `onConflict` to persist to `syncConflicts` table |
| `apps/opd-lite/src/app/[locale]/layout.tsx` | Mount `<SyncProvider>` in authenticated layout |
| `apps/opd-lite/src/app/[locale]/(app)/patients/[id]/layout.tsx` | Mount `<ConflictBanner />`, use `usePatientSync` hook |
| `apps/opd-lite/src/hooks/useBackgroundSync.ts` | Wire `ultranos:sync-now` event to `triggerDrain()` |
| `apps/opd-lite/src/stores/sync-store.ts` | Add conflict count tracking from `syncConflicts` table |
| Prescription workflow files | Add Tier 1 conflict check gate |
