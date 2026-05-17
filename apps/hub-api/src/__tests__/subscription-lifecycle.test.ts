import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuditEmit = vi.fn().mockResolvedValue({})

vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({
    emit: mockAuditEmit,
  })),
}))

const {
  scheduleUserSuspension,
  suspendUser,
  processPendingSuspensions,
  reactivateUsersForModule,
} = await import('../lib/subscription-lifecycle')

function createMockSupabase() {
  const updateFn = vi.fn()
  const fromFn = vi.fn()
  const authAdmin = {
    updateUserById: vi.fn().mockResolvedValue({ data: {}, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  }

  return {
    from: fromFn,
    auth: { admin: authAdmin },
    _updateFn: updateFn,
    _authAdmin: authAdmin,
  }
}

describe('scheduleUserSuspension', () => {
  let supabase: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    supabase = createMockSupabase()
    vi.clearAllMocks()
    mockAuditEmit.mockResolvedValue({})
  })

  it('creates pending suspension for affected users', async () => {
    const practitioners = [
      { id: 'prac-1', auth_user_id: 'user-1', role: 'CLINICIAN' },
      { id: 'prac-2', auth_user_id: 'user-2', role: 'DOCTOR' },
    ]

    // from('practitioners').select().eq('org_id').in('role').is('suspended_at', null) → practitioners
    const isFn = vi.fn().mockResolvedValue({ data: practitioners, error: null })
    const inFn = vi.fn().mockReturnValue({ is: isFn })
    const eqOrgId = vi.fn().mockReturnValue({ in: inFn })
    const selectPractitioners = vi.fn().mockReturnValue({ eq: eqOrgId })

    // from('practitioners').update().eq() → success
    const updateEq = vi.fn().mockResolvedValue({ error: null })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEq })

    // from('audit_events').insert() → success (for AuditLogger)
    const auditInsertSelect = vi.fn().mockResolvedValue({ data: [{ id: 'ae-1' }], error: null })
    const auditInsert = vi.fn().mockReturnValue({ select: auditInsertSelect })

    supabase.from.mockImplementation((table: string) => {
      if (table === 'practitioners') {
        return { select: selectPractitioners, update: updateFn }
      }
      if (table === 'audit_events') {
        return { insert: auditInsert }
      }
      return { select: vi.fn().mockReturnValue({ eq: vi.fn() }) }
    })

    const effectiveDate = new Date('2026-06-01')
    const result = await scheduleUserSuspension(
      supabase as any,
      'org-1',
      'OPD_LITE',
      effectiveDate,
      'admin-1',
      'sess-1',
    )

    expect(result.scheduledCount).toBe(2)
    expect(updateFn).toHaveBeenCalledTimes(2)
    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        pending_suspension_date: effectiveDate.toISOString(),
        suspension_reason: 'MODULE_CANCELLED:OPD_LITE',
      }),
    )
  })

  it('returns 0 for modules with no mapped roles', async () => {
    const result = await scheduleUserSuspension(
      supabase as any,
      'org-1',
      'UNKNOWN_MODULE',
      new Date(),
      'admin-1',
      'sess-1',
    )
    expect(result.scheduledCount).toBe(0)
  })

  it('throws on DB query failure instead of returning 0', async () => {
    const isFn = vi.fn().mockResolvedValue({ data: null, error: { message: 'DB connection lost' } })
    const inFn = vi.fn().mockReturnValue({ is: isFn })
    const eqOrgId = vi.fn().mockReturnValue({ in: inFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eqOrgId })

    supabase.from.mockImplementation(() => ({ select: selectFn }))

    await expect(
      scheduleUserSuspension(supabase as any, 'org-1', 'OPD_LITE', new Date(), 'admin-1', 'sess-1'),
    ).rejects.toThrow('Failed to query practitioners')
  })
})

