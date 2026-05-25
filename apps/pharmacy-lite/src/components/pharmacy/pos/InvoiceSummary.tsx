'use client'

import type { Invoice, InvoiceStatus } from '@/lib/pos/types'

interface InvoiceSummaryProps {
  invoice: Invoice
  currencyMinorUnits: number
  currency: string
}

const statusBadgeClasses: Record<InvoiceStatus, string> = {
  paid: 'bg-green-100 text-green-800',
  partial: 'bg-amber-100 text-amber-800',
  voided: 'bg-red-100 text-red-800',
  draft: 'bg-neutral-100 text-neutral-600',
  finalized: 'bg-neutral-100 text-neutral-600',
}

function formatAmount(amount: number, currency: string, minorUnits: number): string {
  const divisor = Math.pow(10, minorUnits)
  return `${currency} ${(amount / divisor).toFixed(minorUnits)}`
}

export function InvoiceSummary({ invoice, currencyMinorUnits, currency }: InvoiceSummaryProps) {
  const fmt = (amount: number) => formatAmount(amount, currency, currencyMinorUnits)

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-neutral-900">
          Invoice {invoice.invoiceNumber}
        </h2>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusBadgeClasses[invoice.status]}`}
        >
          {invoice.status}
        </span>
      </div>

      {/* Line items */}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-100 text-neutral-500">
            <th className="py-1 text-start font-medium">Item</th>
            <th className="py-1 text-end font-medium tabular-nums">Qty</th>
            <th className="py-1 text-end font-medium tabular-nums">Unit</th>
            <th className="py-1 text-end font-medium tabular-nums">Total</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item, idx) => (
            <tr key={idx} className="border-b border-neutral-50">
              <td className="py-1.5 text-neutral-800">{item.description}</td>
              <td className="py-1.5 text-end tabular-nums text-neutral-700">{item.quantity}</td>
              <td className="py-1.5 text-end tabular-nums text-neutral-700">{fmt(item.unitPrice)}</td>
              <td className="py-1.5 text-end tabular-nums text-neutral-700">{fmt(item.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="space-y-1 border-t border-neutral-200 pt-3 text-sm">
        <div className="flex justify-between text-neutral-600">
          <span>Subtotal</span>
          <span className="tabular-nums">{fmt(invoice.subtotal)}</span>
        </div>
        <div className="flex justify-between text-neutral-600">
          <span>Tax ({(invoice.taxRate * 100).toFixed(1)}%)</span>
          <span className="tabular-nums">{fmt(invoice.taxAmount)}</span>
        </div>
        <div className="flex justify-between font-semibold text-neutral-900">
          <span>Total</span>
          <span className="tabular-nums">{fmt(invoice.total)}</span>
        </div>
        <div className="flex justify-between text-neutral-600">
          <span>Paid</span>
          <span className="tabular-nums">{fmt(invoice.amountPaid)}</span>
        </div>
        <div className="flex justify-between font-semibold text-neutral-900">
          <span>Amount Due</span>
          <span className="tabular-nums">{fmt(invoice.amountDue)}</span>
        </div>
      </div>
    </div>
  )
}
