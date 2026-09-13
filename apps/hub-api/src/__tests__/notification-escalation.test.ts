import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuditEmit = vi.fn().mockResolvedValue({ id: 'audit-1' })

vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({
    emit: mockAuditEmit,
  })),
}))

const mockInsertReturn = vi.fn().mockReturnValue({
  select: vi.fn().mockReturnValue({
    single: vi.fn().mockResolvedValue({
      data: { id: 'escalation-1' },
      error: null,
    }),
  }),
})

const mockSelectReturn = vi.fn()
const mockUpdateReturn = vi.fn()

const mockFrom = vi.fn(() => ({
  insert: mockInsertReturn,
  select: mockSelectReturn,
  update: mockUpdateReturn,
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({ from: mockFrom })),
  db: {
    toRow: (data: any) => data,
    toRowRaw: (data: any) => data,
    fromRow: (data: any) => data,
    fromRowRaw: (data: any) => data,
    fromRows: (data: any[]) => data,
  },
}))

const { checkEscalations, CRITICAL_LOINC_CODES } = await import('../services/notification-escalation')

describe('notification-escalation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exports a configurable list of critical LOINC codes', () => {
    expect(CRITICAL_LOINC_CODES).toBeDefined()
    expect(CRITICAL_LOINC_CODES.size).toBeGreaterThan(0)
  })

  it('escalates unacknowledged critical results after 24 hours (AC: 8)', async () => {
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()

    // Mock: find unacknowledged notifications older than 24h
    mockSelectReturn.mockReturnValue({
      in: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          lt: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'n-old-1',
                  recipient_ref: 'doctor-1',
                  recipient_role: 'CLINICIAN',
                  type: 'LAB_RESULT_AVAILABLE',
                  payload: JSON.stringify({
                    testCategory: 'Blood Glucose',
                    labName: 'Lab A',
                    diagnosticReportId: 'report-1',
                  }),
                  status: 'SENT',
                  created_at: twentyFiveHoursAgo,
                  retry_count: 0,
                },
              ],
              error: null,
            }),
          }),
        }),
      }),
    })

    // Mock update for re-send
    mockUpdateReturn.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })

    const supabase = { from: mockFrom } as never

    const result = await checkEscalations(supabase)

    expect(result.escalated24h).toBe(1)
    // Should have created an escalation notification
    expect(mockInsertReturn).toHaveBeenCalled()
  })

  it('alerts back-office team after 48 hours unacknowledged (AC: 9)', async () => {
    const fiftyHoursAgo = new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString()

    mockSelectReturn.mockReturnValue({
      in: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          lt: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'n-old-2',
                  recipient_ref: 'doctor-1',
                  recipient_role: 'CLINICIAN',
                  type: 'LAB_RESULT_ESCALATION',
                  payload: JSON.stringify({
                    testCategory: 'Blood Glucose',
                    labName: 'Lab A',
                    diagnosticReportId: 'report-1',
                  }),
                  status: 'SENT',
                  created_at: fiftyHoursAgo,
                  retry_count: 1,
                },
              ],
              error: null,
            }),
          }),
        }),
      }),
    })

    mockUpdateReturn.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })

    const supabase = { from: mockFrom } as never

    const result = await checkEscalations(supabase)

    expect(result.escalated48h).toBe(1)
    // Should emit audit event for back-office escalation
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        resourceType: 'NOTIFICATION',
        metadata: expect.objectContaining({
          notificationAction: 'escalated_48h_backoffice',
        }),
      }),
    )
  })

  it('escalates when loincCode is a critical code with surrounding whitespace (trim-normalization)', async () => {
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()

    // ' 4548-4 ' — critical code with leading/trailing whitespace; would fail exact-match without trim
    mockSelectReturn.mockReturnValue({
      in: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          lt: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'n-ws-1',
                  recipient_ref: 'doctor-ws',
                  recipient_role: 'CLINICIAN',
                  type: 'LAB_RESULT_AVAILABLE',
                  payload: JSON.stringify({
                    testCategory: 'HbA1c',
                    labName: 'Lab A',
                    diagnosticReportId: 'report-ws-1',
                    loincCode: ' 4548-4 ',
                  }),
                  status: 'SENT',
                  created_at: twentyFiveHoursAgo,
                  retry_count: 0,
                },
              ],
              error: null,
            }),
          }),
        }),
      }),
    })

    mockUpdateReturn.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })

    const supabase = { from: mockFrom } as never
    const result = await checkEscalations(supabase)

    // Must escalate — NOT skipped — because ' 4548-4 '.trim() === '4548-4' which IS in CRITICAL_LOINC_CODES
    expect(result.escalated24h).toBe(1)
    expect(result.errors).toBe(0)
  })

  it('does NOT escalate a genuinely non-critical loincCode', async () => {
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()

    mockSelectReturn.mockReturnValue({
      in: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          lt: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'n-noncrit-1',
                  recipient_ref: 'doctor-nc',
                  recipient_role: 'CLINICIAN',
                  type: 'LAB_RESULT_AVAILABLE',
                  payload: JSON.stringify({
                    testCategory: 'Routine Urinalysis',
                    labName: 'Lab B',
                    diagnosticReportId: 'report-nc-1',
                    loincCode: '5811-5', // not in CRITICAL_LOINC_CODES
                  }),
                  status: 'SENT',
                  created_at: twentyFiveHoursAgo,
                  retry_count: 0,
                },
              ],
              error: null,
            }),
          }),
        }),
      }),
    })

    mockUpdateReturn.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })

    const supabase = { from: mockFrom } as never
    const result = await checkEscalations(supabase)

    // Non-critical code — must be skipped
    expect(result.escalated24h).toBe(0)
    expect(result.escalated48h).toBe(0)
  })

  it('escalates when loincCode is missing (fail-safe over-escalation)', async () => {
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()

    mockSelectReturn.mockReturnValue({
      in: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          lt: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'n-missing-loinc',
                  recipient_ref: 'doctor-ml',
                  recipient_role: 'CLINICIAN',
                  type: 'LAB_RESULT_AVAILABLE',
                  payload: JSON.stringify({
                    testCategory: 'Unknown',
                    labName: 'Lab C',
                    diagnosticReportId: 'report-ml-1',
                    // no loincCode field at all
                  }),
                  status: 'SENT',
                  created_at: twentyFiveHoursAgo,
                  retry_count: 0,
                },
              ],
              error: null,
            }),
          }),
        }),
      }),
    })

    mockUpdateReturn.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })

    const supabase = { from: mockFrom } as never
    const result = await checkEscalations(supabase)

    // Missing loincCode → fail-safe: must escalate (not skipped)
    expect(result.escalated24h).toBe(1)
    expect(result.errors).toBe(0)
  })

  it('emits audit events for all escalation actions (AC: 10)', async () => {
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()

    mockSelectReturn.mockReturnValue({
      in: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          lt: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'n-esc-1',
                  recipient_ref: 'doctor-1',
                  recipient_role: 'CLINICIAN',
                  type: 'LAB_RESULT_AVAILABLE',
                  payload: JSON.stringify({
                    testCategory: 'CBC',
                    labName: 'Lab A',
                    diagnosticReportId: 'report-1',
                  }),
                  status: 'SENT',
                  created_at: twentyFiveHoursAgo,
                  retry_count: 0,
                },
              ],
              error: null,
            }),
          }),
        }),
      }),
    })

    mockUpdateReturn.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })

    const supabase = { from: mockFrom } as never

    await checkEscalations(supabase)

    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        resourceType: 'NOTIFICATION',
        metadata: expect.objectContaining({
          notificationAction: expect.stringContaining('escalated'),
        }),
      }),
    )
  })
})
