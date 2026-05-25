'use client'

import { useEffect, useState } from 'react'
import { getFinancialSummary, type FinancialSummary } from '@/lib/reports/financial-report'

function formatAmount(minorUnits: number): string {
  return (minorUnits / 100).toFixed(2)
}

export function FinancialSummaryCard() {
  const [data, setData] = useState<FinancialSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void getFinancialSummary()
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <p className="text-sm text-neutral-500">Loading financial summary...</p>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <h3 className="mb-4 text-sm font-medium text-neutral-700">
        Revenue Summary
      </h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-neutral-500">Today</p>
          <p className="text-lg font-semibold tabular-nums text-neutral-900">
            {formatAmount(data.todayRevenue)}
          </p>
        </div>
        <div>
          <p className="text-xs text-neutral-500">This Week</p>
          <p className="text-lg font-semibold tabular-nums text-neutral-900">
            {formatAmount(data.weekRevenue)}
          </p>
        </div>
        <div>
          <p className="text-xs text-neutral-500">This Month</p>
          <p className="text-lg font-semibold tabular-nums text-neutral-900">
            {formatAmount(data.monthRevenue)}
          </p>
        </div>
        <div>
          <p className="text-xs text-amber-600">Outstanding</p>
          <p className="text-lg font-semibold tabular-nums text-amber-700">
            {formatAmount(data.totalOutstanding)}
          </p>
        </div>
      </div>
    </div>
  )
}
