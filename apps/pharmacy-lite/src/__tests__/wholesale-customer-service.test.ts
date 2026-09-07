import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { createCustomer, getActiveCustomers, deactivateCustomer } from '@/lib/wholesale/customer-service'

beforeEach(async () => {
  await db.delete(); await db.open()
  if (!encryptionKeyStore.isReady()) {
    encryptionKeyStore.setKey(await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']))
  }
})

describe('customer-service', () => {
  it('creates a customer, persists it, and enqueues a sync entry', async () => {
    const c = await createCustomer({ name: 'Kabul Pharma Co', ultranosOrgId: 'org-9' })
    expect(c.id).toBeTruthy()
    expect(await db.wholesaleCustomers.get(c.id)).toMatchObject({ name: 'Kabul Pharma Co', isActive: true, ultranosOrgId: 'org-9' })
    const queued = await db.syncQueue.toArray()
    expect(queued.some((q) => q.resourceType === 'WholesaleCustomer' && q.resourceId === c.id)).toBe(true)
  })

  it('lists only active customers', async () => {
    const a = await createCustomer({ name: 'A' })
    const b = await createCustomer({ name: 'B' })
    await deactivateCustomer(b.id)
    const active = await getActiveCustomers()
    expect(active.map((x) => x.id)).toEqual([a.id])
  })
})
