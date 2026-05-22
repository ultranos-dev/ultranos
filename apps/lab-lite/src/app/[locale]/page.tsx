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
          <p className="text-sm text-neutral-400">Loading uploads…</p>
        </div>
      ) : (
        <RecentUploadsList items={recentUploads} />
      )}
    </div>
  )
}
