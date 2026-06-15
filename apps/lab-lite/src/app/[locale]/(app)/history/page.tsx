'use client'

import { AuthGuard } from '@/components/AuthGuard'
import { useUploadHistory } from '@/hooks/useUploadHistory'
import { UploadHistoryList } from '@/components/history/UploadHistoryList'

function HistoryContent() {
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
        <h1 className="text-xl font-bold text-foreground">Upload History</h1>
        <div className="rounded-lg border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">Loading upload history...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-foreground">Upload History</h1>

      {error && (
        <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-700" role="alert">
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
    <AuthGuard>
      <HistoryContent />
    </AuthGuard>
  )
}
