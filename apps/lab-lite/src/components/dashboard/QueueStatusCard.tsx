'use client'

import { useTranslations } from 'next-intl'
import type { QueueCounts } from '@/hooks/useDashboardData'

interface QueueStatusCardProps {
  counts: QueueCounts
}

function CountBadge({
  label,
  count,
  colorClass,
  ariaLabel,
}: {
  label: string
  count: number
  colorClass: string
  ariaLabel: string
}) {
  return (
    <div className={`rounded-md px-3 py-2 text-center ${colorClass}`} role="status" aria-label={ariaLabel}>
      <p className="text-2xl font-bold" aria-hidden="true">{count}</p>
      <p className="text-xs font-medium" aria-hidden="true">{label}</p>
    </div>
  )
}

export function QueueStatusCard({ counts }: QueueStatusCardProps) {
  const t = useTranslations('dashboard')

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-medium text-neutral-500">{t('uploadQueue')}</h2>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <CountBadge label={t('pending')} count={counts.pending} colorClass="bg-amber-50 text-amber-700" ariaLabel={`${counts.pending} ${t('pending')}`} />
        <CountBadge label={t('uploading')} count={counts.uploading} colorClass="bg-amber-50 text-amber-700" ariaLabel={`${counts.uploading} ${t('uploading')}`} />
        <CountBadge label={t('failed')} count={counts.failed} colorClass="bg-red-50 text-red-700" ariaLabel={`${counts.failed} ${t('failed')}`} />
        <CountBadge label={t('expired')} count={counts.expired} colorClass="bg-neutral-100 text-neutral-400" ariaLabel={`${counts.expired} ${t('expired')}`} />
      </div>
    </div>
  )
}
