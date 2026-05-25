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
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <p className="text-sm text-neutral-500">Loading wastage metrics...</p>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <h3 className="mb-4 text-sm font-medium text-neutral-700">
        Wastage (30 days)
      </h3>
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-2xl font-bold tabular-nums text-red-600">
            {data.quarantinedBatches}
          </p>
          <p className="text-xs text-neutral-500">Quarantined</p>
        </div>
        <div>
          <p className="text-2xl font-bold tabular-nums text-neutral-800">
            {data.disposedInPeriod}
          </p>
          <p className="text-xs text-neutral-500">Disposed</p>
        </div>
        <div>
          <p className="text-2xl font-bold tabular-nums text-neutral-800">
            {data.wastageRate}%
          </p>
          <p className="text-xs text-neutral-500">Waste Rate</p>
        </div>
      </div>
    </div>
  )
}
