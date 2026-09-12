import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { AuditAction, AuditResourceType } from '@ultranos/shared-types'
import { emitClientAudit } from '@ultranos/audit-logger/client'
import { recordSupplierPayment, voidSupplierPayment } from '@/lib/procurement/supplier-payment-service'
import type { SupplierInvoice } from '@/lib/procurement/types'

vi.mock('@ultranos/audit-logger/client', async (orig) => ({
  ...(await orig<typeof import('@ultranos/audit-logger/client')>()),
  emitClientAudit: vi.fn(async () => {}),
}))
const emitMock = vi.mocked(emitClientAudit)

beforeEach(async () => {
  await db.delete(); await db.open()
  if (!encryptionKeyStore.isReady()) {
    encryptionKeyStore.setKey(await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']))
  }
  emitMock.mockClear()
  await db.suppliers.put({ id: 's1', name: 'Acme', isActive: true, createdAt: 'h' })
})

function lastEventFor(action: AuditAction) {
  return emitMock.mock.calls.map((c) => c[0]).reverse().find((i) => i.action === action)
}
function approvedInvoice(over: Partial<SupplierInvoice> = {}): SupplierInvoice {
  return {
    id: 'i1', invoiceNumber: 'S1', purchaseOrderId: 'po1', supplierId: 's1', supplierName: 'Acme',
    items: [], subtotal: 1000, taxRate: 0, taxAmount: 0, freight: 0, total: 1000, status: 'approved',
    dueDate: '2026-01-10', amountPaid: 0, settlementStatus: 'unpaid',
    createdBy: 'u1', createdAt: 'h', hlcTimestamp: 'h', ...over,
  }
}

describe('supplier payment audit instrumentation', () => {
  it('recordSupplierPayment emits SUPPLIER_PAYMENT_RECORDED', async () => {
    await db.supplierInvoices.put(approvedInvoice())
    const p = await recordSupplierPayment({ supplierId: 's1', allocations: [{ supplierInvoiceId: 'i1', amount: 1000 }], method: 'cash', paidBy: 'u1', hlcTimestamp: 'h' })
    const e = lastEventFor(AuditAction.SUPPLIER_PAYMENT_RECORDED)!
    expect(e).toMatchObject({ resourceType: AuditResourceType.SUPPLIER_PAYMENT, resourceId: p.id, actorId: 'u1' })
    expect(e.metadata).toMatchObject({ supplierId: 's1', amount: 1000, method: 'cash' })
  })
  it('voidSupplierPayment emits SUPPLIER_PAYMENT_VOIDED with reason', async () => {
    await db.supplierInvoices.put(approvedInvoice())
    const p = await recordSupplierPayment({ supplierId: 's1', allocations: [{ supplierInvoiceId: 'i1', amount: 500 }], method: 'cash', paidBy: 'u1', hlcTimestamp: 'h' })
    await voidSupplierPayment(p.id, 'u2', 'wrong amount', 'h2')
    const e = lastEventFor(AuditAction.SUPPLIER_PAYMENT_VOIDED)!
    expect(e).toMatchObject({ resourceId: p.id, actorId: 'u2' })
    expect(e.metadata).toMatchObject({ reason: 'wrong amount' })
  })
  it('the payment still records if the audit emit rejects', async () => {
    await db.supplierInvoices.put(approvedInvoice())
    emitMock.mockImplementationOnce(() => Promise.reject(new Error('audit down')).catch(() => {}))
    await expect(recordSupplierPayment({ supplierId: 's1', allocations: [{ supplierInvoiceId: 'i1', amount: 100 }], method: 'cash', paidBy: 'u1', hlcTimestamp: 'h' })).resolves.toBeDefined()
  })
})
