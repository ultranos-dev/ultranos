import { describe, it, expect } from 'vitest'
import { allocateFifo, type AllocatableInvoice } from '@/lib/procurement/ap-allocation'

const invs: AllocatableInvoice[] = [
  { id: 'b', invoiceNumber: 'B', amountDue: 300, dueDate: '2026-02-01' },
  { id: 'a', invoiceNumber: 'A', amountDue: 500, dueDate: '2026-01-01' }, // oldest due
  { id: 'c', invoiceNumber: 'C', amountDue: 200, dueDate: '2026-03-01' },
]

describe('allocateFifo', () => {
  it('applies oldest-dueDate-first and fills exactly', () => {
    const r = allocateFifo(invs, 800) // fills A(500) then B(300)
    expect(r.allocations).toEqual([
      { supplierInvoiceId: 'a', invoiceNumber: 'A', amount: 500 },
      { supplierInvoiceId: 'b', invoiceNumber: 'B', amount: 300 },
    ])
    expect(r.unapplied).toBe(0)
  })
  it('partially fills the last invoice', () => {
    const r = allocateFifo(invs, 600) // A(500) + B(100)
    expect(r.allocations).toEqual([
      { supplierInvoiceId: 'a', invoiceNumber: 'A', amount: 500 },
      { supplierInvoiceId: 'b', invoiceNumber: 'B', amount: 100 },
    ])
    expect(r.unapplied).toBe(0)
  })
  it('reports leftover when payment exceeds total outstanding', () => {
    const r = allocateFifo(invs, 1200) // total due = 1000
    expect(r.allocations.reduce((s, a) => s + a.amount, 0)).toBe(1000)
    expect(r.unapplied).toBe(200)
  })
  it('skips invoices with no amount due and single-invoice fill', () => {
    const r = allocateFifo([{ id: 'x', invoiceNumber: 'X', amountDue: 0, dueDate: '2026-01-01' }, invs[1]!], 500)
    expect(r.allocations).toEqual([{ supplierInvoiceId: 'a', invoiceNumber: 'A', amount: 500 }])
  })
  it('returns empty allocations for a zero payment', () => {
    expect(allocateFifo(invs, 0)).toEqual({ allocations: [], unapplied: 0 })
  })
})
