'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { removeQueueItem } from '@/lib/db'
import { reportQueueAuditEvent } from '@/lib/audit-client'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { SearchInput } from '@ultranos/ui-kit/components/ui/search-input'
import { History, FileSearch } from '@ultranos/ui-kit/icons'
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
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'completed' | 'pending' | 'failed' | 'expired'>('ALL')

  const STATUS_PILLS: Array<{ key: typeof statusFilter; label: string }> = [
    { key: 'ALL', label: t('filterAll') },
    { key: 'completed', label: t('statusCompleted') },
    { key: 'pending', label: t('statusPending') },
    { key: 'failed', label: t('statusFailed') },
    { key: 'expired', label: t('statusExpired') },
  ]

  const visibleItems =
    statusFilter === 'ALL' ? items : items.filter((i) => i.status === statusFilter)

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
      {/* Toolbar: search + status pills — one row, always visible */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          type="text"
          dir="auto"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('searchPlaceholder')}
          className="min-w-[200px] flex-1"
          inputClassName="h-9 rounded-full"
          aria-label={t('searchAriaLabel')}
        />
        <div role="tablist" className="flex h-9 items-stretch gap-1 rounded-full border border-border bg-card p-1 w-fit">
          {STATUS_PILLS.map((pill) => (
            <button
              key={pill.key}
              type="button"
              role="tab"
              aria-pressed={statusFilter === pill.key}
              onClick={() => setStatusFilter(pill.key)}
              className={`flex items-center rounded-full px-4 text-sm font-medium transition-colors ${
                statusFilter === pill.key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content box — single cohesive box (empty / list) */}
      <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
      {visibleItems.length === 0 ? (
        <div className="flex min-h-[16rem] items-center justify-center">
          <EmptyState
            icon={searchQuery || statusFilter !== 'ALL' ? FileSearch : History}
            title={searchQuery || statusFilter !== 'ALL' ? t('noResults') : t('empty')}
          />
        </div>
      ) : (
          <ul className="divide-y divide-border" role="list">
            {visibleItems.map((item) => (
              <li
                key={item.id}
                className={`px-4 py-3 ${item.status === 'expired' ? 'bg-warning/10' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {item.source === 'local'
                          ? item.patientFirstName
                          : item.testCategory}
                      </span>
                      <StatusBadge status={item.status} />
                    </div>
                    {item.source === 'local' && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {item.testCategory}
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-muted-foreground font-numeric">
                      {formatTimestamp(item.uploadDate)}
                    </p>
                    {item.status === 'failed' && item.failureReason && (
                      <p className="mt-1 text-xs text-destructive">{item.failureReason}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex shrink-0 gap-1">
                    {item.status === 'expired' && item.source === 'local' && (
                      <Button
                        variant="ghost"
                        type="button"
                        onClick={() => handleReupload(item)}
                      >
                        {t('reupload')}
                      </Button>
                    )}
                    {item.status === 'failed' && item.source === 'local' && (
                      <>
                        {confirmingId === item.id ? (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground">
                              {t('discardConfirm')}
                            </span>
                            <Button
                              variant="danger"
                              type="button"
                              onClick={() => handleDiscard(item)}
                              aria-label={t('confirmDiscard')}
                            >
                              {t('confirm')}
                            </Button>
                            <Button
                              variant="secondary"
                              type="button"
                              onClick={() => setConfirmingId(null)}
                            >
                              {t('cancel')}
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            className="!text-destructive"
                            type="button"
                            onClick={() => setConfirmingId(item.id)}
                            aria-label={t('discard')}
                          >
                            {t('discard')}
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
      )}
      </div>

      {/* Load More — below the content box */}
      {hasMore && items.length > 0 && (
        <Button
          variant="outline"
          size="sm"
          type="button"
          onClick={onLoadMore}
          disabled={loadingMore}
          className="mx-auto w-fit"
        >
          {loadingMore ? t('loadingMore') : t('loadMore')}
        </Button>
      )}
    </div>
  )
}
