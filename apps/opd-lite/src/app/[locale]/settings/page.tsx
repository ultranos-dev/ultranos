'use client'

import Link from 'next/link'
import { ArrowLeft } from '@ultranos/ui-kit/icons'
import { DirectionalIcon } from '@ultranos/ui-kit'
import { ProfileCard } from '@/components/settings/ProfileCard'
import { SessionInfoCard } from '@/components/settings/SessionInfoCard'
import { MfaManagementCard } from '@/components/settings/MfaManagementCard'
import { PreferencesCard } from '@/components/settings/PreferencesCard'

export default function SettingsPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/"
          className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
          aria-label="Back to dashboard"
        >
          <DirectionalIcon category="navigation">
            <ArrowLeft className="h-5 w-5" />
          </DirectionalIcon>
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
  )
}
