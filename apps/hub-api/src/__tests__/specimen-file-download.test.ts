import { describe, it, expect, vi, beforeEach } from 'vitest'

const SPECIMEN_FILE_UUID = '00000000-0000-4000-8000-000000000500'
const PATIENT_REF = 'Patient/00000000-0000-4000-8000-000000000001'

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

const { GET } = await import('../app/api/specimen-files/[fileId]/route')

function createMockRequest(fileId: string, token = 'valid-token') {
  return new Request(`http://localhost/api/specimen-files/${fileId}`, {
    headers: { authorization: `Bearer ${token}` },
  }) as unknown as import('next/server').NextRequest
}

function setupFileMocks(overrides?: {
  file?: Record<string, unknown> | null
  fileError?: Record<string, unknown> | null
}) {
  const file = overrides?.file ?? {
    id: SPECIMEN_FILE_UUID,
    specimen_id: 'LAB-20260901-0001',
    patient_ref: PATIENT_REF,
    file_name: 'damaged.webp',
    file_type: 'image/webp',
    file_size: 512,
    encrypted_content: 'v1:encrypted-data',
    virus_scan_status: 'clean',
  }

  mockSupabase.from.mockImplementation((table: string) => {
    if (table === 'specimen_files') {
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
  mockDecryptField.mockReturnValue('aW1n') // base64 of 'img'
  mockAuditInsert.mockResolvedValue(undefined)
})

describe('GET /api/specimen-files/[fileId]', () => {
  it('returns 400 for non-UUID fileId', async () => {
    const req = createMockRequest('not-a-uuid')
    const response = await GET(req, { params: Promise.resolve({ fileId: 'not-a-uuid' }) })

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toBe('Invalid file ID')
  })

  it('returns binary with correct Content-Type and Content-Disposition', async () => {
    setupFileMocks()

    const req = createMockRequest(SPECIMEN_FILE_UUID)
    const response = await GET(req, { params: Promise.resolve({ fileId: SPECIMEN_FILE_UUID }) })

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/webp')
    expect(response.headers.get('Content-Disposition')).toContain('damaged.webp')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('blocks access when virus_scan_status is not clean', async () => {
    setupFileMocks({
      file: {
        id: SPECIMEN_FILE_UUID,
        specimen_id: 'LAB-20260901-0001',
        patient_ref: PATIENT_REF,
        file_name: 'damaged.webp',
        file_type: 'image/webp',
        file_size: 512,
        encrypted_content: 'v1:encrypted-data',
        virus_scan_status: 'infected',
      },
    })

    const req = createMockRequest(SPECIMEN_FILE_UUID)
    const response = await GET(req, { params: Promise.resolve({ fileId: SPECIMEN_FILE_UUID }) })

    expect(response.status).toBe(403)
    const body = await response.json()
    expect(body.error).toBe('File not available')
  })

  it('blocks access when virus_scan_status is pending', async () => {
    setupFileMocks({
      file: {
        id: SPECIMEN_FILE_UUID,
        specimen_id: 'LAB-20260901-0001',
        patient_ref: PATIENT_REF,
        file_name: 'damaged.webp',
        file_type: 'image/webp',
        file_size: 512,
        encrypted_content: 'v1:encrypted-data',
        virus_scan_status: 'pending',
      },
    })

    const req = createMockRequest(SPECIMEN_FILE_UUID)
    const response = await GET(req, { params: Promise.resolve({ fileId: SPECIMEN_FILE_UUID }) })

    expect(response.status).toBe(403)
  })

  it('enforces consent — no active consent returns 403', async () => {
    setupFileMocks()
    mockCheckConsent.mockResolvedValue(false)

    const req = createMockRequest(SPECIMEN_FILE_UUID)
    const response = await GET(req, { params: Promise.resolve({ fileId: SPECIMEN_FILE_UUID }) })

    expect(response.status).toBe(403)
    const body = await response.json()
    expect(body.error).toBe('No active consent')
  })

  it('enforces RBAC — unauthorized role receives 403', async () => {
    setupFileMocks()
    mockHasResourceAccess.mockReturnValue(false)

    const req = createMockRequest(SPECIMEN_FILE_UUID)
    const response = await GET(req, { params: Promise.resolve({ fileId: SPECIMEN_FILE_UUID }) })

    expect(response.status).toBe(403)
    const body = await response.json()
    expect(body.error).toBe('Forbidden')
  })

  it('emits PHI_READ audit event with operation specimen_file_download on success', async () => {
    setupFileMocks()

    const req = createMockRequest(SPECIMEN_FILE_UUID)
    await GET(req, { params: Promise.resolve({ fileId: SPECIMEN_FILE_UUID }) })

    expect(mockAuditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PHI_READ',
        resourceType: 'SPECIMEN',
        metadata: expect.objectContaining({
          operation: 'specimen_file_download',
          fileId: SPECIMEN_FILE_UUID,
        }),
      }),
    )
  })

  it('blocks access when patient_ref is missing', async () => {
    setupFileMocks({
      file: {
        id: SPECIMEN_FILE_UUID,
        specimen_id: 'LAB-20260901-0001',
        patient_ref: null,
        file_name: 'damaged.webp',
        file_type: 'image/webp',
        file_size: 512,
        encrypted_content: 'v1:encrypted-data',
        virus_scan_status: 'clean',
      },
    })

    const req = createMockRequest(SPECIMEN_FILE_UUID)
    const response = await GET(req, { params: Promise.resolve({ fileId: SPECIMEN_FILE_UUID }) })

    expect(response.status).toBe(403)
  })

  it('returns 404 when file not found', async () => {
    setupFileMocks({ fileError: { code: 'PGRST116', message: 'Not found' } })

    const req = createMockRequest(SPECIMEN_FILE_UUID)
    const response = await GET(req, { params: Promise.resolve({ fileId: SPECIMEN_FILE_UUID }) })

    expect(response.status).toBe(404)
  })

  it('returns 401 when no Bearer token is provided', async () => {
    setupFileMocks()

    const req = new Request(`http://localhost/api/specimen-files/${SPECIMEN_FILE_UUID}`) as unknown as import('next/server').NextRequest
    const response = await GET(req, { params: Promise.resolve({ fileId: SPECIMEN_FILE_UUID }) })

    expect(response.status).toBe(401)
  })

  it('returns 500 (not cleartext bytes) when encrypted_content does not start with v1:', async () => {
    setupFileMocks({
      file: {
        id: SPECIMEN_FILE_UUID,
        specimen_id: 'LAB-20260901-0001',
        patient_ref: PATIENT_REF,
        file_name: 'damaged.webp',
        file_type: 'image/webp',
        file_size: 512,
        // Simulates a write-path bug that stored raw base64 without the v1: prefix
        encrypted_content: 'aW1n',
        virus_scan_status: 'clean',
      },
    })

    const req = createMockRequest(SPECIMEN_FILE_UUID)
    const response = await GET(req, { params: Promise.resolve({ fileId: SPECIMEN_FILE_UUID }) })

    // Must NOT serve 200 with binary bytes — that would be plaintext PHI
    expect(response.status).not.toBe(200)
    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body.error).toBe('File decryption failed')
    // decryptField must never have been called — the branch must exit before reaching it
    expect(mockDecryptField).not.toHaveBeenCalled()
  })
})
