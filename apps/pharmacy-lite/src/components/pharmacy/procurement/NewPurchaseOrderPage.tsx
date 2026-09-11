'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { ChevronLeft, Plus, Trash2 } from '@ultranos/ui-kit/icons'
import { getActiveSuppliers } from '@/lib/procurement/supplier-service'
import { createPurchaseOrder } from '@/lib/procurement/purchase-order-service'
import { computePoTotals } from '@/lib/procurement/po-totals'
import { db } from '@/lib/db'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import type { Supplier } from '@/lib/procurement/types'
import type { CatalogItem } from '@/lib/inventory/types'

// ---------------------------------------------------------------------------
// Money helpers (per-file — same pattern as NewOrderPage)
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

interface POLineState {
  id: string              // local UUID for list key
  catalogItemId: string
  catalogItemName: string
  quantityOrdered: string // string for controlled input
  unitCostDisplay: string // major-unit string for input display
  unitCostMinor: number   // stored minor unit value
  discountType: '' | 'percent' | 'amount'
  discountDisplay: string // raw input — percent (0-100) or major-unit amount
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NewPurchaseOrderPage() {
  const t = useTranslations('purchaseOrders')
  const router = useRouter()

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [supplierId, setSupplierId] = useState('')
  const [supplierName, setSupplierName] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<POLineState[]>([])
  const [catalogSearch, setCatalogSearch] = useState('')
  const [catalogResults, setCatalogResults] = useState<CatalogItem[]>([])
  const [currency, setCurrency] = useState('AFN')
  const [currencyMinorUnits, setCurrencyMinorUnits] = useState(2)
  const [taxRateInput, setTaxRateInput] = useState('0')
  const [freightDisplay, setFreightDisplay] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingSuppliers, setLoadingSuppliers] = useState(true)

  // Load suppliers + settings on mount
  const loadInitialData = useCallback(async () => {
    try {
      const [activeSuppliers, settings] = await Promise.all([
        getActiveSuppliers(),
        db.pharmacySettings.toCollection().first(),
      ])
      setSuppliers(activeSuppliers)
      // Auto-select when there is exactly one active supplier
      if (activeSuppliers.length === 1 && activeSuppliers[0]) {
        setSupplierId(activeSuppliers[0].id)
        setSupplierName(activeSuppliers[0].name)
      }
      if (settings) {
        setCurrency(settings.currency)
        setCurrencyMinorUnits(settings.currencyMinorUnits)
        setTaxRateInput(String(settings.taxRate ?? 0))
      }
    } catch (err) {
      console.error('[NewPurchaseOrderPage] loadInitialData failed:', err instanceof Error ? err.message : 'unknown')
    } finally {
      setLoadingSuppliers(false)
    }
  }, [])

  useEffect(() => {
    loadInitialData()
  }, [loadInitialData])

  // Search catalog items
  useEffect(() => {
    const trimmed = catalogSearch.trim()
    if (trimmed.length < 1) {
      setCatalogResults([])
      return
    }
    const run = async () => {
      try {
        const items = await db.catalogItems.toArray()
        const q = trimmed.toLowerCase()
        setCatalogResults(
          items
            .filter(
              (item) =>
                item.name.toLowerCase().includes(q) ||
                item.nameLocal?.toLowerCase().includes(q) ||
                item.barcode?.toLowerCase().includes(q),
            )
            .slice(0, 8),
        )
      } catch (err) {
        console.error('[NewPurchaseOrderPage] catalog search failed:', err instanceof Error ? err.message : 'unknown')
      }
    }
    run()
  }, [catalogSearch])

