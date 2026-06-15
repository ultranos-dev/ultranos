'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { fetchNotifications } from '@/lib/notification-api'
import { Card } from '@/components/Card'

export function PendingLabResultsCard() {
  const t = useTranslations('dashboard')
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    async function loadLabCount() {
      try {
        const { notifications } = await fetchNotifications()
        const labUnread = notifications.filter(
          (n) => n.type === 'LAB_RESULT_AVAILABLE' && n.status !== 'ACKNOWLEDGED'
        ).length
        setCount(labUnread)
      } catch {
        // Network unavailable — keep last known count (null on first load)
      }
    }

    loadLabCount()
    const interval = setInterval(loadLabCount, 30_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <Card>
      <h3 className="text-sm font-black text-muted-foreground uppercase tracking-wide">
        {t('pendingLabResults')}
      </h3>
      <p className="mt-2 text-3xl font-black text-foreground">{count ?? '—'}</p>
      {count !== null && count > 0 && (
        <p className="mt-2 text-sm font-semibold text-muted-foreground">
          {t('unreadResults')}
        </p>
      )}
      {count === null && (
        <p className="mt-2 text-sm font-semibold text-muted-foreground">
          {t('unavailableOffline')}
        </p>
      )}
    </Card>
  )
}
