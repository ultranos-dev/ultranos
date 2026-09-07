'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { ChevronLeft, FileSearch, Package, CircleCheck, CircleX } from '@ultranos/ui-kit/icons'
import { getOrderById, pickOrder, fulfill, cancel } from '@/lib/wholesale/sales-order-service'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { db } from '@/lib/db'
import type { SalesOrder, SalesOrderStatus } from '@/lib/wholesale/types'

// ---------------------------------------------------------------------------
// Money helpers
// ---------------------------------------------------------------------------

function formatAmount(amount: number, currency: string, minorUnits: number): string {
  const divisor = Math.pow(10, minorUnits)
  return `${currency} ${(amount / divisor).toFixed(minorUnits)}`
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function statusBadgeClass(status: SalesOrderStatus): string {
  switch (status) {
    case 'draft':
      return 'inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground'
    case 'confirmed':
      return 'inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary'
    case 'picking':
      return 'inline-flex items-center rounded-full bg-warning/10 px-2.5 py-0.5 text-xs font-medium text-warning'
    case 'fulfilled':
      return 'inline-flex items-center rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success'
    case 'cancelled':
      return 'inline-flex items-center rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive'
    default:
      return 'inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground'
  }
}

// ---------------------------------------------------------------------------
// OrderDetailPage
// ---------------------------------------------------------------------------

export function OrderDetailPage() {
  const t = useTranslations('wholesale')
  const router = useRouter()
  const params = useParams()
  const id = params?.id as string

  const [order, setOrder] = useState<SalesOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [currency, setCurrency] = useState('AFN')
  const [currencyMinorUnits, setCurrencyMinorUnits] = useState(2)
  const [picking, setPicking] = useState(false)
  const [fulfilling, setFulfilling] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const fmt = useCallback(
    (amount: number) => formatAmount(amount, currency, currencyMinorUnits),
    [currency, currencyMinorUnits],
  )

  const load = useCallback(async () => {
    try {
      const [data, settings] = await Promise.all([
        getOrderById(id),
        db.pharmacySettings.toCollection().first(),
      ])
      if (!data) {
        setNotFound(true)
      } else {
        setOrder(data)
      }
      if (settings) {
        setCurrency(settings.currency)
        setCurrencyMinorUnits(settings.currencyMinorUnits)
      }
    } catch (err) {
      console.error('[OrderDetailPage] load failed:', err instanceof Error ? err.message : 'unknown')
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const handlePick = async () => {
    if (!order) return
    setPicking(true)
    setActionError(null)
    try {
      const updated = await pickOrder(order.id)
      setOrder(updated)
    } catch (err) {
      setActionError(t('orderDetailPickError'))
      console.error('[OrderDetailPage] pickOrder failed:', err instanceof Error ? err.message : 'unknown')
    } finally {
      setPicking(false)
    }
  }

  const handleFulfil = async () => {
    if (!order) return
    setFulfilling(true)
    setActionError(null)
    try {
      const practitionerRef = useAuthSessionStore.getState().getPractitionerRef()
      await fulfill(order.id, practitionerRef)
      setOrder((prev) => (prev ? { ...prev, status: 'fulfilled' } : prev))
    } catch (err) {
      setActionError(t('orderDetailFulfilError'))
      console.error('[OrderDetailPage] fulfill failed:', err instanceof Error ? err.message : 'unknown')
    } finally {
      setFulfilling(false)
    }
  }

  const handleCancel = async () => {
    if (!order) return
    setCancelling(true)
    setActionError(null)
    try {
      await cancel(order.id)
      setOrder((prev) => (prev ? { ...prev, status: 'cancelled' } : prev))
    } catch (err) {
      setActionError(t('orderDetailCancelError'))
      console.error('[OrderDetailPage] cancel failed:', err instanceof Error ? err.message : 'unknown')
    } finally {
      setCancelling(false)
    }
  }

  const backButton = (
    <Button
      data-testid="back-button"
      variant="ghost"
      size="sm"
      className="w-fit px-0"
      onClick={() => router.push('/wholesale/orders')}
    >
      <ChevronLeft size={16} className="me-1" />
      {t('backToOrders')}
    </Button>
  )

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        {backButton}
        <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState icon={Package} title={t('orderDetailLoading')} />
          </div>
        </div>
      </div>
    )
  }

  // Not found state
  if (notFound || !order) {
    return (
      <div className="flex flex-col gap-4">
        {backButton}
        <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState
              icon={FileSearch}
              title={t('orderDetailNotFound')}
              description={t('orderDetailNotFoundDescription')}
            />
          </div>
        </div>
      </div>
    )
  }

  const isCancellable = order.status !== 'fulfilled' && order.status !== 'cancelled'
  const hasShortStock = order.lines.some((l) => l.shortStock === true)

  return (
    <div className="flex flex-col gap-4">
      {/* Back button */}
      {backButton}

      {/* Page heading */}
      <h1 className="text-2xl font-semibold text-foreground">
        {order.orderNumber}{' '}
        <span className={statusBadgeClass(order.status)}>
          {t(`orderStatus_${order.status}`)}
        </span>
      </h1>

      {/* Action error */}
      {actionError && (
        <div role="alert" className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {actionError}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-3">
        {order.status === 'confirmed' && (
          <Button
            data-testid="pick-btn"
            onClick={handlePick}
            disabled={picking}
          >
            <Package size={16} className="me-2" />
            {picking ? t('orderDetailPicking') : t('orderDetailPickBtn')}
          </Button>
        )}

        {order.status === 'picking' && (
          <>
            <Button
              data-testid="fulfil-btn"
              onClick={handleFulfil}
              disabled={fulfilling || hasShortStock}
            >
              <CircleCheck size={16} className="me-2" />
              {fulfilling ? t('orderDetailFulfilling') : t('orderDetailFulfilBtn')}
            </Button>
            {hasShortStock && (
              <p className="text-sm text-warning" data-testid="short-stock-notice">
                {t('orderDetailShortStockNotice')}
              </p>
            )}
          </>
        )}

        {isCancellable && (
          <Button
            data-testid="cancel-btn"
            variant="outline"
            onClick={handleCancel}
            disabled={cancelling}
            className="text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
          >
            <CircleX size={16} className="me-2" />
            {cancelling ? t('orderDetailCancelling') : t('orderDetailCancelBtn')}
          </Button>
        )}
      </div>

      {/* Order lines card */}
      <div className="rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50">
        <h2 className="text-base font-semibold text-foreground mb-4">{t('orderDetailLinesTitle')}</h2>
        {order.lines.length === 0 ? (
          <EmptyState icon={Package} title={t('orderDetailNoLines')} size="sm" />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('newOrderColDescription')}
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('newOrderColUnit')}
                </th>
                <th className="px-4 py-3 text-end font-medium text-muted-foreground text-xs uppercase tracking-wide tabular-nums">
                  {t('newOrderColQty')}
                </th>
                <th className="px-4 py-3 text-end font-medium text-muted-foreground text-xs uppercase tracking-wide tabular-nums">
                  {t('newOrderColUnitPrice')}
                </th>
                <th className="px-4 py-3 text-end font-medium text-muted-foreground text-xs uppercase tracking-wide tabular-nums">
                  {t('newOrderColLineTotal')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {order.lines.map((line, idx) => (
                <tr key={idx} className="hover:bg-muted/50">
                  <td className="px-4 py-3 text-foreground">
                    <div>{line.description}</div>
                    {line.shortStock && (
                      <div
                        data-testid={`short-stock-line-${line.catalogItemId}`}
                        className="mt-1 rounded-md bg-warning/10 px-2 py-1 text-xs text-warning"
                      >
                        {t('orderDetailShortStockLine')}
                      </div>
                    )}
                    {line.batchAllocations.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {line.batchAllocations.map((alloc) => (
                          <li key={alloc.stockBatchId} className="text-xs text-muted-foreground">
                            {t('orderDetailBatch')}: {alloc.stockBatchId} &times; {alloc.qty}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground capitalize">{line.unit}</td>
                  <td className="px-4 py-3 text-end tabular-nums text-muted-foreground">{line.quantity}</td>
                  <td className="px-4 py-3 text-end tabular-nums text-muted-foreground">{fmt(line.unitPrice)}</td>
                  <td className="px-4 py-3 text-end tabular-nums text-muted-foreground">{fmt(line.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Totals card */}
      <div className="rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50">
        <h2 className="text-base font-semibold text-foreground mb-4">{t('newOrderSectionTotals')}</h2>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>{t('newOrderSubtotal')}</span>
            <span className="tabular-nums">{fmt(order.subtotal)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>{t('newOrderTax', { rate: order.taxRate.toFixed(1) })}</span>
            <span className="tabular-nums">{fmt(order.taxAmount)}</span>
          </div>
          <div className="flex justify-between font-semibold text-foreground border-t border-border pt-2 mt-2">
            <span>{t('newOrderTotal')}</span>
            <span className="tabular-nums">{fmt(order.total)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
