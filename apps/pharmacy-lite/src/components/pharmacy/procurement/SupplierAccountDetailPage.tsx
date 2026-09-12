'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { ChevronLeft, Wallet } from '@ultranos/ui-kit/icons'
import { getSupplierAccount } from '@/lib/procurement/supplier-account-service'
import { recordSupplierPayment, voidSupplierPayment } from '@/lib/procurement/supplier-payment-service'
import { allocateFifo } from '@/lib/procurement/ap-allocation'
import { computeAmountDue } from '@/lib/procurement/ap-invoice'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import type { SupplierAccountDetail } from '@/lib/procurement/supplier-account-service'
import type { SupplierPayment, SupplierPaymentMethod } from '@/lib/procurement/types'
import type { AllocationLine } from '@/lib/procurement/ap-allocation'

// ---------------------------------------------------------------------------
// Money helpers
// ---------------------------------------------------------------------------

function formatAmount(amount: number, currency: string, minorUnits: number): string {
  const divisor = Math.pow(10, minorUnits)
  return `${currency} ${(amount / divisor).toFixed(minorUnits)}`
}

function parseToMinor(value: string, minorUnits: number): number {
  const parsed = parseFloat(value)
  if (isNaN(parsed) || parsed <= 0) return 0
  return Math.round(parsed * Math.pow(10, minorUnits))
}

// ---------------------------------------------------------------------------
// SupplierAccountDetailPage
// ---------------------------------------------------------------------------

