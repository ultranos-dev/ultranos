'use client'

import { useTranslations } from 'next-intl'
import type { Invoice, InvoiceStatus } from '@/lib/pos/types'

interface InvoiceSummaryProps {
  invoice: Invoice
  currencyMinorUnits: number
  currency: string
}

const statusBadgeClasses: Record<InvoiceStatus, string> = {
  paid: 'bg-success/10 text-success',
  partial: 'bg-warning/10 text-warning',
  voided: 'bg-destructive/10 text-destructive',
  draft: 'bg-muted text-muted-foreground',
  finalized: 'bg-muted text-muted-foreground',
}

function formatAmount(amount: number, currency: string, minorUnits: number): string {
  const divisor = Math.pow(10, minorUnits)
  return `${currency} ${(amount / divisor).toFixed(minorUnits)}`
}

export function InvoiceSummary({ invoice, currencyMinorUnits, currency }: InvoiceSummaryProps) {
  const t = useTranslations('pos')
  const fmt = (amount: number) => formatAmount(amount, currency, currencyMinorUnits)

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">
          {t('invoiceLabel')} {invoice.invoiceNumber}
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
          <tr className="border-b border-border text-muted-foreground">
            <th className="py-1 text-start font-medium">{t('itemCol')}</th>
            <th className="py-1 text-end font-medium tabular-nums">{t('qtyCol')}</th>
            <th className="py-1 text-end font-medium tabular-nums">{t('unitCol')}</th>
            <th className="py-1 text-end font-medium tabular-nums">{t('totalCol')}</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item, idx) => (
            <tr key={idx} className="border-b border-border">
              <td className="py-1.5 text-foreground">{item.description}</td>
              <td className="py-1.5 text-end tabular-nums text-muted-foreground">{item.quantity}</td>
              <td className="py-1.5 text-end tabular-nums text-muted-foreground">{fmt(item.unitPrice)}</td>
              <td className="py-1.5 text-end tabular-nums text-muted-foreground">{fmt(item.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="space-y-1 border-t border-border pt-3 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>{t('subtotal')}</span>
          <span className="tabular-nums">{fmt(invoice.subtotal)}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>{t('tax', { rate: (invoice.taxRate * 100).toFixed(1) })}</span>
          <span className="tabular-nums">{fmt(invoice.taxAmount)}</span>
        </div>
        <div className="flex justify-between font-semibold text-foreground">
          <span>{t('total')}</span>
          <span className="tabular-nums">{fmt(invoice.total)}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>{t('paid')}</span>
          <span className="tabular-nums">{fmt(invoice.amountPaid)}</span>
        </div>
        <div className="flex justify-between font-semibold text-foreground">
          <span>{t('amountDue')}</span>
          <span className="tabular-nums">{fmt(invoice.amountDue)}</span>
        </div>
      </div>
    </div>
  )
}
