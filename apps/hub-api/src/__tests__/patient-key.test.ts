import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Supabase client with configurable responses
const mockInsertSingle = vi.fn()
const mockInsertSelect = vi.fn(() => ({ single: mockInsertSingle }))
const mockInsert = vi.fn(() => ({ select: mockInsertSelect }))
const mockFrom = vi.fn(() => ({ insert: mockInsert }))

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

// Mock AuditLogger
const mockEmit = vi.fn().mockResolvedValue(undefined)
vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn(() => ({ emit: mockEmit })),
}))

const { createTRPCRouter, createCallerFactory } = await import('../trpc/init')
const { patientKeyRouter } = await import('../trpc/routers/patient-key')

const router = createTRPCRouter({ patientKey: patientKeyRouter })
const createCaller = createCallerFactory(router)

function makeCtx(user: { sub: string; role: string; sessionId: string } | null) {
  return {
    supabase: { from: mockFrom } as never,
    user,
    headers: new Headers(),
  }
}

const PATIENT_ID = '00000000-0000-4000-8000-000000000001'
const VALID_INPUT = {
  // 124-char base64 string matching SPKI P-256 public key length
  publicKeyP256: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEY2xpbmljYWxrZXlmb3J0ZXN0aW5ncHVycG9zZXNvbmx5bm90YXJlYWxrZXkxMjM0NTY3ODkw',
  patientId: PATIENT_ID,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockInsert.mockReturnValue({ select: mockInsertSelect })
  mockInsertSelect.mockReturnValue({ single: mockInsertSingle })
  mockFrom.mockReturnValue({ insert: mockInsert })
})

