import { describe, it, expect, vi, beforeEach } from 'vitest'
import { discoverAccount, claimAccount, registerFromSession } from '@/api/account'

const mockHubFetch = vi.fn()
vi.mock('@/lib/hub-fetch', () => ({
  hubFetch: (...args: unknown[]) => mockHubFetch(...args),
}))
vi.mock('@/lib/pinned-fetch', () => ({ pinnedFetch: vi.fn() }))
vi.mock('@/stores/device-security-store', () => ({
  useDeviceSecurityStore: { getState: () => ({ checked: true, isCompromised: false }) },
}))

beforeEach(() => {
  mockHubFetch.mockClear()
})

// ---------------------------------------------------------------------------
// discoverAccount
// ---------------------------------------------------------------------------
describe('discoverAccount', () => {
  it('POSTs to patientRegistration.discover with {"json": input}', async () => {
    mockHubFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ result: { data: { json: { matchType: 'none' } } } }),
    })
    await discoverAccount('tok', { phone: '+93700000001' })
    const [url, init] = mockHubFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('patientRegistration.discover')
    const body = JSON.parse(init.body as string)
    expect(body).toEqual({ json: { phone: '+93700000001' } })
  })

  it('sends Authorization header with the bearer token', async () => {
    mockHubFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ result: { data: { json: { matchType: 'none' } } } }),
    })
    await discoverAccount('mytoken', { phone: '+93700000001' })
    const init = mockHubFetch.mock.calls[0][1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer mytoken')
  })

  it('uses POST method', async () => {
    mockHubFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ result: { data: { json: { matchType: 'none' } } } }),
    })
    await discoverAccount('tok', { phone: '+93700000001' })
    const init = mockHubFetch.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('POST')
  })

  it('parses the tRPC envelope and returns the inner json', async () => {
    const payload = { matchType: 'patient' as const, candidate: { ref: 'abc123', maskedName: 'Ali', birthYear: 1990 } }
    mockHubFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ result: { data: { json: payload } } }),
    })
    const result = await discoverAccount('tok', { phone: '+93700000001' })
    expect(result).toEqual(payload)
  })

  it('throws on non-ok response', async () => {
    mockHubFetch.mockResolvedValue({ ok: false, status: 403 })
    await expect(discoverAccount('tok', { phone: '+93700000001' })).rejects.toThrow('403')
  })
})

// ---------------------------------------------------------------------------
// claimAccount
// ---------------------------------------------------------------------------
describe('claimAccount', () => {
  it('POSTs to patientRegistration.claim with {"json": input}', async () => {
    mockHubFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ result: { data: { json: { ok: true } } } }),
    })
    await claimAccount('tok', { ref: 'a'.repeat(64), phone: '+93700000001', birthYear: 1985 })
    const [url, init] = mockHubFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('patientRegistration.claim')
    const body = JSON.parse(init.body as string)
    expect(body).toEqual({ json: { ref: 'a'.repeat(64), phone: '+93700000001', birthYear: 1985 } })
  })

  it('sends Authorization header with the bearer token', async () => {
    mockHubFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ result: { data: { json: { ok: true } } } }),
    })
    await claimAccount('claimtok', { ref: 'b'.repeat(64), phone: '+93700000002', birthYear: 1992 })
    const init = mockHubFetch.mock.calls[0][1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer claimtok')
  })

  it('uses POST method', async () => {
    mockHubFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ result: { data: { json: { ok: true } } } }),
    })
    await claimAccount('tok', { ref: 'c'.repeat(64), phone: '+93700000003', birthYear: 1978 })
    const init = mockHubFetch.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('POST')
  })

  it('parses the tRPC envelope and returns { ok: true }', async () => {
    mockHubFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ result: { data: { json: { ok: true } } } }),
    })
    const result = await claimAccount('tok', { ref: 'd'.repeat(64), phone: '+93700000001', birthYear: 1990 })
    expect(result).toEqual({ ok: true })
  })

  it('throws on non-ok response', async () => {
    mockHubFetch.mockResolvedValue({ ok: false, status: 403 })
    await expect(
      claimAccount('tok', { ref: 'e'.repeat(64), phone: '+93700000001', birthYear: 1990 }),
    ).rejects.toThrow('403')
  })
})

// ---------------------------------------------------------------------------
// registerFromSession
// ---------------------------------------------------------------------------
describe('registerFromSession', () => {
  const minimalInput = {
    firstName: 'Ali',
    dateOfBirth: '1990-05-15',
    preferredLanguage: 'en',
  }

  it('POSTs to patientRegistration.registerFromSession with {"json": input}', async () => {
    mockHubFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ result: { data: { json: { patientId: 'pid-blind-idx' } } } }),
    })
    await registerFromSession('tok', minimalInput)
    const [url, init] = mockHubFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('patientRegistration.registerFromSession')
    const body = JSON.parse(init.body as string)
    expect(body).toEqual({ json: minimalInput })
  })

  it('sends Authorization header with the bearer token', async () => {
    mockHubFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ result: { data: { json: { patientId: 'pid-blind-idx' } } } }),
    })
    await registerFromSession('regtok', minimalInput)
    const init = mockHubFetch.mock.calls[0][1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer regtok')
  })

  it('uses POST method', async () => {
    mockHubFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ result: { data: { json: { patientId: 'pid-blind-idx' } } } }),
    })
    await registerFromSession('tok', minimalInput)
    const init = mockHubFetch.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('POST')
  })

  it('passes optional fields through in the body when provided', async () => {
    mockHubFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ result: { data: { json: { patientId: 'pid-blind-idx' } } } }),
    })
    const fullInput = {
      ...minimalInput,
      nameFather: 'Ahmad',
      gender: 'male' as const,
      addressProvinceCurrent: 'Kabul',
      addressDistrictCurrent: 'District 1',
      addressVillageCurrent: 'Village A',
      photoUrl: 'https://example.com/photo.jpg',
    }
    await registerFromSession('tok', fullInput)
    const init = mockHubFetch.mock.calls[0][1] as RequestInit
    const body = JSON.parse(init.body as string)
    expect(body).toEqual({ json: fullInput })
  })

  it('parses the tRPC envelope and returns the inner json', async () => {
    mockHubFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ result: { data: { json: { patientId: 'pid-blind-idx' } } } }),
    })
    const result = await registerFromSession('tok', minimalInput)
    expect(result).toEqual({ patientId: 'pid-blind-idx' })
  })

  it('returns { blocked: true } when the server signals MPI block', async () => {
    mockHubFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ result: { data: { json: { blocked: true } } } }),
    })
    const result = await registerFromSession('tok', minimalInput)
    expect(result).toEqual({ blocked: true })
  })

  it('throws on non-ok response', async () => {
    mockHubFetch.mockResolvedValue({ ok: false, status: 500 })
    await expect(registerFromSession('tok', minimalInput)).rejects.toThrow('500')
  })
})
