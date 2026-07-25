import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ──────────────────────────────────────────────────────

const mockInsert = vi.fn()
const mockSelect = vi.fn()
const mockUpdate = vi.fn()

const mockNotificationInsert = vi.fn().mockResolvedValue({ data: null, error: null })

// patients table mock for enforcePremiumTier middleware
const mockPatientsTierChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnValue({
    single: vi.fn().mockResolvedValue({ data: { patient_tier: 'PREMIUM' }, error: null }),
  }),
}

const mockFrom = vi.fn((table: string) => {
  if (table === 'guardian_links') {
    return {
      insert: mockInsert,
      select: mockSelect,
      update: mockUpdate,
    }
  }
  if (table === 'notifications') {
    return {
      insert: mockNotificationInsert,
    }
  }
  if (table === 'patients') {
    // enforcePremiumTier queries .from('patients').select('patient_tier').eq('id', ...).single()
    return mockPatientsTierChain
  }
  return {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
  }
})

const mockVerifyOtp = vi.fn()

const mockAuditEmit = vi.fn().mockResolvedValue({ id: 'audit-1' })

vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({
    emit: mockAuditEmit,
  })),
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({
    from: mockFrom,
    auth: { admin: { verifyOtp: mockVerifyOtp } },
  })),
  db: {
    toRow: (data: any) => data,
    toRowRaw: (data: any) => data,
    fromRow: (data: any) => data,
    fromRowRaw: (data: any) => data,
    fromRows: (data: any[]) => data,
  },
}))

const mockRedisGet = vi.fn()
const mockRedisSet = vi.fn().mockResolvedValue('OK')
const mockRedisDel = vi.fn().mockResolvedValue(1)

vi.mock('@/lib/redis', () => ({
  getRedisClient: vi.fn(() => ({
    get: mockRedisGet,
    set: mockRedisSet,
    del: mockRedisDel,
  })),
}))

const { createTRPCRouter, createCallerFactory } = await import('../trpc/init')
const { guardianRouter } = await import('../trpc/routers/guardian')

// ── Helpers ────────────────────────────────────────────────────

function makeCtx(user: { sub: string; role: string; sessionId: string; orgId?: string | null; status?: string | null } | null) {
  return {
    supabase: {
      from: mockFrom,
      auth: { admin: { verifyOtp: mockVerifyOtp } },
    } as never,
    user: user ? { ...user, orgId: user.orgId ?? null, status: user.status ?? null } : null,
    headers: new Headers(),
  }
}

const PATIENT_ID = '00000000-0000-4000-8000-000000000040'
const PATIENT_USER = { sub: PATIENT_ID, role: 'PATIENT', sessionId: 's-p1' }
const OTHER_PATIENT_USER = { sub: '00000000-0000-4000-8000-000000000099', role: 'PATIENT', sessionId: 's-p2' }
const GUARDIAN_LINK_ID = '00000000-0000-4000-8000-000000000020'
const GUARDIAN_USER_ID = '00000000-0000-4000-8000-000000000030'
const VALID_NONCE = '00000000-0000-4000-8000-000000000050'

// ── Tests: guardian.verifyOtp ─────────────────────────────────

