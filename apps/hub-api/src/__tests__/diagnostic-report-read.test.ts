import { describe, it, expect, vi, beforeEach } from 'vitest'

// Simple snake_case → camelCase for mock db.fromRow
function snakeToCamel(obj: any): any {
  if (obj === null || typeof obj !== 'object') return obj
  const result: any = {}
  for (const key of Object.keys(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
    result[camelKey] = obj[key]
  }
  return result
}

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => mockSupabaseClient),
  db: {
    toRow: (data: any) => data,
    toRowRaw: (data: any) => data,
    fromRow: (data: any) => snakeToCamel(data),
    fromRowRaw: (data: any) => data,
    fromRows: (data: any[]) => data.map(snakeToCamel),
  },
}))

const mockSupabaseClient = {
  from: vi.fn(),
}

const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')

const createCaller = createCallerFactory(appRouter)

function createTestContext(overrides?: {
  supabaseFrom?: ReturnType<typeof vi.fn>
  user?: { sub: string; role: string; sessionId: string } | null
  lab?: { technicianId: string; labId: string; labStatus: string } | null
}) {
  const supabase = {
    from: overrides?.supabaseFrom ?? vi.fn(),
  }
  return {
    supabase: supabase as never,
    user: overrides?.user ?? null,
    headers: new Headers(),
    ...(overrides?.lab ? { lab: overrides.lab } : {}),
  }
}

const CLINICIAN_USER = { sub: 'doctor-001', role: 'DOCTOR', sessionId: 'sess-1' }
const LAB_TECH_USER = { sub: 'lab-001', role: 'LAB_TECH', sessionId: 'sess-2' }
const PHARMACIST_USER = { sub: 'pharma-001', role: 'PHARMACIST', sessionId: 'sess-3' }
const REPORT_UUID = '00000000-0000-4000-8000-000000000200'
const PATIENT_REF = 'Patient/00000000-0000-4000-8000-000000000001'
const LAB_UUID = '00000000-0000-4000-8000-000000000300'
const FILE_UUID = '00000000-0000-4000-8000-000000000400'

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── diagnosticReport.read ─────────────────────────────────────────────────

describe('diagnosticReport.read', () => {
  const validInput = { id: REPORT_UUID, patientRef: PATIENT_REF }

  function createMockFrom(options?: { reportData?: any; fileData?: any; reportError?: any }) {
    const reportData = options?.reportData ?? {
      id: REPORT_UUID,
      status: 'final',
      loinc_code: '26436-6',
      loinc_display: 'Laboratory studies',
      patient_ref: PATIENT_REF,
      performer_id: 'perf-001',
      lab_id: LAB_UUID,
      issued: '2026-05-10T10:00:00Z',
      collection_date: '2026-05-09T08:00:00Z',
      report_conclusion: 'Normal results',
      virus_scan_status: 'clean',
      _ultranos_created_at: '2026-05-10T10:00:00Z',
      updated_at: '2026-05-10T10:00:00Z',
    }
    const fileData = options?.fileData ?? [
      { id: FILE_UUID, file_name: 'results.pdf', file_type: 'application/pdf', file_size: 1024, _ultranos_created_at: '2026-05-10T10:00:00Z' },
    ]

    return vi.fn((table: string) => {
      if (table === 'audit_log') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        }
      }
      if (table === 'consents') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [{ id: 'c1', status: 'ACTIVE', category: ['LABS'], date_time: '2026-01-01T00:00:00Z', provision_end: null }],
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'lab_result_files') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: fileData, error: null }),
          }),
        }
      }
      // diagnostic_reports
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: options?.reportError ? null : reportData,
                error: options?.reportError ?? null,
              }),
            }),
          }),
        }),
      }
    })
  }

  it('requires authentication', async () => {
    const ctx = createTestContext({ user: null })
    const caller = createCaller(ctx)
    await expect(caller.diagnosticReport.read(validInput)).rejects.toThrow()
  })

  it('returns decrypted report with file metadata (no inline content)', async () => {
    const mockFrom = createMockFrom()
    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    const result = await caller.diagnosticReport.read(validInput)
    expect(result.id).toBe(REPORT_UUID)
    expect(result.resourceType).toBe('DiagnosticReport')
    expect(result.reportConclusion).toBe('Normal results')
    expect(result.files).toHaveLength(1)
    expect(result.files[0].downloadUrl).toBe(`/api/lab-files/${FILE_UUID}`)
    expect(result.files[0].fileName).toBe('results.pdf')
    // Ensure no encrypted_content in response
    expect((result.files[0] as any).encryptedContent).toBeUndefined()
  })

  it('returns NOT_FOUND for non-existent ID', async () => {
    const mockFrom = createMockFrom({ reportError: { code: 'PGRST116' } })
    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    await expect(caller.diagnosticReport.read(validInput)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('enforces RBAC — PHARMACIST receives FORBIDDEN', async () => {
    const mockFrom = createMockFrom()
    const ctx = createTestContext({ supabaseFrom: mockFrom, user: PHARMACIST_USER })
    const caller = createCaller(ctx)

    await expect(caller.diagnosticReport.read(validInput)).rejects.toThrow(/denied|forbidden/i)
  })

  it('enforces consent — no active consent returns FORBIDDEN', async () => {
    const mockFrom = vi.fn((table: string) => {
      if (table === 'audit_log') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        }
      }
      if (table === 'consents') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            }),
          }),
        }
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      }
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    await expect(caller.diagnosticReport.read(validInput)).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('emits PHI_READ audit event', async () => {
    const mockFrom = createMockFrom()
    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    await caller.diagnosticReport.read(validInput)
    const fromCalls = mockFrom.mock.calls.map((c: unknown[]) => c[0])
    expect(fromCalls).toContain('audit_log')
  })
})

