'use client'

import Link from 'next/link'
import { useInventoryStore } from '@/stores/inventory-store'
import { useStockAlerts } from '@/hooks/useStockAlerts'

export function InventoryAlertCard() {
  useStockAlerts(90)
  const alerts = useInventoryStore((s) => s.alerts)
  const total = alerts.lowStockCount + alerts.nearExpiryCount + alerts.quarantinedCount

  if (total === 0) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50/50 p-4" data-testid="inventory-alert-card">
        <p className="text-sm font-medium text-green-800">Inventory healthy — no alerts</p>
      </div>
    )
  }

  return (
    <Link href="/inventory" data-testid="inventory-alert-card">
      <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4 transition-colors hover:bg-amber-50">
        <h3 className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-2">Inventory Alerts</h3>
        <div className="grid grid-cols-3 gap-3 text-center">
          {alerts.lowStockCount > 0 && (
            <div>
              <p className="text-lg font-bold tabular-nums text-amber-700">{alerts.lowStockCount}</p>
              <p className="text-[10px] text-amber-600">Low Stock</p>
            </div>
          )}
          {alerts.nearExpiryCount > 0 && (
            <div>
              <p className="text-lg font-bold tabular-nums text-orange-700">{alerts.nearExpiryCount}</p>
              <p className="text-[10px] text-orange-600">Near Expiry</p>
            </div>
          )}
          {alerts.quarantinedCount > 0 && (
            <div>
              <p className="text-lg font-bold tabular-nums text-red-700">{alerts.quarantinedCount}</p>
              <p className="text-[10px] text-red-600">Quarantined</p>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}
