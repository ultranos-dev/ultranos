/**
 * Transport Service tests — Story 54.3: Courier & Sample Transport Tracking
 *
 * Mock strategy:
 *   - @/lib/db: fully mocked (all CRUD helpers + getDb())
 *   - @/lib/audit-client: mocked (reportTransportAuditEvent)
 *   - uuid: mocked to return deterministic 'mock-uuid'
 *   - @/lib/hlc: mocked to return deterministic timestamps
 *   - @/lib/stability-monitor: NOT mocked — real implementation used for AC 3/4
 *
 * PHI guard: No patient names, IDs, or diagnoses appear in any test assertion.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockCustodyEventsPut = vi.fn()
const mockSamplesGet = vi.fn()
const mockSamplesUpdate = vi.fn()
const mockSamplesBulkGet = vi.fn()

vi.mock('@/lib/db', () => ({
  createTransportSession: vi.fn(),
  getTransportSession: vi.fn(),
  updateTransportSession: vi.fn(),
  getActiveTransports: vi.fn(),
  getTransportsByCourier: vi.fn(),
  getDb: vi.fn(() => ({
    custody_events: { put: mockCustodyEventsPut },
    samples: {
      get: mockSamplesGet,
      update: mockSamplesUpdate,
      bulkGet: mockSamplesBulkGet,
    },
  })),
}))

vi.mock('@/lib/audit-client', () => ({
  reportTransportAuditEvent: vi.fn(),
}))

vi.mock('uuid', () => ({ v4: () => 'mock-uuid' }))

vi.mock('@/lib/hlc', () => ({
  hlc: { now: () => ({ ts: Date.now(), c: 0, id: 'test' }) },
  serializeHlc: (_hlcVal: object) => new Date().toISOString(),
}))

// ---------------------------------------------------------------------------
// Imports (after mocks are registered)
// ---------------------------------------------------------------------------

import {
  createTransportSession,
  getTransportSession,
  updateTransportSession,
  getTransportsByCourier,
} from '@/lib/db'
import { reportTransportAuditEvent } from '@/lib/audit-client'
import {
  startTransport,
  recordDelivery,
  attachPreAnalyticalFlag,
  getActiveTransportsForCourier,
} from '@/lib/transport-service'
import type { TransportSession, TransportFlag, StartTransportInput } from '@/types/transport'
import type { FhirSpecimen } from '@ultranos/shared-types'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeStartInput(overrides: Partial<StartTransportInput> = {}): StartTransportInput {
  return {
    courierId: 'courier-001',
    originLocationId: 'loc-origin',
    destinationLocationId: 'loc-dest',
    sampleIds: ['sample-001', 'sample-002'],
    ...overrides,
  }
}

function makeSession(overrides: Partial<TransportSession> = {}): TransportSession {
  return {
    id: 'session-001',
    courierId: 'courier-001',
    originLocationId: 'loc-origin',
    destinationLocationId: 'loc-dest',
    status: 'in-transit',
    pickupTimestamp: new Date().toISOString(),
    deliveryTimestamp: null,
    pickupTemperature: null,
    deliveryTemperature: null,
    sampleIds: ['sample-001', 'sample-002'],
    sampleCount: 2,
    conditionAtDelivery: null,
    flags: [],
    estimatedTransitMinutes: null,
    meta: { lastUpdated: new Date().toISOString(), versionId: '1' },
    _ultranos: { createdAt: new Date().toISOString(), syncStatus: 'pending' },
    ...overrides,
  }
}

/**
 * Build a minimal FhirSpecimen that satisfies the stability-monitor type contract.
 * sampleType is used by mapSampleTypeToCategory() via type.coding[0].display.
 */