// ─── diagnosticReport.listByPatient ────────────────────────────────────────

describe('diagnosticReport.listByPatient', () => {
  const validInput = { patientRef: PATIENT_REF }

  function createListMockFrom(reportRows: any[] = []) {
    return vi.fn((table: string) => {
      if (table === 'audit_log') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        }
      }
      if (table === 'consents') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [{ id: 'c1', status: 'ACTIVE', category: ['LABS'], date_time: '2026-01-01T00:00:00Z', provision_end: null }],
                error: null,
              }),
            }),
          }),
        }
      }
      // diagnostic_reports
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: reportRows, error: null }),
                }),
              }),
            }),
          }),
        }),
      }
    })
  }

  it('requires authentication', async () => {
    const ctx = createTestContext({ user: null })
    const caller = createCaller(ctx)
    await expect(caller.diagnosticReport.listByPatient(validInput)).rejects.toThrow()
  })

  it('returns reports ordered by collection_date DESC', async () => {
    const mockRows = [
      { id: REPORT_UUID, status: 'final', loinc_code: '26436-6', loinc_display: 'Lab', patient_ref: PATIENT_REF, performer_id: null, lab_id: LAB_UUID, issued: '2026-05-10T10:00:00Z', collection_date: '2026-05-10T08:00:00Z', virus_scan_status: 'clean', _ultranos_created_at: '2026-05-10T10:00:00Z' },
      { id: '00000000-0000-4000-8000-000000000201', status: 'final', loinc_code: '26436-6', loinc_display: 'Lab', patient_ref: PATIENT_REF, performer_id: null, lab_id: LAB_UUID, issued: '2026-05-09T10:00:00Z', collection_date: '2026-05-09T08:00:00Z', virus_scan_status: 'clean', _ultranos_created_at: '2026-05-09T10:00:00Z' },
    ]

    const mockFrom = createListMockFrom(mockRows)
    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    const result = await caller.diagnosticReport.listByPatient(validInput)
    expect(result.reports).toHaveLength(2)
    expect(result.reports[0].id).toBe(REPORT_UUID)
    expect(result.nextCursor).toBeUndefined()
  })

  it('pagination — returns nextCursor when more results exist', async () => {
    // Create limit+1 items to trigger pagination (default limit=20, so 21 items)
    const mockRows = Array.from({ length: 21 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      status: 'final',
      loinc_code: '26436-6',
      loinc_display: 'Lab',
      patient_ref: PATIENT_REF,
      performer_id: null,
      lab_id: LAB_UUID,
      issued: '2026-05-10T10:00:00Z',
      collection_date: `2026-05-${String(10 - Math.floor(i / 3)).padStart(2, '0')}T08:00:00Z`,
      virus_scan_status: 'clean',
      _ultranos_created_at: '2026-05-10T10:00:00Z',
    }))

    const mockFrom = createListMockFrom(mockRows)
    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    const result = await caller.diagnosticReport.listByPatient(validInput)
    expect(result.reports).toHaveLength(20)
    expect(result.nextCursor).toBeDefined()
  })

  it('returns empty array for patient with no reports', async () => {
    const mockFrom = createListMockFrom([])
    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    const result = await caller.diagnosticReport.listByPatient(validInput)
    expect(result.reports).toHaveLength(0)
    expect(result.nextCursor).toBeUndefined()
  })

  it('emits PHI_READ audit event with result count', async () => {
    const mockRows = [
      { id: REPORT_UUID, status: 'final', loinc_code: '26436-6', loinc_display: 'Lab', patient_ref: PATIENT_REF, performer_id: null, lab_id: LAB_UUID, issued: '2026-05-10T10:00:00Z', collection_date: '2026-05-10T08:00:00Z', virus_scan_status: 'clean', _ultranos_created_at: '2026-05-10T10:00:00Z' },
    ]

    const mockFrom = createListMockFrom(mockRows)
    const ctx = createTestContext({ supabaseFrom: mockFrom, user: CLINICIAN_USER })
    const caller = createCaller(ctx)

    await caller.diagnosticReport.listByPatient(validInput)
    const fromCalls = mockFrom.mock.calls.map((c: unknown[]) => c[0])
    expect(fromCalls).toContain('audit_log')
  })
})

// ─── diagnosticReport.listByLab ────────────────────────────────────────────

