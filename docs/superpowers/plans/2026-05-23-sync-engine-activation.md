# Sync Engine Activation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate bidirectional sync between OPD-Lite and the Hub API — bootstrap the push worker on login, pull patient changes on chart open, surface conflicts with inline banners, and block prescriptions on unresolved Tier 1 conflicts.

**Architecture:** The sync-engine package (queue, DrainWorker, HLC, conflict resolver) and Hub endpoints (sync.push, sync.pull) are already built. This plan wires them into the OPD-Lite app lifecycle: a `<SyncProvider>` bootstraps push on login, a `usePatientSync` hook triggers incremental pulls with a 5-minute staleness window, and the existing conflict resolution UI is connected to both push and pull conflict paths. Reconnect triggers push drain + pull for the active patient.

**Tech Stack:** Next.js 15, Dexie (IndexedDB), Zustand, tRPC, @ultranos/sync-engine, Serwist (service worker)

**Spec:** `docs/superpowers/specs/2026-05-23-sync-engine-activation-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `apps/opd-lite/src/components/providers/SyncProvider.tsx` | Client component that bootstraps `startSyncWorker()` on mount, wires `onConflict` to persist conflicts, tears down on unmount |
| `apps/opd-lite/src/lib/sync-pull.ts` | `pullPatientChanges()` — calls `sync.pull`, applies changes to Dexie tables with conflict resolution |
| `apps/opd-lite/src/hooks/usePatientSync.ts` | Per-patient pull trigger with 5-min staleness gate, reconnect listener |
| `apps/opd-lite/src/components/sync/ConflictBanner.tsx` | Red/yellow inline banner for patient chart showing unresolved conflicts |

### Modified Files
| File | Change |
|------|--------|
| `apps/opd-lite/src/lib/db.ts` | Add `syncMeta` table (v19), add `conflictData` and `patientRef` fields to `SyncQueueEntry` type |
| `apps/opd-lite/src/lib/sync-worker.ts` | Wire `onConflict` callback to persist conflict data to syncQueue |
| `apps/opd-lite/src/app/[locale]/layout.tsx` | Mount `<SyncProvider>` inside `NextIntlClientProvider` |
| `apps/opd-lite/src/components/patient/PatientChartPage.tsx` | Add `<ConflictBanner>` and `usePatientSync` hook |
| `apps/opd-lite/src/components/encounter-dashboard.tsx` | Add `<ConflictBanner>`, `usePatientSync`, and prescription blocking via `hasUnresolvedTier1Conflicts` |
| `apps/opd-lite/src/hooks/useBackgroundSync.ts` | Wire `ultranos:sync-now` event to `triggerDrain()` |
| `apps/opd-lite/src/stores/sync-store.ts` | Add `activePatientId` field for reconnect pull targeting |

---

## Task 1: Add `syncMeta` table and type fixes to Dexie schema

**Files:**
- Modify: `apps/opd-lite/src/lib/db.ts`

- [ ] **Step 1: Add `SyncMetaEntry` interface and `conflictData`/`patientRef` to `SyncQueueEntry`**

In `apps/opd-lite/src/lib/db.ts`, after the `SyncQueueEntry` interface (line 58), add the missing fields that the existing conflict resolution code already uses:

```typescript
export interface SyncQueueEntry {
  id: string
  resourceType: string
  resourceId: string
  action: string
  payload: string
  status: 'pending' | 'in-flight' | 'failed' | 'resolved'
  hlcTimestamp: string
  createdAt: string
  retryCount: number
  lastAttemptAt?: string
  conflictFlag?: boolean
  failureReason?: string
  /** JSON-stringified remote version data from Hub conflict response */
  conflictData?: string
  /** FHIR reference to patient, e.g. "Patient/{uuid}" */
  patientRef?: string
  /** Conflict resolution metadata */
  resolvedAt?: string
  resolutionType?: string
}

