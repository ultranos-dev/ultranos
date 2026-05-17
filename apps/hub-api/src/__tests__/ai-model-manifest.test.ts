import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TRPCError } from '@trpc/server'

// Stub env before any imports
vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))

const mockAuditEmit = vi.fn().mockResolvedValue({ id: 'audit-1' })

vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({
    emit: mockAuditEmit,
  })),
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => mockSupabaseClient),
  db: {
    toRow: (data: any) => data,
    toRowRaw: (data: any) => data,
    fromRow: (data: any) => data,
    fromRowRaw: (data: any) => data,
    fromRows: (data: any[]) => data,
  },
}))

const mockSupabaseClient = {
  from: vi.fn(),
}

const { createCallerFactory } = await import('../trpc/init')
const { aiRouter } = await import('../trpc/routers/ai')

const createCaller = createCallerFactory(aiRouter)

function makeCtx(user: { sub: string; role: string; sessionId: string; orgId?: string | null; status?: string | null } | null) {
  return {
    supabase: mockSupabaseClient as never,
    user: user ? { ...user, orgId: user.orgId ?? null, status: user.status ?? null } : null,
    headers: new Headers(),
  }
}

function adminCtx() {
  return makeCtx({ sub: 'admin-1', role: 'ADMIN', sessionId: 's1' })
}

function doctorCtx() {
  return makeCtx({ sub: 'doc-1', role: 'DOCTOR', sessionId: 's1' })
}

function unauthCtx() {
  return makeCtx(null)
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ============================================================
// ai.getModelManifest
// ============================================================

describe('ai.getModelManifest', () => {
  const sampleRows = [
    {
      model_id: 'soap-macros',
      model_type: 'SOAP_MACRO_TEMPLATES',
      version: '2.0.0',
      download_url: 'https://cdn.example.com/soap-macros-2.0.0.json',
      file_size: 512000,
      checksum: 'a'.repeat(64),
      released_at: '2026-05-10T00:00:00Z',
      delta_from_version: '1.9.0',
    },
    {
      model_id: 'soap-macros',
      model_type: 'SOAP_MACRO_TEMPLATES',
      version: '1.9.0',
      download_url: 'https://cdn.example.com/soap-macros-1.9.0.json',
      file_size: 500000,
      checksum: 'b'.repeat(64),
      released_at: '2026-04-10T00:00:00Z',
      delta_from_version: null,
    },
    {
      model_id: 'drug-db-offline',
      model_type: 'DRUG_DB_OFFLINE',
      version: '5.1.0',
      download_url: 'https://cdn.example.com/drug-db-5.1.0.db',
      file_size: 5242880,
      checksum: 'c'.repeat(64),
      released_at: '2026-05-12T00:00:00Z',
      delta_from_version: null,
    },
  ]

  it('returns current model versions (AC #7)', async () => {
    mockSupabaseClient.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: sampleRows, error: null }),
        }),
      }),
    })

    const caller = createCaller(unauthCtx())
    const result = await caller.getModelManifest()

    expect(result.models).toHaveLength(2) // deduplicated by model_id
    expect(result.models[0].modelId).toBe('soap-macros')
    expect(result.models[0].currentVersion).toBe('2.0.0')
    expect(result.models[0].deltaFromVersion).toBe('1.9.0')
    expect(result.models[1].modelId).toBe('drug-db-offline')
    expect(result.models[1].currentVersion).toBe('5.1.0')
  })

  it('works without authentication (baseProcedure)', async () => {
    mockSupabaseClient.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    })

    const caller = createCaller(unauthCtx())
    const result = await caller.getModelManifest()
    expect(result.models).toEqual([])
  })

  it('filters by modelType when provided', async () => {
    mockSupabaseClient.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [sampleRows[2]], error: null }),
          }),
        }),
      }),
    })

    const caller = createCaller(unauthCtx())
    const result = await caller.getModelManifest({ modelType: 'DRUG_DB_OFFLINE' as any })
    expect(result.models).toHaveLength(1)
    expect(result.models[0].modelType).toBe('DRUG_DB_OFFLINE')
  })

  it('returns empty array when no models exist', async () => {
    mockSupabaseClient.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    })

    const caller = createCaller(unauthCtx())
    const result = await caller.getModelManifest()
    expect(result.models).toEqual([])
  })

  it('throws INTERNAL_SERVER_ERROR on database error', async () => {
    mockSupabaseClient.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: null, error: { message: 'db error', code: '500' } }),
        }),
      }),
    })

    const caller = createCaller(unauthCtx())
    await expect(caller.getModelManifest()).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    })
  })
})

// ============================================================
// ai.publishModelVersion
// ============================================================

