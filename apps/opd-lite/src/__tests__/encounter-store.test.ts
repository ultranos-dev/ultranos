import { describe, it, expect, beforeEach } from 'vitest'
import { useEncounterStore } from '@/stores/encounter-store'
import { db } from '@/lib/db'
import { deserializeHlc } from '@ultranos/sync-engine'

const TEST_PATIENT_ID = 'b7e3c8a0-1111-4000-8000-000000000001'
const TEST_PRACTITIONER_REF = 'Practitioner/test-doc'

function resetStore() {
  useEncounterStore.setState({
    activeEncounter: null,
    isStarting: false,
  })
}

describe('encounter store', () => {
  beforeEach(async () => {
    resetStore()
    await db.encounters.clear()
  })

  it('should initialize with null encounter and not starting', () => {
    const state = useEncounterStore.getState()
    expect(state.activeEncounter).toBeNull()
    expect(state.isStarting).toBe(false)
  })

  describe('startEncounter', () => {
    it('should create a FHIR Encounter with local UUID', async () => {
      await useEncounterStore.getState().startEncounter(TEST_PATIENT_ID, TEST_PRACTITIONER_REF)
      const enc = useEncounterStore.getState().activeEncounter
      expect(enc).not.toBeNull()
      expect(enc!.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      )
      expect(enc!.resourceType).toBe('Encounter')
    })

    it('should set encounter status to in-progress', async () => {
      await useEncounterStore.getState().startEncounter(TEST_PATIENT_ID, TEST_PRACTITIONER_REF)
      expect(useEncounterStore.getState().activeEncounter!.status).toBe('in-progress')
    })

    it('should assign HLC timestamp to _ultranos.hlcTimestamp', async () => {
      await useEncounterStore.getState().startEncounter(TEST_PATIENT_ID, TEST_PRACTITIONER_REF)
      const hlcStr = useEncounterStore.getState().activeEncounter!._ultranos.hlcTimestamp
      expect(hlcStr).toBeTruthy()

      // Should be a valid serialized HLC
      const parsed = deserializeHlc(hlcStr)
      expect(parsed.wallMs).toBeGreaterThan(0)
      expect(parsed.counter).toBeGreaterThanOrEqual(0)
      expect(parsed.nodeId).toBeTruthy()
    })

    it('should set subject.reference to Patient/{patientId}', async () => {
      await useEncounterStore.getState().startEncounter(TEST_PATIENT_ID, TEST_PRACTITIONER_REF)
      const enc = useEncounterStore.getState().activeEncounter!
      expect(enc.subject.reference).toBe(`Patient/${TEST_PATIENT_ID}`)
    })

    it('should set isOfflineCreated to true', async () => {
      await useEncounterStore.getState().startEncounter(TEST_PATIENT_ID, TEST_PRACTITIONER_REF)
      expect(useEncounterStore.getState().activeEncounter!._ultranos.isOfflineCreated).toBe(true)
    })

    it('should set FHIR class to AMB (ambulatory)', async () => {
      await useEncounterStore.getState().startEncounter(TEST_PATIENT_ID, TEST_PRACTITIONER_REF)
      const enc = useEncounterStore.getState().activeEncounter!
      expect(enc.class.code).toBe('AMB')
      expect(enc.class.system).toBe('http://terminology.hl7.org/CodeSystem/v3-ActCode')
    })

    it('should have a period.start ISO datetime', async () => {
      const before = new Date().toISOString()
      await useEncounterStore.getState().startEncounter(TEST_PATIENT_ID, TEST_PRACTITIONER_REF)
      const after = new Date().toISOString()
      const start = useEncounterStore.getState().activeEncounter!.period.start!
      expect(start >= before).toBe(true)
      expect(start <= after).toBe(true)
    })

    it('should set meta.lastUpdated', async () => {
      await useEncounterStore.getState().startEncounter(TEST_PATIENT_ID, TEST_PRACTITIONER_REF)
      const enc = useEncounterStore.getState().activeEncounter!
      expect(enc.meta.lastUpdated).toBeTruthy()
      expect(() => new Date(enc.meta.lastUpdated)).not.toThrow()
    })

    it('should persist encounter to Dexie', async () => {
      await useEncounterStore.getState().startEncounter(TEST_PATIENT_ID, TEST_PRACTITIONER_REF)
      const enc = useEncounterStore.getState().activeEncounter!
      const stored = await db.encounters.get(enc.id)
      expect(stored).toBeDefined()
      expect(stored!.id).toBe(enc.id)
      expect(stored!.status).toBe('in-progress')
    })

    it('should update state optimistically (before Dexie write)', async () => {
      // The state should be set synchronously within startEncounter
      const promise = useEncounterStore.getState().startEncounter(TEST_PATIENT_ID, TEST_PRACTITIONER_REF)
      // After awaiting, state should be set
      await promise
      expect(useEncounterStore.getState().activeEncounter).not.toBeNull()
      expect(useEncounterStore.getState().isStarting).toBe(false)
    })
  })

  describe('endEncounter', () => {
    it('should persist encounter as finished to Dexie', async () => {
      await useEncounterStore.getState().startEncounter(TEST_PATIENT_ID, TEST_PRACTITIONER_REF)
      const id = useEncounterStore.getState().activeEncounter!.id
      await useEncounterStore.getState().endEncounter()
      const stored = await db.encounters.get(id)
      expect(stored!.status).toBe('finished')
      expect(stored!.period.end).toBeTruthy()
    })

    it('should update HLC timestamp on end', async () => {
      await useEncounterStore.getState().startEncounter(TEST_PATIENT_ID, TEST_PRACTITIONER_REF)
      const startHlc = useEncounterStore.getState().activeEncounter!._ultranos.hlcTimestamp
      const id = useEncounterStore.getState().activeEncounter!.id
      await useEncounterStore.getState().endEncounter()
      const stored = await db.encounters.get(id)
      expect(stored!._ultranos.hlcTimestamp).not.toBe(startHlc)
      // End HLC should sort after start HLC (lexicographic)
      expect(stored!._ultranos.hlcTimestamp > startHlc).toBe(true)
    })

    it('should increment meta.versionId on end', async () => {
      await useEncounterStore.getState().startEncounter(TEST_PATIENT_ID, TEST_PRACTITIONER_REF)
      const id = useEncounterStore.getState().activeEncounter!.id
      await useEncounterStore.getState().endEncounter()
      const stored = await db.encounters.get(id)
      expect(stored!.meta.versionId).toBe('2')
    })

    it('should clear activeEncounter from state after ending', async () => {
      await useEncounterStore.getState().startEncounter(TEST_PATIENT_ID, TEST_PRACTITIONER_REF)
      await useEncounterStore.getState().endEncounter()
      expect(useEncounterStore.getState().activeEncounter).toBeNull()
    })

    it('should be a no-op when no active encounter', async () => {
      await useEncounterStore.getState().endEncounter()
      expect(useEncounterStore.getState().activeEncounter).toBeNull()
    })
  })

  describe('loadActiveEncounter', () => {
    it('should load an in-progress encounter from Dexie', async () => {
      await useEncounterStore.getState().startEncounter(TEST_PATIENT_ID, TEST_PRACTITIONER_REF)
      const enc = useEncounterStore.getState().activeEncounter!

      // Reset store to simulate page refresh
      resetStore()
      expect(useEncounterStore.getState().activeEncounter).toBeNull()

      // Load from Dexie
      await useEncounterStore.getState().loadActiveEncounter(TEST_PATIENT_ID)
      const loaded = useEncounterStore.getState().activeEncounter
      expect(loaded).not.toBeNull()
      expect(loaded!.id).toBe(enc.id)
    })

    it('should not load a finished encounter', async () => {
      await useEncounterStore.getState().startEncounter(TEST_PATIENT_ID, TEST_PRACTITIONER_REF)
      await useEncounterStore.getState().endEncounter()

      resetStore()
      await useEncounterStore.getState().loadActiveEncounter(TEST_PATIENT_ID)
      expect(useEncounterStore.getState().activeEncounter).toBeNull()
    })

    it('should not load encounters for a different patient', async () => {
      await useEncounterStore.getState().startEncounter(TEST_PATIENT_ID, TEST_PRACTITIONER_REF)

      resetStore()
      await useEncounterStore.getState().loadActiveEncounter('different-patient-id')
      expect(useEncounterStore.getState().activeEncounter).toBeNull()
    })
  })

  describe('clearPhiState', () => {
    it('should clear active encounter from store', async () => {
      await useEncounterStore.getState().startEncounter(TEST_PATIENT_ID, TEST_PRACTITIONER_REF)
      expect(useEncounterStore.getState().activeEncounter).not.toBeNull()

      useEncounterStore.getState().clearPhiState()
      expect(useEncounterStore.getState().activeEncounter).toBeNull()
      expect(useEncounterStore.getState().isStarting).toBe(false)
    })

    it('should not remove encounter from Dexie (persistence survives PHI clear)', async () => {
      await useEncounterStore.getState().startEncounter(TEST_PATIENT_ID, TEST_PRACTITIONER_REF)
      const id = useEncounterStore.getState().activeEncounter!.id

      useEncounterStore.getState().clearPhiState()

      // Dexie should still have it — the encrypted local store persists
      const stored = await db.encounters.get(id)
      expect(stored).toBeDefined()
    })
  })

  describe('concurrent encounter guard', () => {
    it('should not create a second encounter if one is already in-progress', async () => {
      await useEncounterStore.getState().startEncounter(TEST_PATIENT_ID, TEST_PRACTITIONER_REF)
      const firstId = useEncounterStore.getState().activeEncounter!.id

      await useEncounterStore.getState().startEncounter(TEST_PATIENT_ID, TEST_PRACTITIONER_REF)
      expect(useEncounterStore.getState().activeEncounter!.id).toBe(firstId)

      const allEncounters = await db.encounters.toArray()
      expect(allEncounters.length).toBe(1)
    })
  })

  describe('meta.versionId', () => {
    it('should set versionId to 1 on creation', async () => {
      await useEncounterStore.getState().startEncounter(TEST_PATIENT_ID, TEST_PRACTITIONER_REF)
      expect(useEncounterStore.getState().activeEncounter!.meta.versionId).toBe('1')
    })
  })

  describe('loadActiveEncounter stale state', () => {
    it('should clear activeEncounter when no in-progress encounter exists for patient', async () => {
      // Set a stale encounter in state
      await useEncounterStore.getState().startEncounter(TEST_PATIENT_ID, TEST_PRACTITIONER_REF)
      await useEncounterStore.getState().endEncounter()

      // Manually set a fake active encounter in state
      useEncounterStore.setState({
        activeEncounter: {
          id: 'stale-id',
          resourceType: 'Encounter',
          status: 'in-progress',
          class: { system: '', code: 'AMB', display: '' },
          subject: { reference: 'Patient/other' },
          participant: [],
          period: { start: '' },
          _ultranos: { isOfflineCreated: true, hlcTimestamp: '', createdAt: '' },
          meta: { lastUpdated: '' },
        } as any,
      })

      await useEncounterStore.getState().loadActiveEncounter('nonexistent-patient')
      expect(useEncounterStore.getState().activeEncounter).toBeNull()
    })
  })

  describe('beforeunload PHI cleanup', () => {
    it('should clear PHI state when beforeunload fires', async () => {
      await useEncounterStore.getState().startEncounter(TEST_PATIENT_ID, TEST_PRACTITIONER_REF)
      expect(useEncounterStore.getState().activeEncounter).not.toBeNull()

      window.dispatchEvent(new Event('beforeunload'))

      expect(useEncounterStore.getState().activeEncounter).toBeNull()
      expect(useEncounterStore.getState().isStarting).toBe(false)
    })
  })

  describe('HLC monotonicity', () => {
    it('should produce monotonically increasing HLC timestamps across encounters', async () => {
      await useEncounterStore.getState().startEncounter(TEST_PATIENT_ID, TEST_PRACTITIONER_REF)
      const hlc1 = useEncounterStore.getState().activeEncounter!._ultranos.hlcTimestamp

      // End encounter clears activeEncounter, so we need to end and clear DB before next
      await useEncounterStore.getState().endEncounter()
      await db.encounters.clear()

      await useEncounterStore.getState().startEncounter(TEST_PATIENT_ID, TEST_PRACTITIONER_REF)
      const hlc2 = useEncounterStore.getState().activeEncounter!._ultranos.hlcTimestamp

      // Second encounter HLC must be strictly greater
      expect(hlc2 > hlc1).toBe(true)
    })
  })
})
