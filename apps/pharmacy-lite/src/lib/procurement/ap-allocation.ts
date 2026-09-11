export interface AllocatableInvoice {
  id: string
  invoiceNumber: string
  amountDue: number
  dueDate: string
}

export interface AllocationLine {
  supplierInvoiceId: string
  invoiceNumber: string
  amount: number
}

/**
 * Allocate a payment across invoices oldest-dueDate-first (tie-break by invoiceNumber),
 * applying min(remaining, amountDue) to each. Returns the allocation lines and any
 * `unapplied` leftover once every invoice is full (payment exceeds total outstanding).
 * Pure — integer minor units, deterministic.
 */
export function allocateFifo(
  invoices: AllocatableInvoice[],
  paymentAmount: number,
): { allocations: AllocationLine[]; unapplied: number } {
  const sorted = [...invoices]
    .filter((i) => i.amountDue > 0)
    .sort((x, y) => (x.dueDate < y.dueDate ? -1 : x.dueDate > y.dueDate ? 1 : x.invoiceNumber.localeCompare(y.invoiceNumber)))
  const allocations: AllocationLine[] = []
  let remaining = Math.max(0, paymentAmount)
  for (const inv of sorted) {
    if (remaining <= 0) break
    const amount = Math.min(remaining, inv.amountDue)
    if (amount > 0) {
      allocations.push({ supplierInvoiceId: inv.id, invoiceNumber: inv.invoiceNumber, amount })
      remaining -= amount
    }
  }
  return { allocations, unapplied: remaining }
}
