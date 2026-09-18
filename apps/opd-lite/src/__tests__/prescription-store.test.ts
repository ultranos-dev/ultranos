import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { usePrescriptionStore } from '@/stores/prescription-store'
import { db } from '@/lib/db'
import type { PrescriptionFormData } from '@/lib/prescription-config'
import { PrescriptionStatus } from '@ultranos/shared-types'

const baseForm: PrescriptionFormData = {
  medicationCode: 'RX001',
  medicationDisplay: 'Amoxicillin',
  medicationForm: 'Capsule',
  medicationStrength: '500 mg',
  dosageQuantity: '1',
  dosageUnit: 'tablet',
  frequencyCode: 'BID',
  durationDays: '7',
  notes: '',
}

const encounterId = 'enc-test-001'
const patientId = 'pat-test-001'
const practitionerRef = 'Practitioner/doc-test-001'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Smallest epoch-ms we accept as a "real" HLC wall clock (2020-01-01). An ISO
// date string like "2026-09-11T..." parses to 2026 via parseInt — far below this —
// so this threshold distinguishes a serialized HLC from a leaked ISO timestamp.
const MIN_REAL_WALL_MS = 1_577_836_800_000

async function waitForQueuedUpdate(resourceId?: string) {
  return vi.waitFor(async () => {
    const all = await db.syncQueue.toArray()
    const e = all.find(
      (x) =>
        x.resourceType === 'MedicationRequest' &&
        x.action === 'update' &&
        (resourceId ? x.resourceId === resourceId : true),
    )
    if (!e) throw new Error('update not enqueued yet')
    return e
  })
}

