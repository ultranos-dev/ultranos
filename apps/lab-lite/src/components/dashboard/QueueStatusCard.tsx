'use client'

import Link from 'next/link'
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
  ringClass,
}: {
  label: string
  count: number
  colorClass: string
  ariaLabel: string
  ringClass?: string
}) {
  return (
    <div className={`rounded-md px-3 py-2 text-center ${colorClass}${ringClass ? ` ${ringClass}` : ''}`} role="status" aria-label={ariaLabel}>
      <p className="text-2xl font-bold" aria-hidden="true">{count}</p>
      <p className="text-xs font-medium" aria-hidden="true">{label}</p>
    </div>
  )
}

export function QueueStatusCard({ counts }: QueueStatusCardProps) {
  const t = useTranslations('dashboard')
  const hasFailures = counts.failed > 0

  return (
    <div className={`rounded-lg border p-4 ${hasFailures ? 'border-destructive/30 bg-destructive/30' : 'border-border bg-card'}`}>
      <h2 className="text-sm font-medium text-muted-foreground">{t('uploadQueue')}</h2>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <CountBadge label={t('pending')} count={counts.pending} colorClass="bg-warning/10 text-warning" ariaLabel={`${counts.pending} ${t('pending')}`} />
        <CountBadge label={t('uploading')} count={counts.uploading} colorClass="bg-warning/10 text-warning" ariaLabel={`${counts.uploading} ${t('uploading')}`} />
        <CountBadge label={t('failed')} count={counts.failed} colorClass="bg-destructive/10 text-destructive" ariaLabel={`${counts.failed} ${t('failed')}`} ringClass={hasFailures ? 'ring-1 ring-destructive/30' : undefined} />
        <CountBadge label={t('expired')} count={counts.expired} colorClass="bg-muted text-muted-foreground" ariaLabel={`${counts.expired} ${t('expired')}`} />
      </div>
      {hasFailures && (
        <Link href="/queue" className="mt-2 block text-sm font-medium text-destructive hover:text-destructive">
          {t('attentionNeeded', { count: counts.failed })}
        </Link>
      )}
    </div>
  )
}
