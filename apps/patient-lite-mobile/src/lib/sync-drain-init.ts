/**
 * Singleton DrainWorker lifecycle for Patient Lite Mobile.
 *
 * Wires up the drain worker with:
 * - SQLite-backed SyncQueueStorage
 * - Hub dispatch sync function
 * - NetInfo connectivity triggers (replaces browser 'online' event)
 * - AppState foreground triggers (replaces visibilitychange)
 *
 * Start after auth is established; stop on logout/session expiry.
 */
import { AppState } from 'react-native'
import type { AppStateStatus } from 'react-native'
import type { SQLiteDatabase } from 'expo-sqlite'
import NetInfo from '@react-native-community/netinfo'
import {
  DrainWorker,
  createSyncQueue,
} from '@ultranos/sync-engine'
import type { SyncQueue, SyncQueueEntry, ConflictResolution } from '@ultranos/sync-engine'
import { createSqliteSyncAdapter } from '@/lib/sqlite-sync-adapter'
import { createDrainSyncFn } from '@/lib/drain-sync-fn'
import type { DrainSyncConfig } from '@/lib/drain-sync-fn'
import { emitAuditEvent } from '@/lib/audit'

let drainWorker: DrainWorker | null = null
let syncQueue: SyncQueue | null = null
let netInfoUnsubscribe: (() => void) | null = null
let appStateSubscription: { remove: () => void } | null = null

/**
 * Initialize and start the drain worker.
 * Call after biometric auth is established and the DB connection is open.
 */
export function startDrainWorker(
  db: SQLiteDatabase,
  config: DrainSyncConfig,
): SyncQueue {
  if (drainWorker) {
    return syncQueue!
  }

  const storage = createSqliteSyncAdapter(db)
  syncQueue = createSyncQueue(storage)
  const syncFn = createDrainSyncFn(config)

  drainWorker = new DrainWorker({
    queue: syncQueue,
    syncFn,
    async onConflict(entry: SyncQueueEntry, resolution: ConflictResolution) {
      // Per CLAUDE.md Tier 1: allergies, active meds, critical diagnoses are append-only.
      // Conflicts are flagged for physician review; prescription generation is blocked
      // when conflictFlag is set by the sync-engine's resolveConflict.
      emitAuditEvent({
        action: 'PHI_WRITE',
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        patientId: 'unknown',
        outcome: 'failure',
        metadata: {
          syncOutcome: 'conflict',
          conflictStrategy: resolution.strategy,
          conflictFlag: String(resolution.conflictFlag),
          blocksPrescription: String(resolution.blocksPrescription),
        },
      })
    },
    onAudit(entry, outcome) {
      let patientId = 'unknown'
      try {
        const payload = JSON.parse(entry.payload)
        const patientRef = payload?.patient?.reference ?? ''
        patientId = patientRef.includes('/')
          ? patientRef.split('/').pop() ?? 'unknown'
          : patientRef || 'unknown'
      } catch {
        // Malformed payload — audit with 'unknown' patientId rather than crash
      }

      emitAuditEvent({
        action: 'PHI_WRITE',
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        patientId,
        outcome: outcome === 'success' ? 'success' : 'failure',
        metadata: {
          syncOutcome: outcome,
          syncAction: entry.action,
        },
      })
    },
  })

  drainWorker.start()

  // NetInfo: trigger drain on connectivity change (offline → online)
  netInfoUnsubscribe = NetInfo.addEventListener((state) => {
    if (state.isConnected && drainWorker) {
      void drainWorker.drain()
    }
  })

  // AppState: trigger drain when app returns to foreground
  appStateSubscription = AppState.addEventListener(
    'change',
    (nextState: AppStateStatus) => {
      if (nextState === 'active' && drainWorker) {
        void drainWorker.drain()
      }
    },
  )

  return syncQueue
}

/**
 * Stop the drain worker and clean up listeners.
 * Call on logout or session expiry.
 */
export function stopDrainWorker(): void {
  if (drainWorker) {
    drainWorker.stop()
    drainWorker = null
  }

  syncQueue = null

  if (netInfoUnsubscribe) {
    netInfoUnsubscribe()
    netInfoUnsubscribe = null
  }

  if (appStateSubscription) {
    appStateSubscription.remove()
    appStateSubscription = null
  }
}

/** Get the current sync queue instance (null if not initialized). */
export function getSyncQueue(): SyncQueue | null {
  return syncQueue
}

/** Check whether the drain worker is currently running. */
export function isDrainWorkerRunning(): boolean {
  return drainWorker !== null
}
