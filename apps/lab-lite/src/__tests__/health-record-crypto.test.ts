import { describe, it, expect } from 'vitest'
import {
  encryptHealthRecord,
  decryptHealthRecord,
  generateHealthRecordKey,
} from '../lib/safety/health-record-crypto'
import type { EmployeeHealthRecord } from '../types/employee-health'
import {
  VaccinationStatus,
  TbScreeningResult,
  HepBImmunityStatus,
} from '../types/employee-health'

function makeRecord(overrides?: Partial<EmployeeHealthRecord>): EmployeeHealthRecord {
  return {
    id: 'rec-1',
    practitionerId: 'prac-1',
    hepBStatus: VaccinationStatus.COMPLETE,
    hepBDoses: 3,
    hepBTiterDate: '2024-01-15',
    hepBTiterResult: HepBImmunityStatus.IMMUNE,
    tetanusDate: '2022-06-01',
    tetanusStatus: VaccinationStatus.COMPLETE,
    covidDate: '2024-03-01',
    covidStatus: VaccinationStatus.COMPLETE,
    covidDoses: 4,
    tbScreeningDate: '2025-12-01',
    tbScreeningResult: TbScreeningResult.NEGATIVE,
    tbScreeningHistory: [
      { date: '2024-12-01', result: TbScreeningResult.NEGATIVE },
      { date: '2025-12-01', result: TbScreeningResult.NEGATIVE },
    ],
    exposureHistory: [
      {
        id: 'exp-1',
        date: '2025-03-15',
        type: 'needlestick',
        sourceStatus: 'unknown',
        pepTaken: true,
        outcome: 'no seroconversion',
        incidentReportId: 'inc-1',
      },
    ],
    notes: 'Annual checkup notes',
    lastUpdated: '2026-01-01T00:00:00Z',
    updatedBy: 'prac-1',
    hlcTimestamp: '2026-01-01T00:00:00Z:0:node-1',
    ...overrides,
  }
}

describe('Health Record Crypto (Story 47.3, Task 2)', () => {
  it('encryption round-trip preserves all fields', async () => {
    const key = await generateHealthRecordKey()
    const original = makeRecord()

    const encrypted = await encryptHealthRecord(original, key)
    const decrypted = await decryptHealthRecord(encrypted, key)

    expect(decrypted).toEqual(original)
  })

  it('encrypted record does not contain cleartext clinical data', async () => {
    const key = await generateHealthRecordKey()
    const record = makeRecord({ notes: 'SUPER_SECRET_NOTE' })

    const encrypted = await encryptHealthRecord(record, key)

    // Only id, practitionerId, lastUpdated should be in cleartext
    expect(encrypted.id).toBe('rec-1')
    expect(encrypted.practitionerId).toBe('prac-1')
    expect(encrypted.lastUpdated).toBe('2026-01-01T00:00:00Z')

    // Encrypted payload should not contain the note in cleartext
    const payloadBytes = new Uint8Array(encrypted.encryptedPayload)
    const payloadText = new TextDecoder().decode(payloadBytes)
    expect(payloadText).not.toContain('SUPER_SECRET_NOTE')
    expect(payloadText).not.toContain('COMPLETE')
    expect(payloadText).not.toContain('IMMUNE')
  })

  it('decryption with wrong key fails', async () => {
    const key1 = await generateHealthRecordKey()
    const key2 = await generateHealthRecordKey()
    const record = makeRecord()

    const encrypted = await encryptHealthRecord(record, key1)

    await expect(decryptHealthRecord(encrypted, key2)).rejects.toThrow()
  })

  it('preserves exposure history through round-trip', async () => {
    const key = await generateHealthRecordKey()
    const record = makeRecord({
      exposureHistory: [
        {
          id: 'exp-a',
          date: '2025-06-01',
          type: 'splash',
          sourceStatus: 'HepB+',
          pepTaken: true,
          outcome: 'monitoring',
          incidentReportId: 'inc-99',
        },
        {
          id: 'exp-b',
          date: '2025-09-01',
          type: 'needlestick',
          sourceStatus: 'unknown',
          pepTaken: false,
          outcome: 'cleared',
          incidentReportId: null,
        },
      ],
    })

    const encrypted = await encryptHealthRecord(record, key)
    const decrypted = await decryptHealthRecord(encrypted, key)

    expect(decrypted.exposureHistory).toHaveLength(2)
    expect(decrypted.exposureHistory[0].id).toBe('exp-a')
    expect(decrypted.exposureHistory[1].pepTaken).toBe(false)
  })

  it('preserves TB screening history through round-trip', async () => {
    const key = await generateHealthRecordKey()
    const record = makeRecord({
      tbScreeningHistory: [
        { date: '2023-01-01', result: TbScreeningResult.NEGATIVE },
        { date: '2024-01-01', result: TbScreeningResult.POSITIVE },
        { date: '2025-01-01', result: TbScreeningResult.INDETERMINATE },
      ],
    })

    const encrypted = await encryptHealthRecord(record, key)
    const decrypted = await decryptHealthRecord(encrypted, key)

    expect(decrypted.tbScreeningHistory).toHaveLength(3)
    expect(decrypted.tbScreeningHistory[1].result).toBe(TbScreeningResult.POSITIVE)
  })
})
