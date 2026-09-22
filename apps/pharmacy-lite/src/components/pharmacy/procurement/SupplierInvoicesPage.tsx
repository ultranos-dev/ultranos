'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { SearchInput } from '@ultranos/ui-kit/components/ui/search-input'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { FileText, FileSearch, Plus } from '@ultranos/ui-kit/icons'
import { getSupplierInvoices } from '@/lib/procurement/supplier-invoice-service'
import { getPurchaseOrderById } from '@/lib/procurement/purchase-order-service'
import { computeInvoiceMatch } from '@/lib/procurement/invoice-match'
import { db } from '@/lib/db'
import type { SupplierInvoice, SupplierInvoiceStatus } from '@/lib/procurement/types'

type TabValue = 'all' | SupplierInvoiceStatus

const TABS: TabValue[] = ['all', 'pending', 'approved', 'disputed']

function formatAmount(amount: number, currency: string, minorUnits: number): string {
  const divisor = Math.pow(10, minorUnits)
  return `${currency} ${(amount / divisor).toFixed(minorUnits)}`
}

function statusBadgeClass(status: SupplierInvoiceStatus): string {
  switch (status) {
    case 'pending':
      return 'inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary'
    case 'approved':
      return 'inline-flex items-center rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success'
    case 'disputed':
      return 'inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive'
    default:
      return 'inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground'
  }
}

function matchBadgeClass(status: 'matched' | 'variance'): string {
  if (status === 'matched') {
    return 'inline-flex items-center rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success'
  }
  return 'inline-flex items-center rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning'
}

interface InvoiceRow extends SupplierInvoice {
  matchStatus: 'matched' | 'variance' | null
}

export function SupplierInvoicesPage() {
  const t = useTranslations('supplierInvoices')
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [currency, setCurrency] = useState('AFN')
  const [currencyMinorUnits, setCurrencyMinorUnits] = useState(2)
  const [activeTab, setActiveTab] = useState<TabValue>('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadInvoices = useCallback(async () => {
    try {
      setError(null)
      const [data, settings] = await Promise.all([
        getSupplierInvoices(),
        db.pharmacySettings.toCollection().first(),
      ])

      const tolerance = settings?.invoiceMatchTolerancePercent ?? 0
      if (settings) {
        setCurrency(settings.currency)
        setCurrencyMinorUnits(settings.currencyMinorUnits)
      }

      const rows: InvoiceRow[] = await Promise.all(
        data.map(async (inv) => {
          try {
            const po = await getPurchaseOrderById(inv.purchaseOrderId)
            if (!po) return { ...inv, matchStatus: null }
            const match = computeInvoiceMatch(inv, po, tolerance)
            return { ...inv, matchStatus: match.status }
          } catch {
            return { ...inv, matchStatus: null }
          }
        }),
      )

      setInvoices(rows)
    } catch (err) {
      setError(t('createError'))
      console.error('[SupplierInvoicesPage] load failed:', err instanceof Error ? err.message : 'unknown')
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    loadInvoices()
  }, [loadInvoices])

  const query = search.trim().toLowerCase()

  const filtered = invoices.filter((inv) => {
    const matchesTab = activeTab === 'all' || inv.status === activeTab
    const matchesSearch = query
      ? inv.invoiceNumber.toLowerCase().includes(query) || inv.supplierName.toLowerCase().includes(query)
      : true
    return matchesTab && matchesSearch
  })

  function tabLabel(tab: TabValue): string {
    if (tab === 'all') return t('tabAll')
    if (tab === 'pending') return t('tabPending')
    if (tab === 'approved') return t('tabApproved')
    return t('tabDisputed')
  }

  function statusLabel(status: SupplierInvoiceStatus): string {
    if (status === 'pending') return t('statusPending')
    if (status === 'approved') return t('statusApproved')
    return t('statusDisputed')
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">{t('title')}</h1>

      {error && (
        <div role="alert" className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Toolbar: pill-tabs + search + Record invoice action — one row, always visible */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <SearchInput
          type="search"
          dir="auto"
          placeholder={t('searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[200px] flex-1"
          inputClassName="h-9 rounded-full"
          aria-label={t('searchPlaceholder')}
        />

        {/* Pill tabs */}
        <div className="flex h-9 items-stretch gap-1 rounded-full border border-border bg-card p-1 w-fit">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={
                activeTab === tab
                  ? 'flex items-center rounded-full px-4 text-sm font-medium bg-primary text-primary-foreground'
                  : 'flex items-center rounded-full px-4 text-sm font-medium text-muted-foreground hover:text-foreground'
              }
              aria-pressed={activeTab === tab}
            >
              {tabLabel(tab)}
            </button>
          ))}
        </div>

        {/* Primary action — folded at end of toolbar */}
        <Button asChild className="h-9">
          <Link href="/inventory/invoices/new" aria-label={t('newInvoice')}>
            <Plus size={16} />
            {t('newInvoice')}
          </Link>
        </Button>
      </div>

      {/* Content box — loading / empty / table */}
      <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
        {loading ? (
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState icon={FileText} title={t('loading')} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState
              icon={query || activeTab !== 'all' ? FileSearch : FileText}
              title={query || activeTab !== 'all' ? t('emptyResults') : t('empty')}
              action={
                query || activeTab !== 'all'
                  ? {
                      label: t('tabAll'),
                      onClick: () => {
                        setSearch('')
                        setActiveTab('all')
                      },
                    }
                  : undefined
              }
            />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('colInvoiceNo')}
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('colSupplier')}
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('colPo')}
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('colTotal')}
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('colMatch')}
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('colStatus')}
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('colDate')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((inv) => (
                <tr key={inv.id} className="hover:bg-muted/50">
                  <td className="px-4 py-3 font-medium text-foreground">
                    <Link
                      href={`/inventory/invoices/${inv.id}`}
                      className="hover:underline text-primary"
                    >
                      {inv.invoiceNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{inv.supplierName}</td>
                  <td className="px-4 py-3 text-muted-foreground font-numeric text-xs">
                    {inv.purchaseOrderId.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground font-numeric">
                    {formatAmount(inv.total, currency, currencyMinorUnits)}
                  </td>
                  <td className="px-4 py-3">
                    {inv.matchStatus !== null ? (
                      <span className={matchBadgeClass(inv.matchStatus)}>
                        {inv.matchStatus === 'matched' ? t('matchMatched') : t('matchVariance')}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={statusBadgeClass(inv.status)}>
                      {statusLabel(inv.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(inv.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