describe('guardian.verifyOtp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns guardianUserId and nonce on valid OTP (AC: 1)', async () => {
    mockVerifyOtp.mockResolvedValue({
      data: { user: { id: GUARDIAN_USER_ID } },
      error: null,
    })

    const router = createTRPCRouter({ guardian: guardianRouter })
    const caller = createCallerFactory(router)(makeCtx(PATIENT_USER))

    const result = await caller.guardian.verifyOtp({
      patientId: PATIENT_ID,
      guardianPhone: '+966501234567',
      otp: '123456',
      channel: 'sms',
    })

    expect(result.guardianUserId).toBe(GUARDIAN_USER_ID)
    expect(result.nonce).toBeDefined()
    expect(typeof result.nonce).toBe('string')
  })

  it('stores OTP nonce in Redis with TTL (AC: 1)', async () => {
    mockVerifyOtp.mockResolvedValue({
      data: { user: { id: GUARDIAN_USER_ID } },
      error: null,
    })

    const router = createTRPCRouter({ guardian: guardianRouter })
    const caller = createCallerFactory(router)(makeCtx(PATIENT_USER))

    const result = await caller.guardian.verifyOtp({
      patientId: PATIENT_ID,
      guardianPhone: '+966501234567',
      otp: '123456',
      channel: 'sms',
    })

    expect(mockRedisSet).toHaveBeenCalledWith(
      `guardian_otp_nonce:${PATIENT_ID}:${GUARDIAN_USER_ID}`,
      result.nonce,
      'EX',
      300,
    )
  })

  it('rejects invalid OTP (AC: 1)', async () => {
    mockVerifyOtp.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid OTP' },
    })

    const router = createTRPCRouter({ guardian: guardianRouter })
    const caller = createCallerFactory(router)(makeCtx(PATIENT_USER))

    await expect(
      caller.guardian.verifyOtp({
        patientId: PATIENT_ID,
        guardianPhone: '+966501234567',
        otp: '000000',
        channel: 'sms',
      }),
    ).rejects.toThrow()
  })

  it('emits audit event with GUARDIAN_OTP_VERIFIED on success (AC: 6)', async () => {
    mockVerifyOtp.mockResolvedValue({
      data: { user: { id: GUARDIAN_USER_ID } },
      error: null,
    })

    const router = createTRPCRouter({ guardian: guardianRouter })
    const caller = createCallerFactory(router)(makeCtx(PATIENT_USER))

    await caller.guardian.verifyOtp({
      patientId: PATIENT_ID,
      guardianPhone: '+966501234567',
      otp: '123456',
      channel: 'sms',
    })

    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'LOGIN',
        resourceType: 'GUARDIAN_LINK',
        outcome: 'SUCCESS',
        metadata: expect.objectContaining({
          guardianAction: 'GUARDIAN_OTP_VERIFIED',
          channel: 'sms',
        }),
      }),
    )
  })

  it('emits audit event with GUARDIAN_OTP_ATTEMPT on failure (AC: 6)', async () => {
    mockVerifyOtp.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid OTP' },
    })

    const router = createTRPCRouter({ guardian: guardianRouter })
    const caller = createCallerFactory(router)(makeCtx(PATIENT_USER))

    await expect(
      caller.guardian.verifyOtp({
        patientId: PATIENT_ID,
        guardianPhone: '+966501234567',
        otp: '000000',
        channel: 'sms',
      }),
    ).rejects.toThrow()

    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'LOGIN',
        resourceType: 'GUARDIAN_LINK',
        outcome: 'FAILURE',
        metadata: expect.objectContaining({
          guardianAction: 'GUARDIAN_OTP_ATTEMPT',
        }),
      }),
    )
  })

  it('rejects unauthenticated requests (AC: 4)', async () => {
    const router = createTRPCRouter({ guardian: guardianRouter })
    const caller = createCallerFactory(router)(makeCtx(null))

    await expect(
      caller.guardian.verifyOtp({
        patientId: PATIENT_ID,
        guardianPhone: '+966501234567',
        otp: '123456',
        channel: 'sms',
      }),
    ).rejects.toThrow()
  })

  it('rejects when caller is not the patient (ownership check)', async () => {
    const router = createTRPCRouter({ guardian: guardianRouter })
    const caller = createCallerFactory(router)(makeCtx(OTHER_PATIENT_USER))

    await expect(
      caller.guardian.verifyOtp({
        patientId: PATIENT_ID,
        guardianPhone: '+966501234567',
        otp: '123456',
        channel: 'sms',
      }),
    ).rejects.toThrow(/access denied/i)
  })

  it('validates input: rejects non-E.164 phone', async () => {
    const router = createTRPCRouter({ guardian: guardianRouter })
    const caller = createCallerFactory(router)(makeCtx(PATIENT_USER))

    await expect(
      caller.guardian.verifyOtp({
        patientId: PATIENT_ID,
        guardianPhone: '0501234567',
        otp: '123456',
        channel: 'sms',
      }),
    ).rejects.toThrow()
  })

  it('validates input: rejects non-6-digit OTP', async () => {
    const router = createTRPCRouter({ guardian: guardianRouter })
    const caller = createCallerFactory(router)(makeCtx(PATIENT_USER))

    await expect(
      caller.guardian.verifyOtp({
        patientId: PATIENT_ID,
        guardianPhone: '+966501234567',
        otp: '12345',
        channel: 'sms',
      }),
    ).rejects.toThrow()
  })
})

// ── Tests: guardian.createLink ────────────────────────────────

