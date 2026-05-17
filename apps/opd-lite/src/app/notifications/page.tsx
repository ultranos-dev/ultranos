'use client'

import Link from 'next/link'
import { AuthGuard } from '@/components/AuthGuard'
import { SessionTimeoutWrapper } from '@/components/SessionTimeoutWrapper'
import { NotificationCenter } from '@/components/notifications/NotificationCenter'

export default function NotificationsPage() {
  return (
    <AuthGuard>
      <SessionTimeoutWrapper>
        <main className="mx-auto max-w-3xl px-4 py-8">
          <header className="mb-8">
            <Link
              href="/"
              className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-primary-500 hover:underline"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4 rtl:rotate-180">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
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
      </SessionTimeoutWrapper>
    </AuthGuard>
  )
}
