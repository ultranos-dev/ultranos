/**
 * Story 54.2 — CHW Collection Service Tests (Task 14.1)
 *
 * Unit tests for:
 *  - Patient identification by QR code
 *  - Patient identification by name
 *  - Sample collection (label generation, Dexie persist, audit)
 *  - Courier handoff (validation, persist, audit)
 *  - Sync queue
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CHWSampleCollection } from '../types/chw-mode'

// ---------------------------------------------------------------------------
// Hoisted mocks (must be declared before vi.mock factory references them)
// ---------------------------------------------------------------------------

const {
  mockAddCHWSample,
  mockAddCourierHandoff,
  mockGetCHWSamplesByIds,
  mockGetPendingSyncItems,
  mockGetDb,
  mockReportSampleEvent,
  mockReportHandoffEvent,
  mockGenerateLabelNumber,
} = vi.hoisted(() => {
  const sampleFixture: CHWSampleCollection = {
    id: 'sample-001',
    patientRef: 'Patient/pat-001',
    patientFirstName: 'Ahmad',
    patientAge: 35,
    sampleType: 'blood',
    labelNumber: 'CHW-0601-001',
    collectedBy: 'chw-001',
    collectedAt: '2026-06-01T08:00:00.000Z-0-node1',
    syncStatus: 'pending',
  }
  return {
    mockAddCHWSample: vi.fn().mockResolvedValue(undefined),
    mockAddCourierHandoff: vi.fn().mockResolvedValue(undefined),
    mockGetCHWSamplesByIds: vi.fn().mockResolvedValue([sampleFixture]),
    mockGetPendingSyncItems: vi.fn().mockResolvedValue([sampleFixture]),
    mockGetDb: vi.fn(() => ({
      verified_patients: {
        toArray: vi.fn().mockResolvedValue([
          { patientId: 'Patient/pat-001', firstName: 'Ahmad', age: 35 },
          { patientId: 'Patient/pat-002', firstName: 'Fatima', age: 22 },
        ]),
      },
    })),
    mockReportSampleEvent: vi.fn(),
    mockReportHandoffEvent: vi.fn(),
    mockGenerateLabelNumber: vi.fn().mockResolvedValue('CHW-0601-001'),
  }
})

vi.mock('../lib/db', () => ({
  addCHWSample: mockAddCHWSample,
  addCourierHandoff: mockAddCourierHandoff,
  getCHWSamplesByIds: mockGetCHWSamplesByIds,
  getPendingSyncItems: mockGetPendingSyncItems,
  getDb: mockGetDb,
}))

vi.mock('../lib/chw-label-generator', () => ({
  generateLabelNumber: mockGenerateLabelNumber,
}))

vi.mock('../lib/hlc', () => ({
  hlc: { now: vi.fn(() => ({ wallTime: 1748736000000n, counter: 0, nodeId: 'node1' })) },
  serializeHlc: vi.fn().mockReturnValue('2026-06-01T08:00:00.000Z-0-node1'),
}))

vi.mock('../lib/audit-client', () => ({
  reportCHWSampleCollectedEvent: mockReportSampleEvent,
  reportCHWHandoffEvent: mockReportHandoffEvent,
}))

vi.mock('uuid', () => ({
  v4: vi.fn().mockReturnValue('sample-001'),
}))

// Import after mocks are set up
import {
  identifyPatientByQR,
  identifyPatientByName,
  collectSample,
  recordCourierHandoff,
  getSyncQueue,
} from '../lib/chw-service'

// ---------------------------------------------------------------------------
// Patient identification — QR
// ---------------------------------------------------------------------------

describe('identifyPatientByQR', () => {
  it('returns pid, firstName, age from a valid QR payload', () => {
    const qr = JSON.stringify({
      pid: 'Patient/pat-001',
      iat: Math.floor(Date.now() / 1000) - 3600,
      exp: Math.floor(Date.now() / 1000) + 3600,
      v: 1,
      firstName: 'Ahmad',
      age: 35,
    })
    expect(identifyPatientByQR(qr)).toEqual({ pid: 'Patient/pat-001', firstName: 'Ahmad', age: 35 })
  })

  it('returns null for an expired QR', () => {
    const qr = JSON.stringify({
      pid: 'Patient/pat-001',
      exp: Math.floor(Date.now() / 1000) - 1,
    })
    expect(identifyPatientByQR(qr)).toBeNull()
  })

  it('returns null for malformed JSON', () => {
    expect(identifyPatientByQR('not-json')).toBeNull()
  })

  it('returns null when pid is missing', () => {
    expect(identifyPatientByQR(JSON.stringify({ iat: 1234 }))).toBeNull()
  })

  it('handles QR without firstName or age (older QR format)', () => {
    const qr = JSON.stringify({ pid: 'Patient/pat-001', v: 1 })
    expect(identifyPatientByQR(qr)).toEqual({ pid: 'Patient/pat-001', firstName: '', age: 0 })
  })
})

// ---------------------------------------------------------------------------
// Patient identification — name
// ---------------------------------------------------------------------------

describe('identifyPatientByName', () => {
  it('returns matching patient by first name (case-insensitive)', async () => {
    const result = await identifyPatientByName('ahmad', '')
    expect(result).toEqual({ pid: 'Patient/pat-001', firstName: 'Ahmad', age: 35 })
  })

  it('returns null when no match found', async () => {
    expect(await identifyPatientByName('Unknown', '')).toBeNull()
  })

  it('returns null when firstName is empty', async () => {
    expect(await identifyPatientByName('', 'SomeFather')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Sample collection
// ---------------------------------------------------------------------------

describe('collectSample', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGenerateLabelNumber.mockResolvedValue('CHW-0601-001')
  })

  it('persists sample with required fields', async () => {
    await collectSample({
      patientRef: 'Patient/pat-001',
      patientFirstName: 'Ahmad',
      patientAge: 35,
      sampleType: 'blood',
      collectedBy: 'chw-001',
    })

    expect(mockAddCHWSample).toHaveBeenCalledWith(
      expect.objectContaining({
        patientRef: 'Patient/pat-001',
        patientFirstName: 'Ahmad',
        patientAge: 35,
        sampleType: 'blood',
        labelNumber: 'CHW-0601-001',
        syncStatus: 'pending',
      }),
    )
  })

  it('emits CHW_SAMPLE_COLLECTED audit event', async () => {
    await collectSample({
      patientRef: 'Patient/pat-001',
      patientFirstName: 'Ahmad',
      patientAge: 35,
      sampleType: 'blood',
      collectedBy: 'chw-001',
    })

    expect(mockReportSampleEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        sampleType: 'blood',
        labelNumber: 'CHW-0601-001',
        chwPractitionerId: 'chw-001',
      }),
    )
  })

  it('does NOT include patientFirstName in audit event (data minimization)', async () => {
    await collectSample({
      patientRef: 'Patient/pat-001',
      patientFirstName: 'Ahmad',
      patientAge: 35,
      sampleType: 'blood',
      collectedBy: 'chw-001',
    })

    const auditCall = mockReportSampleEvent.mock.calls[0][0]
    expect(auditCall).not.toHaveProperty('patientFirstName')
    expect(auditCall).not.toHaveProperty('patientAge')
  })

  it('throws when patientRef is missing', async () => {
    await expect(
      collectSample({ patientRef: '', patientFirstName: 'Ahmad', patientAge: 35, sampleType: 'blood', collectedBy: 'chw-001' }),
    ).rejects.toThrow('patientRef is required')
  })

  it('throws when age is out of range', async () => {
    await expect(
      collectSample({ patientRef: 'Patient/pat-001', patientFirstName: 'Ahmad', patientAge: 999, sampleType: 'blood', collectedBy: 'chw-001' }),
    ).rejects.toThrow('Invalid patient age')
  })
})

// ---------------------------------------------------------------------------
// Courier handoff
// ---------------------------------------------------------------------------

describe('recordCourierHandoff', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCHWSamplesByIds.mockResolvedValue([{
      id: 'sample-001', patientRef: 'Patient/pat-001', patientFirstName: 'Ahmad',
      patientAge: 35, sampleType: 'blood', labelNumber: 'CHW-0601-001',
      collectedBy: 'chw-001', collectedAt: '2026-06-01T08:00:00.000Z', syncStatus: 'pending',
    }])
  })

  it('persists handoff when all samples exist', async () => {
    await recordCourierHandoff({ courierId: 'courier-xyz', sampleIds: ['sample-001'], collectedBy: 'chw-001' })

    expect(mockAddCourierHandoff).toHaveBeenCalledWith(
      expect.objectContaining({
        courierId: 'courier-xyz',
        sampleIds: ['sample-001'],
        sampleCount: 1,
        syncStatus: 'pending',
      }),
    )
  })

  it('emits CHW_COURIER_HANDOFF audit event', async () => {
    await recordCourierHandoff({ courierId: 'courier-xyz', sampleIds: ['sample-001'], collectedBy: 'chw-001' })

    expect(mockReportHandoffEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        sampleCount: 1,
        courierId: 'courier-xyz',
        chwPractitionerId: 'chw-001',
      }),
    )
  })

  it('throws when sampleIds is empty', async () => {
    await expect(
      recordCourierHandoff({ courierId: 'courier-xyz', sampleIds: [] }),
    ).rejects.toThrow('At least one sample must be selected')
  })

  it('throws when courierId is blank', async () => {
    await expect(
      recordCourierHandoff({ courierId: '   ', sampleIds: ['sample-001'] }),
    ).rejects.toThrow('courierId is required')
  })

  it('throws when a sampleId is not found in Dexie', async () => {
    mockGetCHWSamplesByIds.mockResolvedValue([])
    await expect(
      recordCourierHandoff({ courierId: 'courier-xyz', sampleIds: ['missing-001'] }),
    ).rejects.toThrow('missing')
  })
})

// ---------------------------------------------------------------------------
// Sync queue
// ---------------------------------------------------------------------------

describe('getSyncQueue', () => {
  it('returns all pending items', async () => {
    const queue = await getSyncQueue()
    expect(queue).toHaveLength(1)
    expect(queue[0]).toMatchObject({ syncStatus: 'pending' })
  })
})
