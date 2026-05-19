'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { TopHeader } from '@/components/TopHeader'

interface DashboardStats {
  pendingKycReviews: number
  pendingLabApprovals: number
  activeAlerts: number
  recentAuditEvents: number
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

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Primary KPI — spans 2 cols */}
          <div
            onClick={() => router.push('/providers')}
            className="sm:col-span-2 rounded-2xl bg-accent-subtle border border-accent/20 p-6 cursor-pointer hover:scale-[1.02] transition-transform duration-200 shadow-card"
          >
            <p className="text-sm font-medium text-text-secondary">Pending KYC Reviews</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-text-primary">{stats?.pendingKycReviews ?? '\u2014'}</p>
          </div>

          {/* Secondary stats */}
          <div
            onClick={() => router.push('/labs')}
            className="rounded-2xl bg-surface-raised border border-border p-6 cursor-pointer hover:scale-[1.02] transition-transform duration-200 shadow-card"
          >
            <p className="text-sm font-medium text-text-secondary">Pending Lab Approvals</p>
            <p className="mt-2 text-xl font-semibold tracking-tight text-text-primary">{stats?.pendingLabApprovals ?? '\u2014'}</p>
          </div>

          {/* Status card — conditional urgency */}
          <div
            onClick={() => router.push('/alerts')}
            className={`rounded-2xl bg-surface-raised border p-6 cursor-pointer hover:scale-[1.02] transition-transform duration-200 shadow-card ${
              stats && stats.activeAlerts > 0
                ? 'border-s-2 border-s-danger border-border'
                : 'border-border'
            }`}
          >
            <p className="text-sm font-medium text-text-secondary">Active Alerts</p>
            <p className={`mt-2 text-xl font-semibold tracking-tight ${stats && stats.activeAlerts > 0 ? 'text-danger' : 'text-text-primary'}`}>
              {stats?.activeAlerts ?? '\u2014'}
            </p>
          </div>
        </div>

        {/* Recent audit — non-clickable info card */}
        <div className="mt-4 rounded-2xl bg-surface-raised border border-border p-6 shadow-card max-w-xs">
          <p className="text-sm font-medium text-text-secondary">Recent Audit Events</p>
          <p className="mt-2 text-xl font-semibold tracking-tight text-text-primary">{stats?.recentAuditEvents ?? '\u2014'}</p>
        </div>
      </div>
    </>
  )
}
