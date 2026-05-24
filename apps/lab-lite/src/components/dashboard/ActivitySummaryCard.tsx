'use client'

import { useTranslations } from 'next-intl'

interface ActivitySummaryCardProps {
  uploadsCompleted: number
  resultsPending: number
  lastRefreshedAt?: string
}

export function ActivitySummaryCard({ uploadsCompleted, resultsPending, lastRefreshedAt }: ActivitySummaryCardProps) {
  const t = useTranslations('dashboard')

  let formattedTime: string | null = null
  if (lastRefreshedAt) {
    const date = new Date(lastRefreshedAt)
    formattedTime = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-neutral-500">{t('todaysActivity')}</h2>
        {formattedTime && (
          <span className="text-xs text-neutral-400">{t('lastRefreshed', { time: formattedTime })}</span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-md bg-green-50 px-3 py-2 text-center" role="status" aria-label={`${uploadsCompleted} ${t('completed')}`}>
          <p className="text-2xl font-bold text-green-700" aria-hidden="true">{uploadsCompleted}</p>
          <p className="text-xs font-medium text-green-700" aria-hidden="true">{t('completed')}</p>
        </div>
        <div className="rounded-md bg-amber-50 px-3 py-2 text-center" role="status" aria-label={`${resultsPending} ${t('pendingReview')}`}>
          <p className="text-2xl font-bold text-amber-700" aria-hidden="true">{resultsPending}</p>
          <p className="text-xs font-medium text-amber-700" aria-hidden="true">{t('pendingReview')}</p>
        </div>
      </div>
    </div>
  )
}
