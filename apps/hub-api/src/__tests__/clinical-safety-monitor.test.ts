import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => mockSupabaseClient),
  db: {
    toRow: (data: any) => data,
    toRowRaw: (data: any) => data,
    fromRow: (data: any) => data,
    fromRowRaw: (data: any) => data,
  },
}))

// Mock alert notifier
const mockEmitClinicalSafetyAlert = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/alert-notifier', () => ({
  emitClinicalSafetyAlert: (...args: any[]) => mockEmitClinicalSafetyAlert(...args),
}))

// Mock clinical safety metrics
vi.mock('@/lib/clinical-safety-metrics', () => ({
  contraindicatedOverrideRate: { set: vi.fn() },
  interactionCheckCompletionRate: { set: vi.fn() },
  unresolvedTier1Conflicts: { set: vi.fn() },
  oldestTier1ConflictAgeHours: { set: vi.fn() },
  drugInteractionChecksTotal: { inc: vi.fn() },
  drugInteractionOverridesTotal: { inc: vi.fn() },
  prescriptionsWithoutInteractionCheckTotal: { inc: vi.fn() },
}))

const mockSupabaseClient = {
  from: vi.fn(),
}

const { runClinicalSafetyMonitor } = await import('../jobs/clinical-safety-monitor')

beforeEach(() => {
  vi.clearAllMocks()
})

function createMockFrom(tables: Record<string, any>) {
  return vi.fn().mockImplementation((table: string) => {
    if (tables[table]) return tables[table]
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    }
  })
}