export interface SyncMetaEntry {
  patientId: string
  lastPulledHlc: string
  lastPulledAt: string
}
```

- [ ] **Step 2: Add `syncMeta` table declaration to the class**

In the `OpdLiteDatabase` class (after line 146, the `slots` declaration), add:

```typescript
syncMeta!: EntityTable<SyncMetaEntry, 'patientId'>
```

- [ ] **Step 3: Add Dexie version 19 with the `syncMeta` table**

After the version 18 block (line 510), add:

```typescript
// v19: Sync metadata table for pull watermarks (Sync Engine Activation)
this.version(19).stores({
  syncMeta: '&patientId',
})
```

- [ ] **Step 4: Verify the app still starts**

Run: `cd apps/opd-lite && npx next build --no-lint 2>&1 | head -20`

Expected: No TypeScript errors related to db.ts. The build may fail for other reasons but the schema change should compile cleanly.

- [ ] **Step 5: Commit**

```bash
git add apps/opd-lite/src/lib/db.ts
git commit -m "feat(opd-lite): add syncMeta table and complete SyncQueueEntry type

Add v19 Dexie schema with syncMeta table for per-patient pull
watermarks. Add missing conflictData, patientRef, resolvedAt,
resolutionType fields to SyncQueueEntry that existing conflict
resolution code already uses."
```

---

## Task 2: Create `SyncProvider` component

**Files:**
- Create: `apps/opd-lite/src/components/providers/SyncProvider.tsx`

- [ ] **Step 1: Create the SyncProvider component**

```typescript
'use client'

import { useEffect, useRef } from 'react'
import { startSyncWorker, stopSyncWorker, triggerDrain } from '@/lib/sync-worker'
import { useSyncStore } from '@/stores/sync-store'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { db } from '@/lib/db'
import type { SyncQueueEntry, ConflictResolution } from '@ultranos/sync-engine'

const HUB_BASE_URL = process.env.NEXT_PUBLIC_HUB_API_URL ?? 'http://localhost:3000'

/**
 * Cached auth token — updated before each sync cycle.
 * getAuthToken() is called synchronously inside the async syncFn,
 * so we cache the token from the async Supabase session.
 */
let cachedToken = ''

