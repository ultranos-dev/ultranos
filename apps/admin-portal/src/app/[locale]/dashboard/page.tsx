'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { trpc } from '@/lib/trpc'
import { DunningBanner } from '@/components/subscriptions/DunningBanner'
import { SubscriptionWidget } from '@/components/dashboard/SubscriptionWidget'
import { UserSummaryWidget } from '@/components/dashboard/UserSummaryWidget'
import { RecentActivityFeed } from '@/components/dashboard/RecentActivityFeed'

interface UserCounts {
  total: number
  active: number
  suspended: number
  pendingInvite: number
  withoutMfa: number
}

interface DashboardStats {
  pendingKycReviews: number
  slaBreachedKycCount: number
  pendingLabApprovals: number
  oldestPendingLabDays: number
  activeAlerts: number
  highSeverityAlertCount: number
  recentAuditEvents: number
  auditChainHealthy: boolean
  userCounts: UserCounts
}

export default function DashboardPage() {
  const router = useRouter()
  const t = useTranslations('dashboard')
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [statsError, setStatsError] = useState(false)

  useEffect(() => {
    // TODO: Pass locationId to filter by selected location once backend supports it
    trpc.admin.dashboardStats.query().then((data) => setStats(data as DashboardStats)).catch(() => setStatsError(true))
  }, [])

  return (
    <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-foreground">{t('pageTitle')}</h1>

        <DunningBanner />

        {statsError && (
          <div className="rounded-2xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
            {t('errorLoadFailed')}
          </div>
        )}

        {/* Row 1: 4 stat cards — uniform box idiom, equal height, consistent value size */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Pending KYC Reviews */}
          <button
            type="button"
            onClick={() => router.push('/providers')}
            className={`flex flex-col rounded-xl bg-card p-5 text-start shadow-card ring-[0.65px] transition-colors hover:bg-muted/40 ${
              stats && stats.slaBreachedKycCount > 0 ? 'ring-2 ring-destructive/50' : 'ring-border/50'
            }`}
          >
            <p className="text-sm font-medium text-muted-foreground">{t('pendingKyc')}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
              {stats?.pendingKycReviews ?? '—'}
            </p>
            <p className={`mt-1 text-sm font-medium ${stats && stats.slaBreachedKycCount > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
              {stats ? t('breachingSla', { count: stats.slaBreachedKycCount }) : ' '}
            </p>
          </button>

          {/* Pending Lab Approvals */}
          <button
            type="button"
            onClick={() => router.push('/labs')}
            className="flex flex-col rounded-xl bg-card p-5 text-start shadow-card ring-[0.65px] ring-border/50 transition-colors hover:bg-muted/40"
          >
            <p className="text-sm font-medium text-muted-foreground">{t('pendingLabApprovals')}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
              {stats?.pendingLabApprovals ?? '—'}
            </p>
            <p className={`mt-1 text-sm font-medium ${stats && stats.pendingLabApprovals > 0 && stats.oldestPendingLabDays > 7 ? 'text-warning' : 'text-muted-foreground'}`}>
              {stats && stats.pendingLabApprovals > 0 ? t('oldestDaysAgo', { days: stats.oldestPendingLabDays ?? 0 }) : ' '}
            </p>
          </button>

          {/* Active Alerts */}
          <button
            type="button"
            onClick={() => router.push('/alerts')}
            className={`flex flex-col rounded-xl bg-card p-5 text-start shadow-card ring-[0.65px] transition-colors hover:bg-muted/40 ${
              stats && stats.activeAlerts > 0 ? 'ring-2 ring-destructive/50' : 'ring-border/50'
            }`}
          >
            <p className="text-sm font-medium text-muted-foreground">{t('activeAlerts')}</p>
            <p className={`mt-2 text-3xl font-semibold tracking-tight ${stats && stats.activeAlerts > 0 ? 'text-destructive' : 'text-foreground'}`}>
              {stats?.activeAlerts ?? '—'}
            </p>
            <p className={`mt-1 text-sm font-medium ${stats && stats.highSeverityAlertCount > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
              {stats ? t('highSeverityCount', { count: stats.highSeverityAlertCount }) : ' '}
            </p>
          </button>

          {/* Audit Events — clickable to /audit */}
          <button
            type="button"
            onClick={() => router.push('/audit')}
            className="flex flex-col rounded-xl bg-card p-5 text-start shadow-card ring-[0.65px] ring-border/50 transition-colors hover:bg-muted/40"
          >
            <p className="text-sm font-medium text-muted-foreground">{t('recentAuditEvents')}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
              {stats?.recentAuditEvents ?? '—'}
            </p>
            <p className={`mt-1 text-sm font-medium ${stats && !stats.auditChainHealthy ? 'text-destructive' : stats ? 'text-success' : 'text-muted-foreground'}`}>
              {stats ? (stats.auditChainHealthy ? t('chainStatusHealthy') : t('chainStatusBroken')) : ' '}
            </p>
          </button>
        </div>

        {/* Row 2: Subscription + User Summary */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <SubscriptionWidget />
          </div>
          <div className="lg:col-span-1">
            {stats?.userCounts && <UserSummaryWidget counts={stats.userCounts} />}
          </div>
        </div>

        {/* Row 3: Recent Activity */}
        <RecentActivityFeed />
      </div>
  )
}
