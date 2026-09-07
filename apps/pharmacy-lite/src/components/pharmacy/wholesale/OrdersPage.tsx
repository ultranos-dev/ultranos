'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { SearchInput } from '@ultranos/ui-kit/components/ui/search-input'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { ShoppingCart, FileSearch, Plus } from '@ultranos/ui-kit/icons'
import { getOrders } from '@/lib/wholesale/sales-order-service'
import { getAllCustomers } from '@/lib/wholesale/customer-service'
import { db } from '@/lib/db'
import type { SalesOrder, SalesOrderStatus } from '@/lib/wholesale/types'

type TabValue = 'all' | SalesOrderStatus

const TABS: TabValue[] = ['all', 'draft', 'confirmed', 'picking', 'fulfilled', 'cancelled']

function formatAmount(amount: number, currency: string, minorUnits: number): string {
  const divisor = Math.pow(10, minorUnits)
  return `${currency} ${(amount / divisor).toFixed(minorUnits)}`
}

function statusBadgeClass(status: SalesOrderStatus): string {
  switch (status) {
    case 'draft':
      return 'inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground'
    case 'confirmed':
      return 'inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary'
    case 'picking':
      return 'inline-flex items-center rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning'
    case 'fulfilled':
      return 'inline-flex items-center rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success'
    case 'cancelled':
      return 'inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive'
    default:
      return 'inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground'
  }
}

export function OrdersPage() {
  const t = useTranslations('wholesale')
  const [orders, setOrders] = useState<SalesOrder[]>([])
  const [customerMap, setCustomerMap] = useState<Record<string, string>>({})
  const [currency, setCurrency] = useState('AFN')
  const [currencyMinorUnits, setCurrencyMinorUnits] = useState(2)
  const [activeTab, setActiveTab] = useState<TabValue>('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadOrders = useCallback(async () => {
    try {
      setError(null)
      const [data, customers, settings] = await Promise.all([
        getOrders(),
        getAllCustomers(),
        db.pharmacySettings.toCollection().first(),
      ])
      setOrders(data)
      const map: Record<string, string> = {}
      for (const c of customers) {
        map[c.id] = c.name
      }
      setCustomerMap(map)
      if (settings) {
        setCurrency(settings.currency)
        setCurrencyMinorUnits(settings.currencyMinorUnits)
      }
    } catch (err) {
      setError(t('ordersLoadError'))
      console.error('[OrdersPage] loadOrders failed:', err instanceof Error ? err.message : 'unknown')
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  const query = search.trim().toLowerCase()

  const filtered = orders.filter((o) => {
    const matchesTab = activeTab === 'all' || o.status === activeTab
    const matchesSearch = query
      ? o.orderNumber.toLowerCase().includes(query) || o.customerId.toLowerCase().includes(query)
      : true
    return matchesTab && matchesSearch
  })

  function tabLabel(tab: TabValue): string {
    if (tab === 'all') return t('ordersTabAll')
    if (tab === 'draft') return t('ordersTabDraft')
    if (tab === 'confirmed') return t('ordersTabConfirmed')
    if (tab === 'picking') return t('ordersTabPicking')
    if (tab === 'fulfilled') return t('ordersTabFulfilled')
    return t('ordersTabCancelled')
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">{t('ordersTitle')}</h1>

      {error && (
        <div role="alert" className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Toolbar: pill-tabs + search + new order action — one row, always visible */}
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
          placeholder={t('searchOrders')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[200px] flex-1"
          aria-label={t('searchOrders')}
        />

        {/* Primary action — folded at end of toolbar */}
        <Link
          href="/wholesale/orders/new"
          aria-label={t('newOrder')}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus size={16} />
          {t('newOrder')}
        </Link>
      </div>

      {/* Content box — loading / empty / table */}
      <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
        {loading ? (
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState icon={ShoppingCart} title={t('ordersLoading')} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState
              icon={query || activeTab !== 'all' ? FileSearch : ShoppingCart}
              title={query || activeTab !== 'all' ? t('noResults') : t('noOrders')}
              description={
                query || activeTab !== 'all' ? t('noResultsDescription') : t('noOrdersDescription')
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
                  {t('columnOrderNumber')}
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('columnCustomer')}
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('columnOrderStatus')}
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
              {filtered.map((order) => (
                <tr key={order.id} className="hover:bg-muted/50">
                  <td className="px-4 py-3 font-medium text-foreground">
                    <Link
                      href={`/wholesale/orders/${order.id}`}
                      className="hover:underline text-primary"
                    >
                      {order.orderNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{customerMap[order.customerId] ?? order.customerId}</td>
                  <td className="px-4 py-3">
                    <span className={statusBadgeClass(order.status)}>
                      {t(`orderStatus_${order.status}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">
                    {formatAmount(order.total, currency, currencyMinorUnits)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(order.createdAt).toLocaleDateString()}
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
