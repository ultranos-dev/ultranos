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

const mockAuditEmit = vi.fn().mockResolvedValue({})

vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({
    emit: mockAuditEmit,
  })),
}))

const { runLicenseExpiryCheck } = await import('../jobs/license-expiry-check')

// ─── Chainable mock builder ───

function chainMock(resolveValue: any = { data: null, error: null }) {
  const chain: Record<string, any> = {}
  chain.select = vi.fn().mockReturnValue(chain)
  chain.not = vi.fn().mockReturnValue(chain)
  chain.lte = vi.fn().mockReturnValue(chain)
  chain.gt = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.in = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockReturnValue(chain)
  chain.limit = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue(resolveValue)
  chain.insert = vi.fn().mockResolvedValue({ data: null, error: null })
  chain.update = vi.fn().mockReturnValue(chain)
  chain.range = vi.fn().mockResolvedValue(resolveValue)
  return chain
}

describe('runLicenseExpiryCheck — auto-suspension', () => {
  beforeEach(() => {
    mockAuditEmit.mockClear()
  })

  it('suspends expired providers and emits audit events', async () => {
    const expiredProviders = [
      { id: 'p1', _ultranos: { licenseExpiry: '2026-05-14', kycStatus: 'ACTIVE' } },
      { id: 'p2', _ultranos: { licenseExpiry: '2026-05-10', kycStatus: 'ACTIVE' } },
    ]

    // Build a supabase mock where:
    //  - First practitioners query (suspension) returns expired providers
    //  - Subsequent practitioner queries (detail fetch, update) succeed
    //  - Notification inserts succeed
    //  - Job runs insert succeeds
    let practitionerQueryCount = 0
    const supabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'job_runs') {
          return chainMock()
        }
        if (table === 'notifications') {
          return chainMock()
        }
        // practitioners
        practitionerQueryCount++
        if (practitionerQueryCount === 1) {
          // First query: find expired providers
          return chainMock({ data: expiredProviders, error: null })
        }
        // Detail fetches and notification queries return provider or empty
        const detailChain = chainMock()
        detailChain.single = vi.fn().mockResolvedValue({
          data: expiredProviders[0],
          error: null,
        })
        detailChain.eq = vi.fn().mockReturnValue({
          ...detailChain,
          single: vi.fn().mockResolvedValue({ data: expiredProviders[0], error: null }),
        })
        detailChain.update = vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        })
        // Notification-phase queries return empty
        detailChain.range = vi.fn().mockResolvedValue({ data: [], error: null })
        return detailChain
      }),
    }

    const result = await runLicenseExpiryCheck(supabase as any)

    expect(result.suspendedCount).toBe(2)
    // Verify audit emit was called once per suspended provider
    const suspensionAuditCalls = mockAuditEmit.mock.calls.filter(
      (call: any[]) => call[0]?.action === 'LICENSE_EXPIRED_AUTO_SUSPENDED',
    )
    expect(suspensionAuditCalls).toHaveLength(2)
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'LICENSE_EXPIRED_AUTO_SUSPENDED',
        resourceType: 'PRACTITIONER',
        actorRole: 'SYSTEM',
        outcome: 'SUCCESS',
      }),
    )
  })

  it('records job run in job_runs table', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ data: null, error: null })
    const supabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'job_runs') {
          return { insert: mockInsert }
        }
        // practitioners: return empty for all queries
        return chainMock({ data: [], error: null })
      }),
    }

    await runLicenseExpiryCheck(supabase as any)
    expect(mockInsert).toHaveBeenCalled()
  })

  it('returns zero counts when no providers match', async () => {
    const supabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'job_runs') {
          return chainMock()
        }
        return chainMock({ data: [], error: null })
      }),
    }

    const result = await runLicenseExpiryCheck(supabase as any)

    expect(result.suspendedCount).toBe(0)
    expect(result.notificationsSent).toBe(0)
    expect(result.errors).toBe(0)
  })
})

describe('runLicenseExpiryCheck — notifications', () => {
  beforeEach(() => {
    mockAuditEmit.mockClear()
  })

  it('sends notifications to providers approaching expiry', async () => {
    const approachingProvider = {
      id: 'p3',
      _ultranos: {
        licenseExpiry: '2026-05-22',
        kycStatus: 'ACTIVE',
        lastExpiryNotificationThreshold: null,
      },
    }

    let queryPhase = 0
    const mockNotificationInsert = vi.fn().mockResolvedValue({ data: null, error: null })

    const supabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'job_runs') return chainMock()
        if (table === 'notifications') return { insert: mockNotificationInsert }

        queryPhase++
        // Phase 1: suspension query — no expired providers
        if (queryPhase === 1) return chainMock({ data: [], error: null })

        // Phase 2+: notification queries — return approaching provider for first threshold
        const chain = chainMock({ data: [approachingProvider], error: null })
        chain.update = vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        })
        return chain
      }),
    }

    const result = await runLicenseExpiryCheck(supabase as any)

    // Should have sent at least one notification
    expect(mockNotificationInsert).toHaveBeenCalled()
    expect(result.notificationsSent).toBeGreaterThan(0)
  })

  it('skips providers already notified at the same or more urgent threshold', async () => {
    const alreadyNotifiedProvider = {
      id: 'p4',
      _ultranos: {
        licenseExpiry: '2026-06-14',
        kycStatus: 'ACTIVE',
        lastExpiryNotificationThreshold: 7, // Already notified at most urgent
        lastExpiryNotificationAt: '2026-05-14T00:00:00Z',
      },
    }

    const mockNotificationInsert = vi.fn().mockResolvedValue({ data: null, error: null })
    let queryPhase = 0

    const supabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'job_runs') return chainMock()
        if (table === 'notifications') return { insert: mockNotificationInsert }

        queryPhase++
        if (queryPhase === 1) return chainMock({ data: [], error: null })
        return chainMock({ data: [alreadyNotifiedProvider], error: null })
      }),
    }

    const result = await runLicenseExpiryCheck(supabase as any)

    // Should NOT send new notifications (7 is already the most urgent threshold sent)
    expect(result.notificationsSent).toBe(0)
  })
})

describe('runLicenseExpiryCheck — idempotency', () => {
  it('is safe to run twice with no providers', async () => {
    const supabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'job_runs') return chainMock()
        return chainMock({ data: [], error: null })
      }),
    }

    const result1 = await runLicenseExpiryCheck(supabase as any)
    const result2 = await runLicenseExpiryCheck(supabase as any)

    expect(result1.errors).toBe(0)
    expect(result2.errors).toBe(0)
  })
})