describe('usePrescriptionStore', () => {
  beforeEach(async () => {
    usePrescriptionStore.setState({
      pendingPrescriptions: [],
      isSaving: false,
      loadError: false,
    })
    await db.medications.clear()
    await db.syncQueue.clear()
  })

  afterEach(() => {
    // Restore any vi.spyOn mocks so they don't bleed into subsequent tests.
    vi.restoreAllMocks()
  })

  describe('addPrescription', () => {
    it('adds a prescription to the store', async () => {
      const store = usePrescriptionStore.getState()
      await store.addPrescription(baseForm, encounterId, patientId, practitionerRef)
      const state = usePrescriptionStore.getState()
      expect(state.pendingPrescriptions).toHaveLength(1)
      expect(state.pendingPrescriptions[0]!.medicationCodeableConcept.coding![0]!.display).toBe('Amoxicillin')
    })

    it('persists prescription to Dexie', async () => {
      const store = usePrescriptionStore.getState()
      const result = await store.addPrescription(baseForm, encounterId, patientId, practitionerRef)
      const saved = await db.medications.get(result.id)
      expect(saved).toBeDefined()
      expect(saved!.resourceType).toBe('MedicationRequest')
    })

    it('links prescription to active encounter and patient', async () => {
      const store = usePrescriptionStore.getState()
      const result = await store.addPrescription(baseForm, encounterId, patientId, practitionerRef)
      expect(result.encounter?.reference).toBe(`Encounter/${encounterId}`)
      expect(result.subject.reference).toBe(`Patient/${patientId}`)
    })

    it('sets prescriptionStatus to ACTIVE (Pending Fulfillment)', async () => {
      const store = usePrescriptionStore.getState()
      const result = await store.addPrescription(baseForm, encounterId, patientId, practitionerRef)
      expect(result._ultranos.prescriptionStatus).toBe(PrescriptionStatus.ACTIVE)
      expect(result.status).toBe('active')
    })

    it('assigns HLC timestamp', async () => {
      const store = usePrescriptionStore.getState()
      const result = await store.addPrescription(baseForm, encounterId, patientId, practitionerRef)
      expect(result._ultranos.hlcTimestamp).toBeTruthy()
      expect(result._ultranos.hlcTimestamp.split(':').length).toBe(3)
    })

    it('throws if a save is already in progress', async () => {
      usePrescriptionStore.setState({ isSaving: true })
      const store = usePrescriptionStore.getState()
      await expect(
        store.addPrescription(baseForm, encounterId, patientId, practitionerRef),
      ).rejects.toThrow('A prescription save is already in progress')
    })

    it('resets isSaving after successful save', async () => {
      const store = usePrescriptionStore.getState()
      await store.addPrescription(baseForm, encounterId, patientId, practitionerRef)
      expect(usePrescriptionStore.getState().isSaving).toBe(false)
    })

    it('stores interaction check result when provided', async () => {
      const store = usePrescriptionStore.getState()
      const result = await store.addPrescription(
        baseForm, encounterId, patientId, practitionerRef,
        { interactionCheckResult: 'CLEAR' },
      )
      expect(result._ultranos.interactionCheckResult).toBe('CLEAR')
      const saved = await db.medications.get(result.id)
      expect(saved!._ultranos.interactionCheckResult).toBe('CLEAR')
    })

    it('stores BLOCKED result with override reason', async () => {
      const store = usePrescriptionStore.getState()
      const result = await store.addPrescription(
        baseForm, encounterId, patientId, practitionerRef,
        { interactionCheckResult: 'BLOCKED', interactionOverrideReason: 'Benefit outweighs risk' },
      )
      expect(result._ultranos.interactionCheckResult).toBe('BLOCKED')
      expect(result._ultranos.interactionOverrideReason).toBe('Benefit outweighs risk')
    })

    it('defaults to UNAVAILABLE when no interaction context', async () => {
      const store = usePrescriptionStore.getState()
      const result = await store.addPrescription(baseForm, encounterId, patientId, practitionerRef)
      expect(result._ultranos.interactionCheckResult).toBe('UNAVAILABLE')
    })
  })

  describe('removePrescription', () => {
    it('removes prescription from the store (soft-cancel)', async () => {
      const store = usePrescriptionStore.getState()
      const result = await store.addPrescription(baseForm, encounterId, patientId, practitionerRef)
      await usePrescriptionStore.getState().removePrescription(result.id)
      expect(usePrescriptionStore.getState().pendingPrescriptions).toHaveLength(0)
    })

    it('creates a cancelled record in Dexie (append-only, original preserved)', async () => {
      const store = usePrescriptionStore.getState()
      const result = await store.addPrescription(baseForm, encounterId, patientId, practitionerRef)
      await usePrescriptionStore.getState().removePrescription(result.id)
      // Original record preserved (Tier 1 append-only)
      const original = await db.medications.get(result.id)
      expect(original).toBeDefined()
      expect(original!.status).toBe('active')
      // A separate cancelled record is created
      const allMeds = await db.medications.toArray()
      const cancelled = allMeds.find((m) => m.status === 'cancelled')
      expect(cancelled).toBeDefined()
      expect(cancelled!.status).toBe('cancelled')
    })

    it('gives the cancellation a valid UUID id so it fits the uuid id column at the Hub', async () => {
      const store = usePrescriptionStore.getState()
      const result = await store.addPrescription(baseForm, encounterId, patientId, practitionerRef)
      await usePrescriptionStore.getState().removePrescription(result.id)
      const cancelled = (await db.medications.toArray()).find((m) => m.status === 'cancelled')
      expect(cancelled).toBeDefined()
      expect(cancelled!.id).toMatch(UUID_RE)
      expect(cancelled!.id).not.toBe(result.id)
    })

    it('links the cancellation back to the original via priorPrescription', async () => {
      const store = usePrescriptionStore.getState()
      const result = await store.addPrescription(baseForm, encounterId, patientId, practitionerRef)
      await usePrescriptionStore.getState().removePrescription(result.id)
      const cancelled = (await db.medications.toArray()).find((m) => m.status === 'cancelled')
      expect(cancelled!.priorPrescription?.reference).toBe(`MedicationRequest/${result.id}`)
    })

    it('enqueues the cancellation with a serialized HLC timestamp and a uuid resourceId', async () => {
      const store = usePrescriptionStore.getState()
      const result = await store.addPrescription(baseForm, encounterId, patientId, practitionerRef)
      await usePrescriptionStore.getState().removePrescription(result.id)

      const entry = await waitForQueuedUpdate()
      const wallMs = parseInt(entry.hlcTimestamp.split(':')[0]!, 10)
      expect(wallMs).toBeGreaterThan(MIN_REAL_WALL_MS)
      expect(entry.resourceId).toMatch(UUID_RE)
    })

    it('does nothing if prescription not found', async () => {
      const store = usePrescriptionStore.getState()
      await store.removePrescription('nonexistent-id')
      expect(usePrescriptionStore.getState().pendingPrescriptions).toHaveLength(0)
    })
  })

  describe('loadPrescriptions', () => {
    it('loads active prescriptions for an encounter', async () => {
      const store = usePrescriptionStore.getState()
      await store.addPrescription(baseForm, encounterId, patientId, practitionerRef)

      // Clear store state to simulate fresh load
      usePrescriptionStore.setState({ pendingPrescriptions: [] })
      await usePrescriptionStore.getState().loadPrescriptions(encounterId)

      expect(usePrescriptionStore.getState().pendingPrescriptions).toHaveLength(1)
    })

    it('filters out cancelled prescriptions', async () => {
      const store = usePrescriptionStore.getState()
      const result = await store.addPrescription(baseForm, encounterId, patientId, practitionerRef)
      await usePrescriptionStore.getState().removePrescription(result.id)

      usePrescriptionStore.setState({ pendingPrescriptions: [] })
      await usePrescriptionStore.getState().loadPrescriptions(encounterId)

      expect(usePrescriptionStore.getState().pendingPrescriptions).toHaveLength(0)
    })

    it('returns empty array for encounter with no prescriptions', async () => {
      await usePrescriptionStore.getState().loadPrescriptions('unknown-encounter')
      expect(usePrescriptionStore.getState().pendingPrescriptions).toHaveLength(0)
    })
  })

  describe('applyPharmacyToPending', () => {
    it('stamps the pharmacy performer on every pending prescription and bumps version', async () => {
      const store = usePrescriptionStore.getState()
      await store.addPrescription(baseForm, encounterId, patientId, practitionerRef)
      await usePrescriptionStore.getState().addPrescription(
        { ...baseForm, medicationCode: 'RX002', medicationDisplay: 'Paracetamol' },
        encounterId, patientId, practitionerRef,
      )

      await usePrescriptionStore.getState().applyPharmacyToPending({ id: 'ph1', name: 'Kabul City Pharmacy' })

      const state = usePrescriptionStore.getState()
      expect(state.pendingPrescriptions).toHaveLength(2)
      for (const rx of state.pendingPrescriptions) {
        expect(rx.dispenseRequest?.performer).toEqual({ reference: 'Organization/ph1', display: 'Kabul City Pharmacy' })
        expect(rx.meta.versionId).toBe('2')
        const saved = await db.medications.get(rx.id)
        expect(saved!.dispenseRequest?.performer?.reference).toBe('Organization/ph1')
      }
    })

    it('clears the performer on all pending prescriptions when passed null', async () => {
      const store = usePrescriptionStore.getState()
      await store.addPrescription(baseForm, encounterId, patientId, practitionerRef)
      await usePrescriptionStore.getState().applyPharmacyToPending({ id: 'ph1', name: 'X' })
      await usePrescriptionStore.getState().applyPharmacyToPending(null)
      const rx = usePrescriptionStore.getState().pendingPrescriptions[0]
      expect(rx!.dispenseRequest?.performer).toBeUndefined()
    })

    it('is a no-op when there are no pending prescriptions', async () => {
      await usePrescriptionStore.getState().applyPharmacyToPending({ id: 'ph1', name: 'X' })
      expect(usePrescriptionStore.getState().pendingPrescriptions).toHaveLength(0)
    })

    it('enqueues the pharmacy update with a serialized HLC timestamp (not an ISO date)', async () => {
      const store = usePrescriptionStore.getState()
      const result = await store.addPrescription(baseForm, encounterId, patientId, practitionerRef)
      await usePrescriptionStore.getState().applyPharmacyToPending({ id: 'ph1', name: 'X' })

      const entry = await waitForQueuedUpdate(result.id)
      const wallMs = parseInt(entry.hlcTimestamp.split(':')[0]!, 10)
      expect(wallMs).toBeGreaterThan(MIN_REAL_WALL_MS)
    })
  })

  describe('clearPhiState', () => {
    it('clears all prescriptions from store', async () => {
      const store = usePrescriptionStore.getState()
      await store.addPrescription(baseForm, encounterId, patientId, practitionerRef)
      usePrescriptionStore.getState().clearPhiState()
      expect(usePrescriptionStore.getState().pendingPrescriptions).toHaveLength(0)
    })

    it('resets isSaving flag', () => {
      usePrescriptionStore.setState({ isSaving: true })
      usePrescriptionStore.getState().clearPhiState()
      expect(usePrescriptionStore.getState().isSaving).toBe(false)
    })

    it('resets loadError flag', () => {
      usePrescriptionStore.setState({ loadError: true })
      usePrescriptionStore.getState().clearPhiState()
      expect(usePrescriptionStore.getState().loadError).toBe(false)
    })
  })

  describe('loadPrescriptions — 4-state error handling', () => {
    it('sets loadError when Dexie read throws, not a silent empty', async () => {
      // Simulate Dexie failure. Use direct property assignment (not vi.spyOn)
      // because Dexie prototype methods may not be configurable — vi.spyOn +
      // mockRestore() is not guaranteed to work on them. We save + restore
      // the original manually in try/finally.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tableObj = db.medications as unknown as Record<string, any>
      const originalWhere = tableObj.where
      tableObj.where = () => { throw new Error('IndexedDB unavailable') }

      try {
        await expect(
          usePrescriptionStore.getState().loadPrescriptions(encounterId)
        ).rejects.toThrow('Failed to load prescriptions')

        // PHI safety: error flag must be set so consumers can show unavailable
        expect(usePrescriptionStore.getState().loadError).toBe(true)
        // Must NOT leave an empty list as if successfully loaded zero
        expect(usePrescriptionStore.getState().pendingPrescriptions).toHaveLength(0)
      } finally {
        tableObj.where = originalWhere
      }
    })

    it('clears loadError and loads data on successful call after a prior error', async () => {
      usePrescriptionStore.setState({ loadError: true })
      // DB is empty — successful load of zero records
      await usePrescriptionStore.getState().loadPrescriptions(encounterId)
      expect(usePrescriptionStore.getState().loadError).toBe(false)
    })
  })
})
