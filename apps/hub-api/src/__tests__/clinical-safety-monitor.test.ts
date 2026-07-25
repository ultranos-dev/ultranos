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
  // Helper: job_runs mock that supports both autoResolveAlert (.maybeSingle) and insert
  function mockJobRunsTable() {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: null }),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    }
  }

  // Helper: sync_conflicts mock with full chain: .select().eq().in().order().limit()
  function mockSyncConflictsTable(data: any[] = []) {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data, error: null }),
            }),
          }),
        }),
      }),
    }
  }

  // Helper: medication_requests mock that supports:
  // Query 1: .select().gte().not() → { count } (total checks)
  // Query 2: .select().gte().eq().not() → { count } (override count)
  // Query 3 (when overrides>0): .select().gte().eq().not().limit() → { data } (topProviders)
  function mockMedicationRequestsTable(totalCount: number, overrideCount: number) {
    return {
      select: vi.fn().mockImplementation(() => ({
        gte: vi.fn().mockImplementation(() => ({
          // Query 1: .gte().not() → count (total checks with interaction_check not null)
          not: vi.fn().mockResolvedValue({ count: totalCount, error: null }),
          // Query 2+3: .gte().eq() → { not }
          eq: vi.fn().mockImplementation(() => ({
            // Query 2: .eq().not() → count (override count)
            // Query 3: .eq().not().limit() → data (topProviders, when overrides>0)
            not: vi.fn().mockReturnValue({
              // Allow being awaited directly (Query 2) OR chained with .limit() (Query 3)
              then: (resolve: any, reject: any) => Promise.resolve({ count: overrideCount, error: null }).then(resolve, reject),
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          })),
        })),
      })),
    }
  }

  describe('CONTRAINDICATED override rate (AC #2)', () => {
    it('triggers P1 alert when override rate >2%', async () => {
      const mockFrom = createMockFrom({
        medication_requests: mockMedicationRequestsTable(100, 3),
        sync_conflicts: mockSyncConflictsTable([]),
        job_runs: mockJobRunsTable(),
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
        medication_requests: mockMedicationRequestsTable(100, 1),
        sync_conflicts: mockSyncConflictsTable([]),
        job_runs: mockJobRunsTable(),
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
        medication_requests: mockMedicationRequestsTable(50, 0),
        sync_conflicts: mockSyncConflictsTable([
          { id: 'c1', resource_type: 'AllergyIntolerance', patient_ref: 'Patient/p1', created_at: oldConflictDate },
          { id: 'c2', resource_type: 'MedicationRequest', patient_ref: 'Patient/p2', created_at: oldConflictDate },
        ]),
        job_runs: mockJobRunsTable(),
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
        medication_requests: mockMedicationRequestsTable(50, 0),
        sync_conflicts: mockSyncConflictsTable([
          { id: 'c1', resource_type: 'AllergyIntolerance', patient_ref: 'Patient/p1', created_at: recentConflict },
        ]),
        job_runs: mockJobRunsTable(),
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
      // Query 1: .select().gte().not() → { count: 100 } (override rate total checks)
      // Query 2: .select().gte().eq('BLOCKED').not() → { count: 0 } (override count, then topProviders skipped)
      // Query 3: .select().gte() → { count: 100 } (total prescriptions for completion — awaited directly)
      // Query 4: .select().gte().eq('UNAVAILABLE') → { count: 5 } (unchecked)
      mockSupabaseClient.from = vi.fn().mockImplementation((table: string) => {
        if (table === 'medication_requests') {
          return {
            select: vi.fn().mockReturnValue({
              gte: vi.fn().mockImplementation(() => {
                const chainObj: any = {
                  // For Query 3: total prescriptions, awaited directly after .gte()
                  then: (resolve: any, reject: any) => Promise.resolve({ count: 100, error: null }).then(resolve, reject),
                  // For Query 1: .gte().not() → total checks with interaction_check not null
                  not: vi.fn().mockResolvedValue({ count: 100, error: null }),
                  // For Query 2+4: .gte().eq(col, val)
                  eq: vi.fn().mockImplementation((_col: string, val: string) => {
                    if (val === 'BLOCKED') {
                      // Query 2: override count, then topProviders skipped (count=0)
                      return {
                        not: vi.fn().mockReturnValue({
                          then: (resolve: any, reject: any) => Promise.resolve({ count: 0, error: null }).then(resolve, reject),
                          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                        }),
                      }
                    }
                    if (val === 'UNAVAILABLE') {
                      // Query 4: unchecked prescriptions count
                      return { then: (resolve: any, reject: any) => Promise.resolve({ count: 5, error: null }).then(resolve, reject) }
                    }
                    return { then: (resolve: any, reject: any) => Promise.resolve({ count: 0, error: null }).then(resolve, reject) }
                  }),
                }
                return chainObj
              }),
            }),
          }
        }
        if (table === 'sync_conflicts') return mockSyncConflictsTable([])
        if (table === 'job_runs') return mockJobRunsTable()
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

      mockSupabaseClient.from = createMockFrom({
        medication_requests: mockMedicationRequestsTable(100, 5),
        sync_conflicts: mockSyncConflictsTable([
          { id: 'c1', resource_type: 'AllergyIntolerance', patient_ref: 'Patient/p1', created_at: oldConflict },
        ]),
        job_runs: mockJobRunsTable(),
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
