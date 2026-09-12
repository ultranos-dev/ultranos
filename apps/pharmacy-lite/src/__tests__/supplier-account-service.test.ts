import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { getSupplierPayables, getSupplierAccount } from '@/lib/procurement/supplier-account-service'
import type { SupplierInvoice } from '@/lib/procurement/types'

beforeEach(async () => {
  await db.delete(); await db.open()
  if (!encryptionKeyStore.isReady()) {
    encryptionKeyStore.setKey(await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']))
  }
})

function inv(over: Partial<SupplierInvoice>): SupplierInvoice {
  return {
    id: 'x', invoiceNumber: 'S', purchaseOrderId: 'po', supplierId: 's1', supplierName: 'Acme',
    items: [], subtotal: 0, taxRate: 0, taxAmount: 0, freight: 0, total: 1000, status: 'approved',
    dueDate: '2026-01-01', amountPaid: 0, settlementStatus: 'unpaid',
    createdBy: 'u', createdAt: '2026-01-01T00:00:00.000Z', hlcTimestamp: 'h', ...over,
  }
}

describe('getSupplierPayables', () => {
  it('rolls up outstanding across a supplier\'s approved-unpaid invoices, excludes paid + disputed', async () => {
    await db.supplierInvoices.bulkPut([
      inv({ id: 'a', supplierId: 's1', total: 1000, amountPaid: 0 }),
      inv({ id: 'b', supplierId: 's1', total: 500, amountPaid: 500, settlementStatus: 'paid' }), // fully paid → excluded
      inv({ id: 'c', supplierId: 's1', total: 300, status: 'disputed' }),                        // disputed → excluded
      inv({ id: 'd', supplierId: 's2', total: 700, amountPaid: 200 }),
    ])
    const payables = await getSupplierPayables()
    const s1 = payables.find((p) => p.supplierId === 's1')
    expect(s1?.outstanding).toBe(1000)
    expect(s1?.invoiceCount).toBe(1)
    const s2 = payables.find((p) => p.supplierId === 's2')
    expect(s2?.outstanding).toBe(500)
  })

  it('ages a not-yet-due invoice into the current bucket', async () => {
    const future = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10)
    await db.supplierInvoices.put(inv({ id: 'a', dueDate: future, total: 1000, amountPaid: 0 }))
    const s1 = (await getSupplierPayables()).find((p) => p.supplierId === 's1')
    expect(s1?.aging.current).toBe(1000)
    expect(s1?.aging.ninetyPlus).toBe(0)
  })
})

describe('getSupplierAccount', () => {
  it('returns unpaid approved invoices sorted by dueDate + this supplier\'s payments', async () => {
    await db.suppliers.put({ id: 's1', name: 'Acme', isActive: true, createdAt: 'h' })
    await db.supplierInvoices.bulkPut([
      inv({ id: 'a', dueDate: '2026-03-01', total: 300, amountPaid: 0 }),
      inv({ id: 'b', dueDate: '2026-01-01', total: 700, amountPaid: 0 }),
    ])
    const acct = await getSupplierAccount('s1')
    expect(acct.outstanding).toBe(1000)
    expect(acct.invoices.map((i) => i.id)).toEqual(['b', 'a']) // dueDate asc
    expect(acct.supplierName).toBe('Acme')
  })
})
