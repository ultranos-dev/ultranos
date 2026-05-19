'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { TopHeader } from '@/components/TopHeader'
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
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [statsError, setStatsError] = useState(false)

  useEffect(() => {
    trpc.admin.dashboardStats.query().then(setStats).catch(() => setStatsError(true))
  }, [])

  return (
    <>
      <TopHeader title="Dashboard" description="Overview of pending actions and system health." />
      <div className="mx-auto max-w-7xl px-8 py-6">
        {statsError && (
          <div className="rounded-2xl bg-danger-subtle border border-danger/20 p-3 text-sm text-danger">
            Failed to load dashboard stats. Data shown may be stale.
          </div>
        )}

        {/* Row 1: 4 stat cards */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Pending KYC Reviews */}
          <div
            onClick={() => router.push('/providers')}
            className={`rounded-2xl bg-accent-subtle p-6 cursor-pointer hover:scale-[1.02] transition-transform duration-200 shadow-card border ${
              stats && stats.slaBreachedKycCount > 0
                ? 'border-danger'
                : 'border-accent/20'
            }`}
          >
            <p className="text-sm font-medium text-text-secondary">Pending KYC Reviews</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-text-primary">
              {stats?.pendingKycReviews ?? '\u2014'}
            </p>
            {stats && (
              <p className={`mt-1 text-sm font-medium ${stats.slaBreachedKycCount > 0 ? 'text-danger' : 'text-text-secondary'}`}>
                {stats.slaBreachedKycCount} breaching SLA
              </p>
            )}
          </div>

          {/* Pending Lab Approvals */}
          <div
            onClick={() => router.push('/labs')}
            className="rounded-2xl bg-surface-raised border border-border p-6 cursor-pointer hover:scale-[1.02] transition-transform duration-200 shadow-card"
          >
            <p className="text-sm font-medium text-text-secondary">Pending Lab Approvals</p>
            <p className="mt-2 text-xl font-semibold tracking-tight text-text-primary">
              {stats?.pendingLabApprovals ?? '\u2014'}
            </p>
            {stats && (
              <p className={`mt-1 text-sm font-medium ${stats.oldestPendingLabDays > 7 ? 'text-warning' : 'text-text-secondary'}`}>
                oldest: {stats.oldestPendingLabDays}d ago
              </p>
            )}
          </div>

          {/* Active Alerts */}
          <div
            onClick={() => router.push('/alerts')}
            className={`rounded-2xl bg-surface-raised p-6 cursor-pointer hover:scale-[1.02] transition-transform duration-200 shadow-card border ${
              stats && stats.activeAlerts > 0
                ? 'border-s-2 border-s-danger border-border'
                : 'border-border'
            }`}
          >
            <p className="text-sm font-medium text-text-secondary">Active Alerts</p>
            <p className={`mt-2 text-xl font-semibold tracking-tight ${stats && stats.activeAlerts > 0 ? 'text-danger' : 'text-text-primary'}`}>
              {stats?.activeAlerts ?? '\u2014'}
            </p>
            {stats && (
              <p className={`mt-1 text-sm font-medium ${stats.highSeverityAlertCount > 0 ? 'text-danger' : 'text-text-secondary'}`}>
                {stats.highSeverityAlertCount} HIGH severity
              </p>
            )}
          </div>

          {/* Audit Events — clickable to /audit */}
          <div
            onClick={() => router.push('/audit')}
            className="rounded-2xl bg-surface-raised border border-border p-6 cursor-pointer hover:scale-[1.02] transition-transform duration-200 shadow-card"
          >
            <p className="text-sm font-medium text-text-secondary">Recent Audit Events</p>
            <p className="mt-2 text-xl font-semibold tracking-tight text-text-primary">
              {stats?.recentAuditEvents ?? '\u2014'}
            </p>
            {stats && (
              <p className={`mt-1 text-sm font-medium ${stats.auditChainHealthy ? 'text-success' : 'text-danger'}`}>
                {stats.auditChainHealthy ? 'Healthy' : 'Broken'}
              </p>
            )}
          </div>
        </div>

        {/* Row 2: Subscription + User Summary */}
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <SubscriptionWidget />
          </div>
          <div className="lg:col-span-1">
            {stats?.userCounts && <UserSummaryWidget counts={stats.userCounts} />}
          </div>
        </div>

        {/* Row 3: Recent Activity */}
        <div className="mt-6">
          <RecentActivityFeed />
        </div>
      </div>
    </>
  )
}
