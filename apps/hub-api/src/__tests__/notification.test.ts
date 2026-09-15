import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ──────────────────────────────────────────────────────

const mockInsert = vi.fn().mockReturnValue({
  select: vi.fn().mockReturnValue({
    single: vi.fn().mockResolvedValue({
      data: {
        id: '00000000-0000-4000-8000-000000000010',
        recipient_ref: 'doctor-1',
        recipient_role: 'CLINICIAN',
        type: 'LAB_RESULT_AVAILABLE',
        payload: {},
        status: 'QUEUED',
        created_at: '2026-04-30T00:00:00.000Z',
      },
      error: null,
    }),
  }),
})

const mockSelect = vi.fn()

// acknowledgeAll chains .in('recipient_ref', refs).in('status', [...]); the second
// .in is the awaited terminal.
const mockIn = vi.fn().mockResolvedValue({ error: null })
const mockUpdateChain = vi.fn().mockReturnValue({ in: vi.fn().mockReturnValue({ in: mockIn }) })

// resolvePractitionerId(ctx.supabase, ...) maps auth sub → practitioners.id.
// Return null so the caller's ref set is just [sub] (matches these fixtures).
function makePractitionersChain() {
  const chain: any = {}
  chain.select = vi.fn(() => chain)
  chain.eq = vi.fn(() => chain)
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
  return chain
}

const mockDelete = vi.fn()

const mockFrom = vi.fn((table: string) => {
  if (table === 'practitioners') return makePractitionersChain()
  if (table === 'notifications') {
    return {
      insert: mockInsert,
      select: mockSelect,
      update: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({ in: mockIn }),
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
      delete: mockDelete,
    }
  }
  return {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  }
})

const mockAuditEmit = vi.fn().mockResolvedValue({ id: 'audit-1' })

vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({
    emit: mockAuditEmit,
  })),
}))

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

const { createTRPCRouter, createCallerFactory } = await import('../trpc/init')
const { notificationRouter } = await import('../trpc/routers/notification')

// ── Helpers ────────────────────────────────────────────────────

function makeCtx(user: { sub: string; role: string; sessionId: string } | null) {
  return {
    supabase: { from: mockFrom } as never,
    user,
    headers: new Headers(),
  }
}

const DOCTOR_USER = { sub: 'doctor-1', role: 'DOCTOR', sessionId: 's1' }
const SYSTEM_USER = { sub: 'system-1', role: 'SYSTEM', sessionId: 's-sys' }
const PATIENT_USER = { sub: 'patient-1', role: 'PATIENT', sessionId: 's-p1' }

// ── Tests ──────────────────────────────────────────────────────
// NOTE: notification.dispatch was removed from the public tRPC router (security review).
// Dispatch is now internal-only via direct DB insert in lab.ts.
// Tests for dispatch behavior are covered by lab-register.test.ts.

describe('notification.list', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns notifications for authenticated user (AC: 3, 4)', async () => {
    const mockNotifications = [
      {
        id: 'n1',
        type: 'LAB_RESULT_AVAILABLE',
        payload: { testCategory: 'CBC', labName: 'Lab A', uploadTimestamp: '2026-04-30T00:00:00.000Z' },
        status: 'QUEUED',
        created_at: '2026-04-30T00:00:00.000Z',
        source_app: 'LAB_LITE',
        subject_key: 'ORDER_RECEIVED',
        body_key: 'orderReceivedBody',
        body_params: { testCategory: 'CBC' },
        notes_key: 'orderReceivedNotes',
      },
    ]

    mockSelect.mockReturnValue({
      in: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({
            data: mockNotifications,
            error: null,
          }),
        }),
      }),
    })

    const router = createTRPCRouter({ notification: notificationRouter })
    const caller = createCallerFactory(router)(makeCtx(DOCTOR_USER))

    const result = await caller.notification.list()

    expect(result.notifications).toHaveLength(1)
    expect(result.notifications[0].type).toBe('LAB_RESULT_AVAILABLE')
    expect(result.notifications[0].sourceApp).toBe('LAB_LITE')
    expect(result.notifications[0].subjectKey).toBe('ORDER_RECEIVED')
    expect(result.notifications[0].bodyKey).toBe('orderReceivedBody')
    expect(result.notifications[0].bodyParams).toEqual({ testCategory: 'CBC' })
    expect(result.notifications[0].notesKey).toBe('orderReceivedNotes')
  })

  it('rejects unauthenticated list requests', async () => {
    const router = createTRPCRouter({ notification: notificationRouter })
    const caller = createCallerFactory(router)(makeCtx(null))

    await expect(caller.notification.list()).rejects.toThrow()
  })
})

