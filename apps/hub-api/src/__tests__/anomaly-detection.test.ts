import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({ from: vi.fn(), rpc: vi.fn() })),
  db: {
    toRow: (data: any) => data,
    toRowRaw: (data: any) => data,
    fromRow: (data: any) => data,
    fromRowRaw: (data: any) => data,
    fromRows: (data: any[]) => data,
  },
}))

vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({
    emit: vi.fn().mockResolvedValue({}),
  })),
}))

const { runAnomalyDetection } = await import('../jobs/anomaly-detection')

function chainMock(resolveValue: any = { data: null, error: null }) {
  const chain: Record<string, any> = {}
  chain.select = vi.fn().mockReturnValue(chain)
  chain.not = vi.fn().mockReturnValue(chain)
  chain.lte = vi.fn().mockReturnValue(chain)
  chain.gte = vi.fn().mockReturnValue(chain)
  chain.gt = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.in = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockReturnValue(chain)
  chain.limit = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue(resolveValue)
  chain.insert = vi.fn().mockResolvedValue({ data: null, error: null })
  chain.upsert = vi.fn().mockResolvedValue({ data: null, error: null })
  chain.update = vi.fn().mockReturnValue(chain)
  chain.range = vi.fn().mockResolvedValue(resolveValue)
  return chain
}

describe('runAnomalyDetection — CONTROLLED_SUBSTANCE_VOLUME', () => {
  it('identifies providers with >10 controlled substance Rx in one day', async () => {
    const rpcResult = [
      { requester_id: 'doc-1', practitioner_name: 'Dr Smith', prescription_day: '2026-05-14', daily_count: 12 },
    ]

    const mockUpsert = vi.fn().mockResolvedValue({ data: null, error: null })

    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: rpcResult, error: null }),
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'prescribing_anomalies') {
          return { upsert: mockUpsert }
        }
        if (table === 'job_runs') {
          return chainMock()
        }
        // medication_requests or vocabulary_medications (fallback path)
        return chainMock({ data: [], error: null })
      }),
    }

    const result = await runAnomalyDetection(supabase as any)

    expect(result.alertsGenerated).toBe(1)
    expect(result.errors).toBe(0)
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        practitionerId: 'doc-1',
        anomalyType: 'CONTROLLED_SUBSTANCE_VOLUME',
        severity: 'HIGH',
        actualValue: 12,
        threshold: 10,
        status: 'UNREVIEWED',
      }),
      expect.objectContaining({ ignoreDuplicates: true }),
    )
  })

  it('does not flag providers with <=10 Rx/day (RPC returns empty)', async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'job_runs') return chainMock()
        return chainMock({ data: [], error: null })
      }),
    }

    const result = await runAnomalyDetection(supabase as any)

    expect(result.alertsGenerated).toBe(0)
  })
})

