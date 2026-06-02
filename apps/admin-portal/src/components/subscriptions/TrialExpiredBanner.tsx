'use client'

import Link from 'next/link'

export function TrialExpiredBanner() {
  return (
    <div
      role="alert"
      className="rounded-2xl bg-destructive/10 border border-destructive/20 px-5 py-3 flex items-center justify-between gap-4"
    >
      <p className="text-sm font-semibold text-destructive">
        Your trial has expired. Set up billing to restore access.
      </p>
      <Link
        href="/subscriptions/billing"
        className="shrink-0 rounded-full bg-white px-5 py-2 text-sm font-semibold text-destructive hover:opacity-90 transition-opacity"
      >
        Set Up Billing
      </Link>
    </div>
  )
}
