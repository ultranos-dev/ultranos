import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================
// Patient Self-Registration Unit Tests — Story 27.10
// Tests requestOtp (anti-enumeration) and register (patient creation,
// duplicate rejection, audit emission, session return).
// ============================================================

vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => ({
    pipeline: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue([]) }),
    on: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
  })),
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => mockSupabaseClient),
  db: {
    toRow: (data: Record<string, unknown>) => data,
    toRowRaw: (data: Record<string, unknown>) => data,
    fromRow: (data: Record<string, unknown>) => data,
    fromRowRaw: (data: Record<string, unknown>) => data,
    fromRows: (data: Record<string, unknown>[]) => data,
  },
}))

let rpcCalls: Array<{ fn: string; params: Record<string, unknown> }> = []
let auditEvents: Array<Record<string, unknown>> = []

const MOCK_SESSION = {
  access_token: 'mock-access-token',
  refresh_token: 'mock-refresh-token',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: {
    id: '00000000-0000-4000-8000-000000000001',
    created_at: new Date().toISOString(),
    last_sign_in_at: new Date().toISOString(),
  },
}

const mockSupabaseClient = {
  from: vi.fn(),
  auth: {
    signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
    verifyOtp: vi.fn(),
    admin: {
      updateUserById: vi.fn().mockResolvedValue({ error: null }),
      deleteUser: vi.fn().mockResolvedValue({ error: null }),
    },
  },
  rpc: vi.fn().mockImplementation((fn: string, params: Record<string, unknown>) => {
    rpcCalls.push({ fn, params })
    auditEvents.push(params)
    return Promise.resolve({ data: null, error: null })
  }),
}

const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')

const createCaller = createCallerFactory(appRouter)

function createUnauthContext() {
  return {
    supabase: mockSupabaseClient as never,
    user: null,
    headers: new Headers(),
  }
}

function mockPatientsTable(existingPatients: Record<string, unknown>[] = []) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue({
          data: existingPatients,
          error: null,
        }),
      }),
    }),
    insert: vi.fn().mockResolvedValue({ error: null }),
    delete: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
  }
}

