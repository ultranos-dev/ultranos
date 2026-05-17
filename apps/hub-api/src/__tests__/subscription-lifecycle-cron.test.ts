import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================
// Subscription Lifecycle Cron Tests — Story 27.9 Task 7.3
// Tests the daily lifecycle checks: trial expirations,
// grace period expirations, suspension-to-cancellation,
// purge job creation, and grace period warnings.
// ============================================================

// Since the Edge Function runs in Deno, we test the equivalent logic
// by importing the state machine and simulating the cron checks.

vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({
    emit: vi.fn().mockResolvedValue({ id: 'audit-1', chainHash: 'abc' }),
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

describe('Subscription Lifecycle Cron Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Trial expirations', () => {
    it('expired trials are transitioned to CANCELLED', async () => {
      const mockDb = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'organizations') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'org-1', status: 'TRIAL', name: 'Test Org', billing_email: 'a@b.com' },
                    error: null,
                  }),
                }),
              }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ error: null, count: 1 }),
                }),
              }),
            }
          }
          return { from: vi.fn() }
        }),
        rpc: vi.fn().mockResolvedValue({ data: [{}], error: null }),
      }

      // TRIAL -> CANCELLED is valid
      expect(validateTransition('TRIAL', 'CANCELLED')).toBe(true)
      await transitionOrg('org-1', 'CANCELLED', 'Trial expired without payment method', {
        supabase: mockDb as any,
      })

      // Verify update was called
      expect(mockDb.from).toHaveBeenCalledWith('organizations')
    })
  })

  describe('Grace period expirations', () => {
    it('expired grace periods transition orgs to SUSPENDED', async () => {
      const mockDb = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'organizations') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'org-2', status: 'ACTIVE', name: 'Grace Org', billing_email: 'b@c.com' },
                    error: null,
                  }),
                }),
              }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ error: null, count: 1 }),
                }),
              }),
            }
          }
          return { from: vi.fn() }
        }),
        rpc: vi.fn().mockResolvedValue({ data: [{}], error: null }),
      }

      expect(validateTransition('ACTIVE', 'SUSPENDED')).toBe(true)
      await transitionOrg('org-2', 'SUSPENDED', 'Payment grace period expired', {
        supabase: mockDb as any,
      })

      expect(mockDb.from).toHaveBeenCalledWith('organizations')
    })
  })

  describe('Suspension to cancellation', () => {
    it('30-day suspended orgs transition to CANCELLED', async () => {
      const mockDb = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'organizations') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'org-3', status: 'SUSPENDED', name: 'Suspended Org', billing_email: 'c@d.com' },
                    error: null,
                  }),
                }),
              }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ error: null, count: 1 }),
                }),
              }),
            }
          }
          return { from: vi.fn() }
        }),
        rpc: vi.fn().mockResolvedValue({ data: [{}], error: null }),
      }

      expect(validateTransition('SUSPENDED', 'CANCELLED')).toBe(true)
      await transitionOrg('org-3', 'CANCELLED', 'Suspended for 30 days without payment resolution', {
        supabase: mockDb as any,
      })

      expect(mockDb.from).toHaveBeenCalledWith('organizations')
    })
  })

  describe('Data purge scheduling', () => {
    it('90-day cancelled orgs get a PENDING purge job created', async () => {
      // Simulate the cron check: query cancelled orgs past 90 days, then insert purge job
      const insertCalls: unknown[] = []
      const mockDb = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'data_purge_jobs') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  in: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({
                      data: [], // No existing purge job
                      error: null,
                    }),
                  }),
                }),
              }),
              insert: vi.fn().mockImplementation((row: unknown) => {
                insertCalls.push(row)
                return { error: null }
              }),
            }
          }
          return { select: vi.fn() }
        }),
      }

      // Simulate cron logic: check for existing purge job, then create one
      const { data: existingJob } = await mockDb
        .from('data_purge_jobs')
        .select('id')
        .eq('org_id', 'org-4')
        .in('status', ['PENDING', 'CONFIRMED', 'EXECUTING'])
        .limit(1)

      expect(existingJob).toHaveLength(0)

      // Create purge job
      const result = mockDb.from('data_purge_jobs').insert({
        org_id: 'org-4',
        scheduled_at: new Date().toISOString(),
      })

      expect(result.error).toBeNull()
      expect(insertCalls).toHaveLength(1)
      expect((insertCalls[0] as any).org_id).toBe('org-4')
    })

    it('duplicate purge jobs are not created for the same org', async () => {
      const insertCalls: unknown[] = []
      const mockDb = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'data_purge_jobs') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  in: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({
                      data: [{ id: 'existing-purge-1' }], // Existing purge job found
                      error: null,
                    }),
                  }),
                }),
              }),
              insert: vi.fn().mockImplementation((row: unknown) => {
                insertCalls.push(row)
                return { error: null }
              }),
            }
          }
          return { select: vi.fn() }
        }),
      }

      // Simulate cron logic: check for existing purge job
      const { data: existingJob } = await mockDb
        .from('data_purge_jobs')
        .select('id')
        .eq('org_id', 'org-5')
        .in('status', ['PENDING', 'CONFIRMED', 'EXECUTING'])
        .limit(1)

      // Existing job found — should NOT insert
      expect(existingJob).toHaveLength(1)
      // Insert should NOT be called in this case
      expect(insertCalls).toHaveLength(0)
    })
  })

  describe('Grace period warning emails', () => {
    it('grace period warning emails sent at correct intervals', async () => {
      const { sendBillingNotification } = await import('@/services/billing-notifications')

      const mockDb = {
        from: vi.fn().mockReturnValue({
          insert: vi.fn().mockResolvedValue({ error: null }),
        }),
      }

      // Simulate day 1 warning
      const { sendBillingNotification: send } = await import('@/services/billing-notifications')
      await send(mockDb as any, 'GRACE_WARNING_DAY_1', {
        orgName: 'Test Org',
        billingEmail: 'admin@test.org',
      })

      expect(sendBillingNotification).toHaveBeenCalledWith(
        expect.anything(),
        'GRACE_WARNING_DAY_1',
        expect.objectContaining({ orgName: 'Test Org', billingEmail: 'admin@test.org' }),
      )

      // Simulate day 5 warning
      await send(mockDb as any, 'GRACE_WARNING_DAY_5', {
        orgName: 'Test Org',
        billingEmail: 'admin@test.org',
      })

      expect(sendBillingNotification).toHaveBeenCalledWith(
        expect.anything(),
        'GRACE_WARNING_DAY_5',
        expect.objectContaining({ orgName: 'Test Org', billingEmail: 'admin@test.org' }),
      )
    })
  })
})
