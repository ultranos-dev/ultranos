import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Supabase mock chain ──────────────────────────────────────
const mockInsertSingle = vi.fn()
const mockInsertSelect = vi.fn(() => ({ single: mockInsertSingle }))
const mockInsert = vi.fn(() => ({ select: mockInsertSelect }))
const mockDeleteEq = vi.fn().mockResolvedValue({ error: null })
const mockDelete = vi.fn(() => ({ eq: mockDeleteEq }))

// RBAC select chain (lab_technicians table)
const mockRbacSingle = vi.fn()
const mockRbacEq = vi.fn(() => ({ single: mockRbacSingle }))
const mockRbacSelect = vi.fn(() => ({ eq: mockRbacEq }))

let fromCalls: string[] = []
const mockFrom = vi.fn((table: string) => {
  fromCalls.push(table)
  if (table === 'lab_technicians') {
    return { select: mockRbacSelect }
  }
  return { insert: mockInsert, select: vi.fn(), delete: mockDelete }
})

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

function makeCtx(user: { sub: string; role: string; sessionId: string } | null) {
  return {
    supabase: { from: mockFrom } as never,
    user,
    headers: new Headers(),
  }
}

const validInput = {
  fileBase64: Buffer.from('fake-pdf-content').toString('base64'),
  fileName: 'result.pdf',
  fileType: 'application/pdf' as const,
  patientRef: 'hmac_patient-123',
  loincCode: '58410-2',
  loincDisplay: 'Blood Work — CBC',
  collectionDate: '2026-04-28',
}

