'use client'

import { useTranslations } from 'next-intl'
import { useUploadHistory } from '@/hooks/useUploadHistory'
import { UploadHistoryList } from '@/components/history/UploadHistoryList'

function HistoryContent() {
  const t = useTranslations('history')
  const {
    items,
    loading,
    error,
    searchQuery,
    setSearchQuery,
    hasMore,
    loadMore,
    loadingMore,
    refresh,
  } = useUploadHistory()

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-foreground">{t('title')}</h1>
        <div className="flex min-h-[16rem] items-center justify-center rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50 text-sm text-muted-foreground">
          {t('loading')}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">{t('title')}</h1>

      {error && (
        <div className="rounded-2xl bg-warning/10 p-3 text-sm text-warning" role="alert">
          {error}
        </div>
      )}

      <UploadHistoryList
        items={items}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        hasMore={hasMore}
        onLoadMore={loadMore}
        loadingMore={loadingMore}
        onRefresh={refresh}
      />
    </div>
  )
}

export default function HistoryPage() {
  return (
      <HistoryContent />
  )
}
