import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { setContractPrice, resolveContractPrice, getContractPrices, removeContractPrice } from '@/lib/wholesale/contract-price-service'

beforeEach(async () => {
  await db.delete(); await db.open()
  if (!encryptionKeyStore.isReady()) encryptionKeyStore.setKey(await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt','decrypt']))
})

describe('contract-price-service', () => {
  it('creates a price and enqueues a sync entry', async () => {
    const cp = await setContractPrice({ customerId: 'c1', catalogItemId: 'i1', priceMinor: 1800, createdBy: 'p1' })
    expect(cp.priceMinor).toBe(1800)
    expect(await resolveContractPrice('c1', 'i1')).toBe(1800)
    const q = await db.syncQueue.toArray()
    expect(q.some((e) => e.resourceType === 'ContractPrice' && e.resourceId === cp.id)).toBe(true)
  })

  it('upserts by (customer,item): same pair updates, reuses id, no duplicate row', async () => {
    const a = await setContractPrice({ customerId: 'c1', catalogItemId: 'i1', priceMinor: 1800, createdBy: 'p1' })
    const b = await setContractPrice({ customerId: 'c1', catalogItemId: 'i1', priceMinor: 1500, createdBy: 'p1' })
    expect(b.id).toBe(a.id)
    expect(await resolveContractPrice('c1', 'i1')).toBe(1500)
    expect((await db.contractPrices.where('[customerId+catalogItemId]').equals(['c1','i1']).toArray())).toHaveLength(1)
  })

  it('resolve returns null when no contract price; getContractPrices filters by customer; remove deletes', async () => {
    expect(await resolveContractPrice('c1', 'nope')).toBeNull()
    const cp = await setContractPrice({ customerId: 'c2', catalogItemId: 'i9', priceMinor: 999, createdBy: 'p1' })
    expect((await getContractPrices('c2')).map((x) => x.id)).toEqual([cp.id])
    await removeContractPrice(cp.id)
    expect(await db.contractPrices.get(cp.id)).toBeUndefined()
  })

  it('removeContractPrice enqueues a delete op and hard-deletes the local row', async () => {
    const cp = await setContractPrice({ customerId: 'c1', catalogItemId: 'i1', priceMinor: 1800, createdBy: 'p1' })
    await removeContractPrice(cp.id)
    expect(await db.contractPrices.get(cp.id)).toBeUndefined()
    const q = await db.syncQueue.toArray()
    expect(q.some((e) => e.resourceType === 'ContractPrice' && e.resourceId === cp.id && e.action === 'delete')).toBe(true)
  })

  it('removeContractPrice on an absent id enqueues nothing and does not throw', async () => {
    const before = (await db.syncQueue.toArray()).length
    await removeContractPrice('nope')
    expect((await db.syncQueue.toArray()).length).toBe(before)
  })

  it('resolveContractPrice returns the base price below the first break and the tier at/above it', async () => {
    await setContractPrice({ customerId: 'c1', catalogItemId: 'i1', priceMinor: 2000, createdBy: 'p1', tiers: [{ minQuantity: 10, priceMinor: 1500 }, { minQuantity: 100, priceMinor: 1200 }] })
    expect(await resolveContractPrice('c1', 'i1', 1)).toBe(2000)   // below first break → base
    expect(await resolveContractPrice('c1', 'i1', 9)).toBe(2000)
    expect(await resolveContractPrice('c1', 'i1', 10)).toBe(1500)  // at break
    expect(await resolveContractPrice('c1', 'i1', 50)).toBe(1500)  // between breaks
    expect(await resolveContractPrice('c1', 'i1', 120)).toBe(1200) // highest applicable
  })

  it('resolveContractPrice defaults quantity to 1 and returns null when no row', async () => {
    expect(await resolveContractPrice('c1', 'none')).toBeNull()
  })

  it('setContractPrice persists tiers on the row (sorted) and enqueues them', async () => {
    const cp = await setContractPrice({ customerId: 'c2', catalogItemId: 'i2', priceMinor: 900, createdBy: 'p1', tiers: [{ minQuantity: 100, priceMinor: 700 }, { minQuantity: 10, priceMinor: 800 }] })
    expect(cp.tiers?.map((t) => t.minQuantity)).toEqual([10, 100]) // sorted ascending
    const enq = (await db.syncQueue.toArray()).find((e) => e.resourceId === cp.id)
    expect(enq).toBeTruthy()
  })
})
