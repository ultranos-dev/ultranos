import { describe, it, expect, beforeEach } from 'vitest'
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

describe('usePrescriptionStore', () => {
  beforeEach(async () => {
    usePrescriptionStore.setState({
      pendingPrescriptions: [],
      isSaving: false,
    })
    await db.medications.clear()
  })

  describe('addPrescription', () => {
    it('adds a prescription to the store', async () => {
      const store = usePrescriptionStore.getState()
      await store.addPrescription(baseForm, encounterId, patientId, practitionerRef)
      const state = usePrescriptionStore.getState()
      expect(state.pendingPrescriptions).toHaveLength(1)
      expect(state.pendingPrescriptions[0].medicationCodeableConcept.coding[0].display).toBe('Amoxicillin')
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
  })

  describe('removePrescription', () => {
    it('removes prescription from the store (soft-cancel)', async () => {
      const store = usePrescriptionStore.getState()
      const result = await store.addPrescription(baseForm, encounterId, patientId, practitionerRef)
      await usePrescriptionStore.getState().removePrescription(result.id)
      expect(usePrescriptionStore.getState().pendingPrescriptions).toHaveLength(0)
    })

    it('sets status to cancelled in Dexie (not deleted)', async () => {
      const store = usePrescriptionStore.getState()
      const result = await store.addPrescription(baseForm, encounterId, patientId, practitionerRef)
      await usePrescriptionStore.getState().removePrescription(result.id)
      const saved = await db.medications.get(result.id)
      expect(saved).toBeDefined()
      expect(saved!.status).toBe('cancelled')
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
  })
})
