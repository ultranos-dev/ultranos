import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TRPCError } from '@trpc/server'

/**
 * Story 27.11 Task 8.1: enforcePremiumTier middleware tests
 *
 * - FREE tier patient on premium endpoint: returns PREMIUM_REQUIRED error with feature ID
 * - PREMIUM tier patient on premium endpoint: passes through
 * - Tier lookup is cached per request context
 * - Runtime assertion fires if applied to safety-critical endpoint
 */

// ─── Helpers ────────────────────────────────────────────────────────────────

function mockPatientQuery(result: { data: any; error: any }) {
  return vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(result),
      }),
    }),
  })
}

function createTestContext(overrides?: {
  supabaseFrom?: ReturnType<typeof vi.fn>
  _patientTier?: 'FREE' | 'PREMIUM'
}) {
  return {
    supabase: { from: overrides?.supabaseFrom ?? vi.fn() } as never,
    user: { sub: 'patient-001', role: 'PATIENT', sessionId: 'sess-1', orgId: null },
    headers: new Headers(),
    _patientTier: overrides?._patientTier,
  }
}

const mockNext = vi.fn().mockImplementation((opts: any) => Promise.resolve(opts.ctx))

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('enforcePremiumTier', () => {
  let enforcePremiumTier: typeof import('../trpc/middleware/enforcePremiumTier').enforcePremiumTier

  beforeEach(async () => {
    const mod = await import('../trpc/middleware/enforcePremiumTier')
    enforcePremiumTier = mod.enforcePremiumTier
  })

  it('throws PREMIUM_REQUIRED for FREE tier patient', async () => {
    const fromMock = mockPatientQuery({ data: { patient_tier: 'FREE' }, error: null })
    const ctx = createTestContext({ supabaseFrom: fromMock })
    const middleware = enforcePremiumTier('MEDICAL_HISTORY_EXPORT')

    await expect(
      middleware({ ctx, input: {}, next: mockNext }),
    ).rejects.toThrow(TRPCError)

    try {
      await middleware({ ctx, input: {}, next: mockNext })
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError)
      const trpcErr = err as TRPCError
      expect(trpcErr.code).toBe('FORBIDDEN')
      expect(trpcErr.message).toBe('PREMIUM_REQUIRED')
      expect((trpcErr.cause as any).featureId).toBe('MEDICAL_HISTORY_EXPORT')
    }
  })

  it('passes through for PREMIUM tier patient', async () => {
    const fromMock = mockPatientQuery({ data: { patient_tier: 'PREMIUM' }, error: null })
    const ctx = createTestContext({ supabaseFrom: fromMock })
    const middleware = enforcePremiumTier('MEDICAL_HISTORY_EXPORT')

    await middleware({ ctx, input: {}, next: mockNext })

    expect(mockNext).toHaveBeenCalledWith(
      expect.objectContaining({
        ctx: expect.objectContaining({ _patientTier: 'PREMIUM' }),
      }),
    )
  })

  it('uses cached tier from context and skips DB lookup', async () => {
    const fromMock = vi.fn()
    const ctx = createTestContext({ supabaseFrom: fromMock, _patientTier: 'PREMIUM' })
    const middleware = enforcePremiumTier('GUARDIAN_LINKING')

    await middleware({ ctx, input: {}, next: mockNext })

    // DB should not be called since tier was cached on ctx
    expect(fromMock).not.toHaveBeenCalled()
    expect(mockNext).toHaveBeenCalled()
  })

  it('uses cached FREE tier from context', async () => {
    const fromMock = vi.fn()
    const ctx = createTestContext({ supabaseFrom: fromMock, _patientTier: 'FREE' })
    const middleware = enforcePremiumTier('NOTIFICATION_CENTER')

    await expect(
      middleware({ ctx, input: {}, next: mockNext }),
    ).rejects.toThrow(TRPCError)

    expect(fromMock).not.toHaveBeenCalled()
  })

  it('defaults to FREE tier on DB error (fail-closed)', async () => {
    const fromMock = mockPatientQuery({ data: null, error: { code: 'PGRST116' } })
    const ctx = createTestContext({ supabaseFrom: fromMock })
    const middleware = enforcePremiumTier('PRESCRIPTION_HISTORY')

    await expect(
      middleware({ ctx, input: {}, next: mockNext }),
    ).rejects.toThrow(TRPCError)
  })

  it('defaults to FREE tier when patient_tier is null', async () => {
    const fromMock = mockPatientQuery({ data: { patient_tier: null }, error: null })
    const ctx = createTestContext({ supabaseFrom: fromMock })
    const middleware = enforcePremiumTier('MEDICAL_HISTORY_EXPORT')

    await expect(
      middleware({ ctx, input: {}, next: mockNext }),
    ).rejects.toThrow(TRPCError)
  })

  it('includes featureId in error cause payload', async () => {
    const fromMock = mockPatientQuery({ data: { patient_tier: 'FREE' }, error: null })
    const ctx = createTestContext({ supabaseFrom: fromMock })
    const middleware = enforcePremiumTier('GUARDIAN_LINKING')

    try {
      await middleware({ ctx, input: {}, next: mockNext })
    } catch (err) {
      const trpcErr = err as TRPCError
      expect((trpcErr.cause as any).featureId).toBe('GUARDIAN_LINKING')
    }
  })
})

describe('enforcePremiumTier — safety-critical runtime assertion', () => {
  let enforcePremiumTier: typeof import('../trpc/middleware/enforcePremiumTier').enforcePremiumTier

  beforeEach(async () => {
    const mod = await import('../trpc/middleware/enforcePremiumTier')
    enforcePremiumTier = mod.enforcePremiumTier
  })

  it('throws configuration error when applied to VIEW_ALLERGIES', () => {
    expect(() => enforcePremiumTier('VIEW_ALLERGIES' as any)).toThrow(
      'CONFIGURATION ERROR: Cannot apply premium gate to safety-critical feature: VIEW_ALLERGIES',
    )
  })

  it('throws configuration error when applied to VIEW_ACTIVE_MEDICATIONS', () => {
    expect(() => enforcePremiumTier('VIEW_ACTIVE_MEDICATIONS' as any)).toThrow(
      'CONFIGURATION ERROR: Cannot apply premium gate to safety-critical feature: VIEW_ACTIVE_MEDICATIONS',
    )
  })

  it('throws configuration error when applied to CONSENT_MANAGEMENT', () => {
    expect(() => enforcePremiumTier('CONSENT_MANAGEMENT' as any)).toThrow(
      'CONFIGURATION ERROR: Cannot apply premium gate to safety-critical feature: CONSENT_MANAGEMENT',
    )
  })
})
