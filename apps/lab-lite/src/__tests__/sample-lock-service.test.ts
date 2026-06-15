/**
 * sample-lock-service.test.ts — Story 51.3: Sample Collision Prevention
 *
 * Tests: acquireLock, releaseLock, checkExpiredLocks, autoReleaseLock, requestRelease
 *
 * PHI rule: sampleId is lab-internal (LAB-YYYYMMDD-NNNN) — no patient data in assertions.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'

vi.mock('../lib/audit-client', () => ({
  reportSampleLockAuditEvent: vi.fn(),
  reportSampleAuditEvent: vi.fn(),
}))

vi.mock('../lib/hlc', () => ({
  hlc: { now: () => ({ wallMs: Date.now(), counter: 0, nodeId: 'test-node' }) },
  serializeHlc: vi.fn().mockReturnValue('mock-hlc-ts'),
}))

import { getDb } from '../lib/db'
import {
  acquireLock,
  releaseLock,
  checkExpiredLocks,
  autoReleaseLock,
  requestRelease,
} from '../lib/sample-lock-service'
import { reportSampleLockAuditEvent } from '../lib/audit-client'

const SAMPLE_A = 'LAB-20260531-0001'
const SAMPLE_B = 'LAB-20260531-0002'
const TECH_1 = 'tech-001'
const TECH_2 = 'tech-002'

async function clearLocks() {
  const db = getDb()
  await db.sample_locks.clear()
  await db.custody_events.clear()
  await db.syncQueue.clear()
}

// ---------------------------------------------------------------------------
// acquireLock
// ---------------------------------------------------------------------------

describe('acquireLock', () => {
  beforeEach(async () => {
    await clearLocks()
    vi.clearAllMocks()
  })

  it('succeeds when no lock exists', async () => {
    const result = await acquireLock(SAMPLE_A, TECH_1, 'Tech One')
    expect(result.success).toBe(true)
    expect((result as { alreadyLocked?: boolean }).alreadyLocked).toBeUndefined()
  })

  it('creates an ACTIVE lock record in Dexie', async () => {
    await acquireLock(SAMPLE_A, TECH_1, 'Tech One')
    const db = getDb()
    const lock = await db.sample_locks.get(SAMPLE_A)
    expect(lock).toBeDefined()
    expect(lock!.status).toBe('ACTIVE')
    expect(lock!.techId).toBe(TECH_1)
    expect(lock!.techName).toBe('Tech One')
  })

  it('emits SAMPLE_LOCK_ACQUIRED audit event on success', async () => {
    await acquireLock(SAMPLE_A, TECH_1, 'Tech One')
    expect(reportSampleLockAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SAMPLE_LOCK_ACQUIRED', sampleId: SAMPLE_A }),
    )
  })

  it('returns { success: true, alreadyLocked: true } when same tech re-acquires', async () => {
    await acquireLock(SAMPLE_A, TECH_1, 'Tech One')
    vi.clearAllMocks()
    const result = await acquireLock(SAMPLE_A, TECH_1, 'Tech One')
    expect(result.success).toBe(true)
    expect((result as { alreadyLocked?: boolean }).alreadyLocked).toBe(true)
    // No new audit event for idempotent re-acquire
    expect(reportSampleLockAuditEvent).not.toHaveBeenCalled()
  })

  it('returns { success: false } when locked by a different tech', async () => {
    await acquireLock(SAMPLE_A, TECH_1, 'Tech One')
    const result = await acquireLock(SAMPLE_A, TECH_2, 'Tech Two')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.lockedBy).toBe('Tech One')
      expect(result.lockedAt).toBeDefined()
    }
  })

  it('allows concurrent independent samples to be locked by different techs', async () => {
    const r1 = await acquireLock(SAMPLE_A, TECH_1, 'Tech One')
    const r2 = await acquireLock(SAMPLE_B, TECH_2, 'Tech Two')
    expect(r1.success).toBe(true)
    expect(r2.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// releaseLock
// ---------------------------------------------------------------------------

describe('releaseLock', () => {
  beforeEach(async () => {
    await clearLocks()
    vi.clearAllMocks()
  })

  it('marks lock as RELEASED', async () => {
    await acquireLock(SAMPLE_A, TECH_1, 'Tech One')
    vi.clearAllMocks()

    await releaseLock(SAMPLE_A, TECH_1, 'MANUAL')

    const db = getDb()
    const lock = await db.sample_locks.get(SAMPLE_A)
    expect(lock!.status).toBe('RELEASED')
  })

  it('emits SAMPLE_LOCK_RELEASED audit event', async () => {
    await acquireLock(SAMPLE_A, TECH_1, 'Tech One')
    vi.clearAllMocks()

    await releaseLock(SAMPLE_A, TECH_1, 'RESULT_ENTERED')
    expect(reportSampleLockAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SAMPLE_LOCK_RELEASED', sampleId: SAMPLE_A }),
    )
  })

  it('adds a lock-released custody event', async () => {
    await acquireLock(SAMPLE_A, TECH_1, 'Tech One')
    await releaseLock(SAMPLE_A, TECH_1, 'MANUAL')

    const db = getDb()
    const events = await db.custody_events.where('sampleId').equals(SAMPLE_A).toArray()
    const releaseEvent = events.find((e) => e.eventType === 'lock-released')
    expect(releaseEvent).toBeDefined()
  })

  it('is a no-op when no active lock exists', async () => {
    // Should not throw
    await expect(releaseLock(SAMPLE_A, TECH_1, 'MANUAL')).resolves.toBeUndefined()
    expect(reportSampleLockAuditEvent).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// checkExpiredLocks + autoReleaseLock
// ---------------------------------------------------------------------------

describe('checkExpiredLocks', () => {
  beforeEach(async () => {
    await clearLocks()
    vi.clearAllMocks()
  })

  it('returns empty array when no locks are expired', async () => {
    await acquireLock(SAMPLE_A, TECH_1, 'Tech One') // fresh lock
    const expired = await checkExpiredLocks()
    expect(expired).toHaveLength(0)
  })

  it('returns expired locks past their expiresAt', async () => {
    const db = getDb()
    const pastExpiry = new Date(Date.now() - 1000).toISOString()
    await db.sample_locks.put({
      sampleId: SAMPLE_A,
      techId: TECH_1,
      techName: 'Tech One',
      lockedAt: new Date(Date.now() - 5 * 3_600_000).toISOString(),
      expiresAt: pastExpiry,
      status: 'ACTIVE',
    })

    const expired = await checkExpiredLocks()
    expect(expired).toHaveLength(1)
    expect(expired[0]!.sampleId).toBe(SAMPLE_A)
  })
})

describe('autoReleaseLock', () => {
  beforeEach(async () => {
    await clearLocks()
    vi.clearAllMocks()
  })

  it('marks lock EXPIRED and emits audit event', async () => {
    const db = getDb()
    const lock = {
      sampleId: SAMPLE_A,
      techId: TECH_1,
      techName: 'Tech One',
      lockedAt: new Date(Date.now() - 5 * 3_600_000).toISOString(),
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      status: 'ACTIVE' as const,
    }
    await db.sample_locks.put(lock)

    await autoReleaseLock(lock)

    const updated = await db.sample_locks.get(SAMPLE_A)
    expect(updated!.status).toBe('EXPIRED')
    expect(reportSampleLockAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SAMPLE_LOCK_EXPIRED', sampleId: SAMPLE_A }),
    )
  })

  it('queues a manager notification sync event', async () => {
    const db = getDb()
    const lock = {
      sampleId: SAMPLE_A,
      techId: TECH_1,
      techName: 'Tech One',
      lockedAt: new Date(Date.now() - 5 * 3_600_000).toISOString(),
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      status: 'ACTIVE' as const,
    }
    await db.sample_locks.put(lock)

    await autoReleaseLock(lock)

    const queue = await db.syncQueue.toArray()
    const notification = queue.find((q) => q.resourceType === 'SAMPLE_LOCK_NOTIFICATION')
    expect(notification).toBeDefined()
    expect(notification!.payload.type).toBe('LOCK_EXPIRED')
  })
})

// ---------------------------------------------------------------------------
// requestRelease
// ---------------------------------------------------------------------------

describe('requestRelease', () => {
  beforeEach(async () => {
    await clearLocks()
    vi.clearAllMocks()
  })

  it('queues a SAMPLE_LOCK_REQUEST sync event', async () => {
    await acquireLock(SAMPLE_A, TECH_1, 'Tech One')
    vi.clearAllMocks()

    await requestRelease(SAMPLE_A, TECH_2)

    const db = getDb()
    const queue = await db.syncQueue.toArray()
    const request = queue.find((q) => q.resourceType === 'SAMPLE_LOCK_REQUEST')
    expect(request).toBeDefined()
    expect(request!.payload.requestingTechId).toBe(TECH_2)
    expect(request!.payload.lockHolderTechId).toBe(TECH_1)
  })

  it('emits SAMPLE_LOCK_RELEASE_REQUESTED audit event', async () => {
    await acquireLock(SAMPLE_A, TECH_1, 'Tech One')
    vi.clearAllMocks()

    await requestRelease(SAMPLE_A, TECH_2)
    expect(reportSampleLockAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SAMPLE_LOCK_RELEASE_REQUESTED',
        sampleId: SAMPLE_A,
        techId: TECH_2,
      }),
    )
  })

  it('is a no-op when no active lock exists', async () => {
    await expect(requestRelease(SAMPLE_A, TECH_2)).resolves.toBeUndefined()
    const db = getDb()
    const queue = await db.syncQueue.toArray()
    expect(queue.filter((q) => q.resourceType === 'SAMPLE_LOCK_REQUEST')).toHaveLength(0)
  })
})
