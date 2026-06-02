'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'

interface DunningState {
  kind: 'payment-failed' | 'grace-period' | 'suspended-payment'
  reason?: string
  graceDays?: number
}

export function DunningBanner() {
  const [dunning, setDunning] = useState<DunningState | null>(null)

  useEffect(() => {
    trpc.subscription.getOrgSubscriptions
      .query()
      .then((r) => {
        const org = r.organization as {
          status: string
          paymentFailureReason?: string | null
          gracePeriodEndsAt?: string | null
        }

        if (!org.paymentFailureReason) return

        if (org.status === 'SUSPENDED') {
          setDunning({ kind: 'suspended-payment', reason: org.paymentFailureReason })
          return
        }

        if (org.gracePeriodEndsAt && new Date(org.gracePeriodEndsAt) > new Date()) {
          const graceDays = Math.max(
            0,
            Math.ceil(
              (new Date(org.gracePeriodEndsAt).getTime() - Date.now()) / 86_400_000,
            ),
          )
          setDunning({ kind: 'grace-period', reason: org.paymentFailureReason, graceDays })
          return
        }

        setDunning({ kind: 'payment-failed', reason: org.paymentFailureReason })
      })
      .catch(() => {})
  }, [])

  if (!dunning) return null

  if (dunning.kind === 'suspended-payment') {
    return (
      <div
        role="alert"
        className="rounded-2xl bg-destructive/10 border border-destructive/20 px-5 py-3 flex items-center justify-between gap-4"
      >
        <p className="text-sm font-semibold text-destructive">
          Your subscription has been suspended due to a failed payment.
        </p>
        <Link
          href="/subscriptions/billing"
          className="shrink-0 rounded-full bg-destructive px-5 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
        >
          Update Payment Method
        </Link>
      </div>
    )
  }

  if (dunning.kind === 'grace-period') {
    return (
      <div
        role="alert"
        className="rounded-2xl bg-amber-50 border border-amber-200 px-5 py-3 flex items-center justify-between gap-4"
      >
        <p className="text-sm font-semibold text-amber-800">
          Payment failed. You have {dunning.graceDays} day(s) to update your payment method
          before your subscription is suspended.
        </p>
        <Link
          href="/subscriptions/billing"
          className="shrink-0 rounded-full bg-brand-lime px-5 py-2 text-sm font-semibold text-foreground hover:brightness-95 transition-all"
        >
          Update Payment Method
        </Link>
      </div>
    )
  }

  // payment-failed (not suspended, no grace period countdown)
  return (
    <div
      role="alert"
      className="rounded-2xl bg-amber-50 border border-amber-200 px-5 py-3 flex items-center justify-between gap-4"
    >
      <p className="text-sm font-semibold text-amber-800">
        Your last payment failed. Update your payment method to avoid service interruption.
      </p>
      <Link
        href="/subscriptions/billing"
        className="shrink-0 rounded-full bg-brand-lime px-5 py-2 text-sm font-semibold text-foreground hover:brightness-95 transition-all"
      >
        Update Payment Method
      </Link>
    </div>
  )
}
