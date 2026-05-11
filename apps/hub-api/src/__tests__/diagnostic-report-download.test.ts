import { describe, it, expect, vi, beforeEach } from 'vitest'

const REPORT_UUID = '00000000-0000-4000-8000-000000000200'
const PATIENT_REF = 'Patient/00000000-0000-4000-8000-000000000001'
const FILE_UUID = '00000000-0000-4000-8000-000000000400'

const mockVerifyJwt = vi.fn()
const mockGetJwk = vi.fn()
const mockHasResourceAccess = vi.fn()
const mockCheckConsent = vi.fn()
const mockDecryptField = vi.fn()
const mockGetEncryptionKey = vi.fn()
const mockAuditInsert = vi.fn()

const mockSupabase = { from: vi.fn() }

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => mockSupabase,
  db: {
    toRow: (data: any) => data,
    fromRow: (data: any) => data,
    fromRows: (data: any[]) => data,
  },
}))

vi.mock('@/lib/jwt', () => ({
  verifySupabaseJwt: (...args: unknown[]) => mockVerifyJwt(...args),
  getSupabaseJwk: () => mockGetJwk(),
}))

vi.mock('@/trpc/rbac', () => ({
  hasResourceAccess: (...args: unknown[]) => mockHasResourceAccess(...args),
}))

vi.mock('@/trpc/middleware/enforceConsent', () => ({
  checkConsent: (...args: unknown[]) => mockCheckConsent(...args),
}))

vi.mock('@ultranos/crypto/server', () => ({
  decryptField: (...args: unknown[]) => mockDecryptField(...args),
}))

vi.mock('@/lib/field-encryption', () => ({
  getCachedEncryptionKey: () => mockGetEncryptionKey(),
}))

vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({
    emit: (...args: unknown[]) => mockAuditInsert(...args),
  })),
}))

const { GET } = await import('../app/api/lab-files/[fileId]/route')

function createMockRequest(fileId: string, token = 'valid-token') {
  return new Request(`http://localhost/api/lab-files/${fileId}`, {
    headers: { authorization: `Bearer ${token}` },
  }) as unknown as import('next/server').NextRequest
}

function setupFileMocks(overrides?: {
  file?: Record<string, unknown> | null
  fileError?: Record<string, unknown> | null
  report?: Record<string, unknown> | null
  reportError?: Record<string, unknown> | null
}) {
  const file = overrides?.file ?? {
    id: FILE_UUID,
    diagnostic_report_id: REPORT_UUID,
    file_name: 'results.pdf',
    file_type: 'application/pdf',
    file_size: 1024,
    encrypted_content: 'v1:encrypted-data',
  }
  const report = overrides?.report ?? {
    id: REPORT_UUID,
    patient_ref: PATIENT_REF,
    virus_scan_status: 'clean',
  }

  mockSupabase.from.mockImplementation((table: string) => {
    if (table === 'lab_result_files') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: overrides?.fileError ? null : file,
              error: overrides?.fileError ?? null,
            }),
          }),
        }),
      }
    }
    if (table === 'diagnostic_reports') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: overrides?.reportError ? null : report,
              error: overrides?.reportError ?? null,
            }),
          }),
        }),
      }
    }
    return { select: vi.fn() }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetJwk.mockReturnValue('mock-jwk')
  mockVerifyJwt.mockResolvedValue({ sub: 'doctor-001', role: 'DOCTOR', session_id: 'sess-1' })
  mockHasResourceAccess.mockReturnValue(true)
  mockCheckConsent.mockResolvedValue(true)
  mockGetEncryptionKey.mockReturnValue('mock-key')
  mockDecryptField.mockReturnValue('SGVsbG8gV29ybGQ=') // base64 of "Hello World"
  mockAuditInsert.mockResolvedValue(undefined)
})

describe('GET /api/lab-files/[fileId]', () => {
  it('returns binary with correct Content-Type and Content-Disposition', async () => {
    setupFileMocks()

    const req = createMockRequest(FILE_UUID)
    const response = await GET(req, { params: Promise.resolve({ fileId: FILE_UUID }) })

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/pdf')
    expect(response.headers.get('Content-Disposition')).toContain('results.pdf')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('enforces RBAC — unauthorized role receives 403', async () => {
    setupFileMocks()
    mockHasResourceAccess.mockReturnValue(false)

    const req = createMockRequest(FILE_UUID)
    const response = await GET(req, { params: Promise.resolve({ fileId: FILE_UUID }) })

    expect(response.status).toBe(403)
    const body = await response.json()
    expect(body.error).toBe('Forbidden')
  })

  it('enforces consent — no active consent returns 403', async () => {
    setupFileMocks()
    mockCheckConsent.mockResolvedValue(false)

    const req = createMockRequest(FILE_UUID)
    const response = await GET(req, { params: Promise.resolve({ fileId: FILE_UUID }) })

    expect(response.status).toBe(403)
    const body = await response.json()
    expect(body.error).toBe('No active consent')
  })

  it('emits PHI_READ audit event on file download', async () => {
    setupFileMocks()

    const req = createMockRequest(FILE_UUID)
    await GET(req, { params: Promise.resolve({ fileId: FILE_UUID }) })

    expect(mockAuditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PHI_READ',
        resourceType: 'DIAGNOSTIC_REPORT',
        metadata: expect.objectContaining({ operation: 'file_download', fileId: FILE_UUID }),
      })
    )
  })

  it('blocks access when patient_ref is missing', async () => {
    setupFileMocks({
      report: { id: REPORT_UUID, patient_ref: null, virus_scan_status: 'clean' },
    })

    const req = createMockRequest(FILE_UUID)
    const response = await GET(req, { params: Promise.resolve({ fileId: FILE_UUID }) })

    expect(response.status).toBe(403)
  })

  it('blocks access to files with non-clean virus scan status', async () => {
    setupFileMocks({
      report: { id: REPORT_UUID, patient_ref: PATIENT_REF, virus_scan_status: 'infected' },
    })

    const req = createMockRequest(FILE_UUID)
    const response = await GET(req, { params: Promise.resolve({ fileId: FILE_UUID }) })

    expect(response.status).toBe(403)
  })
})
