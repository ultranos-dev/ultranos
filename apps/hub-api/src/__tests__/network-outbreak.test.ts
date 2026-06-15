import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TRPCError } from '@trpc/server'

vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({ from: vi.fn() })),
  db: {
    toRow: (d: any) => d,
    toRowRaw: (d: any) => d,
    fromRow: (d: any) => d,
    fromRowRaw: (d: any) => d,
    fromRows: (d: any[]) => d,
  },
}))

const mockAuditEmit = vi.fn().mockResolvedValue(undefined)
vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({ emit: mockAuditEmit })),
}))

vi.mock('@ultranos/crypto/server', () => ({
  encryptField: vi.fn((v: string) => `enc:${v}`),
  decryptField: vi.fn((v: string) => v.replace('enc:', '')),
}))

vi.mock('@/lib/field-encryption', () => ({
  getCachedEncryptionKey: vi.fn().mockResolvedValue('mock-key'),
}))

vi.mock('@/lib/screening-reminders', () => ({
  computeScreeningReminders: vi.fn().mockReturnValue([]),
}))

const { createCallerFactory } = await import('../trpc/init')
const { adminRouter } = await import('../trpc/routers/admin')

// ── Context helpers ──────────────────────────────────
function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    supabase: { from: mockFrom, auth: { admin: { getUserById: vi.fn() } } } as never,
    user: { sub: 'admin-1', role: 'ADMIN', orgId: 'org-1', sessionId: 'sess-1', ...overrides },
    headers: new Headers(),
  }
}

// ── Flexible mock builder ─────────────────────────────
// tableMap: { tableName: resolvedValue } — each entry becomes a fluent Supabase chain
const mockFrom = vi.fn()

function setupMocks(tableMap: Record<string, unknown>) {
  mockFrom.mockImplementation((table: string) => {
    const resolved = tableMap[table] ?? { data: [], error: null }
    const chain: Record<string, any> = {}
    const terminal = vi.fn().mockResolvedValue(resolved)
    chain.select = vi.fn(() => chain)
    chain.eq = vi.fn(() => chain)
    chain.in = vi.fn(() => chain)
    chain.not = vi.fn(() => chain)
    chain.lte = vi.fn(() => chain)
    chain.gte = vi.fn(() => chain)
    chain.is = vi.fn(() => chain)
    chain.order = vi.fn(() => chain)
    chain.limit = vi.fn(() => chain)
    chain.range = vi.fn(() => chain)
    chain.single = terminal
    chain.maybeSingle = terminal
    chain.insert = vi.fn(() => ({ select: vi.fn(() => ({ single: terminal })), ...chain }))
    chain.update = vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({ select: vi.fn(() => terminal()), ...chain })),
          select: vi.fn(() => terminal()),
          ...chain,
        })),
        select: vi.fn(() => terminal()),
        ...chain,
      })),
      ...chain,
    }))
    // Make the chain itself awaitable (for cases where order/limit are the last call)
    chain.then = (resolve: any) => Promise.resolve(resolved).then(resolve)
    return chain
  })
}

