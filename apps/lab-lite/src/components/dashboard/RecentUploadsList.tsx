'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { RecentUploadItem } from '@/hooks/useDashboardData'
import { removeQueueItem } from '@/lib/db'
import { reportQueueAuditEvent } from '@/lib/audit-client'
import { useAuthSessionStore } from '@/stores/auth-session-store'

interface RecentUploadsListProps {
  items: RecentUploadItem[]
  onItemCancelled?: () => void
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

function isCancellable(item: RecentUploadItem): boolean {
  return item.source === 'local' && (item.status === 'pending' || item.status === 'failed')
}

export function RecentUploadsList({ items, onItemCancelled }: RecentUploadsListProps) {
  const t = useTranslations('dashboard')
  const tStatus = useTranslations('status')
  const locale = useLocale()
  const session = useAuthSessionStore((s) => s.session)

  // Track which item is in two-step confirmation mode
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  // Track which item just showed the "cancelled" flash message
  const [cancelledId, setCancelledId] = useState<string | null>(null)

  async function handleCancelConfirm(item: RecentUploadItem) {
    if (item.localQueueId == null) return
    try {
      await removeQueueItem(item.localQueueId)
      reportQueueAuditEvent({
        action: 'QUEUE_ITEM_DISCARDED',
        queueEntryId: item.localQueueId,
        testCategory: item.loincDisplay,
        patientRef: session?.userId ?? 'unknown',
        timestamp: new Date().toISOString(),
        technicianId: session?.practitionerId,
      })
      setConfirmingId(null)
      setCancelledId(item.id)
      // Clear flash after 2s then trigger parent refresh
      setTimeout(() => {
        setCancelledId(null)
        onItemCancelled?.()
      }, 2000)
    } catch {
      // Non-blocking: if remove fails, just reset the confirmation state
      setConfirmingId(null)
    }
  }

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
          const isConfirming = confirmingId === item.id
          const wasCancelled = cancelledId === item.id
          const cancellable = isCancellable(item)

          const displayLabel = item.patientFirstName
            ? `${item.patientFirstName} \u2014 ${item.loincDisplay}`
            : item.loincDisplay

          return (
            <li
              key={item.id}
              className="py-2.5 [@media(hover:hover)and(pointer:fine)]:hover:bg-neutral-50 motion-safe:transition-colors motion-safe:duration-150"
            >
              {wasCancelled ? (
                <p className="text-sm text-neutral-400 italic">{t('uploadCancelled')}</p>
              ) : isConfirming ? (
                <div className="flex flex-col gap-1.5">
                  <p className="text-sm font-medium text-neutral-700">{t('cancelConfirm')}</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleCancelConfirm(item)}
                      className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 motion-safe:transition-colors"
                    >
                      {t('confirmCancel')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingId(null)}
                      className="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 motion-safe:transition-colors"
                    >
                      {t('cancelDismiss')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-neutral-900">
                      {displayLabel}
                    </p>
                    <p className="text-xs text-neutral-400">{formatTimestamp(item.timestamp, locale)}</p>
                  </div>
                  <div className="ms-2 flex shrink-0 items-center gap-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[item.status]}`}
                    >
                      {statusLabel}
                    </span>
                    {cancellable && (
                      <button
                        type="button"
                        onClick={() => setConfirmingId(item.id)}
                        aria-label={`${t('cancelUpload')} ${item.loincDisplay}`}
                        className="rounded px-2 py-0.5 text-xs font-medium text-neutral-400 hover:bg-red-50 hover:text-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-red-500 motion-safe:transition-colors"
                      >
                        {t('cancelUpload')}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
