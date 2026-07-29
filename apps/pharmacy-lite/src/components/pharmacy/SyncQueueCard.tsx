'use client'

import { memo } from 'react'
import { useTranslations } from 'next-intl'

interface SyncQueueCardProps {
  pendingCount: number
}

export const SyncQueueCard = memo(function SyncQueueCard({ pendingCount }: SyncQueueCardProps) {
  const t = useTranslations('sync')
  const isAmber = pendingCount > 0

  return (
    <div
      data-testid="sync-queue-card"
      className={`flex flex-col rounded-xl bg-card p-5 text-start shadow-card ring-[0.65px] ring-border/50 ${
        isAmber ? 'ring-2 ring-warning/50' : ''
      }`}
    >
      <p className="text-sm font-medium text-muted-foreground">{t('syncQueueCard')}</p>
      <p
        className={`mt-2 text-3xl font-semibold tracking-tight tabular-nums ${
          isAmber ? 'text-warning' : 'text-foreground'
        }`}
      >
        {pendingCount}
      </p>
      <p className="mt-1 text-sm font-medium text-muted-foreground">
        {isAmber ? t('itemsAwaiting', { count: pendingCount }) : t('allSynced')}
      </p>
    </div>
  )
})
