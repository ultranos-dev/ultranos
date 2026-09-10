import { describe, it, expect, beforeEach } from 'vitest'
import { useLabOrderStore } from '@/stores/lab-order-store'
import { db } from '@/lib/db'
import type { LabOrderInput } from '@/lib/lab-order-mapper'

const baseInput: LabOrderInput = {
  testCode: '58410-2',
  testDisplay: 'CBC panel',
  priority: 'routine',
  reasonText: 'suspected anemia',
  specialInstructions: 'fasting sample',
}

const encounterId = 'enc-lab-001'
const patientId = 'pat-lab-001'
const practitionerRef = 'Practitioner/doc-lab-001'

describe('useLabOrderStore', () => {
  beforeEach(async () => {
    useLabOrderStore.setState({ pendingOrders: [], isSaving: false })
    await db.serviceRequests.clear()
  })

  describe('addLabOrder', () => {
    it('adds a lab order to the store', async () => {
      await useLabOrderStore.getState().addLabOrder(baseInput, encounterId, patientId, practitionerRef)
      const state = useLabOrderStore.getState()
      expect(state.pendingOrders).toHaveLength(1)
      expect(state.pendingOrders[0]!.code.coding![0]!.display).toBe('CBC panel')
    })

    it('persists the ServiceRequest to Dexie', async () => {
      const result = await useLabOrderStore.getState().addLabOrder(baseInput, encounterId, patientId, practitionerRef)
      const saved = await db.serviceRequests.get(result.id)
      expect(saved).toBeDefined()
      expect(saved!.resourceType).toBe('ServiceRequest')
      expect(saved!.intent).toBe('order')
    })

    it('links the order to the active encounter and patient', async () => {
      const result = await useLabOrderStore.getState().addLabOrder(baseInput, encounterId, patientId, practitionerRef)
      expect(result.encounter?.reference).toBe(`Encounter/${encounterId}`)
      expect(result.subject.reference).toBe(`Patient/${patientId}`)
      expect(result.requester.reference).toBe(practitionerRef)
    })

    it('assigns an HLC timestamp', async () => {
      const result = await useLabOrderStore.getState().addLabOrder(baseInput, encounterId, patientId, practitionerRef)
      expect(result._ultranos.hlcTimestamp).toBeTruthy()
      expect(result._ultranos.hlcTimestamp.split(':').length).toBe(3)
    })

    it('carries clinical reason (PHI) and operational special instructions', async () => {
      const result = await useLabOrderStore.getState().addLabOrder(baseInput, encounterId, patientId, practitionerRef)
      expect(result.reasonCode?.[0]?.text).toBe('suspected anemia')
      expect(result._ultranos.specialInstructions).toBe('fasting sample')
    })

    it('throws if a save is already in progress', async () => {
      useLabOrderStore.setState({ isSaving: true })
      await expect(
        useLabOrderStore.getState().addLabOrder(baseInput, encounterId, patientId, practitionerRef),
      ).rejects.toThrow('A lab order save is already in progress')
    })

    it('resets isSaving after a successful save', async () => {
      await useLabOrderStore.getState().addLabOrder(baseInput, encounterId, patientId, practitionerRef)
      expect(useLabOrderStore.getState().isSaving).toBe(false)
    })
  })

  describe('cancelLabOrder', () => {
    it('revokes the order and removes it from the store', async () => {
      const result = await useLabOrderStore.getState().addLabOrder(baseInput, encounterId, patientId, practitionerRef)
      await useLabOrderStore.getState().cancelLabOrder(result.id)
      expect(useLabOrderStore.getState().pendingOrders).toHaveLength(0)
      const saved = await db.serviceRequests.get(result.id)
      expect(saved!.status).toBe('revoked')
    })

    it('does nothing if the order is not found', async () => {
      await useLabOrderStore.getState().cancelLabOrder('nonexistent-id')
      expect(useLabOrderStore.getState().pendingOrders).toHaveLength(0)
    })
  })

  describe('loadOrders', () => {
    it('loads active orders for an encounter', async () => {
      await useLabOrderStore.getState().addLabOrder(baseInput, encounterId, patientId, practitionerRef)
      useLabOrderStore.setState({ pendingOrders: [] })
      await useLabOrderStore.getState().loadOrders(encounterId)
      expect(useLabOrderStore.getState().pendingOrders).toHaveLength(1)
    })

    it('excludes revoked orders', async () => {
      const result = await useLabOrderStore.getState().addLabOrder(baseInput, encounterId, patientId, practitionerRef)
      await useLabOrderStore.getState().cancelLabOrder(result.id)
      useLabOrderStore.setState({ pendingOrders: [] })
      await useLabOrderStore.getState().loadOrders(encounterId)
      expect(useLabOrderStore.getState().pendingOrders).toHaveLength(0)
    })

    it('returns empty for an encounter with no orders', async () => {
      await useLabOrderStore.getState().loadOrders('unknown-encounter')
      expect(useLabOrderStore.getState().pendingOrders).toHaveLength(0)
    })
  })

  describe('clearPhiState', () => {
    it('clears all orders and resets isSaving', async () => {
      await useLabOrderStore.getState().addLabOrder(baseInput, encounterId, patientId, practitionerRef)
      useLabOrderStore.getState().clearPhiState()
      expect(useLabOrderStore.getState().pendingOrders).toHaveLength(0)
      expect(useLabOrderStore.getState().isSaving).toBe(false)
    })
  })
})