describe('Clinical Safety Monitor', () => {
  describe('CONTRAINDICATED override rate (AC #2)', () => {
    it('triggers P1 alert when override rate >2%', async () => {
      const mockFrom = createMockFrom({
        medication_requests: {
          select: vi.fn().mockImplementation(() => ({
            gte: vi.fn().mockImplementation(() => ({
              // Total checks query (not null)
              not: vi.fn().mockResolvedValue({ count: 100, error: null }),
              // BLOCKED + override query
              eq: vi.fn().mockImplementation(() => ({
                not: vi.fn().mockResolvedValue({ count: 3, error: null }),
              })),
            })),
          })),
        },
        sync_conflicts: {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        },
        job_runs: {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        },
      })
      mockSupabaseClient.from = mockFrom

      const result = await runClinicalSafetyMonitor(mockSupabaseClient as any)

      expect(result.overrideRateAlert).toBe(true)
      expect(result.metrics.overrideRate).toBe(0.03)
      expect(mockEmitClinicalSafetyAlert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          type: 'CONTRAINDICATED_OVERRIDE_RATE',
          severity: 'P1',
        }),
      )
    })

    it('does not trigger alert when override rate <=2%', async () => {
      const mockFrom = createMockFrom({
        medication_requests: {
          select: vi.fn().mockImplementation(() => ({
            gte: vi.fn().mockImplementation(() => ({
              not: vi.fn().mockResolvedValue({ count: 100, error: null }),
              eq: vi.fn().mockImplementation(() => ({
                not: vi.fn().mockResolvedValue({ count: 1, error: null }),
              })),
            })),
          })),
        },
        sync_conflicts: {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        },
        job_runs: {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        },
      })
      mockSupabaseClient.from = mockFrom

      const result = await runClinicalSafetyMonitor(mockSupabaseClient as any)

      expect(result.overrideRateAlert).toBe(false)
      // No P1 CONTRAINDICATED alert should be emitted
      const p1Calls = mockEmitClinicalSafetyAlert.mock.calls.filter(
        (call: any[]) => call[1]?.type === 'CONTRAINDICATED_OVERRIDE_RATE',
      )
      expect(p1Calls).toHaveLength(0)
    })
  })

  describe('Tier 1 conflict age monitoring (AC #3, #6)', () => {
    it('triggers P1 alert for >24h unresolved Tier 1 conflicts', async () => {
      const oldConflictDate = new Date(Date.now() - 30 * 3600 * 1000).toISOString() // 30h old

      const mockFrom = createMockFrom({
        medication_requests: {
          select: vi.fn().mockImplementation(() => ({
            gte: vi.fn().mockImplementation(() => ({
              not: vi.fn().mockResolvedValue({ count: 50, error: null }),
              eq: vi.fn().mockImplementation(() => ({
                not: vi.fn().mockResolvedValue({ count: 0, error: null }),
              })),
            })),
          })),
        },
        sync_conflicts: {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [
                  { id: 'c1', resource_type: 'AllergyIntolerance', patient_ref: 'Patient/p1', created_at: oldConflictDate },
                  { id: 'c2', resource_type: 'MedicationRequest', patient_ref: 'Patient/p2', created_at: oldConflictDate },
                ],
                error: null,
              }),
            }),
          }),
        },
        job_runs: {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        },
      })
      mockSupabaseClient.from = mockFrom

      const result = await runClinicalSafetyMonitor(mockSupabaseClient as any)

      expect(result.tier1ConflictAlert).toBe(true)
      expect(result.metrics.unresolvedTier1Count).toBe(2)

      const tier1Call = mockEmitClinicalSafetyAlert.mock.calls.find(
        (call: any[]) => call[1]?.type === 'TIER1_CONFLICT_AGE',
      )
      expect(tier1Call).toBeDefined()
      expect(tier1Call![1].severity).toBe('P1')
      expect(tier1Call![1].payload.conflictCount).toBe(2)
      expect(tier1Call![1].payload.affectedPatientCount).toBe(2)
      expect(tier1Call![1].payload.conflictTypes).toContain('AllergyIntolerance')
      expect(tier1Call![1].payload.conflictTypes).toContain('MedicationRequest')
    })

    it('does not alert for conflicts <24h old', async () => {
      const recentConflict = new Date(Date.now() - 2 * 3600 * 1000).toISOString() // 2h old

      const mockFrom = createMockFrom({
        medication_requests: {
          select: vi.fn().mockImplementation(() => ({
            gte: vi.fn().mockImplementation(() => ({
              not: vi.fn().mockResolvedValue({ count: 50, error: null }),
              eq: vi.fn().mockImplementation(() => ({
                not: vi.fn().mockResolvedValue({ count: 0, error: null }),
              })),
            })),
          })),
        },
        sync_conflicts: {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [
                  { id: 'c1', resource_type: 'AllergyIntolerance', patient_ref: 'Patient/p1', created_at: recentConflict },
                ],
                error: null,
              }),
            }),
          }),
        },
        job_runs: {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        },
      })
      mockSupabaseClient.from = mockFrom

      const result = await runClinicalSafetyMonitor(mockSupabaseClient as any)

      expect(result.tier1ConflictAlert).toBe(false)
      expect(result.metrics.unresolvedTier1Count).toBe(1)
    })
  })

  describe('Interaction check completion rate (AC #1)', () => {
    it('triggers P2 alert when prescriptions created with UNAVAILABLE check', async () => {
      // Each from('medication_requests') call gets a fresh builder.
      // The completion check does: .select().gte().eq('interaction_check', 'UNAVAILABLE')
      // We need the .eq('interaction_check','UNAVAILABLE') path to return count: 5
      // and the bare .gte() (total prescriptions) to return count: 100
      mockSupabaseClient.from = vi.fn().mockImplementation((table: string) => {
        if (table === 'medication_requests') {
          // Create a mock that supports both chain patterns:
          // Pattern A: .select().gte().not() → { count }  (override rate total checks)
          // Pattern B: .select().gte().eq('interaction_check','BLOCKED').not() → { count }
          // Pattern C: .select().gte() → { count }  (total prescriptions for completion)
          // Pattern D: .select().gte().eq('interaction_check','UNAVAILABLE') → { count }
          return {
            select: vi.fn().mockReturnValue({
              gte: vi.fn().mockImplementation(() => {
                // This object needs to be a thenable (for .gte() resolving directly)
                // AND have .not(), .eq() methods for further chaining
                const chainObj: any = {
                  then: (resolve: any) => resolve({ count: 100, error: null }),
                  not: vi.fn().mockResolvedValue({ count: 100, error: null }),
                  eq: vi.fn().mockImplementation((_col: string, val: string) => {
                    if (val === 'BLOCKED') {
                      return { not: vi.fn().mockResolvedValue({ count: 0, error: null }) }
                    }
                    if (val === 'UNAVAILABLE') {
                      // This is the completion rate UNAVAILABLE check — returns 5
                      return { then: (resolve: any) => resolve({ count: 5, error: null }) }
                    }
                    return { then: (resolve: any) => resolve({ count: 0, error: null }) }
                  }),
                }
                return chainObj
              }),
            }),
          }
        }
        if (table === 'sync_conflicts') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }
        }
        if (table === 'job_runs') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: null, error: null }),
                  }),
                }),
              }),
            }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          }
        }
        return { select: vi.fn().mockResolvedValue({ data: null, error: null }) }
      })

      const result = await runClinicalSafetyMonitor(mockSupabaseClient as any)

      expect(result.completionRateAlert).toBe(true)
      expect(result.metrics.uncheckedPrescriptions).toBe(5)
      const completionCall = mockEmitClinicalSafetyAlert.mock.calls.find(
        (call: any[]) => call[1]?.type === 'INTERACTION_CHECK_INCOMPLETE',
      )
      expect(completionCall).toBeDefined()
      expect(completionCall![1].severity).toBe('P2')
    })
  })

  describe('Alert audit logging (AC #8)', () => {
    it('all alerts are emitted through audit-logged emitClinicalSafetyAlert', async () => {
      // The emitClinicalSafetyAlert function always audit-logs with SYSTEM actor
      // This is verified by the alert-notifier module's implementation
      // Here we verify that the monitor job calls emitClinicalSafetyAlert for alerts
      const oldConflict = new Date(Date.now() - 30 * 3600 * 1000).toISOString()

      mockSupabaseClient.from = vi.fn().mockImplementation((table: string) => {
        if (table === 'medication_requests') {
          return {
            select: vi.fn().mockImplementation(() => ({
              gte: vi.fn().mockImplementation(() => ({
                not: vi.fn().mockResolvedValue({ count: 100, error: null }),
                eq: vi.fn().mockImplementation(() => ({
                  not: vi.fn().mockResolvedValue({ count: 5, error: null }),
                })),
              })),
            })),
          }
        }
        if (table === 'sync_conflicts') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({
                  data: [{ id: 'c1', resource_type: 'AllergyIntolerance', patient_ref: 'Patient/p1', created_at: oldConflict }],
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'job_runs') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: null, error: null }),
                  }),
                }),
              }),
            }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          }
        }
        return { select: vi.fn().mockResolvedValue({ data: null, error: null }) }
      })

      const result = await runClinicalSafetyMonitor(mockSupabaseClient as any)

      // Should have triggered alerts for override rate AND tier 1 conflicts
      expect(result.overrideRateAlert).toBe(true)
      expect(result.tier1ConflictAlert).toBe(true)

      // Each alert goes through emitClinicalSafetyAlert which audit-logs with SYSTEM actor
      expect(mockEmitClinicalSafetyAlert.mock.calls.length).toBeGreaterThanOrEqual(2)
      // At minimum, CONTRAINDICATED_OVERRIDE_RATE and TIER1_CONFLICT_AGE
      const alertTypes = mockEmitClinicalSafetyAlert.mock.calls.map(
        (call: any[]) => call[1]?.type,
      )
      expect(alertTypes).toContain('CONTRAINDICATED_OVERRIDE_RATE')
      expect(alertTypes).toContain('TIER1_CONFLICT_AGE')
    })
  })
})
