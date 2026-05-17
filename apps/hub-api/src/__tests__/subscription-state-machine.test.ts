import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================
// Subscription State Machine Tests — Story 27.9 Task 7.1
// Tests validateTransition(), transitionOrg() including
// audit events and email notifications.
// ============================================================

vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({
    emit: vi.fn().mockResolvedValue({ id: 'audit-1', chainHash: 'abc123' }),
  })),
}))

vi.mock('@/services/billing-notifications', () => ({
  sendBillingNotification: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
}))

const { validateTransition, transitionOrg } = await import(
  '@/services/subscription-state-machine'
)
const { AuditLogger } = await import('@ultranos/audit-logger')
const { sendBillingNotification } = await import('@/services/billing-notifications')

function createMockSupabase(overrides?: {
  orgData?: Record<string, unknown> | null
  orgError?: { message: string } | null
  updateError?: { message: string } | null
}) {
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'organizations') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: overrides?.orgData ?? {
                  id: 'org-1',
                  status: 'TRIAL',
                  name: 'Test Org',
                  billing_email: 'admin@test.org',
                },
                error: overrides?.orgError ?? null,
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                error: overrides?.updateError ?? null,
                count: overrides?.updateError ? 0 : 1,
              }),
            }),
          }),
        }
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }
    }),
    rpc: vi.fn().mockResolvedValue({ data: [{}], error: null }),
  }
}

describe('Subscription State Machine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('validateTransition()', () => {
    it('allows TRIAL -> ACTIVE', () => {
      expect(validateTransition('TRIAL', 'ACTIVE')).toBe(true)
    })

    it('allows TRIAL -> CANCELLED', () => {
      expect(validateTransition('TRIAL', 'CANCELLED')).toBe(true)
    })

    it('allows ACTIVE -> SUSPENDED', () => {
      expect(validateTransition('ACTIVE', 'SUSPENDED')).toBe(true)
    })

    it('allows ACTIVE -> CANCELLED', () => {
      expect(validateTransition('ACTIVE', 'CANCELLED')).toBe(true)
    })

    it('allows SUSPENDED -> ACTIVE', () => {
      expect(validateTransition('SUSPENDED', 'ACTIVE')).toBe(true)
    })

    it('allows SUSPENDED -> CANCELLED', () => {
      expect(validateTransition('SUSPENDED', 'CANCELLED')).toBe(true)
    })

    it('rejects CANCELLED -> ACTIVE (terminal state)', () => {
      expect(validateTransition('CANCELLED', 'ACTIVE')).toBe(false)
    })

    it('rejects CANCELLED -> TRIAL (terminal state)', () => {
      expect(validateTransition('CANCELLED', 'TRIAL')).toBe(false)
    })

    it('rejects CANCELLED -> SUSPENDED (terminal state)', () => {
      expect(validateTransition('CANCELLED', 'SUSPENDED')).toBe(false)
    })

    it('rejects TRIAL -> SUSPENDED (not a valid transition)', () => {
      expect(validateTransition('TRIAL', 'SUSPENDED')).toBe(false)
    })

    it('rejects ACTIVE -> TRIAL (not a valid transition)', () => {
      expect(validateTransition('ACTIVE', 'TRIAL')).toBe(false)
    })

    it('rejects SUSPENDED -> TRIAL (not a valid transition)', () => {
      expect(validateTransition('SUSPENDED', 'TRIAL')).toBe(false)
    })

    it('CANCELLED has no outgoing transitions', () => {
      for (const target of ['TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED'] as const) {
        expect(validateTransition('CANCELLED', target)).toBe(false)
      }
    })
  })

  describe('transitionOrg()', () => {
    it('throws BAD_REQUEST on invalid transition', async () => {
      const mockDb = createMockSupabase({
        orgData: { id: 'org-1', status: 'CANCELLED', name: 'Test', billing_email: 'a@b.com' },
      })

      await expect(
        transitionOrg('org-1', 'ACTIVE', 'test reason', { supabase: mockDb as any }),
      ).rejects.toThrow('Invalid status transition: CANCELLED -> ACTIVE')
    })

    it('throws INTERNAL_SERVER_ERROR when org fetch fails', async () => {
      const mockDb = createMockSupabase({
        orgData: null,
        orgError: { message: 'connection refused' },
      })

      await expect(
        transitionOrg('org-1', 'ACTIVE', 'test', { supabase: mockDb as any }),
      ).rejects.toThrow('Failed to fetch organization')
    })

    it('throws INTERNAL_SERVER_ERROR when update fails', async () => {
      const mockDb = createMockSupabase({
        orgData: { id: 'org-1', status: 'TRIAL', name: 'Test', billing_email: 'a@b.com' },
        updateError: { message: 'constraint violation' },
      })

      await expect(
        transitionOrg('org-1', 'ACTIVE', 'payment ok', { supabase: mockDb as any }),
      ).rejects.toThrow('Failed to update organization status')
    })

    it('emits audit event on successful transition', async () => {
      const mockDb = createMockSupabase({
        orgData: { id: 'org-1', status: 'TRIAL', name: 'Test Org', billing_email: 'a@b.com' },
      })

      await transitionOrg('org-1', 'ACTIVE', 'payment succeeded', {
        supabase: mockDb as any,
        user: { sub: 'user-1', role: 'ADMIN', sessionId: 'sess-1' },
      })

      const mockEmit = (AuditLogger as any).mock.results[0].value.emit
      expect(mockEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ORG_STATUS_TRANSITION',
          resourceType: 'Organization',
          resourceId: 'org-1',
          actorId: 'user-1',
          actorRole: 'ADMIN',
          metadata: expect.objectContaining({
            previousStatus: 'TRIAL',
            newStatus: 'ACTIVE',
            reason: 'payment succeeded',
          }),
        }),
      )
    })

    it('sends email notification on successful transition', async () => {
      const mockDb = createMockSupabase({
        orgData: { id: 'org-1', status: 'TRIAL', name: 'Test Org', billing_email: 'admin@test.org' },
      })

      await transitionOrg('org-1', 'ACTIVE', 'payment succeeded', {
        supabase: mockDb as any,
      })

      expect(sendBillingNotification).toHaveBeenCalledWith(
        mockDb,
        'ORG_TRIAL_TO_ACTIVE',
        expect.objectContaining({
          orgName: 'Test Org',
          billingEmail: 'admin@test.org',
        }),
      )
    })

    it('uses SYSTEM for actorId and sessionId when no user in context', async () => {
      const mockDb = createMockSupabase({
        orgData: { id: 'org-1', status: 'ACTIVE', name: 'Test', billing_email: 'a@b.com' },
      })

      await transitionOrg('org-1', 'SUSPENDED', 'grace period expired', {
        supabase: mockDb as any,
      })

      const mockEmit = (AuditLogger as any).mock.results[0].value.emit
      expect(mockEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'SYSTEM',
          actorRole: 'SYSTEM',
          sessionId: 'cron',
        }),
      )
    })
  })
})
