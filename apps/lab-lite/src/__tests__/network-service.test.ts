import { describe, it, expect, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'

// Mock db functions before importing network-service
vi.mock('../lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/db')>()
  return {
    ...actual,
    putLocation: vi.fn(),
    getLocationById: vi.fn(),
    getActiveLocations: vi.fn(),
    putNetworkSnapshot: vi.fn(),
    getNetworkSnapshot: vi.fn(),
  }
})

vi.mock('../lib/audit-client', () => ({
  reportNetworkAuditEvent: vi.fn(),
}))

vi.mock('../lib/hlc', () => ({
  hlc: { now: () => ({ wallMs: Date.now(), counter: 0, nodeId: 'test-node' }) },
  serializeHlc: vi.fn().mockReturnValue('mock-hlc-ts'),
}))

vi.mock('../stores/auth-session-store', () => ({
  useAuthSessionStore: {
    getState: () => ({ session: { practitionerId: 'tech-001', userId: 'user-001' } }),
  },
}))

import {
  addSatelliteLocation,
  updateLocation,
  deactivateLocation,
  setLocationMode,
  routeSampleToMainLab,
  routeResultToSatellite,
} from '../lib/network-service'
import { putLocation, getLocationById } from '../lib/db'
import { reportNetworkAuditEvent } from '../lib/audit-client'
import type { LabLocation } from '../types/lab-network'

const mockPutLocation = vi.mocked(putLocation)
const mockGetLocationById = vi.mocked(getLocationById)
const mockReportNetworkAuditEvent = vi.mocked(reportNetworkAuditEvent)

function makeLocation(overrides: Partial<LabLocation> = {}): LabLocation {
  const now = new Date().toISOString()
  return {
    id: 'loc-001',
    name: 'Main Lab',
    type: 'main',
    mode: 'full',
    status: 'active',
    settings: {},
    meta: { lastUpdated: now, versionId: '1' },
    _ultranos: { createdAt: now, hlcTimestamp: 'hlc-001' },
    ...overrides,
  }
}

describe('addSatelliteLocation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPutLocation.mockResolvedValue(undefined)
  })

  it('success path: creates location with correct fields, calls putLocation, emits audit event', async () => {
    const location = await addSatelliteLocation({
      name: 'Kabul Satellite',
      type: 'satellite',
      mode: 'collection-only',
      parentLabId: 'main-lab-001',
    })

    expect(location.name).toBe('Kabul Satellite')
    expect(location.type).toBe('satellite')
    expect(location.mode).toBe('collection-only')
    expect(location.status).toBe('active')
    expect(location.parentLabId).toBe('main-lab-001')
    expect(location.id).toBeDefined()
    expect(location.meta.lastUpdated).toBeDefined()
    expect(location._ultranos.createdAt).toBeDefined()
    expect(location._ultranos.hlcTimestamp).toBe('mock-hlc-ts')

    expect(mockPutLocation).toHaveBeenCalledWith(expect.objectContaining({ name: 'Kabul Satellite' }))

    expect(mockReportNetworkAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'NETWORK_LOCATION_ADDED',
        actorId: 'user-001',
      }),
    )
  })

  it('validation: throws if name is empty', async () => {
    await expect(
      addSatelliteLocation({ name: '', type: 'main', mode: 'full' }),
    ).rejects.toThrow(/name must not be empty/i)
  })

  it('validation: throws if type=satellite and parentLabId missing', async () => {
    await expect(
      addSatelliteLocation({ name: 'Satellite B', type: 'satellite', mode: 'collection-only' }),
    ).rejects.toThrow(/parentLabId/i)
  })
})

describe('updateLocation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPutLocation.mockResolvedValue(undefined)
  })

  it('success: fetches existing, merges updates, updates timestamps, emits audit', async () => {
    const existing = makeLocation({ id: 'loc-002', name: 'Old Name' })
    mockGetLocationById.mockResolvedValue(existing)

    const updated = await updateLocation('loc-002', { name: 'New Name' })

    expect(updated.id).toBe('loc-002')
    expect(updated.name).toBe('New Name')
    expect(updated.meta.lastUpdated).toBeDefined()
    expect(updated._ultranos.hlcTimestamp).toBe('mock-hlc-ts')

    expect(mockPutLocation).toHaveBeenCalledWith(expect.objectContaining({ name: 'New Name', id: 'loc-002' }))
    expect(mockReportNetworkAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'NETWORK_LOCATION_UPDATED',
        locationId: 'loc-002',
        actorId: 'user-001',
      }),
    )
  })

  it('throws if location not found', async () => {
    mockGetLocationById.mockResolvedValue(undefined)

    await expect(updateLocation('non-existent', { name: 'X' })).rejects.toThrow(/not found/i)
  })
})

describe('deactivateLocation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPutLocation.mockResolvedValue(undefined)
  })

  it('sets status inactive, emits audit', async () => {
    const existing = makeLocation({ id: 'loc-003', status: 'active' })
    mockGetLocationById.mockResolvedValue(existing)

    await deactivateLocation('loc-003', 'user-001')

    expect(mockPutLocation).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'loc-003', status: 'inactive' }),
    )
    expect(mockReportNetworkAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'NETWORK_LOCATION_DEACTIVATED',
        locationId: 'loc-003',
        actorId: 'user-001',
      }),
    )
  })

  it('throws if location not found', async () => {
    mockGetLocationById.mockResolvedValue(undefined)

    await expect(deactivateLocation('ghost', 'user-001')).rejects.toThrow(/not found/i)
  })
})

describe('setLocationMode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPutLocation.mockResolvedValue(undefined)
  })

  it('updates mode, emits audit with details', async () => {
    const existing = makeLocation({ id: 'loc-004', mode: 'full' })
    mockGetLocationById.mockResolvedValue(existing)

    await setLocationMode('loc-004', 'collection-only', 'user-001')

    expect(mockPutLocation).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'loc-004', mode: 'collection-only' }),
    )
    expect(mockReportNetworkAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'NETWORK_MODE_CHANGED',
        locationId: 'loc-004',
        actorId: 'user-001',
        details: { mode: 'collection-only' },
      }),
    )
  })
})

describe('routeSampleToMainLab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('emits SAMPLE_ROUTED_TO_MAIN audit event with sampleId in details', async () => {
    await routeSampleToMainLab('sample-xyz', 'loc-satellite-1')

    expect(mockReportNetworkAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SAMPLE_ROUTED_TO_MAIN',
        locationId: 'loc-satellite-1',
        actorId: 'user-001',
        details: { sampleId: 'sample-xyz' },
      }),
    )
  })
})

describe('routeResultToSatellite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('emits RESULT_ROUTED_TO_SATELLITE audit event with resultId in details', async () => {
    await routeResultToSatellite('result-abc', 'loc-main-1')

    expect(mockReportNetworkAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'RESULT_ROUTED_TO_SATELLITE',
        locationId: 'loc-main-1',
        actorId: 'user-001',
        details: { resultId: 'result-abc' },
      }),
    )
  })
})
