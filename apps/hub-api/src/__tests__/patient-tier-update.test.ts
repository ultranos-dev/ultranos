import { describe, it, expect, vi, beforeEach } from 'vitest'

const TEST_ENCRYPTION_KEY = 'a'.repeat(64)
const TEST_HMAC_KEY = 'b'.repeat(64)

vi.stubEnv('FIELD_ENCRYPTION_KEY', TEST_ENCRYPTION_KEY)
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', TEST_HMAC_KEY)

vi.mock('@ultranos/crypto/server', () => ({
  generateBlindIndex: vi.fn().mockReturnValue('mock-blind-index'),
  encryptField: vi.fn((v: string) => `enc:${v}`),
  decryptField: vi.fn((v: string) => v.replace('enc:', '')),
}))

vi.mock('@/lib/field-encryption', () => ({
  getFieldEncryptionKeys: vi.fn(() => ({
    encryptionKey: Buffer.alloc(32, 0xaa),
    hmacKey: Buffer.alloc(32, 0xbb),
  })),
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({})),
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

vi.mock('../trpc/middleware/enforceConsent', () => ({
  enforceConsentMiddleware: vi.fn(() => async (opts: any) => opts.next({ ctx: opts.ctx })),
}))

vi.mock('../trpc/middleware/enforceResourceAccess', () => ({
  enforceResourceAccess: vi.fn(() => async (opts: any) => opts.next({ ctx: opts.ctx })),
}))

const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')

const PATIENT_UUID = '11111111-1111-1111-1111-111111111111'

function createMockFrom() {
  return vi.fn()
}

function createTestContext(
  mockFrom: ReturnType<typeof vi.fn>,
  user = { sub: PATIENT_UUID, role: 'PATIENT', sessionId: 'sess-1', orgId: null, status: null },
) {
  return {
    supabase: { from: mockFrom } as never,
    user,
    headers: new Headers(),
  }
}

describe('patient.updateTier', () => {
  const createCaller = createCallerFactory(appRouter)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // 8.9: validates purchase token before updating
  it('validates purchase token and updates tier on valid receipt', async () => {
    const mockFrom = createMockFrom()

    // First call: select patient for current tier
    // Second call: update patient_tier
    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        // Select current patient
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: PATIENT_UUID, patient_tier: 'FREE' },
                  error: null,
                }),
              }),
            }),
          }),
        }
      }
      if (callCount === 2) {
        // Update tier
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        }
      }
      // Audit logger calls
      return { insert: vi.fn().mockResolvedValue({ data: null, error: null }) }
    })

    const ctx = createTestContext(mockFrom)
    const caller = createCaller(ctx)

    const result = await caller.patient.updateTier({
      patientId: PATIENT_UUID,
      tier: 'PREMIUM',
      purchaseToken: 'valid-token-123',
      platform: 'android',
    })

    expect(result).toEqual({ success: true, tier: 'PREMIUM' })
  })

  // 8.10: tier change emits audit event with opaque patient ID only
  it('emits audit event with opaque patient ID only (no PHI)', async () => {
    const mockFrom = createMockFrom()

    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: PATIENT_UUID, patient_tier: 'FREE' },
                  error: null,
                }),
              }),
            }),
          }),
        }
      }
      if (callCount === 2) {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        }
      }
      return { insert: vi.fn().mockResolvedValue({ data: null, error: null }) }
    })

    const ctx = createTestContext(mockFrom)
    const caller = createCaller(ctx)

    await caller.patient.updateTier({
      patientId: PATIENT_UUID,
      tier: 'PREMIUM',
      purchaseToken: 'token-456',
      platform: 'ios',
    })

    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        resourceType: 'PATIENT',
        resourceId: PATIENT_UUID,
        metadata: expect.objectContaining({
          operation: 'tier_change',
          previousTier: 'FREE',
          newTier: 'PREMIUM',
          platform: 'ios',
        }),
      }),
    )

    // Verify NO PHI fields in audit metadata
    const auditCall = mockAuditEmit.mock.calls[0][0]
    expect(auditCall.metadata).not.toHaveProperty('name')
    expect(auditCall.metadata).not.toHaveProperty('phone')
    expect(auditCall.metadata).not.toHaveProperty('birthDate')
    expect(auditCall.metadata).not.toHaveProperty('purchaseToken')
  })

  // 8.11: invalid/empty purchase token returns error, tier unchanged
  it('rejects empty purchase token', async () => {
    const mockFrom = createMockFrom()
    const ctx = createTestContext(mockFrom)
    const caller = createCaller(ctx)

    await expect(
      caller.patient.updateTier({
        patientId: PATIENT_UUID,
        tier: 'PREMIUM',
        purchaseToken: '',
        platform: 'android',
      }),
    ).rejects.toThrow()
  })

  it('prevents non-owner patient from updating another patients tier', async () => {
    const mockFrom = createMockFrom()
    const ctx = createTestContext(mockFrom, {
      sub: 'different-patient-id',
      role: 'PATIENT',
      sessionId: 'sess-2',
      orgId: null,
      status: null,
    })
    const caller = createCaller(ctx)

    await expect(
      caller.patient.updateTier({
        patientId: PATIENT_UUID,
        tier: 'PREMIUM',
        purchaseToken: 'token',
        platform: 'android',
      }),
    ).rejects.toThrow('Patients can only update their own tier')
  })
})

