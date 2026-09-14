import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Supabase mock chain ──────────────────────────────────────
const mockInsertSingle = vi.fn()
const mockInsertSelect = vi.fn(() => ({ single: mockInsertSingle }))
const mockInsert = vi.fn(() => ({ select: mockInsertSelect }))

// RBAC select chain (lab_technicians table)
const mockRbacSingle = vi.fn()
const mockRbacEq = vi.fn(() => ({ single: mockRbacSingle }))
const mockRbacSelect = vi.fn(() => ({ eq: mockRbacEq }))

function mockOrganizationsTable() {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { status: 'TRIAL' }, error: null }),
      }),
    }),
  }
}

let fromCalls: string[] = []
const mockFrom = vi.fn((table: string) => {
  fromCalls.push(table)
  if (table === 'organizations') return mockOrganizationsTable()
  if (table === 'org_subscriptions') {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'sub-1', status: 'ACTIVE' },
                error: null,
              }),
              limit: vi.fn().mockResolvedValue({
                data: [{ id: 'sub-1', status: 'ACTIVE' }],
                error: null,
              }),
            }),
          }),
        }),
      }),
    }
  }
  if (table === 'lab_technicians') {
    return { select: mockRbacSelect }
  }
  return { insert: mockInsert, select: vi.fn() }
})

// testDb: used in the brief's "stores encrypted + hashed" assertion
// In unit tests we use the mock supabase — testDb mirrors mockFrom for specimen_files selects
const testDbFrom = vi.fn((table: string) => {
  if (table === 'specimen_files') {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockImplementation(async () => {
            // Return the last inserted row captured from mockInsert
            const lastInsert = mockInsert.mock.calls
              .map((c: any[]) => c[0])
              .filter(Boolean)
              .at(-1)
            return {
              data: lastInsert
                ? {
                    id: lastInsert.id ?? 'specimen-file-uuid-1',
                    encrypted_content: lastInsert.encrypted_content ?? 'v1:enc',
                    file_hash: lastInsert.file_hash ?? 'a'.repeat(64),
                    ...lastInsert,
                  }
                : null,
              error: null,
            }
          }),
        }),
      }),
    }
  }
  return { select: vi.fn() }
})
const testDb = { from: testDbFrom }

// ── Audit logger mock ────────────────────────────────────────
const mockAuditEmit = vi.fn().mockResolvedValue({ id: 'audit-1' })
vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({
    emit: mockAuditEmit,
  })),
}))

// ── Crypto mocks ─────────────────────────────────────────────
vi.mock('@ultranos/crypto/server', () => ({
  generateBlindIndex: vi.fn((val: string) => `hmac_${val}`),
  encryptField: vi.fn((val: string) => `v1:encrypted_${val.slice(0, 10)}`),
  getEncryptionConfig: vi.fn(() => ({
    randomizedFields: ['report_conclusion', 'encrypted_content'],
  })),
}))

vi.mock('@/lib/field-encryption', () => ({
  getFieldEncryptionKeys: vi.fn(() => ({
    encryptionKey: 'a'.repeat(64),
    hmacKey: 'b'.repeat(64),
  })),
}))

