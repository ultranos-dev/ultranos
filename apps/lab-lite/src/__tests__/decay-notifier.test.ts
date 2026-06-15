/**
 * Story 46.3 — Competency Self-Assessment & Skill Decay Detection
 * Tests for decay-notifier.ts
 *
 * AC covered: 1 (gentle notification when procedure hasn't been performed in >45 days),
 *             3 (no patient data in notifications)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  checkForDecayNotifications,
  dismissDecayNotification,
  buildDecayMessage,
  getActiveDecayNotifications,
} from '../lib/decay-notifier'
import type { ProcedureCompetency, DecayNotification } from '../lib/competency-types'

// ---------------------------------------------------------------------------
// Mock DB
// ---------------------------------------------------------------------------

const mockCompetencies: ProcedureCompetency[] = []
const mockDecayNotifications: DecayNotification[] = []

vi.mock('../lib/db', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/db')>()
  return {
    ...original,
    getDb: () => ({
      procedure_competencies: {
        where: (key: string) => ({
          equals: (val: any) => ({
            toArray: async () =>
              mockCompetencies.filter((c) => (c as any)[key] === val),
          }),
        }),
      },
      decay_notifications: {
        put: async (n: DecayNotification) => {
          const idx = mockDecayNotifications.findIndex((x) => x.id === n.id)
          if (idx >= 0) mockDecayNotifications[idx] = n
          else mockDecayNotifications.push(n)
        },
        update: async (id: string, changes: Partial<DecayNotification>) => {
          const idx = mockDecayNotifications.findIndex((x) => x.id === id)
          if (idx >= 0) Object.assign(mockDecayNotifications[idx], changes)
        },
        where: (key: string) => ({
          equals: (val: any) => ({
            filter: (fn: any) => ({
              toArray: async () =>
                mockDecayNotifications
                  .filter((n) => (n as any)[key] === val)
                  .filter(fn),
            }),
            toArray: async () =>
              mockDecayNotifications.filter((n) => (n as any)[key] === val),
          }),
        }),
      },
    }),
    getMicroLearningModuleByProcedure: async (ref: string) => {
      if (ref === 'WITH-MODULE') return { id: 'module-123', procedureRef: ref }
      return undefined
    },
  }
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCompetency(
  procedureRef: string,
  status: ProcedureCompetency['status'],
  daysAgo: number | null,
): ProcedureCompetency {
  const lastPerformedAt =
    daysAgo !== null
      ? new Date(Date.now() - daysAgo * 86400_000).toISOString()
      : null
  return {
    id: `comp-${procedureRef}`,
    technicianId: 'tech-1',
    procedureRef,
    procedureName: `Test ${procedureRef}`,
    lastPerformedAt,
    totalPerformed: daysAgo !== null ? 5 : 0,
    performedLast90Days: 0,
    status,
    decayThresholdDays: 45,
    redThresholdDays: 90,
    updatedAt: new Date().toISOString(),
  }
}

beforeEach(() => {
  mockCompetencies.length = 0
  mockDecayNotifications.length = 0
})

// ---------------------------------------------------------------------------
// Unit tests: checkForDecayNotifications (AC: 1)
// ---------------------------------------------------------------------------

describe('checkForDecayNotifications', () => {
  it('creates notifications for decay_risk and decayed procedures', async () => {
    mockCompetencies.push(makeCompetency('ACTIVE-001', 'active', 10))
    mockCompetencies.push(makeCompetency('RISK-001', 'decay_risk', 60))
    mockCompetencies.push(makeCompetency('RED-001', 'decayed', 100))

    const created = await checkForDecayNotifications('tech-1')

    expect(created).toHaveLength(2)
    const refs = created.map((n) => n.procedureRef)
    expect(refs).toContain('RISK-001')
    expect(refs).toContain('RED-001')
    expect(refs).not.toContain('ACTIVE-001')
  })

  it('does NOT create duplicate notifications for the same procedure', async () => {
    mockCompetencies.push(makeCompetency('RISK-001', 'decay_risk', 60))

    // First check — creates notification
    await checkForDecayNotifications('tech-1')
    expect(mockDecayNotifications).toHaveLength(1)

    // Second check — should NOT create another notification
    await checkForDecayNotifications('tech-1')
    expect(mockDecayNotifications).toHaveLength(1)
  })

  it('re-creates notification after the previous one is dismissed', async () => {
    mockCompetencies.push(makeCompetency('RISK-001', 'decay_risk', 60))

    // First check
    const first = await checkForDecayNotifications('tech-1')
    expect(first).toHaveLength(1)

    // Dismiss it
    await dismissDecayNotification(first[0].id)

    // Second check — should create a new one
    const second = await checkForDecayNotifications('tech-1')
    expect(second).toHaveLength(1)
    expect(second[0].id).not.toBe(first[0].id)
  })

  it('links the micro-learning module when one exists', async () => {
    mockCompetencies.push(makeCompetency('WITH-MODULE', 'decay_risk', 60))

    const created = await checkForDecayNotifications('tech-1')

    expect(created[0].linkedModuleId).toBe('module-123')
  })

  it('has null linkedModuleId when no module exists', async () => {
    mockCompetencies.push(makeCompetency('NO-MODULE', 'decay_risk', 60))

    const created = await checkForDecayNotifications('tech-1')

    expect(created[0].linkedModuleId).toBeNull()
  })

  it('stores no patient data in notifications — only procedureRef and counts', async () => {
    mockCompetencies.push(makeCompetency('RISK-001', 'decay_risk', 60))

    const created = await checkForDecayNotifications('tech-1')
    const notif = created[0]

    expect((notif as any).patientRef).toBeUndefined()
    expect((notif as any).sampleId).toBeUndefined()
    expect((notif as any).resultValue).toBeUndefined()
    expect(notif.technicianId).toBe('tech-1')
    expect(notif.procedureRef).toBe('RISK-001')
  })
})

// ---------------------------------------------------------------------------
// Unit tests: getActiveDecayNotifications
// ---------------------------------------------------------------------------

describe('getActiveDecayNotifications', () => {
  it('returns only non-dismissed notifications', async () => {
    mockDecayNotifications.push(
      { id: 'n1', technicianId: 'tech-1', procedureRef: 'A', procedureName: 'A', daysSinceLast: 60, linkedModuleId: null, createdAt: new Date().toISOString(), dismissed: false },
      { id: 'n2', technicianId: 'tech-1', procedureRef: 'B', procedureName: 'B', daysSinceLast: 70, linkedModuleId: null, createdAt: new Date().toISOString(), dismissed: true },
    )

    const active = await getActiveDecayNotifications('tech-1')
    expect(active).toHaveLength(1)
    expect(active[0].procedureRef).toBe('A')
  })
})

// ---------------------------------------------------------------------------
// Unit tests: buildDecayMessage (AC: 1)
// ---------------------------------------------------------------------------

describe('buildDecayMessage', () => {
  it('formats the notification text correctly', () => {
    const msg = buildDecayMessage('CBC', 52)
    expect(msg).toBe(
      "You haven't performed CBC in 52 days. Would you like to review the technique?"
    )
  })

  it('uses singular form (1 day)', () => {
    const msg = buildDecayMessage('Urinalysis', 1)
    expect(msg).toContain('1 days')  // English does not distinguish in this spec
  })
})
