'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { trpc } from '@/lib/trpc'
import { useLocationFilter } from '@/hooks/useLocationFilter'
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
  const { locationId } = useLocationFilter()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [statsError, setStatsError] = useState(false)

  useEffect(() => {
    // TODO: Pass locationId to filter by selected location once backend supports it
    trpc.admin.dashboardStats.query().then((data) => setStats(data as DashboardStats)).catch(() => setStatsError(true))
  }, [])

  return (
    <div className="flex flex-col gap-4">
        <DunningBanner />

        {statsError && (
          <div className="rounded-2xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
            {t('errorLoadFailed')}
          </div>
        )}

        {/* Row 1: 4 stat cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Pending KYC Reviews */}
          <div
            onClick={() => router.push('/providers')}
            className={`rounded-2xl bg-primary/10 p-6 cursor-pointer hover:scale-[1.02] transition-transform duration-200 shadow-card border ${
              stats && stats.slaBreachedKycCount > 0
                ? 'border-destructive'
                : 'border-primary/20'
            }`}
          >
            <p className="text-sm font-medium text-muted-foreground">{t('pendingKyc')}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
              {stats?.pendingKycReviews ?? '\u2014'}
            </p>
            {stats && (
              <p className={`mt-1 text-sm font-medium ${stats.slaBreachedKycCount > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                {t('breachingSla', { count: stats.slaBreachedKycCount })}
              </p>
            )}
          </div>

          {/* Pending Lab Approvals */}
          <div
            onClick={() => router.push('/labs')}
            className="rounded-2xl bg-popover border border-border p-6 cursor-pointer hover:scale-[1.02] transition-transform duration-200 shadow-card"
          >
            <p className="text-sm font-medium text-muted-foreground">{t('pendingLabApprovals')}</p>
            <p className="mt-2 text-xl font-semibold tracking-tight text-foreground">
              {stats?.pendingLabApprovals ?? '\u2014'}
            </p>
            {stats && (
              <p className={`mt-1 text-sm font-medium ${stats.oldestPendingLabDays > 7 ? 'text-warning' : 'text-muted-foreground'}`}>
                {t('oldestDaysAgo', { days: stats.oldestPendingLabDays })}
              </p>
            )}
          </div>

          {/* Active Alerts */}
          <div
            onClick={() => router.push('/alerts')}
            className={`rounded-2xl bg-popover p-6 cursor-pointer hover:scale-[1.02] transition-transform duration-200 shadow-card border ${
              stats && stats.activeAlerts > 0
                ? 'border-s-2 border-s-destructive border-border'
                : 'border-border'
            }`}
          >
            <p className="text-sm font-medium text-muted-foreground">{t('activeAlerts')}</p>
            <p className={`mt-2 text-xl font-semibold tracking-tight ${stats && stats.activeAlerts > 0 ? 'text-destructive' : 'text-foreground'}`}>
              {stats?.activeAlerts ?? '\u2014'}
            </p>
            {stats && (
              <p className={`mt-1 text-sm font-medium ${stats.highSeverityAlertCount > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                {t('highSeverityCount', { count: stats.highSeverityAlertCount })}
              </p>
            )}
          </div>

          {/* Audit Events — clickable to /audit */}
          <div
            onClick={() => router.push('/audit')}
            className="rounded-2xl bg-popover border border-border p-6 cursor-pointer hover:scale-[1.02] transition-transform duration-200 shadow-card"
          >
            <p className="text-sm font-medium text-muted-foreground">{t('recentAuditEvents')}</p>
            <p className="mt-2 text-xl font-semibold tracking-tight text-foreground">
              {stats?.recentAuditEvents ?? '\u2014'}
            </p>
            {stats && (
              <p className={`mt-1 text-sm font-medium ${stats.auditChainHealthy ? 'text-success' : 'text-destructive'}`}>
                {stats.auditChainHealthy ? t('chainStatusHealthy') : t('chainStatusBroken')}
              </p>
            )}
          </div>
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
