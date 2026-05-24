'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { db } from '@/lib/db'
import { DispensingSummaryCard } from './DispensingSummaryCard'
import { SyncQueueCard } from './SyncQueueCard'
import {
  RecentDispensingList,
  type RecentDispenseItem,
} from './RecentDispensingList'

const AUTO_REFRESH_INTERVAL_MS = 30_000

interface DashboardStats {
  dispensedToday: number
  pendingSync: number
  failedSync: number
  recentDispenses: RecentDispenseItem[]
}

async function queryDashboardStats(): Promise<DashboardStats> {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  // Query sync queue (not encrypted — always available)
  // retryCount is not indexed — use toArray() + filter instead of .where()
  const [pendingSync, syncQueueAll] = await Promise.all([
    db.syncQueue.count(),
    db.syncQueue.toArray(),
  ])

  const failedQueueAll = syncQueueAll.filter((e) => e.retryCount > 0)
  const failedSync = failedQueueAll.length

  const syncQueueIds = new Set(syncQueueAll.map((e) => e.resourceId))
  const failedIds = new Set(failedQueueAll.map((e) => e.resourceId))

  // Query dispenses (encrypted — may fail if key not available yet)
  let dispensedToday = 0
  let recentDispenses: RecentDispenseItem[] = []
  try {
    const [count, recentRaw] = await Promise.all([
      db.dispenses
        .where('meta.lastUpdated')
        .aboveOrEqual(todayStart.toISOString())
        .count(),
      db.dispenses
        .orderBy('meta.lastUpdated')
        .reverse()
        .limit(10)
        .toArray(),
    ])
    dispensedToday = count
    recentDispenses = recentRaw.map((d) => {
      let syncStatus: RecentDispenseItem['syncStatus'] = 'synced'
      if (failedIds.has(d.id)) {
        syncStatus = 'failed'
      } else if (syncQueueIds.has(d.id)) {
        syncStatus = 'pending'
      }

      return {
        id: d.id,
        patientRef:
          d.subject?.reference?.replace('Patient/', '') ?? 'Unknown',
        medicationName:
          d.medicationCodeableConcept?.text ??
          d.medicationCodeableConcept?.coding?.[0]?.display ??
          'Unknown',
        whenHandedOver: d.whenHandedOver ?? d.meta?.lastUpdated ?? '',
        syncStatus,
      }
    })
  } catch (err) {
    // Encryption key not yet available — show sync stats only.
    // Surface non-encryption errors so they aren't silently swallowed.
    if (err instanceof Error && !err.message.includes('encrypt')) {
      console.warn('Dashboard dispense query failed:', err.constructor.name)
    }
  }

  return { dispensedToday, pendingSync, failedSync, recentDispenses }
}

export function PharmacyDashboard() {
  const session = useAuthSessionStore((s) => s.session)
  const [stats, setStats] = useState<DashboardStats>({
    dispensedToday: 0,
    pendingSync: 0,
    failedSync: 0,
    recentDispenses: [],
  })
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refreshStats = useCallback(async () => {
    try {
      const data = await queryDashboardStats()
      setStats(data)
    } catch {
      // Silently handle query errors — dashboard will show stale data
    }
  }, [])

  // Initial load
  useEffect(() => {
    refreshStats()
  }, [refreshStats])

  // Auto-refresh every 30s, pause when tab is hidden
  useEffect(() => {
    function startInterval() {
      if (intervalRef.current) clearInterval(intervalRef.current)
      intervalRef.current = setInterval(refreshStats, AUTO_REFRESH_INTERVAL_MS)
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      } else {
        refreshStats()
        startInterval()
      }
    }

    startInterval()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [refreshStats])

  // Online/offline events
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const pharmacistName = session?.email?.split('@')[0] ?? 'Pharmacist'

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-neutral-900">
            Welcome, {pharmacistName}
          </h2>
          <p className="text-sm text-neutral-500">Pharmacy Dashboard</p>
        </div>
        <div
          data-testid="connectivity-indicator"
          className="flex items-center gap-2"
        >
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              isOnline ? 'bg-green-500' : 'bg-red-500'
            }`}
          />
          <span className="text-xs text-neutral-500">
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        {/* Scan Prescription CTA — UX-DR2 primary action */}
        <Link
          href="/scan"
          className="inline-flex items-center justify-center gap-2 rounded-pill px-5 py-2 text-sm font-semibold transition-all duration-100 ease-out hover:brightness-[1.04] active:brightness-[0.88] focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-2 bg-pill-green text-pill-text"
        >
          Scan QR Prescription
        </Link>

        {/* Story 24.3: Paper Prescription OCR quick action */}
        <Link
          href="/paper-rx"
          data-testid="paper-rx-action-card"
          className="inline-flex items-center justify-center gap-2 rounded-pill px-5 py-2 text-sm font-semibold transition-all duration-100 ease-out hover:brightness-[1.04] active:brightness-[0.88] focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-2 border-2 border-orange-200 bg-orange-50 text-orange-800"
        >
          Scan Paper Prescription
        </Link>
      </div>

      {/* Today's dispensing summary */}
      <DispensingSummaryCard
        dispensedToday={stats.dispensedToday}
        pendingSync={stats.pendingSync}
        failedSync={stats.failedSync}
      />

      {/* Pending sync queue */}
      <SyncQueueCard pendingCount={stats.pendingSync} />

      {/* Recent dispensing list */}
      <RecentDispensingList items={stats.recentDispenses} />
    </div>
  )
}
