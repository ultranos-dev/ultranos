'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, ModalHeader, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { ChevronLeft, FileSearch, FileText } from '@ultranos/ui-kit/icons'
import {
  getSupplierInvoiceById,
  approveSupplierInvoice,
  disputeSupplierInvoice,
  InvoiceVarianceUnresolvedError,
} from '@/lib/procurement/supplier-invoice-service'
import { getPurchaseOrderById } from '@/lib/procurement/purchase-order-service'
import { computeInvoiceMatch } from '@/lib/procurement/invoice-match'
import { recordSupplierPayment, getPaymentsForInvoice } from '@/lib/procurement/supplier-payment-service'
import { computeAmountDue, computeSettlementStatus } from '@/lib/procurement/ap-invoice'
import { db } from '@/lib/db'
import type { SupplierInvoice, SupplierInvoiceStatus, SupplierPayment, SupplierPaymentMethod } from '@/lib/procurement/types'
import type { InvoiceMatchResult } from '@/lib/procurement/invoice-match'
import { useAuthSessionStore } from '@/stores/auth-session-store'

// ---------------------------------------------------------------------------
// Payment helpers
// ---------------------------------------------------------------------------

/**
 * Parse a major-unit string entered by the user into minor units.
 * With minorUnits = 2 (AFN default): "20.00" → 2000 minor units.
 */
function parseToMinor(value: string, minorUnits: number): number {
  const parsed = parseFloat(value)
  if (isNaN(parsed) || parsed <= 0) return 0
  return Math.round(parsed * Math.pow(10, minorUnits))
}

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

function statusBadgeClass(status: SupplierInvoiceStatus): string {
  switch (status) {
    case 'pending':
      return 'inline-flex items-center rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning'
    case 'approved':
      return 'inline-flex items-center rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success'
    case 'disputed':
      return 'inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive'
    default:
      return 'inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground'
  }
}

function statusKey(status: SupplierInvoiceStatus): string {
  switch (status) {
    case 'pending': return 'statusPending'
    case 'approved': return 'statusApproved'
    case 'disputed': return 'statusDisputed'
    default: return 'statusPending'
  }
}

// ---------------------------------------------------------------------------
// Settlement badge
// ---------------------------------------------------------------------------

function settlementBadgeClass(status: 'unpaid' | 'partial' | 'paid'): string {
  switch (status) {
    case 'paid':
      return 'inline-flex items-center rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success'
    case 'partial':
      return 'inline-flex items-center rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning'
    default:
      return 'inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground'
  }
}

// ---------------------------------------------------------------------------
// Match badge
// ---------------------------------------------------------------------------

function matchBadgeClass(status: 'matched' | 'variance'): string {
  if (status === 'matched') {
    return 'inline-flex items-center rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success'
  }
  return 'inline-flex items-center rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning'
}

// ---------------------------------------------------------------------------
// Per-line variance coloring
// ---------------------------------------------------------------------------

function lineColorClass(overBilled: boolean, offPo: boolean, priceOverTolerance: boolean): string {
  if (overBilled || offPo) return 'text-destructive'
  if (priceOverTolerance) return 'text-warning'
  return 'text-muted-foreground'
}

// ---------------------------------------------------------------------------
// SupplierInvoiceDetailPage
// ---------------------------------------------------------------------------

