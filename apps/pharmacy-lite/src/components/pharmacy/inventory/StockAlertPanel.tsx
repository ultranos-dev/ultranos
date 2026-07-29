'use client'

import { useTranslations } from 'next-intl'
import { useInventoryStore } from '@/stores/inventory-store'

interface StockAlertPanelProps {
  onFilterLowStock: () => void
  onFilterNearExpiry: () => void
  onFilterQuarantined: () => void
}

export function StockAlertPanel({
  onFilterLowStock,
  onFilterNearExpiry,
  onFilterQuarantined,
}: StockAlertPanelProps) {
  const t = useTranslations('inventory')
  const alerts = useInventoryStore((s) => s.alerts)

  const hasAlerts =
    alerts.lowStockCount > 0 || alerts.nearExpiryCount > 0 || alerts.quarantinedCount > 0

  if (!hasAlerts) return null

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {alerts.lowStockCount > 0 && (
        <button
          type="button"
          onClick={onFilterLowStock}
          className="flex flex-col rounded-xl bg-card p-5 text-start shadow-card ring-2 ring-warning/50 transition-colors hover:bg-warning/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning"
        >
          <span className="text-sm font-medium text-muted-foreground">{t('lowStock')}</span>
          <span className="mt-2 text-3xl font-semibold tracking-tight text-warning">
            {alerts.lowStockCount}
          </span>
        </button>
      )}

      {alerts.nearExpiryCount > 0 && (
        <button
          type="button"
          onClick={onFilterNearExpiry}
          className="flex flex-col rounded-xl bg-card p-5 text-start shadow-card ring-2 ring-warning/50 transition-colors hover:bg-warning/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning"
        >
          <span className="text-sm font-medium text-muted-foreground">{t('nearExpiry')}</span>
          <span className="mt-2 text-3xl font-semibold tracking-tight text-warning">
            {alerts.nearExpiryCount}
          </span>
        </button>
      )}

      {alerts.quarantinedCount > 0 && (
        <button
          type="button"
          onClick={onFilterQuarantined}
          className="flex flex-col rounded-xl bg-card p-5 text-start shadow-card ring-2 ring-destructive/50 transition-colors hover:bg-destructive/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
        >
          <span className="text-sm font-medium text-muted-foreground">{t('quarantined')}</span>
          <span className="mt-2 text-3xl font-semibold tracking-tight text-destructive">
            {alerts.quarantinedCount}
          </span>
        </button>
      )}
    </div>
  )
}
