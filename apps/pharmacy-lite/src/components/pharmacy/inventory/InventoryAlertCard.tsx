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
      <div
        className="flex flex-col rounded-xl bg-card p-5 text-start shadow-card ring-[0.65px] ring-border/50"
        data-testid="inventory-alert-card"
      >
        <p className="text-sm font-medium text-muted-foreground">{t('inventoryAlerts')}</p>
        <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground tabular-nums">0</p>
        <p className="mt-1 text-sm font-medium text-muted-foreground">{t('inventoryHealthy')}</p>
      </div>
    )
  }

  return (
    <Link href="/inventory" data-testid="inventory-alert-card">
      <div className="flex flex-col rounded-xl bg-card p-5 text-start shadow-card ring-2 ring-warning/50 transition-colors hover:bg-muted/40">
        <p className="text-sm font-medium text-muted-foreground">{t('inventoryAlerts')}</p>
        <p className="mt-2 text-3xl font-semibold tracking-tight text-warning tabular-nums">{total}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 text-sm font-medium">
          {alerts.lowStockCount > 0 && (
            <span className="text-warning tabular-nums">
              {alerts.lowStockCount} <span className="text-muted-foreground">{t('lowStock')}</span>
            </span>
          )}
          {alerts.nearExpiryCount > 0 && (
            <span className="text-warning tabular-nums">
              {alerts.nearExpiryCount} <span className="text-muted-foreground">{t('nearExpiry')}</span>
            </span>
          )}
          {alerts.quarantinedCount > 0 && (
            <span className="text-destructive tabular-nums">
              {alerts.quarantinedCount} <span className="text-muted-foreground">{t('quarantined')}</span>
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
