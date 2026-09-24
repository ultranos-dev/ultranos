import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetAccessToken = vi.fn().mockResolvedValue('tok')

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: { getState: () => ({ getAccessToken: mockGetAccessToken }) },
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const { fetchActiveMedicationDisplays, fetchActiveMedications } = await import('@/lib/active-medications')

beforeEach(() => {
  mockFetch.mockReset()
  mockGetAccessToken.mockResolvedValue('tok')
})

describe('fetchActiveMedicationDisplays (legacy wrapper)', () => {
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

// Story 57.4 (M-PHARM-1, AC 4): distinguish "check ran, none found" from
// "check could not run" via the `complete` flag.
describe('fetchActiveMedications (completeness signal)', () => {
  it('returns complete:true with meds when the hub responds OK', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: { data: { json: { statements: [{ medicationDisplay: 'Warfarin 5mg' }], count: 1 } } },
      }),
    })
    expect(await fetchActiveMedications('pat-1')).toEqual({ meds: ['Warfarin 5mg'], complete: true, consentLimited: false })
  })

  it('returns complete:true with empty meds when the hub reports none (a real clear)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: { data: { json: { statements: [], count: 0 } } } }),
    })
    expect(await fetchActiveMedications('pat-1')).toEqual({ meds: [], complete: true, consentLimited: false })
  })

  it('returns complete:false with no token (degraded, not a clear)', async () => {
    mockGetAccessToken.mockResolvedValueOnce(null)
    expect(await fetchActiveMedications('pat-1')).toEqual({ meds: [], complete: false, consentLimited: false })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns complete:false on a network error (degraded, not a clear)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('offline'))
    expect(await fetchActiveMedications('pat-1')).toEqual({ meds: [], complete: false, consentLimited: false })
  })

  it('returns complete:false on a non-OK response (degraded, not a clear)', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({}) })
    expect(await fetchActiveMedications('pat-1')).toEqual({ meds: [], complete: false, consentLimited: false })
  })

  // Story 58.4 (H-HUB-7): a consent-limited read is complete (the hub responded)
  // but consentLimited — the caller must treat it as degraded, not a clear.
  it('returns consentLimited:true when the hub reports the read was consent-limited', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: { data: { json: { statements: [], count: 0, consentLimited: true } } } }),
    })
    expect(await fetchActiveMedications('pat-1')).toEqual({ meds: [], complete: true, consentLimited: true })
  })
})
