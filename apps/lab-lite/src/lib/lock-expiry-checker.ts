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
 *
 * HMR safety: interval is stored on `window` under a stable key so that hot-module
 * reloads in development don't accumulate multiple intervals.
 *
 * Re-entrancy safety: `isCheckRunning` flag prevents concurrent `runExpiryCheck`
 * calls from double-releasing the same lock.
 */

import { checkExpiredLocks, autoReleaseLock } from './sample-lock-service'
import type { SampleLock } from './db'

const CHECK_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes
const HMR_KEY = '__labLiteExpiryChecker' as const

type WindowWithChecker = typeof window & {
  [HMR_KEY]?: ReturnType<typeof setInterval>
}

let isCheckRunning = false

/**
 * Run a single expiry check pass.
 * Re-entrancy-safe: concurrent calls are no-ops.
 * Exposed for testing and for use by the hook on mount.
 */
export async function runExpiryCheck(): Promise<SampleLock[]> {
  if (isCheckRunning) return []
  isCheckRunning = true
  try {
    const expired = await checkExpiredLocks()
    for (const lock of expired) {
      await autoReleaseLock(lock)
    }
    return expired
  } finally {
    isCheckRunning = false
  }
}

/** Start the background expiry checker. Call once from the main lab layout. */
export function startExpiryChecker(): void {
  if (typeof window === 'undefined') return // SSR guard
  const win = window as WindowWithChecker
  if (win[HMR_KEY] !== undefined) return // Already running (including across HMR)

  // Run immediately on start, then on interval
  void runExpiryCheck()
  win[HMR_KEY] = setInterval(() => {
    void runExpiryCheck()
  }, CHECK_INTERVAL_MS)
}

/** Stop the background expiry checker. Call on layout unmount. */
export function stopExpiryChecker(): void {
  if (typeof window === 'undefined') return
  const win = window as WindowWithChecker
  if (win[HMR_KEY] !== undefined) {
    clearInterval(win[HMR_KEY])
    win[HMR_KEY] = undefined
  }
}

/** Returns true if the checker is currently running. */
export function isExpiryCheckerRunning(): boolean {
  if (typeof window === 'undefined') return false
  return (window as WindowWithChecker)[HMR_KEY] !== undefined
}