function makeSpecimen(id: string, labSampleId: string, sampleTypeDisplay: string): FhirSpecimen {
  return {
    resourceType: 'Specimen',
    id,
    status: 'available',
    type: {
      coding: [{ system: 'http://snomed.info/sct', code: '12345', display: sampleTypeDisplay }],
    },
    subject: { reference: 'Patient/patient-001' },
    collection: {
      collectedDateTime: new Date().toISOString(),
    },
    _ultranos: {
      labSampleId,
      pipelineStatus: 'received',
      collectionMethod: 'venipuncture',
      createdAt: new Date().toISOString(),
      syncStatus: 'pending',
    },
  } as unknown as FhirSpecimen
}

// ---------------------------------------------------------------------------
// beforeEach
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  mockCustodyEventsPut.mockResolvedValue(undefined)
  mockSamplesGet.mockResolvedValue(undefined)
  mockSamplesUpdate.mockResolvedValue(undefined)
  mockSamplesBulkGet.mockResolvedValue([])
  vi.mocked(createTransportSession).mockResolvedValue(undefined)
  vi.mocked(getTransportSession).mockResolvedValue(undefined)
  vi.mocked(updateTransportSession).mockResolvedValue(undefined)
  vi.mocked(getTransportsByCourier).mockResolvedValue([])
})

// ---------------------------------------------------------------------------
// startTransport
// ---------------------------------------------------------------------------

describe('startTransport', () => {
  it('creates session with correct fields and saves to db', async () => {
    const input = makeStartInput()
    const session = await startTransport(input)

    expect(session.id).toBe('mock-uuid')
    expect(session.courierId).toBe('courier-001')
    expect(session.originLocationId).toBe('loc-origin')
    expect(session.destinationLocationId).toBe('loc-dest')
    expect(session.status).toBe('in-transit')
    expect(session.sampleIds).toEqual(['sample-001', 'sample-002'])
    expect(session.sampleCount).toBe(2)
    expect(session.deliveryTimestamp).toBeNull()
    expect(session.conditionAtDelivery).toBeNull()
    expect(session.flags).toEqual([])

    expect(createTransportSession).toHaveBeenCalledWith(expect.objectContaining({
      id: 'mock-uuid',
      status: 'in-transit',
      courierId: 'courier-001',
    }))
  })

  it('creates one custody event per sample with transport-pickup eventType', async () => {
    const input = makeStartInput({ sampleIds: ['sample-001', 'sample-002', 'sample-003'] })
    await startTransport(input)

    // 3 samples → 3 custody events
    expect(mockCustodyEventsPut).toHaveBeenCalledTimes(3)

    const firstCall = mockCustodyEventsPut.mock.calls[0][0]
    expect(firstCall.eventType).toBe('transport-pickup')
    expect(firstCall.fromActorId).toBe('courier-001')
    expect(firstCall.toActorId).toBe('courier-001')
    expect(firstCall.location).toBe('loc-origin')
    expect(firstCall.transportSessionId).toBe('mock-uuid')
  })

  it('emits TRANSPORT_STARTED audit event with correct sampleCount', async () => {
    const input = makeStartInput()
    await startTransport(input)

    expect(reportTransportAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'TRANSPORT_STARTED',
      transportSessionId: 'mock-uuid',
      courierId: 'courier-001',
      sampleCount: 2,
    }))
  })

  it('propagates pickupTemperature to custody events when provided', async () => {
    const input = makeStartInput({ pickupTemperature: 4.5 })
    await startTransport(input)

    const firstCallArgs = mockCustodyEventsPut.mock.calls[0][0]
    expect(firstCallArgs.temperature).toBe(4.5)
  })

  it('sets temperature to undefined in custody events when pickupTemperature is omitted', async () => {
    const input = makeStartInput() // no pickupTemperature
    await startTransport(input)

    const firstCallArgs = mockCustodyEventsPut.mock.calls[0][0]
    expect(firstCallArgs.temperature).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// recordDelivery — clean delivery
// ---------------------------------------------------------------------------

describe('recordDelivery — clean delivery', () => {
  it('updates session to delivered, creates delivery custody events, emits TRANSPORT_DELIVERED, no flags', async () => {
    const session = makeSession()
    vi.mocked(getTransportSession).mockResolvedValue(session)
    // No specimens loaded — stability check returns no flags
    mockSamplesBulkGet.mockResolvedValue([])

    const result = await recordDelivery('session-001', {
      deliveryTemperature: 22,
      conditionAtDelivery: 'acceptable',
    })

    // Session status should be 'delivered' (no flags generated)
    expect(result.status).toBe('delivered')
    expect(result.flags).toEqual([])
    expect(result.conditionAtDelivery).toBe('acceptable')

    expect(updateTransportSession).toHaveBeenCalledWith(
      'session-001',
      expect.objectContaining({ status: 'delivered', conditionAtDelivery: 'acceptable' }),
    )

    // 2 samples → 2 delivery custody events
    expect(mockCustodyEventsPut).toHaveBeenCalledTimes(2)
    const firstEvent = mockCustodyEventsPut.mock.calls[0][0]
    expect(firstEvent.eventType).toBe('transport-delivery')
    expect(firstEvent.temperature).toBe(22)
    expect(firstEvent.location).toBe('loc-dest')

    expect(reportTransportAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'TRANSPORT_DELIVERED', sampleCount: 2 }),
    )
    // No stability flag audit event
    expect(reportTransportAuditEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'TRANSPORT_STABILITY_FLAG' }),
    )
  })
})

