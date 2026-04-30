import { describe, it, expect, beforeEach } from 'vitest'
import type { FulfillmentItem } from '@/stores/fulfillment-store'

import { createMedicationDispense } from '@/lib/medication-dispense'
import { db } from '@/lib/db'
import { logDispenseEvent } from '@/services/dispenseAuditService'

function makeItems(): FulfillmentItem[] {
  return [
    {
      prescription: {
        id: 'rx-001',
        med: 'AMX500',
        medN: 'Amoxicillin',
        medT: 'Amoxicillin 500mg Capsule',
        dos: { qty: 1, unit: 'capsule', freqN: 3, per: 1, perU: 'd' },
        dur: 7,
        enc: 'enc-001',
        req: 'pract-001',
        pat: 'pat-001',
        at: '2026-04-28T10:00:00Z',
      },
      selected: true,
      brandName: 'Amoxil',
      batchLot: 'LOT-2026-04A',
    },
    {
      prescription: {
        id: 'rx-002',
        med: 'IBU400',
        medN: 'Ibuprofen',
        medT: 'Ibuprofen 400mg Tablet',
        dos: { qty: 1, unit: 'tablet', freqN: 2, per: 1, perU: 'd' },
        dur: 5,
        enc: 'enc-001',
        req: 'pract-001',
        pat: 'pat-001',
        at: '2026-04-28T10:00:00Z',
      },
      selected: true,
      brandName: '',
      batchLot: '',
    },
  ]
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('createMedicationDispense', () => {
  it('creates a FHIR MedicationDispense resource per fulfilled item', () => {
    const items = makeItems()
    const dispenses = items.map((item) => createMedicationDispense(item, 'pharmacist-001'))

    expect(dispenses).toHaveLength(2)
    expect(dispenses[0]!.resourceType).toBe('MedicationDispense')
    expect(dispenses[1]!.resourceType).toBe('MedicationDispense')
  })

  it('links to the original MedicationRequest via authorizingPrescription', () => {
    const items = makeItems()
    const dispense = createMedicationDispense(items[0]!, 'pharmacist-001')

    expect(dispense.authorizingPrescription).toEqual([
      { reference: `MedicationRequest/${items[0]!.prescription.id}` },
    ])
  })

  it('sets subject reference to Patient', () => {
    const items = makeItems()
    const dispense = createMedicationDispense(items[0]!, 'pharmacist-001')

    expect(dispense.subject.reference).toBe('Patient/pat-001')
  })

  it('sets performer reference to pharmacist', () => {
    const items = makeItems()
    const dispense = createMedicationDispense(items[0]!, 'pharmacist-001')

    const performer = dispense.performer?.[0]
    expect(performer?.actor.reference).toBe('Practitioner/pharmacist-001')
  })

  it('maps medication code from prescription', () => {
    const items = makeItems()
    const dispense = createMedicationDispense(items[0]!, 'pharmacist-001')

    expect(dispense.medicationCodeableConcept.coding?.[0]?.code).toBe('AMX500')
    expect(dispense.medicationCodeableConcept.text).toBe('Amoxicillin 500mg Capsule')
  })

  it('includes brand name in Ultranos extension when provided', () => {
    const items = makeItems()
    const dispense = createMedicationDispense(items[0]!, 'pharmacist-001')

    expect(dispense._ultranos.brandName).toBe('Amoxil')
  })

  it('includes batch/lot in Ultranos extension when provided', () => {
    const items = makeItems()
    const dispense = createMedicationDispense(items[0]!, 'pharmacist-001')

    expect(dispense._ultranos.batchLot).toBe('LOT-2026-04A')
  })

  it('omits brand/batch when empty', () => {
    const items = makeItems()
    const dispense = createMedicationDispense(items[1]!, 'pharmacist-001')

    expect(dispense._ultranos.brandName).toBeUndefined()
    expect(dispense._ultranos.batchLot).toBeUndefined()
  })

  it('assigns HLC timestamp in Ultranos extension', () => {
    const items = makeItems()
    const dispense = createMedicationDispense(items[0]!, 'pharmacist-001')

    expect(dispense._ultranos.hlcTimestamp).toBeTruthy()
    expect(typeof dispense._ultranos.hlcTimestamp).toBe('string')
  })

  it('sets status to completed', () => {
    const items = makeItems()
    const dispense = createMedicationDispense(items[0]!, 'pharmacist-001')

    expect(dispense.status).toBe('completed')
  })

  it('sets whenHandedOver to current ISO timestamp', () => {
    const items = makeItems()
    const dispense = createMedicationDispense(items[0]!, 'pharmacist-001')

    expect(dispense.whenHandedOver).toBeTruthy()
    // Should be a valid ISO date string
    expect(Number.isNaN(Date.parse(dispense.whenHandedOver))).toBe(false)
  })

  it('generates a unique UUID id', () => {
    const items = makeItems()
    const d1 = createMedicationDispense(items[0]!, 'pharmacist-001')
    const d2 = createMedicationDispense(items[1]!, 'pharmacist-001')

    expect(d1.id).toBeTruthy()
    expect(d2.id).toBeTruthy()
    expect(d1.id).not.toBe(d2.id)
  })

  it('includes dosage instruction from the prescription', () => {
    const items = makeItems()
    const dispense = createMedicationDispense(items[0]!, 'pharmacist-001')

    expect(dispense.dosageInstruction).toBeTruthy()
    expect(dispense.dosageInstruction![0]!.text).toContain('1 capsule')
  })
})

describe('MedicationDispense Dexie persistence', () => {
  it('saves a dispense to the local ledger', async () => {
    const items = makeItems()
    const dispense = createMedicationDispense(items[0]!, 'pharmacist-001')

    await db.dispenses.put(dispense)

    const stored = await db.dispenses.get(dispense.id)
    expect(stored).toBeTruthy()
    expect(stored!.resourceType).toBe('MedicationDispense')
    expect(stored!.authorizingPrescription![0]!.reference).toBe('MedicationRequest/rx-001')
  })

  it('can query dispenses by subject reference', async () => {
    const items = makeItems()
    for (const item of items) {
      const dispense = createMedicationDispense(item, 'pharmacist-001')
      await db.dispenses.put(dispense)
    }

    const results = await db.dispenses
      .where('subject.reference')
      .equals('Patient/pat-001')
      .toArray()

    expect(results).toHaveLength(2)
  })

  it('can query dispenses by HLC timestamp', async () => {
    const items = makeItems()
    const dispense = createMedicationDispense(items[0]!, 'pharmacist-001')
    await db.dispenses.put(dispense)

    const results = await db.dispenses
      .where('_ultranos.hlcTimestamp')
      .above('')
      .toArray()

    expect(results).toHaveLength(1)
  })
})

describe('MedicationDispense meta fields', () => {
  it('includes versionId in meta', () => {
    const items = makeItems()
    const dispense = createMedicationDispense(items[0]!, 'pharmacist-001')

    expect(dispense.meta.versionId).toBe('1')
  })

  it('includes fulfillment tracking when context provided', () => {
    const items = makeItems()
    const dispense = createMedicationDispense(items[0]!, 'pharmacist-001', {
      fulfilledCount: 1,
      totalCount: 2,
    })

    expect(dispense._ultranos.fulfilledCount).toBe(1)
    expect(dispense._ultranos.totalCount).toBe(2)
  })

  it('omits fulfillment tracking when no context provided', () => {
    const items = makeItems()
    const dispense = createMedicationDispense(items[0]!, 'pharmacist-001')

    expect(dispense._ultranos.fulfilledCount).toBeUndefined()
    expect(dispense._ultranos.totalCount).toBeUndefined()
  })
})

describe('Dispense audit logging', () => {
  it('logs a dispense audit event on creation', async () => {
    const items = makeItems()
    const dispense = createMedicationDispense(items[0]!, 'pharmacist-001')

    await logDispenseEvent(dispense, 'created')

    const auditEntries = await db.dispenseAuditLog
      .where('dispenseId')
      .equals(dispense.id)
      .toArray()

    expect(auditEntries).toHaveLength(1)
    expect(auditEntries[0]!.action).toBe('created')
    expect(auditEntries[0]!.patientRef).toBe('Patient/pat-001')
    expect(auditEntries[0]!.pharmacistRef).toBe('Practitioner/pharmacist-001')
    expect(auditEntries[0]!.medicationCode).toBe('AMX500')
  })
})