export function SupplierInvoiceDetailPage() {
  const t = useTranslations('supplierInvoices')
  const tp = useTranslations('supplierPayments')
  const router = useRouter()
  const params = useParams()
  const id = params?.id as string
  const session = useAuthSessionStore((s) => s.session)
  const performedBy = session?.practitionerId ?? session?.userId ?? 'unknown'

  const [invoice, setInvoice] = useState<SupplierInvoice | null>(null)
  const [match, setMatch] = useState<InvoiceMatchResult | null>(null)
  const [payments, setPayments] = useState<SupplierPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [currency, setCurrency] = useState('AFN')
  const [currencyMinorUnits, setCurrencyMinorUnits] = useState(2)

  // Payment dialog
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [paymentStr, setPaymentStr] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<SupplierPaymentMethod>('cash')
  const [paymentSubmitting, setPaymentSubmitting] = useState(false)

  // Approve flow
  const [approving, setApproving] = useState(false)
  const [overrideRequired, setOverrideRequired] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [approveError, setApproveError] = useState<string | null>(null)

  // Dispute flow
  const [disputing, setDisputing] = useState(false)
  const [showDisputeInput, setShowDisputeInput] = useState(false)
  const [disputeReason, setDisputeReason] = useState('')
  const [disputeError, setDisputeError] = useState<string | null>(null)

  const fmt = useCallback(
    (amount: number) => formatAmount(amount, currency, currencyMinorUnits),
    [currency, currencyMinorUnits],
  )

  const load = useCallback(async () => {
    try {
      const [inv, settings] = await Promise.all([
        getSupplierInvoiceById(id),
        db.pharmacySettings.toCollection().first(),
      ])
      if (!inv) {
        setNotFound(true)
        return
      }
      setInvoice(inv)
      if (settings) {
        setCurrency(settings.currency)
        setCurrencyMinorUnits(settings.currencyMinorUnits)
      }
      const [po, invoicePayments] = await Promise.all([
        getPurchaseOrderById(inv.purchaseOrderId),
        getPaymentsForInvoice(id),
      ])
      if (po) {
        const tolerance = settings?.invoiceMatchTolerancePercent ?? 0
        setMatch(computeInvoiceMatch(inv, po, tolerance))
      }
      setPayments(invoicePayments)
    } catch (err) {
      console.error('[SupplierInvoiceDetailPage] load failed:', err instanceof Error ? err.message : 'unknown')
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

  const handleApprove = async () => {
    if (!invoice) return
    setApproving(true)
    setApproveError(null)
    try {
      await approveSupplierInvoice(invoice.id, performedBy, overrideReason || undefined)
      setLoading(true)
      setOverrideRequired(false)
      setOverrideReason('')
      await load()
    } catch (err) {
      if (err instanceof InvoiceVarianceUnresolvedError) {
        setOverrideRequired(true)
      } else {
        setApproveError(t('approveError'))
        console.error('[SupplierInvoiceDetailPage] approveSupplierInvoice failed:', err instanceof Error ? err.message : 'unknown')
      }
    } finally {
      setApproving(false)
    }
  }

  const handleDisputeToggle = () => {
    setShowDisputeInput(true)
    setDisputeError(null)
  }

  const handleDisputeConfirm = async () => {
    if (!invoice) return
    if (!disputeReason.trim()) {
      setDisputeError(t('disputeReasonRequired'))
      return
    }
    setDisputing(true)
    setDisputeError(null)
    try {
      await disputeSupplierInvoice(invoice.id, performedBy, disputeReason)
      setLoading(true)
      setShowDisputeInput(false)
      setDisputeReason('')
      await load()
    } catch (err) {
      setDisputeError(t('disputeError'))
      console.error('[SupplierInvoiceDetailPage] disputeSupplierInvoice failed:', err instanceof Error ? err.message : 'unknown')
    } finally {
      setDisputing(false)
    }
  }

  // -------------------------------------------------------------------------
  // Payment handler
  // -------------------------------------------------------------------------

  const handleOpenPaymentDialog = () => {
    if (!invoice) return
    const amountDue = computeAmountDue(invoice)
    const divisor = Math.pow(10, currencyMinorUnits)
    setPaymentStr((amountDue / divisor).toFixed(currencyMinorUnits))
    setPaymentMethod('cash')
    setPaymentDialogOpen(true)
  }

  const handleConfirmPayment = async () => {
    if (!invoice) return
    const amountDue = computeAmountDue(invoice)
    let amount = parseToMinor(paymentStr, currencyMinorUnits)
    if (amount <= 0) return
    if (amount > amountDue) amount = amountDue
    setPaymentSubmitting(true)
    try {
      await recordSupplierPayment({
        supplierId: invoice.supplierId,
        allocations: [{ supplierInvoiceId: invoice.id, amount }],
        method: paymentMethod,
        paidBy: performedBy,
        hlcTimestamp: new Date().toISOString(),
      })
      setPaymentDialogOpen(false)
      setLoading(true)
      await load()
    } catch (err) {
      console.error('[SupplierInvoiceDetailPage] recordSupplierPayment failed:', err instanceof Error ? err.message : 'unknown')
    } finally {
      setPaymentSubmitting(false)
    }
  }

  // -------------------------------------------------------------------------
  // Back button (shared across states)
  // -------------------------------------------------------------------------

  const backButton = (
    <Button
      variant="ghost"
      size="sm"
      className="w-fit px-0"
      onClick={() => router.push('/inventory/invoices')}
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
            <EmptyState icon={FileText} title={t('loading')} />
          </div>
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Not found state
  // -------------------------------------------------------------------------

  if (notFound || !invoice) {
    return (
      <div className="flex flex-col gap-4">
        {backButton}
        <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState
              icon={FileSearch}
              title={t('empty')}
            />
          </div>
        </div>
      </div>
    )
  }

  const isPending = invoice.status === 'pending'

  return (
    <div className="flex flex-col gap-4">
      {/* Back button */}
      {backButton}

      {/* Page heading */}
      <h1 className="text-2xl font-semibold text-foreground">
        {t('detailTitle', { number: invoice.invoiceNumber })}{' '}
        {match && (
          <span className={matchBadgeClass(match.status)}>
            {match.status === 'matched' ? t('matchMatched') : t('matchVariance')}
          </span>
        )}{' '}
        <span className={statusBadgeClass(invoice.status)}>
          {t(statusKey(invoice.status))}
        </span>
      </h1>

      {/* Action errors */}
      {approveError && (
        <div role="alert" className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {approveError}
        </div>
      )}
      {disputeError && (
        <div role="alert" className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {disputeError}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Action buttons — only when pending                                   */}
      {/* ------------------------------------------------------------------ */}
      {isPending && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              data-testid="approve-invoice"
              onClick={handleApprove}
              disabled={approving}
            >
              {approving ? `${t('approve')}…` : t('approve')}
            </Button>
            {!showDisputeInput && (
              <Button
                data-testid="dispute-toggle"
                variant="outline"
                onClick={handleDisputeToggle}
                className="text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
              >
                {t('dispute')}
              </Button>
            )}
          </div>

          {/* Override-reason input — revealed after InvoiceVarianceUnresolvedError */}
          {overrideRequired && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-warning">{t('overrideRequired')}</p>
              <input
                data-testid="override-reason"
                type="text"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder={t('overrideReasonLabel')}
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          )}

          {/* Dispute reason input — revealed on Dispute click */}
          {showDisputeInput && (
            <div className="flex flex-col gap-2">
              <input
                data-testid="dispute-reason"
                type="text"
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                placeholder={t('disputeReasonLabel')}
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <div className="flex gap-2">
                <Button
                  data-testid="dispute-invoice"
                  variant="outline"
                  onClick={handleDisputeConfirm}
                  disabled={disputing || !disputeReason.trim()}
                  className="text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                >
                  {disputing ? `${t('dispute')}…` : t('dispute')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setShowDisputeInput(false); setDisputeReason('') }}
                >
                  {t('cancel')}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Invoice details card                                                  */}
      {/* ------------------------------------------------------------------ */}
      <div className="rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50">
        <h2 className="mb-4 text-base font-semibold text-foreground">{t('detailsSection')}</h2>
        <div className="grid gap-3 text-sm md:grid-cols-2">
          <div>
            <span className="text-muted-foreground">{t('colSupplier')}: </span>
            <span className="text-foreground">{invoice.supplierName}</span>
          </div>
          <div>
            <span className="text-muted-foreground">{t('colPo')}: </span>
            <span className="text-foreground">{invoice.purchaseOrderId}</span>
          </div>
          <div>
            <span className="text-muted-foreground">{t('subtotal')}: </span>
            <span className="tabular-nums text-foreground font-numeric">{fmt(invoice.subtotal)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">{t('tax')}: </span>
            <span className="tabular-nums text-foreground font-numeric">{fmt(invoice.taxAmount)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">{t('freight')}: </span>
            <span className="tabular-nums text-foreground font-numeric">{fmt(invoice.freight)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">{t('grandTotal')}: </span>
            <span className="tabular-nums text-foreground font-numeric">{fmt(invoice.total)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">{t('colDate')}: </span>
            <span className="text-foreground">{new Date(invoice.createdAt).toLocaleDateString()}</span>
          </div>
          {/* Attribution */}
          {invoice.createdBy && (
            <div>
              <span className="text-muted-foreground">{t('recordedBy', { who: invoice.createdBy })}</span>
            </div>
          )}
          {invoice.approvedBy && (
            <div>
              <span className="text-muted-foreground">{t('approvedBy', { who: invoice.approvedBy })}</span>
            </div>
          )}
          {invoice.disputedBy && (
            <div>
              <span className="text-muted-foreground">{t('disputedBy', { who: invoice.disputedBy })}</span>
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Settlement card                                                       */}
      {/* ------------------------------------------------------------------ */}
      {(() => {
        const settlementStatus = computeSettlementStatus(invoice)
        const settlementKey =
          settlementStatus === 'paid'
            ? 'settlementPaid'
            : settlementStatus === 'partial'
              ? 'settlementPartial'
              : 'settlementUnpaid'
        const amountDue = computeAmountDue(invoice)
        return (
          <div className="rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <h2 className="text-base font-semibold text-foreground">{t('settlementSection')}</h2>
              <span className={settlementBadgeClass(settlementStatus)}>{t(settlementKey)}</span>
              {invoice.status === 'approved' && amountDue > 0 && (
                <Button
                  size="sm"
                  data-testid="open-invoice-payment"
                  onClick={handleOpenPaymentDialog}
                  className="ms-auto"
                >
                  {t('recordPayment')}
                </Button>
              )}
            </div>
            <div className="grid gap-3 text-sm md:grid-cols-2">
              <div>
                <span className="text-muted-foreground">{t('amountPaid')}: </span>
                <span className="font-numeric text-foreground">{fmt(invoice.amountPaid ?? 0)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">{t('amountDue')}: </span>
                <span className="font-numeric text-foreground">{fmt(amountDue)}</span>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ------------------------------------------------------------------ */}
      {/* Payments history                                                      */}
      {/* ------------------------------------------------------------------ */}
      {payments.length > 0 && (
        <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
          <div className="p-5 pb-0">
            <h2 className="mb-4 text-base font-semibold text-foreground">{t('paymentsHistory')}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {t('colDate')}
                  </th>
                  <th className="px-4 py-3 text-end font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {t('amountPaid')}
                  </th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {t('paymentMethodLabel')}
                  </th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {tp('colStatus')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payments.map((p) => {
                  const allocation = p.allocations.find((a) => a.supplierInvoiceId === invoice.id)
                  const paidAmount = allocation?.amount ?? p.amount
                  const methodKey =
                    p.method === 'cash'
                      ? 'methodCash'
                      : p.method === 'bank_transfer'
                        ? 'methodBankTransfer'
                        : p.method === 'cheque'
                          ? 'methodCheque'
                          : 'methodOther'
                  return (
                    <tr key={p.id} className="hover:bg-muted/50">
                      <td className="px-4 py-3 text-foreground">
                        {new Date(p.paidAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-end font-numeric text-foreground">
                        {fmt(paidAmount)}
                      </td>
                      <td className="px-4 py-3 text-foreground">{t(methodKey)}</td>
                      <td className={`px-4 py-3 ${p.status === 'void' ? 'text-muted-foreground' : 'text-foreground'}`}>
                        {tp(p.status === 'void' ? 'statusVoid' : 'statusActive')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Payment dialog                                                        */}
      {/* ------------------------------------------------------------------ */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent hideClose>
          <ModalHeader title={t('recordPayment')} tone="primary" inset dialog />
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invoice-payment-amount-input">{t('paymentAmountLabel')}</Label>
              <Input
                id="invoice-payment-amount-input"
                data-testid="invoice-payment-amount"
                type="number"
                step="any"
                min="0"
                value={paymentStr}
                onChange={(e) => {
                  const amountDue = computeAmountDue(invoice)
                  const capped = parseToMinor(e.target.value, currencyMinorUnits)
                  if (capped > amountDue) {
                    const divisor = Math.pow(10, currencyMinorUnits)
                    setPaymentStr((amountDue / divisor).toFixed(currencyMinorUnits))
                  } else {
                    setPaymentStr(e.target.value)
                  }
                }}
                placeholder="0"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invoice-payment-method">
                {t('paymentMethodLabel')}
              </Label>
              <select
                id="invoice-payment-method"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as SupplierPaymentMethod)}
                className="rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm"
              >
                <option value="cash">{t('methodCash')}</option>
                <option value="bank_transfer">{t('methodBankTransfer')}</option>
                <option value="cheque">{t('methodCheque')}</option>
                <option value="other">{t('methodOther')}</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPaymentDialogOpen(false)}
              disabled={paymentSubmitting}
            >
              {t('cancel')}
            </Button>
            <Button
              data-testid="confirm-invoice-payment"
              onClick={handleConfirmPayment}
              disabled={paymentSubmitting || parseToMinor(paymentStr, currencyMinorUnits) <= 0}
            >
              {paymentSubmitting ? `${t('confirmPayment')}…` : t('confirmPayment')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------------ */}
      {/* 3-way match table                                                    */}
      {/* ------------------------------------------------------------------ */}
      {match && (
        <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
          <div className="p-5 pb-0">
            <h2 className="mb-4 text-base font-semibold text-foreground">
              {t('matchTitle')}{' '}
              {match.totalVariance !== 0 && (
                <span className="text-sm font-normal text-warning">
                  {t('totalVariance')}: <span className="font-numeric">{fmt(match.totalVariance)}</span>
                </span>
              )}
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {t('colItem')}
                  </th>
                  <th className="px-4 py-3 text-end font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {t('colOrdered')}
                  </th>
                  <th className="px-4 py-3 text-end font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {t('colReceived')}
                  </th>
                  <th className="px-4 py-3 text-end font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {t('colBilledQty')}
                  </th>
                  <th className="px-4 py-3 text-end font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {t('colPoCost')}
                  </th>
                  <th className="px-4 py-3 text-end font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {t('colInvPrice')}
                  </th>
                  <th className="px-4 py-3 text-end font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {t('colQtyVar')}
                  </th>
                  <th className="px-4 py-3 text-end font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {t('colPriceVar')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {match.lines.map((line) => {
                  const colorClass = lineColorClass(line.overBilled, line.offPo, line.priceOverTolerance)
                  return (
                    <tr key={line.catalogItemId} className="hover:bg-muted/50">
                      <td className="px-4 py-3 text-foreground">{line.catalogItemName}</td>
                      <td className={`px-4 py-3 text-end font-numeric ${colorClass}`}>
                        {line.orderedQty}
                      </td>
                      <td className={`px-4 py-3 text-end font-numeric ${colorClass}`}>
                        {line.receivedQty}
                      </td>
                      <td className={`px-4 py-3 text-end font-numeric ${colorClass}`}>
                        {line.billedQty}
                      </td>
                      <td className={`px-4 py-3 text-end tabular-nums font-numeric ${colorClass}`}>
                        {fmt(line.poNetUnitCost)}
                      </td>
                      <td className={`px-4 py-3 text-end tabular-nums font-numeric ${colorClass}`}>
                        {fmt(line.unitPrice)}
                      </td>
                      <td className={`px-4 py-3 text-end font-numeric ${colorClass}`}>
                        {line.qtyVariance > 0 ? `+${line.qtyVariance}` : line.qtyVariance}
                      </td>
                      <td className={`px-4 py-3 text-end tabular-nums font-numeric ${colorClass}`}>
                        {line.priceVariance > 0 ? `+${fmt(line.priceVariance)}` : fmt(line.priceVariance)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
