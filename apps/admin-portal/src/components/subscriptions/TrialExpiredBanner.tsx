'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'

export function TrialExpiredBanner() {
  return (
    <div
      role="alert"
      className="rounded-2xl bg-destructive/10 border border-destructive/20 px-5 py-3 flex items-center justify-between gap-4"
    >
      <p className="text-sm font-semibold text-destructive">
        Your trial has expired. Set up billing to restore access.
      </p>
      <Button asChild variant="destructive" size="sm" className="shrink-0">
        <Link href="/subscriptions/billing">Set Up Billing</Link>
      </Button>
    </div>
  )
}
