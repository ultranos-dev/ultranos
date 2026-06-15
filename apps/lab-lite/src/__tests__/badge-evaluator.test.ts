/**
 * Story 46.7 — Badge Evaluator Tests (Task 9)
 *
 * Tests:
 *  - Requirement matching for all badge types
 *  - Newly earned badge detection
 *  - Idempotency (no duplicate badges)
 *  - Non-comparative language verification
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'

vi.mock('@ultranos/audit-logger/client', () => ({
  emitClientAudit: vi.fn(),
  setAuditStoreAdapter: vi.fn(),
}))
vi.mock('@/lib/hlc', () => ({
  hlc: { now: () => ({ wallTime: Date.now(), logicalTime: 0, nodeId: 'test' }) },
  serializeHlc: () => new Date().toISOString(),
}))
vi.mock('@/stores/auth-session-store', () => ({ useAuthSessionStore: vi.fn() }))
vi.mock('@/lib/delegate-crypto', () => ({
  crypto: { randomUUID: () => 'test-uuid' },
}))

import { evaluateBadges, seedBadgeCatalogue, getEarnedBadges } from '@/lib/badge-evaluator'
import { BADGE_CATALOGUE } from '@/lib/badge-definitions'
import { getDb } from '@/lib/db'

const TECH_ID = 'tech-badge-test'

beforeEach(async () => {
  const db = getDb()
  await db.quality_streaks.clear()
  await db.quality_metrics.clear()
  await db.module_completions.clear()
  await db.micro_learning_modules.clear()
  await db.earned_badges.clear()
  await db.badges.clear()
  await seedBadgeCatalogue()
})

// ---------------------------------------------------------------------------
// Streak badge tests
// ---------------------------------------------------------------------------

describe('streak_days badge evaluation', () => {
  it('awards 7-Day QC Streak badge when currentStreak >= 7', async () => {
    const db = getDb()
    await db.quality_streaks.put({
      id: `qs-qc-${TECH_ID}`,
      technicianId: TECH_ID,
      streakType: 'qc_passing',
      currentStreak: 7,
      longestStreak: 7,
      lastResetAt: null,
      lastResetReason: null,
      updatedAt: new Date().toISOString(),
    })

    const newBadges = await evaluateBadges(TECH_ID)
    const badge7 = newBadges.find((b) => b.badgeId === 'streak-qc-7')
    expect(badge7).toBeDefined()
  })

  it('does NOT award 30-Day streak badge for only 7 days', async () => {
    const db = getDb()
    await db.quality_streaks.put({
      id: `qs-qc-${TECH_ID}`,
      technicianId: TECH_ID,
      streakType: 'qc_passing',
      currentStreak: 7,
      longestStreak: 7,
      lastResetAt: null,
      lastResetReason: null,
      updatedAt: new Date().toISOString(),
    })

    const newBadges = await evaluateBadges(TECH_ID)
    const badge30 = newBadges.find((b) => b.badgeId === 'streak-qc-30')
    expect(badge30).toBeUndefined()
  })

  it('awards badge when longestStreak qualifies even if currentStreak is 0', async () => {
    const db = getDb()
    await db.quality_streaks.put({
      id: `qs-qc-${TECH_ID}`,
      technicianId: TECH_ID,
      streakType: 'qc_passing',
      currentStreak: 0, // current streak reset
      longestStreak: 10, // but had a 10-day streak historically
      lastResetAt: new Date().toISOString().slice(0, 10),
      lastResetReason: 'test',
      updatedAt: new Date().toISOString(),
    })

    const newBadges = await evaluateBadges(TECH_ID)
    const badge7 = newBadges.find((b) => b.badgeId === 'streak-qc-7')
    expect(badge7).toBeDefined() // qualifies via longestStreak
  })
})

// ---------------------------------------------------------------------------
// Training badge tests
// ---------------------------------------------------------------------------

describe('count badge evaluation (training)', () => {
  it('awards First Module badge when 1 completion exists', async () => {
    const db = getDb()
    await db.module_completions.add({
      id: 'comp-1',
      moduleId: 'mod-1',
      technicianId: TECH_ID,
      completedAt: new Date().toISOString(),
      syncStatus: 'synced',
    } as any)

    const newBadges = await evaluateBadges(TECH_ID)
    const firstBadge = newBadges.find((b) => b.badgeId === 'training-first')
    expect(firstBadge).toBeDefined()
  })

  it('awards 5 Modules badge when 5+ completions exist', async () => {
    const db = getDb()
    const completions = Array.from({ length: 5 }, (_, i) => ({
      id: `comp-${i}`,
      moduleId: `mod-${i}`,
      technicianId: TECH_ID,
      completedAt: new Date().toISOString(),
      syncStatus: 'synced',
    }))
    await db.module_completions.bulkAdd(completions as any)

    const newBadges = await evaluateBadges(TECH_ID)
    expect(newBadges.some((b) => b.badgeId === 'training-5')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Quality metric badge tests
// ---------------------------------------------------------------------------

describe('metric_threshold badge evaluation', () => {
  it('awards zero rejection month badge when rejection rate = 0 for current month', async () => {
    const db = getDb()
    const period = new Date().toISOString().slice(0, 7)
    await db.quality_metrics.put({
      id: `qm-rej-${TECH_ID}-${period}`,
      technicianId: TECH_ID,
      metricType: 'rejection_rate',
      period,
      value: 0, // zero rejections
      unit: '%',
      trend: 'stable',
      updatedAt: new Date().toISOString(),
    })

    const newBadges = await evaluateBadges(TECH_ID)
    const zeroRejBadge = newBadges.find((b) => b.badgeId === 'quality-zero-rej-month')
    expect(zeroRejBadge).toBeDefined()
  })

  it('does NOT award zero rejection month badge when rate > 0', async () => {
    const db = getDb()
    const period = new Date().toISOString().slice(0, 7)
    await db.quality_metrics.put({
      id: `qm-rej-${TECH_ID}-${period}`,
      technicianId: TECH_ID,
      metricType: 'rejection_rate',
      period,
      value: 2.5, // has some rejections
      unit: '%',
      trend: 'stable',
      updatedAt: new Date().toISOString(),
    })

    const newBadges = await evaluateBadges(TECH_ID)
    const zeroRejBadge = newBadges.find((b) => b.badgeId === 'quality-zero-rej-month')
    expect(zeroRejBadge).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Idempotency tests
// ---------------------------------------------------------------------------

describe('evaluateBadges idempotency', () => {
  it('does not award the same badge twice', async () => {
    const db = getDb()
    await db.quality_streaks.put({
      id: `qs-qc-${TECH_ID}`,
      technicianId: TECH_ID,
      streakType: 'qc_passing',
      currentStreak: 7,
      longestStreak: 7,
      lastResetAt: null,
      lastResetReason: null,
      updatedAt: new Date().toISOString(),
    })

    const first = await evaluateBadges(TECH_ID)
    const second = await evaluateBadges(TECH_ID)

    // Second evaluation should return no NEW badges (already earned)
    expect(second.find((b) => b.badgeId === 'streak-qc-7')).toBeUndefined()

    // Total earned should still be 1 (not duplicated)
    const total = await getEarnedBadges(TECH_ID)
    const qcBadges = total.filter((e) => e.badgeId === 'streak-qc-7')
    expect(qcBadges).toHaveLength(1)
  })

  it('returns empty array when no new badges qualify', async () => {
    // No streaks, no completions — should have no badges
    const newBadges = await evaluateBadges(TECH_ID)
    expect(newBadges).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Non-comparative language audit (AC #3 — critical design requirement)
// ---------------------------------------------------------------------------

describe('badge catalogue language', () => {
  const COMPARATIVE_WORDS = [
    'leaderboard', 'ranking', 'rank', 'compared', 'better than', 'worse than',
    'top', 'first place', 'second place', 'score', 'versus', 'vs.',
  ]

  it('contains no comparative or competitive language in badge names', () => {
    for (const badge of BADGE_CATALOGUE) {
      for (const word of COMPARATIVE_WORDS) {
        expect(badge.name.toLowerCase()).not.toContain(word)
      }
    }
  })

  it('contains no comparative or competitive language in badge descriptions', () => {
    for (const badge of BADGE_CATALOGUE) {
      for (const word of COMPARATIVE_WORDS) {
        expect(badge.description.toLowerCase()).not.toContain(word)
      }
    }
  })

  it('uses personal "You" language in all badge descriptions', () => {
    for (const badge of BADGE_CATALOGUE) {
      // Each badge description should reference the technician's own achievement
      expect(
        badge.description.includes('You') ||
        badge.description.includes('your') ||
        badge.description.includes('Your'),
        `Badge "${badge.name}" missing personal language`
      ).toBe(true)
    }
  })
})
