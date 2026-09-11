import { db } from '@/lib/db'
import { enqueuePharmacySyncEntry } from '@/lib/dexie-sync-adapter'
import type { Supplier } from './types'

export async function createSupplier(params: {
  name: string
  contactName?: string
  phone?: string
  email?: string
  address?: string
  leadTimeDays?: number
  paymentTerms?: string
}): Promise<Supplier> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const supplier: Supplier = {
    id,
    name: params.name.trim(),
    contactName: params.contactName?.trim() || undefined,
    phone: params.phone?.trim() || undefined,
    email: params.email?.trim() || undefined,
    address: params.address?.trim() || undefined,
    leadTimeDays: params.leadTimeDays,
    paymentTerms: params.paymentTerms?.trim() || undefined,
    isActive: true,
    createdAt: now,
  }
  await db.suppliers.put(supplier)
  await enqueuePharmacySyncEntry({
    resourceType: 'Supplier',
    resourceId: id,
    action: 'create',
    payload: supplier as unknown as Record<string, unknown>,
    hlcTimestamp: now,
    createdAt: now,
  })
  return supplier
}

export async function updateSupplier(id: string, updates: Partial<Omit<Supplier, 'id' | 'createdAt'>>): Promise<void> {
  await db.suppliers.update(id, updates)
  const supplier = await db.suppliers.get(id)
  if (supplier) {
    await enqueuePharmacySyncEntry({
      resourceType: 'Supplier',
      resourceId: id,
      action: 'update',
      payload: supplier as unknown as Record<string, unknown>,
      hlcTimestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    })
  }
}

export async function deactivateSupplier(id: string): Promise<void> {
  await db.suppliers.update(id, { isActive: false })
  const supplier = await db.suppliers.get(id)
  if (supplier) {
    await enqueuePharmacySyncEntry({
      resourceType: 'Supplier',
      resourceId: id,
      action: 'update',
      payload: supplier as unknown as Record<string, unknown>,
      hlcTimestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    })
  }
}

export async function getActiveSuppliers(): Promise<Supplier[]> {
  return db.suppliers.filter((s) => s.isActive).toArray()
}

export async function getAllSuppliers(): Promise<Supplier[]> {
  return db.suppliers.orderBy('name').toArray()
}

export async function getSupplierById(id: string): Promise<Supplier | undefined> {
  return db.suppliers.get(id)
}