describe('patient subscription webhook', () => {
  // 8.12 & 8.13: webhook tests use the route handler directly

  it('webhook handles subscription expiry → tier revert to FREE', async () => {
    // Import the route handler
    const { POST } = await import('../app/api/patient-subscription/webhook/route')

    const mockSupabase = {
      from: vi.fn(),
    }

    // Mock getSupabaseClient
    const supabaseModule = await import('@/lib/supabase')
    vi.mocked(supabaseModule.getSupabaseClient).mockReturnValue(mockSupabase as any)

    let patientSelectDone = false
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'patient_subscription_events') {
        // Return an object that supports both select (idempotency check) and insert
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null }),
            }),
          }),
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        }
      }

      if (table === 'patients') {
        if (!patientSelectDone) {
          patientSelectDone = true
          // Select patient (for current tier)
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: PATIENT_UUID, patient_tier: 'PREMIUM' },
                    error: null,
                  }),
                }),
              }),
            }),
          }
        }
        // Update patient tier
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        }
      }

      // Audit logger
      return { insert: vi.fn().mockResolvedValue({ data: null, error: null }) }
    })

    // Simulate Google RTDN for subscription expired (notificationType: 13)
    const googleNotification = {
      message: {
        data: Buffer.from(
          JSON.stringify({
            subscriptionNotification: {
              notificationType: 13, // SUBSCRIPTION_EXPIRED
              purchaseToken: 'expired-token',
            },
            patientId: PATIENT_UUID,
          }),
        ).toString('base64'),
        messageId: 'msg-unique-001',
      },
    }

    const request = new Request(
      'http://localhost/api/patient-subscription/webhook?platform=android',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(googleNotification),
      },
    )

    const response = await POST(request)
    expect(response.status).toBe(200)

    const responseBody = await response.json()
    expect(responseBody).toEqual({ received: true })
  })

  // 8.13: webhook is idempotent
  it('webhook is idempotent — duplicate events do not corrupt state', async () => {
    const { POST } = await import('../app/api/patient-subscription/webhook/route')

    const mockSupabase = {
      from: vi.fn(),
    }

    const supabaseModule = await import('@/lib/supabase')
    vi.mocked(supabaseModule.getSupabaseClient).mockReturnValue(mockSupabase as any)

    // Simulate already-processed notification
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'patient_subscription_events') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'existing-event-id' }, // Already processed
              }),
            }),
          }),
        }
      }
      return { insert: vi.fn().mockResolvedValue({ data: null, error: null }) }
    })

    const googleNotification = {
      message: {
        data: Buffer.from(
          JSON.stringify({
            subscriptionNotification: {
              notificationType: 13,
              purchaseToken: 'expired-token',
            },
            patientId: PATIENT_UUID,
          }),
        ).toString('base64'),
        messageId: 'msg-unique-001', // Same messageId as before
      },
    }

    const request = new Request(
      'http://localhost/api/patient-subscription/webhook?platform=android',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(googleNotification),
      },
    )

    const response = await POST(request)
    expect(response.status).toBe(200)

    // Should acknowledge but NOT update patient tier (idempotent)
    const patientUpdateCalls = mockSupabase.from.mock.calls.filter(
      ([table]: [string]) => table === 'patients',
    )
    expect(patientUpdateCalls.length).toBe(0)
  })
})