describe('notification.acknowledge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('marks notification as acknowledged (AC: 3, 4)', async () => {
    // Mock: verify ownership first
    mockSelect.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'n1', recipient_ref: 'doctor-1', status: 'SENT' },
            error: null,
          }),
        }),
      }),
    })

    const router = createTRPCRouter({ notification: notificationRouter })
    const caller = createCallerFactory(router)(makeCtx(DOCTOR_USER))

    const result = await caller.notification.acknowledge({
      notificationId: '00000000-0000-4000-8000-000000000010',
    })

    expect(result.success).toBe(true)
  })

  it('emits audit event on acknowledge (AC: 10)', async () => {
    mockSelect.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'n1', recipient_ref: 'doctor-1', status: 'SENT' },
            error: null,
          }),
        }),
      }),
    })

    const router = createTRPCRouter({ notification: notificationRouter })
    const caller = createCallerFactory(router)(makeCtx(DOCTOR_USER))

    await caller.notification.acknowledge({
      notificationId: '00000000-0000-4000-8000-000000000010',
    })

    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        resourceType: 'NOTIFICATION',
        outcome: 'SUCCESS',
        metadata: expect.objectContaining({
          notificationAction: 'acknowledged',
        }),
      }),
    )
  })
})

describe('notification.acknowledgeAll', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('marks all of the caller\'s unread notifications acknowledged (scoped to recipient + unread status)', async () => {
    // Update chain is now .in('recipient_ref', refs).in('status', [...]).
    const statusInMock = vi.fn().mockResolvedValue({ error: null })
    const recipientInMock = vi.fn().mockReturnValue({ in: statusInMock })
    const updateMock = vi.fn().mockReturnValue({ in: recipientInMock })
    const localFrom = vi.fn((table: string) => {
      if (table === 'practitioners') return makePractitionersChain()
      return table === 'notifications' ? { update: updateMock } : {}
    })
    const ctx = { supabase: { from: localFrom } as never, user: DOCTOR_USER, headers: new Headers() }

    const router = createTRPCRouter({ notification: notificationRouter })
    const caller = createCallerFactory(router)(ctx)

    const result = await caller.notification.acknowledgeAll()

    expect(result.success).toBe(true)
    // Only the caller's own unread notifications — scoped to the resolved ref set,
    // never a cross-recipient wipe.
    expect(recipientInMock).toHaveBeenCalledWith('recipient_ref', ['doctor-1'])
    expect(statusInMock).toHaveBeenCalledWith('status', ['QUEUED', 'SENT'])
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        resourceType: 'NOTIFICATION',
        outcome: 'SUCCESS',
        metadata: expect.objectContaining({ notificationAction: 'acknowledged_all' }),
      }),
    )
  })

  it('rejects unauthenticated requests', async () => {
    const router = createTRPCRouter({ notification: notificationRouter })
    const caller = createCallerFactory(router)(makeCtx(null))
    await expect(caller.notification.acknowledgeAll()).rejects.toThrow()
  })
})

