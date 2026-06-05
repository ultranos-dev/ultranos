'use client'

import { TopHeader } from '@/components/TopHeader'
import { NotificationCenter } from '@/components/notifications/NotificationCenter'

export default function NotificationsPage() {
  return (
    <div className="mx-auto max-w-7xl px-8 py-6">
      <TopHeader
        title="Notification Center"
        description="Manage all your notifications — lab results, prescriptions, and system alerts."
      />
      <div className="px-6 pb-6">
        <NotificationCenter />
      </div>
    </div>
  )
}
