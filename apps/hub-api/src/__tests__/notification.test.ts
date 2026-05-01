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

const mockIn = vi.fn().mockResolvedValue({ error: null })
const mockUpdateChain = vi.fn().mockReturnValue({ in: mockIn })

const mockFrom = vi.fn((table: string) => {
  if (table === 'notifications') {
    return {
      insert: mockInsert,
      select: mockSelect,
      update: vi.fn().mockReturnValue({
        in: mockIn,
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }
  }
  return {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
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
      },
    ]

    mockSelect.mockReturnValue({
      eq: vi.fn().mockReturnValue({
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
        eq: vi.fn().mockReturnValue({
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
        eq: vi.fn().mockReturnValue({
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
