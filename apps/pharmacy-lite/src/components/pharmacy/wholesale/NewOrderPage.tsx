'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ChevronLeft, Plus, Trash2 } from '@ultranos/ui-kit/icons'
import { getActiveCustomers } from '@/lib/wholesale/customer-service'
import { createDraft, confirm } from '@/lib/wholesale/sales-order-service'
import { db } from '@/lib/db'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import type { WholesaleCustomer } from '@/lib/wholesale/types'
import type { CatalogItem } from '@/lib/inventory/types'

// ---------------------------------------------------------------------------
// Money helpers
// All money is stored as integer minor units (e.g. 250 AFN = 25000 when minorUnits=2).
// Display: amount / 10^minorUnits  (e.g. 25000 / 100 = 250.00 AFN)
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

function minorToMajorDisplay(minorUnits: number, scale: number): string {
  if (scale === 0) return String(minorUnits)
  return (minorUnits / Math.pow(10, scale)).toFixed(scale)
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrderLineState {
  id: string                   // local UUID for list key
  catalogItemId: string
  description: string
  unit: 'each' | 'pack'
  quantity: string             // string for controlled input
  unitPriceDisplay: string     // major-unit string for input display
  unitPriceMinor: number       // computed/stored minor unit value
  packSize: number
}

function computeUnitPriceMinor(
  unit: 'each' | 'pack',
  item: CatalogItem | null,
): number {
  if (!item) return 0
  const wp = item.wholesalePrice ?? 0
  return unit === 'pack' ? wp * item.packSize : wp
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NewOrderPage() {
  const t = useTranslations('wholesale')
  const router = useRouter()

  const [customers, setCustomers] = useState<WholesaleCustomer[]>([])
  const [customerId, setCustomerId] = useState('')
  const [taxRateDisplay, setTaxRateDisplay] = useState('0')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<OrderLineState[]>([])
  const [catalogSearch, setCatalogSearch] = useState('')
  const [catalogResults, setCatalogResults] = useState<CatalogItem[]>([])
  const [currency, setCurrency] = useState('AFN')
  const [currencyMinorUnits, setCurrencyMinorUnits] = useState(2)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingCustomers, setLoadingCustomers] = useState(true)

  // Load customers + settings on mount
  const loadInitialData = useCallback(async () => {
    try {
      const [activeCustomers, settings] = await Promise.all([
        getActiveCustomers(),
        db.pharmacySettings.toCollection().first(),
      ])
      setCustomers(activeCustomers)
      // Auto-select the first customer when there is exactly one active customer
      if (activeCustomers.length === 1 && activeCustomers[0]) {
        setCustomerId(activeCustomers[0].id)
      }
      if (settings) {
        setCurrency(settings.currency)
        setCurrencyMinorUnits(settings.currencyMinorUnits)
      }
    } catch (err) {
      console.error('[NewOrderPage] loadInitialData failed:', err instanceof Error ? err.message : 'unknown')
    } finally {
      setLoadingCustomers(false)
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
          items.filter(
            (item) =>
              item.name.toLowerCase().includes(q) ||
              item.nameLocal?.toLowerCase().includes(q) ||
              item.barcode?.toLowerCase().includes(q),
          ).slice(0, 8),
        )
      } catch (err) {
        console.error('[NewOrderPage] catalog search failed:', err instanceof Error ? err.message : 'unknown')
      }
    }
    run()
  }, [catalogSearch])

  // Add a line from catalog search
  function addLineFromCatalog(item: CatalogItem) {
    const unitPriceMinor = computeUnitPriceMinor('each', item)
    setLines((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        catalogItemId: item.id,
        description: item.name,
        unit: 'each',
        quantity: '1',
        unitPriceDisplay: minorToMajorDisplay(unitPriceMinor, currencyMinorUnits),
        unitPriceMinor,
        packSize: item.packSize,
      },
    ])
    setCatalogSearch('')
    setCatalogResults([])
  }

  // Add a blank manual line (used by tests and the "Add manual line" button)
  function addManualLine() {
    setLines((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        catalogItemId: '',
        description: '',
        unit: 'each',
        quantity: '1',
        unitPriceDisplay: '0',
        unitPriceMinor: 0,
        packSize: 1,
      },
    ])
  }

  function updateLine(id: string, updates: Partial<OrderLineState>) {
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

  // When unit changes, recalculate unitPrice from catalog item's wholesalePrice
  async function handleUnitChange(lineId: string, newUnit: 'each' | 'pack') {
    const line = lines.find((l) => l.id === lineId)
    if (!line) return
    let newUnitPriceMinor = line.unitPriceMinor
    if (line.catalogItemId) {
      try {
        const item = await db.catalogItems.toArray().then((items) => items.find((i) => i.id === line.catalogItemId))
        if (item) {
          newUnitPriceMinor = computeUnitPriceMinor(newUnit, item)
        }
      } catch {
        // ignore — keep existing price
      }
    }
    updateLine(lineId, {
      unit: newUnit,
      unitPriceMinor: newUnitPriceMinor,
      unitPriceDisplay: minorToMajorDisplay(newUnitPriceMinor, currencyMinorUnits),
    })
  }

  // Compute line totals (minor units)
  function lineTotal(line: OrderLineState): number {
    const qty = parseInt(line.quantity || '0', 10) || 0
    return qty * line.unitPriceMinor
  }

  const subtotalMinor = lines.reduce((s, l) => s + lineTotal(l), 0)
  const taxRate = parseFloat(taxRateDisplay || '0') || 0
  const taxAmountMinor = Math.round((subtotalMinor * taxRate) / 100)
  const totalMinor = subtotalMinor + taxAmountMinor

  // Submit: createDraft → confirm → navigate
  async function handleSubmit() {
    if (!customerId) {
      setError(t('newOrderErrorNoCustomer'))
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const practitionerRef = useAuthSessionStore.getState().getPractitionerRef()
      const draftLines = lines.map((l) => ({
        catalogItemId: l.catalogItemId || 'manual',
        description: l.description || t('newOrderManualItem'),
        unit: l.unit,
        quantity: parseInt(l.quantity || '0', 10) || 0,
        unitPrice: l.unitPriceMinor,
        packSize: l.packSize,
      }))
      const order = await createDraft({
        customerId,
        taxRate,
        createdBy: practitionerRef,
        lines: draftLines,
        notes: notes.trim() || undefined,
      })
      await confirm(order.id)
      router.push(`/wholesale/orders/${order.id}`)
    } catch (err) {
      console.error('[NewOrderPage] submit failed:', err instanceof Error ? err.message : 'unknown')
      setError(t('newOrderSubmitError'))
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
        onClick={() => router.push('/wholesale/orders')}
      >
        <ChevronLeft size={16} className="me-1" />
        {t('ordersTitle')}
      </Button>

      {/* Page heading */}
      <h1 className="text-2xl font-semibold text-foreground">{t('newOrderTitle')}</h1>

      {error && (
        <div role="alert" className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Section 1: Customer + order settings                                */}
      {/* ------------------------------------------------------------------ */}
      <div className="rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50">
        <h2 className="mb-4 text-base font-semibold text-foreground">{t('newOrderSectionCustomer')}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="customer-select-input">{t('newOrderCustomerLabel')}</Label>
            <select
              id="customer-select-input"
              data-testid="customer-select"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              disabled={loadingCustomers}
            >
              <option value="">{loadingCustomers ? t('loading') : t('newOrderSelectCustomer')}</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tax-rate">{t('newOrderTaxRateLabel')}</Label>
            <Input
              id="tax-rate"
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={taxRateDisplay}
              onChange={(e) => setTaxRateDisplay(e.target.value)}
              placeholder="0"
            />
          </div>

          <div className="flex flex-col gap-1.5 md:col-span-2">
            <Label htmlFor="order-notes">{t('newOrderNotesLabel')}</Label>
            <textarea
              id="order-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder={t('newOrderNotesPlaceholder')}
              className="rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Section 2: Line items                                               */}
      {/* ------------------------------------------------------------------ */}
      <div className="rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50">
        <h2 className="mb-4 text-base font-semibold text-foreground">{t('newOrderSectionLines')}</h2>

        {/* Catalog search */}
        <div className="relative mb-4">
          <Input
            type="search"
            placeholder={t('newOrderSearchCatalog')}
            value={catalogSearch}
            onChange={(e) => setCatalogSearch(e.target.value)}
            aria-label={t('newOrderSearchCatalog')}
          />
          {catalogResults.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-border bg-card shadow-card">
              {catalogResults.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="w-full px-4 py-2 text-start text-sm text-foreground hover:bg-muted/50"
                    onClick={() => addLineFromCatalog(item)}
                  >
                    <span className="font-medium">{item.name}</span>
                    <span className="ms-2 text-muted-foreground text-xs">{item.strength} {item.form}</span>
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
          {t('newOrderAddManualLine')}
        </Button>

        {/* Lines table */}
        {lines.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-3 py-2 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {t('newOrderColDescription')}
                  </th>
                  <th className="px-3 py-2 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {t('newOrderColUnit')}
                  </th>
                  <th className="px-3 py-2 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {t('newOrderColQty')}
                  </th>
                  <th className="px-3 py-2 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {t('newOrderColUnitPrice')}
                  </th>
                  <th className="px-3 py-2 text-end font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {t('newOrderColLineTotal')}
                  </th>
                  <th className="px-3 py-2" aria-label="actions" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lines.map((line) => (
                  <tr key={line.id} className="hover:bg-muted/50">
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={line.description}
                        onChange={(e) => updateLine(line.id, { description: e.target.value })}
                        placeholder={t('newOrderDescriptionPlaceholder')}
                        className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={line.unit}
                        onChange={(e) => handleUnitChange(line.id, e.target.value as 'each' | 'pack')}
                        className="rounded-md border border-border bg-background text-foreground px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <option value="each">{t('newOrderUnitEach')}</option>
                        <option value="pack">{t('newOrderUnitPack')}</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="1"
                        value={line.quantity}
                        onChange={(e) => updateLine(line.id, { quantity: e.target.value })}
                        className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground tabular-nums focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                    </td>
                    <td className="px-3 py-2">
                      {/* User types in major units; stored as minor units */}
                      <input
                        type="number"
                        min="0"
                        step={Math.pow(10, -currencyMinorUnits).toFixed(currencyMinorUnits)}
                        value={line.unitPriceDisplay}
                        onChange={(e) => {
                          const minorVal = parseMajorToMinor(e.target.value, currencyMinorUnits)
                          updateLine(line.id, {
                            unitPriceDisplay: e.target.value,
                            unitPriceMinor: minorVal,
                          })
                        }}
                        className="w-28 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground tabular-nums focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                    </td>
                    <td className="px-3 py-2 text-end tabular-nums text-muted-foreground">
                      {formatAmount(lineTotal(line), currency, currencyMinorUnits)}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => removeLine(line.id)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={t('newOrderRemoveLine')}
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

        {lines.length === 0 && (
          <p className="py-4 text-sm text-muted-foreground text-center">{t('newOrderNoLines')}</p>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Section 3: Running totals summary                                   */}
      {/* ------------------------------------------------------------------ */}
      <div className="rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50">
        <h2 className="mb-4 text-base font-semibold text-foreground">{t('newOrderSectionTotals')}</h2>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>{t('newOrderSubtotal')}</span>
            <span className="tabular-nums">{formatAmount(subtotalMinor, currency, currencyMinorUnits)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>{t('newOrderTax', { rate: taxRate.toFixed(1) })}</span>
            <span className="tabular-nums">{formatAmount(taxAmountMinor, currency, currencyMinorUnits)}</span>
          </div>
          <div className="flex justify-between font-semibold text-foreground border-t border-border pt-1">
            <span>{t('newOrderTotal')}</span>
            <span className="tabular-nums">{formatAmount(totalMinor, currency, currencyMinorUnits)}</span>
          </div>
        </div>
      </div>

      {/* Submit */}
      <div className="flex justify-end">
        <Button
          type="button"
          data-testid="submit-order"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? t('newOrderSubmitting') : t('newOrderSubmit')}
        </Button>
      </div>
    </div>
  )
}
