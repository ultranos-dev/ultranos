import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => mockSupabaseClient),
  db: {
    toRow: (data: Record<string, unknown>) => data,
    toRowRaw: (data: Record<string, unknown>) => data,
    fromRow: (data: Record<string, unknown>) => data,
    fromRowRaw: (data: Record<string, unknown>) => data,
    fromRows: (data: Record<string, unknown>[]) => data,
  },
}))

vi.mock('@/lib/jwt', () => ({
  verifySupabaseJwt: vi.fn(),
  getSupabaseJwk: vi.fn(() => null),
}))

vi.mock('@/lib/field-encryption', () => ({
  encryptRow: (data: Record<string, unknown>) => data,
  decryptRow: (data: Record<string, unknown>) => data,
  decryptRows: (data: Record<string, unknown>[]) => data,
  getCachedEncryptionKey: () => 'a'.repeat(64),
  validateEncryptionConfig: () => {},
}))

vi.mock('@ultranos/crypto/server', () => ({
  getEncryptionConfig: () => ({
    randomizedFields: [],
    deterministicFields: [],
  }),
  encryptField: (v: string) => v,
  decryptField: (v: string) => v,
}))

// Hoisted so it's available inside the vi.mock factory (vi.mock is hoisted above imports).
const { mockEmit } = vi.hoisted(() => ({ mockEmit: vi.fn().mockResolvedValue(undefined) }))

vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({
    emit: mockEmit,
  })),
}))

vi.mock('@/lib/screening-reminders', () => ({
  computeScreeningReminders: vi.fn().mockReturnValue([]),
}))

// Test UUIDs
const UUID = {
  admin: '11111111-1111-1111-1111-111111111111',
  org: '22222222-2222-2222-2222-222222222222',
  lab1: '33333333-3333-3333-3333-333333333333',
  lab2: '44444444-4444-4444-4444-444444444444',
  config: '55555555-5555-5555-5555-555555555555',
  alert1: '66666666-6666-6666-6666-666666666666',
  user: '77777777-7777-7777-7777-777777777777',
}

/**
 * Fully chainable Supabase mock. Every method returns self,
 * so chains like .select().eq().eq().maybeSingle() work.
 * Terminal methods (single/maybeSingle) resolve with finalResult.
 * When awaited directly (without single/maybeSingle), resolves with finalResult.
 */
function chainable(finalResult: any = { data: null, error: null, count: 0 }) {
  const chain: any = new Proxy({}, {
    get(_target, prop) {
      if (prop === 'then') {
        // Make the chain thenable — resolves with finalResult when awaited
        return (resolve: any, reject: any) => Promise.resolve(finalResult).then(resolve, reject)
      }
      if (prop === 'single' || prop === 'maybeSingle') {
        return () => Promise.resolve(finalResult)
      }
      // All other methods return self for chaining
      return (..._args: any[]) => chain
    },
  })
  return chain
}

const mockSupabaseClient = {
  from: vi.fn(() => chainable()),
}

const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')

const createCaller = createCallerFactory(appRouter)

const ADMIN_USER = { sub: UUID.admin, role: 'ADMIN', sessionId: 'sess-1', orgId: UUID.org }
const NON_ADMIN_USER = { sub: UUID.user, role: 'DOCTOR', sessionId: 'sess-2', orgId: UUID.org }

function createAdminContext() {
  return {
    supabase: mockSupabaseClient as never,
    user: ADMIN_USER,
    headers: new Headers(),
  }
}

function createNonAdminContext() {
  return {
    supabase: mockSupabaseClient as never,
    user: NON_ADMIN_USER,
    headers: new Headers(),
  }
}

