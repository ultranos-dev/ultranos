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
      <Link href="/inventory" data-testid="inventory-alert-card">
        <div className="rounded-xl bg-white/70 backdrop-blur-md p-5 shadow-sm ring-[0.65px] ring-gray-400/40">
          <h3 className="text-sm font-black text-neutral-500 uppercase tracking-wide">Inventory</h3>
          <p className="mt-2 text-sm font-semibold text-green-700">All healthy</p>
        </div>
      </Link>
    )
  }

  return (
    <Link href="/inventory" data-testid="inventory-alert-card">
      <div className="rounded-xl bg-white/70 backdrop-blur-md p-5 shadow-sm ring-[0.65px] ring-gray-400/40 transition-colors hover:bg-white/90">
        <h3 className="text-sm font-black text-neutral-500 uppercase tracking-wide">Inventory</h3>
        <p className="mt-2 text-3xl font-black text-amber-600 tabular-nums">{total}</p>
        <div className="mt-2 flex items-center gap-3 text-xs">
          {alerts.lowStockCount > 0 && (
            <span className="font-semibold text-amber-700">{alerts.lowStockCount} low</span>
          )}
          {alerts.nearExpiryCount > 0 && (
            <span className="font-semibold text-orange-700">{alerts.nearExpiryCount} expiring</span>
          )}
          {alerts.quarantinedCount > 0 && (
            <span className="font-semibold text-red-700">{alerts.quarantinedCount} quarantined</span>
          )}
        </div>
      </div>
    </Link>
  )
}
