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
  mockAddCHWSampleAtomic,
  mockAddCourierHandoff,
  mockGetCHWSamplesByIds,
  mockGetPendingSyncItems,
  mockGetDb,
  mockReportSampleEvent,
  mockReportHandoffEvent,
  mockReportPatientIdentifiedEvent,
  mockVerifyQrOffline,
} = vi.hoisted(() => {
  const sampleFixture: CHWSampleCollection = {
    id: 'sample-001',
    patientRef: 'Patient/pat-001',
    patientFirstName: 'Ahmad',
    patientAge: 35,
    sampleType: 'blood',
    labelNumber: 'CHW-0601-001',
    collectedBy: 'chw-001',
    collectedAt: '001748736000000:00000:node1',
    syncStatus: 'pending',
  }
  return {
    mockAddCHWSampleAtomic: vi.fn().mockResolvedValue(sampleFixture),
    mockAddCourierHandoff: vi.fn().mockResolvedValue(undefined),
    mockGetCHWSamplesByIds: vi.fn().mockResolvedValue([sampleFixture]),
    mockGetPendingSyncItems: vi.fn().mockResolvedValue([sampleFixture]),
    mockGetDb: vi.fn(() => ({
      verified_patients: {
        toArray: vi.fn().mockResolvedValue([
          { patientId: 'Patient/pat-001', firstName: 'Ahmad', fatherName: 'Karim', age: 35 },
          { patientId: 'Patient/pat-002', firstName: 'Ahmad', fatherName: 'Yunus', age: 28 },
          { patientId: 'Patient/pat-003', firstName: 'Fatima', fatherName: '', age: 22 },
        ]),
      },
    })),
    mockReportSampleEvent: vi.fn(),
    mockReportHandoffEvent: vi.fn(),
    mockReportPatientIdentifiedEvent: vi.fn(),
    mockVerifyQrOffline: vi.fn().mockResolvedValue({ valid: true }),
  }
})

vi.mock('../lib/db', () => ({
  addCHWSampleAtomic: mockAddCHWSampleAtomic,
  addCourierHandoff: mockAddCourierHandoff,
  getCHWSamplesByIds: mockGetCHWSamplesByIds,
  getPendingSyncItems: mockGetPendingSyncItems,
  getDb: mockGetDb,
}))

vi.mock('../lib/offline-verify', () => ({
  verifyQrOffline: mockVerifyQrOffline,
}))

vi.mock('../lib/hlc', () => ({
  hlc: { now: vi.fn(() => ({ wallMs: 1748736000000, counter: 0, nodeId: 'node1' })) },
  serializeHlc: vi.fn().mockReturnValue('001748736000000:00000:node1'),
}))

