'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { ChevronLeft, Package, Send, ClipboardCheck, CircleX, FileSearch } from '@ultranos/ui-kit/icons'
import {
  getPurchaseOrderById,
  markPurchaseOrderSent,
  cancelPurchaseOrder,
} from '@/lib/procurement/purchase-order-service'
import { db } from '@/lib/db'
import type { PurchaseOrder, PurchaseOrderStatus } from '@/lib/procurement/types'
import { useAuthSessionStore } from '@/stores/auth-session-store'

// ---------------------------------------------------------------------------
// Money helpers (same pattern as NewPurchaseOrderPage / OrderDetailPage)
// All money stored as integer minor units.
// ---------------------------------------------------------------------------

function formatAmount(amount: number, currency: string, minorUnits: number): string {
  const divisor = Math.pow(10, minorUnits)
  return `${currency} ${(amount / divisor).toFixed(minorUnits)}`
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function statusBadgeClass(status: PurchaseOrderStatus): string {
  switch (status) {
    case 'draft':
      return 'inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground'
    case 'sent':
      return 'inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary'
    case 'partially_received':
      return 'inline-flex items-center rounded-full bg-warning/10 px-2.5 py-0.5 text-xs font-medium text-warning'
    case 'closed':
      return 'inline-flex items-center rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success'
    case 'cancelled':
      return 'inline-flex items-center rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive'
    default:
      return 'inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground'
  }
}

// ---------------------------------------------------------------------------
// Status key mapping for i18n
// ---------------------------------------------------------------------------

function statusKey(status: PurchaseOrderStatus): string {
  switch (status) {
    case 'draft': return 'statusDraft'
    case 'sent': return 'statusSent'
    case 'partially_received': return 'statusPartiallyReceived'
    case 'closed': return 'statusClosed'
    case 'cancelled': return 'statusCancelled'
    default: return 'statusDraft'
  }
}

// ---------------------------------------------------------------------------
// PurchaseOrderDetailPage
// ---------------------------------------------------------------------------

export function PurchaseOrderDetailPage() {
  const t = useTranslations('purchaseOrders')
  const router = useRouter()
  const params = useParams()
  const id = params?.id as string
  const session = useAuthSessionStore((s) => s.session)
  const performedBy = session?.practitionerId ?? session?.userId ?? 'unknown'

  const [po, setPo] = useState<PurchaseOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [currency, setCurrency] = useState('AFN')
  const [currencyMinorUnits, setCurrencyMinorUnits] = useState(2)

  const [sending, setSending] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const fmt = useCallback(
    (amount: number) => formatAmount(amount, currency, currencyMinorUnits),
    [currency, currencyMinorUnits],
  )

  const load = useCallback(async () => {
    try {
      const [data, settings] = await Promise.all([
        getPurchaseOrderById(id),
        db.pharmacySettings.toCollection().first(),
      ])
      if (!data) {
        setNotFound(true)
      } else {
        setPo(data)
      }
      if (settings) {
        setCurrency(settings.currency)
        setCurrencyMinorUnits(settings.currencyMinorUnits)
      }
    } catch (err) {
      console.error('[PurchaseOrderDetailPage] load failed:', err instanceof Error ? err.message : 'unknown')
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  // -------------------------------------------------------------------------
  // Action handlers
  // -------------------------------------------------------------------------

  const handleMarkSent = async () => {
    if (!po) return
    setSending(true)
    setActionError(null)
    try {
      await markPurchaseOrderSent(po.id, performedBy)
      setLoading(true)
      await load()
    } catch (err) {
      setActionError(t('detailMarkSentError'))
      console.error('[PurchaseOrderDetailPage] markPurchaseOrderSent failed:', err instanceof Error ? err.message : 'unknown')
    } finally {
      setSending(false)
    }
  }

  const handleCancel = async () => {
    if (!po) return
    setCancelling(true)
    setActionError(null)
    try {
      await cancelPurchaseOrder(po.id, performedBy)
      setLoading(true)
      await load()
    } catch (err) {
      setActionError(t('detailCancelError'))
      console.error('[PurchaseOrderDetailPage] cancelPurchaseOrder failed:', err instanceof Error ? err.message : 'unknown')
    } finally {
      setCancelling(false)
    }
  }

  // -------------------------------------------------------------------------
  // Back button (shared across states)
  // -------------------------------------------------------------------------

  const backButton = (
    <Button
      data-testid="back-button"
      variant="ghost"
      size="sm"
      className="w-fit px-0"
      onClick={() => router.push('/inventory/orders')}
    >
      <ChevronLeft size={16} className="me-1" />
      {t('title')}
    </Button>
  )

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        {backButton}
        <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState icon={Package} title={t('detailLoading')} />
          </div>
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Not found state
  // -------------------------------------------------------------------------

  if (notFound || !po) {
    return (
      <div className="flex flex-col gap-4">
        {backButton}
        <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState
              icon={FileSearch}
              title={t('detailNotFound')}
              description={t('detailNotFoundDescription')}
            />
          </div>
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------

  const isReceiptable = po.status === 'sent' || po.status === 'partially_received'
  const isCancellable = po.status === 'draft' || po.status === 'sent' || po.status === 'partially_received'
  // Short ID for display: first 6 chars after 'po-' prefix if present, otherwise first 6 chars
  const shortId = po.id.startsWith('po-') ? po.id.slice(3, 9) : po.id.slice(0, 6)

  return (
    <div className="flex flex-col gap-4">
      {/* Back button */}
      {backButton}

      {/* Page heading — PO short id + supplier name */}
      <h1 className="text-2xl font-semibold text-foreground">
        {shortId} · {po.supplierName}{' '}
        <span className={statusBadgeClass(po.status)}>
          {t(statusKey(po.status))}
        </span>
      </h1>

      {/* Action error */}
      {actionError && (
        <div role="alert" className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {actionError}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Action buttons — status-driven                                       */}
      {/* ------------------------------------------------------------------ */}
      {(po.status === 'draft' || isReceiptable || isCancellable) && (
        <div className="flex flex-wrap items-center gap-3">
          {/* draft → Mark sent */}
          {po.status === 'draft' && (
            <Button
              data-testid="mark-sent-btn"
              onClick={handleMarkSent}
              disabled={sending}
            >
              <Send size={16} className="me-2" />
              {sending ? t('detailMarkSentProgress') : t('detailMarkSent')}
            </Button>
          )}

          {/* sent / partially_received → Receive against PO (navigates to shared receive form) */}
          {isReceiptable && (
            <Link
              href={`/inventory/receive?poId=${po.id}`}
              data-testid="receive-against-po-link"
              className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <ClipboardCheck size={16} className="me-2" />
              {t('receiveAgainstPo')}
            </Link>
          )}

          {/* draft / sent / partially_received → Cancel */}
          {isCancellable && (
            <Button
              data-testid="cancel-btn"
              variant="outline"
              onClick={handleCancel}
              disabled={cancelling}
              className="text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
            >
              <CircleX size={16} className="me-2" />
              {cancelling ? t('detailCancelProgress') : t('detailCancel')}
            </Button>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Info card                                                             */}
      {/* ------------------------------------------------------------------ */}
      <div className="rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50">
        <h2 className="mb-4 text-base font-semibold text-foreground">{t('detailSectionInfo')}</h2>
        <div className="grid gap-3 text-sm md:grid-cols-2">
          <div>
            <span className="text-muted-foreground">{t('detailSupplier')}: </span>
            <span className="text-foreground">{po.supplierName}</span>
          </div>
          <div>
            <span className="text-muted-foreground">{t('detailTotal')}: </span>
            <span className="tabular-nums text-foreground font-numeric">{fmt(po.totalCost)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">{t('detailCreatedAt')}: </span>
            <span className="text-foreground">{new Date(po.createdAt).toLocaleDateString()}</span>
          </div>
          {po.sentAt && (
            <div>
              <span className="text-muted-foreground">{t('detailSentAt')}: </span>
              <span className="text-foreground">{new Date(po.sentAt).toLocaleDateString()}</span>
            </div>
          )}
          {po.closedAt && (
            <div>
              <span className="text-muted-foreground">{t('detailClosedAt')}: </span>
              <span className="text-foreground">{new Date(po.closedAt).toLocaleDateString()}</span>
            </div>
          )}
          {po.notes && (
            <div className="md:col-span-2">
              <span className="text-muted-foreground">{t('detailNotes')}: </span>
              <span className="text-foreground">{po.notes}</span>
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Items card                                                            */}
      {/* ------------------------------------------------------------------ */}
      <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
        <div className="p-5 pb-0">
          <h2 className="mb-4 text-base font-semibold text-foreground">{t('detailSectionItems')}</h2>
        </div>
        {po.items.length === 0 ? (
          <div className="flex min-h-[8rem] items-center justify-center p-5">
            <EmptyState size="sm" icon={Package} title={t('detailNoItems')} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {t('detailColItem')}
                  </th>
                  <th className="px-4 py-3 text-end font-medium text-muted-foreground text-xs uppercase tracking-wide tabular-nums">
                    {t('detailColOrdered')}
                  </th>
                  <th className="px-4 py-3 text-end font-medium text-muted-foreground text-xs uppercase tracking-wide tabular-nums">
                    {t('detailColReceived')}
                  </th>
                  <th className="px-4 py-3 text-end font-medium text-muted-foreground text-xs uppercase tracking-wide tabular-nums">
                    {t('detailColUnitCost')}
                  </th>
                  <th className="px-4 py-3 text-end font-medium text-muted-foreground text-xs uppercase tracking-wide tabular-nums">
                    {t('detailColLineTotal')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {po.items.map((item) => {
                  const lineTotal = item.quantityOrdered * item.unitCost
                  return (
                    <tr key={item.catalogItemId} className="hover:bg-muted/50">
                      <td className="px-4 py-3 text-foreground">{item.catalogItemName}</td>
                      <td
                        className="px-4 py-3 text-end tabular-nums text-muted-foreground"
                        data-testid={`item-ordered-${item.catalogItemId}`}
                      >
                        {item.quantityOrdered}
                      </td>
                      <td
                        className="px-4 py-3 text-end tabular-nums text-muted-foreground"
                        data-testid={`item-received-${item.catalogItemId}`}
                      >
                        {item.quantityReceived}
                      </td>
                      <td
                        className="px-4 py-3 text-end tabular-nums text-muted-foreground font-numeric"
                        data-testid={`item-unitcost-${item.catalogItemId}`}
                      >
                        {fmt(item.unitCost)}
                      </td>
                      <td className="px-4 py-3 text-end tabular-nums text-muted-foreground font-numeric">
                        {fmt(lineTotal)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Receipt tracking note — shown for actionable statuses only           */}
      {/* NOTE: recording a receipt updates PO tracking only; actual stock-in  */}
      {/* is done via Goods Receipt (out of scope here).                       */}
      {/* ------------------------------------------------------------------ */}
      {isReceiptable && (
        <p className="text-sm text-muted-foreground" data-testid="receipt-tracking-note">
          {t('receiptTrackingNote')}
        </p>
      )}
    </div>
  )
}