describe('notification.markUnread', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('marks an owned notification as unread (status SENT, acknowledgedAt null)', async () => {
    // Ownership check: select returns the row
    const mockUpdateEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdateFn = vi.fn().mockReturnValue({ eq: mockUpdateEq })

    mockSelect.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: '00000000-0000-4000-8000-000000000010', recipient_ref: 'doctor-1', status: 'ACKNOWLEDGED' },
            error: null,
          }),
        }),
      }),
    })

    const localFrom = vi.fn((table: string) => {
      if (table === 'practitioners') return makePractitionersChain()
      if (table === 'notifications') {
        return {
          select: mockSelect,
          update: mockUpdateFn,
        }
      }
      return { select: vi.fn(), update: vi.fn() }
    })

    const router = createTRPCRouter({ notification: notificationRouter })
    const ctx = { supabase: { from: localFrom } as never, user: DOCTOR_USER as never, headers: new Headers() }
    const caller = createCallerFactory(router)(ctx)

    const result = await caller.notification.markUnread({
      notificationId: '00000000-0000-4000-8000-000000000010',
    })

    expect(result.success).toBe(true)
    // Update must be called with status 'SENT' and acknowledgedAt null
    expect(mockUpdateFn).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'SENT', acknowledgedAt: null }),
    )
    expect(mockUpdateEq).toHaveBeenCalledWith('id', '00000000-0000-4000-8000-000000000010')
    // Audit must be emitted with notificationAction 'marked_unread'
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        resourceType: 'NOTIFICATION',
        outcome: 'SUCCESS',
        metadata: expect.objectContaining({
          notificationAction: 'marked_unread',
        }),
      }),
    )
  })

  it('rejects marking-unread a notification the caller does not own (NOT_FOUND)', async () => {
    // Ownership check: select returns null (not owner)
    mockSelect.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST116', message: 'No rows found' },
          }),
        }),
      }),
    })

    const mockUpdateFn = vi.fn()
    const localFrom = vi.fn((table: string) => {
      if (table === 'practitioners') return makePractitionersChain()
      if (table === 'notifications') {
        return { select: mockSelect, update: mockUpdateFn }
      }
      return { select: vi.fn(), update: vi.fn() }
    })

    const router = createTRPCRouter({ notification: notificationRouter })
    const ctx = { supabase: { from: localFrom } as never, user: DOCTOR_USER as never, headers: new Headers() }
    const caller = createCallerFactory(router)(ctx)

    await expect(
      caller.notification.markUnread({
        notificationId: '00000000-0000-4000-8000-000000000099',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })

    // Update must NOT be called when ownership check fails
    expect(mockUpdateFn).not.toHaveBeenCalled()
  })

  it('rejects unauthenticated requests', async () => {
    const router = createTRPCRouter({ notification: notificationRouter })
    const caller = createCallerFactory(router)(makeCtx(null))
    await expect(
      caller.notification.markUnread({
        notificationId: '00000000-0000-4000-8000-000000000010',
      }),
    ).rejects.toThrow()
  })
})

describe('notification.delete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deletes a notification owned by the caller', async () => {
    // Ownership check: select returns the row
    mockSelect.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: '00000000-0000-4000-8000-000000000010', recipient_ref: 'doctor-1' },
            error: null,
          }),
        }),
      }),
    })
    // Delete chain: .delete().eq(...) → { error: null }
    mockDelete.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })

    const router = createTRPCRouter({ notification: notificationRouter })
    const caller = createCallerFactory(router)(makeCtx(DOCTOR_USER))

    const result = await caller.notification.delete({
      notificationId: '00000000-0000-4000-8000-000000000010',
    })

    expect(result.success).toBe(true)
    expect(mockDelete).toHaveBeenCalled()
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DELETE',
        resourceType: 'NOTIFICATION',
        outcome: 'SUCCESS',
        metadata: expect.objectContaining({
          notificationAction: 'deleted',
        }),
      }),
    )
  })

  it('rejects deleting a notification the caller does not own (NOT_FOUND)', async () => {
    // Ownership check: select returns null (not owner)
    mockSelect.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST116', message: 'No rows found' },
          }),
        }),
      }),
    })

    const router = createTRPCRouter({ notification: notificationRouter })
    const caller = createCallerFactory(router)(makeCtx(DOCTOR_USER))

    await expect(
      caller.notification.delete({
        notificationId: '00000000-0000-4000-8000-000000000099',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })

    // Delete must NOT be called when ownership check fails
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('rejects unauthenticated requests', async () => {
    const router = createTRPCRouter({ notification: notificationRouter })
    const caller = createCallerFactory(router)(makeCtx(null))
    await expect(
      caller.notification.delete({
        notificationId: '00000000-0000-4000-8000-000000000010',
      }),
    ).rejects.toThrow()
  })
})
