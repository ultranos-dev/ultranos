import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { checkPrescriptionAlreadyDispensed } from '@/lib/idempotency-check'
import type { LocalMedicationDispense } from '@/lib/medication-dispense'

function makeSampleDispense(prescriptionId: string): LocalMedicationDispense {
  return {
    id: crypto.randomUUID(),
    resourceType: 'MedicationDispense',
    status: 'completed',
    medicationCodeableConcept: {
      coding: [{ system: 'urn:ultranos:medication', code: 'AMX500', display: 'Amoxicillin' }],
      text: 'Amoxicillin 500mg Capsule',
    },
    subject: { reference: 'Patient/pat-001' },
    performer: [{ actor: { reference: 'Practitioner/practitioner-abc-123' } }],
    authorizingPrescription: [{ reference: `MedicationRequest/${prescriptionId}` }],
    whenHandedOver: '2026-05-12T10:00:00Z',
    dosageInstruction: [{ text: '1 capsule, 3x per day, for 7 days' }],
    _ultranos: {
      hlcTimestamp: '000001714400000:00000:node-abc',
      createdAt: '2026-05-12T10:00:00Z',
      isOfflineCreated: false,
    },
    meta: { lastUpdated: '2026-05-12T10:00:00Z', versionId: '1' },
  }
}

beforeEach(async () => {
  await db.delete()
  await db.open()

  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
  encryptionKeyStore.setKey(key)
})

describe('checkPrescriptionAlreadyDispensed (Story 19.3 AC #5)', () => {
  it('returns alreadyDispensed: false when no dispenses exist', async () => {
    const result = await checkPrescriptionAlreadyDispensed(['rx-001'])
    expect(result.alreadyDispensed).toBe(false)
  })

  it('returns alreadyDispensed: true when matching dispense exists', async () => {
    await db.dispenses.put(makeSampleDispense('rx-001'))

    const result = await checkPrescriptionAlreadyDispensed(['rx-001'])
    expect(result.alreadyDispensed).toBe(true)
    expect(result.dispensedAt).toBe('2026-05-12T10:00:00Z')
  })

  it('returns alreadyDispensed: false when no matching prescription reference', async () => {
    await db.dispenses.put(makeSampleDispense('rx-001'))

    const result = await checkPrescriptionAlreadyDispensed(['rx-002'])
    expect(result.alreadyDispensed).toBe(false)
  })

  it('detects match across multiple prescription IDs', async () => {
    await db.dispenses.put(makeSampleDispense('rx-003'))

    const result = await checkPrescriptionAlreadyDispensed(['rx-001', 'rx-002', 'rx-003'])
    expect(result.alreadyDispensed).toBe(true)
  })

  it('queries by authorizingPrescription reference format', async () => {
    const dispense = makeSampleDispense('rx-001')
    await db.dispenses.put(dispense)

    // Verify it matches the MedicationRequest/{id} format
    expect(dispense.authorizingPrescription![0]!.reference).toBe('MedicationRequest/rx-001')

    const result = await checkPrescriptionAlreadyDispensed(['rx-001'])
    expect(result.alreadyDispensed).toBe(true)
  })
})
