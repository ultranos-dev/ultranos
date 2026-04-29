import { describe, it, expect, beforeEach } from 'vitest'
import { db, type LocalPatient } from '@/lib/db'
import { AdministrativeGender } from '@ultranos/shared-types'

function makePatient(overrides: Partial<LocalPatient> = {}): LocalPatient {
  return {
    id: crypto.randomUUID(),
    resourceType: 'Patient',
    name: [{ given: ['Ahmed'], family: 'Al-Rashid', text: 'Ahmed Al-Rashid' }],
    gender: AdministrativeGender.MALE,
    birthDate: '1985-03-15',
    birthYearOnly: false,
    _ultranos: {
      nameLocal: 'أحمد الراشد',
      nameLatin: 'Ahmed Al-Rashid',
      namePhonetic: 'AHMT ALRXT',
      nationalIdHash: 'sha256_abc123',
      isActive: true,
      createdAt: new Date().toISOString(),
    },
    meta: {
      lastUpdated: new Date().toISOString(),
    },
    ...overrides,
  }
}

describe('Dexie patient database', () => {
  beforeEach(async () => {
    await db.patients.clear()
  })

  it('should create the patients table with correct schema', () => {
    const table = db.table('patients')
    expect(table).toBeDefined()
    expect(table.name).toBe('patients')
  })

  it('should add and retrieve a patient by id', async () => {
    const patient = makePatient()
    await db.patients.add(patient)

    const retrieved = await db.patients.get(patient.id)
    expect(retrieved).toBeDefined()
    expect(retrieved!.id).toBe(patient.id)
    expect(retrieved!.name[0]!.text).toBe('Ahmed Al-Rashid')
  })

  it('should search patients by nameLocal index', async () => {
    const p1 = makePatient({ _ultranos: { ...makePatient()._ultranos, nameLocal: 'أحمد الراشد' } })
    const p2 = makePatient({ _ultranos: { ...makePatient()._ultranos, nameLocal: 'فاطمة حسن' } })
    await db.patients.bulkAdd([p1, p2])

    const results = await db.patients
      .where('_ultranos.nameLocal')
      .startsWithIgnoreCase('أحمد')
      .toArray()

    expect(results).toHaveLength(1)
    expect(results[0]!.id).toBe(p1.id)
  })

  it('should search patients by nationalIdHash index', async () => {
    const patient = makePatient({
      _ultranos: { ...makePatient()._ultranos, nationalIdHash: 'sha256_unique_hash' },
    })
    await db.patients.add(patient)

    const results = await db.patients
      .where('_ultranos.nationalIdHash')
      .equals('sha256_unique_hash')
      .toArray()

    expect(results).toHaveLength(1)
    expect(results[0]!.id).toBe(patient.id)
  })

  it('should support bulk add and count', async () => {
    const patients = Array.from({ length: 50 }, (_, i) =>
      makePatient({
        _ultranos: {
          ...makePatient()._ultranos,
          nameLocal: `Patient ${i}`,
          nationalIdHash: `hash_${i}`,
        },
      })
    )
    await db.patients.bulkAdd(patients)

    const count = await db.patients.count()
    expect(count).toBe(50)
  })

  it('should retrieve local records in under 500ms for 100 records', async () => {
    const patients = Array.from({ length: 100 }, (_, i) =>
      makePatient({
        _ultranos: {
          ...makePatient()._ultranos,
          nameLocal: `Patient ${i}`,
          nationalIdHash: `hash_${i}`,
        },
      })
    )
    await db.patients.bulkAdd(patients)

    const start = performance.now()
    const results = await db.patients
      .where('_ultranos.nameLocal')
      .startsWithIgnoreCase('Patient 5')
      .toArray()
    const elapsed = performance.now() - start

    expect(results.length).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(500)
  })

  it('should update a patient record', async () => {
    const patient = makePatient()
    await db.patients.add(patient)

    await db.patients.update(patient.id, {
      '_ultranos.nameLocal': 'Updated Name',
    })

    const updated = await db.patients.get(patient.id)
    expect(updated!._ultranos.nameLocal).toBe('Updated Name')
  })

  it('should delete a patient record', async () => {
    const patient = makePatient()
    await db.patients.add(patient)
    await db.patients.delete(patient.id)

    const result = await db.patients.get(patient.id)
    expect(result).toBeUndefined()
  })
})
