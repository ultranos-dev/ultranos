import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useSoapNoteStore } from '@/stores/soap-note-store'
import { db } from '@/lib/db'

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: {
    getState: () => ({
      getPractitionerRef: () => 'test-practitioner-123',
    }),
  },
}))

function resetStore() {
  useSoapNoteStore.setState({
    subjective: '',
    objective: '',
    encounterId: null,
    autosaveStatus: 'idle',
    lastSavedAt: null,
    decryptFailed: false,
  })
}

const DECRYPT_PLACEHOLDER = '[Encrypted Content]'

async function seedLedgerEntry(overrides: Record<string, unknown>) {
  await db.soapLedger.add({
    id: '11111111-1111-4000-8000-000000000001',
    encounterId: TEST_ENCOUNTER_ID,
    subjective: '',
    objective: '',
    assessment: '',
    plan: '',
    assessorRef: 'Practitioner/x',
    hlcTimestamp: '100:0:node',
    createdAt: new Date().toISOString(),
    ...overrides,
  } as never)
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

    it('should include assessorRef from auth session', async () => {
      useSoapNoteStore.getState().initForEncounter(TEST_ENCOUNTER_ID)
      useSoapNoteStore.getState().setSubjective('headache')
      await useSoapNoteStore.getState().persistToLedger()

      const entries = await db.soapLedger.toArray()
      expect(entries[0]!.assessorRef).toBe('Practitioner/test-practitioner-123')
    })

    it('should set autosaveStatus to error when no auth session exists', async () => {
      const mod = await import('@/stores/auth-session-store')
      const original = mod.useAuthSessionStore.getState
      try {
        mod.useAuthSessionStore.getState = () => ({
          ...original(),
          getPractitionerRef: () => { throw new Error('No authenticated session') },
        })

        useSoapNoteStore.getState().initForEncounter(TEST_ENCOUNTER_ID)
        useSoapNoteStore.getState().setSubjective('headache')
        await useSoapNoteStore.getState().persistToLedger()

        expect(useSoapNoteStore.getState().autosaveStatus).toBe('error')
      } finally {
        mod.useAuthSessionStore.getState = original
      }
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

  describe('decryption fail-safe safeguard', () => {
    it('blanks placeholder fields and flags decryptFailed on load', async () => {
      useSoapNoteStore.getState().initForEncounter(TEST_ENCOUNTER_ID)
      await seedLedgerEntry({
        subjective: DECRYPT_PLACEHOLDER,
        objective: DECRYPT_PLACEHOLDER,
        assessment: DECRYPT_PLACEHOLDER,
        plan: DECRYPT_PLACEHOLDER,
      })

      await useSoapNoteStore.getState().loadFromLedger(TEST_ENCOUNTER_ID)

      const s = useSoapNoteStore.getState()
      expect(s.decryptFailed).toBe(true)
      // The placeholder must never become editable clinical content.
      expect(s.subjective).toBe('')
      expect(s.objective).toBe('')
      expect(s.assessment).toBe('')
      expect(s.plan).toBe('')
    })

    it('blocks autosave while decryptFailed so the original is never overwritten', async () => {
      useSoapNoteStore.getState().initForEncounter(TEST_ENCOUNTER_ID)
      await seedLedgerEntry({ subjective: DECRYPT_PLACEHOLDER })
      await useSoapNoteStore.getState().loadFromLedger(TEST_ENCOUNTER_ID)
      expect(useSoapNoteStore.getState().decryptFailed).toBe(true)

      await db.soapLedger.clear()
      await useSoapNoteStore.getState().persistToLedger()

      // No new ledger entry appended while in the failed state.
      expect((await db.soapLedger.toArray()).length).toBe(0)
    })

    it('clears the flag on edit and allows saving fresh content as a new entry', async () => {
      useSoapNoteStore.getState().initForEncounter(TEST_ENCOUNTER_ID)
      await seedLedgerEntry({ subjective: DECRYPT_PLACEHOLDER })
      await useSoapNoteStore.getState().loadFromLedger(TEST_ENCOUNTER_ID)
      expect(useSoapNoteStore.getState().decryptFailed).toBe(true)

      useSoapNoteStore.getState().setSubjective('Fresh note for this visit')
      expect(useSoapNoteStore.getState().decryptFailed).toBe(false)

      await db.soapLedger.clear()
      await useSoapNoteStore.getState().persistToLedger()

      const entries = await db.soapLedger.toArray()
      expect(entries.length).toBe(1)
      expect(entries[0]!.subjective).toBe('Fresh note for this visit')
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
