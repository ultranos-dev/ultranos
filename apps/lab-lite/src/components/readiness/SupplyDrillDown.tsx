'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { DirectionalIcon } from '@ultranos/ui-kit'
import { ArrowLeft, Check, X } from '@ultranos/ui-kit/icons'
import { Button } from '@/components/ui/Button'
import type { SupplyDetail, RAGStatus } from '@/lib/rag-service'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SupplyDrillDownProps {
  details: SupplyDetail[]
  onBack: () => void
  onUpdateStock: (id: string, newStock: number) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RAG_ORDER: Record<RAGStatus, number> = { RED: 0, AMBER: 1, GREEN: 2 }

const STOCK_BADGE: Record<RAGStatus, string> = {
  RED: 'bg-destructive/10 text-destructive border border-destructive/30',
  AMBER: 'bg-warning/10 text-warning border border-warning/30',
  GREEN: 'bg-success/10 text-success border border-success/30',
}

const STOCK_DOT: Record<RAGStatus, string> = {
  RED: 'bg-destructive',
  AMBER: 'bg-warning',
  GREEN: 'bg-success',
}

function daysColor(days: number): string {
  if (days <= 1) return 'text-destructive font-semibold'
  if (days <= 3) return 'text-warning font-medium'
  return 'text-muted-foreground'
}

// ---------------------------------------------------------------------------
// Inline stock editor
// ---------------------------------------------------------------------------

function StockEditor({
  supplyId,
  currentStock,
  onConfirm,
  onCancel,
}: {
  supplyId: string
  currentStock: number
  onConfirm: (id: string, newStock: number) => void
  onCancel: () => void
}) {
  const t = useTranslations()
  const [value, setValue] = useState<string>(String(currentStock))

  function handleConfirm() {
    const parsed = parseFloat(value)
    if (!isNaN(parsed) && parsed >= 0) {
      onConfirm(supplyId, parsed)
    }
  }

  return (
    <div className="flex items-center gap-2 mt-2">
      <input
        type="number"
        min="0"
        step="any"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-24 rounded-md border border-border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        aria-label={t('rag.drillDown.newStockValue')}
      />
      <button
        type="button"
        onClick={handleConfirm}
        className="inline-flex items-center gap-1 rounded-md bg-success px-2.5 py-1 text-xs font-medium text-white hover:bg-success focus:outline-none focus:ring-2 focus:ring-success"
        aria-label={t('rag.drillDown.confirmStock')}
      >
        <Check size={13} aria-hidden="true" />
        {t('rag.drillDown.confirm')}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex items-center rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground hover:bg-muted/30 focus:outline-none focus:ring-2 focus:ring-border"
        aria-label={t('rag.drillDown.cancelEdit')}
      >
        <X size={13} aria-hidden="true" />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Single supply row
// ---------------------------------------------------------------------------

function SupplyRow({
  supply,
  onUpdateStock,
}: {
  supply: SupplyDetail
  onUpdateStock: (id: string, newStock: number) => void
}) {
  const t = useTranslations()
  const [editing, setEditing] = useState(false)

  function handleConfirm(id: string, newStock: number) {
    onUpdateStock(id, newStock)
    setEditing(false)
  }

  return (
    <li className="px-4 py-3 bg-card">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground">{supply.name}</span>
            <span className="text-xs text-muted-foreground">{supply.category}</span>
          </div>

          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {/* Stock badge */}
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${STOCK_BADGE[supply.ragStatus]}`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${STOCK_DOT[supply.ragStatus]}`}
                aria-hidden="true"
              />
              {supply.currentStock} {supply.unit}
            </span>

            {/* Days remaining */}
            {supply.estimatedDaysRemaining !== null && (
              <span className={`text-xs ${daysColor(supply.estimatedDaysRemaining)}`}>
                {t('rag.drillDown.daysRemaining', { days: supply.estimatedDaysRemaining })}
              </span>
            )}
          </div>

          {/* Inline editor */}
          {editing ? (
            <StockEditor
              supplyId={supply.id}
              currentStock={supply.currentStock}
              onConfirm={handleConfirm}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="mt-2 text-xs text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-primary rounded"
            >
              {t('rag.drillDown.updateStock')}
            </button>
          )}
        </div>
      </div>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SupplyDrillDown({ details, onBack, onUpdateStock }: SupplyDrillDownProps) {
  const t = useTranslations()

  const sorted = [...details].sort(
    (a, b) => RAG_ORDER[a.ragStatus] - RAG_ORDER[b.ragStatus],
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          className="!p-1.5 shrink-0"
          onClick={onBack}
          aria-label={t('rag.drillDown.back')}
        >
          <DirectionalIcon category="navigation">
            <ArrowLeft size={18} aria-hidden="true" />
          </DirectionalIcon>
        </Button>
        <h2 className="text-base font-semibold text-foreground">
          {t('rag.drillDown.suppliesTitle')}
        </h2>
      </div>

      {/* List */}
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          {t('rag.drillDown.noSupplies')}
        </p>
      ) : (
        <ul className="divide-y divide-border/50 rounded-lg border border-border overflow-hidden">
          {sorted.map((supply) => (
            <SupplyRow key={supply.id} supply={supply} onUpdateStock={onUpdateStock} />
          ))}
        </ul>
      )}
    </div>
  )
}
