'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { SearchInput } from '@ultranos/ui-kit/components/ui/search-input'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { ShoppingCart, FileSearch, Plus } from '@ultranos/ui-kit/icons'
import { getPurchaseOrders } from '@/lib/procurement/purchase-order-service'
import { db } from '@/lib/db'
import type { PurchaseOrder, PurchaseOrderStatus } from '@/lib/procurement/types'

type TabValue = 'all' | PurchaseOrderStatus

const TABS: TabValue[] = [
  'all',
  'draft',
  'pending_approval',
  'sent',
  'partially_received',
  'closed',
  'cancelled',
]

function formatAmount(amount: number, currency: string, minorUnits: number): string {
  const divisor = Math.pow(10, minorUnits)
  return `${currency} ${(amount / divisor).toFixed(minorUnits)}`
}

function shortId(id: string): string {
  // Show the first 6 chars after 'po-' prefix if present, else first 6 chars
  const stripped = id.startsWith('po-') ? id.slice(3) : id
  return stripped.slice(0, 6)
}

function statusBadgeClass(status: PurchaseOrderStatus): string {
  switch (status) {
    case 'draft':
      return 'inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground'
    case 'sent':
      return 'inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary'
    case 'pending_approval':
      return 'inline-flex items-center rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning'
    case 'partially_received':
      return 'inline-flex items-center rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning'
    case 'closed':
      return 'inline-flex items-center rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success'
    case 'cancelled':
      return 'inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive'
    default:
      return 'inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground'
  }
}

export function PurchaseOrdersPage() {
  const t = useTranslations('purchaseOrders')
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [currency, setCurrency] = useState('AFN')
  const [currencyMinorUnits, setCurrencyMinorUnits] = useState(2)
  const [activeTab, setActiveTab] = useState<TabValue>('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadOrders = useCallback(async () => {
    try {
      setError(null)
      const [data, settings] = await Promise.all([
        getPurchaseOrders(),
        db.pharmacySettings.toCollection().first(),
      ])
      setOrders(data)
      if (settings) {
        setCurrency(settings.currency)
        setCurrencyMinorUnits(settings.currencyMinorUnits)
      }
    } catch (err) {
      setError(t('loadError'))
      console.error('[PurchaseOrdersPage] loadOrders failed:', err instanceof Error ? err.message : 'unknown')
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  const query = search.trim().toLowerCase()

  const filtered = orders.filter((po) => {
    const matchesTab = activeTab === 'all' || po.status === activeTab
    const matchesSearch = query
      ? po.supplierName.toLowerCase().includes(query) || po.id.toLowerCase().includes(query) || (po.poNumber?.toLowerCase().includes(query) ?? false)
      : true
    return matchesTab && matchesSearch
  })

  function tabLabel(tab: TabValue): string {
    if (tab === 'all') return t('tabAll')
    if (tab === 'draft') return t('tabDraft')
    if (tab === 'pending_approval') return t('tabPendingApproval')
    if (tab === 'sent') return t('tabSent')
    if (tab === 'partially_received') return t('tabPartiallyReceived')
    if (tab === 'closed') return t('tabClosed')
    return t('tabCancelled')
  }

  function statusLabel(status: PurchaseOrderStatus): string {
    if (status === 'draft') return t('statusDraft')
    if (status === 'pending_approval') return t('statusPendingApproval')
    if (status === 'sent') return t('statusSent')
    if (status === 'partially_received') return t('statusPartiallyReceived')
    if (status === 'closed') return t('statusClosed')
    return t('statusCancelled')
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">{t('title')}</h1>

      {error && (
        <div role="alert" className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Toolbar: pill-tabs + search + new PO action — one row, always visible */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Pill tabs */}
        <div className="rounded-full border border-border bg-card p-1 w-fit flex items-center">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={
                activeTab === tab
                  ? 'rounded-full px-4 py-1.5 text-sm font-medium bg-primary text-primary-foreground'
                  : 'rounded-full px-4 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground'
              }
              aria-pressed={activeTab === tab}
            >
              {tabLabel(tab)}
            </button>
          ))}
        </div>

        {/* Search */}
        <SearchInput
          type="search"
          dir="auto"
          placeholder={t('searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[200px] flex-1"
          aria-label={t('searchPlaceholder')}
        />

        {/* Primary action — folded at end of toolbar */}
        <Link
          href="/inventory/orders/new"
          aria-label={t('newPurchaseOrder')}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus size={16} />
          {t('newPurchaseOrder')}
        </Link>
      </div>

      {/* Content box — loading / empty / table */}
      <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
        {loading ? (
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState icon={ShoppingCart} title={t('loading')} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState
              icon={query || activeTab !== 'all' ? FileSearch : ShoppingCart}
              title={query || activeTab !== 'all' ? t('noResults') : t('noPurchaseOrders')}
              description={
                query || activeTab !== 'all'
                  ? t('noResultsDescription')
                  : t('noPurchaseOrdersDescription')
              }
              action={
                query || activeTab !== 'all'
                  ? {
                      label: t('clearFilters'),
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
                  {t('columnId')}
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('columnSupplier')}
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('columnStatus')}
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('columnTotal')}
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('columnDate')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((po) => (
                <tr key={po.id} className="hover:bg-muted/50">
                  <td className="px-4 py-3 font-medium text-foreground">
                    <Link
                      href={`/inventory/orders/${po.id}`}
                      className="hover:underline text-primary"
                    >
                      {po.poNumber ?? shortId(po.id)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{po.supplierName}</td>
                  <td className="px-4 py-3">
                    <span className={statusBadgeClass(po.status)}>
                      {statusLabel(po.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums font-numeric">
                    {formatAmount(po.totalCost, currency, currencyMinorUnits)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(po.createdAt).toLocaleDateString()}
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