describe('diagnosticReport.listByLab', () => {
  const validInput = {} // labId now comes from ctx.lab (labRestrictedProcedure)
  const LAB_CONTEXT = { technicianId: 'tech-001', labId: LAB_UUID, labStatus: 'ACTIVE' }

  function createLabListMockFrom(reportRows: any[] = []) {
    return vi.fn((table: string) => {
      if (table === 'audit_log') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        }
      }
      if (table === 'lab_technicians') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'tech-001', lab_id: LAB_UUID, labs: { id: LAB_UUID, status: 'ACTIVE' } },
                error: null,
              }),
            }),
          }),
        }
      }
      // diagnostic_reports — no consent check for listByLab
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: reportRows, error: null }),
              }),
            }),
          }),
        }),
      }
    })
  }

  it('requires authentication', async () => {
    const ctx = createTestContext({ user: null })
    const caller = createCaller(ctx)
    await expect(caller.diagnosticReport.listByLab(validInput)).rejects.toThrow()
  })

  it('returns reports ordered by issued DESC', async () => {
    const mockRows = [
      { id: REPORT_UUID, status: 'final', loinc_code: '26436-6', loinc_display: 'Lab', patient_ref: PATIENT_REF, performer_id: null, lab_id: LAB_UUID, issued: '2026-05-10T10:00:00Z', collection_date: '2026-05-10T08:00:00Z', virus_scan_status: 'clean', _ultranos_created_at: '2026-05-10T10:00:00Z' },
      { id: '00000000-0000-4000-8000-000000000201', status: 'preliminary', loinc_code: '26436-6', loinc_display: 'Lab', patient_ref: PATIENT_REF, performer_id: null, lab_id: LAB_UUID, issued: '2026-05-09T10:00:00Z', collection_date: '2026-05-09T08:00:00Z', virus_scan_status: 'pending', _ultranos_created_at: '2026-05-09T10:00:00Z' },
    ]

    const mockFrom = createLabListMockFrom(mockRows)
    const ctx = createTestContext({ supabaseFrom: mockFrom, user: LAB_TECH_USER, lab: LAB_CONTEXT })
    const caller = createCaller(ctx)

    const result = await caller.diagnosticReport.listByLab(validInput)
    expect(result.reports).toHaveLength(2)
    // Shows all statuses including pending for technician view
    expect(result.reports[1].virusScanStatus).toBe('pending')
  })

  it('pagination works correctly', async () => {
    const mockRows = Array.from({ length: 21 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      status: 'final',
      loinc_code: '26436-6',
      loinc_display: 'Lab',
      patient_ref: PATIENT_REF,
      performer_id: null,
      lab_id: LAB_UUID,
      issued: `2026-05-${String(10 - Math.floor(i / 3)).padStart(2, '0')}T10:00:00Z`,
      collection_date: '2026-05-10T08:00:00Z',
      virus_scan_status: 'clean',
      _ultranos_created_at: '2026-05-10T10:00:00Z',
    }))

    const mockFrom = createLabListMockFrom(mockRows)
    const ctx = createTestContext({ supabaseFrom: mockFrom, user: LAB_TECH_USER, lab: LAB_CONTEXT })
    const caller = createCaller(ctx)

    const result = await caller.diagnosticReport.listByLab(validInput)
    expect(result.reports).toHaveLength(20)
    expect(result.nextCursor).toBeDefined()
  })

  it('emits READ audit event (not PHI_READ)', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ error: null })
    const mockFrom = vi.fn((table: string) => {
      if (table === 'audit_log') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
          insert: insertSpy,
        }
      }
      if (table === 'lab_technicians') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'tech-001', lab_id: LAB_UUID, labs: { id: LAB_UUID, status: 'ACTIVE' } },
                error: null,
              }),
            }),
          }),
        }
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        }),
      }
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: LAB_TECH_USER, lab: LAB_CONTEXT })
    const caller = createCaller(ctx)

    await caller.diagnosticReport.listByLab(validInput)
    const fromCalls = mockFrom.mock.calls.map((c: unknown[]) => c[0])
    expect(fromCalls).toContain('audit_log')

    // Verify the audit event action is READ, not PHI_READ
    expect(insertSpy).toHaveBeenCalled()
    const auditPayload = insertSpy.mock.calls[0][0]
    expect(auditPayload.action).toBe('READ')
  })

  it('does not enforce consent middleware (lab-scoped)', async () => {
    // LAB_TECH accessing without consent records should still succeed
    const mockFrom = vi.fn((table: string) => {
      if (table === 'audit_log') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        }
      }
      if (table === 'lab_technicians') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'tech-001', lab_id: LAB_UUID, labs: { id: LAB_UUID, status: 'ACTIVE' } },
                error: null,
              }),
            }),
          }),
        }
      }
      // No consents table mock needed — should not be queried
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        }),
      }
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: LAB_TECH_USER, lab: LAB_CONTEXT })
    const caller = createCaller(ctx)

    // Should succeed without consent
    const result = await caller.diagnosticReport.listByLab(validInput)
    expect(result.reports).toHaveLength(0)
  })
})

// File download endpoint tests are in diagnostic-report-download.test.ts
// (separate file required due to vi.mock hoisting conflicts)
