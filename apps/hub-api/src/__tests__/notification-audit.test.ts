import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Story 12.4 AC 10: All notification events (sent, delivered, acknowledged, escalated) emit audit events.
 * This test validates audit event emission for each lifecycle stage.
 */

const mockAuditEmit = vi.fn().mockResolvedValue({ id: 'audit-1' })

const mockInsert = vi.fn().mockReturnValue({
  select: vi.fn().mockReturnValue({
    single: vi.fn().mockResolvedValue({
      data: { id: 'n-1', recipient_ref: 'doc-1', recipient_role: 'CLINICIAN', type: 'LAB_RESULT_AVAILABLE', payload: '{}', status: 'QUEUED', created_at: new Date().toISOString() },
      error: null,
    }),
  }),
})

const mockSelect = vi.fn()

const mockFrom = vi.fn(() => ({
  insert: mockInsert,
  select: mockSelect,
  update: vi.fn().mockReturnValue({
    in: vi.fn().mockResolvedValue({ error: null }),
    eq: vi.fn().mockResolvedValue({ error: null }),
  }),
}))

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

function makeCtx(user: { sub: string; role: string; sessionId: string } | null) {
  return {
    supabase: { from: mockFrom } as never,
    user,
    headers: new Headers(),
  }
}

const SYSTEM_USER = { sub: 'system-1', role: 'SYSTEM', sessionId: 's-sys' }
const DOCTOR_USER = { sub: 'doctor-1', role: 'DOCTOR', sessionId: 's-d1' }

describe('Notification Audit Events (AC: 10)', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockInsert.mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'n-1', recipient_ref: 'doc-1', recipient_role: 'CLINICIAN', type: 'LAB_RESULT_AVAILABLE', payload: '{}', status: 'QUEUED', created_at: new Date().toISOString() },
          error: null,
        }),
      }),
    })
  })

  // NOTE: dispatch audit test removed — dispatch is now internal-only (direct DB insert).
  // Dispatch audit behavior is covered by lab-register tests.

  it('emits audit event with action=UPDATE when notification is delivered', async () => {
    // Mock list returning QUEUED notifications
    mockSelect.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({
            data: [
              { id: 'n-1', type: 'LAB_RESULT_AVAILABLE', payload: '{}', status: 'QUEUED', created_at: new Date().toISOString(), delivered_at: null, acknowledged_at: null },
            ],
            error: null,
          }),
        }),
      }),
    })

    const router = createTRPCRouter({ notification: notificationRouter })
    const caller = createCallerFactory(router)(makeCtx(DOCTOR_USER))

    await caller.notification.list()

    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        resourceType: 'NOTIFICATION',
        metadata: expect.objectContaining({
          notificationAction: 'delivered',
        }),
      }),
    )
  })

  it('emits audit event with action=UPDATE when notification is acknowledged', async () => {
    // Mock: find the notification owned by the user
    mockSelect.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'n-1', recipient_ref: 'doctor-1', status: 'SENT' },
            error: null,
          }),
        }),
      }),
    })

    const router = createTRPCRouter({ notification: notificationRouter })
    const caller = createCallerFactory(router)(makeCtx(DOCTOR_USER))

    await caller.notification.acknowledge({
      notificationId: '00000000-0000-4000-8000-000000000001',
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

  it('no PHI in any audit event metadata', async () => {
    // Mock: find the notification owned by the user
    mockSelect.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'n-1', recipient_ref: 'doctor-1', status: 'SENT' },
            error: null,
          }),
        }),
      }),
    })

    const router = createTRPCRouter({ notification: notificationRouter })
    const caller = createCallerFactory(router)(makeCtx(DOCTOR_USER))

    await caller.notification.acknowledge({
      notificationId: '00000000-0000-4000-8000-000000000001',
    })

    for (const call of mockAuditEmit.mock.calls) {
      const meta = JSON.stringify(call[0].metadata ?? {})
      // No patient names, diagnoses, or raw identifiers
      expect(meta).not.toContain('patientName')
      expect(meta).not.toContain('diagnosis')
      expect(meta).not.toContain('resultValue')
    }
  })
})
