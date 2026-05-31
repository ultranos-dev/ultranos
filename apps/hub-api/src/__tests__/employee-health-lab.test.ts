import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TRPCError } from '@trpc/server'

vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))

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

const mockAuditEmit = vi.fn().mockResolvedValue({})

vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({
    emit: mockAuditEmit,
  })),
}))

vi.mock('@ultranos/crypto/server', () => ({
  encryptField: vi.fn((p: string) => `v1:enc:${p}`),
  decryptField: vi.fn((c: string) => c.startsWith('v1:enc:') ? c.slice(7) : '[Encrypted Content]'),
  generateBlindIndex: vi.fn(() => 'blind-index'),
  getEncryptionConfig: () => ({ randomizedFields: [] }),
}))

vi.mock('@/lib/virus-scanner', () => ({ scanFile: vi.fn() }))
vi.mock('@/services/ocr', () => ({ analyzeFile: vi.fn() }))

const { createCallerFactory } = await import('../trpc/init')
const { labRouter } = await import('../trpc/routers/lab')

const PRACTITIONER_ID = '00000000-0000-0000-0000-000000000001'
const LAB_ID = 'lab-1'

/**
 * The labRestrictedProcedure middleware queries lab_technicians with a labs join
 * to resolve the caller's lab context. Then the endpoint queries lab_technicians
 * again for the same-lab check, and employee_health_records for the actual data.
 *
 * We use a call counter for lab_technicians to return different data for each call.
 */
function buildFromMock(opts: {
  callerLabRole: string
  callerLabId: string
  targetLabId: string
  healthRecord: any
}) {
  let labTechCallCount = 0
  return vi.fn().mockImplementation((table: string) => {
    if (table === 'lab_technicians') {
      labTechCallCount++
      if (labTechCallCount === 1) {
        // rbac middleware: resolve caller's lab context (needs labs join)
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'tech-rec-1',
                  lab_id: opts.callerLabId,
                  lab_role: opts.callerLabRole,
                  labs: { id: opts.callerLabId, status: 'ACTIVE' },
                },
                error: null,
              }),
            }),
          }),
        }
      }
      // endpoint: same-lab check for target practitioner
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { lab_id: opts.targetLabId },
              error: null,
            }),
          }),
        }),
      }
    }
    if (table === 'employee_health_records') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: opts.healthRecord,
              error: opts.healthRecord ? null : { code: 'PGRST116' },
            }),
          }),
        }),
      }
    }
    // Default fallback
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }
  })
}

function makeLabTechCtx(fromImpl: ReturnType<typeof vi.fn>) {
  return {
    supabase: { from: fromImpl } as never,
    user: { sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: null, status: null },
    headers: new Headers(),
  }
}

describe('lab.getEmergencyVaccinationStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns ONLY vaccination status fields (data minimization)', async () => {
    const fromImpl = buildFromMock({
      callerLabRole: 'SUPERVISOR',
      callerLabId: LAB_ID,
      targetLabId: LAB_ID,
      healthRecord: {
        hep_b_status: 'COMPLETE',
        tetanus_status: 'IN_PROGRESS',
        covid_status: 'NOT_STARTED',
      },
    })

    const caller = createCallerFactory(labRouter)(makeLabTechCtx(fromImpl) as any)
    const result = await caller.getEmergencyVaccinationStatus({ practitionerId: PRACTITIONER_ID })

    expect(result).toEqual({
      hepBStatus: 'COMPLETE',
      tetanusStatus: 'IN_PROGRESS',
      covidStatus: 'NOT_STARTED',
    })

    // Verify data minimization: no additional fields returned
    expect(result).not.toHaveProperty('hepBTiterDate')
    expect(result).not.toHaveProperty('covidDoses')
    expect(result).not.toHaveProperty('tbScreeningDate')
    expect(result).not.toHaveProperty('tbScreeningResult')
    expect(result).not.toHaveProperty('exposureHistory')
  })

  it('emits READ audit event with EMERGENCY access type', async () => {
    const fromImpl = buildFromMock({
      callerLabRole: 'SUPERVISOR',
      callerLabId: LAB_ID,
      targetLabId: LAB_ID,
      healthRecord: {
        hep_b_status: 'COMPLETE',
        tetanus_status: 'COMPLETE',
        covid_status: 'COMPLETE',
      },
    })

    const caller = createCallerFactory(labRouter)(makeLabTechCtx(fromImpl) as any)
    await caller.getEmergencyVaccinationStatus({ practitionerId: PRACTITIONER_ID })

    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'READ',
        resourceType: 'EMPLOYEE_HEALTH',
        metadata: expect.objectContaining({
          accessType: 'EMERGENCY',
          scope: 'VACCINATION_STATUS_ONLY',
        }),
      }),
    )
  })

  it('rejects callers from a different lab', async () => {
    const fromImpl = buildFromMock({
      callerLabRole: 'SUPERVISOR',
      callerLabId: LAB_ID,
      targetLabId: 'other-lab-999', // target is in a different lab
      healthRecord: null,
    })

    const caller = createCallerFactory(labRouter)(makeLabTechCtx(fromImpl) as any)

    await expect(
      caller.getEmergencyVaccinationStatus({ practitionerId: PRACTITIONER_ID }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('requires SUPERVISOR or LAB_MANAGER role (rejects LAB_TECH)', async () => {
    const fromImpl = buildFromMock({
      callerLabRole: 'LAB_TECH', // insufficient permission
      callerLabId: LAB_ID,
      targetLabId: LAB_ID,
      healthRecord: null,
    })

    const caller = createCallerFactory(labRouter)(makeLabTechCtx(fromImpl) as any)

    await expect(
      caller.getEmergencyVaccinationStatus({ practitionerId: PRACTITIONER_ID }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('returns null when no record exists', async () => {
    const fromImpl = buildFromMock({
      callerLabRole: 'LAB_MANAGER',
      callerLabId: LAB_ID,
      targetLabId: LAB_ID,
      healthRecord: null, // no record
    })

    const caller = createCallerFactory(labRouter)(makeLabTechCtx(fromImpl) as any)
    const result = await caller.getEmergencyVaccinationStatus({ practitionerId: PRACTITIONER_ID })

    expect(result).toBeNull()
  })
})
