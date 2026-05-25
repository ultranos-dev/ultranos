'use client'

import { useEffect, useState } from 'react'
import {
  getControlledDiscrepancies,
  type ControlledDiscrepancy,
} from '@/lib/reports/controlled-discrepancy'

export function ControlledDiscrepancyCard() {
  const [discrepancies, setDiscrepancies] = useState<ControlledDiscrepancy[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void getControlledDiscrepancies(10)
      .then(setDiscrepancies)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <p className="text-sm text-neutral-500">
          Loading controlled substance discrepancies...
        </p>
      </div>
    )
  }

  if (discrepancies.length === 0) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4">
        <h3 className="mb-1 text-sm font-medium text-green-800">
          Controlled Substance Discrepancies
        </h3>
        <p className="text-sm text-green-700">No discrepancies found.</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4">
      <h3 className="mb-3 text-sm font-medium text-red-800">
        Controlled Substance Discrepancies
      </h3>
      <div className="space-y-2">
        {discrepancies.map((d) => (
          <div
            key={`${d.countId}-${d.catalogItemName}`}
            className="flex flex-wrap items-center gap-2 rounded border border-red-100 bg-white px-3 py-2 text-xs"
          >
            <span className="font-medium text-neutral-800">
              {d.catalogItemName}
            </span>
            {d.schedule && (
              <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-600">
                {d.schedule}
              </span>
            )}
            <span
              className={`font-semibold tabular-nums ${d.variance < 0 ? 'text-red-600' : d.variance > 0 ? 'text-amber-600' : 'text-neutral-600'}`}
            >
              {d.variance > 0 ? '+' : ''}
              {d.variance}
            </span>
            <span className="ms-auto text-neutral-400 tabular-nums">
              {new Date(d.countDate).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
