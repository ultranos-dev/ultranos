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
      .then((result: { buckets: Parameters<typeof setBuckets>[0] }) => setBuckets(result.buckets))
      .catch(() => {
        setError(true)
      })
  }, [])

  if (error) {
    return (
      <div className="rounded-2xl border border-warning bg-warning/10 p-3 text-sm text-warning">
        Unable to load credential expiry data.
      </div>
    )
  }

  if (!buckets || (buckets.within90 === 0)) return null

  return (
    <div className="flex gap-4">
      {buckets.within30 > 0 && (
        <div className="flex-1 rounded-xl border border-destructive/30 bg-destructive/10 p-4">
          <p className="text-xs font-medium text-destructive uppercase tracking-wide">Expiring in 30 days</p>
          <p className="mt-1 text-2xl font-bold text-destructive">{buckets.within30}</p>
        </div>
      )}
      {buckets.within60 > buckets.within30 && (
        <div className="flex-1 rounded-xl border border-warning/30 bg-warning/10 p-4">
          <p className="text-xs font-medium text-warning uppercase tracking-wide">Expiring in 60 days</p>
          <p className="mt-1 text-2xl font-bold text-warning">{buckets.within60 - buckets.within30}</p>
        </div>
      )}
      {buckets.within90 > buckets.within60 && (
        <div className="flex-1 rounded-xl border border-warning/20 bg-warning/5 p-4">
          <p className="text-xs font-medium text-warning uppercase tracking-wide">Expiring in 90 days</p>
          <p className="mt-1 text-2xl font-bold text-warning">{buckets.within90 - buckets.within60}</p>
        </div>
      )}
    </div>
  )
}
