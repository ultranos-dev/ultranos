import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { createSupplier, updateSupplier, deactivateSupplier, getActiveSuppliers } from '@/lib/procurement/supplier-service'

beforeEach(async () => {
  await db.suppliers.clear()
  await db.syncQueue.clear()
})

describe('supplier-service sync + active filter', () => {
  it('getActiveSuppliers returns suppliers created with isActive:true', async () => {
    const s = await createSupplier({ name: 'Acme Pharma' })
    const active = await getActiveSuppliers()
    expect(active.map((x) => x.id)).toContain(s.id)
  })

  it('updateSupplier enqueues a Supplier update sync entry', async () => {
    const s = await createSupplier({ name: 'Acme' })
    await db.syncQueue.clear() // ignore the create entry
    await updateSupplier(s.id, { phone: '+100' })
    const entries = await db.syncQueue.where('resourceType').equals('Supplier').toArray()
    expect(entries.some((e) => e.resourceId === s.id && e.action === 'update')).toBe(true)
  })

  it('deactivateSupplier sets isActive false, drops it from active list, and enqueues sync', async () => {
    const s = await createSupplier({ name: 'Acme' })
    await db.syncQueue.clear()
    await deactivateSupplier(s.id)
    const active = await getActiveSuppliers()
    expect(active.map((x) => x.id)).not.toContain(s.id)
    const entries = await db.syncQueue.where('resourceType').equals('Supplier').toArray()
    expect(entries.some((e) => e.resourceId === s.id && e.action === 'update')).toBe(true)
  })
})
