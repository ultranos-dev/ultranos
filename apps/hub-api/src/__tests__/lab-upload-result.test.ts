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

function makeCtx(user: { sub: string; role: string; sessionId: string; orgId?: string | null } | null) {
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
  patientRef: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
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
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-test-001' }))

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
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-test-001' }))

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
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-test-001' }))

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
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-test-001' }))

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
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-test-001' }))

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
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-test-001' }))

    const result = await caller.lab.uploadResult(validInput)
    expect(result.virusScanStatus).toBe('pending')
  })

  it('rejects files exceeding 20 MB', async () => {
    const hugeBase64 = Buffer.alloc(21 * 1024 * 1024).toString('base64')

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-test-001' }))

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
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-test-001' }))

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
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-test-001' }))

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
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-test-001' }))

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
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-test-001' }))

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
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-test-001' }))

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
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-test-001' }))

    await expect(caller.lab.uploadResult(validInput)).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    })

    // Compensating delete should clean up the orphaned report
    expect(mockDelete).toHaveBeenCalled()
    expect(mockDeleteEq).toHaveBeenCalledWith('id', 'report-orphan')
  })

  it('validates required input fields', async () => {
    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-test-001' }))

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
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-test-001' }))

    const result = await caller.lab.uploadResult(validInput)
    expect(result.status).toBe('preliminary')

    // Verify the DB insert used 'preliminary'
    const insertCall = mockInsert.mock.calls[0]![0]
    expect(insertCall.status).toBe('preliminary')
  })

  it('accepts image/webp and attaches to an existing diagnosticReportId (upsert once)', async () => {
    const reportId = '11111111-1111-1111-1111-111111111111'

    // Per-call state for the scoped supabase mock
    let reportExists = false
    let diagnosticReportsInsertCount = 0
    let fileInsertCount = 0

    // Build a scoped supabase mock that handles the upsert-or-attach path
    function makeScopedFrom(table: string) {
      if (table === 'organizations') return mockOrganizationsTable()
      if (table === 'org_subscriptions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'sub-1', status: 'ACTIVE' }, error: null }),
                  limit: vi.fn().mockResolvedValue({ data: [{ id: 'sub-1', status: 'ACTIVE' }], error: null }),
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'lab_technicians') {
        return { select: mockRbacSelect }
      }
      if (table === 'diagnostic_reports') {
        return {
          // select chain for maybeSingle (upsert check)
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockImplementation(async () => {
                // First call: not found; second call onwards: found
                const data = reportExists ? { id: reportId, lab_id: 'lab-1' } : null
                reportExists = true // mark exists after first check
                return { data, error: null }
              }),
            }),
          }),
          // insert chain (no .select().single() needed for the id-based insert path)
          insert: vi.fn().mockImplementation(() => {
            diagnosticReportsInsertCount++
            // Also support .select('id').single() for the non-id path (not used here, but defensive)
            return {
              error: null,
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: reportId }, error: null }),
              }),
            }
          }),
          delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'lab_result_files') {
        return {
          insert: vi.fn().mockImplementation(() => {
            fileInsertCount++
            return { error: null }
          }),
        }
      }
      if (table === 'labs') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { name: 'Test Lab' }, error: null }),
            }),
          }),
        }
      }
      // fallback
      return { insert: mockInsert, select: vi.fn(), delete: mockDelete }
    }

    const scopedSupabase = { from: vi.fn((table: string) => makeScopedFrom(table)) }

    const scopedCtx = {
      supabase: scopedSupabase as never,
      user: { sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-test-001' },
      lab: { technicianId: 'tech-1', labId: 'lab-1' },
      headers: new Headers(),
    }

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(scopedCtx as never)

    const webpInput = {
      fileBase64: Buffer.from('webpbytes').toString('base64'),
      fileName: 'cell.webp',
      fileType: 'image/webp' as const,
      patientRef: 'Patient/abc',
      loincCode: '58410-2',
      loincDisplay: 'CBC',
      collectionDate: '2026-09-01',
      diagnosticReportId: reportId,
    }

    // First webp upload: creates the report + file
    const result1 = await caller.lab.uploadResult(webpInput)
    expect(result1.reportId).toBe(reportId)

    // Second webp upload: attaches to the SAME report (no duplicate report row)
    const result2 = await caller.lab.uploadResult({
      ...webpInput,
      fileBase64: Buffer.from('webpbytes2').toString('base64'),
      fileName: 'cell2.webp',
    })
    expect(result2.reportId).toBe(reportId)

    // ONE report created, TWO files stored
    expect(diagnosticReportsInsertCount).toBe(1)
    expect(fileInsertCount).toBe(2)
  })

  // ── IDOR security tests ──────────────────────────────────────

  it('IDOR: rejects with FORBIDDEN when diagnosticReportId belongs to a different lab', async () => {
    const foreignReportId = '22222222-2222-2222-2222-222222222222'
    let fileInsertCalled = false

    function makeScopedFrom(table: string) {
      if (table === 'organizations') return mockOrganizationsTable()
      if (table === 'org_subscriptions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'sub-1', status: 'ACTIVE' }, error: null }),
                  limit: vi.fn().mockResolvedValue({ data: [{ id: 'sub-1', status: 'ACTIVE' }], error: null }),
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'lab_technicians') return { select: mockRbacSelect }
      if (table === 'diagnostic_reports') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              // Report exists but owned by a different lab
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: foreignReportId, lab_id: 'lab-OTHER' },
                error: null,
              }),
            }),
          }),
          insert: vi.fn(),
          delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'lab_result_files') {
        return {
          insert: vi.fn().mockImplementation(() => {
            fileInsertCalled = true
            return { error: null }
          }),
        }
      }
      return { insert: mockInsert, select: vi.fn(), delete: mockDelete }
    }

    const scopedSupabase = { from: vi.fn((table: string) => makeScopedFrom(table)) }
    const scopedCtx = {
      supabase: scopedSupabase as never,
      user: { sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-test-001' },
      lab: { technicianId: 'tech-1', labId: 'lab-1' },
      headers: new Headers(),
    }

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(scopedCtx as never)

    await expect(
      caller.lab.uploadResult({
        ...validInput,
        diagnosticReportId: foreignReportId,
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Report belongs to another lab',
    })

    // File insert MUST NOT have been called
    expect(fileInsertCalled).toBe(false)

    // Audit event must have been emitted with DENIED outcome
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'DENIED',
        metadata: expect.objectContaining({
          uploadAction: 'result_upload_rejected',
          reason: 'cross_lab_report_access',
        }),
      }),
    )
  })

  it('IDOR: reuses existing report when diagnosticReportId belongs to the same lab (no new report insert)', async () => {
    const ownReportId = '33333333-3333-3333-3333-333333333333'
    let diagnosticReportsInsertCount = 0
    let fileInsertCount = 0

    function makeScopedFrom(table: string) {
      if (table === 'organizations') return mockOrganizationsTable()
      if (table === 'org_subscriptions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'sub-1', status: 'ACTIVE' }, error: null }),
                  limit: vi.fn().mockResolvedValue({ data: [{ id: 'sub-1', status: 'ACTIVE' }], error: null }),
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'lab_technicians') return { select: mockRbacSelect }
      if (table === 'diagnostic_reports') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              // Report exists and is owned by same lab
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: ownReportId, lab_id: 'lab-1' },
                error: null,
              }),
            }),
          }),
          insert: vi.fn().mockImplementation(() => {
            diagnosticReportsInsertCount++
            return {
              error: null,
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: ownReportId }, error: null }),
              }),
            }
          }),
          delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'lab_result_files') {
        return {
          insert: vi.fn().mockImplementation(() => {
            fileInsertCount++
            return { error: null }
          }),
        }
      }
      return { insert: mockInsert, select: vi.fn(), delete: mockDelete }
    }

    const scopedSupabase = { from: vi.fn((table: string) => makeScopedFrom(table)) }
    const scopedCtx = {
      supabase: scopedSupabase as never,
      user: { sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-test-001' },
      lab: { technicianId: 'tech-1', labId: 'lab-1' },
      headers: new Headers(),
    }

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(scopedCtx as never)

    const result = await caller.lab.uploadResult({
      ...validInput,
      diagnosticReportId: ownReportId,
    })

    expect(result.reportId).toBe(ownReportId)
    // No new report row created — reused the existing one
    expect(diagnosticReportsInsertCount).toBe(0)
    // File was attached
    expect(fileInsertCount).toBe(1)
  })

  it('trims whitespace from loincCode before writing to diagnostic_reports', async () => {
    let insertedData: Record<string, unknown> | null = null
    mockInsertSingle.mockResolvedValueOnce({
      data: { id: 'report-trim-loinc' },
      error: null,
    })
    // Capture the first insert call (diagnostic_reports)
    mockInsert.mockImplementationOnce((...args: unknown[]) => {
      insertedData = args[0] as Record<string, unknown>
      return { select: mockInsertSelect }
    }).mockReturnValueOnce({ error: null })

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-test-001' }))

    await caller.lab.uploadResult({ ...validInput, loincCode: '  4548-4  ' })

    // Zod .trim() must have normalized the value before it reaches the insert
    expect(insertedData).not.toBeNull()
    expect((insertedData as unknown as Record<string, unknown>).loinc_code).toBe('4548-4')
  })

  it('accepts the literal "custom" sentinel as a valid loincCode', async () => {
    mockInsertSingle.mockResolvedValueOnce({
      data: { id: 'report-custom' },
      error: null,
    })
    mockInsert.mockReturnValueOnce({ select: mockInsertSelect })
      .mockReturnValueOnce({ error: null })

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-test-001' }))

    // 'custom' must not be rejected — it is a valid sentinel for structured-entry codes
    const result = await caller.lab.uploadResult({ ...validInput, loincCode: 'custom', loincDisplay: 'Custom test' })
    expect(result.success).toBe(true)
  })

  it('DB error on diagnosticReportId lookup throws INTERNAL_SERVER_ERROR and skips report + file inserts', async () => {
    const targetReportId = '55555555-5555-5555-5555-555555555555'
    let reportInsertCalled = false
    let fileInsertCalled = false

    function makeScopedFrom(table: string) {
      if (table === 'organizations') return mockOrganizationsTable()
      if (table === 'org_subscriptions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'sub-1', status: 'ACTIVE' }, error: null }),
                  limit: vi.fn().mockResolvedValue({ data: [{ id: 'sub-1', status: 'ACTIVE' }], error: null }),
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'lab_technicians') return { select: mockRbacSelect }
      if (table === 'diagnostic_reports') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              // Simulate transient DB error on the ownership lookup
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'db down' } }),
            }),
          }),
          insert: vi.fn().mockImplementation(() => {
            reportInsertCalled = true
            return { error: null, select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: targetReportId }, error: null }) }) }
          }),
          delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'lab_result_files') {
        return {
          insert: vi.fn().mockImplementation(() => {
            fileInsertCalled = true
            return { error: null }
          }),
        }
      }
      return { insert: mockInsert, select: vi.fn(), delete: mockDelete }
    }

    const scopedSupabase = { from: vi.fn((table: string) => makeScopedFrom(table)) }
    const scopedCtx = {
      supabase: scopedSupabase as never,
      user: { sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-test-001' },
      lab: { technicianId: 'tech-1', labId: 'lab-1' },
      headers: new Headers(),
    }

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(scopedCtx as never)

    await expect(
      caller.lab.uploadResult({ ...validInput, diagnosticReportId: targetReportId }),
    ).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to look up diagnostic report',
    })

    // Neither report nor file inserts may occur when the lookup itself fails
    expect(reportInsertCalled).toBe(false)
    expect(fileInsertCalled).toBe(false)
  })

  it('IDOR: creates report scoped to caller lab_id when diagnosticReportId does not exist', async () => {
    const newReportId = '44444444-4444-4444-4444-444444444444'
    let insertedReportData: Record<string, unknown> | null = null
    let fileInsertCount = 0

    function makeScopedFrom(table: string) {
      if (table === 'organizations') return mockOrganizationsTable()
      if (table === 'org_subscriptions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'sub-1', status: 'ACTIVE' }, error: null }),
                  limit: vi.fn().mockResolvedValue({ data: [{ id: 'sub-1', status: 'ACTIVE' }], error: null }),
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'lab_technicians') return { select: mockRbacSelect }
      if (table === 'diagnostic_reports') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              // Report does not exist
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
          insert: vi.fn().mockImplementation((data: Record<string, unknown>) => {
            insertedReportData = data
            return {
              error: null,
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: newReportId }, error: null }),
              }),
            }
          }),
          delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'lab_result_files') {
        return {
          insert: vi.fn().mockImplementation(() => {
            fileInsertCount++
            return { error: null }
          }),
        }
      }
      return { insert: mockInsert, select: vi.fn(), delete: mockDelete }
    }

    const scopedSupabase = { from: vi.fn((table: string) => makeScopedFrom(table)) }
    const scopedCtx = {
      supabase: scopedSupabase as never,
      user: { sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1', orgId: 'org-test-001' },
      lab: { technicianId: 'tech-1', labId: 'lab-1' },
      headers: new Headers(),
    }

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(scopedCtx as never)

    const result = await caller.lab.uploadResult({
      ...validInput,
      diagnosticReportId: newReportId,
    })

    expect(result.reportId).toBe(newReportId)
    // Report was created with caller's lab_id
    expect(insertedReportData).not.toBeNull()
    expect(insertedReportData).toEqual(
      expect.objectContaining({
        id: newReportId,
        lab_id: 'lab-1',
      }),
    )
    // File was attached
    expect(fileInsertCount).toBe(1)
  })
})