vi.mock('../lib/audit-client', () => ({
  reportCHWSampleCollectedEvent: mockReportSampleEvent,
  reportCHWHandoffEvent: mockReportHandoffEvent,
  reportCHWPatientIdentifiedEvent: mockReportPatientIdentifiedEvent,
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
  beforeEach(() => vi.clearAllMocks())

  it('returns pid, firstName, age from a valid QR payload', async () => {
    const qr = JSON.stringify({
      pid: 'Patient/pat-001',
      iat: Math.floor(Date.now() / 1000) - 3600,
      exp: Math.floor(Date.now() / 1000) + 3600,
      v: 1,
      firstName: 'Ahmad',
      age: 35,
    })
    const result = await identifyPatientByQR(qr, 'chw-001')
    expect(result).toEqual({ pid: 'Patient/pat-001', firstName: 'Ahmad', age: 35 })
  })

  it('emits CHW_PATIENT_IDENTIFIED audit event on success (F17/AC #9)', async () => {
    const qr = JSON.stringify({ pid: 'Patient/pat-001', v: 1, firstName: 'Ahmad', age: 35 })
    await identifyPatientByQR(qr, 'chw-001')
    expect(mockReportPatientIdentifiedEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        patientRef: 'Patient/pat-001',
        identificationMethod: 'qr',
        chwPractitionerId: 'chw-001',
      }),
    )
  })

  it('does NOT include patient name in audit metadata (data minimization)', async () => {
    const qr = JSON.stringify({ pid: 'Patient/pat-001', v: 1, firstName: 'Ahmad', age: 35 })
    await identifyPatientByQR(qr, 'chw-001')
    const call = mockReportPatientIdentifiedEvent.mock.calls[0][0]
    expect(call).not.toHaveProperty('firstName')
    expect(call).not.toHaveProperty('age')
  })

  it('returns null for an expired QR', async () => {
    const qr = JSON.stringify({
      pid: 'Patient/pat-001',
      exp: Math.floor(Date.now() / 1000) - 1,
    })
    expect(await identifyPatientByQR(qr, 'chw-001')).toBeNull()
  })

  it('returns null for malformed JSON', async () => {
    expect(await identifyPatientByQR('not-json', 'chw-001')).toBeNull()
  })

  it('returns null when pid is missing', async () => {
    expect(await identifyPatientByQR(JSON.stringify({ iat: 1234 }), 'chw-001')).toBeNull()
  })

  it('handles QR without firstName or age (older QR format)', async () => {
    const qr = JSON.stringify({ pid: 'Patient/pat-001', v: 1 })
    const result = await identifyPatientByQR(qr, 'chw-001')
    expect(result).toEqual({ pid: 'Patient/pat-001', firstName: '', age: 0 })
  })

  it('calls verifyQrOffline when sig is present and returns null if invalid', async () => {
    mockVerifyQrOffline.mockResolvedValueOnce({ valid: false, reason: 'bad sig' })
    const qr = JSON.stringify({ pid: 'Patient/pat-001', v: 1, sig: 'fakesig', firstName: 'Ahmad', age: 35 })
    expect(await identifyPatientByQR(qr, 'chw-001')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Patient identification — name
// ---------------------------------------------------------------------------

describe('identifyPatientByName', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns matching patient by first name (case-insensitive)', async () => {
    // Two Ahmads in fixture — should return one via fatherName disambiguation
    const result = await identifyPatientByName('ahmad', 'Karim', 'chw-001')
    expect(result).toEqual({ pid: 'Patient/pat-001', firstName: 'Ahmad', age: 35 })
  })

  it('disambiguates by fatherName when multiple first-name matches exist (F9)', async () => {
    const result = await identifyPatientByName('ahmad', 'Yunus', 'chw-001')
    expect(result).toEqual({ pid: 'Patient/pat-002', firstName: 'Ahmad', age: 28 })
  })

  it('returns first match when fatherName is empty and multiple matches exist', async () => {
    const result = await identifyPatientByName('ahmad', '', 'chw-001')
    expect(result?.pid).toBe('Patient/pat-001')
  })

  it('returns null when no match found', async () => {
    expect(await identifyPatientByName('Unknown', '', 'chw-001')).toBeNull()
  })

  it('returns null when firstName is empty', async () => {
    expect(await identifyPatientByName('', 'SomeFather', 'chw-001')).toBeNull()
  })

  it('emits CHW_PATIENT_IDENTIFIED audit event on success', async () => {
    await identifyPatientByName('Fatima', '', 'chw-001')
    expect(mockReportPatientIdentifiedEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        patientRef: 'Patient/pat-003',
        identificationMethod: 'name',
        chwPractitionerId: 'chw-001',
      }),
    )
  })
})

// ---------------------------------------------------------------------------
// Sample collection
// ---------------------------------------------------------------------------

describe('collectSample', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAddCHWSampleAtomic.mockResolvedValue({
      id: 'sample-001',
      patientRef: 'Patient/pat-001',
      patientFirstName: 'Ahmad',
      patientAge: 35,
      sampleType: 'blood',
      labelNumber: 'CHW-0601-001',
      collectedBy: 'chw-001',
      collectedAt: '001748736000000:00000:node1',
      syncStatus: 'pending',
    })
  })

  it('persists sample via addCHWSampleAtomic (atomic label + write, F7)', async () => {
    await collectSample({
      patientRef: 'Patient/pat-001',
      patientFirstName: 'Ahmad',
      patientAge: 35,
      sampleType: 'blood',
      collectedBy: 'chw-001',
    })

    expect(mockAddCHWSampleAtomic).toHaveBeenCalledWith(
      expect.objectContaining({
        patientRef: 'Patient/pat-001',
        patientFirstName: 'Ahmad',
        patientAge: 35,
        sampleType: 'blood',
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
      collectedBy: 'chw-001', collectedAt: '001748736000000:00000:node1', syncStatus: 'pending',
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
      recordCourierHandoff({ courierId: 'courier-xyz', sampleIds: [], collectedBy: 'chw-001' }),
    ).rejects.toThrow('At least one sample must be selected')
  })

  it('throws when courierId is blank', async () => {
    await expect(
      recordCourierHandoff({ courierId: '   ', sampleIds: ['sample-001'], collectedBy: 'chw-001' }),
    ).rejects.toThrow('courierId is required')
  })

  it('throws when collectedBy is missing (F6 — audit chain)', async () => {
    await expect(
      recordCourierHandoff({ courierId: 'courier-xyz', sampleIds: ['sample-001'], collectedBy: '' }),
    ).rejects.toThrow('collectedBy is required for audit chain')
  })

  it('throws when a sampleId is not found in today\'s records (F11)', async () => {
    mockGetCHWSamplesByIds.mockResolvedValue([])
    await expect(
      recordCourierHandoff({ courierId: 'courier-xyz', sampleIds: ['missing-001'], collectedBy: 'chw-001' }),
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
