import { describe, it, expect, beforeEach } from 'vitest'
import { useSoapNoteStore } from '@/stores/soap-note-store'
import { db } from '@/lib/db'

function resetStore() {
  useSoapNoteStore.setState({
    subjective: '',
    objective: '',
    encounterId: null,
    autosaveStatus: 'idle',
    lastSavedAt: null,
  })
}

const TEST_ENCOUNTER_ID = 'e7e3c8a0-2222-4000-8000-000000000001'

describe('soap note store', () => {
  beforeEach(async () => {
    resetStore()
    await db.soapLedger.clear()
  })

  it('should initialize with empty subjective and objective', () => {
    const state = useSoapNoteStore.getState()
    expect(state.subjective).toBe('')
    expect(state.objective).toBe('')
    expect(state.encounterId).toBeNull()
    expect(state.autosaveStatus).toBe('idle')
  })

  describe('setSubjective', () => {
    it('should update subjective text', () => {
      useSoapNoteStore.getState().setSubjective('Patient reports headache')
      expect(useSoapNoteStore.getState().subjective).toBe('Patient reports headache')
    })
  })

  describe('setObjective', () => {
    it('should update objective text', () => {
      useSoapNoteStore.getState().setObjective('BP 120/80')
      expect(useSoapNoteStore.getState().objective).toBe('BP 120/80')
    })
  })

  describe('initForEncounter', () => {
    it('should set the encounter ID and reset note content', () => {
      useSoapNoteStore.getState().setSubjective('old text')
      useSoapNoteStore.getState().initForEncounter(TEST_ENCOUNTER_ID)
      const state = useSoapNoteStore.getState()
      expect(state.encounterId).toBe(TEST_ENCOUNTER_ID)
      expect(state.subjective).toBe('')
      expect(state.objective).toBe('')
    })
  })

  describe('persistToLedger', () => {
    it('should write an entry to the soapLedger Dexie table', async () => {
      useSoapNoteStore.getState().initForEncounter(TEST_ENCOUNTER_ID)
      useSoapNoteStore.getState().setSubjective('headache')
      useSoapNoteStore.getState().setObjective('BP 140/90')

      await useSoapNoteStore.getState().persistToLedger()

      const entries = await db.soapLedger.toArray()
      expect(entries.length).toBe(1)
      expect(entries[0]!.subjective).toBe('headache')
      expect(entries[0]!.objective).toBe('BP 140/90')
      expect(entries[0]!.encounterId).toBe(TEST_ENCOUNTER_ID)
    })

    it('should create append-only entries (not overwrite)', async () => {
      useSoapNoteStore.getState().initForEncounter(TEST_ENCOUNTER_ID)
      useSoapNoteStore.getState().setSubjective('v1')
      await useSoapNoteStore.getState().persistToLedger()

      useSoapNoteStore.getState().setSubjective('v2')
      await useSoapNoteStore.getState().persistToLedger()

      const entries = await db.soapLedger.orderBy('hlcTimestamp').toArray()
      expect(entries.length).toBe(2)
      expect(entries[0]!.subjective).toBe('v1')
      expect(entries[1]!.subjective).toBe('v2')
    })

    it('should include HLC timestamp in each ledger entry', async () => {
      useSoapNoteStore.getState().initForEncounter(TEST_ENCOUNTER_ID)
      useSoapNoteStore.getState().setSubjective('test')
      await useSoapNoteStore.getState().persistToLedger()

      const entries = await db.soapLedger.toArray()
      expect(entries[0]!.hlcTimestamp).toBeTruthy()
    })

    it('should set autosaveStatus to saved after persist', async () => {
      useSoapNoteStore.getState().initForEncounter(TEST_ENCOUNTER_ID)
      useSoapNoteStore.getState().setSubjective('test')
      await useSoapNoteStore.getState().persistToLedger()

      expect(useSoapNoteStore.getState().autosaveStatus).toBe('saved')
    })

    it('should not persist if no encounter ID is set', async () => {
      useSoapNoteStore.getState().setSubjective('orphan text')
      await useSoapNoteStore.getState().persistToLedger()

      const entries = await db.soapLedger.toArray()
      expect(entries.length).toBe(0)
    })

    it('should skip if a save is already in-flight', async () => {
      useSoapNoteStore.getState().initForEncounter(TEST_ENCOUNTER_ID)
      useSoapNoteStore.getState().setSubjective('test')

      // Manually set status to saving to simulate in-flight
      useSoapNoteStore.setState({ autosaveStatus: 'saving' })
      await useSoapNoteStore.getState().persistToLedger()

      const entries = await db.soapLedger.toArray()
      expect(entries.length).toBe(0)
    })

    it('should update lastSavedAt timestamp after persist', async () => {
      useSoapNoteStore.getState().initForEncounter(TEST_ENCOUNTER_ID)
      useSoapNoteStore.getState().setSubjective('test')
      await useSoapNoteStore.getState().persistToLedger()

      expect(useSoapNoteStore.getState().lastSavedAt).not.toBeNull()
    })
  })

  describe('loadFromLedger', () => {
    it('should discard stale load if encounter changed', async () => {
      const OTHER_ENCOUNTER_ID = 'e7e3c8a0-3333-4000-8000-000000000002'

      useSoapNoteStore.getState().initForEncounter(TEST_ENCOUNTER_ID)
      useSoapNoteStore.getState().setSubjective('old encounter data')
      await useSoapNoteStore.getState().persistToLedger()

      // Switch to a different encounter before loading
      useSoapNoteStore.getState().initForEncounter(OTHER_ENCOUNTER_ID)

      // Load from the OLD encounter — should be discarded
      await useSoapNoteStore.getState().loadFromLedger(TEST_ENCOUNTER_ID)

      expect(useSoapNoteStore.getState().encounterId).toBe(OTHER_ENCOUNTER_ID)
      expect(useSoapNoteStore.getState().subjective).toBe('')
    })

    it('should load the latest ledger entry for the encounter', async () => {
      useSoapNoteStore.getState().initForEncounter(TEST_ENCOUNTER_ID)
      useSoapNoteStore.getState().setSubjective('first')
      useSoapNoteStore.getState().setObjective('first-obj')
      await useSoapNoteStore.getState().persistToLedger()

      useSoapNoteStore.getState().setSubjective('latest')
      useSoapNoteStore.getState().setObjective('latest-obj')
      await useSoapNoteStore.getState().persistToLedger()

      // Reset store and reload — initForEncounter sets the ID so loadFromLedger's guard passes
      resetStore()
      useSoapNoteStore.getState().initForEncounter(TEST_ENCOUNTER_ID)
      await useSoapNoteStore.getState().loadFromLedger(TEST_ENCOUNTER_ID)

      expect(useSoapNoteStore.getState().subjective).toBe('latest')
      expect(useSoapNoteStore.getState().objective).toBe('latest-obj')
    })
  })

  describe('clearPhiState', () => {
    it('should clear all note content', () => {
      useSoapNoteStore.getState().setSubjective('private data')
      useSoapNoteStore.getState().setObjective('private findings')
      useSoapNoteStore.getState().clearPhiState()

      const state = useSoapNoteStore.getState()
      expect(state.subjective).toBe('')
      expect(state.objective).toBe('')
      expect(state.encounterId).toBeNull()
    })
  })
})
