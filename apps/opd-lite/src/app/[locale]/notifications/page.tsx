'use client'

import Link from 'next/link'
import { ChevronLeft } from '@ultranos/ui-kit/icons'
import { DirectionalIcon } from '@ultranos/ui-kit'
import { NotificationCenter } from '@/components/notifications/NotificationCenter'

export default function NotificationsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-8">
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-primary-500 hover:underline"
        >
          <DirectionalIcon category="navigation">
            <ChevronLeft className="h-4 w-4" />
          </DirectionalIcon>
          Back to Dashboard
        </Link>
        <h1 className="text-3xl font-black tracking-tight text-neutral-900">
          Notification Center
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Manage all your notifications — lab results, prescriptions, and system alerts.
        </p>
      </header>
      <NotificationCenter />
    </main>
  )
}
