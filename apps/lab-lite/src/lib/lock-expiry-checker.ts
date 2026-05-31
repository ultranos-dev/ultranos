/**
 * lock-expiry-checker.ts — Story 51.3: Sample Collision Prevention
 *
 * Polls Dexie every 5 minutes for ACTIVE sample locks past their expiresAt.
 * When an expired lock is found:
 *   1. Auto-releases the lock (marks EXPIRED)
 *   2. Queues a manager notification via the sync queue
 *   3. Emits an audit event
 *
 * Design: setInterval-based polling inside the active PWA tab.
 * If no tab is open, locks are released on next app load (acceptable for 4h default).
 * 5-minute granularity is fine for a 4-hour default timeout.
 */

import { checkExpiredLocks, autoReleaseLock } from './sample-lock-service'
import type { SampleLock } from './db'

const CHECK_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

let intervalId: ReturnType<typeof setInterval> | null = null

/**
 * Run a single expiry check pass.
 * Exposed for testing and for use by the hook on mount.
 */
export async function runExpiryCheck(): Promise<SampleLock[]> {
  const expired = await checkExpiredLocks()
  for (const lock of expired) {
    await autoReleaseLock(lock)
  }
  return expired
}

/** Start the background expiry checker. Call once from the main lab layout. */
export function startExpiryChecker(): void {
  if (intervalId !== null) return // Already running
  // Run immediately on start, then on interval
  void runExpiryCheck()
  intervalId = setInterval(() => {
    void runExpiryCheck()
  }, CHECK_INTERVAL_MS)
}

/** Stop the background expiry checker. Call on layout unmount. */
export function stopExpiryChecker(): void {
  if (intervalId !== null) {
    clearInterval(intervalId)
    intervalId = null
  }
}

/** Returns true if the checker is currently running. */
export function isExpiryCheckerRunning(): boolean {
  return intervalId !== null
}
