'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/Button'
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
        <p className="text-sm text-neutral-500">Loading...</p>
      </div>
    )
  }

  // Active invoice mode
  if (activeInvoice) {
    const isPaidInFull = activeInvoice.amountDue <= 0

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-neutral-900">Point of Sale</h1>
          <Button
            variant="secondary"
            onClick={() => clearActiveInvoice()}
          >
            Back to list
          </Button>
        </div>

        <InvoiceSummary
          invoice={activeInvoice}
          currencyMinorUnits={CURRENCY_MINOR_UNITS}
          currency={CURRENCY}
        />

        {isPaidInFull ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center">
              <p className="text-lg font-semibold text-green-800">Paid in Full</p>
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1">
                Print Receipt
              </Button>
              <Button variant="primary" className="flex-1" onClick={() => clearActiveInvoice()}>
                Done
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
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-neutral-900">Point of Sale</h1>

      {/* No cash drawer warning */}
      {!activeCashDrawer && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-800">
            No cash drawer open. Cash payments will not be tracked until a drawer is opened.
          </p>
        </div>
      )}

      {/* Pending invoices */}
      {pendingInvoices.length === 0 ? (
        <div className="rounded-lg border border-neutral-200 bg-white p-8 text-center">
          <p className="text-neutral-500">No pending invoices.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-neutral-500">Pending Invoices</h2>
          <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
            {pendingInvoices.map((inv) => (
              <li key={inv.id}>
                <button
                  type="button"
                  onClick={() => setActiveInvoice(inv)}
                  className="flex w-full items-center justify-between px-4 py-3 text-start hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
                >
                  <div>
                    <p className="text-sm font-medium text-neutral-900">{inv.invoiceNumber}</p>
                    <p className="text-xs text-neutral-500">
                      {new Date(inv.createdAt).toLocaleDateString()} - {inv.items.length} item{inv.items.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="text-end">
                    <p className="text-sm font-semibold tabular-nums text-neutral-900">
                      {CURRENCY} {(inv.amountDue / Math.pow(10, CURRENCY_MINOR_UNITS)).toFixed(CURRENCY_MINOR_UNITS)}
                    </p>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                      inv.status === 'partial'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-neutral-100 text-neutral-600'
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