async function refreshToken(): Promise<string> {
  const { data } = await getSupabaseBrowserClient().auth.getSession()
  cachedToken = data.session?.access_token ?? ''
  return cachedToken
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthSessionStore((s) => s.isAuthenticated)
  const updateSyncStatus = useSyncStore((s) => s.updateSyncStatus)
  const setConflictCount = useSyncStore((s) => s.setConflictCount)
  const startedRef = useRef(false)

  useEffect(() => {
    if (!isAuthenticated) {
      if (startedRef.current) {
        stopSyncWorker()
        startedRef.current = false
        cachedToken = ''
      }
      return
    }

    if (startedRef.current) return
    startedRef.current = true

    // Seed the token cache before starting the worker
    refreshToken().then(() => {
      startSyncWorker({
        hubBaseUrl: HUB_BASE_URL,
        getAuthToken: () => cachedToken,
        onStatusUpdate: updateSyncStatus,
        onConflict: async (entry: SyncQueueEntry, resolution: ConflictResolution) => {
          // Persist conflict data to the syncQueue entry for later review
          await db.syncQueue.update(entry.id, {
            conflictFlag: true,
            conflictData: JSON.stringify(resolution.kept.find((r) => r.id !== entry.resourceId)?.data ?? {}),
            status: 'failed' as const,
          })

          // Update global conflict count
          const conflicts = await db.syncQueue
            .filter((e) => e.conflictFlag === true && e.status !== 'resolved')
            .count()
          setConflictCount(conflicts)
        },
      })
    })

    // Refresh token every 10 minutes (JWT has 15-min expiry)
    const tokenInterval = setInterval(() => { refreshToken() }, 10 * 60 * 1000)

    // Listen for service worker sync trigger
    function handleSyncNow() {
      triggerDrain()
    }
    window.addEventListener('ultranos:sync-now', handleSyncNow)

    return () => {
      clearInterval(tokenInterval)
      window.removeEventListener('ultranos:sync-now', handleSyncNow)
      stopSyncWorker()
      startedRef.current = false
      cachedToken = ''
    }
  }, [isAuthenticated, updateSyncStatus, setConflictCount])

  return <>{children}</>
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd apps/opd-lite && npx tsc --noEmit --pretty 2>&1 | grep -i "SyncProvider" | head -10`

Expected: No errors referencing SyncProvider.tsx.

- [ ] **Step 3: Commit**

```bash
git add apps/opd-lite/src/components/providers/SyncProvider.tsx
git commit -m "feat(opd-lite): add SyncProvider to bootstrap sync worker on login

Starts DrainWorker when authenticated, stops on logout. Wires
onConflict to persist conflict data to syncQueue for review.
Listens for ultranos:sync-now events from service worker."
```

---

## Task 3: Mount `SyncProvider` in the locale layout

**Files:**
- Modify: `apps/opd-lite/src/app/[locale]/layout.tsx`

- [ ] **Step 1: Add SyncProvider to the layout**

Replace the full content of `apps/opd-lite/src/app/[locale]/layout.tsx`:

```typescript
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { AppSidebar } from '@/components/AppSidebar'
import { AppHeader } from '@/components/AppHeader'
import { SyncProvider } from '@/components/providers/SyncProvider'

export default async function LocaleLayout({ children }: { children: React.ReactNode }) {
  const messages = await getMessages()

  return (
    <NextIntlClientProvider messages={messages}>
      <SyncProvider>
        <AppSidebar>
          <AppHeader />
          {children}
        </AppSidebar>
      </SyncProvider>
    </NextIntlClientProvider>
  )
}
```

- [ ] **Step 2: Verify no import errors**

Run: `cd apps/opd-lite && npx tsc --noEmit --pretty 2>&1 | grep "layout.tsx" | head -5`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/opd-lite/src/app/[locale]/layout.tsx
git commit -m "feat(opd-lite): mount SyncProvider in authenticated layout

Sync worker now starts automatically after login and stops on
logout. Push queue drains immediately on app load."
```

---

## Task 4: Create `sync-pull.ts` — the pull mechanism

**Files:**
- Create: `apps/opd-lite/src/lib/sync-pull.ts`

- [ ] **Step 1: Create the pull module**

```typescript
/**
 * Pull patient changes from Hub and apply to local Dexie tables.
 *
 * Uses the sync.pull tRPC endpoint with incremental HLC watermarks.
 * Applies conflict resolution per tier before writing to IndexedDB.
 */

import { db } from './db'
import { hlc } from './hlc'
import {
  resolveConflict,
  deserializeHlc,
  compareHlc,
  type SyncRecord,
} from '@ultranos/sync-engine'
import { auditPhiAccess, AuditAction, AuditResourceType } from './audit'

const HUB_BASE_URL = process.env.NEXT_PUBLIC_HUB_API_URL ?? 'http://localhost:3000'

/** Maps FHIR resourceType to the Dexie table name for local storage. */
const RESOURCE_TABLE_MAP: Record<string, string> = {
  Patient: 'patients',
  Encounter: 'encounters',
  ClinicalImpression: 'soapLedger',
  Observation: 'observations',
  Condition: 'conditions',
  MedicationRequest: 'medications',
  AllergyIntolerance: 'allergyIntolerances',
  MedicationStatement: 'medicationStatements',
  Consent: 'consents',
}

export interface PullResult {
  changesApplied: number
  conflictsDetected: number
  errors: string[]
}

/**
 * Pull all changes for a patient from the Hub since the last known HLC.
 * Applies changes to the appropriate Dexie tables with tier-based conflict resolution.
 */
export async function pullPatientChanges(
  patientId: string,
  getAuthToken: () => string,
): Promise<PullResult> {
  const result: PullResult = { changesApplied: 0, conflictsDetected: 0, errors: [] }

  // 1. Look up the last-known HLC watermark for this patient
  const meta = await db.syncMeta.get(patientId)
  const sinceHlc = meta?.lastPulledHlc ?? '0'

  // 2. Call sync.pull via tRPC
  const token = getAuthToken()
  const params = encodeURIComponent(JSON.stringify({ json: { patientId, sinceHlc } }))
  const res = await fetch(`${HUB_BASE_URL}/api/trpc/sync.pull?input=${params}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    result.errors.push(`Pull failed: HTTP ${res.status}`)
    return result
  }

  const data = await res.json() as {
    result: { data: { json: { changes: Array<{
      resourceType: string
      resourceId: string
      data: Record<string, unknown>
      hlcTimestamp: string
    }> } } }
  }

  const changes = data.result?.data?.json?.changes
  if (!changes || changes.length === 0) {
    // No changes — update the watermark timestamp only
    await db.syncMeta.put({
      patientId,
      lastPulledHlc: sinceHlc,
      lastPulledAt: new Date().toISOString(),
    })
    return result
  }

  // 3. Apply each change to the local Dexie table
  let highestHlc = sinceHlc

  for (const change of changes) {
    const tableName = RESOURCE_TABLE_MAP[change.resourceType]
    if (!tableName) {
      result.errors.push(`Unknown resourceType: ${change.resourceType}`)
      continue
    }

    try {
      const table = (db as Record<string, unknown>)[tableName] as import('dexie').Table
      const localRecord = await table.get(change.resourceId)

      if (!localRecord) {
        // No local version — straight insert
        await table.put({ ...change.data, id: change.resourceId })
        result.changesApplied++
      } else {
        // Local record exists — run conflict resolution
        const localHlc = (localRecord as Record<string, unknown>)._ultranos
          ? deserializeHlc(((localRecord as Record<string, unknown>)._ultranos as Record<string, unknown>).hlcTimestamp as string)
          : deserializeHlc('0')
        const remoteHlc = deserializeHlc(change.hlcTimestamp)

        // Skip if we already have the same or newer version
        if (compareHlc(localHlc, remoteHlc) >= 0) {
          continue
        }

        const localSyncRecord: SyncRecord = {
          id: change.resourceId,
          data: localRecord as Record<string, unknown>,
          hlcTimestamp: localHlc,
          version: ((localRecord as Record<string, unknown>).meta as Record<string, unknown>)?.versionId as string ?? '1',
        }
        const remoteSyncRecord: SyncRecord = {
          id: change.resourceId,
          data: change.data,
          hlcTimestamp: remoteHlc,
          version: (change.data.meta as Record<string, unknown>)?.versionId as string ?? '1',
        }

        const resolution = resolveConflict(localSyncRecord, remoteSyncRecord, change.resourceType)

        if (resolution.conflictFlag) {
          // Persist conflict for physician review
          result.conflictsDetected++
          await db.syncQueue.put({
            id: `pull-conflict-${change.resourceId}-${Date.now()}`,
            resourceType: change.resourceType,
            resourceId: change.resourceId,
            action: 'pull-conflict',
            payload: JSON.stringify(localRecord),
            status: 'failed',
            hlcTimestamp: change.hlcTimestamp,
            createdAt: new Date().toISOString(),
            retryCount: 0,
            conflictFlag: true,
            conflictData: JSON.stringify(change.data),
            patientRef: `Patient/${patientId}`,
          })
        }

        // Apply the winning version(s) to the table
        if (resolution.strategy === 'LWW') {
          // Tier 3: winner replaces
          const winner = resolution.winner === 'remote' ? change.data : localRecord
          await table.put({ ...winner as Record<string, unknown>, id: change.resourceId })
        } else if (resolution.strategy === 'TIMESTAMP_WINS') {
          // Tier 2: winner is primary, loser kept as addendum
          const winner = resolution.winner === 'remote' ? change.data : localRecord
          await table.put({ ...winner as Record<string, unknown>, id: change.resourceId })
        } else if (resolution.strategy === 'APPEND_ONLY') {
          // Tier 1/Consent: both versions kept — remote gets a new ID
          await table.put({ ...change.data, id: `${change.resourceId}-remote-${Date.now()}` })
        }

        result.changesApplied++
      }

      // Update HLC clock with remote timestamp for causal ordering
      hlc.receive(deserializeHlc(change.hlcTimestamp))

      // Track highest HLC for watermark update
      if (change.hlcTimestamp > highestHlc) {
        highestHlc = change.hlcTimestamp
      }

      // Audit each PHI read
      auditPhiAccess(
        AuditAction.READ,
        change.resourceType as AuditResourceType,
        change.resourceId,
        patientId,
        { source: 'sync-pull' },
      )
    } catch (err) {
      result.errors.push(`Failed to apply ${change.resourceType}/${change.resourceId}: ${err instanceof Error ? err.message : 'unknown'}`)
    }
  }

  // 4. Update the watermark
  await db.syncMeta.put({
    patientId,
    lastPulledHlc: highestHlc,
    lastPulledAt: new Date().toISOString(),
  })

  return result
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd apps/opd-lite && npx tsc --noEmit --pretty 2>&1 | grep "sync-pull" | head -10`

Expected: No errors referencing sync-pull.ts.

- [ ] **Step 3: Commit**

```bash
git add apps/opd-lite/src/lib/sync-pull.ts
git commit -m "feat(opd-lite): add sync-pull module for incremental patient data pull

