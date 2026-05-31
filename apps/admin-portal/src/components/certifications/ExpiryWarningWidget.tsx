'use client'

import { useEffect, useState } from 'react'
import { trpc } from '@/lib/trpc'

interface ExpiryBuckets {
  within90: number
  within60: number
  within30: number
}

export function ExpiryWarningWidget() {
  const [buckets, setBuckets] = useState<ExpiryBuckets | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    trpc.admin.getExpiringCredentials.query({ daysAhead: 90 })
      .then((result) => setBuckets(result.buckets))
      .catch(() => {
        setError(true)
      })
  }, [])

  if (error) {
    return (
      <div className="rounded-2xl border border-warning bg-warning-subtle p-3 text-sm text-warning">
        Unable to load credential expiry data.
      </div>
    )
  }

  if (!buckets || (buckets.within90 === 0)) return null

  return (
    <div className="flex gap-4">
      {buckets.within30 > 0 && (
        <div className="flex-1 rounded-2xl border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800 p-4">
          <p className="text-xs font-medium text-red-600 dark:text-red-400 uppercase tracking-wide">Expiring in 30 days</p>
          <p className="mt-1 text-2xl font-bold text-red-700 dark:text-red-300">{buckets.within30}</p>
        </div>
      )}
      {buckets.within60 > buckets.within30 && (
        <div className="flex-1 rounded-2xl border border-orange-300 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-800 p-4">
          <p className="text-xs font-medium text-orange-600 dark:text-orange-400 uppercase tracking-wide">Expiring in 60 days</p>
          <p className="mt-1 text-2xl font-bold text-orange-700 dark:text-orange-300">{buckets.within60 - buckets.within30}</p>
        </div>
      )}
      {buckets.within90 > buckets.within60 && (
        <div className="flex-1 rounded-2xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-4">
          <p className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wide">Expiring in 90 days</p>
          <p className="mt-1 text-2xl font-bold text-amber-700 dark:text-amber-300">{buckets.within90 - buckets.within60}</p>
        </div>
      )}
    </div>
  )
}
