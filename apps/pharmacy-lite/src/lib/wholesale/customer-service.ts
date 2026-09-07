import { db } from '@/lib/db'
import { enqueuePharmacySyncEntry } from '@/lib/dexie-sync-adapter'
import type { WholesaleCustomer } from './types'

export async function createCustomer(params: {
  name: string
  contactName?: string
  phone?: string
  email?: string
  address?: string
  paymentTermsDays?: number
  creditLimit?: number
  ultranosOrgId?: string
}): Promise<WholesaleCustomer> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const customer: WholesaleCustomer = {
    id,
    name: params.name.trim(),
    contactName: params.contactName?.trim() || undefined,
    phone: params.phone?.trim() || undefined,
    email: params.email?.trim() || undefined,
    address: params.address?.trim() || undefined,
    paymentTermsDays: params.paymentTermsDays,
    creditLimit: params.creditLimit,
    ultranosOrgId: params.ultranosOrgId?.trim() || undefined,
    isActive: true,
    createdAt: now,
  }
  await db.wholesaleCustomers.put(customer)
  await enqueuePharmacySyncEntry({
    resourceType: 'WholesaleCustomer',
    resourceId: id,
    action: 'create',
    payload: customer as unknown as Record<string, unknown>,
    hlcTimestamp: now,
    createdAt: now,
  })
  return customer
}

export async function updateCustomer(
  id: string,
  updates: Partial<Omit<WholesaleCustomer, 'id' | 'createdAt'>>,
): Promise<void> {
  await db.wholesaleCustomers.update(id, updates)
}

export async function deactivateCustomer(id: string): Promise<void> {
  await db.wholesaleCustomers.update(id, { isActive: false })
}

export async function getActiveCustomers(): Promise<WholesaleCustomer[]> {
  return (await db.wholesaleCustomers.orderBy('name').toArray()).filter((c) => c.isActive)
}

export async function getAllCustomers(): Promise<WholesaleCustomer[]> {
  return db.wholesaleCustomers.orderBy('name').toArray()
}

export async function getCustomerById(id: string): Promise<WholesaleCustomer | undefined> {
  return db.wholesaleCustomers.get(id)
}
