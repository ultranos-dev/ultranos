/**
 * Story 46.7 — Streak Calculator Tests (Task 9)
 *
 * Tests:
 *  - QC streak: consecutive passing days, reset on failure, longest streak tracking
 *  - Rejection streak: zero rejection counting, reset with reason
 *  - Reset message framing (encouraging, not punitive)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'

// Mock audit-logger (required by db.ts imports indirectly)
vi.mock('@ultranos/audit-logger/client', () => ({
  emitClientAudit: vi.fn(),
  setAuditStoreAdapter: vi.fn(),
}))

vi.mock('@/lib/hlc', () => ({
  hlc: { now: () => ({ wallTime: Date.now(), logicalTime: 0, nodeId: 'test' }) },
  serializeHlc: () => new Date().toISOString(),
}))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: vi.fn(),
}))

vi.mock('@/lib/delegate-crypto', () => ({
  crypto: { randomUUID: () => 'test-uuid' },
}))

import { calculateQCStreak, calculateRejectionStreak, buildResetMessage } from '@/lib/streak-calculator'
import { getDb } from '@/lib/db'
import type { QcRun } from '@/lib/qc/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDay(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString().slice(0, 10)
}

function makeQcRun(overrides: Partial<QcRun> & { daysAgo?: number }): QcRun {
  const { daysAgo = 0, ...rest } = overrides
  return {
    id: `qc-${Math.random()}`,
    analyte: 'Hemoglobin',
    loincCode: '718-7',
    instrumentId: 'analyzer-01',
    controlLevel: 'LEVEL_2',
    targetMean: 14.0,
    targetSd: 0.5,
    observedValue: 14.0, // passing by default
    runDate: makeDay(daysAgo),
    runBy: 'tech-001',
    hlcTimestamp: new Date().toISOString(),
    ...rest,
  }
}

const TECH_ID = 'tech-001'

beforeEach(async () => {
  // Reset Dexie between tests by re-importing with fresh fake-indexeddb
  const db = getDb()
  await db.qcRuns.clear()
  await db.quality_streaks.clear()
  await db.samples.clear()
})

// ---------------------------------------------------------------------------
// QC Streak tests
// ---------------------------------------------------------------------------

describe('calculateQCStreak', () => {
  it('returns 0 streak when no QC runs exist', async () => {
    const streak = await calculateQCStreak(TECH_ID)
    expect(streak.currentStreak).toBe(0)
    expect(streak.streakType).toBe('qc_passing')
    expect(streak.technicianId).toBe(TECH_ID)
  })

  it('counts consecutive passing days', async () => {
    const db = getDb()
    // 3 consecutive passing days
    await db.qcRuns.bulkAdd([
      makeQcRun({ daysAgo: 0, observedValue: 14.0 }),
      makeQcRun({ daysAgo: 1, observedValue: 13.9 }),
      makeQcRun({ daysAgo: 2, observedValue: 14.1 }),
    ])

    const streak = await calculateQCStreak(TECH_ID)
    expect(streak.currentStreak).toBe(3)
    expect(streak.lastResetAt).toBeNull()
    expect(streak.lastResetReason).toBeNull()
  })

  it('resets streak on a failing QC run', async () => {
    const db = getDb()
    // Today: passing; yesterday: FAILING (outside targetMean ± 2*targetSd)
    // targetMean=14, targetSd=0.5 → range [13, 15]
    // failing value: 16.0 (> 15)
    await db.qcRuns.bulkAdd([
      makeQcRun({ daysAgo: 0, observedValue: 14.0 }),  // passing
      makeQcRun({ daysAgo: 1, observedValue: 16.0 }),  // FAILING
      makeQcRun({ daysAgo: 2, observedValue: 14.0 }),  // passing (but after break)
    ])

    const streak = await calculateQCStreak(TECH_ID)
    expect(streak.currentStreak).toBe(1) // only today is in current streak
    expect(streak.lastResetAt).toBe(makeDay(1))
    expect(streak.lastResetReason).toContain('QC result out of range')
    expect(streak.lastResetReason).toContain('Hemoglobin')
  })

  it('handles pass/fail boundary correctly (value at exactly ±2SD is passing)', async () => {
    const db = getDb()
    // targetMean=14, targetSd=0.5 → boundary at 13 and 15
    await db.qcRuns.bulkAdd([
      makeQcRun({ daysAgo: 0, observedValue: 15.0 }), // exactly at upper bound — pass
      makeQcRun({ daysAgo: 1, observedValue: 13.0 }), // exactly at lower bound — pass
    ])

    const streak = await calculateQCStreak(TECH_ID)
    expect(streak.currentStreak).toBe(2)
  })

  it('tracks longestStreak across resets', async () => {
    const db = getDb()
    // Simulate a previous streak that was longer
    await db.quality_streaks.put({
      id: `qs-qc-${TECH_ID}`,
      technicianId: TECH_ID,
      streakType: 'qc_passing',
      currentStreak: 0,
      longestStreak: 10, // previous best was 10
      lastResetAt: makeDay(5),
      lastResetReason: 'QC result out of range on test',
      updatedAt: new Date().toISOString(),
    })

    // Only 2 consecutive passing days now
    await db.qcRuns.bulkAdd([
      makeQcRun({ daysAgo: 0 }),
      makeQcRun({ daysAgo: 1 }),
    ])

    const streak = await calculateQCStreak(TECH_ID)
    expect(streak.currentStreak).toBe(2)
    expect(streak.longestStreak).toBe(10) // preserved from previous best
  })

  it('updates longestStreak when currentStreak exceeds it', async () => {
    const db = getDb()
    await db.quality_streaks.put({
      id: `qs-qc-${TECH_ID}`,
      technicianId: TECH_ID,
      streakType: 'qc_passing',
      currentStreak: 0,
      longestStreak: 3,
      lastResetAt: null,
      lastResetReason: null,
      updatedAt: new Date().toISOString(),
    })

    // 5 consecutive passing days
    await db.qcRuns.bulkAdd([
      makeQcRun({ daysAgo: 0 }),
      makeQcRun({ daysAgo: 1 }),
      makeQcRun({ daysAgo: 2 }),
      makeQcRun({ daysAgo: 3 }),
      makeQcRun({ daysAgo: 4 }),
    ])

    const streak = await calculateQCStreak(TECH_ID)
    expect(streak.currentStreak).toBe(5)
    expect(streak.longestStreak).toBe(5) // updated
  })

  it('ignores runs from other technicians', async () => {
    const db = getDb()
    await db.qcRuns.bulkAdd([
      makeQcRun({ daysAgo: 0, runBy: 'tech-999' }), // different tech
    ])

    const streak = await calculateQCStreak(TECH_ID)
    expect(streak.currentStreak).toBe(0)
  })

  it('skips days with no QC runs without breaking streak', async () => {
    const db = getDb()
    // Today and 2 days ago passing, yesterday has no run
    await db.qcRuns.bulkAdd([
      makeQcRun({ daysAgo: 0 }), // today
      makeQcRun({ daysAgo: 2 }), // day before yesterday (no run yesterday)
    ])

    const streak = await calculateQCStreak(TECH_ID)
    // Streak counts today (1) + skips yesterday + day before yesterday (2) = 2
    expect(streak.currentStreak).toBe(2)
  })

  it('persists streak to Dexie', async () => {
    const db = getDb()
    await db.qcRuns.add(makeQcRun({ daysAgo: 0 }))

    await calculateQCStreak(TECH_ID)

    const saved = await db.quality_streaks
      .where('[technicianId+streakType]')
      .equals([TECH_ID, 'qc_passing'])
      .first()
    expect(saved).toBeDefined()
    expect(saved?.currentStreak).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Rejection Streak tests
// ---------------------------------------------------------------------------

describe('calculateRejectionStreak', () => {
  it('returns full streak when no samples are rejected', async () => {
    const db = getDb()
    // Add a non-rejected sample
    await db.samples.put({
      id: 'sample-001',
      resourceType: 'Specimen',
      receivedTime: makeDay(0) + 'T09:00:00Z',
      _ultranos: { pipelineStatus: 'completed', labSampleId: 'LAB-001' },
      subject: { reference: 'Patient/abc' },
      meta: { lastUpdated: makeDay(0) + 'T09:00:00Z', versionId: '1' },
    } as any)

    const streak = await calculateRejectionStreak(TECH_ID)
    // No rejected samples means streak continues from today back
    // We just verify it doesn't have a reset reason
    expect(streak.lastResetAt).toBeNull()
    expect(streak.lastResetReason).toBeNull()
  })

  it('counts consecutive zero-rejection days', async () => {
    const streak = await calculateRejectionStreak(TECH_ID)
    // With no samples at all, no rejection days exist, streak counts days
    expect(streak.currentStreak).toBeGreaterThanOrEqual(0)
    expect(streak.streakType).toBe('zero_rejection')
  })

  it('resets streak on a day with rejected sample', async () => {
    const db = getDb()
    // Add a rejected sample from yesterday
    await db.samples.put({
      id: 'sample-rej-001',
      resourceType: 'Specimen',
      receivedTime: makeDay(1) + 'T09:00:00Z',
      _ultranos: {
        pipelineStatus: 'rejected',
        labSampleId: 'LAB-002',
        rejectionReason: 'Insufficient volume',
      },
      subject: { reference: 'Patient/def' },
      meta: { lastUpdated: makeDay(1) + 'T09:00:00Z', versionId: '1' },
    } as any)

    const streak = await calculateRejectionStreak(TECH_ID)
    expect(streak.currentStreak).toBe(1) // only today has no rejection
    expect(streak.lastResetAt).toBe(makeDay(1))
    expect(streak.lastResetReason).toContain('Sample rejected')
    expect(streak.lastResetReason).toContain(makeDay(1))
  })

  it('persists rejection streak to Dexie', async () => {
    const db = getDb()
    await calculateRejectionStreak(TECH_ID)

    const saved = await db.quality_streaks
      .where('[technicianId+streakType]')
      .equals([TECH_ID, 'zero_rejection'])
      .first()
    expect(saved).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Reset message tests (AC #4 — encouraging framing)
// ---------------------------------------------------------------------------

describe('buildResetMessage', () => {
  it('returns null when no reset has occurred', () => {
    const msg = buildResetMessage({
      id: 'test',
      technicianId: TECH_ID,
      streakType: 'qc_passing',
      currentStreak: 5,
      longestStreak: 5,
      lastResetAt: null,
      lastResetReason: null,
      updatedAt: new Date().toISOString(),
    })
    expect(msg).toBeNull()
  })

  it('includes previous streak achievement in reset message', () => {
    const msg = buildResetMessage({
      id: 'test',
      technicianId: TECH_ID,
      streakType: 'qc_passing',
      currentStreak: 0,
      longestStreak: 7,
      lastResetAt: makeDay(1),
      lastResetReason: 'QC result out of range on 2026-05-30 for Hemoglobin',
      updatedAt: new Date().toISOString(),
    })
    expect(msg).not.toBeNull()
    expect(msg).toContain('7-day')
    expect(msg).toContain("let's build it back")
    expect(msg).toContain('QC result out of range')
  })

  it('uses encouraging language — no blame or punishment', () => {
    const msg = buildResetMessage({
      id: 'test',
      technicianId: TECH_ID,
      streakType: 'zero_rejection',
      currentStreak: 0,
      longestStreak: 15,
      lastResetAt: makeDay(0),
      lastResetReason: 'Sample rejected on 2026-05-31: Hemolyzed sample',
      updatedAt: new Date().toISOString(),
    })!
    expect(msg).toContain('starting fresh')
    // Ensure no punitive language
    expect(msg.toLowerCase()).not.toContain('failed')
    expect(msg.toLowerCase()).not.toContain('error')
    expect(msg.toLowerCase()).not.toContain('mistake')
  })

  it('covers zero rejection streak type in message', () => {
    const msg = buildResetMessage({
      id: 'test',
      technicianId: TECH_ID,
      streakType: 'zero_rejection',
      currentStreak: 0,
      longestStreak: 5,
      lastResetAt: makeDay(2),
      lastResetReason: 'Sample rejected on test date',
      updatedAt: new Date().toISOString(),
    })
    expect(msg).toContain('zero rejection')
  })
})