describe('suspendUser', () => {
  let supabase: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    supabase = createMockSupabase()
    vi.clearAllMocks()
    mockAuditEmit.mockResolvedValue({})
  })

  it('updates practitioner record, Auth app_metadata, and signs out user', async () => {
    const updateEq = vi.fn().mockResolvedValue({ error: null })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEq })

    supabase.from.mockImplementation((table: string) => {
      if (table === 'practitioners') return { update: updateFn }
      return {}
    })

    await suspendUser(
      supabase as any,
      'user-1',
      'prac-1',
      'MODULE_CANCELLED:OPD_LITE',
      'SYSTEM',
      'cron',
    )

    // Practitioner record updated
    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        suspension_reason: 'MODULE_CANCELLED:OPD_LITE',
        pending_suspension_date: null,
      }),
    )

    // Supabase Auth app_metadata updated to SUSPENDED
    expect(supabase._authAdmin.updateUserById).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        app_metadata: expect.objectContaining({
          status: 'SUSPENDED',
          suspension_reason: 'MODULE_CANCELLED:OPD_LITE',
        }),
      }),
    )

    // Session invalidated
    expect(supabase._authAdmin.signOut).toHaveBeenCalledWith('user-1')
  })

  it('preserves user record — does NOT delete', async () => {
    const updateEq = vi.fn().mockResolvedValue({ error: null })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEq })

    supabase.from.mockImplementation((table: string) => {
      if (table === 'practitioners') return { update: updateFn }
      return {}
    })

    await suspendUser(supabase as any, 'user-1', 'prac-1', 'TEST', 'SYSTEM', 'cron')

    // Verify update was called (not delete) — data preserved
    expect(updateFn).toHaveBeenCalled()
    // Auth metadata updated, not deleted
    expect(supabase._authAdmin.updateUserById).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        app_metadata: expect.objectContaining({ status: 'SUSPENDED' }),
      }),
    )
  })

  it('emits audit event for suspension', async () => {
    const updateEq = vi.fn().mockResolvedValue({ error: null })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEq })

    supabase.from.mockImplementation((table: string) => {
      if (table === 'practitioners') return { update: updateFn }
      return {}
    })

    await suspendUser(supabase as any, 'user-1', 'prac-1', 'TEST', 'SYSTEM', 'cron')

    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        resourceType: 'USER_ACCOUNT',
        metadata: expect.objectContaining({ event: 'USER_SUSPENDED' }),
      }),
    )
  })

  it('throws and rolls back practitioner record if Auth update fails', async () => {
    const updateEq = vi.fn().mockResolvedValue({ error: null })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEq })

    supabase.from.mockImplementation((table: string) => {
      if (table === 'practitioners') return { update: updateFn }
      return {}
    })

    supabase._authAdmin.updateUserById.mockResolvedValueOnce({
      data: null,
      error: { message: 'Auth service unavailable' },
    })

    await expect(
      suspendUser(supabase as any, 'user-1', 'prac-1', 'TEST', 'SYSTEM', 'cron'),
    ).rejects.toThrow('Failed to update Auth metadata')

    // Rollback: practitioner record should be cleared
    expect(updateFn).toHaveBeenCalledTimes(2) // original update + rollback
  })

  it('throws if practitioner DB update fails', async () => {
    const updateEq = vi.fn().mockResolvedValue({ error: { message: 'DB error' } })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEq })

    supabase.from.mockImplementation((table: string) => {
      if (table === 'practitioners') return { update: updateFn }
      return {}
    })

    await expect(
      suspendUser(supabase as any, 'user-1', 'prac-1', 'TEST', 'SYSTEM', 'cron'),
    ).rejects.toThrow('Failed to update practitioner')
  })
})

describe('processPendingSuspensions', () => {
  let supabase: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    supabase = createMockSupabase()
    vi.clearAllMocks()
    mockAuditEmit.mockResolvedValue({})
  })

  it('suspends users with pending_suspension_date <= now', async () => {
    const pendingUsers = [
      { id: 'prac-1', auth_user_id: 'user-1', suspension_reason: 'MODULE_CANCELLED:OPD_LITE' },
    ]

    const isFn = vi.fn().mockResolvedValue({ data: pendingUsers, error: null })
    const lteFn = vi.fn().mockReturnValue({ is: isFn })
    const selectFn = vi.fn().mockReturnValue({ lte: lteFn })

    const updateEq = vi.fn().mockResolvedValue({ error: null })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEq })

    const auditInsertSelect = vi.fn().mockResolvedValue({ data: [{ id: 'ae-1' }], error: null })
    const auditInsert = vi.fn().mockReturnValue({ select: auditInsertSelect })

    supabase.from.mockImplementation((table: string) => {
      if (table === 'practitioners') return { select: selectFn, update: updateFn }
      if (table === 'audit_events') return { insert: auditInsert }
      return {}
    })

    const result = await processPendingSuspensions(supabase as any)
    expect(result.processedCount).toBe(1)
    expect(result.failedCount).toBe(0)
  })

  it('is idempotent — already suspended users are not reprocessed', async () => {
    const isFn = vi.fn().mockResolvedValue({ data: [], error: null })
    const lteFn = vi.fn().mockReturnValue({ is: isFn })
    const selectFn = vi.fn().mockReturnValue({ lte: lteFn })

    supabase.from.mockImplementation(() => ({ select: selectFn }))

    const result = await processPendingSuspensions(supabase as any)
    expect(result.processedCount).toBe(0)
    expect(result.failedCount).toBe(0)
  })

  it('skips practitioners with null auth_user_id and counts as failed', async () => {
    const pendingUsers = [
      { id: 'prac-1', auth_user_id: null, suspension_reason: 'MODULE_CANCELLED:OPD_LITE' },
      { id: 'prac-2', auth_user_id: 'user-2', suspension_reason: 'MODULE_CANCELLED:OPD_LITE' },
    ]

    const isFn = vi.fn().mockResolvedValue({ data: pendingUsers, error: null })
    const lteFn = vi.fn().mockReturnValue({ is: isFn })
    const selectFn = vi.fn().mockReturnValue({ lte: lteFn })

    const updateEq = vi.fn().mockResolvedValue({ error: null })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEq })

    supabase.from.mockImplementation((table: string) => {
      if (table === 'practitioners') return { select: selectFn, update: updateFn }
      return {}
    })

    const result = await processPendingSuspensions(supabase as any)
    expect(result.processedCount).toBe(1)
    expect(result.failedCount).toBe(1)
  })

  it('continues processing remaining users when one fails', async () => {
    const pendingUsers = [
      { id: 'prac-1', auth_user_id: 'user-1', suspension_reason: 'MODULE_CANCELLED:OPD_LITE' },
      { id: 'prac-2', auth_user_id: 'user-2', suspension_reason: 'MODULE_CANCELLED:OPD_LITE' },
    ]

    const isFn = vi.fn().mockResolvedValue({ data: pendingUsers, error: null })
    const lteFn = vi.fn().mockReturnValue({ is: isFn })
    const selectFn = vi.fn().mockReturnValue({ lte: lteFn })

    // First update fails, second succeeds
    const updateEq = vi.fn()
      .mockResolvedValueOnce({ error: { message: 'DB error' } })
      .mockResolvedValue({ error: null })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEq })

    supabase.from.mockImplementation((table: string) => {
      if (table === 'practitioners') return { select: selectFn, update: updateFn }
      return {}
    })

    const result = await processPendingSuspensions(supabase as any)
    // First fails (suspendUser throws), second succeeds
    expect(result.failedCount).toBeGreaterThanOrEqual(1)
    expect(result.processedCount + result.failedCount).toBe(2)
  })
})

