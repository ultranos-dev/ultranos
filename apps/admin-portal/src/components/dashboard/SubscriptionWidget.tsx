'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
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

/**
 * Compact subscription status, sized for the sidebar footer (above the user
 * menu). Hidden when the sidebar collapses to icon mode.
 */
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

  const shell =
    'group-data-[collapsible=icon]:hidden rounded-xl border p-3 shadow-card'

  // Payment failed but not yet suspended → grace-period warning
  if (organization.paymentFailureReason && status !== 'SUSPENDED') {
    const graceDays = organization.gracePeriodEndsAt
      ? Math.max(0, Math.ceil((new Date(organization.gracePeriodEndsAt).getTime() - Date.now()) / 86_400_000))
      : null
    return (
      <div className={`${shell} border-warning/30 bg-warning/10`}>
        <p className="text-xs font-semibold text-warning">Payment Failed</p>
        {graceDays !== null && (
          <p className="mt-0.5 text-[11px] text-warning/80">{graceDays} day{graceDays !== 1 ? 's' : ''} until suspension</p>
        )}
        <Button size="sm" className="mt-2 w-full" onClick={() => router.push('/subscriptions/billing')}>
          Update Payment
        </Button>
      </div>
    )
  }

  if (status === 'TRIAL') {
    const trialDaysRemaining = organization.trialEndsAt
      ? Math.max(0, Math.ceil((new Date(organization.trialEndsAt).getTime() - Date.now()) / 86_400_000))
      : 0
    const barColor =
      trialDaysRemaining > 7 ? 'bg-success' : trialDaysRemaining >= 3 ? 'bg-warning' : 'bg-destructive'
    const barPct = Math.min(100, Math.max(0, (trialDaysRemaining / 30) * 100))
    return (
      <div className={`${shell} border-border bg-card`}>
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">Subscription</p>
          <span className="text-[11px] font-semibold text-foreground tabular-nums">{trialDaysRemaining}d left</span>
        </div>
        <p className="mt-0.5 text-xs font-semibold text-foreground">Free Trial</p>
        <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
          <div
            className={`h-1.5 rounded-full ${barColor}`}
            style={{ width: `${barPct}%` }}
            data-testid="trial-progress"
          />
        </div>
        <Button size="sm" className="mt-2 w-full" onClick={() => router.push('/subscriptions/billing')}>
          Set Up Billing
        </Button>
      </div>
    )
  }

  if (status === 'ACTIVE') {
    return (
      <button
        type="button"
        onClick={() => router.push('/subscriptions')}
        className={`${shell} w-full border-border bg-card text-start transition-colors hover:bg-muted/40`}
      >
        <p className="text-xs font-medium text-muted-foreground">Subscription</p>
        <p className="mt-0.5 text-xs font-semibold text-foreground">
          Active &middot; {subscriptions.length} module{subscriptions.length !== 1 ? 's' : ''}
        </p>
        <p className="text-[11px] text-muted-foreground tabular-nums">${totalMonthlyCostUsd.toFixed(2)}/mo</p>
      </button>
    )
  }

  if (status === 'SUSPENDED') {
    const isPaymentSuspended = !!organization.paymentFailureReason
    return (
      <div className={`${shell} border-destructive/30 bg-destructive/10`}>
        <p className="text-xs font-semibold text-destructive">
          {isPaymentSuspended ? 'Suspended — Payment' : 'Suspended'}
        </p>
        <Button
          variant="destructive"
          size="sm"
          className="mt-2 w-full"
          onClick={() => router.push(isPaymentSuspended ? '/subscriptions/billing' : '/subscriptions')}
        >
          {isPaymentSuspended ? 'Update Payment' : 'Manage'}
        </Button>
      </div>
    )
  }

  if (status === 'CANCELLED') {
    return (
      <div className={`${shell} border-border bg-card`}>
        <p className="text-xs font-semibold text-muted-foreground">Cancelled</p>
        <Button size="sm" className="mt-2 w-full" onClick={() => router.push('/subscriptions')}>
          Resubscribe
        </Button>
      </div>
    )
  }

  return null
}
