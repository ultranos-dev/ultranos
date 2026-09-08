import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { recordPayment } from '@/lib/pos/payment-service'
import type { CashDrawer, PatientAccount } from '@/lib/pos/types'

beforeEach(async () => {
  await db.delete(); await db.open()
  if (!encryptionKeyStore.isReady()) {
    encryptionKeyStore.setKey(
      await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    )
  }
})

const BASE_PARAMS = {
  invoiceId: 'inv-001',
  method: 'cash' as const,
  amount: 500,
  receivedBy: 'pharmacist-1',
  hlcTimestamp: '2026-09-08T00:00:00.000Z',
}

// Helper: seed a minimal invoice for updateInvoicePaymentStatus
async function seedInvoice(id: string, total: number) {
  await db.invoices.add({
    id,
    invoiceNumber: id.toUpperCase(),
    dispenseIds: [],
    items: [],
    subtotal: total,
    taxRate: 0,
    taxAmount: 0,
    total,
    amountPaid: 0,
    amountDue: total,
    status: 'finalized' as const,
    createdBy: 'pharmacist-1',
    createdAt: '2026-09-08T00:00:00.000Z',
    hlcTimestamp: '2026-09-08T00:00:00.000Z',
  })
}

describe('recordPayment — credit limit enforcement', () => {
  const CREDIT_PARAMS = {
    invoiceId: 'inv-cr-001',
    method: 'credit' as const,
    amount: 500,
    patientId: 'patient-001',
    receivedBy: 'pharmacist-1',
    hlcTimestamp: '2026-09-08T00:00:00.000Z',
  }

  it('rejects when balance + amount would exceed creditLimit and persists nothing', async () => {
    // Existing account: balance 800, creditLimit 1000 → 800+500=1300 > 1000
    const account: PatientAccount = {
      id: 'acc-001',
      patientId: 'patient-001',
      balance: 800,
      creditLimit: 1000,
      lastActivityAt: '2026-09-08T00:00:00.000Z',
    }
    await db.patientAccounts.add(account)
    await seedInvoice('inv-cr-001', 500)

    await expect(recordPayment(CREDIT_PARAMS)).rejects.toThrow('Credit limit exceeded')

    // Nothing new should be persisted (account balance unchanged, no ledger entry, no payment)
    expect(await db.payments.count()).toBe(0)
    expect(await db.ledgerEntries.count()).toBe(0)
    const unchanged = await db.patientAccounts.get('acc-001')
    expect(unchanged?.balance).toBe(800)
  })

  it('succeeds when balance + amount exactly equals creditLimit', async () => {
    // balance 500, creditLimit 1000, amount 500 → 500+500=1000 which is NOT > 1000 → allowed
    const account: PatientAccount = {
      id: 'acc-002',
      patientId: 'patient-001',
      balance: 500,
      creditLimit: 1000,
      lastActivityAt: '2026-09-08T00:00:00.000Z',
    }
    await db.patientAccounts.add(account)
    await seedInvoice('inv-cr-001', 500)

    const payment = await recordPayment(CREDIT_PARAMS)

    expect(payment.method).toBe('credit')
    expect(await db.payments.count()).toBe(1)
    expect(await db.ledgerEntries.count()).toBe(1)
    const updated = await db.patientAccounts.get('acc-002')
    expect(updated?.balance).toBe(1000)
  })

  it('succeeds when account has no creditLimit set (undefined)', async () => {
    // No creditLimit → no enforcement
    const account: PatientAccount = {
      id: 'acc-003',
      patientId: 'patient-001',
      balance: 9999,
      lastActivityAt: '2026-09-08T00:00:00.000Z',
    }
    await db.patientAccounts.add(account)
    await seedInvoice('inv-cr-001', 500)

    const payment = await recordPayment(CREDIT_PARAMS)

    expect(payment.method).toBe('credit')
    expect(await db.payments.count()).toBe(1)
    const updated = await db.patientAccounts.get('acc-003')
    expect(updated?.balance).toBe(10499)
  })

  it('succeeds when no patientAccount exists yet (creates new account)', async () => {
    // No pre-existing account → creates new one, no limit to check
    await seedInvoice('inv-cr-001', 500)

    const payment = await recordPayment(CREDIT_PARAMS)

    expect(payment.method).toBe('credit')
    expect(await db.payments.count()).toBe(1)
    const accounts = await db.patientAccounts.where('patientId').equals('patient-001').toArray()
    expect(accounts).toHaveLength(1)
    expect(accounts[0]!.balance).toBe(500)
  })
})

describe('recordPayment — cash drawer enforcement', () => {
  it('rejects a cash payment when no cash drawer is open and persists nothing', async () => {
    // No drawer seeded — db.cashDrawers is empty
    await expect(recordPayment(BASE_PARAMS)).rejects.toThrow(
      'No open cash drawer'
    )

    // Nothing should be persisted
    expect(await db.payments.count()).toBe(0)
    expect(await db.ledgerEntries.count()).toBe(0)
  })

  it('succeeds and increments cashIn when an open cash drawer exists', async () => {
    const drawer: CashDrawer = {
      id: 'drawer-001',
      openedBy: 'pharmacist-1',
      openedAt: '2026-09-08T00:00:00.000Z',
      openingBalance: 1000,
      status: 'open',
      cashIn: 0,
      cashOut: 0,
    }
    await db.cashDrawers.add(drawer)

    // Seed a minimal invoice so updateInvoicePaymentStatus doesn't error
    await db.invoices.add({
      id: 'inv-001',
      invoiceNumber: 'INV-001',
      dispenseIds: [],
      items: [],
      subtotal: 500,
      taxRate: 0,
      taxAmount: 0,
      total: 500,
      amountPaid: 0,
      amountDue: 500,
      status: 'finalized',
      createdBy: 'pharmacist-1',
      createdAt: '2026-09-08T00:00:00.000Z',
      hlcTimestamp: '2026-09-08T00:00:00.000Z',
    })

    const payment = await recordPayment(BASE_PARAMS)

    expect(payment.cashDrawerId).toBe('drawer-001')
    expect(await db.payments.count()).toBe(1)

    const updatedDrawer = await db.cashDrawers.get('drawer-001')
    expect(updatedDrawer?.cashIn).toBe(500)
  })
})
