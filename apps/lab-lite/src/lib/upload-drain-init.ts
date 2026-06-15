/**
 * Singleton upload queue drain lifecycle.
 *
 * Wraps `startQueueDrainListener` / `drainQueue` so callers can start, trigger,
 * and stop the drain without holding the deps themselves.
 *
 * Usage:
 *   startUploadDrain(deps)   — called once after login (SyncProvider)
 *   triggerUploadDrain()     — called on online event, "Sync Now" button, etc.
 *   stopUploadDrain()        — called on logout / session expiry
 */

import {
  drainQueue,
  startQueueDrainListener,
  type DrainDependencies,
} from './upload-queue-worker'

let currentDeps: DrainDependencies | null = null
let currentCleanup: (() => void) | null = null

export function startUploadDrain(deps: DrainDependencies): void {
  stopUploadDrain()
  currentDeps = deps
  currentCleanup = startQueueDrainListener(deps)
}

export function triggerUploadDrain(): void {
  if (currentDeps) void drainQueue(currentDeps)
}

export function stopUploadDrain(): void {
  currentCleanup?.()
  currentCleanup = null
  currentDeps = null
}