// ---------------------------------------------------------------------------
// recordDelivery — stability exceeded
// ---------------------------------------------------------------------------

describe('recordDelivery — stability exceeded', () => {
  it('flags session when blood sample has been in transit longer than 6-hour stability window', async () => {
    // pickupTimestamp 7 hours ago — blood window is 6h → stability-exceeded
    const pickupTimestamp = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString()
    const session = makeSession({
      pickupTimestamp,
      sampleIds: ['sample-blood'],
      sampleCount: 1,
    })
    vi.mocked(getTransportSession).mockResolvedValue(session)

    const bloodSpecimen = makeSpecimen('sample-blood', 'LAB-2026-001', 'Blood')
    mockSamplesBulkGet.mockResolvedValue([bloodSpecimen])
    // For attachPreAnalyticalFlag — specimen found in db
    mockSamplesGet.mockResolvedValue(bloodSpecimen)

    const result = await recordDelivery('session-001', {
      conditionAtDelivery: 'acceptable',
    })

    expect(result.status).toBe('flagged')
    expect(result.flags).toHaveLength(1)
    expect(result.flags[0].flagType).toBe('stability-exceeded')
    expect(result.flags[0].sampleId).toBe('sample-blood')
    expect(result.flags[0].labSampleId).toBe('LAB-2026-001')

    expect(reportTransportAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'TRANSPORT_STABILITY_FLAG',
        flagCount: 1,
        flagTypes: ['stability-exceeded'],
      }),
    )
    expect(reportTransportAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'TRANSPORT_DELIVERED' }),
    )
  })
})

// ---------------------------------------------------------------------------
// recordDelivery — session not found
// ---------------------------------------------------------------------------

describe('recordDelivery — session not found', () => {
  it('throws when session is not in the local db', async () => {
    vi.mocked(getTransportSession).mockResolvedValue(undefined)

    await expect(
      recordDelivery('nonexistent-session', { conditionAtDelivery: 'acceptable' }),
    ).rejects.toThrow('Transport session not found')
  })
})

// ---------------------------------------------------------------------------
// recordDelivery — temperature excursion condition
// ---------------------------------------------------------------------------

describe('recordDelivery — temperature excursion condition', () => {
  it('generates temperature-excursion flags when conditionAtDelivery is temperature-excursion', async () => {
    const session = makeSession({
      sampleIds: ['sample-a', 'sample-b'],
      sampleCount: 2,
    })
    vi.mocked(getTransportSession).mockResolvedValue(session)
    // No specimens returned by bulkGet (no stability flags from checkStabilityWindows)
    // but conditionAtDelivery still generates flags
    mockSamplesBulkGet.mockResolvedValue([])
    mockSamplesGet.mockResolvedValue(undefined) // offline tolerance

    const result = await recordDelivery('session-001', {
      conditionAtDelivery: 'temperature-excursion',
    })

    expect(result.status).toBe('flagged')
    // 2 samples → 2 temperature-excursion flags
    const tempFlags = result.flags.filter((f) => f.flagType === 'temperature-excursion')
    expect(tempFlags).toHaveLength(2)
    expect(tempFlags[0].sampleId).toBe('sample-a')
    expect(tempFlags[1].sampleId).toBe('sample-b')

    expect(reportTransportAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'TRANSPORT_STABILITY_FLAG',
        flagCount: 2,
        flagTypes: ['temperature-excursion'],
      }),
    )
  })
})

