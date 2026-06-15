'use client'

import { useTranslations } from 'next-intl'
import { DashboardHeader } from '@/components/dashboard/DashboardHeader'
import { QueueStatusCard } from '@/components/dashboard/QueueStatusCard'
import { ActivitySummaryCard } from '@/components/dashboard/ActivitySummaryCard'
import { QuickActions } from '@/components/dashboard/QuickActions'
import { RecentUploadsList } from '@/components/dashboard/RecentUploadsList'
import { UploadSuccessBanner } from '@/components/dashboard/UploadSuccessBanner'
import { WorkloadScheduleCard } from '@/components/scheduler/WorkloadScheduleCard'
import { Button } from '@/components/ui/Button'
import { useDashboardData } from '@/hooks/useDashboardData'
import { useDriftAlerts } from '@/hooks/useDriftAlerts'
import { DriftAlertBanner } from '@/components/qc/DriftAlertBanner'
import { ReadinessBriefingCard } from '@/components/dashboard/ReadinessBriefingCard'

function RecentUploadsSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-4" aria-busy="true" aria-label="Loading recent uploads">
      <div className="h-3.5 w-28 animate-pulse rounded bg-muted" />
      <div className="mt-3 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <div className="h-4 w-40 animate-pulse rounded bg-muted/60" />
              <div className="mt-1.5 h-3 w-24 animate-pulse rounded bg-muted/60" />
            </div>
            <div className="ms-2 h-5 w-16 animate-pulse rounded-full bg-muted/60" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function LabHomePage() {
  const t = useTranslations()
  const { queueCounts, todayUploadsCompleted, todayResultsPending, recentUploads, loading, error, retry, lastRefreshedAt } =
    useDashboardData()
  const { alerts, refresh: refreshAlerts } = useDriftAlerts()

  return (
    <div className="flex flex-col gap-4">
      <UploadSuccessBanner />
      {/* Story 43.6: Show drift alert banner when active QC alerts exist */}
      <DriftAlertBanner alerts={alerts} onAcknowledged={refreshAlerts} />
      {error && (
        <div className="flex items-center justify-between rounded-md bg-amber-50 p-3 text-sm text-amber-700" role="alert" aria-live="assertive">
          <span>{error}</span>
          <Button
            variant="warning"
            onClick={retry}
          >
            {t('common.retry')}
          </Button>
        </div>
      )}
      <DashboardHeader />
      {/* Story 48.3: Pre-shift readiness briefing — first card on dashboard */}
      <ReadinessBriefingCard />
      <QuickActions />
      <QueueStatusCard counts={queueCounts} />
      <ActivitySummaryCard
        uploadsCompleted={todayUploadsCompleted}
        resultsPending={todayResultsPending}
        lastRefreshedAt={lastRefreshedAt ?? undefined}
      />
      <WorkloadScheduleCard />
      {loading ? <RecentUploadsSkeleton /> : <RecentUploadsList items={recentUploads} onItemCancelled={retry} />}
    </div>
  )
}
