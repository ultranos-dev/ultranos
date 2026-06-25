import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetAccessToken = vi.fn().mockResolvedValue('tok')

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: { getState: () => ({ getAccessToken: mockGetAccessToken }) },
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const { fetchActiveMedicationDisplays } = await import('@/lib/active-medications')

beforeEach(() => {
  mockFetch.mockReset()
  mockGetAccessToken.mockResolvedValue('tok')
})

describe('fetchActiveMedicationDisplays', () => {
  it('returns medication display names from the hub', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: { data: { json: { statements: [{ medicationDisplay: 'Warfarin 5mg' }, { medicationDisplay: 'Aspirin 75mg' }], count: 2 } } },
      }),
    })
    expect(await fetchActiveMedicationDisplays('pat-1')).toEqual(['Warfarin 5mg', 'Aspirin 75mg'])
  })

  it('returns [] when there is no token (best-effort, never throws)', async () => {
    mockGetAccessToken.mockResolvedValueOnce(null)
    expect(await fetchActiveMedicationDisplays('pat-1')).toEqual([])
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns [] on a network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('offline'))
    expect(await fetchActiveMedicationDisplays('pat-1')).toEqual([])
  })
})
