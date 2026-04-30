import { describe, it, expect } from 'vitest'
import { mapVitalsToObservations, LOINC } from '@/lib/vitals-fhir-mapper'

const ctx = {
  patientId: '00000000-0000-0000-0000-000000000001',
  encounterId: '00000000-0000-0000-0000-000000000002',
  hlcTimestamp: '1000000000000:00000:test-node',
  nowIso: '2026-04-28T12:00:00.000Z',
}

describe('mapVitalsToObservations', () => {
  it('creates weight observation with LOINC 29463-7', () => {
    const obs = mapVitalsToObservations(
      { weight: '70', height: '', systolic: '', diastolic: '', temperature: '', bmi: null },
      ctx,
    )
    expect(obs).toHaveLength(1)
    expect(obs[0].code.coding![0].code).toBe(LOINC.BODY_WEIGHT)
    expect(obs[0].valueQuantity!.value).toBe(70)
    expect(obs[0].valueQuantity!.unit).toBe('kg')
  })

  it('creates height observation with LOINC 8302-2', () => {
    const obs = mapVitalsToObservations(
      { weight: '', height: '175', systolic: '', diastolic: '', temperature: '', bmi: null },
      ctx,
    )
    expect(obs).toHaveLength(1)
    expect(obs[0].code.coding![0].code).toBe(LOINC.BODY_HEIGHT)
    expect(obs[0].valueQuantity!.value).toBe(175)
    expect(obs[0].valueQuantity!.unit).toBe('cm')
  })

  it('creates BMI observation when bmi is provided', () => {
    const obs = mapVitalsToObservations(
      { weight: '70', height: '175', systolic: '', diastolic: '', temperature: '', bmi: 22.86 },
      ctx,
    )
    const bmiObs = obs.find((o) => o.code.coding![0].code === LOINC.BMI)
    expect(bmiObs).toBeDefined()
    expect(bmiObs!.valueQuantity!.unit).toBe('kg/m2')
  })

  it('creates blood pressure observation with systolic and diastolic components', () => {
    const obs = mapVitalsToObservations(
      { weight: '', height: '', systolic: '120', diastolic: '80', temperature: '', bmi: null },
      ctx,
    )
    expect(obs).toHaveLength(1)
    expect(obs[0].code.coding![0].code).toBe(LOINC.BLOOD_PRESSURE)
    expect(obs[0].component).toHaveLength(2)
    expect(obs[0].component![0].code.coding![0].code).toBe(LOINC.SYSTOLIC_BP)
    expect(obs[0].component![0].valueQuantity!.value).toBe(120)
    expect(obs[0].component![1].code.coding![0].code).toBe(LOINC.DIASTOLIC_BP)
    expect(obs[0].component![1].valueQuantity!.value).toBe(80)
  })

  it('does not create BP observation when only systolic is provided', () => {
    const obs = mapVitalsToObservations(
      { weight: '', height: '', systolic: '120', diastolic: '', temperature: '', bmi: null },
      ctx,
    )
    expect(obs).toHaveLength(0)
  })

  it('does not create BP observation when only diastolic is provided', () => {
    const obs = mapVitalsToObservations(
      { weight: '', height: '', systolic: '', diastolic: '80', temperature: '', bmi: null },
      ctx,
    )
    expect(obs).toHaveLength(0)
  })

  it('creates temperature observation with LOINC 8310-5', () => {
    const obs = mapVitalsToObservations(
      { weight: '', height: '', systolic: '', diastolic: '', temperature: '37.2', bmi: null },
      ctx,
    )
    expect(obs).toHaveLength(1)
    expect(obs[0].code.coding![0].code).toBe(LOINC.BODY_TEMPERATURE)
    expect(obs[0].valueQuantity!.value).toBe(37.2)
    expect(obs[0].valueQuantity!.unit).toBe('Cel')
  })

  it('creates all observations when all vitals are provided', () => {
    const obs = mapVitalsToObservations(
      { weight: '70', height: '175', systolic: '120', diastolic: '80', temperature: '37', bmi: 22.86 },
      ctx,
    )
    // weight + height + BMI + BP (combined) + temperature = 5
    expect(obs).toHaveLength(5)
  })

  it('creates no observations when all fields are empty', () => {
    const obs = mapVitalsToObservations(
      { weight: '', height: '', systolic: '', diastolic: '', temperature: '', bmi: null },
      ctx,
    )
    expect(obs).toHaveLength(0)
  })

  it('links observations to the encounter', () => {
    const obs = mapVitalsToObservations(
      { weight: '70', height: '', systolic: '', diastolic: '', temperature: '', bmi: null },
      ctx,
    )
    expect(obs[0].encounter.reference).toBe(`Encounter/${ctx.encounterId}`)
    expect(obs[0].subject.reference).toBe(`Patient/${ctx.patientId}`)
  })

  it('sets FHIR Observation status to final', () => {
    const obs = mapVitalsToObservations(
      { weight: '70', height: '', systolic: '', diastolic: '', temperature: '', bmi: null },
      ctx,
    )
    expect(obs[0].status).toBe('final')
  })

  it('includes vital-signs category', () => {
    const obs = mapVitalsToObservations(
      { weight: '70', height: '', systolic: '', diastolic: '', temperature: '', bmi: null },
      ctx,
    )
    expect(obs[0].category![0].coding![0].code).toBe('vital-signs')
  })

  it('sets _ultranos.isOfflineCreated to true', () => {
    const obs = mapVitalsToObservations(
      { weight: '70', height: '', systolic: '', diastolic: '', temperature: '', bmi: null },
      ctx,
    )
    expect(obs[0]._ultranos.isOfflineCreated).toBe(true)
  })

  it('includes HLC timestamp', () => {
    const obs = mapVitalsToObservations(
      { weight: '70', height: '', systolic: '', diastolic: '', temperature: '', bmi: null },
      ctx,
    )
    expect(obs[0]._ultranos.hlcTimestamp).toBe(ctx.hlcTimestamp)
  })
})
