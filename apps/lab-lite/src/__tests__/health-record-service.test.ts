import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { LabRole } from '@ultranos/shared-types'
import type { EmployeeHealthRecord, EncryptedHealthRecord } from '../types/employee-health'
import {
  VaccinationStatus,
  TbScreeningResult,
  HepBImmunityStatus,
} from '../types/employee-health'

// Mock auth session store
const mockSession = {
  userId: 'user-1',
  practitionerId: 'prac-1',
  role: 'LAB_TECH',
  sessionId: 'sess-1',
  email: 'tech@lab.test',
  labRole: LabRole.LAB_MANAGER as LabRole | null,
}

vi.mock('../stores/auth-session-store', () => ({
  useAuthSessionStore: {
    getState: () => ({ session: mockSession }),
  },
}))

// Mock audit client
vi.mock('../lib/audit-client', () => ({
  reportHealthRecordAuditEvent: vi.fn(),
}))

// Mock HLC
vi.mock('../lib/hlc', () => ({
  hlc: { now: () => ({ wallMs: Date.now(), counter: 0, nodeId: 'test-node' }) },
  serializeHlc: () => '2026-01-01T00:00:00Z:0:test-node',
}))

// We need a real Dexie instance for integration testing
class TestDb extends Dexie {
  employee_health_records!: Dexie.Table<EncryptedHealthRecord, string>
  syncQueue!: Dexie.Table<any, string>

  constructor() {
    super('test-health-record-db')
    this.version(1).stores({
      employee_health_records: '&id, practitionerId',
      syncQueue: '&id, resourceType, resourceId, status, createdAt',
    })
  }
}

let testDb: TestDb

// Mock db module
vi.mock('../lib/db', () => ({
  getDb: () => testDb,
  enqueueSyncEvent: vi.fn(),
}))

// Mock consent-crypto (session key)
let testKey: CryptoKey

vi.mock('../lib/consent-crypto', () => ({
  getSessionEncryptionKey: () => Promise.resolve(testKey),
}))

import {
  createHealthRecord,
  updateHealthRecord,
  getHealthRecord,
  getVaccinationStatusForExposure,
  addExposureToHistory,
} from '../lib/safety/health-record-service'
import { reportHealthRecordAuditEvent } from '../lib/audit-client'
import { enqueueSyncEvent } from '../lib/db'

const mockAudit = reportHealthRecordAuditEvent as ReturnType<typeof vi.fn>
const mockSync = enqueueSyncEvent as ReturnType<typeof vi.fn>

