'use client'

import { LabIdentityCard } from '@/components/dashboard/LabIdentityCard'
import { QueueStatusCard } from '@/components/dashboard/QueueStatusCard'
import { ActivitySummaryCard } from '@/components/dashboard/ActivitySummaryCard'
import { QuickActions } from '@/components/dashboard/QuickActions'
import { RecentUploadsList } from '@/components/dashboard/RecentUploadsList'
import { useDashboardData } from '@/hooks/useDashboardData'

export default function LabHomePage() {
  const { queueCounts, todayUploadsCompleted, todayResultsPending, recentUploads, loading, error } =
    useDashboardData()

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-700" role="status">
          {error}
        </div>
      )}
      <LabIdentityCard />
      <QueueStatusCard counts={queueCounts} />
      <ActivitySummaryCard
        uploadsCompleted={todayUploadsCompleted}
        resultsPending={todayResultsPending}
      />
      <QuickActions />
      {loading ? (
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <p className="text-sm text-neutral-400"><span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4 text-neutral-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 22 6.477 22 12h-4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.568 3 7.938l3-2.647z" />
            </svg>
            Loading uploads…
          </span></p>
        </div>
      ) : (
        <RecentUploadsList items={recentUploads} />
      )}
    </div>
  )
}