describe('reactivateUsersForModule', () => {
  let supabase: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    supabase = createMockSupabase()
    vi.clearAllMocks()
    mockAuditEmit.mockResolvedValue({})
  })

  it('restores users suspended by the specific module cancellation', async () => {
    const suspendedUsers = [
      { id: 'prac-1', auth_user_id: 'user-1' },
      { id: 'prac-2', auth_user_id: 'user-2' },
    ]

    // Chain: select().eq('org_id').eq('suspension_reason').not('suspended_at', 'is', null)
    const notFn = vi.fn().mockResolvedValue({ data: suspendedUsers, error: null })
    const eqReason = vi.fn().mockReturnValue({ not: notFn })
    const eqOrg = vi.fn().mockReturnValue({ eq: eqReason })
    const selectFn = vi.fn().mockReturnValue({ eq: eqOrg })

    const updateEq = vi.fn().mockResolvedValue({ error: null })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEq })

    const auditInsertSelect = vi.fn().mockResolvedValue({ data: [{ id: 'ae-1' }], error: null })
    const auditInsert = vi.fn().mockReturnValue({ select: auditInsertSelect })

    supabase.from.mockImplementation((table: string) => {
      if (table === 'practitioners') return { select: selectFn, update: updateFn }
      if (table === 'audit_events') return { insert: auditInsert }
      return {}
    })

    const result = await reactivateUsersForModule(
      supabase as any,
      'org-1',
      'OPD_LITE',
      'admin-1',
      'sess-1',
    )

    expect(result.reactivatedCount).toBe(2)

    // Practitioner records cleared
    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        suspended_at: null,
        suspension_reason: null,
        pending_suspension_date: null,
      }),
    )

    // Auth app_metadata restored to ACTIVE
    expect(supabase._authAdmin.updateUserById).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        app_metadata: expect.objectContaining({ status: 'ACTIVE' }),
      }),
    )
  })

  it('does NOT reactivate users suspended for other reasons', async () => {
    const notFn = vi.fn().mockResolvedValue({ data: [], error: null })
    const eqReason = vi.fn().mockReturnValue({ not: notFn })
    const eqOrg = vi.fn().mockReturnValue({ eq: eqReason })
    const selectFn = vi.fn().mockReturnValue({ eq: eqOrg })

    supabase.from.mockImplementation(() => ({ select: selectFn }))

    const result = await reactivateUsersForModule(
      supabase as any,
      'org-1',
      'PHARMACY_LITE',
      'admin-1',
      'sess-1',
    )

    expect(result.reactivatedCount).toBe(0)
    expect(supabase._authAdmin.updateUserById).not.toHaveBeenCalled()
  })

  it('emits audit event on reactivation', async () => {
    const suspendedUsers = [{ id: 'prac-1', auth_user_id: 'user-1' }]

    const notFn = vi.fn().mockResolvedValue({ data: suspendedUsers, error: null })
    const eqReason = vi.fn().mockReturnValue({ not: notFn })
    const eqOrg = vi.fn().mockReturnValue({ eq: eqReason })
    const selectFn = vi.fn().mockReturnValue({ eq: eqOrg })

    const updateEq = vi.fn().mockResolvedValue({ error: null })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEq })

    supabase.from.mockImplementation((table: string) => {
      if (table === 'practitioners') return { select: selectFn, update: updateFn }
      return {}
    })

    await reactivateUsersForModule(supabase as any, 'org-1', 'OPD_LITE', 'admin-1', 'sess-1')

    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        resourceType: 'USER_ACCOUNT',
        metadata: expect.objectContaining({ event: 'USERS_REACTIVATED' }),
      }),
    )
  })
})
