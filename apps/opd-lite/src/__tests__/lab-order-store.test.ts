import { describe, it, expect, beforeEach, vi } from 'vitest'
import { compareHlc, deserializeHlc } from '@ultranos/sync-engine'
import { useLabOrderStore } from '@/stores/lab-order-store'
import { db } from '@/lib/db'
import type { LabOrderInput } from '@/lib/lab-order-mapper'

/** The queue entry for a resource with the given action (default 'update'). */
async function pendingEntry(resourceId: string, action: 'create' | 'update' = 'update') {
  return vi.waitFor(async () => {
    const all = await db.syncQueue.toArray()
    const e = all.find((x) => x.resourceId === resourceId && x.action === action)
    if (!e) throw new Error(`${action} not enqueued yet`)
    return e
  })
}

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
    await db.syncQueue.clear()
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

    it('enqueues the revoke with a fresh HLC strictly newer than the create (so the cancellation syncs)', async () => {
      const result = await useLabOrderStore.getState().addLabOrder(baseInput, encounterId, patientId, practitionerRef)
      const createHlc = result._ultranos.hlcTimestamp

      await useLabOrderStore.getState().cancelLabOrder(result.id)

      const entry = await pendingEntry(result.id)
      expect(entry.action).toBe('update')
      expect(compareHlc(deserializeHlc(entry.hlcTimestamp), deserializeHlc(createHlc))).toBeGreaterThan(0)
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

  describe('applyLabToPending', () => {
    it('stamps the lab performer on every pending order and bumps version', async () => {
      await useLabOrderStore.getState().addLabOrder(baseInput, encounterId, patientId, practitionerRef)
      await useLabOrderStore.getState().addLabOrder(
        { ...baseInput, testCode: '2093-3', testDisplay: 'Lipid panel' },
        encounterId, patientId, practitionerRef,
      )

      await useLabOrderStore.getState().applyLabToPending({ id: 'lab1', name: 'Central Lab' })

      const state = useLabOrderStore.getState()
      expect(state.pendingOrders).toHaveLength(2)
      for (const o of state.pendingOrders) {
        expect(o.performer).toEqual({ reference: 'Organization/lab1', display: 'Central Lab' })
        expect(o.meta.versionId).toBe('2')
        const saved = await db.serviceRequests.get(o.id)
        expect(saved!.performer?.reference).toBe('Organization/lab1')
      }
    })

    it('clears the performer on all pending orders when passed null', async () => {
      await useLabOrderStore.getState().addLabOrder(baseInput, encounterId, patientId, practitionerRef)
      await useLabOrderStore.getState().applyLabToPending({ id: 'lab1', name: 'X' })
      await useLabOrderStore.getState().applyLabToPending(null)
      expect(useLabOrderStore.getState().pendingOrders[0]!.performer).toBeUndefined()
    })

    it('is a no-op when there are no pending orders', async () => {
      await useLabOrderStore.getState().applyLabToPending({ id: 'lab1', name: 'X' })
      expect(useLabOrderStore.getState().pendingOrders).toHaveLength(0)
    })

    it('does not rewrite the performer on a lab-started (on-hold) order', async () => {
      const a = await useLabOrderStore.getState().addLabOrder(baseInput, encounterId, patientId, practitionerRef)
      const b = await useLabOrderStore.getState().addLabOrder(
        { ...baseInput, testCode: '2093-3', testDisplay: 'Cholesterol' },
        encounterId, patientId, practitionerRef,
      )
      const startedA = { ...a, status: 'on-hold' as const }
      await db.serviceRequests.put(startedA)
      useLabOrderStore.setState({ pendingOrders: [startedA, b] })

      await useLabOrderStore.getState().applyLabToPending({ id: 'lab1', name: 'Central Lab' })

      const state = useLabOrderStore.getState()
      const outA = state.pendingOrders.find((o) => o.id === a.id)!
      const outB = state.pendingOrders.find((o) => o.id === b.id)!
      expect(outA.performer).toBeUndefined()
      expect(outB.performer).toEqual({ reference: 'Organization/lab1', display: 'Central Lab' })
    })
  })

  describe('updateLabOrder', () => {
    it('replaces editable fields, bumps version, and persists', async () => {
      const created = await useLabOrderStore.getState().addLabOrder(baseInput, encounterId, patientId, practitionerRef)
      await useLabOrderStore.getState().updateLabOrder(created.id, {
        testCode: '2345-7', testDisplay: 'Glucose', priority: 'stat',
      })
      const o = useLabOrderStore.getState().pendingOrders[0]!
      expect(o.id).toBe(created.id)
      expect(o.code.coding![0]!.code).toBe('2345-7')
      expect(o.priority).toBe('stat')
      expect(Number(o.meta.versionId)).toBe(2)
      const saved = await db.serviceRequests.get(created.id)
      expect(saved!.code.text).toBe('Glucose')
    })

    it('throws and does not modify a locked (lab-started) order', async () => {
      const created = await useLabOrderStore.getState().addLabOrder(baseInput, encounterId, patientId, practitionerRef)
      const started = { ...created, status: 'on-hold' as const }
      await db.serviceRequests.put(started)
      useLabOrderStore.setState({ pendingOrders: [started] })

      await expect(
        useLabOrderStore.getState().updateLabOrder(created.id, { testCode: '2345-7', testDisplay: 'Glucose' }),
      ).rejects.toThrow()
      const saved = await db.serviceRequests.get(created.id)
      expect(saved!.code.text).toBe('CBC panel')
    })
  })

  describe('loadOrders (started orders)', () => {
    it('keeps on-hold orders so they stay visible but locked', async () => {
      const created = await useLabOrderStore.getState().addLabOrder(baseInput, encounterId, patientId, practitionerRef)
      await db.serviceRequests.put({ ...created, status: 'on-hold' })
      useLabOrderStore.setState({ pendingOrders: [] })
      await useLabOrderStore.getState().loadOrders(encounterId)
      const orders = useLabOrderStore.getState().pendingOrders
      expect(orders).toHaveLength(1)
      expect(orders[0]!.status).toBe('on-hold')
    })
  })
})

describe('lab-order-mapper performer', () => {
  it('writes performer when labId is provided and reads it back', async () => {
    const { mapInputToServiceRequest, readLabFromServiceRequest } = await import('@/lib/lab-order-mapper')
    const sr = mapInputToServiceRequest(
      { ...baseInput, labId: 'lab1', labName: 'Central Lab' },
      { encounterId, patientId, practitionerRef },
    )
    expect(sr.performer).toEqual({ reference: 'Organization/lab1', display: 'Central Lab' })
    expect(readLabFromServiceRequest(sr)).toEqual({ labId: 'lab1', labName: 'Central Lab' })
  })

  it('omits performer when no labId', async () => {
    const { mapInputToServiceRequest } = await import('@/lib/lab-order-mapper')
    const sr = mapInputToServiceRequest(baseInput, { encounterId, patientId, practitionerRef })
    expect(sr.performer).toBeUndefined()
  })
})
