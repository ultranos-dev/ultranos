import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TRPCError } from '@trpc/server'

// Hoist mockEmit so it's available when vi.mock factory runs
const { mockEmit } = vi.hoisted(() => ({
  mockEmit: vi.fn().mockResolvedValue({}),
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({ from: vi.fn() })),
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
    emit: mockEmit,
  })),
}))

function createMockSupabase() {
  const from = vi.fn().mockImplementation((table: string) => {
    if (table === 'consents') {
      const single = vi.fn().mockResolvedValue({ data: { id: 'consent-001' }, error: null })
      const select = vi.fn().mockReturnValue({ single })
      const insert = vi.fn().mockReturnValue({ select })
      return { insert }
    }
    if (table === 'audit_log') {
      return {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      }
    }
    return { insert: vi.fn().mockResolvedValue({ error: null }) }
  })
  return { from }
}

const { createCallerFactory } = await import('../trpc/init')
const { consentRouter } = await import('../trpc/routers/consent')

const baseInput = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  status: 'ACTIVE' as const,
  category: ['PRESCRIPTIONS'],
  patientRef: 'Patient/patient-001',
  dateTime: '2026-04-29T10:00:00Z',
  provisionStart: '2026-04-29T10:00:00Z',
  grantorRole: 'SELF' as const,
  purpose: 'TREATMENT' as const,
  consentVersion: '1.0',
  auditHash: 'abc123',
  hlcTimestamp: 'hlc-001',
}

beforeEach(() => {
  mockEmit.mockClear()
})

describe('consent.sync — SECURITY_VIOLATION audit on rejection (Story 21.3)', () => {
  it('emits SECURITY_VIOLATION audit when unauthorized role attempts consent sync', async () => {
    // DOCTOR has Consent resource access but is NOT in CONSENT_GRANTOR_ROLES
    const mock = createMockSupabase()
    const caller = createCallerFactory(consentRouter)({
      supabase: mock as never,
      user: { sub: 'doctor-001', role: 'DOCTOR', sessionId: 'sess-1' },
      headers: new Headers(),
    })

    await expect(
      caller.sync({ ...baseInput, grantorId: 'doctor-001' }),
    ).rejects.toThrow(TRPCError)

    // Verify SECURITY_VIOLATION audit was emitted before the rejection
    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SECURITY_VIOLATION',
        resourceType: 'CONSENT',
        resourceId: baseInput.id,
        actorId: 'doctor-001',
        actorRole: 'DOCTOR',
        outcome: 'FAILURE',
        metadata: expect.objectContaining({ reason: 'unauthorized_role' }),
      }),
    )
  })

  it('emits SECURITY_VIOLATION audit when grantor impersonation is detected', async () => {
    const mock = createMockSupabase()
    const caller = createCallerFactory(consentRouter)({
      supabase: mock as never,
      user: { sub: 'attacker-999', role: 'PATIENT', sessionId: 'sess-2' },
      headers: new Headers(),
    })

    await expect(
      caller.sync({ ...baseInput, grantorId: 'patient-001' }),
    ).rejects.toThrow(TRPCError)

    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SECURITY_VIOLATION',
        resourceType: 'CONSENT',
        resourceId: baseInput.id,
        actorId: 'attacker-999',
        metadata: expect.objectContaining({ reason: 'grantor_impersonation' }),
      }),
    )
  })

  it('allows ADMIN to sync consent on behalf of another user (break-glass)', async () => {
    const mock = createMockSupabase()
    const caller = createCallerFactory(consentRouter)({
      supabase: mock as never,
      user: { sub: 'admin-001', role: 'ADMIN', sessionId: 'sess-admin' },
      headers: new Headers(),
    })

    // ADMIN syncs with a grantorId that differs from their own sub — should succeed
    await caller.sync({ ...baseInput, grantorId: 'patient-001' })

    // No SECURITY_VIOLATION should be emitted for admin break-glass
    const securityCalls = mockEmit.mock.calls.filter(
      (call) => call[0]?.action === 'SECURITY_VIOLATION',
    )
    expect(securityCalls).toHaveLength(0)
  })

  it('does NOT emit SECURITY_VIOLATION when consent sync succeeds (legitimate user)', async () => {
    const mock = createMockSupabase()
    const caller = createCallerFactory(consentRouter)({
      supabase: mock as never,
      user: { sub: 'patient-001', role: 'PATIENT', sessionId: 'sess-3' },
      headers: new Headers(),
    })

    await caller.sync({ ...baseInput, grantorId: 'patient-001' })

    // Only the success audit should fire, not SECURITY_VIOLATION
    const securityCalls = mockEmit.mock.calls.filter(
      (call) => call[0]?.action === 'SECURITY_VIOLATION',
    )
    expect(securityCalls).toHaveLength(0)
  })

  it('still rejects even if audit emit throws (audit failure must not block rejection)', async () => {
    mockEmit.mockRejectedValueOnce(new Error('Audit DB down'))

    const mock = createMockSupabase()
    // CLINICIAN has Consent access but is NOT a consent grantor role
    const caller = createCallerFactory(consentRouter)({
      supabase: mock as never,
      user: { sub: 'clinician-001', role: 'CLINICIAN', sessionId: 'sess-4' },
      headers: new Headers(),
    })

    await expect(
      caller.sync({ ...baseInput, grantorId: 'clinician-001' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
