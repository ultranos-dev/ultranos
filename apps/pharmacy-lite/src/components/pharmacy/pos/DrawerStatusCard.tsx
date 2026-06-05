'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { getOpenCashDrawer } from '@/lib/pos/cash-drawer-service'
import { getTodayRevenue } from '@/lib/pos/invoice-service'
import type { CashDrawer } from '@/lib/pos/types'

const CURRENCY = 'AFN'
const MINOR_UNITS = 2

function fmt(amount: number): string {
  const divisor = Math.pow(10, MINOR_UNITS)
  return `${CURRENCY} ${(amount / divisor).toFixed(MINOR_UNITS)}`
}

export function DrawerStatusCard() {
  const t = useTranslations('pos')
  const [drawer, setDrawer] = useState<CashDrawer | null>(null)
  const [revenue, setRevenue] = useState<number>(0)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    async function load() {
      const [d, r] = await Promise.all([getOpenCashDrawer(), getTodayRevenue()])
      setDrawer(d)
      setRevenue(r)
      setLoaded(true)
    }
    load()
  }, [])

  if (!loaded) return null

  return (
    <Link
      href="/pos/cash-drawer"
      className="block rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">{t('cashDrawer')}</p>
          {drawer ? (
            <p className="text-xs text-success">
              Open since {new Date(drawer.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">{t('noDrawerOpen')}</p>
          )}
        </div>
        <div className="text-end">
          <p className="text-xs text-muted-foreground">{t('todaysRevenue')}</p>
          <p className="text-sm font-semibold tabular-nums text-foreground">{fmt(revenue)}</p>
        </div>
      </div>
    </Link>
  )
}
