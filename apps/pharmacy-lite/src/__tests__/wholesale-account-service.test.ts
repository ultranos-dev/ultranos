import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { openCashDrawer } from '@/lib/pos/cash-drawer-service'
import { postCharge, recordPayment, getAccountsWithBalance } from '@/lib/wholesale/customer-account-service'

beforeEach(async () => { await db.delete(); await db.open() })

describe('customer-account-service', () => {
  it('posts a charge that increases the customer balance', async () => {
    await postCharge('c1', 5000, 'o1', 'u1')
    const accounts = await getAccountsWithBalance()
    expect(accounts.find((a) => a.customerId === 'c1')?.balance).toBe(5000)
    const ledger = await db.customerLedgerEntries.where('customerId').equals('c1').toArray()
    expect(ledger).toHaveLength(1)
    expect(ledger[0]).toMatchObject({ type: 'charge', amount: 5000, salesOrderId: 'o1' })
  })

  it('records a payment that reduces balance and adds cash to the open drawer', async () => {
    await openCashDrawer({ openedBy: 'u1', openingBalance: 0 })
    await postCharge('c1', 5000, 'o1', 'u1')
    await recordPayment({ customerId: 'c1', amount: 2000, receivedBy: 'u1' })
    const balance = (await getAccountsWithBalance()).find((a) => a.customerId === 'c1')?.balance
    expect(balance).toBe(3000)
    const drawer = await db.cashDrawers.where('status').equals('open').first()
    expect(drawer?.cashIn).toBe(2000)
  })
})