describe('guardian.createLink', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: nonce is valid
    mockRedisGet.mockResolvedValue(VALID_NONCE)
  })

  it('persists link and sends notification with correct payload (AC: 2)', async () => {
    mockInsert.mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: GUARDIAN_LINK_ID },
          error: null,
        }),
      }),
    })

    const router = createTRPCRouter({ guardian: guardianRouter })
    const caller = createCallerFactory(router)(makeCtx(PATIENT_USER))

    const result = await caller.guardian.createLink({
      patientId: PATIENT_ID,
      guardianUserId: GUARDIAN_USER_ID,
      guardianPhoneHash: 'sha256hash',
      guardianPhoneHint: '+966****567',
      nonce: VALID_NONCE,
    })

    expect(result.success).toBe(true)
    expect(result.guardianLinkId).toBe(GUARDIAN_LINK_ID)

    // Verify notification was dispatched with correct payload
    expect(mockFrom).toHaveBeenCalledWith('notifications')
    expect(mockNotificationInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientRef: PATIENT_ID,
        recipientRole: 'PATIENT',
        type: 'GUARDIAN_LINKED',
      }),
    )
  })

  it('validates nonce from Redis before creating link', async () => {
    mockInsert.mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: GUARDIAN_LINK_ID },
          error: null,
        }),
      }),
    })

    const router = createTRPCRouter({ guardian: guardianRouter })
    const caller = createCallerFactory(router)(makeCtx(PATIENT_USER))

    await caller.guardian.createLink({
      patientId: PATIENT_ID,
      guardianUserId: GUARDIAN_USER_ID,
      guardianPhoneHash: 'sha256hash',
      guardianPhoneHint: '+966****567',
      nonce: VALID_NONCE,
    })

    // Verify nonce was checked and deleted (single-use)
    expect(mockRedisGet).toHaveBeenCalledWith(
      `guardian_otp_nonce:${PATIENT_ID}:${GUARDIAN_USER_ID}`,
    )
    expect(mockRedisDel).toHaveBeenCalledWith(
      `guardian_otp_nonce:${PATIENT_ID}:${GUARDIAN_USER_ID}`,
    )
  })

  it('rejects invalid nonce (OTP bypass prevention)', async () => {
    mockRedisGet.mockResolvedValue('different-nonce-value')

    const router = createTRPCRouter({ guardian: guardianRouter })
    const caller = createCallerFactory(router)(makeCtx(PATIENT_USER))

    await expect(
      caller.guardian.createLink({
        patientId: PATIENT_ID,
        guardianUserId: GUARDIAN_USER_ID,
        guardianPhoneHash: 'sha256hash',
        guardianPhoneHint: '+966****567',
        nonce: VALID_NONCE,
      }),
    ).rejects.toThrow(/invalid or expired otp/i)
  })

  it('rejects duplicate active link — V1 limit (AC: 5)', async () => {
    mockInsert.mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: '23505', message: 'unique_violation' },
        }),
      }),
    })

    const router = createTRPCRouter({ guardian: guardianRouter })
    const caller = createCallerFactory(router)(makeCtx(PATIENT_USER))

    await expect(
      caller.guardian.createLink({
        patientId: PATIENT_ID,
        guardianUserId: GUARDIAN_USER_ID,
        guardianPhoneHash: 'sha256hash',
        guardianPhoneHint: '+966****567',
        nonce: VALID_NONCE,
      }),
    ).rejects.toThrow(/active guardian link already exists/)
  })

  it('emits audit event on link creation (AC: 6)', async () => {
    mockInsert.mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: GUARDIAN_LINK_ID },
          error: null,
        }),
      }),
    })

    const router = createTRPCRouter({ guardian: guardianRouter })
    const caller = createCallerFactory(router)(makeCtx(PATIENT_USER))

    await caller.guardian.createLink({
      patientId: PATIENT_ID,
      guardianUserId: GUARDIAN_USER_ID,
      guardianPhoneHash: 'sha256hash',
      guardianPhoneHint: '+966****567',
      nonce: VALID_NONCE,
    })

    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        resourceType: 'GUARDIAN_LINK',
        resourceId: GUARDIAN_LINK_ID,
        outcome: 'SUCCESS',
        metadata: expect.objectContaining({
          guardianAction: 'GUARDIAN_LINK_CREATED',
        }),
      }),
    )
  })

  it('audit payload contains no PHI (AC: 6)', async () => {
    mockInsert.mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: GUARDIAN_LINK_ID },
          error: null,
        }),
      }),
    })

    const router = createTRPCRouter({ guardian: guardianRouter })
    const caller = createCallerFactory(router)(makeCtx(PATIENT_USER))

    await caller.guardian.createLink({
      patientId: PATIENT_ID,
      guardianUserId: GUARDIAN_USER_ID,
      guardianPhoneHash: 'sha256hash',
      guardianPhoneHint: '+966****567',
      nonce: VALID_NONCE,
    })

    // Verify no PHI fields in audit call
    const auditCall = mockAuditEmit.mock.calls[0][0]
    const auditStr = JSON.stringify(auditCall)
    expect(auditStr).not.toContain('+966')
    expect(auditStr).not.toContain('guardianPhone')
    expect(auditStr).not.toContain('phoneHash')
    expect(auditStr).not.toContain('phoneHint')
  })

  it('rejects unauthenticated requests (AC: 4)', async () => {
    const router = createTRPCRouter({ guardian: guardianRouter })
    const caller = createCallerFactory(router)(makeCtx(null))

    await expect(
      caller.guardian.createLink({
        patientId: PATIENT_ID,
        guardianUserId: GUARDIAN_USER_ID,
        guardianPhoneHash: 'sha256hash',
        guardianPhoneHint: '+966****567',
        nonce: VALID_NONCE,
      }),
    ).rejects.toThrow()
  })

  it('rejects when caller is not the patient (ownership check)', async () => {
    const router = createTRPCRouter({ guardian: guardianRouter })
    const caller = createCallerFactory(router)(makeCtx(OTHER_PATIENT_USER))

    await expect(
      caller.guardian.createLink({
        patientId: PATIENT_ID,
        guardianUserId: GUARDIAN_USER_ID,
        guardianPhoneHash: 'sha256hash',
        guardianPhoneHint: '+966****567',
        nonce: VALID_NONCE,
      }),
    ).rejects.toThrow(/access denied/i)
  })
})