describe('Surveillance Config CRUD', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseClient.from.mockImplementation(() => chainable())
  })

  // ─── getSurveillanceConfig ───

  describe('getSurveillanceConfig', () => {
    it('returns null when no config exists', async () => {
      const caller = createCaller(createAdminContext())
      const result = await caller.admin.getSurveillanceConfig()
      expect(result.config).toBeNull()
    })

    it('returns config with lab names joined', async () => {
      const configData = {
        id: UUID.config,
        practitioner_id: UUID.admin,
        org_id: UUID.org,
        monitored_lab_ids: [UUID.lab1, UUID.lab2],
        thresholds: [{ test_category: 'Malaria RDT', threshold_pct: 15 }],
        channels: { in_app: true, sms_phone: '+93701234567' },
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      }

      const labs = [
        { id: UUID.lab1, name: 'Lab A', status: 'ACTIVE' },
        { id: UUID.lab2, name: 'Lab B', status: 'ACTIVE' },
      ]

      let callCount = 0
      mockSupabaseClient.from.mockImplementation(() => {
        callCount++
        if (callCount === 1) return chainable({ data: configData, error: null })
        return chainable({ data: labs, error: null })
      })

      const caller = createCaller(createAdminContext())
      const result = await caller.admin.getSurveillanceConfig()
      expect(result.config).not.toBeNull()
      expect(result.config!.monitoredLabIds).toEqual([UUID.lab1, UUID.lab2])
      expect(result.config!.thresholds).toEqual([{ test_category: 'Malaria RDT', threshold_pct: 15 }])
      expect(result.config!.channels.sms_phone).toBe('+93701234567')
    })

    it('rejects non-admin users', async () => {
      const caller = createCaller(createNonAdminContext())
      await expect(caller.admin.getSurveillanceConfig()).rejects.toMatchObject({
        code: 'FORBIDDEN',
      })
    })
  })

  // ─── updateSurveillanceConfig ───

  describe('updateSurveillanceConfig', () => {
    it('validates threshold range (0-100)', async () => {
      const caller = createCaller(createAdminContext())
      await expect(
        caller.admin.updateSurveillanceConfig({
          monitoredLabIds: [UUID.lab1],
          thresholds: [{ test_category: 'Malaria RDT', threshold_pct: 150 }],
          channels: { in_app: true as const },
        }),
      ).rejects.toThrow()
    })

    it('validates E.164 phone format', async () => {
      const caller = createCaller(createAdminContext())
      await expect(
        caller.admin.updateSurveillanceConfig({
          monitoredLabIds: [UUID.lab1],
          thresholds: [{ test_category: 'Malaria RDT', threshold_pct: 15 }],
          channels: { in_app: true as const, sms_phone: 'not-a-phone' },
        }),
      ).rejects.toThrow()
    })

    it('validates email format', async () => {
      const caller = createCaller(createAdminContext())
      await expect(
        caller.admin.updateSurveillanceConfig({
          monitoredLabIds: [UUID.lab1],
          thresholds: [{ test_category: 'Malaria RDT', threshold_pct: 15 }],
          channels: { in_app: true as const, email: 'not-an-email' },
        }),
      ).rejects.toThrow()
    })

    it('requires at least one lab selected', async () => {
      const caller = createCaller(createAdminContext())
      await expect(
        caller.admin.updateSurveillanceConfig({
          monitoredLabIds: [],
          thresholds: [{ test_category: 'Malaria RDT', threshold_pct: 15 }],
          channels: { in_app: true as const },
        }),
      ).rejects.toThrow()
    })

    it('requires at least one threshold configured', async () => {
      const caller = createCaller(createAdminContext())
      await expect(
        caller.admin.updateSurveillanceConfig({
          monitoredLabIds: [UUID.lab1],
          thresholds: [],
          channels: { in_app: true as const },
        }),
      ).rejects.toThrow()
    })

    it('validates lab IDs belong to org', async () => {
      // Return empty org labs — no labs belong to org
      let callCount = 0
      mockSupabaseClient.from.mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          // labs query returns empty — none belong to org
          return chainable({ data: [], error: null })
        }
        return chainable()
      })

      const caller = createCaller(createAdminContext())
      await expect(
        caller.admin.updateSurveillanceConfig({
          monitoredLabIds: [UUID.lab1],
          thresholds: [{ test_category: 'Malaria RDT', threshold_pct: 15 }],
          channels: { in_app: true as const },
        }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      })
    })

    it('upserts config and emits SURVEILLANCE_CONFIG_UPDATED audit event on success', async () => {
      let callCount = 0
      mockSupabaseClient.from.mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          // labs query — lab belongs to org
          return chainable({ data: [{ id: UUID.lab1 }], error: null })
        }
        if (callCount === 2) {
          // first-creation check — returns null (no existing config)
          return chainable({ data: null, error: null })
        }
        if (callCount === 3) {
          // upsert returns new config
          return chainable({ data: { id: UUID.config }, error: null })
        }
        return chainable()
      })

      const caller = createCaller(createAdminContext())
      const result = await caller.admin.updateSurveillanceConfig({
        monitoredLabIds: [UUID.lab1],
        thresholds: [{ test_category: 'Malaria RDT', threshold_pct: 15 }],
        channels: { in_app: true as const, sms_phone: '+93701234567' },
      })
      expect(result.success).toBe(true)
      expect(result.configId).toBe(UUID.config)
      expect(mockEmit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'SURVEILLANCE_CONFIG_UPDATED' }),
      )
    })

    it('merges default thresholds on first config creation', async () => {
      let callCount = 0
      let upsertedThresholds: Array<{ test_category: string; threshold_pct: number }> | undefined

      const updateSpy = vi.fn().mockImplementation((data: any) => {
        upsertedThresholds = data.thresholds
        return chainable({ data: { id: UUID.config }, error: null })
      })

      mockSupabaseClient.from.mockImplementation(() => {
        callCount++
        if (callCount === 1) return chainable({ data: [{ id: UUID.lab1 }], error: null })
        if (callCount === 2) return chainable({ data: null, error: null }) // no existing config
        // upsert call — capture payload
        return { upsert: updateSpy }
      })

      const caller = createCaller(createAdminContext())
      await caller.admin.updateSurveillanceConfig({
        monitoredLabIds: [UUID.lab1],
        // Caller only provides one category; defaults for TB + Hepatitis B should be merged in
        thresholds: [{ test_category: 'Malaria RDT', threshold_pct: 20 }],
        channels: { in_app: true as const },
      })

      expect(updateSpy).toHaveBeenCalled()
      const categories = (upsertedThresholds ?? []).map((t) => t.test_category)
      expect(categories).toContain('Malaria RDT')
      expect(categories).toContain('TB (Smear)')
      expect(categories).toContain('Hepatitis B')
    })

    it('does not re-merge defaults on subsequent updates', async () => {
      let callCount = 0
      let upsertedThresholds: Array<{ test_category: string; threshold_pct: number }> | undefined

      const updateSpy = vi.fn().mockImplementation((data: any) => {
        upsertedThresholds = data.thresholds
        return chainable({ data: { id: UUID.config }, error: null })
      })

      mockSupabaseClient.from.mockImplementation(() => {
        callCount++
        if (callCount === 1) return chainable({ data: [{ id: UUID.lab1 }], error: null })
        // existing config found — not a first creation
        if (callCount === 2) return chainable({ data: { id: UUID.config }, error: null })
        return { upsert: updateSpy }
      })

      const caller = createCaller(createAdminContext())
      await caller.admin.updateSurveillanceConfig({
        monitoredLabIds: [UUID.lab1],
        thresholds: [{ test_category: 'Custom Category', threshold_pct: 10 }],
        channels: { in_app: true as const },
      })

      expect(updateSpy).toHaveBeenCalled()
      const categories = (upsertedThresholds ?? []).map((t) => t.test_category)
      expect(categories).toEqual(['Custom Category'])
    })

    it('rejects duplicate test_category in thresholds', async () => {
      const caller = createCaller(createAdminContext())
      await expect(
        caller.admin.updateSurveillanceConfig({
          monitoredLabIds: [UUID.lab1],
          thresholds: [
            { test_category: 'Malaria RDT', threshold_pct: 15 },
            { test_category: 'Malaria RDT', threshold_pct: 25 },
          ],
          channels: { in_app: true as const },
        }),
      ).rejects.toThrow()
    })
  })

  // ─── acknowledgeSurveillanceAlert ───

  describe('acknowledgeSurveillanceAlert', () => {
    it('rejects acknowledging an already acknowledged alert', async () => {
      mockSupabaseClient.from.mockImplementation(() =>
        chainable({
          data: { id: UUID.alert1, acknowledged_at: '2026-01-01T00:00:00Z', config_id: UUID.config },
          error: null,
        }),
      )

      const caller = createCaller(createAdminContext())
      await expect(
        caller.admin.acknowledgeSurveillanceAlert({ alertId: UUID.alert1 }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
      })
    })

    it('rejects non-existent alerts', async () => {
      mockSupabaseClient.from.mockImplementation(() =>
        chainable({ data: null, error: { code: 'PGRST116' } }),
      )

      const caller = createCaller(createAdminContext())
      await expect(
        caller.admin.acknowledgeSurveillanceAlert({ alertId: UUID.alert1 }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })

    it('stores notes when provided and emits SURVEILLANCE_ALERT_ACKNOWLEDGED audit event', async () => {
      const updateBodySpy = vi.fn()
      let callCount = 0

      mockSupabaseClient.from.mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          // Alert fetch — not acknowledged
          return chainable({
            data: { id: UUID.alert1, acknowledged_at: null, config_id: UUID.config },
            error: null,
          })
        }
        if (callCount === 2) {
          // Config org check
          return chainable({ data: { org_id: UUID.org }, error: null })
        }
        // Update — spy on the update body; return success with updated row
        return {
          update: (body: any) => {
            updateBodySpy(body)
            return chainable({ data: [{ id: UUID.alert1 }], error: null })
          },
        }
      })

      const caller = createCaller(createAdminContext())
      const result = await caller.admin.acknowledgeSurveillanceAlert({
        alertId: UUID.alert1,
        notes: 'Reviewed — false positive due to batch testing.',
      })
      expect(result.success).toBe(true)
      // Verify notes were persisted to the DB
      expect(updateBodySpy).toHaveBeenCalledWith(
        expect.objectContaining({ notes: 'Reviewed — false positive due to batch testing.' }),
      )
      // Verify audit event was emitted
      expect(mockEmit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'SURVEILLANCE_ALERT_ACKNOWLEDGED' }),
      )
    })
  })

  // ─── listSurveillanceAlerts ───

  describe('listSurveillanceAlerts', () => {
    it('returns empty list when no config exists', async () => {
      const caller = createCaller(createAdminContext())
      const result = await caller.admin.listSurveillanceAlerts()
      expect(result.alerts).toEqual([])
      expect(result.total).toBe(0)
    })

    it('filters by acknowledged status and applies the correct Supabase filter', async () => {
      const isSpy = vi.fn()

      // A chainable that additionally spies on `.is()` calls.
      function filterSpyChainable(finalResult: any) {
        const chain: any = new Proxy({}, {
          get(_target, prop: string) {
            if (prop === 'then') {
              return (resolve: any, reject: any) => Promise.resolve(finalResult).then(resolve, reject)
            }
            if (prop === 'single' || prop === 'maybeSingle') {
              return () => Promise.resolve(finalResult)
            }
            if (prop === 'is') {
              return (...args: any[]) => { isSpy(...args); return chain }
            }
            return () => chain
          },
        })
        return chain
      }

      const alertRows = [
        {
          id: UUID.alert1,
          config_id: UUID.config,
          lab_id: UUID.lab1,
          test_category: 'Malaria RDT',
          current_rate: 23,
          threshold: 15,
          triggered_at: '2026-01-01T00:00:00Z',
          acknowledged_at: null,
          acknowledged_by: null,
          notes: null,
          labs: { lab_name: 'Lab A' },
        },
      ]

      let callCount = 0
      mockSupabaseClient.from.mockImplementation(() => {
        callCount++
        if (callCount === 1) return chainable({ data: { id: UUID.config }, error: null })
        return filterSpyChainable({ data: alertRows, count: 1, error: null })
      })

      const caller = createCaller(createAdminContext())
      const result = await caller.admin.listSurveillanceAlerts({ acknowledged: false, cursor: 0, limit: 25 })
      expect(result.alerts).toHaveLength(1)
      expect(result.alerts[0].testCategory).toBe('Malaria RDT')
      expect(result.alerts[0].currentRate).toBe(23)
      expect(result.alerts[0].labName).toBe('Lab A')
      // Verify the acknowledged=false filter was actually applied to the query
      expect(isSpy).toHaveBeenCalledWith('acknowledged_at', null)
    })
  })

  // ─── getSurveillanceAlertSummary ───

  describe('getSurveillanceAlertSummary', () => {
    it('returns zeros when no config exists', async () => {
      const caller = createCaller(createAdminContext())
      const result = await caller.admin.getSurveillanceAlertSummary()
      expect(result.totalUnacknowledged).toBe(0)
      expect(result.triggeredToday).toBe(0)
      expect(result.triggeredThisWeek).toBe(0)
    })
  })
})
