'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'

interface OrgSubscriptionData {
  organization: {
    status: string
    trialEndsAt: string | null
    name: string
    paymentFailureReason?: string | null
    gracePeriodEndsAt?: string | null
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
    trialDaysRemaining > 7 ? 'bg-success' : trialDaysRemaining >= 3 ? 'bg-warning' : 'bg-destructive'

  // Trial is 30 days; progress bar shows how much time is left
  const trialProgressPct = Math.min(100, Math.max(0, (trialDaysRemaining / 30) * 100))

  // Payment failed but not yet suspended
  if (organization.paymentFailureReason && status !== 'SUSPENDED') {
    const graceDays = organization.gracePeriodEndsAt
      ? Math.max(0, Math.ceil((new Date(organization.gracePeriodEndsAt).getTime() - Date.now()) / 86_400_000))
      : null
    return (
      <div className="rounded-2xl bg-amber-50 p-6 border border-amber-200 shadow-card flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-amber-800">Payment Failed</p>
          {graceDays !== null && (
            <p className="text-xs text-amber-700 mt-1">{graceDays} day(s) until suspension</p>
          )}
        </div>
        <Button asChild>
          <Link href="/subscriptions/billing">Update Payment</Link>
        </Button>
      </div>
    )
  }

  if (status === 'TRIAL') {
    return (
      <div className="rounded-2xl bg-popover border border-border p-6 shadow-card">
        <p className="text-sm font-medium text-muted-foreground">Subscription</p>
        <p className="mt-2 text-lg font-semibold text-foreground">
          Free Trial &mdash; {trialDaysRemaining} days remaining
        </p>
        <div className="mt-3 h-2 w-full rounded-full bg-border">
          <div
            className={`h-2 rounded-full ${trialProgressColor}`}
            style={{ width: `${trialProgressPct}%` }}
            data-testid="trial-progress"
          />
        </div>
        <Button className="mt-4 w-full" onClick={() => router.push('/subscriptions/billing')}>
          Set Up Billing
        </Button>
      </div>
    )
  }

  if (status === 'ACTIVE') {
    return (
      <div className="rounded-2xl bg-popover border border-border p-6 shadow-card">
        <p className="text-sm font-medium text-muted-foreground">Subscription</p>
        <p className="mt-2 text-lg font-semibold text-foreground">
          Active Subscription &mdash; {subscriptions.length} module{subscriptions.length !== 1 ? 's' : ''}, ${totalMonthlyCostUsd.toFixed(2)}/mo
        </p>
      </div>
    )
  }

  if (status === 'SUSPENDED') {
    const isPaymentSuspended = !!organization.paymentFailureReason
    return (
      <div className="rounded-2xl bg-destructive/10 border border-destructive/20 p-6 shadow-card">
        <p className="text-sm font-medium text-muted-foreground">Subscription</p>
        <p className="mt-2 text-lg font-semibold text-destructive">
          {isPaymentSuspended ? 'Suspended — Payment Failed' : 'Suspended'}
        </p>
        <Button
          variant="destructive"
          className="mt-4 w-full"
          onClick={() => router.push(isPaymentSuspended ? '/subscriptions/billing' : '/subscriptions')}
        >
          {isPaymentSuspended ? 'Update Payment Method' : 'Manage Subscription'}
        </Button>
      </div>
    )
  }

  if (status === 'CANCELLED') {
    return (
      <div className="rounded-2xl bg-popover border border-border p-6 shadow-card">
        <p className="text-sm font-medium text-muted-foreground">Subscription</p>
        <p className="mt-2 text-lg font-semibold text-muted-foreground">Cancelled</p>
        <Button className="mt-4 w-full" onClick={() => router.push('/subscriptions')}>
          Resubscribe
        </Button>
      </div>
    )
  }

  return null
}
