import { describe, it, expect, vi, beforeEach } from 'vitest'

// Regression: a per-patient sync watermark can be poisoned by a non-HLC value
// (e.g. an ISO `updated_at` like "2026-09-10T…"). Because "2026…" sorts
// lexicographically ABOVE a real serialized HLC ("001789…"), the incremental
// pull's `hlc_timestamp > sinceHlc` filter then permanently EXCLUDES genuine
// records — notably a patient's AllergyIntolerance rows — so the detail page's
// allergy banner shows a (dangerous) false "No known allergies" while the Hub,
// and the patients list, correctly report the allergy.
//
// The fix: sanitize the stored watermark on read — if it is not a valid serialized
// HLC, fall back to '0' (full re-pull), which self-heals a poisoned watermark.

const PID = '320dd80c-ab5f-45ac-a227-d3157b1fdd16'

const syncMetaGet = vi.fn()
const syncMetaPut = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/db', () => ({
  db: {
    syncMeta: { get: (...a: unknown[]) => syncMetaGet(...a), put: (...a: unknown[]) => syncMetaPut(...a) },
  },
}))
vi.mock('@/lib/hlc', () => ({ hlc: { receive: vi.fn() } }))
vi.mock('@/lib/audit', () => ({ auditPhiAccess: vi.fn(), AuditAction: { READ: 'READ' } }))
vi.mock('@/lib/hub-url', () => ({ getHubTrpcUrl: () => 'http://hub.test/api/trpc' }))
vi.mock('@ultranos/sync-engine', async (importActual) => ({
  ...(await importActual<typeof import('@ultranos/sync-engine')>()),
  resolveConflict: () => ({ strategy: 'LWW', winner: 'remote', conflictFlag: false, kept: [] }),
}))

import { pullPatientChanges } from '@/lib/sync-pull'

/** Decode the `sinceHlc` the pull sent to the Hub from the captured fetch URL. */
function sinceHlcFromFetch(fetchMock: ReturnType<typeof vi.fn>): string {
  const url = fetchMock.mock.calls[0]![0] as string
  const input = new URL(url).searchParams.get('input')!
  return JSON.parse(decodeURIComponent(input)).json.sinceHlc
}

describe('pullPatientChanges — watermark sanitization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resets a poisoned (ISO) watermark to 0 so real-HLC allergies are re-pulled', async () => {
    syncMetaGet.mockResolvedValue({ patientId: PID, lastPulledHlc: '2026-09-10T18:47:00.702+00', lastPulledAt: '' })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ result: { data: { json: { changes: [] } } } }),
    })
    global.fetch = fetchMock as unknown as typeof fetch

    await pullPatientChanges(PID, () => 'TESTTOKEN')

    expect(sinceHlcFromFetch(fetchMock)).toBe('0')
  })

  it('preserves a valid serialized HLC watermark (normal incremental pull)', async () => {
    const validHlc = '001789061426724:00000:c1787aa1-be03-41c5-b774-deddf650991f'
    syncMetaGet.mockResolvedValue({ patientId: PID, lastPulledHlc: validHlc, lastPulledAt: '' })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ result: { data: { json: { changes: [] } } } }),
    })
    global.fetch = fetchMock as unknown as typeof fetch

    await pullPatientChanges(PID, () => 'TESTTOKEN')

    expect(sinceHlcFromFetch(fetchMock)).toBe(validHlc)
  })
})
