import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import type { WholesaleCustomer } from '@/lib/wholesale/types'

beforeEach(async () => { await db.delete(); await db.open() })

describe('wholesale Dexie tables', () => {
  it('round-trips a wholesale customer', async () => {
    const c: WholesaleCustomer = { id: 'c1', name: 'Kabul Pharma Co', isActive: true, createdAt: '2026-09-06T00:00:00Z' }
    await db.wholesaleCustomers.put(c)
    expect(await db.wholesaleCustomers.get('c1')).toEqual(c)
  })
  it('queries sales orders by status index', async () => {
    await db.salesOrders.put({ id: 'o1', orderNumber: 'SO-1', customerId: 'c1', status: 'draft', lines: [], subtotal: 0, taxRate: 0, taxAmount: 0, total: 0, createdBy: 'u1', createdAt: '2026-09-06T00:00:00Z', hlcTimestamp: '0' })
    const drafts = await db.salesOrders.where('status').equals('draft').toArray()
    expect(drafts).toHaveLength(1)
  })
})
