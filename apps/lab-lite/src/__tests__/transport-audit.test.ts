/**
 * Transport Audit Event Assertion Tests — Story 54.3 spec 13.7
 *
 * Verifies that every transport operation emits the correct audit events
 * with the required payload fields.
 *
 * PHI guard: No patient names, IDs, or diagnoses in any test assertion.
 * Audit payloads contain only opaque IDs, counts, and event type labels.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — registered before any module imports
// ---------------------------------------------------------------------------

vi.mock('@/lib/db', () => ({
  createTransportSession: vi.fn(),
  getTransportSession: vi.fn(),
  updateTransportSession: vi.fn(),
  getActiveTransports: vi.fn(),
  getTransportsByCourier: vi.fn(),
  getDb: vi.fn(() => ({
    custody_events: { put: vi.fn() },
    samples: { get: vi.fn(() => undefined), update: vi.fn(), bulkGet: vi.fn(() => []) },
  })),
}))

vi.mock('@/lib/audit-client', () => ({
  reportTransportAuditEvent: vi.fn(),
}))

vi.mock('uuid', () => ({ v4: () => 'mock-uuid' }))

vi.mock('@/lib/hlc', () => ({
  hlc: { now: () => ({ ts: Date.now(), c: 0, id: 'test' }) },
  serializeHlc: () => new Date().toISOString(),
}))

// ---------------------------------------------------------------------------
// Imports (after mocks are registered)
// ---------------------------------------------------------------------------

import { startTransport, recordDelivery } from '@/lib/transport-service'
import { reportTransportAuditEvent } from '@/lib/audit-client'
import {
  createTransportSession,
  getTransportSession,
  updateTransportSession,
  getDb,
} from '@/lib/db'
import type { StartTransportInput, TransportSession } from '@/types/transport'

// ---------------------------------------------------------------------------
// Typed mock references
// ---------------------------------------------------------------------------

const mockCreateTransportSession = vi.mocked(createTransportSession)
const mockGetTransportSession = vi.mocked(getTransportSession)
const mockUpdateTransportSession = vi.mocked(updateTransportSession)
const mockReportTransportAuditEvent = vi.mocked(reportTransportAuditEvent)

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeSession(overrides: Partial<TransportSession> = {}): TransportSession {
  return {
    id: 'session-1',
    courierId: 'courier-1',
    originLocationId: 'loc-origin',
    destinationLocationId: 'loc-dest',
    status: 'in-transit',
    pickupTimestamp: new Date().toISOString(),
    deliveryTimestamp: null,
    pickupTemperature: null,
    deliveryTemperature: null,
    sampleIds: ['sample-1', 'sample-2'],
    sampleCount: 2,
    conditionAtDelivery: null,
    flags: [],
    estimatedTransitMinutes: null,
    meta: { lastUpdated: new Date().toISOString(), versionId: '1' },
    _ultranos: { createdAt: new Date().toISOString(), syncStatus: 'pending' },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// beforeEach — reset all mocks to clean defaults
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  mockCreateTransportSession.mockResolvedValue(undefined)
  mockGetTransportSession.mockResolvedValue(undefined)
  mockUpdateTransportSession.mockResolvedValue(undefined)

  const mockGetDb = vi.mocked(getDb)
  mockGetDb.mockReturnValue({
    custody_events: { put: vi.fn().mockResolvedValue(undefined) },
    samples: {
      get: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      bulkGet: vi.fn().mockResolvedValue([]),
    },
  } as never)
})

// ---------------------------------------------------------------------------
// Story 13.7 — Audit event emission assertions
// ---------------------------------------------------------------------------

describe('transport audit event emission (story 13.7)', () => {
  it('emits TRANSPORT_STARTED audit event when transport is started', async () => {
    mockCreateTransportSession.mockResolvedValue(undefined)

    const input: StartTransportInput = {
      courierId: 'courier-1',
      originLocationId: 'loc-1',
      destinationLocationId: 'loc-2',
      sampleIds: ['s-1', 's-2'],
    }

    await startTransport(input)

    expect(mockReportTransportAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'TRANSPORT_STARTED',
        courierId: 'courier-1',
        sampleCount: 2,
      }),
    )
  })

  it('emits TRANSPORT_DELIVERED audit event when delivery is recorded', async () => {
    const session = makeSession()
    mockGetTransportSession.mockResolvedValue(session)
    mockUpdateTransportSession.mockResolvedValue(undefined)

    await recordDelivery('session-1', { conditionAtDelivery: 'acceptable' })

    expect(mockReportTransportAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'TRANSPORT_DELIVERED',
      }),
    )
  })

  it('emits TRANSPORT_STABILITY_FLAG when samples exceed stability window', async () => {
    // Blood sample 7 hours in transit (stability window = 6 h)
    const pickupTimestamp = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString()
    const session = makeSession({ pickupTimestamp, sampleIds: ['s-blood'] })
    mockGetTransportSession.mockResolvedValue(session)
    mockUpdateTransportSession.mockResolvedValue(undefined)

    // Return a blood specimen from bulkGet so stability-monitor can classify it
    const mockGetDb = vi.mocked(getDb)
    mockGetDb.mockReturnValue({
      custody_events: { put: vi.fn().mockResolvedValue(undefined) },
      samples: {
        get: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
        bulkGet: vi.fn().mockResolvedValue([
          {
            id: 's-blood',
            resourceType: 'Specimen',
            status: 'available',
            subject: { reference: 'Patient/opaque-1' },
            receivedTime: new Date().toISOString(),
            type: { coding: [{ display: 'Whole Blood' }] },
            meta: { lastUpdated: new Date().toISOString(), versionId: '1' },
            _ultranos: {
              labSampleId: 'L2026-001',
              pipelineStatus: 'received',
              hlcTimestamp: new Date().toISOString(),
              createdAt: new Date().toISOString(),
              isOfflineCreated: false,
              sampleCondition: 'acceptable',
            },
          },
        ]),
      },
    } as never)

    await recordDelivery('session-1', { conditionAtDelivery: 'acceptable' })

    expect(mockReportTransportAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'TRANSPORT_STABILITY_FLAG',
        flagCount: 1,
      }),
    )
  })

  it('TRANSPORT_STARTED audit payload includes transportSessionId and courierId', async () => {
    mockCreateTransportSession.mockResolvedValue(undefined)

    await startTransport({
      courierId: 'COURIER-ABC',
      originLocationId: 'loc-a',
      destinationLocationId: 'loc-b',
      sampleIds: ['s-x'],
    })

    const call = mockReportTransportAuditEvent.mock.calls[0][0]
    expect(call.transportSessionId).toBeTruthy()
    expect(call.courierId).toBe('COURIER-ABC')
  })
})
