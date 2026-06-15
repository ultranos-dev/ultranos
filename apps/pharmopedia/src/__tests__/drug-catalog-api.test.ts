import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getDrugByAtcCodeApi } from '@/api/drug-catalog'

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
  mockHubFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ result: { data: { json: { atcCode: 'J01CA04', innName: 'Amoxicillin' } } } }),
  })
})

describe('getDrugByAtcCodeApi', () => {
  it('includes lang in the tRPC input when lang is "en"', async () => {
    await getDrugByAtcCodeApi('J01CA04', 'en', 'tok')
    const url = mockHubFetch.mock.calls[0][0] as string
    expect(url).toContain(encodeURIComponent('"lang"'))
    expect(url).toContain(encodeURIComponent('"en"'))
  })

  it('includes lang in the tRPC input when lang is "prs"', async () => {
    await getDrugByAtcCodeApi('J01CA04', 'prs', 'tok')
    const url = mockHubFetch.mock.calls[0][0] as string
    expect(url).toContain(encodeURIComponent('"prs"'))
  })

  it('includes the atcCode in the tRPC input', async () => {
    await getDrugByAtcCodeApi('J01CA04', 'en', 'tok')
    const url = mockHubFetch.mock.calls[0][0] as string
    expect(url).toContain('J01CA04')
  })

  it('sends Authorization header with the bearer token', async () => {
    await getDrugByAtcCodeApi('J01CA04', 'en', 'tok123')
    const init = mockHubFetch.mock.calls[0][1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer tok123')
  })
})
