import { describe, it, expect, beforeEach } from 'vitest'
import { useVitalsStore } from '@/stores/vitals-store'
import { db } from '@/lib/db'
import { LOINC } from '@/lib/vitals-fhir-mapper'

beforeEach(async () => {
  useVitalsStore.getState().clearPhiState()
  // Ensure DB connection is fresh — protects against cross-test contamination
  // from shared fake-indexeddb singleton (e.g., interaction-service.test.ts
  // seeding vocabulary can leave stale transaction state).
  if (!db.isOpen()) {
    await db.open()
  }
  await db.observations.clear()
  await db.syncQueue.clear()
})

describe('useVitalsStore', () => {
  it('initializes with empty values', () => {
    const state = useVitalsStore.getState()
    expect(state.weight).toBe('')
    expect(state.height).toBe('')
    expect(state.systolic).toBe('')
    expect(state.diastolic).toBe('')
    expect(state.temperature).toBe('')
    expect(state.encounterId).toBeNull()
  })

  it('sets vital values', () => {
    useVitalsStore.getState().setWeight('70')
    useVitalsStore.getState().setHeight('175')
    useVitalsStore.getState().setSystolic('120')
    useVitalsStore.getState().setDiastolic('80')
    useVitalsStore.getState().setTemperature('37.2')

    const state = useVitalsStore.getState()
    expect(state.weight).toBe('70')
    expect(state.height).toBe('175')
    expect(state.systolic).toBe('120')
    expect(state.diastolic).toBe('80')
    expect(state.temperature).toBe('37.2')
  })

  it('calculates BMI from weight and height', () => {
    useVitalsStore.getState().setWeight('70')
    useVitalsStore.getState().setHeight('175')
    const bmi = useVitalsStore.getState().getBmi()
    expect(bmi).toBeCloseTo(22.86, 1)
  })

  it('returns null BMI when weight or height is empty', () => {
    useVitalsStore.getState().setWeight('70')
    expect(useVitalsStore.getState().getBmi()).toBeNull()
  })

  it('returns range statuses for abnormal values', () => {
    useVitalsStore.getState().setTemperature('42')
    useVitalsStore.getState().setSystolic('200')
    const statuses = useVitalsStore.getState().getRangeStatuses()
    expect(statuses.temperature).toBe('panic')
    expect(statuses.systolic).toBe('panic')
  })

  it('omits normal values from range statuses', () => {
    useVitalsStore.getState().setTemperature('37')
    const statuses = useVitalsStore.getState().getRangeStatuses()
    expect(statuses.temperature).toBeUndefined()
  })

  it('initializes for encounter and clears previous values', () => {
    useVitalsStore.getState().setWeight('70')
    useVitalsStore.getState().initForEncounter('enc-1', 'pat-1')
    const state = useVitalsStore.getState()
    expect(state.weight).toBe('')
    expect(state.encounterId).toBe('enc-1')
    expect(state.patientId).toBe('pat-1')
  })

  it('persists observations to Dexie', async () => {
    useVitalsStore.getState().initForEncounter('enc-1', 'pat-1')
    useVitalsStore.getState().setWeight('70')
    useVitalsStore.getState().setTemperature('37.5')

    await useVitalsStore.getState().persistObservations()

    const saved = await db.observations.toArray()
    expect(saved.length).toBe(2) // weight + temperature

    const weightObs = saved.find((o) => o.code.coding![0].code === LOINC.BODY_WEIGHT)
    expect(weightObs).toBeDefined()
    expect(weightObs!.valueQuantity!.value).toBe(70)
    expect(weightObs!.encounter.reference).toBe('Encounter/enc-1')
    expect(weightObs!.subject.reference).toBe('Patient/pat-1')
  })

  it('appends new observations on re-save (Tier 2 addenda)', async () => {
    useVitalsStore.getState().initForEncounter('enc-1', 'pat-1')
    useVitalsStore.getState().setWeight('70')
    await useVitalsStore.getState().persistObservations()

    // Change weight and re-save
    useVitalsStore.getState().setWeight('75')
    useVitalsStore.setState({ autosaveStatus: 'idle' })
    await useVitalsStore.getState().persistObservations()

    const saved = await db.observations.toArray()
    expect(saved.length).toBe(2) // appended, not replaced — both versions kept
    const weights = saved.map((o) => o.valueQuantity!.value)
    expect(weights).toContain(70)
    expect(weights).toContain(75)
  })

  it('loads the latest observation per LOINC code after multiple saves', async () => {
    useVitalsStore.getState().initForEncounter('enc-1', 'pat-1')
    useVitalsStore.getState().setWeight('70')
    await useVitalsStore.getState().persistObservations()

    useVitalsStore.getState().setWeight('75')
    useVitalsStore.setState({ autosaveStatus: 'idle' })
    await useVitalsStore.getState().persistObservations()

    // Reset and reload — should get latest (75)
    useVitalsStore.getState().initForEncounter('enc-1', 'pat-1')
    await useVitalsStore.getState().loadFromObservations('enc-1')
    expect(useVitalsStore.getState().weight).toBe('75')
  })

  it('loads observations from Dexie', async () => {
    useVitalsStore.getState().initForEncounter('enc-1', 'pat-1')
    useVitalsStore.getState().setWeight('70')
    useVitalsStore.getState().setHeight('175')
    useVitalsStore.getState().setSystolic('120')
    useVitalsStore.getState().setDiastolic('80')
    useVitalsStore.getState().setTemperature('37.5')
    await useVitalsStore.getState().persistObservations()

    // Reset store
    useVitalsStore.getState().initForEncounter('enc-1', 'pat-1')
    expect(useVitalsStore.getState().weight).toBe('')

    // Load from observations
    await useVitalsStore.getState().loadFromObservations('enc-1')
    const state = useVitalsStore.getState()
    expect(state.weight).toBe('70')
    expect(state.height).toBe('175')
    expect(state.systolic).toBe('120')
    expect(state.diastolic).toBe('80')
    expect(state.temperature).toBe('37.5')
  })

  it('does not save when no data entered', async () => {
    useVitalsStore.getState().initForEncounter('enc-1', 'pat-1')
    await useVitalsStore.getState().persistObservations()

    const saved = await db.observations.toArray()
    expect(saved.length).toBe(0)
  })

  it('sets autosaveStatus to saved on success', async () => {
    useVitalsStore.getState().initForEncounter('enc-1', 'pat-1')
    useVitalsStore.getState().setWeight('70')
    await useVitalsStore.getState().persistObservations()
    expect(useVitalsStore.getState().autosaveStatus).toBe('saved')
  })

  it('clears PHI state', () => {
    useVitalsStore.getState().setWeight('70')
    useVitalsStore.getState().clearPhiState()
    expect(useVitalsStore.getState().weight).toBe('')
    expect(useVitalsStore.getState().encounterId).toBeNull()
  })
})
