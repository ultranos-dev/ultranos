import { describe, it, expect, vi, beforeEach } from 'vitest'
import sharp from 'sharp'

// ---- Mocks (declare before importing the route) ----
const single = vi.fn()
const updateSelect = vi.fn()
const storageUpload = vi.fn()
const storageRemove = vi.fn().mockResolvedValue({ error: null })
const auditEmit = vi.fn()

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ single }) }) }),
      update: () => ({ eq: () => ({ eq: () => ({ select: updateSelect }) }) }),
    }),
    storage: { from: () => ({ upload: storageUpload, remove: storageRemove }) },
  }),
  db: { toRow: (o: Record<string, unknown>) => o },
}))
vi.mock('@/lib/jwt', () => ({
  getSupabaseJwk: () => ({ _marker: true }),
  verifySupabaseJwt: vi.fn(async (token: string) => {
    if (token === 'good') return { sub: 'user-1', session_id: 's1', user_metadata: { role: 'CLINICIAN', org_id: 'org-1' } }
    if (token === 'badrole') return { sub: 'user-2', session_id: 's2', user_metadata: { role: 'RECEPTIONIST', org_id: 'org-1' } }
    return null // any other token (incl. '') → unverified
  }),
}))
vi.mock('@/trpc/rbac', () => ({ hasResourceAccess: (role: string) => role === 'CLINICIAN' }))
vi.mock('@ultranos/audit-logger', () => ({ AuditLogger: class { emit = auditEmit } }))

import { POST, DELETE } from '@/app/api/patient-photo/route'

const PID = '5d60f549-6fd0-4633-8746-2877d3f62abb'

async function pngFile(): Promise<File> {
  const buf = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#ff0000' } }).png().toBuffer()
  return new File([buf], 'p.png', { type: 'image/png' })
}
function req(file: File, token = 'good', patientId = PID) {
  const fd = new FormData()
  fd.set('file', file)
  fd.set('patientId', patientId)
  fd.set('lastKnownUpdate', '2999-01-01T00:00:00.000Z')
  return new Request('http://x/api/patient-photo', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: fd,
  })
}

describe('POST /api/patient-photo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    single.mockResolvedValue({ data: { id: PID, updated_at: '2000-01-01T00:00:00.000Z' }, error: null })
    updateSelect.mockResolvedValue({ data: [{ id: PID }], error: null })
    storageUpload.mockResolvedValue({ error: null })
    storageRemove.mockResolvedValue({ error: null })
  })

  it('401 without a bearer token', async () => {
    const res = await POST(req(await pngFile(), '') as never)
    expect(res.status).toBe(401)
  })

  it('403 when the verified role lacks Patient access', async () => {
    const res = await POST(req(await pngFile(), 'badrole') as never)
    expect(res.status).toBe(403)
  })

  it('re-encodes to WebP ≤512px, uploads, sets photo_url, audits', async () => {
    const res = await POST(req(await pngFile()) as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.photoUrl).toBe(`${PID}.webp`)

    // The uploaded buffer is a valid WebP, ≤512px, metadata stripped
    const uploadedBuf: Buffer = storageUpload.mock.calls[0][1]
    const meta = await sharp(uploadedBuf).metadata()
    expect(meta.format).toBe('webp')
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(512)
    expect(storageUpload.mock.calls[0][0]).toBe(`${PID}.webp`)
    expect(auditEmit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'PHI_WRITE', resourceType: 'PATIENT', resourceId: PID,
    }))
  })

  it('409 on stale lastKnownUpdate', async () => {
    single.mockResolvedValue({ data: { id: PID, updated_at: '2999-12-31T00:00:00.000Z' }, error: null })
    const res = await POST(req(await pngFile()) as never)
    expect(res.status).toBe(409)
  })
})

describe('DELETE /api/patient-photo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    single.mockResolvedValue({ data: { id: PID, updated_at: '2000-01-01T00:00:00.000Z' }, error: null })
    updateSelect.mockResolvedValue({ data: [{ id: PID }], error: null })
    storageRemove.mockResolvedValue({ error: null })
  })

  function deleteReq(
    patientId = PID,
    lastKnownUpdate = '2999-01-01T00:00:00.000Z',
    token = 'good',
  ) {
    return new Request('http://x/api/patient-photo', {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ patientId, lastKnownUpdate }),
    })
  }

  it('200 success — removes both storage keys, sets photoUrl null, audits', async () => {
    const res = await DELETE(deleteReq() as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.photoUrl).toBeNull()

    // Storage remove must be called with BOTH candidate keys
    expect(storageRemove).toHaveBeenCalledWith(
      expect.arrayContaining([`${PID}.webp`, `${PID}.jpg`]),
    )

    // Audit must record the write
    expect(auditEmit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'PHI_WRITE', resourceType: 'PATIENT', resourceId: PID,
    }))
  })

  it('409 on stale lastKnownUpdate', async () => {
    single.mockResolvedValue({ data: { id: PID, updated_at: '2999-12-31T00:00:00.000Z' }, error: null })
    const res = await DELETE(deleteReq(PID, '2000-01-01T00:00:00.000Z') as never)
    expect(res.status).toBe(409)
  })
})
