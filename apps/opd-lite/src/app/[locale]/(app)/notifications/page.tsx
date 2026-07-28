'use client'

import { useTranslations } from 'next-intl'
import { NotificationCenter } from '@/components/notifications/NotificationCenter'

export default function NotificationsPage() {
  const t = useTranslations('sidebar')
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">{t('notifications')}</h1>
      <NotificationCenter />
    </div>
  )
}
