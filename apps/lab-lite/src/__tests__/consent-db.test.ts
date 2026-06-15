import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import {
  getDb,
  addConsentRecord,
  getConsentsByPatient,
  getConsentByEncounter,
  withdrawConsent,
  type ConsentRecord,
} from '../lib/db'

function makeConsentRecord(
  overrides: Partial<ConsentRecord> = {},
): Omit<ConsentRecord, 'id'> {
  return {
    patientRef: 'Patient/test-123',
    encounterId: 'encounter-456',
    method: 'audio',
    language: 'en',
    consentTextVersion: '1.0.0',
    audioBlob: new Blob(['encrypted-audio'], { type: 'application/octet-stream' }),
    witnessingTechId: 'tech-789',
    capturedAt: new Date().toISOString(),
    hlcTimestamp: '2026-05-30T00:00:00.000Z_0000_node1',
    status: 'active',
    syncStatus: 'pending',
    ...overrides,
  }
}

describe('ConsentRecord Dexie CRUD (Task 10.1)', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.consentRecords.clear()
  })

  afterEach(async () => {
    const db = getDb()
    await db.consentRecords.clear()
  })

  it('creates a consent record and returns an auto-generated ID', async () => {
    const record = makeConsentRecord()
    const id = await addConsentRecord(record)

    expect(id).toBeDefined()
    expect(typeof id).toBe('number')
  })

  it('reads consent records by patient reference', async () => {
    await addConsentRecord(makeConsentRecord({ patientRef: 'Patient/aaa' }))
    await addConsentRecord(makeConsentRecord({ patientRef: 'Patient/bbb' }))
    await addConsentRecord(makeConsentRecord({ patientRef: 'Patient/aaa' }))

    const results = await getConsentsByPatient('Patient/aaa')
    expect(results).toHaveLength(2)
    expect(results.every((r) => r.patientRef === 'Patient/aaa')).toBe(true)
  })

  it('reads consent records by encounter ID', async () => {
    await addConsentRecord(makeConsentRecord({ encounterId: 'enc-1' }))
    await addConsentRecord(makeConsentRecord({ encounterId: 'enc-2' }))

    const results = await getConsentByEncounter('enc-1')
    expect(results).toHaveLength(1)
    expect(results[0]!.encounterId).toBe('enc-1')
  })

  it('returns empty array for non-existent patient', async () => {
    const results = await getConsentsByPatient('Patient/nonexistent')
    expect(results).toHaveLength(0)
  })

  it('withdraws consent — record is NOT deleted, only status changes', async () => {
    const id = await addConsentRecord(makeConsentRecord())

    await withdrawConsent(id, 'Patient changed their mind')

    const db = getDb()
    const record = await db.consentRecords.get(id)

    // Record must still exist (append-only)
    expect(record).toBeDefined()
    expect(record!.status).toBe('withdrawn')
    expect(record!.withdrawnAt).toBeDefined()
    expect(record!.withdrawalReason).toBe('Patient changed their mind')
    expect(record!.syncStatus).toBe('pending')
  })

  it('preserves original data after withdrawal', async () => {
    const id = await addConsentRecord(
      makeConsentRecord({
        method: 'both',
        language: 'ar',
        consentTextVersion: '1.0.0',
      }),
    )

    await withdrawConsent(id, 'Reason')

    const db = getDb()
    const record = await db.consentRecords.get(id)

    expect(record!.method).toBe('both')
    expect(record!.language).toBe('ar')
    expect(record!.consentTextVersion).toBe('1.0.0')
    expect(record!.capturedAt).toBeDefined()
  })

  it('stores blob data correctly', async () => {
    const audioBlob = new Blob(['test-audio-data'], { type: 'application/octet-stream' })
    const thumbprintBlob = new Blob(['test-thumbprint-data'], { type: 'application/octet-stream' })

    const id = await addConsentRecord(
      makeConsentRecord({
        method: 'both',
        audioBlob,
        thumbprintBlob,
      }),
    )

    const db = getDb()
    const record = await db.consentRecords.get(id)

    expect(record!.audioBlob).toBeDefined()
    expect(record!.thumbprintBlob).toBeDefined()

    // Verify blob fields are present
    expect(record!.audioBlob).toBeDefined()
    expect(record!.thumbprintBlob).toBeDefined()
  })
})
