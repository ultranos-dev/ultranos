/**
 * Tests for hydrateSamplesFromHub (Deliverable 3).
 *
 * Strategy: mock `@/lib/trpc` (pullSpecimens) and `@/lib/db` (getDb) rather
 * than using a real Dexie/IndexedDB instance, keeping tests fast and
 * environment-agnostic (jsdom has no real IDB).
 *
 * Newer-wins: uses compareHlc / deserializeHlc from @ultranos/sync-engine
 * (resolved to packages/sync-engine/src/index.ts by vitest alias).
 * The HLC format is "{wallMs:15digits}:{counter:5digits}:{nodeId}".
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── HLC fixtures ─────────────────────────────────────────────────────────────
const HLC_OLDER  = '000000000009000:00000:nodeA'   // wallMs 9 000
const HLC_BASE   = '000000000010000:00000:nodeA'   // wallMs 10 000  (hub / default)
const HLC_NEWER  = '000000000011000:00000:nodeA'   // wallMs 11 000  (local, should not be clobbered)

// ── DTO fixtures ──────────────────────────────────────────────────────────────
const SPEC_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const baseDto = {
  id: SPEC_ID,
  labSampleId: 'LAB-20260914-0001',
  pipelineStatus: 'received' as const,
  fhirStatus: 'available',
  specimenType: 'blood',
  subjectReference: 'Patient/hmac-patient1',
  serviceRequestRef: 'ServiceRequest/order-abc',
  receivedFrom: 'Practitioner/courier-1',
  receivedTime: '2026-09-14T09:00:00.000Z',
  condition: 'acceptable',
  hlcTimestamp: HLC_BASE,
}

// ── DB mock setup ─────────────────────────────────────────────────────────────
const mockSamplesGet  = vi.fn()
const mockSamplesPut  = vi.fn().mockResolvedValue(undefined)
const mockSamplesDb   = {
  samples: {
    get: mockSamplesGet,
    put: mockSamplesPut,
  },
}

vi.mock('@/lib/db', () => ({
  getDb: () => mockSamplesDb,
}))

// ── tRPC mock setup ───────────────────────────────────────────────────────────
const mockPullSpecimens = vi.fn()
vi.mock('@/lib/trpc', () => ({
  pullSpecimens: mockPullSpecimens,
  getHubApiUrl: () => 'http://hub',
}))

// Import SUT after mocks are registered
const { hydrateSamplesFromHub } = await import('../lib/specimen-hydrate')

const getToken = async () => 'test-token'

// ─────────────────────────────────────────────────────────────────────────────

describe('hydrateSamplesFromHub', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset implementations too (clearAllMocks only clears call counts, not return values)
    mockSamplesGet.mockReset()
    mockSamplesPut.mockReset()
    mockPullSpecimens.mockReset()
    // Default: no local specimen exists (absent → upsert unconditionally)
    mockSamplesGet.mockResolvedValue(undefined)
    // Default: db.put succeeds
    mockSamplesPut.mockResolvedValue(undefined)
    // Default: hub returns one specimen
    mockPullSpecimens.mockResolvedValue({ specimens: [baseDto] })
  })

  // ── DTO → FhirSpecimen mapping ────────────────────────────────────────────

  it('maps subjectReference into subject.reference', async () => {
    await hydrateSamplesFromHub(getToken)
    const putArg = mockSamplesPut.mock.calls[0]?.[0]
    expect(putArg.subject.reference).toBe('Patient/hmac-patient1')
  })

  it('maps serviceRequestRef into request[0].reference', async () => {
    await hydrateSamplesFromHub(getToken)
    const putArg = mockSamplesPut.mock.calls[0]?.[0]
    expect(putArg.request?.[0]?.reference).toBe('ServiceRequest/order-abc')
  })

  it('maps specimenType into type.coding[0].code and display', async () => {
    await hydrateSamplesFromHub(getToken)
    const putArg = mockSamplesPut.mock.calls[0]?.[0]
    expect(putArg.type?.coding?.[0]?.code).toBe('blood')
    expect(putArg.type?.coding?.[0]?.display).toBe('blood')
  })

  it('maps _ultranos fields correctly', async () => {
    await hydrateSamplesFromHub(getToken)
    const putArg = mockSamplesPut.mock.calls[0]?.[0]
    expect(putArg._ultranos.labSampleId).toBe('LAB-20260914-0001')
    expect(putArg._ultranos.pipelineStatus).toBe('received')
    expect(putArg._ultranos.sampleCondition).toBe('acceptable')
    expect(putArg._ultranos.hlcTimestamp).toBe(HLC_BASE)
    expect(putArg._ultranos.isOfflineCreated).toBe(false)
  })

  it('sets resourceType to Specimen', async () => {
    await hydrateSamplesFromHub(getToken)
    const putArg = mockSamplesPut.mock.calls[0]?.[0]
    expect(putArg.resourceType).toBe('Specimen')
  })

  it('returns the count of actually hydrated specimens', async () => {
    const result = await hydrateSamplesFromHub(getToken)
    expect(result.hydrated).toBe(1)
  })

  // ── Absent specimen → always upsert ──────────────────────────────────────

  it('puts an absent specimen into the db', async () => {
    mockSamplesGet.mockResolvedValue(undefined)
    await hydrateSamplesFromHub(getToken)
    expect(mockSamplesPut).toHaveBeenCalledOnce()
    expect(mockSamplesPut.mock.calls[0]?.[0]?.id).toBe(SPEC_ID)
  })

  // ── Newer-wins: do NOT overwrite a newer local specimen ───────────────────

  it('does NOT overwrite a local specimen whose local hlc is newer than hub hlc', async () => {
    // Local has HLC_NEWER (wallMs 11000); hub sends HLC_BASE (wallMs 10000) → skip
    mockSamplesGet.mockResolvedValue({
      id: SPEC_ID,
      _ultranos: { hlcTimestamp: HLC_NEWER },
    })
    // Hub sends an older HLC
    mockPullSpecimens.mockResolvedValue({
      specimens: [{ ...baseDto, hlcTimestamp: HLC_BASE }],
    })
    const result = await hydrateSamplesFromHub(getToken)
    expect(mockSamplesPut).not.toHaveBeenCalled()
    expect(result.hydrated).toBe(0)
  })

  it('does NOT overwrite when hub hlc equals local hlc (equal = local wins)', async () => {
    mockSamplesGet.mockResolvedValue({
      id: SPEC_ID,
      _ultranos: { hlcTimestamp: HLC_BASE },
    })
    mockPullSpecimens.mockResolvedValue({
      specimens: [{ ...baseDto, hlcTimestamp: HLC_BASE }],
    })
    const result = await hydrateSamplesFromHub(getToken)
    expect(mockSamplesPut).not.toHaveBeenCalled()
    expect(result.hydrated).toBe(0)
  })

  // ── Newer-wins: DO overwrite when hub is newer ────────────────────────────

  it('overwrites when hub hlc is strictly newer than local hlc', async () => {
    // Local has HLC_OLDER (wallMs 9000); hub sends HLC_BASE (wallMs 10000) → overwrite
    mockSamplesGet.mockResolvedValue({
      id: SPEC_ID,
      _ultranos: { hlcTimestamp: HLC_OLDER },
    })
    mockPullSpecimens.mockResolvedValue({
      specimens: [{ ...baseDto, hlcTimestamp: HLC_BASE }],
    })
    const result = await hydrateSamplesFromHub(getToken)
    expect(mockSamplesPut).toHaveBeenCalledOnce()
    expect(result.hydrated).toBe(1)
  })

  // ── Optional fields ────────────────────────────────────────────────────────

  it('handles missing serviceRequestRef gracefully (request becomes undefined)', async () => {
    const dtoNoReq = { ...baseDto, serviceRequestRef: undefined }
    mockPullSpecimens.mockResolvedValue({ specimens: [dtoNoReq] })
    await hydrateSamplesFromHub(getToken)
    const putArg = mockSamplesPut.mock.calls[0]?.[0]
    expect(putArg.request).toBeUndefined()
  })

  it('handles missing receivedFrom gracefully (collection becomes undefined)', async () => {
    const dtoNoFrom = { ...baseDto, receivedFrom: undefined }
    mockPullSpecimens.mockResolvedValue({ specimens: [dtoNoFrom] })
    await hydrateSamplesFromHub(getToken)
    const putArg = mockSamplesPut.mock.calls[0]?.[0]
    expect(putArg.collection).toBeUndefined()
  })

  // ── Resilience: never throws ───────────────────────────────────────────────

  it('returns { hydrated: 0 } and never throws when pullSpecimens rejects (offline-safe)', async () => {
    mockPullSpecimens.mockRejectedValue(new Error('network error'))
    const result = await hydrateSamplesFromHub(getToken)
    expect(result).toEqual({ hydrated: 0 })
    expect(mockSamplesPut).not.toHaveBeenCalled()
  })

  it('returns { hydrated: 0 } and never throws when db.put rejects', async () => {
    mockSamplesPut.mockRejectedValue(new Error('db error'))
    const result = await hydrateSamplesFromHub(getToken)
    expect(result).toEqual({ hydrated: 0 })
  })

  it('returns { hydrated: 0 } and never throws when getToken rejects', async () => {
    const failToken = async (): Promise<string> => { throw new Error('no session') }
    const result = await hydrateSamplesFromHub(failToken)
    expect(result).toEqual({ hydrated: 0 })
  })

  // ── Unparseable HLC guard ──────────────────────────────────────────────────

  it('still upserts when local hlc is unparseable (guard against bad stored data)', async () => {
    mockSamplesGet.mockResolvedValue({
      id: SPEC_ID,
      _ultranos: { hlcTimestamp: 'not-valid-hlc' },
    })
    mockPullSpecimens.mockResolvedValue({ specimens: [baseDto] })
    const result = await hydrateSamplesFromHub(getToken)
    // Guard: if local HLC can't be parsed we conservatively upsert (hub data is valid)
    expect(mockSamplesPut).toHaveBeenCalledOnce()
    expect(result.hydrated).toBe(1)
  })
})