describe('patientKey.register', () => {
  describe('successful registration', () => {
    it('registers a patient key with default 1-year expiry', async () => {
      const caller = createCaller(makeCtx({ sub: PATIENT_ID, role: 'PATIENT', sessionId: 'sess-1' }))

      mockInsertSingle.mockResolvedValue({
        data: { id: 'pk-1' },
        error: null,
      })

      const before = new Date()
      const result = await caller.patientKey.register(VALID_INPUT)
      const after = new Date()

      expect(result.registered).toBe(true)

      // Verify ~1 year expiry
      const expiryDate = new Date(result.expiresAt)
      const expectedMin = new Date(before)
      expectedMin.setFullYear(expectedMin.getFullYear() + 1)
      const expectedMax = new Date(after)
      expectedMax.setFullYear(expectedMax.getFullYear() + 1)

      expect(expiryDate.getTime()).toBeGreaterThanOrEqual(expectedMin.getTime() - 1000)
      expect(expiryDate.getTime()).toBeLessThanOrEqual(expectedMax.getTime() + 1000)

      // Verify correct table and data
      expect(mockFrom).toHaveBeenCalledWith('patient_keys')
      expect(mockInsert).toHaveBeenCalledWith({
        public_key_p256: VALID_INPUT.publicKeyP256,
        patient_id: PATIENT_ID,
        expires_at: result.expiresAt,
      })
    })
  })

  describe('duplicate key rejection', () => {
    it('throws CONFLICT when public key already registered', async () => {
      const caller = createCaller(makeCtx({ sub: PATIENT_ID, role: 'PATIENT', sessionId: 'sess-1' }))

      mockInsertSingle.mockResolvedValue({
        data: null,
        error: { code: '23505', message: 'duplicate key value violates unique constraint' },
      })

      await expect(caller.patientKey.register(VALID_INPUT)).rejects.toThrow(
        expect.objectContaining({
          code: 'CONFLICT',
          message: 'Patient key already registered',
        }),
      )
    })
  })

  describe('RBAC — PATIENT role only', () => {
    it('allows PATIENT to register own key', async () => {
      const caller = createCaller(makeCtx({ sub: PATIENT_ID, role: 'PATIENT', sessionId: 'sess-1' }))
      mockInsertSingle.mockResolvedValue({ data: { id: 'pk-1' }, error: null })

      const result = await caller.patientKey.register(VALID_INPUT)
      expect(result.registered).toBe(true)
    })

    it('rejects DOCTOR role', async () => {
      const caller = createCaller(makeCtx({ sub: 'doc-1', role: 'DOCTOR', sessionId: 'sess-1' }))

      await expect(caller.patientKey.register(VALID_INPUT)).rejects.toThrow(
        expect.objectContaining({ code: 'FORBIDDEN' }),
      )
    })

    it('rejects PHARMACIST role', async () => {
      const caller = createCaller(makeCtx({ sub: 'pharma-1', role: 'PHARMACIST', sessionId: 'sess-1' }))

      await expect(caller.patientKey.register(VALID_INPUT)).rejects.toThrow(
        expect.objectContaining({ code: 'FORBIDDEN' }),
      )
    })

    it('allows ADMIN role (bypasses role check)', async () => {
      const caller = createCaller(makeCtx({ sub: 'admin-1', role: 'ADMIN', sessionId: 'sess-1' }))
      mockInsertSingle.mockResolvedValue({ data: { id: 'pk-1' }, error: null })

      const result = await caller.patientKey.register(VALID_INPUT)
      expect(result.registered).toBe(true)
    })

    it('rejects PATIENT registering key for a different patient', async () => {
      const caller = createCaller(makeCtx({ sub: 'other-patient', role: 'PATIENT', sessionId: 'sess-1' }))

      await expect(caller.patientKey.register(VALID_INPUT)).rejects.toThrow(
        expect.objectContaining({
          code: 'FORBIDDEN',
          message: 'Can only register keys for your own patient ID',
        }),
      )
    })
  })

  describe('input validation', () => {
    it('rejects invalid public key format (too short)', async () => {
      const caller = createCaller(makeCtx({ sub: PATIENT_ID, role: 'PATIENT', sessionId: 'sess-1' }))

      await expect(caller.patientKey.register({
        publicKeyP256: 'shortkey',
        patientId: PATIENT_ID,
      })).rejects.toThrow()
    })

    it('rejects public key with invalid characters', async () => {
      const caller = createCaller(makeCtx({ sub: PATIENT_ID, role: 'PATIENT', sessionId: 'sess-1' }))

      await expect(caller.patientKey.register({
        publicKeyP256: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE!@#$invalidcharshere' + 'a'.repeat(60),
        patientId: PATIENT_ID,
      })).rejects.toThrow()
    })
  })

  describe('audit logging', () => {
    it('emits audit event on successful registration', async () => {
      const caller = createCaller(makeCtx({ sub: PATIENT_ID, role: 'PATIENT', sessionId: 'sess-1' }))
      mockInsertSingle.mockResolvedValue({ data: { id: 'pk-123' }, error: null })

      await caller.patientKey.register(VALID_INPUT)

      expect(mockEmit).toHaveBeenCalledWith({
        action: 'CREATE',
        resourceType: 'PatientKey',
        resourceId: 'pk-123',
        actorId: PATIENT_ID,
        actorRole: 'PATIENT',
        outcome: 'SUCCESS',
        sessionId: 'sess-1',
        metadata: { patientId: PATIENT_ID },
      })
    })

    it('does not block registration when audit fails', async () => {
      const caller = createCaller(makeCtx({ sub: PATIENT_ID, role: 'PATIENT', sessionId: 'sess-1' }))
      mockInsertSingle.mockResolvedValue({ data: { id: 'pk-123' }, error: null })
      mockEmit.mockRejectedValueOnce(new Error('Audit service unavailable'))

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const result = await caller.patientKey.register(VALID_INPUT)
      expect(result.registered).toBe(true)
      expect(consoleSpy).toHaveBeenCalledWith('[AUDIT_FAILURE]', {
        action: 'CREATE',
        resourceType: 'PatientKey',
        resourceId: 'pk-123',
      })

      consoleSpy.mockRestore()
    })
  })
})