// ── Tests: guardian.notifyUnlink ──────────────────────────────

describe('guardian.notifyUnlink', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('revokes link and sends notification to guardian (AC: 3)', async () => {
    mockUpdate.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: GUARDIAN_LINK_ID },
              error: null,
            }),
          }),
        }),
      }),
    })

    const router = createTRPCRouter({ guardian: guardianRouter })
    const caller = createCallerFactory(router)(makeCtx(PATIENT_USER))

    const result = await caller.guardian.notifyUnlink({
      patientId: PATIENT_ID,
      guardianUserId: GUARDIAN_USER_ID,
      guardianLinkId: GUARDIAN_LINK_ID,
    })

    expect(result.success).toBe(true)

    // Verify notification was dispatched to guardian with correct role
    expect(mockFrom).toHaveBeenCalledWith('notifications')
    expect(mockNotificationInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientRef: GUARDIAN_USER_ID,
        recipientRole: 'GUARDIAN',
        type: 'GUARDIAN_UNLINKED',
      }),
    )
  })

  it('returns NOT_FOUND when no matching link exists', async () => {
    mockUpdate.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116', message: 'not found' },
            }),
          }),
        }),
      }),
    })

    const router = createTRPCRouter({ guardian: guardianRouter })
    const caller = createCallerFactory(router)(makeCtx(PATIENT_USER))

    await expect(
      caller.guardian.notifyUnlink({
        patientId: PATIENT_ID,
        guardianUserId: GUARDIAN_USER_ID,
        guardianLinkId: GUARDIAN_LINK_ID,
      }),
    ).rejects.toThrow()
  })

  it('emits audit event on unlink (AC: 6)', async () => {
    mockUpdate.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: GUARDIAN_LINK_ID },
              error: null,
            }),
          }),
        }),
      }),
    })

    const router = createTRPCRouter({ guardian: guardianRouter })
    const caller = createCallerFactory(router)(makeCtx(PATIENT_USER))

    await caller.guardian.notifyUnlink({
      patientId: PATIENT_ID,
      guardianUserId: GUARDIAN_USER_ID,
      guardianLinkId: GUARDIAN_LINK_ID,
    })

    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        resourceType: 'GUARDIAN_LINK',
        resourceId: GUARDIAN_LINK_ID,
        outcome: 'SUCCESS',
        metadata: expect.objectContaining({
          guardianAction: 'GUARDIAN_LINK_REVOKED',
        }),
      }),
    )
  })

  it('rejects unauthenticated requests (AC: 4)', async () => {
    const router = createTRPCRouter({ guardian: guardianRouter })
    const caller = createCallerFactory(router)(makeCtx(null))

    await expect(
      caller.guardian.notifyUnlink({
        patientId: PATIENT_ID,
        guardianUserId: GUARDIAN_USER_ID,
        guardianLinkId: GUARDIAN_LINK_ID,
      }),
    ).rejects.toThrow()
  })

  it('rejects when caller is not the patient (ownership check)', async () => {
    const router = createTRPCRouter({ guardian: guardianRouter })
    const caller = createCallerFactory(router)(makeCtx(OTHER_PATIENT_USER))

    await expect(
      caller.guardian.notifyUnlink({
        patientId: PATIENT_ID,
        guardianUserId: GUARDIAN_USER_ID,
        guardianLinkId: GUARDIAN_LINK_ID,
      }),
    ).rejects.toThrow(/access denied/i)
  })

  it('throws on DB update failure', async () => {
    mockUpdate.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'DB error' },
            }),
          }),
        }),
      }),
    })

    const router = createTRPCRouter({ guardian: guardianRouter })
    const caller = createCallerFactory(router)(makeCtx(PATIENT_USER))

    await expect(
      caller.guardian.notifyUnlink({
        patientId: PATIENT_ID,
        guardianUserId: GUARDIAN_USER_ID,
        guardianLinkId: GUARDIAN_LINK_ID,
      }),
    ).rejects.toThrow('Failed to revoke guardian link')
  })
})
