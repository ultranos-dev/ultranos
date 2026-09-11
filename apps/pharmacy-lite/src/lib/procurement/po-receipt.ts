import type { PurchaseOrder, PurchaseOrderItem, PurchaseOrderStatus } from './types'

export interface ReceivedLine {
  catalogItemId: string
  quantity: number
}

export interface OverReceiptViolation {
  catalogItemId: string
  catalogItemName: string
  allowed: number
  attempted: number
  controlled: boolean
}

export class OverReceiptError extends Error {
  violations: OverReceiptViolation[]
  constructor(violations: OverReceiptViolation[]) {
    super('Received quantity exceeds the allowed maximum')
    this.name = 'OverReceiptError'
    this.violations = violations
  }
}

/**
 * Validate received quantities against a PO. Non-controlled lines may exceed the
 * remaining quantity up to `tolerancePercent`, or beyond it only if an
 * `overrideReason` is supplied. Controlled lines (in `controlledIds`) may never
 * exceed the remaining quantity. Off-PO lines are ignored (the UI prevents them).
 * Throws OverReceiptError listing all violations.
 */
export function validateReceiptAgainstPO(params: {
  po: PurchaseOrder
  received: ReceivedLine[]
  controlledIds: Set<string>
  tolerancePercent: number
  overrideReason?: string
}): void {
  const { po, received, controlledIds, tolerancePercent, overrideReason } = params
  const hasReason = !!overrideReason?.trim()
  const violations: OverReceiptViolation[] = []

  for (const line of received) {
    const poItem = po.items.find((i) => i.catalogItemId === line.catalogItemId)
    if (!poItem) continue
    const remaining = poItem.quantityOrdered - poItem.quantityReceived
    const controlled = controlledIds.has(line.catalogItemId)
    const allowed = controlled ? remaining : Math.floor(remaining * (1 + tolerancePercent / 100))
    if (line.quantity > allowed && (controlled || !hasReason)) {
      violations.push({
        catalogItemId: line.catalogItemId,
        catalogItemName: poItem.catalogItemName,
        allowed,
        attempted: line.quantity,
        controlled,
      })
    }
  }

  if (violations.length > 0) throw new OverReceiptError(violations)
}

function recomputeStatus(items: PurchaseOrderItem[], fallbackWhenNone: PurchaseOrderStatus): PurchaseOrderStatus {
  const allFully = items.every((i) => i.quantityReceived >= i.quantityOrdered)
  const anyReceived = items.some((i) => i.quantityReceived > 0)
  if (allFully) return 'closed'
  if (anyReceived) return 'partially_received'
  return fallbackWhenNone
}

/** Apply received quantities to a PO (upward). Returns updated items + status + closedAt. */
export function applyReceiptToPO(
  po: PurchaseOrder,
  received: ReceivedLine[],
  now: string,
): { items: PurchaseOrderItem[]; status: PurchaseOrderStatus; closedAt: string | undefined } {
  const items = po.items.map((item) => {
    const r = received.find((x) => x.catalogItemId === item.catalogItemId)
    return r ? { ...item, quantityReceived: item.quantityReceived + r.quantity } : item
  })
  const status = recomputeStatus(items, po.status)
  return { items, status, closedAt: status === 'closed' ? now : po.closedAt }
}

/** Reverse received quantities off a PO (downward). Reopens closed POs; clears closedAt. */
export function reverseReceiptFromPO(
  po: PurchaseOrder,
  reversed: ReceivedLine[],
): { items: PurchaseOrderItem[]; status: PurchaseOrderStatus; closedAt: string | undefined } {
  const items = po.items.map((item) => {
    const r = reversed.find((x) => x.catalogItemId === item.catalogItemId)
    return r ? { ...item, quantityReceived: Math.max(0, item.quantityReceived - r.quantity) } : item
  })
  // When nothing remains received, a PO that was being received returns to 'sent'.
  const status = recomputeStatus(items, 'sent')
  return { items, status, closedAt: status === 'closed' ? po.closedAt : undefined }
}
