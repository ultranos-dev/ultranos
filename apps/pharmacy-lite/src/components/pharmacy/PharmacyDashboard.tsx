'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { db } from '@/lib/db'
import { DispensingSummaryCard } from './DispensingSummaryCard'
import { SyncQueueCard } from './SyncQueueCard'
import {
  RecentDispensingList,
  type RecentDispenseItem,
} from './RecentDispensingList'
import { DashboardActionHub } from './DashboardActionHub'
import { InventoryAlertCard } from './inventory/InventoryAlertCard'

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

    // Enrich with patient names from local DB
    const patientIds = recentDispenses.map((d) => d.patientRef).filter(Boolean)
    if (patientIds.length > 0) {
      const patients = await db.patients.where('id').anyOf(patientIds).toArray()
      const nameMap = new Map(patients.map((p) => [p.id, p.nameGiven]))
      recentDispenses = recentDispenses.map((d) => ({
        ...d,
        patientName: nameMap.get(d.patientRef),
      }))
    }
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

      {/* Multi-entry action hub */}
      <DashboardActionHub />

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

      {/* Inventory alerts */}
      <InventoryAlertCard />
    </div>
  )
}
