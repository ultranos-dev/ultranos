import { describe, it, expect } from 'vitest'
import { analyzeTripRequirements, type TripAnalysis } from '../lib/trip-optimizer'
import type { LabOrderEntry } from '../lib/db'

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeOrder(loincCodes: string[]): LabOrderEntry {
  return {
    orderId: 'order-test',
    patientFirstName: 'TestPatient',
    patientAge: 30,
    patientRef: 'Patient/test-001',
    testsRequested: loincCodes.map((code) => ({ loincCode: code, loincDisplay: code })),
    urgency: 'routine',
    orderingPhysicianName: 'Dr. Test',
    specialInstructions: null,
    status: 'RECEIVED',
    authoredOn: '2026-06-01T08:00:00Z',
    receivedAt: '2026-06-01T08:05:00Z',
    syncedAt: '2026-06-01T08:06:00Z',
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('analyzeTripRequirements', () => {
  describe('recommendation types', () => {
    it('all rapid tests → recommendation: wait', () => {
      const order = makeOrder(['24356-8', '1558-6']) // Urinalysis + Glucose
      const result = analyzeTripRequirements([order], '2026-06-01')
      expect(result.recommendation).toBe('wait')
      expect(result.waitTests).toHaveLength(2)
      expect(result.remoteTests).toHaveLength(0)
      expect(result.returnTests).toHaveLength(0)
      expect(result.optimalReturnDate).toBeNull()
    })

    it('all same-day tests → recommendation: wait', () => {
      const order = makeOrder(['58410-2', '51990-0']) // CBC + BMP
      const result = analyzeTripRequirements([order], '2026-06-01')
      expect(result.recommendation).toBe('wait')
      expect(result.waitTests.length).toBeGreaterThanOrEqual(2)
      expect(result.optimalReturnDate).toBeNull()
    })

    it('extended tests with remoteDelivery: true → recommendation: no-return', () => {
      // Inject a custom extended+remote profile via overrides
      const order = makeOrder(['99-extended'])
      const overrides = {
        '99-extended': {
          loincCode: '99-extended',
          loincDisplay: 'Extended Remote Test',
          tatCategory: 'extended' as const,
          estimatedMinutes: 0,
          estimatedDays: 3,
          canWait: false,
          remoteDelivery: true,
        },
      }
      const result = analyzeTripRequirements([order], '2026-06-01', overrides)
      expect(result.recommendation).toBe('no-return')
      expect(result.remoteTests).toHaveLength(1)
      expect(result.waitTests).toHaveLength(0)
      expect(result.optimalReturnDate).toBeNull()
    })

    it('extended tests without remoteDelivery → recommendation: return-only', () => {
      const order = makeOrder(['99-culture'])
      const overrides = {
        '99-culture': {
          loincCode: '99-culture',
          loincDisplay: 'Culture',
          tatCategory: 'extended' as const,
          estimatedMinutes: 0,
          estimatedDays: 5,
          canWait: false,
          remoteDelivery: false,
        },
      }
      const result = analyzeTripRequirements([order], '2026-06-01', overrides)
      expect(result.recommendation).toBe('return-only')
      expect(result.returnTests).toHaveLength(1)
      expect(result.optimalReturnDate).not.toBeNull()
    })

    it('mixed rapid + extended (no remote) → recommendation: wait-and-return', () => {
      const order = makeOrder(['24356-8', '99-culture']) // rapid + extended
      const overrides = {
        '99-culture': {
          loincCode: '99-culture',
          loincDisplay: 'Culture',
          tatCategory: 'extended' as const,
          estimatedMinutes: 0,
          estimatedDays: 3,
          canWait: false,
          remoteDelivery: false,
        },
      }
      const result = analyzeTripRequirements([order], '2026-06-01', overrides)
      expect(result.recommendation).toBe('wait-and-return')
      expect(result.waitTests.length).toBeGreaterThanOrEqual(1)
      expect(result.returnTests.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('estimatedWaitMinutes', () => {
    it('is the max of all wait test estimatedMinutes', () => {
      // Urinalysis=20, Glucose=15 → max=20
      const order = makeOrder(['24356-8', '1558-6'])
      const result = analyzeTripRequirements([order], '2026-06-01')
      expect(result.estimatedWaitMinutes).toBe(20)
    })

    it('is 0 when no wait tests', () => {
      const order = makeOrder(['99-culture'])
      const overrides = {
        '99-culture': {
          loincCode: '99-culture',
          loincDisplay: 'Culture',
          tatCategory: 'extended' as const,
          estimatedMinutes: 0,
          estimatedDays: 3,
          canWait: false,
          remoteDelivery: false,
        },
      }
      const result = analyzeTripRequirements([order], '2026-06-01', overrides)
      expect(result.estimatedWaitMinutes).toBe(0)
    })
  })

  describe('optimalReturnDate', () => {
    it('calculates return date = today + max(extended days), skipping Thu-Fri', () => {
      // 2026-06-01 Monday + 3 business days → skip Thu 06-04 + Fri 06-05 → Sat 06-06
      const order = makeOrder(['99-culture'])
      const overrides = {
        '99-culture': {
          loincCode: '99-culture',
          loincDisplay: 'Culture',
          tatCategory: 'extended' as const,
          estimatedMinutes: 0,
          estimatedDays: 3,
          canWait: false,
          remoteDelivery: false,
        },
      }
      const result = analyzeTripRequirements([order], '2026-06-01', overrides)
      expect(result.optimalReturnDate).toBe('2026-06-06')
    })

    it('uses the maximum extended days across multiple return tests', () => {
      const order = makeOrder(['99-culture3', '99-culture5'])
      const overrides = {
        '99-culture3': {
          loincCode: '99-culture3',
          loincDisplay: 'Culture 3d',
          tatCategory: 'extended' as const,
          estimatedMinutes: 0,
          estimatedDays: 3,
          canWait: false,
          remoteDelivery: false,
        },
        '99-culture5': {
          loincCode: '99-culture5',
          loincDisplay: 'Culture 5d',
          tatCategory: 'extended' as const,
          estimatedMinutes: 0,
          estimatedDays: 5,
          canWait: false,
          remoteDelivery: false,
        },
      }
      const result = analyzeTripRequirements([order], '2026-06-01', overrides)
      // max is 5 days from 2026-06-01 Mon
      // +1=Tue 06-02, +2=Wed 06-03, +3=Sat 06-06, +4=Sun 06-07, +5=Mon 06-08
      expect(result.optimalReturnDate).toBe('2026-06-08')
    })

    it('is null when no return tests exist', () => {
      const order = makeOrder(['24356-8'])
      const result = analyzeTripRequirements([order], '2026-06-01')
      expect(result.optimalReturnDate).toBeNull()
    })
  })

  describe('edge cases', () => {
    it('zero orders → returns empty analysis with no recommendation shown', () => {
      const result = analyzeTripRequirements([], '2026-06-01')
      expect(result.waitTests).toHaveLength(0)
      expect(result.remoteTests).toHaveLength(0)
      expect(result.returnTests).toHaveLength(0)
      expect(result.estimatedWaitMinutes).toBe(0)
      expect(result.optimalReturnDate).toBeNull()
      expect(result.recommendation).toBe('wait') // default to wait when nothing
    })

    it('unknown LOINC code is silently skipped (no crash)', () => {
      const order = makeOrder(['UNKNOWN-CODE'])
      expect(() => analyzeTripRequirements([order], '2026-06-01')).not.toThrow()
    })

    it('multiple orders are merged — deduplicates same LOINC test', () => {
      const order1 = makeOrder(['24356-8'])
      const order2 = makeOrder(['24356-8', '1558-6'])
      const result = analyzeTripRequirements([order1, order2], '2026-06-01')
      // Should have exactly 2 unique tests (Urinalysis + Glucose), not 3
      const totalTests = result.waitTests.length + result.remoteTests.length + result.returnTests.length
      expect(totalTests).toBe(2)
    })
  })
})
