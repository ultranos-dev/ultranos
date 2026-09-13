'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Button } from '@ultranos/ui-kit/components/ui/button'
import { Input } from '@ultranos/ui-kit/components/ui/input'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { Package } from '@ultranos/ui-kit/icons'
import { getReorderReport, generateReorderPurchaseOrders } from '@/lib/procurement/reorder-service'
import type { ReorderLine } from '@/lib/procurement/reorder-service'
import { getActiveSuppliers } from '@/lib/procurement/supplier-service'
import type { Supplier } from '@/lib/procurement/types'
import { useAuthSessionStore } from '@/stores/auth-session-store'

interface RowState {
  selected: boolean
  qty: number
  supplierId: string
  unitCostMajor: string
}

function computeLineTotal(qty: number, unitCostMajor: string, minorUnits: number): string {
  const cost = parseFloat(unitCostMajor)
  if (isNaN(cost) || isNaN(qty)) return '—'
  return (qty * cost).toFixed(minorUnits)
}

export function ReorderReportPage() {
  const t = useTranslations('reorder')
  const router = useRouter()
  const session = useAuthSessionStore((s) => s.session)

  const [lines, setLines] = useState<ReorderLine[]>([])
  const [loading, setLoading] = useState(true)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [minorUnits, setMinorUnits] = useState(2)
  const [rowStates, setRowStates] = useState<Map<string, RowState>>(new Map())

  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [generatedCount, setGeneratedCount] = useState<number | null>(null)

  const loadReport = useCallback(async (mu: number) => {
    setLoading(true)
    setGeneratedCount(null)
    setGenerateError(null)
    try {
      const [reportLines, activeSuppliers] = await Promise.all([
        getReorderReport(),
        getActiveSuppliers(),
      ])
      setSuppliers(activeSuppliers)
      setLines(reportLines)
      const states = new Map<string, RowState>()
      for (const line of reportLines) {
        states.set(line.catalogItemId, {
          selected: !!line.preferredSupplierId,
          qty: line.suggestedQty,
          supplierId: line.preferredSupplierId ?? '',
          unitCostMajor: (line.unitCost / Math.pow(10, mu)).toFixed(mu),
        })
      }
      setRowStates(states)
    } catch {
      // load failed — keep empty state
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    async function init() {
      let mu = 2
      try {
        const { db } = await import('@/lib/db')
        const settings = await db.pharmacySettings?.toCollection?.()?.first?.()
        if (settings && typeof settings.currencyMinorUnits === 'number') {
          mu = settings.currencyMinorUnits
          setMinorUnits(mu)
        }
      } catch {
        // keep default minor units
      }
      await loadReport(mu)
    }
    init()
  }, [loadReport])

  function updateRow(catalogItemId: string, patch: Partial<RowState>) {
    setRowStates((prev) => {
      const next = new Map(prev)
      const existing = next.get(catalogItemId)
      if (existing) next.set(catalogItemId, { ...existing, ...patch })
      return next
    })
  }

  const includableLines = lines.filter((line) => {
    const state = rowStates.get(line.catalogItemId)
    if (!state) return false
    return state.selected && state.supplierId && state.qty > 0
  })

  async function handleGenerate() {
    if (includableLines.length === 0) return
    setGenerating(true)
    setGenerateError(null)
    try {
      const performedBy = session?.practitionerId ?? session?.userId ?? 'unknown'
      const payload = includableLines.map((line) => {
        const state = rowStates.get(line.catalogItemId)!
        return {
          catalogItemId: line.catalogItemId,
          catalogItemName: line.catalogItemName,
          quantity: state.qty,
          unitCost: Math.round(parseFloat(state.unitCostMajor) * Math.pow(10, minorUnits)),
          supplierId: state.supplierId,
        }
      })
      const pos = await generateReorderPurchaseOrders(payload, performedBy)
      setGeneratedCount(pos.length)
      await loadReport(minorUnits)
    } catch {
      setGenerateError(t('generateError'))
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">{t('title')}</h1>

      {/* Success notice */}
      {generatedCount !== null && (
        <div className="flex items-center gap-3 rounded-xl bg-card px-4 py-3 ring-[0.65px] ring-border/50 shadow-card text-sm text-foreground">
          <span>{t('generatedSummary', { count: generatedCount })}</span>
          <Button
            variant="link"
            className="h-auto p-0 text-sm"
            onClick={() => router.push('/inventory/orders')}
          >
            {t('viewOrders')}
          </Button>
        </div>
      )}

      {/* Error notice */}
      {generateError && (
        <div className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive ring-[0.65px] ring-destructive/30">
          {generateError}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          data-testid="generate-pos-btn"
          disabled={generating || includableLines.length === 0}
          onClick={handleGenerate}
        >
          {generating ? t('generating') : t('generate')}
        </Button>
      </div>

      {/* Content box */}
      <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
        {loading ? (
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState icon={Package} title={t('loading')} />
          </div>
        ) : lines.length === 0 ? (
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState
              icon={Package}
              title={t('empty')}
              description={t('emptyDescription')}
            />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide w-10">
                  <span className="sr-only">Select</span>
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('colItem')}
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('colOnHand')}
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('colReorderPoint')}
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('colQty')}
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('colSupplier')}
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('colUnitCost')}
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('colLineTotal')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lines.map((line) => {
                const state = rowStates.get(line.catalogItemId)
                if (!state) return null
                const hasEffectiveSupplier = !!state.supplierId
                const lineTotal = computeLineTotal(state.qty, state.unitCostMajor, minorUnits)

                return (
                  <tr key={line.catalogItemId} className="hover:bg-muted/50">
                    <td className="px-4 py-3">
                      {hasEffectiveSupplier ? (
                        <input
                          type="checkbox"
                          checked={state.selected}
                          onChange={(e) =>
                            updateRow(line.catalogItemId, { selected: e.target.checked })
                          }
                          className="h-4 w-4 cursor-pointer accent-primary"
                        />
                      ) : (
                        <span
                          className="block text-xs text-muted-foreground"
                          title={t('noSupplierHint')}
                        >
                          —
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {line.catalogItemName}
                      {!hasEffectiveSupplier && (
                        <span className="ms-2 text-xs text-muted-foreground">
                          {t('noSupplierHint')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-numeric tabular-nums text-foreground">
                      {line.onHand}
                    </td>
                    <td className="px-4 py-3 font-numeric tabular-nums text-foreground">
                      {line.reorderPoint}
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        type="number"
                        min={1}
                        value={state.qty}
                        onChange={(e) =>
                          updateRow(line.catalogItemId, {
                            qty: Math.max(0, parseInt(e.target.value, 10) || 0),
                          })
                        }
                        className="w-24 font-numeric"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={state.supplierId}
                        onChange={(e) => {
                          const newSupplierId = e.target.value
                          updateRow(line.catalogItemId, {
                            supplierId: newSupplierId,
                            selected: !!newSupplierId,
                          })
                        }}
                        className="rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm"
                      >
                        <option value="">{t('supplierPlaceholder')}</option>
                        {suppliers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        type="number"
                        min={0}
                        step={Math.pow(10, -minorUnits)}
                        value={state.unitCostMajor}
                        onChange={(e) =>
                          updateRow(line.catalogItemId, { unitCostMajor: e.target.value })
                        }
                        className="w-28 font-numeric"
                      />
                    </td>
                    <td className="px-4 py-3 font-numeric tabular-nums text-foreground">
                      {lineTotal}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