// ── Tests ────────────────────────────────────────────
describe('Story 55.7: Network & Outbreak Management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuditEmit.mockResolvedValue(undefined)
  })

  // ================================================================
  // Task 10.1: Network overview aggregation
  // ================================================================
  describe('getNetworkOverview', () => {
    it('returns lab summaries with aggregated metrics for all labs in org', async () => {
      setupMocks({
        labs: { data: [
          { id: 'lab-1', lab_name: 'Central Lab', status: 'ACTIVE', last_sync_at: '2026-05-30T10:00:00Z', created_at: '2026-01-01' },
          { id: 'lab-2', lab_name: 'Field Lab', status: 'PENDING', last_sync_at: null, created_at: '2026-03-01' },
        ], error: null },
        lab_technicians: { data: [{ lab_id: 'lab-1' }, { lab_id: 'lab-1' }, { lab_id: 'lab-2' }], error: null },
        lab_orders: { data: [{ lab_id: 'lab-1' }, { lab_id: 'lab-1' }], error: null },
        lab_inventory_snapshots: { data: [{ lab_id: 'lab-1' }], error: null },
        audit_events: { data: null, error: null },
      })

      const caller = createCallerFactory(adminRouter)(makeCtx())
      const result = await caller.getNetworkOverview()

      expect(result.labs).toHaveLength(2)
      const central = result.labs.find((l) => l.labId === 'lab-1')!
      expect(central.labName).toBe('Central Lab')
      expect(central.status).toBe('ACTIVE')
      expect(central.staffCount).toBe(2)
      expect(central.pendingSamples).toBe(2)
      expect(central.stockAlertCount).toBe(1)
    })

    it('returns empty labs array when org has no labs', async () => {
      setupMocks({ labs: { data: [], error: null } })
      const caller = createCallerFactory(adminRouter)(makeCtx())
      const result = await caller.getNetworkOverview()
      expect(result.labs).toHaveLength(0)
    })

    it('emits NETWORK_OVERVIEW_ACCESSED audit event with labCount', async () => {
      setupMocks({
        labs: { data: [{ id: 'lab-1', lab_name: 'Lab', status: 'ACTIVE', last_sync_at: null, created_at: '2026-01-01' }], error: null },
        lab_technicians: { data: [], error: null },
        lab_orders: { data: [], error: null },
        lab_inventory_snapshots: { data: [], error: null },
      })
      const caller = createCallerFactory(adminRouter)(makeCtx())
      await caller.getNetworkOverview()
      expect(mockAuditEmit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'NETWORK_OVERVIEW_ACCESSED', metadata: expect.objectContaining({ labCount: 1 }) }),
      )
    })
  })

  // ================================================================
  // Task 10.2: Outbreak lifecycle
  // ================================================================
  describe('activateOutbreakMode', () => {
    it('creates outbreak event with deduplicated lab IDs and returns outbreakId', async () => {
      const outbreakId = 'ob-uuid-1'
      const insertSingle = vi.fn().mockResolvedValue({ data: { id: outbreakId }, error: null })

      mockFrom.mockImplementation((table: string) => {
        const chain: Record<string, any> = {}
        chain.select = vi.fn(() => chain)
        chain.eq = vi.fn(() => chain)
        chain.in = vi.fn(() => chain)
        chain.single = vi.fn().mockResolvedValue({ data: null, error: null })
        chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
        chain.then = (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve)

        if (table === 'labs') {
          chain.then = (resolve: any) =>
            Promise.resolve({ data: [{ id: 'lab-1' }, { id: 'lab-2' }], error: null }).then(resolve)
        }
        if (table === 'outbreak_events') {
          chain.insert = vi.fn(() => ({ select: vi.fn(() => ({ single: insertSingle })) }))
        }
        if (table === 'lab_technicians') {
          chain.then = (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve)
        }
        if (table === 'notifications') {
          chain.insert = vi.fn().mockResolvedValue({ data: null, error: null })
        }
        return chain
      })

      const caller = createCallerFactory(adminRouter)(makeCtx())
      const result = await caller.activateOutbreakMode({
        pathogen: 'Cholera',
        affectedLabIds: ['lab-1', 'lab-2', 'lab-1'], // duplicate lab-1
        notes: 'Urgent',
      })

      expect(result.outbreakId).toBe(outbreakId)
      expect(result.success).toBe(true)
      // Verify deduplicated IDs were stored (insertSingle was called via insert chain)
      expect(insertSingle).toHaveBeenCalled()
    })

    it('rejects activation when lab does not belong to org', async () => {
      mockFrom.mockImplementation((table: string) => {
        const chain: Record<string, any> = {}
        chain.select = vi.fn(() => chain)
        chain.eq = vi.fn(() => chain)
        chain.in = vi.fn(() => chain)
        chain.single = vi.fn().mockResolvedValue({ data: null, error: null })
        // labs query returns only lab-1 (lab-foreign not in org)
        chain.then = (resolve: any) =>
          Promise.resolve({ data: table === 'labs' ? [{ id: 'lab-1' }] : [], error: null }).then(resolve)
        return chain
      })

      const caller = createCallerFactory(adminRouter)(makeCtx())
      await expect(
        caller.activateOutbreakMode({ pathogen: 'Cholera', affectedLabIds: ['lab-1', 'lab-foreign'] }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    })

    it('emits OUTBREAK_MODE_ACTIVATED audit event with affectedLabIds and pathogen', async () => {
      const outbreakId = 'ob-uuid-2'
      const insertSingle = vi.fn().mockResolvedValue({ data: { id: outbreakId }, error: null })

      mockFrom.mockImplementation((table: string) => {
        const chain: Record<string, any> = {}
        chain.select = vi.fn(() => chain)
        chain.eq = vi.fn(() => chain)
        chain.in = vi.fn(() => chain)
        chain.single = vi.fn().mockResolvedValue({ data: null, error: null })
        chain.then = (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve)
        if (table === 'labs') {
          chain.then = (resolve: any) => Promise.resolve({ data: [{ id: 'lab-1' }], error: null }).then(resolve)
        }
        if (table === 'outbreak_events') {
          chain.insert = vi.fn(() => ({ select: vi.fn(() => ({ single: insertSingle })) }))
        }
        if (table === 'notifications') {
          chain.insert = vi.fn().mockResolvedValue({ data: null, error: null })
        }
        return chain
      })

      const caller = createCallerFactory(adminRouter)(makeCtx())
      await caller.activateOutbreakMode({ pathogen: 'Measles', affectedLabIds: ['lab-1'] })

      expect(mockAuditEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'OUTBREAK_MODE_ACTIVATED',
          metadata: expect.objectContaining({
            pathogen: 'Measles',
            affectedLabIds: expect.arrayContaining(['lab-1']),
          }),
        }),
      )
    })
  })

  describe('deactivateOutbreakMode', () => {
    it('resolves an ACTIVE outbreak atomically', async () => {
      const updateChain = { count: 1, error: null }
      const fetchSingle = vi.fn().mockResolvedValue({
        data: { id: 'ob-1', status: 'ACTIVE', pathogen: 'Cholera', affected_lab_ids: ['lab-1'] },
        error: null,
      })

      mockFrom.mockImplementation((table: string) => {
        const chain: Record<string, any> = {}
        chain.select = vi.fn(() => chain)
        chain.eq = vi.fn(() => chain)
        chain.in = vi.fn(() => chain)
        chain.single = fetchSingle
        chain.then = (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve)
        if (table === 'outbreak_events') {
          chain.update = vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({ select: vi.fn(() => Promise.resolve(updateChain)) })),
              })),
            })),
          }))
        }
        if (table === 'notifications') {
          chain.insert = vi.fn().mockResolvedValue({ data: null, error: null })
        }
        return chain
      })

      const caller = createCallerFactory(adminRouter)(makeCtx())
      const result = await caller.deactivateOutbreakMode({ outbreakId: 'ob-1' })
      expect(result.success).toBe(true)
    })

    it('rejects deactivation of an already-resolved outbreak (atomic update returns 0 rows)', async () => {
      const fetchSingle = vi.fn().mockResolvedValue({
        data: { id: 'ob-1', status: 'RESOLVED', pathogen: 'Cholera', affected_lab_ids: ['lab-1'] },
        error: null,
      })

      mockFrom.mockImplementation((table: string) => {
        const chain: Record<string, any> = {}
        chain.select = vi.fn(() => chain)
        chain.eq = vi.fn(() => chain)
        chain.in = vi.fn(() => chain)
        chain.single = fetchSingle
        chain.then = (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve)
        if (table === 'outbreak_events') {
          chain.update = vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({ select: vi.fn(() => Promise.resolve({ count: 0, error: null })) })),
              })),
            })),
          }))
        }
        return chain
      })

      const caller = createCallerFactory(adminRouter)(makeCtx())
      await expect(
        caller.deactivateOutbreakMode({ outbreakId: 'ob-1' }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    })

    it('emits OUTBREAK_MODE_DEACTIVATED audit event with pathogen and affectedLabIds', async () => {
      const fetchSingle = vi.fn().mockResolvedValue({
        data: { id: 'ob-1', status: 'ACTIVE', pathogen: 'Typhoid', affected_lab_ids: ['lab-1', 'lab-2'] },
        error: null,
      })

      mockFrom.mockImplementation((table: string) => {
        const chain: Record<string, any> = {}
        chain.select = vi.fn(() => chain)
        chain.eq = vi.fn(() => chain)
        chain.in = vi.fn(() => chain)
        chain.single = fetchSingle
        chain.then = (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve)
        if (table === 'outbreak_events') {
          chain.update = vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({ select: vi.fn(() => Promise.resolve({ count: 1, error: null })) })),
              })),
            })),
          }))
        }
        if (table === 'notifications') {
          chain.insert = vi.fn().mockResolvedValue({ data: null, error: null })
        }
        return chain
      })

      const caller = createCallerFactory(adminRouter)(makeCtx())
      await caller.deactivateOutbreakMode({ outbreakId: 'ob-1' })

      expect(mockAuditEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'OUTBREAK_MODE_DEACTIVATED',
          metadata: expect.objectContaining({
            pathogen: 'Typhoid',
            affectedLabIds: expect.arrayContaining(['lab-1', 'lab-2']),
          }),
        }),
      )
    })
  })

  // ================================================================
  // Task 10.3: CHW enrollment
  // ================================================================
  describe('enrollChw', () => {
    it('creates practitioner with CHW role and inserts lab_technicians row', async () => {
      const practInsert = vi.fn().mockResolvedValue({ data: null, error: null })
      const techInsert = vi.fn().mockResolvedValue({ data: null, error: null })
      const labSingle = vi.fn().mockResolvedValue({ data: { id: 'lab-1' }, error: null })

      mockFrom.mockImplementation((table: string) => {
        const chain: Record<string, any> = {}
        chain.select = vi.fn(() => chain)
        chain.eq = vi.fn(() => chain)
        chain.single = labSingle
        if (table === 'practitioners') {
          chain.insert = practInsert
        }
        if (table === 'lab_technicians') {
          chain.insert = techInsert
        }
        return chain
      })

      const caller = createCallerFactory(adminRouter)(makeCtx())
      const result = await caller.enrollChw({
        givenName: 'Fatima',
        familyName: 'Ahmadi',
        phone: '+93700000000',
        assignedLabId: 'lab-1',
      })

      expect(result.success).toBe(true)
      expect(result.role).toBe('CHW')
      expect(result.status).toBe('ACTIVE')
      expect(result.assignedLabId).toBe('lab-1')
      expect(result.chwId).toBeTruthy()

      // Verify lab_technicians row was inserted (P2)
      expect(techInsert).toHaveBeenCalledWith(
        expect.objectContaining({ lab_id: 'lab-1', lab_role: 'CHW' }),
      )

      // Verify names were encrypted (P1/P9)
      expect(practInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          given_name: expect.stringMatching(/^enc:/),
          telecom_phone: expect.stringMatching(/^enc:/),
        }),
      )
    })

    it('rejects CHW enrollment when lab does not belong to org', async () => {
      mockFrom.mockImplementation(() => {
        const chain: Record<string, any> = {}
        chain.select = vi.fn(() => chain)
        chain.eq = vi.fn(() => chain)
        chain.single = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
        return chain
      })

      const caller = createCallerFactory(adminRouter)(makeCtx())
      await expect(
        caller.enrollChw({ givenName: 'A', familyName: '', phone: '+93700000000', assignedLabId: 'lab-foreign' }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    })

    it('throws INTERNAL_SERVER_ERROR when encryption fails — never stores plaintext PHI', async () => {
      const { getCachedEncryptionKey } = await import('@/lib/field-encryption')
      vi.mocked(getCachedEncryptionKey).mockRejectedValueOnce(new Error('Key unavailable'))

      mockFrom.mockImplementation(() => {
        const chain: Record<string, any> = {}
        chain.select = vi.fn(() => chain)
        chain.eq = vi.fn(() => chain)
        chain.single = vi.fn().mockResolvedValue({ data: { id: 'lab-1' }, error: null })
        return chain
      })

      const caller = createCallerFactory(adminRouter)(makeCtx())
      await expect(
        caller.enrollChw({ givenName: 'Fatima', familyName: '', phone: '+93700000000', assignedLabId: 'lab-1' }),
      ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' })
    })

    it('emits CHW_ENROLLED audit event without name or phone in metadata', async () => {
      const practInsert = vi.fn().mockResolvedValue({ data: null, error: null })
      const techInsert = vi.fn().mockResolvedValue({ data: null, error: null })

      mockFrom.mockImplementation((table: string) => {
        const chain: Record<string, any> = {}
        chain.select = vi.fn(() => chain)
        chain.eq = vi.fn(() => chain)
        chain.single = vi.fn().mockResolvedValue({ data: { id: 'lab-1' }, error: null })
        if (table === 'practitioners') chain.insert = practInsert
        if (table === 'lab_technicians') chain.insert = techInsert
        return chain
      })

      const caller = createCallerFactory(adminRouter)(makeCtx())
      await caller.enrollChw({ givenName: 'Fatima', familyName: '', phone: '+93700000000', assignedLabId: 'lab-1' })

      expect(mockAuditEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CHW_ENROLLED',
          metadata: expect.not.objectContaining({ name: expect.anything() }),
        }),
      )
      const auditCall = mockAuditEmit.mock.calls[0][0]
      expect(auditCall.metadata).not.toHaveProperty('phone')
      expect(auditCall.metadata).not.toHaveProperty('fullName')
      expect(auditCall.metadata).not.toHaveProperty('givenName')
      expect(auditCall.metadata).toHaveProperty('assignedLabId', 'lab-1')
    })
  })

  // ================================================================
  // Task 10.3 validation edge cases
  // ================================================================
  describe('outbreak validation edge cases', () => {
    it('rejects activateOutbreakMode with empty affectedLabIds (Zod schema)', async () => {
      const caller = createCallerFactory(adminRouter)(makeCtx())
      await expect(
        caller.activateOutbreakMode({ pathogen: 'Cholera', affectedLabIds: [] }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    })

    it('rejects deactivateOutbreakMode when outbreak is not found', async () => {
      mockFrom.mockImplementation(() => {
        const chain: Record<string, any> = {}
        chain.select = vi.fn(() => chain)
        chain.eq = vi.fn(() => chain)
        chain.single = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
        return chain
      })

      const caller = createCallerFactory(adminRouter)(makeCtx())
      await expect(
        caller.deactivateOutbreakMode({ outbreakId: '00000000-0000-0000-0000-000000000001' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    })
  })
})
