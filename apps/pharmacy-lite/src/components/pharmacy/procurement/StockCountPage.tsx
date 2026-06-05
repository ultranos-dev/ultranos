'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { StockCountForm } from './StockCountForm'
import {
  startStockCount,
  getActiveStockCount,
  getRecentStockCounts,
} from '@/lib/procurement/stock-count-service'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import type { StockCount, StockCountType } from '@/lib/procurement/types'

export function StockCountPage() {
  const [activeCount, setActiveCount] = useState<StockCount | null>(null)
  const [recentCounts, setRecentCounts] = useState<StockCount[]>([])
  const [loading, setLoading] = useState(true)
  const session = useAuthSessionStore((s) => s.session)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [active, recent] = await Promise.all([
        getActiveStockCount(),
        getRecentStockCounts(),
      ])
      setActiveCount(active)
      setRecentCounts(recent)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleStart(type: StockCountType) {
    if (!session) return
    const count = await startStockCount({ type, countedBy: session.practitionerId })
    setActiveCount(count)
  }

  function handleCompleted() {
    setActiveCount(null)
    load()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (activeCount) {
    return <StockCountForm count={activeCount} onCompleted={handleCompleted} />
  }

  const typeLabels: Record<string, string> = {
    full: 'Full Count',
    spot: 'Spot Check',
    controlled_only: 'Controlled Only',
  }

  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Stock Count</h1>
        <p className="mt-1 text-sm text-muted-foreground">Start a new physical inventory count</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Button
          variant="default"
          className="w-full py-6 text-base"
          onClick={() => handleStart('full')}
        >
          Full Count
        </Button>
        <Button
          variant="secondary"
          className="w-full py-6 text-base"
          onClick={() => handleStart('spot')}
        >
          Spot Check
        </Button>
        <Button
          variant="destructive"
          className="w-full py-6 text-base"
          onClick={() => handleStart('controlled_only')}
        >
          Controlled Only
        </Button>
      </div>

      {recentCounts.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Recent Counts</h2>
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted">
                <tr>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground">Type</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground">Completed</th>
                  <th className="px-4 py-3 text-end font-medium text-muted-foreground">Items</th>
                  <th className="px-4 py-3 text-end font-medium text-muted-foreground">Variances</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentCounts.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {typeLabels[c.type]}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.completedAt ? new Date(c.completedAt).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-4 py-3 text-end text-muted-foreground">{c.items.length}</td>
                    <td className="px-4 py-3 text-end">
                      <span
                        className={
                          c.totalVarianceItems > 0 ? 'font-medium text-warning' : 'text-muted-foreground'
                        }
                      >
                        {c.totalVarianceItems}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
