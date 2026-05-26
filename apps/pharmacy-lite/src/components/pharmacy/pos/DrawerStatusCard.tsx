'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
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
      className="block rounded-xl bg-white/70 backdrop-blur-md p-5 shadow-sm ring-[0.65px] ring-gray-400/40 transition-colors hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
    >
      <h3 className="text-sm font-black text-neutral-500 uppercase tracking-wide">Cash Drawer</h3>
      <p className="mt-2 text-3xl font-black tabular-nums text-neutral-900">{fmt(revenue)}</p>
      {drawer ? (
        <span className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-green-700">
          <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
          Open since {new Date(drawer.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      ) : (
        <p className="mt-1 text-xs text-neutral-500">No drawer open</p>
      )}
    </Link>
  )
}
