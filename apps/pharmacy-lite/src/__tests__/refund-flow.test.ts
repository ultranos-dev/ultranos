import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { AuditAction, AuditResourceType } from '@ultranos/shared-types'
import { emitClientAudit } from '@ultranos/audit-logger/client'
import { voidSale, refundSale } from '@/lib/pos/refund-service'
import { recordPayment } from '@/lib/pos/payment-service'
import { openCashDrawer, closeCashDrawer } from '@/lib/pos/cash-drawer-service'
import { createInvoiceFromDispense } from '@/lib/pos/invoice-service'
import type { InvoiceLineItem } from '@/lib/pos/types'

// Story 62.1 (Task 2/Task 5): refund/void + cash-out + drawer reconciliation.

vi.mock('@ultranos/audit-logger/client', async (orig) => ({
  ...(await orig<typeof import('@ultranos/audit-logger/client')>()),
  emitClientAudit: vi.fn(async () => {}),
}))
const emitMock = vi.mocked(emitClientAudit)

const HLC = '2026-09-24T00:00:00.000Z-0000-node'

async function seedBatch(qtyOnHand: number) {
  await db.stockBatches.put({
    id: 'batch-1',
    catalogItemId: 'cat-1',
    batchNumber: 'B1',
    quantityOnHand: qtyOnHand,
    expiryDate: '2030-01-01',
    status: 'active',
    hlcTimestamp: HLC,
  } as never)
}

function lines(): InvoiceLineItem[] {
  return [
    {
      catalogItemId: 'cat-1',
      stockBatchId: 'batch-1',
      description: 'tablet 500mg',
      quantity: 2,
      unitPrice: 5_000,
      lineTotal: 10_000,
    },
  ]
}

async function makePaidInvoice(taxRate = 10) {
  const invoice = await createInvoiceFromDispense({
    dispenseIds: ['d1'],
    items: lines(),
    taxRate,
    createdBy: 'Practitioner/p1',
    hlcTimestamp: HLC,
    prefix: 'INV-',
  })
  await recordPayment({
    invoiceId: invoice.id,
    method: 'cash',
    amount: invoice.total,
    receivedBy: 'Practitioner/p1',
    hlcTimestamp: HLC,
  })
  return db.invoices.get(invoice.id).then((i) => i!)
}

function lastEventFor(action: AuditAction) {
  return emitMock.mock.calls.map((c) => c[0]).reverse().find((i) => i.action === action)
}

