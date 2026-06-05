'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useInventoryStore } from '@/stores/inventory-store'
import { useStockAlerts } from '@/hooks/useStockAlerts'

export function InventoryAlertCard() {
  const t = useTranslations('inventory')
  useStockAlerts(90)
  const alerts = useInventoryStore((s) => s.alerts)
  const total = alerts.lowStockCount + alerts.nearExpiryCount + alerts.quarantinedCount

  if (total === 0) {
    return (
      <div className="rounded-lg border border-success/20 bg-success/5 p-4" data-testid="inventory-alert-card">
        <p className="text-sm font-medium text-success">{t('inventoryHealthy')}</p>
      </div>
    )
  }

  return (
    <Link href="/inventory" data-testid="inventory-alert-card">
      <div className="rounded-lg border border-warning/20 bg-warning/5 p-4 transition-colors hover:bg-warning/10">
        <h3 className="text-xs font-semibold text-warning uppercase tracking-wide mb-2">{t('inventoryAlerts')}</h3>
        <div className="grid grid-cols-3 gap-3 text-center">
          {alerts.lowStockCount > 0 && (
            <div>
              <p className="text-lg font-bold tabular-nums text-warning">{alerts.lowStockCount}</p>
              <p className="text-[10px] text-warning">{t('lowStock')}</p>
            </div>
          )}
          {alerts.nearExpiryCount > 0 && (
            <div>
              <p className="text-lg font-bold tabular-nums text-warning">{alerts.nearExpiryCount}</p>
              <p className="text-[10px] text-warning">{t('nearExpiry')}</p>
            </div>
          )}
          {alerts.quarantinedCount > 0 && (
            <div>
              <p className="text-lg font-bold tabular-nums text-destructive">{alerts.quarantinedCount}</p>
              <p className="text-[10px] text-destructive">{t('quarantined')}</p>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}
