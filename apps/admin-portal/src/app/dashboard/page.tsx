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
    { title: 'Pending KYC Reviews', value: stats?.pendingKycReviews ?? '—', color: 'bg-brand-lime text-black', href: '/providers' },
    { title: 'Pending Lab Approvals', value: stats?.pendingLabApprovals ?? '—', color: 'bg-black text-white', href: '/labs' },
    { title: 'Active Alerts', value: stats?.activeAlerts ?? '—', color: 'bg-white text-black border border-border', href: '/alerts' },
    { title: 'Recent Audit Events', value: stats?.recentAuditEvents ?? '—', color: 'bg-white text-black border border-border', href: null },
  ]

  return (
    <div>
      <h1 className="text-4xl font-bold tracking-tight wavy-divider">Dashboard</h1>
      <p className="mt-4 text-text-muted">Overview of pending actions and system health.</p>

      {statsError && (
        <div className="mt-4 rounded-2xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">Failed to load dashboard stats. Data shown may be stale.</div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <div
            key={card.title}
            onClick={card.href ? () => router.push(card.href) : undefined}
            className={`rounded-3xl p-6 ${card.color} ${card.href ? 'cursor-pointer hover:scale-[1.02] transition-all' : ''}`}
          >
            <p className="text-sm font-medium opacity-70">{card.title}</p>
            <p className="mt-2 text-4xl font-bold tracking-tight">{card.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
