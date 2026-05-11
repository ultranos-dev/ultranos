import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TRPCError } from '@trpc/server'

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
const { practitionerKeyRouter } = await import('../trpc/routers/practitioner-key')

const router = createTRPCRouter({ practitionerKey: practitionerKeyRouter })
const createCaller = createCallerFactory(router)

function makeCtx(user: { sub: string; role: string; sessionId: string } | null) {
  return {
    supabase: { from: mockFrom } as never,
    user,
    headers: new Headers(),
  }
}

const VALID_INPUT = {
  publicKey: 'O2onvM62pC1io6jQKm8Nc2UyFXcd4kOmOsBIoYtZ2ik=',
  practitionerId: '00000000-0000-4000-8000-000000000001',
  practitionerName: 'Dr. Test',
}

const CUSTOM_EXPIRY_INPUT = {
  ...VALID_INPUT,
  expiresAt: '2028-06-01T00:00:00Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockInsert.mockReturnValue({ select: mockInsertSelect })
  mockInsertSelect.mockReturnValue({ single: mockInsertSingle })
  mockFrom.mockReturnValue({ insert: mockInsert })
})

describe('practitionerKey.register', () => {
  describe('successful registration', () => {
    it('registers a key with custom expiry (AC #1, #2)', async () => {
      const caller = createCaller(makeCtx({ sub: VALID_INPUT.practitionerId, role: 'DOCTOR', sessionId: 'sess-1' }))

      mockInsertSingle.mockResolvedValue({
        data: { id: 'new-key-id' },
        error: null,
      })

      const result = await caller.practitionerKey.register(CUSTOM_EXPIRY_INPUT)

      expect(result.registered).toBe(true)
      expect(result.expiresAt).toBe('2028-06-01T00:00:00Z')

      // Verify insert was called with correct table and data
      expect(mockFrom).toHaveBeenCalledWith('practitioner_keys')
      expect(mockInsert).toHaveBeenCalledWith({
        public_key_ed25519: VALID_INPUT.publicKey,
        practitioner_id: VALID_INPUT.practitionerId,
        practitioner_name: VALID_INPUT.practitionerName,
        expires_at: '2028-06-01T00:00:00Z',
      })
    })

    it('uses default 1-year expiry when not specified (AC #4)', async () => {
      const caller = createCaller(makeCtx({ sub: VALID_INPUT.practitionerId, role: 'DOCTOR', sessionId: 'sess-1' }))

      mockInsertSingle.mockResolvedValue({
        data: { id: 'new-key-id' },
        error: null,
      })

      const before = new Date()
      const result = await caller.practitionerKey.register(VALID_INPUT)
      const after = new Date()

      expect(result.registered).toBe(true)

      // Verify the expiry is approximately 1 year from now
      const expiryDate = new Date(result.expiresAt)
      const expectedMinExpiry = new Date(before)
      expectedMinExpiry.setFullYear(expectedMinExpiry.getFullYear() + 1)
      const expectedMaxExpiry = new Date(after)
      expectedMaxExpiry.setFullYear(expectedMaxExpiry.getFullYear() + 1)

      expect(expiryDate.getTime()).toBeGreaterThanOrEqual(expectedMinExpiry.getTime() - 1000)
      expect(expiryDate.getTime()).toBeLessThanOrEqual(expectedMaxExpiry.getTime() + 1000)

      // Verify the correct expiry was passed to the insert
      const insertArg = mockInsert.mock.calls[0]![0]
      expect(insertArg.expires_at).toBe(result.expiresAt)
      expect(insertArg.public_key_ed25519).toBe(VALID_INPUT.publicKey)
      expect(insertArg.practitioner_id).toBe(VALID_INPUT.practitionerId)
      expect(insertArg.practitioner_name).toBe(VALID_INPUT.practitionerName)
    })
  })

  describe('duplicate key rejection (AC #3)', () => {
    it('throws CONFLICT when public key already registered', async () => {
      const caller = createCaller(makeCtx({ sub: VALID_INPUT.practitionerId, role: 'DOCTOR', sessionId: 'sess-1' }))

      mockInsertSingle.mockResolvedValue({
        data: null,
        error: { code: '23505', message: 'duplicate key value violates unique constraint' },
      })

      await expect(caller.practitionerKey.register(VALID_INPUT)).rejects.toThrow(
        expect.objectContaining({
          code: 'CONFLICT',
          message: 'Public key already registered',
        }),
      )
    })

    it('throws INTERNAL_SERVER_ERROR for other insert errors', async () => {
      const caller = createCaller(makeCtx({ sub: VALID_INPUT.practitionerId, role: 'DOCTOR', sessionId: 'sess-1' }))

      mockInsertSingle.mockResolvedValue({
        data: null,
        error: { code: '42P01', message: 'relation does not exist' },
      })

      await expect(caller.practitionerKey.register(VALID_INPUT)).rejects.toThrow(
        expect.objectContaining({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to register key',
        }),
      )
    })
  })

  describe('RBAC (AC #5)', () => {
    it('allows DOCTOR to register', async () => {
      const caller = createCaller(makeCtx({ sub: VALID_INPUT.practitionerId, role: 'DOCTOR', sessionId: 'sess-1' }))

      mockInsertSingle.mockResolvedValue({ data: { id: 'key-1' }, error: null })

      const result = await caller.practitionerKey.register(VALID_INPUT)
      expect(result.registered).toBe(true)
    })

    it('allows CLINICIAN to register', async () => {
      const caller = createCaller(makeCtx({ sub: VALID_INPUT.practitionerId, role: 'CLINICIAN', sessionId: 'sess-1' }))

      mockInsertSingle.mockResolvedValue({ data: { id: 'key-1' }, error: null })

      const result = await caller.practitionerKey.register(VALID_INPUT)
      expect(result.registered).toBe(true)
    })

    it('allows ADMIN to register (own key)', async () => {
      const caller = createCaller(makeCtx({ sub: VALID_INPUT.practitionerId, role: 'ADMIN', sessionId: 'sess-1' }))

      mockInsertSingle.mockResolvedValue({ data: { id: 'key-1' }, error: null })

      const result = await caller.practitionerKey.register(VALID_INPUT)
      expect(result.registered).toBe(true)
    })

    it('rejects PHARMACIST role', async () => {
      const caller = createCaller(makeCtx({ sub: 'pharma-1', role: 'PHARMACIST', sessionId: 'sess-1' }))

      await expect(caller.practitionerKey.register(VALID_INPUT)).rejects.toThrow(
        expect.objectContaining({ code: 'FORBIDDEN' }),
      )
    })

    it('rejects LAB_TECH role', async () => {
      const caller = createCaller(makeCtx({ sub: 'lab-1', role: 'LAB_TECH', sessionId: 'sess-1' }))

      await expect(caller.practitionerKey.register(VALID_INPUT)).rejects.toThrow(
        expect.objectContaining({ code: 'FORBIDDEN' }),
      )
    })

    it('rejects DOCTOR registering key for a different practitioner', async () => {
      const caller = createCaller(makeCtx({ sub: 'doc-1', role: 'DOCTOR', sessionId: 'sess-1' }))

      await expect(
        caller.practitionerKey.register({
          ...VALID_INPUT,
          practitionerId: '00000000-0000-4000-8000-000000000099',
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'FORBIDDEN',
          message: 'Can only register keys for your own practitioner ID',
        }),
      )
    })

    it('allows ADMIN to register key for another practitioner', async () => {
      const caller = createCaller(makeCtx({ sub: 'admin-1', role: 'ADMIN', sessionId: 'sess-1' }))

      mockInsertSingle.mockResolvedValue({ data: { id: 'key-1' }, error: null })

      const result = await caller.practitionerKey.register({
        ...VALID_INPUT,
        practitionerId: '00000000-0000-4000-8000-000000000099',
      })
      expect(result.registered).toBe(true)
    })
  })

  describe('input validation', () => {
    it('rejects invalid base64 public key', async () => {
      const caller = createCaller(makeCtx({ sub: VALID_INPUT.practitionerId, role: 'DOCTOR', sessionId: 'sess-1' }))

      await expect(
        caller.practitionerKey.register({ ...VALID_INPUT, publicKey: 'not-a-valid-key' }),
      ).rejects.toThrow()
    })

    it('rejects past expiry date', async () => {
      const caller = createCaller(makeCtx({ sub: VALID_INPUT.practitionerId, role: 'DOCTOR', sessionId: 'sess-1' }))

      await expect(
        caller.practitionerKey.register({ ...VALID_INPUT, expiresAt: '2020-01-01T00:00:00Z' }),
      ).rejects.toThrow()
    })
  })

  describe('audit logging (AC #6)', () => {
    it('emits audit event on successful registration', async () => {
      const caller = createCaller(makeCtx({ sub: VALID_INPUT.practitionerId, role: 'DOCTOR', sessionId: 'sess-1' }))

      mockInsertSingle.mockResolvedValue({ data: { id: 'key-123' }, error: null })

      await caller.practitionerKey.register(VALID_INPUT)

      expect(mockEmit).toHaveBeenCalledWith({
        action: 'CREATE',
        resourceType: 'PractitionerKey',
        resourceId: 'key-123',
        actorId: VALID_INPUT.practitionerId,
        actorRole: 'DOCTOR',
        outcome: 'SUCCESS',
        sessionId: 'sess-1',
        metadata: { practitionerId: VALID_INPUT.practitionerId },
      })
    })

    it('does not block registration when audit fails', async () => {
      const caller = createCaller(makeCtx({ sub: VALID_INPUT.practitionerId, role: 'DOCTOR', sessionId: 'sess-1' }))

      mockInsertSingle.mockResolvedValue({ data: { id: 'key-123' }, error: null })
      mockEmit.mockRejectedValueOnce(new Error('Audit service unavailable'))

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const result = await caller.practitionerKey.register(VALID_INPUT)

      expect(result.registered).toBe(true)
      expect(consoleSpy).toHaveBeenCalledWith('[AUDIT_FAILURE]', {
        action: 'CREATE',
        resourceType: 'PractitionerKey',
        resourceId: 'key-123',
      })

      consoleSpy.mockRestore()
    })
  })
})