// ── Virus scanner mock ───────────────────────────────────────
const mockScanFile = vi.fn()
vi.mock('@/lib/virus-scanner', () => ({
  scanFile: (...args: unknown[]) => mockScanFile(...args),
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

// ── Import router ────────────────────────────────────────────
const { createTRPCRouter, createCallerFactory } = await import('../trpc/init')
const { labRouter } = await import('../trpc/routers/lab')

function makeCtx(user: { sub: string; role: string; sessionId: string; orgId?: string | null } | null) {
  return {
    supabase: { from: mockFrom } as never,
    user,
    headers: new Headers(),
  }
}

const validInput = {
  fileBase64: Buffer.from('img').toString('base64'),
  fileName: 'damaged.webp',
  fileType: 'image/webp' as const,
  specimenId: 'LAB-20260901-0001',
  patientRef: 'Patient/abc',
  attachmentContext: 'rejection' as const,
}

describe('lab.uploadSpecimenFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fromCalls = []
    mockScanFile.mockResolvedValue({ status: 'clean', hash: 'a'.repeat(64) })

    // Default: RBAC resolves valid LAB_TECH with ACTIVE lab
    mockRbacSingle.mockResolvedValue({
      data: {
        id: 'tech-1',
        lab_id: 'lab-1',
        labs: { id: 'lab-1', status: 'ACTIVE' },
      },
      error: null,
    })
  })

  it('stores an encrypted, hashed specimen file and emits PHI_WRITE', async () => {
    mockInsertSingle.mockResolvedValueOnce({
      data: { id: 'a1b2c3d4-e5f6-4000-8000-000000000001' },
      error: null,
    })

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-test-001' }))

    const res = await caller.lab.uploadSpecimenFile(validInput)
    expect(res.fileId).toMatch(/^[0-9a-f-]{36}$/)

    // Verify the row written to specimen_files has encrypted_content (v1:) and 64-char hash
    const insertedRow = mockInsert.mock.calls[0]![0]
    expect(insertedRow.encrypted_content.startsWith('v1:')).toBe(true)
    expect(insertedRow.file_hash).toHaveLength(64)

    // Verify PHI_WRITE audit emitted on success
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PHI_WRITE',
        resourceType: 'SPECIMEN',
        outcome: 'SUCCESS',
        metadata: expect.objectContaining({
          operation: 'specimen_file_upload',
          specimenId: validInput.specimenId,
        }),
      }),
    )
  })

  it('encrypts file content with v1: prefix before storage', async () => {
    mockInsertSingle.mockResolvedValueOnce({
      data: { id: 'specimen-file-uuid-2' },
      error: null,
    })

    const { encryptField } = await import('@ultranos/crypto/server')

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-test-001' }))

    await caller.lab.uploadSpecimenFile(validInput)

    expect(encryptField).toHaveBeenCalledWith(validInput.fileBase64, 'a'.repeat(64))

    const insertedRow = mockInsert.mock.calls[0]![0]
    expect(insertedRow.encrypted_content).toMatch(/^v1:/)
  })

  it('performs virus scan before file persistence', async () => {
    mockInsertSingle.mockResolvedValueOnce({
      data: { id: 'specimen-file-uuid-3' },
      error: null,
    })

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-test-001' }))

    await caller.lab.uploadSpecimenFile(validInput)

    expect(mockScanFile).toHaveBeenCalledTimes(1)
    const scanCallOrder = mockScanFile.mock.invocationCallOrder[0]!
    const firstInsertOrder = mockInsert.mock.invocationCallOrder[0]!
    expect(scanCallOrder).toBeLessThan(firstInsertOrder)
  })

  it('rejects upload when malware is detected and emits PHI_WRITE FAILURE', async () => {
    mockScanFile.mockResolvedValue({
      status: 'infected',
      threat: 'Eicar-Test-Signature',
      hash: 'infected-hash',
    })

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-test-001' }))

    await expect(caller.lab.uploadSpecimenFile(validInput)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringContaining('malware'),
    })

    expect(fromCalls).not.toContain('specimen_files')
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PHI_WRITE',
        resourceType: 'SPECIMEN',
        outcome: 'FAILURE',
        metadata: expect.objectContaining({ reason: 'malware_detected' }),
      }),
    )
  })

  it('rejects upload on scan error and emits PHI_WRITE FAILURE', async () => {
    mockScanFile.mockResolvedValue({
      status: 'error',
      message: 'ClamAV protocol error',
      hash: 'err-hash',
    })

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-test-001' }))

    await expect(caller.lab.uploadSpecimenFile(validInput)).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    })

    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PHI_WRITE',
        outcome: 'FAILURE',
        metadata: expect.objectContaining({ reason: 'scan_error' }),
      }),
    )
  })

  it('rejects files exceeding 20 MB', async () => {
    const hugeBase64 = Buffer.alloc(21 * 1024 * 1024).toString('base64')

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-test-001' }))

    await expect(
      caller.lab.uploadSpecimenFile({ ...validInput, fileBase64: hugeBase64 }),
    ).rejects.toMatchObject({
      code: 'PAYLOAD_TOO_LARGE',
    })
  })

  it('stores specimenId, patientRef (bare), labId, and attachmentContext on the row', async () => {
    mockInsertSingle.mockResolvedValueOnce({
      data: { id: 'specimen-file-uuid-4' },
      error: null,
    })

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-test-001' }))

    // validInput.patientRef = 'Patient/abc' — prefix must be stripped before storage
    await caller.lab.uploadSpecimenFile(validInput)

    const insertedRow = mockInsert.mock.calls[0]![0]
    expect(insertedRow).toEqual(
      expect.objectContaining({
        specimen_id: validInput.specimenId,
        patient_ref: 'abc',           // bare — 'Patient/' prefix stripped
        lab_id: 'lab-1',
        attachment_context: 'rejection',
        file_name: 'damaged.webp',
        file_type: 'image/webp',
      }),
    )
  })

  it('stores bare patient_ref when patientRef has Patient/ prefix', async () => {
    mockInsertSingle.mockResolvedValueOnce({
      data: { id: 'specimen-file-bare-1' },
      error: null,
    })

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-test-001' }))

    await caller.lab.uploadSpecimenFile({ ...validInput, patientRef: 'Patient/abc123' })

    const insertedRow = mockInsert.mock.calls[0]![0]
    expect(insertedRow.patient_ref).toBe('abc123')
  })

  it('stores bare patient_ref unchanged when patientRef is already bare', async () => {
    mockInsertSingle.mockResolvedValueOnce({
      data: { id: 'specimen-file-bare-2' },
      error: null,
    })

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-test-001' }))

    await caller.lab.uploadSpecimenFile({ ...validInput, patientRef: 'abc123' })

    const insertedRow = mockInsert.mock.calls[0]![0]
    expect(insertedRow.patient_ref).toBe('abc123')
  })

  it('allows deferred scan — stores with pending virus_scan_status', async () => {
    mockScanFile.mockResolvedValue({
      status: 'deferred',
      reason: 'Service unavailable',
      hash: 'deferred-hash',
    })

    mockInsertSingle.mockResolvedValueOnce({
      data: { id: 'specimen-file-deferred' },
      error: null,
    })

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-test-001' }))

    const result = await caller.lab.uploadSpecimenFile(validInput)
    expect(result.fileId).toBe('specimen-file-deferred')

    const insertedRow = mockInsert.mock.calls[0]![0]
    expect(insertedRow.virus_scan_status).toBe('pending')
  })

  it('accepts receipt as attachmentContext', async () => {
    mockInsertSingle.mockResolvedValueOnce({
      data: { id: 'specimen-file-receipt' },
      error: null,
    })

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-test-001' }))

    const result = await caller.lab.uploadSpecimenFile({ ...validInput, attachmentContext: 'receipt' })
    expect(result.fileId).toBe('specimen-file-receipt')
  })

  it('rejects invalid attachmentContext', async () => {
    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-test-001' }))

    await expect(
      caller.lab.uploadSpecimenFile({ ...validInput, attachmentContext: 'other' as any }),
    ).rejects.toThrow()
  })
})
