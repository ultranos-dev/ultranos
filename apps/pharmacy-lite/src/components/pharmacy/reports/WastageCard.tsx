'use client'

import { useEffect, useState } from 'react'
import { getWastageMetrics, type WastageMetrics } from '@/lib/reports/wastage-report'

export function WastageCard() {
  const [data, setData] = useState<WastageMetrics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void getWastageMetrics(30)
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">Loading wastage metrics...</p>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-4 text-sm font-medium text-foreground">
        Wastage (30 days)
      </h3>
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-2xl font-bold tabular-nums text-destructive">
            {data.quarantinedBatches}
          </p>
          <p className="text-xs text-muted-foreground">Quarantined</p>
        </div>
        <div>
          <p className="text-2xl font-bold tabular-nums text-foreground">
            {data.disposedInPeriod}
          </p>
          <p className="text-xs text-muted-foreground">Disposed</p>
        </div>
        <div>
          <p className="text-2xl font-bold tabular-nums text-foreground">
            {data.wastageRate}%
          </p>
          <p className="text-xs text-muted-foreground">Waste Rate</p>
        </div>
      </div>
    </div>
  )
}