export function SupplierAccountDetailPage() {
  const t = useTranslations('supplierPayments')
  const router = useRouter()
  const params = useParams()
  const supplierId = params?.supplierId as string

  const [account, setAccount] = useState<SupplierAccountDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Currency settings
  const [currency, setCurrency] = useState('AFN')
  const [minorUnits, setMinorUnits] = useState(2)

  // Record-payment dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [paymentStr, setPaymentStr] = useState('')
  const [method, setMethod] = useState<SupplierPaymentMethod>('cash')
  const [reference, setReference] = useState('')
  const [preview, setPreview] = useState<{ allocations: AllocationLine[]; unapplied: number } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Void dialog
  const [voidDialogOpen, setVoidDialogOpen] = useState(false)
  const [voidTargetId, setVoidTargetId] = useState<string | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [voidReasonError, setVoidReasonError] = useState<string | null>(null)
  const [voiding, setVoiding] = useState(false)

  const fmt = useCallback(
    (amount: number) => formatAmount(amount, currency, minorUnits),
    [currency, minorUnits],
  )

  const load = useCallback(async () => {
    if (!supplierId) return
    try {
      const { db } = await import('@/lib/db')
      const [acct, settings] = await Promise.all([
        getSupplierAccount(supplierId),
        db.pharmacySettings?.toCollection?.()?.first?.(),
      ])
      setAccount(acct)
      if (settings) {
        if (settings.currency) setCurrency(settings.currency)
        if (typeof settings.currencyMinorUnits === 'number') setMinorUnits(settings.currencyMinorUnits)
      }
    } catch (err) {
      console.error('[SupplierAccountDetailPage] load failed:', err instanceof Error ? err.message : 'unknown')
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }, [supplierId])

  useEffect(() => {
    load()
  }, [load])

  // Update FIFO preview whenever paymentStr changes
  useEffect(() => {
    if (!account || !dialogOpen) {
      setPreview(null)
      return
    }
    const amountMinor = parseToMinor(paymentStr, minorUnits)
    if (amountMinor <= 0) {
      setPreview(null)
      return
    }
    const allocatableInvoices = account.invoices.map((i) => ({
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      amountDue: computeAmountDue(i),
      dueDate: i.dueDate ?? i.createdAt,
    }))
    setPreview(allocateFifo(allocatableInvoices, amountMinor))
  }, [paymentStr, account, dialogOpen, minorUnits])

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  function openRecordPaymentDialog() {
    setPaymentStr('')
    setMethod('cash')
    setReference('')
    setPreview(null)
    setDialogOpen(true)
  }

  async function handleConfirmPayment() {
    if (!account || !preview || preview.allocations.length === 0) return
    if (preview.unapplied > 0) return // button disabled, but guard anyway

    const { session } = useAuthSessionStore.getState()
    const paidBy = session?.practitionerId ?? session?.userId ?? 'unknown'

    setSubmitting(true)
    try {
      await recordSupplierPayment({
        supplierId: account.supplierId,
        allocations: preview.allocations.map((a) => ({
          supplierInvoiceId: a.supplierInvoiceId,
          amount: a.amount,
        })),
        method,
        reference: reference.trim() || undefined,
        paidBy,
        hlcTimestamp: new Date().toISOString(),
      })
      setDialogOpen(false)
      setLoading(true)
      await load()
    } catch (err) {
      console.error('[SupplierAccountDetailPage] recordSupplierPayment failed:', err instanceof Error ? err.message : 'unknown')
    } finally {
      setSubmitting(false)
    }
  }

  function openVoidDialog(paymentId: string) {
    setVoidTargetId(paymentId)
    setVoidReason('')
    setVoidReasonError(null)
    setVoidDialogOpen(true)
  }

  async function handleConfirmVoid() {
    if (!voidTargetId) return
    if (!voidReason.trim()) {
      setVoidReasonError(t('voidReasonRequired'))
      return
    }

    const { session } = useAuthSessionStore.getState()
    const voidedBy = session?.practitionerId ?? session?.userId ?? 'unknown'

    setVoiding(true)
    try {
      await voidSupplierPayment(voidTargetId, voidedBy, voidReason, new Date().toISOString())
      setVoidDialogOpen(false)
      setLoading(true)
      await load()
    } catch (err) {
      console.error('[SupplierAccountDetailPage] voidSupplierPayment failed:', err instanceof Error ? err.message : 'unknown')
    } finally {
      setVoiding(false)
    }
  }

  // -------------------------------------------------------------------------
  // Back button (shared)
  // -------------------------------------------------------------------------

  const backButton = (
    <Button
      variant="ghost"
      size="sm"
      className="w-fit px-0"
      onClick={() => router.push('/inventory/payables')}
    >
      <ChevronLeft size={16} className="me-1" />
      {t('backToPayables')}
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
            <EmptyState icon={Wallet} title={t('loading')} />
          </div>
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Not-found state
  // -------------------------------------------------------------------------

  if (notFound || !account) {
    return (
      <div className="flex flex-col gap-4">
        {backButton}
        <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState icon={Wallet} title={t('empty')} />
          </div>
        </div>
      </div>
    )
  }

  const confirmDisabled =
    submitting ||
    parseToMinor(paymentStr, minorUnits) <= 0 ||
    !preview ||
    preview.allocations.length === 0 ||
    preview.unapplied > 0

  return (
    <div className="flex flex-col gap-4">
      {/* Back button */}
      {backButton}

      {/* Page heading */}
      <h1 className="text-2xl font-semibold text-foreground">{account.supplierName}</h1>

      {/* ------------------------------------------------------------------ */}
      {/* Outstanding + aging header card                                      */}
      {/* ------------------------------------------------------------------ */}
      <div className="rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">{t('outstanding')}</p>
            <p className="mt-1 text-2xl font-semibold font-numeric text-foreground">
              {fmt(account.outstanding)}
            </p>
          </div>
          <Button
            data-testid="open-record-payment"
            onClick={openRecordPaymentDialog}
            disabled={account.invoices.length === 0}
          >
            {t('recordPayment')}
          </Button>
        </div>

        {/* Aging buckets */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t('agingCurrent')}
            </p>
            <p className="mt-1 font-numeric text-sm font-semibold text-foreground">
              {fmt(account.aging.current)}
            </p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t('agingThirty')}
            </p>
            <p className={`mt-1 font-numeric text-sm font-semibold ${account.aging.thirtyDay > 0 ? 'text-warning' : 'text-foreground'}`}>
              {fmt(account.aging.thirtyDay)}
            </p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t('agingSixty')}
            </p>
            <p className={`mt-1 font-numeric text-sm font-semibold ${account.aging.sixtyDay > 0 ? 'text-warning' : 'text-foreground'}`}>
              {fmt(account.aging.sixtyDay)}
            </p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t('agingNinety')}
            </p>
            <p className={`mt-1 font-numeric text-sm font-semibold ${account.aging.ninetyPlus > 0 ? 'text-destructive' : 'text-foreground'}`}>
              {fmt(account.aging.ninetyPlus)}
            </p>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Unpaid-invoices table                                                */}
      {/* Unmounted while the record-payment dialog is open so that invoice   */}
      {/* number text nodes don't conflict with the FIFO allocation preview.  */}
      {/* ------------------------------------------------------------------ */}
      {!dialogOpen && (
        <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
          <div className="p-5 pb-0">
            <h2 className="mb-4 text-base font-semibold text-foreground">{t('unpaidInvoices')}</h2>
          </div>
          {account.invoices.length === 0 ? (
            <div className="flex min-h-[10rem] items-center justify-center">
              <EmptyState icon={Wallet} title={t('noBalances')} />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                      {t('colInvoiceNo')}
                    </th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                      {t('colDue')}
                    </th>
                    <th className="px-4 py-3 text-end font-medium text-muted-foreground text-xs uppercase tracking-wide">
                      {t('colAmountDue')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {account.invoices.map((inv) => {
                    const dueDate = inv.dueDate ?? inv.createdAt
                    const isOverdue = new Date(dueDate) < new Date()
                    const amountDue = computeAmountDue(inv)
                    return (
                      <tr key={inv.id} className="hover:bg-muted/50">
                        <td className="px-4 py-3 font-medium text-foreground">
                          {inv.invoiceNumber}
                          {isOverdue && (
                            <span className="ms-2 text-xs font-medium text-destructive">
                              {t('overdue')}
                            </span>
                          )}
                        </td>
                        <td className={`px-4 py-3 ${isOverdue ? 'text-destructive' : 'text-muted-foreground'}`}>
                          {new Date(dueDate).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-end font-numeric tabular-nums text-foreground">
                          {fmt(amountDue)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Payments table                                                        */}
      {/* ------------------------------------------------------------------ */}
      <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
        <div className="p-5 pb-0">
          <h2 className="mb-4 text-base font-semibold text-foreground">{t('payments')}</h2>
        </div>
        {account.payments.length === 0 ? (
          <div className="flex min-h-[10rem] items-center justify-center">
            <EmptyState icon={Wallet} title={t('noBalances')} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {t('colDate')}
                  </th>
                  <th className="px-4 py-3 text-end font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {t('colAmount')}
                  </th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {t('colMethod')}
                  </th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {t('colStatus')}
                  </th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {t('colActions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {account.payments.map((p) => (
                  <PaymentRow
                    key={p.id}
                    payment={p}
                    fmt={fmt}
                    t={t}
                    onVoid={openVoidDialog}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Record-payment dialog                                                 */}
      {/* ------------------------------------------------------------------ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('recordPayment')} — {account.supplierName}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            {/* Amount */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payment-amount-input">{t('paymentAmountLabel')}</Label>
              <Input
                id="payment-amount-input"
                data-testid="payment-amount"
                type="number"
                step="any"
                min="0"
                value={paymentStr}
                onChange={(e) => setPaymentStr(e.target.value)}
                placeholder="0"
              />
            </div>

            {/* Method */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payment-method-select">{t('paymentMethodLabel')}</Label>
              <select
                id="payment-method-select"
                value={method}
                onChange={(e) => setMethod(e.target.value as SupplierPaymentMethod)}
                className="rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm"
              >
                <option value="cash">{t('methodCash')}</option>
                <option value="bank_transfer">{t('methodBankTransfer')}</option>
                <option value="cheque">{t('methodCheque')}</option>
                <option value="other">{t('methodOther')}</option>
              </select>
            </div>

            {/* Reference */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payment-reference-input">{t('paymentReferenceLabel')}</Label>
              <Input
                id="payment-reference-input"
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="—"
              />
            </div>

            {/* FIFO allocation preview */}
            {preview && preview.allocations.length > 0 && (
              <div className="flex flex-col gap-2 rounded-lg bg-muted/50 p-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {t('allocationPreview')}
                </p>
                {preview.allocations.map((a) => (
                  <div key={a.supplierInvoiceId} className="flex items-center justify-between text-sm text-foreground">
                    {a.invoiceNumber} — {fmt(a.amount)}
                  </div>
                ))}
                {preview.unapplied > 0 && (
                  <p className="text-xs text-warning">{t('allocationExceeds')}</p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
              {t('cancel')}
            </Button>
            <Button
              variant="default"
              data-testid="confirm-payment"
              onClick={handleConfirmPayment}
              disabled={confirmDisabled}
            >
              {submitting ? t('recording') : t('confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------------ */}
      {/* Void-reason dialog                                                    */}
      {/* ------------------------------------------------------------------ */}
      <Dialog open={voidDialogOpen} onOpenChange={setVoidDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('void')}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="void-reason-input">{t('voidReasonLabel')}</Label>
              <Input
                id="void-reason-input"
                type="text"
                value={voidReason}
                onChange={(e) => {
                  setVoidReason(e.target.value)
                  setVoidReasonError(null)
                }}
                placeholder={t('voidReasonLabel')}
              />
              {voidReasonError && (
                <p className="text-xs text-destructive">{voidReasonError}</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidDialogOpen(false)} disabled={voiding}>
              {t('cancel')}
            </Button>
            <Button
              variant="default"
              onClick={handleConfirmVoid}
              disabled={voiding || !voidReason.trim()}
              className="text-destructive-foreground bg-destructive hover:bg-destructive/90"
            >
              {voiding ? `${t('void')}…` : t('confirmVoid')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PaymentRow (sub-component to keep JSX readable)
// ---------------------------------------------------------------------------

interface PaymentRowProps {
  payment: SupplierPayment
  fmt: (amount: number) => string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (key: string, values?: Record<string, any>) => string
  onVoid: (id: string) => void
}

function PaymentRow({ payment: p, fmt, t, onVoid }: PaymentRowProps) {
  const isVoid = p.status === 'void'
  const rowClass = isVoid ? 'hover:bg-muted/50 text-muted-foreground' : 'hover:bg-muted/50'

  const methodLabel: Record<string, string> = {
    cash: t('methodCash'),
    bank_transfer: t('methodBankTransfer'),
    cheque: t('methodCheque'),
    other: t('methodOther'),
  }

  return (
    <tr className={rowClass}>
      <td className="px-4 py-3">
        <div className={isVoid ? 'line-through' : ''}>
          {new Date(p.paidAt).toLocaleDateString()}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {t('paidBy', { who: p.paidBy })}
        </div>
        {isVoid && p.voidedBy && (
          <div className="text-xs text-muted-foreground mt-0.5">
            {t('voidedBy', { who: p.voidedBy })}
          </div>
        )}
      </td>
      <td className={`px-4 py-3 text-end font-numeric tabular-nums ${isVoid ? 'line-through' : ''}`}>
        {fmt(p.amount)}
      </td>
      <td className="px-4 py-3">
        {methodLabel[p.method] ?? p.method}
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
          isVoid
            ? 'bg-muted text-muted-foreground'
            : 'bg-success/10 text-success'
        }`}>
          {isVoid ? t('statusVoid') : t('statusActive')}
        </span>
      </td>
      <td className="px-4 py-3">
        {!isVoid && (
          <Button
            variant="outline"
            size="sm"
            data-testid={`void-payment-${p.id}`}
            onClick={() => onVoid(p.id)}
            className="text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
          >
            {t('void')}
          </Button>
        )}
      </td>
    </tr>
  )
}