  // Add a line from catalog search result
  function addLineFromCatalog(item: CatalogItem) {
    setLines((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        catalogItemId: item.id,
        catalogItemName: item.name,
        quantityOrdered: '1',
        unitCostDisplay: '0.00',
        unitCostMinor: 0,
        discountType: '',
        discountDisplay: '',
      },
    ])
    setCatalogSearch('')
    setCatalogResults([])
  }

  // Add a blank manual line
  function addManualLine() {
    setLines((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        catalogItemId: '',
        catalogItemName: '',
        quantityOrdered: '1',
        unitCostDisplay: minorToMajorDisplay(0, currencyMinorUnits),
        unitCostMinor: 0,
        discountType: '',
        discountDisplay: '',
      },
    ])
  }

  function updateLine(id: string, updates: Partial<POLineState>) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l
        return { ...l, ...updates }
      }),
    )
  }

  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.id !== id))
  }

  function handleSupplierChange(newId: string) {
    setSupplierId(newId)
    const found = suppliers.find((s) => s.id === newId)
    setSupplierName(found ? found.name : '')
  }

  // Compute line total (minor units)
  function lineTotal(line: POLineState): number {
    const qty = parseInt(line.quantityOrdered || '0', 10) || 0
    return qty * line.unitCostMinor
  }

  // Live totals derived from computePoTotals
  const liveTotals = computePoTotals(
    lines.map((l) => ({
      catalogItemId: l.catalogItemId || `manual-${l.id}`,
      catalogItemName: l.catalogItemName || '',
      quantityOrdered: parseInt(l.quantityOrdered || '0', 10) || 0,
      unitCost: l.unitCostMinor,
      discountType: l.discountType || undefined,
      discountValue:
        l.discountType === 'percent'
          ? parseFloat(l.discountDisplay || '0') || 0
          : l.discountType === 'amount'
            ? parseMajorToMinor(l.discountDisplay, currencyMinorUnits)
            : undefined,
    })),
    Number(taxRateInput) || 0,
    parseMajorToMinor(freightDisplay, currencyMinorUnits),
  )

  // Submit handler
  async function handleSubmit() {
    if (!supplierId) {
      setError(t('newPoErrorNoSupplier'))
      return
    }
    if (lines.length === 0) {
      setError(t('newPoErrorNoLines'))
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const practitionerRef = useAuthSessionStore.getState().getPractitionerRef()
      const poItems = lines.map((l) => ({
        // Manual (non-catalog) lines have no catalogItemId — use the line's unique
        // local id so multiple manual lines don't collide (detail table keys on catalogItemId).
        catalogItemId: l.catalogItemId || `manual-${l.id}`,
        catalogItemName: l.catalogItemName || t('newPoManualItem'),
        quantityOrdered: parseInt(l.quantityOrdered || '0', 10) || 0,
        unitCost: l.unitCostMinor,
        discountType: l.discountType || undefined,
        discountValue:
          l.discountType === 'amount'
            ? parseMajorToMinor(l.discountDisplay, currencyMinorUnits)
            : l.discountType === 'percent'
              ? parseFloat(l.discountDisplay || '0') || 0
              : undefined,
      }))
      const po = await createPurchaseOrder({
        supplierId,
        supplierName,
        items: poItems,
        taxRate: Number(taxRateInput) || 0,
        freight: parseMajorToMinor(freightDisplay, currencyMinorUnits),
        notes: notes.trim() || undefined,
        createdBy: practitionerRef,
      })
      router.push(`/inventory/orders/${po.id}`)
    } catch (err) {
      console.error('[NewPurchaseOrderPage] submit failed:', err instanceof Error ? err.message : 'unknown')
      setError(t('newPoSubmitError'))
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
        onClick={() => router.push('/inventory/orders')}
      >
        <ChevronLeft size={16} className="me-1" />
        {t('title')}
      </Button>

      {/* Page heading */}
      <h1 className="text-2xl font-semibold text-foreground">{t('newPoTitle')}</h1>

      {error && (
        <div role="alert" className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Section 1: Supplier                                                  */}
      {/* ------------------------------------------------------------------ */}
      <div className="rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50">
        <h2 className="mb-4 text-base font-semibold text-foreground">{t('newPoSectionSupplier')}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="supplier-select-input">{t('newPoSupplierLabel')}</Label>
            <select
              id="supplier-select-input"
              data-testid="supplier-select"
              value={supplierId}
              onChange={(e) => handleSupplierChange(e.target.value)}
              className="rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              disabled={loadingSuppliers}
            >
              <option value="">{loadingSuppliers ? t('loading') : t('newPoSelectSupplier')}</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5 md:col-span-2">
            <Label htmlFor="po-notes">{t('newPoNotesLabel')}</Label>
            <Textarea
              id="po-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder={t('newPoNotesPlaceholder')}
            />
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Section 2: Line items                                               */}
      {/* ------------------------------------------------------------------ */}
      <div className="rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50">
        <h2 className="mb-4 text-base font-semibold text-foreground">{t('newPoSectionLines')}</h2>

        {/* Catalog search */}
        <div className="relative mb-4">
          <Input
            type="search"
            role="searchbox"
            placeholder={t('newPoSearchCatalog')}
            value={catalogSearch}
            onChange={(e) => setCatalogSearch(e.target.value)}
            aria-label={t('newPoSearchCatalog')}
          />
          {catalogResults.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-border bg-card shadow-card">
              {catalogResults.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    data-testid="catalog-result"
                    className="w-full px-4 py-2 text-start text-sm text-foreground hover:bg-muted/50"
                    onClick={() => addLineFromCatalog(item)}
                  >
                    <span className="font-medium">{item.name}</span>
                    <span className="ms-2 text-muted-foreground text-xs">
                      {item.strength} {item.form}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Manual add button */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="add-manual-line"
          onClick={addManualLine}
          className="mb-4"
        >
          <Plus size={14} className="me-1" />
          {t('newPoAddManualLine')}
        </Button>

        {/* Lines table */}
        {lines.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-3 py-2 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {t('newPoColItem')}
                  </th>
                  <th className="px-3 py-2 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {t('newPoColQty')}
                  </th>
                  <th className="px-3 py-2 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {t('newPoColUnitCost')}
                  </th>
                  <th className="px-3 py-2 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {t('newPoLineDiscount')}
                  </th>
                  <th className="px-3 py-2 text-end font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {t('newPoColLineTotal')}
                  </th>
                  <th className="px-3 py-2" aria-label="actions" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lines.map((line) => (
                  <tr key={line.id} className="hover:bg-muted/50">
                    {/* Item name */}
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={line.catalogItemName}
                        onChange={(e) => updateLine(line.id, { catalogItemName: e.target.value })}
                        placeholder={t('newPoItemPlaceholder')}
                        className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                    </td>
                    {/* Quantity */}
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="1"
                        data-testid={`line-qty-${line.id}`}
                        value={line.quantityOrdered}
                        onChange={(e) =>
                          updateLine(line.id, { quantityOrdered: e.target.value })
                        }
                        className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground tabular-nums focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                    </td>
                    {/* Unit cost — user types major units; stored as minor */}
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        data-testid={`line-cost-${line.id}`}
                        step={Math.pow(10, -currencyMinorUnits).toFixed(currencyMinorUnits)}
                        value={line.unitCostDisplay}
                        onChange={(e) => {
                          const minorVal = parseMajorToMinor(e.target.value, currencyMinorUnits)
                          updateLine(line.id, {
                            unitCostDisplay: e.target.value,
                            unitCostMinor: minorVal,
                          })
                        }}
                        className="w-28 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground tabular-nums focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                    </td>
                    {/* Line discount */}
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <select
                          data-testid={`line-disc-type-${line.id}`}
                          value={line.discountType}
                          onChange={(e) =>
                            updateLine(line.id, {
                              discountType: e.target.value as '' | 'percent' | 'amount',
                              discountDisplay: '',
                            })
                          }
                          className="rounded-md border border-border bg-background text-foreground px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          <option value="">—</option>
                          <option value="percent">{t('newPoDiscountPercent')}</option>
                          <option value="amount">{t('newPoDiscountAmount')}</option>
                        </select>
                        {line.discountType !== '' && (
                          <input
                            type="number"
                            min="0"
                            data-testid={`line-disc-val-${line.id}`}
                            value={line.discountDisplay}
                            onChange={(e) =>
                              updateLine(line.id, { discountDisplay: e.target.value })
                            }
                            placeholder="0"
                            className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground tabular-nums focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          />
                        )}
                      </div>
                    </td>
                    {/* Line total */}
                    <td className="px-3 py-2 text-end tabular-nums text-muted-foreground font-numeric">
                      {formatAmount(lineTotal(line), currency, currencyMinorUnits)}
                    </td>
                    {/* Remove */}
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => removeLine(line.id)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={t('newPoRemoveLine')}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {lines.length === 0 && <EmptyState size="sm" title={t('newPoNoLines')} />}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Section 3: Document charges (tax rate + freight)                    */}
      {/* ------------------------------------------------------------------ */}
      <div className="rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50">
        <h2 className="mb-4 text-base font-semibold text-foreground">{t('newPoSectionTotals')}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="po-tax-rate-input">{t('newPoTaxRate')}</Label>
            <input
              id="po-tax-rate-input"
              type="number"
              min="0"
              max="100"
              step="0.01"
              data-testid="po-tax-rate"
              value={taxRateInput}
              onChange={(e) => setTaxRateInput(e.target.value)}
              className="rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="po-freight-input">{t('newPoFreight')}</Label>
            <input
              id="po-freight-input"
              type="number"
              min="0"
              step={Math.pow(10, -currencyMinorUnits).toFixed(currencyMinorUnits)}
              data-testid="po-freight"
              value={freightDisplay}
              onChange={(e) => setFreightDisplay(e.target.value)}
              placeholder={minorToMajorDisplay(0, currencyMinorUnits)}
              className="rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>

        {/* Live totals breakdown */}
        <div className="mt-4 space-y-1 text-sm">
          <div className="flex justify-between text-muted-foreground" data-testid="po-totals-subtotal">
            <span>{t('newPoSubtotal')}</span>
            <span className="tabular-nums font-numeric">{formatAmount(liveTotals.subtotal, currency, currencyMinorUnits)}</span>
          </div>
          {liveTotals.discountTotal > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>{t('newPoDiscountTotal')}</span>
              <span className="tabular-nums font-numeric text-destructive">
                -{formatAmount(liveTotals.discountTotal, currency, currencyMinorUnits)}
              </span>
            </div>
          )}
          {liveTotals.taxAmount > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>{t('newPoTax')}</span>
              <span className="tabular-nums font-numeric">{formatAmount(liveTotals.taxAmount, currency, currencyMinorUnits)}</span>
            </div>
          )}
          {liveTotals.freight > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>{t('newPoFreight')}</span>
              <span className="tabular-nums font-numeric">{formatAmount(liveTotals.freight, currency, currencyMinorUnits)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-border pt-2 font-semibold text-foreground" data-testid="po-totals-grandtotal">
            <span>{t('newPoGrandTotal')}</span>
            <span className="tabular-nums font-numeric">{formatAmount(liveTotals.grandTotal, currency, currencyMinorUnits)}</span>
          </div>
        </div>
      </div>

      {/* Submit */}
      <div className="flex justify-end">
        <Button
          type="button"
          data-testid="submit-po"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? t('newPoSubmitting') : t('newPoCreate')}
        </Button>
      </div>
    </div>
  )
}
