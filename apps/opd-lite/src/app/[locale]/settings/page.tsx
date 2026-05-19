'use client'

import Link from 'next/link'
import { AuthGuard } from '@/components/AuthGuard'
import { SessionTimeoutWrapper } from '@/components/SessionTimeoutWrapper'
import { ProfileCard } from '@/components/settings/ProfileCard'
import { SessionInfoCard } from '@/components/settings/SessionInfoCard'
import { MfaManagementCard } from '@/components/settings/MfaManagementCard'
import { PreferencesCard } from '@/components/settings/PreferencesCard'

export default function SettingsPage() {
  return (
    <AuthGuard>
      <SessionTimeoutWrapper>
        <main className="mx-auto max-w-2xl px-4 py-8">
          <div className="mb-6 flex items-center gap-3">
            <Link
              href="/"
              className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
              aria-label="Back to dashboard"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="h-5 w-5 rtl:scale-x-[-1]"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
                />
              </svg>
            </Link>
            <h1 className="text-2xl font-bold text-neutral-900">Settings</h1>
          </div>

          <div className="space-y-6">
            <ProfileCard />
            <SessionInfoCard />
            <MfaManagementCard />
            <PreferencesCard />
          </div>
        </main>
      </SessionTimeoutWrapper>
    </AuthGuard>
  )
}