describe('Patient Self-Registration — Story 27.10', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rpcCalls = []
    auditEvents = []
  })

  // ─── requestOtp ─────────────────────────────────────────────

  describe('patientRegistration.requestOtp', () => {
    it('always returns { sent: true } regardless of whether phone exists (AC #8)', async () => {
      const caller = createCaller(createUnauthContext())
      const result = await caller.patientRegistration.requestOtp({ phone: '+971501234567' })

      expect(result).toEqual({ sent: true })
      expect(mockSupabaseClient.auth.signInWithOtp).toHaveBeenCalledWith({
        phone: '+971501234567',
      })
    })

    it('returns { sent: true } even when Supabase OTP fails (anti-enumeration)', async () => {
      mockSupabaseClient.auth.signInWithOtp.mockRejectedValueOnce(new Error('SMS failed'))

      const caller = createCaller(createUnauthContext())
      const result = await caller.patientRegistration.requestOtp({ phone: '+93701234567' })

      expect(result).toEqual({ sent: true })
    })

    it('rejects invalid phone format', async () => {
      const caller = createCaller(createUnauthContext())

      await expect(
        caller.patientRegistration.requestOtp({ phone: 'not-a-phone' }),
      ).rejects.toThrow()
    })
  })

  // ─── register ───────────────────────────────────────────────

  describe('patientRegistration.register', () => {
    it('creates Patient with patient_tier: FREE and no org_id (AC #2, #3)', async () => {
      mockSupabaseClient.auth.verifyOtp.mockResolvedValueOnce({
        data: { session: MOCK_SESSION },
        error: null,
      })

      const patientsTable = mockPatientsTable([])
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'patients') return patientsTable
        return { select: vi.fn() }
      })

      const caller = createCaller(createUnauthContext())
      const result = await caller.patientRegistration.register({
        phone: '+971501234567',
        otpCode: '123456',
        firstName: 'Ahmad',
        dateOfBirth: '1990-01-15',
        preferredLanguage: 'ar',
      })

      expect(result.success).toBe(true)
      expect(result.patientId).toBeDefined()
      expect(result.session.accessToken).toBe('mock-access-token')
      expect(result.session.refreshToken).toBe('mock-refresh-token')

      // Verify patient was inserted with FREE tier and no org_id (AC #2, #3)
      const insertCall = patientsTable.insert.mock.calls[0][0]
      expect(insertCall.patientTier).toBe('FREE')
      expect(insertCall.nameLocal).toBe('Ahmad')
      expect(insertCall.birthDate).toBe('1990-01-15')
      // P15: Free-floating patient must not have org_id
      expect(insertCall.orgId).toBeUndefined()
      expect(insertCall.org_id).toBeUndefined()
    })

    it('returns generic error on duplicate phone (AC #8 — no enumeration)', async () => {
      mockSupabaseClient.auth.verifyOtp.mockResolvedValueOnce({
        data: { session: MOCK_SESSION },
        error: null,
      })

      const patientsTable = mockPatientsTable([{ id: 'existing-patient-id' }])
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'patients') return patientsTable
        return { select: vi.fn() }
      })

      const caller = createCaller(createUnauthContext())

      await expect(
        caller.patientRegistration.register({
          phone: '+971501234567',
          otpCode: '123456',
          firstName: 'Ahmad',
          dateOfBirth: '1990-01-15',
          preferredLanguage: 'ar',
        }),
      ).rejects.toThrow('Registration failed. Please try again.')
    })

    it('emits audit event with opaque patient ID only (AC #7)', async () => {
      mockSupabaseClient.auth.verifyOtp.mockResolvedValueOnce({
        data: { session: MOCK_SESSION },
        error: null,
      })

      const patientsTable = mockPatientsTable([])
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'patients') return patientsTable
        return { select: vi.fn() }
      })

      const caller = createCaller(createUnauthContext())
      const result = await caller.patientRegistration.register({
        phone: '+971501234567',
        otpCode: '123456',
        firstName: 'Ahmad',
        dateOfBirth: '1990-01-15',
        preferredLanguage: 'ar',
      })

      // Find the audit_emit_with_lock RPC call
      const auditCall = rpcCalls.find((c) => c.fn === 'audit_emit_with_lock')
      expect(auditCall).toBeDefined()

      // Verify no PHI in audit — only opaque IDs
      const params = auditCall!.params
      expect(params.p_resource_id).toBe(result.patientId)
      expect(params.p_resource_type).toBe('PATIENT')
      expect(params.p_action).toBe('CREATE')
      // Ensure phone, name, DOB are NOT in the audit payload
      const metadataStr = JSON.stringify(params.p_metadata)
      expect(metadataStr).not.toContain('+971')
      expect(metadataStr).not.toContain('Ahmad')
      expect(metadataStr).not.toContain('1990')
    })

    it('returns session token on success (AC #6)', async () => {
      mockSupabaseClient.auth.verifyOtp.mockResolvedValueOnce({
        data: { session: MOCK_SESSION },
        error: null,
      })

      const patientsTable = mockPatientsTable([])
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'patients') return patientsTable
        return { select: vi.fn() }
      })

      const caller = createCaller(createUnauthContext())
      const result = await caller.patientRegistration.register({
        phone: '+971501234567',
        otpCode: '123456',
        firstName: 'Test',
        dateOfBirth: '2000-06-01',
        preferredLanguage: 'en',
      })

      expect(result.session).toEqual({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        expiresAt: MOCK_SESSION.expires_at,
      })
    })

    it('rejects invalid OTP', async () => {
      mockSupabaseClient.auth.verifyOtp.mockResolvedValueOnce({
        data: { session: null },
        error: { message: 'Invalid OTP' },
      })

      const caller = createCaller(createUnauthContext())

      await expect(
        caller.patientRegistration.register({
          phone: '+971501234567',
          otpCode: '000000',
          firstName: 'Ahmad',
          dateOfBirth: '1990-01-15',
          preferredLanguage: 'ar',
        }),
      ).rejects.toThrow('Registration failed. Please try again.')
    })
  })
})