describe('Health Record Service (Story 47.3, Task 4)', () => {
  beforeEach(async () => {
    testDb = new TestDb()
    testKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    )
    mockAudit.mockClear()
    mockSync.mockClear()
    mockSession.labRole = LabRole.LAB_MANAGER
    mockSession.practitionerId = 'prac-1'
  })

  afterEach(async () => {
    await testDb.delete()
  })

  it('creates a health record with defaults', async () => {
    const record = await createHealthRecord('prac-1', {
      hepBStatus: VaccinationStatus.COMPLETE,
      hepBDoses: 3,
    })

    expect(record.practitionerId).toBe('prac-1')
    expect(record.hepBStatus).toBe(VaccinationStatus.COMPLETE)
    expect(record.hepBDoses).toBe(3)
    expect(record.tetanusStatus).toBe(VaccinationStatus.UNKNOWN)
    expect(record.tbScreeningResult).toBe(TbScreeningResult.NOT_DONE)
    expect(record.exposureHistory).toEqual([])
    expect(record.id).toBeDefined()

    // Verify audit event
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'HEALTH_RECORD_CREATED',
        practitionerId: 'prac-1',
      }),
    )

    // Verify sync event
    expect(mockSync).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: 'EmployeeHealthRecord',
      }),
    )
  })

  it('persists encrypted record in Dexie', async () => {
    await createHealthRecord('prac-1', { notes: 'test notes' })

    const stored = await testDb.employee_health_records.toArray()
    expect(stored).toHaveLength(1)
    expect(stored[0].practitionerId).toBe('prac-1')
    // encryptedPayload should exist (stored as ArrayBuffer or Uint8Array by IndexedDB)
    expect(stored[0].encryptedPayload).toBeDefined()
    expect(stored[0].encryptedPayload.byteLength).toBeGreaterThan(0)
  })

  it('reads and decrypts a health record', async () => {
    await createHealthRecord('prac-1', { notes: 'readable notes' })

    const record = await getHealthRecord('prac-1')
    expect(record).not.toBeNull()
    expect(record!.notes).toBe('readable notes')
    expect(record!.practitionerId).toBe('prac-1')

    // Verify read audit event
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'HEALTH_RECORD_ACCESSED',
      }),
    )
  })

  it('returns null for non-existent record', async () => {
    const record = await getHealthRecord('non-existent')
    expect(record).toBeNull()
  })

  it('updates a health record', async () => {
    await createHealthRecord('prac-1', {
      hepBStatus: VaccinationStatus.INCOMPLETE,
    })

    const updated = await updateHealthRecord('prac-1', {
      hepBStatus: VaccinationStatus.COMPLETE,
      hepBDoses: 3,
    })

    expect(updated.hepBStatus).toBe(VaccinationStatus.COMPLETE)
    expect(updated.hepBDoses).toBe(3)

    // Verify update audit event
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'HEALTH_RECORD_UPDATED',
        fieldsModified: expect.arrayContaining(['hepBStatus', 'hepBDoses']),
      }),
    )
  })

  it('throws on update if record does not exist', async () => {
    await expect(
      updateHealthRecord('non-existent', { notes: 'test' }),
    ).rejects.toThrow('Health record not found')
  })

  it('returns vaccination status for exposure protocol', async () => {
    await createHealthRecord('prac-1', {
      hepBStatus: VaccinationStatus.COMPLETE,
      hepBTiterResult: HepBImmunityStatus.IMMUNE,
      tetanusDate: new Date().toISOString().split('T')[0], // today
      tbScreeningDate: '2026-01-01',
    })

    const status = await getVaccinationStatusForExposure('prac-1')

    expect(status.hepBImmune).toBe(true)
    expect(status.hepBStatus).toBe(VaccinationStatus.COMPLETE)
    expect(status.tetanusCurrent).toBe(true)
    expect(status.lastTbScreening).toBe('2026-01-01')
  })

  it('returns safe defaults when no record exists for exposure lookup', async () => {
    const status = await getVaccinationStatusForExposure('no-record')

    expect(status.hepBImmune).toBe(false)
    expect(status.hepBStatus).toBe(VaccinationStatus.UNKNOWN)
    expect(status.tetanusCurrent).toBe(false)
    expect(status.lastTbScreening).toBeNull()
  })

  it('appends to exposure history (append-only)', async () => {
    await createHealthRecord('prac-1', {
      exposureHistory: [
        {
          id: 'exp-1',
          date: '2025-01-01',
          type: 'needlestick',
          sourceStatus: 'unknown',
          pepTaken: false,
          outcome: 'cleared',
          incidentReportId: null,
        },
      ],
    })

    await addExposureToHistory('prac-1', {
      id: 'exp-2',
      date: '2026-01-15',
      type: 'splash',
      sourceStatus: 'HepB+',
      pepTaken: true,
      outcome: 'monitoring',
      incidentReportId: 'inc-123',
    })

    const record = await getHealthRecord('prac-1')
    expect(record!.exposureHistory).toHaveLength(2)
    expect(record!.exposureHistory[0].id).toBe('exp-1')
    expect(record!.exposureHistory[1].id).toBe('exp-2')

    // Verify audit
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'EXPOSURE_HISTORY_ADDED',
        fieldsModified: ['exposureHistory'],
      }),
    )
  })

  it('throws on exposure append if record does not exist', async () => {
    await expect(
      addExposureToHistory('no-record', {
        id: 'exp-1',
        date: '2026-01-01',
        type: 'test',
        sourceStatus: 'unknown',
        pepTaken: false,
        outcome: 'na',
        incidentReportId: null,
      }),
    ).rejects.toThrow('Health record not found')
  })

  it('denies access for unauthorized user', async () => {
    // Switch to a non-manager tech trying to access someone else
    mockSession.labRole = LabRole.LAB_TECH
    mockSession.practitionerId = 'other-tech'

    await expect(getHealthRecord('prac-1')).rejects.toThrow(
      'Unauthorized access to health record',
    )
  })
})
