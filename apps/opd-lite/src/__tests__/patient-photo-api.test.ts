import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/hub-auth', () => ({
  getHubApiUrl: () => 'http://hub.test/api/trpc',
  getAuthHeaders: async () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer TESTTOKEN' }),
}))

import { uploadPatientPhoto, removePatientPhoto } from '@/lib/patient-photo-api'

const PID = '5d60f549-6fd0-4633-8746-2877d3f62abb'

describe('patient-photo-api', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('POSTs multipart to /api/patient-photo with a bearer token (no JSON content-type)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ photoUrl: `${PID}.webp`, lastUpdated: 'T' }),
    })
    global.fetch = fetchMock as never

    const out = await uploadPatientPhoto(PID, new Blob(['x'], { type: 'image/jpeg' }), 'LKU')
    expect(out.photoUrl).toBe(`${PID}.webp`)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://hub.test/api/patient-photo')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer TESTTOKEN')
    // multipart: never set Content-Type manually (browser sets the boundary)
    expect(init.headers['Content-Type']).toBeUndefined()
    expect(init.body).toBeInstanceOf(FormData)
  })

  it('throws on non-OK upload', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 409 }) as never
    await expect(uploadPatientPhoto(PID, new Blob(['x']), 'LKU')).rejects.toThrow(/409/)
  })

  it('DELETEs JSON with a bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ lastUpdated: 'T' }) })
    global.fetch = fetchMock as never
    await removePatientPhoto(PID, 'LKU')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://hub.test/api/patient-photo')
    expect(init.method).toBe('DELETE')
    expect(init.headers.Authorization).toBe('Bearer TESTTOKEN')
  })
})
