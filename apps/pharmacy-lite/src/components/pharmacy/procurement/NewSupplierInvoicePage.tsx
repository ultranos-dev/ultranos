'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ChevronLeft } from '@ultranos/ui-kit/icons'
import { getPurchaseOrderById, getPurchaseOrders } from '@/lib/procurement/purchase-order-service'
import { createSupplierInvoice, findDuplicateInvoice } from '@/lib/procurement/supplier-invoice-service'
import { computePoTotals } from '@/lib/procurement/po-totals'
import { db } from '@/lib/db'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import type { PurchaseOrder } from '@/lib/procurement/types'

// ---------------------------------------------------------------------------
// Money helpers (per-file — same pattern as NewPurchaseOrderPage)
// All money is stored as integer minor units.
// Display: amount / 10^minorUnits (e.g. 1000 / 100 = 10.00 AFN)
// Input: user types major-unit string → Math.round(parseFloat(x) * 10^minorUnits)
// ---------------------------------------------------------------------------

function formatAmount(amount: number, currency: string, minorUnits: number): string {
  const divisor = Math.pow(10, minorUnits)
  return `${currency} ${(amount / divisor).toFixed(minorUnits)}`
}

function parseMajorToMinor(displayValue: string, minorUnits: number): number {
  const parsed = parseFloat(displayValue || '0')
  if (isNaN(parsed)) return 0
  return Math.round(parsed * Math.pow(10, minorUnits))
}

