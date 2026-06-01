// @vitest-environment node

/**
 * Transport Manifest Tests — Story 54.3 Task 5
 *
 * Covers story 13.3 spec requirements:
 *  1. Manifest content — correct sessionId, courierId, originName, destinationName, sampleCount
 *  2. Sample entries — each sample appears with its labSampleId and sampleType (display name)
 *  3. PHI exclusion — manifest samples contain ONLY labSampleId + sampleType, no PHI
 *  4. expectedArrival with estimatedTransitMinutes — valid ISO date string
 *  5. expectedArrival null — when estimatedTransitMinutes is null
 *  6. Unknown sample type — when specimen has no type display, sampleType is 'Unknown'
 *  7. renderManifestText — output contains required fields and each labSampleId
 *  8. reportManifestGenerated — calls reportTransportAuditEvent with correct action
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FhirSpecimen } from '@ultranos/shared-types'
import type { TransportSession } from '../types/transport'
import type { LabLocation } from '../types/lab-network'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../lib/audit-client', () => ({
  reportTransportAuditEvent: vi.fn(),
}))

vi.mock('../lib/hlc', () => ({
  hlc: { now: vi.fn(() => ({ wallTime: 0, logicalTime: 0, nodeId: 'test' })) },
  serializeHlc: vi.fn(() => '2026-05-31T00:00:00Z:0:test'),
}))

vi.mock('../stores/auth-session-store', () => ({
  useAuthSessionStore: { getState: vi.fn(() => ({ session: null })) },
}))

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { generateManifest, renderManifestText, reportManifestGenerated } from '../lib/transport-manifest'
import { reportTransportAuditEvent } from '../lib/audit-client'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PICKUP_TIMESTAMP = '2026-05-31T08:00:00.000Z'

function makeSession(overrides: Partial<TransportSession> = {}): TransportSession {
  return {
    id: 'session-abc-123',
    courierId: 'courier-xyz-456',
    originLocationId: 'loc-origin-001',
    destinationLocationId: 'loc-dest-002',
    status: 'in-transit',
    pickupTimestamp: PICKUP_TIMESTAMP,
    deliveryTimestamp: null,
    pickupTemperature: 22,
    deliveryTemperature: null,
    sampleIds: ['specimen-001', 'specimen-002'],
    sampleCount: 2,
    conditionAtDelivery: null,
    flags: [],
    estimatedTransitMinutes: 45,
    meta: { lastUpdated: PICKUP_TIMESTAMP, versionId: '1' },
    _ultranos: { createdAt: PICKUP_TIMESTAMP, syncStatus: 'pending' },
    ...overrides,
  }
}

function makeSpecimen(labSampleId: string, typeDisplay?: string): FhirSpecimen {
  return {
    resourceType: 'Specimen',
    id: `specimen-${labSampleId}`,
    _ultranos: { labSampleId, pipelineStatus: 'accessioned' },
    ...(typeDisplay
      ? { type: { coding: [{ display: typeDisplay }] } }
      : {}),
  } as unknown as FhirSpecimen
}

const ORIGIN_LOCATION: LabLocation = {
  id: 'loc-origin-001',
  name: 'Kabul Main Lab',
  type: 'main',
  mode: 'full',
  status: 'active',
  settings: {},
  meta: { lastUpdated: PICKUP_TIMESTAMP, versionId: '1' },
  _ultranos: { createdAt: PICKUP_TIMESTAMP, hlcTimestamp: '000001' },
}

const DESTINATION_LOCATION: LabLocation = {
  id: 'loc-dest-002',
  name: 'Paghman Satellite',
  type: 'satellite',
  mode: 'collection-only',
  status: 'active',
  settings: {},
  meta: { lastUpdated: PICKUP_TIMESTAMP, versionId: '1' },
  _ultranos: { createdAt: PICKUP_TIMESTAMP, hlcTimestamp: '000002' },
}

const LOCATIONS = { origin: ORIGIN_LOCATION, destination: DESTINATION_LOCATION }

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('generateManifest', () => {
  it('generates manifest with correct sessionId, courierId, originName, destinationName, sampleCount', () => {
    const session = makeSession()
    const specimens = [
      makeSpecimen('L2026-001', 'Blood'),
      makeSpecimen('L2026-002', 'Urine'),
    ]

    const manifest = generateManifest(session, specimens, LOCATIONS)

    expect(manifest.sessionId).toBe('session-abc-123')
    expect(manifest.courierId).toBe('courier-xyz-456')
    expect(manifest.originName).toBe('Kabul Main Lab')
    expect(manifest.destinationName).toBe('Paghman Satellite')
    expect(manifest.sampleCount).toBe(2)
  })

  it('includes each sample with its labSampleId and sampleType display name', () => {
    const session = makeSession()
    const specimens = [
      makeSpecimen('L2026-001', 'Blood'),
      makeSpecimen('L2026-002', 'Urine'),
    ]

    const manifest = generateManifest(session, specimens, LOCATIONS)

    expect(manifest.samples).toHaveLength(2)
    expect(manifest.samples[0]).toEqual({ labSampleId: 'L2026-001', sampleType: 'Blood' })
    expect(manifest.samples[1]).toEqual({ labSampleId: 'L2026-002', sampleType: 'Urine' })
  })

  it('excludes PHI — manifest sample entries contain ONLY labSampleId and sampleType', () => {
    const session = makeSession()
    const specimens = [makeSpecimen('L2026-001', 'Blood')]

    const manifest = generateManifest(session, specimens, LOCATIONS)

    // Each sample entry must have exactly two keys: labSampleId and sampleType
    for (const entry of manifest.samples) {
      const keys = Object.keys(entry)
      expect(keys).toHaveLength(2)
      expect(keys).toContain('labSampleId')
      expect(keys).toContain('sampleType')
      // Must NOT contain patient reference or any PHI field
      expect(keys).not.toContain('subject')
      expect(keys).not.toContain('patientRef')
      expect(keys).not.toContain('patientName')
      expect(keys).not.toContain('diagnosis')
    }
  })

  it('computes expectedArrival as ISO string when estimatedTransitMinutes is set', () => {
    const session = makeSession({ estimatedTransitMinutes: 45 })
    const specimens = [makeSpecimen('L2026-001', 'Blood')]

    const manifest = generateManifest(session, specimens, LOCATIONS)

    expect(manifest.expectedArrival).not.toBeNull()
    // Validate it is a parseable ISO 8601 date
    const parsed = new Date(manifest.expectedArrival!)
    expect(Number.isNaN(parsed.getTime())).toBe(false)
    // Arrival should be 45 minutes after pickup
    const pickupMs = new Date(PICKUP_TIMESTAMP).getTime()
    expect(parsed.getTime()).toBe(pickupMs + 45 * 60 * 1000)
  })

  it('sets expectedArrival to null when estimatedTransitMinutes is null', () => {
    const session = makeSession({ estimatedTransitMinutes: null })
    const specimens = [makeSpecimen('L2026-001', 'Blood')]

    const manifest = generateManifest(session, specimens, LOCATIONS)

    expect(manifest.expectedArrival).toBeNull()
  })

  it("falls back to 'Unknown' when specimen has no type coding display", () => {
    const session = makeSession({ sampleCount: 1 })
    // makeSpecimen with no typeDisplay omits the type property entirely
    const specimens = [makeSpecimen('L2026-003')]

    const manifest = generateManifest(session, specimens, LOCATIONS)

    expect(manifest.samples[0].sampleType).toBe('Unknown')
  })

  it("falls back to 'Unknown' when type.coding array is empty", () => {
    const session = makeSession({ sampleCount: 1 })
    const specimen = {
      resourceType: 'Specimen',
      id: 'specimen-L2026-004',
      _ultranos: { labSampleId: 'L2026-004', pipelineStatus: 'accessioned' },
      type: { coding: [] },
    } as unknown as FhirSpecimen

    const manifest = generateManifest(session, [specimen], LOCATIONS)

    expect(manifest.samples[0].sampleType).toBe('Unknown')
  })

  it('uses raw session.pickupTimestamp in the manifest unchanged', () => {
    const session = makeSession()
    const specimens = [makeSpecimen('L2026-001', 'Blood')]

    const manifest = generateManifest(session, specimens, LOCATIONS)

    expect(manifest.pickupTimestamp).toBe(PICKUP_TIMESTAMP)
  })
})

describe('renderManifestText', () => {
  it('contains transport ID, courier ID, origin, destination, and sample count header', () => {
    const session = makeSession()
    const specimens = [
      makeSpecimen('L2026-001', 'Blood'),
      makeSpecimen('L2026-002', 'Urine'),
    ]
    const manifest = generateManifest(session, specimens, LOCATIONS)
    const text = renderManifestText(manifest)

    expect(text).toContain('SAMPLE TRANSPORT MANIFEST')
    expect(text).toContain('session-abc-123')
    expect(text).toContain('courier-xyz-456')
    expect(text).toContain('Kabul Main Lab')
    expect(text).toContain('Paghman Satellite')
    expect(text).toContain('2 total')
  })

  it('includes each labSampleId in the rendered text', () => {
    const session = makeSession()
    const specimens = [
      makeSpecimen('L2026-001', 'Blood'),
      makeSpecimen('L2026-002', 'Urine'),
    ]
    const manifest = generateManifest(session, specimens, LOCATIONS)
    const text = renderManifestText(manifest)

    expect(text).toContain('L2026-001')
    expect(text).toContain('L2026-002')
  })

  it('shows "Unknown" in the text when expectedArrival is null', () => {
    const session = makeSession({ estimatedTransitMinutes: null })
    const specimens = [makeSpecimen('L2026-001', 'Blood')]
    const manifest = generateManifest(session, specimens, LOCATIONS)
    const text = renderManifestText(manifest)

    expect(text).toContain('Est. Arrival: Unknown')
  })

  it('shows expectedArrival ISO string when it is available', () => {
    const session = makeSession({ estimatedTransitMinutes: 30 })
    const specimens = [makeSpecimen('L2026-001', 'Blood')]
    const manifest = generateManifest(session, specimens, LOCATIONS)
    const text = renderManifestText(manifest)

    expect(text).toContain('Est. Arrival:')
    expect(text).not.toContain('Est. Arrival: Unknown')
  })
})

describe('reportManifestGenerated', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls reportTransportAuditEvent with action TRANSPORT_MANIFEST_GENERATED', () => {
    reportManifestGenerated('session-abc-123', 'courier-xyz-456', 3)

    expect(reportTransportAuditEvent).toHaveBeenCalledOnce()
    expect(reportTransportAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'TRANSPORT_MANIFEST_GENERATED',
        transportSessionId: 'session-abc-123',
        courierId: 'courier-xyz-456',
        sampleCount: 3,
      }),
    )
  })
})
