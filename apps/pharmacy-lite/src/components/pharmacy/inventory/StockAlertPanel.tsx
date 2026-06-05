'use client'

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
          className="rounded-lg border border-warning/20 bg-warning/5 px-4 py-3 text-start transition-colors hover:bg-warning/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning"
        >
          <span className="block text-2xl font-bold text-warning">{alerts.lowStockCount}</span>
          <span className="text-sm text-warning">Low Stock</span>
        </button>
      )}

      {alerts.nearExpiryCount > 0 && (
        <button
          type="button"
          onClick={onFilterNearExpiry}
          className="rounded-lg border border-warning/20 bg-warning/5 px-4 py-3 text-start transition-colors hover:bg-warning/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning"
        >
          <span className="block text-2xl font-bold text-warning">
            {alerts.nearExpiryCount}
          </span>
          <span className="text-sm text-warning">Near Expiry</span>
        </button>
      )}

      {alerts.quarantinedCount > 0 && (
        <button
          type="button"
          onClick={onFilterQuarantined}
          className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-start transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
        >
          <span className="block text-2xl font-bold text-destructive">
            {alerts.quarantinedCount}
          </span>
          <span className="text-sm text-destructive">Quarantined</span>
        </button>
      )}
    </div>
  )
}
