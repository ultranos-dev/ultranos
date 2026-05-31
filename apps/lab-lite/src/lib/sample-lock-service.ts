/**
 * sample-lock-service.ts — Story 51.3: Sample Collision Prevention
 *
 * Manages sample locks in Dexie to prevent two technicians from processing
 * the same sample simultaneously. All operations are local (offline-first);
 * multi-device conflicts are resolved by Hub sync (earliest lockedAt wins).
 *
 * PHI Rule (CLAUDE.md #1): No patient data in lock records. sampleId is a
 * lab-internal ID (LAB-YYYYMMDD-NNNN), not a patient identifier.
 * Audit Rule (#6): Every lock event emits a structured audit event.
 */

import {
  getDb,
  getActiveLock,
  putSampleLock,
  getExpiredActiveLocks,
  getLockTimeoutHours,
  addCustodyEvent,
  enqueueSyncEvent,
  type SampleLock,
  type LockResult,
  type LockReleaseReason,
} from './db'
import { reportSampleLockAuditEvent } from './audit-client'

// ---------------------------------------------------------------------------
// acquireLock
// ---------------------------------------------------------------------------

/**
 * Attempt to acquire a lock on a sample for the given tech.
 *
 * - If no lock exists: creates a new ACTIVE lock with expiry.
 * - If locked by the same tech: returns `{ success: true, alreadyLocked: true }`.
 * - If locked by a different tech: returns `{ success: false, lockedBy, lockedAt }`.
 *
 * Uses a Dexie transaction for local atomicity.
 */
export async function acquireLock(
  sampleId: string,
  techId: string,
  techName: string,
): Promise<LockResult> {
  const db = getDb()

  return db.transaction('rw', db.sample_locks, db.lab_config, async () => {
    const existing = await getActiveLock(sampleId)

    if (existing) {
      if (existing.techId === techId) {
        // Idempotent — already locked by this tech
        return { success: true, alreadyLocked: true } satisfies LockResult
      }
      // Locked by a different tech
      return {
        success: false,
        lockedBy: existing.techName,
        lockedAt: existing.lockedAt,
      } satisfies LockResult
    }

    // No active lock — create one
    const timeoutHours = await getLockTimeoutHours()
    const lockedAt = new Date().toISOString()
    const expiresAt = new Date(
      Date.now() + timeoutHours * 60 * 60 * 1000,
    ).toISOString()

    const lock: SampleLock = {
      sampleId,
      techId,
      techName,
      lockedAt,
      expiresAt,
      status: 'ACTIVE',
    }

    await putSampleLock(lock)
    return { success: true } satisfies LockResult
  }).then((result) => {
    // Emit audit outside the transaction (audit logging is non-blocking)
    if (result.success && !(result as { alreadyLocked?: boolean }).alreadyLocked) {
      reportSampleLockAuditEvent({
        action: 'SAMPLE_LOCK_ACQUIRED',
        sampleId,
        techId,
      })
    }
    return result
  })
}

// ---------------------------------------------------------------------------
// releaseLock
// ---------------------------------------------------------------------------

/**
 * Release the lock on a sample.
 *
 * Marks the lock as RELEASED or EXPIRED and records a chain-of-custody entry.
 * If the lock does not exist or is not ACTIVE, this is a no-op (already released).
 */
export async function releaseLock(
  sampleId: string,
  techId: string,
  reason: LockReleaseReason,
): Promise<void> {
  const db = getDb()

  const existing = await getActiveLock(sampleId)
  if (!existing) return // Already released — no-op

  const newStatus = reason === 'EXPIRED' ? 'EXPIRED' : 'RELEASED'
  await putSampleLock({ ...existing, status: newStatus })

  // Add chain-of-custody entry (append-only per CLAUDE.md Tier 1)
  const custodyEventId = `lock-release-${sampleId}-${Date.now()}`
  await addCustodyEvent({
    id: custodyEventId,
    sampleId,
    eventType: 'lock-released',
    fromActorId: existing.techId,
    toActorId: techId,
    timestamp: new Date().toISOString(),
    notes: reason,
  })

  // Queue sync event for Hub (so other devices learn about the release)
  await enqueueSyncEvent({
    resourceType: 'SAMPLE_LOCK',
    resourceId: sampleId,
    status: 'pending',
    payload: { action: 'RELEASE', sampleId, techId, reason, releasedAt: new Date().toISOString() },
    createdAt: new Date().toISOString(),
    lastAttemptAt: null,
    retryCount: 0,
  })

  reportSampleLockAuditEvent({
    action: 'SAMPLE_LOCK_RELEASED',
    sampleId,
    techId,
    detail: { reason },
  })
}

