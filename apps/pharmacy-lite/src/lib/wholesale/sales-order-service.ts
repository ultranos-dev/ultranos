import { db } from '@/lib/db'
import { enqueuePharmacySyncEntry } from '@/lib/dexie-sync-adapter'
import { hlc, serializeHlc } from '@/lib/hlc'
import { getFefoBatches } from '@/lib/inventory/fefo'
import { deductStock } from '@/lib/inventory/stock-service'
import { postCharge } from './customer-account-service'
import type { SalesOrder, SalesOrderLine, BatchAllocation, SalesOrderStatus } from './types'

interface DraftLineInput {
  catalogItemId: string
  description: string
  unit: 'each' | 'pack'
  quantity: number
  unitPrice: number
  packSize: number
}

async function nextOrderNumber(): Promise<string> {
  const settings = await db.pharmacySettings.toCollection().first()
  const prefix = settings?.salesOrderPrefix ?? 'SO-'
  const count = await db.salesOrders.count()
  return `${prefix}${count + 1}`
}

export async function createDraft(params: {
  customerId: string
  taxRate: number
  createdBy: string
  lines: DraftLineInput[]
  notes?: string
}): Promise<SalesOrder> {
  const lines: SalesOrderLine[] = params.lines.map((l) => {
    const baseUnits = l.unit === 'pack' ? l.quantity * l.packSize : l.quantity
    const lineTotal = l.quantity * l.unitPrice
    return {
      catalogItemId: l.catalogItemId,
      description: l.description,
      unit: l.unit,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      lineTotal,
      baseUnits,
      batchAllocations: [],
    }
  })

  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0)
  const taxAmount = Math.round((subtotal * params.taxRate) / 100)
  const now = new Date().toISOString()

  const order: SalesOrder = {
    id: crypto.randomUUID(),
    orderNumber: await nextOrderNumber(),
    customerId: params.customerId,
    status: 'draft',
    lines,
    subtotal,
    taxRate: params.taxRate,
    taxAmount,
    total: subtotal + taxAmount,
    notes: params.notes,
    createdBy: params.createdBy,
    createdAt: now,
    hlcTimestamp: serializeHlc(hlc.now()),
  }

  await db.salesOrders.put(order)
  await enqueuePharmacySyncEntry({
    resourceType: 'SalesOrder',
    resourceId: order.id,
    action: 'create',
    payload: order as unknown as Record<string, unknown>,
    hlcTimestamp: order.hlcTimestamp,
    createdAt: now,
  })

  return order
}

export async function getOrderById(id: string): Promise<SalesOrder | undefined> {
  return db.salesOrders.get(id)
}

export async function confirm(orderId: string): Promise<void> {
  const order = await db.salesOrders.get(orderId)
  if (!order || order.status !== 'draft') throw new Error('Order not in draft')
  await db.salesOrders.update(orderId, { status: 'confirmed' })
}

export async function pickOrder(orderId: string): Promise<SalesOrder> {
  const order = await db.salesOrders.get(orderId)
  if (!order || order.status !== 'confirmed') throw new Error('Order not confirmed')

  const lines = await Promise.all(
    order.lines.map(async (line) => {
      const batches = await getFefoBatches(line.catalogItemId) // earliest expiry first
      const allocations: BatchAllocation[] = []
      let remaining = line.baseUnits
      for (const b of batches) {
        if (remaining <= 0) break
        const take = Math.min(remaining, b.quantityOnHand)
        if (take > 0) {
          allocations.push({ stockBatchId: b.id, qty: take })
          remaining -= take
        }
      }
      const allocatedQty = allocations.reduce((sum, a) => sum + a.qty, 0)
      const shortStock = allocatedQty < line.baseUnits
      return { ...line, batchAllocations: allocations, shortStock }
    }),
  )

  await db.salesOrders.update(orderId, { status: 'picking', lines })
  return { ...order, status: 'picking', lines }
}

export async function fulfill(orderId: string, performedBy: string): Promise<void> {
  const order = await db.salesOrders.get(orderId)
  if (!order || order.status !== 'picking') throw new Error('Order not in picking status')
  for (const line of order.lines) {
    for (const alloc of line.batchAllocations) {
      await deductStock({
        stockBatchId: alloc.stockBatchId,
        catalogItemId: line.catalogItemId,
        quantity: alloc.qty,
        type: 'sold',
        referenceId: orderId,
        referenceType: 'sales_order',
        performedBy,
      })
    }
  }
  await db.salesOrders.update(orderId, { status: 'fulfilled', fulfilledAt: new Date().toISOString() })
  await postCharge(order.customerId, order.total, orderId, performedBy)
}

export async function cancel(orderId: string): Promise<void> {
  const order = await db.salesOrders.get(orderId)
  if (!order) throw new Error('Order not found')
  if (order.status === 'fulfilled') throw new Error('Cannot cancel a fulfilled order')
  await db.salesOrders.update(orderId, { status: 'cancelled', cancelledAt: new Date().toISOString() })
}

export async function getOrders(filter?: { status?: SalesOrderStatus }): Promise<SalesOrder[]> {
  const all = await db.salesOrders.reverse().sortBy('createdAt')
  return filter?.status ? all.filter((o) => o.status === filter.status) : all
}
