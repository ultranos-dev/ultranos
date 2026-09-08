import { describe, it, expect } from 'vitest'
import { flattenForDb } from '@/lib/resource-mappers'

describe('wholesale flatteners', () => {
  it('flattens WholesaleCustomer 1:1 with defaults', () => {
    const row = flattenForDb('WholesaleCustomer', {
      id: 'c1', name: 'Herat Depot', creditLimit: 500000, isActive: true, createdAt: '2026-09-07T00:00:00Z',
    })
    expect(row).toMatchObject({ id: 'c1', name: 'Herat Depot', creditLimit: 500000, isActive: true })
    expect(row.contactName).toBeNull()
  })

  it('flattens SalesOrder passing lines through as-is (JSONB)', () => {
    const lines = [{ catalogItemId: 'i1', unit: 'each', quantity: 10, unitPrice: 2000, lineTotal: 20000, baseUnits: 10, batchAllocations: [{ stockBatchId: 'b1', qty: 10 }] }]
    const row = flattenForDb('SalesOrder', {
      id: 'o1', orderNumber: 'SO-1', customerId: 'c1', status: 'fulfilled', lines,
      subtotal: 20000, taxRate: 0, taxAmount: 0, total: 20000, createdBy: 'p1', createdAt: '2026-09-07T00:00:00Z',
    })
    expect(row).toMatchObject({ id: 'o1', orderNumber: 'SO-1', customerId: 'c1', status: 'fulfilled', total: 20000 })
    expect(row.lines).toEqual(lines)
    expect(row.hlcTimestamp).toBeUndefined() // injected by sync.push, not the flattener
  })

  it('flattens CustomerLedgerEntry mapping timestamp -> entryTimestamp', () => {
    const row = flattenForDb('CustomerLedgerEntry', {
      id: 'l1', customerId: 'c1', type: 'charge', amount: 20000, salesOrderId: 'o1', createdBy: 'p1', timestamp: '2026-09-07T01:00:00Z',
    })
    expect(row).toMatchObject({ id: 'l1', customerId: 'c1', type: 'charge', amount: 20000, salesOrderId: 'o1', entryTimestamp: '2026-09-07T01:00:00Z' })
  })
})
