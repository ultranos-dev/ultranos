import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'

beforeEach(async () => {
  await db.delete()
  await db.open()
  if (!encryptionKeyStore.isReady()) {
    encryptionKeyStore.setKey(
      await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']),
    )
  }
})

describe('supplierPayments schema (v20 latest)', () => {
  it('opens at version 20 with the supplierPayments store', async () => {
    expect(db.verno).toBe(20)
    // A round-trip put/get proves the store + primary key work.
    await db.supplierPayments.put({
      id: 'p1', supplierId: 's1', supplierName: 'Acme', amount: 500, method: 'cash',
      allocations: [{ supplierInvoiceId: 'i1', invoiceNumber: 'S1', amount: 500 }],
      status: 'active', paidBy: 'u1', paidAt: '2026-01-01T00:00:00.000Z', hlcTimestamp: '2026-01-01T00:00:00.000Z',
    })
    expect((await db.supplierPayments.get('p1'))?.amount).toBe(500)
  })

  it('queries supplierPayments by the [supplierId+status] index', async () => {
    await db.supplierPayments.bulkPut([
      { id: 'p1', supplierId: 's1', supplierName: 'A', amount: 100, method: 'cash', allocations: [], status: 'active', paidBy: 'u', paidAt: '2026-01-01T00:00:00.000Z', hlcTimestamp: '2026-01-01T00:00:00.000Z' },
      { id: 'p2', supplierId: 's1', supplierName: 'A', amount: 200, method: 'cash', allocations: [], status: 'void', paidBy: 'u', paidAt: '2026-01-02T00:00:00.000Z', hlcTimestamp: '2026-01-02T00:00:00.000Z' },
    ])
    const active = await db.supplierPayments.where('[supplierId+status]').equals(['s1', 'active']).toArray()
    expect(active).toHaveLength(1)
    expect(active[0]!.id).toBe('p1')
  })
})
