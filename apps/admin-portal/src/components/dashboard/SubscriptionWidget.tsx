'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'

interface OrgSubscriptionData {
  organization: {
    status: string
    trialEndsAt: string | null
    name: string
  }
  subscriptions: Array<{ id: string; moduleName: string }>
  totalMonthlyCostUsd: number
}

export function SubscriptionWidget() {
  const router = useRouter()
  const [data, setData] = useState<OrgSubscriptionData | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    trpc.subscription.getOrgSubscriptions
      .query()
      .then(setData)
      .catch(() => setError(true))
  }, [])

  if (error || !data) return null

  const { organization, subscriptions, totalMonthlyCostUsd } = data
  const status = organization.status

  const trialDaysRemaining =
    status === 'TRIAL' && organization.trialEndsAt
      ? Math.max(0, Math.ceil((new Date(organization.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : 0

  const trialProgressColor =
    trialDaysRemaining > 7 ? 'bg-success' : trialDaysRemaining >= 3 ? 'bg-warning' : 'bg-danger'

  // Trial is 30 days; progress bar shows how much time is left
  const trialProgressPct = Math.min(100, Math.max(0, (trialDaysRemaining / 30) * 100))

  if (status === 'TRIAL') {
    return (
      <div className="rounded-2xl bg-surface-raised border border-border p-6 shadow-card">
        <p className="text-sm font-medium text-text-secondary">Subscription</p>
        <p className="mt-2 text-lg font-semibold text-text-primary">
          Free Trial &mdash; {trialDaysRemaining} days remaining
        </p>
        <div className="mt-3 h-2 w-full rounded-full bg-border">
          <div
            className={`h-2 rounded-full ${trialProgressColor}`}
            style={{ width: `${trialProgressPct}%` }}
            data-testid="trial-progress"
          />
        </div>
        <button
          onClick={() => router.push('/subscriptions')}
          className="mt-4 rounded-xl bg-brand-lime px-4 py-2 text-sm font-medium text-text-primary hover:opacity-90 transition-opacity"
        >
          Set Up Billing
        </button>
      </div>
    )
  }

  if (status === 'ACTIVE') {
    return (
      <div className="rounded-2xl bg-surface-raised border border-border p-6 shadow-card">
        <p className="text-sm font-medium text-text-secondary">Subscription</p>
        <p className="mt-2 text-lg font-semibold text-text-primary">
          Active Subscription &mdash; {subscriptions.length} module{subscriptions.length !== 1 ? 's' : ''}, ${totalMonthlyCostUsd.toFixed(2)}/mo
        </p>
      </div>
    )
  }

  if (status === 'SUSPENDED') {
    return (
      <div className="rounded-2xl bg-danger-subtle border border-danger/20 p-6 shadow-card">
        <p className="text-sm font-medium text-text-secondary">Subscription</p>
        <p className="mt-2 text-lg font-semibold text-danger">Suspended</p>
        <button
          onClick={() => router.push('/subscriptions')}
          className="mt-4 rounded-xl bg-danger px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
        >
          Manage Subscription
        </button>
      </div>
    )
  }

  if (status === 'CANCELLED') {
    return (
      <div className="rounded-2xl bg-surface-raised border border-border p-6 shadow-card">
        <p className="text-sm font-medium text-text-secondary">Subscription</p>
        <p className="mt-2 text-lg font-semibold text-text-secondary">Cancelled</p>
        <button
          onClick={() => router.push('/subscriptions')}
          className="mt-4 rounded-xl bg-brand-lime px-4 py-2 text-sm font-medium text-text-primary hover:opacity-90 transition-opacity"
        >
          Resubscribe
        </button>
      </div>
    )
  }

  return null
}
