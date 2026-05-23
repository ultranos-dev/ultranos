'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { removeQueueItem } from '@/lib/db'
import { reportQueueAuditEvent } from '@/lib/audit-client'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { StatusBadge } from './StatusBadge'
import type { UploadHistoryItem } from '@/hooks/useUploadHistory'

interface UploadHistoryListProps {
  items: UploadHistoryItem[]
  searchQuery: string
  onSearchChange: (q: string) => void
  hasMore: boolean
  onLoadMore: () => void
  loadingMore: boolean
  onRefresh: () => void
}

function formatTimestamp(iso: string): string {
  if (!iso) return '\u2014'
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '\u2014'
  }
}

export function UploadHistoryList({
  items,
  searchQuery,
  onSearchChange,
  hasMore,
  onLoadMore,
  loadingMore,
  onRefresh,
}: UploadHistoryListProps) {
  const t = useTranslations('history')
  const router = useRouter()
  const session = useAuthSessionStore((s) => s.session)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  async function handleReupload(item: UploadHistoryItem) {
    if (!item.localQueueId) return
    router.push(`/upload?reupload=${item.localQueueId}`)
  }

  async function handleDiscard(item: UploadHistoryItem) {
    if (!item.localQueueId) return
    try {
      await removeQueueItem(item.localQueueId)
      reportQueueAuditEvent({
        action: 'QUEUE_ITEM_DISCARDED',
        queueEntryId: item.localQueueId,
        testCategory: item.testCategory,
        patientRef: item.patientRef ?? '',
        timestamp: new Date().toISOString(),
        technicianId: session?.practitionerId,
      })
      setConfirmingId(null)
      onRefresh()
    } catch {
      setConfirmingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Search bar */}
      <div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('searchPlaceholder')}
          className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
          aria-label={t('searchAriaLabel')}
        />
      </div>

      {/* List */}
      {items.length === 0 ? (
        <div className="rounded-lg border border-neutral-200 bg-white p-6 text-center">
          <p className="text-sm text-neutral-500">
            {searchQuery ? t('noResults') : t('empty')}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-neutral-200 bg-white">
          <ul className="divide-y divide-neutral-100" role="list">
            {items.map((item) => (
              <li
                key={item.id}
                className={`px-4 py-3 ${item.status === 'expired' ? 'bg-yellow-50' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-neutral-900">
                        {item.source === 'local'
                          ? item.patientFirstName
                          : item.testCategory}
                      </span>
                      <StatusBadge status={item.status} />
                    </div>
                    {item.source === 'local' && (
                      <p className="mt-0.5 text-xs text-neutral-600">
                        {item.testCategory}
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-neutral-400">
                      {formatTimestamp(item.uploadDate)}
                    </p>
                    {item.status === 'failed' && item.failureReason && (
                      <p className="mt-1 text-xs text-red-600">{item.failureReason}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex shrink-0 gap-1">
                    {item.status === 'expired' && item.source === 'local' && (
                      <button
                        type="button"
                        onClick={() => handleReupload(item)}
                        className="min-h-[44px] rounded-md px-3 py-2 text-xs font-medium text-primary-600 [@media(hover:hover)and(pointer:fine)]:hover:bg-primary-50 active:brightness-[0.88] motion-safe:transition-all motion-safe:duration-150"
                      >
                        {t('reupload')}
                      </button>
                    )}
                    {item.status === 'failed' && item.source === 'local' && (
                      <>
                        {confirmingId === item.id ? (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-neutral-600">
                              {t('discardConfirm')}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDiscard(item)}
                              aria-label={t('confirmDiscard')}
                              className="min-h-[44px] rounded-md bg-red-600 px-3 py-2 text-xs font-medium text-white [@media(hover:hover)and(pointer:fine)]:hover:bg-red-700 active:brightness-[0.88] motion-safe:transition-all motion-safe:duration-150"
                            >
                              {t('confirm')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmingId(null)}
                              className="min-h-[44px] rounded-md px-3 py-2 text-xs font-medium text-neutral-600 [@media(hover:hover)and(pointer:fine)]:hover:bg-neutral-100 active:brightness-[0.88] motion-safe:transition-all motion-safe:duration-150"
                            >
                              {t('cancel')}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmingId(item.id)}
                            aria-label={t('discard')}
                            className="min-h-[44px] rounded-md px-3 py-2 text-xs font-medium text-red-600 [@media(hover:hover)and(pointer:fine)]:hover:bg-red-50 active:brightness-[0.88] motion-safe:transition-all motion-safe:duration-150"
                          >
                            {t('discard')}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Load More */}
      {hasMore && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="min-h-[44px] rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 [@media(hover:hover)and(pointer:fine)]:hover:bg-neutral-50 active:brightness-[0.88] motion-safe:transition-all motion-safe:duration-150 disabled:opacity-50"
          >
            {loadingMore ? t('loadingMore') : t('loadMore')}
          </button>
        </div>
      )}
    </div>
  )
}
