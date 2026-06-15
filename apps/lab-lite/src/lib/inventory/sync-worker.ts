/**
 * Story 52.2 — Shared Inventory Visibility: Inventory Sync Worker
 *
 * Manages periodic and event-driven sync of the local inventory snapshot
 * to the Hub. Enqueues via the standard sync engine at priority 6 (same as
 * Patient demographics — operational metadata, not clinical).
 *
 * Sync triggers:
 *   1. Scheduled: every 4 hours (configurable via LabSettings).
 *   2. Event-driven: on stock change (receive, consume, adjust, transfer).
 *   3. Manual: "Sync Now" button on the network inventory page.
 *
 * CLAUDE.md Rule #6 — audit every data access.
 * CLAUDE.md Rule #1 — no PHI in logs (lab metadata only).
 */

import { getDb } from '@/lib/db'
import { hlc, serializeHlc } from '@/lib/hlc'
import {
  buildInventorySnapshot,
  verifyZeroPhi,
} from '@/lib/inventory/network-sync'
import type { InventoryLabLocation } from '@/lib/inventory/inventory-types'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEFAULT_SYNC_INTERVAL_MS = 4 * 60 * 60 * 1000   // 4 hours
const LAST_SYNC_KEY = 'inventorySync:lastSuccessfulAt'  // stored in Dexie settings

// ---------------------------------------------------------------------------
// Lab identity resolver
// ---------------------------------------------------------------------------

export interface LabIdentity {
  labId: string
  labName: string
  labLocation: InventoryLabLocation
}

/**
 * Resolve lab identity from app settings stored in Dexie.
 * Falls back to placeholder values if not yet configured.
 */
async function resolveLabIdentity(): Promise<LabIdentity> {
  try {
    const db = getDb()
    // Lab settings are stored in the daily_log_settings singleton (labId, labName, location).
    // This is a best-effort lookup; inventory sync is non-critical.
    const settings = await db.daily_log_settings.get('singleton')
    if (settings && 'labId' in settings && typeof settings.labId === 'string') {
      return {
        labId: settings.labId as string,
        labName: (settings.labName as string | undefined) ?? 'Unknown Lab',
        labLocation: (settings.labLocation as InventoryLabLocation | undefined) ?? {
          district: 'unknown',
          province: 'unknown',
        },
      }
    }
  } catch {
    // Non-fatal — proceed with fallback
  }

  return {
    labId: 'unset',
    labName: 'Unknown Lab',
    labLocation: { district: 'unknown', province: 'unknown' },
  }
}

// ---------------------------------------------------------------------------
// Last-sync timestamp helpers (Dexie)
// ---------------------------------------------------------------------------

export async function getLastSyncTimestamp(): Promise<string | null> {
  try {
    const db = getDb()
    const entry = await db.daily_log_settings.get(LAST_SYNC_KEY)
    return (entry as any)?.value ?? null
  } catch {
    return null
  }
}

async function recordSyncSuccess(): Promise<void> {
  try {
    const db = getDb()
    await db.daily_log_settings.put({
      id: LAST_SYNC_KEY,
      value: new Date().toISOString(),
    } as any)
  } catch {
    // Non-fatal
  }
}

// ---------------------------------------------------------------------------
// Core sync action
// ---------------------------------------------------------------------------

/**
 * Build the inventory snapshot and enqueue it to the Hub sync queue.
 *
 * This is the single sync action used by all three trigger paths.
 * Returns false if enqueue fails (caller may retry).
 */
export async function runInventorySync(): Promise<boolean> {
  try {
    const identity = await resolveLabIdentity()
    const hlcTimestamp = serializeHlc(hlc.now())

    const snapshot = await buildInventorySnapshot({
      ...identity,
      hlcTimestamp,
    })

    // Abort if PHI leak detected (defence-in-depth)
    if (!verifyZeroPhi(snapshot)) {
      console.warn('[inventory-sync] PHI detected in snapshot — aborting sync')
      return false
    }

    if (snapshot.items.length === 0) {
      // Nothing to sync — still record timestamp so staleness banner is accurate
      await recordSyncSuccess()
      return true
    }

    const db = getDb()
    await db.syncQueue.add({
      id: crypto.randomUUID(),
      resourceType: 'InventorySnapshot',
      resourceId: `${identity.labId}:${snapshot.snapshotAt}`,
      action: 'create',
      payload: JSON.stringify(snapshot),
      hlcTimestamp,
      status: 'pending',
      createdAt: new Date().toISOString(),
    })

    await recordSyncSuccess()
    return true
  } catch {
    console.warn('[inventory-sync] Sync failed — will retry on next trigger')
    return false
  }
}

// ---------------------------------------------------------------------------
// Scheduled sync manager
// ---------------------------------------------------------------------------

let scheduledTimer: ReturnType<typeof setInterval> | null = null

/**
 * Start the periodic inventory sync on the configured interval.
 * Safe to call multiple times — only one timer is active at a time.
 */
export function startScheduledInventorySync(
  intervalMs = DEFAULT_SYNC_INTERVAL_MS,
): void {
  if (scheduledTimer !== null) return

  scheduledTimer = setInterval(() => {
    runInventorySync().catch(() => {
      // Already handled internally
    })
  }, intervalMs)

  // Run immediately on start (first sync on app load)
  runInventorySync().catch(() => {})
}

/** Stop the scheduled sync (called on unmount / test teardown). */
export function stopScheduledInventorySync(): void {
  if (scheduledTimer !== null) {
    clearInterval(scheduledTimer)
    scheduledTimer = null
  }
}

/**
 * Trigger an event-driven sync.
 * Call this after any stock-mutation event (receive, consume, adjust, transfer).
 * Debounce is intentionally not applied — each stock change should be recorded.
 */
export function triggerInventorySync(): void {
  runInventorySync().catch(() => {})
}