describe('ai.publishModelVersion', () => {
  const validInput = {
    modelId: 'soap-macros',
    modelType: 'SOAP_MACRO_TEMPLATES' as const,
    version: '2.1.0',
    downloadUrl: 'https://cdn.example.com/soap-macros-2.1.0.json',
    fileSize: 530000,
    checksum: 'a'.repeat(64),
    deltaFromVersion: '2.0.0',
  }

  it('creates a registry entry (AC #7)', async () => {
    mockSupabaseClient.from.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'reg-1',
              model_id: 'soap-macros',
              version: '2.1.0',
              released_at: '2026-05-16T00:00:00Z',
            },
            error: null,
          }),
        }),
      }),
    })

    const caller = createCaller(adminCtx())
    const result = await caller.publishModelVersion(validInput)

    expect(result.id).toBe('reg-1')
    expect(result.modelId).toBe('soap-macros')
    expect(result.version).toBe('2.1.0')
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        resourceType: 'AI_MODEL_REGISTRY',
        resourceId: 'reg-1',
        outcome: 'SUCCESS',
      }),
    )
  })

  it('rejects non-ADMIN users with FORBIDDEN', async () => {
    const caller = createCaller(doctorCtx())
    await expect(caller.publishModelVersion(validInput)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('rejects unauthenticated users with UNAUTHORIZED', async () => {
    const caller = createCaller(unauthCtx())
    await expect(caller.publishModelVersion(validInput)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
  })

  it('returns CONFLICT for duplicate (model_id, version)', async () => {
    mockSupabaseClient.from.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: '23505', message: 'unique constraint' },
          }),
        }),
      }),
    })

    const caller = createCaller(adminCtx())
    await expect(caller.publishModelVersion(validInput)).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })
})

// ============================================================
// ai.reportModelUpdateEvents
// ============================================================

describe('ai.reportModelUpdateEvents', () => {
  it('logs model update events (AC #6)', async () => {
    mockSupabaseClient.from.mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null }),
    })

    const caller = createCaller(unauthCtx())
    const result = await caller.reportModelUpdateEvents({
      events: [
        {
          deviceId: 'device-1',
          modelId: 'soap-macros',
          eventType: 'MODEL_UPDATE_COMPLETED',
          metadata: { version: '2.0.0', downloadDurationMs: 1500, fileSize: 512000 },
        },
        {
          deviceId: 'device-1',
          modelId: 'drug-db-offline',
          eventType: 'MODEL_UPDATE_FAILED',
          metadata: { error: 'checksum_mismatch', retryCount: 1 },
        },
      ],
    })

    expect(result.logged).toBe(2)
    expect(mockSupabaseClient.from).toHaveBeenCalledWith('ai_model_update_events')
  })

  it('works without authentication', async () => {
    mockSupabaseClient.from.mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null }),
    })

    const caller = createCaller(unauthCtx())
    const result = await caller.reportModelUpdateEvents({
      events: [{
        deviceId: 'device-1',
        modelId: 'soap-macros',
        eventType: 'MODEL_UPDATE_STARTED',
        metadata: {},
      }],
    })

    expect(result.logged).toBe(1)
  })

  it('throws on database error', async () => {
    mockSupabaseClient.from.mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: { message: 'insert failed' } }),
    })

    const caller = createCaller(unauthCtx())
    await expect(
      caller.reportModelUpdateEvents({
        events: [{
          deviceId: 'device-1',
          modelId: 'soap-macros',
          eventType: 'MODEL_UPDATE_STARTED',
          metadata: {},
        }],
      }),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' })
  })
})

// ============================================================
// ai.getModelUpdateStats
// ============================================================

describe('ai.getModelUpdateStats', () => {
  it('ADMIN can access model update stats', async () => {
    mockSupabaseClient.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        gte: vi.fn().mockResolvedValue({
          data: [
            { model_id: 'soap-macros', event_type: 'MODEL_UPDATE_STARTED', metadata: {} },
            { model_id: 'soap-macros', event_type: 'MODEL_UPDATE_COMPLETED', metadata: {} },
            { model_id: 'drug-db-offline', event_type: 'MODEL_STALE_DEGRADED', metadata: { modelType: 'DRUG_DB_OFFLINE' } },
          ],
          error: null,
        }),
      }),
    })

    const caller = createCaller(adminCtx())
    const result = await caller.getModelUpdateStats()

    expect(result.modelStats).toHaveLength(2)
    expect(result.totalStaleDeviceEvents).toBe(1)
  })

  it('rejects non-ADMIN with FORBIDDEN', async () => {
    const caller = createCaller(doctorCtx())
    await expect(caller.getModelUpdateStats()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })
})
