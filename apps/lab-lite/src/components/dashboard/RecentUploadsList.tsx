'use client'

import { useLocale, useTranslations } from 'next-intl'
import type { RecentUploadItem } from '@/hooks/useDashboardData'

interface RecentUploadsListProps {
  items: RecentUploadItem[]
}

const statusStyles: Record<RecentUploadItem['status'], string> = {
  completed: 'bg-green-50 text-green-700',
  pending: 'bg-amber-50 text-amber-700',
  uploading: 'bg-amber-50 text-amber-700',
  failed: 'bg-red-50 text-red-700',
  expired: 'bg-neutral-100 text-neutral-400',
}

function formatTimestamp(iso: string, locale: string): string {
  if (!iso) return '\u2014'
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return '\u2014'
    return d.toLocaleString(locale, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '\u2014'
  }
}

export function RecentUploadsList({ items }: RecentUploadsListProps) {
  const t = useTranslations('dashboard')
  const tStatus = useTranslations('status')
  const locale = useLocale()

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="text-sm font-medium text-neutral-500">{t('recentUploads')}</h2>
        <p className="mt-3 text-sm text-neutral-400">{t('noUploadsYet')}</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-medium text-neutral-500">{t('recentUploads')}</h2>
      <ul className="mt-3 divide-y divide-neutral-100" role="list">
        {items.map((item) => {
          const statusLabel = tStatus(item.status)
          return (
            <li key={item.id} className="flex items-center justify-between py-2.5 [@media(hover:hover)and(pointer:fine)]:hover:bg-neutral-50 motion-safe:transition-colors motion-safe:duration-150">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-neutral-900">
                  {item.loincDisplay}
                </p>
                <p className="text-xs text-neutral-400">{formatTimestamp(item.timestamp, locale)}</p>
              </div>
              <span
                className={`ms-2 inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[item.status]}`}
              >
                {statusLabel}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
