'use client'

import { NotificationCenter } from '@/components/notifications/NotificationCenter'

export default function NotificationsPage() {
  return (
    <div className="mx-auto max-w-7xl px-8 py-6">
      <div className="px-6 pb-6">
        <NotificationCenter />
      </div>
    </div>
  )
}