// ---------------------------------------------------------------------------
// checkExpiredLocks
// ---------------------------------------------------------------------------

/**
 * Return all ACTIVE locks that have passed their expiresAt timestamp.
 * Called by the lock expiry checker on a 5-minute interval.
 */
export async function checkExpiredLocks(): Promise<SampleLock[]> {
  const nowIso = new Date().toISOString()
  return getExpiredActiveLocks(nowIso)
}

// ---------------------------------------------------------------------------
// autoReleaseLock (for expired locks)
// ---------------------------------------------------------------------------

/**
 * Auto-release a lock that has passed its expiresAt.
 * Flags the sample with lockExpired and queues a manager notification.
 */
export async function autoReleaseLock(lock: SampleLock): Promise<void> {
  const db = getDb()

  // Mark lock as EXPIRED
  await putSampleLock({ ...lock, status: 'EXPIRED' })

  // Chain-of-custody entry
  const custodyEventId = `lock-expired-${lock.sampleId}-${Date.now()}`
  await addCustodyEvent({
    id: custodyEventId,
    sampleId: lock.sampleId,
    eventType: 'lock-expired',
    fromActorId: lock.techId,
    toActorId: 'SYSTEM',
    timestamp: new Date().toISOString(),
    notes: `Lock expired after ${Math.round((Date.now() - new Date(lock.lockedAt).getTime()) / 3_600_000)}h`,
  })

  // Queue manager notification sync event
  const durationMs = Date.now() - new Date(lock.lockedAt).getTime()
  const durationHours = Math.round(durationMs / 3_600_000)
  await enqueueSyncEvent({
    resourceType: 'SAMPLE_LOCK_NOTIFICATION',
    resourceId: lock.sampleId,
    status: 'pending',
    payload: {
      type: 'LOCK_EXPIRED',
      sampleId: lock.sampleId,
      techId: lock.techId,
      techName: lock.techName,
      durationHours,
      expiredAt: new Date().toISOString(),
    },
    createdAt: new Date().toISOString(),
    lastAttemptAt: null,
    retryCount: 0,
  })

  reportSampleLockAuditEvent({
    action: 'SAMPLE_LOCK_EXPIRED',
    sampleId: lock.sampleId,
    techId: lock.techId,
    detail: { reason: 'EXPIRED' },
  })
}

// ---------------------------------------------------------------------------
// requestRelease
// ---------------------------------------------------------------------------

/**
 * Queue a release request notification to the lock holder and lab manager.
 * Does not release the lock — the lock holder must release it manually.
 */
export async function requestRelease(
  sampleId: string,
  requestingTechId: string,
): Promise<void> {
  const existing = await getActiveLock(sampleId)
  if (!existing) return // Lock already gone — nothing to request

  await enqueueSyncEvent({
    resourceType: 'SAMPLE_LOCK_REQUEST',
    resourceId: sampleId,
    status: 'pending',
    payload: {
      type: 'RELEASE_REQUESTED',
      sampleId,
      lockHolderTechId: existing.techId,
      lockHolderTechName: existing.techName,
      requestingTechId,
      requestedAt: new Date().toISOString(),
    },
    createdAt: new Date().toISOString(),
    lastAttemptAt: null,
    retryCount: 0,
  })

  reportSampleLockAuditEvent({
    action: 'SAMPLE_LOCK_RELEASE_REQUESTED',
    sampleId,
    techId: requestingTechId,
    detail: { lockHolderTechId: existing.techId },
  })
}
