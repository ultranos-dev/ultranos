'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { SearchInput } from '@ultranos/ui-kit/components/ui/search-input'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { Receipt, FileSearch } from '@ultranos/ui-kit/icons'
import { usePosStore } from '@/stores/pos-store'
import { db } from '@/lib/db'
import { getOpenCashDrawer } from '@/lib/pos/cash-drawer-service'
import type { Invoice } from '@/lib/pos/types'
import { InvoiceSummary } from './InvoiceSummary'
import { PaymentForm } from './PaymentForm'

const CURRENCY = 'AFN'
const CURRENCY_MINOR_UNITS = 2
const ENABLE_CREDIT = true

type StatusTab = 'all' | 'draft' | 'finalized' | 'partial'

export function PosPage() {
  const t = useTranslations('pos')
  const { activeInvoice, setActiveInvoice, activeCashDrawer, setActiveCashDrawer, clearActiveInvoice } = usePosStore()
  const [pendingInvoices, setPendingInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusTab, setStatusTab] = useState<StatusTab>('all')

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

  // Active invoice mode
  if (activeInvoice) {
    const isPaidInFull = activeInvoice.amountDue <= 0

    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="w-fit px-0"
            onClick={() => clearActiveInvoice()}
          >
            {t('backToList')}
          </Button>
          <h1 className="text-2xl font-semibold text-foreground">{t('pointOfSale')}</h1>
        </div>

        <InvoiceSummary
          invoice={activeInvoice}
          currencyMinorUnits={CURRENCY_MINOR_UNITS}
          currency={CURRENCY}
        />

        {isPaidInFull ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-card p-5 text-center shadow-card ring-[0.65px] ring-border/50">
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

  const query = search.trim().toLowerCase()
  const filtersActive = query !== '' || statusTab !== 'all'
  const filtered = pendingInvoices.filter((inv) => {
    if (statusTab !== 'all' && inv.status !== statusTab) return false
    if (!query) return true
    return inv.invoiceNumber.toLowerCase().includes(query)
  })

  function clearFilters() {
    setSearch('')
    setStatusTab('all')
  }

  const TABS: { key: StatusTab; label: string }[] = [
    { key: 'all', label: t('filterAll') },
    { key: 'draft', label: t('statusDraft') },
    { key: 'finalized', label: t('statusFinalized') },
    { key: 'partial', label: t('statusPartial') },
  ]

  // Invoice list mode
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">{t('pointOfSale')}</h1>

      {/* No cash drawer warning */}
      {!activeCashDrawer && (
        <div className="rounded-md border border-warning/20 bg-warning/5 p-3">
          <p className="text-sm font-medium text-warning">
            {t('noCashDrawerWarning')}
          </p>
        </div>
      )}

      {/* Toolbar: status tabs + search — always visible */}
      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" className="flex gap-1 rounded-full border border-border bg-card p-1 w-fit">
          {TABS.map((tb) => (
            <button
              key={tb.key}
              type="button"
              role="tab"
              aria-selected={statusTab === tb.key}
              onClick={() => setStatusTab(tb.key)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                statusTab === tb.key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tb.label}
            </button>
          ))}
        </div>
        <SearchInput
          type="text"
          dir="auto"
          placeholder={t('searchInvoicesPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[200px] flex-1"
          aria-label={t('searchInvoicesPlaceholder')}
        />
      </div>

      {/* Content panel — single cohesive box */}
      <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
        {loading ? (
          <div className="flex min-h-[16rem] items-center justify-center text-sm text-muted-foreground">
            {t('recording')}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState
              icon={filtersActive ? FileSearch : Receipt}
              title={filtersActive ? t('noResultsTitle') : t('noPendingInvoices')}
              description={filtersActive ? t('noResultsDescription') : undefined}
              action={filtersActive ? { label: t('clearFilters'), onClick: clearFilters } : undefined}
            />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((inv) => (
              <li key={inv.id}>
                <button
                  type="button"
                  onClick={() => setActiveInvoice(inv)}
                  className="flex w-full items-center justify-between px-4 py-3 text-start transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
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
        )}
      </div>
    </div>
  )
}