describe('lab.uploadResult', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fromCalls = []
    mockScanFile.mockResolvedValue({ status: 'clean', hash: 'abc123hash' })

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

  it('creates DiagnosticReport and stores encrypted file on clean scan', async () => {
    // First insert: diagnostic_reports → success
    mockInsertSingle.mockResolvedValueOnce({
      data: { id: 'report-uuid-1' },
      error: null,
    })
    // Second insert: lab_result_files → success
    mockInsert.mockReturnValueOnce({ select: mockInsertSelect })
      .mockReturnValueOnce({ error: null })

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1' }))

    const result = await caller.lab.uploadResult(validInput)

    expect(result.success).toBe(true)
    expect(result.reportId).toBe('report-uuid-1')
    expect(result.status).toBe('preliminary')
    expect(result.virusScanStatus).toBe('clean')
  })

  it('encrypts file content before storage', async () => {
    mockInsertSingle.mockResolvedValueOnce({
      data: { id: 'report-uuid-2' },
      error: null,
    })
    mockInsert.mockReturnValueOnce({ select: mockInsertSelect })
      .mockReturnValueOnce({ error: null })

    const { encryptField } = await import('@ultranos/crypto/server')

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1' }))

    await caller.lab.uploadResult(validInput)

    expect(encryptField).toHaveBeenCalledWith(validInput.fileBase64, 'a'.repeat(64))
  })

  it('performs virus scan before file persistence', async () => {
    mockInsertSingle.mockResolvedValueOnce({
      data: { id: 'report-uuid-3' },
      error: null,
    })
    mockInsert.mockReturnValueOnce({ select: mockInsertSelect })
      .mockReturnValueOnce({ error: null })

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1' }))

    await caller.lab.uploadResult(validInput)

    expect(mockScanFile).toHaveBeenCalledTimes(1)
    // scanFile is called before any supabase insert
    const scanCallOrder = mockScanFile.mock.invocationCallOrder[0]!
    const firstInsertOrder = mockInsert.mock.invocationCallOrder[0]!
    expect(scanCallOrder).toBeLessThan(firstInsertOrder)
  })

  it('rejects upload when malware is detected', async () => {
    mockScanFile.mockResolvedValue({
      status: 'infected',
      threat: 'Eicar-Test-Signature',
      hash: 'infected-hash',
    })

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1' }))

    await expect(caller.lab.uploadResult(validInput)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringContaining('malware'),
    })

    // Should NOT have inserted anything
    expect(fromCalls).not.toContain('diagnostic_reports')
  })

  it('rejects upload on scan error', async () => {
    mockScanFile.mockResolvedValue({
      status: 'error',
      message: 'ClamAV protocol error',
      hash: 'err-hash',
    })

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1' }))

    await expect(caller.lab.uploadResult(validInput)).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    })
  })

  it('allows deferred scan — stores with pending virus_scan_status', async () => {
    mockScanFile.mockResolvedValue({
      status: 'deferred',
      reason: 'Service unavailable',
      hash: 'deferred-hash',
    })

    mockInsertSingle.mockResolvedValueOnce({
      data: { id: 'report-deferred' },
      error: null,
    })
    mockInsert.mockReturnValueOnce({ select: mockInsertSelect })
      .mockReturnValueOnce({ error: null })

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1' }))

    const result = await caller.lab.uploadResult(validInput)
    expect(result.virusScanStatus).toBe('pending')
  })

  it('rejects files exceeding 20 MB', async () => {
    const hugeBase64 = Buffer.alloc(21 * 1024 * 1024).toString('base64')

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1' }))

    await expect(
      caller.lab.uploadResult({ ...validInput, fileBase64: hugeBase64 }),
    ).rejects.toMatchObject({
      code: 'PAYLOAD_TOO_LARGE',
    })
  })

  it('records technician ID and lab affiliation in the report', async () => {
    mockInsertSingle.mockResolvedValueOnce({
      data: { id: 'report-tech' },
      error: null,
    })
    mockInsert.mockReturnValueOnce({ select: mockInsertSelect })
      .mockReturnValueOnce({ error: null })

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1' }))

    await caller.lab.uploadResult(validInput)

    // Verify diagnostic_reports insert includes performer_id and lab_id
    const insertCall = mockInsert.mock.calls[0]![0]
    expect(insertCall).toEqual(
      expect.objectContaining({
        performer_id: 'tech-1',
        lab_id: 'lab-1',
        status: 'preliminary',
        loinc_code: '58410-2',
      }),
    )
  })

  it('emits audit event on successful upload', async () => {
    mockInsertSingle.mockResolvedValueOnce({
      data: { id: 'report-audit' },
      error: null,
    })
    mockInsert.mockReturnValueOnce({ select: mockInsertSelect })
      .mockReturnValueOnce({ error: null })

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1' }))

    await caller.lab.uploadResult(validInput)

    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        resourceType: 'LAB_RESULT',
        resourceId: 'report-audit',
        actorId: 'tech-1',
        outcome: 'SUCCESS',
        metadata: expect.objectContaining({
          uploadAction: 'result_uploaded',
          loincCode: '58410-2',
          fileHash: 'abc123hash',
        }),
      }),
    )
  })

  it('emits audit event on rejected upload (malware)', async () => {
    mockScanFile.mockResolvedValue({
      status: 'infected',
      threat: 'Test-Virus',
      hash: 'infected-hash',
    })

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1' }))

    await expect(caller.lab.uploadResult(validInput)).rejects.toThrow()

    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        resourceType: 'LAB_RESULT',
        outcome: 'FAILURE',
        metadata: expect.objectContaining({
          reason: 'malware_detected',
          fileHash: 'infected-hash',
        }),
      }),
    )
  })

  it('emits audit event on rejected upload (oversized)', async () => {
    const hugeBase64 = Buffer.alloc(21 * 1024 * 1024).toString('base64')

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1' }))

    await expect(
      caller.lab.uploadResult({ ...validInput, fileBase64: hugeBase64 }),
    ).rejects.toThrow()

    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        resourceType: 'LAB_RESULT',
        outcome: 'FAILURE',
        metadata: expect.objectContaining({
          reason: 'file_too_large',
        }),
      }),
    )
  })

  it('does not include PHI in audit metadata', async () => {
    mockInsertSingle.mockResolvedValueOnce({
      data: { id: 'report-no-phi' },
      error: null,
    })
    mockInsert.mockReturnValueOnce({ select: mockInsertSelect })
      .mockReturnValueOnce({ error: null })

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1' }))

    await caller.lab.uploadResult(validInput)

    const auditCall = mockAuditEmit.mock.calls[0]![0]
    const metadataStr = JSON.stringify(auditCall.metadata)
    // No patient name, raw patient ID, file content, or diagnosis
    expect(metadataStr).not.toContain('patient-123')
    expect(metadataStr).not.toContain('fake-pdf-content')
  })

  it('performs compensating delete of diagnostic report on file insert failure', async () => {
    mockInsertSingle.mockResolvedValueOnce({
      data: { id: 'report-orphan' },
      error: null,
    })
    // File insert fails
    mockInsert.mockReturnValueOnce({ select: mockInsertSelect })
      .mockReturnValueOnce({ error: { code: '42P01', message: 'relation error' } })

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1' }))

    await expect(caller.lab.uploadResult(validInput)).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    })

    // Compensating delete should clean up the orphaned report
    expect(mockDelete).toHaveBeenCalled()
    expect(mockDeleteEq).toHaveBeenCalledWith('id', 'report-orphan')
  })

  it('validates required input fields', async () => {
    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1' }))

    // Missing loincCode
    await expect(
      caller.lab.uploadResult({ ...validInput, loincCode: '' }),
    ).rejects.toThrow()

    // Invalid file type
    await expect(
      caller.lab.uploadResult({ ...validInput, fileType: 'text/plain' as any }),
    ).rejects.toThrow()

    // Invalid date format
    await expect(
      caller.lab.uploadResult({ ...validInput, collectionDate: 'April 28' }),
    ).rejects.toThrow()
  })

  it('sets DiagnosticReport status to preliminary', async () => {
    mockInsertSingle.mockResolvedValueOnce({
      data: { id: 'report-prelim' },
      error: null,
    })
    mockInsert.mockReturnValueOnce({ select: mockInsertSelect })
      .mockReturnValueOnce({ error: null })

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1' }))

    const result = await caller.lab.uploadResult(validInput)
    expect(result.status).toBe('preliminary')

    // Verify the DB insert used 'preliminary'
    const insertCall = mockInsert.mock.calls[0]![0]
    expect(insertCall.status).toBe('preliminary')
  })
})
