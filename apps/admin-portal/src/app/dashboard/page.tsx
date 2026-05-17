'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'

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

  const statCards = [
    { title: 'Pending KYC Reviews', value: stats?.pendingKycReviews ?? '—', color: 'border-amber-400 bg-amber-50', href: '/providers' },
    { title: 'Pending Lab Approvals', value: stats?.pendingLabApprovals ?? '—', color: 'border-blue-400 bg-blue-50', href: '/labs' },
    { title: 'Active Alerts', value: stats?.activeAlerts ?? '—', color: 'border-red-400 bg-red-50', href: '/alerts' },
    { title: 'Recent Audit Events', value: stats?.recentAuditEvents ?? '—', color: 'border-neutral-400 bg-neutral-50', href: null },
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
      <p className="mt-1 text-neutral-500">Overview of pending actions and system health.</p>

      {statsError && (
        <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">Failed to load dashboard stats. Data shown may be stale.</div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <div
            key={card.title}
            onClick={card.href ? () => router.push(card.href) : undefined}
            className={`rounded-lg border-s-4 p-4 shadow-sm ${card.color} ${card.href ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
          >
            <p className="text-sm font-medium text-neutral-600">{card.title}</p>
            <p className="mt-2 text-3xl font-bold text-neutral-900">{card.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
