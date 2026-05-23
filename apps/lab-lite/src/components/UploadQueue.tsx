'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import {
  getQueueItems,
  removeQueueItem,
  updateQueueItemStatus,
  type UploadQueueEntry,
  type UploadQueueStatus,
} from '../lib/db'
import { reportQueueAuditEvent } from '../lib/queue-audit'

const STATUS_KEYS: Record<UploadQueueStatus, string> = {
  pending: 'statusPending',
  uploading: 'statusUploading',
  expired: 'statusExpired',
  failed: 'statusFailed',
}

const STATUS_STYLES: Record<UploadQueueStatus, string> = {
  pending: 'bg-amber-50 text-amber-700',
  uploading: 'bg-amber-50 text-amber-700',
  expired: 'bg-yellow-100 text-yellow-800',
  failed: 'bg-red-100 text-red-700',
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function UploadQueue() {
  const [items, setItems] = useState<UploadQueueEntry[]>([])
  const [confirmingId, setConfirmingId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const data = await getQueueItems()
    setItems(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function handleDiscard(id: number) {
    const item = items.find((i) => i.id === id)
    await removeQueueItem(id)
    if (item) {
      reportQueueAuditEvent({
        action: 'QUEUE_ITEM_DISCARDED',
        queueEntryId: id,
        testCategory: item.metadata.loincDisplay,
        patientRef: item.patientRef,
        timestamp: new Date().toISOString(),
      })
    }
    setConfirmingId(null)
    await refresh()
  }

  async function handleReupload(id: number) {
    await updateQueueItemStatus(id, 'pending', {
      retryCount: 0,
      lastAttemptAt: null,
    })
    // Update queuedAt to reset the 48-hour window
    const db = (await import('../lib/db')).getDb()
    await db.uploadQueue.update(id, { queuedAt: new Date().toISOString() })
    await refresh()
  }

  const t = useTranslations('queue')

  if (loading) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-6" aria-busy="true">
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <svg className="motion-safe:animate-spin h-4 w-4 text-neutral-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 22 6.477 22 12h-4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.568 3 7.938l3-2.647z" />
          </svg>
          {t('loading')}
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-6">
        <h2 className="mb-2 text-sm font-semibold text-neutral-700">{t('title')}</h2>
        <p className="text-sm text-neutral-500">{t('empty')}</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-neutral-700">
          {t('titleWithCount', { count: items.length })}
        </h2>
      </div>
      <ul className="divide-y divide-neutral-100">
        {items.map((item) => (
          <li
            key={item.id}
            className={`px-4 py-3 ${item.status === 'expired' ? 'bg-yellow-50' : ''}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-neutral-900">
                    {item.patientFirstName}
                  </span>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[item.status]}`}
                  >
                    {t(STATUS_KEYS[item.status])}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-neutral-600">
                  {item.metadata.loincDisplay}
                </p>
                <p className="mt-0.5 text-xs text-neutral-400">
                  {t('queued', { timestamp: formatTimestamp(item.queuedAt) })}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                {item.status === 'expired' && (
                  <button
                    type="button"
                    onClick={() => handleReupload(item.id!)}
                    aria-label={t('reuploadAriaLabel')}
                    className="min-h-[44px] rounded-md px-3 py-2 text-xs font-medium text-primary-600 [@media(hover:hover)and(pointer:fine)]:hover:bg-primary-50 active:brightness-[0.88] motion-safe:transition-all motion-safe:duration-150"
                  >
                    {t('reupload')}
                  </button>
                )}
                {(item.status === 'expired' || item.status === 'failed') && (
                  <>
                    {confirmingId === item.id ? (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-neutral-600">{t('confirmPrompt')}</span>
                        <button
                          type="button"
                          onClick={() => handleDiscard(item.id!)}
                          aria-label={t('confirmDiscardAriaLabel')}
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
                        onClick={() => setConfirmingId(item.id!)}
                        aria-label={t('discardAriaLabel')}
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
  )
}
