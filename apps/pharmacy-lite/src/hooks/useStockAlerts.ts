import { useEffect, useCallback } from 'react'
import { getStockAlerts } from '@/lib/inventory/stock-service'
import { useInventoryStore } from '@/stores/inventory-store'

const REFRESH_INTERVAL_MS = 60_000

export function useStockAlerts(expiryAlertDays = 90) {
  const setAlerts = useInventoryStore((s) => s.setAlerts)

  const refresh = useCallback(async () => {
    try {
      const alerts = await getStockAlerts(expiryAlertDays)
      setAlerts(alerts)
    } catch {
      // Non-critical
    }
  }, [expiryAlertDays, setAlerts])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [refresh])
}
