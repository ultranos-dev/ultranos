import { db } from '@/lib/db'
import { enqueuePharmacySyncEntry } from '@/lib/dexie-sync-adapter'
import type { SupplierItem } from './types'

async function enqueue(item: SupplierItem, action: 'create' | 'update' | 'delete'): Promise<void> {
  await enqueuePharmacySyncEntry({
    resourceType: 'SupplierItem', resourceId: item.id, action,
    payload: item as unknown as Record<string, unknown>, hlcTimestamp: item.hlcTimestamp, createdAt: item.createdAt,
  })
}

/** Clear isPreferred on every OTHER row for this item (call inside a tx). Returns the cleared rows. */
async function clearOtherPreferred(catalogItemId: string, keepId: string, now: string): Promise<SupplierItem[]> {
  const others = await db.supplierItems.where('catalogItemId').equals(catalogItemId).toArray()
  const cleared: SupplierItem[] = []
  for (const o of others) {
    if (o.id !== keepId && o.isPreferred) {
      await db.supplierItems.update(o.id, { isPreferred: false, hlcTimestamp: now })
      cleared.push({ ...o, isPreferred: false, hlcTimestamp: now })
    }
  }
  return cleared
}

export async function upsertSupplierItem(params: {
  id?: string
  supplierId: string
  catalogItemId: string
  supplierSku?: string
  unitPrice?: number
  minOrderQty?: number
  leadTimeDays?: number
  isPreferred?: boolean
  createdBy: string
}): Promise<SupplierItem> {
  const now = new Date().toISOString()
  const existing = params.id
    ? await db.supplierItems.get(params.id)
    : await db.supplierItems.where('[supplierId+catalogItemId]').equals([params.supplierId, params.catalogItemId]).first()

  const record: SupplierItem = {
    id: existing?.id ?? params.id ?? crypto.randomUUID(),
    supplierId: params.supplierId,
    catalogItemId: params.catalogItemId,
    supplierSku: params.supplierSku?.trim() || undefined,
    unitPrice: params.unitPrice,
    minOrderQty: params.minOrderQty,
    leadTimeDays: params.leadTimeDays,
    isPreferred: params.isPreferred ?? existing?.isPreferred ?? false,
    createdBy: existing?.createdBy ?? params.createdBy,
    createdAt: existing?.createdAt ?? now,
    hlcTimestamp: now,
  }

  let cleared: SupplierItem[] = []
  await db.transaction('rw', db.supplierItems, async () => {
    if (record.isPreferred) cleared = await clearOtherPreferred(record.catalogItemId, record.id, now)
    await db.supplierItems.put(record)
  })
  await enqueue(record, existing ? 'update' : 'create')
  for (const c of cleared) await enqueue(c, 'update')
  return record
}

export async function setPreferredSupplier(catalogItemId: string, supplierItemId: string): Promise<void> {
  const now = new Date().toISOString()
  const target = await db.supplierItems.get(supplierItemId)
  if (!target || target.catalogItemId !== catalogItemId) throw new Error('Supplier item not found for this catalog item')
  let cleared: SupplierItem[] = []
  await db.transaction('rw', db.supplierItems, async () => {
    cleared = await clearOtherPreferred(catalogItemId, supplierItemId, now)
    await db.supplierItems.update(supplierItemId, { isPreferred: true, hlcTimestamp: now })
  })
  await enqueue({ ...target, isPreferred: true, hlcTimestamp: now }, 'update')
  for (const c of cleared) await enqueue(c, 'update')
}

export async function getSupplierItemsForCatalogItem(catalogItemId: string): Promise<SupplierItem[]> {
  return db.supplierItems.where('catalogItemId').equals(catalogItemId).toArray()
}

export async function getPreferredSupplierItem(catalogItemId: string): Promise<SupplierItem | undefined> {
  const rows = await db.supplierItems.where('catalogItemId').equals(catalogItemId).toArray()
  return rows.find((r) => r.isPreferred)
}

export async function getSupplierItemsForSupplier(supplierId: string): Promise<SupplierItem[]> {
  return db.supplierItems.where('supplierId').equals(supplierId).toArray()
}

export async function removeSupplierItem(id: string): Promise<void> {
  const existing = await db.supplierItems.get(id)
  await db.supplierItems.delete(id)
  if (existing) await enqueue(existing, 'delete')
}
