/**
 * lock-expiry-checker.test.ts — Story 51.3: Sample Collision Prevention
 *
 * Tests: runExpiryCheck, startExpiryChecker / stopExpiryChecker lifecycle
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
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
  runExpiryCheck,
  startExpiryChecker,
  stopExpiryChecker,
  isExpiryCheckerRunning,
} from '../lib/lock-expiry-checker'

const SAMPLE_A = 'LAB-20260531-0011'

async function seedExpiredLock() {
  const db = getDb()
  await db.sample_locks.put({
    sampleId: SAMPLE_A,
    techId: 'tech-001',
    techName: 'Tech One',
    lockedAt: new Date(Date.now() - 5 * 3_600_000).toISOString(),
    expiresAt: new Date(Date.now() - 1000).toISOString(), // already expired
    status: 'ACTIVE',
  })
}

describe('runExpiryCheck', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.sample_locks.clear()
    await db.custody_events.clear()
    await db.syncQueue.clear()
    vi.clearAllMocks()
  })

  it('returns empty array and makes no changes when no locks are expired', async () => {
    const expired = await runExpiryCheck()
    expect(expired).toHaveLength(0)
    const db = getDb()
    const locks = await db.sample_locks.toArray()
    expect(locks).toHaveLength(0)
  })

  it('auto-releases expired locks and returns them', async () => {
    await seedExpiredLock()

    const expired = await runExpiryCheck()

    expect(expired).toHaveLength(1)
    expect(expired[0]!.sampleId).toBe(SAMPLE_A)

    const db = getDb()
    const lock = await db.sample_locks.get(SAMPLE_A)
    expect(lock!.status).toBe('EXPIRED')
  })

  it('does not affect non-expired ACTIVE locks', async () => {
    const db = getDb()
    // A fresh lock expiring in the future
    await db.sample_locks.put({
      sampleId: SAMPLE_A,
      techId: 'tech-001',
      techName: 'Tech One',
      lockedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 4 * 3_600_000).toISOString(),
      status: 'ACTIVE',
    })

    const expired = await runExpiryCheck()

    expect(expired).toHaveLength(0)
    const lock = await db.sample_locks.get(SAMPLE_A)
    expect(lock!.status).toBe('ACTIVE')
  })
})

describe('startExpiryChecker / stopExpiryChecker', () => {
  afterEach(() => {
    // Always clean up the interval after each test
    stopExpiryChecker()
  })

  it('isExpiryCheckerRunning returns false before start', () => {
    expect(isExpiryCheckerRunning()).toBe(false)
  })

  it('isExpiryCheckerRunning returns true after start', () => {
    startExpiryChecker()
    expect(isExpiryCheckerRunning()).toBe(true)
  })

  it('isExpiryCheckerRunning returns false after stop', () => {
    startExpiryChecker()
    stopExpiryChecker()
    expect(isExpiryCheckerRunning()).toBe(false)
  })

  it('calling startExpiryChecker twice does not create duplicate intervals', () => {
    startExpiryChecker()
    startExpiryChecker() // no-op
    expect(isExpiryCheckerRunning()).toBe(true)
    stopExpiryChecker()
    expect(isExpiryCheckerRunning()).toBe(false)
  })
})