// ---------------------------------------------------------------------------
// attachPreAnalyticalFlag
// ---------------------------------------------------------------------------

describe('attachPreAnalyticalFlag', () => {
  it('appends flag to existing _ultranos.transportFlags array', async () => {
    const existingFlag: TransportFlag = {
      sampleId: 'sample-001',
      labSampleId: 'LAB-001',
      flagType: 'stability-exceeded',
      message: 'Previous flag',
      timestamp: new Date().toISOString(),
    }
    const specimen = makeSpecimen('sample-001', 'LAB-001', 'Blood')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(specimen._ultranos as any).transportFlags = [existingFlag]
    mockSamplesGet.mockResolvedValue(specimen)

    const newFlag: TransportFlag = {
      sampleId: 'sample-001',
      labSampleId: 'LAB-001',
      flagType: 'temperature-excursion',
      message: 'New flag',
      timestamp: new Date().toISOString(),
    }

    await attachPreAnalyticalFlag('sample-001', newFlag)

    expect(mockSamplesUpdate).toHaveBeenCalledWith(
      'sample-001',
      { '_ultranos.transportFlags': [existingFlag, newFlag] },
    )
  })

  it('initializes transportFlags array when specimen has none', async () => {
    const specimen = makeSpecimen('sample-001', 'LAB-001', 'Blood')
    mockSamplesGet.mockResolvedValue(specimen)

    const flag: TransportFlag = {
      sampleId: 'sample-001',
      labSampleId: 'LAB-001',
      flagType: 'stability-exceeded',
      message: 'First flag',
      timestamp: new Date().toISOString(),
    }

    await attachPreAnalyticalFlag('sample-001', flag)

    expect(mockSamplesUpdate).toHaveBeenCalledWith(
      'sample-001',
      { '_ultranos.transportFlags': [flag] },
    )
  })

  it('returns without throwing when specimen is not found (offline tolerance)', async () => {
    mockSamplesGet.mockResolvedValue(undefined)

    const flag: TransportFlag = {
      sampleId: 'sample-missing',
      labSampleId: 'LAB-999',
      flagType: 'stability-exceeded',
      message: 'Flag for missing specimen',
      timestamp: new Date().toISOString(),
    }

    // Must not throw
    await expect(attachPreAnalyticalFlag('sample-missing', flag)).resolves.toBeUndefined()
    expect(mockSamplesUpdate).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// getActiveTransportsForCourier
// ---------------------------------------------------------------------------

describe('getActiveTransportsForCourier', () => {
  it('returns only in-transit sessions for the given courier', async () => {
    const inTransit = makeSession({ id: 'session-active', status: 'in-transit' })
    const delivered = makeSession({ id: 'session-done', status: 'delivered' })
    const flagged = makeSession({ id: 'session-flagged', status: 'flagged' })
    vi.mocked(getTransportsByCourier).mockResolvedValue([inTransit, delivered, flagged])

    const result = await getActiveTransportsForCourier('courier-001')

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('session-active')
    expect(result[0].status).toBe('in-transit')

    expect(getTransportsByCourier).toHaveBeenCalledWith('courier-001')
  })

  it('returns empty array when courier has no in-transit sessions', async () => {
    vi.mocked(getTransportsByCourier).mockResolvedValue([])
    const result = await getActiveTransportsForCourier('courier-002')
    expect(result).toEqual([])
  })
})