describe('runAnomalyDetection — DRUG_FREQUENCY', () => {
  it('identifies providers prescribing same drug to >20% of patients (min 5 patients)', async () => {
    // Provider doc-1 has 6 patients, prescribed drug-A to 3 patients (50% > 20%)
    const prescriptions = [
      { requester_id: 'doc-1', subject_reference: 'pt-1', medication_codeable_concept: 'drug-A', medication_display: 'Drug A', practitioners: { given_name: 'Dr', family_name: 'Smith' } },
      { requester_id: 'doc-1', subject_reference: 'pt-2', medication_codeable_concept: 'drug-A', medication_display: 'Drug A', practitioners: { given_name: 'Dr', family_name: 'Smith' } },
      { requester_id: 'doc-1', subject_reference: 'pt-3', medication_codeable_concept: 'drug-A', medication_display: 'Drug A', practitioners: { given_name: 'Dr', family_name: 'Smith' } },
      { requester_id: 'doc-1', subject_reference: 'pt-4', medication_codeable_concept: 'drug-B', medication_display: 'Drug B', practitioners: { given_name: 'Dr', family_name: 'Smith' } },
      { requester_id: 'doc-1', subject_reference: 'pt-5', medication_codeable_concept: 'drug-C', medication_display: 'Drug C', practitioners: { given_name: 'Dr', family_name: 'Smith' } },
      { requester_id: 'doc-1', subject_reference: 'pt-6', medication_codeable_concept: 'drug-D', medication_display: 'Drug D', practitioners: { given_name: 'Dr', family_name: 'Smith' } },
    ]

    const mockUpsert = vi.fn().mockResolvedValue({ data: null, error: null })

    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'prescribing_anomalies') {
          return { upsert: mockUpsert }
        }
        if (table === 'job_runs') return chainMock()
        if (table === 'medication_requests') {
          const chain = chainMock({ data: prescriptions, error: null })
          // range resolves with the prescription data on first call, empty on second
          let callCount = 0
          chain.range = vi.fn().mockImplementation(() => {
            callCount++
            if (callCount === 1) return Promise.resolve({ data: prescriptions, error: null })
            return Promise.resolve({ data: [], error: null })
          })
          return chain
        }
        return chainMock({ data: [], error: null })
      }),
    }

    const result = await runAnomalyDetection(supabase as any)

    // drug-A was prescribed to 3/6 patients = 50% > 20% threshold (meets min 5 patient guard)
    expect(result.alertsGenerated).toBeGreaterThanOrEqual(1)
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        anomalyType: 'DRUG_FREQUENCY',
        severity: 'MEDIUM',
        status: 'UNREVIEWED',
        triggerIdentifier: 'drug-A',
      }),
      expect.objectContaining({
        onConflict: 'practitioner_id,anomaly_type,date_range_start,date_range_end,trigger_identifier',
        ignoreDuplicates: true,
      }),
    )
  })
})

describe('runAnomalyDetection — deduplication', () => {
  it('uses upsert with ignoreDuplicates to prevent duplicate alerts', async () => {
    const rpcResult = [
      { requester_id: 'doc-1', practitioner_name: 'Dr Smith', prescription_day: '2026-05-14', daily_count: 15 },
    ]

    const mockUpsert = vi.fn().mockResolvedValue({ data: null, error: null })

    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: rpcResult, error: null }),
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'prescribing_anomalies') {
          return { upsert: mockUpsert }
        }
        if (table === 'job_runs') return chainMock()
        return chainMock({ data: [], error: null })
      }),
    }

    await runAnomalyDetection(supabase as any)

    // Verify upsert called with onConflict and ignoreDuplicates
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        onConflict: 'practitioner_id,anomaly_type,date_range_start,date_range_end',
        ignoreDuplicates: true,
      }),
    )
  })
})

describe('runAnomalyDetection — severity auto-classification', () => {
  it('classifies CONTROLLED_SUBSTANCE_VOLUME as HIGH severity', async () => {
    const rpcResult = [
      { requester_id: 'doc-1', practitioner_name: 'Dr X', prescription_day: '2026-05-14', daily_count: 11 },
    ]
    const mockUpsert = vi.fn().mockResolvedValue({ data: null, error: null })

    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: rpcResult, error: null }),
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'prescribing_anomalies') return { upsert: mockUpsert }
        if (table === 'job_runs') return chainMock()
        return chainMock({ data: [], error: null })
      }),
    }

    await runAnomalyDetection(supabase as any)

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'HIGH', anomalyType: 'CONTROLLED_SUBSTANCE_VOLUME' }),
      expect.anything(),
    )
  })
})

describe('runAnomalyDetection — job run recording', () => {
  it('records job run in job_runs table', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ data: null, error: null })

    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'job_runs') return { insert: mockInsert }
        return chainMock({ data: [], error: null })
      }),
    }

    await runAnomalyDetection(supabase as any)

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        jobName: 'anomaly-detection',
        status: 'success',
      }),
    )
  })
})
