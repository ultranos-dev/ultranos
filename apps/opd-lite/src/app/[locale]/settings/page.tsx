'use client'

import { TopHeader } from '@/components/TopHeader'
import { ProfileCard } from '@/components/settings/ProfileCard'
import { SessionInfoCard } from '@/components/settings/SessionInfoCard'
import { MfaManagementCard } from '@/components/settings/MfaManagementCard'
import { PreferencesCard } from '@/components/settings/PreferencesCard'

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-7xl px-8 py-6">
      <TopHeader title="Settings" />
      <div className="px-6 pb-6 max-w-2xl space-y-6">
        <ProfileCard />
        <SessionInfoCard />
        <MfaManagementCard />
        <PreferencesCard />
      </div>
    </div>
  )
}