describe('POS refund/void + cash-out (Story 62.1)', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    if (!encryptionKeyStore.isReady()) {
      encryptionKeyStore.setKey(
        await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']),
      )
    }
    emitMock.mockClear()
    await seedBatch(0) // units already deducted at dispense time
  })

  it('void writes cashOut for the collected cash and marks invoice voided', async () => {
    await openCashDrawer({ openedBy: 'p1', openingBalance: 0 })
    const invoice = await makePaidInvoice()
    const drawerBefore = await db.cashDrawers.where('status').equals('open').first()
    expect(drawerBefore!.cashIn).toBe(invoice.total) // 11_000
    expect(drawerBefore!.cashOut).toBe(0)

    const voided = await voidSale({
      invoiceId: invoice.id,
      reason: 'wrong medication picked',
      voidedBy: 'Practitioner/p1',
      hlcTimestamp: HLC,
      stockDisposition: 'restock',
    })

    expect(voided.status).toBe('voided')
    expect(voided.voidReason).toBe('wrong medication picked')

    const drawerAfter = await db.cashDrawers.where('status').equals('open').first()
    expect(drawerAfter!.cashOut).toBe(invoice.total)
    // Net cash = cashIn - cashOut = 0 → drawer reconciles at the opening balance.
    expect(drawerAfter!.cashIn - drawerAfter!.cashOut).toBe(0)
  })

  it('void with restock returns units to the batch', async () => {
    await openCashDrawer({ openedBy: 'p1', openingBalance: 0 })
    const invoice = await makePaidInvoice()
    await voidSale({
      invoiceId: invoice.id,
      reason: 'customer changed mind',
      voidedBy: 'Practitioner/p1',
      hlcTimestamp: HLC,
      stockDisposition: 'restock',
    })
    const batch = await db.stockBatches.get('batch-1')
    expect(batch!.quantityOnHand).toBe(2) // 2 units returned
  })

  it('void with quarantine does NOT return units to sellable stock', async () => {
    await openCashDrawer({ openedBy: 'p1', openingBalance: 0 })
    const invoice = await makePaidInvoice()
    await voidSale({
      invoiceId: invoice.id,
      reason: 'contaminated on return',
      voidedBy: 'Practitioner/p1',
      hlcTimestamp: HLC,
      stockDisposition: 'quarantine',
    })
    const batch = await db.stockBatches.get('batch-1')
    expect(batch!.quantityOnHand).toBe(0) // quarantined, not resellable
    // But the return is still ledgered as a movement (never silent).
    const movements = await db.stockMovements.where('stockBatchId').equals('batch-1').toArray()
    expect(movements.some((m) => m.type === 'disposed')).toBe(true)
  })

  it('sale → refund → drawer close reconciles (cashOut in expected balance)', async () => {
    const drawer = await openCashDrawer({ openedBy: 'p1', openingBalance: 10_000 })
    const invoice = await makePaidInvoice()

    await refundSale({
      invoiceId: invoice.id,
      method: 'cash',
      reason: 'defective product',
      refundedBy: 'Practitioner/p1',
      hlcTimestamp: HLC,
      stockDisposition: 'restock',
    })

    const open = await db.cashDrawers.where('status').equals('open').first()
    expect(open!.cashOut).toBe(invoice.total)

    // Count exactly the expected balance: opening + cashIn - cashOut.
    const expected = open!.openingBalance + open!.cashIn - open!.cashOut
    const closed = await closeCashDrawer({ drawerId: drawer.id, closingBalance: expected })
    expect(closed.expectedBalance).toBe(expected)
    expect(closed.discrepancy).toBe(0) // reconciles
  })

  it('cash refund with no open drawer is rejected (never silent)', async () => {
    await openCashDrawer({ openedBy: 'p1', openingBalance: 0 })
    const invoice = await makePaidInvoice()
    const drawer = await db.cashDrawers.where('status').equals('open').first()
    await closeCashDrawer({ drawerId: drawer!.id, closingBalance: invoice.total })

    await expect(
      refundSale({
        invoiceId: invoice.id,
        method: 'cash',
        reason: 'x',
        refundedBy: 'p1',
        hlcTimestamp: HLC,
      }),
    ).rejects.toThrow(/cash drawer/i)
  })

  it('emits INVOICE_VOIDED and INVOICE_REFUNDED / CASH_DRAWER_PAYOUT audit events', async () => {
    await openCashDrawer({ openedBy: 'p1', openingBalance: 0 })
    const invoice1 = await makePaidInvoice()
    await voidSale({ invoiceId: invoice1.id, reason: 'r', voidedBy: 'p1', hlcTimestamp: HLC })
    const voidEvent = lastEventFor(AuditAction.INVOICE_VOIDED)!
    expect(voidEvent).toMatchObject({ resourceType: AuditResourceType.INVOICE, resourceId: invoice1.id })
    expect(voidEvent.metadata).toMatchObject({ reason: 'r' })

    const invoice2 = await makePaidInvoice()
    await refundSale({ invoiceId: invoice2.id, method: 'cash', reason: 'r2', refundedBy: 'p1', hlcTimestamp: HLC })
    const refundEvent = lastEventFor(AuditAction.INVOICE_REFUNDED)!
    expect(refundEvent).toMatchObject({ resourceType: AuditResourceType.REFUND })
    const payoutEvent = lastEventFor(AuditAction.CASH_DRAWER_PAYOUT)!
    expect(payoutEvent).toMatchObject({ resourceType: AuditResourceType.CASH_DRAWER })
  })

  it('refund cannot exceed amount paid', async () => {
    await openCashDrawer({ openedBy: 'p1', openingBalance: 0 })
    const invoice = await makePaidInvoice()
    await expect(
      refundSale({
        invoiceId: invoice.id,
        amount: invoice.total + 1,
        method: 'cash',
        reason: 'x',
        refundedBy: 'p1',
        hlcTimestamp: HLC,
      }),
    ).rejects.toThrow(/exceeds/i)
  })
})
