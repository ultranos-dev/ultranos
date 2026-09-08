import { db } from '@/lib/db'
import { enqueuePharmacySyncEntry } from '@/lib/dexie-sync-adapter'
import type { ContractPrice, PriceBreak } from './types'

export async function setContractPrice(params: {
  customerId: string; catalogItemId: string; priceMinor: number; createdBy: string; tiers?: PriceBreak[]
}): Promise<ContractPrice> {
  const existing = await db.contractPrices
    .where('[customerId+catalogItemId]').equals([params.customerId, params.catalogItemId]).first()
  const now = new Date().toISOString()
  const normalizedTiers = (params.tiers ?? [])
    .filter((t) => t.minQuantity > 0 && Number.isFinite(t.priceMinor))
    .sort((a, b) => a.minQuantity - b.minQuantity)
  const row: ContractPrice = existing
    ? { ...existing, priceMinor: params.priceMinor, tiers: normalizedTiers }
    : { id: crypto.randomUUID(), customerId: params.customerId, catalogItemId: params.catalogItemId, priceMinor: params.priceMinor, tiers: normalizedTiers, createdBy: params.createdBy, createdAt: now }
  await db.contractPrices.put(row)
  await enqueuePharmacySyncEntry({
    resourceType: 'ContractPrice', resourceId: row.id, action: existing ? 'update' : 'create',
    payload: row as unknown as Record<string, unknown>, hlcTimestamp: now, createdAt: now,
  })
  return row
}

export async function removeContractPrice(id: string): Promise<void> {
  const existing = await db.contractPrices.get(id)
  if (existing) {
    const now = new Date().toISOString()
    await enqueuePharmacySyncEntry({
      resourceType: 'ContractPrice',
      resourceId: id,
      action: 'delete',
      payload: existing as unknown as Record<string, unknown>,
      hlcTimestamp: now,
      createdAt: now,
    })
  }
  await db.contractPrices.delete(id)
}

export async function getContractPrices(customerId: string): Promise<ContractPrice[]> {
  return db.contractPrices.where('customerId').equals(customerId).toArray()
}

export async function resolveContractPrice(customerId: string, catalogItemId: string, quantity = 1): Promise<number | null> {
  const row = await db.contractPrices.where('[customerId+catalogItemId]').equals([customerId, catalogItemId]).first()
  if (!row) return null
  const applicable = (row.tiers ?? []).filter((t) => t.minQuantity <= quantity).sort((a, b) => b.minQuantity - a.minQuantity)
  const best = applicable[0]
  return best ? best.priceMinor : row.priceMinor
}
