import { describe, it, expect, vi, beforeEach } from 'vitest'

// Story 61.3: lab.register now delegates to the register_lab_atomic RPC (labs +
// lab_technicians in one transaction; practitioner id resolved from auth_user_id).
// These tests mock the RPC directly (mirrors the create_patient_with_consent
// atomic-RPC test pattern) — no per-table insert/delete chains anymore.
const mockRpc = vi.fn()

// Mock audit logger
const mockAuditEmit = vi.fn().mockResolvedValue({ id: 'audit-1' })
vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({
    emit: mockAuditEmit,
  })),
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({ rpc: mockRpc })),
  db: {
    toRow: (data: any) => data,
    toRowRaw: (data: any) => data,
    fromRow: (data: any) => data,
    fromRowRaw: (data: any) => data,
    fromRows: (data: any[]) => data,
  },
}))

const { createTRPCRouter, createCallerFactory } = await import('../trpc/init')
const { labRouter } = await import('../trpc/routers/lab')

function makeCtx(user: { sub: string; role: `${import('@ultranos/shared-types').UserRole}`; sessionId: string; orgId: string | null; facilityId: string | null; status: string | null } | null) {
  return {
    supabase: { rpc: mockRpc } as never,
    user,
    headers: new Headers(),
  }
}

const LAB_TECH = { sub: 'tech-1', role: 'LAB_TECH' as const, sessionId: 's1', facilityId: null, status: 'ACTIVE', orgId: null }

const validInput = {
  labName: 'Central Pathology Lab',
  licenseRef: 'LIC-2024-001',
  accreditationRef: 'ISO-15189-2024',
  technicianCredentialRef: 'TECH-CERT-001',
}

describe('lab.register', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers a lab with PENDING status via the atomic RPC', async () => {
    mockRpc.mockResolvedValueOnce({ data: { labId: 'lab-uuid-1' }, error: null })

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx(LAB_TECH))

    const result = await caller.lab.register(validInput)
    expect(result.success).toBe(true)
    expect(result.labId).toBe('lab-uuid-1')
    expect(result.status).toBe('PENDING')

    // M-HUB-7: the RPC receives the AUTH user id — it resolves the real
    // practitioners.id internally (never inserts ctx.user.sub as practitioner_id).
    expect(mockRpc).toHaveBeenCalledWith(
      'register_lab_atomic',
      expect.objectContaining({
        p_auth_user_id: 'tech-1',
        p_lab_name: 'Central Pathology Lab',
        p_license_ref: 'LIC-2024-001',
        p_credential_ref: 'TECH-CERT-001',
      }),
    )
  })

  it('rejects unauthenticated requests', async () => {
    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx(null))

    await expect(caller.lab.register(validInput)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
  })

  it('emits an audit event with Organization resourceType on successful registration', async () => {
    mockRpc.mockResolvedValueOnce({ data: { labId: 'lab-uuid-2' }, error: null })

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx(LAB_TECH))

    await caller.lab.register(validInput)
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        resourceType: 'ORGANIZATION',
        resourceId: 'lab-uuid-2',
        actorId: 'tech-1',
        outcome: 'SUCCESS',
      }),
    )
  })

  it('returns CONFLICT if technician is already registered to a lab (23505 from the tx)', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'duplicate key' } })

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx(LAB_TECH))

    await expect(caller.lab.register(validInput)).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })

  it('returns PRECONDITION_FAILED when no practitioner profile exists for the account', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'PRACTITIONER_NOT_FOUND' } })

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx(LAB_TECH))

    await expect(caller.lab.register(validInput)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    })
  })

  it('validates required input fields', async () => {
    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx(LAB_TECH))

    await expect(caller.lab.register({ ...validInput, labName: '' })).rejects.toThrow()
    await expect(caller.lab.register({ ...validInput, licenseRef: '' })).rejects.toThrow()
  })

  it('returns INTERNAL_SERVER_ERROR when the RPC fails', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '42P01', message: 'relation does not exist' } })

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx(LAB_TECH))

    await expect(caller.lab.register(validInput)).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    })
  })

  it('allows registration without optional accreditationRef', async () => {
    mockRpc.mockResolvedValueOnce({ data: { labId: 'lab-uuid-4' }, error: null })

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx(LAB_TECH))

    const { accreditationRef: _, ...inputWithoutAccreditation } = validInput
    const result = await caller.lab.register(inputWithoutAccreditation)
    expect(result.success).toBe(true)
    // accreditation defaults to null in the RPC payload
    expect(mockRpc.mock.calls[0]![1].p_accreditation_ref).toBeNull()
  })
})
