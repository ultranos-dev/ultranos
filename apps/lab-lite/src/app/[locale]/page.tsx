'use client'

import { useTranslations } from 'next-intl'
import { LabIdentityCard } from '@/components/dashboard/LabIdentityCard'
import { QueueStatusCard } from '@/components/dashboard/QueueStatusCard'
import { ActivitySummaryCard } from '@/components/dashboard/ActivitySummaryCard'
import { QuickActions } from '@/components/dashboard/QuickActions'
import { RecentUploadsList } from '@/components/dashboard/RecentUploadsList'
import { useDashboardData } from '@/hooks/useDashboardData'

function RecentUploadsSkeleton() {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4" aria-busy="true" aria-label="Loading recent uploads">
      <div className="h-3.5 w-28 animate-pulse rounded bg-neutral-200" />
      <div className="mt-3 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <div className="h-4 w-40 animate-pulse rounded bg-neutral-100" />
              <div className="mt-1.5 h-3 w-24 animate-pulse rounded bg-neutral-100" />
            </div>
            <div className="ms-2 h-5 w-16 animate-pulse rounded-full bg-neutral-100" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function LabHomePage() {
  const t = useTranslations()
  const { queueCounts, todayUploadsCompleted, todayResultsPending, recentUploads, loading, error, retry } =
    useDashboardData()

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="flex items-center justify-between rounded-md bg-amber-50 p-3 text-sm text-amber-700" role="alert" aria-live="assertive">
          <span>{error}</span>
          <button
            onClick={retry}
            className="ms-3 shrink-0 rounded-md px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            {t('common.retry')}
          </button>
        </div>
      )}
      <LabIdentityCard />
      <QueueStatusCard counts={queueCounts} />
      <ActivitySummaryCard
        uploadsCompleted={todayUploadsCompleted}
        resultsPending={todayResultsPending}
      />
      <QuickActions />
      {loading ? <RecentUploadsSkeleton /> : <RecentUploadsList items={recentUploads} />}
    </div>
  )
}
