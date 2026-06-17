import { describe, it, expect, vi, beforeEach } from 'vitest'
const { mockHubFetch } = vi.hoisted(() => ({ mockHubFetch: vi.fn() }))
vi.mock('@/lib/hub-fetch', () => ({ hubFetch: mockHubFetch }))
import { getProfile } from '@/api/users'

describe('users API client', () => {
  beforeEach(() => vi.clearAllMocks())
  it('GETs users.getProfile with auth header and unwraps the envelope', async () => {
    const profile = { kind: 'patient', displayName: 'Sara', givenName: 'Sara', tier: 'FREE' }
    mockHubFetch.mockResolvedValue({ ok: true, json: async () => ({ result: { data: { json: profile } } }) })
    const res = await getProfile('tok')
    expect(res).toEqual(profile)
    const [url, opts] = mockHubFetch.mock.calls[0]
    expect(String(url)).toContain('users.getProfile')
    expect(opts.method).toBe('GET')
    expect(opts.headers.Authorization).toBe('Bearer tok')
  })
  it('throws on non-ok', async () => {
    mockHubFetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    await expect(getProfile('tok')).rejects.toThrow(/users.getProfile/)
  })
})
