import { describe, it, expect, vi } from 'vitest'
import { TRPCError } from '@trpc/server'

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
    emit: vi.fn().mockResolvedValue({}),
  })),
}))

function createMockSupabase(insertResult?: { data: unknown; error: unknown }) {
  const defaultResult = insertResult ?? {
    data: { id: 'consent-001' },
    error: null,
  }
  const single = vi.fn().mockResolvedValue(defaultResult)
  const select = vi.fn().mockReturnValue({ single })
  const insert = vi.fn().mockReturnValue({ select })
  const from = vi.fn().mockReturnValue({ insert })
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

describe('consent.sync — grantor impersonation prevention (D167)', () => {
  it('allows sync when grantorId matches authenticated user', async () => {
    const mock = createMockSupabase()
    const caller = createCallerFactory(consentRouter)({
      supabase: mock as never,
      user: { sub: 'patient-001', role: 'PATIENT', sessionId: 'sess-1' },
      headers: new Headers(),
    })

    const result = await caller.sync({
      ...baseInput,
      grantorId: 'patient-001',
    })
    expect(result.success).toBe(true)
  })

  it('DENIES sync when grantorId does NOT match authenticated user (impersonation)', async () => {
    const mock = createMockSupabase()
    const caller = createCallerFactory(consentRouter)({
      supabase: mock as never,
      user: { sub: 'attacker-999', role: 'PATIENT', sessionId: 'sess-1' },
      headers: new Headers(),
    })

    await expect(
      caller.sync({
        ...baseInput,
        grantorId: 'patient-001',
      }),
    ).rejects.toThrow(TRPCError)

    await expect(
      caller.sync({
        ...baseInput,
        grantorId: 'patient-001',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('allows ADMIN to sync consent on behalf of a patient (override)', async () => {
    const mock = createMockSupabase()
    const caller = createCallerFactory(consentRouter)({
      supabase: mock as never,
      user: { sub: 'admin-001', role: 'ADMIN', sessionId: 'sess-1' },
      headers: new Headers(),
    })

    const result = await caller.sync({
      ...baseInput,
      grantorId: 'patient-001',
    })
    expect(result.success).toBe(true)
  })
})
