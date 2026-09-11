import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import {
  recordSupplierPayment, voidSupplierPayment, getSupplierPayments,
  getPaymentsForInvoice, InvoiceNotApprovedError, OverpaymentError,
} from '@/lib/procurement/supplier-payment-service'
import type { SupplierInvoice } from '@/lib/procurement/types'

beforeEach(async () => {
  await db.delete(); await db.open()
  if (!encryptionKeyStore.isReady()) {
    encryptionKeyStore.setKey(await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']))
  }
  await db.suppliers.put({ id: 's1', name: 'Acme', isActive: true, createdAt: '2026-01-01T00:00:00.000Z' })
})

function seedInvoice(over: Partial<SupplierInvoice> = {}): SupplierInvoice {
  return {
    id: 'i1', invoiceNumber: 'S1', purchaseOrderId: 'po1', supplierId: 's1', supplierName: 'Acme',
    items: [], subtotal: 1000, taxRate: 0, taxAmount: 0, freight: 0, total: 1000, status: 'approved',
    dueDate: '2026-01-10', amountPaid: 0, settlementStatus: 'unpaid',
    createdBy: 'u1', createdAt: '2026-01-01T00:00:00.000Z', hlcTimestamp: '2026-01-01T00:00:00.000Z', ...over,
  }
}

describe('recordSupplierPayment', () => {
  it('settles a single approved invoice and updates amountPaid + status', async () => {
    await db.supplierInvoices.put(seedInvoice())
    const p = await recordSupplierPayment({
      supplierId: 's1', allocations: [{ supplierInvoiceId: 'i1', amount: 1000 }],
      method: 'cash', paidBy: 'u1', hlcTimestamp: '2026-01-05T00:00:00.000Z',
    })
    expect(p.amount).toBe(1000)
    expect(p.supplierName).toBe('Acme')
    expect(p.allocations[0]).toMatchObject({ supplierInvoiceId: 'i1', invoiceNumber: 'S1', amount: 1000 })
    const inv = await db.supplierInvoices.get('i1')
    expect(inv?.amountPaid).toBe(1000)
    expect(inv?.settlementStatus).toBe('paid')
  })

  it('records a partial payment leaving status partial', async () => {
    await db.supplierInvoices.put(seedInvoice())
    await recordSupplierPayment({ supplierId: 's1', allocations: [{ supplierInvoiceId: 'i1', amount: 400 }], method: 'cash', paidBy: 'u1', hlcTimestamp: 'h' })
    const inv = await db.supplierInvoices.get('i1')
    expect(inv?.amountPaid).toBe(400)
    expect(inv?.settlementStatus).toBe('partial')
  })

  it('enqueues SupplierPayment + SupplierInvoice sync entries', async () => {
    await db.supplierInvoices.put(seedInvoice())
    await recordSupplierPayment({ supplierId: 's1', allocations: [{ supplierInvoiceId: 'i1', amount: 400 }], method: 'cash', paidBy: 'u1', hlcTimestamp: 'h' })
    const q = await db.syncQueue.toArray()
    expect(q.some((e) => e.resourceType === 'SupplierPayment' && e.action === 'create')).toBe(true)
    expect(q.some((e) => e.resourceType === 'SupplierInvoice' && e.action === 'update')).toBe(true)
  })

  it('throws InvoiceNotApprovedError for a pending invoice', async () => {
    await db.supplierInvoices.put(seedInvoice({ status: 'pending' }))
    await expect(recordSupplierPayment({ supplierId: 's1', allocations: [{ supplierInvoiceId: 'i1', amount: 100 }], method: 'cash', paidBy: 'u1', hlcTimestamp: 'h' }))
      .rejects.toBeInstanceOf(InvoiceNotApprovedError)
  })

  it('throws OverpaymentError when amount exceeds amountDue', async () => {
    await db.supplierInvoices.put(seedInvoice({ amountPaid: 800 })) // due = 200
    await expect(recordSupplierPayment({ supplierId: 's1', allocations: [{ supplierInvoiceId: 'i1', amount: 300 }], method: 'cash', paidBy: 'u1', hlcTimestamp: 'h' }))
      .rejects.toBeInstanceOf(OverpaymentError)
  })
})

describe('voidSupplierPayment', () => {
  it('restores amountPaid + settlementStatus and marks the payment void', async () => {
    await db.supplierInvoices.put(seedInvoice())
    const p = await recordSupplierPayment({ supplierId: 's1', allocations: [{ supplierInvoiceId: 'i1', amount: 1000 }], method: 'cash', paidBy: 'u1', hlcTimestamp: 'h' })
    await voidSupplierPayment(p.id, 'u2', 'wrong amount', 'h2')
    const inv = await db.supplierInvoices.get('i1')
    expect(inv?.amountPaid).toBe(0)
    expect(inv?.settlementStatus).toBe('unpaid')
    const voided = (await getSupplierPayments('s1')).find((x) => x.id === p.id)
    expect(voided?.status).toBe('void')
    expect(voided?.voidedBy).toBe('u2')
  })

  it('throws when voiding an already-void payment', async () => {
    await db.supplierInvoices.put(seedInvoice())
    const p = await recordSupplierPayment({ supplierId: 's1', allocations: [{ supplierInvoiceId: 'i1', amount: 500 }], method: 'cash', paidBy: 'u1', hlcTimestamp: 'h' })
    await voidSupplierPayment(p.id, 'u2', 'x', 'h2')
    await expect(voidSupplierPayment(p.id, 'u2', 'again', 'h3')).rejects.toThrow()
  })
})

describe('getPaymentsForInvoice', () => {
  it('returns payments whose allocations reference the invoice', async () => {
    await db.supplierInvoices.put(seedInvoice())
    const p = await recordSupplierPayment({ supplierId: 's1', allocations: [{ supplierInvoiceId: 'i1', amount: 500 }], method: 'cash', paidBy: 'u1', hlcTimestamp: 'h' })
    const list = await getPaymentsForInvoice('i1')
    expect(list.map((x) => x.id)).toContain(p.id)
  })
})
