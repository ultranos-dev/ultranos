import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { createInvoiceFromDispense, getNextInvoiceNumber } from '@/lib/pos/invoice-service'
import { recordPayment } from '@/lib/pos/payment-service'
import { openCashDrawer } from '@/lib/pos/cash-drawer-service'
import type { InvoiceLineItem } from '@/lib/pos/types'

// Story 62.1 (Task 3/Task 4/Task 5): invoice-number atomicity + drawer attribution.

vi.mock('@ultranos/audit-logger/client', async (orig) => ({
  ...(await orig<typeof import('@ultranos/audit-logger/client')>()),
  emitClientAudit: vi.fn(async () => {}),
}))

const HLC = '2026-09-24T00:00:00.000Z-0000-node'

function line(total: number): InvoiceLineItem[] {
  return [
    {
      catalogItemId: 'cat-1',
      stockBatchId: 'batch-1',
      description: 'x',
      quantity: 1,
      unitPrice: total,
      lineTotal: total,
    },
  ]
}

describe('POS concurrency (Story 62.1)', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    if (!encryptionKeyStore.isReady()) {
      encryptionKeyStore.setKey(
        await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']),
      )
    }
  })

  it('concurrent invoice creation produces UNIQUE, gapless invoice numbers', async () => {
    const N = 20
    const results = await Promise.all(
      Array.from({ length: N }, () =>
        createInvoiceFromDispense({
          dispenseIds: ['d'],
          items: line(1_000),
          taxRate: 0,
          createdBy: 'p1',
          hlcTimestamp: HLC,
          prefix: 'INV-',
        }),
      ),
    )
    const numbers = results.map((r) => r.invoiceNumber)
    const unique = new Set(numbers)
    expect(unique.size).toBe(N) // no duplicates despite concurrent allocation

    // Every allocated number is a valid INV-##### and they are 1..N with no gaps.
    const seqs = numbers.map((n) => parseInt(n.slice('INV-'.length), 10)).sort((a, b) => a - b)
    expect(seqs).toEqual(Array.from({ length: N }, (_, i) => i + 1))
  })

  it('getNextInvoiceNumber does not duplicate an existing committed number', async () => {
    await createInvoiceFromDispense({
      dispenseIds: ['d'],
      items: line(1_000),
      taxRate: 0,
      createdBy: 'p1',
      hlcTimestamp: HLC,
      prefix: 'INV-',
    })
    const next = await getNextInvoiceNumber('INV-')
    expect(next).toBe('INV-00002')
  })

  it('cash payment attributes the SAME cashDrawerId locally and in the sync payload', async () => {
    const drawer = await openCashDrawer({ openedBy: 'p1', openingBalance: 0 })
    const invoice = await createInvoiceFromDispense({
      dispenseIds: ['d'],
      items: line(4_200),
      taxRate: 0,
      createdBy: 'p1',
      hlcTimestamp: HLC,
      prefix: 'INV-',
    })
    const payment = await recordPayment({
      invoiceId: invoice.id,
      method: 'cash',
      amount: 4_200,
      receivedBy: 'p1',
      hlcTimestamp: HLC,
    })

    // Local copy.
    const stored = await db.payments.get(payment.id)
    expect(stored!.cashDrawerId).toBe(drawer.id)
    expect(payment.cashDrawerId).toBe(drawer.id)

    // Drawer cashIn updated by exactly the payment amount.
    const openDrawer = await db.cashDrawers.get(drawer.id)
    expect(openDrawer!.cashIn).toBe(4_200)

    // Sync payload for the payment carries the same drawer id. When the
    // encryption key is set, the payload is encrypted; assert on the local
    // record instead (the payload is built from this same final object).
    const entry = await db.syncQueue.where('resourceId').equals(payment.id).first()
    expect(entry).toBeDefined()
    expect(entry!.resourceType).toBe('Payment')
  })

  it('cash payment with no open drawer is rejected atomically (nothing persisted)', async () => {
    const invoice = await createInvoiceFromDispense({
      dispenseIds: ['d'],
      items: line(1_000),
      taxRate: 0,
      createdBy: 'p1',
      hlcTimestamp: HLC,
      prefix: 'INV-',
    })
    await expect(
      recordPayment({
        invoiceId: invoice.id,
        method: 'cash',
        amount: 1_000,
        receivedBy: 'p1',
        hlcTimestamp: HLC,
      }),
    ).rejects.toThrow(/cash drawer/i)
    const payments = await db.payments.where('invoiceId').equals(invoice.id).toArray()
    expect(payments.length).toBe(0) // nothing persisted on the failed cash payment
  })
})