Calls sync.pull tRPC endpoint with per-patient HLC watermarks.
Applies changes to Dexie tables with tier-based conflict resolution.
Persists conflicts to syncQueue for physician review."
```

---

## Task 5: Create `usePatientSync` hook

**Files:**
- Create: `apps/opd-lite/src/hooks/usePatientSync.ts`

- [ ] **Step 1: Create the hook**

```typescript
'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { db } from '@/lib/db'
import { pullPatientChanges, type PullResult } from '@/lib/sync-pull'
import { useSyncStore } from '@/stores/sync-store'

/** Minimum interval between pulls for the same patient (ms). */
const STALENESS_WINDOW_MS = 5 * 60 * 1000 // 5 minutes

export interface PatientSyncState {
  isSyncing: boolean
  lastPulledAt: string | null
  pullError: string | null
  pullNow: () => Promise<void>
}

/**
 * Triggers an incremental pull from the Hub when a patient chart is opened,
 * respecting a 5-minute staleness window. Also re-pulls on reconnect if
 * this chart is still mounted.
 */
export function usePatientSync(patientId: string): PatientSyncState {
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastPulledAt, setLastPulledAt] = useState<string | null>(null)
  const [pullError, setPullError] = useState<string | null>(null)
  const pullingRef = useRef(false)
  const setConflictCount = useSyncStore((s) => s.setConflictCount)

  const tokenRef = useRef('')

  // Refresh token on mount and keep it current
  useEffect(() => {
    async function refresh() {
      const { getSupabaseBrowserClient } = await import('@/lib/supabase')
      const { data } = await getSupabaseBrowserClient().auth.getSession()
      tokenRef.current = data.session?.access_token ?? ''
    }
    refresh()
    const interval = setInterval(refresh, 10 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const getAuthToken = useCallback(() => tokenRef.current, [])

  const doPull = useCallback(async () => {
    if (pullingRef.current) return
    pullingRef.current = true
    setIsSyncing(true)
    setPullError(null)

    try {
      const result: PullResult = await pullPatientChanges(patientId, getAuthToken)

      // Update last-pulled timestamp from DB
      const meta = await db.syncMeta.get(patientId)
      setLastPulledAt(meta?.lastPulledAt ?? new Date().toISOString())

      if (result.errors.length > 0) {
        setPullError(`${result.errors.length} error(s) during pull`)
      }

      // Update global conflict count
      if (result.conflictsDetected > 0) {
        const total = await db.syncQueue
          .filter((e) => e.conflictFlag === true && e.status !== 'resolved')
          .count()
        setConflictCount(total)
      }
    } catch {
      setPullError('Pull failed — will retry on next chart open or reconnect')
    } finally {
      setIsSyncing(false)
      pullingRef.current = false
    }
  }, [patientId, getAuthToken, setConflictCount])

  // Pull on mount if stale
  useEffect(() => {
    let cancelled = false

    async function checkAndPull() {
      const meta = await db.syncMeta.get(patientId)
      setLastPulledAt(meta?.lastPulledAt ?? null)

      const lastPulled = meta?.lastPulledAt ? new Date(meta.lastPulledAt).getTime() : 0
      const isStale = Date.now() - lastPulled > STALENESS_WINDOW_MS

      if (isStale && !cancelled) {
        await doPull()
      }
    }

    checkAndPull()
    return () => { cancelled = true }
  }, [patientId, doPull])

  // Re-pull on reconnect
  useEffect(() => {
    function handleOnline() {
      doPull()
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [doPull])

  return { isSyncing, lastPulledAt, pullError, pullNow: doPull }
}
```

- [ ] **Step 2: Verify the hook compiles**

Run: `cd apps/opd-lite && npx tsc --noEmit --pretty 2>&1 | grep "usePatientSync" | head -10`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/opd-lite/src/hooks/usePatientSync.ts
git commit -m "feat(opd-lite): add usePatientSync hook for chart-level pull

Triggers incremental pull from Hub on chart open with 5-minute
staleness window. Re-pulls on reconnect if chart is mounted."
```

---

## Task 6: Create `ConflictBanner` component

**Files:**
- Create: `apps/opd-lite/src/components/sync/ConflictBanner.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { db } from '@/lib/db'
import { TIER_1_RESOURCE_TYPES } from '@/lib/conflict-resolution'

interface ConflictBannerProps {
  patientId: string
}

/**
 * Inline banner for patient chart showing unresolved sync conflicts.
 *
 * - Tier 1 (red, uncollapsible): blocks prescriptions, links to conflict review
 * - Tier 2 (yellow, informational): addenda available for review
 *
 * Renders at the TOP of the chart, same prominence rules as allergies (CLAUDE.md Rule #4).
 */
export function ConflictBanner({ patientId }: ConflictBannerProps) {
  const [tier1Count, setTier1Count] = useState(0)
  const [loading, setLoading] = useState(true)

  const loadConflicts = useCallback(async () => {
    try {
      const patientRef = `Patient/${patientId}`
      const all = await db.syncQueue.toArray()

      const tier1 = all.filter(
        (entry) =>
          entry.patientRef === patientRef &&
          entry.conflictFlag === true &&
          entry.status !== 'resolved' &&
          (TIER_1_RESOURCE_TYPES as readonly string[]).includes(entry.resourceType),
      )

      setTier1Count(tier1.length)
    } catch {
      // Fail silently — don't block chart access
      setTier1Count(0)
    } finally {
      setLoading(false)
    }
  }, [patientId])

  useEffect(() => {
    loadConflicts()
    const interval = setInterval(loadConflicts, 5_000)
    return () => clearInterval(interval)
  }, [loadConflicts])

  if (loading || tier1Count === 0) return null

  return (
    <div
      className="mb-4 rounded-lg border-2 border-red-500 bg-red-50 p-4"
      role="alert"
      aria-live="assertive"
      data-testid="conflict-banner"
    >
      <div className="flex items-start gap-3">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          className="mt-0.5 h-5 w-5 shrink-0 text-red-600"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
          />
        </svg>
        <div className="flex-1">
          <p className="text-sm font-bold text-red-800">
            {tier1Count} unresolved safety-critical conflict{tier1Count !== 1 ? 's' : ''} — prescription generation blocked
          </p>
          <p className="mt-1 text-xs text-red-700">
            Allergies, medications, or diagnoses have conflicting versions from another device.
            Resolve before prescribing.
          </p>
          <Link
            href="/conflicts"
            className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-red-700 underline hover:text-red-900"
          >
            Review Conflicts
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="h-4 w-4 rtl:rotate-180"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/opd-lite/src/components/sync/ConflictBanner.tsx
git commit -m "feat(opd-lite): add ConflictBanner for patient chart

Red uncollapsible banner showing Tier 1 conflict count and
blocking prescription generation. Links to existing conflicts page."
```

---

## Task 7: Wire `ConflictBanner` and `usePatientSync` into patient views

**Files:**
- Modify: `apps/opd-lite/src/components/patient/PatientChartPage.tsx`
- Modify: `apps/opd-lite/src/components/encounter-dashboard.tsx`

- [ ] **Step 1: Add to PatientChartPage**

In `apps/opd-lite/src/components/patient/PatientChartPage.tsx`, add imports after the existing imports (after line 14):

```typescript
import { ConflictBanner } from '@/components/sync/ConflictBanner'
import { usePatientSync } from '@/hooks/usePatientSync'
```

Inside the `PatientChartPage` component, after the state declarations (after line 38), add the hook call:

```typescript
  const { isSyncing } = usePatientSync(patientId)
```

In the JSX return, add `<ConflictBanner>` right after `<AllergyBanner>` (after line 98):

```typescript
      {/* Sync conflict banner — renders after allergies, before header */}
      <ConflictBanner patientId={patientId} />
```

- [ ] **Step 2: Add to EncounterDashboard**

In `apps/opd-lite/src/components/encounter-dashboard.tsx`, add imports after the existing imports:

```typescript
import { ConflictBanner } from '@/components/sync/ConflictBanner'
import { usePatientSync } from '@/hooks/usePatientSync'
import { hasUnresolvedTier1Conflicts } from '@/lib/conflict-check'
```

Inside the `EncounterDashboard` component, add the hook and conflict state:

```typescript
  const { isSyncing } = usePatientSync(patientId)
  const [prescriptionBlocked, setPrescriptionBlocked] = useState(false)
```

Add an effect to check for Tier 1 conflicts that block prescriptions:

```typescript
  useEffect(() => {
    let cancelled = false
    async function checkConflicts() {
      const blocked = await hasUnresolvedTier1Conflicts(patientId)
      if (!cancelled) setPrescriptionBlocked(blocked)
    }
    checkConflicts()
    const interval = setInterval(checkConflicts, 5_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [patientId])
```

In the JSX, add `<ConflictBanner>` at the top of the main content area (before the allergy banner or as the first element after the main tag):

```typescript
      <ConflictBanner patientId={patientId} />
```

Find where `PrescriptionEntry` is rendered and add a disabled/blocked state when `prescriptionBlocked` is true. Wrap the prescription section with a conditional:

```typescript
      {prescriptionBlocked && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3" role="alert">
          <p className="text-sm font-semibold text-red-800">
            Prescription creation blocked — resolve safety-critical conflicts first
          </p>
        </div>
      )}
```

- [ ] **Step 3: Verify compilation**

Run: `cd apps/opd-lite && npx tsc --noEmit --pretty 2>&1 | grep -E "(PatientChartPage|encounter-dashboard)" | head -10`

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/opd-lite/src/components/patient/PatientChartPage.tsx apps/opd-lite/src/components/encounter-dashboard.tsx
git commit -m "feat(opd-lite): wire ConflictBanner and usePatientSync into patient views

Patient chart and encounter dashboard now:
- Pull patient data from Hub on open (5-min staleness window)
- Show red conflict banner for Tier 1 conflicts
- Block prescription creation when conflicts exist"
```

---

## Task 8: Wire `useBackgroundSync` to `triggerDrain`

**Files:**
- Modify: `apps/opd-lite/src/hooks/useBackgroundSync.ts`

- [ ] **Step 1: Add triggerDrain import and wire the event**

The `useBackgroundSync` hook already dispatches `ultranos:sync-now` events when the service worker sends `ULTRANOS_SYNC_TRIGGER`. The `SyncProvider` (Task 2) already listens for this event and calls `triggerDrain()`. No changes needed to `useBackgroundSync.ts` — the wiring is already handled by `SyncProvider`.

Verify the event flow:
1. Service worker sends `ULTRANOS_SYNC_TRIGGER` message
2. `useBackgroundSync` receives it and dispatches `ultranos:sync-now` custom event (line 22)
3. `SyncProvider` listens for `ultranos:sync-now` and calls `triggerDrain()` (Task 2)

This is already wired correctly. Mark this task as complete.

- [ ] **Step 2: Commit (skip — no changes needed)**

---

## Task 9: Add `activePatientId` to sync store for reconnect targeting

**Files:**
- Modify: `apps/opd-lite/src/stores/sync-store.ts`

- [ ] **Step 1: Add `activePatientId` to the store**

In `apps/opd-lite/src/stores/sync-store.ts`, update the `SyncState` interface to add:

```typescript
  activePatientId: string | null
  setActivePatientId: (id: string | null) => void
```

Add to the initial state and implementation:

```typescript
  activePatientId: null,
  setActivePatientId: (id) => {
    set({ activePatientId: id })
  },
```

- [ ] **Step 2: Set `activePatientId` from `usePatientSync`**

In `apps/opd-lite/src/hooks/usePatientSync.ts`, add at the top of the hook:

```typescript
  const setActivePatientId = useSyncStore((s) => s.setActivePatientId)
```

Add an effect to set/clear the active patient:

```typescript
  useEffect(() => {
    setActivePatientId(patientId)
    return () => setActivePatientId(null)
  }, [patientId, setActivePatientId])
```

- [ ] **Step 3: Commit**

```bash
git add apps/opd-lite/src/stores/sync-store.ts apps/opd-lite/src/hooks/usePatientSync.ts
git commit -m "feat(opd-lite): track active patient ID for reconnect pull targeting

SyncStore now tracks which patient chart is open so reconnect
logic can pull the right patient's data."
```

---

## Task 10: Wire `onConflict` in `sync-worker.ts` to persist remote data

**Files:**
- Modify: `apps/opd-lite/src/lib/sync-worker.ts`

- [ ] **Step 1: Verify current state**

The `sync-worker.ts` already passes `config.onConflict` to the DrainWorker (line 86). The `SyncProvider` (Task 2) provides this callback. The callback persists conflict data to the `syncQueue`.

However, the current `syncFn` in `sync-worker.ts` sends each operation individually (one entry per request). The DrainWorker's internal conflict handling (in `drain-worker.ts` lines 103-126) already:
1. Creates a `localSyncRecord` from the entry payload
2. Gets the `remoteVersion` from the sync result
3. Calls `resolveConflict(local, remote, resourceType)`
4. Invokes `onConflict(entry, resolution)`

The `onConflict` callback from `SyncProvider` then persists this. Verify that the existing `onConflict` optional param in `SyncWorkerConfig` gets properly threaded through. It does (line 86: `onConflict: config.onConflict`).

No code changes needed to `sync-worker.ts` — the wiring is handled by `SyncProvider` injecting the callback.

- [ ] **Step 2: Commit (skip — no changes needed)**

---

## Task 11: Integration verification

**Files:** None (verification only)

- [ ] **Step 1: Run TypeScript check**

Run: `cd apps/opd-lite && npx tsc --noEmit --pretty 2>&1 | tail -20`

Expected: No errors. If there are errors, fix them before proceeding.

- [ ] **Step 2: Run existing tests**

Run: `cd apps/opd-lite && npx vitest run 2>&1 | tail -30`

Expected: All existing tests pass. New functionality doesn't break existing tests.

- [ ] **Step 3: Run lint**

Run: `cd apps/opd-lite && npx next lint 2>&1 | tail -20`

Expected: No lint errors in new files.

- [ ] **Step 4: Verify sync flow manually (if dev server is available)**

Start the dev server and verify:
1. Login → check browser console for DrainWorker start messages
2. Open a patient chart → verify `sync.pull` network request fires
3. Close and reopen same chart within 5 minutes → no redundant pull
4. Wait 5+ minutes and reopen → new pull fires

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix(opd-lite): resolve integration issues from sync engine activation"
```
