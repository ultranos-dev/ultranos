'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { usePosStore } from '@/stores/pos-store'
import { db } from '@/lib/db'
import { getOpenCashDrawer } from '@/lib/pos/cash-drawer-service'
import type { Invoice } from '@/lib/pos/types'
import { InvoiceSummary } from './InvoiceSummary'
import { PaymentForm } from './PaymentForm'

const CURRENCY = 'AFN'
const CURRENCY_MINOR_UNITS = 2
const ENABLE_CREDIT = true

export function PosPage() {
  const t = useTranslations('pos')
  const { activeInvoice, setActiveInvoice, activeCashDrawer, setActiveCashDrawer, clearActiveInvoice } = usePosStore()
  const [pendingInvoices, setPendingInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    const drawer = await getOpenCashDrawer()
    setActiveCashDrawer(drawer)

    const invoices = await db.invoices
      .where('status')
      .anyOf('draft', 'finalized', 'partial')
      .toArray()

    setPendingInvoices(invoices)
    setLoading(false)
  }, [setActiveCashDrawer])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handlePaymentRecorded = async () => {
    // Reload the active invoice to reflect updated payment state
    if (activeInvoice) {
      const updated = await db.invoices.get(activeInvoice.id)
      if (updated) {
        setActiveInvoice(updated)
      }
    }
    // Reload pending list
    const invoices = await db.invoices
      .where('status')
      .anyOf('draft', 'finalized', 'partial')
      .toArray()
    setPendingInvoices(invoices)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">{t('recording')}</p>
      </div>
    )
  }

  // Active invoice mode
  if (activeInvoice) {
    const isPaidInFull = activeInvoice.amountDue <= 0

    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">{t('pointOfSale')}</h1>
          <Button
            variant="secondary"
            onClick={() => clearActiveInvoice()}
          >
            {t('backToList')}
          </Button>
        </div>

        <InvoiceSummary
          invoice={activeInvoice}
          currencyMinorUnits={CURRENCY_MINOR_UNITS}
          currency={CURRENCY}
        />

        {isPaidInFull ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-success/20 bg-success/5 p-6 text-center">
              <p className="text-lg font-semibold text-success">{t('paidInFull')}</p>
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1">
                {t('printReceipt')}
              </Button>
              <Button variant="default" className="flex-1" onClick={() => clearActiveInvoice()}>
                {t('done')}
              </Button>
            </div>
          </div>
        ) : (
          <PaymentForm
            invoice={activeInvoice}
            cashDrawerId={activeCashDrawer?.id}
            currencyMinorUnits={CURRENCY_MINOR_UNITS}
            enableCredit={ENABLE_CREDIT}
            onPaymentRecorded={handlePaymentRecorded}
          />
        )}
      </div>
    )
  }

  // Invoice list mode
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-foreground">{t('pointOfSale')}</h1>

      {/* No cash drawer warning */}
      {!activeCashDrawer && (
        <div className="rounded-md border border-warning/20 bg-warning/5 p-3">
          <p className="text-sm font-medium text-warning">
            {t('noCashDrawerWarning')}
          </p>
        </div>
      )}

      {/* Pending invoices */}
      {pendingInvoices.length === 0 ? (
        <EmptyState title={t('noPendingInvoices')} />
      ) : (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">{t('pendingInvoices')}</h2>
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {pendingInvoices.map((inv) => (
              <li key={inv.id}>
                <button
                  type="button"
                  onClick={() => setActiveInvoice(inv)}
                  className="flex w-full items-center justify-between px-4 py-3 text-start hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{inv.invoiceNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(inv.createdAt).toLocaleDateString()} - {inv.items.length} item{inv.items.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="text-end">
                    <p className="text-sm font-semibold tabular-nums text-foreground">
                      {CURRENCY} {(inv.amountDue / Math.pow(10, CURRENCY_MINOR_UNITS)).toFixed(CURRENCY_MINOR_UNITS)}
                    </p>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                      inv.status === 'partial'
                        ? 'bg-warning/10 text-warning'
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {inv.status}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
