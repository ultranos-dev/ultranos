import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import type { ContractPrice } from '@/lib/wholesale/types'

beforeEach(async () => { await db.delete(); await db.open() })

describe('contractPrices table', () => {
  it('round-trips and queries by [customerId+catalogItemId]', async () => {
    const row: ContractPrice = { id: 'cp1', customerId: 'c1', catalogItemId: 'i1', priceMinor: 1800, createdBy: 'p1', createdAt: '2026-09-08T00:00:00Z' }
    await db.contractPrices.put(row)
    expect(await db.contractPrices.get('cp1')).toEqual(row)
    const found = await db.contractPrices.where('[customerId+catalogItemId]').equals(['c1', 'i1']).first()
    expect(found?.priceMinor).toBe(1800)
  })
})
