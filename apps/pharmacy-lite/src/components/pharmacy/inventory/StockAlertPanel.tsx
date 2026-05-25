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
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-start transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          <span className="block text-2xl font-bold text-amber-700">{alerts.lowStockCount}</span>
          <span className="text-sm text-amber-600">Low Stock</span>
        </button>
      )}

      {alerts.nearExpiryCount > 0 && (
        <button
          type="button"
          onClick={onFilterNearExpiry}
          className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-start transition-colors hover:bg-orange-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
        >
          <span className="block text-2xl font-bold text-orange-700">
            {alerts.nearExpiryCount}
          </span>
          <span className="text-sm text-orange-600">Near Expiry</span>
        </button>
      )}

      {alerts.quarantinedCount > 0 && (
        <button
          type="button"
          onClick={onFilterQuarantined}
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-start transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
        >
          <span className="block text-2xl font-bold text-red-700">
            {alerts.quarantinedCount}
          </span>
          <span className="text-sm text-red-600">Quarantined</span>
        </button>
      )}
    </div>
  )
}