function minorToMajorDisplay(minorValue: number, scale: number): string {
  if (scale === 0) return String(minorValue)
  return (minorValue / Math.pow(10, scale)).toFixed(scale)
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InvoiceLineState {
  catalogItemId: string
  catalogItemName: string
  billedQtyDisplay: string   // string for controlled input
  billedQty: number          // parsed integer
  unitPriceDisplay: string   // major-unit string
  unitPriceMinor: number     // stored minor-unit value
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NewSupplierInvoicePage() {
  const t = useTranslations('supplierInvoices')
  const router = useRouter()
  const searchParams = useSearchParams()
  const poId = searchParams.get('poId')

  const [po, setPo] = useState<PurchaseOrder | null>(null)
  const [openPos, setOpenPos] = useState<PurchaseOrder[]>([])
  const [selectedPoId, setSelectedPoId] = useState(poId ?? '')
  const [loading, setLoading] = useState(true)

  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [duplicateWarning, setDuplicateWarning] = useState(false)
  const [lines, setLines] = useState<InvoiceLineState[]>([])
  const [taxRateInput, setTaxRateInput] = useState('0')
  const [freightDisplay, setFreightDisplay] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [currency, setCurrency] = useState('AFN')
  const [currencyMinorUnits, setCurrencyMinorUnits] = useState(2)

  // Load settings (currency)
  useEffect(() => {
    db.pharmacySettings.toCollection().first().then((settings) => {
      if (settings) {
        setCurrency(settings.currency)
        setCurrencyMinorUnits(settings.currencyMinorUnits)
        setTaxRateInput(String(settings.taxRate ?? 0))
      }
    }).catch((err) => {
      console.error('[NewSupplierInvoicePage] settings load failed:', err instanceof Error ? err.message : 'unknown')
    })
  }, [])

  // Load PO from ?poId= or list open POs
  const loadPo = useCallback(async (id: string) => {
    if (!id) return
    try {
      const found = await getPurchaseOrderById(id)
      if (found) {
        setPo(found)
        prefillLinesFromPo(found, currencyMinorUnits)
      }
    } catch (err) {
      console.error('[NewSupplierInvoicePage] loadPo failed:', err instanceof Error ? err.message : 'unknown')
    }
  }, [currencyMinorUnits]) // eslint-disable-line react-hooks/exhaustive-deps

  function prefillLinesFromPo(purchaseOrder: PurchaseOrder, minorUnits: number) {
    const totals = computePoTotals(
      purchaseOrder.items.map((item) => ({
        catalogItemId: item.catalogItemId,
        catalogItemName: item.catalogItemName,
        quantityOrdered: item.quantityOrdered,
        unitCost: item.unitCost,
        discountType: item.discountType,
        discountValue: item.discountValue,
      })),
      purchaseOrder.taxRate ?? 0,
      purchaseOrder.freight ?? 0,
    )

    const prefilled: InvoiceLineState[] = purchaseOrder.items.map((item, idx) => {
      const netUnitCost = totals.items[idx]?.netUnitCost ?? item.unitCost
      const billedQty = item.quantityReceived
      return {
        catalogItemId: item.catalogItemId,
        catalogItemName: item.catalogItemName,
        billedQtyDisplay: String(billedQty),
        billedQty,
        unitPriceDisplay: minorToMajorDisplay(netUnitCost, minorUnits),
        unitPriceMinor: netUnitCost,
      }
    })

    setLines(prefilled)
    setTaxRateInput(String(purchaseOrder.taxRate ?? 0))
    if (purchaseOrder.freight) {
      setFreightDisplay(minorToMajorDisplay(purchaseOrder.freight, minorUnits))
    }
  }

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      try {
        const settings = await db.pharmacySettings.toCollection().first()
        const minorUnits = settings?.currencyMinorUnits ?? 2
        if (settings) {
          setCurrency(settings.currency)
          setCurrencyMinorUnits(minorUnits)
          setTaxRateInput(String(settings.taxRate ?? 0))
        }

        if (poId) {
          const found = await getPurchaseOrderById(poId)
          if (found) {
            setPo(found)
            prefillLinesFromPo(found, minorUnits)
            setSelectedPoId(poId)
          }
        } else {
          // Load all open POs for the <select>
          const all = await getPurchaseOrders()
          const open = all.filter((p) =>
            p.status === 'sent' || p.status === 'partially_received' || p.status === 'closed',
          )
          setOpenPos(open)
        }
      } catch (err) {
        console.error('[NewSupplierInvoicePage] init failed:', err instanceof Error ? err.message : 'unknown')
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [poId]) // eslint-disable-line react-hooks/exhaustive-deps

  // When the PO select changes (no-poId mode)
  async function handlePoSelect(id: string) {
    setSelectedPoId(id)
    setLines([])
    if (!id) { setPo(null); return }
    try {
      const found = await getPurchaseOrderById(id)
      if (found) {
        setPo(found)
        prefillLinesFromPo(found, currencyMinorUnits)
      }
    } catch (err) {
      console.error('[NewSupplierInvoicePage] handlePoSelect failed:', err instanceof Error ? err.message : 'unknown')
    }
  }

  // Invoice-number blur → duplicate check
  async function handleInvoiceNumberBlur() {
    if (!po || !invoiceNumber.trim()) { setDuplicateWarning(false); return }
    try {
      const dup = await findDuplicateInvoice(po.supplierId, invoiceNumber)
      setDuplicateWarning(!!dup)
    } catch (err) {
      console.error('[NewSupplierInvoicePage] duplicate check failed:', err instanceof Error ? err.message : 'unknown')
    }
  }

  function updateLine(idx: number, updates: Partial<InvoiceLineState>) {
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== idx) return l
        return { ...l, ...updates }
      }),
    )
  }

  // Live totals
  const liveTotals = computePoTotals(
    lines.map((l) => ({
      catalogItemId: l.catalogItemId,
      catalogItemName: l.catalogItemName,
      quantityOrdered: l.billedQty,
      unitCost: l.unitPriceMinor,
    })),
    Number(taxRateInput) || 0,
    parseMajorToMinor(freightDisplay, currencyMinorUnits),
  )

  async function handleSubmit() {
    if (!po) {
      setError(t('selectPo'))
      return
    }
    if (!invoiceNumber.trim()) {
      setError(t('fieldInvoiceNo'))
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      let createdBy = 'unknown'
      try {
        createdBy = useAuthSessionStore.getState().getPractitionerRef()
      } catch {
        // No authenticated session in this context (e.g. test environment) — use fallback
      }
      const invoice = await createSupplierInvoice({
        purchaseOrderId: po.id,
        invoiceNumber: invoiceNumber.trim(),
        items: lines.map((l) => ({
          catalogItemId: l.catalogItemId,
          catalogItemName: l.catalogItemName,
          billedQty: l.billedQty,
          unitPrice: l.unitPriceMinor,
        })),
        taxRate: Number(taxRateInput) || 0,
        freight: parseMajorToMinor(freightDisplay, currencyMinorUnits),
        notes: notes.trim() || undefined,
        createdBy,
      })
      router.push(`/inventory/invoices/${invoice.id}`)
    } catch (err) {
      console.error('[NewSupplierInvoicePage] submit failed:', err instanceof Error ? err.message : 'unknown')
      setError(t('createError'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Back button — ghost, w-fit (mandatory per layout standard) */}
      <Button
        variant="ghost"
        size="sm"
        className="w-fit px-0"
        data-testid="back-button"
        onClick={() => router.push('/inventory/invoices')}
      >
        <ChevronLeft size={16} className="me-1" />
        {t('title')}
      </Button>

      {/* Page heading */}
      <h1 className="text-2xl font-semibold text-foreground">{t('newTitle')}</h1>

      {error && (
        <div role="alert" className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Section 1: Invoice details                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50">
        <h2 className="mb-4 text-base font-semibold text-foreground">{t('detailsSection')}</h2>

        <div className="grid gap-4 md:grid-cols-2">
          {/* PO select (only when no poId query param) */}
          {!poId && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="po-select">{t('colPo')}</Label>
              <select
                id="po-select"
                data-testid="po-select"
                value={selectedPoId}
                onChange={(e) => handlePoSelect(e.target.value)}
                className="rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                disabled={loading}
              >
                <option value="">{loading ? t('loading') : t('selectPo')}</option>
                {openPos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.poNumber ?? p.id} — {p.supplierName}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Invoice number */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invoice-number-input">{t('fieldInvoiceNo')}</Label>
            <Input
              id="invoice-number-input"
              data-testid="inv-number"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              onBlur={handleInvoiceNumberBlur}
              placeholder="e.g. SUP-2026-001"
            />
            {duplicateWarning && (
              <p className="text-sm text-warning">{t('duplicateWarning')}</p>
            )}
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <Label htmlFor="invoice-notes">{t('fieldNotes')}</Label>
            <Textarea
              id="invoice-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Section 2: Line items (prefilled from PO)                           */}
      {/* ------------------------------------------------------------------ */}
      {po && lines.length > 0 && (
        <div className="rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50">
          <h2 className="mb-4 text-base font-semibold text-foreground">{t('linesSection')}</h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-3 py-2 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {t('colInvoiceNo')}
                  </th>
                  <th className="px-3 py-2 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {t('colBilledQty')}
                  </th>
                  <th className="px-3 py-2 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {t('colUnitPrice')}
                  </th>
                  <th className="px-3 py-2 text-end font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {t('subtotal')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lines.map((line, idx) => (
                  <tr key={line.catalogItemId} className="hover:bg-muted/50">
                    {/* Item name */}
                    <td className="px-3 py-2 text-foreground">
                      {line.catalogItemName}
                    </td>
                    {/* Billed quantity */}
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        data-testid={`inv-billed-${line.catalogItemId}`}
                        value={line.billedQtyDisplay}
                        onChange={(e) => {
                          const qty = parseInt(e.target.value || '0', 10) || 0
                          updateLine(idx, { billedQtyDisplay: e.target.value, billedQty: qty })
                        }}
                        className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground font-numeric focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                    </td>
                    {/* Unit price — user types major units; stored as minor */}
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        data-testid={`inv-price-${line.catalogItemId}`}
                        step={Math.pow(10, -currencyMinorUnits).toFixed(currencyMinorUnits)}
                        value={line.unitPriceDisplay}
                        onChange={(e) => {
                          const minorVal = parseMajorToMinor(e.target.value, currencyMinorUnits)
                          updateLine(idx, {
                            unitPriceDisplay: e.target.value,
                            unitPriceMinor: minorVal,
                          })
                        }}
                        className="w-28 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground font-numeric focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                    </td>
                    {/* Line subtotal */}
                    <td className="px-3 py-2 text-end font-numeric text-muted-foreground">
                      {formatAmount(
                        liveTotals.items[idx]?.lineNet ?? 0,
                        currency,
                        currencyMinorUnits,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Section 3: Document charges (tax + freight) + live total            */}
      {/* ------------------------------------------------------------------ */}
      <div className="rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50">
        <h2 className="mb-4 text-base font-semibold text-foreground">{t('grandTotal')}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="inv-tax-rate-input">{t('fieldTaxRate')}</Label>
            <input
              id="inv-tax-rate-input"
              type="number"
              min="0"
              max="100"
              step="0.01"
              data-testid="inv-tax-rate"
              value={taxRateInput}
              onChange={(e) => setTaxRateInput(e.target.value)}
              className="rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm font-numeric focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="inv-freight-input">{t('fieldFreight')}</Label>
            <input
              id="inv-freight-input"
              type="number"
              min="0"
              step={Math.pow(10, -currencyMinorUnits).toFixed(currencyMinorUnits)}
              data-testid="inv-freight"
              value={freightDisplay}
              onChange={(e) => setFreightDisplay(e.target.value)}
              placeholder={minorToMajorDisplay(0, currencyMinorUnits)}
              className="rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm font-numeric focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>

        {/* Live totals breakdown */}
        <div className="mt-4 space-y-1 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>{t('subtotal')}</span>
            <span className="font-numeric">{formatAmount(liveTotals.subtotal, currency, currencyMinorUnits)}</span>
          </div>
          {liveTotals.taxAmount > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>{t('tax')}</span>
              <span className="font-numeric">{formatAmount(liveTotals.taxAmount, currency, currencyMinorUnits)}</span>
            </div>
          )}
          {liveTotals.freight > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>{t('freight')}</span>
              <span className="font-numeric">{formatAmount(liveTotals.freight, currency, currencyMinorUnits)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-border pt-2 font-semibold text-foreground">
            <span>{t('grandTotal')}</span>
            <span className="font-numeric">{formatAmount(liveTotals.grandTotal, currency, currencyMinorUnits)}</span>
          </div>
        </div>
      </div>

      {/* Submit */}
      <div className="flex justify-end">
        <Button
          type="button"
          data-testid="submit-invoice"
          onClick={handleSubmit}
          disabled={submitting || !po}
        >
          {submitting ? t('loading') : t('newInvoice')}
        </Button>
      </div>
    </div>
  )
}
