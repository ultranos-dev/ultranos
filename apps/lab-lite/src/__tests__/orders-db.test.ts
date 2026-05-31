import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import {
  getDb,
  putOrders,
  getOrders,
  getOrderById,
  updateOrderStatus,
  type LabOrderEntry,
} from '../lib/db'

function makeOrder(overrides: Partial<LabOrderEntry> = {}): LabOrderEntry {
  return {
    orderId: '550e8400-e29b-41d4-a716-446655440000',
    patientFirstName: 'Ahmad',
    patientAge: 45,
    patientRef: 'Patient/123',
    testsRequested: [
      { loincCode: '58410-2', loincDisplay: 'CBC' },
    ],
    urgency: 'stat',
    orderingPhysicianName: 'Dr. Karimi',
    specialInstructions: null,
    status: 'RECEIVED',
    authoredOn: '2026-05-30T10:00:00.000Z',
    receivedAt: '2026-05-30T10:05:00.000Z',
    syncedAt: '2026-05-30T10:05:00.000Z',
    ...overrides,
  }
}

describe('Orders Dexie Table (v4)', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.orders.clear()
  })

  afterEach(async () => {
    const db = getDb()
    await db.orders.clear()
  })

  it('putOrders inserts and retrieves orders', async () => {
    await putOrders([makeOrder()])
    const orders = await getOrders()
    expect(orders).toHaveLength(1)
    expect(orders[0].patientFirstName).toBe('Ahmad')
    expect(orders[0].patientAge).toBe(45)
    expect(orders[0].urgency).toBe('stat')
  })

  it('putOrders upserts by orderId (no duplicates)', async () => {
    const order = makeOrder()
    await putOrders([order])
    await putOrders([{ ...order, status: 'IN_PROGRESS' }])

    const orders = await getOrders()
    expect(orders).toHaveLength(1)
    expect(orders[0].status).toBe('IN_PROGRESS')
  })

  it('getOrderById returns correct order', async () => {
    const order = makeOrder()
    await putOrders([order])

    const found = await getOrderById(order.orderId)
    expect(found).toBeDefined()
    expect(found!.orderId).toBe(order.orderId)
    expect(found!.testsRequested[0].loincCode).toBe('58410-2')
  })

  it('getOrderById returns undefined for non-existent order', async () => {
    const found = await getOrderById('non-existent-id')
    expect(found).toBeUndefined()
  })

  it('getOrders filters by status', async () => {
    await putOrders([
      makeOrder({ orderId: '111e8400-e29b-41d4-a716-446655440001', status: 'RECEIVED' }),
      makeOrder({ orderId: '222e8400-e29b-41d4-a716-446655440002', status: 'IN_PROGRESS' }),
      makeOrder({ orderId: '333e8400-e29b-41d4-a716-446655440003', status: 'COMPLETED' }),
    ])

    const received = await getOrders('RECEIVED')
    expect(received).toHaveLength(1)
    expect(received[0].status).toBe('RECEIVED')

    const all = await getOrders()
    expect(all).toHaveLength(3)
  })

  it('updateOrderStatus changes status correctly', async () => {
    const order = makeOrder()
    await putOrders([order])
    await updateOrderStatus(order.orderId, 'IN_PROGRESS')

    const updated = await getOrderById(order.orderId)
    expect(updated!.status).toBe('IN_PROGRESS')
  })

  it('handles bulk insert of multiple orders', async () => {
    const orders = Array.from({ length: 10 }, (_, i) =>
      makeOrder({
        orderId: `550e8400-e29b-41d4-a716-44665544${String(i).padStart(4, '0')}`,
        patientFirstName: `Patient${i}`,
        urgency: i % 2 === 0 ? 'stat' : 'routine',
      }),
    )
    await putOrders(orders)

    const all = await getOrders()
    expect(all).toHaveLength(10)
  })
})
