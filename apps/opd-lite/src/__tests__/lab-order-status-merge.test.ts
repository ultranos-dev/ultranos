import { describe, it, expect, beforeEach, vi } from 'vitest'

const fetchMock = vi.fn()
vi.mock('@/lib/trpc', () => ({ fetchLabOrderStatuses: (...a: unknown[]) => fetchMock(...a) }))

import { useLabOrderStore } from '@/stores/lab-order-store'
import { db } from '@/lib/db'
import type { LabOrderInput } from '@/lib/lab-order-mapper'

const baseInput: LabOrderInput = { testCode: '58410-2', testDisplay: 'CBC panel', priority: 'routine' }
const encounterId = 'enc-merge'
const patientId = 'pat-merge'
const practitionerRef = 'Practitioner/doc-merge'

describe('refreshLabOrderStatuses', () => {
  beforeEach(async () => {
    useLabOrderStore.setState({ pendingOrders: [], isSaving: false })
    await db.serviceRequests.clear()
    fetchMock.mockReset()
  })

  it('merges a lab-started status forward onto the local order and persists it', async () => {
    const created = await useLabOrderStore.getState().addLabOrder(baseInput, encounterId, patientId, practitionerRef)
    fetchMock.mockResolvedValue([
      { id: created.id, status: 'on-hold', receivedAt: '2026-09-12T00:00:00Z', receivedByLabId: 'lab1' },
    ])

    await useLabOrderStore.getState().refreshLabOrderStatuses()

    const o = useLabOrderStore.getState().pendingOrders[0]!
    expect(o.status).toBe('on-hold')
    expect(o._ultranos.receivedAt).toBe('2026-09-12T00:00:00Z')
    expect(o._ultranos.receivedByLabId).toBe('lab1')
    const saved = await db.serviceRequests.get(created.id)
    expect(saved!.status).toBe('on-hold')
  })

  it('never downgrades a started order back to active', async () => {
    const created = await useLabOrderStore.getState().addLabOrder(baseInput, encounterId, patientId, practitionerRef)
    const started = {
      ...created,
      status: 'on-hold' as const,
      _ultranos: { ...created._ultranos, receivedAt: '2026-09-12T00:00:00Z' },
    }
    await db.serviceRequests.put(started)
    useLabOrderStore.setState({ pendingOrders: [started] })
    fetchMock.mockResolvedValue([{ id: created.id, status: 'active' }])

    await useLabOrderStore.getState().refreshLabOrderStatuses()

    expect(useLabOrderStore.getState().pendingOrders[0]!.status).toBe('on-hold')
  })

  it('leaves orders unchanged when the fetch returns nothing (offline)', async () => {
    await useLabOrderStore.getState().addLabOrder(baseInput, encounterId, patientId, practitionerRef)
    fetchMock.mockResolvedValue([])
    await useLabOrderStore.getState().refreshLabOrderStatuses()
    expect(useLabOrderStore.getState().pendingOrders[0]!.status).toBe('active')
  })
})
